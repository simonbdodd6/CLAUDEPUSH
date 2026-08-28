/**
 * Members roster sync — added/invited players must not vanish.
 *
 * Bug: a coach-added player lives only in local state until a debounced (2s)
 * roster sync pushes it to the server. loadRosterFromServer() adopts the server
 * roster wholesale; if a roster fetch (from boot/login) resolves during that
 * window it overwrote state.players and the new player appeared for ~1s then
 * vanished — while the counts (same source) flickered with it.
 *
 * Fix: a `_rosterSyncPending` flag. While a local roster edit is awaiting its
 * push, loadRosterFromServer refuses to adopt the (stale) server copy and lets
 * the pending sync win. Boot adoption (no pending edit) is unaffected.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
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

test('a pending-roster-edit flag exists', () => {
  assert.ok(html.includes('let _rosterSyncPending = false;'), '_rosterSyncPending declared');
});

test('queueRosterSync marks a pending edit and clears it once the push starts', () => {
  const fn = extractFn(html, 'queueRosterSync');
  assert.ok(fn.includes('_rosterSyncPending = true;'), 'sets pending when scheduling a push');
  assert.ok(fn.includes('_rosterSyncPending = false;'), 'clears pending when the push begins');
  // pending is only set after the no-change early-return, so unchanged saves never set it
  assert.ok(fn.indexOf('if (fp === _rosterLastSyncedFp) return;') < fn.indexOf('_rosterSyncPending = true;'),
    'unchanged roster (fp === last synced) does NOT set pending');
});

test('loadRosterFromServer guards against clobbering an unsynced local edit', () => {
  const fn = extractFn(html, 'loadRosterFromServer');
  const guard = fn.indexOf('if (_rosterSyncPending)');
  const parsed = fn.indexOf('await res.json()');
  const adopt = fn.indexOf('state.players = serverPlayers');
  assert.ok(guard !== -1, 'has the pending-edit race guard');
  assert.ok(parsed !== -1 && guard > parsed, 'guard runs AFTER the network round-trip (catches edits made in-flight)');
  assert.ok(adopt !== -1 && guard < adopt, 'guard runs BEFORE adopting the server roster');
  assert.ok(/_rosterSyncPending\)\s*\{\s*queueRosterSync\(\);\s*return;/.test(fn), 'on pending: keep local + ensure the push, then bail');
});

test('Members list reads from ONE source of truth (deduped roster)', () => {
  // Beta simplification: availability-style filter pills + their counts were
  // removed. The visible list now derives directly from `members`, which is
  // filtered from canonicalVisiblePlayers() — so list + count never disagree.
  // D1b — Members now reads the OPERATIONAL roster, which is
  // canonicalVisiblePlayers() narrowed to the active group. Still exactly one
  // source of truth; the group filter is a wrapper, not a second list.
  assert.ok(html.includes('const allMembers = operationalPlayers();'), 'roster from operationalPlayers');
  assert.ok(html.includes('const rows = canonicalVisiblePlayers();'),
    'and operationalPlayers derives from the one deduped roster');
  assert.ok(html.includes('const members    = _showArchivedPlayers ? allMembers : allMembers.filter(p => !_isArchivedMember(p));'), 'members filtered from allMembers');
  // Members uses the SAME archived test as Match Centre (lifecycleStatus only) — no _archived divergence
  assert.ok(html.includes("const _isArchivedMember = p => (p.lifecycleStatus || 'active') === 'archived';"), 'archived test matches Match Centre');
  assert.ok(html.includes('${members.map((p, i) =>'), 'the visible list derives from members');
});

test('coach-added players carry pending/consent/unregistered status', () => {
  const fn = extractFn(html, 'addPlayer');
  assert.ok(fn.includes("registrationStatus: 'unregistered'"), 'added player is unregistered');
  assert.ok(fn.includes('mediaConsent: false'), 'added player is consent-pending');
  assert.ok(fn.includes('upsertCanonicalPlayerRecord(player)'), 'persisted via the canonical roster upsert (deduped)');
});

// ── The real root cause: the identity prune deleted coach-added members ───────
test('identity prune KEEPS coach-added roster members (no userId/legacyPlayerId)', () => {
  const fn = extractFn(html, 'syncIdentityStateToLocalRoster');
  assert.ok(fn.includes('if (!uid && !lid) return true;'),
    'roster-only records (no identity link) are kept — not pruned');
  assert.ok(!fn.includes('if (!uid && !pid && !lid) return true;'),
    'the old escape-hatch keyed on the always-present player.id (never fired) is gone');
  // identity-LINKED records the server no longer returns are still pruned
  assert.ok(fn.includes('serverProfileUserIds.has(uid)') && fn.includes('serverProfileLegacyIds.has(lid)'),
    'identity-linked records are still reconciled against the server profiles');
});

// ── Members ↔ Match Centre parity: the prune must not silently drop linked players ──
test('identity prune never wipes the roster on an empty/partial server response', () => {
  const fn = extractFn(html, 'syncIdentityStateToLocalRoster');
  // An empty profiles+members response (transient/session/team-scope) must skip the
  // destructive prune entirely — otherwise identity-linked players vanished from
  // Members while Match Centre (which never prunes) still showed them.
  assert.ok(fn.includes('const haveTrustworthyServerSet = profiles.length > 0 || activePlayerMemberIds.size > 0;'),
    'prune only runs when the server returned a trustworthy reconciliation set');
  assert.ok(/if \(haveTrustworthyServerSet\)\s*\{[\s\S]*?state\.players = state\.players\.filter/.test(fn),
    'the destructive filter is guarded by haveTrustworthyServerSet');
  // A still-active team member is kept even when their player_profile is momentarily
  // absent (e.g. a just-invited/joined player) — reconcile against members too.
  assert.ok(fn.includes('activePlayerMemberIds.has(uid)'),
    'identity-linked players with an active team membership are kept even without a profile');
});

test('a manual add persists to the server immediately (flush, not only the 2s debounce)', () => {
  assert.ok(extractFn(html, 'addPlayer').includes('flushRosterSync()'), 'addPlayer flushes the roster sync');
  const flush = extractFn(html, 'flushRosterSync');
  assert.ok(flush.includes("fetch('/api/roster'") && flush.includes("method: 'POST'"), 'flush POSTs the roster now');
  assert.ok(!/setTimeout/.test(flush), 'flush is immediate (no debounce)');
  assert.ok(flush.includes('if (!isCoach()) return;'), 'coach-only, like the debounced sync');
});

// ─────────────────────────────────────────────────────────────────────────────
// Members attendance — "undefined%" and a red bar for a record with no value.
//
// The Members table interpolated `${p.attendance}%` with no guard. A roster
// record legitimately arrives WITHOUT that key: mergeRosterMember() coerces it
// but only runs when two rows are deduped, normalizeState() defaults `history`
// and `blockedDates` and not `attendance`, and loadRosterFromServer() (the very
// wholesale adoption this file exists for) takes the server rows verbatim —
// api/publish.js stores the roster as an opaque blob and never names the field.
//
// The bar was red for the same reason the text said "undefined": both
// `undefined >= 80` and `undefined >= 60` are false, so the colour ternary fell
// through to its worst branch. One missing field, two wrong pixels.
// ─────────────────────────────────────────────────────────────────────────────

function attendanceScope() {
  const src = [
    'playerAttendanceValue', 'attendanceLabel', 'attendanceBarWidth',
  ].map(n => extractFn(html, n)).join('\n');
  const scope = {};
  new Function('scope', `${src}\n Object.assign(scope, { playerAttendanceValue, attendanceLabel, attendanceBarWidth });`)(scope);
  return scope;
}

test('a real attendance value renders as its own percentage', () => {
  const { playerAttendanceValue, attendanceLabel, attendanceBarWidth } = attendanceScope();
  for (const n of [0, 37, 59, 60, 79, 80, 100]) {
    assert.equal(playerAttendanceValue({ attendance: n }), n);
    assert.equal(attendanceLabel(n), `${n}%`);
    assert.equal(attendanceBarWidth(n), n, 'the bar must be drawn at the real value');
  }
});

test('a genuine zero is data, and still reads as 0%', () => {
  const { playerAttendanceValue, attendanceLabel } = attendanceScope();
  // Nearly every record-creation path seeds attendance: 0. Zero is a measured
  // value, not an absence — collapsing it to "—" would hide real data.
  assert.equal(playerAttendanceValue({ attendance: 0 }), 0);
  assert.equal(attendanceLabel(0), '0%');
});

test('a record with no attendance never renders undefined, NaN or null', () => {
  const { playerAttendanceValue, attendanceLabel } = attendanceScope();
  const missing = [
    { name: 'no key at all' },
    { name: 'explicit undefined', attendance: undefined },
    { name: 'explicit null', attendance: null },
    { name: 'empty string', attendance: '' },
    { name: 'not a number', attendance: 'n/a' },
    { name: 'NaN', attendance: NaN },
    { name: 'Infinity', attendance: Infinity },
  ];
  for (const player of missing) {
    const value = playerAttendanceValue(player);
    assert.equal(value, null, `${player.name} must resolve to "no data"`);
    const label = attendanceLabel(value);
    assert.equal(label, '—', `${player.name} must render an em dash`);
    assert.ok(!/undefined|NaN|null/.test(label), `${player.name} leaked a JS value into the UI`);
  }
});

test('a missing value draws no bar, rather than a full-width red one', () => {
  const { playerAttendanceValue, attendanceBarWidth } = attendanceScope();
  assert.equal(attendanceBarWidth(playerAttendanceValue({})), 0);
  // The reported symptom: undefined failed both threshold tests, so the colour
  // ternary chose red — a missing value shown as the worst possible score.
  const att = playerAttendanceValue({});
  const barColour = att === null ? 'transparent' : att >= 80 ? 'green' : att >= 60 ? 'amber' : 'red';
  assert.equal(barColour, 'transparent', 'absence must not be graded');
});

test('a corrupt or out-of-range value cannot overflow its track', () => {
  const { attendanceBarWidth } = attendanceScope();
  assert.equal(attendanceBarWidth(150), 100);
  assert.equal(attendanceBarWidth(-20), 0);
});

test('the Members table and player detail no longer interpolate attendance raw', () => {
  // Source-level pin: the two surfaces a coach reaches by clicking a member row.
  const table = html.slice(html.indexOf('class="player-db-table"'), html.indexOf('</tbody>', html.indexOf('class="player-db-table"')));
  assert.ok(!/\$\{p\.attendance\}/.test(table), 'Members table still prints a raw attendance value');
  assert.ok(table.includes('attendanceLabel(att)'), 'Members table must use the guarded label');
  assert.ok(table.includes('attendanceBarWidth(att)'), 'Members bar must use the clamped width');

  const detail = extractFn(html, 'renderPlayerDetail');
  assert.ok(!/\$\{p\.attendance\}/.test(detail), 'player detail still prints a raw attendance value');
  assert.ok(detail.includes('attendanceLabel(att)'), 'player detail must use the guarded label');
});

test('the canonical merge preserves an attendance value it is given', () => {
  // The stated suspicion was that the canonical merge dropped the field. It does
  // not — this pins that it keeps preserving it, so the real fix is not masking
  // a regression here later.
  const merge = html.slice(html.indexOf('    function mergeRosterMember('));
  const line = merge.slice(0, merge.indexOf('return merged;'))
    .split('\n').find(l => l.includes('merged.attendance'));
  assert.ok(line, 'mergeRosterMember must still set attendance');
  assert.match(line, /Number\(/, 'and must still coerce it to a number');
  // Both sides are consulted, so a value on either record survives the merge.
  assert.ok(line.includes('preferred.attendance') && line.includes('other.attendance'),
    'the merge must consult both records');
});

test('the fix touches attendance only — no other member field changed shape', () => {
  const table = html.slice(html.indexOf('class="player-db-table"'), html.indexOf('</tbody>', html.indexOf('class="player-db-table"')));
  // Fields that share the row must still be read straight off the record.
  for (const field of ['p.name', 'p.position', 'p.mediaConsent', 'p.id']) {
    assert.ok(table.includes(field), `${field} must still be rendered from the record`);
  }
  // And the row is still keyed and scoped exactly as before.
  assert.ok(table.includes('playerOpenDetail('), 'row click-through unchanged');
});

test('team/club scoping is untouched by the attendance fix', () => {
  // The Members list still comes from operationalPlayers(), which is what
  // applies group scoping; the fix must not have moved that.
  const render = extractFn(html, 'renderPlayers');
  assert.ok(render.includes('operationalPlayers()'), 'Members must still source its list from the scoped helper');
  const scoping = extractFn(html, 'operationalPlayers');
  assert.ok(scoping.includes('state.operationalGroupId'), 'group scoping unchanged');
  assert.ok(!/attendance/.test(scoping), 'the fix must not have leaked into scoping');
});

// ─────────────────────────────────────────────────────────────────────────────
// Attendance safety, completed — renderMessageCenter and renderPlayerAttendance.
//
// These two carried the same unguarded pattern as the Members table. The player
// view was the worse of the pair: `width:${player.attendance}%` produces the
// CSS declaration "width:undefined%", which the browser DISCARDS as invalid —
// leaving a block-level span at auto width, i.e. a FULL bar, in the accent
// colour (.history-bar span defaults to var(--accent)). A player with no
// recorded attendance was shown a complete gold bar claiming a perfect season.
// ─────────────────────────────────────────────────────────────────────────────

test('the message centre renders attendance through the shared helpers', () => {
  const fn = extractFn(html, 'renderMessageCenter');
  assert.ok(!/\$\{attendanceRate\}/.test(fn), 'player list still prints a raw rate');
  assert.ok(!/\$\{selectedPlayer\.attendance\}/.test(fn), 'metric tile still prints a raw value');
  assert.ok(fn.includes('playerAttendanceValue(player)'), 'list row must resolve through the helper');
  assert.ok(fn.includes('attendanceLabel(playerAttendanceValue(selectedPlayer))'),
    'metric tile must resolve through the helper');
});

test('the player attendance view renders through the shared helpers', () => {
  const fn = extractFn(html, 'renderPlayerAttendance');
  assert.ok(!/\$\{player\.attendance\}/.test(fn), 'player view still prints a raw value');
  assert.ok(fn.includes('playerAttendanceValue(player)'), 'must resolve through the helper');
  assert.ok(fn.includes('attendanceBarWidth(att)'), 'bar must use the clamped width');
  assert.ok(fn.includes('attendanceLabel(att)'), 'figure must use the guarded label');
});

test('a missing value can never leave the player bar at auto width', () => {
  const { playerAttendanceValue, attendanceBarWidth } = attendanceScope();
  const fn = extractFn(html, 'renderPlayerAttendance');
  // The width expression must always emit a NUMBER, so the declaration is
  // valid CSS and the browser cannot fall back to auto (= full bar).
  const width = attendanceBarWidth(playerAttendanceValue({}));
  assert.equal(width, 0);
  assert.equal(typeof width, 'number');
  assert.ok(!/width:\$\{[^}]*\.attendance\}/.test(fn),
    'a raw value could render "width:undefined%", which the browser drops');
});

test('both completed surfaces obey the established attendance rules', () => {
  const { playerAttendanceValue, attendanceLabel, attendanceBarWidth } = attendanceScope();
  const cases = [
    { in: { attendance: 74 },        label: '74%', width: 74 },
    { in: { attendance: 0 },         label: '0%',  width: 0  },   // genuine zero is data
    { in: {},                        label: '—',   width: 0  },
    { in: { attendance: null },      label: '—',   width: 0  },
    { in: { attendance: undefined }, label: '—',   width: 0  },
    { in: { attendance: '' },        label: '—',   width: 0  },
    { in: { attendance: 'n/a' },     label: '—',   width: 0  },
    { in: { attendance: NaN },       label: '—',   width: 0  },
    { in: { attendance: 150 },       label: '150%', width: 100 }, // shown real, bar clamped
  ];
  for (const c of cases) {
    const value = playerAttendanceValue(c.in);
    assert.equal(attendanceLabel(value), c.label, `label for ${JSON.stringify(c.in)}`);
    assert.equal(attendanceBarWidth(value), c.width, `bar for ${JSON.stringify(c.in)}`);
    assert.ok(!/undefined|NaN|null/.test(attendanceLabel(value)), 'no JS value may reach the UI');
  }
});

test('no render site anywhere still interpolates a raw attendance value', () => {
  // Whole-file sweep: the guarantee is only worth having if it is exhaustive.
  // buildPlayerDetailHtml and openPlayerAvailabilityPopup use their own older
  // guards (`|| 0` and a typeof test) — neither can emit undefined%, so they
  // are safe and deliberately left alone; this pins that nothing UNGUARDED
  // remains.
  const script = html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>'));
  const raw = [...script.matchAll(/\$\{\s*(?:p|player|selectedPlayer)\.attendance\s*\}/g)];
  const offenders = raw.filter(m => {
    const around = script.slice(Math.max(0, m.index - 200), m.index);
    return !/typeof\s+player\.attendance|\*|\/\//.test(around);
  });
  assert.equal(offenders.length, 0,
    `unguarded attendance interpolation still present: ${offenders.map(o => o[0]).join(', ')}`);
  assert.ok(!/\$\{attendanceRate\}/.test(script), 'raw attendanceRate interpolation still present');
});

test('the LIVE messaging surface reads absence as "—", not a measured 0%', () => {
  // renderMessageCenter() returns renderMessageCenterV2() on its FIRST line, so
  // its own body — including the two attendance sites there — is unreachable.
  // The surface a coach actually sees is V2's player row, which used
  // `attendanceRate || 0`: never "undefined%", but it asserted a 0% nobody
  // measured. Same helper, same rule as the Members table.
  const v1 = extractFn(html, 'renderMessageCenter');
  assert.match(v1.split('\n')[1] || '', /return renderMessageCenterV2\(\)/,
    'V1 is expected to be dead — if this changes, its body needs re-checking');

  const v2 = extractFn(html, 'renderMessageCenterV2');
  assert.ok(!/\$\{attendanceRate \|\| 0\}%/.test(v2), 'live chip still asserts a measured 0%');
  assert.ok(v2.includes('playerAttendanceValue(player)'), 'live chip must resolve through the helper');
  assert.ok(v2.includes('attendanceLabel(att)'), 'live chip must use the guarded label');
});
