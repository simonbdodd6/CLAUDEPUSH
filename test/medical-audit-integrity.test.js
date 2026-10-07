/**
 * MEDICAL-AUDIT-1 — the Medical area's data-integrity contract.
 *
 *   • A case is the club's SHARED case (api/_medicalStore.js). The client's
 *     state.medicalRecords is a projection of the ACTIVE cases only.
 *   • Clear case RESOLVES: the case leaves the caseload, its record and
 *     append-only timeline stay, and the UI keeps showing them as history.
 *   • Every metric — in rehab, returning this week, not training this week —
 *     is read from the case and the app's canonical Monday–Sunday week /
 *     current-week training occurrences. Roster flags and resolved cases
 *     never count.
 *   • Medical access is the only authorisation, before and after.
 *
 * Client side: the REAL functions extracted from index.html run in a sandbox
 * whose "server" is the REAL api/_medicalStore.js against an in-memory KV.
 * Server side: the REAL api/publish.js medical handler with real sessions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.medical-audit.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_medicalStore.js');
const identity = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { permissionsFor, PERM } = await import('../api/_permissions.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists in index.html`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) { if (src[i] === '(') paren++; else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } } }
  let depth = 0, end = 0;
  for (let b = src.indexOf('{', i); b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } } }
  return src.slice(start, end + 1);
}
/** `const NAME = {...};` / `[...]` / one-line value, verbatim from the source. */
function constSrc(name) {
  const m = new RegExp('^    const ' + name + '\\s*=\\s*', 'm').exec(src);
  assert.ok(m, `const ${name} exists`);
  const start = m.index;
  let i = start + m[0].length;
  const opener = src[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (!closer) { const e = src.indexOf('\n\n', i); return src.slice(start, e); }
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === opener) depth++;
    else if (src[i] === closer) { depth--; if (depth === 0) return src.slice(start, i + 1) + ';'; }
  }
  throw new Error('unterminated const ' + name);
}

const CLUB = 'club-audit', GRP = 'grp_initial';
const TODAY = '2026-09-21';          // a Monday → the app's week is 21–27 Sep 2026

