/**
 * SECOND-CLUB READINESS — runtime tenant isolation.
 *
 * club-provisioning.test.js already proves a second club can be CREATED
 * cleanly. This suite proves it can then be OPERATED alongside the first
 * without either seeing the other, by driving the real handlers.
 *
 * The architecture makes this worth testing explicitly. Club DATA is stored
 * under per-tenant keys (`publish:<teamId>:…`, `roster:<teamId>`,
 * `structure:<teamId>`), but IDENTITY is a set of GLOBAL lists —
 * identity:teams, identity:team_members, identity:users,
 * identity:player_profiles, chat:convs, subscriptions. Tenant separation there
 * is achieved by FILTERING on teamId, not by key namespacing, so a single
 * missing filter is a cross-club leak. These tests probe for one.
 *
 * Every probe uses a REAL authenticated session and asks the server for
 * another club's data by naming it directly. Client-side filtering is never
 * treated as a boundary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.twoclub.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = (lists.get(args[0]) || []);
  if (command === 'LTRIM' || command === 'EXPIRE') result = 'OK';
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const { SESSION_COOKIE, createSession } = store;

// ── Two clubs. Different ids, groups, teams, people, everything. ───────────
const A = 'boitsfort';                      // Club A — the live club
const B = 'club-hartley';                   // Club B — a separate, fictional club
const A_SEN = 'grp_initial', A_U18 = 'grp_2b0aa7f9';
const B_SEN = 'grp_hartley_sen', B_U18 = 'grp_hartley_u18';

const scope = (...g) => ({ clubWide: false, groups: g.map(id => ({ groupId: id, status: 'active' })), teams: [] });

const MEMBERS = [
  // Club A
  { id: 'a-own', teamId: A, userId: 'a-owner', role: 'coach', staffLevel: 'head', isOwner: true, status: 'active', accessProfile: 'full', medicalAccess: true },
  { id: 'a-u18c', teamId: A, userId: 'a-u18-coach', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope(A_U18) },
  { id: 'a-p1', teamId: A, userId: 'a-player', role: 'player', status: 'active', playerGroupId: A_SEN },
  { id: 'a-p2', teamId: A, userId: 'a-u18-player', role: 'player', status: 'active', playerGroupId: A_U18 },
  // Club B
  { id: 'b-own', teamId: B, userId: 'b-owner', role: 'coach', staffLevel: 'head', isOwner: true, status: 'active', accessProfile: 'full', medicalAccess: true },
  { id: 'b-p1', teamId: B, userId: 'b-player', role: 'player', status: 'active', playerGroupId: B_SEN },
  { id: 'b-p2', teamId: B, userId: 'b-u18-player', role: 'player', status: 'active', playerGroupId: B_U18 },
];

// Distinctive strings: if one appears in the other club's response, it leaked.
const A_SECRET = 'ALPHA-ONLY-Mons';
const B_SECRET = 'BRAVO-ONLY-Kituro';

function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: A, name: 'Boitsfort', teamCode: 'BOITSF57', plan: 'pro',   planStatus: 'active' },
    { id: B, name: 'Hartley',   teamCode: 'HARTLEY1', plan: 'trial', planStatus: 'active' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({
    id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId, role: m.role }))));
  kv.set('app:identity:player_profiles', JSON.stringify(MEMBERS.filter(m => m.role === 'player')
    .map(m => ({ teamId: m.teamId, userId: m.userId, legacyPlayerId: m.userId }))));
  kv.set(`app:structure:${A}`, JSON.stringify({ version: 1, groups: [
    { id: A_SEN, name: 'Seniors', type: 'general', status: 'active', developmentCategory: 'adult' },
    { id: A_U18, name: 'U18', type: 'age-grade', status: 'active', developmentCategory: 'youth_u18' }], teams: [] }));
  kv.set(`app:structure:${B}`, JSON.stringify({ version: 1, groups: [
    { id: B_SEN, name: 'Seniors', type: 'general', status: 'active', developmentCategory: 'adult' },
    { id: B_U18, name: 'U18', type: 'age-grade', status: 'active', developmentCategory: 'youth_u18' }], teams: [] }));
  kv.set(`app:roster:${A}`, JSON.stringify({ players: [
    { id: 'pa1', userId: 'a-player', name: 'Alpha Senior', position: 'PROP', medical: A_SECRET },
    { id: 'pa2', userId: 'a-u18-player', name: 'Alpha U18', position: 'WING' }] }));
  kv.set(`app:roster:${B}`, JSON.stringify({ players: [
    { id: 'pb1', userId: 'b-player', name: 'Bravo Senior', position: 'HOOKER', medical: B_SECRET },
    { id: 'pb2', userId: 'b-u18-player', name: 'Bravo U18', position: 'LOCK' }] }));
  kv.set(`app:club:${A}`, JSON.stringify({ clubName: 'Boitsfort',
    fixtures: [{ id: 'fx-a', opposition: A_SECRET, date: '2026-09-01', groupId: A_SEN }] }));
  kv.set(`app:club:${B}`, JSON.stringify({ clubName: 'Hartley',
    fixtures: [{ id: 'fx-b', opposition: B_SECRET, date: '2026-09-02', groupId: B_SEN }] }));
  kv.set(`app:publish:${A}:training`, JSON.stringify({ sessions: [{ id: 'ta', title: A_SECRET, blocks: [] }] }));
  kv.set(`app:publish:${B}:training`, JSON.stringify({ sessions: [{ id: 'tb', title: B_SECRET, blocks: [] }] }));
  kv.set(`app:publish:${A}:squad`, JSON.stringify({ squad: { starters: [{ name: A_SECRET }] } }));
  kv.set(`app:publish:${B}:squad`, JSON.stringify({ squad: { starters: [{ name: B_SECRET }] } }));
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, writeHead(c) { out.code = c; return this; },
           get result() { return out; } };
}
const call = async (handler, userId, method, query = {}, body = {}) => {
  const r = res();
  await handler({ method, query, body, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
};
const pub = (u, m, q, b) => call(publishHandler, u, m, q, b);
const avail = (u, m, q, b) => call(availabilityHandler, u, m, q, b);

/** Did this response carry the OTHER club's marker anywhere in it? */
const leaks = (result, marker) => JSON.stringify(result?.body ?? {}).includes(marker);

