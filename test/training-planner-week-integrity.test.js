/**
 * TRAINING PLANNER WEEK INTEGRITY + PDF FIDELITY.
 *
 * Production, 14–15 Sep 2026 (TRAINING-PLANNER-MOVE-DUPLICATION-FORENSIC-1):
 *  · Thursday 17 Sep showed LAST week's plan. The bare-key bridge copied a
 *    device's legacy `thu` content into the current week's dated key on every
 *    render, every week, source retained — automatic duplication.
 *  · Tuesday's plan was typed while the planner silently sat on 21–27 Sep;
 *    the only cues were a small date range and an 11px note, and the PDF's
 *    filename carried the GENERATION date.
 *  · The PDF re-sorted blocks by time and flattened newline-separated coach /
 *    key-focus lines into one run of text.
 *
 * Every test drives the REAL functions extracted from index.html / the real
 * PDF module. Nothing here touches a network or a store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSessionPdf, sessionPdfFilename, wrapMultiline } from '../src/session-pdf.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}
const NAV_DECL = html.match(/let _trainingWeekNavIn = '';[^\n]*/)[0];
const DAY_INDEX = html.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0];

const SENIORS = [
  { id: 'slot_tue', day: 'Tue', startTime: '19:45', venue: 'Foresterie', effectiveFrom: '2026-08-04', active: true, sessionId: 'tue' },
  { id: 'slot_thu', day: 'Thu', startTime: '19:45', venue: 'Foresterie', effectiveFrom: '2026-08-06', active: true, sessionId: 'thu' }];
const U18 = [
  { id: 'slot_msvgzozt_0', day: 'Tue', startTime: '17:45', venue: 'Artificial', active: true, sessionId: '' },
  { id: 'slot_msvh0skf_1', day: 'Thu', startTime: '17:45', venue: 'Grass', active: true, sessionId: '' }];
const ROWS = () => [
  { id: 'tue', title: 'TUESDAY', type: 'Training', date: '19.45', startTime: '' },
  { id: 'thu', title: 'THURSDAY', type: 'Training', date: '19.45', startTime: '' },
  { id: 'game', title: 'Match', type: 'Match', date: '' }];

