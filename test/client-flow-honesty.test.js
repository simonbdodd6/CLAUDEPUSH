/**
 * CLIENT FLOW HONESTY — four residues of the fake-success class.
 *
 *  A1  refreshLiveAvailability treated every failure (500, lapsed session,
 *      network drop) as a successful EMPTY sync: it stamped the map, the
 *      group and the "Synced HH:MM" chip, so one bad Monday-morning fetch
 *      painted the whole squad as No Reply under a green chip, fed everyone
 *      to the chase list, and made the Overview read an outage as a quiet
 *      week. A failed read now says so and stamps NOTHING.
 *
 *  B1  The player Home's three fixture deep-links (quick action, Next
 *      Fixture card, Coming Up card) dead-ended in "You do not have access
 *      to that section": the fixtures nav entry was deliberately removed,
 *      but the gate contradicted the documented "still reachable via
 *      deep-links" intent. playerSectionAllowed() now carries that intent.
 *
 *  B2  The fixture availability board drew from the whole device roster and
 *      raw state.fixtures — the one fixture surface that escaped Build S's
 *      group scoping — and an open board survived a group switch. Its pool
 *      and fixture resolution now go through the operational helpers and
 *      fail closed.
 *
 *  B4  ensureMatchCentreTeams latched _mcTeamsAttempted before fetching and
 *      never released it on failure, so one cold-start 500 left Match Centre
 *      sideless for the whole session. The latch now releases, exactly like
 *      the documented loadTrainingSchedule fix.
 *
 * All tests compile the REAL functions out of index.html.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('(', start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === '(') pd++; else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  let depth = 0; i = src.indexOf('{', i);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ── A1: failed availability sync must not masquerade as fresh ───────────────
// SEQ entries: {resolved:{...}} succeed; {fail:true} = non-ok; {network:true} throws.
function makeRefresh(seq) {
  const body = `"use strict";
    const calls = { render: 0, panels: 0, fetches: 0 };
    let _resolvedAvailability = {};
    let _resolvedAvailabilityGroup = null;
    let _availLastSync = null, _availRosterLinkedAt = 0;
    const state = { players: [{ name:'P', userId:'uid' }], operationalGroupId: 'grp-a' };
    const chip = { textContent: '', className: '' };
    const document = { getElementById: id => id === 'avail-refresh-ts' ? chip : null };
    const SEQ = ${JSON.stringify(seq)};
    let _i = 0;
    const fetch = () => {
      calls.fetches++;
      const r = SEQ[Math.min(_i++, SEQ.length - 1)];
      if (r.network) return Promise.reject(new Error('offline'));
      if (r.fail) return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve({ ok: true, json: async () => ({ resolved: r.resolved }) });
    };
    async function ensureCoachRosterIdentityLinked(){}
    function operationalGroups(){ return [{ id: 'grp-a' }]; }
    function saveState(){}
    function renderMessageCenter(){ calls.render++; }
    function renderAudiencePicker(){ calls.panels++; }
    function renderPushStatusCard(){ calls.panels++; }
    function loadLiveSchedules(){ calls.panels++; }
    function loadLiveTemplates(){ calls.panels++; }
    function loadLiveLog(){ calls.panels++; }
    ${extractFn('sessionKey')}
    ${extractFn('liveAvailabilityPlayerKeys')}
    ${extractFn('refreshLiveAvailability')}
    return { run: o => refreshLiveAvailability(o), calls, chip,
      snap: () => ({ map: JSON.stringify(_resolvedAvailability), group: _resolvedAvailabilityGroup, sync: _availLastSync }) };
  `;
  return new Function(body)();
}

test('A1 — a failed first sync stamps NOTHING and says so on the chip', async () => {
  const h = makeRefresh([{ fail: true }]);
  await h.run(); await wait(40);
  const s = h.snap();
  assert.equal(s.sync, null, 'no sync stamp from a failed read');
  assert.equal(s.group, null, 'no group stamp — downstream honesty branches stay live');
  assert.notEqual(h.chip.className, 'msg-chip available', 'chip must not turn green');
  assert.match(h.chip.textContent, /fail/i, 'the chip admits the failure');
});

test('A1 — a failure AFTER a good sync keeps the good map and stamp', async () => {
  const h = makeRefresh([
    { resolved: { uid: { tue: { response: 'available', respondedAt: 't1' } } } },
    { fail: true },
  ]);
  await h.run(); await wait(40);
  const good = h.snap();
  assert.match(good.map, /"tue"/, 'first sync applied');
  assert.ok(good.sync, 'first sync stamped');

  await h.run(); await wait(40);
  const after = h.snap();
  assert.equal(after.map, good.map, 'the good map is never blanked by a failed poll');
  assert.equal(after.sync, good.sync, 'the stamp still names the LAST REAL sync');
  assert.match(h.chip.textContent, /fail/i, 'and the chip says so');
});

test('A1 — a network throw behaves exactly like a refused response', async () => {
  const h = makeRefresh([{ network: true }]);
  await h.run(); await wait(40);
  assert.equal(h.snap().sync, null);
  assert.notEqual(h.chip.className, 'msg-chip available');
});

test('A1 — a real success still stamps, applies and repaints as before', async () => {
  const h = makeRefresh([{ resolved: { uid: { tue: { response: 'maybe', respondedAt: 't1' } } } }]);
  await h.run(); await wait(60);
  const s = h.snap();
  assert.match(s.map, /"maybe"/);
  assert.equal(s.group, 'grp-a');
  assert.ok(s.sync);
  assert.equal(h.chip.className, 'msg-chip available');
  assert.equal(h.calls.render, 1);
});

// ── B1: player fixture deep-links are reachable, other sections stay gated ──
function makeSectionGate({ medical = false, performance = false } = {}) {
  const body = `"use strict";
    const playerSections = [["home","Home"],["messages","Messages"],["availability","Availability"],["week","Training"]];
    function canI(p){ return p === 'medical_access' ? ${medical} : false; }
    function canUseFeature(f){ return f === 'performance' ? ${performance} : false; }
    ${extractFn('playerSectionsFor')}
    ${extractFn('playerSectionAllowed')}
    return { allowed: playerSectionAllowed };
  `;
  return new Function(body)();
}

test('B1 — the fixtures deep-link opens for players even though it has no nav entry', () => {
  const h = makeSectionGate();
  assert.equal(h.allowed('fixtures'), true, 'Next Fixture / Coming Up / View Fixtures all route');
  assert.equal(h.allowed('home'), true, 'nav sections still allowed');
});

test('B1 — everything else stays gated exactly as before', () => {
  const h = makeSectionGate();
  assert.equal(h.allowed('account'), false, 'no accidental widening');
  assert.equal(h.allowed('medical'), false, 'medical still needs its grant');
  assert.equal(makeSectionGate({ medical: true }).allowed('medical'), true);
  assert.equal(h.allowed('performance'), false, 'performance still needs entitlement');
});

// ── B2: fixture availability board pool + fixture come from the context ─────
function makeBoardScope() {
  const body = `"use strict";
    const state = {
      activeView: 'coach',
      players: [
        { id: 'p-own', name: 'Own Group', status: 'active' },
        { id: 'p-foreign', name: 'Foreign Group', status: 'active' },
      ],
      fixtures: [
        { id: 'fx-own', opposition: 'Own Opp', groupId: 'grp-a' },
        { id: 'fx-foreign', opposition: 'Foreign Opp', groupId: 'grp-b' },
      ],
    };
    function operationalPlayers(){ return state.players.filter(p => p.id === 'p-own'); }
    function contextFixtures(){ return state.fixtures.filter(f => f.groupId === 'grp-a'); }
    function activeRosterPlayers(list){ return (list || []).filter(p => p.status === 'active'); }
    ${extractFn('fixtureAvailBoardPlayers')}
    ${extractFn('fixtureAvailBoardFixture')}
    return { players: fixtureAvailBoardPlayers, fixture: fixtureAvailBoardFixture, state };
  `;
  return new Function(body)();
}

test('B2 — the board pool is the OPERATIONAL roster, not the whole device roster', () => {
  const h = makeBoardScope();
  assert.deepEqual(h.players().map(p => p.id), ['p-own'], 'foreign-group rows never listed');
});

test('B2 — a board carried across a group switch fails closed to "not found"', () => {
  const h = makeBoardScope();
  assert.ok(h.fixture('fx-own'), 'own-context fixture resolves');
  assert.equal(h.fixture('fx-foreign'), null, 'a foreign fixture is not resolved, so the board cannot render it');
});

test('B2 — the player view keeps its own (server-scoped) roster behaviour', () => {
  const h = makeBoardScope();
  h.state.activeView = 'player';
  assert.deepEqual(h.players().map(p => p.id), ['p-own', 'p-foreign'],
    'player view reads state.players, which the server already scopes');
});

// ── B4: a failed matchday-teams fetch must not latch for the session ────────
function makeMcTeams(seq) {
  const body = `"use strict";
    const calls = { fetches: 0, renders: 0 };
    let _mcTeams = null;
    let _mcTeamsAttempted = false;
    const SEQ = ${JSON.stringify(seq)};
    let _i = 0;
    const fetch = () => {
      calls.fetches++;
      const r = SEQ[Math.min(_i++, SEQ.length - 1)];
      if (r.network) return Promise.reject(new Error('offline'));
      if (r.fail) return Promise.resolve({ ok: false, json: async () => ({}) });
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, groups: r.groups || [], teams: r.teams || [] }) });
    };
    function render(){ calls.renders++; }
    ${extractFn('ensureMatchCentreTeams')}
    return { ensure: ensureMatchCentreTeams, calls,
      snap: () => ({ teams: _mcTeams, attempted: _mcTeamsAttempted }) };
  `;
  return new Function(body)();
}

test('B4 — a refused reply releases the latch so the next render retries', async () => {
  const h = makeMcTeams([{ fail: true }, { groups: [{ id: 'g' }], teams: [{ id: 't', groupId: 'g' }] }]);
  h.ensure(); await wait(30);
  assert.equal(h.snap().teams, null);
  assert.equal(h.snap().attempted, false, 'the failure released the latch');

  h.ensure(); await wait(30);
  assert.ok(h.snap().teams, 'the retry loaded the sides');
  assert.equal(h.calls.fetches, 2);
});

test('B4 — a network throw also releases the latch', async () => {
  const h = makeMcTeams([{ network: true }, { groups: [], teams: [] }]);
  h.ensure(); await wait(30);
  assert.equal(h.snap().attempted, false);
});

test('B4 — while a load is in flight, no duplicate request is started', async () => {
  const h = makeMcTeams([{ groups: [], teams: [] }]);
  h.ensure(); h.ensure();
  await wait(30);
  assert.equal(h.calls.fetches, 1, 'the latch still prevents concurrent duplicates');
});
