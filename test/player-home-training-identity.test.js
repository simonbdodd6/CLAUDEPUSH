/**
 * Player Home's Next Training card: WHICH training, and WHOSE answer.
 *
 * A previous brief assumed the card was riding a legacy `state.schedule` and
 * should be moved onto `trainingWeekOccurrences`. The audit disproved it:
 *
 *   loadPublishedStateForPlayer()   replaces state.schedule with the server's
 *                                   PUBLISHED sessions
 *        ↓                          (title, date, location, startTime, published)
 *   playerPortalNextTraining()      picks the earliest upcoming one
 *        ↓
 *   the card                        displays THOSE values
 *   the plan                        state.trainingBlocks[nextTrain.id]
 *   the badge                       tonightAvailabilityEventId(id, date)
 *
 * `trainingWeekOccurrences` cannot supply the card: its training events carry
 * the CONSTANT title 'Training', no `published`, the raw slot's venue/time and
 * no plan. Substituting it would replace "Forwards session · Main pitch ·
 * 19:30 + session plan" with "Training · Slot venue · 19:00".
 *
 * This suite is TEST-ONLY. It pins the verified flow so a future change
 * cannot quietly degrade the card or point the badge at a different training.
 * Nothing here changes production behaviour.
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

/** The real Next Training card block, lifted verbatim out of renderPlayerHome. */
function cardSource() {
  const a = src.indexOf('// ── Next training card');
  const b = src.indexOf('// ── Squad status card', a);
  assert.ok(a > 0 && b > a, 'the Next Training card block was not found in renderPlayerHome');
  return src.slice(a, b);
}

const AVAIL_DAY_INDEX = "{ Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 }";

// The RAW slots. Deliberately unlike the published rows below: this is the
// divergence the browser run proved, now pinned.
const SLOTS = [
  { id: 'slot_tue', day: 'Tue', startTime: '19:00', venue: 'Slot venue', title: 'Slot', active: true, sessionId: 'tue' },
  { id: 'slot_thu', day: 'Thu', startTime: '19:00', venue: 'Slot venue', title: 'Slot', active: true, sessionId: 'thu' },
];

/** Render the real card with the real helpers around it. */
function renderCard({ nextTrain, today = '2026-09-23', player = { id: 'p1' },
                      trainingBlocks = {}, slots = SLOTS, failed = false, known = true } = {}) {
  return new Function(`"use strict";
    let _availReadFailed = ${JSON.stringify(failed)};
    let _playerAvailKnown = ${JSON.stringify(known)};
    let _trainingSchedule = ${JSON.stringify({ slots })};
    const state = { activeView: 'player', trainingBlocks: ${JSON.stringify(trainingBlocks)} };
    const AVAIL_DAY_INDEX = ${AVAIL_DAY_INDEX};
    function ensureTrainingSchedule() {}
    function availToday() { return ${JSON.stringify(today)}; }
    ${fn('esc')}
    ${fn('pCard')}
    ${fn('pCardHead')}
    ${fn('pBadge')}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('tonightAvailabilityEventId')}
    ${fn('availabilityLastReadFailed')}
    ${fn('playerAvailabilityReadUnknown')}
    ${fn('playerPortalAvailabilityStatus')}
    const today = ${JSON.stringify(today)};
    const player = ${JSON.stringify(player)};
    const nextTrain = ${JSON.stringify(nextTrain)};
    ${cardSource()}
    return nextTrainCard;
  `)();
}

/** What a human sees — tags stripped, whitespace collapsed. */
const visible = html => String(html).replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

function nextTraining(schedule, today) {
  return new Function(`"use strict";
    ${fn('playerPortalNextTraining')}
    return playerPortalNextTraining(${JSON.stringify(schedule)}, ${JSON.stringify(today)});
  `)();
}

// The published rows: what the coach actually published, and what the card
// must show. Tue 29 Sep 2026 and Thu 1 Oct 2026.
const PUB_TUE = { id: 'slot_tue', type: 'Training', date: '2026-09-29', title: 'Forwards session',
                  location: 'Main pitch', startTime: '19:30', published: true };
const PUB_THU = { id: 'slot_thu', type: 'Training', date: '2026-10-01', title: 'Defence session',
                  location: 'Back pitch', startTime: '19:15', published: true };
const DATED_TUE = 'slot_tue-20260929';
const DATED_THU = 'slot_thu-20261001';

