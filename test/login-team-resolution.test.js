/**
 * Phase 1 — login team-resolution preference (api/_identityStore.js).
 *
 * The active team on login is now resolved in this order:
 *   legacy demo → explicit input.teamId → user.lastActiveTeamId →
 *   owned club (staffLevel === 'head') → any active membership → DEFAULT_TEAM.
 * Previously it was `input.teamId || DEFAULT_TEAM.id` first, which snapped any
 * coach who also belonged to the default team away from their own/last club.
 *
 * `user.lastActiveTeamId` is additive, written incrementally on login/switch.
 * No data migration; existing users without the field fall through gracefully.
 *
 * Drives the REAL loginUser / switchTeam against a mocked Upstash store.
 * Touches NO availability API and performs NO Redis migration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Env must be set BEFORE importing the store: LEGACY_STAFF_ACCOUNTS is built at
// module load from these vars. A dedicated (non-human) demo email is used here.
process.env.COACH_DEMO_EMAIL        = 'demo.coach@coacheseye.test';
process.env.COACH_DEMO_PASSWORD     = 'DemoPass123';
process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.login-team-resolution.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  let parsed;
  try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ id: 'email_mock' }) };
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(args[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'EXPIRE' || command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const {
  createClub, loginUser, switchTeam, destroySession,
  loadUsers, saveUsers, loadTeamMembers, saveTeamMembers,
  DEFAULT_TEAM,
} = await import('../api/_identityStore.js');

const PASS = 'Passw0rd123';
let seq = 0;
const nextEmail = () => `coach${++seq}@phase1.test`;

async function addMembership(userId, teamId, { role = 'coach', staffLevel = null, status = 'active' } = {}) {
  const members = await loadTeamMembers();
  members.push({
    id: `tm_${teamId}_${userId}`, teamId, userId, role, staffLevel, status,
    joinedAt: new Date().toISOString(), approvedAt: new Date().toISOString(),
  });
  await saveTeamMembers(members);
}
async function getUser(userId) { return (await loadUsers()).find(u => u.id === userId); }
async function setLastActive(userId, teamId) {
  const users = await loadUsers();
  const u = users.find(x => x.id === userId);
  u.lastActiveTeamId = teamId;
  await saveUsers(users);
}
// Create a real coach account + their own club (head membership), optionally
// also an active membership in the default team. Returns the createClub result.
async function coachWithClub(clubName, { alsoDefault = false } = {}) {
  const r = await createClub({ clubName, teamName: 'Seniors', sport: 'Rugby', name: 'Test Coach', email: nextEmail(), password: PASS });
  if (alsoDefault) await addMembership(r.user.id, DEFAULT_TEAM.id, { role: 'coach', staffLevel: null, status: 'active' });
  await destroySession(r.session.token);
  return r;
}

// ── 1. Single-club coach — unchanged behaviour ───────────────────────────────
test('single-club coach logs into their own club (and lastActiveTeamId is recorded)', async () => {
  kv.clear(); seq = 0;
  const a = await coachWithClub('Alpha RFC');
  const email = (await getUser(a.user.id)).email;

  // Backward-compat: the account has no lastActiveTeamId before this login.
  assert.equal((await getUser(a.user.id)).lastActiveTeamId, undefined);

  const r = await loginUser({ email, password: PASS });
  assert.equal(r.session.teamId, a.team.id, 'resolves to the coach\'s own club');
  // Additive write, no migration:
  assert.equal((await getUser(a.user.id)).lastActiveTeamId, a.team.id);
});

// ── 2. Coach owning a club AND a member of the default team — THE FIX ─────────
test('owned club wins over the default team (regression fix)', async () => {
  kv.clear(); seq = 0;
  const b = await coachWithClub('Bravo RFC', { alsoDefault: true });
  const email = (await getUser(b.user.id)).email;

  const r = await loginUser({ email, password: PASS });
  assert.equal(r.session.teamId, b.team.id, 'lands on the owned club, not boitsfort-rfc');
  assert.notEqual(r.session.teamId, DEFAULT_TEAM.id, 'previously this snapped to DEFAULT_TEAM');
});

// ── 3. Explicit team selection is honoured ───────────────────────────────────
test('explicit input.teamId overrides every fallback', async () => {
  kv.clear(); seq = 0;
  const c = await coachWithClub('Charlie RFC', { alsoDefault: true });
  const email = (await getUser(c.user.id)).email;

  const r = await loginUser({ email, password: PASS, teamId: DEFAULT_TEAM.id });
  assert.equal(r.session.teamId, DEFAULT_TEAM.id, 'explicit team beats owned/last-active');
});

// ── 4. Last active team beats the owned club ─────────────────────────────────
test('lastActiveTeamId is preferred over the owned club', async () => {
  kv.clear(); seq = 0;
  const d = await coachWithClub('Delta RFC', { alsoDefault: true });
  const email = (await getUser(d.user.id)).email;
  await setLastActive(d.user.id, DEFAULT_TEAM.id);

  const r = await loginUser({ email, password: PASS });
  assert.equal(r.session.teamId, DEFAULT_TEAM.id, 'returns the coach to their last active team');
});

// ── 5a. Multiple memberships — the owned (head) club is preferred ─────────────
test('with multiple memberships, the head club is preferred', async () => {
  kv.clear(); seq = 0;
  const e = await coachWithClub('Echo RFC');           // head in Echo
  await addMembership(e.user.id, 'club-extra', { role: 'coach', staffLevel: null, status: 'active' });
  const email = (await getUser(e.user.id)).email;

  const r = await loginUser({ email, password: PASS });
  assert.equal(r.session.teamId, e.team.id, 'head membership wins over a non-head membership');
});

// ── 5b. Multiple memberships, none head/last/explicit — first active wins ─────
test('with no head/last/explicit team, the first active membership is used', async () => {
  kv.clear(); seq = 0;
  const f = await coachWithClub('Foxtrot RFC');        // head in Foxtrot (inserted first)
  // Demote the head membership so there is no owned club at all.
  const members = await loadTeamMembers();
  members.find(m => m.userId === f.user.id && m.teamId === f.team.id).staffLevel = null;
  await saveTeamMembers(members);
  await addMembership(f.user.id, 'club-golf', { role: 'coach', staffLevel: null, status: 'active' });
  const email = (await getUser(f.user.id)).email;

  const r = await loginUser({ email, password: PASS });
  assert.equal(r.session.teamId, f.team.id, 'falls back to the first active membership');
});

// ── 6. Legacy demo coach — unchanged (resolves to DEFAULT_TEAM) ──────────────
test('legacy demo coach still resolves to the default team', async () => {
  kv.clear(); seq = 0;
  const r = await loginUser({ email: process.env.COACH_DEMO_EMAIL, password: process.env.COACH_DEMO_PASSWORD });
  assert.equal(r.session.teamId, DEFAULT_TEAM.id, 'legacy staff account stays on boitsfort-rfc');
  assert.equal(r.session.userId, 'coach-demo', 'resolves to the seeded legacy account');
});

// ── 7. switchTeam records the last active team; next login returns there ──────
test('switchTeam persists lastActiveTeamId and the next login returns to it', async () => {
  kv.clear(); seq = 0;
  const g = await coachWithClub('Hotel RFC', { alsoDefault: true });
  const email = (await getUser(g.user.id)).email;

  const r1 = await loginUser({ email, password: PASS });
  assert.equal(r1.session.teamId, g.team.id, 'first login lands on the owned club');

  await switchTeam(r1.session.token, DEFAULT_TEAM.id);
  assert.equal((await getUser(g.user.id)).lastActiveTeamId, DEFAULT_TEAM.id, 'switch recorded');

  const r2 = await loginUser({ email, password: PASS });
  assert.equal(r2.session.teamId, DEFAULT_TEAM.id, 'next login honours the switched-to team');
});
