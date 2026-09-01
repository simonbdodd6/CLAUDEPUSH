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
// Members attendance.
//
// CONTRACT CHANGE (Build G). These tests were written for a different defect:
// the Members table interpolated `${p.attendance}%` with no guard, printing
// "undefined%" and — because `undefined >= 80` and `undefined >= 60` are BOTH
// false — a RED bar. playerAttendanceValue() fixed that by reading the field
// safely.
//
// It was reading the wrong thing. `player.attendance` is written the literal 0
// on every creation path and is NEVER computed, so "safely" meant every player
// in every club showed a measured-looking 0% — beside a real attendance system
// that said something else. The helper is now playerAttendancePct(), reading the
// server registers through attendanceStats() under the canonical identity.
//
// EVERY INVARIANT BELOW IS UNCHANGED and still asserted: absence never renders
// undefined/NaN/null, absence draws no bar and is not graded red, values are
// clamped, a genuine 0% is data and is shown. Only the SOURCE of the number
// changed. Two tests are gone because their subject is gone:
// renderPlayerAttendance() was a dead screen (no nav entry, no render registry,
// no caller) whose only job was to draw the fabricated field, and it is removed
// — test/attendance-no-fabricated-zero.test.js pins that it stays removed.
// ─────────────────────────────────────────────────────────────────────────────

const SEASON = ['2026-07-01', '2027-06-30'];

/**
 * The three presentation helpers over an INJECTED register, so a case can be
 * stated as "this is what the coach recorded" rather than as a roster field.
 */
function attendanceScope(sessions = {}, opts = {}) {
  const src = ['playerAttendancePct', 'attendanceLabel', 'attendanceBarWidth',
               'attendanceStats', 'playerMatchKey'].map(n => extractFn(html, n)).join('\n');
  return new Function('cfg', `
    "use strict";
    const state = { seasonStart: '${SEASON[0]}', seasonEnd: '${SEASON[1]}' };
    let _attendanceSelfKey = cfg.selfKey || '';
    const currentAttendance = () => cfg.att;
    const attendanceFailed = () => !!cfg.failed;
    ${src}
    return { playerAttendancePct, attendanceLabel, attendanceBarWidth };
  `)({ att: opts.att === undefined ? { sessions } : opts.att, failed: opts.failed, selfKey: opts.selfKey });
}
const sess = (date, marks) => ({ date, title: 'Tuesday training', marks });
const AMY = { id: 'user_amy', userId: 'user_amy', name: 'Amy Stone' };

test('a real attendance value renders as its own percentage', () => {
  // 3 of 4 present = 75%.
  const { playerAttendancePct, attendanceLabel, attendanceBarWidth } = attendanceScope({
    s1: sess('2026-08-04', { 'id:user_amy': 'present' }),
    s2: sess('2026-08-06', { 'id:user_amy': 'present' }),
    s3: sess('2026-08-11', { 'id:user_amy': 'present' }),
    s4: sess('2026-08-13', { 'id:user_amy': 'absent' }),
  });
  const v = playerAttendancePct(AMY);
  assert.equal(v, 75);
  assert.equal(attendanceLabel(v), '75%');
  assert.equal(attendanceBarWidth(v), 75, 'the bar must be drawn at the real value');
});

test('a genuine zero is data, and still reads as 0%', () => {
  // A register WAS taken and this player missed every session on it. That is a
  // measured 0%, and it must survive — the whole point of removing the
  // fabricated one is that a real one can now be believed.
  const { playerAttendancePct, attendanceLabel, attendanceBarWidth } = attendanceScope({
    s1: sess('2026-08-04', { 'id:user_amy': 'absent' }),
    s2: sess('2026-08-06', { 'id:user_amy': 'absent' }),
  });
  assert.equal(playerAttendancePct(AMY), 0);
  assert.equal(attendanceLabel(0), '0%');
  assert.equal(attendanceBarWidth(0), 0);
});

test('a record with no attendance never renders undefined, NaN or null', () => {
  const cases = [
    ['no register at all',        attendanceScope({})],
    ['marked for somebody else',  attendanceScope({ s1: sess('2026-08-04', { 'id:someone': 'present' }) })],
    ['not recorded this session', attendanceScope({ s1: sess('2026-08-04', {}) })],
    ['out of season',             attendanceScope({ s1: sess('2025-08-04', { 'id:user_amy': 'present' }) })],
    ['read failed',               attendanceScope({}, { att: null, failed: true })],
    ['still loading',             attendanceScope({}, { att: null })],
    ['no training access',        attendanceScope({}, { att: { denied: true, sessions: {} } })],
  ];
  for (const [name, scope] of cases) {
    const value = scope.playerAttendancePct(AMY);
    assert.equal(value, null, `${name} must resolve to "no answer"`);
    const label = scope.attendanceLabel(value);
    assert.equal(label, '—', `${name} must render an em dash`);
    assert.ok(!/undefined|NaN|null/.test(label), `${name} leaked a JS value into the UI`);
  }
});

