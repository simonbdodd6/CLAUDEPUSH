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
  // CONTRACT CHANGE (Build G): the chip read `attendanceRate`, which sessionRows
  // copied from the stale `player.attendance` field — the literal 0 every player
  // is created with — so every row showed a fabricated 0%. The row model is
  // availability only again; the chip resolves the RECORDED value itself.
  assert.ok(render.includes('msg-attendance-chip') && render.includes('playerAttendancePct(player)'),
    'attendance % comes from the recorded register');
  assert.ok(!render.includes('attendanceRate'), 'and no longer rides on the availability row');
  assert.ok(render.includes('statusLabel(status)'), 'current reply');
  assert.ok(render.includes('fmtRespondedAt(respondedAt)'), 'last response time');
  assert.ok(render.includes('⚠ Injury'), 'medical / injury flag');
  // A tapped player row now opens the premium Availability player-details popup
  // (openPlayerAvailabilityPopup), which replaced the old inline setMessagePlayer panel.
  assert.ok(render.includes('openPlayerAvailabilityPopup('), 'row opens the player details popup');
});

test('status quick-filters: Available, Maybe, Unavailable, No Reply (with counts)', () => {
  assert.ok(render.includes("setAvailabilityBoardFilter('${id}')"), 'status filter pills wired');
  ['"available", "Available"', '"maybe", "Maybe"', '"unavailable", "Unavailable"', '"no-reply", "No reply"'].forEach(pair =>
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
  assert.ok(render.includes('<span>No reply</span><strong>${noReply.length}</strong>'));
});

// ── Filter + sort logic ───────────────────────────────────────────────────────
// Concatenate (NOT a template literal) — the extracted functions contain their
// own ${...} / backticks which a template literal here would wrongly interpolate.
const buildLogic = new Function('ROWS',
  "let availabilityBoardFilter='all'; let availabilityBoardSort='attendance';\n" +
  // sortAvailabilityRows now resolves each player's RECORDED attendance rather
  // than reading a rate off the row. The fixture below still states the rate on
  // the row; this stands in for the real accessor so the ORDERING contract is
  // what is tested, not the register plumbing (which has its own suites).
  "const playerAttendancePct = p => { const r = ROWS.find(x => x.player === p);" +
  "  return r && r.attendanceRate !== undefined ? r.attendanceRate : null; };\n" +
  extractFn(html, 'availabilityGroupForPlayer') + '\n' +
  extractFn(html, 'availabilityPositionOrder') + '\n' +
  extractFn(html, 'availabilityRowMatchesFilter') + '\n' +
  extractFn(html, 'sortAvailabilityRows') + '\n' +
  'return { setFilter: v => { availabilityBoardFilter = v; },' +
  '         setSort: v => { availabilityBoardSort = v; },' +
  '         availabilityRowMatchesFilter, sortAvailabilityRows, availabilityPositionOrder };'
);

const ROWS = [
  { player: { name: 'Alex', position: '10' }, status: 'available',   attendanceRate: 90, respondedAt: '2026-07-01T09:00:00Z' },
  { player: { name: 'Ben',  position: '1'  }, status: 'no-reply',    attendanceRate: 60, respondedAt: null },
  { player: { name: 'Cal',  position: '12' }, status: 'maybe',       attendanceRate: 75, respondedAt: '2026-07-01T08:00:00Z' },
  { player: { name: 'Dan',  position: '4'  }, status: 'unavailable', attendanceRate: 50, respondedAt: '2026-07-01T07:00:00Z', reason: 'injury' },
];

const logic = buildLogic(ROWS);

test('quick filter keeps only the matching reply status', () => {
  const { setFilter, availabilityRowMatchesFilter } = logic;
  setFilter('all');         assert.equal(ROWS.filter(availabilityRowMatchesFilter).length, 4);
  setFilter('available');   assert.deepEqual(ROWS.filter(availabilityRowMatchesFilter).map(r => r.player.name), ['Alex']);
  setFilter('maybe');       assert.deepEqual(ROWS.filter(availabilityRowMatchesFilter).map(r => r.player.name), ['Cal']);
  setFilter('no-reply');    assert.deepEqual(ROWS.filter(availabilityRowMatchesFilter).map(r => r.player.name), ['Ben']);
  setFilter('unavailable'); assert.deepEqual(ROWS.filter(availabilityRowMatchesFilter).map(r => r.player.name), ['Dan'], 'injured counts as unavailable');
});

test('sort by position, attendance and response status', () => {
  // CONTRACT CHANGE (Build G): the attendance sort no longer reads a rate off
  // the row. It resolves each player's RECORDED attendance once, which is why
  // the fixture now supplies it through playerAttendancePct rather than as a
  // row field — and why this sort does something for the first time: every rate
  // used to be the same fabricated 0, so it only ever sorted alphabetically.
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

// ── ZERO-PLAYER ONBOARDING ──────────────────────────────────────────────────
// A brand-new club used to reach a dead end here: the only action was a
// DISABLED "Request Availability" button reading "No active players
// available", with nothing explaining what to do or anywhere to go. A coach
// setting their club up for the first time was simply stuck.
//
// With no players the board now shows a real empty state that says what is
// missing and hands the coach the EXISTING invitation flow — the same
// openInvitePlayersModal() the Members page uses. Nothing about the populated
// board changes, and viewing the page still writes nothing.

test('a club with no players gets an explanatory empty state, not a dead end', () => {
  // The dead end is gone for good.
  assert.ok(!render.includes('No active players available'),
    'the disabled dead-end button is removed');
  assert.ok(!/disabled[^>]*>\s*<span style="font-size:15px">Request Availability/.test(render),
    'no disabled Request Availability button remains');

  // The empty state is keyed on the operating group's players being empty.
  assert.ok(render.includes('${opPlayers.length === 0 ?'),
    'the empty state is chosen by the zero-player case');
  assert.ok(render.includes('No players yet'), 'states plainly what is missing');
  assert.ok(render.includes('Add your players to start managing availability.'),
    'says what to do about it');
});

test('the empty state offers the EXISTING invitation flow, not a new one', () => {
  assert.ok(render.includes('Invite players'), 'a primary call to action');
  assert.ok(render.includes('onclick="openInvitePlayersModal()"'),
    'reuses the Members invitation modal');
  // It must not invent its own invite mechanics.
  for (const invented of ['/api/invite', 'fetch(', 'createInvite', 'inviteToken']) {
    assert.ok(!render.includes(invented),
      `the board must not implement invitations itself (${invented})`);
  }
  // The same modal the Members page opens — one journey, not two.
  assert.ok(html.includes('async function openInvitePlayersModal()'),
    'the existing modal is what is being reused');
  const membersUses = (html.match(/onclick="openInvitePlayersModal\(\)"/g) || []).length;
  assert.ok(membersUses >= 2, 'Members and Availability share the one invite entry point');
});

test('a coach who cannot add players is not shown an action they cannot use', () => {
  // Both the copy and the button are gated on the same permission the server
  // requires to create an invitation (PERM.MANAGE_PLAYERS).
  assert.ok(render.includes("canI('manage_players')"),
    'the CTA is gated on the invite permission');
  assert.ok(render.includes('Availability opens up once your club administrator has added players.'),
    'a read-only coach gets an honest explanation instead');
  // The button itself sits inside the permission branch.
  const emptyState = render.slice(render.indexOf('${opPlayers.length === 0 ?'),
                                  render.indexOf(': selected ? `'));
  const btn = emptyState.indexOf('Invite players');
  const gate = emptyState.indexOf("canI('manage_players') ? `");
  assert.ok(gate !== -1 && gate < btn, 'the button is rendered only for a permitted coach');
});

test('a populated club keeps exactly the availability behaviour it had', () => {
  // The request actions are unchanged and still reached when players exist.
  assert.ok(render.includes(": selected ? `"), 'populated clubs still branch on the selected session');
  assert.ok(render.includes(`onclick="sendAvailabilityRequest('\${selected.id}')"`),
    'Request Availability still sends for the selected session');
  assert.ok(render.includes('onclick="sendAllAvailabilityRequests()"'), 'Ask All Sessions retained');
  assert.ok(render.includes('Date to be confirmed'), 'the session subtitle is unchanged');
  // The board itself is untouched.
  assert.ok(render.includes('playerRows(boardRows)'), 'the squad list still renders');
  assert.ok(render.includes('Live Response Board'), 'the board heading is unchanged');
});

test('viewing the board creates nothing — no player, no invitation, no write', () => {
  // Rendering is pure: it must not persist or send anything.
  for (const sideEffect of ['saveState(', 'kvSet(', 'appendClubInvite', 'ensurePlayerProfile',
                            "method: 'POST'", 'sendAvailabilityRequest(' + "'" ]) {
    if (sideEffect === "sendAvailabilityRequest('") continue;   // only as an onclick, below
    assert.ok(!render.includes(sideEffect),
      `rendering must not ${sideEffect} — viewing is read-only`);
  }
  // Requests are only ever wired to a click, never invoked during render.
  const calls = render.match(/(?<!onclick=")sendAvailabilityRequest\(/g) || [];
  assert.equal(calls.length, 0, 'availability requests only happen on an explicit click');
  assert.ok(!render.includes('openInvitePlayersModal();'), 'the invite modal only opens on click');
});
