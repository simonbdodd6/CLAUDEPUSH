/**
 * MESSAGE LOG TENANT ISOLATION — api/config.js?log=1
 *
 * The activity log lived in ONE global Redis list (`app:message_log`) that
 * every club's push and cron writers appended to, while the reader applied no
 * club filter at all. Any REPORTS holder of any club — including a freshly
 * self-provisioned trial club — could read every other club's notification
 * TITLES and the first 200 characters of their message BODIES, plus the
 * recipient labels those sends named. A production audit confirmed the shape:
 * 20 stored entries, 18 of them carrying no club at all.
 *
 * The contract these tests pin:
 *   - a send stamps the SENDER'S club, resolved from their session, never
 *     from the request body
 *   - a club reads ONLY its own entries; another club's never appear
 *   - the club comes from the session, so a query parameter cannot widen it
 *   - an entry with no teamId belongs to the DEFAULT team (the documented
 *     owner of pre-tagging data, exactly as schedules.js resolves the same
 *     question for the other shared global list), so real clubs never see it
 *   - the tenant filter runs across the whole stored window BEFORE the
 *     caller's limit, so a noisy neighbour cannot push a club's own entries
 *     out of its view
 *   - every REPORTS-holding role keeps working inside its own club.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.mlti.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'EXPIRE') result = 1;
  if (command === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (command === 'LTRIM') { const l = lists.get(a[0]) || []; lists.set(a[0], l.slice(0, Number(a[2]) + 1)); result = 'OK'; }
  if (command === 'LRANGE') { const l = lists.get(a[0]) || []; result = l.slice(Number(a[1]), Number(a[2]) + 1); }
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: configHandler } = await import('../api/config.js');
const { SESSION_COOKIE, createSession, DEFAULT_TEAM } = store;

const CLUB_A = 'club-alpha', CLUB_B = 'club-beta';
const LOG_KEY = 'app:message_log';

// Every role below holds PERM.REPORTS, so each one reaches this endpoint.
const MEMBERS = [
  { id: 'm-a', teamId: CLUB_A, userId: 'u-a', role: 'coach', staffLevel: 'head', status: 'active' },
  { id: 'm-b', teamId: CLUB_B, userId: 'u-b', role: 'coach', staffLevel: 'head', status: 'active' },
  { id: 'm-d', teamId: DEFAULT_TEAM.id, userId: 'u-d', role: 'coach', staffLevel: 'head', status: 'active' },
  { id: 'm-med', teamId: CLUB_A, userId: 'u-med', role: 'medical', status: 'active' },
  { id: 'm-snc', teamId: CLUB_A, userId: 'u-snc', role: 'snc', status: 'active' },
  { id: 'm-ana', teamId: CLUB_A, userId: 'u-ana', role: 'analyst', status: 'active' },
  { id: 'm-mgr', teamId: CLUB_A, userId: 'u-mgr', role: 'coach', staffLevel: 'manager', status: 'active' },
];

const cookies = new Map();
async function seed() {
  kv.clear(); lists.clear(); cookies.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB_A, name: 'Alpha' }, { id: CLUB_B, name: 'Beta' }, { id: DEFAULT_TEAM.id, name: 'Default' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
const readLog = async (userId, query = {}) => {
  const r = res();
  await configHandler({ method: 'GET', query: { log: '1', ...query }, body: null,
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
};
// Newest-first, exactly as LPUSH stores them.
const pushEntry = entry => { const l = lists.get(LOG_KEY) || []; l.unshift(JSON.stringify(entry)); lists.set(LOG_KEY, l); };
const titles = out => (out.body.log || []).map(e => e.title);

function seedLog() {
  pushEntry({ type: 'adhoc', teamId: CLUB_A, title: 'Alpha team talk', body: 'Alpha private body', target: 'Alpha Player' });
  pushEntry({ type: 'adhoc', teamId: CLUB_B, title: 'Beta team talk', body: 'Beta private body', target: 'Beta Player' });
  pushEntry({ type: 'scheduled', teamId: CLUB_B, title: 'Beta Friday chase', body: 'Beta schedule body' });
  // Pre-tagging record: no teamId. Belongs to the DEFAULT team by convention.
  pushEntry({ type: 'adhoc', title: 'Legacy untagged', body: 'Legacy body', target: 'Someone' });
}

// ── B / C — neither club can read the other ─────────────────────────────────

test('a club reads only its OWN message-log entries', async () => {
  await seed(); seedLog();
  const a = await readLog('u-a', { limit: '50' });
  assert.equal(a.code, 200);
  assert.deepEqual(titles(a), ['Alpha team talk'], 'club A sees exactly its own entry');
});

test("a club never sees another club's titles, bodies or recipient labels", async () => {
  await seed(); seedLog();
  const b = await readLog('u-b', { limit: '50' });
  assert.deepEqual(titles(b).sort(), ['Beta Friday chase', 'Beta team talk'], 'club B sees exactly its own');

  const a = await readLog('u-a', { limit: '50' });
  const leaked = JSON.stringify(a.body.log);
  for (const secret of ['Beta team talk', 'Beta private body', 'Beta Player', 'Beta Friday chase', 'Beta schedule body']) {
    assert.ok(!leaked.includes(secret), `club A must not receive "${secret}"`);
  }
});

// ── D — the club comes from the session, not the request ────────────────────

test('a caller cannot widen the read by naming another club in the query', async () => {
  await seed(); seedLog();
  for (const query of [{ teamId: CLUB_B }, { team: CLUB_B }, { clubId: CLUB_B }, { club: CLUB_B }, { group: CLUB_B }]) {
    const out = await readLog('u-a', { ...query, limit: '50' });
    assert.equal(out.code, 200);
    assert.deepEqual(titles(out), ['Alpha team talk'],
      `query ${JSON.stringify(query)} must not reach club B`);
  }
});

// ── E — unscoped historical entries stay put ───────────────────────────────

test('an entry with no teamId is not served to any real club', async () => {
  await seed(); seedLog();
  for (const user of ['u-a', 'u-b']) {
    const out = await readLog(user, { limit: '50' });
    assert.ok(!titles(out).includes('Legacy untagged'), `${user} must not receive the untagged entry`);
  }
});

test('an untagged entry belongs to the DEFAULT team, matching the schedules rule', async () => {
  await seed(); seedLog();
  const d = await readLog('u-d', { limit: '50' });
  assert.deepEqual(titles(d), ['Legacy untagged'],
    'the documented owner of pre-tagging data still reads it, and nothing else');
});

// ── F — same-club behaviour, and the window/limit interaction ───────────────

test('a noisy neighbour cannot push a club out of its own log', async () => {
  await seed();
  pushEntry({ type: 'adhoc', teamId: CLUB_A, title: 'Alpha oldest', body: 'x' });
  for (let i = 0; i < 40; i++) pushEntry({ type: 'adhoc', teamId: CLUB_B, title: `Beta ${i}`, body: 'x' });

  const a = await readLog('u-a', { limit: '10' });
  assert.deepEqual(titles(a), ['Alpha oldest'],
    "club A's only entry sits below 40 of club B's — filtering must precede the limit");
});

test('the caller limit still caps the response', async () => {
  await seed();
  for (let i = 0; i < 25; i++) pushEntry({ type: 'adhoc', teamId: CLUB_A, title: `Alpha ${i}`, body: 'x' });
  const out = await readLog('u-a', { limit: '10' });
  assert.equal(out.body.log.length, 10, 'limit honoured');
  assert.equal(out.body.log[0].title, 'Alpha 24', 'newest first, unchanged');
});

test('a club with no entries reads an empty log, never a fallback to someone else', async () => {
  await seed(); seedLog();
  lists.set(LOG_KEY, (lists.get(LOG_KEY) || []).filter(raw => !String(raw).includes(CLUB_A)));
  const a = await readLog('u-a', { limit: '50' });
  assert.equal(a.code, 200);
  assert.deepEqual(a.body.log, [], 'empty, not club B\'s entries and not the untagged one');
});

// ── G — every REPORTS-holding role, inside its own club ────────────────────

test('medical, S&C, analyst and manager all read their own club and only it', async () => {
  await seed(); seedLog();
  for (const user of ['u-med', 'u-snc', 'u-ana', 'u-mgr']) {
    const out = await readLog(user, { limit: '50' });
    assert.equal(out.code, 200, `${user} holds REPORTS and must reach the log`);
    assert.deepEqual(titles(out), ['Alpha team talk'], `${user} reads club A's entry only`);
  }
});

test('an unauthenticated caller still gets no log at all', async () => {
  await seed(); seedLog();
  const r = res();
  await configHandler({ method: 'GET', query: { log: '1' }, body: null, headers: {} }, r);
  assert.ok([401, 403].includes(r.result.code), 'no session, no log');
  assert.equal(r.result.body?.log, undefined);
});

// ── A — the write path stamps the sender's club ────────────────────────────

test('SOURCE — every message_log writer stamps a server-derived club', async () => {
  const { readFileSync } = await import('node:fs');
  const push = readFileSync(new URL('../api/push.js', import.meta.url), 'utf8');
  const cron = readFileSync(new URL('../api/cron.js', import.meta.url), 'utf8');

  const adhoc = push.slice(push.indexOf("await kvLpush(key('message_log')"));
  assert.match(adhoc.slice(0, 400), /\bteamId,/, 'the ad-hoc send stamps the session-derived teamId');
  assert.match(push, /const teamId = tenantTeamId\(sessionContext\)/,
    'and that teamId comes from the session, never the request body');

  const scheduled = cron.slice(cron.indexOf("type: 'scheduled'") - 400);
  assert.match(scheduled.slice(0, 600), /teamId: schedule\.teamId/,
    'the scheduled send stamps its schedule\'s club');
  assert.match(cron, /if \(!schedule\.teamId\) \{/,
    'and an untagged schedule is skipped fail-closed, so that stamp is never empty');
});