// ── the client sandbox ──────────────────────────────────────────────────────
// Real functions; a fake DOM mount; sessionRows() answers come from ANSWERS.
function makeWorld({ players, today = TODAY, slots = [{ id: 'slot_tue', day: 'Tue', startTime: '19:00', active: true }, { id: 'slot_thu', day: 'Thu', startTime: '19:00', active: true }], schedule = true, canMedical = true } = {}) {
  const calls = { toast: [], render: 0, save: [] };
  const ANSWERS = {};   // { [occurrenceId]: { [playerId]: status } }
  const DOM = {};
  const body = `
    "use strict";
    const SERVER = arguments[0], CALLS = arguments[1], ANSWERS = arguments[2], DOM = arguments[3];
    const MOUNT = { innerHTML: '', id: 'coach-medical' };
    const document = {
      getElementById(id) { if (id === 'coach-medical') return MOUNT; return DOM[id] || null; },
      createElement() { return { id: '', className: '', innerHTML: '', addEventListener() {} }; },
      addEventListener() {}, removeEventListener() {},
      body: { appendChild(el) { DOM.__popup = el; } },
    };
    function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function icon(){ return ''; }
    function showToast(m){ CALLS.toast.push(m); }
    function render(){ CALLS.render++; }
    function saveState(){ CALLS.saveState = (CALLS.saveState || 0) + 1; }
    function canI(p){ return p === 'medical_access' ? ${JSON.stringify(canMedical)} : true; }
    function playerIsArchived(p){ return !!(p && p.lifecycleStatus === 'archived'); }
    function operationalPlayers(){ return state.players; }
    function ensureTrainingSchedule(){}
    function contextFixtures(){ return []; }
    function sessionRows(id){ return operationalPlayers().map(p => ({ player: p, status: (ANSWERS[id] || {})[p.id] || 'no-reply' })); }
    const state = { activeView: 'coach', operationalGroupId: '${GRP}', players: ${JSON.stringify(players)}, medicalRecords: {}, medicalNotes: {} };
    let _sharedMedical = { loaded: true, failed: false, cases: [], players: [] };
    let _trainingSchedule = ${schedule ? JSON.stringify({ slots }) : 'null'};
    let _medAddInjuryOpen = false, _medActiveTab = 'dashboard', _medActivePlayerId = null;
    let _medDetailsKeyHandler = null;
    let _availTodayOverride = ${JSON.stringify(today)};
    ${constSrc('AVAIL_DAY_INDEX')}
    ${constSrc('MEDICAL_SEVERITY_LABELS')}
    ${constSrc('MEDICAL_SEVERITY_COLORS')}
    ${constSrc('MEDICAL_CLEARANCE_LABELS')}
    ${constSrc('MEDICAL_CLEARANCE_COLORS')}
    ${constSrc('MEDICAL_TRAINING_LABELS')}
    ${constSrc('MEDICAL_TRAINING_COLORS')}
    ${constSrc('MEDICAL_TIMELINE_TYPES')}
    ${constSrc('MEDICAL_TIMELINE_LABELS')}
    ${constSrc('MEDICAL_TIMELINE_COLORS')}
    ${constSrc('MEDICAL_BODY_LOCATIONS')}
    ${constSrc('MEDICAL_REHAB_STATUSES')}
    ${constSrc('MED_FIELD_MAP')}
    ${constSrc('_MED_PILL')}
    ${fn('availToday')}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('availabilityEventsForWeek')}
    ${fn('trainingWeekOccurrences')}
    ${fn('overviewAnswerMap')}
    ${fn('activeRosterPlayers')}
    ${fn('normalizeMedicalRecord')}
    ${fn('medicalCaseToLegacy')}
    ${fn('hydrateMedicalFromShared')}
    ${fn('sharedMedicalHistory')}
    ${fn('medicalScreenMode')}
    ${fn('hasActiveMedicalCase')}
    ${fn('activeMedicalCases')}
    ${fn('medicalCaseTrainingStatus')}
    ${fn('medicalRtpTiming')}
    ${fn('medicalRtpSummary')}
    ${fn('medicalIsReturningThisWeek')}
    ${fn('medicalNotTrainingThisWeek')}
    ${fn('medicalDashboardSummary')}
    ${fn('clubMedicalSnapshot')}
    ${fn('getInjuredNoReturnDate')}
    ${fn('medicalSeverityColor')}
    ${fn('medicalTrainingStatusColor')}
    ${fn('medicalTrainingStatusLabel')}
    ${fn('medicalRowCarriesCase')}
    ${fn('medicalCanonicalPlayers')}
    ${fn('medicalPlayers')}
    ${fn('medicalRosterRow')}
    ${fn('medicalMountEl')}
    ${fn('medicalDaysOut')}
    ${fn('medicalDetailsModel')}
    ${fn('closeMedicalDetails')}
    ${fn('openMedicalDetails')}
    ${fn('medicalDateLabel')}
    ${fn('_medicalCaseCard')}
    ${fn('medicalPlayerCases')}
    ${fn('_medTabBar')}
    ${fn('setMedicalTab')}
    ${fn('openMedicalRecord')}
    ${fn('openMedicalTimeline')}
    ${fn('medicalRequireOpenCase')}
    ${fn('saveMedRecord')}
    ${fn('setPlayerTrainingStatus')}
    ${fn('addMedTimelineEntry')}
    ${fn('toggleAddInjury')}
    ${fn('saveNewInjury')}
    ${fn('clearSharedMedicalCase')}
    ${fn('_renderMedicalDashboard')}
    ${fn('_renderMedicalRecord')}
    ${fn('_renderMedicalTimeline')}
    ${fn('renderMedical')}
    async function saveSharedMedicalCase(body) { CALLS.save.push(body); const ok = await SERVER(body); return ok; }
    return {
      state, MOUNT, ANSWERS,
      setShared(cases) { _sharedMedical = { loaded: true, failed: false, cases, players: [] }; hydrateMedicalFromShared(); },
      shared() { return _sharedMedical; },
      setToday(t) { _availTodayOverride = t; },
      go(tab, pid) { _medActiveTab = tab; _medActivePlayerId = pid === undefined ? _medActivePlayerId : pid; renderMedical(); return MOUNT.innerHTML; },
      summary: (t) => medicalDashboardSummary(medicalPlayers(), state.medicalRecords, state.medicalNotes, t),
      snapshot: (t) => clubMedicalSnapshot(state.players, state.medicalRecords, t),
      noReturn: () => getInjuredNoReturnDate(),
      rtpTiming: medicalRtpTiming, rtpSummary: medicalRtpSummary, returning: medicalIsReturningThisWeek,
      notTraining: (t) => medicalNotTrainingThisWeek(medicalPlayers(), state.medicalRecords, t),
      hasActive: (p) => hasActiveMedicalCase(p, state.medicalRecords),
      clear: clearSharedMedicalCase, saveField: saveMedRecord, setStatus: setPlayerTrainingStatus,
      addEntry: addMedTimelineEntry, addInjury: saveNewInjury, openDetails: openMedicalDetails,
      detailsModel: medicalDetailsModel, weekStart: availWeekStart,
    };
  `;
  const world = new Function(body)(async (reqBody) => {
    if (reqBody.action === 'resolve_case') await store.resolveCase(CLUB, reqBody.caseId, { userId: 'u-coach' });
    else if (reqBody.action === 'upsert_case') await store.upsertCase(CLUB, { ...reqBody, playerGroupId: GRP }, { userId: 'u-coach' });
    else return false;
    world.setShared((await store.loadMedicalRecord(CLUB)).cases);
    return true;
  }, calls, ANSWERS, DOM);
  world.calls = calls; world.DOM = DOM;
  world.reload = async () => world.setShared((await store.loadMedicalRecord(CLUB)).cases);
  return world;
}