/** One sandbox: real week/identity/adoption/retraction/banner/PDF-occurrence code. */
function world({ slots = SENIORS, today = '2026-09-15', weekStart = null, blocks = {}, adopted = {}, schedule = ROWS(), active = 'tue' } = {}) {
  const body = '"use strict";\nconst CFG = arguments[0];\nlet TODAY = CFG.today;\n' + DAY_INDEX + '\n' +
    'let state = { schedule: CFG.schedule, trainingBlocks: CFG.blocks, trainingAdopted: CFG.adopted, trainingWeekStart: CFG.weekStart, trainingActiveSession: CFG.active };\n' +
    'const _trainingSchedule = { slots: CFG.slots };\nlet saves = 0;\n' +
    'function availToday(){ return TODAY; }\nfunction saveState(){ saves++; }\nfunction render(){}\n' +
    'function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }\n' +
    'function coachTrainingSessionLabel(s){ return (s && (s.title || s.id)) || "Session"; }\n' +
    ['availWeekStart', 'availAddDays', 'availSlotDateInWeek', 'availTrainingEventId', 'availabilityEventsForWeek', 'availDatedWeekLabel',
     'trainingDateLabel', 'trainingDateFromSessionId', 'trainingOccurrenceTitle', 'trainingOccurrenceLongLabel',
     'trainingContentKey', 'trainingProtocolId', 'trainingBlocksFingerprint', 'trainingRetractBridgedCopies', 'trainingAdoptCoachPlans',
     'trainingViewedWeek', 'trainingIsCurrentWeek', 'trainingWeekKind', 'trainingShiftWeek', 'trainingGoToThisWeek', 'setTrainingSession',
     'trainingWeekOccurrences', 'trainingWeekBannerHTML', 'trainingPlannedAheadOccurrences', 'trainingPlannedAheadHTML', 'trainingPdfOccurrence'].map(fn).join('\n') +
    '\n' + NAV_DECL + '\n' +
    'function reload(){ state = JSON.parse(JSON.stringify(state)); (state.schedule||[]).forEach(s => { if (!state.trainingBlocks[s.id]) state.trainingBlocks[s.id] = []; }); _trainingWeekNavIn = ""; }\n' +
    // the planner's own session/key selection (renderTraining), verbatim
    'function view(){ const twWeek = trainingViewedWeek(); const twCurrent = trainingIsCurrentWeek(); const twKind = trainingWeekKind(twWeek);\n' +
    '  const schedSessions = twCurrent ? (state.schedule || []) : trainingWeekOccurrences(twWeek).map(e => ({ id: e.id, type: "Training", title: trainingOccurrenceTitle(e.date), date: e.date, startTime: e.time, location: e.venue, published: false, occurrence: true })).concat((state.schedule || []).filter(sess => sess && sess.date && /^\\d{4}-\\d{2}-\\d{2}/.test(String(sess.date)) && availWeekStart(String(sess.date).slice(0, 10)) === twWeek));\n' +
    '  const rawId = state.trainingActiveSession || (schedSessions[0]?.id ?? "tue"); const sessId = schedSessions.find(s => s.id === rawId) ? rawId : (schedSessions[0]?.id ?? "tue");\n' +
    '  const ck = trainingContentKey(sessId); return { twWeek, twCurrent, twKind, cards: schedSessions.map(s => s.id), sessId, ck, blocks: (state.trainingBlocks||{})[ck] || [], banner: trainingWeekBannerHTML(twWeek, twKind) }; }\n' +
    'return { get state(){ return state; }, view, reload, ck: trainingContentKey, retract: trainingRetractBridgedCopies, adopt: trainingAdoptCoachPlans,\n' +
    '  viewed: trainingViewedWeek, kind: trainingWeekKind, shift: trainingShiftWeek, thisWeek: trainingGoToThisWeek, open: setTrainingSession,\n' +
    '  banner: trainingWeekBannerHTML, ahead: trainingPlannedAheadOccurrences, pdfOcc: trainingPdfOccurrence, longLabel: trainingOccurrenceLongLabel,\n' +
    '  setToday: t => { TODAY = t; }, navIn: () => _trainingWeekNavIn, saves: () => saves };';
  return new Function(body)({ slots, today, weekStart, blocks, adopted, schedule, active });
}
const B = (n, tag) => Array.from({ length: n }, (_, i) => ({ id: `tb${tag}${i}`, time: `19:${45 + i}`, activity: `${tag} ${i}`, keyFocus: '', coach: '' }));
const fpOf = blocks => JSON.stringify(blocks.map(b => [b.time, b.activity, b.keyFocus || '', b.coach || '']));
const latin1 = bytes => Buffer.from(bytes).toString('latin1');

// ── 1. Dated content is stable through everything the planner does ─────────
test('1. slot_tue-20260915 content is unchanged through reload, rollover, retraction, adoption and every navigation', () => {
  const P = B(10, 'P');
  const w = world({ today: '2026-09-14', weekStart: '2026-09-14', blocks: { 'slot_tue-20260915': P } });
  assert.equal(w.view().ck, 'slot_tue-20260915');
  w.reload(); w.setToday('2026-09-15'); w.reload();
  w.retract(); w.adopt([{ id: 'tue', occurrenceKey: 'slot_tue-20260908', publishedAt: '2026-09-07T08:11:13Z', publishedRevision: 'x', status: 'stale', blocks: B(8, 'old') }]);
  w.shift(1); w.shift(-1); w.thisWeek(); w.shift(-1); w.thisWeek();
  assert.deepEqual(w.state.trainingBlocks['slot_tue-20260915'], P);
  assert.equal(w.state.trainingBlocks['slot_tue-20260922'], undefined, 'nothing ever written under 22 Sep');
  assert.equal(w.view().blocks.length, 10);
});