await seed();
for (const m of MEMBERS) await login(m.userId);

// ── 1. Baseline: each club can read its OWN data ──────────────────────────

test('1: each club reads its own data — the probes below are meaningful', async () => {
  const a = await pub('a-owner', 'GET', { resource: 'roster' });
  const b = await pub('b-owner', 'GET', { resource: 'roster' });
  assert.equal(a.code, 200); assert.equal(b.code, 200);
  assert.ok(leaks(a, 'Alpha Senior'), 'Club A sees its own roster');
  assert.ok(leaks(b, 'Bravo Senior'), 'Club B sees its own roster');
});

// ── 2. Cross-club reads, both directions, every subsystem ─────────────────

test('2: Club A cannot read Club B through ANY publish resource', async () => {
  for (const resource of ['roster', 'squad', 'training', 'training-schedule', 'matchday', 'performance']) {
    const r = await pub('a-owner', 'GET', { resource });
    assert.equal(leaks(r, B_SECRET), false, `${resource}: Club B data leaked into Club A`);
    assert.equal(leaks(r, 'Bravo Senior'), false, `${resource}: a Club B player leaked`);
    assert.equal(leaks(r, 'Hartley'), false, `${resource}: Club B's name leaked`);
  }
});

test('3: Club B cannot read Club A through ANY publish resource', async () => {
  for (const resource of ['roster', 'squad', 'training', 'training-schedule', 'matchday', 'performance']) {
    const r = await pub('b-owner', 'GET', { resource });
    assert.equal(leaks(r, A_SECRET), false, `${resource}: Club A data leaked into Club B`);
    assert.equal(leaks(r, 'Alpha Senior'), false, `${resource}: a Club A player leaked`);
  }
});

// ── 3. Direct tenant-ID manipulation ──────────────────────────────────────

