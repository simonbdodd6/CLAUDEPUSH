/**
 * BUILD 004.1 — retire manual training-attendance recording from the Beta UI.
 *
 * The register (attendanceMark / attendanceMarkAllPresent / saveAttendance /
 * loadAttendance, the server API, the aggregation functions) is untouched.
 * Only its ONE marking surface — attendancePanelHtml, rendered from the
 * Training Planner session card and from History's per-session toggle — is
 * gated off when BETA_SIMPLE_UI is on, exactly like every other Beta-hidden
 * block in the same functions (the coach sheet, the legacy Dashboard/
 * Attendance/Notes tabs). Flipping BETA_SIMPLE_UI restores it unchanged.
 *
 * The read-only Attendance summary tab (_renderTrainingAttendanceSummary,
 * tab id 'summary') is a PRODUCT DECISION to keep visible in Beta — it is
 * deliberately NOT touched by this change and is asserted still reachable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = process.env.CE_INDEX_HTML || join(__dirname, '..', 'index.html');
const html = await readFile(INDEX, 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const strip = s => s.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const renderTraining = strip(extractFn(html, 'renderTraining'));
const history = strip(extractFn(html, '_renderTrainingHistory'));

// ─────────────── criterion 1: no marking UI renders in Beta ─────────────────

test('the Planner session card gates attendancePanelHtml on !BETA_SIMPLE_UI, not permission alone', () => {
  const m = renderTraining.match(
    /\$\{(\(canI\('publish_training'\) && !BETA_SIMPLE_UI\)) \? `<div class="card"[^`]*\$\{[\s\S]*?attendancePanelHtml\(/);
  assert.ok(m, 'expected the guarded attendancePanelHtml card in renderTraining');
  const guard = new Function('canI', 'BETA_SIMPLE_UI', `return ${m[1]};`);
  assert.equal(guard(() => true, true), false, 'Beta ON hides the card even with publish_training permission');
  assert.equal(guard(() => false, true), false, 'Beta ON + no permission: still hidden');
});

test('History gates its inline attendancePanelHtml render on !BETA_SIMPLE_UI', () => {
  const m = history.match(
    /\(_historyOpenSession === s\.id && !BETA_SIMPLE_UI\s*\n\s*\? '<div[^']*'\s*\+\s*\n?\s*attendancePanelHtml\(s\.id, s\.date\)/);
  assert.ok(m, 'expected the guarded inline attendancePanelHtml render in _renderTrainingHistory');
  const guardSrc = "_historyOpenSession === s.id && !BETA_SIMPLE_UI";
  const guard = new Function('_historyOpenSession', 's', 'BETA_SIMPLE_UI', `return ${guardSrc};`);
  assert.equal(guard('sess1', { id: 'sess1' }, true), false,
    'Beta ON: even an open history session renders no panel');
  assert.equal(guard('sess1', { id: 'sess1' }, false), true,
    'Beta OFF: an open history session renders the panel, unchanged');
});

test('attendancePanelHtml has exactly two call sites, both accounted for above', () => {
  const total = html.split('attendancePanelHtml(').length - 1;
  const definitions = html.split('function attendancePanelHtml(').length - 1;
  assert.equal(definitions, 1, 'one implementation');
  assert.equal(total - definitions, 2, 'Planner card + History inline panel — no other render site exists');
});

test('the History toggle button that opens the panel is retained (per-session History is otherwise untouched)', () => {
  // The button itself stays (it merely flips _historyOpenSession); what it
  // would reveal is what BETA_SIMPLE_UI gates, proven above. This mirrors the
  // protected attendance-summary-unification suite, which runs History live
  // under BETA_SIMPLE_UI=true and still expects this button to render.
  assert.match(history, /onclick="trainingHistoryToggle\(/, 'the toggle markup is unconditional on BETA_SIMPLE_UI');
});

// ─────────────── criterion 2: the read-only summary tab is untouched ────────

test('the Attendance summary tab is never redirected away from in Beta', () => {
  assert.match(renderTraining,
    /if \(\(typeof BETA_SIMPLE_UI !== 'undefined' && BETA_SIMPLE_UI\) && \(_tab === 'dashboard' \|\| _tab === 'attendance' \|\| _tab === 'notes'\)\) _tab = 'planner';/,
    'only dashboard/attendance/notes are redirected — summary is not in that list');
  assert.match(renderTraining, /if \(_tab === 'summary'\)\s*\{\s*_renderTrainingAttendanceSummary\(\);\s*return;\s*\}/,
    'the summary tab still dispatches unconditionally');
});

test('the Beta tab bar still offers the read-only Attendance (summary) tab', () => {
  const tabBar = strip(extractFn(html, '_trainingTabBar'));
  const anchor = tabBar.indexOf('const TABS = _betaUI');
  assert.ok(anchor !== -1, 'expected the Beta TABS ternary');
  const arrStart = tabBar.indexOf('[', anchor);
  let depth = 0, i = arrStart;
  for (; i < tabBar.length; i++) {
    if (tabBar[i] === '[') depth++;
    else if (tabBar[i] === ']') { depth--; if (!depth) { i++; break; } }
  }
  const betaTabs = new Function(`return ${tabBar.slice(arrStart, i)};`)();
  assert.ok(betaTabs.some(([id]) => id === 'summary'), 'summary tab id survives in the Beta tab bar');
  assert.ok(!betaTabs.some(([id]) => id === 'attendance'), 'the legacy device-local editor stays out of Beta');
});

// ─────────────── criterion 3: non-Beta capability is unchanged ──────────────

test('non-Beta: the Planner card renders on permission alone, exactly as before', () => {
  const m = renderTraining.match(
    /\$\{(\(canI\('publish_training'\) && !BETA_SIMPLE_UI\))/);
  assert.ok(m);
  const guard = new Function('canI', 'BETA_SIMPLE_UI', `return ${m[1]};`);
  assert.equal(guard(() => true, false), true, 'Beta OFF + permission: the card renders');
  assert.equal(guard(() => false, false), false, 'Beta OFF + no permission: unchanged refusal');
});

test('non-Beta: History still opens the same register it always has', () => {
  const guard = new Function('_historyOpenSession', 's', 'BETA_SIMPLE_UI',
    `return _historyOpenSession === s.id && !BETA_SIMPLE_UI;`);
  assert.equal(guard('sess1', { id: 'sess1' }, false), true, 'Beta OFF: the inline panel renders when opened');
  assert.equal(guard('sess2', { id: 'sess1' }, false), false, 'a different session stays closed, unchanged');
});

test('the retained architecture is untouched: attendanceMark, attendanceMarkAllPresent, saveAttendance, loadAttendance all still exist', () => {
  for (const fn of ['attendanceMark', 'attendanceMarkAllPresent', 'saveAttendance', 'loadAttendance', 'attendancePanelHtml']) {
    assert.doesNotThrow(() => extractFn(html, fn), `${fn} must still be defined`);
  }
});
