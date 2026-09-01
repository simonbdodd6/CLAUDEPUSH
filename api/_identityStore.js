import { kvGet, kvSet, kvSetNX, kvDel, kvScanKeys } from './_kv.js';
import { findInviteByToken, persistInvite, appendClubInvite, loadAllInvites,
         listClubInvites } from './_inviteStore.js';
import {
  permissionsFor, canonicalRole, accessProfileOf, isClubOwner,
  accessProfileRank, ACCESS_PROFILES, PERM,
} from './_permissions.js';
import { normalizeAccessScope, normalizeEligibility, effectiveAccessScope, effectiveEligibility, playerGroupIdOf,
         isPlayingMember, operationalGroupsFor, defaultOperationalGroup } from './_accessScope.js';
import { loadClubStructure, groupById, teamById, activeTeams, activeGroups } from './_structureStore.js';
import { key } from './_keys.js';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const USERS_KEY = key('identity:users');
const TEAMS_KEY = key('identity:teams');
const TEAM_MEMBERS_KEY = key('identity:team_members');
const PLAYER_PROFILES_KEY = key('identity:player_profiles');
const SESSIONS_KEY = key('identity:sessions');
const PASSWORD_RESETS_KEY = key('identity:password_resets');
const EMAIL_VERIFICATIONS_KEY = key('identity:email_verifications');
// Invitations live one-list-per-club in api/_inviteStore.js. The old shared
// list is still read there for links minted before the split.

export const SESSION_COOKIE = 'ce_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_ALGO = 'scrypt';
const SCRYPT_KEY_LENGTH = 64;

/**
 * The actor recorded on records a PLATFORM administrator created, as opposed
 * to anything a club's own staff can mint. Only provisionClub writes it, and
 * only claimInvite reads it — see applyFounderOwnership.
 */
const PLATFORM_PROVISIONING_ACTOR = 'platform-provisioning';

/**
 * The plans a platform administrator may START a club on.
 *
 * These are the EXISTING plan values, unchanged in meaning: 'trial' is the
 * 30-day evaluation that expires into 'core', 'core' is the steady-state
 * base tier, and 'pro' is the paid tier that entitles Performance
 * (PERFORMANCE_ENTITLED_PLANS in api/publish.js). Nothing here alters what a
 * plan grants — it only lets provisioning name one instead of always
 * starting at trial and needing a database edit afterwards.
 *
 * 'enterprise' is deliberately NOT provisionable. It is a real level, but
 * every enterprise-only feature in the registry is still `comingSoon` and no
 * billing path produces one, so starting a customer there would promise a
 * tier the product cannot yet deliver. Its server-side meaning is untouched.
 */
export const PROVISIONABLE_PLANS = ['trial', 'core', 'pro'];
/**
 * How long a trial runs. ONE definition: createClub, provisionClub and
 * changeClubPlan all express the same policy, so a club put onto a trial gets
 * the same 30 days however it got there.
 */
export const TRIAL_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
/** Omitting the plan must behave exactly as provisioning did before. */
export const DEFAULT_PROVISIONED_PLAN = 'trial';

export const DEFAULT_TEAM = {
  id: 'boitsfort-rfc',
  name: 'Boitsfort RFC',
  teamCode: 'BOITSFORT',
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Same runtime signal cookieSecureFlag() uses: Vercel (any environment) or NODE_ENV=production. */
function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

/**
 * DEFAULT_TEAM and the legacy compatibility accounts are development and test
 * scaffolding only.
 *
 * In production they must never be synthesised and never be written back: an
 * empty production store has to stay empty so the first real user onboards a
 * genuine club through the normal create-club flow. Seeding them was what
 * recreated boitsfort-rfc — on every identity read, and on every club creation
 * (createClub persists whatever loadTeams() returned).
 *
 * There is deliberately no environment-variable override. Production cannot
 * re-enable this by configuration.
 */
export function legacySeedEnabled() {
  return !isProductionRuntime();
}

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
  // Production: exactly what is stored. No synthesis, no write-on-read.
  if (!legacySeedEnabled()) return teams;
  if (teams.some(team => team.id === DEFAULT_TEAM.id)) return teams;
  // Dev/test convenience only, and in memory only — never persisted here.
  return [DEFAULT_TEAM, ...teams];
}

/**
 * Persist the tenant list.
 *
 * PRODUCTION GUARD. loadTeams() prepends DEFAULT_TEAM outside a production
 * runtime as a dev convenience, "in memory only". That is true of the deployed
 * runtime but NOT of a script run from a laptop: a local load -> mutate -> save
 * against the production store persisted the placeholder for real, which is how
 * the phantom `boitsfort-rfc` tenant came to exist. It made an unknown team code
 * resolve and offered an anonymous join onto a club with no owner.
 *
 * So the guard is on the WRITE, where the damage happens, and it keys off the
 * DATA rather than the caller: if the stored list does not already contain the
 * placeholder, a save that introduces it is scaffolding leaking toward
 * production and is refused.
 *
 * It THROWS rather than silently dropping the record. A caller that quietly
 * "succeeded" while writing something different from what it passed is how a
 * corruption goes unnoticed; a loud failure is recoverable.
 *
 * Development is unaffected: there, the placeholder is legitimately present in
 * what loadTeams() returned, so writing it back is a no-op re-save.
 */
/**
 * The tenant list EXACTLY as stored — never seeded.
 *
 * loadTeams() prepends DEFAULT_TEAM outside a production runtime as a read-time
 * convenience. That is safe to read and unsafe to write back: a caller that
 * loads, mutates and saves persists the placeholder for real. Every mutating
 * path therefore reads through here, so the convenience can never be committed.
 *
 * THIS is the correct entry point for any load -> mutate -> save, including
 * one-off scripts. loadTeams() is for reads.
 */
export async function loadStoredTeams() {
  const teams = await kvGet(TEAMS_KEY);
  return Array.isArray(teams) ? teams : [];
}

export async function saveTeams(teams) {
  const next = Array.isArray(teams) ? teams : [];
  const introducesPlaceholder = next.some(team => team?.id === DEFAULT_TEAM.id);
  if (introducesPlaceholder) {
    const stored = Array.isArray(await kvGet(TEAMS_KEY)) ? await kvGet(TEAMS_KEY) : [];
    const alreadyStored = stored.some(team => team?.id === DEFAULT_TEAM.id);
    // A store that already holds real tenants but NOT the placeholder is a
    // production-shaped store, whatever the runtime claims. An EMPTY store is a
    // fresh dev/test one, where seeding it is the documented behaviour
    // (createClub persists whatever loadTeams returned) -- so that is allowed.
    const productionShaped = stored.length > 0 && !alreadyStored;
    if (productionShaped) {
      const error = new Error(
        `Refusing to persist the ${DEFAULT_TEAM.id} development placeholder into a store that already ` +
        `holds ${stored.length} real tenant(s) and does not contain it. This almost always means a local ` +
        `script called loadTeams() without a production runtime (set NODE_ENV=production) and is about ` +
        `to save the injected scaffolding back into production.`);
      error.code = 'default_team_write_blocked';
      throw error;
    }
  }
  await kvSet(TEAMS_KEY, next);
}

// Update only billing-relevant fields on a team record.
// Allowlisted so callers cannot accidentally overwrite structural fields
// (id, name, teamCode, createdAt). Used by the Stripe webhook handler.
export async function updateTeamBilling(teamId, fields = {}) {
  const BILLING_FIELDS = new Set(['plan', 'planStatus', 'trialEndsAt', 'stripeCustomerId', 'stripeSubscriptionId']);
  const teams = await loadStoredTeams();
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

// ── WHICH ROSTER ROWS BELONG TO ONE ACCOUNT ───────────────────────────────
// A person can appear on a club roster under more than one identifier: their
// permanent user id, or the invite-derived legacyPlayerId their row was created
// with before they claimed an account. Account deletion has always had to
// answer this ("which rows are this person's?"), and reading one's own record
// asks exactly the same question — so it is asked in ONE place.
//
// Everything here is derived from SERVER-HELD records. A name is never an
// identifier: two players share one, and matching on it would hand one
// person another's record.

/** The invite-derived ids the server itself has recorded against this account. */
export function legacyPlayerIdsForUser(profiles = [], userId = '') {
  const uid = String(userId || '').trim();
  const out = new Set();
  if (!uid) return out;
  (Array.isArray(profiles) ? profiles : []).forEach(profile => {
    if (String(profile?.userId || '') !== uid) return;
    if (profile?.legacyPlayerId) out.add(String(profile.legacyPlayerId));
  });
  return out;
}

/**
 * Does this roster row belong to this account? An empty userId owns NOTHING —
 * without that guard a session-less caller would match every unclaimed row.
 */
export function rosterRowBelongsToUser(row, userId = '', legacyIds = new Set()) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  const legacy = legacyIds instanceof Set ? legacyIds : new Set(legacyIds || []);
  return String(row?.userId || '') === uid ||
    String(row?.id || '') === uid ||
    Boolean(row?.legacyPlayerId && legacy.has(String(row.legacyPlayerId))) ||
    Boolean(row?.id && legacy.has(String(row.id)));
}

// Self-healing repair for the group-invite identity collision. Every player who
// claimed the SAME reusable group invite was assigned legacyPlayerId =
// inv-<groupToken8> — so distinct people shared ONE id, which collides roster
// dedup, DM addressing and alias expansion (a coach DM could route to the wrong
// person; the intended player never gets a conversation). Any legacyPlayerId held
// by 2+ profiles with DIFFERENT userIds is not identifying: reset each such
// profile's legacyPlayerId to its own unique userId. Pure + idempotent; profiles
// with a UNIQUE legacyPlayerId (team-code / personal-invite players like Beta
// Test 4) are left untouched → no regression for working players.
export function healSharedLegacyPlayerIds(profiles = []) {
  const list = Array.isArray(profiles) ? profiles : [];
  const usersByLegacy = new Map(); // legacyPlayerId -> Set(userId)
  for (const p of list) {
    const lid = String(p?.legacyPlayerId || '');
    const uid = String(p?.userId || '');
    if (!lid || !uid) continue;
    if (!usersByLegacy.has(lid)) usersByLegacy.set(lid, new Set());
    usersByLegacy.get(lid).add(uid);
  }
  const shared = new Set([...usersByLegacy.entries()].filter(([, uids]) => uids.size > 1).map(([lid]) => lid));
  let changed = false;
  const healed = list.map(p => {
    const lid = String(p?.legacyPlayerId || '');
    const uid = String(p?.userId || '');
    if (lid && uid && shared.has(lid) && lid !== uid) { changed = true; return { ...p, legacyPlayerId: uid }; }
    return p;
  });
  return { profiles: healed, changed };
}

