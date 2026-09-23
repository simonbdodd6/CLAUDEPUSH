/**
 * Player-side availability failure honesty.
 *
 * The coach screens were made honest about a failed /api/availability read in
 * e9deb7a0 and b020c136. The player reads their OWN answers through a
 * different endpoint (?myResponse=1) whose failure was swallowed in silence:
 * on a device holding no local answers — a new phone, a cleared browser, a
 * player who answered somewhere else — a 500 was rendered as the player's own
 * behaviour: "1 session needs your answer", "0 of 1 confirmed", a No reply
 * chip, and "Not replied" on Home. Failure and a genuinely empty week were
 * character-for-character identical.
 *
 * The same machinery now covers it: the self-read arms _availReadFailed, and
 * availabilityReadUnknown() decides what the player screens may state. The
 * cards keep their buttons — answering never depended on the read that failed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

// ── The real self-read, driven through every outcome ───────────────────────
function scope() {
  return new Function(`"use strict";
    const calls = { fetches: 0, repaints: 0, saves: 0 };
    const SEQ = [];
    function fetch() {
      calls.fetches++;
      const r = SEQ.shift() || { ok: true, body: { responses: {} } };
      if (r.throws) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: r.ok !== false, status: r.ok === false ? 500 : 200, json: async () => r.body });
    }
    let _availReadFailed = false, _availLastSync = null;
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null;
    let _playerAvailFetched = false, _playerAvailKnown = false;
    const state = { activeView: 'player', activePlayerSection: 'availability', operationalGroupId: 'g1', players: [] };
    const PLAYER = { id: 'p1', userId: 'u1', name: 'P' };
    function getPlayer() { return PLAYER; }
    function findLiveAvailabilityRecords() { return []; }
    let merged = null;
    function mergeServerAvailabilityIntoRecord(rec, responses) { merged = responses; return Object.keys(responses || {}).length > 0; }
    function saveState() { calls.saves++; }
    function renderPlayerAvailabilityV2() { calls.repaints++; }
    function renderMessageCenter() {}
    ${fn('currentResolvedAvailability')}
    ${fn('availabilitySetReadFailed')}
    ${fn('availabilityLastReadFailed')}
    ${fn('availabilityReadUnknown')}
    ${fn('playerAvailabilityReadUnknown')}
    ${fn('fetchMyAvailabilityFromServer')}
    ${fn('playerAvailRetryNow')}
    return { calls, queue: r => SEQ.push(r), run: () => fetchMyAvailabilityFromServer(), retry: () => playerAvailRetryNow(),
      unknown: () => playerAvailabilityReadUnknown(), failed: () => availabilityLastReadFailed(),
      merged: () => merged, fetched: () => _playerAvailFetched };
  `)();
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('1+2+3. a 500 before any trustworthy data arms the failure state instead of passing for silence', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} });
  await s.run(); await wait(20);
  assert.equal(s.failed(), true, 'the failed self-read is recorded');
  assert.equal(s.unknown(), true, 'so the player screens know they do not know');
  assert.equal(s.merged(), null, 'nothing was merged from a failed read');
  assert.equal(s.calls.saves, 0, 'and nothing was written to the device');
});

test('2. a network throw behaves exactly like a 500', async () => {
  const s = scope();
  s.queue({ throws: true });
  await s.run(); await wait(20);
  assert.equal(s.unknown(), true);
});

test('the failed read does not re-fetch on every render, but CAN be retried', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} });
  await s.run(); await wait(20);
  await s.run(); await wait(20);
  assert.equal(s.calls.fetches, 1, 'the once-per-session latch still holds — renders do not re-fetch');
  s.queue({ ok: true, body: { responses: { fx: { response: 'available' } } } });
  await s.retry(); await wait(20);
  assert.equal(s.calls.fetches, 2, 'the explicit retry asks again');
  assert.equal(s.unknown(), false, 'and a real answer clears the failure state');
});

test('4. a successful read with real data is unchanged, and is not a failure', async () => {
  const s = scope();
  s.queue({ ok: true, body: { responses: { fx_sat: { response: 'available', reason: '' } } } });
  await s.run(); await wait(20);
  assert.equal(s.failed(), false); assert.equal(s.unknown(), false);
  assert.deepEqual(s.merged(), { fx_sat: { response: 'available', reason: '' } }, 'the answers are merged as before');
  assert.equal(s.calls.saves, 1, 'and saved to the device');
  assert.equal(s.calls.repaints, 1, 'repainting once, as before');
});

test('5. a successful but genuinely EMPTY read is empty, never a failure', async () => {
  const s = scope();
  s.queue({ ok: true, body: { responses: {} } });
  await s.run(); await wait(20);
  assert.equal(s.failed(), false, 'an empty week is not a failure');
  assert.equal(s.unknown(), false, 'the player screens may state it plainly');
  assert.equal(s.calls.saves, 0, 'nothing to merge, nothing written (unchanged)');
});

test('7. recovery: a failed read followed by a successful one returns to normal', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} });
  await s.run(); await wait(20);
  assert.equal(s.unknown(), true);
  const repaintsAfterFailure = s.calls.repaints;
  s.queue({ ok: true, body: { responses: {} } });
  await s.retry(); await wait(20);
  assert.equal(s.unknown(), false, 'even a recovery to an empty week clears it');
  assert.equal(s.failed(), false);
  // Recovering to an EMPTY week merges nothing and saves nothing, so the only
  // thing that can take the error off the screen is the setter's repaint.
  assert.equal(s.calls.saves, 0, 'nothing was merged on this recovery');
  assert.ok(s.calls.repaints > repaintsAfterFailure, 'and the screen was repainted anyway');
});

test('the knowledge half of the predicate covers BOTH reads', () => {
  const pred = fn('playerAvailabilityReadUnknown');
  assert.match(pred, /!\(typeof _playerAvailKnown !== 'undefined' && _playerAvailKnown\)/, 'and so does the player self-read');
  assert.match(fn('fetchMyAvailabilityFromServer'), /_playerAvailKnown = true;/, 'which a successful self-read sets');
});

test('6. a failure AFTER a successful read keeps what is known (existing semantics)', async () => {
  const s = scope();
  s.queue({ ok: true, body: { responses: { fx_sat: { response: 'available' } } } });
  await s.run(); await wait(20);
  const mergedThen = s.merged();
  s.queue({ ok: false, body: {} });
  await s.retry(); await wait(20);
  assert.equal(s.failed(), true, 'the failed refresh is recorded');
  assert.deepEqual(s.merged(), mergedThen, 'but the answers already merged into the device are untouched');
  assert.equal(s.calls.saves, 1, 'and nothing was rewritten');
});

// ── Presentation contracts ────────────────────────────────────────────────
test('the player screens ask the SAME question as the coach screens', () => {
  for (const [where, body] of [['the availability screen', fn('renderPlayerAvailabilityV2')],
                               ['the session card', fn('availabilityCardV2')],
                               ['the Home badge', fn('playerPortalAvailabilityStatus')]]) {
    assert.match(body, /typeof playerAvailabilityReadUnknown === 'function' && playerAvailabilityReadUnknown\(\)/,
      `${where} reads the existing predicate, typeof-guarded`);
  }
  assert.equal((src.match(/_availReadFailed = /g) || []).length, 2, 'still one flag, assigned only by the setter');
  assert.doesNotMatch(fn('renderPlayerAvailabilityV2'), /_availReadFailed/, 'no surface reads the raw flag');
  assert.doesNotMatch(fn('availabilityCardModel'), /[Aa]vailabilityReadUnknown/, 'and the data model keeps its no-reply spelling');
});

test('3. the banner states the failure, offers the player retry, and withholds the bulk answer', () => {
  const body = fn('renderPlayerAvailabilityV2');
  assert.match(body, /\$\{availUnknown \? `/, 'the banner branches on it');
  const branch = body.slice(body.indexOf('${availUnknown ? `'), body.indexOf('${availUnknown ? `') + 1100);
  assert.match(branch, /Availability unavailable/, 'and says so');
  assert.match(branch, /onclick="playerAvailRetryNow\(\)"/, 'with the player-side retry (not the coach board refresh)');
  assert.doesNotMatch(branch, /needs your answer|confirmed\.|setAllAvailable/,
    'no count, no "N of M confirmed", and no Yes-to-all premised on knowing nothing was answered');
  // The cards themselves are still rendered: answering does not depend on the read.
  assert.match(body, /sessions\.map\(s => availabilityCardV2\(availabilityCardModel\(player, s\), s\)\)/, 'the answer cards stay');
});

test('1. the session chip says "Not known", not "No reply", when the read failed', () => {
  const card = fn('availabilityCardV2');
  assert.match(card, /const unknownAnswer = status === 'no-reply' && !pending/,
    'only an UNANSWERED card, and never one holding an unsent local answer');
  assert.match(card, /\$\{unknownAnswer \? 'Not known' : statusLabel\(status\)\}/, 'the chip stops claiming a reply state');
  assert.match(card, /availabilityV2SetStatus/, 'and the three answer buttons are untouched');
});

test('1. Home says "Not known" rather than "Not replied" when the read failed', () => {
  const helper = fn('playerPortalAvailabilityStatus');
  assert.match(helper, /\? 'Not known' : 'Not replied'/, 'the badge stops claiming the player did not reply');
  assert.match(helper, /available:   \{ status, label: 'Available'/, 'every other label is unchanged');
  // The route to answering is untouched.
  assert.match(fn('renderPlayerHome'), /avail\.status === 'no-reply'[\s\S]{0,200}Set availability/, 'Set availability is still offered');
});

test('7. the failure setter repaints whichever PLAYER surface is on screen', () => {
  const setter = fn('availabilitySetReadFailed');
  assert.match(setter, /if \(_availReadFailed === next\) return;/, 'still only on a transition');
  assert.match(setter, /state\.activeView === 'player'[\s\S]{0,320}renderPlayerAvailabilityV2\(\)/, 'the availability screen');
  assert.match(setter, /activePlayerSection === 'home'[\s\S]{0,80}renderPlayerHome\(\)/, 'and Home');
});

test('the self-read tells a failure from an empty week by ok-ness, not by shape', () => {
  const body = fn('fetchMyAvailabilityFromServer');
  assert.match(body, /ok = Boolean\(res && res\.ok\)/, 'HTTP status decides');
  assert.match(body, /if \(!ok \|\| !data\?\.responses\) \{/, 'a failed read and a malformed body both count as failure');
  assert.match(body, /availabilitySetReadFailed\(true\)/);
  assert.match(body, /availabilitySetReadFailed\(false\)/);
  // The latch must NOT be released here: this runs from a renderer.
  assert.doesNotMatch(body, /_playerAvailFetched = false/, 'a failed read never re-fetches on every render');
  assert.match(fn('playerAvailRetryNow'), /_playerAvailFetched = false;\s*\n\s*fetchMyAvailabilityFromServer\(\);/, 'the retry is the explicit route');
});

// ── The real player app, in a browser ─────────────────────────────────────
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const GRP = 'grp_initial', TEAM = 'team_stub';
const SAT = (() => { const x = new Date(); x.setUTCDate(x.getUTCDate() + ((6 - x.getUTCDay() + 7) % 7)); return x.toISOString().slice(0, 10); })();
const ME = { id: 'p1', userId: 'u1', name: 'Gaetan Player', position: 'Prop', playerGroupId: GRP };
const SESSION = { ok: true, user: { id: 'u1', name: 'Gaetan Player', email: 'p@s.test', role: 'player', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'player', status: 'active', playerGroupId: GRP }, permissions: [],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'player', canonicalRole: 'player', current: true }],
  operational: { player: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false },
                 staff: { groups: [], defaultGroupId: null, mustChoose: false } } };
const FIXTURES = [{ id: 'fx_sat', groupId: GRP, opposition: 'Kituro', date: SAT, kickoffTime: '14:00', status: 'scheduled' }];

function server(mode) {
  const st = { mode };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      if (st.mode === 'fail') { res.statusCode = 500; return send({ error: 'boom' }); }
      if (u.includes('myResponse=1')) return send({ responses: st.mode === 'ok' ? { fx_sat: { response: 'available', reason: '' } } : {} });
      return send({ resolved: {}, roster: [ME] });
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, schedule: { slots: [] } });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: [ME] });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC' } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return { srv, st };
}
// A FRESH device: this player may well have answered on another one.
const SEED = { activeView: 'player', activePlayerSection: 'availability', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Gaetan Player', email: 'p@s.test', role: 'player', playerId: 'p1' }], operationalGroupId: GRP,
  players: [ME], fixtures: FIXTURES, messages: [], onboardingDismissed: true };

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): a failed self-read never tells the player they did not reply`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, st } = server('fail');
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)), SEED);
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const availText = () => page.evaluate(() => (document.getElementById('player-availability')?.innerText || '').replace(/\s+/g, ' '));
      const homeText = () => page.evaluate(() => (document.getElementById('player-home')?.innerText || '').replace(/\s+/g, ' '));
      // Every visible leaf that states this player's reply state.
      const claims = () => page.evaluate(() => [...document.querySelectorAll('#player-availability *, #player-home *')]
        .filter(e => e.children.length === 0 && e.offsetParent !== null && /No reply|Not replied|needs your answer|of \d+ confirmed/i.test(e.innerText || ''))
        .map(e => (e.className || e.tagName) + ' :: ' + (e.innerText || '').trim().slice(0, 44)));

      // C. 500 before any trustworthy data
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Availability unavailable/.test(document.getElementById('player-availability')?.innerText || ''), null, { timeout: 20000 });
      let text = await availText();
      assert.match(text, /Availability unavailable/, 'the screen says the answers could not be loaded');
      assert.doesNotMatch(text, /needs your answer|of \d+ confirmed/, 'and makes no claim about what the player has answered');
      assert.doesNotMatch(text, /Yes to all/, 'no bulk answer premised on knowing nothing was answered');
      assert.match(text, /Not known/, 'the session chip says the answer is not known');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#player-availability [onclick^="availabilityV2SetStatus"]').length >= 3), true,
        'and the player can still answer');
      await page.evaluate(() => setSection('player', 'home'));
      await page.waitForTimeout(500);
      assert.match(await homeText(), /Not known/, 'Home agrees');
      assert.doesNotMatch(await homeText(), /Not replied/, 'and no longer says the player did not reply');
      assert.deepEqual(await claims(), [], 'nothing visible states a reply status');

      // E2. FIRST recovery, to a genuinely EMPTY week: nothing merges and
      // nothing is saved, so only the repaint on the transition can take the
      // error off the screen.
      await page.evaluate(() => setSection('player', 'availability'));
      await page.waitForTimeout(400);
      st.mode = 'empty';
      await page.click('#player-availability button:has-text("Try again")');
      await page.waitForFunction(() => !/Availability unavailable/.test(document.getElementById('player-availability')?.innerText || ''), null, { timeout: 20000 });
      assert.match(await availText(), /needs your answer/, 'an empty recovery clears the error and asks for an answer');
      assert.match(await availText(), /No reply/, 'and calls the unanswered session what it now really is');

      // E. recovery with real answers
      st.mode = 'ok';
      await page.evaluate(() => playerAvailRetryNow());
      await page.waitForFunction(() => !/Availability unavailable/.test(document.getElementById('player-availability')?.innerText || ''), null, { timeout: 20000 });
      text = await availText();
      assert.match(text, /All sessions confirmed|confirmed\./, 'the real reading is back');
      assert.match(text, /Available/, 'and the answer the player made elsewhere is shown');

      // D. a failure AFTER a successful read keeps what is known
      st.mode = 'fail';
      await page.evaluate(() => playerAvailRetryNow());
      await page.waitForTimeout(800);
      text = await availText();
      assert.doesNotMatch(text, /Availability unavailable/, 'known answers are not erased by a failed refresh');
      assert.match(text, /Available/, 'the answer still stands');

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0), 'no horizontal overflow');
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

test('browser: a genuinely empty week is unchanged (no failure state)', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const { srv } = server('empty');
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' });
    await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)), SEED);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /needs your answer/.test(document.getElementById('player-availability')?.innerText || ''), null, { timeout: 20000 });
    const text = await page.evaluate(() => (document.getElementById('player-availability')?.innerText || '').replace(/\s+/g, ' '));
    assert.doesNotMatch(text, /Availability unavailable|Not known/, 'an empty week is not a failure');
    assert.match(text, /needs your answer/, 'it still asks for an answer');
    assert.match(text, /No reply/, 'and still calls the unanswered session what it is');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
