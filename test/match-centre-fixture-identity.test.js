/**
 * Match Centre — FIXTURE IDENTITY BRIDGE.
 *
 * Squad drafts and published squads carried no fixture identity: sanitiseSquad
 * stripped fixtureId, so every stored record was anonymous and the fixture
 * deletion check that reads squad?.fixtureId could never fire.
 *
 * Future legitimate saves now carry a SERVER-VALIDATED fixtureId. Storage keys
 * are unchanged, nothing is migrated, and a legacy record without the field
 * stays valid — absent is a legitimate state, never something to infer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.mc-fixture.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-mc', OTHER = 'club-other';
const MONS = 'fx_aug22', AMSTEL = 'fx_aug29', FOREIGN = 'fx_other';

const MEMBERS = [
  { id: 'm-coach', teamId: CLUB, userId: 'u-coach', role: 'coach', status: 'active', accessProfile: 'full' },
  { id: 'm-coach2', teamId: CLUB, userId: 'u-coach2', role: 'coach', status: 'active', accessProfile: 'full' },
  { id: 'm-other', teamId: OTHER, userId: 'u-other', role: 'coach', status: 'active', accessProfile: 'full' },
];

function seed() {
  kv.clear(); writes.length = 0;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [
    { id: MONS,   opposition: 'Mons',         date: '2026-08-22', status: 'scheduled' },
    { id: AMSTEL, opposition: 'Amstelveense', date: '2026-08-29', status: 'scheduled' },
  ] }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ clubName: 'Other', fixtures: [
    { id: FOREIGN, opposition: 'Elsewhere', date: '2026-08-22', status: 'scheduled' },
  ] }));
}

const cookies = new Map();
async function login(userId) {
  const s = await createSession({ userId, teamId: CLUB, role: 'coach' });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function post(userId, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(userId) || '' }, body }, r);
  return r.result;
}
async function get(userId, type) {
  const r = res();
  await publishHandler({ method: 'GET', query: { type }, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const squadData = extra => ({ published: true, opposition: 'Mons', kickoffDate: '2026-08-22', ...extra });

// ── VALID SAVES CARRY THE ID ───────────────────────────────────────────────
test('a draft save preserves a valid fixtureId, and reads it back', async () => {
  seed(); await login('u-coach');
  const r = await post('u-coach', { type: 'draft', data: squadData({ fixtureId: MONS }) });
  assert.equal(r.code, 200);
  assert.equal(r.body.draft.fixtureId, MONS);

  const read = await get('u-coach', 'draft');
  assert.equal(read.body.draft.fixtureId, MONS, 'the id survives the round trip');
});

test('a published squad preserves a valid fixtureId, and reads it back', async () => {
  seed(); await login('u-coach');
  const r = await post('u-coach', { type: 'squad', data: squadData({ fixtureId: AMSTEL }) });
  assert.equal(r.code, 200);
  assert.equal(r.body.squad.fixtureId, AMSTEL);

  const read = await get('u-coach', 'squad');
  assert.equal(read.body.squad.fixtureId, AMSTEL);
});

// ── THE ID IS NEVER TAKEN ON TRUST ─────────────────────────────────────────
test('unknown, forged and cross-club fixture ids are all refused', async () => {
  seed(); await login('u-coach');
  for (const bad of ['fx_forged', 'not-a-fixture', FOREIGN]) {
    const draft = await post('u-coach', { type: 'draft', data: squadData({ fixtureId: bad }) });
    assert.equal(draft.code, 404, `draft must refuse ${bad}`);
    const squad = await post('u-coach', { type: 'squad', data: squadData({ fixtureId: bad }) });
    assert.equal(squad.code, 404, `squad must refuse ${bad}`);
  }
  // Nothing was written on any refusal.
  assert.equal(writes.some(k => k.includes(':squad') || k.includes(':draft:')), false);
});

test('a genuine coach of another club cannot claim this club\'s fixture', async () => {
  seed();
  // A REAL member of OTHER — so authentication succeeds and the FIXTURE check
  // is what refuses, proving validation is against the caller's own club.
  const s = await createSession({ userId: 'u-other', teamId: OTHER, role: 'coach' });
  const r = res();
  await publishHandler({ method: 'POST', query: {},
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(s.token)}` },
    body: { type: 'draft', data: squadData({ fixtureId: MONS }) } }, r);
  assert.equal(r.result.code, 404, 'MONS is unknown to OTHER\'s club record');

  // And their own fixture is accepted, so the refusal is not blanket denial.
  const ok = res();
  await publishHandler({ method: 'POST', query: {},
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(s.token)}` },
    body: { type: 'draft', data: squadData({ fixtureId: FOREIGN }) } }, ok);
  assert.equal(ok.result.code, 200);
  assert.equal(ok.result.body.draft.fixtureId, FOREIGN);
});

// ── LEGACY RECORDS ─────────────────────────────────────────────────────────
test('a save with no fixtureId still works — absent is a valid state', async () => {
  seed(); await login('u-coach');
  const draft = await post('u-coach', { type: 'draft', data: squadData({}) });
  assert.equal(draft.code, 200);
  assert.equal(draft.body.draft.fixtureId, '', 'empty, not invented');

  const squad = await post('u-coach', { type: 'squad', data: squadData({}) });
  assert.equal(squad.code, 200);
  assert.equal(squad.body.squad.fixtureId, '');
});

test('a legacy record stored WITHOUT the field stays readable, and reading never stamps it', async () => {
  seed(); await login('u-coach');
  // Exactly what production holds today: no fixtureId key at all.
  const legacy = { published: true, opposition: 'Mons', kickoffDate: '2026-08-22',
                   formationNames: { 1: 'Somebody' }, benchPlayers: ['Sub'] };
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(legacy));
  kv.set(`app:publish:${CLUB}:draft:u-coach`, JSON.stringify(legacy));
  const before = { squad: kv.get(`app:publish:${CLUB}:squad`), draft: kv.get(`app:publish:${CLUB}:draft:u-coach`) };
  writes.length = 0;

  const squad = await get('u-coach', 'squad');
  const draft = await get('u-coach', 'draft');
  assert.equal(squad.code, 200);
  assert.equal(squad.body.squad.opposition, 'Mons', 'still readable');
  assert.deepEqual(draft.body.draft.benchPlayers, ['Sub']);

  assert.deepEqual(writes, [], 'a READ writes nothing');
  assert.equal(kv.get(`app:publish:${CLUB}:squad`), before.squad, 'legacy squad byte-identical');
  assert.equal(kv.get(`app:publish:${CLUB}:draft:u-coach`), before.draft, 'legacy draft byte-identical');
});

test('no opponent or date inference exists anywhere in the bridge', () => {
  const publish = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  const start = publish.indexOf('async function assertFixtureBelongsToClub');
  const body = publish.slice(start, start + 700);
  assert.equal(/opposition|kickoffDate|kickoffTime|venue/.test(body), false,
    'ownership comes from the id alone — never from opponent, date or venue');
  assert.match(body, /if \(!id\) return '';/, 'omitting it is explicitly allowed');

  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const clientStart = src.indexOf('function matchCentreSelectedFixture(');
  const clientBody = src.slice(clientStart, clientStart + 500);
  assert.match(clientBody, /state\.matchCentre \|\| \{\}\)\.fixtureId/,
    'identity is the EXPLICIT field, resolved against the club\'s own fixture list');
  assert.equal(/opposition|kickoffDate|venue/.test(clientBody), false,
    'and infers nothing from display text');
});

// ── STORAGE SHAPE ─────────────────────────────────────────────────────────
// This pass added the identity field and deliberately left storage alone. Pass A
// (fixture-scoped storage) then moved it, so the assertion below now pins the
// SCOPED keyspace. The intent is unchanged and still strict: a save touches
// exactly these keys and no others.
test('a fixture-linked save touches exactly the fixture-scoped keys', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: squadData({ fixtureId: MONS }) });
  await post('u-coach', { type: 'squad', data: squadData({ fixtureId: MONS }) });

  const touched = [...new Set(writes.filter(k => k.includes('publish:')))].sort();
  assert.deepEqual(touched, [
    `app:publish:${CLUB}:fixture:${MONS}:draft:u-coach`,
    `app:publish:${CLUB}:fixture:${MONS}:squad`,
    `app:publish:${CLUB}:squad:current`,
  ].sort(), 'the fixture\'s own draft and squad, plus the player-facing pointer');
  assert.equal(touched.includes(`app:publish:${CLUB}:squad`), false,
    'the legacy club-wide squad key is never written by a fixture-linked save');
});

test('an UNLINKED save keeps the original keys and invents no fixture', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: squadData({}) });
  await post('u-coach', { type: 'squad', data: squadData({}) });

  const touched = [...new Set(writes.filter(k => k.includes('publish:')))].sort();
  assert.deepEqual(touched, [
    `app:publish:${CLUB}:draft:u-coach`,
    `app:publish:${CLUB}:squad`,
    `app:publish:${CLUB}:squad:current`,
  ].sort(), 'the original keys, plus the player-facing mode record');
  assert.equal(writes.some(k => k.includes(':fixture:')), false,
    'no fixture, so no fixture-scoped key is invented');
  // Pass A.1: an unlinked publish is still a publish, so it claims the
  // player-facing slot in LEGACY mode rather than being left overridable.
  const pointer = JSON.parse(kv.get(`app:publish:${CLUB}:squad:current`));
  assert.equal(pointer.mode, 'legacy');
  assert.equal(pointer.fixtureId, '', 'and is given no fixture identity');
});

test('the allow-list grew by exactly one field', async () => {
  seed(); await login('u-coach');
  const r = await post('u-coach', { type: 'squad', data: {
    published: true, publishedAt: 'x', opposition: 'a', competition: 'b', kickoffDate: 'c',
    kickoffTime: 'd', arrivalTime: 'e', venue: 'f', kit: 'g', announcement: 'h', gamePlan: 'i',
    formationNames: { 1: 'p' }, benchPlayers: ['q'], fixtureId: MONS,
    // None of these may survive.
    userId: 'hack', slots: ['x'], teamId: 'other', _autoFixtureId: 'sneaky', extra: 1,
  } });
  const shape = r.body.squad;
  assert.deepEqual(Object.keys(shape).sort(), [
    'announcement', 'arrivalTime', 'benchPlayers', 'competition', 'fixtureId', 'formationNames',
    'gamePlan', 'kickoffDate', 'kickoffTime', 'kit', 'opposition', 'published', 'publishedAt', 'venue',
  ]);
  assert.equal(shape.fixtureId, MONS, 'preserved');
  assert.equal(shape._autoFixtureId, undefined, 'the client-internal field never persists');
});

test('authorisation lives at the request boundary, not in sanitisation', () => {
  // Sanitisation preserves an already-authorised id; the handler is what
  // refuses a bogus one (proven above). Both write paths must validate.
  const publish = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.match(publish, /squad\.fixtureId = await assertFixtureBelongsToClub\(session\.teamId, squad\.fixtureId\)/);
  assert.match(publish, /draft\.fixtureId = await assertFixtureBelongsToClub\(session\.teamId, draft\.fixtureId\)/);
});

// ── FIXTURE DELETION SAFETY — for NEW records only ─────────────────────────
/** The bulk-import route — the real consumer of the deletion reference check. */
async function importUpdate(userId, fixture) {
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'fixtures' },
    headers: { cookie: cookies.get(userId) || '' },
    body: { action: 'import', confirmed: true, fixtures: [{ decision: 'update', fixture }] } }, r);
  return r.result;
}

