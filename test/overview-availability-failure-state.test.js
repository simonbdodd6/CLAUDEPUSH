/**
 * Overview availability failure-state honesty.
 *
 * e9deb7a0 made the Availability SCREEN honest about a failed
 * /api/availability read, and deliberately left two Overview surfaces alone:
 * the availability cards and the "N players haven't replied" attention item.
 * The result was a contradiction a coach could see in two taps — the board
 * saying "Availability could not be loaded" while the Overview said
 * "18 players haven't replied" and offered to chase them.
 *
 * Both surfaces now ask the SAME question the board asks
 * (availabilityReadUnknown, from e9deb7a0 — no second mechanism, no new
 * status). Pinned here as wiring contracts, and proved on the real Overview in
 * the browser tests at the bottom, which also assert that the two screens
 * agree. Those skip when Playwright is unavailable.
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

// ── Wiring contracts ───────────────────────────────────────────────────────
test('the Overview asks the SAME question as the board — no second mechanism', () => {
  const dash = fn('renderClubCommandDashboard');
  const attn = fn('getNeedsAttentionItems');
  for (const [where, body] of [['dashboard', dash], ['attention items', attn]]) {
    assert.match(body, /const availUnknown = typeof availabilityReadUnknown === 'function' && availabilityReadUnknown\(\);/,
      `${where} reads the existing predicate, typeof-guarded for the sandboxes that run it`);
  }
  // Nothing invented a parallel flag or a fifth status: the flag is declared
  // once and assigned in exactly one place (the setter), and every surface
  // reads it through the predicates.
  assert.equal((src.match(/_availReadFailed = /g) || []).length, 2, 'declared once, assigned only by the setter');
  assert.doesNotMatch(dash, /_availReadFailed|'unknown'|"unknown"/, 'the Overview reads the predicate, never the raw flag or a new status');
  assert.doesNotMatch(attn, /_availReadFailed/);
});

test('1+2+3. the "N players haven\'t replied" item and its chase action are withheld when the read failed', () => {
  const attn = fn('getNeedsAttentionItems');
  const at = attn.indexOf('if (availUnknown) {');
  assert.ok(at > 0, 'the unknown case is decided before the count is used');
  const branch = attn.slice(at, at + 900);
  assert.match(branch, /text:'Availability could not be loaded'/, 'and says so instead');
  assert.match(branch, /cta:'Try again', action:`availRefreshNow\(\)`/, 'offering the refresh the Availability screen already owns');
  // CONTRACT CHANGE (Build 104): the gate is no longer "any request this device
  // ever sent" (requestEverSent) but a request for one of THIS week's
  // occurrences in the group being operated (requestedThisWeek). What this
  // assertion protects is unchanged: the chase item is the ELSE of the
  // failure item, so the two can never both be raised.
  assert.match(branch, /\} else if \(requestedThisWeek\) \{/, 'the chase item is the ELSE — never both');
  assert.doesNotMatch(attn, /requestEverSent/, 'and the device-wide, all-time gate is gone');
  // The fabricated number and its action live only in that else branch.
  const chaseAt = attn.indexOf('availabilityNonResponders(availabilityWeekSessions())');
  assert.ok(chaseAt > at, 'the non-responder count is computed only when the answers are known');
  assert.match(attn.slice(chaseAt, chaseAt + 600), /haven\\'t\n?|hasn\\'t|chaseAllNonResponders\(\)/, 'that branch is the chase item');
});

test('4. both Overview availability cards show the established unavailable treatment', () => {
  const dash = fn('renderClubCommandDashboard');
  assert.match(dash, /const availUnavailableBody = `<p class="ovw-empty"><strong>Availability unavailable<\/strong>/,
    'the same .ovw-empty shape the Recent activity card uses for its own failure');
  assert.match(dash, /<button type="button" class="ovw-retry" onclick="event\.stopPropagation\(\);availRefreshNow\(\)">Try again<\/button>/,
    'and the same retry control, pointed at the existing refresh — and stopping the click reaching the card link behind it');
  assert.match(dash, /const availabilityBody = availUnknown \? availUnavailableBody :/, 'Training Availability');
  assert.match(dash, /const squadAvailBody = availUnknown \? availUnavailableBody :/, 'Match Availability');
  assert.match(dash, /card\('Training Availability', !availUnknown && av\.kind !== 'none'/,
    'and the card\'s % badge — the same fabricated number in smaller type — is withheld too');
});

test('5+6. the success and genuinely-empty readings are untouched', () => {
  const dash = fn('renderClubCommandDashboard');
  assert.match(dash, /const noReplies      = ctx => ctx\.kind !== 'none' && ctx\.responded === 0;/, 'empty is still empty');
  assert.match(dash, /availNoReplies \? noRepliesBodyOf\(av\) : `/, 'and still reads "No responses yet"');
  assert.match(dash, /av\.kind === 'none' \? availEmpty\('a training session'\)/, 'no-subject empty state unchanged');
  assert.match(dash, /avM\.kind === 'none' \? availEmpty\('a fixture'\)/);
  // The counts themselves are computed exactly as before.
  assert.match(fn('overviewAvailabilityContext'), /overviewAnswerCounts\(roster, overviewAnswerMap\(/, 'counting is unchanged');
  assert.doesNotMatch(fn('overviewAvailabilityContext'), /availUnknown|availabilityReadUnknown/,
    'the honesty lives at the presentation boundary, not in the data model');
  assert.doesNotMatch(fn('sessionRows'), /availabilityReadUnknown/, 'sessionRows is untouched');
});

test('8. recovery repaints the Overview, on the transition only', () => {
  const setter = fn('availabilitySetReadFailed');
  assert.match(setter, /if \(_availReadFailed === next\) return;/, 'still only on a transition');
  assert.match(setter, /coachSectionActive\('overview'\)[\s\S]{0,120}renderCoachOverview\(\)/,
    'the Overview repaints when it is the section on screen');
  assert.match(setter, /renderMessageCenter\(\)/, 'and the board still does too');
});

// ── The real Overview, in a browser ────────────────────────────────────────
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const GRP = 'grp_initial', TEAM = 'team_stub';
// ── THE FIXTURE'S DATE — valid on every weekday ────────────────────────────
// This journey serves ONE fixture and reads it back on the coach Overview:
// the Match Availability card (the next fixture still to be played) and the
// needs-attention item (the occurrences of the CURRENT week). It used to be
// dated "the coming Saturday", counted from the day the suite ran. On a
// Sunday the coming Saturday is six days ahead — in NEXT week — so the week
// the attention item counts was empty, and the recovery assertions below were
// satisfied by a card label rather than by a real reading.
//
// The date now comes from the application's OWN week and occurrence
// functions, extracted from index.html like every other function under test
// here (the approach of the three suites corrected in Build 102). Since
// Build 104 it matters for a second reason: the attention item is raised only
// by a request for one of THIS week's occurrences, so the fixture the seeded
// request names has to be one. No week
// arithmetic is restated: the app's generator is asked, day by day from
// today, which dates it places in the week it displays, and the fixture is
// played on the LAST of them — inside the displayed week by construction, and
// never passed, whichever weekday the suite runs.
const APP_WEEK = new Function(`
  ${src.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
  ${fn('availWeekStart')}
  ${fn('availAddDays')}
  ${fn('availSlotDateInWeek')}
  ${fn('availTrainingEventId')}
  ${fn('availabilityEventsForWeek')}
  ${fn('availToday')}
  ${fn('playerPortalNextFixture')}
  return { availWeekStart, availAddDays, availabilityEventsForWeek, availToday, playerPortalNextFixture };
`)();
/** Does the app's occurrence generator place a fixture played on `dateIso` in the week it displays on `todayIso`? */
function inDisplayedWeek(dateIso, todayIso) {
  const week = APP_WEEK.availWeekStart(todayIso);
  return APP_WEEK.availabilityEventsForWeek(week, { fixtures: [{ id: 'fx_probe', opposition: 'Probe', date: dateIso, status: 'scheduled' }], slots: [], currentWeekStart: week })
    .some(e => e.id === 'fx_probe' && e.date === dateIso);
}
/** The last day of the week the app displays on `todayIso` — in that week, and not yet passed. */
function matchDayFor(todayIso) {
  let day = todayIso;
  for (let i = 0; i < 14; i++) {
    const next = APP_WEEK.availAddDays(day, 1);
    if (!inDisplayedWeek(next, todayIso)) break;
    day = next;
  }
  return day;
}
const MATCH_DAY = matchDayFor(APP_WEEK.availToday());
const PLAYERS = Array.from({ length: 18 }, (_, i) => ({ id: 'p' + i, userId: 'u_p' + i, name: 'Player ' + i, position: 'Prop', playerGroupId: GRP }));
const SESSION = { ok: true, user: { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
  permissions: ['reports', 'messaging', 'manage_players', 'manage_coaches', 'training', 'matchday', 'publish_training'],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
  operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false } } };