// ── A. the published schedule is the card's source ────────────────────────
test('A. the card shows the PUBLISHED title, date, location and start time', () => {
  const html = renderCard({ nextTrain: PUB_TUE });
  const text = visible(html);
  assert.match(text, /Next Training/);
  assert.match(text, /Forwards session/, 'the published title');
  assert.match(text, /Tue 29 Sept?/, "the published row's own date");
  assert.match(text, /Main pitch/, 'the published location');
  assert.match(text, /19:30/, 'the published start time');
});

test('A. those values come from the schedule row, not from anywhere else', () => {
  // Change the row alone — every displayed value follows it.
  const html = renderCard({ nextTrain: { ...PUB_TUE, title: 'Scrum clinic', location: 'Indoor barn', startTime: '20:05' } });
  const text = visible(html);
  assert.match(text, /Scrum clinic/);
  assert.match(text, /Indoor barn/);
  assert.match(text, /20:05/);
  assert.doesNotMatch(text, /Forwards session|Main pitch|19:30/);
});

test('A. the card is selected by playerPortalNextTraining over state.schedule', () => {
  const home = fn('renderPlayerHome');
  assert.match(home, /const nextTrain\s*=\s*playerPortalNextTraining\(state\.schedule, today\)/,
    'Home selects its training from the published schedule');
  // The card block must not have been re-pointed at the occurrence builder.
  assert.doesNotMatch(cardSource(), /trainingWeekOccurrences|availabilityEventsForWeek/,
    'the card is NOT sourced from the occurrence builder (it has no title, no published flag and no plan)');
  // Ordering semantics: earliest upcoming, today included, past excluded.
  const sched = [PUB_THU, PUB_TUE, { id: 'slot_old', type: 'Training', date: '2026-09-01', title: 'Old' },
                 { id: 'fx', type: 'Match', date: '2026-09-26', title: 'Match' }];
  assert.equal(nextTraining(sched, '2026-09-23').id, 'slot_tue', 'earliest upcoming Training wins');
  assert.equal(nextTraining(sched, '2026-09-29').id, 'slot_tue', 'today counts as upcoming');
  assert.equal(nextTraining(sched, '2026-09-30').id, 'slot_thu', 'once it is past, the next one wins');
});

// ── B. the session plan is keyed by that same published row id ────────────
test('B. the plan shown is state.trainingBlocks[nextTrain.id]', () => {
  const blocks = { slot_tue: [{ time: '19:30', activity: 'Scrum shape' }, { time: '19:50', activity: 'Lineout' }] };
  const text = visible(renderCard({ nextTrain: PUB_TUE, trainingBlocks: blocks }));
  assert.match(text, /Session plan/i);
  assert.match(text, /19:30 Scrum shape/);
  assert.match(text, /19:50 Lineout/);
});

test('B. it is keyed by the ROW id — not the dated id, not another row', () => {
  const misfiled = {
    [DATED_TUE]: [{ time: '19:30', activity: 'Dated key plan' }],
    slot_thu:    [{ time: '19:15', activity: 'Other session plan' }],
  };
  const text = visible(renderCard({ nextTrain: PUB_TUE, trainingBlocks: misfiled }));
  assert.doesNotMatch(text, /Dated key plan/, 'the plan is not read under the availability identity');
  assert.doesNotMatch(text, /Other session plan/, "and never from another row's plan");
  assert.doesNotMatch(text, /Session plan/i, 'with nothing under its own id there is no plan block at all');
  // And the server half: adoption files blocks under the session's own id.
  const adopt = new Function(`"use strict"; ${fn('adoptPublishedBlocks')}
    return adoptPublishedBlocks({}, [{ id: 'slot_tue', blocks: [{ time: '19:30', activity: 'Scrum shape' }] }], false);`)();
  assert.deepEqual(Object.keys(adopt), ['slot_tue'], 'adoptPublishedBlocks keys by the session id the card reads');
});

test('B. an unpublished row shows no plan (existing contract, unchanged)', () => {
  const blocks = { slot_tue: [{ time: '19:30', activity: 'Draft only' }] };
  const text = visible(renderCard({ nextTrain: { ...PUB_TUE, published: false }, trainingBlocks: blocks }));
  assert.doesNotMatch(text, /Draft only/, 'a draft plan is never shown to the player');
  assert.match(text, /Forwards session/, 'but the card itself still renders');
});