test('a newly saved published squad is now visible to the deletion reference check', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: squadData({ fixtureId: MONS }) });

  // Asserting on the stored fixtureId alone proved nothing: it passed even with
  // downstreamContext fully disabled. This drives the REAL consumer instead, so
  // the test dies if the reference check stops seeing Pass A records.
  const r = await importUpdate('u-coach', { opposition: 'Mons', date: '2026-08-22', venue: 'Moved' });
  assert.equal(r.code, 200);
  assert.equal(r.body.summary.blocked, 1, 'the fixture is protected because a squad references it');
  assert.equal(r.body.summary.updated, 0);
  assert.match(r.body.details[0].reason, /squad selection/);
});

test('a fixture with no squad is NOT protected — the check is specific', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: squadData({ fixtureId: MONS }) });

  const r = await importUpdate('u-coach', { opposition: 'Amstelveense', date: '2026-08-29', venue: 'Moved' });
  assert.equal(r.body.summary.blocked, 0, 'a blanket block would be just as wrong as none');
  assert.equal(r.body.summary.updated, 1);
});

test('a legacy squad remains INVISIBLE to that check, and no heuristic rescues it', async () => {
  seed();
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify({ published: true, opposition: 'Mons', kickoffDate: '2026-08-22' }));
  const stored = JSON.parse(kv.get(`app:publish:${CLUB}:squad`));
  assert.equal(stored.fixtureId, undefined,
    'untouched legacy records still carry no identity — this pass does not claim otherwise');
});