const FIXTURES = [{ id: 'fx_sat', groupId: GRP, opposition: 'Kituro', date: MATCH_DAY, kickoffTime: '14:00', status: 'scheduled' }];
const ANSWER_KEY = 'fx_sat';

test('the fixture this journey serves is an occurrence of the week the Overview counts, and has not passed — on every weekday', () => {
  assert.equal(FIXTURES[0].date, MATCH_DAY, 'the browser tests serve the derived date');
  assert.equal(ANSWER_KEY, FIXTURES[0].id, 'and the answers and the sent request are about that same occurrence');
  // Seven consecutive "todays" cover every weekday, whichever day the suite itself runs on.
  const weekdays = new Set();
  for (let i = 0; i < 7; i++) {
    const today = APP_WEEK.availAddDays(APP_WEEK.availToday(), i);
    const day = matchDayFor(today);
    const fixture = { ...FIXTURES[0], date: day };
    const week = APP_WEEK.availWeekStart(today);
    weekdays.add(new Date(today + 'T12:00:00Z').getUTCDay());
    // The attention item counts the CURRENT week's occurrences (availabilityWeekSessions →
    // availabilityEventsForWeek): the fixture must be one of them…
    const events = APP_WEEK.availabilityEventsForWeek(week, { fixtures: [fixture], slots: [], currentWeekStart: week });
    assert.deepEqual(events.map(e => [e.id, e.type, e.date]), [['fx_sat', 'match', day]], `today ${today}: the fixture is THE occurrence of the current week`);
    // …and not one of the following week's (the Sunday case, stated as a rule)
    assert.deepEqual(APP_WEEK.availabilityEventsForWeek(APP_WEEK.availAddDays(week, 7), { fixtures: [fixture], slots: [], currentWeekStart: week }).map(e => e.id), [],
      `today ${today}: it does not belong to next week`);
    // The Match Availability card reads the next fixture still to be played
    assert.ok(day >= today, `today ${today}: ${day} has not passed`);
    assert.equal(APP_WEEK.playerPortalNextFixture([fixture], today)?.id, 'fx_sat', `today ${today}: it is the next fixture`);
  }
  assert.equal(weekdays.size, 7, 'every weekday was covered');
});