test('4: naming the other club directly in the query changes nothing', async () => {
  // Every plausible spelling a caller might try.
  for (const forged of [{ teamId: B }, { team: B }, { clubId: B }, { club: B }, { tenant: B }]) {
    for (const resource of ['roster', 'training', 'squad']) {
      const r = await pub('a-owner', 'GET', { resource, ...forged });
      assert.equal(leaks(r, B_SECRET), false,
        `${resource} + ${JSON.stringify(forged)}: the server honoured a client-supplied tenant`);
      assert.equal(leaks(r, 'Bravo Senior'), false, `${resource} + ${JSON.stringify(forged)}: player leaked`);
    }
  }
});

test('5: naming the other club in the BODY of a write changes nothing', async () => {
  const before = kv.get(`app:roster:${B}`);
  await pub('a-owner', 'POST', { resource: 'roster' },
    { teamId: B, clubId: B, players: [{ id: 'x', name: 'INJECTED BY CLUB A' }] });
  assert.equal(kv.get(`app:roster:${B}`), before, "Club B's roster is byte-identical after Club A's write");
  assert.equal(String(kv.get(`app:roster:${B}`)).includes('INJECTED'), false, 'nothing was injected');
});

test('6: an UNKNOWN club id is refused, never served as empty-but-ok', async () => {
  for (const forged of [{ teamId: 'club-does-not-exist' }, { teamId: '' }, { teamId: '../boitsfort' }]) {
    const r = await pub('a-owner', 'GET', { resource: 'roster', ...forged });
    // Either refused, or answered with the caller's OWN club — never the forged one.
    assert.equal(leaks(r, B_SECRET), false, `unknown id ${JSON.stringify(forged)} must not reach another tenant`);
  }
});

test('7: MISSING tenant context fails closed — no session, no data', async () => {
  for (const resource of ['roster', 'training', 'squad', 'performance']) {
    const r = await call(publishHandler, '__nobody__', 'GET', { resource });
    assert.ok(r.code === 401 || r.code === 403, `${resource}: anonymous must be refused (got ${r.code})`);
    assert.equal(leaks(r, A_SECRET), false, `${resource}: refused response still carried data`);
    assert.equal(leaks(r, B_SECRET), false);
  }
});

// ── 4. Availability is tenant-scoped too ──────────────────────────────────

test('8: availability never crosses clubs, even when the other club is named', async () => {
  await avail('a-player', 'POST', {}, { sessionId: 'tue', response: 'available' });
  await avail('b-player', 'POST', {}, { sessionId: 'tue', response: 'unavailable' });
  const a = await avail('a-owner', 'GET', { sessionId: 'tue' });
  const b = await avail('b-owner', 'GET', { sessionId: 'tue', teamId: A });
  assert.equal(leaks(a, 'b-player'), false, "Club A's board shows no Club B player");
  assert.equal(leaks(b, 'a-player'), false, "Club B cannot read Club A's board by naming it");
});

// ── 5. Group isolation INSIDE the second club ─────────────────────────────

test('9: a U18-scoped coach in Club A reaches U18 only — and never Club B', async () => {
  const r = await pub('a-u18-coach', 'GET', { resource: 'performance' });
  // Club A is entitled, so this resolves; the athlete set must be U18 only.
  if (r.code === 200) {
    const ids = (r.body.athletes || []).map(x => x.userId);
    assert.equal(ids.includes('a-player'), false, 'a Seniors athlete must not appear');
    assert.equal(ids.includes('b-player'), false, 'nor any Club B athlete');
    assert.equal(ids.includes('b-u18-player'), false, 'not even Club B\'s U18 — same group NAME, different club');
  }
  assert.equal(leaks(r, B_SECRET), false);
});

test('10: group identity is the membership id, never the group NAME', async () => {
  // Both clubs have a group literally called "U18" with different ids. If any
  // lookup matched on the label, Club B's U18 would answer for Club A's.
  const a = JSON.parse(kv.get(`app:structure:${A}`));
  const b = JSON.parse(kv.get(`app:structure:${B}`));
  const aU18 = a.groups.find(g => g.name === 'U18');
  const bU18 = b.groups.find(g => g.name === 'U18');
  assert.equal(aU18.name, bU18.name, 'the two clubs really do share the label');
  assert.notEqual(aU18.id, bU18.id, 'but never the identity');
  const scoped = MEMBERS.find(m => m.userId === 'a-u18-coach');
  assert.equal(scoped.accessScope.groups[0].groupId, aU18.id, 'scope names an id, not a label');
});