const tick = () => new Promise(r => setTimeout(r, 0));
// The editors fire-and-forget their save; let the real store round-trip land.
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };

const ROSTER = [
  { id: 'pA', userId: 'uA', name: 'Ann Out',      position: 'Prop' },
  { id: 'pB', userId: 'uB', name: 'Ben Rehab',    position: 'Hooker' },
  { id: 'pC', userId: 'uC', name: 'Cal Contact',  position: 'Lock' },
  { id: 'pD', userId: 'uD', name: 'Dee Unset',    position: 'Flanker' },
  { id: 'pE', userId: 'uE', name: 'Ed Legacy',    position: 'No 8', game: 'injured', trainingStatus: 'unavailable', medical: 'old note' },
  { id: 'pF', userId: 'uF', name: 'Flo History',  position: 'Wing' },
  { id: 'pG', userId: 'uG', name: 'Gus Healthy',  position: 'Centre' },
];

/** Seed the real store: four open cases, one resolved, one legacy-only. */
async function seedCases() {
  kv.clear();
  const at = (d) => d + 'T10:00:00.000Z';
  await store.withMedicalLock(CLUB, () => store.saveMedicalRecord(CLUB, { cases: [
    { id: 'mc_a', playerId: 'pA', playerGroupId: GRP, status: 'active', condition: 'Hamstring strain', bodyLocation: 'Hamstring', severity: 'moderate',
      dateInjured: '2026-09-10', trainingStatus: 'unavailable', returnTarget: '2026-09-26', notes: 'Grade 2', timeline: [{ at: at('2026-09-10'), by: 'u-physio', action: 'opened', note: 'Injury logged' }] },
    { id: 'mc_b', playerId: 'pB', playerGroupId: GRP, status: 'active', condition: 'Calf tear', severity: 'minor',
      dateInjured: '2026-09-01', trainingStatus: 'modified', returnTarget: '2026-09-28', timeline: [{ at: at('2026-09-01'), by: 'u-physio', action: 'opened', note: '' }] },
    { id: 'mc_c', playerId: 'pC', playerGroupId: GRP, status: 'active', condition: 'Concussion', severity: 'severe',
      dateInjured: '2026-09-14', trainingStatus: 'noContact', returnTarget: '2026-09-21', clearanceStatus: '', timeline: [{ at: at('2026-09-14'), by: 'u-physio', action: 'opened', note: '' }] },
    { id: 'mc_d', playerId: 'pD', playerGroupId: GRP, status: 'active', condition: 'Ankle sprain', severity: 'minor',
      dateInjured: '2026-09-19', trainingStatus: '', returnTarget: '', timeline: [{ at: at('2026-09-19'), by: 'u-physio', action: 'opened', note: '' }] },
    { id: 'mc_f', playerId: 'pF', playerGroupId: GRP, status: 'resolved', condition: 'Shoulder dislocation', bodyLocation: 'Shoulder', severity: 'severe',
      dateInjured: '2026-05-01', trainingStatus: 'unavailable', returnTarget: '2026-09-22', clearanceStatus: 'cleared', resolvedAt: at('2026-08-30'), resolvedBy: 'u-physio',
      timeline: [{ at: at('2026-05-01'), by: 'u-physio', action: 'opened', note: 'Injury logged' }, { at: at('2026-07-01'), by: 'u-physio', action: 'updated', note: 'Physio — surgery done' }, { at: at('2026-08-30'), by: 'u-physio', action: 'resolved', note: '' }] },
  ] }));
}

async function world(opts = {}) {
  await seedCases();
  const w = makeWorld({ players: ROSTER, ...opts });
  await w.reload();
  return w;
}