function server(mode) {
  const st = { mode };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      if (st.mode === 'fail') { res.statusCode = 500; return send({ error: 'boom' }); }
      const resolved = {};
      if (st.mode === 'ok') PLAYERS.forEach((p, i) => { if (i < 12) resolved[p.userId] = { [ANSWER_KEY]: { response: 'available', respondedAt: '2026-09-23T08:00:00Z' } }; });
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
  return { srv, st };
}
// A request WAS sent this week — without it the attention item would never
// fire and the 500 test would pass for the wrong reason.
const SEED = { activeView: 'coach', activeCoachSection: 'overview', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' }], operationalGroupId: GRP,
  players: PLAYERS, fixtures: FIXTURES, messages: [], onboardingDismissed: true,
  availabilityRequests: [{ sessionId: ANSWER_KEY, status: 'sent', sentAt: '2026-09-22T09:00:00Z' }] };

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): the Overview never claims players have not replied when the read failed`, async (t) => {
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
      const overviewText = () => page.evaluate(() => (document.getElementById('coach-overview')?.innerText || '').replace(/\s+/g, ' '));
      // Every visible leaf on the Overview that states a reply status or count.
      const claims = () => page.evaluate(() => [...document.querySelectorAll('#coach-overview *')]
        .filter(e => e.children.length === 0 && e.offsetParent !== null && /haven't replied|hasn't replied|to chase|Chase all|No responses yet/i.test(e.innerText || ''))
        .map(e => (e.className || e.tagName) + ' :: ' + (e.innerText || '').trim().slice(0, 48)));

      // C. 500 with no prior data
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Availability unavailable|Availability could not be loaded/.test(document.getElementById('coach-overview')?.innerText || ''), null, { timeout: 20000 });
      assert.deepEqual(await claims(), [], 'no player is said to have not replied, and nothing offers to chase');
      assert.equal(await page.evaluate(() => document.querySelectorAll('#coach-overview [onclick*="chaseAllNonResponders"]').length), 0,
        'the chase action is not on the page at all');
      let text = await overviewText();
      assert.match(text, /Availability unavailable/, 'the availability cards say what happened');
      assert.match(text, /Availability could not be loaded/, 'and so does the attention item');
      assert.doesNotMatch(text, /\d+%/, 'no availability percentage is stated');
      assert.ok(await page.evaluate(() => document.querySelectorAll('#coach-overview .ovw-retry').length > 0), 'with the established retry');
      // The availability cards are links, so the retry must not navigate away.
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('#coach-overview .ovw-retry')]
        .every(b => /stopPropagation/.test(b.getAttribute('onclick') || ''))), 'and it retries in place rather than opening Availability');

      // The two screens agree — the contradiction this build exists to remove.
      await page.evaluate(() => setSection('coach', 'message'));
      await page.waitForTimeout(400);
      const board = await page.evaluate(() => (document.getElementById('coach-message')?.innerText || '').replace(/\s+/g, ' '));
      assert.match(board, /Availability could not be loaded/, 'the board says the same thing');
      await page.evaluate(() => setSection('coach', 'overview'));
      await page.waitForTimeout(300);

      // E. recovery via the Overview's own retry
      st.mode = 'ok';
      await page.click('#coach-overview .ovw-retry');
      await page.waitForFunction(() => !/Availability unavailable/.test(document.getElementById('coach-overview')?.innerText || ''), null, { timeout: 20000 });
      text = await overviewText();
      assert.doesNotMatch(text, /Availability could not be loaded/, 'the attention item is gone');
      assert.match(text, /\d+%|Available/i, 'and the real reading is back');

      // D. a failure AFTER a successful read keeps the real answers
      st.mode = 'fail';
      await page.evaluate(() => availRefreshNow());
      await page.waitForTimeout(700);
      text = await overviewText();
      assert.doesNotMatch(text, /Availability unavailable/, 'known answers are not erased by a failed refresh');
      assert.match(text, /Available/i, 'the last real reading still stands');

      // B. a genuinely empty week is still a legitimate empty reading
      st.mode = 'empty';
      await page.evaluate(() => availRefreshNow());
      await page.waitForTimeout(700);
      text = await overviewText();
      assert.doesNotMatch(text, /Availability unavailable/, 'an empty week is not a failure');

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.getElementById('coach-overview')?.getBoundingClientRect().width || 0) > 200), 'the Overview still has a layout');
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}
