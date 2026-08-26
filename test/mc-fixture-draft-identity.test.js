/**
 * MATCH CENTRE FIXTURE/DRAFT IDENTITY — the Seniors→U18 corruption.
 *
 * Two real production failures pinned here:
 *
 *  RC1 — RECLASSIFICATION: after a group switch, the previously selected
 *  Seniors fixture resolves as "not linked" (it is outside the new group's
 *  context) while the Seniors sheet stayed in memory. Picking a U18 fixture
 *  then hit the ATTRIBUTION branch ("unlinked work gains an identity") and
 *  saved the Seniors XV under the U18 fixture key.
 *
 *  RC2 — EMPTY OVERWRITE: switching fixtures flushed the in-memory sheet to
 *  the OUTGOING fixture unconditionally. On a fresh device (or fast
 *  Next/Next navigation before async hydration), that sheet is transient
 *  emptiness — production showed three Seniors drafts rewritten empty within
 *  five seconds.
 *
 * The fix is ONE identity: _mcSheetFixtureId — which fixture the in-memory
 * sheet belongs to ('' = anonymous workspace, null = transitional/unhydrated).
 * Saves and flushes require binding === target; attribution requires the
 * anonymous binding; group changes flush-the-bound-then-detach; hydration
 * completes the binding.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.mc-identity.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

const SEN_FX = 'fx_sen_mons', SEN_FX2 = 'fx_sen_amst', SEN_FX3 = 'fx_sen_fram', U18_FX = 'fx_u18_ande';
const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9';
const ALL_FIXTURES = [
  { id: SEN_FX, opposition: 'Mons', date: '2026-08-22', groupId: '' },
  { id: SEN_FX2, opposition: 'Amstelveense', date: '2026-08-29', groupId: '' },
  { id: SEN_FX3, opposition: 'Frameries', date: '2026-09-13', groupId: '' },
  { id: U18_FX, opposition: 'ANDE', date: '2026-09-05', groupId: U18 },
];

/**
 * A live client slice around the REAL identity functions. `contextGroup`
 * controls which group's fixtures are "in context" (the group switcher's
 * effect); `binding` seeds _mcSheetFixtureId (product boot init = persisted
 * fixture; null = transitional).
 */
function mcHarness({ matchCentre = {}, formationNames = {}, benchPlayers = [], contextGroup = SEN, binding }) {
  const state = {
    matchCentre: structuredClone(matchCentre),
    fixtures: structuredClone(ALL_FIXTURES),
    formationNames: structuredClone(formationNames),
    benchPlayers: [...benchPlayers], fphotoIds: {},
    operationalGroupId: contextGroup,
  };
  const seed = binding !== undefined ? binding : String(matchCentre.fixtureId || '');
  return new Function(`
    "use strict";
    const state = arguments[0];
    const posts = arguments[1];
    function showToast() {}
    function saveState() {}
    function render() {}
    function esc(v) { return String(v == null ? '' : v); }
    function isCoach() { return true; }
    let _coachDraftSaveTimer = null;
    const _adminData = { structure: null };
    function matchCentreSideId() { return ''; }
    // Group context: only the operating group's fixtures resolve — the exact
    // post-switch condition (a Seniors fixture is invisible from U18).
    function contextFixtures() {
      const gid = state.operationalGroupId;
      return (state.fixtures || []).filter(f => (String(f.groupId || '') || ${JSON.stringify(SEN)}) === gid);
    }
    const fetch = async (url, opts) => {
      if ((opts || {}).method === 'POST') posts.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ ok: true, draft: null, squad: null }) };
    };
    function mcLoadOtherSideSelections() {}
    function mcRefreshPublishedForFixture() {}
    function mcHydrateSelectedFixture() {}          // async hydration NOT landing — the transitional window
    let _mcSheetFixtureId = ${JSON.stringify(seed)};
    // The sheet is also bound to its SIDE (Premier vs Premier Development share
    // a fixture). This harness exercises the sideless path, so both the binding
    // and the live side are '' — the guard is satisfied and fixture behaviour
    // is unchanged.
    let _mcSheetSideId = '';
    function matchCentreSideId() { return ''; }
    ${fn('matchCentreSelectedFixture')}
    ${fn('matchCentreFixtureId')}
    ${fn('matchCentreHasSquadWork')}
    ${fn('mcApplyFixtureDisplay')}
    ${fn('mcClearFixtureDisplay')}
    ${fn('mcDetachFixture')}
    ${fn('mcFlushDraftNow')}
    ${fn('saveCoachDraft')}
    ${fn('setMatchCentreFixture')}
    return {
      state,
      select: id => setMatchCentreFixture(id),
      flush: () => mcFlushDraftNow(),
      detach: () => mcDetachFixture(),
      binding: () => _mcSheetFixtureId,
      setBinding: v => { _mcSheetFixtureId = v; },
      switchGroup: gid => {
        // the REAL setOperationalGroup MC block, driven directly
        if (state.operationalGroupId !== gid) {
          const mcCurrent = matchCentreFixtureId();
          if (mcCurrent && String(_mcSheetFixtureId ?? '\\u0000') === mcCurrent) mcFlushDraftNow();
          mcDetachFixture();
        }
        state.operationalGroupId = gid;
      },
    };
  `)(state, arguments[0].posts = arguments[0].posts || []);
}