// ── 1–4: the page and its RTP information ───────────────────────────────────
test('1. the Medical page renders from the shared caseload', async () => {
  const w = await world();
  const html = w.go('dashboard');
  assert.match(html, /Medical Dashboard/);
  assert.match(html, /Active cases \(4\)/, 'four open cases');
  assert.match(html, /Case history \(1\)/, 'one cleared case on record');
  assert.equal((html.match(/Medical alerts \(/g) || []).length, 0, 'no duplicate alerts list');
});

test('2. an active injury renders with its details and controls', async () => {
  const w = await world();
  const html = w.go('dashboard');
  const row = html.slice(html.indexOf('data-player="pA"'), html.indexOf('data-player="pB"'));
  assert.match(row, /Ann Out/);
  assert.match(row, /Hamstring strain · Hamstring · out 11 days/);
  assert.match(row, /Unavailable/);
  assert.match(row, /Moderate/);
  for (const ctl of ["openMedicalRecord('pA')", "openMedicalTimeline('pA')", "clearSharedMedicalCase('pA')"]) assert.ok(row.includes(ctl), ctl);
});

test('3. the RTP date renders on the row, the record and the popup', async () => {
  const w = await world();
  const html = w.go('dashboard');
  const row = html.slice(html.indexOf('data-player="pA"'), html.indexOf('data-player="pB"'));
  assert.match(row, /Return Sat 26 Sep · this week/);
  const rowB = html.slice(html.indexOf('data-player="pB"'), html.indexOf('data-player="pC"'));
  assert.match(rowB, /Return Mon 28 Sep · upcoming/);
  const rowD = html.slice(html.indexOf('data-player="pD"'), html.indexOf('id="med-case-history"'));
  assert.match(rowD, /No return date/);
  assert.match(w.go('record', 'pA'), /Return to play: Return Sat 26 Sep · this week · Not cleared/);
  const m = w.detailsModel(ROSTER[0], w.state.medicalRecords.pA, {}, TODAY);
  assert.equal(m.expectedReturn, '2026-09-26');
});

test('4. the RTP status renders — Not cleared vs Cleared to play — from clearanceStatus', async () => {
  const w = await world();
  let html = w.go('dashboard');
  assert.match(html.slice(html.indexOf('data-player="pA"'), html.indexOf('data-player="pB"')), /Not cleared/);
  w.saveField('pA', 'clearanceStatus', 'cleared'); await settle();   // real upsert
  html = w.go('dashboard');
  const row = html.slice(html.indexOf('data-player="pA"'), html.indexOf('data-player="pB"'));
  assert.match(row, /Cleared to play/);
  assert.match(html, /1 cleared to play — clear the case to close it/);
  assert.equal(w.summary().all.length, 4, 'cleared to play is still an OPEN case');
  assert.equal(w.detailsModel(ROSTER[0], w.state.medicalRecords.pA, {}, TODAY).rtpStatus, 'Cleared to play');
  assert.equal(w.detailsModel(ROSTER[0], w.state.medicalRecords.pB, {}, TODAY).rtpStatus, 'Not cleared');
  assert.equal(w.detailsModel(ROSTER[6], undefined, {}, TODAY).rtpStatus, '—', 'no record → no claim');
});

// ── 5–8: Clear case ─────────────────────────────────────────────────────────
test('5. Clear case RESOLVES the active case: it leaves the caseload and the roster flag is released', async () => {
  const w = await world();
  w.state.players[0].trainingStatus = 'unavailable';      // the device mirror the setter wrote
  assert.equal(w.hasActive({ id: 'pA' }), true);
  w.clear('pA'); await tick(); await tick();
  assert.deepEqual(w.calls.save[0], { action: 'resolve_case', caseId: 'mc_a' });
  const rec = await store.loadMedicalRecord(CLUB);
  const a = rec.cases.find(c => c.id === 'mc_a');
  assert.equal(a.status, 'resolved');
  assert.equal(a.clearanceStatus, 'cleared');
  assert.ok(a.resolvedAt && a.resolvedBy === 'u-coach');
  assert.equal(w.hasActive({ id: 'pA' }), false, 'no longer active on the client');
  assert.equal(w.summary().all.map(p => p.id).includes('pA'), false);
  assert.equal(w.state.players[0].trainingStatus, '', 'the roster mirror no longer says unavailable');
  assert.equal(w.calls.toast.at(-1), 'Case cleared — history kept');
});

test('6. Clear case preserves history: the record, its timeline and its details stay viewable', async () => {
  const w = await world();
  const before = (await store.loadMedicalRecord(CLUB)).cases.length;
  w.clear('pA'); await tick(); await tick();
  const rec = await store.loadMedicalRecord(CLUB);
  assert.equal(rec.cases.length, before, 'nothing deleted');
  const a = rec.cases.find(c => c.id === 'mc_a');
  assert.equal(a.condition, 'Hamstring strain');
  assert.equal(a.notes, 'Grade 2');
  assert.equal(a.returnTarget, '2026-09-26');
  assert.deepEqual(a.timeline.map(e => e.action), ['opened', 'resolved'], 'audit trail appended, never rewritten');
  // Dashboard history
  const dash = w.go('dashboard');
  assert.match(dash, /Case history \(2\)/);
  const hist = dash.slice(dash.indexOf('id="med-case-history"'));
  assert.match(hist, /Ann Out/); assert.match(hist, /Hamstring strain/); assert.match(hist, /injured Thu 10 Sep 2026/);
  assert.ok(hist.includes("openMedicalTimeline('pA')"), 'View history control');
  // Timeline view: full details + entries, read-only
  const tl = w.go('timeline', 'pA');
  assert.match(tl, /1 case · 2 events on record/);
  assert.match(tl, /No open case — this history is read-only/);
  for (const s of ['Hamstring strain', 'Hamstring', 'Moderate', 'Sat 26 Sep 2026', 'Grade 2', 'Case opened', 'Cleared', 'Injury logged']) assert.ok(tl.includes(s), s);
  assert.equal(tl.includes('id="mtl-notes"'), false, 'no add-entry form without an open case');
  // Record tab: read-only history, no editors
  const recTab = w.go('record', 'pA');
  assert.match(recTab, /No open case · 1 cleared case on record/);
  assert.equal(/onchange="saveMedRecord|setPlayerTrainingStatus\(/.test(recTab), false, 'no editor can reopen the case');
  assert.match(recTab, /Hamstring strain/);
});

test('7. clearing an already-cleared player is safe: no write, no new case, history intact', async () => {
  const w = await world();
  w.clear('pA'); await tick(); await tick();
  const after1 = JSON.stringify((await store.loadMedicalRecord(CLUB)).cases);
  const saves = w.calls.save.length;
  w.clear('pA'); await tick(); await tick();
  assert.equal(w.calls.save.length, saves, 'no second server write');
  assert.equal(w.calls.toast.at(-1), 'No active case for this player');
  assert.equal(JSON.stringify((await store.loadMedicalRecord(CLUB)).cases), after1, 'store byte-identical');
  // The server itself is idempotent too.
  const again = await store.resolveCase(CLUB, 'mc_a', { userId: 'u-other' });
  assert.equal(again.resolvedBy, 'u-coach', 'a second resolve returns the original, unchanged');
  assert.equal((await store.loadMedicalRecord(CLUB)).cases.length, 5);
});

test('8. historical injuries remain visible for a player with no open case', async () => {
  const w = await world();
  const dash = w.go('dashboard');
  const hist = dash.slice(dash.indexOf('id="med-case-history"'));
  assert.match(hist, /Flo History/); assert.match(hist, /Shoulder dislocation/); assert.match(hist, /cleared Sun 30 Aug 2026/);
  const tl = w.go('timeline', 'pF');
  assert.match(tl, /Shoulder dislocation/); assert.match(tl, /Physio — surgery done/); assert.match(tl, /Cleared Sun 30 Aug 2026/);
  assert.match(tl, /Outcome/);
  assert.equal(w.hasActive({ id: 'pF' }), false);
});

// ── 9–16: metrics ───────────────────────────────────────────────────────────
test('9. "in rehab" = open cases whose training status is modified / gymOnly / noContact', async () => {
  const w = await world();
  assert.deepEqual(w.summary().rehab.map(p => p.id).sort(), ['pB', 'pC']);
  assert.equal(w.snapshot().rehab, 2);
  w.setStatus('pB', 'gymOnly'); await settle(); assert.deepEqual(w.summary().rehab.map(p => p.id).sort(), ['pB', 'pC']);
  w.setStatus('pB', 'full'); await settle();    assert.deepEqual(w.summary().rehab.map(p => p.id), ['pC']);
  w.setStatus('pB', 'unavailable'); await settle(); assert.deepEqual(w.summary().rehab.map(p => p.id), ['pC']);
  assert.deepEqual(w.summary().injured.map(p => p.id).sort(), ['pA', 'pB', 'pD'], 'unavailable + not-set are "out"');
});

test('10. "returning this week" = open case + RTP date inside the current Mon–Sun week + not cleared', async () => {
  const w = await world();
  // pA Sat 26 (this week), pB Mon 28 (next week), pC Mon 21 (today), pD none, pF resolved Tue 22
  assert.deepEqual(w.summary().returning.map(p => p.id).sort(), ['pA', 'pC']);
  assert.equal(w.snapshot().returningThisWeek, 2);
  w.saveField('pC', 'clearanceStatus', 'cleared'); await settle();
  assert.deepEqual(w.summary().returning.map(p => p.id), ['pA'], 'cleared to play is back, not returning');
  const html = w.go('dashboard');
  assert.match(html, /<span class="lbl">Returning<\/span><strong[^>]*>1<\/strong><small>this week<\/small>/);
});

test('11. "injured, not training this week" reads this week\'s occurrences and the players\' actual answers', async () => {
  const w = await world();
  // Week 21–27 Sep: Tue 22 and Thu 24 occurrences.
  w.ANSWERS['slot_tue-20260922'] = { pB: 'unavailable', pC: 'available', pD: 'unavailable' };
  w.ANSWERS['slot_thu-20260924'] = { pB: 'unavailable', pC: 'unavailable' };
  const nt = w.notTraining();
  assert.equal(nt.supported, true);
  assert.equal(nt.sessions, 2);
  // pA: case says unavailable (medical override) → counted, no answer needed
  // pB: answered unavailable to both → counted
  // pC: available on Tue → training this week → not counted
  // pD: unavailable Tue, no reply Thu → unknown → not counted (never assumed)
  assert.deepEqual(nt.players.map(p => p.id).sort(), ['pA', 'pB']);
  const html = w.go('dashboard');
  assert.match(html, /<span class="lbl">Not training<\/span><strong[^>]*>2<\/strong><small>of 2 sessions<\/small>/);
});

test('12. historical injuries and legacy roster flags never inflate a current metric', async () => {
  const w = await world();
  // pE carries game:'injured', trainingStatus:'unavailable', medical text — and no case.
  // pF has a resolved case with an RTP date inside this week and trainingStatus unavailable.
  w.ANSWERS['slot_tue-20260922'] = { pE: 'unavailable', pF: 'unavailable' };
  w.ANSWERS['slot_thu-20260924'] = { pE: 'unavailable', pF: 'unavailable' };
  const s = w.summary();
  for (const key of ['all', 'injured', 'rehab', 'returning', 'notTraining', 'cleared']) {
    assert.equal(s[key].some(p => p.id === 'pE' || p.id === 'pF'), false, key + ' excludes pE/pF');
  }
  // pA + pD are out, pB + pC in rehab, pE/pF/pG have no open case → available
  assert.equal(w.snapshot().injured, 2); assert.equal(w.snapshot().rehab, 2); assert.equal(w.snapshot().available, 3);
  assert.equal(w.noReturn().some(p => p.id === 'pE'), false, 'Overview "no return date" ignores the legacy flag');
  assert.deepEqual(w.noReturn().map(p => p.id), ['pD'], 'and names the open case without a date');
  const html = w.go('dashboard');
  assert.equal(html.includes('data-player="pE"'), false);
  assert.equal(html.includes('data-player="pF"'), false);
});

test('13. an injured player WITH a training session this week they are available for is training', async () => {
  const w = await world();
  w.ANSWERS['slot_tue-20260922'] = { pB: 'available' };
  w.ANSWERS['slot_thu-20260924'] = { pB: 'unavailable' };
  const nt = w.notTraining();
  assert.equal(nt.players.some(p => p.id === 'pB'), false, 'available to one session = training this week');
  assert.ok(w.summary().all.some(p => p.id === 'pB'), 'still an open case');
  w.ANSWERS['slot_tue-20260922'] = { pB: 'maybe' };
  assert.equal(w.notTraining().players.some(p => p.id === 'pB'), false, 'maybe is not a no');
});

test('14. no current-week training: nobody is "not training", and the tile says so', async () => {
  const w = await world({ slots: [] });
  const nt = w.notTraining();
  assert.deepEqual(nt, { supported: true, sessions: 0, players: [] });
  assert.match(w.go('dashboard'), /<strong[^>]*>0<\/strong><small>no training this week<\/small>/);
  const w2 = await world({ schedule: false });
  assert.equal(w2.notTraining().supported, false, 'slot table not loaded → not a confident zero');
  assert.match(w2.go('dashboard'), /<strong[^>]*>—<\/strong><small>schedule not loaded<\/small>/);
});

test('15. week boundaries: Monday and Sunday belong to the same week, Sunday→Monday rolls over', async () => {
  const w = await world();
  assert.equal(w.weekStart('2026-09-21'), '2026-09-21'); assert.equal(w.weekStart('2026-09-27'), '2026-09-21');
  assert.equal(w.weekStart('2026-09-28'), '2026-09-28'); assert.equal(w.weekStart('2026-09-20'), '2026-09-14');
  // Sunday 27 Sep: pA (Sat 26) still this week; pC (Mon 21) still this week; pB (Mon 28) not yet.
  assert.deepEqual(w.summary('2026-09-27').returning.map(p => p.id).sort(), ['pA', 'pC']);
  // Monday 28 Sep: only pB.
  assert.deepEqual(w.summary('2026-09-28').returning.map(p => p.id), ['pB']);
  assert.equal(w.snapshot('2026-09-28').returningThisWeek, 1);
  // Sunday 20 Sep (the week before): nobody.
  assert.deepEqual(w.summary('2026-09-20').returning, []);
  assert.equal(w.rtpTiming('2026-09-21', '2026-09-27'), 'this-week');
  assert.equal(w.rtpTiming('2026-09-27', '2026-09-21'), 'this-week');
  assert.equal(w.rtpTiming('2026-09-28', '2026-09-27'), 'upcoming');
  assert.equal(w.rtpTiming('2026-09-20', '2026-09-21'), 'past');
  assert.equal(w.rtpTiming('', TODAY), 'none'); assert.equal(w.rtpTiming('26/09/2026', TODAY), 'none');
  assert.equal(w.rtpSummary({ expectedReturn: '2026-09-19' }, TODAY).when, 'Return Sat 19 Sep · overdue');
  // The not-training week moves with today: on Mon 28 the occurrences are 29 Sep / 1 Oct.
  w.ANSWERS['slot_tue-20260929'] = { pB: 'unavailable' }; w.ANSWERS['slot_thu-20261001'] = { pB: 'unavailable' };
  w.ANSWERS['slot_tue-20260922'] = { pB: 'available' };  w.ANSWERS['slot_thu-20260924'] = { pB: 'available' };
  assert.deepEqual(w.notTraining('2026-09-28').players.map(p => p.id).sort(), ['pA', 'pB']);
  assert.deepEqual(w.notTraining('2026-09-21').players.map(p => p.id), ['pA']);
});

test('16. resolved cases are not projected and never count as active', async () => {
  const w = await world();
  assert.equal(Object.keys(w.state.medicalRecords).sort().join(), 'pA,pB,pC,pD');
  assert.equal('pF' in w.state.medicalRecords, false);
  assert.equal(w.shared().cases.length, 5, 'but the history is held client-side');
  w.clear('pB'); await tick(); await tick();
  assert.equal(Object.keys(w.state.medicalRecords).sort().join(), 'pA,pC,pD');
  assert.equal(w.summary().rehab.some(p => p.id === 'pB'), false);
  assert.equal(w.shared().cases.length, 5);
});

// ── 17: permissions ─────────────────────────────────────────────────────────
const MEMBERS = [
  { id: 'm-plain', teamId: CLUB, userId: 'u-plain', role: 'player', status: 'active', playerGroupId: GRP },
  { id: 'm-medic', teamId: CLUB, userId: 'u-medic', role: 'player', status: 'active', playerGroupId: GRP, medicalAccess: true },
  // Build 99 — a medic's reach is never derived: the authorised physio holds an
  // explicit grant on the club's group (an unscoped medic reads nothing — pinned
  // in medical-scope-permissions.test.js).
  { id: 'm-physio', teamId: CLUB, userId: 'u-physio', role: 'medical', status: 'active',
    accessScope: { clubWide: false, groups: [{ groupId: GRP, status: 'active' }], teams: [] } },
  { id: 'm-coach', teamId: CLUB, userId: 'u-coach', role: 'coach', status: 'active', staffLevel: 'head', accessProfile: 'full' },
  { id: 'm-asst', teamId: CLUB, userId: 'u-asst', role: 'coach', status: 'active', accessProfile: 'coach' },
  { id: 'm-snc', teamId: CLUB, userId: 'u-snc', role: 'snc', status: 'active' },
  { id: 'm-pA', teamId: CLUB, userId: 'uA', role: 'player', status: 'active', playerGroupId: GRP },
];
async function seedServer() {
  await seedCases();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Audit Club' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: [{ id: GRP, name: 'Seniors', type: 'general', status: 'active' }], teams: [] }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: ROSTER.map(p => ({ id: p.id, userId: p.userId, name: p.name, position: p.position })) }));
}
const cookies = new Map();
async function login(userId) {
  const member = MEMBERS.find(m => m.userId === userId);
  const session = await identity.createSession({ userId, teamId: CLUB, role: member.role });
  cookies.set(userId, `${identity.SESSION_COOKIE}=${encodeURIComponent(session.token)}`);
}
const sess = userId => ({ headers: { cookie: cookies.get(userId) || '' } });
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; }, end() { return this; }, setHeader() {}, get result() { return out; } };
}
const GET = (u, q = {}) => ({ method: 'GET', query: { resource: 'medical', ...q }, ...sess(u) });
const POST = (u, body) => ({ method: 'POST', query: { resource: 'medical' }, body, ...sess(u) });