// ── 2/3. Adoption never crosses weeks ───────────────────────────────────────
test('2. a 15 Sep publication adopts into 15 Sep only — never into 22 Sep', () => {
  const w = world();
  assert.equal(w.adopt([{ id: 'tue', occurrenceKey: 'slot_tue-20260915', publishedAt: '2026-09-15T11:16:01Z', publishedRevision: 'r', status: 'published', blocks: B(10, 'pub') }]), true);
  assert.equal(w.state.trainingBlocks['slot_tue-20260915'].length, 10);
  assert.equal(w.state.trainingBlocks['slot_tue-20260922'], undefined);
});
test('3. a 22 Sep publication is NOT adopted into 15 Sep (nor anywhere else this week)', () => {
  const w = world();
  assert.equal(w.adopt([{ id: 'tue', occurrenceKey: 'slot_tue-20260922', publishedAt: '2026-09-15T12:00:00Z', publishedRevision: 'r', status: 'published', blocks: B(10, 'pub') }]), false);
  assert.deepEqual(Object.keys(w.state.trainingBlocks), []);
});

// ── 4–6. The bridge is gone: bare content never populates a dated key ───────
test('4. bare thu + empty slot_thu-20260917 stays EMPTY (U18 and Seniors)', () => {
  for (const slots of [U18, SENIORS]) {
    const w = world({ slots, schedule: [{ id: 'tue' }, { id: 'thu' }], blocks: { thu: B(9, 'lastweek') } });
    w.retract(); w.adopt([]); const v = w.view();
    const thuKey = w.ck('thu');
    assert.match(thuKey, /-20260917$/);
    assert.equal(w.state.trainingBlocks[thuKey], undefined, `${slots === U18 ? 'U18' : 'Seniors'}: not populated`);
  }
});
test('5. bare thu never populates SUCCESSIVE Thursday keys either', () => {
  const w = world({ slots: U18, schedule: [{ id: 'tue' }, { id: 'thu' }], blocks: { thu: B(9, 'lastweek') } });
  for (const t of ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06']) {
    w.setToday(t); w.reload(); w.retract(); w.adopt([]);
    assert.equal(w.state.trainingBlocks[w.ck('thu')], undefined, `week of ${t}`);
  }
  assert.equal(w.state.trainingBlocks.thu.length, 9, 'the bare key is untouched (History still lists it)');
});
test('6. bare tue never populates successive Tuesday keys', () => {
  const w = world({ slots: SENIORS, blocks: { tue: B(6, 'august') } });
  for (const t of ['2026-09-15', '2026-09-22', '2026-09-29']) {
    w.setToday(t); w.reload(); w.retract(); w.adopt([]);
    assert.equal(w.state.trainingBlocks[w.ck('tue')], undefined, `week of ${t}`);
  }
});
test('6b. SOURCE PIN — trainingBridgeBareContent no longer exists anywhere in the app', () => {
  assert.equal(html.includes('trainingBridgeBareContent'), false);
  assert.doesNotMatch(fn('renderTraining'), /trainingBridgeBareContent|re-keyed to this week/, 'no bridge call, no bridge save message');
});
test('6c. the leftover of the OLD bridge on an affected device is withdrawn once — and only the untouched copy', () => {
  const copy = B(9, 'lastweek');
  const w = world({ slots: U18, schedule: [{ id: 'tue' }, { id: 'thu' }],
    blocks: { thu: copy, 'slot_msvh0skf_1-20260917': structuredClone(copy) },
    adopted: { 'slot_msvh0skf_1-20260917': { rev: null, fp: fpOf(copy) } } });
  assert.equal(w.retract(), true);
  assert.deepEqual(w.state.trainingBlocks['slot_msvh0skf_1-20260917'], []);
  assert.equal(w.state.trainingBlocks.thu.length, 9, 'the source is kept');
  assert.equal(w.retract(), false, 'never twice');
  const edited = world({ slots: U18, schedule: [{ id: 'tue' }, { id: 'thu' }],
    blocks: { thu: copy, 'slot_msvh0skf_1-20260917': B(9, 'edited') },
    adopted: { 'slot_msvh0skf_1-20260917': { rev: null, fp: fpOf(copy) } } });
  assert.equal(edited.retract(), false, 'an edited copy is the coach\'s work');
});

