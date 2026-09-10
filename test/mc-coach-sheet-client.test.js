/**
 * MATCH CENTRE — "Publish to coaches" CLIENT contract.
 *
 * Drives the REAL mcPublishToCoaches / notifyCoachingGroup extracted from
 * index.html to prove behaviour (not source strings): a successful publish
 * POSTs type:'coach_sheet' for the selected fixture+side, then notifies the
 * coaching channel (convId:'coaching') — and NEVER calls sendPushToPlayers or
 * touches the player squad. On an HTTP failure it shows no success and does not
 * notify. Also pins the UI gate/placement of the action.
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

// Build a sandbox that runs the real client functions with capturing stubs.
function harness({ ok = true, confirm = true } = {}) {
  const calls = [];   // every fetch: { url, method, body }
  const toasts = [];
  const body =
    '"use strict";\n' +
    'const CALLS = arguments[0], TOASTS = arguments[1], OK = arguments[2], CONFIRM = arguments[3];\n' +
    'let pushToPlayersCalled = false;\n' +
    'const state = { matchCentre: { opposition: "Mons" }, formationNames: { 1: "Prop A", 2: "Hooker B" }, benchPlayers: ["Bench C"] };\n' +
    'function isCoach(){ return true; }\n' +
    'function canI(p){ return p === "publish_squads"; }\n' +
    'function matchCentreFixtureId(){ return "fx-sen"; }\n' +
    'function matchCentreSideId(){ return "t-prem"; }\n' +
    'function matchCentreSelectedFixture(){ return { opposition: "Mons", date: "2026-08-20", team: "Premier" }; }\n' +
    'function matchCentreSelectedSide(){ return { name: "Premier" }; }\n' +
    'function mcFixtureDateLabel(d){ return d; }\n' +
    'function sheetPersonKeys(){ return { formationKeys: {}, benchKeys: [] }; }\n' +
    'let flushed = false; function mcFlushDraftNow(){ flushed = true; }\n' +
    'function showToast(t){ TOASTS.push(t); }\n' +
    'function ceConfirm(){ return Promise.resolve(CONFIRM); }\n' +
    'function sendPushToPlayers(){ pushToPlayersCalled = true; }\n' +
    'function render(){}\n' +
    'function loadCoachPublication(){}\n' +
    'const document = { getElementById(){ return null; } };\n' +
    'globalThis.fetch = async (url, opts = {}) => { CALLS.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null }); return { ok: OK, json: async () => ({ ok: OK }) }; };\n' +
    fn('notifyCoachingGroup') + '\n' +
    fn('mcPublishToCoaches') + '\n' +
    'return { run: () => mcPublishToCoaches(), wasPushToPlayersCalled: () => pushToPlayersCalled, wasFlushed: () => flushed };\n';
  const scope = new Function(body)(calls, toasts, ok, confirm);
  return { calls, toasts, scope };
}

test('CLIENT-1: a successful publish POSTs type:coach_sheet for the selected fixture+side', async () => {
  const { calls, scope } = harness({ ok: true });
  await scope.run();
  const pub = calls.find(c => c.url === '/api/publish' && c.body?.type === 'coach_sheet');
  assert.ok(pub, 'a coach_sheet POST was made');
  assert.equal(pub.method, 'POST');
  assert.equal(pub.body.data.fixtureId, 'fx-sen');
  assert.equal(pub.body.data.sideId, 't-prem');
  assert.equal(pub.body.data.formationNames['1'], 'Prop A', 'the current sheet is sent');
});

test('CLIENT-2: it flushes the draft before publishing', async () => {
  const { scope } = harness({ ok: true });
  await scope.run();
  assert.equal(scope.wasFlushed(), true, 'mcFlushDraftNow ran so the snapshot matches the screen');
});

test('CLIENT-3: on success it notifies the COACHING channel (convId:coaching) and never publishes a player squad', async () => {
  const { calls, toasts, scope } = harness({ ok: true });
  await scope.run();
  const chat = calls.find(c => c.url === '/api/chat');
  assert.ok(chat, 'a coaching-channel notification was sent');
  assert.equal(chat.body.action, 'send');
  assert.equal(chat.body.convId, 'coaching', 'notification goes to the coaching channel, not players');
  assert.match(chat.body.text, /published to coaches/i);
  assert.ok(toasts.some(t => /published to coaches/i.test(t)), 'success toast shown');
  // Isolation: no player squad, no player push.
  assert.ok(!calls.some(c => c.body?.type === 'squad'), 'no player squad POST');
  assert.equal(scope.wasPushToPlayersCalled(), false, 'sendPushToPlayers never called');
});

test('CLIENT-4: on an HTTP failure it shows an honest error and does NOT notify coaches', async () => {
  const { calls, toasts, scope } = harness({ ok: false });
  await scope.run();
  assert.ok(!calls.some(c => c.url === '/api/chat'), 'no notification on failure');
  assert.ok(toasts.some(t => /couldn.t publish to coaches/i.test(t)), 'honest failure toast');
  assert.ok(!toasts.some(t => /published to coaches ✓/.test(t)), 'no fake success');
});

test('CLIENT-5: cancelling the confirmation publishes nothing', async () => {
  const { calls, scope } = harness({ ok: true, confirm: false });
  await scope.run();
  assert.equal(calls.length, 0, 'cancel → no POST, no notification');
});

// ── UI gate + placement (source contract) ────────────────────────────────────

test('CLIENT-6: the action is gated on PUBLISH_SQUADS + a fixture, and sits LEFT of Publish squad', async () => {
  // Rendered only for a coach with a fixture context.
  assert.match(html, /canI\('publish_squads'\) && matchCentreFixtureId\(\) \? `<button class="btn" id="mc-pub-coaches"[^`]*mcPublishToCoaches\(\)/,
    'button gated on publish_squads + fixture, standard .btn styling');
  // Immediately before the player "Publish squad" button in the same bar.
  const bar = html.slice(html.indexOf('<div class="mc10-actions">'), html.indexOf('<!-- ── V5 · matchday footer'));
  const coachIdx = bar.indexOf('mc-pub-coaches');
  const squadIdx = bar.indexOf('publishSquad()');
  assert.ok(coachIdx !== -1 && squadIdx !== -1 && coachIdx < squadIdx, 'Publish to coaches is left of Publish squad');
  // It must not use the primary player-publish styling.
  assert.ok(!/id="mc-pub-coaches"[^>]*mc5-publish/.test(html), 'not styled as the primary player publish');
});

test('CLIENT-7: the compare panel carries a distinct "Coach publication" row', async () => {
  const panel = fn('mcComparePanelHTML');
  assert.match(panel, /Coach publication/, 'a Coach publication row is rendered');
  assert.match(panel, /mcViewCoachPublication\(\)/, 'it opens the read-only publication viewer');
  // The viewer subtitle names it as the coach publication (not draft/squad).
  const viewer = fn('mcViewCoachPublication');
  assert.match(viewer, /_mcOpenCompareViewer\('Coach publication'/, 'viewer titled Coach publication');
});
