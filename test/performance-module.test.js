/**
 * SC1 — CoachEasier Performance module foundation.
 *
 * Verifies the premium module is wired through every registration point of
 * the app (section, nav, icons, feature gate, state, render loop) and that
 * the inline pure helpers stay in lockstep with the /performance module tree.
 *
 * Tests:
 *  1.  coach-performance <section> element declared in the static shell
 *  2.  "performance" registered in coachSections with the right label
 *  3.  "performance" present in BETA_NAV_IDS (visible in beta sidebar)
 *  4.  SECTION_ICONS + ICONS carry the performance glyph
 *  5.  FEATURE_REGISTRY entry: id performance, minimumPlan pro, section performance
 *  6.  defaultState ships activePerformanceTab + performanceSettings defaults
 *  7.  normalizeState guards the persisted Performance tab
 *  8.  render() invokes renderPerformance via safeRender('coach-performance')
 *  9.  PERF_TABS declares all 8 SC1 screens in order
 * 10.  renderPerformance gates on canUseFeature('performance')
 * 11.  All 8 screen builders exist (perf*Html)
 * 12.  Inline perfSparklinePoints is in lockstep with performance/components/sparkline.js
 * 13.  Performance CSS layer present with mobile breakpoints
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { sparklinePoints } from '../performance/components/sparkline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// Extracts "function name(...)" from the HTML source (same approach as
// subscription-feature-gates.test.js).
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

test('1. coach-performance section element is declared', () => {
  assert.match(html, /<section id="coach-performance" class="section"><\/section>/);
});

test('2. coachSections registers ["performance", "Performance"]', () => {
  assert.match(html, /\[\s*"performance",\s*"Performance"\s*\]/);
});

test('3. BETA_NAV_IDS includes performance', () => {
  const m = html.match(/const BETA_NAV_IDS = \[(.*?)\];/s);
  assert.ok(m, 'BETA_NAV_IDS found');
  assert.ok(m[1].includes('"performance"'), 'performance in beta nav order');
});

test('4. performance icon registered', () => {
  assert.match(html, /performance:\s*'dumbbell'/);
  assert.match(html, /dumbbell:\s*'<path/);
});

test('5. FEATURE_REGISTRY carries the performance Pro feature', () => {
  const entry = html.match(/\{\s*id: 'performance',[\s\S]*?\},/);
  assert.ok(entry, 'registry entry found');
  assert.match(entry[0], /minimumPlan: 'pro'/);
  assert.match(entry[0], /section: 'performance'/);
  assert.match(entry[0], /displayName: 'CoachEasier Performance'/);
  assert.ok(!/comingSoon/.test(entry[0]), 'module is live, not comingSoon');
});

test('6. defaultState ships Performance keys', () => {
  assert.match(html, /activePerformanceTab: "dashboard"/);
  assert.match(html, /performanceSettings: \{/);
  assert.match(html, /units: "kg"/);
});

test('7. normalizeState validates the persisted Performance tab', () => {
  assert.match(html, /next\.activePerformanceTab = PERF_TABS\.some/);
  assert.match(html, /next\.performanceSettings = \{ \.\.\.structuredClone\(defaultState\.performanceSettings\)/);
});

test('8. render() wires renderPerformance through safeRender', () => {
  assert.match(html, /safeRender\('coach-performance',\s*\(\) => renderPerformance\(\)\);/);
});

test('9. PERF_TABS declares the 8 SC1 screens in order', () => {
  const m = html.match(/const PERF_TABS = \[([\s\S]*?)\];/);
  assert.ok(m, 'PERF_TABS found');
  const ids = [...m[1].matchAll(/id: "([a-z]+)"/g)].map(x => x[1]);
  assert.deepEqual(ids, ['dashboard', 'athletes', 'programmes', 'workouts', 'library', 'analytics', 'tools', 'settings']);
});

test('10. renderPerformance gates on canUseFeature', () => {
  const fn = extractFn(html, 'renderPerformance');
  assert.match(fn, /if \(!canUseFeature\('performance'\)\)/);
  assert.match(fn, /renderUpgradePrompt\('performance'\)/);
});

test('11. all 8 screen builders exist', () => {
  for (const name of ['perfDashboardHtml', 'perfAthletesHtml', 'perfProgrammesHtml', 'perfWorkoutsHtml', 'perfLibraryHtml', 'perfAnalyticsHtml', 'perfCoachToolsHtml', 'perfSettingsHtml']) {
    assert.ok(extractFn(html, name).length > 0, name + ' defined');
  }
});

test('12. inline perfSparklinePoints matches performance/components/sparkline.js', () => {
  const src = extractFn(html, 'perfSparklinePoints');
  const inline = new Function('return ' + src.replace('function perfSparklinePoints', 'function '))();
  const cases = [
    [[0, 10], 120, 32, 3],
    [[5, 5, 5], 120, 32, 3],
    [[1.78, 1.77, 1.76, 1.75, 1.74, 1.73, 1.72], 220, 40, 3],
    [[], 120, 32, 3],
    [[7], 120, 32, 3],
  ];
  for (const [vals, w, h, pad] of cases) {
    assert.equal(inline(vals, w, h, pad), sparklinePoints(vals, w, h, pad), JSON.stringify(vals));
  }
});

test('13. Performance CSS layer present with responsive rules', () => {
  assert.match(html, /COACHEASIER PERFORMANCE \(SC1\)/);
  assert.match(html, /\.perf-tabs \{/);
  assert.match(html, /\.perf-grid-2 \{ grid-template-columns:1fr; \}/, 'mobile collapse at 980px');
  assert.match(html, /\.perf-athlete-row \{ grid-template-columns:1fr; \}/, 'athlete rows stack at 640px');
});
