/**
 * Player Home availability reads the DATED session, not a legacy bare key.
 *
 * Found during the player failure-state audit (c35ac4e4) and left for this
 * build: Home asked for the wrong session entirely.
 *
 *   Next Fixture  → playerPortalAvailabilityStatus(player, 'game')
 *   Next Training → playerPortalAvailabilityStatus(player, nextTrain.id)  // 'tue'
 *
 * Both are LEGACY bare ids. Since the dated-id cutover a real answer lives
 * under the dated occurrence (`avail_<fixtureId>`, `avail_<slot>-YYYYMMDD`),
 * which is what the Availability screen reads. Proven in the browser: a player
 * whose Availability screen said "Available" was told "Not replied" on Home.
 *
 * The fix passes the dated identity, resolved through the SAME helper the
 * Overview already uses for tonight — now asked about any date. Nothing about
 * the failure-state work (c35ac4e4) changes: an unknown read still reads
 * "Not known" rather than claiming a reply state.
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

// ── The resolver: one helper, asked about any date ─────────────────────────
const SLOTS = [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', active: true, sessionId: 'tue' },
               { id: 'slot_thu', day: 'Thu', startTime: '19:00', active: true, sessionId: 'thu' }];
function resolverScope({ today = '2026-09-23', slots = SLOTS } = {}) {
  return new Function(`"use strict";
    let _trainingSchedule = ${JSON.stringify({ slots })};
    function ensureTrainingSchedule() {}
    function availToday() { return ${JSON.stringify(today)}; }
    const AVAIL_DAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('tonightAvailabilityEventId')}
    return { availabilityEventIdForDate: tonightAvailabilityEventId, tonightAvailabilityEventId };
  `)();
}

test('E. the resolver names the DATED occurrence for the date asked about', () => {
  const s = resolverScope();
  // Tue of the week containing Wed 23 Sep 2026 is Tue 22 Sep.
  assert.equal(s.availabilityEventIdForDate('tue', '2026-09-22'), 'slot_tue-20260922');
  // A date in ANOTHER week resolves to THAT week's occurrence — the bug was
  // asking only about today, so a future session fell back to the bare id.
  assert.equal(s.availabilityEventIdForDate('tue', '2026-09-29'), 'slot_tue-20260929');
  assert.equal(s.availabilityEventIdForDate('thu', '2026-10-01'), 'slot_thu-20261001');
});

test('E. the resolver leaves anything it cannot date alone (unchanged behaviour)', () => {
  const s = resolverScope();
  assert.equal(s.availabilityEventIdForDate('game', '2026-09-26'), 'game', 'a legacy match id passes through');
  assert.equal(s.availabilityEventIdForDate('', '2026-09-26'), '', 'nothing in, nothing out');
  assert.equal(s.availabilityEventIdForDate('fx_sat', '2026-09-26'), 'fx_sat', 'a fixture IS its own session id');
  assert.equal(s.availabilityEventIdForDate('tue', '2026-09-23'), 'tue',
    'a date with no occurrence keeps the id it was given — no invented identity');
  assert.equal(s.availabilityEventIdForDate('tue', ''), 'tue', 'no date → today (a Wednesday here), so no occurrence');
});

test('ONE resolver: the same helper answers for today by default and for any date on request', () => {
  const s = resolverScope({ today: '2026-09-22' });          // a Tuesday
  assert.equal(s.tonightAvailabilityEventId('tue'), 'slot_tue-20260922', 'no date → tonight, exactly as before');
  assert.equal(s.tonightAvailabilityEventId('tue', '2026-09-29'), 'slot_tue-20260929', 'a date → that occurrence');
  // No second resolver was introduced beside it.
  assert.equal((src.match(/function availabilityEventIdForDate/g) || []).length, 0, 'no parallel resolver exists');
  assert.equal((src.match(/function tonightAvailabilityEventId/g) || []).length, 1, 'exactly one, still by its original name');
  assert.match(fn('tonightAvailabilityEventId'), /const day = String\(dateIso \|\| availToday\(\)\)/, 'the date defaults to today');
});

// ── A + B: the status a Home badge would show, from a real player record ───
function statusScope() {
  return new Function(`"use strict";
    let _availReadFailed = false, _availLastSync = 'x', _resolvedAvailability = {}, _resolvedAvailabilityGroup = '';
    let _playerAvailKnown = true;
    const state = { activeView: 'player', operationalGroupId: '' };
    function currentResolvedAvailability() { return null; }
    ${fn('availabilityLastReadFailed')}
    ${fn('playerAvailabilityReadUnknown')}
    ${fn('playerPortalAvailabilityStatus')}
    return { status: (p, id) => playerPortalAvailabilityStatus(p, id),
             fail: () => { _availReadFailed = true; _playerAvailKnown = false; } };
  `)();
}
const FX = 'fx_sat';
const DATED_TUE = 'slot_tue-20260922';

test('A. an answer stored against the DATED fixture is read by the dated id — and was NOT by "game"', () => {
  const s = statusScope();
  const player = { id: 'p1', ['avail_' + FX]: 'available' };
  assert.equal(s.status(player, FX).label, 'Available', 'the dated id finds the answer');
  // The old call site. This is the bug, pinned so it cannot come back.
  assert.equal(s.status(player, 'game').label, 'Not replied',
    'the legacy bare id finds nothing — which is exactly what Home used to ask for');
});

test('A. the same holds for training: the dated occurrence, not the bare slot id', () => {
  const s = statusScope();
  const player = { id: 'p1', ['avail_' + DATED_TUE]: 'available', trainingTuesday: 'no-reply' };
  assert.equal(s.status(player, DATED_TUE).label, 'Available');
  assert.equal(s.status(player, 'tue').label, 'Not replied', 'the bare store is inert history');
});

test('B. every existing answer state still reads correctly through the dated id', () => {
  const s = statusScope();
  for (const [stored, label] of [['available', 'Available'], ['unavailable', 'Not available'],
                                 ['maybe', 'Maybe'], ['injured', 'Injured']]) {
    assert.equal(s.status({ id: 'p1', ['avail_' + FX]: stored }, FX).label, label, stored);
  }
  assert.equal(s.status({ id: 'p1' }, FX).label, 'Not replied', 'genuinely no response still reads as no reply');
  assert.equal(s.status({ id: 'p1' }, FX).status, 'no-reply', 'and keeps its existing status value — no new state');
});

test('C. the failure state from c35ac4e4 is untouched: unknown reads "Not known"', () => {
  const s = statusScope();
  s.fail();
  assert.equal(s.status({ id: 'p1' }, FX).label, 'Not known', 'a failed read never claims the player did not reply');
  assert.equal(s.status({ id: 'p1', ['avail_' + FX]: 'available' }, FX).label, 'Available',
    'and a known answer is still shown');
});

// ── Home's wiring ─────────────────────────────────────────────────────────
test('E. Home asks for the fixture it is showing, and the dated occurrence for its training', () => {
  const home = fn('renderPlayerHome');
  assert.match(home, /playerPortalAvailabilityStatus\(player, nextFx\.id\)/,
    'the Next Fixture badge asks about THAT fixture');
  assert.match(home, /playerPortalAvailabilityStatus\(player, tonightAvailabilityEventId\(nextTrain\.id, nextTrain\.date\)\)/,
    'the Next Training badge resolves the dated occurrence for its own date');
  assert.doesNotMatch(home, /playerPortalAvailabilityStatus\(player, 'game'\)/, 'no legacy bare match id');
  assert.doesNotMatch(home, /playerPortalAvailabilityStatus\(player, nextTrain\.id\)/, 'no legacy bare slot id');
  // The rest of Home is untouched: still its own fixtures, still the same card.
  assert.match(home, /const myFixtures  = playerContextFixtures\(\);/, 'group-scoped fixtures unchanged');
  assert.match(home, /avail\.status === 'no-reply'[\s\S]{0,200}Set availability/, 'the route to answering is unchanged');
});

// ── The real player app ───────────────────────────────────────────────────
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

/** mode: 'ok' (an answer exists server-side) | 'empty' | 'fail'. */
function server(mode, answer = 'available') {
  const st = { mode, answer };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      if (st.mode === 'fail') { res.statusCode = 500; return send({ error: 'boom' }); }
      if (u.includes('myResponse=1')) return send({ responses: st.mode === 'ok' ? { fx_sat: { response: st.answer, reason: '' } } : {} });
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
const SEED = { activeView: 'player', activePlayerSection: 'availability', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Gaetan Player', email: 'p@s.test', role: 'player', playerId: 'p1' }], operationalGroupId: GRP,
  players: [ME], fixtures: FIXTURES, messages: [], onboardingDismissed: true };

/**
 * Open Home and wait for what every Home assertion here is ABOUT: the Next
 * Fixture card showing this fixture, with the badge the assertion reads.
 *
 * This used to be `setSection` + a fixed 450–500 ms pause, and that pause was
 * racing a server reply, not a paint. Home's fixture card is group-scoped and
 * deliberately fails closed ("No fixtures scheduled.") until the SESSION names
 * the player's group — while the Availability-screen states these tests wait
 * on first can be reached from locally persisted state before that reply
 * lands. Measured with the session reply delayed: Home painted in 14 ms, read
 * "No fixtures scheduled." at 500 ms, and showed the fixture at 554 ms. On a
 * loaded machine (the release gate runs the whole suite at once) that is
 * exactly how "an empty week still reads as not replied" failed once.
 *
 * Nothing is weakened: the badge is asserted exactly as before, and a Home
 * that never shows the fixture fails here instead of passing by accident.
 */
async function openHome(page) {
  await page.evaluate(() => setSection('player', 'home'));
  await page.waitForFunction(opp => (document.getElementById('player-home')?.innerText || '').includes('vs ' + opp),
    FIXTURES[0].opposition, { timeout: 20000 });
  return page.evaluate(() => (document.getElementById('player-home')?.innerText || '').replace(/\s+/g, ' '));
}

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): Home shows the same answer the Availability screen shows`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, st } = server('ok', 'available');
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)), SEED);
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const availText = () => page.evaluate(() => (document.getElementById('player-availability')?.innerText || '').replace(/\s+/g, ' '));
      const homeText  = () => openHome(page);
      const backToAvail = async () => { await page.evaluate(() => setSection('player', 'availability')); await page.waitForTimeout(350); };

      // 1. AVAILABLE, answered server-side (the reported case)
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Available/.test(document.getElementById('player-availability')?.innerText || ''), null, { timeout: 20000 });
      assert.match(await availText(), /All sessions confirmed|Available/, 'Availability shows the answer');
      let home = await homeText();
      assert.match(home, /Available/, 'and Home says the same');
      assert.doesNotMatch(home, /Not replied/, 'Home no longer contradicts it');

      // 2. UNAVAILABLE, answered on the Availability screen itself
      await backToAvail();
      await page.click('#player-availability button:has-text("Unavailable")');
      await page.waitForTimeout(600);
      assert.match(await availText(), /Unavailable|Not available/, 'the screen records it');
      home = await homeText();
      assert.match(home, /Not available|Unavailable/, 'Home follows the change');
      assert.doesNotMatch(home, /Not replied/);

      // 3. NO RESPONSE is still allowed to say so
      await page.evaluate(() => { const p = state.players.find(x => x.id === 'p1'); Object.keys(p).forEach(k => { if (/^avail_/.test(k)) delete p[k]; }); saveState(); });
      home = await homeText();
      assert.match(home, /Not replied/, 'a genuinely unanswered fixture still reads as not replied');

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0), 'no horizontal overflow');
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

test('browser: a failed self-read still shows the honest unknown state on Home (c35ac4e4 preserved)', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const { srv, st } = server('fail');
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' });
    await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)), SEED);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /Availability unavailable/.test(document.getElementById('player-availability')?.innerText || ''), null, { timeout: 20000 });
    const home = await openHome(page);
    assert.match(home, /Not known/, 'the failure state still wins over any reply claim');
    assert.doesNotMatch(home, /Not replied/);

    // Recovery: a real answer arrives and Home shows it through the dated id.
    st.mode = 'ok';
    await page.evaluate(() => playerAvailRetryNow());
    await page.waitForTimeout(900);
    await page.evaluate(() => renderPlayerHome());
    const after = await page.evaluate(() => (document.getElementById('player-home')?.innerText || '').replace(/\s+/g, ' '));
    assert.match(after, /Available/, 'and recovery shows the real answer on Home');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});

test('browser: an empty week still reads as not replied on Home (unchanged)', async (t) => {
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
    const home = await openHome(page);
    assert.match(home, /Not replied/, 'an empty week is a real "no reply", not an error');
    assert.doesNotMatch(home, /Not known/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