// ── C. the badge asks about the DATED occurrence of that same row ─────────
test('C. the badge reads the answer stored under slot_tue-20260929', () => {
  const answered = { id: 'p1', ['avail_' + DATED_TUE]: 'available' };
  assert.match(visible(renderCard({ nextTrain: PUB_TUE, player: answered })), /Available/);
});

test('C. it does NOT read the legacy bare stores, nor an undated slot key', () => {
  // Every legacy place an answer could have been filed. None of them may
  // satisfy a card whose dated occurrence has no answer.
  for (const [k, where] of [['trainingTuesday', 'the legacy bare Tuesday store'],
                            ['trainingThursday', 'the legacy bare Thursday store'],
                            ['avail_tue', 'the undated slot key'],
                            ['avail_slot_tue', 'the raw slot id'],
                            ['game', 'the legacy match store']]) {
    const text = visible(renderCard({ nextTrain: PUB_TUE, player: { id: 'p1', [k]: 'available' } }));
    assert.doesNotMatch(text, /Available/, `${where} must not answer for the dated occurrence`);
    assert.match(text, /Not replied/, `${where} leaves the dated occurrence unanswered`);
  }
});

test('C. the identity follows the ROW date, not today', () => {
  // The bug this pins: resolving "tonight" for a card about next week.
  const scope = new Function(`"use strict";
    let _trainingSchedule = ${JSON.stringify({ slots: SLOTS })};
    const AVAIL_DAY_INDEX = ${AVAIL_DAY_INDEX};
    function ensureTrainingSchedule() {}
    function availToday() { return '2026-09-23'; }
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availSlotDateInWeek')} ${fn('availTrainingEventId')}
    ${fn('tonightAvailabilityEventId')}
    return tonightAvailabilityEventId;`)();
  assert.equal(scope('slot_tue', '2026-09-29'), DATED_TUE, "next week's occurrence, from next week's date");
  assert.equal(scope('slot_thu', '2026-10-01'), DATED_THU);
  assert.notEqual(scope('slot_tue', '2026-09-29'), scope('slot_tue', '2026-09-22'),
    'two dates of the same slot are two different availability identities');
  // And the wiring passes the row's date, not nothing.
  assert.match(cardSource(),
    /playerPortalAvailabilityStatus\(player, tonightAvailabilityEventId\(nextTrain\.id, nextTrain\.date\)\)/,
    'the badge resolves the dated occurrence for the row it is showing');
});

// ── D. the exact browser scenario: raw slot vs published row ──────────────
test('D. with the raw slot deliberately different, the card shows the PUBLISHED values', () => {
  // Raw slot: "Slot" / Slot venue / 19:00.  Published row: Forwards session /
  // Main pitch / 19:30.  The answer lives only under the dated occurrence.
  const player = { id: 'p1', ['avail_' + DATED_TUE]: 'available' };
  const text = visible(renderCard({ nextTrain: PUB_TUE, player }));
  assert.match(text, /Forwards session/);
  assert.match(text, /Main pitch/);
  assert.match(text, /19:30/);
  assert.doesNotMatch(text, /Slot venue/, 'the raw slot venue never reaches the card');
  assert.doesNotMatch(text, /19:00/, 'nor the raw slot time');
  assert.match(text, /Available/, 'and the badge still resolves through slot_tue-20260929');
  assert.doesNotMatch(text, /Not replied/);
});

// ── E. the card and the badge mean the SAME training ──────────────────────
test('E. two upcoming trainings: the badge belongs to the one on the card', () => {
  // Opposite answers, so a mix-up cannot pass unnoticed.
  const player = { id: 'p1', ['avail_' + DATED_TUE]: 'available', ['avail_' + DATED_THU]: 'unavailable' };
  const chosen = nextTraining([PUB_THU, PUB_TUE], '2026-09-23');
  assert.equal(chosen.id, 'slot_tue', 'Home selects the Tuesday');
  const tue = visible(renderCard({ nextTrain: chosen, player }));
  assert.match(tue, /Forwards session/);
  assert.match(tue, /Available/);
  assert.doesNotMatch(tue, /Not available/, "Tuesday's card must not wear Thursday's answer");

  // Once Tuesday is past, both halves move together.
  const next = nextTraining([PUB_THU, PUB_TUE], '2026-09-30');
  const thu = visible(renderCard({ nextTrain: next, player, today: '2026-09-30' }));
  assert.match(thu, /Defence session/);
  assert.match(thu, /Not available/);
  assert.doesNotMatch(thu, /\bAvailable\b/, "Thursday's card must not wear Tuesday's answer");
});

