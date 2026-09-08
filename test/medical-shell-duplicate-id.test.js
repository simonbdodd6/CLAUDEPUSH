/**
 * MEDICAL ADD-INJURY — the "Enter an injury type or name" bug on a filled form.
 *
 * Medical has two authorised shells — #coach-medical (staff) and #player-medical
 * (a player holding MEDICAL_ACCESS) — and BOTH emit the same element ids for the
 * Add-Injury form (injType, injPlayer, …). Only the active shell re-renders, so
 * after the view resolves/switches the OTHER shell keeps a STALE copy of the
 * form. document.getElementById returns the FIRST match in document order, and
 * #coach-medical sits above #player-medical, so saveNewInjury's validation read
 * the stale, empty injType while the user typed into the visible one — the exact
 * production repro (field shows "neck", Save says "Enter an injury type or name").
 *
 * The fix: clearInactiveMedicalShell() wipes the inactive shell before the
 * active one renders (mirroring the messages shells), so exactly one injType
 * exists and getElementById returns the visible field. These tests drive the
 * REAL extracted helper against a hand-rolled fake DOM (no jsdom dependency).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's'));
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]); let d = 0, i = start;
  while (i < src.length) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) break; } i++; }
  return src.slice(start, i + 1);
}

// Sandbox with swappable `state` and a fake `document`.
function buildScope() {
  const body = `
    "use strict";
    let state, document;
    ${extractFn('clearInactiveMedicalShell')}
    return { setEnv: (s, d) => { state = s; document = d; }, clearInactiveMedicalShell };
  `;
  return new Function(body)();
}
const scope = buildScope();

// Fake DOM: two Medical shells, each optionally holding an injType input.
// document.getElementById('injType') returns the FIRST in document order
// (coach-medical before player-medical) — the real-browser behaviour.
function makeDom({ coachType = null, playerType = null } = {}) {
  const shell = (id, typeVal) => ({
    id,
    _inj: typeVal === null ? null : { id: 'injType', value: typeVal },
    get innerHTML() { return this._inj ? '<input id="injType">' : ''; },
    set innerHTML(v) { if (v === '') this._inj = null; },
  });
  const coach = shell('coach-medical', coachType);
  const player = shell('player-medical', playerType);
  const doc = {
    getElementById(id) {
      if (id === 'coach-medical') return coach;
      if (id === 'player-medical') return player;
      if (id === 'injType') return coach._inj || player._inj;   // document order
      return null;
    },
    _count(id) { return [coach._inj, player._inj].filter(x => x && x.id === id).length; },
  };
  return { doc, coach, player };
}

// ── THE PRODUCTION REPRO ────────────────────────────────────────────────────

test('BEFORE clearing, a stale coach-medical injType shadows the visible player one', () => {
  // Reproduce the bug's starting DOM (this is the state that produced the report).
  const { doc } = makeDom({ coachType: '', playerType: 'neck' });
  assert.equal(doc.getElementById('injType').value, '', 'getElementById returns the STALE empty field');
  assert.equal(doc._count('injType'), 2, 'two injType inputs exist — the defect');
});

test('a player with MEDICAL_ACCESS: clearing wipes the stale coach shell, so validation reads "neck"', () => {
  const { doc, coach, player } = makeDom({ coachType: '', playerType: 'neck' });
  scope.setEnv({ activeView: 'player' }, doc);
  scope.clearInactiveMedicalShell();
  assert.equal(coach.innerHTML, '', 'the inactive coach shell was cleared');
  assert.equal(player.innerHTML !== '', true, 'the active player shell is untouched');
  assert.equal(doc._count('injType'), 1, 'exactly one injType remains');
  assert.equal(doc.getElementById('injType').value, 'neck', 'validation now reads the value the user typed');
});

test('a staff coach: the stale player shell is cleared instead, and the coach field is read', () => {
  const { doc, coach, player } = makeDom({ coachType: 'neck', playerType: '' });
  scope.setEnv({ activeView: 'coach' }, doc);
  scope.clearInactiveMedicalShell();
  assert.equal(player.innerHTML, '', 'the inactive player shell was cleared');
  assert.equal(coach.innerHTML !== '', true, 'the active coach shell is untouched');
  assert.equal(doc._count('injType'), 1);
  assert.equal(doc.getElementById('injType').value, 'neck');
});

test('no-op when the inactive shell is already empty (no needless writes, no active-shell damage)', () => {
  const { doc, coach, player } = makeDom({ coachType: null, playerType: 'neck' });
  scope.setEnv({ activeView: 'player' }, doc);
  scope.clearInactiveMedicalShell();
  assert.equal(coach._inj, null, 'coach shell stays empty');
  assert.equal(doc.getElementById('injType').value, 'neck', 'the active field is preserved');
  assert.equal(doc._count('injType'), 1);
});

// ── DISPATCH WIRING (regression pin: both shells clear before rendering) ─────

test('both Medical shells clear the inactive one before rendering the active one', () => {
  assert.match(src, /safeRender\('coach-medical',\s*\(\) => \{ if \(state\.activeView === 'coach'\) \{ clearInactiveMedicalShell\(\); renderMedical\(\); \} \}\)/,
    'coach shell clears then renders');
  assert.match(src, /safeRender\('player-medical',\s*\(\) => \{ if \(state\.activeView === 'player' && canI\('medical_access'\)\) \{ clearInactiveMedicalShell\(\); renderMedical\(\); \} \}\)/,
    'player shell clears then renders');
});

test('saveNewInjury still validates a non-empty injury type and rejects empty', () => {
  // The client contract is unchanged by the shell fix — this pins it.
  const save = extractFn('saveNewInjury');
  assert.match(save, /const val = id => \(document\.getElementById\(id\)\?\.value \|\| ""\)\.trim\(\)/, 'reads field values from the DOM');
  assert.match(save, /const type = val\("injType"\)/, 'reads the injury type field');
  assert.match(save, /if \(!type\) \{ showToast\("Enter an injury type or name"\); return; \}/, 'rejects an empty type');
  assert.match(save, /condition:\s*\[type, area\]\.filter\(Boolean\)\.join/, 'the read value flows into the payload');
});
