/**
 * MEDICAL INJURY DETAILS POPUP — read-only presentation.
 *
 * A coach/medical-staff member clicks an athlete who has an active case and
 * sees the injury details without leaving the Medical screen. The popup is
 * strictly read-only and consumes the SAME canonical case the dashboard already
 * loaded (state.medicalRecords / state.medicalNotes). It resolves the player
 * only through medicalPlayers() — the already-authorized, group-scoped
 * caseload — so it can never surface a case outside the caller's scope and adds
 * no new privacy boundary. "Time out" comes from the canonical dateInjured;
 * a missing/malformed/future date yields "—", never a guess.
 *
 * These drive the REAL functions extracted from index.html.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) { if (src[i] === '(') paren++; else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } } }
  let depth = 0, end = 0;
  for (let b = src.indexOf('{', i); b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } } }
  return src.slice(start, end + 1);
}

const TODAY = '2026-09-08';

// A fresh sandbox holding the REAL extracted functions, with the DOM, state,
// permission and scoped-roster all supplied per test. medicalPlayers() returns
// exactly what a given medic is authorized to see.
function make({ state = { medicalRecords: {}, medicalNotes: {} }, canMedical = true, players = [] } = {}) {
  const body = `
    "use strict";
    const MEDICAL_SEVERITY_LABELS = { minor:'Minor', moderate:'Moderate', severe:'Severe', '':'Unknown' };
    function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    const _appended = []; const _listeners = [];
    const document = {
      getElementById(){ return null; },
      createElement(){ return { id:'', className:'', innerHTML:'', addEventListener(){} }; },
      addEventListener(t,h){ _listeners.push([t,h]); },
      removeEventListener(){},
      body: { appendChild(el){ _appended.push(el); } },
    };
    const state = ${JSON.stringify(state)};
    const _canMedical = ${JSON.stringify(canMedical)};
    function canI(p){ return p === 'medical_access' ? _canMedical : false; }
    const _players = ${JSON.stringify(players)};
    function medicalPlayers(){ return _players; }
    let _medDetailsKeyHandler = null;
    ${fn('normalizeMedicalRecord')}
    ${fn('medicalDaysOut')}
    ${fn('medicalDetailsModel')}
    ${fn('closeMedicalDetails')}
    ${fn('openMedicalDetails')}
    return { medicalDaysOut, medicalDetailsModel, openMedicalDetails, closeMedicalDetails,
             normalizeMedicalRecord, state,
             appended: () => _appended, overlayHTML: () => (_appended[0] ? _appended[0].innerHTML : null) };
  `;
  return new Function(body)();
}

const REC = {
  currentInjury: 'Hamstring strain', bodyLocation: 'Hamstring', severity: 'moderate',
  dateInjured: '2026-09-01', expectedReturn: '2026-09-20',
};

// ── the display model ────────────────────────────────────────────────────────

test('1. active case produces the correct injury details', () => {
  const { medicalDetailsModel } = make();
  const m = medicalDetailsModel({ name: 'Alex Athlete', id: 'p1' }, REC, {}, TODAY);
  assert.equal(m.injury, 'Hamstring strain');
  assert.equal(m.bodyArea, 'Hamstring');
  assert.equal(m.severity, 'Moderate');
  assert.equal(m.expectedReturn, '2026-09-20');
});

test('2. the correct player name is shown', () => {
  const { medicalDetailsModel } = make();
  assert.equal(medicalDetailsModel({ name: 'Alex Athlete' }, REC, {}, TODAY).name, 'Alex Athlete');
});

test('3. body area is shown (and falls back to "—" when absent)', () => {
  const { medicalDetailsModel } = make();
  assert.equal(medicalDetailsModel({ name: 'A' }, { ...REC, bodyLocation: '' }, {}, TODAY).bodyArea, '—');
  assert.equal(medicalDetailsModel({ name: 'A' }, REC, {}, TODAY).bodyArea, 'Hamstring');
});

test('4. severity shows a label for a known level and "—" otherwise', () => {
  const { medicalDetailsModel } = make();
  assert.equal(medicalDetailsModel({ name: 'A' }, { ...REC, severity: 'severe' }, {}, TODAY).severity, 'Severe');
  assert.equal(medicalDetailsModel({ name: 'A' }, { ...REC, severity: '' }, {}, TODAY).severity, '—');
  assert.equal(medicalDetailsModel({ name: 'A' }, { ...REC, severity: 'critical' }, {}, TODAY).severity, '—');
});

test('5. expected return is shown', () => {
  const { medicalDetailsModel } = make();
  assert.equal(medicalDetailsModel({ name: 'A' }, REC, {}, TODAY).expectedReturn, '2026-09-20');
});

test('injury falls back to the condition note, then roster p.medical, then "—"', () => {
  const { medicalDetailsModel } = make();
  assert.equal(medicalDetailsModel({ name: 'A' }, {}, { condition: 'Concussion protocol' }, TODAY).injury, 'Concussion protocol');
  assert.equal(medicalDetailsModel({ name: 'A', medical: 'Sore knee' }, {}, {}, TODAY).injury, 'Sore knee');
  assert.equal(medicalDetailsModel({ name: 'A' }, {}, {}, TODAY).injury, '—');
});

// ── "time out" from the canonical dateInjured ────────────────────────────────

test('6. a valid start date produces the correct duration', () => {
  const { medicalDaysOut } = make();
  assert.equal(medicalDaysOut('2026-09-01', '2026-09-08'), '7 days');
  assert.equal(medicalDaysOut('2026-09-07', '2026-09-08'), '1 day');
  assert.equal(medicalDaysOut('2026-09-08', '2026-09-08'), 'Today');
});

test('7. missing / malformed / future start date produces "—" (never a guess)', () => {
  const { medicalDaysOut } = make();
  assert.equal(medicalDaysOut('', '2026-09-08'), '—');
  assert.equal(medicalDaysOut(null, '2026-09-08'), '—');
  assert.equal(medicalDaysOut('not-a-date', '2026-09-08'), '—');
  assert.equal(medicalDaysOut('2026-13-40', '2026-09-08'), '—');   // syntactically shaped but invalid
  assert.equal(medicalDaysOut('2026-09-20', '2026-09-08'), '—');   // future injury date is not a duration
});

test('the model wires dateInjured through to "Time out"', () => {
  const { medicalDetailsModel } = make();
  assert.equal(medicalDetailsModel({ name: 'A' }, { ...REC, dateInjured: '2026-09-03' }, {}, TODAY).timeOut, '5 days');
  assert.equal(medicalDetailsModel({ name: 'A' }, { ...REC, dateInjured: '' }, {}, TODAY).timeOut, '—');
});

// ── no fabrication for a player without a real case ──────────────────────────

test('8. a player with no active case fabricates nothing — every field is "—"', () => {
  const { medicalDetailsModel } = make();
  const m = medicalDetailsModel({ name: 'Healthy Harry', id: 'h1' }, {}, {}, TODAY);
  assert.deepEqual(m, { name: 'Healthy Harry', injury: '—', bodyArea: '—', severity: '—', expectedReturn: '—', timeOut: '—' });
});

// ── read-only ────────────────────────────────────────────────────────────────

test('9. the popup is read-only — it never mutates the record it reads', () => {
  const rec = { ...REC }; const note = { condition: 'x' }; const before = JSON.stringify(rec);
  const state = { medicalRecords: { p1: rec }, medicalNotes: { p1: note } };
  const api = make({ state, players: [{ id: 'p1', name: 'Alex' }] });
  api.medicalDetailsModel({ id: 'p1', name: 'Alex' }, rec, note, TODAY);
  api.openMedicalDetails('p1');
  assert.equal(JSON.stringify(rec), before, 'the source record is untouched');
  assert.deepEqual(api.state.medicalRecords.p1, JSON.parse(before), 'state.medicalRecords is untouched');
});

// ── group isolation: the popup adds NO new privacy boundary ──────────────────

test('10. a group-scoped medic cannot open a case outside their scope', () => {
  // The scoped caseload (medicalPlayers) is Seniors-only, but the derived record
  // cache happens to also hold a U18 player's data. The popup must refuse the
  // U18 id — it is not in the authorized scope — and open only the Seniors one.
  const state = {
    medicalRecords: {
      sen1: { ...REC },
      u18x: { currentInjury: 'Concussion', bodyLocation: 'Head', severity: 'severe', dateInjured: '2026-09-05', expectedReturn: '2026-09-30' },
    },
    medicalNotes: {},
  };
  const api = make({ state, players: [{ id: 'sen1', name: 'Senior One' }] });

  api.openMedicalDetails('u18x');
  assert.equal(api.appended().length, 0, 'an out-of-scope case never renders');

  api.openMedicalDetails('sen1');
  assert.equal(api.appended().length, 1, 'the in-scope case renders');
  assert.match(api.overlayHTML(), /Senior One/);
  assert.match(api.overlayHTML(), /Hamstring strain/);
  assert.doesNotMatch(api.overlayHTML(), /Concussion/, 'no other group data leaks in');
});

test('11. a club-wide authorized medic retains visibility of every authorized case', () => {
  const state = {
    medicalRecords: {
      sen1: { ...REC },
      u18a: { currentInjury: 'Ankle sprain', bodyLocation: 'Ankle', severity: 'minor', dateInjured: '2026-09-06', expectedReturn: '2026-09-15' },
    },
    medicalNotes: {},
  };
  // Club-wide medic: medicalPlayers() returns both groups' players.
  const api = make({ state, players: [{ id: 'sen1', name: 'Senior One' }, { id: 'u18a', name: 'Under-18 Ana' }] });
  api.openMedicalDetails('u18a');
  assert.equal(api.appended().length, 1);
  assert.match(api.overlayHTML(), /Under-18 Ana/);
  assert.match(api.overlayHTML(), /Ankle sprain/);
});

test('a user without medical_access cannot open the popup at all', () => {
  const api = make({ canMedical: false, players: [{ id: 'p1', name: 'Alex' }],
    state: { medicalRecords: { p1: REC }, medicalNotes: {} } });
  api.openMedicalDetails('p1');
  assert.equal(api.appended().length, 0);
});

// ── robustness ───────────────────────────────────────────────────────────────

test('12. malformed case data does not crash rendering', () => {
  const { medicalDetailsModel } = make();
  for (const bad of [null, undefined, 'a string', 42, [], { severity: 12345 }]) {
    const m = medicalDetailsModel({ name: 'A', id: 'x' }, bad, null, TODAY);
    assert.equal(typeof m.injury, 'string');
    assert.equal(typeof m.severity, 'string');
    assert.equal(typeof m.timeOut, 'string');
  }
  // openMedicalDetails with a player carrying junk record data still renders once.
  const api = make({ state: { medicalRecords: { p1: 'junk' }, medicalNotes: { p1: 99 } },
                     players: [{ id: 'p1', name: 'Odd One' }] });
  api.openMedicalDetails('p1');
  assert.equal(api.appended().length, 1);
  assert.match(api.overlayHTML(), /Odd One/);
});

test('the rendered popup is an accessible read-only dialog with a close control', () => {
  const api = make({ state: { medicalRecords: { p1: REC }, medicalNotes: {} },
                     players: [{ id: 'p1', name: 'Alex Athlete' }] });
  api.openMedicalDetails('p1');
  const html = api.overlayHTML();
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-label="Close"/);
  assert.match(html, /Injury/);
  assert.match(html, /Body area/);
  assert.match(html, /Severity/);
  assert.match(html, /Expected return/);
  assert.match(html, /Time out/);
});