// ── F. nothing upcoming ───────────────────────────────────────────────────
test('F. no upcoming training keeps the existing empty state', () => {
  assert.equal(nextTraining([{ id: 'slot_tue', type: 'Training', date: '2026-09-01' }], '2026-09-23'), null);
  assert.equal(nextTraining([], '2026-09-23'), null);
  assert.equal(nextTraining(null, '2026-09-23'), null, 'no schedule at all is not a crash');
  const text = visible(renderCard({ nextTrain: null }));
  assert.match(text, /Next Training/);
  assert.match(text, /No training sessions scheduled\./);
  assert.doesNotMatch(text, /Session plan|Available|Not replied/, 'an empty card claims nothing');
});

// ── G. the failure-state contract (c35ac4e4 / e89dfc6b / 77a52595) ────────
test('G. a failed self-read reads "Not known", never "Not replied"', () => {
  const text = visible(renderCard({ nextTrain: PUB_TUE, failed: true, known: false }));
  assert.match(text, /Not known/, 'an unknown read does not claim the player failed to reply');
  assert.doesNotMatch(text, /Not replied/);
  assert.match(text, /Forwards session/, 'the card itself is unaffected — only the claim about the answer');
  assert.match(text, /Set availability/, 'and answering is still one tap away');
});

test('G. a known answer survives a later failure, and the board predicate is not consulted', () => {
  const player = { id: 'p1', ['avail_' + DATED_TUE]: 'available' };
  assert.match(visible(renderCard({ nextTrain: PUB_TUE, player, failed: true, known: true })), /Available/,
    'what this device knows is still shown');
  // 77a52595: the player surfaces ask the PLAYER question, never the board's.
  assert.match(fn('playerPortalAvailabilityStatus'), /playerAvailabilityReadUnknown/);
  assert.doesNotMatch(fn('playerPortalAvailabilityStatus'), /availabilityReadUnknown\(\)/,
    'a player badge never asks the coach board question');
});

test('G. a genuine non-answer is still allowed to say so', () => {
  const text = visible(renderCard({ nextTrain: PUB_TUE, failed: false, known: true }));
  assert.match(text, /Not replied/, 'a successful read with no answer is a real "no reply"');
  assert.doesNotMatch(text, /Not known/);
});

