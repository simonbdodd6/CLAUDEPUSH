import { kvGet, kvSet } from './_kv.js';
import { permissionsFor, canonicalRole } from './_permissions.js';
import { key } from './_keys.js';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const USERS_KEY = key('identity:users');
const TEAMS_KEY = key('identity:teams');
const TEAM_MEMBERS_KEY = key('identity:team_members');
const PLAYER_PROFILES_KEY = key('identity:player_profiles');
const SESSIONS_KEY = key('identity:sessions');
const PASSWORD_RESETS_KEY = key('identity:password_resets');
const EMAIL_VERIFICATIONS_KEY = key('identity:email_verifications');
const INVITES_KEY = 'ce:invites';

export const SESSION_COOKIE = 'ce_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_ALGO = 'scrypt';
const SCRYPT_KEY_LENGTH = 64;

export const DEFAULT_TEAM = {
  id: 'boitsfort-rfc',
  name: 'Boitsfort RFC',
  teamCode: 'BOITSFORT',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LEGACY_STAFF_ACCOUNTS = process.env.COACH_DEMO_EMAIL && process.env.COACH_DEMO_PASSWORD
  ? [
      {
        id: 'coach-demo',
        email: process.env.COACH_DEMO_EMAIL,
        firstName: 'Simon',
        lastName: 'Coach',
        displayName: 'Simon Coach',
        role: 'coach',
        password: process.env.COACH_DEMO_PASSWORD,
      },
    ]
  : [];

// Only Simon Test Player remains. All other test personas were removed.
const LEGACY_PLAYER_COMPATIBILITY_ACCOUNTS = [
  {
    id: 'player-simon-test',
    legacyPlayerId: 'inv-YxnjxnQa',
    email: 'simon.test.player@player.test',
    firstName: 'Simon',
    lastName: 'Test Player',
    displayName: 'Simon Test Player',
  },
];

// User IDs removed from LEGACY_PLAYER_COMPATIBILITY_ACCOUNTS. Used by the
// one-time migration to scrub stale records from Redis.
export const OBSOLETE_LEGACY_ACCOUNT_IDS = [
  'player-nick',
  'player-simon-player',
  'player-nick-marshall',
  'player-dodsy-compat',
];

/**
 * Pure filter: remove obsolete legacy accounts from users / members / profiles.
 * Returns new arrays — does not mutate the inputs or touch Redis.
 */
export function filterObsoleteLegacyAccounts(users = [], members = [], profiles = []) {
  const ids = new Set(OBSOLETE_LEGACY_ACCOUNT_IDS);
  return {
    users:    (Array.isArray(users)    ? users    : []).filter(u => !ids.has(u.id)),
    members:  (Array.isArray(members)  ? members  : []).filter(m => !ids.has(m.userId)),
    profiles: (Array.isArray(profiles) ? profiles : []).filter(p => !ids.has(p.userId)),
  };
}

export function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

export function normalizeTeamCode(code = '') {
  return String(code || '').trim().toUpperCase();
}

export function displayName(firstName = '', lastName = '') {
  return [firstName, lastName].map(value => String(value || '').trim()).filter(Boolean).join(' ').trim();
}

export function assertJoinInput({ teamCode, firstName, lastName, email, password } = {}) {
  if (!normalizeTeamCode(teamCode)) throw new Error('Team code is required');
  if (!String(firstName || '').trim()) throw new Error('First name is required');
  if (!String(lastName || '').trim()) throw new Error('Last name is required');
  if (!EMAIL_RE.test(normalizeEmail(email))) throw new Error('Valid email is required');
  if (String(password || '').length < 8) throw new Error('Password must be at least 8 characters');
}

export function assertLoginInput({ email, password } = {}) {
  if (!EMAIL_RE.test(normalizeEmail(email))) throw new Error('Valid email is required');
  if (!String(password || '')) throw new Error('Password is required');
}

function assertPassword(password) {
  if (String(password || '').length < 8) throw new Error('Password must be at least 8 characters');
}

function legacySha256PasswordHash(password, salt) {
  return createHash('sha256').update(`${salt}:${String(password || '')}`).digest('hex');
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const passwordHash = scryptSync(String(password || ''), salt, SCRYPT_KEY_LENGTH).toString('hex');
  return { passwordAlgo: PASSWORD_ALGO, passwordSalt: salt, passwordHash };
}

function timingSafeStringEqual(candidate = '', stored = '') {
  const left = Buffer.from(candidate);
  const right = Buffer.from(String(stored || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyPassword(password, user = {}) {
  if (!user.passwordSalt || !user.passwordHash) return { ok: false, needsUpgrade: false };
  if (user.passwordAlgo === PASSWORD_ALGO) {
    const candidate = hashPassword(password, user.passwordSalt).passwordHash;
    return { ok: timingSafeStringEqual(candidate, user.passwordHash), needsUpgrade: false };
  }
  const candidate = legacySha256PasswordHash(password, user.passwordSalt);
  const ok = timingSafeStringEqual(candidate, user.passwordHash);
  return { ok, needsUpgrade: ok };
}

export function publicUser(user = {}) {
  if (!user) return null;
  const { passwordHash, passwordSalt, passwordAlgo, passwordMigratedAt, ...safe } = user;
  safe.emailVerified = Boolean(safe.emailVerified);
  return safe;
}

export function publicUserWithRole(user = {}, member = null) {
  const safe = publicUser(user);
  if (!safe) return safe;
  if (member?.role) safe.role = member.role;
  return safe;
}

function publicRequest(request = {}) {
  return {
    ...request,
    user: publicUser(request.user),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hashToken(token = '') {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function cookieSecureFlag() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

export function sessionCookie(token, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token || '')}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Number(maxAgeSeconds || 0))}`,
  ];
  if (cookieSecureFlag()) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}

export function readCookie(req, name = SESSION_COOKIE) {
  const raw = String(req?.headers?.cookie || req?.headers?.Cookie || '');
  return raw.split(';').map(part => part.trim()).reduce((found, part) => {
    if (found) return found;
    const idx = part.indexOf('=');
    if (idx < 0) return '';
    const key = part.slice(0, idx).trim();
    if (key !== name) return '';
    return decodeURIComponent(part.slice(idx + 1));
  }, '');
}

function bearerToken(req) {
  const authorization = String(req?.headers?.authorization || req?.headers?.Authorization || '');
  return authorization.replace(/^Bearer\s+/i, '').trim();
}

export function sessionTokenFromRequest(req) {
  return readCookie(req, SESSION_COOKIE) || bearerToken(req);
}

export async function loadUsers() {
  return (await kvGet(USERS_KEY)) || [];
}

export async function saveUsers(users) {
  await kvSet(USERS_KEY, Array.isArray(users) ? users : []);
}

export async function loadTeams() {
  const teams = (await kvGet(TEAMS_KEY)) || [];
  if (teams.some(team => team.id === DEFAULT_TEAM.id)) return teams;
  const merged = [DEFAULT_TEAM, ...teams];
  await kvSet(TEAMS_KEY, merged);
  return merged;
}

export async function saveTeams(teams) {
  await kvSet(TEAMS_KEY, Array.isArray(teams) ? teams : []);
}

// Update only billing-relevant fields on a team record.
// Allowlisted so callers cannot accidentally overwrite structural fields
// (id, name, teamCode, createdAt). Used by the Stripe webhook handler.
export async function updateTeamBilling(teamId, fields = {}) {
  const BILLING_FIELDS = new Set(['plan', 'planStatus', 'trialEndsAt', 'stripeCustomerId', 'stripeSubscriptionId']);
  const teams = await loadTeams();
  const team = teams.find(t => t.id === String(teamId || ''));
  if (!team) { const e = new Error('Team not found'); e.status = 404; throw e; }
  Object.keys(fields).filter(k => BILLING_FIELDS.has(k)).forEach(k => { team[k] = fields[k]; });
  await saveTeams(teams);
  return team;
}

export async function loadTeamMembers() {
  return (await kvGet(TEAM_MEMBERS_KEY)) || [];
}

export async function saveTeamMembers(members) {
  await kvSet(TEAM_MEMBERS_KEY, Array.isArray(members) ? members : []);
}

export async function loadPlayerProfiles() {
  return (await kvGet(PLAYER_PROFILES_KEY)) || [];
}

export async function savePlayerProfiles(profiles) {
  await kvSet(PLAYER_PROFILES_KEY, Array.isArray(profiles) ? profiles : []);
}

export async function loadSessions() {
  const now = Date.now();
  const sessions = (await kvGet(SESSIONS_KEY)) || [];
  const active = sessions.filter(session => Number(new Date(session.expiresAt).getTime()) > now);
  if (active.length !== sessions.length) await kvSet(SESSIONS_KEY, active);
  return active;
}

export async function saveSessions(sessions) {
  await kvSet(SESSIONS_KEY, Array.isArray(sessions) ? sessions : []);
}

export async function loadPasswordResets() {
  const now = Date.now();
  const resets = (await kvGet(PASSWORD_RESETS_KEY)) || [];
  const active = resets.filter(reset => !reset.usedAt && Number(new Date(reset.expiresAt).getTime()) > now);
  if (active.length !== resets.length) await kvSet(PASSWORD_RESETS_KEY, active);
  return active;
}

export async function savePasswordResets(resets) {
  await kvSet(PASSWORD_RESETS_KEY, Array.isArray(resets) ? resets : []);
}

export async function loadEmailVerifications() {
  const now = Date.now();
  const verifications = (await kvGet(EMAIL_VERIFICATIONS_KEY)) || [];
  const active = verifications.filter(v => !v.usedAt && Number(new Date(v.expiresAt).getTime()) > now);
  if (active.length !== verifications.length) await kvSet(EMAIL_VERIFICATIONS_KEY, active);
  return active;
}

export async function saveEmailVerifications(verifications) {
  await kvSet(EMAIL_VERIFICATIONS_KEY, Array.isArray(verifications) ? verifications : []);
}

export async function findTeamByCode(teamCode) {
  const teams = await loadTeams();
  return teams.find(team => normalizeTeamCode(team.teamCode) === normalizeTeamCode(teamCode)) || null;
}

export async function createJoinRequest(input = {}) {
  assertJoinInput(input);
  const team = await findTeamByCode(input.teamCode);
  if (!team) {
    const error = new Error('Team code not found');
    error.status = 404;
    throw error;
  }

  const email = normalizeEmail(input.email);
  const name = displayName(input.firstName, input.lastName);
  const createdAt = nowIso();
  const users = await loadUsers();
  let user = users.find(item => normalizeEmail(item.email) === email);
  if (!user) {
    const passwordRecord = hashPassword(input.password);
    user = {
      id: makeId('user'),
      email,
      firstName: String(input.firstName || '').trim(),
      lastName: String(input.lastName || '').trim(),
      displayName: name,
      authProvider: 'password',
      passwordSet: true,
      emailVerified: false,
      ...passwordRecord,
      createdAt,
      lastLoginAt: null,
    };
    users.push(user);
    await saveUsers(users);
  } else if (!user.passwordHash && input.password) {
    Object.assign(user, hashPassword(input.password), { passwordSet: true });
    await saveUsers(users);
  }

  const members = await loadTeamMembers();
  let member = members.find(item => item.teamId === team.id && item.userId === user.id);
  if (!member) {
    member = {
      id: makeId('tm'),
      teamId: team.id,
      userId: user.id,
      role: 'player',
      status: 'pending',
      joinedAt: createdAt,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
    };
    members.push(member);
  } else if (member.status === 'rejected') {
    member.status = 'pending';
    member.joinedAt = createdAt;
    member.rejectedAt = null;
    member.rejectedBy = null;
  }
  await saveTeamMembers(members);

  return { user: publicUser(user), team, teamMember: member };
}

async function loadInvites() {
  return (await kvGet(INVITES_KEY)) || [];
}

async function saveInvites(invites) {
  await kvSet(INVITES_KEY, Array.isArray(invites) ? invites : []);
}

async function ensureLegacyCompatibilityTeamRecords(teamId = DEFAULT_TEAM.id) {
  if (teamId !== DEFAULT_TEAM.id) return;
  let [users, members, profiles] = await Promise.all([
    loadUsers(),
    loadTeamMembers(),
    loadPlayerProfiles(),
  ]);
  let usersChanged = false;
  let membersChanged = false;
  let profilesChanged = false;

  // Always remove obsolete test accounts on every call — idempotent, no migration flag.
  // This ensures stale Redis data (predating the flag-based migration) is always cleaned.
  const before = { u: users.length, m: members.length, p: profiles.length };
  ({ users, members, profiles } = filterObsoleteLegacyAccounts(users, members, profiles));
  if (users.length !== before.u) usersChanged = true;
  if (members.length !== before.m) membersChanged = true;
  if (profiles.length !== before.p) profilesChanged = true;

  // Also remove any real (generated-ID) accounts whose display name matches known stale
  // test personas. These were created when legacy personas went through the invite flow
  // and have user_XXXX_XXXX IDs that filterObsoleteLegacyAccounts cannot match by ID.
  const STALE_DISPLAY_NAMES = new Set([
    'nick player', 'simon player', 'nick marshall', 'dodsy player', 'doddsy player',
  ]);
  const staleByName = new Set(
    users.filter(u => {
      const dn = String(u.displayName || '').trim().toLowerCase();
      const fn = String(u.firstName || '').trim().toLowerCase();
      const ln = String(u.lastName  || '').trim().toLowerCase();
      return STALE_DISPLAY_NAMES.has(dn) || STALE_DISPLAY_NAMES.has(`${fn} ${ln}`.trim());
    }).map(u => u.id)
  );
  if (staleByName.size > 0) {
    const beforeN = { u: users.length, m: members.length, p: profiles.length };
    users    = users.filter(u => !staleByName.has(u.id));
    members  = members.filter(m => !staleByName.has(m.userId));
    profiles = profiles.filter(p => !staleByName.has(p.userId));
    if (users.length    !== beforeN.u) usersChanged    = true;
    if (members.length  !== beforeN.m) membersChanged  = true;
    if (profiles.length !== beforeN.p) profilesChanged = true;
  }

  // Rename stale coach display name without waiting for a login event.
  const coach = users.find(u => u.id === 'coach-demo');
  if (coach && coach.displayName === 'Simon Dodd') {
    coach.displayName = 'Simon Coach';
    coach.firstName = 'Simon';
    coach.lastName = 'Coach';
    usersChanged = true;
  }

  LEGACY_PLAYER_COMPATIBILITY_ACCOUNTS.forEach(account => {
    let user = users.find(item => item.id === account.id);
    if (!user) {
      user = {
        id: account.id,
        email: normalizeEmail(account.email),
        firstName: account.firstName,
        lastName: account.lastName,
        displayName: account.displayName,
        authProvider: 'legacy-compatibility',
        passwordSet: false,
        emailVerified: false,
        createdAt: nowIso(),
        lastLoginAt: null,
      };
      users.push(user);
      usersChanged = true;
    }

    let member = members.find(item => item.teamId === teamId && item.userId === account.id);
    if (!member) {
      member = {
        id: `tm_${account.id}`,
        teamId,
        userId: account.id,
        role: 'player',
        status: 'active',
        joinedAt: nowIso(),
        approvedAt: nowIso(),
        approvedBy: 'legacy-compatibility',
        rejectedAt: null,
        rejectedBy: null,
      };
      members.push(member);
      membersChanged = true;
    }

    let profile = profiles.find(item => item.teamId === teamId && item.userId === account.id);
    if (!profile) {
      profile = {
        id: `profile_${account.id}`,
        teamMemberId: member.id,
        teamId,
        userId: account.id,
        displayName: account.displayName,
        position: 'TBC',
        phone: '',
        email: normalizeEmail(account.email),
        legacyPlayerId: account.legacyPlayerId,
        createdAt: nowIso(),
      };
      profiles.push(profile);
      profilesChanged = true;
    }
  });

  // Ensure staff accounts exist with their canonical roles — enforces correct role even
  // if Redis was previously corrupted (e.g. applyApprovedIdentityLocally wrote role:'player').
  LEGACY_STAFF_ACCOUNTS.forEach(account => {
    let user = users.find(item => item.id === account.id);
    if (!user) {
      user = {
        id: account.id,
        email: normalizeEmail(account.email),
        firstName: account.firstName,
        lastName: account.lastName,
        displayName: account.displayName,
        authProvider: 'legacy-password',
        passwordSet: true,
        emailVerified: false,
        ...hashPassword(account.password),
        createdAt: nowIso(),
        lastLoginAt: null,
      };
      users.push(user);
      usersChanged = true;
    } else if (!user.passwordHash) {
      Object.assign(user, hashPassword(account.password), { passwordSet: true });
      usersChanged = true;
    }
    let member = members.find(item => item.teamId === teamId && item.userId === account.id);
    if (!member) {
      member = {
        id: `tm_${account.id}`,
        teamId,
        userId: account.id,
        role: account.role,
        status: 'active',
        joinedAt: nowIso(),
        approvedAt: nowIso(),
        approvedBy: 'legacy-compatibility',
        rejectedAt: null,
        rejectedBy: null,
      };
      members.push(member);
      membersChanged = true;
    } else if (member.role !== account.role) {
      member.role = account.role;
      membersChanged = true;
    }
  });

  // Remove any player profiles for staff user IDs — data artifacts from before
  // the staff/player separation was enforced (e.g. applyApprovedIdentityLocally
  // being called for coach-demo, which created a Redis player profile for it).
  const staffIds = new Set(LEGACY_STAFF_ACCOUNTS.map(a => a.id));
  const beforeClean = profiles.length;
  profiles = profiles.filter(p => !staffIds.has(String(p.userId || '')));
  if (profiles.length !== beforeClean) profilesChanged = true;

  await Promise.all([
    usersChanged ? saveUsers(users) : Promise.resolve(),
    membersChanged ? saveTeamMembers(members) : Promise.resolve(),
    profilesChanged ? savePlayerProfiles(profiles) : Promise.resolve(),
  ]);
}

export function hasRole(sessionContext, roles = []) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const role = sessionContext?.teamMember?.role || sessionContext?.user?.role || sessionContext?.session?.role || '';
  return Boolean(sessionContext?.user?.id && sessionContext?.teamMember?.status === 'active' && allowed.includes(role));
}

export async function requireSession(req) {
  const sessionContext = await resolveSessionFromRequest(req);
  if (!sessionContext?.user?.id || sessionContext?.teamMember?.status !== 'active') {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  return sessionContext;
}

export async function requireRole(req, roles = []) {
  const sessionContext = await requireSession(req);
  if (!hasRole(sessionContext, roles)) {
    const error = new Error('Not authorized');
    error.status = 403;
    throw error;
  }
  return sessionContext;
}

function splitDisplayName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

function ensurePassword(user, password) {
  if (!String(password || '').trim()) return user;
  Object.assign(user, hashPassword(password), { passwordSet: true, authProvider: user.authProvider || 'password' });
  return user;
}

async function upsertUserAccount({ email, firstName, lastName, displayName: name, password }) {
  const users = await loadUsers();
  const normalized = normalizeEmail(email);
  let user = users.find(item => normalizeEmail(item.email) === normalized);
  const createdAt = nowIso();
  if (!user) {
    user = {
      id: makeId('user'),
      email: normalized,
      firstName: String(firstName || '').trim(),
      lastName: String(lastName || '').trim(),
      displayName: name || displayName(firstName, lastName) || normalized,
      authProvider: 'password',
      passwordSet: Boolean(password),
      emailVerified: false,
      createdAt,
      lastLoginAt: null,
    };
    ensurePassword(user, password);
    users.push(user);
  } else {
    user.firstName = user.firstName || String(firstName || '').trim();
    user.lastName = user.lastName || String(lastName || '').trim();
    user.displayName = user.displayName || name || displayName(firstName, lastName) || normalized;
    if (password) ensurePassword(user, password);
  }
  await saveUsers(users);
  return user;
}

async function ensureTeamMember({ teamId = DEFAULT_TEAM.id, userId, role = 'player', status = 'active', approvedBy = 'invite', forceRole = false, staffLevel = null }) {
  const members = await loadTeamMembers();
  let member = members.find(item => item.teamId === teamId && item.userId === userId);
  if (!member) {
    member = {
      id: makeId('tm'),
      teamId,
      userId,
      role,
      status,
      joinedAt: nowIso(),
      approvedAt: status === 'active' ? nowIso() : null,
      approvedBy: status === 'active' ? approvedBy : null,
      rejectedAt: null,
      rejectedBy: null,
    };
    if (staffLevel && ['coach', 'admin'].includes(role)) member.staffLevel = staffLevel;
    members.push(member);
  } else {
    member.role = forceRole ? role : (member.role || role);
    member.status = status;
    if (staffLevel && ['coach', 'admin'].includes(member.role) && !member.staffLevel) member.staffLevel = staffLevel;
    if (status === 'active') {
      member.approvedAt = member.approvedAt || nowIso();
      member.approvedBy = member.approvedBy || approvedBy;
      member.rejectedAt = null;
      member.rejectedBy = null;
    }
  }
  await saveTeamMembers(members);
  return member;
}

async function ensurePlayerProfile({ teamMember, user, invite = null, position = '', phone = '' }) {
  if (teamMember.role !== 'player') return null;
  const profiles = await loadPlayerProfiles();
  let profile = profiles.find(item => item.teamMemberId === teamMember.id) ||
    profiles.find(item => item.teamId === teamMember.teamId && item.userId === user.id);
  if (!profile) {
    profile = {
      id: makeId('profile'),
      teamMemberId: teamMember.id,
      teamId: teamMember.teamId,
      userId: user.id,
      displayName: user.displayName || displayName(user.firstName, user.lastName),
      position: position || 'TBC',
      phone: phone || '',
      email: user.email,
      legacyPlayerId: invite?.token ? `inv-${String(invite.token).slice(-8)}` : user.id,
      createdAt: nowIso(),
    };
    profiles.push(profile);
  } else {
    // Self-registration may supply details an existing placeholder lacked.
    if (position) profile.position = position;
    if (phone) profile.phone = phone;
  }
  await savePlayerProfiles(profiles);
  return profile;
}

async function ensureLegacyStaffAccountForLogin(email, password) {
  const legacy = LEGACY_STAFF_ACCOUNTS.find(account => normalizeEmail(account.email) === normalizeEmail(email));
  if (!legacy || String(password || '') !== legacy.password) return null;
  const users = await loadUsers();
  let user = users.find(item => item.id === legacy.id || normalizeEmail(item.email) === normalizeEmail(legacy.email));
  if (!user) {
    user = {
      id: legacy.id,
      email: normalizeEmail(legacy.email),
      firstName: legacy.firstName,
      lastName: legacy.lastName,
      displayName: legacy.displayName,
      authProvider: 'legacy-password',
      passwordSet: true,
      emailVerified: false,
      ...hashPassword(legacy.password),
      createdAt: nowIso(),
      lastLoginAt: null,
    };
    users.push(user);
  } else {
    Object.assign(user, hashPassword(legacy.password), {
      authProvider: user.authProvider || 'legacy-password',
      passwordSet: true,
    });
  }
  // Rename stale display name on next login
  if (user.displayName === 'Simon Dodd') {
    user.displayName = 'Simon Coach';
    user.firstName = 'Simon';
    user.lastName = 'Coach';
  }
  await saveUsers(users);

  const member = await ensureTeamMember({
    teamId: DEFAULT_TEAM.id,
    userId: user.id,
    role: legacy.role,
    status: 'active',
    approvedBy: 'legacy-migration',
    forceRole: true,
  });
  return { user, member };
}

export async function listPendingJoinRequests(teamId = DEFAULT_TEAM.id) {
  const [users, teams, members, profiles] = await Promise.all([
    loadUsers(),
    loadTeams(),
    loadTeamMembers(),
    loadPlayerProfiles(),
  ]);
  const profileUserIds = new Set(profiles.map(profile => profile.userId));
  return members
    .filter(member => member.teamId === teamId && member.role === 'player' && member.status === 'pending')
    .map(member => publicRequest({
      ...member,
      user: users.find(user => user.id === member.userId) || null,
      team: teams.find(team => team.id === member.teamId) || null,
      hasPlayerProfile: profileUserIds.has(member.userId),
    }));
}

export async function approveJoinRequest(memberId, approvedBy = 'coach-demo', expectedTeamId = null) {
  const [users, members, profiles] = await Promise.all([
    loadUsers(),
    loadTeamMembers(),
    loadPlayerProfiles(),
  ]);
  const member = members.find(item => item.id === memberId);
  if (!member) {
    const error = new Error('Join request not found');
    error.status = 404;
    throw error;
  }
  if (expectedTeamId && member.teamId !== expectedTeamId) {
    const error = new Error('Not authorized for this team');
    error.status = 403;
    throw error;
  }
  const user = users.find(item => item.id === member.userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  member.status = 'active';
  member.approvedAt = nowIso();
  member.approvedBy = approvedBy || 'coach-demo';
  member.rejectedAt = null;
  member.rejectedBy = null;

  let profile = profiles.find(item => item.teamMemberId === member.id);
  if (!profile) {
    profile = {
      id: makeId('profile'),
      teamMemberId: member.id,
      teamId: member.teamId,
      userId: user.id,
      displayName: user.displayName || displayName(user.firstName, user.lastName),
      position: 'TBC',
      phone: '',
      email: user.email,
      legacyPlayerId: user.id,
      createdAt: nowIso(),
    };
    profiles.push(profile);
  }

  await Promise.all([
    saveTeamMembers(members),
    savePlayerProfiles(profiles),
  ]);

  return { user: publicUserWithRole(user, member), teamMember: member, playerProfile: profile };
}


// Attach computed permissions + memberships to an auth result so login,
// club-creation and dev-login responses match resolveSession's shape.
async function withIdentityComputed(result, member) {
  const [members, teams] = await Promise.all([loadTeamMembers(), loadTeams()]);
  const memberships = members
    .filter(item => item.userId === result.user?.id && item.status === 'active')
    .map(item => ({
      teamId: item.teamId,
      teamName: teams.find(t => t.id === item.teamId)?.name || item.teamId,
      role: item.role,
      staffLevel: item.staffLevel || null,
      canonicalRole: canonicalRole(item),
      current: item.teamId === member?.teamId,
    }));
  return { ...result, permissions: [...permissionsFor(member)], memberships };
}

export async function loginUser(input = {}) {
  assertLoginInput(input);
  let users = await loadUsers();
  const email = normalizeEmail(input.email);
  let user = users.find(item => normalizeEmail(item.email) === email);
  let legacyMember = null;
  if (!user) {
    const legacy = await ensureLegacyStaffAccountForLogin(email, input.password);
    user = legacy?.user || null;
    legacyMember = legacy?.member || null;
    users = await loadUsers();
  }
  let passwordCheck = user ? verifyPassword(input.password, user) : { ok: false, needsUpgrade: false };
  if (!passwordCheck.ok && !legacyMember) {
    // User exists but hash is wrong/missing — try legacy staff reset (handles corrupted or
    // previously-changed passwords on hardcoded dev accounts).
    const legacy = await ensureLegacyStaffAccountForLogin(email, input.password);
    if (legacy) {
      user = legacy.user;
      legacyMember = legacy.member;
      users = await loadUsers();
      passwordCheck = verifyPassword(input.password, user);
    }
  }
  if (!user || !passwordCheck.ok) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  const members = await loadTeamMembers();
  // Default-team behaviour unchanged; users whose only membership is a
  // self-created club (Start a New Club) fall back to their active
  // membership in any team.
  const member = legacyMember ||
    members.find(item => item.userId === user.id && item.teamId === (input.teamId || DEFAULT_TEAM.id)) ||
    members.find(item => item.userId === user.id && item.status === 'active');
  if (!member || member.status !== 'active') {
    const error = new Error(member?.status === 'pending' ? 'Waiting for coach approval' : 'Account is not active for this team');
    error.status = 403;
    throw error;
  }

  const profiles = await loadPlayerProfiles();
  const profile = profiles.find(item => item.userId === user.id && item.teamId === member.teamId) || null;
  if (passwordCheck.needsUpgrade) {
    Object.assign(user, hashPassword(input.password), { passwordMigratedAt: nowIso() });
  }
  user.lastLoginAt = nowIso();
  await saveUsers(users);
  const session = await createSession({ userId: user.id, teamId: member.teamId, role: member.role });
  return withIdentityComputed({ user: publicUserWithRole(user, member), teamMember: member, playerProfile: profile, session }, member);
}

export async function claimInvite(input = {}) {
  const token = String(input.token || '').trim();
  if (!token) throw new Error('Invite token is required');
  const invites = await loadInvites();
  const invite = invites.find(item => item.token === token);
  if (!invite) {
    const error = new Error('Invite not found or expired');
    error.status = 404;
    throw error;
  }
  if (invite.status === 'revoked') {
    const error = new Error('This invite has been revoked');
    error.status = 410;
    throw error;
  }
  // A group invite is a permanent, reusable club link: many players claim the
  // same token, so it is never consumed / marked accepted, and never expires.
  const isGroup = invite.kind === 'group';
  if (invite.status === 'accepted' && !input.allowExisting && !isGroup) {
    const error = new Error('This invite has already been claimed');
    error.status = 409;
    throw error;
  }
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
    invite.status = 'expired';
    await saveInvites(invites);
    const error = new Error('This invite link has expired');
    error.status = 410;
    throw error;
  }
  const email = normalizeEmail(input.email || invite.email);
  if (!EMAIL_RE.test(email)) throw new Error('Valid email is required');
  assertPassword(input.password);
  const name = String(input.name || invite.name || '').trim();
  if (isGroup && !name) throw new Error('Your name is required');
  const parts = splitDisplayName(name);
  const user = await upsertUserAccount({
    email,
    firstName: parts.firstName,
    lastName: parts.lastName,
    displayName: name,
    password: input.password,
  });
  const member = await ensureTeamMember({
    teamId: invite.teamId || DEFAULT_TEAM.id,
    userId: user.id,
    role: invite.role || 'player',
    status: 'active',
    approvedBy: 'invite',
    staffLevel: STAFF_LEVELS.includes(invite.staffLevel) ? invite.staffLevel : null,
  });
  const profile = await ensurePlayerProfile({
    teamMember: member, user, invite,
    position: String(input.position || '').trim(),
    phone: String(input.phone || input.mobile || '').trim(),
  });
  if (isGroup) {
    // Keep the link open; just track usage.
    invite.acceptedCount = (invite.acceptedCount || 0) + 1;
    invite.lastAcceptedAt = nowIso();
    invite.lastAcceptedBy = user.id;
  } else {
    invite.status = 'accepted';
    invite.acceptedAt = invite.acceptedAt || nowIso();
    invite.acceptedBy = user.id;
    invite.email = email;
    invite.name = name || invite.name;
  }
  await saveInvites(invites);
  const session = await createSession({ userId: user.id, teamId: member.teamId, role: member.role });
  return { user: publicUserWithRole(user, member), teamMember: member, playerProfile: profile, invite, session };
}

export async function createPasswordResetRequest({ email } = {}) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) throw new Error('Valid email is required');
  const users = await loadUsers();
  const user = users.find(item => normalizeEmail(item.email) === normalized);
  // Do not force callers to reveal whether an account exists.
  if (!user) return { email: normalized, user: null, token: null, expiresAt: null };

  const token = randomBytes(32).toString('base64url');
  const reset = {
    id: makeId('reset'),
    tokenHash: hashToken(token),
    userId: user.id,
    email: normalized,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString(),
    usedAt: null,
  };
  const resets = await loadPasswordResets();
  resets.push(reset);
  await savePasswordResets(resets);
  return { email: normalized, user: publicUser(user), token, expiresAt: reset.expiresAt };
}

export async function resetPasswordWithToken({ token, password } = {}) {
  const rawToken = String(token || '').trim();
  if (!rawToken) throw new Error('Reset token is required');
  assertPassword(password);
  const resets = await loadPasswordResets();
  const tokenHash = hashToken(rawToken);
  const reset = resets.find(item => item.tokenHash === tokenHash && !item.usedAt);
  if (!reset) {
    const error = new Error('Reset link is invalid or expired');
    error.status = 410;
    throw error;
  }
  if (new Date(reset.expiresAt).getTime() <= Date.now()) {
    const error = new Error('Reset link is invalid or expired');
    error.status = 410;
    throw error;
  }

  const users = await loadUsers();
  const user = users.find(item => item.id === reset.userId);
  if (!user) {
    const error = new Error('Account not found');
    error.status = 404;
    throw error;
  }
  ensurePassword(user, password);
  reset.usedAt = nowIso();
  await Promise.all([saveUsers(users), savePasswordResets(resets)]);
  return { user: publicUser(user), reset: { id: reset.id, usedAt: reset.usedAt } };
}

export async function createEmailVerificationToken(userId) {
  if (!userId) throw new Error('userId is required');
  const users = await loadUsers();
  const user = users.find(item => item.id === userId);
  if (!user) {
    const error = new Error('Account not found');
    error.status = 404;
    throw error;
  }
  if (user.emailVerified) {
    return { user: publicUser(user), token: null, expiresAt: null, alreadyVerified: true };
  }
  const token = randomBytes(32).toString('base64url');
  const verification = {
    id: makeId('evtoken'),
    tokenHash: hashToken(token),
    userId: user.id,
    email: user.email,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString(),
    usedAt: null,
  };
  const verifications = await loadEmailVerifications();
  verifications.push(verification);
  await saveEmailVerifications(verifications);
  return { user: publicUser(user), token, expiresAt: verification.expiresAt, alreadyVerified: false };
}

export async function verifyEmailToken(token) {
  const rawToken = String(token || '').trim();
  if (!rawToken) {
    const error = new Error('Verification token is required');
    error.status = 400;
    throw error;
  }
  const verifications = await loadEmailVerifications();
  const tokenHash = hashToken(rawToken);
  const verification = verifications.find(item => item.tokenHash === tokenHash && !item.usedAt);
  if (!verification || new Date(verification.expiresAt).getTime() <= Date.now()) {
    const error = new Error('Verification link is invalid or expired');
    error.status = 410;
    throw error;
  }
  const users = await loadUsers();
  const user = users.find(item => item.id === verification.userId);
  if (!user) {
    const error = new Error('Account not found');
    error.status = 404;
    throw error;
  }
  user.emailVerified = true;
  user.emailVerifiedAt = nowIso();
  verification.usedAt = nowIso();
  await Promise.all([saveUsers(users), saveEmailVerifications(verifications)]);
  return { user: publicUser(user), verification: { id: verification.id, usedAt: verification.usedAt } };
}

export async function createSession({ userId, teamId = DEFAULT_TEAM.id, role = 'player' } = {}) {
  if (!userId) throw new Error('userId is required');
  const token = randomBytes(32).toString('base64url');
  const session = {
    id: makeId('sess'),
    tokenHash: hashToken(token),
    userId,
    teamId,
    role,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  const sessions = await loadSessions();
  sessions.push(session);
  await saveSessions(sessions);
  return { token, expiresAt: session.expiresAt, userId, teamId, role };
}

export async function resolveSession(token = '') {
  const hashed = hashToken(token);
  const sessions = await loadSessions();
  const session = sessions.find(item => item.tokenHash === hashed);
  if (!session) return null;
  const [users, members, profiles] = await Promise.all([
    loadUsers(),
    loadTeamMembers(),
    loadPlayerProfiles(),
  ]);
  const user = users.find(item => item.id === session.userId);
  if (!user) return null;
  const member = members.find(item => item.teamId === session.teamId && item.userId === session.userId && item.status === 'active') || null;
  const profile = profiles.find(item => item.teamId === session.teamId && item.userId === session.userId) || null;
  // Identity & Permissions: every session carries its computed permission set
  // (single source: _permissions.js) and the user's full membership list so
  // clients can offer team switching without a second fetch.
  const teams = await loadTeams();

  // Resolve plan fields for the session's team; auto-downgrade expired trials.
  const currentTeam = teams.find(t => t.id === session.teamId) || null;
  let teamPlan = currentTeam?.plan || 'trial';
  let teamPlanStatus = currentTeam?.planStatus || 'active';
  const teamTrialEndsAt = currentTeam?.trialEndsAt || null;
  if (teamPlan === 'trial' && teamTrialEndsAt && new Date(teamTrialEndsAt).getTime() < Date.now()) {
    teamPlan = 'core';
    teamPlanStatus = 'active';
    if (currentTeam) {
      currentTeam.plan = 'core';
      currentTeam.planStatus = 'active';
      await saveTeams(teams);
    }
  }

  const memberships = members
    .filter(item => item.userId === session.userId && item.status === 'active')
    .map(item => ({
      teamId: item.teamId,
      teamName: teams.find(t => t.id === item.teamId)?.name || item.teamId,
      role: item.role,
      staffLevel: item.staffLevel || null,
      canonicalRole: canonicalRole(item),
      current: item.teamId === session.teamId,
    }));
  return {
    session,
    user: publicUserWithRole(user, member || session),
    teamMember: member,
    playerProfile: profile,
    permissions: [...permissionsFor(member)],
    memberships,
    teamPlan,
    teamPlanStatus,
    trialEndsAt: teamTrialEndsAt,
  };
}

export async function resolveSessionFromRequest(req) {
  const token = sessionTokenFromRequest(req);
  if (!token) return null;
  return resolveSession(token);
}

// Multi-team: switch the current session to another team where the user
// holds an active membership. Old session is replaced; no logout required.
export async function switchTeam(token = '', targetTeamId = '') {
  const current = await resolveSession(token);
  if (!current?.user?.id) { const e = new Error('Authentication required'); e.status = 401; throw e; }
  const membership = (current.memberships || []).find(m => m.teamId === String(targetTeamId));
  if (!membership) { const e = new Error('No active membership in that team'); e.status = 403; throw e; }
  await destroySession(token);
  const session = await createSession({ userId: current.user.id, teamId: membership.teamId, role: membership.role });
  return { session, teamId: membership.teamId };
}

export async function destroySession(token = '') {
  const hashed = hashToken(token);
  const sessions = await loadSessions();
  await saveSessions(sessions.filter(item => item.tokenHash !== hashed));
}

// ─── Self-service club creation (Start a New Club wizard) ───────────────────
// Creates a brand-new tenant end-to-end: team record, coach account, head
// coach membership and a live session — no developer steps. Purely additive:
// existing teams, users and memberships are never modified.

function teamSlug(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'club';
}

export async function createClub({ clubName, teamName, sport, name, email, password } = {}) {
  const club = String(clubName || '').trim().slice(0, 80);
  if (!club) throw new Error('Club name is required');
  const coachName = String(name || '').trim().slice(0, 80);
  if (!coachName) throw new Error('Your name is required');
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) throw new Error('Valid email is required');
  assertPassword(password);

  const users = await loadUsers();
  if (users.some(item => normalizeEmail(item.email) === normalized)) {
    const error = new Error('An account with that email already exists — log in instead');
    error.status = 409;
    throw error;
  }

  // Unique team id derived from the club name; collision-proofed with a suffix.
  const teams = await loadTeams();
  let teamId = teamSlug(club);
  while (teams.some(t => t.id === teamId)) {
    teamId = `${teamSlug(club)}-${randomBytes(2).toString('hex')}`;
  }
  const teamCode = (club.replace(/[^a-zA-Z]/g, '').slice(0, 6).toUpperCase() || 'CLUB') +
    String(Math.floor(Math.random() * 90) + 10);
  const createdAt = nowIso();
  const team = {
    id: teamId,
    name: club,
    teamName: String(teamName || '').trim().slice(0, 80),
    sport: String(sport || 'Rugby').trim().slice(0, 40) || 'Rugby',
    teamCode,
    createdAt,
    plan: 'trial',
    planStatus: 'active',
    trialEndsAt: new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  };
  teams.push(team);
  await saveTeams(teams);

  const parts = splitDisplayName(coachName);
  const user = {
    id: makeId('user'),
    email: normalized,
    firstName: parts.firstName,
    lastName: parts.lastName,
    displayName: coachName,
    authProvider: 'password',
    passwordSet: true,
    emailVerified: false,
    ...hashPassword(password),
    createdAt: nowIso(),
    lastLoginAt: nowIso(),
  };
  users.push(user);
  await saveUsers(users);

  const members = await loadTeamMembers();
  const member = {
    id: makeId('tm'),
    teamId,
    userId: user.id,
    role: 'coach',
    staffLevel: 'head',
    status: 'active',
    joinedAt: nowIso(),
    approvedAt: nowIso(),
    approvedBy: 'club-creation',
    rejectedAt: null,
    rejectedBy: null,
  };
  members.push(member);
  await saveTeamMembers(members);

  const session = await createSession({ userId: user.id, teamId, role: 'coach' });
  return withIdentityComputed({ user: publicUserWithRole(user, member), team, teamMember: member, session }, member);
}

// ─── Self-service account management (Settings screen) ──────────────────────
// All of these require the caller's CURRENT password — a stolen session
// cookie alone cannot take over the account.

function requireCurrentPassword(user, currentPassword) {
  const check = verifyPassword(currentPassword, user);
  if (!check.ok) {
    const error = new Error('Current password is incorrect');
    error.status = 403;
    throw error;
  }
}

export async function changePassword(userId, { currentPassword, newPassword } = {}) {
  assertPassword(newPassword);
  const users = await loadUsers();
  const user = users.find(item => item.id === userId);
  if (!user) { const e = new Error('Account not found'); e.status = 404; throw e; }
  requireCurrentPassword(user, currentPassword);
  Object.assign(user, hashPassword(newPassword), { passwordSet: true, passwordChangedAt: nowIso() });
  await saveUsers(users);
  return { user: publicUser(user) };
}

export async function changeEmail(userId, { currentPassword, newEmail } = {}) {
  const normalized = normalizeEmail(newEmail);
  if (!EMAIL_RE.test(normalized)) throw new Error('Valid email is required');
  const users = await loadUsers();
  const user = users.find(item => item.id === userId);
  if (!user) { const e = new Error('Account not found'); e.status = 404; throw e; }
  requireCurrentPassword(user, currentPassword);
  if (users.some(item => item.id !== userId && normalizeEmail(item.email) === normalized)) {
    const error = new Error('That email is already in use by another account');
    error.status = 409;
    throw error;
  }
  user.previousEmail = user.email;
  user.email = normalized;
  user.emailChangedAt = nowIso();
  await saveUsers(users);
  return { user: publicUser(user) };
}

export async function updateProfile(userId, { displayName, firstName, lastName, playerDetails } = {}) {
  const users = await loadUsers();
  const user = users.find(item => item.id === userId);
  if (!user) { const e = new Error('Account not found'); e.status = 404; throw e; }
  const name = String(displayName || '').trim().slice(0, 80);
  if (name) user.displayName = name;
  if (String(firstName || '').trim()) user.firstName = String(firstName).trim().slice(0, 40);
  if (String(lastName || '').trim()) user.lastName = String(lastName).trim().slice(0, 40);
  await saveUsers(users);

  // Player self-service details (Autopilot): players keep their own profile
  // record current; the coach approves rather than types. Whitelisted fields
  // only, written to the caller's OWN player profile.
  let profile = null;
  if (playerDetails && typeof playerDetails === 'object') {
    const clean = {};
    const str = (v, n) => String(v || '').trim().slice(0, n);
    if (playerDetails.phone !== undefined)            clean.phone = str(playerDetails.phone, 30);
    if (playerDetails.emergencyContact !== undefined) clean.emergencyContact = str(playerDetails.emergencyContact, 120);
    if (playerDetails.position !== undefined)         clean.position = str(playerDetails.position, 40);
    if (playerDetails.dominantHand !== undefined)     clean.dominantHand = ['left', 'right'].includes(String(playerDetails.dominantHand).toLowerCase()) ? String(playerDetails.dominantHand).toLowerCase() : '';
    if (playerDetails.heightCm !== undefined)         clean.heightCm = Math.max(0, Math.min(250, Number(playerDetails.heightCm) || 0)) || '';
    if (playerDetails.weightKg !== undefined)         clean.weightKg = Math.max(0, Math.min(250, Number(playerDetails.weightKg) || 0)) || '';
    if (Object.keys(clean).length) {
      const profiles = await loadPlayerProfiles();
      profile = profiles.find(item => item.userId === userId) || null;
      if (profile) {
        profile.details = { ...(profile.details || {}), ...clean };
        profile.detailsUpdatedAt = nowIso();
        profile.detailsApprovedAt = null; // re-approval needed after changes
        if (clean.phone) profile.phone = clean.phone;
        if (clean.position) profile.position = clean.position;
        await savePlayerProfiles(profiles);
      }
    }
  }
  return { user: publicUser(user), playerProfile: profile };
}

// Coach approval of player-submitted details (Autopilot step: "coach simply
// approves"). Tenant-checked; stamps detailsApprovedAt.
export async function approvePlayerDetails(profileId, approvedBy, expectedTeamId) {
  const profiles = await loadPlayerProfiles();
  const profile = profiles.find(item => item.id === profileId);
  if (!profile) { const e = new Error('Player profile not found'); e.status = 404; throw e; }
  if (expectedTeamId && profile.teamId !== expectedTeamId) {
    const e = new Error('Not authorized for this team'); e.status = 403; throw e;
  }
  profile.detailsApprovedAt = nowIso();
  profile.detailsApprovedBy = approvedBy;
  await savePlayerProfiles(profiles);
  return { playerProfile: profile };
}

// Notification preferences live on the user record; undefined means enabled,
// so existing users keep today's behaviour until they explicitly opt out.
const PREFERENCE_KEYS = ['pushEnabled', 'emailEnabled', 'matchReminders', 'trainingReminders'];

export async function updateNotificationPreferences(userId, prefs = {}) {
  const users = await loadUsers();
  const user = users.find(item => item.id === userId);
  if (!user) { const e = new Error('Account not found'); e.status = 404; throw e; }
  user.preferences = { ...(user.preferences || {}) };
  PREFERENCE_KEYS.forEach(k => {
    if (typeof prefs[k] === 'boolean') user.preferences[k] = prefs[k];
  });
  await saveUsers(users);
  return { preferences: user.preferences };
}

// Map of userId → preferences for the push/cron senders. Missing user or
// missing key = enabled (backwards compatible).
export async function loadNotificationPreferenceMap() {
  const users = await loadUsers();
  return Object.fromEntries(users.filter(u => u.preferences).map(u => [u.id, u.preferences]));
}

export function notificationAllowed(prefMap, userId, { type = 'message', sessionId = '' } = {}) {
  const prefs = prefMap?.[userId];
  if (!prefs) return true;
  if (prefs.pushEnabled === false) return false;
  const isAvailability = ['availability', 'availability-reminder'].includes(String(type));
  if (isAvailability && String(sessionId) === 'game' && prefs.matchReminders === false) return false;
  if (isAvailability && String(sessionId) !== 'game' && prefs.trainingReminders === false) return false;
  return true;
}

export async function destroyAllSessionsForUser(userId, { exceptTokenHash = null } = {}) {
  const sessions = await loadSessions();
  const remaining = sessions.filter(s =>
    s.userId !== userId || (exceptTokenHash && s.tokenHash === exceptTokenHash));
  const revoked = sessions.length - remaining.length;
  if (revoked) await saveSessions(remaining);
  return { revoked };
}

export function tokenHashFor(token = '') {
  return hashToken(token);
}

// ─── Production account recovery (CRON_SECRET-gated, server-side only) ──────
// Used when a coach is locked out (lost password, rate-limited, credential
// drift). Restricted to accounts holding a coach/admin membership so the
// secret cannot be used to silently take over player accounts.

export async function adminAccountStatus(email) {
  const normalized = normalizeEmail(email);
  const [users, members] = await Promise.all([loadUsers(), loadTeamMembers()]);
  const user = users.find(item => normalizeEmail(item.email) === normalized);
  if (!user) {
    // Help diagnose near-miss emails without leaking other accounts: report
    // how many staff accounts exist and their masked emails.
    const staffIds = new Set(members.filter(m => ['coach', 'admin'].includes(m.role)).map(m => m.userId));
    const maskedStaff = users.filter(u => staffIds.has(u.id)).map(u => {
      const [local, domain] = String(u.email || '').split('@');
      return `${(local || '').slice(0, 3)}…@${domain || ''}`;
    });
    return { exists: false, email: normalized, staffAccountHints: maskedStaff };
  }
  const memberships = members.filter(m => m.userId === user.id);
  return {
    exists: true,
    email: user.email,
    userId: user.id,
    displayName: user.displayName || '',
    passwordSet: Boolean(user.passwordHash),
    lastLoginAt: user.lastLoginAt || null,
    memberships: memberships.map(m => ({ teamId: m.teamId, role: m.role, status: m.status, staffLevel: m.staffLevel || null })),
  };
}

export async function adminResetStaffPassword({ email, newPassword } = {}) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) throw new Error('Valid email is required');
  assertPassword(newPassword);
  const [users, members] = await Promise.all([loadUsers(), loadTeamMembers()]);
  const user = users.find(item => normalizeEmail(item.email) === normalized);
  if (!user) {
    const error = new Error('Account not found for that email');
    error.status = 404;
    throw error;
  }
  const isStaff = members.some(m => m.userId === user.id && ['coach', 'admin'].includes(m.role) && m.status === 'active');
  if (!isStaff) {
    const error = new Error('Account is not an active staff account');
    error.status = 403;
    throw error;
  }
  Object.assign(user, hashPassword(newPassword), { passwordSet: true, passwordResetByAdminAt: nowIso() });
  await saveUsers(users);
  // Revoke every live session for this user — stale devices must log in fresh.
  const sessions = await loadSessions();
  const remaining = sessions.filter(s => s.userId !== user.id);
  const revoked = sessions.length - remaining.length;
  if (revoked) await saveSessions(remaining);
  return { user: publicUser(user), sessionsRevoked: revoked };
}

// ─── Member administration (Club Admin screen) ──────────────────────────────
// Staff permission levels live on team_members.staffLevel:
//   'head' (Head Coach) | 'assistant' (Assistant Coach) | 'manager' (Team Manager)
// All staff keep role 'coach' so every existing role gate keeps working;
// staffLevel only gates STAFF MANAGEMENT actions. A coach member with no
// staffLevel predates this field and is treated as head coach.

export const STAFF_LEVELS = ['head', 'assistant', 'manager'];

export function staffLevelOf(member = {}) {
  if (!member || !['coach', 'admin'].includes(member.role)) return null;
  return STAFF_LEVELS.includes(member.staffLevel) ? member.staffLevel : 'head';
}

export function isHeadCoach(sessionContext = {}) {
  return staffLevelOf(sessionContext?.teamMember) === 'head';
}

function findTeamMemberOrThrow(members, memberId, expectedTeamId) {
  const member = members.find(item => item.id === memberId);
  if (!member) {
    const error = new Error('Team member not found');
    error.status = 404;
    throw error;
  }
  if (expectedTeamId && member.teamId !== expectedTeamId) {
    const error = new Error('Not authorized for this team');
    error.status = 403;
    throw error;
  }
  return member;
}

async function countActiveHeadCoaches(members, teamId) {
  return members.filter(m =>
    m.teamId === teamId && m.status === 'active' && staffLevelOf(m) === 'head'
  ).length;
}

// Soft-remove: status flips away from 'active', which makes resolveSession
// stop returning an active teamMember — the user can no longer act in this
// team. The user record itself is untouched (audit trail + other teams).
export async function removeTeamMember(memberId, removedBy, expectedTeamId, { archive = false } = {}) {
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  if (member.userId === removedBy) {
    const error = new Error('You cannot remove yourself');
    error.status = 400;
    throw error;
  }
  if (staffLevelOf(member) === 'head' && await countActiveHeadCoaches(members, member.teamId) <= 1) {
    const error = new Error('Cannot remove the last head coach');
    error.status = 400;
    throw error;
  }
  member.status = archive ? 'archived' : 'removed';
  member.removedAt = nowIso();
  member.removedBy = removedBy;
  await saveTeamMembers(members);
  // Revoke any live sessions this user holds for the team.
  const sessions = await loadSessions();
  const remaining = sessions.filter(s => !(s.userId === member.userId && s.teamId === member.teamId));
  if (remaining.length !== sessions.length) await saveSessions(remaining);
  return { teamMember: member };
}

export async function restoreTeamMember(memberId, restoredBy, expectedTeamId) {
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  if (!['archived', 'removed'].includes(member.status)) {
    const error = new Error('Member is not archived');
    error.status = 400;
    throw error;
  }
  member.status = 'active';
  member.restoredAt = nowIso();
  member.restoredBy = restoredBy;
  await saveTeamMembers(members);
  return { teamMember: member };
}

export async function setStaffLevel(memberId, staffLevel, changedBy, expectedTeamId) {
  if (!STAFF_LEVELS.includes(staffLevel)) {
    const error = new Error(`staffLevel must be one of: ${STAFF_LEVELS.join(', ')}`);
    error.status = 400;
    throw error;
  }
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  if (!['coach', 'admin'].includes(member.role)) {
    const error = new Error('Only staff members have a permission level');
    error.status = 400;
    throw error;
  }
  if (staffLevelOf(member) === 'head' && staffLevel !== 'head' &&
      await countActiveHeadCoaches(members, member.teamId) <= 1) {
    const error = new Error('Cannot demote the last head coach');
    error.status = 400;
    throw error;
  }
  member.staffLevel = staffLevel;
  member.staffLevelChangedAt = nowIso();
  member.staffLevelChangedBy = changedBy;
  await saveTeamMembers(members);
  return { teamMember: member };
}

export async function rejectJoinRequest(memberId, rejectedBy = 'coach-demo', expectedTeamId = null) {
  const members = await loadTeamMembers();
  const member = members.find(item => item.id === memberId);
  if (!member) {
    const error = new Error('Join request not found');
    error.status = 404;
    throw error;
  }
  if (expectedTeamId && member.teamId !== expectedTeamId) {
    const error = new Error('Not authorized for this team');
    error.status = 403;
    throw error;
  }
  member.status = 'rejected';
  member.rejectedAt = nowIso();
  member.rejectedBy = rejectedBy || 'coach-demo';
  await saveTeamMembers(members);
  return { teamMember: member };
}

export async function devLoginUser(userId, teamId = DEFAULT_TEAM.id) {
  if (process.env.DEV_LOGIN !== 'true') return null;
  if (!userId) return null;
  await ensureLegacyCompatibilityTeamRecords(teamId);
  const [users, members, profiles] = await Promise.all([
    loadUsers(), loadTeamMembers(), loadPlayerProfiles(),
  ]);
  const user = users.find(u => u.id === userId);
  if (!user) return null;
  const member = members.find(m => m.teamId === teamId && m.userId === userId && m.status === 'active');
  if (!member) return null;
  const profile = profiles.find(p => p.teamId === teamId && p.userId === userId) || null;
  user.lastLoginAt = nowIso();
  await saveUsers(users);
  const session = await createSession({ userId: user.id, teamId: member.teamId, role: member.role });
  return withIdentityComputed({ user: publicUserWithRole(user, member), teamMember: member, playerProfile: profile, session }, member);
}

export async function listIdentityState(teamId = DEFAULT_TEAM.id) {
  await ensureLegacyCompatibilityTeamRecords(teamId);
  const [users, teams, members, profiles] = await Promise.all([
    loadUsers(),
    loadTeams(),
    loadTeamMembers(),
    loadPlayerProfiles(),
  ]);
  const teamMembers = members.filter(member => member.teamId === teamId);
  const teamUserIds = new Set(teamMembers.map(member => member.userId));
  const teamProfiles = profiles.filter(profile => profile.teamId === teamId);
  return {
    users: users.filter(user => teamUserIds.has(user.id)).map(publicUser),
    teams: teams.filter(team => team.id === teamId),
    team_members: teamMembers,
    player_profiles: teamProfiles,
    pending: await listPendingJoinRequests(teamId),
  };
}