// ── 7/8. Future-week content survives ───────────────────────────────────────
test('7. future-week content survives a reload (the view snaps to this week, the plan does not move)', () => {
  const w = world({ today: '2026-09-15', weekStart: '2026-09-21', blocks: { 'slot_tue-20260922': B(10, 'ahead') } });
  w.reload();
  const v = w.view();
  assert.equal(v.twWeek, '2026-09-14'); assert.equal(v.twKind, 'current');
  assert.equal(w.state.trainingBlocks['slot_tue-20260922'].length, 10);
  w.shift(1);
  const n = w.view();
  assert.equal(n.ck, 'slot_tue-20260922'); assert.equal(n.blocks.length, 10);
});
test('8. This week ⇄ Next week round trips never destroy the future plan or the current one', () => {
  const w = world({ blocks: { 'slot_tue-20260915': B(3, 'now'), 'slot_tue-20260922': B(10, 'ahead') } });
  for (let i = 0; i < 4; i++) { w.shift(1); assert.equal(w.view().blocks.length, 10); w.thisWeek(); assert.equal(w.view().blocks.length, 3); }
});

// ── 9. The displayed week is unmistakable ───────────────────────────────────
test('9. a FUTURE week shows a banner naming the week, saying it is not this week, and where blocks go', () => {
  const w = world({ today: '2026-09-14' }); w.shift(1);
  const v = w.view();
  assert.equal(v.twKind, 'future');
  assert.match(v.banner, /Planning a future week/);
  assert.match(v.banner, /21 Sep – 27 Sep 2026/);
  assert.match(v.banner, /This is not this week \(14 Sep – 20 Sep 2026\)/);
  assert.match(v.banner, /Blocks you add here belong to 21 Sep – 27 Sep 2026/);
  assert.match(v.banner, /Publishing opens when that week arrives/);
  assert.match(v.banner, /trainingGoToThisWeek\(\)/, 'one-tap way back');
  assert.match(v.banner, /is-future/);
});
test('9b. a PAST week says so; the CURRENT week shows no week banner, only the planned-ahead list when there is one', () => {
  const w = world({ today: '2026-09-15' }); w.shift(-1);
  const p = w.view();
  assert.equal(p.twKind, 'past'); assert.match(p.banner, /Viewing a past week — 7 Sep – 13 Sep 2026/);
  w.thisWeek();
  assert.equal(w.view().banner, '', 'no planned-ahead content: nothing to say');
  w.state.trainingBlocks['slot_tue-20260922'] = B(10, 'ahead');
  w.state.trainingBlocks['slot_tue-20260915'] = B(4, 'now');
  w.state.trainingBlocks['slot_thu-20260910'] = B(9, 'past');
  const c = w.view();
  assert.match(c.banner, /Planned ahead on this device/);
  assert.doesNotMatch(c.banner, /15 Sep 2026|10 Sep 2026/, 'this week and past weeks are not "planned ahead"');
  assert.match(c.banner, /Tuesday Training · 22 Sep 2026 \(10 blocks\)/);
  assert.match(c.banner, /setTrainingSession\('slot_tue-20260922'\)/);
  assert.doesNotMatch(c.banner, /Planning a future week/);
});
test('9c. SOURCE PIN — renderTraining paints the banner in both templates and the nav names future/past weeks', () => {
  const src = fn('renderTraining');
  assert.equal((src.match(/\$\{twBanner\}/g) || []).length, 2, 'banner in the empty-week AND the planner template');
  assert.match(src, /trainingWeekBannerHTML\(twWeek, twKind\)/);
  assert.match(src, /'Future week · '/); assert.match(src, /'Past week · '/);
  assert.doesNotMatch(src, /Planned week — publish opens/, 'the 11px note is replaced, not duplicated');
});
test('9d. a stored FUTURE week is honoured only while navigated to in this real week', () => {
  const w = world({ today: '2026-09-14', weekStart: '2026-09-21' });
  assert.equal(w.viewed(), '2026-09-14', 'fresh load → this week');
  w.shift(1); assert.equal(w.viewed(), '2026-09-21');
  w.setToday('2026-09-15'); assert.equal(w.viewed(), '2026-09-21', 'same real week: still chosen');
  w.reload(); assert.equal(w.viewed(), '2026-09-14', 'next load: this week again');
});