// ── the real player app ───────────────────────────────────────────────────
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const GRP = 'grp_home', TEAM = 'team_stub';
/** The next Tuesday on or after today, and its dated occurrence id. */
const TUE = (() => { const x = new Date(); x.setUTCDate(x.getUTCDate() + ((1 - ((x.getUTCDay() + 6) % 7) + 7) % 7)); return x.toISOString().slice(0, 10); })();
const TUE_EVENT = 'slot_tue-' + TUE.replace(/-/g, '');
const ME = { id: 'p1', userId: 'u1', name: 'Gaetan Player', position: 'Prop', playerGroupId: GRP };
const SESSION = { ok: true, user: { id: 'u1', name: 'Gaetan Player', email: 'p@s.test', role: 'player', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'player', status: 'active', playerGroupId: GRP }, permissions: [],
  memberships: [{ teamId: TEAM, teamName: 'Stub RFC', role: 'player', canonicalRole: 'player', current: true }],
  operational: { player: { groups: [{ id: GRP, name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: GRP, mustChoose: false },
                 staff: { groups: [], defaultGroupId: null, mustChoose: false } } };
// The PUBLISHED session the coach sent out…
const PUBLISHED = [{ id: 'slot_tue', type: 'Training', date: TUE, title: 'Forwards session', location: 'Main pitch',
                     startTime: '19:30', published: true, blocks: [{ time: '19:30', activity: 'Scrum shape' },
                                                                   { time: '19:50', activity: 'Lineout' }] }];
// …and the RAW slot behind it, deliberately different.
// NOTE: /api/publish?resource=training-schedule answers with the record spread
// at the TOP level (`{ ok, slots, … }`). A stub that nests it under `schedule`
// leaves _trainingSchedule.slots undefined, the occurrence list empty, and the
// badge silently falling back to the bare id — a false bug.
const RAW_SLOTS = [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', venue: 'Slot venue', active: true, sessionId: 'tue' }];

/** mode: 'ok' (answered under the dated occurrence) | 'empty' | 'fail'. */
function server(mode, answer = 'available') {
  const st = { mode, answer };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/availability')) {
      if (st.mode === 'fail') { res.statusCode = 500; return send({ error: 'boom' }); }
      if (u.includes('myResponse=1')) return send({ responses: st.mode === 'ok' ? { [TUE_EVENT]: { response: st.answer, reason: '' } } : {} });
      return send({ resolved: {}, roster: [ME] });
    }
    if (u.startsWith('/api/identity')) return send(SESSION);
    if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: [] });
    if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: GRP, name: 'Seniors', status: 'active' }], teams: [] });
    if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: RAW_SLOTS, groupId: GRP, canEdit: false });
    if (u.startsWith('/api/publish?resource=training')) return send({ ok: true, sessions: PUBLISHED });
    if (u.startsWith('/api/publish?resource=roster')) return send({ ok: true, players: [ME] });
    if (u.startsWith('/api/publish?type=all')) return send({ ok: true, sessions: PUBLISHED });
    if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: TEAM, name: 'Stub RFC' } });
    if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [] });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return { srv, st };
}
const SEED = { activeView: 'player', activePlayerSection: 'home', stateTeamId: TEAM, clubName: 'Stub RFC', currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Gaetan Player', email: 'p@s.test', role: 'player', playerId: 'p1' }], operationalGroupId: GRP,
  players: [ME], fixtures: [], schedule: [], messages: [], onboardingDismissed: true };

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): Home shows the published session and its own dated answer`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv } = server('ok', 'available');
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)), SEED);
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const requests = []; page.on('request', r => requests.push(r.url()));
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /Forwards session/.test(document.getElementById('player-home')?.innerText || ''), null, { timeout: 20000 });
      const home = await page.evaluate(() => (document.getElementById('player-home')?.innerText || '').replace(/\s+/g, ' '));

      assert.match(home, /Forwards session/, 'the published title');
      assert.match(home, /Main pitch/, 'the published location');
      assert.match(home, /19:30/, 'the published start time');
      assert.doesNotMatch(home, /Slot venue/, 'never the raw slot venue');
      assert.match(home, /Scrum shape/, 'the published session plan');
      assert.match(home, /Available/, 'the answer filed under the dated occurrence');
      assert.doesNotMatch(home, /Not replied|Not known/, 'and no contradiction of it');

      // The identity the badge actually resolved, from the running app.
      const resolved = await page.evaluate(d => tonightAvailabilityEventId('slot_tue', d), TUE);
      assert.equal(resolved, TUE_EVENT, 'the dated occurrence, not the bare slot id');
      const plan = await page.evaluate(() => ((state.trainingBlocks || {}).slot_tue || []).length);
      assert.equal(plan, 2, 'the plan is filed under the same row id the card reads');
      // state.schedule is the authoritative source, and it holds the SERVER's
      // row (the local default seeds stay only where the server has nothing).
      const picked = await page.evaluate(d => playerPortalNextTraining(state.schedule, d), TUE);
      assert.equal(picked.id, 'slot_tue');
      assert.equal(picked.title, 'Forwards session', 'the published row, not a local default');
      assert.equal(picked.date, TUE);
      assert.equal(picked.location, 'Main pitch');

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0), 'no horizontal overflow');
      const publishCalls = requests.filter(u => u.includes('/api/publish?type=all')).length;
      assert.ok(publishCalls <= 2, `published state is not re-fetched in a loop (saw ${publishCalls})`);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

test('browser: a failed read leaves the published card intact and the answer unknown', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const { srv } = server('fail');
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' });
    await ctx.addInitScript(seed => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(seed)), SEED);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /Not known/.test(document.getElementById('player-home')?.innerText || ''), null, { timeout: 20000 });
    const home = await page.evaluate(() => (document.getElementById('player-home')?.innerText || '').replace(/\s+/g, ' '));
    assert.match(home, /Forwards session/, 'the training itself is still known — it came from the publish read');
    assert.match(home, /Not known/, 'only the ANSWER is unknown');
    assert.doesNotMatch(home, /Not replied/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