const SEN_SHEET = { '1': 'Senior Prop', '9': 'Senior Nine', '10': 'Senior Ten' };

// ─── RC1 — the Seniors→U18 reclassification is dead ────────────────────────
test('RC1: a Seniors sheet surviving into a U18 shell can NEVER be attributed to a U18 fixture', () => {
  const posts = [];
  const h = mcHarness({ posts, matchCentre: { fixtureId: SEN_FX }, formationNames: SEN_SHEET, contextGroup: U18 });
  // The exact broken state: U18 context, Seniors fixture persisted (resolves
  // as "not linked"), Seniors sheet in memory, binding = the Seniors fixture.
  assert.equal(h.state.operationalGroupId, U18);
  const ok = h.select(U18_FX);
  assert.equal(ok, true, 'selecting the U18 fixture itself succeeds');
  assert.equal(posts.length, 0, 'NOTHING was saved — no attribution flush, no misfiled Seniors XV');
  assert.deepEqual(h.state.formationNames, {}, 'the Seniors sheet did not travel into the U18 fixture');
  assert.equal(h.binding(), null, 'the new selection is transitional until its own draft hydrates');
});

test('RC1 control: the genuine ANONYMOUS workspace can still be linked, changing identity only', () => {
  const posts = [];
  const h = mcHarness({ posts, matchCentre: { fixtureId: '' }, formationNames: SEN_SHEET, contextGroup: SEN, binding: '' });
  const ok = h.select(SEN_FX);
  assert.equal(ok, true);
  assert.equal(posts.length, 1, 'attribution flushes ONCE');
  assert.equal(posts[0].data.fixtureId, SEN_FX, 'under the newly linked fixture');
  assert.deepEqual(posts[0].data.formationNames, SEN_SHEET, 'with the work intact');
  assert.deepEqual(h.state.formationNames, SEN_SHEET, 'sheet stays put');
  assert.equal(h.binding(), SEN_FX, 'the work now belongs to that fixture');
});

// ─── RC2 — the empty-burst destruction is dead ─────────────────────────────
test('RC2: fast Next/Next navigation before hydration writes NOTHING over stored drafts (the production burst)', () => {
  const posts = [];
  const h = mcHarness({ posts, matchCentre: { fixtureId: SEN_FX }, contextGroup: SEN, binding: null }); // fresh device, unhydrated
  h.select(SEN_FX2);   // Mons → Amstelveense
  h.select(SEN_FX3);   // → Frameries
  h.select(SEN_FX);    // → back to Mons
  assert.equal(posts.length, 0, 'zero draft writes — three stored Seniors drafts survive untouched');
  assert.equal(h.binding(), null, 'still transitional until a hydration completes');
});