// ── EXPLICIT SELECTED FIXTURE (client) ─────────────────────────────────────
// _autoFixtureId only appeared when autopilot happened to import a fixture,
// which is too weak to become the identity boundary for fixture-scoped
// storage. matchCentre.fixtureId is now the explicit, authoritative answer.
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

const FIXTURES = [
  { id: MONS, opposition: 'Mons', date: '2026-08-22' },
  { id: AMSTEL, opposition: 'Amstelveense', date: '2026-08-29' },
];

/** Evaluate the real client helpers against controlled state. */
function mc(matchCentre, formationNames = {}, benchPlayers = []) {
  const state = { matchCentre, fixtures: FIXTURES, formationNames, benchPlayers };
  const toasts = [];
  return new Function(`
    const state = arguments[0];
    const toasts = arguments[1];
    function showToast(m) { toasts.push(m); }
    function saveState() {}
    function render() {}
    function esc(v) { return String(v == null ? '' : v); }
    function isCoach() { return false; }             // keeps the flush inert here
    let _coachDraftSaveTimer = null;
    function saveCoachDraft() {}
    ${fn('matchCentreFixtureList')}
    ${fn('mcFixtureDateLabel')}
    ${fn('matchCentreSelectedFixture')}
    ${fn('matchCentreFixtureId')}
    ${fn('matchCentreHasSquadWork')}
    ${fn('mcFlushDraftNow')}
    ${fn('mcApplyFixtureDisplay')}
    ${fn('mcClearFixtureDisplay')}
    function mcHydrateSelectedFixture() {}           // async loads exercised elsewhere
    function mcRefreshPublishedForFixture() {}
    ${fn('setMatchCentreFixture')}
    ${fn('matchCentreFixturePicker')}
    return { state, toasts, matchCentreFixtureId, matchCentreHasSquadWork,
             setMatchCentreFixture, matchCentreFixturePicker };
  `)(state, toasts);
}