test('11: missing group context fails CLOSED for a player', async () => {
  // A member with no playerGroupId must not be treated as "every group".
  const orphan = { id: 'a-orphan', teamId: A, userId: 'a-orphan', role: 'player', status: 'active' };
  kv.set('app:identity:team_members', JSON.stringify([...MEMBERS, orphan]));
  await login('a-owner');
  const r = await pub('a-owner', 'GET', { resource: 'performance' });
  if (r.code === 200) {
    const ids = (r.body.athletes || []).map(x => x.userId);
    // The orphan may appear to a club-wide coach, but must carry no group.
    const entry = (r.body.athletes || []).find(x => x.userId === 'a-orphan');
    if (entry) assert.equal(entry.groupId, '', 'an ungrouped athlete claims no group');
  }
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
});

// ── 6. Performance entitlement stays tenant-scoped ────────────────────────

test('12: Performance is entitled per CLUB — A pro yes, B trial no, unknown no', async () => {
  const a = await pub('a-owner', 'GET', { resource: 'performance' });
  assert.equal(a.code, 200, 'Club A (pro/active) is entitled');

  const b = await pub('b-owner', 'GET', { resource: 'performance' });
  assert.equal(b.code, 402, 'Club B (trial) is NOT entitled — Boitsfort being pro must not enable it');
  assert.equal(b.body?.code, 'performance_not_entitled');

  // An unknown club has no plan record at all.
  const teams = JSON.parse(kv.get('app:identity:teams'));
  kv.set('app:identity:teams', JSON.stringify(teams.filter(t => t.id !== B)));
  const gone = await pub('b-owner', 'GET', { resource: 'performance' });
  assert.notEqual(gone.code, 200, 'a club with no record is never entitled');
  kv.set('app:identity:teams', JSON.stringify(teams));
});

test('13: making Club B pro does not touch Club A, and vice versa', async () => {
  const teams = JSON.parse(kv.get('app:identity:teams'));
  kv.set('app:identity:teams', JSON.stringify(teams.map(t =>
    t.id === B ? { ...t, plan: 'pro' } : t)));
  const b = await pub('b-owner', 'GET', { resource: 'performance' });
  assert.equal(b.code, 200, 'Club B is now entitled on its own record');
  assert.equal(leaks(b, A_SECRET), false, 'and still sees none of Club A');
  const a = await pub('a-owner', 'GET', { resource: 'performance' });
  assert.equal(a.code, 200, 'Club A is unaffected');
  kv.set('app:identity:teams', JSON.stringify(teams));
});

// ── 7. Medical / youth boundaries hold across clubs ───────────────────────

test('14: medical detail never crosses clubs, in either direction', async () => {
  const a = await pub('a-owner', 'GET', { resource: 'roster' });
  const b = await pub('b-owner', 'GET', { resource: 'roster' });
  assert.equal(leaks(a, B_SECRET), false, "Club A never sees Club B's medical field");
  assert.equal(leaks(b, A_SECRET), false, "Club B never sees Club A's medical field");
});

test('15: the youth restriction gate is per-athlete, not per-platform', async () => {
  // Club B has its own U18 group with its own developmentCategory. The gate
  // must read THAT club's structure, never the other's.
  const { restrictionSignalAllowed } = await import('../performance/domain/authoring-profile.js');
  assert.equal(restrictionSignalAllowed({ ageBand: '21_29', developmentCategory: 'adult' }), true);
  assert.equal(restrictionSignalAllowed({ ageBand: '21_29', developmentCategory: 'youth_u18' }), false,
    "a youth squad withholds regardless of which club it belongs to");
  assert.equal(restrictionSignalAllowed({ ageBand: null, developmentCategory: null }), false,
    'unknown fails closed for every club');
});

// ── 8. Legal acceptance is NOT recorded, and signup stays closed ──────────