test('17. permissions are intact: Medical access only, before and after, on read and on Clear case', async () => {
  await seedServer();
  for (const u of ['u-plain', 'u-medic', 'u-physio', 'u-coach', 'u-snc', 'u-asst']) await login(u);
  for (const m of MEMBERS.filter(m => ['u-plain', 'u-snc', 'u-asst'].includes(m.userId))) assert.equal(permissionsFor(m).has(PERM.MEDICAL_ACCESS), false, m.userId + ' holds no medical access');
  for (const m of MEMBERS.filter(m => ['u-medic', 'u-physio', 'u-coach'].includes(m.userId))) assert.equal(permissionsFor(m).has(PERM.MEDICAL_ACCESS), true, m.userId + ' holds medical access');
  for (const denied of ['u-plain', 'u-snc', 'u-asst']) {
    let r = res(); await publishHandler(GET(denied), r); assert.equal(r.result.code, 403, denied + ' cannot read');
    r = res(); await publishHandler(POST(denied, { action: 'resolve_case', caseId: 'mc_a' }), r); assert.equal(r.result.code, 403, denied + ' cannot clear');
    r = res(); await publishHandler(POST(denied, { action: 'upsert_case', playerId: 'pA', condition: 'x' }), r); assert.equal(r.result.code, 403, denied + ' cannot write');
  }
  let r = res(); await publishHandler({ method: 'GET', query: { resource: 'medical' }, headers: {} }, r); assert.equal(r.result.code, 401, 'no session');
  assert.equal((await store.loadMedicalRecord(CLUB)).cases.find(c => c.id === 'mc_a').status, 'active', 'nothing changed by the refused calls');
  for (const allowed of ['u-medic', 'u-physio', 'u-coach']) {
    const g = res(); await publishHandler(GET(allowed), g);
    assert.equal(g.result.code, 200, allowed + ' reads');
    assert.equal(g.result.body.cases.length, 5, 'full history served'); assert.equal(g.result.body.active.length, 4);
  }
  r = res(); await publishHandler(POST('u-physio', { action: 'resolve_case', caseId: 'mc_a' }), r);
  assert.equal(r.result.code, 200); assert.equal(r.result.body.case.status, 'resolved');
  const g = res(); await publishHandler(GET('u-coach'), g);
  assert.equal(g.result.body.cases.length, 5, 'resolving deleted nothing');
  assert.equal(g.result.body.active.length, 3);
  assert.equal(g.result.body.cases.find(c => c.id === 'mc_a').timeline.at(-1).action, 'resolved');
  // Client gate: no medical permission → no popup, no server read.
  const w = makeWorld({ players: ROSTER, canMedical: false });
  w.openDetails('pA'); assert.equal(w.DOM.__popup, undefined);
  assert.match(fn('loadMedicalFromServer'), /if \(!canI\('medical_access'\)\) return;/);
  const api = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  const handler = api.slice(api.indexOf('async function medicalHandler('), api.indexOf('async function medicalHandler(') + 400);
  assert.match(handler, /requireTenantPermission\(req, PERM\.MEDICAL_ACCESS\)/, 'the handler gates on MEDICAL_ACCESS and nothing weaker');
});

