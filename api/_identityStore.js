import { kvGet, kvSet } from './_kv.js';
import { key } from './_keys.js';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const USERS_KEY = key('identity:users');
const TEAMS_KEY = key('identity:teams');
const TEAM_MEMBERS_KEY = key('identity:team_members');
const PLAYER_PROFILES_KEY = key('identity:player_profiles');
const SESSIONS_KEY = key('identity:sessions');
const PASSWORD_RESETS_KEY = key('identity:password_resets');
const INVITES_KEY = 'ce:invites';

export const SESSION_COOKIE = 'ce_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;
const PASSWORD_ALGO = 'scrypt';
const SCRYPT_KEY_LENGTH = 64;

export const DEFAULT_TEAM = {
  id: 'boitsfort-rfc',
  name: 'Boitsfort RFC',
  teamCode: 'BOITSFORT',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LEGACY_STAFF_ACCOUNTS = [
  {
    id: 'coach-demo',
    email: 'simonbdodd@gmail.com',
    firstName: 'Simon',
    lastName: 'Coach',
    displayName: 'Simon Coach',
    role: 'coach',
    passwordEnv: 'LEGACY_COACH_PASSWORD',
  },
];

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

// Run the legacy compatibility cleanup at most once per Lambda instance lifetime.
// The cleanup is idempotent — after it runs once and finds nothing to change, every
// subsequent call would do 3 Redis reads for no benefit. Skip them.
let _legacyCompatibilityChecked = false;

async function ensureLegacyCompatibilityTeamRecords(teamId = DEFAULT_TEAM.id) {
  if (_legacyCompatibilityChecked) return;
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

  await Promise.all([
    usersChanged ? saveUsers(users) : Promise.resolve(),
    membersChanged ? saveTeamMembers(members) : Promise.resolve(),
    profilesChanged ? savePlayerProfiles(profiles) : Promise.resolve(),
  ]);
  _legacyCompatibilityChecked = true;
}

export function hasRole(sessionContext, roles = []) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const role = sessionContext?.teamMember?.role || sessionContext?.user?.role || sessionContext?.session?.role || '';
  return Boolean(sessionContext?.user?.id && sessionContext?.teamMember?.status === 'active' && allowed.includes(role));
}

export async function requireSession(req) {
  const token = sessionTokenFromRequest(req);
  const sessionContext = token ? await resolveSession(token, { fresh: true }) : null;
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

async function ensureTeamMember({ teamId = DEFAULT_TEAM.id, userId, role = 'player', status = 'active', approvedBy = 'invite' }) {
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
    members.push(member);
  } else {
    member.role = member.role || role;
    member.status = status;
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

async function ensurePlayerProfile({ teamMember, user, invite = null }) {
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
      position: 'TBC',
      phone: '',
      email: user.email,
      legacyPlayerId: invite?.token ? `inv-${String(invite.token).slice(-8)}` : user.id,
      createdAt: nowIso(),
    };
    profiles.push(profile);
  }
  await savePlayerProfiles(profiles);
  return profile;
}