// Load profiles, repairing shared group-invite legacyPlayerIds and persisting the
// fix once (idempotent). Runs automatically from identity/messaging entry points
// so existing invited players are healed with no manual data fix or coach action.
export async function loadHealedPlayerProfiles() {
  const raw = await loadPlayerProfiles();
  const { profiles, changed } = healSharedLegacyPlayerIds(raw);
  if (changed) await savePlayerProfiles(profiles);
  return profiles;
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

/**
 * Every invitation the platform holds. Genuinely platform-wide callers only —
 * the founder-evidence lookup and the migration. A club-facing read must go
 * through listClubInvites(teamId) so it can only ever see its own.
 */
async function loadInvites() {
  return loadAllInvites();
}

async function ensureLegacyCompatibilityTeamRecords(teamId = DEFAULT_TEAM.id) {
  // Production must never recreate the legacy coach/player scaffolding. This
  // ran on every listIdentityState() call and rebuilt users, memberships and
  // player profiles for boitsfort-rfc after any cleanup.
  if (!legacySeedEnabled()) return;
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
    // Match by id OR email. A real coach account created under its own id with
    // COACH_DEMO_EMAIL must be ADOPTED — not shadowed by a second 'coach-demo'
    // record. Two users sharing an email split login (matches by email) from
    // password change (matches by id) and break auth.
    let user = users.find(item =>
      item.id === account.id || normalizeEmail(item.email) === normalizeEmail(account.email));
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
    // Tie the active staff membership to whichever record we matched, so an
    // adopted same-email account keeps its coach access.
    const uid = user.id;
    let member = members.find(item => item.teamId === teamId && item.userId === uid);
    if (!member) {
      member = {
        id: `tm_${uid}`,
        teamId,
        userId: uid,
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
    } else if (member.role !== account.role || member.status !== 'active') {
      member.role = account.role;
      member.status = 'active';
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
  // passwordChangedAt marks a real, user-established credential. Once set, the
  // legacy/demo env-password fallback will never override this account's password.
  Object.assign(user, hashPassword(password), { passwordSet: true, authProvider: user.authProvider || 'password', passwordChangedAt: nowIso() });
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
    // SECURITY: never overwrite an account's ESTABLISHED password. A password is
    // only set here for an account that has none yet (first credential). Proving
    // ownership of an existing password is enforced in claimInvite before we get
    // here — so an invite claim can never reset a stranger's account password.
    if (password && !user.passwordSet) ensurePassword(user, password);
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
  // THE capacity question (api/_accessScope.js): a person has a player profile
  // because they PLAY — a playerGroupId, or a club role of 'player'. Reading
  // the role name alone denied a profile to a dual-role member, e.g. the club
  // physio who also plays. The invite path already guards on role === 'player'
  // before calling here, so this widens nothing that existed; it lets the
  // player-group assignment path reuse this one profile shape.
  if (!isPlayingMember(teamMember)) return null;
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
      // A GROUP invite is one reusable link claimed by MANY players, so deriving the
      // legacyPlayerId from its shared token gives every claimer the SAME id — which
      // collides their identity (roster dedup, DM addressing, alias expansion) and can
      // route a coach DM to the wrong person. Only a PERSONAL invite's token is unique
      // per player; for group invites (and team-code joins) use the unique user.id.
      legacyPlayerId: (invite?.token && invite?.kind !== 'group') ? `inv-${String(invite.token).slice(-8)}` : user.id,
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
  // Once a staff account has set its OWN password, the bootstrap/demo password
  // must NEVER override it. Submitting the original env password on a changed
  // account previously silently RESET the hash back to the env value — wiping the
  // coach's new password ("worked once, then both stop"). Bail so login simply
  // re-verifies against the stored hash and correctly rejects the old password.
  // Recovery for a genuinely locked-out coach is admin_reset_coach (CRON-gated).
  if (user && user.passwordChangedAt) return null;
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
    // Account never set its own password (env seed or corrupted credential
    // drift) — safe to (re)apply the bootstrap password so a known-good
    // credential still recovers the account.
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

/**
 * D1b — the OPERATIONAL CONTEXT the client should adopt.
 *
 * The server owns the rules, so the browser never re-derives them and can never
 * disagree with what the API will actually authorise. Both capacities are
 * published because a dual-role member needs both: `player` is where they play
 * (playerGroupId), `staff` is where they administer (accessScope). Switching
 * view swaps which one is in force — it does not merge them.
 *
 * `defaultGroupId` is filled only when the choice is unambiguous. With several
 * accessible groups it is null and `mustChoose` is true, so the UI asks rather
 * than the client guessing.
 */
async function operationalContextFor(member) {
  const clubId = member?.teamId;
  if (!clubId) return { player: null, staff: null };
  const structure = await loadClubStructure(clubId);
  const shape = as => {
    const { group, groups, mustChoose } = defaultOperationalGroup(member, structure, { as });
    return {
      // developmentCategory travels with the group so the client can apply
      // age-appropriate rules without a second admin fetch. It is a
      // classification, not personal data — no athlete information is exposed.
      groups: groups.map(g => ({ id: g.id, name: g.name, developmentCategory: g.developmentCategory || 'unknown' })),
      defaultGroupId: group ? group.id : null,
      mustChoose,
    };
  };
  return { player: shape('player'), staff: shape('staff') };
}

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
  return { ...result, permissions: [...permissionsFor(member)], memberships,
           operational: await operationalContextFor(member) };
}

export async function loginUser(input = {}) {
  assertLoginInput(input);
  let users = await loadUsers();
  const email = normalizeEmail(input.email);
  // Among any records sharing this email (e.g. a real account plus a legacy
  // 'coach-demo' shadow left by older data), prefer the one whose password
  // verifies — so a password change written to one record is honoured at login
  // even before the duplicates are reconciled.
  let sameEmail = users.filter(item => normalizeEmail(item.email) === email);
  let user = sameEmail.find(item => verifyPassword(input.password, item).ok) || sameEmail[0] || null;
  let legacyMember = null;
  if (!user) {
    const legacy = await ensureLegacyStaffAccountForLogin(email, input.password);
    user = legacy?.user || null;
    legacyMember = legacy?.member || null;
    users = await loadUsers();
    sameEmail = users.filter(item => normalizeEmail(item.email) === email);
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
  // membership in any team. Same-email duplicates are the same person, so an
  // active membership held by any sibling record still grants access (heals
  // older data where the membership and the changed password split apart).
  const memberIds = new Set(sameEmail.map(item => item.id).concat(user.id));
  const member = legacyMember ||
    members.find(item => memberIds.has(item.userId) && item.teamId === (input.teamId || DEFAULT_TEAM.id) && item.status === 'active') ||
    members.find(item => memberIds.has(item.userId) && item.status === 'active') ||
    // No active membership — surface the requested-team membership of any status
    // so a pending player still gets "Waiting for coach approval", not a generic error.
    members.find(item => memberIds.has(item.userId) && item.teamId === (input.teamId || DEFAULT_TEAM.id));
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
  // A claim carries only a token, so the store resolves which club owns it —
  // the invitation's OWN teamId, never anything the claimer supplied.
  const located = await findInviteByToken(token);
  const invite = located?.invite || null;
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
  // SECURITY: a single-use invite that has been accepted cannot be re-claimed.
  // The previous `!input.allowExisting` escape hatch trusted the request body, so
  // a leaked/observed token could be replayed — dropped. Group links stay reusable.
  if (invite.status === 'accepted' && !isGroup) {
    const error = new Error('This invite has already been claimed');
    error.status = 409;
    throw error;
  }
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
    invite.status = 'expired';
    await persistInvite(located);
    const error = new Error('This invite link has expired');
    error.status = 410;
    throw error;
  }
  // GUARD — a PLAYER invite that names no player group cannot be claimed once
  // the club holds SEVERAL active groups: the claim would mint a member who
  // resolves to NO group and silently vanishes from every squad surface. With
  // exactly one active group the legacy behaviour stands — the sole group is
  // unambiguous. Runs BEFORE any account/membership write and never consumes
  // the invite. Staff invites (coach/admin/medical) are deliberately
  // untouched: their null scope derives safe Seniors-only access instead.
  if (String(invite.role || 'player') === 'player' && !String(invite.playerGroupId || '').trim()) {
    const structure = await loadClubStructure(invite.teamId || DEFAULT_TEAM.id);
    if (activeGroups(structure).length > 1) {
      const error = new Error('This player invite is no longer valid for this club. Ask your coach for a new team invite.');
      error.status = 410;
      throw error;
    }
  }
  const email = normalizeEmail(input.email || invite.email);
  if (!EMAIL_RE.test(email)) throw new Error('Valid email is required');
  assertPassword(input.password);
  // SECURITY (account-takeover guard): if an account already exists for this email
  // AND it has an established password, the claimer must PROVE ownership by
  // supplying the current password. An invite link must never let a bearer reset
  // or hijack a pre-existing account. New emails fall through and create a fresh
  // account as before; legitimate existing owners (e.g. a player upgrading via the
  // reusable coach link) pass here with their real password, and the password is
  // never overwritten (see upsertUserAccount).
  const existingUser = (await loadUsers()).find(u => normalizeEmail(u.email) === email);
  if (existingUser && existingUser.passwordSet) {
    if (!verifyPassword(input.password, existingUser).ok) {
      const error = new Error('An account already exists for this email. Please log in to accept this invite.');
      error.status = 403;
      throw error;
    }
  }
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
  // The membership as it stood BEFORE this claim. `membershipExisted` decides
  // how a scoped invite merges (see applyInviteScope); `priorEligibility` is
  // captured here because ensureTeamMember may change the role below, and a
  // dual-role member's squad eligibility must survive that change (Phase C.1).
  const priorMember = (await loadTeamMembers())
    .find(m => m.teamId === (invite.teamId || DEFAULT_TEAM.id) && m.userId === user.id) || null;
  const membershipExisted = Boolean(priorMember);
  const priorEligibility = priorMember
    ? effectiveEligibility(priorMember)
    : { teamIds: [], primaryTeamId: null };
  const inviteRole = String(invite.role || 'player');
  const inviteIsStaff = ['coach', 'admin', 'medical'].includes(inviteRole);
  const member = await ensureTeamMember({
    teamId: invite.teamId || DEFAULT_TEAM.id,
    userId: user.id,
    role: invite.role || 'player',
    status: 'active',
    approvedBy: 'invite',
    // Staff invites (coach/admin/medical) FORCE the role, so a person who already
    // has a membership — e.g. previously joined as a player — is UPGRADED to staff
    // rather than keeping their old role. (ensureTeamMember otherwise keeps the
    // existing role, which left reusable-coach-link claimers stuck as players.)
    // Player invites never force, so a coach who opens a player link is not downgraded.
    forceRole: inviteIsStaff,
    staffLevel: STAFF_LEVELS.includes(invite.staffLevel) ? invite.staffLevel : null,
  });
  let profile = null;
  if (member.role === 'player') {
    profile = await ensurePlayerProfile({
      teamMember: member, user, invite,
      position: String(input.position || '').trim(),
      phone: String(input.phone || input.mobile || '').trim(),
    });
  } else {
    // RC4.7 Phase C.1 — DUAL-ROLE MEMBER INTEGRITY.
    //
    // This branch previously HARD-DELETED the claimer's player profile so staff
    // "never sit in the roster". For a genuine dual-role member — a player who
    // also becomes a coach, medic or admin — that destroyed real data: the
    // profile row carries legacyPlayerId, the key that links their availability
    // history, and it cannot be reconstructed.
    //
    // A person is now one identity with one membership that may hold BOTH a
    // player profile and staff access. Claiming a staff invite therefore
    // preserves whatever player state already exists, and creates none where
    // there was none (a brand-new staff-only invitee still gets no profile).
    profile = await preserveDualRolePlayerState(member, user, priorEligibility);
  }
  // RC4.7 Phase C — a SCOPED invite stamps exactly the scope it was created
  // with; the claimer can never widen it (nothing in the request is read).
  // Existing members MERGE the new grant into their scope — claiming a scoped
  // link never removes access they already hold, and never elevates beyond
  // the stored scope. Unscoped legacy invites change nothing here.
  if (invite.scope && typeof invite.scope === 'object') {
    // Whether the PRIOR membership was staff decides the merge base inside
    // applyInviteScope: an existing coach keeps (and may materialise) what
    // they already held; an existing PLAYER held no coaching authority, so
    // their upgrade starts from nothing but the invite's grant — the legacy
    // scope derivation must never silently hand them the initial group.
    const priorWasStaff = Boolean(priorMember) && priorMember.role !== 'player';
    // The INVITE's role decides what its scope may grant: a STAFF invite's
    // scope becomes coaching accessScope; a PLAYER link's scope is the link's
    // dedupe identity and drives ELIGIBILITY only — it must never stamp
    // coaching access on anyone (not on the claiming player, and not on a
    // coach who happens to open a player link).
    await applyInviteScope(member, invite, { membershipExisted, priorWasStaff, staffInvite: inviteIsStaff });
  }
  // D1a — a player invite stamps WHERE THEY PLAY, independently of staff scope.
  if (invite.playerGroupId) {
    await applyInvitePlayerGroup(member, String(invite.playerGroupId));
  }
  // A platform-provisioned club's first administrator IS its owner. No-op for
  // every ordinary invite.
  await applyFounderOwnership(member, invite);
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
  await persistInvite(located);
  const session = await createSession({ userId: user.id, teamId: member.teamId, role: member.role });
  return { user: publicUserWithRole(user, member), teamMember: member, playerProfile: profile, invite, session };
}

/**
 * RC4.7 Phase C.1 — keep an existing player's state intact when they claim a
 * staff invitation.
 *
 * Returns their existing player profile (so the claim response still reports
 * it) or null when there is none. Nothing is created here: a staff-only
 * invitee has no profile and gains none.
 *
 * The membership's role has just changed to a staff role. Any eligibility they
 * held AS a player was, before this fix, derived from that role — so it is
 * materialised onto the record now, making it explicit and immune to the role
 * change. Eligibility already stored explicitly is left exactly as it is.
 */
async function preserveDualRolePlayerState(member, user, priorEligibility) {
  const profiles = await loadPlayerProfiles();
  const existing = profiles.find(p => p.teamMemberId === member.id ||
    (String(p.teamId) === String(member.teamId) && String(p.userId) === String(user.id))) || null;
  if (!existing) return null;

  // D1a — with an explicit player group the group derivation is authoritative,
  // so nothing needs materialising. Doing so stamped the legacy team_initial id,
  // which is not part of the club structure and narrowed eligibility to nothing.
  if (playerGroupIdOf(member)) return existing;

  if (member.playerEligibility === undefined || member.playerEligibility === null) {
    const teamIds = Array.isArray(priorEligibility?.teamIds) ? priorEligibility.teamIds : [];
    if (teamIds.length) {
      const members = await loadTeamMembers();
      const live = members.find(m => m.id === member.id);
      if (live && (live.playerEligibility === undefined || live.playerEligibility === null)) {
        live.playerEligibility = normalizeEligibility(priorEligibility);
        await saveTeamMembers(members);
        Object.assign(member, live);
      }
    }
  }
  return existing;
}

/**
 * RC4.7 D1a — stamp the invite's player group onto the membership.
 *
 * A member who ALREADY plays for a different group is never moved silently:
 * that is a transfer, and it needs a deliberate admin action rather than a
 * link claim. Their existing group, profile and eligibility are left intact.
 */
async function applyInvitePlayerGroup(member, groupId) {
  const members = await loadTeamMembers();
  const live = members.find(m => m.id === member.id);
  if (!live) return;
  const structure = await loadClubStructure(live.teamId);
  const group = groupById(structure, groupId);
  if (!group || group.status !== 'active') return;      // unknown/archived: grant nothing

  const current = String(live.playerGroupId || '').trim();
  if (current && current !== group.id) {
    // Conflicting claim — keep the existing group untouched and record it.
    live.playerGroupConflictAt = nowIso();
    live.playerGroupConflictWith = group.id;
    await saveTeamMembers(members);
    Object.assign(member, live);
    return;
  }
  if (current === group.id) return;                     // already correct
  live.playerGroupId = group.id;
  live.accessChangedBy = 'invite';
  live.accessChangedAt = nowIso();
  await saveTeamMembers(members);
  Object.assign(member, live);
}

/**
 * A platform-provisioned club's FIRST administrator becomes its owner.
 *
 * A self-service founder is stamped `isOwner` + `accessProfile: 'full'` by
 * createClub, so every owner protection (an owner cannot be downgraded,
 * removed or deleted) applies to them from the first request. A provisioned
 * club had no such member: its founder arrived through an ordinary invite
 * claim and read as a plain head coach, leaving the club with NO owner and
 * those protections covering nobody.
 *
 * The grant is deliberately narrow, and every condition is server-side:
 *   · the invite must carry the server-authored founder marker — /api/invite
 *     builds its own record and never copies these fields, so no coach or
 *     admin can mint a founder invite;
 *   · the club must not already have an active owner, so a stale founder
 *     invite can never mint a second owner beside the real one;
 *   · the claimer must be active staff in THAT club (the membership is
 *     resolved from the invite's own teamId), so ownership cannot cross clubs.
 * Anything else — every ordinary coach, admin, medical and player invite —
 * returns without touching the membership.
 */
function isFounderInvite(invite = {}) {
  return invite?.founderInvite === true &&
    String(invite?.createdBy || '') === PLATFORM_PROVISIONING_ACTOR;
}

async function applyFounderOwnership(member, invite) {
  if (!isFounderInvite(invite)) return;
  const members = await loadTeamMembers();
  const live = members.find(m => m.id === member.id);
  if (!live || live.status !== 'active') return;
  // Ownership is a STAFF fact. The provisioning invite is always head coach,
  // so this only ever fails closed on a malformed record.
  if (live.role === 'player') return;
  const ownerExists = members.some(m =>
    String(m.teamId) === String(live.teamId) && m.status === 'active' &&
    m.id !== live.id && isClubOwner(m));
  if (ownerExists) return;
  if (live.isOwner === true && accessProfileOf(live) === 'full') return;
  live.isOwner = true;
  live.accessProfile = 'full';
  live.accessChangedBy = PLATFORM_PROVISIONING_ACTOR;
  live.accessChangedAt = nowIso();
  await saveTeamMembers(members);
  Object.assign(member, live);
}

/**
 * Stamp a scoped invite's grant onto the freshly-claimed membership.
 * clubWide only when the invite itself was created club-wide (creation-side
 * gates guarantee only club-wide admins can mint those). Players invited to a
 * team become eligible for that team; players invited to a group default to
 * eligibility for the group's active teams at claim time (an admin can trim
 * afterwards — documented Phase C behaviour).
 */
async function applyInviteScope(member, invite, { membershipExisted = false, priorWasStaff = false, staffInvite = false } = {}) {
  const scope = invite.scope || {};
  const members = await loadTeamMembers();
  const live = members.find(m => m.id === member.id);
  if (!live) return;

  // Merge base: an EXISTING STAFF member keeps everything they already hold —
  // a scoped claim never reduces access, and the legacy derivation (null
  // scope → the initial group) is materialised for them because it described
  // real coaching access they were exercising. A member who was a PLAYER had
  // no coaching authority to keep — their upgrade starts from NOTHING but the
  // invite's grant. That includes a player-era STORED scope: scoped player
  // links stamp accessScope for link identity, and letting it seed the staff
  // merge quietly granted a freshly-upgraded coach their PLAYING group's
  // staff access on top of what the invite actually named (a Seniors player
  // claiming a U18 coach invite came out coaching Seniors AND U18). A
  // BRAND-NEW membership starts from nothing likewise.
  const current = (membershipExisted && priorWasStaff)
    ? effectiveAccessScope(live)
    : { clubWide: false, groups: [], teams: [] };
  const freshMember = !membershipExisted;
  const structure = await loadClubStructure(live.teamId);
  let changed = false;

  if (scope.clubWide === true) {
    if (staffInvite && !current.clubWide) { live.accessScope = { clubWide: true, groups: [], teams: [] }; changed = true; }
  } else if (scope.teamId) {
    const team = teamById(structure, scope.teamId);
    if (staffInvite && team && team.status === 'active' && !current.teams.some(t => t.teamId === team.id && t.status === 'active')) {
      current.teams = [...current.teams.filter(t => t.teamId !== team.id), { teamId: team.id, role: null, status: 'active' }];
      live.accessScope = normalizeAccessScope(current);
      changed = true;
    }
    if (team && live.role === 'player') {
      // Same base rule as access: a fresh member's eligibility starts empty,
      // never at the legacy derivation (team_initial).
      const elig = (freshMember && live.playerEligibility == null)
        ? { teamIds: [], primaryTeamId: null }
        : effectiveEligibility(live);
      if (!elig.teamIds.includes(team.id)) {
        live.playerEligibility = normalizeEligibility({
          teamIds: [...elig.teamIds, team.id],
          primaryTeamId: elig.primaryTeamId || team.id,
        });
        changed = true;
      }
    }
  } else if (Array.isArray(scope.groupIds) && scope.groupIds.length) {
    // Multi-group coaching grant: merge EVERY named group into the member's
    // scope, exactly as a sequence of single-group claims would — additive
    // only, never touching playerGroupId, eligibility or existing access.
    if (staffInvite) {
      for (const gid of scope.groupIds) {
        const group = groupById(structure, gid);
        if (!group || group.status !== 'active' || current.clubWide) continue;
        if (!current.groups.some(g => g.groupId === group.id && g.status === 'active')) {
          current.groups = [...current.groups.filter(g => g.groupId !== group.id), { groupId: group.id, role: null, status: 'active' }];
          changed = true;
        }
      }
      if (changed) live.accessScope = normalizeAccessScope(current);
    }
  } else if (scope.groupId) {
    const group = groupById(structure, scope.groupId);
    if (staffInvite && group && group.status === 'active' && !current.clubWide &&
        !current.groups.some(g => g.groupId === group.id && g.status === 'active')) {
      current.groups = [...current.groups.filter(g => g.groupId !== group.id), { groupId: group.id, role: null, status: 'active' }];
      live.accessScope = normalizeAccessScope(current);
      changed = true;
    }
    if (group && live.role === 'player' && (live.playerEligibility === undefined || live.playerEligibility === null)) {
      const teams = activeTeams(structure, group.id).map(t => t.id);
      live.playerEligibility = normalizeEligibility({ teamIds: teams, primaryTeamId: teams[0] || null });
      changed = true;
    }
  }

  if (changed) {
    live.accessChangedBy = 'invite';
    live.accessChangedAt = nowIso();
    await saveTeamMembers(members);
    Object.assign(member, live);
  }
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
  // READ through loadTeams: the session payload needs every team this user can
  // reach, including the development placeholder in a dev runtime.
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
      // WRITE against the STORED list. Persisting `teams` would commit the
      // read-time placeholder alongside the downgrade; a team that exists only
      // as a dev convenience has nothing real to downgrade, so it is skipped.
      const stored = await loadStoredTeams();
      const idx = stored.findIndex(t => t.id === session.teamId);
      if (idx >= 0) {
        stored[idx] = { ...stored[idx], plan: 'core', planStatus: 'active' };
        await saveTeams(stored);
      }
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
  // Self-service founder still unverified → the session carries the notice
  // (grace deadline) so the client can show the reminder and the resend CTA.
  // Present only for the founding owner of a self-service club; disappears
  // automatically on the first session read after verification.
  let selfServiceVerification;
  if (member?.isOwner && currentTeam?.signupSource === 'self_service' && !user.emailVerified) {
    const graceEndsAt = new Date(new Date(currentTeam.createdAt || 0).getTime() + SELF_SERVICE_VERIFY_GRACE_MS).toISOString();
    selfServiceVerification = { graceEndsAt, inGrace: Date.now() < new Date(graceEndsAt).getTime() };
  }

  return {
    session,
    user: publicUserWithRole(user, member || session),
    teamMember: member,
    playerProfile: profile,
    permissions: [...permissionsFor(member)],
    memberships,
    operational: await operationalContextFor(member),
    teamPlan,
    teamPlanStatus,
    trialEndsAt: teamTrialEndsAt,
    ...(selfServiceVerification ? { selfServiceVerification } : {}),
  };
}

export async function resolveSessionFromRequest(req) {
  const token = sessionTokenFromRequest(req);
  if (!token) return null;
  return resolveSession(token);
}

// ─── Self-service founder verification policy ───────────────────────────────
// A club born through the self-service wizard (team.signupSource) must have
// its FOUNDING OWNER verify their email: 48 hours of grace from club
// creation, then NEW invite creation is refused until verified. The state is
// a CLUB fact keyed to the founder — a second (verified) admin can never
// bypass an unverified founder, because the check never looks at the caller.
// Everything else (login, fixtures, training, availability, MC, medical,
// messaging, administration) is deliberately untouched by this policy.
export const SELF_SERVICE_VERIFY_GRACE_MS = 48 * 60 * 60 * 1000;

export async function clubInviteVerificationState(teamId, preloaded = {}) {
  const teams = preloaded.teams || await loadTeams();
  const team = teams.find(t => String(t.id) === String(teamId || ''));
  if (!team || team.signupSource !== 'self_service') return { policied: false, allowed: true };
  const members = preloaded.members || await loadTeamMembers();
  const users = preloaded.users || await loadUsers();
  // The founding owner: the earliest-joined owner membership of this club.
  // (Ownership transfer does not exist yet; when it does, this resolution is
  // the single place to teach about it.)
  const owners = members
    .filter(m => String(m.teamId) === String(team.id) && m.isOwner && m.status === 'active')
    .sort((a, b) => String(a.joinedAt || '').localeCompare(String(b.joinedAt || '')));
  const founderUser = owners.length ? users.find(u => u.id === owners[0].userId) : null;
  const graceEndsAt = new Date(new Date(team.createdAt || 0).getTime() + SELF_SERVICE_VERIFY_GRACE_MS).toISOString();
  // No resolvable founder (edge: founder removed before transfer exists) —
  // fail OPEN for the club's daily running but keep the fact visible.
  if (!founderUser) return { policied: true, verified: false, founderMissing: true, graceEndsAt, allowed: true };
  const verified = Boolean(founderUser.emailVerified);
  const inGrace = Date.now() < new Date(graceEndsAt).getTime();
  return { policied: true, verified, graceEndsAt, inGrace, founderUserId: founderUser.id, allowed: verified || inGrace };
}

export function emailVerificationRequiredError() {
  const error = new Error('Verify your email address to create new invite links');
  error.status = 403;
  error.code = 'email_verification_required';
  return error;
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

// ── Club-name uniqueness — ONE policy for every creation path ──────────────
// Logical duplicates (case/whitespace-insensitive) are refused; near-but-
// different names ("Mons RFC" vs "Mons Rugby") pass. `exceptTeamId` lets an
// idempotent signup RETRY see its own already-created team without tripping
// over its own name.
function normalizeClubName(name = '') {
  return String(name).trim().replace(/\s+/g, ' ').toLowerCase();
}
function clubNameTaken(teams, clubName, exceptTeamId = null) {
  const wanted = normalizeClubName(clubName);
  return teams.some(t => normalizeClubName(t.name) === wanted && String(t.id) !== String(exceptTeamId || ''));
}
function clubNameTakenError() {
  const error = new Error('A club with that name already exists');
  error.status = 409;
  error.code = 'club_name_taken';
  return error;
}

// ── Signup idempotency records ─────────────────────────────────────────────
// One record per client-generated signup key, claimed ATOMICALLY (SET NX) so
// two concurrent submissions of the same attempt agree on ONE set of
// server-generated ids. The record stores identity BINDINGS only (normalized
// email + club name + the reserved ids) — never password material. A long
// TTL lets a network-failed signup resume days later, then self-cleans.
const SIGNUP_KEY_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SIGNUP_RECORD_TTL_S = 30 * 24 * 60 * 60;
const signupRecordKey = k => key(`signup:${k}`);

export async function createClub({ clubName, teamName, sport, name, email, password, idempotencyKey } = {}) {
  const club = String(clubName || '').trim().slice(0, 80);
  if (!club) throw new Error('Club name is required');
  const coachName = String(name || '').trim().slice(0, 80);
  if (!coachName) throw new Error('Your name is required');
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) throw new Error('Valid email is required');
  assertPassword(password);

  // ── Idempotency: claim or resume this signup attempt ─────────────────────
  // The record reserves every server-generated id BEFORE any entity write,
  // so a retry after ANY partial failure deterministically completes the
  // same club instead of duplicating it or wedging on its own leftovers.
  // The key names an ATTEMPT, never a tenant: teamId stays server-made.
  let record = null;
  if (idempotencyKey !== undefined && idempotencyKey !== null && idempotencyKey !== '') {
    const idem = String(idempotencyKey);
    if (!SIGNUP_KEY_RE.test(idem)) {
      const error = new Error('Invalid signup reference');
      error.status = 400;
      throw error;
    }
    record = await kvGet(signupRecordKey(idem));
    if (!record) {
      const teamsNow = await loadStoredTeams();
      let newTeamId = teamSlug(club);
      while (teamsNow.some(t => t.id === newTeamId)) {
        newTeamId = `${teamSlug(club)}-${randomBytes(2).toString('hex')}`;
      }
      const candidate = {
        emailNorm: normalized,
        clubNorm: normalizeClubName(club),
        teamId: newTeamId,
        userId: makeId('user'),
        memberId: makeId('tm'),
        teamCode: (club.replace(/[^a-zA-Z]/g, '').slice(0, 6).toUpperCase() || 'CLUB') +
          String(Math.floor(Math.random() * 90) + 10),
        createdAt: nowIso(),
        status: 'pending',
      };
      const claimed = await kvSetNX(signupRecordKey(idem), candidate, SIGNUP_RECORD_TTL_S);
      // Lost a concurrent race → the winner's ids stand; adopt them below.
      record = claimed ? candidate : await kvGet(signupRecordKey(idem));
      if (!record) record = candidate; // NX raced with an expiry — ours is as good
    }
    // A key binds to ONE logical signup. Reusing it with a different email
    // or club is a conflict, and it can never read out another signup.
    if (record.emailNorm !== normalized || record.clubNorm !== normalizeClubName(club)) {
      const error = new Error('This signup reference was already used for a different signup');
      error.status = 409;
      error.code = 'signup_conflict';
      throw error;
    }
  }

  // Server-generated identifiers — from the claimed record when resuming,
  // fresh otherwise. NOTHING here is accepted from the client.
  const ids = record || {
    teamId: null, // resolved against the live team list below
    userId: makeId('user'),
    memberId: makeId('tm'),
    teamCode: (club.replace(/[^a-zA-Z]/g, '').slice(0, 6).toUpperCase() || 'CLUB') +
      String(Math.floor(Math.random() * 90) + 10),
    createdAt: nowIso(),
  };

  // ── PRE-FLIGHT: refuse a taken club name BEFORE creating anything ───────
  // Checked again at team-write time (races), but it must ALSO fail here:
  // creating the user first and then refusing the name would burn the email
  // — the person could never start a fresh signup under a free name.
  {
    const teamsNow = await loadStoredTeams();
    const ours = ids.teamId ? teamsNow.find(t => t.id === ids.teamId) : null;
    if (!ours && clubNameTaken(teamsNow, club, ids.teamId)) throw clubNameTakenError();
  }

  // ── Ensure USER (first: an abandoned half-signup still owns a login) ────
  const users = await loadUsers();
  let user = users.find(item => item.id === ids.userId) || null;
  if (!user) {
    const existing = users.find(item => normalizeEmail(item.email) === normalized);
    if (existing) {
      // Genuinely pre-existing account (not created by THIS signup attempt).
      const error = new Error('An account with that email already exists — log in instead');
      error.status = 409;
      error.code = 'account_exists';
      throw error;
    }
    const parts = splitDisplayName(coachName);
    user = {
      id: ids.userId,
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
  } else if (!verifyPassword(password, user).ok) {
    // OUR half-created account, but a different password on the retry: this
    // is a conflicting reuse of the key, never a silent credential swap.
    const error = new Error('This signup was already started with a different password');
    error.status = 409;
    error.code = 'signup_conflict';
    throw error;
  }

  // ── Ensure TEAM ─────────────────────────────────────────────────────────
  const teams = await loadStoredTeams();
  let team = ids.teamId ? teams.find(t => t.id === ids.teamId) || null : null;
  if (!team) {
    if (clubNameTaken(teams, club, ids.teamId)) throw clubNameTakenError();
    let teamId = ids.teamId;
    if (!teamId) {
      teamId = teamSlug(club);
      while (teams.some(t => t.id === teamId)) {
        teamId = `${teamSlug(club)}-${randomBytes(2).toString('hex')}`;
      }
      ids.teamId = teamId;
    }
    team = {
      id: teamId,
      name: club,
      teamName: String(teamName || '').trim().slice(0, 80),
      sport: String(sport || 'Rugby').trim().slice(0, 40) || 'Rugby',
      teamCode: ids.teamCode,
      createdAt: ids.createdAt,
      // SERVER-AUTHORED marker: this tenant was born through the self-service
      // wizard, so the founder-verification policy applies to it. Never read
      // from the request body; clubs created any other way (provisioning,
      // legacy) lack the field and are exempt — no migration, no retroactive
      // enforcement.
      signupSource: 'self_service',
      plan: 'trial',
      planStatus: 'active',
      trialEndsAt: new Date(new Date(ids.createdAt).getTime() + TRIAL_PERIOD_MS).toISOString(),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    };
    teams.push(team);
    await saveTeams(teams);
  }

  // ── Ensure OWNER MEMBERSHIP ─────────────────────────────────────────────
  const members = await loadTeamMembers();
  let member = members.find(m => m.id === ids.memberId ||
    (String(m.teamId) === String(team.id) && String(m.userId) === String(user.id))) || null;
  if (!member) {
    member = {
      id: ids.memberId,
      teamId: team.id,
      userId: user.id,
      role: 'coach',
      staffLevel: 'head',
      // The founder owns the club and holds Full Access from the outset.
      isOwner: true,
      accessProfile: 'full',
      status: 'active',
      joinedAt: nowIso(),
      approvedAt: nowIso(),
      approvedBy: 'club-creation',
      rejectedAt: null,
      rejectedBy: null,
    };
    members.push(member);
    await saveTeamMembers(members);
  }

  const resumed = Boolean(record && record.status === 'complete');
  if (record && record.status !== 'complete') {
    await kvSet(signupRecordKey(String(idempotencyKey)), { ...record, teamId: team.id, status: 'complete' }, SIGNUP_RECORD_TTL_S);
  }

  const session = await createSession({ userId: user.id, teamId: team.id, role: 'coach' });
  const result = await withIdentityComputed({ user: publicUserWithRole(user, member), team, teamMember: member, session }, member);
  if (resumed) result.resumed = true;
  return result;
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

// ─── PLATFORM PROVISIONING ──────────────────────────────────────────────────
// Platform authority is a USER-record fact (user.platformRole), never derived
// from any club membership, client field or email string. No profile grants
// it and no claim path can set it — it exists only where explicitly written.
export function isPlatformAdmin(user) {
  return String(user?.platformRole || '') === 'platform_admin';
}

export const PLATFORM_ADMIN_ROLE = 'platform_admin';

/**
 * Who currently holds platform authority.
 *
 * There is no separate platform-admin store to keep in step: the USER RECORD
 * is the canonical representation, so this is a projection of it and can
 * never disagree with isPlatformAdmin(). Only the small identifying fields
 * an administrator needs to recognise a colleague travel — never password
 * material, never tokens, never club data.
 */
export async function listPlatformAdmins() {
  const users = await loadUsers();
  return users.filter(isPlatformAdmin).map(u => ({
    id: u.id,
    email: u.email || '',
    displayName: u.displayName || u.firstName || '',
    grantedAt: u.platformRoleGrantedAt || null,
    grantedBy: u.platformRoleGrantedBy || null,
  }));
}

/**
 * Grant platform administration to an EXISTING identity.
 *
 * Platform authority is deliberately not an invitation, a membership or a
 * club role: it is one field on one user record, so a grant here creates no
 * club, no membership, no ownership and no access to anybody's data. The
 * person keeps exactly the clubs they already had.
 *
 * The target must already have an account. This module never mints
 * credentials, and inventing a shell account from an email address would be
 * a second identity system — so an unknown address is refused with an
 * instruction rather than silently creating something to attach the role to.
 *
 * Idempotent: granting to someone who already holds it writes nothing and
 * reports that it was already in place.
 */
export async function grantPlatformAdmin({ email, actorUserId } = {}) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) {
    const e = new Error('A valid email address is required'); e.status = 400; throw e;
  }
  const users = await loadUsers();
  const user = users.find(u => normalizeEmail(u.email) === normalized);
  if (!user) {
    const e = new Error('No CoachEasier account uses that email address — ask them to sign in once, then grant access');
    e.status = 404; e.code = 'account_not_found'; throw e;
  }
  if (isPlatformAdmin(user)) {
    return { user: publicUser(user), alreadyGranted: true };
  }
  user.platformRole = PLATFORM_ADMIN_ROLE;
  user.platformRoleGrantedAt = nowIso();
  user.platformRoleGrantedBy = String(actorUserId || '');
  delete user.platformRoleRevokedAt;
  delete user.platformRoleRevokedBy;
  await saveUsers(users);
  return { user: publicUser(user), alreadyGranted: false };
}

/**
 * Remove platform administration from an identity.
 *
 * THE LAST ADMINISTRATOR IS PROTECTED, on the server. A platform with nobody
 * able to provision a club — or to grant the role back — could only be
 * recovered by editing the database by hand, which is exactly the situation
 * this whole capability exists to end. The count is taken from the stored
 * records at the moment of the write, so two concurrent revocations cannot
 * race the platform down to zero.
 *
 * Revoking touches ONLY the platform field. Memberships, ownership, club
 * plans and the account itself are left exactly as they are: the person stops
 * being a platform administrator and stays whoever they were at their club.
 */
export async function revokePlatformAdmin({ userId, actorUserId } = {}) {
  const targetId = String(userId || '').trim();
  if (!targetId) { const e = new Error('A platform administrator is required'); e.status = 400; throw e; }
  const users = await loadUsers();
  const user = users.find(u => String(u.id) === targetId);
  if (!user || !isPlatformAdmin(user)) {
    const e = new Error('That person is not a platform administrator'); e.status = 404; throw e;
  }
  if (users.filter(isPlatformAdmin).length <= 1) {
    const e = new Error('The last platform administrator cannot be removed — grant it to someone else first');
    e.status = 400; e.code = 'last_platform_admin'; throw e;
  }
  delete user.platformRole;
  user.platformRoleRevokedAt = nowIso();
  user.platformRoleRevokedBy = String(actorUserId || '');
  await saveUsers(users);
  return { user: publicUser(user) };
}

/**
 * The clubs a platform administrator may administer the PLAN of.
 *
 * Deliberately the narrowest projection that still lets someone identify the
 * right club: its name, its commercial state and when it was created. No
 * member, player, medical, availability, message, fixture or Performance
 * data is reachable through this surface — administering a club's plan is not
 * membership of it, and this listing is where that line is drawn.
 *
 * Reads the STORED tenants, so the dev-only placeholder team that loadTeams()
 * prepends outside production never appears as an administrable club.
 */
export async function listPlatformClubs() {
  const teams = await loadStoredTeams();
  return teams.map(t => ({
    id: t.id,
    name: t.name || t.id,
    plan: String(t.plan || DEFAULT_PROVISIONED_PLAN),
    planStatus: String(t.planStatus || 'active'),
    trialEndsAt: t.trialEndsAt || null,
    createdAt: t.createdAt || null,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Change an EXISTING club's plan — the last operation that still required
 * editing the database by hand.
 *
 * Same plan vocabulary as provisioning (PROVISIONABLE_PLANS), validated the
 * same way and BEFORE anything is written, so a bad value leaves no partial
 * state. What a plan MEANS is untouched: entitlement is read elsewhere, from
 * this same field, and simply observes the new value.
 *
 * The write goes through updateTeamBilling, whose field allow-list is what
 * guarantees this cannot reach a club's name, structure, members, ownership
 * or Stripe identifiers — only the commercial fields it is meant to move.
 *
 * trialEndsAt follows the plan rather than lingering: a club moved ONTO a
 * trial starts a fresh one, and a club moved to core or pro carries no expiry
 * at all, so resolveSession's expired-trial downgrade can never later pull a
 * paying club back to core on the strength of a stale date.
 *
 * Idempotent: selecting the plan a club already has writes nothing and says
 * so, rather than manufacturing a change (and an audit entry) out of a no-op.
 */
export async function changeClubPlan({ teamId, plan, actorUserId } = {}) {
  if (!plan || typeof plan !== 'string') {
    const e = new Error(`plan must be one of: ${PROVISIONABLE_PLANS.join(', ')}`);
    e.status = 400; throw e;
  }
  const requestedPlan = plan.trim().toLowerCase();
  if (!PROVISIONABLE_PLANS.includes(requestedPlan)) {
    const e = new Error(`plan must be one of: ${PROVISIONABLE_PLANS.join(', ')}`);
    e.status = 400; throw e;
  }
  const id = String(teamId || '').trim();
  if (!id) { const e = new Error('A club is required'); e.status = 400; throw e; }
  const teams = await loadStoredTeams();
  const team = teams.find(t => String(t.id) === id);
  if (!team) { const e = new Error('Unknown club'); e.status = 404; throw e; }

  const previousPlan = String(team.plan || DEFAULT_PROVISIONED_PLAN);
  if (previousPlan === requestedPlan) {
    return { unchanged: true, previousPlan, plan: requestedPlan,
             club: { id: team.id, name: team.name || team.id, plan: previousPlan,
                     planStatus: String(team.planStatus || 'active'),
                     trialEndsAt: team.trialEndsAt || null } };
  }

  const updated = await updateTeamBilling(id, {
    plan: requestedPlan,
    planStatus: 'active',
    trialEndsAt: requestedPlan === 'trial'
      ? new Date(Date.now() + TRIAL_PERIOD_MS).toISOString()
      : null,
  });
  return { unchanged: false, previousPlan, plan: requestedPlan,
           club: { id: updated.id, name: updated.name || updated.id, plan: updated.plan,
                   planStatus: updated.planStatus, trialEndsAt: updated.trialEndsAt || null },
           changedBy: String(actorUserId || '') };
}

/**
 * THE HISTORICAL FOUNDER of a provisioned club, derived from evidence only.
 *
 * bdde5790 made the claim itself grant ownership, but only for invites
 * carrying the `founderInvite` marker it introduced. A club provisioned and
 * claimed BEFORE that release has an active founder who never became the
 * owner, so its owner protections cover nobody.
 *
 * Both facts needed to repair that were already being persisted, by the
 * server, long before the marker existed:
 *
 *   · `createdBy === 'platform-provisioning'` says the invite was minted by
 *     PROVISIONING. Every ordinary invite records the session user's id
 *     instead (api/invite.js), and no request body can reach the field, so
 *     this is not something a club can fake its way into.
 *   · `acceptedBy` is the id of the person who actually claimed it, written
 *     by claimInvite at the moment of the claim.
 *
 * So the founder is READ, never guessed: no email matching, no "first staff
 * member", no earliest-joined heuristic. Anything less than exact evidence
 * returns a reason instead of a user, and the caller refuses.
 *
 * Returns { userId } on success, or { reason } describing why not:
 *   not_provisioned  — no provisioning invite for this club (self-created,
 *                      legacy, or its invite aged out of the shared list)
 *   never_claimed    — provisioned, but the invitation was never accepted
 *   ambiguous        — several accepted provisioning invites disagree
 */
function resolveProvisionedFounder(teamId, invites = []) {
  const id = String(teamId || '');
  const provisioning = invites.filter(i =>
    i && String(i.teamId || '') === id &&
    String(i.createdBy || '') === PLATFORM_PROVISIONING_ACTOR);
  if (!provisioning.length) return { reason: 'not_provisioned' };
  const claimed = [...new Set(provisioning
    .filter(i => String(i.status || '') === 'accepted' && String(i.acceptedBy || '').trim())
    .map(i => String(i.acceptedBy)))];
  if (!claimed.length) return { reason: 'never_claimed' };
  // Two different people cannot both be "the" founder. Refuse rather than pick.
  if (claimed.length > 1) return { reason: 'ambiguous' };
  return { userId: claimed[0] };
}

/**
 * Clubs whose historical founder can be given the ownership the claim would
 * grant today. A club appears ONLY when every one of these is true:
 *
 *   · provisioning evidence exists and names exactly one claimant
 *   · that person is an ACTIVE member of that same club
 *   · they are staff there (ownership is a staff fact — mirrors the claim path)
 *   · the club has no other active owner
 *   · they are not already owner with Full Access
 *
 * Anything else is simply absent from the list: there is no "force" variant,
 * because a club that fails these tests is one where the right answer is not
 * known, and inventing one is the failure mode this whole surface avoids.
 */
export async function listFounderOwnershipRepairs() {
  const [invites, members, users, teams] = await Promise.all([
    loadInvites(), loadTeamMembers(), loadUsers(), loadStoredTeams(),
  ]);
  const out = [];
  for (const team of teams) {
    const found = resolveProvisionedFounder(team.id, invites);
    if (!found.userId) continue;
    const active = members.filter(m => String(m.teamId) === String(team.id) && m.status === 'active');
    const founder = active.find(m => String(m.userId) === found.userId);
    if (!founder) continue;                       // left, removed, or never active
    if (String(founder.role || '') === 'player') continue;
    if (active.some(m => m.id !== founder.id && isClubOwner(m))) continue;   // already owned
    if (founder.isOwner === true && accessProfileOf(founder) === 'full') continue;
    const user = users.find(u => String(u.id) === found.userId) || {};
    out.push({
      teamId: team.id,
      clubName: team.name || team.id,
      founderUserId: found.userId,
      founderName: user.displayName || user.firstName || '',
      founderEmail: user.email || '',
      currentlyOwner: founder.isOwner === true,
      currentAccessProfile: accessProfileOf(founder) || null,
      reason: 'provisioned_founder_missing_ownership',
    });
  }
  return out.sort((a, b) => a.clubName.localeCompare(b.clubName));
}

/**
 * Give a historical provisioned founder the ownership their claim would grant
 * today — and nothing else.
 *
 * The caller names a CLUB. It may not name a person: the founder is re-derived
 * here from the same evidence the listing used, so a request that supplies
 * somebody else's user id cannot redirect ownership, and a club id from one
 * tenant cannot reach a member of another (the founder must be an active
 * member of the named club).
 *
 * Writes exactly two fields, on exactly one membership. Plan, structure,
 * invitations, billing, every other member and every other club are not read
 * for writing and not touched. Idempotent: a club that is already correctly
 * owned reports `unchanged` and writes nothing.
 */
export async function repairFounderOwnership({ teamId, actorUserId } = {}) {
  const id = String(teamId || '').trim();
  if (!id) { const e = new Error('A club is required'); e.status = 400; throw e; }
  const teams = await loadStoredTeams();
  const team = teams.find(t => String(t.id) === id);
  if (!team) { const e = new Error('Unknown club'); e.status = 404; throw e; }

  const invites = await loadInvites();
  const found = resolveProvisionedFounder(id, invites);
  if (!found.userId) {
    const messages = {
      not_provisioned: 'This club was not created by platform provisioning, so it has no founder invitation to repair from',
      never_claimed:   'That club\'s founder invitation was never accepted, so there is nobody to make the owner',
      ambiguous:       'That club has more than one accepted founder invitation — the original founder cannot be identified',
    };
    const e = new Error(messages[found.reason] || 'The original founder cannot be identified for that club');
    e.status = 400; e.code = found.reason; throw e;
  }

  const members = await loadTeamMembers();
  const active = members.filter(m => String(m.teamId) === id && m.status === 'active');
  const founder = active.find(m => String(m.userId) === found.userId);
  if (!founder) {
    const e = new Error('That club\'s founder is no longer an active member, so ownership cannot be repaired');
    e.status = 400; e.code = 'founder_not_active'; throw e;
  }
  if (String(founder.role || '') === 'player') {
    const e = new Error('That club\'s founder is no longer staff there, so ownership cannot be repaired');
    e.status = 400; e.code = 'founder_not_staff'; throw e;
  }
  // A club that already has an owner is not missing one. Never a second.
  const otherOwner = active.find(m => m.id !== founder.id && isClubOwner(m));
  if (otherOwner) {
    const e = new Error('That club already has an owner — nothing to repair');
    e.status = 400; e.code = 'owner_exists'; throw e;
  }
  if (founder.isOwner === true && accessProfileOf(founder) === 'full') {
    return { unchanged: true, teamId: id, clubName: team.name || team.id, founderUserId: found.userId };
  }

  founder.isOwner = true;
  founder.accessProfile = 'full';
  founder.accessChangedBy = String(actorUserId || '') || PLATFORM_PROVISIONING_ACTOR;
  founder.accessChangedAt = nowIso();
  await saveTeamMembers(members);
  return { unchanged: false, teamId: id, clubName: team.name || team.id, founderUserId: found.userId };
}

/**
 * Provision a NEW customer club: an isolated tenant plus a single-use
 * head-coach invitation for its first administrator. Unlike createClub (the
 * founder self-signup), no user account is created here — the first admin
 * arrives through the EXISTING invite/claim flow, which attaches them to
 * exactly this club as club-wide staff (head + legacy null scope) and never
 * grants platform authority. The new tenant starts with only its team
 * record; structure synthesizes lazily under the club's OWN name, and every
 * other surface begins empty.
 */
export async function provisionClub({ clubName, adminEmail, adminName = '', firstTeamName = '', plan } = {}) {
  const club = String(clubName || '').trim().slice(0, 80);
  if (!club) { const e = new Error('Club name is required'); e.status = 400; throw e; }
  const normalized = normalizeEmail(adminEmail);
  if (!EMAIL_RE.test(normalized)) {
    const e = new Error('A valid first-administrator email is required'); e.status = 400; throw e;
  }
  // The commercial tier this club starts on. Validated BEFORE anything is
  // written, so a bad value creates no club, no invite and no team id — and
  // an unknown string is refused rather than quietly becoming some default.
  // Omitting it keeps today's behaviour exactly (see PROVISIONABLE_PLANS).
  //
  // The value must be an actual STRING. Coercing whatever arrives would let
  // `plan: ["pro"]` smuggle a tier through String() — case and surrounding
  // whitespace are normalised (the same house rule as roles and emails), but
  // the type is not guessed at.
  const planOmitted = plan === undefined || plan === null || plan === '';
  if (!planOmitted && typeof plan !== 'string') {
    const e = new Error(`plan must be one of: ${PROVISIONABLE_PLANS.join(', ')}`);
    e.status = 400; throw e;
  }
  const requestedPlan = planOmitted
    ? DEFAULT_PROVISIONED_PLAN
    : plan.trim().toLowerCase();
  if (!PROVISIONABLE_PLANS.includes(requestedPlan)) {
    const e = new Error(`plan must be one of: ${PROVISIONABLE_PLANS.join(', ')}`);
    e.status = 400; throw e;
  }

  const teams = await loadStoredTeams();
  // Same ONE duplicate-name policy as createClub — a single definition.
  if (clubNameTaken(teams, club)) throw clubNameTakenError();
  // Stable tenant id from the club name; collision-proofed, never overwrites.
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
    teamName: String(firstTeamName || '').trim().slice(0, 80),
    sport: 'Rugby',
    teamCode,
    createdAt,
    plan: requestedPlan,
    planStatus: 'active',
    // The 30-day timer belongs to a TRIAL and nothing else. resolveSession
    // auto-downgrades an expired trial to core; carrying a stale expiry on a
    // club that is already core or pro would be a date that means nothing.
    trialEndsAt: requestedPlan === 'trial'
      ? new Date(new Date(createdAt).getTime() + TRIAL_PERIOD_MS).toISOString()
      : null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  };
  teams.push(team);
  await saveTeams(teams);

  // First-admin invitation, tenant-scoped to the NEW club, with an EXPLICIT
  // club-wide scope: the claim stamps it via the existing scoped-invite
  // machinery, so the first administrator is unambiguously club-wide from
  // the moment they join — no reliance on legacy scope derivation.
  const invite = {
    token:      randomBytes(24).toString('base64url'),
    name:       String(adminName || '').trim().slice(0, 80),
    role:       'coach',
    staffLevel: 'head',
    scope:      { clubWide: true },
    email:      normalized,
    status:     'pending',
    teamId,
    createdAt:  nowIso(),
    expiresAt:  new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy:  PLATFORM_PROVISIONING_ACTOR,
    // THE FOUNDER MARKER. Self-service clubs stamp their creator as the club
    // owner directly (createClub below); a provisioned club has no member at
    // all until this invite is claimed, so ownership has to travel on the
    // invite. Server-authored on both ends: nothing in a request body can set
    // it, because /api/invite builds its own record and never copies this
    // field. Claiming it is what makes the first administrator the OWNER —
    // see applyFounderOwnership.
    founderInvite: true,
    acceptedAt: null,
  };
  await appendClubInvite(teamId, invite);
  return { team, invite };
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
  Object.assign(user, hashPassword(newPassword), { passwordSet: true, passwordResetByAdminAt: nowIso(), passwordChangedAt: nowIso() });
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

// ── RC4.9C — ACCESS PROFILES ────────────────────────────────────────────────
// The access profile is the authorisation; the club role is a job title. Only
// the club owner or a Full Access holder with ASSIGN_ACCESS may change one.

/** Active members of a team that currently hold Full Access. */
export function fullAccessMembers(members = [], teamId) {
  return members.filter(m =>
    m.teamId === teamId && m.status === 'active' && accessProfileOf(m) === 'full');
}

/** Teams where this user holds an ACTIVE membership — their assigned teams. */
export async function assignedTeamsForUser(userId) {
  const members = await loadTeamMembers();
  return members
    .filter(m => m.userId === userId && m.status === 'active')
    .map(m => m.teamId);
}

export async function setAccessProfile(memberId, profile, changedBy, expectedTeamId) {
  const next = String(profile || '').toLowerCase();
  if (!ACCESS_PROFILES.includes(next)) {
    const error = new Error(`accessProfile must be one of: ${ACCESS_PROFILES.join(', ')}`);
    error.status = 400;
    throw error;
  }
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  const actor = members.find(m =>
    m.userId === changedBy && m.teamId === member.teamId && m.status === 'active');
  const previous = accessProfileOf(member);

  // Self-elevation is reserved to the club owner.
  if (member.userId === changedBy && accessProfileRank(next) > accessProfileRank(previous) && !isClubOwner(member)) {
    const error = new Error('You cannot raise your own access level — ask the club owner');
    error.status = 403;
    throw error;
  }
  // The club owner's own access can never be reduced by anyone.
  if (isClubOwner(member) && accessProfileRank(next) < accessProfileRank(previous)) {
    const error = new Error("The club owner's access cannot be reduced");
    error.status = 400;
    throw error;
  }
  // A club must always retain at least one Full Access administrator.
  if (previous === 'full' && next !== 'full' && fullAccessMembers(members, member.teamId).length <= 1) {
    const error = new Error('Cannot downgrade the last full-access administrator');
    error.status = 400;
    throw error;
  }
  // Only the owner, or a Full Access holder, may hand out access at all.
  if (actor && !isClubOwner(actor) && accessProfileOf(actor) !== 'full') {
    const error = new Error('You are not allowed to change access profiles');
    error.status = 403;
    throw error;
  }

  member.accessProfile = next;
  member.accessChangedBy = changedBy;
  member.accessChangedAt = nowIso();
  await saveTeamMembers(members);

  // Take effect immediately for anyone already signed in: sessions carry only a
  // token, and permissions are recomputed from the membership on every request,
  // so no session surgery is needed — but a downgrade must not leave a stale
  // elevated session cached anywhere, so stamp the change for observability.
  return {
    teamMember: member,
    previousProfile: previous,
    newProfile: next,
    assignedTeams: await assignedTeamsForUser(member.userId),
    changedAt: member.accessChangedAt,
  };
}

// ── RC4.7 Phase B — scoped access grants + player eligibility ───────────────
// Store-level setters only: the actor checks (who may edit access) ride the
// existing setAccessProfile-style route gates in Phase C. Both fields are
// normalized on write through _accessScope, so malformed input can never be
// PERSISTED, and normalization at read time keeps even hand-edited data
// failing closed.

/** Replace a member's scoped access grants. Identity and history untouched. */
export async function setMemberAccessScope(memberId, accessScope, changedBy, expectedTeamId) {
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  member.accessScope = normalizeAccessScope(accessScope);
  member.accessChangedBy = changedBy || member.accessChangedBy || null;
  member.accessChangedAt = nowIso();
  await saveTeamMembers(members);
  return { teamMember: member };
}

/**
 * Soft-remove ONE scoped grant (status → 'removed'). The membership, the
 * identity, and every other grant survive. Removing a grant a member does not
 * hold is a no-op, not an error — the end state is identical.
 */
export async function removeScopedGrant(memberId, { groupId = null, teamId = null } = {}, changedBy, expectedTeamId) {
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  const scope = effectiveAccessScope(member);   // materialise derived scope before editing
  if (groupId !== null) {
    scope.groups = scope.groups.map(g => g.groupId === String(groupId) ? { ...g, status: 'removed' } : g);
  }
  if (teamId !== null) {
    scope.teams = scope.teams.map(t => t.teamId === String(teamId) ? { ...t, status: 'removed' } : t);
  }
  member.accessScope = normalizeAccessScope(scope);
  member.accessChangedBy = changedBy || member.accessChangedBy || null;
  member.accessChangedAt = nowIso();
  await saveTeamMembers(members);
  return { teamMember: member };
}

// Club roles an administrator may assign through the editor. Ownership is NOT
// assignable here — transferring a club is a deliberate future flow, and the
// owner's own record is protected below.
const ASSIGNABLE_ROLES = new Set(['admin', 'coach', 'medical', 'snc', 'player']);

/**
 * Change a member's club role (and staff level for coaches). Guards:
 * the owner's record is untouchable, and the club must always retain at least
 * one full-access administrator — matching setAccessProfile's invariants.
 */
export async function setMemberRole(memberId, { role, staffLevel = null } = {}, changedBy, expectedTeamId) {
  const nextRole = String(role || '').toLowerCase();
  if (!ASSIGNABLE_ROLES.has(nextRole)) {
    const error = new Error('That role cannot be assigned here');
    error.status = 400;
    throw error;
  }
  const nextLevel = STAFF_LEVELS.includes(String(staffLevel || '').toLowerCase())
    ? String(staffLevel).toLowerCase() : null;
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  if (isClubOwner(member)) {
    const error = new Error("The club owner's role cannot be changed");
    error.status = 400;
    throw error;
  }
  // Dropping the last full-access administrator would lock the club. An
  // explicit stored accessProfile survives a role change (accessProfileOf
  // prefers it), so this can only trip for role-derived profiles.
  const probe = { ...member, role: nextRole, staffLevel: nextRole === 'coach' ? (nextLevel || 'head') : null };
  const losesFull = accessProfileOf(member) === 'full' && accessProfileOf(probe) !== 'full';
  if (losesFull && fullAccessMembers(members, member.teamId).length <= 1) {
    const error = new Error('Cannot change the last full-access administrator — assign another first');
    error.status = 400;
    throw error;
  }
  member.role = nextRole;
  if (nextRole === 'coach') member.staffLevel = nextLevel || member.staffLevel || 'head';
  else delete member.staffLevel;
  member.accessChangedBy = changedBy || null;
  member.accessChangedAt = nowIso();
  await saveTeamMembers(members);
  return { teamMember: member };
}

/**
 * RC4.7 — grant or revoke MEDICAL access as an additive permission.
 *
 * Medical is deliberately independent of the access profile (RC4.9C): a person
 * may be a player AND medical staff on ONE membership, keeping their player
 * profile, roster place and eligibility untouched. It grants PERM.MEDICAL_ACCESS
 * only — never club administration, access assignment or structure management.
 */
export async function setMedicalAccess(memberId, enabled, changedBy, expectedTeamId) {
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  member.medicalAccess = enabled === true;
  member.accessChangedBy = changedBy || null;
  member.accessChangedAt = nowIso();
  await saveTeamMembers(members);
  return { teamMember: member };
}

/**
 * RC4.7 D1a — set a member's PLAYER GROUP (where they play). Independent of
 * staff access: changing it never touches accessScope, medical or role.
 * Pass '' to clear it (a player becoming staff-only).
 *
 * This is how an EXISTING member gains player capacity without being deleted
 * or reinvited: one field on the membership they already hold. Their account,
 * membership id, history, medical access and staff access all stay exactly as
 * they are — a capacity is added, never a permission.
 *
 * Assigning a group also ensures the player profile every playing member has
 * (roster identity, legacyPlayerId, availability history). Clearing the group
 * deliberately KEEPS that profile: it carries history that cannot be
 * reconstructed, the same reason preserveDualRolePlayerState exists.
 */
export async function setPlayerGroup(memberId, groupId, changedBy, expectedTeamId) {
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  const next = String(groupId || '').trim();
  if (next) {
    const structure = await loadClubStructure(member.teamId);
    const group = groupById(structure, next);
    if (!group) { const e = new Error('Unknown group for this club'); e.status = 404; throw e; }
    if (group.status !== 'active') {
      const e = new Error(`"${group.name}" is archived — players cannot be assigned to it`);
      e.status = 400; throw e;
    }
    member.playerGroupId = group.id;
  } else {
    delete member.playerGroupId;
  }
  member.accessChangedBy = changedBy || member.accessChangedBy || null;
  member.accessChangedAt = nowIso();
  await saveTeamMembers(members);

  let playerProfile = null;
  if (next) {
    const users = await loadUsers();
    const user = users.find(u => String(u.id) === String(member.userId));
    // No account behind the membership is a data-integrity state, not a
    // reason to fail the assignment — the capacity is still correct.
    if (user) playerProfile = await ensurePlayerProfile({ teamMember: member, user });
  }
  return { teamMember: member, playerProfile };
}

/**
 * RC4.7 D1a — one-time backfill of playerGroupId for clubs that predate the
 * explicit model.
 *
 * Safety rules, all enforced here rather than by the caller:
 *  - runs ONLY when the club has exactly ONE active group (with several, the
 *    correct answer is unknowable and it refuses rather than guess);
 *  - assigns only to ACTIVE PLAYER memberships that have no explicit value;
 *  - never overwrites an existing playerGroupId;
 *  - never touches staff-only memberships, access scope, medical, profiles,
 *    eligibility or roster rows;
 *  - idempotent — a second run assigns nothing.
 *
 * `dryRun: true` reports exactly what would change and writes nothing.
 */
export async function backfillPlayerGroups(clubId, { dryRun = false, changedBy = 'migration' } = {}) {
  const structure = await loadClubStructure(clubId);
  const live = activeGroups(structure);
  const members = await loadTeamMembers();
  const mine = members.filter(m => String(m.teamId) === String(clubId));
  const players = mine.filter(m => m.status === 'active' && canonicalRole(m) === 'player');

  const report = {
    clubId, activeGroups: live.length, groupId: live[0]?.id || null, groupName: live[0]?.name || null,
    totalMembers: mine.length, activePlayers: players.length,
    alreadyAssigned: players.filter(m => String(m.playerGroupId || '').trim()).length,
    staffSkipped: mine.filter(m => canonicalRole(m) !== 'player').length,
    assigned: 0, wouldAssign: 0, applied: false, reason: null,
  };

  if (live.length !== 1) {
    report.reason = live.length === 0
      ? 'no active group — nothing can be assigned'
      : `${live.length} active groups — refusing to guess; assign each player explicitly`;
    return report;
  }

  const target = live[0].id;
  const pending = players.filter(m => !String(m.playerGroupId || '').trim());
  report.wouldAssign = pending.length;
  if (dryRun) { report.reason = 'dry run — no changes written'; return report; }
  if (!pending.length) { report.reason = 'nothing to do — already backfilled'; report.applied = true; return report; }

  for (const m of pending) {
    m.playerGroupId = target;
    m.accessChangedBy = changedBy;
    m.accessChangedAt = nowIso();
  }
  await saveTeamMembers(members);
  report.assigned = pending.length;
  report.applied = true;
  return report;
}

/** Set which teams a player may be SELECTED for. Never grants capabilities. */
export async function setPlayerEligibility(memberId, eligibility, changedBy, expectedTeamId) {
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);
  member.playerEligibility = normalizeEligibility(eligibility);
  member.accessChangedBy = changedBy || member.accessChangedBy || null;
  member.accessChangedAt = nowIso();
  await saveTeamMembers(members);
  return { teamMember: member };
}

// ── RC4.9B — PERMANENT member deletion (irreversible) ──────────────────────
// Archive/remove stay the normal reversible actions. This is the GDPR-style
// erasure path for a club admin who must genuinely delete a person.
//
// DATA POLICY — deliberately NOT a cascade delete:
//   KEPT  · completed fixture selections and appearance history (club records
//           must stay accurate), appearance adjustments, past messages (shown
//           under a historical "Removed member" label), historical availability
//           for reporting, and every audit-log entry.
//   GONE  · current membership and all future access; the login account
//           (users record) and its credentials; the player profile's personal
//           data — the profile row is anonymised in place rather than dropped
//           so historical rows that reference it never become orphaned.
//   Medical notes live in the coach's device state keyed by the profile id;
//   anonymising the profile (not deleting the row) keeps them attached to a
//   non-identifying record rather than orphaning or exposing them.
export async function permanentlyDeleteTeamMember(memberId, deletedBy, expectedTeamId) {
  const members = await loadTeamMembers();
  const member = findTeamMemberOrThrow(members, memberId, expectedTeamId);

  if (member.userId === deletedBy) {
    const error = new Error('You cannot permanently delete your own membership');
    error.status = 400;
    throw error;
  }
  // The club owner can never be deleted.
  if (isClubOwner(member)) {
    const error = new Error('The club owner cannot be deleted');
    error.status = 400;
    throw error;
  }
  // Never strand a club without a full-access administrator. Keyed on the ACCESS
  // PROFILE, not a job title, so renaming someone's role cannot bypass it.
  if (accessProfileOf(member) === 'full' && fullAccessMembers(members, member.teamId).length <= 1) {
    const error = new Error('Cannot delete the last full-access administrator');
    error.status = 400;
    throw error;
  }
  if (staffLevelOf(member) === 'head' && await countActiveHeadCoaches(members, member.teamId) <= 1) {
    const error = new Error('Cannot delete the last head coach or club administrator');
    error.status = 400;
    throw error;
  }

  const userId = member.userId;
  const teamId = member.teamId;

  // 1. Membership row → terminal state. Retained (not spliced) so historical
  //    rows referencing this membership id still resolve to a safe record.
  member.status = 'deleted';
  member.deletedAt = nowIso();
  member.deletedBy = deletedBy;
  member.role = 'player';
  delete member.staffLevel;
  await saveTeamMembers(members);

  // 2. Player profile → anonymised in place (keeps historical joins intact).
  const profiles = await loadPlayerProfiles();
  let profileAnonymised = false;
  profiles.forEach(profile => {
    if (profile.userId !== userId) return;
    profile.displayName = 'Removed member';
    profile.email = '';
    profile.phone = '';
    profile.anonymisedAt = nowIso();
    profileAnonymised = true;
  });
  if (profileAnonymised) await savePlayerProfiles(profiles);

  // 3. Login account → deleted outright unless the user still belongs to
  //    another club, in which case that membership must keep working.
  const stillElsewhere = members.some(m =>
    m.userId === userId && m.teamId !== teamId && m.status === 'active');
  const users = await loadUsers();
  let accountDeleted = false;
  if (!stillElsewhere) {
    const remainingUsers = users.filter(u => u.id !== userId);
    if (remainingUsers.length !== users.length) { await saveUsers(remainingUsers); accountDeleted = true; }
  }

  // 4. Every live session for this membership is revoked immediately (all of
  //    the user's sessions when the account itself is gone).
  const sessions = await loadSessions();
  const keptSessions = sessions.filter(s =>
    !(s.userId === userId && (accountDeleted || s.teamId === teamId)));
  const sessionsRevoked = sessions.length - keptSessions.length;
  if (sessionsRevoked) await saveSessions(keptSessions);

  // 5. Outstanding password-reset / verification tokens are useless now — drop them.
  if (accountDeleted) {
    const resets = await loadPasswordResets();
    const keptResets = resets.filter(r => r.userId !== userId);
    if (keptResets.length !== resets.length) await savePasswordResets(keptResets);
    const verifications = await loadEmailVerifications();
    const keptVer = verifications.filter(v => v.userId !== userId);
    if (keptVer.length !== verifications.length) await saveEmailVerifications(keptVer);
  }

  return {
    memberId, userId, teamId,
    accountDeleted, profileAnonymised, sessionsRevoked,
    deletedAt: member.deletedAt,
  };
}

/**
 * Self-service account deletion — the H4 App Store requirement.
 *
 * Same data policy as permanentlyDeleteTeamMember (the admin path), applied to
 * EVERY club the caller belongs to, plus the personal stores only the account
 * owner can speak for (push subscriptions, chat read-cursors, roster rows the
 * user claimed). Shared club records — sessions, fixtures, availability
 * history, messages, medical cases — are deliberately retained: they are the
 * club's records, and the anonymised profile ("Removed member") is what keeps
 * them coherent without carrying the person's identity.
 *
 * The caller can only ever be the authenticated session user: the handler
 * passes session.user.id and nothing from the request body names an identity.
 *
 * Refuses — with a per-club explanation and NO partial changes — while any
 * active membership would strand a club: the club owner, the last full-access
 * administrator, or the last head coach cannot self-delete (identical guards
 * to the admin path), and a platform administrator must hand over platform
 * control first. Confirmation: the literal word DELETE always, plus the
 * account password whenever one is set — an account without a password (some
 * invite-claimed accounts) cannot be locked out of deletion by a check it can
 * never pass.
 */
export async function deleteOwnAccount(userId, { currentPassword, confirm } = {}) {
  const users = await loadUsers();
  const user = users.find(u => u.id === userId);
  if (!user) { const e = new Error('Account not found'); e.status = 404; throw e; }

  if (isPlatformAdmin(user)) {
    const e = new Error('Platform administrators cannot delete their own account. Transfer platform access first.');
    e.status = 400; throw e;
  }
  if (String(confirm || '').trim().toUpperCase() !== 'DELETE') {
    const e = new Error('Type DELETE to confirm you want to permanently delete this account');
    e.status = 400; throw e;
  }
  if (user.passwordHash && user.passwordSalt) {
    requireCurrentPassword(user, currentPassword);
  }

  const members = await loadTeamMembers();
  const mine = members.filter(m => m.userId === userId);
  const active = mine.filter(m => m.status === 'active');
  const teams = await loadTeams();
  const clubNameOf = teamId => {
    const team = teams.find(t => t.id === teamId);
    return team?.clubName || team?.name || teamId;
  };

  // ── Guards first, atomically: either every club allows this, or nothing
  //    at all is modified. Same rules as the admin deletion path.
  const blockers = [];
  for (const member of active) {
    const clubName = clubNameOf(member.teamId);
    if (isClubOwner(member)) {
      blockers.push(`${clubName}: you are the club owner — the owner account cannot be deleted`);
      continue;
    }
    if (accessProfileOf(member) === 'full' && fullAccessMembers(members, member.teamId).length <= 1) {
      blockers.push(`${clubName}: you are the last administrator with full access`);
      continue;
    }
    if (staffLevelOf(member) === 'head' && await countActiveHeadCoaches(members, member.teamId) <= 1) {
      blockers.push(`${clubName}: you are the last head coach or club administrator`);
    }
  }
  if (blockers.length) {
    const e = new Error('Your account cannot be deleted yet. ' + blockers.join('. ') +
      '. Hand these responsibilities to someone else in the club first, or contact support@coacheasier.com.');
    e.status = 400; e.code = 'deletion_blocked'; e.blockers = blockers;
    throw e;
  }

  const deletedAt = nowIso();
  const teamIds = [...new Set(mine.map(m => m.teamId).filter(Boolean))];
  const displayName = user.displayName || user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') || '';
  const email = user.email || '';

  // 1. Every membership row -> terminal state (retained, like the admin path,
  //    so historical rows referencing the membership still resolve safely).
  mine.forEach(member => {
    member.status = 'deleted';
    member.deletedAt = deletedAt;
    member.deletedBy = userId;               // self
    member.role = 'player';
    delete member.staffLevel;
  });
  if (mine.length) await saveTeamMembers(members);

  // 2. Player profiles -> anonymised in place. Capture the roster identifiers
  //    first — a claimed roster row is matched by userId OR the invite-derived
  //    legacyPlayerId, and the profile is where that id lives.
  const profiles = await loadPlayerProfiles();
  const legacyIds = legacyPlayerIdsForUser(profiles, userId);
  let profilesAnonymised = 0;
  profiles.forEach(profile => {
    if (profile.userId !== userId) return;
    profile.displayName = 'Removed member';
    profile.email = '';
    profile.phone = '';
    profile.anonymisedAt = deletedAt;
    profilesAnonymised++;
  });
  if (profilesAnonymised) await savePlayerProfiles(profiles);

  // 3. The user's claimed roster rows are removed from each club's roster —
  //    the same end state the admin deletion flow reaches. Coach-typed rows
  //    that were never claimed carry no account identity and are left alone.
  const ownsRow = row => rosterRowBelongsToUser(row, userId, legacyIds);
  let rosterRowsRemoved = 0;
  for (const teamId of teamIds) {
    const rosterKey = key(`roster:${teamId}`);
    const record = await kvGet(rosterKey);
    if (!record || !Array.isArray(record.players)) continue;
    const kept = record.players.filter(row => !ownsRow(row));
    if (kept.length !== record.players.length) {
      rosterRowsRemoved += record.players.length - kept.length;
      await kvSet(rosterKey, { ...record, players: kept, updatedAt: deletedAt });
    }
  }

  // 4. Pending invitations matching this identity are revoked in every club
  //    (RC4.9B: a deleted member must not re-join through an old link).
  //    Claimed invites keep their record — audit history, never touched.
  let invitesRevoked = 0;
  for (const teamId of teamIds) {
    const invites = await listClubInvites(teamId);
    for (const invite of (Array.isArray(invites) ? invites : [])) {
      if (!invite || invite.status !== 'pending') continue;
      const matchesEmail = invite.email && email &&
        String(invite.email).toLowerCase() === email.toLowerCase();
      const matchesName = displayName &&
        String(invite.name || '').trim().toLowerCase() === displayName.trim().toLowerCase();
      if (!matchesEmail && !matchesName) continue;
      invite.status = 'revoked';
      invite.revokedAt = deletedAt;
      invite.revokedReason = 'account_deleted';
      await persistInvite({ invite, teamId,
        source: (await findInviteByToken(invite.token))?.source });
      invitesRevoked++;
    }
  }

  // 5. Push subscriptions are the user's own devices — every one goes.
  let pushRemoved = 0;
  try {
    const subsKey = key('subscriptions');
    const subs = await kvGet(subsKey);
    if (Array.isArray(subs)) {
      const kept = subs.filter(s => !(String(s?.userId || '') === userId ||
        (s?.legacyPlayerId && legacyIds.has(String(s.legacyPlayerId))) ||
        (s?.playerId && legacyIds.has(String(s.playerId)))));
      pushRemoved = subs.length - kept.length;
      if (pushRemoved) await kvSet(subsKey, kept);
    }
  } catch { /* push cleanup is best-effort — nothing identity-critical lives there */ }

  // 6. Chat read-cursors (tiny identity-keyed timestamps) — swept clean.
  //    Messages themselves are retained; the anonymised profile is how the
  //    sender renders from now on.
  try {
    const readKeys = await kvScanKeys(key('chat:read:*'));
    for (const k of (readKeys || [])) {
      if (String(k).endsWith(`:${userId}`)) await kvDel(k);
    }
  } catch { /* best-effort hygiene */ }

  // 7. The login account itself.
  await saveUsers(users.filter(u => u.id !== userId));

  // 8. Every live session — the account must not stay signed in anywhere.
  const sessions = await loadSessions();
  const keptSessions = sessions.filter(s => s.userId !== userId);
  const sessionsRevoked = sessions.length - keptSessions.length;
  if (sessionsRevoked) await saveSessions(keptSessions);

  // 9. Outstanding reset/verification tokens are dead letters now.
  const resets = await loadPasswordResets();
  const keptResets = resets.filter(r => r.userId !== userId);
  if (keptResets.length !== resets.length) await savePasswordResets(keptResets);
  const verifications = await loadEmailVerifications();
  const keptVer = verifications.filter(v => v.userId !== userId);
  if (keptVer.length !== verifications.length) await saveEmailVerifications(keptVer);

  return {
    userId, deletedAt,
    clubsLeft: teamIds.length,
    membershipsDeleted: mine.length,
    profilesAnonymised, rosterRowsRemoved, invitesRevoked, pushRemoved, sessionsRevoked,
  };
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
    loadHealedPlayerProfiles(), // auto-repair shared group-invite legacyPlayerIds, persisted once
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
