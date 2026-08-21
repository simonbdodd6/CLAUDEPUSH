/**
 * SC7 — Workout Execution & Logging integration.
 *
 * Verifies the index.html wiring of the workout experience: the namespaced
 * store + fail-safe mirror, the runtime dynamic import, every UI state,
 * honest sync labels, pain-stop safety, player-vs-coach edit boundaries,
 * gating and leakage guards.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { normalizeWorkoutState } from '../performance/services/workout-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let d = 0;
  while (i < source.length) { if (source[i] === '(') d++; if (source[i] === ')') { d--; if (d === 0) { i++; break; } } i++; }
  while (i < source.length && source[i] !== '{') i++;
  d = 0;
  while (i < source.length) { if (source[i] === '{') d++; if (source[i] === '}') { d--; if (d === 0) { i++; break; } } i++; }
  return source.slice(start, i);
}

test('1. performanceWorkout namespaced in defaultState and normalised on load', () => {
  assert.match(html, /performanceWorkout: null,/);
  assert.match(html, /next\.performanceWorkout = input\.performanceWorkout == null \? null : perfNormalizeWorkoutState\(input\.performanceWorkout\);/);
});

test('2. inline workout mirror agrees with the module store on fail-safety', () => {
  const src = extractFn(html, 'perfNormalizeWorkoutState');
  const inline = new Function('return ' + src.replace('function perfNormalizeWorkoutState', 'function '))();
  for (const bad of [null, 'junk', 5, [], { stateVersion: 'x' }, { stateVersion: 99 }, { stateVersion: 1, active: 'nope', history: 'nope' }]) {
    const a = inline(bad);
    const b = normalizeWorkoutState(bad);
    assert.equal(a.active, b.active, JSON.stringify(bad));
    assert.deepEqual(a.history, b.history);
    assert.equal(a.stateVersion, b.stateVersion);
  }
});

test('3. workout runtime loads via dynamic import; index.html holds no workout truth', () => {
  assert.match(html, /import\('\.\/performance\/services\/workout-runtime\.js'\)/);
  assert.ok(!html.includes('function completeWorkout('), 'completion logic lives in the module');
  assert.ok(!html.includes('function exposuresFromWorkout('), 'exposure logic lives in the module');
});

test('4. every UI state has a renderer', () => {
  const dispatcher = extractFn(html, 'perfWorkoutsHtml');
  assert.match(dispatcher, /couldn't load/, 'error state');
  assert.match(dispatcher, /Loading/, 'loading state');
  for (const fn of ['perfWkTodayHtml', 'perfWkReadinessHtml', 'perfWkActiveHtml', 'perfWkPausedHtml', 'perfWkSubstitutionHtml', 'perfWkCompleteReviewHtml', 'perfWkSummaryHtml', 'perfWkHistoryHtml', 'perfWkHistoryDetailHtml']) {
    assert.ok(extractFn(html, fn).length > 0, fn);
  }
});

test('5. sync labels stay honest — no false "synced" claim exists', () => {
  const pill = extractFn(html, 'perfWkSyncPill');
  assert.match(pill, /Saved on device/);
  assert.match(pill, /sync pending/);
  const finish = extractFn(html, 'perfWkFinishConfirm');
  assert.ok(!/'synced'/.test(finish), 'completion never marks state synced');
});

test('6. completion order: archive history first, then clear active (store call)', () => {
  const finish = extractFn(html, 'perfWkFinishConfirm');
  assert.match(finish, /archiveCompletedWorkout/, 'store enforces history-before-clear ordering');
  assert.match(finish, /completeWorkout\(session/);
});

test('7. pain-stop flow: confirm dialog, module call, no substitution language', () => {
  const fn = extractFn(html, 'perfWkPainStop');
  assert.match(fn, /ceConfirm/);
  assert.match(fn, /painStopExercise/);
  assert.match(fn, /nothing replaces it/i);
  assert.ok(!/instead|alternative/i.test(fn), 'no therapeutic substitution offered');
  const sub = extractFn(html, 'perfWkSubstitutionHtml');
  assert.match(sub, /substitution is never the answer to pain/i);
});

test('8. timer never completes sets; timer state is separate from logging', () => {
  const tick = extractFn(html, 'perfWkTimerTick');
  assert.ok(!tick.includes('logSet') && !tick.includes('CompleteSet'), 'timer expiry never logs work');
  assert.match(html, /wk-timer-bar/, 'sticky timer UI present');
});

test('9. player edit surface: actuals only — no prescription/definition mutation in UI', () => {
  const region = html.slice(html.indexOf('SC7 — WORKOUT EXECUTION (UI layer)'), html.indexOf('    // ── Exercise Library ──'));
  // Reading prescriptions for display is fine — WRITES are banned.
  for (const banned of ['sourcePrescription =', '.sourcePrescription=', '.prescribed =', 'exerciseSnapshot.name =', 'publishProgrammeVersion', 'beginEdit(']) {
    assert.ok(!region.includes(banned), `UI must not touch ${banned}`);
  }
  assert.ok(region.includes('perfWkDraft'), 'actual-value drafts exist');
});

test('10. history rendering uses stored snapshots, not live records', () => {
  const detail = extractFn(html, 'perfWkHistoryDetailHtml');
  assert.match(detail, /exerciseSnapshot\.name/, 'names from the stored snapshot');
  assert.ok(!detail.includes('getExerciseById'), 'no live-catalogue dependency in history');
});

test('11. progression preview is display-only and labelled pending', () => {
  const summary = extractFn(html, 'perfWkSummaryHtml');
  assert.match(summary, /pending — nothing is published automatically/i);
  const previews = extractFn(html, 'perfWkBuildPreviews');
  assert.match(previews, /progressionPreviewForExercise/);
  assert.ok(!previews.includes('applyPlanToProgrammeDraft'), 'preview never mutates programmes');
});

test('12. premium gate still guards the section; tabs unchanged', () => {
  const fn = extractFn(html, 'renderPerformance');
  assert.match(fn, /if \(!canUseFeature\('performance'\)\)/);
  const m = html.match(/const PERF_TABS = \[([\s\S]*?)\];/);
  const ids = [...m[1].matchAll(/id: "([a-z]+)"/g)].map(x => x[1]);
  assert.deepEqual(ids, ['dashboard', 'profile', 'athletes', 'programmes', 'workouts', 'library', 'analytics', 'tools', 'settings']);
});

test('13. Core screens never touch the workout namespace', () => {
  for (const fn of ['renderCoachOverview', 'renderTraining', 'renderSettings', 'renderPlayerHome', 'renderPlayers', 'renderMedical']) {
    const src = extractFn(html, fn);
    for (const banned of ['performanceWorkout', 'perfWk', '_wkTimer', 'workout-runtime']) {
      assert.ok(!src.includes(banned), `${fn} must not reference ${banned}`);
    }
  }
});

test('14. no diagnosis language in the SC7 UI region', () => {
  const region = html.slice(html.indexOf('SC7 — WORKOUT EXECUTION (UI layer)'), html.indexOf('    // ── Exercise Library ──'));
  const re = /diagnos\w*/gi;
  let m2;
  while ((m2 = re.exec(region)) !== null) {
    const before = region.slice(Math.max(0, m2.index - 60), m2.index).toLowerCase();
    assert.ok(/not|never|no /.test(before), 'diagnos* only as negation');
  }
  assert.match(region, /never a medical assessment/i);
});