test('a HYDRATED sheet still flushes to its own outgoing fixture on switch — nothing is lost', () => {
  const posts = [];
  const h = mcHarness({ posts, matchCentre: { fixtureId: SEN_FX }, formationNames: SEN_SHEET, contextGroup: SEN, binding: SEN_FX });
  h.select(SEN_FX2);
  assert.equal(posts.length, 1, 'exactly one flush');
  assert.equal(posts[0].data.fixtureId, SEN_FX, 'filed under the OUTGOING fixture');
  assert.deepEqual(posts[0].data.formationNames, SEN_SHEET, 'with the full sheet');
  assert.deepEqual(h.state.formationNames, {}, 'incoming fixture starts clean');
});

test('an INTENTIONALLY cleared sheet is still saveable — clearing is work, transitional emptiness is not', () => {
  const posts = [];
  // Bound to the fixture (hydration completed), user then cleared every slot.
  const h = mcHarness({ posts, matchCentre: { fixtureId: SEN_FX }, formationNames: {}, contextGroup: SEN, binding: SEN_FX });
  h.select(SEN_FX2);
  assert.equal(posts.length, 1, 'the deliberate empty state IS flushed');
  assert.equal(posts[0].data.fixtureId, SEN_FX);
  assert.deepEqual(posts[0].data.formationNames, {}, 'stored as genuinely cleared');
});

// ─── The save choke point itself ───────────────────────────────────────────
test('saveCoachDraft refuses any sheet whose binding does not match the save target', () => {
  const posts = [];
  const h = mcHarness({ posts, matchCentre: { fixtureId: SEN_FX }, formationNames: SEN_SHEET, contextGroup: SEN, binding: SEN_FX2 });
  h.flush();
  assert.equal(posts.length, 0, 'mistargeted save refused outright');
  h.setBinding(SEN_FX);
  h.flush();
  assert.equal(posts.length, 1, 'matching binding saves normally');
  assert.equal(posts[0].data.fixtureId, SEN_FX);
});

// ─── Group switch: flush the bound sheet, then a full detach ───────────────
test('switching groups persists the bound outgoing sheet, then detaches fixture+sheet+binding completely', () => {
  const posts = [];
  const h = mcHarness({ posts, matchCentre: { fixtureId: SEN_FX }, formationNames: SEN_SHEET, contextGroup: SEN, binding: SEN_FX });
  h.switchGroup(U18);
  assert.equal(posts.length, 1, 'one goodbye flush');
  assert.equal(posts[0].data.fixtureId, SEN_FX, 'under the Seniors fixture, while Seniors context was in force');
  assert.deepEqual(posts[0].data.formationNames, SEN_SHEET);
  assert.equal(h.state.matchCentre.fixtureId, '', 'no fixture selected in the new group');
  assert.deepEqual(h.state.formationNames, {}, 'no sheet survives');
  assert.equal(h.binding(), '', 'fresh anonymous workspace');
});

test('switching groups with an UNHYDRATED sheet flushes nothing and still detaches', () => {
  const posts = [];
  const h = mcHarness({ posts, matchCentre: { fixtureId: SEN_FX }, contextGroup: SEN, binding: null });
  h.switchGroup(U18);
  assert.equal(posts.length, 0, 'transitional emptiness is never written');
  assert.equal(h.state.matchCentre.fixtureId, '');
});

// ─── Structural pins: the wiring exists in the live bundle ─────────────────
test('group transitions and PWA restore paths are wired: setOperationalGroup flush+detach, sync detach, renderMatchday self-heal, boot binding init', () => {
  const sog = fn('setOperationalGroup');
  assert.match(sog, /_mcSheetFixtureId[\s\S]*mcFlushDraftNow\(\)/, 'guarded outgoing flush before the group changes');
  assert.match(sog, /mcDetachFixture\(\)/, 'detach on user group switch');
  const sync = fn('syncTrainingStateToGroup');
  assert.match(sync, /mcDetachFixture/, 'capacity/adoption transitions detach too');
  const rmd = fn('renderMatchday');
  assert.match(rmd, /matchCentreSelectedFixture\(\)/, 'self-heal consults the context');
  assert.match(rmd, /mcDetachFixture\(\)/, 'a provably-foreign persisted fixture detaches on render');
  assert.match(src, /let _mcSheetFixtureId = String\(\(state\.matchCentre \|\| \{\}\)\.fixtureId \|\| ''\);/,
    'boot init binds the persisted sheet to its persisted fixture');
  const hyd = fn('mcHydrateSelectedFixture');
  assert.match(hyd, /_mcSheetFixtureId = String\(id\)/, 'hydration completes the binding (stale-guarded)');
  const lcd = fn('loadCoachDraft');
  assert.match(lcd, /_mcSheetFixtureId = String\(draft\.fixtureId \|\| ''\)/, 'adopted drafts bind to their OWN stored fixture');
});

