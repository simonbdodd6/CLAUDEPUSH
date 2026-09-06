/**
 * MEDICAL SCREEN — group-switch repaint and honesty.
 *
 * The caseload store is reset by the canonical group transition and refetched
 * — but the loader never repainted on landing, and the screen had no loading
 * branch, so after a switch the Medical screen painted the UNLOADED store as
 * "Injured 0" for a group that has open cases, and stayed that way until the
 * next unrelated interaction.
 *
 * These tests run the REAL extracted client functions (loadMedicalFromServer,
 * hydrateMedicalFromShared, medicalScreenMode, retryMedicalLoad) against a
 * scripted fetch, and pin observable behaviour:
 *
 *   - a landing that changes what is shown repaints; an identical quiet poll
 *     does not
 *   - before the server answers, the screen says LOADING, never "0 cases"
 *   - a failed first read says FAILED (with retry), never "0 cases" — while a
 *     failed background poll never blanks a caseload already on screen
 *   - a stale reply from a previous group can never overwrite the current
 *     group, however late it lands
 *   - the request still names only the operating group (&group=) — the fix
 *     changes WHEN the screen paints, never WHAT is fetched.
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

/**
 * Harness: the real functions with lexical mocks. `respond` maps a group id
 * ('' for none) to either a response object or a function returning a Promise
 * of one — deferred promises drive the race tests.
 */
function makeMedical(respond) {
  const body = `"use strict";
    const calls = { render: 0, fetches: [] };
    let _sharedMedical = { loaded: false, failed: false, cases: [], players: [] };
    const state = { activeView: 'coach', operationalGroupId: 'A', medicalRecords: {}, medicalNotes: {} };
    let _medicalAccess = true;
    function canI(p) { return p === 'medical_access' ? _medicalAccess : false; }
    function render() { calls.render++; }
    const RESPOND = __respond__;
    function fetch(url) {
      const gid = (url.match(/&group=([^&]*)/) || [])[1] || '';
      calls.fetches.push(decodeURIComponent(gid));
      const r = RESPOND[decodeURIComponent(gid)];
      const out = typeof r === 'function' ? r() : Promise.resolve(r);
      return out.then(v => v && v.__network ? Promise.reject(new Error('offline')) : v);
    }
    ${extractFn('medicalCaseToLegacy')}
    ${extractFn('hydrateMedicalFromShared')}
    ${extractFn('loadMedicalFromServer')}
    ${extractFn('medicalScreenMode')}
    ${extractFn('retryMedicalLoad')}
    return {
      calls, state,
      load: loadMedicalFromServer,
      retry: retryMedicalLoad,
      mode: medicalScreenMode,
      shared: () => _sharedMedical,
      setAccess: v => { _medicalAccess = v; },
      // The canonical group transition's medical lines, verbatim contract:
      // reset the store, drop the hydrated view, refetch under the new group.
      switchGroup: gid => {
        state.operationalGroupId = gid;
        _sharedMedical = { loaded: false, failed: false, cases: [], players: [] };
        hydrateMedicalFromShared();
        return loadMedicalFromServer().catch(() => {});
      },
    };`;
  return new Function(body.replace('__respond__', 'arguments[0]'))(respond);
}

const reply = (cases, players = []) =>
  ({ ok: true, json: async () => ({ cases, players }) });
const CASE_A = { id: 'mc-a', playerId: 'p-a', status: 'active', condition: 'A-group ankle' };
const CASE_B = { id: 'mc-b', playerId: 'p-b', status: 'active', condition: 'B-group shoulder' };

test('cold load: LOADING until the reply lands, then the caseload renders — exactly one repaint', async () => {
  const h = makeMedical({ A: reply([CASE_A], [{ id: 'p-a' }]) });
  assert.equal(h.mode(), 'loading', 'an unloaded store is never a healthy squad');
  await h.load();
  assert.equal(h.mode(), 'ready');
  assert.equal(h.shared().cases[0].id, 'mc-a');
  assert.equal(h.state.medicalRecords['p-a'].currentInjury, 'A-group ankle', 'view model hydrated');
  assert.equal(h.calls.render, 1, 'the landing repainted');
});

test('an identical quiet poll adopts silently — no repaint to stamp on an open editor', async () => {
  const h = makeMedical({ A: reply([CASE_A]) });
  await h.load();
  await h.load();
  assert.equal(h.calls.render, 1, 'second identical reply did not repaint');
});

