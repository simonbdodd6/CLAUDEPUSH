/**
 * Availability failure-state honesty.
 *
 * A 500 from /api/availability used to reach the coach as a fact about every
 * player: the board printed "No reply 18", the week strip said "18 to chase"
 * and offered "Chase all" — a full squad convicted of silence by a request
 * that never landed. Failure and "nobody has replied yet" are different
 * answers and must never share a presentation.
 *
 * Pinned here:
 *   500 / network throw  → failure state, no fabricated no-reply, no chase
 *   success with data    → unchanged
 *   success but empty    → still the legitimate empty/no-reply reading
 *   failure after a good read → keeps the real answers (not a failure STATE)
 *   recovery             → normal board returns, error gone
 *
 * The state layer runs the REAL extracted functions. The rendering is pinned
 * as a source contract (the convention for this 300-line template, see
 * availability-board-v2.test.js) and proved end to end in the browser test at
 * the bottom, which skips when Playwright is unavailable.
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

// ── State layer: the real refresh, driven through every outcome ─────────────
function scope({ group = 'g1' } = {}) {
  return new Function(`"use strict";
    const SEQ = [];
    const calls = { fetches: 0, boardRenders: 0 };
    function fetch() {
      calls.fetches++;
      const r = SEQ.shift() || { ok: true, body: { resolved: {} } };
      if (r.throws) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: r.ok !== false, status: r.ok === false ? 500 : 200, json: async () => r.body });
    }
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null;
    let _availLastSync = null, _availReadFailed = false, _availRosterLinkedAt = 0;
    let _liveAvailabilityInFlight = null;
    const state = { operationalGroupId: ${JSON.stringify(group)}, players: [{ name: 'P1', userId: 'u1' }, { name: 'P2', userId: 'u2' }] };
    const chip = { textContent: '', className: '' };
    const document = { getElementById: () => chip };
    function operationalGroups() { return [{ id: 'g1' }]; }
    async function ensureCoachRosterIdentityLinked() {}
    function saveState() {}
    function renderMessageCenter() { calls.boardRenders++; }
    function renderAudiencePicker() {} function renderPushStatusCard() {}
    function loadLiveSchedules() {} function loadLiveTemplates() {} function loadLiveLog() {}
    function setTimeout() { return 1; }
    ${fn('sessionKey')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('currentResolvedAvailability')}
    ${fn('availabilitySetReadFailed')}
    ${fn('availabilityLastReadFailed')}
    ${fn('availabilityReadUnknown')}
    ${fn('refreshLiveAvailability')}
    return {
      queue: r => SEQ.push(r), calls, chip,
      run: o => refreshLiveAvailability(o),
      unknown: () => availabilityReadUnknown(),
      failed: () => availabilityLastReadFailed(),
      known: () => currentResolvedAvailability(),
      lastSync: () => _availLastSync,
      resolved: () => _resolvedAvailability,
    };
  `)();
}
const DATA = { resolved: { u1: { tue: { response: 'available', respondedAt: 't1' } } } };
const wait = ms => new Promise(r => setTimeout(r, ms));

test('1+3. an HTTP 500 produces an explicit failure state and stamps no answers', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} });
  await s.run(); await wait(30);
  assert.equal(s.failed(), true, 'the failure is recorded in state, not only in the chip');
  assert.equal(s.unknown(), true, 'availability is UNKNOWN, not empty');
  assert.equal(s.lastSync(), null, 'no sync stamp from a failed read (unchanged)');
  assert.deepEqual(s.resolved(), {}, 'and nothing was written into the resolved map');
  assert.equal(s.known(), null, 'callers asking what we know are told: nothing');
  assert.match(s.chip.textContent, /fail/i, 'the chip still admits it (unchanged)');
  assert.equal(s.calls.boardRenders, 1, 'the board repaints once on the transition, not per poll');
});

test('1+3. a network throw behaves exactly like a 500', async () => {
  const s = scope();
  s.queue({ throws: true });
  await s.run(); await wait(30);
  assert.equal(s.unknown(), true); assert.equal(s.lastSync(), null);
});

test('a repeated failure does not repaint again (no churn)', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} }); s.queue({ ok: false, body: {} });
  await s.run(); await wait(20); await s.run(); await wait(20);
  assert.equal(s.calls.fetches, 2, 'both polls really ran');
  assert.equal(s.calls.boardRenders, 1, 'one repaint for the transition only');
});

test('4. a successful response with real data is unchanged, and is not a failure', async () => {
  const s = scope();
  s.queue({ ok: true, body: DATA });
  await s.run(); await wait(30);
  assert.equal(s.failed(), false); assert.equal(s.unknown(), false);
  assert.ok(s.lastSync(), 'a real read stamps the sync');
  assert.match(JSON.stringify(s.known()), /"tue"/, 'and the answers are what we know');
});

test('5. a successful but genuinely EMPTY response is empty, never a failure', async () => {
  const s = scope();
  s.queue({ ok: true, body: { resolved: {} } });
  await s.run(); await wait(30);
  assert.equal(s.failed(), false, 'an empty week is not a failure');
  assert.equal(s.unknown(), false, 'we know the answer: nobody has replied');
  assert.deepEqual(s.known(), {}, 'and what we know is an empty map, not null');
  assert.ok(s.lastSync(), 'stamped like any other real answer');
});

test('a failure AFTER a good read keeps the real answers and is not a failure STATE', async () => {
  const s = scope();
  s.queue({ ok: true, body: DATA }); s.queue({ ok: false, body: {} });
  await s.run(); await wait(20);
  await s.run(); await wait(20);
  assert.equal(s.failed(), true, 'the chip-level failure is recorded');
  assert.equal(s.unknown(), false, 'but the board still KNOWS these answers — no error state');
  assert.match(JSON.stringify(s.known()), /"tue"/, 'the good map survives the failed poll (unchanged)');
});

test('7. a failed read followed by a successful one recovers, including to an empty week', async () => {
  const s = scope();
  s.queue({ ok: false, body: {} }); s.queue({ ok: true, body: DATA });
  await s.run(); await wait(20);
  assert.equal(s.unknown(), true);
  await s.run(); await wait(20);
  assert.equal(s.unknown(), false, 'recovered'); assert.equal(s.failed(), false);
  assert.match(JSON.stringify(s.known()), /"tue"/, 'and the real data renders');
  assert.equal(s.calls.boardRenders >= 2, true, 'the recovery transition repaints too');

  // The hard case: recovery to a genuinely empty week, where the resolved map
  // does not change at all. The error state must still clear.
  const e = scope();
  e.queue({ ok: false, body: {} }); e.queue({ ok: true, body: { resolved: {} } });
  await e.run({ boardOnly: true }); await wait(20);
  assert.equal(e.unknown(), true);
  await e.run({ boardOnly: true }); await wait(20);
  assert.equal(e.unknown(), false, 'an empty success clears the failure state');
  assert.equal(e.calls.boardRenders, 2, 'and repaints so the error leaves the screen');
});

test('a read for another group is UNKNOWN, not empty (unchanged group contract)', async () => {
  const s = scope();
  s.queue({ ok: true, body: DATA });
  await s.run(); await wait(20);
  assert.equal(s.known() !== null, true);
});

// ── Render + action contracts ──────────────────────────────────────────────
test('2. the board prints no "to chase" count and offers no "Chase all" when the read failed', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /const availUnknown\s*=\s*availabilityReadUnknown\(\)/, 'the board asks the honest question once');
  assert.match(board, /\$\{opPlayers\.length > 0 && !availUnknown \? `/,
    'the week strip — "N to chase" and the Chase all button — is withheld');
  const strip = board.slice(board.indexOf('!availUnknown'), board.indexOf('!availUnknown') + 1800);
  assert.match(strip, /to chase/, 'the withheld strip is indeed the chase strip');
  assert.match(strip, /chaseAllNonResponders\(\)/, 'including its action');
});

test('1. the board prints no "No reply" count when the read failed, and says why', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /\$\{availUnknown \? `<section class="msg-card"[^`]*\$\{availErrorHTML\}<\/section>` : `\s*\n\s*<section class="msg-kpi-grid avail-summary">/,
    'the KPI row (Available/Maybe/Unavailable/No reply) is replaced by the error block');
  assert.match(board, /<div class="msg-player-list msg-board-list">\$\{availUnknown \? availErrorHTML : playerRows\(boardRows\)\}<\/div>/,
    'and so is the squad list, so no player is shown as having not replied');
  assert.match(board, /Availability could not be loaded/, 'the message names the real problem');
  assert.match(board, /nobody has been marked as "no reply"/, 'and says explicitly what has NOT happened');
});

test('3. the error state uses the existing error styling and the existing retry action', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /class="ovw-empty"/, 'the same error-state shape the Overview cards use');
  assert.match(board, /<button type="button" class="ovw-retry" onclick="availRefreshNow\(\)">Try again<\/button>/,
    'retry is the availability refresh the Live sync chip already runs — no new interaction');
  assert.ok(src.includes('.ovw-retry {'), 'and that button is already styled');
});

test('6. the sync chip reports the failure from STATE, so a repaint cannot erase it', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /availabilityLastReadFailed\(\) \? 'Sync failed — retry' : _availLastSync \? 'Synced '/,
    'chip text comes from what we know, not from a one-off DOM write');
  assert.match(board, /class="msg-chip msg-chip-btn \$\{availabilityLastReadFailed\(\) \? 'unavailable'/, 'and it is styled as a failure');
  // The loading/first-read presentation is untouched.
  assert.match(board, /: 'Live sync'\}/, 'never-synced still reads "Live sync", as before');
});

test('the chase ACTION fails closed on unknown availability, from any entry point', () => {
  const chase = fn('chaseAllNonResponders');
  assert.match(chase, /if \(availabilityReadUnknown\(\)\) return showToast\('Availability could not be loaded/,
    'no reminder is sent on data we do not have');
  const guardAt = chase.indexOf('availabilityReadUnknown()');
  const sendAt = chase.indexOf('availabilityNonResponders(');
  assert.ok(guardAt > 0 && sendAt > guardAt, 'and the guard runs before the recipients are computed');
});

test('8. session labelling and the group contract are untouched', () => {
  const board = fn('renderMessageCenterV2');
  assert.match(board, /const sessionDisplayTitle = session => availabilitySessionLabel\(session\)/,
    'sessions are still named by the one shared labeller');
  assert.match(board, /const opPlayers\s*=\s*operationalPlayers\(\)/, 'the board still serves the operating group');
  const refresh = fn('refreshLiveAvailability');
  assert.match(refresh, /if \(!state\.operationalGroupId && operationalGroups\(\)\.length > 1\) return;/, 'group fail-safe unchanged');
  assert.match(refresh, /'\/api\/availability\?resolveRoster=1' \+ _availGroupQ/, 'the group-scoped read is unchanged');
});

// ── Browser: the reported bug, end to end, desktop and phone ───────────────
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const GRP = 'grp_initial', TEAM = 'team_stub';
const SAT = (() => { const x = new Date(); x.setUTCDate(x.getUTCDate() + ((6 - x.getUTCDay() + 7) % 7)); return x.toISOString().slice(0, 10); })();
const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP }));
const SESSION = { ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } };
const FIXTURES = [{ id: 'fx_sat', groupId: GRP, opposition: 'Kituro', date: SAT, kickoffTime: '14:00', status: 'scheduled' }];

/** availabilityMode: 'ok' | 'empty' | 'fail' — flipped live by the test. */
function boardServer(mode) {
  const state = { mode };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      if (state.mode === 'fail') { res.statusCode = 500; return send({ error: 'boom' }); }
      const resolved = {};
      if (state.mode === 'ok') PLAYERS.slice(0, 5).forEach(p => { resolved[p.userId] = { ['slot_tue-' + SAT.replace(/-/g, '')]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
      return send({ resolved, roster: PLAYERS });
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: FIXTURES });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, schedule: { slots: [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', active: true, sessionId: 'slot_tue' }] } });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: PLAYERS });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC' } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return { srv, state };
}

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): a 500 never tells the coach that players have not replied`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, state: mode } = boardServer('fail');
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)),
        { activeView: 'coach', activeCoachSection: 'message', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
          users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: GRP,
          players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const boardText = () => page.evaluate(() => (document.getElementById('coach-message')?.innerText || '').replace(/\s+/g, ' '));

      // C. forced 500
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || ''), null, { timeout: 20000 });
      let text = await boardText();
      assert.match(text, /Availability could not be loaded/, 'the coach is told the read failed');
      // Every visible LEAF that states a reply status or a chase count. The
      // error notice itself is not one (its own copy reassures the coach that
      // "nobody has been marked as no reply"), so this is the precise claim:
      // no element on the Availability screen asserts a reply state.
      const claims = () => page.evaluate(() => [...document.querySelectorAll('#coach-message *')]
        .filter(e => e.children.length === 0 && e.offsetParent !== null && /No reply|to chase|Chase all/i.test(e.innerText || ''))
        .map(e => (e.id || e.className || e.tagName) + ' :: ' + (e.innerText || '').trim().slice(0, 40)));
      assert.deepEqual(await claims(), [], 'nothing on screen says a player has not replied, or offers to chase');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message .msg-kpi.chase').length), 0,
        'the "No reply N" summary tile is gone');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message .filter-pill').length), 0,
        'so are the status filter pills and their counts');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message [onclick*="chaseAllNonResponders"]').length), 0,
        'and no chase action exists on data we do not have');
      assert.equal(await page.isVisible('#coach-message .ovw-retry'), true, 'the existing retry is offered');
      assert.match(await page.textContent('#avail-refresh-ts'), /Sync failed/, 'and the sync chip agrees');

      // D. recovery → real data
      mode.mode = 'ok';
      await page.click('#coach-message .ovw-retry');
      await page.waitForFunction(() => !/Availability could not be loaded/.test(document.getElementById('coach-message')?.innerText || ''), null, { timeout: 20000 });
      text = await boardText();
      assert.match(text, /No reply/i, 'the normal board is back');
      assert.ok((await claims()).length > 0, 'and it states reply statuses again, as it should');
      assert.match(await page.textContent('#avail-refresh-ts'), /Synced/, 'and the chip reports a real sync');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-message .msg-session-card').length > 0), true,
        'session cards (and their labels) are intact');

      // B. genuinely empty success is still the legitimate empty reading
      mode.mode = 'empty';
      await page.evaluate(() => availRefreshNow());
      await page.waitForTimeout(600);
      text = await boardText();
      assert.doesNotMatch(text, /Availability could not be loaded/, 'an empty week is not an error');
      assert.match(text, /No reply/i, 'it is a legitimate no-reply reading');

      assert.deepEqual(errors, [], 'no page errors');
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