// ─── Server boundary (real publish handler) ────────────────────────────────
const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');
const { SESSION_COOKIE } = store;
function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function callPublish(query, body, session, method = 'GET') {
  const r = res();
  await publishHandler({ method, query, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` }, body: body || {} }, r);
  return r;
}

async function seedClub() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: 'boitsfort', name: 'Boitsfort' }, { id: 'other-club', name: 'Other FC' }]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-c', teamId: 'boitsfort', userId: 'u-coach', role: 'coach', staffLevel: 'head', isOwner: true, status: 'active', accessProfile: 'full' }]));
  kv.set('app:identity:users', JSON.stringify([{ id: 'u-coach', email: 'c@b.test', displayName: 'Coach' }]));
  kv.set('app:club:boitsfort', JSON.stringify({ clubName: 'Boitsfort', fixtures: ALL_FIXTURES }));
  kv.set('app:club:other-club', JSON.stringify({ clubName: 'Other', fixtures: [{ id: 'fx_foreign', opposition: 'X', date: '2026-09-01' }] }));
  return store.createSession({ userId: 'u-coach', teamId: 'boitsfort', role: 'coach' });
}

test('server: a draft save validates fixture ownership — forged/cross-club fixtureIds are refused with zero writes', async () => {
  const coach = await seedClub();
  const good = await callPublish({}, { type: 'draft', data: { fixtureId: SEN_FX, formationNames: SEN_SHEET } }, coach, 'POST');
  assert.equal(good.statusCode, 200);
  assert.ok(kv.has(`app:publish:boitsfort:fixture:${SEN_FX}:draft:u-coach`), 'landed in the named fixture key');

  const before = JSON.stringify([...kv.entries()].sort());
  const foreign = await callPublish({}, { type: 'draft', data: { fixtureId: 'fx_foreign', formationNames: SEN_SHEET } }, coach, 'POST');
  assert.ok(foreign.statusCode >= 400, `cross-club fixture refused (${foreign.statusCode})`);
  const forged = await callPublish({}, { type: 'draft', data: { fixtureId: 'fx_does_not_exist', formationNames: SEN_SHEET } }, coach, 'POST');
  assert.ok(forged.statusCode >= 400, 'unknown fixture refused');
  assert.equal(JSON.stringify([...kv.entries()].sort()), before, 'refusals mutate nothing');
});

test('server: a client-supplied groupId can never reclassify a draft — destination comes from the validated fixture only', async () => {
  const coach = await seedClub();
  const r = await callPublish({}, { type: 'draft', data: { fixtureId: SEN_FX, groupId: U18, group: U18, formationNames: SEN_SHEET } }, coach, 'POST');
  assert.equal(r.statusCode, 200);
  assert.ok(kv.has(`app:publish:boitsfort:fixture:${SEN_FX}:draft:u-coach`), 'stored under the FIXTURE, exactly');
  const stored = JSON.parse(kv.get(`app:publish:boitsfort:fixture:${SEN_FX}:draft:u-coach`));
  assert.equal(stored.fixtureId, SEN_FX, 'identity is the validated fixture');
});

test('server: reading a fixture draft returns only that fixture\'s own record; legacy anonymous drafts are never adopted by a fixture', async () => {
  const coach = await seedClub();
  await callPublish({}, { type: 'draft', data: { fixtureId: '', formationNames: { '1': 'Anon Prop' } } }, coach, 'POST'); // anonymous legacy
  const forU18 = await callPublish({ type: 'draft', fixture: U18_FX }, null, coach);
  assert.equal(forU18.statusCode, 200);
  assert.equal(forU18.body.draft, null, 'no cross-adoption of the anonymous draft');
});