async function ensureLegacyStaffAccountForLogin(email, password) {
  const legacy = LEGACY_STAFF_ACCOUNTS.find(account => normalizeEmail(account.email) === normalizeEmail(email));
  const legacyPassword = legacy?.passwordEnv ? process.env[legacy.passwordEnv] : '';
  if (!legacy || !legacyPassword || String(password || '') !== legacyPassword) return null;
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
      ...hashPassword(legacyPassword),
      createdAt: nowIso(),
      lastLoginAt: null,
    };
    users.push(user);
  } else {
    // Always re-hash to match current LEGACY_COACH_PASSWORD — the plaintext check
    // above already verified the entered password equals the env var, so this is safe.
    Object.assign(user, hashPassword(legacyPassword), {
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

export async function loginUser(input = {}) {
  assertLoginInput(input);
  let users = await loadUsers();
  const email = normalizeEmail(input.email);
  let user = users.find(item => normalizeEmail(item.email) === email);
  let legacyMember = null;
  // Always attempt legacy bootstrap for legacy emails so that LEGACY_COACH_PASSWORD
  // acts as an authoritative override even when the user already exists in Redis
  // (e.g. stale hash from a previous deployment with a different env var value).
  const legacy = await ensureLegacyStaffAccountForLogin(email, input.password);
  if (legacy) {
    user = legacy.user;
    legacyMember = legacy.member;
    users = await loadUsers();
  }
  const passwordCheck = user ? verifyPassword(input.password, user) : { ok: false, needsUpgrade: false };
  if (!user || !passwordCheck.ok) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  const members = await loadTeamMembers();
  let member;
  if (legacyMember) {
    member = legacyMember;
  } else if (input.teamId) {
    member = members.find(item => item.userId === user.id && item.teamId === input.teamId);
  } else {
    // No teamId supplied — auto-select when the user has exactly one active membership.
    // This allows Club B members to log in without knowing their teamId.
    const activeAll = members.filter(item => item.userId === user.id && item.status === 'active');
    if (activeAll.length === 1) {
      member = activeAll[0];
    } else {
      // Multiple active memberships or none: fall back to DEFAULT_TEAM for backward compat.
      // When no DEFAULT_TEAM row exists and zero active memberships, surface any pending
      // membership so the caller sees "Waiting for coach approval" rather than "not active".
      member = members.find(item => item.userId === user.id && item.teamId === DEFAULT_TEAM.id)
            || (activeAll.length === 0 ? members.find(item => item.userId === user.id) : undefined);
    }
  }
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
  return { user: publicUserWithRole(user, member), teamMember: member, playerProfile: profile, session };
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
  if (invite.status === 'accepted' && !input.allowExisting) {
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
  });
  const profile = await ensurePlayerProfile({ teamMember: member, user, invite });
  invite.status = 'accepted';
  invite.acceptedAt = invite.acceptedAt || nowIso();
  invite.acceptedBy = user.id;
  invite.email = email;
  invite.name = name || invite.name;
  await saveInvites(invites);
  const session = await createSession({ userId: user.id, teamId: member.teamId, role: member.role });
  return { user: publicUserWithRole(user, member), teamMember: member, playerProfile: profile, invite, session };
}

export async function joinViaGroupInvite(input = {}) {
  const { token, firstName, lastName, email, password } = input;
  if (!String(token || '').trim()) { const e = new Error('token is required'); e.status = 400; throw e; }
  if (!String(firstName || '').trim()) { const e = new Error('First name is required'); e.status = 400; throw e; }
  if (!String(lastName || '').trim()) { const e = new Error('Last name is required'); e.status = 400; throw e; }
  if (!EMAIL_RE.test(normalizeEmail(email))) { const e = new Error('Valid email is required'); e.status = 400; throw e; }
  if (String(password || '').length < 8) { const e = new Error('Password must be at least 8 characters'); e.status = 400; throw e; }

  const invites = await loadInvites();
  const invite = invites.find(i => i.token === token);
  if (!invite) { const e = new Error('Invite not found'); e.status = 404; throw e; }
  if (String(invite.type || 'individual') !== 'group') { const e = new Error('Not a group invite'); e.status = 400; throw e; }
  if (invite.status === 'revoked') { const e = new Error('This invite has been revoked'); e.status = 410; throw e; }
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) { const e = new Error('This invite link has expired'); e.status = 410; throw e; }

  const teamId = String(invite.teamId || DEFAULT_TEAM.id);

  // Guard: check for existing active membership BEFORE touching any password.
  // Without this, upsertUserAccount would overwrite an existing user's password
  // (e.g. the coach's) before the active-member 409 check below could fire.
  const preUsers = await loadUsers();
  const preUser = preUsers.find(u => normalizeEmail(u.email) === normalizeEmail(email));
  if (preUser) {
    const preMembers = await loadTeamMembers();
    const preMember = preMembers.find(m => m.teamId === teamId && m.userId === preUser.id && m.status === 'active');
    if (preMember) {
      const e = new Error('You already have an active account for this team'); e.status = 409; throw e;
    }
  }

  const user = await upsertUserAccount({
    email: normalizeEmail(email),
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    password,
  });

  const members = await loadTeamMembers();
  let member = members.find(item => item.teamId === teamId && item.userId === user.id);

  if (!member) {
    member = {
      id: makeId('tm'),
      teamId,
      userId: user.id,
      role: 'player',
      status: 'pending',
      joinedAt: nowIso(),
      inviteToken: token,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
    };
    members.push(member);
    await saveTeamMembers(members);
  } else if (member.status === 'rejected') {
    member.status = 'pending';
    member.joinedAt = nowIso();
    member.inviteToken = token;
    member.rejectedAt = null;
    member.rejectedBy = null;
    await saveTeamMembers(members);
  } else if (member.status === 'active') {
    const e = new Error('You already have an active account for this team'); e.status = 409; throw e;
  }

  const inviteIdx = invites.findIndex(i => i.token === token);
  if (inviteIdx >= 0) {
    invites[inviteIdx].usageCount = (invites[inviteIdx].usageCount || 0) + 1;
    invites[inviteIdx].lastUsedAt = nowIso();
    await saveInvites(invites);
  }

  return { user: publicUser(user), teamMember: member };
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
  // Invalidate all other unused resets for this user so they cannot be replayed.
  resets.forEach(r => {
    if (r.userId === reset.userId && r.id !== reset.id && !r.usedAt) r.usedAt = reset.usedAt;
  });
  await Promise.all([saveUsers(users), savePasswordResets(resets)]);
  return { user: publicUser(user), reset: { id: reset.id, usedAt: reset.usedAt } };
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

// In-process session cache — avoids 4 Redis reads per request for warm Lambda instances.
// TTL is intentionally short (30s) so logout/role-changes take effect quickly.
const _sessionCache = new Map(); // hashed token → { value, ts }
const _SESSION_CACHE_TTL_MS = 30_000;

export function resetInProcessCaches() {
  _legacyCompatibilityChecked = false;
  _sessionCache.clear();
}

export async function resolveSession(token = '', { fresh = false } = {}) {
  const hashed = hashToken(token);
  const cached = fresh ? null : _sessionCache.get(hashed);
  if (cached && (Date.now() - cached.ts) < _SESSION_CACHE_TTL_MS) {
    return cached.value;
  }
  const sessions = await loadSessions();
  const session = sessions.find(item => item.tokenHash === hashed);
  if (!session) {
    _sessionCache.delete(hashed);
    return null;
  }
  const [users, members, profiles] = await Promise.all([
    loadUsers(),
    loadTeamMembers(),
    loadPlayerProfiles(),
  ]);
  const user = users.find(item => item.id === session.userId);
  if (!user) {
    _sessionCache.delete(hashed);
    return null;
  }
  const member = members.find(item => item.teamId === session.teamId && item.userId === session.userId && item.status === 'active') || null;
  const profile = profiles.find(item => item.teamId === session.teamId && item.userId === session.userId) || null;
  const result = {
    session,
    user: publicUserWithRole(user, member || session),
    teamMember: member,
    playerProfile: profile,
  };
  _sessionCache.set(hashed, { value: result, ts: Date.now() });
  return result;
}

export async function resolveSessionFromRequest(req) {
  const token = sessionTokenFromRequest(req);
  if (!token) return null;
  return resolveSession(token);
}

export async function destroySession(token = '') {
  const hashed = hashToken(token);
  _sessionCache.delete(hashed); // ensure logout is immediate even within TTL window
  const sessions = await loadSessions();
  await saveSessions(sessions.filter(item => item.tokenHash !== hashed));
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

export async function provisionClub({ teamId, teamName, teamCode, coachEmail, coachFirstName, coachLastName, coachPassword } = {}) {
  if (!String(teamId     || '').trim()) { const e = new Error('teamId is required');          e.status = 400; throw e; }
  if (!String(teamName   || '').trim()) { const e = new Error('teamName is required');         e.status = 400; throw e; }
  if (!String(teamCode   || '').trim()) { const e = new Error('teamCode is required');         e.status = 400; throw e; }
  if (!EMAIL_RE.test(normalizeEmail(coachEmail))) { const e = new Error('Valid coachEmail is required'); e.status = 400; throw e; }
  if (!String(coachFirstName || '').trim()) { const e = new Error('coachFirstName is required'); e.status = 400; throw e; }
  if (!String(coachLastName  || '').trim()) { const e = new Error('coachLastName is required');  e.status = 400; throw e; }
  if (String(coachPassword || '').length < 8) { const e = new Error('coachPassword must be at least 8 characters'); e.status = 400; throw e; }

  const safeTeamId   = String(teamId).trim();
  const safeTeamName = String(teamName).trim();
  const safeCode     = normalizeTeamCode(teamCode);

  const teams = await loadTeams();
  if (teams.some(t => t.id === safeTeamId)) {
    const e = new Error(`Team '${safeTeamId}' already exists`); e.status = 409; throw e;
  }
  if (teams.some(t => normalizeTeamCode(t.teamCode) === safeCode)) {
    const e = new Error(`Team code '${safeCode}' is already in use`); e.status = 409; throw e;
  }

  const team = { id: safeTeamId, name: safeTeamName, teamCode: safeCode, createdAt: nowIso() };
  teams.push(team);
  await saveTeams(teams);

  const email = normalizeEmail(coachEmail);
  const users = await loadUsers();
  if (users.some(u => normalizeEmail(u.email) === email)) {
    const e = new Error(`Email '${email}' is already registered`); e.status = 409; throw e;
  }
  const coachUser = {
    id: makeId('user'),
    email,
    firstName: String(coachFirstName).trim(),
    lastName:  String(coachLastName).trim(),
    displayName: displayName(coachFirstName, coachLastName),
    authProvider: 'password',
    passwordSet: true,
    ...hashPassword(coachPassword),
    createdAt: nowIso(),
    lastLoginAt: null,
  };
  users.push(coachUser);
  await saveUsers(users);

  const members = await loadTeamMembers();
  const coachMember = {
    id: makeId('tm'),
    teamId: safeTeamId,
    userId: coachUser.id,
    role: 'coach',
    status: 'active',
    joinedAt: nowIso(),
    approvedAt: nowIso(),
    approvedBy: 'provision_club',
    rejectedAt: null,
    rejectedBy: null,
  };
  members.push(coachMember);
  await saveTeamMembers(members);

  return { team, user: publicUser(coachUser), teamMember: coachMember };
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