test('the explicit field is the identity, and it is validated', () => {
  assert.equal(mc({ fixtureId: MONS }).matchCentreFixtureId(), MONS);
  assert.equal(mc({ fixtureId: 'fx_deleted' }).matchCentreFixtureId(), '',
    'a stale id degrades to not-linked rather than pointing at nothing');
  assert.equal(mc({}).matchCentreFixtureId(), '', 'absent stays absent');
});

test('autopilot seeds the explicit field from a REAL import', () => {
  assert.match(src, /_autoFixtureId: next\.id,\s*\n\s*fixtureId: next\.id,/,
    'the import stamps the explicit identity too, from the fixture object');
});

test('identity never comes from opponent, date or position', () => {
  // Typing details by hand creates no identity.
  assert.equal(mc({ opposition: 'Mons', kickoffDate: '2026-08-22' }).matchCentreFixtureId(), '',
    'manual entry infers nothing');
  // Renaming the opponent cannot move a link.
  const renamed = mc({ fixtureId: MONS });
  renamed.state.fixtures = [{ id: MONS, opposition: 'Totally Different', date: '2026-08-22' }];
  assert.equal(renamed.matchCentreFixtureId(), MONS, 'identity survives display changes');

  const helper = fn('matchCentreSelectedFixture');
  assert.equal(/opposition|kickoffDate|venue|\[0\]/.test(helper), false,
    'no opponent, date, venue or index inference');
});

