/**
 * Availability Centre V2 — the Live Response Board is one sortable, filterable
 * squad list with a status summary bar. Rows show name, position, attendance %,
 * reply, last response time and a medical flag. Clicking a row opens the existing
 * player panel. Presentation only — messaging/automation/notifications untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// Param-aware: skip the parameter list (so `param = {}` default objects don't
// fool the brace matcher) before matching the function body braces.
function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (source[i] !== '(') i++;
  let pd = 0;
  for (; i < source.length; i++) { if (source[i] === '(') pd++; else if (source[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  while (source[i] !== '{') i++;
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error('function ' + name + ' — no closing brace');
}

const render = extractFn(html, 'renderMessageCenterV2');

// ── Structure ───────────────────────────────────────────────────────────────
test('the board is a single squad list (not status columns)', () => {
  assert.ok(render.includes('class="msg-player-list msg-board-list"'), 'single list rendered');
  assert.ok(render.includes('playerRows(boardRows)'), 'list is the filtered+sorted rows');
  assert.ok(!render.includes('class="msg-status-grid compact"'), '4-column status grid removed');
});

test('rows show name, position, attendance %, reply, last response time and a medical flag', () => {
  assert.ok(render.includes('${esc(player.name)}'), 'name');
  assert.ok(render.includes('${esc(player.position)}'), 'position (future-ready)');
  assert.ok(render.includes('msg-attendance-chip') && render.includes('attendanceRate'), 'attendance %');
  assert.ok(render.includes('statusLabel(status)'), 'current reply');
  assert.ok(render.includes('fmtRespondedAt(respondedAt)'), 'last response time');
  assert.ok(render.includes('⚠ Injury'), 'medical / injury flag');
  assert.ok(render.includes('setMessagePlayer('), 'row opens the existing player panel');
});

test('status quick-filters: Available, Maybe, Unavailable, No Reply (with counts)', () => {
  assert.ok(render.includes("setAvailabilityBoardFilter('${id}')"), 'status filter pills wired');
  ['"available", "Available"', '"maybe", "Maybe"', '"unavailable", "Unavailable"', '"no-reply", "No Reply"'].forEach(pair =>
    assert.ok(render.includes(pair), `pill ${pair}`));
  assert.ok(render.includes('available.length]') && render.includes('noReply.length]'), 'pill counts wired');
  assert.ok(!render.includes('"Forwards"') && !render.includes('"Backs"'), 'old position filters gone');
});

test('sort by Position / Attendance / Response', () => {
  assert.ok(render.includes('>Sort: Position<') && render.includes('value="position"'), 'Position');
  assert.ok(render.includes('>Sort: Attendance<') && render.includes('value="attendance"'), 'Attendance');
  assert.ok(render.includes('>Sort: Response<') && render.includes('value="status"'), 'Response status');
});

test('compact summary bar shows Available / Maybe / Unavailable / No Reply', () => {
  assert.ok(render.includes('class="msg-kpi-grid avail-summary"'), 'summary bar');
  assert.ok(render.includes('<span>Available</span><strong>${available.length}</strong>'));
  assert.ok(render.includes('<span>Maybe</span><strong>${maybe.length}</strong>'));
  assert.ok(render.includes('<span>Unavailable</span><strong>${unavailable.length}</strong>'));
  assert.ok(render.includes('<span>No Reply</span><strong>${noReply.length}</strong>'));
});

// ── Filter + sort logic ───────────────────────────────────────────────────────
// Concatenate (NOT a template literal) — the extracted functions contain their
// own ${...} / backticks which a template literal here would wrongly interpolate.
const logic = new Function(
  "let availabilityBoardFilter='all'; let availabilityBoardSort='attendance';\n" +
  extractFn(html, 'availabilityGroupForPlayer') + '\n' +
  extractFn(html, 'availabilityPositionOrder') + '\n' +
  extractFn(html, 'availabilityRowMatchesFilter') + '\n' +
  extractFn(html, 'sortAvailabilityRows') + '\n' +
  'return { setFilter: v => { availabilityBoardFilter = v; },' +
  '         setSort: v => { availabilityBoardSort = v; },' +
  '         availabilityRowMatchesFilter, sortAvailabilityRows, availabilityPositionOrder };'
)();

const ROWS = [
  { player: { name: 'Alex', position: '10' }, status: 'available',   attendanceRate: 90, respondedAt: '2026-07-01T09:00:00Z' },
  { player: { name: 'Ben',  position: '1'  }, status: 'no-reply',    attendanceRate: 60, respondedAt: null },
  { player: { name: 'Cal',  position: '12' }, status: 'maybe',       attendanceRate: 75, respondedAt: '2026-07-01T08:00:00Z' },
  { player: { name: 'Dan',  position: '4'  }, status: 'unavailable', attendanceRate: 50, respondedAt: '2026-07-01T07:00:00Z', reason: 'injury' },
];

test('quick filter keeps only the matching reply status', () => {
  const { setFilter, availabilityRowMatchesFilter } = logic;
  setFilter('all');         assert.equal(ROWS.filter(availabilityRowMatchesFilter).length, 4);
  setFilter('available');   assert.deepEqual(ROWS.filter(availabilityRowMatchesFilter).map(r => r.player.name), ['Alex']);
  setFilter('maybe');       assert.deepEqual(ROWS.filter(availabilityRowMatchesFilter).map(r => r.player.name), ['Cal']);
  setFilter('no-reply');    assert.deepEqual(ROWS.filter(availabilityRowMatchesFilter).map(r => r.player.name), ['Ben']);
  setFilter('unavailable'); assert.deepEqual(ROWS.filter(availabilityRowMatchesFilter).map(r => r.player.name), ['Dan'], 'injured counts as unavailable');
});

test('sort by position, attendance and response status', () => {
  const { setSort, sortAvailabilityRows } = logic;
  setSort('position');   assert.deepEqual(sortAvailabilityRows(ROWS).map(r => r.player.name), ['Ben', 'Dan', 'Alex', 'Cal'], '1,4,10,12');
  setSort('attendance'); assert.deepEqual(sortAvailabilityRows(ROWS).map(r => r.player.name), ['Alex', 'Cal', 'Ben', 'Dan'], '90,75,60,50');
  setSort('status');     assert.deepEqual(sortAvailabilityRows(ROWS).map(r => r.player.name), ['Alex', 'Cal', 'Ben', 'Dan'], 'available<maybe<no-reply<unavailable');
});

test('position order: jersey number, else forwards before backs, unknown last', () => {
  const { availabilityPositionOrder } = logic;
  assert.equal(availabilityPositionOrder({ position: '7' }), 7);
  assert.ok(availabilityPositionOrder({ position: 'Prop' }) < availabilityPositionOrder({ position: 'Wing' }), 'forwards before backs');
  assert.equal(availabilityPositionOrder({ position: '' }), 99, 'unknown last');
});