// ── 18: the existing actions still work ─────────────────────────────────────
test('18. add injury, edit record, set training status, add timeline entry — all still write the shared case', async () => {
  const w = await world();
  // Add Injury opens a case for a healthy player via the real store.
  w.DOM.injPlayer = { value: 'pG' }; w.DOM.injType = { value: 'Knee knock' }; w.DOM.injArea = { value: 'Knee' };
  w.DOM.injSeverity = { value: 'minor' }; w.DOM.injReturn = { value: '2026-09-25' }; w.DOM.injNotes = { value: 'Iced' };
  w.addInjury(); await tick(); await tick();
  assert.equal(w.hasActive({ id: 'pG' }), true);
  assert.equal(w.state.medicalRecords.pG.currentInjury, 'Knee knock — Knee');
  assert.ok(w.summary().returning.some(p => p.id === 'pG'), 'its RTP date lands in this week');
  // Record edits
  w.saveField('pG', 'physiNotes', 'Ice and elevate'); await settle();
  assert.equal(w.state.medicalRecords.pG.physiNotes, 'Ice and elevate');
  w.saveField('pG', 'expectedReturn', '2026-10-02'); await settle();
  assert.equal(w.summary().returning.some(p => p.id === 'pG'), false);
  w.saveField('pG', 'surgeryHistory', 'x'); await settle();
  assert.equal(w.calls.save.filter(b => 'surgeryHistory' in b).length, 0, 'unmapped fields never leave the client');
  assert.equal(/surgeryHistory|allergies|medication|concussionNotes/.test(w.go('record', 'pG')), false, 'and are no longer offered as inputs');
  // Training status
  w.setStatus('pG', 'modified'); await settle();
  assert.equal((await store.loadMedicalRecord(CLUB)).cases.find(c => c.playerId === 'pG').trainingStatus, 'modified');
  assert.ok(w.summary().rehab.some(p => p.id === 'pG'));
  assert.match(w.go('record', 'pG'), /Modified Training/);
  // Timeline entry
  w.addEntry('pG', 'physio', 'First session', '2026-09-22'); await tick(); await tick();
  const c = (await store.loadMedicalRecord(CLUB)).cases.find(c => c.playerId === 'pG');
  assert.match(c.timeline.at(-1).note, /Physio \(2026-09-22\) — First session/);
  assert.match(w.go('timeline', 'pG'), /First session/);
  // Editors refuse to reopen a cleared player.
  w.clear('pG'); await tick(); await tick();
  const n = w.calls.save.length;
  w.saveField('pG', 'severity', 'severe'); w.setStatus('pG', 'full'); w.addEntry('pG', 'note', 'late', ''); await settle();
  assert.equal(w.calls.save.length, n, 'no write for a player with no open case');
  assert.equal((await store.loadMedicalRecord(CLUB)).cases.filter(c => c.playerId === 'pG').length, 1, 'no new case opened');
  assert.match(w.calls.toast.at(-1), /No open case/);
});