test('the picker offers REAL fixtures only, valued by stable id', () => {
  const html = mc({ fixtureId: MONS }).matchCentreFixturePicker();
  assert.match(html, new RegExp(`value="${MONS}"[^>]*selected`), 'current link preselected');
  assert.match(html, new RegExp(`value="${AMSTEL}"`));
  assert.match(html, /<option value="" >Not linked<\/option>|value=""[^>]*>Not linked/,
    'the unlinked state is shown honestly');
  assert.match(html, /setMatchCentreFixture\(this\.value\)/);
});

// ── SWITCHING IS NOW SAFE (Pass B) ─────────────────────────────────────────
// Pass A made storage fixture-scoped, so the old cannot-switch lock is gone:
// each fixture keeps its own draft. A switch flushes the outgoing sheet to its
// own key and NEVER carries XV/bench across as temporary state.
test('a populated squad CAN switch fixture — and the sheet does not travel', () => {
  const ctx = mc({ fixtureId: MONS }, { 1: 'Prop', 2: 'Hooker' }, ['Sub A']);
  assert.equal(ctx.matchCentreHasSquadWork(), true);

  const ok = ctx.setMatchCentreFixture(AMSTEL);
  assert.equal(ok, true, 'the switch is allowed now');
  assert.equal(ctx.state.matchCentre.fixtureId, AMSTEL, 'the link moved');
  // Mons' XV/bench must NOT appear under Amstelveense, not even transiently:
  // the local sheet is cleared and Amstelveense's own draft loads async.
  assert.deepEqual(ctx.state.formationNames, {}, 'no XV carried across');
  assert.equal((ctx.state.benchPlayers || []).filter(n => String(n || '').trim()).length, 0,
    'no bench carried across');
});

test('the picker is never disabled — switching populated work is safe now', () => {
  const html = mc({ fixtureId: MONS }, { 1: 'Prop' }).matchCentreFixturePicker();
  assert.equal(/<select[^>]*disabled/.test(html), false, 'no lock');
  assert.equal(/clear the squad to move it/.test(html), false, 'no lock copy either');
});

test('the switch flushes the OUTGOING draft before anything is cleared', () => {
  // In the SWITCH branch the flush must come before fixtureId moves and the
  // sheet is cleared — the ordering is what stops a debounced save filing
  // fixture A's sheet under fixture B. (The attribution branch above it
  // deliberately flushes AFTER relinking; anchor on the switch branch's
  // unique 'published: false' marker.)
  const body = fn('setMatchCentreFixture');
  const flushAt = body.lastIndexOf('mcFlushDraftNow()');
  const moveAt  = body.indexOf('fixtureId: id, published: false');
  const clearAt = body.indexOf('state.formationNames = {}');
  assert.ok(flushAt > 0 && moveAt > 0 && clearAt > 0, 'all three steps exist');
  assert.ok(flushAt < moveAt, 'flush happens before the link moves');
  assert.ok(moveAt < clearAt, 'and the sheet clears only after that');
});

test('an EMPTY Match Centre may select any real fixture freely', () => {
  const ctx = mc({ fixtureId: MONS }, {}, []);
  assert.equal(ctx.matchCentreHasSquadWork(), false);
  assert.equal(ctx.setMatchCentreFixture(AMSTEL), true);
  assert.equal(ctx.state.matchCentre.fixtureId, AMSTEL);
});

