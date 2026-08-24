/**
 * SC3 — Validated Exercise Library integration.
 *
 * Verifies the index.html integration of the exercise library: the
 * catalogue module boundary (dynamic import, no inline definitions), the
 * namespaced preference store and its lockstep mirror, the player/coach
 * library UI wiring, detail-view safety separation, and the usual gating
 * and leakage guards.
 *
 * Tests:
 *  1.  performanceLibrary namespaced in defaultState and normalised on load
 *  2.  inline prefs mirror is in lockstep with exercise-prefs-store.js
 *  3.  catalogue loads via dynamic import; no inline exercise definitions
 *  4.  favourites/recent write only through the namespaced store
 *  5.  library UI: search, category/pattern/difficulty/equipment filters,
 *      favourites, recently viewed, loading + error states
 *  6.  coach view: tier tabs + create placeholder; player view has none
 *  7.  detail view: provenance distinction, safety separation, media
 *      placeholder with no video controls, relationship chips
 *  8.  detail view enforces canViewExercise before rendering
 *  9.  position relevance presented as signal, never restriction
 * 10.  no programme-generation logic in the Performance regions
 * 11.  no external media URLs or <video> elements in Performance regions
 * 12.  Core screens never touch library namespaces
 * 13.  premium entitlement gate unchanged
 * 14.  SC1 exact-tab contract unchanged by SC3
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { normalizeLibraryState } from '../performance/services/exercise-prefs-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === '(') parenDepth++;
    if (source[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return source.slice(start, i);
}

// The Performance code regions (mirror block + module block).
function perfRegions() {
  return [
    html.slice(html.indexOf('athlete profile model (SC2, inline mirror)'), html.indexOf('const playerSections = [')),
    html.slice(html.indexOf('COACHEASIER PERFORMANCE — premium S&C module'), html.indexOf('    function render() {')),
  ];
}

test('1. performanceLibrary namespaced and normalised on load', () => {
  assert.match(html, /performanceLibrary: null,/);
  assert.match(html, /next\.performanceLibrary = input\.performanceLibrary == null \? null : perfNormalizeLibraryState\(input\.performanceLibrary\);/);
});

test('2. inline prefs mirror is in lockstep with the module store', () => {
  const src = extractFn(html, 'perfNormalizeLibraryState');
  const inline = new Function('return ' + src.replace('function perfNormalizeLibraryState', 'function '))();
  const cases = [
    null, 'junk', 5, [], { stateVersion: 'x' },
    { stateVersion: 99, favourites: ['x'] },
    { stateVersion: 1, favourites: ['a', 'a', 'b'], recent: ['r1', 'r2'] },
    { stateVersion: 1, favourites: 'nope', recent: [1] },
    { stateVersion: 1, favourites: Array.from({ length: 300 }, (_, i) => 'f' + i), recent: Array.from({ length: 40 }, (_, i) => 'r' + i) },
  ];
  for (const c of cases) {
    assert.deepEqual(inline(c), normalizeLibraryState(c), JSON.stringify(c)?.slice(0, 60));
  }
});

test('3. catalogue via dynamic import; no inline exercise definitions', () => {
  assert.match(html, /import\('\.\/performance\/services\/exercise-catalogue\.js'\)/);
  assert.ok(!html.includes('PERF_SAMPLE_EXERCISES'), 'old inline exercise data removed');
  assert.ok(!html.includes("shortDescription: '"), 'no exercise records inlined');
});

test('4. favourites/recent write only through the namespaced store', () => {
  const star = extractFn(html, 'perfLibToggleStar');
  assert.match(star, /state\.performanceLibrary =/);
  const view = extractFn(html, 'perfLibRecordView');
  assert.match(view, /state\.performanceLibrary =/);
  assert.match(view, /slice\(-12\)/, 'recent list capped');
  for (const region of perfRegions()) {
    const writes = [...region.matchAll(/state\.performance([A-Za-z]+)\s*=/g)].map(m => m[1]);
    // SC7 adds the Workout namespace (performanceWorkout) — same store pattern.
    assert.ok(writes.every(w => ['Profile', 'Library', 'Settings', 'Workout'].includes(w)), 'only perf namespaces written: ' + writes.join(','));
  }
});

test('5. library UI: search, filters, favourites, recent, loading and error states', () => {
  const lib = extractFn(html, 'perfLibraryHtml');
  assert.match(lib, /type="search"/);
  assert.match(lib, /Search by name or alias/);
  assert.match(lib, /perfLibSet\('cat'/, 'category filter');
  assert.match(lib, /perfLibSet\('pattern', this\.value\)/, 'movement-pattern filter');
  assert.match(lib, /perfLibSet\('diff'/, 'difficulty filter');
  assert.match(lib, /perfLibSet\('kit'/, 'equipment filter');
  assert.match(lib, /perfLibToggleFav/, 'favourites toggle');
  assert.match(lib, /perfLibRecentHtml\(\)/, 'recently viewed');
  assert.match(lib, /Loading the validated catalogue/, 'loading state');
  assert.match(lib, /couldn't load/, 'error state');
  assert.match(lib, /catalogue \$\{esc\(meta\.version\)\}/, 'catalogue version shown');
  assert.match(lib, /not medically approved/, 'beta disclaimer');
  const list = extractFn(html, 'perfLibListHtml');
  assert.match(list, /No exercises match/, 'empty-result state');
});

test('6. coach view is role-aware; players get no tier tabs or authoring', () => {
  const lib = extractFn(html, 'perfLibraryHtml');
  assert.match(lib, /coach \? `<div class="perf-chip-row" role="group" aria-label="Content tier">/);
  assert.match(lib, /coach \? `<button type="button" class="btn ghost" onclick="perfComingSoon\('Exercise authoring'\)/);
  const viewer = extractFn(html, 'perfLibViewer');
  assert.match(viewer, /isCoach\(\) \? 'snc_coach' : 'player'/);
  const filtered = extractFn(html, 'perfLibFiltered');
  assert.match(filtered, /visibleExercises/, 'visibility rules applied before any filtering');
});

test('7. detail view: provenance, safety separation, honest media placeholder', () => {
  const detail = extractFn(html, 'perfExerciseDetailHtml');
  assert.match(detail, /Validated by CoachEasier/);
  assert.match(detail, /not by CoachEasier/, 'club content clearly attributed');
  assert.match(detail, /not reviewed by CoachEasier/, 'private content clearly attributed');
  assert.match(detail, /perf-safety-card/, 'safety is its own section');
  assert.match(detail, /painStop/, 'pain-stop guidance surfaced');
  assert.match(detail, /Demonstration coming soon/, 'explicit media placeholder');
  assert.match(detail, /relChip/, 'relationship chips present');
  assert.match(detail, /Coaching guidance/, 'coaching guidance labelled');
});

test('8. detail view enforces visibility before rendering', () => {
  const lib = extractFn(html, 'perfLibraryHtml');
  assert.match(lib, /canViewExercise\(ex, perfLibViewer\(\)\)/, 'detail gated by canViewExercise');
});

test('9. position relevance is a signal, not a restriction', () => {
  const detail = extractFn(html, 'perfExerciseDetailHtml');
  assert.match(detail, /never a restriction/i);
});

test('10. no programme-generation logic in Performance regions', () => {
  for (const region of perfRegions()) {
    for (const banned of ['generateProgramme', 'generateWorkout', 'buildProgramme', 'prescribeLoad', 'autoProgress']) {
      assert.ok(!region.includes(banned), `no ${banned}`);
    }
  }
});

test('11. no external media URLs or video elements in Performance regions', () => {
  for (const region of perfRegions()) {
    assert.ok(!/<video/i.test(region), 'no video elements');
    assert.ok(!/https?:\/\/[^"'\s]*\.(mp4|webm|gif|youtube|vimeo)/i.test(region), 'no external media URLs');
  }
});

test('12. Core screens never touch library namespaces', () => {
  for (const fn of ['renderCoachOverview', 'renderTraining', 'renderSettings', 'renderPlayerHome', 'renderPlayers', 'renderMedical']) {
    const src = extractFn(html, fn);
    for (const banned of ['performanceLibrary', 'perfLib', '_perfCat', 'exercise-catalogue']) {
      assert.ok(!src.includes(banned), `${fn} must not reference ${banned}`);
    }
  }
});

test('13. premium entitlement gate unchanged', () => {
  const fn = extractFn(html, 'renderPerformance');
  assert.match(fn, /if \(!canUseFeature\('performance'\)\)/);
  // The GATE is unchanged. What a gated club is TOLD changed when the upgrade
  // CTAs were removed: an honest unavailable notice, not an upsell.
  assert.match(fn, /renderUnavailableNotice\('performance'\)/);
});

test('14. SC1/SC2 tab contract still holds (SC3 unchanged; SC8 added one athlete screen)', () => {
  const m = html.match(/const PERF_TABS = \[([\s\S]*?)\];/);
  const ids = [...m[1].matchAll(/id: "([a-z]+)"/g)].map(x => x[1]);
  assert.deepEqual(ids, ['dashboard', 'programme', 'profile', 'athletes', 'programmes', 'workouts', 'library', 'analytics', 'tools', 'settings']);
  assert.ok(ids.includes('library'), 'the exercise library screen is untouched by SC8');
});