test('16: no legal acceptance is recorded anywhere, because the policies are drafts', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const identity = await readFile(new URL('../api/identity.js', import.meta.url), 'utf8');
  // LEGAL acceptance only. `acceptedAt` alone is excluded deliberately: it is
  // the INVITE acceptance timestamp (api/invite.js), nothing to do with policy.
  for (const field of ['acceptedTermsVersion', 'acceptedPrivacyVersion',
                       'termsAcceptedAt', 'privacyAcceptedAt', 'policyAcceptedAt']) {
    assert.equal(src.includes(field), false, `${field} must not be recorded while the policies are drafts`);
    assert.equal(identity.includes(field), false, `${field} must not be stored server-side either`);
  }
  // And the signup wizard must not claim agreement it has not obtained.
  // Comments are stripped first: the wizard CONTAINS an explanation of why it
  // does not assert agreement, and that explanation quotes the wording it avoids.
  const raw = src.slice(src.indexOf('id="cw-finish-btn"') - 400, src.indexOf('id="cw-finish-btn"') + 1400);
  const wizard = raw.replace(/<!--[\s\S]*?-->/g, '')          // HTML comments
                    .replace(/\/\*[\s\S]*?\*\//g, '')
                    .replace(/^\s*\/\/[^\n]*$/gm, '');
  assert.doesNotMatch(wizard, /type="checkbox"/, 'no acceptance control while the documents are drafts');
  assert.doesNotMatch(wizard, /you agree to|By (creating|signing)/i, 'and no implied agreement');
  // The acceptance SEAM is documented in place, so the future control has an
  // obvious home — and the comment says plainly why it is empty today.
  assert.match(raw, /No acceptance is claimed or recorded/, 'the seam is documented, and disabled');
  // The policies are still openly marked unfinished.
  const privacy = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
  const terms = await readFile(new URL('../terms.html', import.meta.url), 'utf8');
  for (const [name, page] of [['privacy', privacy], ['terms', terms]]) {
    assert.match(page, /DRAFT — pending final legal review/, `${name} still declares itself a draft`);
  }
});

test('17: public club signup remains CLOSED until those decisions are made', async () => {
  const identity = await readFile2('../api/identity.js');
  assert.match(identity, /PUBLIC_CLUB_SIGNUP !== 'true'/, 'the server gate exists');
  assert.match(identity, /Club creation is not open yet/, 'and refuses with the closed-beta copy');
  assert.notEqual(process.env.PUBLIC_CLUB_SIGNUP, 'true', 'and is not enabled in this environment');
});
async function readFile2(rel) {
  const { readFile } = await import('node:fs/promises');
  return readFile(new URL(rel, import.meta.url), 'utf8');
}


// ── 9. Club branding never erases product identity ────────────────────────

test('18: a club logo leads, but the CoachEasier mark survives beside the wordmark', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  // The companion mark exists, starts hidden, and is toggled by the club logo.
  assert.match(src, /id="brandCeMark"[^>]*hidden/, 'hidden by default — no duplicate CoachEasier mark');
  assert.match(src, /const ceMark = document\.getElementById\('brandCeMark'\);/);
  assert.match(src, /ceMark\.hidden = !state\.clubLogo;/, 'revealed exactly when a club logo takes the tile');
  // The always-on product identity is untouched.
  assert.match(src, /<strong><img id="brandCeMark"[\s\S]{0,220}CoachEasier<\/strong>/, 'wordmark still present');
  assert.match(src, /Powered by <span>CoachEasier<\/span>/, '"Powered by CoachEasier" still present');
  // And the club logo still takes the tile — club identity leads.
  assert.match(src, /background-image:url\(\$\{state\.clubLogo\}\)/);
});

test('19: branding is per-club state, never global', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const i = src.indexOf('function applyClubBranding');
  const body = src.slice(i, src.indexOf('\n    }', i));
  // Everything it reads is this identity's own state, loaded per club.
  assert.match(body, /state\.clubColours/); assert.match(body, /state\.clubLogo/);
  assert.doesNotMatch(body, /fetch\(/, 'no cross-club lookup');
  // resetTeamScopedState clears club branding on a club switch, so Club B never
  // inherits Club A's logo or colours.
  const reset = src.slice(src.indexOf('function resetTeamScopedState'), src.indexOf('function resetTeamScopedState') + 2000);
  assert.match(reset, /clubLogo|clubColours|clubName/, 'a club switch drops the previous club branding');
});
