/**
 * Coach Availability — the currently-selected board re-renders after a live
 * availability refresh WITHOUT switching sessions.
 *
 * Root cause: refreshLiveAvailability already re-renders (renderMessageCenter),
 * but while staying on a session it was only auto-invoked by the 30s poll. Fix:
 * a cheap board-only poll tick (5s) that repaints the selected board when the
 * resolved data changed — so tue/thu/game all update live without switching.
 *
 * Drives the REAL extracted refreshLiveAvailability + the REAL sessionRows.
 */
import { test } from 'node:test';
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

// Harness: run the REAL refreshLiveAvailability with mocked I/O. Returns counters.
function makeRefresh(resolvedSequence) {
  let call = 0;
  const body = `"use strict";
    const calls = { render: 0, panels: 0, fetches: 0 };
    let _resolvedAvailability = {};
    let _availLastSync = null, _availRosterLinkedAt = 0;
    const state = { players: [{ name:'P', userId:'uid' }] };
    const document = { getElementById: () => null };
    const SEQ = ${JSON.stringify(resolvedSequence)};
    let _i = 0;
    const fetch = () => { calls.fetches++; const r = SEQ[Math.min(_i++, SEQ.length-1)]; return Promise.resolve({ ok:true, json: async () => ({ resolved: r }) }); };
    async function ensureCoachRosterIdentityLinked(){}
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
    return { run: (opts) => refreshLiveAvailability(opts), calls, sig: () => JSON.stringify(_resolvedAvailability) };
  `;
  return new Function(body)();
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('a normal refresh re-renders the selected board (renderMessageCenter called) and applies resolved', async () => {
  const h = makeRefresh([{ uid: { tue: { response: 'maybe', respondedAt: 't1' } } }]);
  await h.run();
  await wait(80);
  assert.equal(h.calls.render, 1, 'board re-rendered after refresh — no session switch needed');
  assert.ok(h.calls.panels > 0, 'full refresh also reloads side panels');
  assert.match(h.sig(), /"tue"/, 'resolved data applied');
});

test('board-only poll tick repaints ONLY when resolved data changed (no idle churn)', async () => {
  // tick 1: data appears -> render; tick 2: identical -> NO render; tick 3: changed -> render
  const h = makeRefresh([
    { uid: { tue: { response: 'available', respondedAt: 't1' } } },
    { uid: { tue: { response: 'available', respondedAt: 't1' } } },
    { uid: { tue: { response: 'maybe', respondedAt: 't2' } } },
  ]);
  await h.run({ boardOnly: true }); // change ({} -> tue) => render
  await h.run({ boardOnly: true }); // identical => no render
  await h.run({ boardOnly: true }); // changed => render
  assert.equal(h.calls.render, 2, 'repainted only on the two changes, not the identical tick');
});

test('board-only tick does NOT trigger the heavier side-panel reloads', async () => {
  const h = makeRefresh([{ uid: { game: { response: 'unavailable', respondedAt: 't1' } } }]);
  await h.run({ boardOnly: true });
  await wait(80);
  assert.equal(h.calls.panels, 0, 'board-only tick skips schedules/templates/log reloads');
  assert.equal(h.calls.render, 1, 'but still repaints the board on change');
});

// ── sessionRows parity: the selected board reflects latest for tue/thu/game ──
function makeSessionRows(resolved, players) {
  const body = `"use strict";
    let _resolvedAvailability = ${JSON.stringify(resolved)};
    function canonicalVisiblePlayers(){ return ${JSON.stringify(players)}; }
    ${extractFn('sessionKey')}
    ${extractFn('sessionReasonKey')}
    ${extractFn('normalizeSessionId')}
    ${extractFn('liveAvailabilityPlayerKeys')}
    ${extractFn('resolvedAnswerFor')}
    ${extractFn('sessionRows')}
    return sessionRows;`;
  return new Function(body)();
}
test('selected board reflects latest for tue/thu/game from the refreshed resolved map', () => {
  const resolved = { uid: { tue:{response:'available',respondedAt:'t'}, thu:{response:'maybe',respondedAt:'t'}, game:{response:'unavailable',respondedAt:'t'} } };
  const sr = makeSessionRows(resolved, [{ name:'P', userId:'uid' }]);
  assert.equal(sr('tue')[0].status, 'available');
  assert.equal(sr('thu')[0].status, 'maybe');
  assert.equal(sr('game')[0].status, 'unavailable');
});

test('no duplicate player rows — board renders one row per canonical player', () => {
  const sr = makeSessionRows({ uid: { tue:{response:'available',respondedAt:'t'} } }, [{ name:'P', userId:'uid' }]);
  const rows = sr('tue').filter(r => r.player.name === 'P');
  assert.equal(rows.length, 1, 'exactly one row per player');
});

// ── static: switching sessions still re-renders; poll is prompt + board-only ──
test('switching sessions still re-renders (openMessageDetail -> render)', () => {
  const fn = extractFn('openMessageDetail');
  assert.match(fn, /state\.messageDetail = id/, 'sets selected session');
  assert.match(fn, /render\(\)/, 'and re-renders');
});

test('live poll is prompt and board-only', () => {
  const m = src.match(/_availPollTimer = setInterval\([\s\S]*?\}, (\d+)\);/);
  assert.ok(m && Number(m[1]) <= 6000, `poll interval should be <= 6000ms (got ${m && m[1]})`);
  assert.match(src, /refreshLiveAvailability\(\{ boardOnly: true \}\)/, 'poll uses a board-only tick');
});