test('an unknown fixture is refused client-side too', () => {
  const ctx = mc({});
  assert.equal(ctx.setMatchCentreFixture('fx_forged'), false);
  assert.equal(ctx.state.matchCentre.fixtureId, undefined);
  assert.match(ctx.toasts.join(' '), /not in your fixture list/);
});

// ── EXPLICIT HUMAN ATTRIBUTION OF AN ANONYMOUS RECORD ─────────────────────
test('an anonymous populated squad CAN be linked by the coach, changing only identity', () => {
  // The legacy production shape: real squad work, no fixture link.
  const ctx = mc({ opposition: 'Mons', kickoffDate: '2026-08-22' }, { 1: 'Prop' }, ['Sub A']);
  assert.equal(ctx.matchCentreFixtureId(), '', 'starts anonymous');

  const ok = ctx.setMatchCentreFixture(MONS);
  assert.equal(ok, true, 'explicit human attribution is allowed — nothing is taken from another fixture');
  assert.equal(ctx.state.matchCentre.fixtureId, MONS);
  assert.deepEqual(ctx.state.formationNames, { 1: 'Prop' }, 'XV untouched by attribution');
  assert.deepEqual(ctx.state.benchPlayers, ['Sub A'], 'bench untouched');
  // Once linked it behaves like any linked fixture: switching away is ALLOWED
  // (fixture-scoped storage keeps the Mons work), and nothing travels.
  assert.equal(ctx.setMatchCentreFixture(AMSTEL), true);
  assert.deepEqual(ctx.state.formationNames, {}, 'the Mons sheet did not follow to Amstelveense');
});

test('the payload sources its id from the explicit selection', () => {
  const payload = fn('matchCentreFixtureId');
  assert.match(payload, /matchCentreSelectedFixture\(\)/, 'not _autoFixtureId');
  assert.equal(/_autoFixtureId/.test(payload), false);
  assert.equal((src.match(/fixtureId: matchCentreFixtureId\(\)/g) || []).length, 2,
    'both the draft and publish payloads carry it');
});

// ── THE PICKER MUST BE IN THE VISIBLE PLANNER ─────────────────────────────
// It was first placed inside the Match details block, which sits in the
// mc-grid that Core Beta marks beta-hidden (display:none !important). The
// control existed in the DOM and returned correct HTML — the earlier tests
// asserted on that returned STRING and so passed while nothing was on screen.
test('the picker lives in the visible header, not the beta-hidden grid', () => {
  const head = src.indexOf('<header class="mc10-head">');
  const grid = src.indexOf("<div class=\"mc-grid${BETA_SIMPLE_UI ? ' beta-hidden' : ''}\"");
  const call = src.indexOf('${matchCentreFixturePicker()}');
  assert.ok(head > 0 && grid > 0 && call > 0, 'all three anchors exist');
  assert.ok(call > head && call < grid,
    'the picker renders inside the always-visible matchday header, above the hidden grid');

  // Exactly one call site — one control, one home.
  assert.equal((src.match(/\$\{matchCentreFixturePicker\(\)\}/g) || []).length, 1);
});

test('the picker is reached from renderMatchday, the live planner renderer', () => {
  const start = src.indexOf('function renderMatchday(');
  const body = src.slice(start, src.indexOf('${matchCentreFixturePicker()}') + 40);
  assert.ok(body.includes('${matchCentreFixturePicker()}'),
    'renderMatchday is what safeRender(\'coach-matchday\') calls');
  assert.match(src, /safeRender\('coach-matchday',\s*\(\) => renderMatchday\(\)\)/);
});

test('the control does not depend on autopilot being enabled', () => {
  const picker = fn('matchCentreFixturePicker');
  assert.equal(/autopilot/i.test(picker), false, 'a coach with autopilot off still gets it');
});