test('a player with no resolvable identity claims nobody’s attendance', () => {
  const { playerAttendancePct } = attendanceScope({ s1: sess('2026-08-04', { 'id:user_amy': 'present' }) });
  for (const bad of [{}, { name: 'Amy Stone' }, { id: '' }, { id: '', userId: '' }]) {
    assert.equal(playerAttendancePct(bad), null, JSON.stringify(bad));
  }
  // A NAME is never an identity — a namesake must not inherit the record.
  assert.equal(playerAttendancePct({ id: 'user_other', name: 'Amy Stone' }), null);
});

test('a self-scoped register answers for its owner and for nobody else', () => {
  // A PLAYER's device holds only their own marks, re-keyed by the server. The
  // same helper on that device must refuse to answer about a squad-mate.
  const sessions = { s1: sess('2026-08-04', { 'id:user_amy': 'present' }) };
  const scope = attendanceScope({}, { att: { scope: 'self', sessions }, selfKey: 'id:user_amy' });
  assert.equal(scope.playerAttendancePct(AMY), 100);
  assert.equal(scope.playerAttendancePct({ id: 'user_ben', userId: 'user_ben' }), null);
});

test('a missing value draws no bar, rather than a full-width red one', () => {
  const { playerAttendancePct, attendanceBarWidth } = attendanceScope({});
  const att = playerAttendancePct(AMY);
  assert.equal(attendanceBarWidth(att), 0);
  // The original symptom: undefined failed both threshold tests, so the colour
  // ternary chose red — a missing value shown as the worst possible score.
  const barColour = att === null ? 'transparent' : att >= 80 ? 'green' : att >= 60 ? 'amber' : 'red';
  assert.equal(barColour, 'transparent', 'absence must not be graded');
});

test('a corrupt or out-of-range value cannot overflow its track', () => {
  const { attendanceBarWidth } = attendanceScope({});
  assert.equal(attendanceBarWidth(150), 100);
  assert.equal(attendanceBarWidth(-20), 0);
});

test('the Members table resolves attendance through the shared helpers', () => {
  const table = html.slice(html.indexOf('class="player-db-table"'), html.indexOf('</tbody>', html.indexOf('class="player-db-table"')));
  assert.ok(!/\$\{p\.attendance\}/.test(table), 'Members table still prints a raw attendance value');
  assert.ok(table.includes('attendanceLabel(att)'), 'Members table must use the guarded label');
  assert.ok(table.includes('attendanceBarWidth(att)'), 'Members bar must use the clamped width');
  assert.ok(table.includes('playerAttendancePct(p)'), 'and the value must be the recorded one');

  // The profile EDIT form no longer shows attendance at all: its "Availability"
  // card used to head itself with an attendance bar, and the Member Centre
  // overview beside it already carries the authoritative card.
  const detail = extractFn(html, 'renderPlayerDetail')
    .replace(/<!--[\s\S]*?-->/g, '')                     // the comment explaining the removal
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/attendance/i.test(detail), 'the edit form must not present attendance');
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
// Attendance safety, completed — the live messaging surfaces.
//
// renderMessageCenter() returns renderMessageCenterV2() on its FIRST line, so
// its own body is unreachable; V2's player row is what a coach actually sees.
// It used `attendanceRate || 0` — never "undefined%", but it asserted a 0%
// nobody measured. Same helper, same rule as the Members table.
// ─────────────────────────────────────────────────────────────────────────────

test('the live messaging chip reads the recorded register, not a roster field', () => {
  const v1 = extractFn(html, 'renderMessageCenter');
  assert.match(v1.split('\n')[1] || '', /return renderMessageCenterV2\(\)/,
    'V1 is expected to be dead — if this changes, its body needs re-checking');

  const v2 = extractFn(html, 'renderMessageCenterV2');
  assert.ok(!/\$\{attendanceRate \|\| 0\}%/.test(v2), 'live chip still asserts a measured 0%');
  assert.ok(v2.includes('playerAttendancePct(player)'), 'live chip must resolve the recorded value');
  assert.ok(v2.includes('attendanceLabel(att)'), 'live chip must use the guarded label');
  assert.ok(v2.includes('attendanceUnknownReason()'), 'and must say WHY when there is no figure');
});

test('no render site anywhere still reads the stale roster field', () => {
  // Whole-file sweep: the guarantee is only worth having if it is exhaustive.
  const script = html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>'));
  const stripped = script.split('\n')
    .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');
  for (const pattern of [/\$\{\s*(?:p|player|selectedPlayer)\.attendance\s*\}/,
                         /\battendanceLabel\(\s*(?:p|player|selectedPlayer)\.attendance/,
                         /\bplayerAttendanceValue\b/,
                         /\$\{attendanceRate\}/]) {
    assert.ok(!pattern.test(stripped), `still present: ${pattern}`);
  }
  // The field itself is left in the data model on purpose (no migration), but
  // the only places that may still NAME it are the writers and the merge.
  const reads = [...stripped.matchAll(/(?:\bp|\bplayer|\bselectedPlayer|\bpreferred|\bother)\.attendance\b/g)];
  assert.deepEqual([...new Set(reads.map(m => m[0]))].sort(), ['other.attendance', 'preferred.attendance'],
    'only the shape-preserving merge may still read the legacy field');
});
