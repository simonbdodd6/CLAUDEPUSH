/**
 * PUBLISH RESULT HONESTY (FIX-B-1).
 *
 * publishSquad used to flip state.matchCentre.published = true, saveState, fire
 * syncSquadToServer().catch(()=>{}) (fire-and-forget, res.ok never read) and then
 * UNCONDITIONALLY push players + toast "Squad published ✓" — so an assistant the
 * server 403'd was told the squad was published, and a club-wide push fired,
 * while nothing was actually stored.
 *
 * Now publishSquad awaits syncSquadToServer (which returns {ok,status,error}) and
 * only commits published + notifies + claims success on ok; a 403/4xx/5xx/network
 * failure keeps the working sheet as a draft, sends NO push, and surfaces the
 * server's error.
 *
 * Drives the REAL publishSquad + REAL syncSquadToServer with a controllable fetch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

// Run the REAL publishSquad against a fetch that answers with the given HTTP
// outcome. `net` = throw (offline). Returns the post-run state + the spy calls.
async function runPublish({ status = 200, error = '', net = false, startPublished = false } = {}) {
  const calls = { push: [], toast: [], render: 0, save: 0, fetch: [] };
  const body =
    '"use strict";\n' +
    'const CALLS = arguments[0], CFG = arguments[1];\n' +
    'const state = { matchCentre: { published: CFG.startPublished, opposition: "Mons", kickoffDate: "2026-08-22" },' +
    '  formationNames: { 1: "Starter One" }, benchPlayers: ["Bench One"] };\n' +
    'function isCoach(){ return true; }\n' +
    'function ceConfirm(){ return Promise.resolve(true); }\n' +
    'function matchCentreSelectedFixture(){ return { opposition: "Mons", date: "2026-08-22" }; }\n' +
    'function matchCentreSelectedSide(){ return { name: "Premier" }; }\n' +
    'function mcFixtureDateLabel(){ return "22 Aug"; }\n' +
    'function matchCentreFixtureId(){ return "fx1"; }\n' +
    'function matchCentreSideId(){ return "t1"; }\n' +
    'function sheetPersonKeys(){ return { formationKeys: {}, benchKeys: [] }; }\n' +
    'function saveState(){ CALLS.save++; }\n' +
    'function render(){ CALLS.render++; }\n' +
    'function showToast(m){ CALLS.toast.push(m); }\n' +
    'function sendPushToPlayers(t, b){ CALLS.push.push({ t, b }); }\n' +
    'async function fetch(url, opts){\n' +
    '  CALLS.fetch.push(JSON.parse(opts.body));\n' +
    '  if (CFG.net) throw new Error("offline");\n' +
    '  return { ok: CFG.status >= 200 && CFG.status < 300, status: CFG.status,' +
    '           json: async () => ({ error: CFG.error }) };\n' +
    '}\n' +
    fn('syncSquadToServer') + '\n' +
    fn('publishSquad') + '\n' +
    'return publishSquad().then(() => ({ published: state.matchCentre.published, draft: state.formationNames }));';
  const out = await new Function(body)(calls, { status, error, net, startPublished });
  return { ...out, calls };
}

test('200 → published true, push sent, success toast, draft intact', async () => {
  const r = await runPublish({ status: 200 });
  assert.equal(r.published, true, 'committed as published only after the 200');
  assert.equal(r.calls.push.length, 1, 'players notified exactly once');
  assert.ok(r.calls.toast.some(t => /published/i.test(t)), 'success toast');
  assert.deepEqual(r.draft, { 1: 'Starter One' }, 'the team sheet is intact');
  assert.equal(r.calls.fetch.length, 1);
  assert.equal(r.calls.fetch[0].data.published, true, 'the POST carried published:true');
});

test('403 → NOT published, NO push, server error shown, draft preserved', async () => {
  const r = await runPublish({ status: 403, error: 'Not authorized for this group' });
  assert.equal(r.published, false, 'a refused publish is never marked published');
  assert.equal(r.calls.push.length, 0, 'NO player push on a refused publish');
  assert.ok(r.calls.toast.some(t => /not authorized for this group/i.test(t)), 'the server error is surfaced');
  assert.equal(r.calls.toast.some(t => /published/i.test(t)), false, 'no false success toast');
  assert.deepEqual(r.draft, { 1: 'Starter One' }, 'the working sheet survives the failure');
});

for (const status of [400, 500]) {
  test(`${status} → NOT published, NO push, error shown`, async () => {
    const r = await runPublish({ status, error: '' });
    assert.equal(r.published, false);
    assert.equal(r.calls.push.length, 0, `no push on ${status}`);
    assert.equal(r.calls.toast.some(t => /published/i.test(t)), false, 'no false success');
    assert.ok(r.calls.toast.length >= 1, 'a failure message is shown');
  });
}

test('network failure → NOT published, NO push, offline message, draft preserved', async () => {
  const r = await runPublish({ net: true });
  assert.equal(r.published, false);
  assert.equal(r.calls.push.length, 0, 'no push when the request never reached the server');
  assert.ok(r.calls.toast.some(t => /offline|not published/i.test(t)), 'an honest offline message');
  assert.deepEqual(r.draft, { 1: 'Starter One' });
});

test('withdraw (published→draft) also awaits the server; a failed withdraw stays published', async () => {
  const r = await runPublish({ status: 500, startPublished: true });
  assert.equal(r.published, true, 'a failed withdraw does not falsely move to draft');
  assert.equal(r.calls.push.length, 0, 'withdraw never pushes');
});

test('the push is gated behind the awaited result — never fired before the server answers', () => {
  const src = fn('publishSquad');
  assert.match(src, /await syncSquadToServer\(/, 'the server call is awaited');
  assert.match(src, /if \(!result\.ok\)[\s\S]*return;/, 'a non-ok result returns before commit/push');
  // sendPushToPlayers must appear AFTER the !result.ok guard, not before.
  const guardIdx = src.indexOf('!result.ok');
  const pushIdx = src.indexOf('sendPushToPlayers');
  assert.ok(guardIdx > 0 && pushIdx > guardIdx, 'push is downstream of the success gate');
});

test('syncSquadToServer reads res.ok and returns a typed result (no silent success)', () => {
  const src = fn('syncSquadToServer');
  assert.match(src, /if \(!res\.ok\)/, 'the HTTP status is inspected');
  assert.match(src, /return \{ ok: true/, 'ok result on success');
  assert.match(src, /return \{ ok: false/, 'explicit failure result');
});