// ── 10/11. PDF occurrence date ──────────────────────────────────────────────
test('10. the PDF filename carries the OCCURRENCE date, not the generation date', () => {
  const w = world({ today: '2026-09-14' });
  const cur = w.pdfOcc('slot_tue-20260915');
  assert.equal(cur.dateISO, '2026-09-15');
  assert.equal(sessionPdfFilename({ clubName: 'Boitsfort', sessionTitle: cur.title, dateISO: cur.dateISO }), 'boitsfort-tuesday-2026-09-15.pdf');
  const ahead = w.pdfOcc('slot_tue-20260922');
  assert.equal(ahead.dateISO, '2026-09-22', 'downloaded on 14 Sep, still named for 22 Sep');
  assert.equal(sessionPdfFilename({ clubName: 'Boitsfort', sessionTitle: ahead.title, dateISO: ahead.dateISO }), 'boitsfort-tuesday-training-2026-09-22.pdf');
});
test('11. the PDF header names weekday, date, start time and week — from the occurrence, never from today', () => {
  const w = world({ today: '2026-09-14' });
  const cur = w.pdfOcc('slot_tue-20260915');
  assert.equal(cur.title, 'TUESDAY', 'the coach\'s own title for the current-week row');
  assert.equal(cur.label, 'Tuesday 15 September 2026 · 19:45 · Week of 14 Sep – 20 Sep 2026');
  assert.equal(cur.venue, 'Foresterie');
  const ahead = w.pdfOcc('slot_tue-20260922');
  assert.equal(ahead.title, 'Tuesday Training');
  assert.equal(ahead.label, 'Tuesday 22 September 2026 · 19:45 · Week of 21 Sep – 27 Sep 2026');
  assert.equal(w.longLabel('2026-09-17'), 'Thursday 17 September 2026');
  assert.equal(w.longLabel('19.45'), '', 'junk row dates never become a date');
  // an undated ad-hoc session invents nothing
  const adhoc = world({ schedule: [{ id: 'kicking-abc', title: 'Kicking clinic', date: '' }] }).pdfOcc('kicking-abc');
  assert.equal(adhoc.dateISO, ''); assert.equal(adhoc.label, ''); assert.equal(adhoc.title, 'Kicking clinic');
  // a coach-created DATED session uses its own date
  const dated = world({ schedule: [{ id: 'kicking-abc', title: 'Kicking clinic', date: '2026-09-19', startTime: '10:00' }] }).pdfOcc('kicking-abc');
  assert.equal(dated.dateISO, '2026-09-19'); assert.match(dated.label, /^Saturday 19 September 2026 · 10:00/);
  const s = latin1(buildSessionPdf({ sessionTitle: cur.title, sessionLabel: cur.label, blocks: [{ time: '19:45', activity: 'x' }] }));
  assert.ok(s.includes('Tuesday 15 September 2026'), 'the label reaches the page');
  assert.ok(s.includes('Week of 14 Sep ' + String.fromCharCode(0x96) + ' 20 Sep 2026'), 'the week range, en dash included, reaches the page intact');
});
test('11b. SOURCE PIN — trainingDownloadPdf takes title, label, venue and filename date from trainingPdfOccurrence', () => {
  const src = fn('trainingDownloadPdf');
  assert.match(src, /const occ = trainingPdfOccurrence\(sessionId\)/);
  assert.match(src, /sessionTitle: occ\.title/); assert.match(src, /sessionLabel: occ\.label/); assert.match(src, /venue:\s+occ\.venue/);
  assert.match(src, /dateISO: occ\.dateISO \|\| now\.toISOString\(\)\.slice\(0, 10\)/, 'today only when no occurrence date exists');
  assert.doesNotMatch(src, /sessionLabel: \[sess\.date/);
  assert.doesNotMatch(src, /\.sort\(/, 'the planner never sorts the blocks it hands to the PDF');
});

// ── 12–16. PDF layout fidelity ──────────────────────────────────────────────
const orderOnPage = blocks => {
  const s = latin1(buildSessionPdf({ blocks }));
  return blocks.map((b, i) => ({ i, at: s.indexOf('(' + b.activity + ')') })).sort((a, b) => a.at - b.at).map(x => x.i);
};
test('12. the PDF block order is exactly the planner array order', () => {
  const blocks = [
    { time: '20:05', activity: 'second-on-screen' }, { time: '19:45', activity: 'first-on-screen' },
    { time: '21:15', activity: 'third-on-screen' }, { time: '20:41', activity: 'fourth-on-screen' }];
  assert.deepEqual(orderOnPage(blocks), [0, 1, 2, 3]);
});
test('13. untimed blocks keep their position', () => {
  assert.deepEqual(orderOnPage([{ time: '', activity: 'a-untimed' }, { time: '19:45', activity: 'b-timed' }, { time: '', activity: 'c-untimed' }, { time: '19:00', activity: 'd-timed' }]), [0, 1, 2, 3]);
});
test('14. compact-time blocks (1820, 930) keep their position and print canonical labels', () => {
  const blocks = [{ time: '1820', activity: 'a-compact' }, { time: '18:00', activity: 'b-colon' }, { time: '930', activity: 'c-compact' }];
  assert.deepEqual(orderOnPage(blocks), [0, 1, 2]);
  const s = latin1(buildSessionPdf({ blocks }));
  assert.ok(s.includes('(18:20)') && s.includes('(09:30)'));
});
test('15. coach assignments stay on the row of their own block', () => {
  const blocks = [
    { time: '19:45', activity: 'Ball skill', keyFocus: 'Touches', coach: 'ALL' },
    { time: '20:05', activity: 'Contact blocks', keyFocus: 'Double tackle', coach: 'Doddsy' },
    { time: '20:17', activity: 'Split', keyFocus: 'Carry attitude', coach: 'Xavier' }];
  const s = latin1(buildSessionPdf({ blocks }));
  const at = t => s.indexOf('(' + t + ')');
  assert.ok(at('Ball skill') < at('ALL') && at('ALL') < at('Contact blocks'), 'ALL sits with Ball skill');
  assert.ok(at('Contact blocks') < at('Doddsy') && at('Doddsy') < at('Split'), 'Doddsy sits with Contact blocks');
  assert.ok(at('Split') < at('Xavier'), 'Xavier sits with Split');
  // ...and in the LEAD COACH column, not the KEY FOCUS one: the x offset of a
  // coach name equals the x offset of the LEAD COACH heading (cells and
  // headings share COLS[n].x + 5), and differs from KEY FOCUS's.
  const xOf = text => Number(/([\d.]+) [\d.]+ Td \(/.exec(s.slice(s.lastIndexOf('BT', s.indexOf('(' + text + ')'))))[1]);
  assert.equal(xOf('Doddsy'), xOf('LEAD COACH'), 'coach names sit in the Lead Coach column');
  assert.equal(xOf('Double tackle'), xOf('KEY FOCUS'), 'key focus sits in the Key Focus column');
  assert.notEqual(xOf('Doddsy'), xOf('KEY FOCUS'));
});
test('16. newline-separated coach and key-focus lines print as SEPARATE lines, in order', () => {
  const s = latin1(buildSessionPdf({ blocks: [{ time: '20:05', activity: '4 x contact blocks',
    keyFocus: 'double tackle\nSmash and grab\nChop tackle', coach: 'Doddsy\nTom\nXavier\nFlo' }] }));
  for (const line of ['(double tackle)', '(Smash and grab)', '(Chop tackle)', '(Doddsy)', '(Tom)', '(Xavier)', '(Flo)']) assert.ok(s.includes(line), line + ' is its own text run');
  assert.ok(!s.includes('Doddsy Tom'), 'names are not flattened into one run');
  assert.ok(s.indexOf('(Doddsy)') < s.indexOf('(Tom)') && s.indexOf('(Tom)') < s.indexOf('(Xavier)') && s.indexOf('(Xavier)') < s.indexOf('(Flo)'));
  assert.deepEqual(wrapMultiline('a\r\nb\n\nc', 9.5, 200), ['a', 'b', '', 'c'], 'CRLF handled; a blank line stays a blank line');
  // the row grows to the tallest column so nothing overlaps the next block
  const one = latin1(buildSessionPdf({ blocks: [{ activity: 'x', coach: 'A' }, { activity: 'next' }] }));
  const four = latin1(buildSessionPdf({ blocks: [{ activity: 'x', coach: 'A\nB\nC\nD' }, { activity: 'next' }] }));
  const yOf = (doc, text) => Number(/([\d.]+) Td \(next\)/.exec(doc)[1]);
  assert.ok(yOf(four, 'next') < yOf(one, 'next'), 'the following row moves down to make room for four coach lines');
});

// ── 17–20. Isolation, sync and existing rendering ───────────────────────────
test('17. Seniors and U18 resolve DISJOINT dated keys for the same week — nothing can land in the other group', () => {
  const sen = world({ slots: SENIORS }), u18 = world({ slots: U18, schedule: [{ id: 'tue' }, { id: 'thu' }] });
  assert.equal(sen.ck('tue'), 'slot_tue-20260915'); assert.equal(u18.ck('tue'), 'slot_msvgzozt_0-20260915');
  assert.equal(sen.ck('thu'), 'slot_thu-20260917'); assert.equal(u18.ck('thu'), 'slot_msvh0skf_1-20260917');
  assert.equal(u18.adopt([{ id: 'thu', occurrenceKey: 'slot_thu-20260917', publishedAt: '2026-09-15T00:00:00Z', publishedRevision: 'r', status: 'published', blocks: B(2, 'sen') }]), false, 'a Seniors-keyed publication cannot land in U18');
});
test('18. Training Sync intact: newer revision replaces an untouched adoption; unsynced work is never overwritten', () => {
  const w = world();
  w.adopt([{ id: 'tue', occurrenceKey: 'slot_tue-20260915', publishedRevision: 'rev1', status: 'published', blocks: B(3, 'rev1') }]);
  assert.equal(w.adopt([{ id: 'tue', occurrenceKey: 'slot_tue-20260915', publishedRevision: 'rev2', status: 'published', blocks: B(4, 'rev2') }]), true);
  assert.equal(w.state.trainingBlocks['slot_tue-20260915'].length, 4);
  w.state.trainingBlocks['slot_tue-20260915'] = B(5, 'mine');
  assert.equal(w.adopt([{ id: 'tue', occurrenceKey: 'slot_tue-20260915', publishedRevision: 'rev3', status: 'published', blocks: B(6, 'rev3') }]), false);
  assert.equal(w.state.trainingBlocks['slot_tue-20260915'][0].activity, 'mine 0');
});
test('19. published content is never deleted or rewritten by retraction (Seniors real shape: dated keys, rev recorded)', () => {
  const pub = B(10, 'pub');
  const w = world({ blocks: { 'slot_tue-20260915': structuredClone(pub), 'slot_thu-20260910': B(9, 'thu10'), tue: B(6, 'aug') },
    adopted: { 'slot_tue-20260915': { rev: '1e25cktg4xxft', fp: fpOf(pub) } } });
  assert.equal(w.retract(), false);
  assert.deepEqual(w.state.trainingBlocks['slot_tue-20260915'], pub);
  assert.equal(w.state.trainingBlocks['slot_thu-20260910'].length, 9);
  assert.equal(w.state.trainingBlocks.tue.length, 6);
});
test('20. the current week still renders its real schedule rows and the existing Tuesday plan', () => {
  const w = world({ blocks: { 'slot_tue-20260915': B(10, 'P') } });
  const v = w.view();
  assert.equal(v.twCurrent, true); assert.deepEqual(v.cards, ['tue', 'thu', 'game']);
  assert.equal(v.sessId, 'tue'); assert.equal(v.ck, 'slot_tue-20260915'); assert.equal(v.blocks.length, 10);
});
