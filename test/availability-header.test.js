/**
 * Availability page — coach-first simplification.
 *  - The "Availability Centre" hero is gone.
 *  - The top-right action button group is removed (Messages lives in the nav,
 *    replies auto-refresh, requests are sent by automation).
 *  - A simple week navigator replaces the "New Week" button.
 *  - The "Active automations" section is hidden from the Beta Availability UI.
 *  - Auto-refresh (the poll timer) is preserved.
 * Presentation/layout only — handlers and data paths unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — no closing brace');
}

const render = extractFn(html, 'renderMessageCenterV2');

test('the large Availability Centre hero box is no longer rendered', () => {
  assert.ok(!render.includes('class="msg-hero"'), 'msg-hero box removed');
  assert.ok(!render.includes('<h2>Availability Centre</h2>'), 'Availability Centre title removed');
});

test('the top-right action button group is removed', () => {
  assert.ok(!render.includes('class="avail-head-actions"'), 'action button row removed');
  assert.ok(!render.includes('>Refresh replies<'), 'Refresh replies button removed');
  assert.ok(!render.includes('>Send all sessions<'), 'Send all sessions button removed');
  assert.ok(!/avail-head[\s\S]{0,400}clearWeekAvailability\(\)/.test(render), 'New week button removed from the header');
});

test('the header has a simple week navigator (Previous / Current / Next)', () => {
  assert.ok(render.includes('class="avail-weeknav"'), 'week navigator present');
  assert.ok(render.includes('availWeekShift(-1)'), 'Previous week');
  assert.ok(render.includes('availWeekShift(0)'), 'back to current week');
  assert.ok(render.includes('availWeekShift(1)'), 'Next week');
  assert.ok(render.includes('Previous Week') && render.includes('Next Week'), 'navigator labels');
  assert.ok(render.includes('availWeekLabel(weekOffset)'), 'centre shows the displayed week label');
});

test('the week navigator defaults to the current week with sensible labels', () => {
  const scope = new Function(extractFn(html, 'availWeekLabel') + '\nreturn availWeekLabel;')();
  assert.equal(scope(0), 'This week', 'defaults to current week');
  assert.equal(scope(-1), 'Last week');
  assert.equal(scope(1), 'Next week');
  assert.equal(scope(-3), '3 weeks ago');
  assert.equal(scope(2), 'In 2 weeks');
});

test('the "Active automations" section is hidden in the Beta Availability UI', () => {
  assert.ok(
    render.includes("class=\"msg-card${BETA_SIMPLE_UI ? ' beta-hidden' : ''}\" style=\"padding:0;overflow:hidden\""),
    'Active automations panel is beta-hidden (system kept for the full build)',
  );
  assert.ok(html.includes('function loadLiveSchedules'), 'underlying automation loader is NOT deleted');
});

test('the header still sits above the Sessions section (board pulled up)', () => {
  const headIdx = render.indexOf('class="avail-head"');
  const sessionsIdx = render.indexOf('<h2>Sessions</h2>');
  assert.ok(headIdx > -1 && sessionsIdx > -1 && headIdx < sessionsIdx);
});

test('the shared topbar is hidden for Availability (single title)', () => {
  assert.ok(/\.workspace:has\(#coach-message\.active\) > \.topbar \{ display: none/.test(html));
});

test('auto-refresh is preserved (poll timer, no visible Refresh button)', () => {
  assert.ok(/_availPollTimer = setInterval/.test(html), 'auto-refresh poll timer present');
  assert.ok(html.includes('refreshLiveAvailability({ boardOnly: true })'), 'board auto-refreshes');
});

test('the week navigator is mobile-safe (no overflow)', () => {
  assert.ok(html.includes('.avail-weeknav {'), 'navigator style present');
  assert.ok(/@media \(max-width: 760px\) \{[\s\S]*\.awk-arrow \.awk-word \{ display:none/.test(html),
    'small screens drop the Previous/Next words to avoid overflow');
});