test('group switch A→B→A: each landing renders the CURRENT group, stale views never linger', async () => {
  const h = makeMedical({ A: reply([CASE_A]), B: reply([CASE_B]) });
  await h.load();
  assert.equal(h.state.medicalRecords['p-a'].currentInjury, 'A-group ankle');

  await h.switchGroup('B');
  assert.equal(h.shared().cases[0].id, 'mc-b');
  assert.equal(h.state.medicalRecords['p-b'].currentInjury, 'B-group shoulder');
  assert.equal(h.state.medicalRecords['p-a'], undefined, 'no stale A record in B');

  await h.switchGroup('A');
  assert.equal(h.shared().cases[0].id, 'mc-a', 'A restored');
  assert.equal(h.state.medicalRecords['p-b'], undefined, 'no stale B record back in A');
});

test('a group with cases → a group with none: the empty answer is a LOADED zero, and it repaints', async () => {
  const h = makeMedical({ A: reply([CASE_A]), B: reply([], []) });
  await h.load();
  const paintsAfterA = h.calls.render;
  await h.switchGroup('B');
  assert.equal(h.mode(), 'ready', 'a loaded empty caseload is a real answer');
  assert.deepEqual(h.shared().cases, []);
  assert.deepEqual(h.state.medicalRecords, {}, 'nothing of A survives');
  assert.ok(h.calls.render > paintsAfterA, 'the switch to the empty group repainted');
});

test('race: a previous group\'s late reply can never overwrite the current group', async () => {
  let releaseA;
  const h = makeMedical({
    A: () => new Promise(r => { releaseA = () => r(reply([CASE_A])); }),
    B: reply([CASE_B]),
  });
  const inflightA = h.load();          // A request parked in flight
  const switched = h.switchGroup('B'); // operator moves on; B lands first
  await switched;
  assert.equal(h.shared().cases[0].id, 'mc-b');
  releaseA();                          // A's stale reply arrives late
  await inflightA;
  await new Promise(r => setImmediate(r));
  assert.equal(h.shared().cases[0].id, 'mc-b', 'the late A reply was discarded');
  assert.equal(h.state.medicalRecords['p-a'], undefined, 'no A record resurrected');
});

test('rapid A→B→C with out-of-order replies still ends on C', async () => {
  let releaseB;
  const h = makeMedical({
    A: reply([CASE_A]),
    B: () => new Promise(r => { releaseB = () => r(reply([CASE_B])); }),
    C: reply([{ id: 'mc-c', playerId: 'p-c', status: 'active', condition: 'C calf' }]),
  });
  await h.load();
  const b = h.switchGroup('B');        // parked
  const c = h.switchGroup('C');        // lands immediately
  await c;
  releaseB();
  await b;
  await new Promise(r => setImmediate(r));
  assert.equal(h.shared().cases[0].id, 'mc-c', 'the final selection wins');
});

test('a failed FIRST read says so — never a healthy-looking zero — and retry recovers', async () => {
  let failFirst = true;
  const h = makeMedical({ A: () => Promise.resolve(failFirst ? { ok: false } : reply([CASE_A])) });
  await h.load();
  assert.equal(h.mode(), 'failed');
  assert.equal(h.calls.render, 1, 'the failure repainted into the failed state');
  failFirst = false;
  await h.retry();
  await new Promise(r => setImmediate(r));
  assert.equal(h.mode(), 'ready');
  assert.equal(h.shared().cases[0].id, 'mc-a');
});

test('a failed background poll keeps the caseload already on screen', async () => {
  let fail = false;
  const h = makeMedical({ A: () => Promise.resolve(fail ? { ok: false } : reply([CASE_A])) });
  await h.load();
  fail = true;
  await h.load();
  assert.equal(h.mode(), 'ready', 'good data is never blanked by a failed poll');
  assert.equal(h.shared().cases[0].id, 'mc-a');
});

test('a network error before anything loaded also reads as FAILED, not as zero', async () => {
  const h = makeMedical({ A: { __network: true } });
  await h.load();
  assert.equal(h.mode(), 'failed');
});

test('the request still names only the operating group — the fix never widens the fetch', async () => {
  const h = makeMedical({ A: reply([CASE_A]), B: reply([CASE_B]) });
  await h.load();
  await h.switchGroup('B');
  assert.deepEqual(h.calls.fetches, ['A', 'B'], 'one scoped request per group, nothing club-wide');
});

test('without medical access nothing fetches and the roster-flag view stays untouched', async () => {
  const h = makeMedical({ A: reply([CASE_A]) });
  h.setAccess(false);
  await h.load();
  assert.deepEqual(h.calls.fetches, [], 'no server read without the permission');
  assert.equal(h.mode(), 'ready', 'the non-medical view renders as it always has');
});
