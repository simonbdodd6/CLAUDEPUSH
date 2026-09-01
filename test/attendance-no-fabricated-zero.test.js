/**
 * BUILD G — NO FABRICATED 0%.
 *
 * `player.attendance` was written the literal 0 on every player-creation path
 * and was NEVER computed by anything. Every surface that read it therefore
 * printed "0%" — a measured-looking statistic, in a club that had simply never
 * taken a register, sitting beside the real attendance card saying something
 * else entirely.
 *
 * The two states this file exists to keep apart:
 *
 *   0%    a register WAS taken, and this player missed every session on it.
 *   "—"   nobody has recorded anything about this player, or we cannot say.
 *
 * There is ONE source for the first: the server registers, through
 * attendanceStats(), under the canonical durable identity. There is no second
 * percentage, no second store, and no roster field standing in for either.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

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
const strip = s => s.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n').replace(/<!--[\s\S]*?-->/g, '');

const SEASON = ['2026-07-01', '2027-06-30'];
const sess = (date, marks, title) => ({ date, title: title || 'Tuesday training', marks });
const AMY = { id: 'user_amy', userId: 'user_amy', name: 'Amy Stone' };
const BEN = { id: 'user_ben', userId: 'user_ben', name: 'Amy Stone' };   // a NAMESAKE

/** The presentation helpers over an injected register. */
function scope({ sessions = {}, att, failed = false, selfKey = '' } = {}) {
  const src = ['playerAttendancePct', 'attendanceUnknownReason', 'attendanceLabel',
               'attendanceBarWidth', 'attendanceStats', 'playerMatchKey']
    .map(n => extractFn(html, n)).join('\n');
  return new Function('cfg', `
    "use strict";
    const state = { seasonStart: '${SEASON[0]}', seasonEnd: '${SEASON[1]}' };
    let _attendanceSelfKey = cfg.selfKey;
    const currentAttendance = () => cfg.att;
    const attendanceFailed = () => cfg.failed;
    ${src}
    return { playerAttendancePct, attendanceUnknownReason, attendanceLabel, attendanceBarWidth };
  `)({ att: att === undefined ? { sessions } : att, failed, selfKey });
}

// ═══════════════ PHASE 6 — THE FIVE STATES ════════════════════════════════

test('CASE 1 — no attendance records is NOT 0%', () => {
  const s = scope({ sessions: {} });
  const v = s.playerAttendancePct(AMY);
  assert.equal(v, null);
  assert.equal(s.attendanceLabel(v), '—', 'never "0%"');
  assert.equal(s.attendanceBarWidth(v), 0);
  assert.equal(s.attendanceUnknownReason(), 'No attendance recorded yet');
});

test('CASE 2 — present once is 100%', () => {
  const s = scope({ sessions: { s1: sess('2026-08-04', { 'id:user_amy': 'present' }) } });
  assert.equal(s.playerAttendancePct(AMY), 100);
  assert.equal(s.attendanceLabel(100), '100%');
});

test('CASE 3 — absent once is a REAL 0%, and must still be shown', () => {
  const s = scope({ sessions: { s1: sess('2026-08-04', { 'id:user_amy': 'absent' }) } });
  const v = s.playerAttendancePct(AMY);
  assert.equal(v, 0, 'a register was taken and they missed it — that is data');
  assert.equal(s.attendanceLabel(v), '0%');
  assert.notEqual(v, null, 'removing the fabricated zero must not remove the real one');
});

test('CASE 4 — one present and one absent is 50%', () => {
  const s = scope({ sessions: {
    s1: sess('2026-08-04', { 'id:user_amy': 'present' }),
    s2: sess('2026-08-06', { 'id:user_amy': 'absent' }) } });
  assert.equal(s.playerAttendancePct(AMY), 50);
});

test('CASE 5 & 6 — availability cannot move attendance in either direction', () => {
  const register = { s1: sess('2026-08-04', { 'id:user_amy': 'present' }) };
  // Every availability answer the model can hold, against one PRESENT mark.
  for (const answer of ['available', 'unavailable', 'maybe', 'injured', 'no-reply', undefined]) {
    const s = scope({ sessions: register });
    const player = { ...AMY, status: answer, game: answer, trainingTuesday: answer, history: [answer] };
    assert.equal(s.playerAttendancePct(player), 100, `unavailable+present is PRESENT (${answer})`);
  }
  const absent = { s1: sess('2026-08-04', { 'id:user_amy': 'absent' }) };
  for (const answer of ['available', 'unavailable', 'maybe']) {
    const s = scope({ sessions: absent });
    assert.equal(s.playerAttendancePct({ ...AMY, status: answer, trainingTuesday: answer }), 0,
      `available+absent is ABSENT (${answer})`);
  }
  // And the aggregation never reads an availability field at all.
  const src = strip(extractFn(html, 'playerAttendancePct')) + strip(extractFn(html, 'attendanceStats'));
  for (const field of ['trainingTuesday', 'trainingThursday', 'sessionKey', 'resolvedAnswerFor',
                       'availabilityPct', '.history', '.game', '.status']) {
    assert.ok(!src.includes(field), `attendance must not read ${field}`);
  }
});

test('loading, unavailable, no-access and empty are four different reasons', () => {
  assert.equal(scope({ att: null }).attendanceUnknownReason(), 'Loading attendance…');
  assert.equal(scope({ att: null, failed: true }).attendanceUnknownReason(), 'Attendance unavailable');
  assert.equal(scope({ att: { denied: true, sessions: {} } }).attendanceUnknownReason(),
    'Attendance needs training access');
  assert.equal(scope({ sessions: {} }).attendanceUnknownReason(), 'No attendance recorded yet');
  // All four render as "—", and none of them as a number.
  for (const opts of [{ att: null }, { att: null, failed: true },
                      { att: { denied: true, sessions: {} } }, { sessions: {} }]) {
    const s = scope(opts);
    assert.equal(s.attendanceLabel(s.playerAttendancePct(AMY)), '—');
  }
});

// ═══════════════ PHASE 7 — IDENTITY AND GROUP ═════════════════════════════

test('a rename keeps the attendance — the name is never the key', () => {
  const sessions = { s1: sess('2026-08-04', { 'id:user_amy': 'present' }) };
  assert.equal(scope({ sessions }).playerAttendancePct(AMY), 100);
  assert.equal(scope({ sessions }).playerAttendancePct({ ...AMY, name: 'Amy Marchand' }), 100);
});

test('namesakes stay separate', () => {
  const s = scope({ sessions: { s1: sess('2026-08-04', {
    'id:user_amy': 'present', 'id:user_ben': 'absent' }) } });
  assert.equal(s.playerAttendancePct(AMY), 100);
  assert.equal(s.playerAttendancePct(BEN), 0, 'same display name, different record');
});

test('an unresolved identity fails closed — no name fallback', () => {
  const s = scope({ sessions: { s1: sess('2026-08-04', { 'id:user_amy': 'present' }) } });
  for (const bad of [{}, { name: 'Amy Stone' }, { id: '' }, { id: '', userId: '' }, { userId: '   ' }]) {
    assert.equal(s.playerAttendancePct(bad), null, JSON.stringify(bad));
  }
  assert.ok(!strip(extractFn(html, 'playerAttendancePct')).includes('name'),
    'the helper must not so much as mention a name');
});

test('group isolation is inherited, not re-implemented', () => {
  // currentAttendance() returns null whenever the loaded document belongs to a
  // different operating group, so Seniors figures can never appear under U18.
  // playerAttendancePct must go through it rather than reach past it.
  const src = strip(extractFn(html, 'playerAttendancePct'));
  assert.match(src, /currentAttendance\(\)/);
  assert.ok(!/_attendance\b/.test(src.replace(/_attendanceSelfKey/g, '')),
    'it must not read the raw cache and skip the group stamp');
  const cur = strip(extractFn(html, 'currentAttendance'));
  assert.match(cur, /_attendanceGroup !== gid/, 'the group stamp is what makes this safe');
  // A null document is the group-mismatch case, and it renders as unknown.
  const s = scope({ att: null });
  assert.equal(s.playerAttendancePct(AMY), null);
});

test('a self-scoped register answers only for its owner', () => {
  // The stored document carries a squad-mate's mark too — a stale copy, or one
  // day a server that projects differently. The device must refuse to read it
  // rather than rely on the payload being clean.
  const sessions = { s1: sess('2026-08-04', { 'id:user_amy': 'present', 'id:user_ben': 'absent' }) };
  const s = scope({ att: { scope: 'self', sessions }, selfKey: 'id:user_amy' });
  assert.equal(s.playerAttendancePct(AMY), 100);
  assert.equal(s.playerAttendancePct(BEN), null, 'a player device cannot answer about a squad-mate');
  // On a COACH's device the same document is the group's, and both resolve.
  const coach = scope({ sessions });
  assert.equal(coach.playerAttendancePct(AMY), 100);
  assert.equal(coach.playerAttendancePct(BEN), 0);
});

test('the device-local store can never supply an answer', () => {
  const src = strip(extractFn(html, 'playerAttendancePct'));
  assert.ok(!/state\.trainingAttendance|localStorage|state\.players/.test(src));
  assert.ok(!/player\??\.attendance/.test(src), 'and not the stale roster field either');
});

// ═══════════════ THE FABRICATED FIELD IS GONE FROM EVERY SURFACE ══════════

test('every former consumer now reads the recorded register, or shows nothing', () => {
  const script = strip(html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>')));
  assert.ok(!/\bplayerAttendanceValue\b/.test(script), 'the old field-reading helper is gone');
  assert.equal(script.split('function playerAttendancePct(').length - 1, 1, 'exactly one helper');
  assert.equal(html.split('function attendanceStats(').length - 1, 1, 'still exactly one aggregation');
  for (const forbidden of ['function playerAttendanceStats(', 'function attendancePercent(',
                           'function playerAttendanceRate(']) {
    assert.ok(!html.includes(forbidden), forbidden + ' must not exist');
  }

  // Each live surface, by name.
  const members = html.slice(html.indexOf('class="player-db-table"'), html.indexOf('</tbody>', html.indexOf('class="player-db-table"')));
  assert.ok(members.includes('playerAttendancePct(p)'), 'Members table');
  const v2 = extractFn(html, 'renderMessageCenterV2');
  assert.ok(v2.includes('playerAttendancePct(player)'), 'availability board chip');
  // The availability ROW model carries no attendance at all any more — it used
  // to copy `p.attendance` onto every row, dragging the fabricated figure into
  // every caller that only wanted to know who had replied.
  const rows = strip(extractFn(html, 'sessionRows'));
  assert.ok(!/attendance/i.test(rows), 'an availability row is about availability');
  const sort = strip(extractFn(html, 'sortAvailabilityRows'));
  assert.ok(sort.includes('playerAttendancePct(r.player)'), 'the sort resolves it itself');
  const popup = extractFn(html, 'openPlayerAvailabilityPopup');
  assert.ok(popup.includes('playerAttendancePct(player)'), 'player availability popup');
  const detailCard = extractFn(html, 'buildPlayerDetailHtml');
  assert.ok(detailCard.includes('playerAttendancePct(player)'), 'messaging player card');
});

test('the CSV exports write an empty cell, never a fabricated 0%', () => {
  for (const fn of ['exportAvailabilityCSV', 'exportMembersCSV']) {
    const src = strip(extractFn(html, fn));
    assert.ok(!/attendanceRate \|\| 0/.test(src), `${fn} still writes a measured-looking zero`);
    assert.ok(!/\(p\.attendance \|\| 0\)/.test(src), `${fn} still reads the stale field`);
    assert.match(src, /=== null \? ''/, `${fn} must leave the cell empty when there is no figure`);
  }
});

test('"Sort: Attendance" finally sorts by attendance, with the unknown last', () => {
  const src = strip(extractFn(html, 'sortAvailabilityRows'));
  assert.ok(!/attendanceRate/.test(src), 'the rate no longer rides on the row');
  const sortFn = new Function('RATES', `
    "use strict";
    const availabilityBoardSort = 'attendance';
    const availabilityPositionOrder = () => 0;
    const playerAttendancePct = p => RATES[p.name];
    ${extractFn(html, 'sortAvailabilityRows')}
    return sortAvailabilityRows;`)({ Zoe: 0, Ana: null, Bea: null, Cal: 40, Dan: 90 });
  const row = name => ({ player: { name }, status: 'available' });
  const out = sortFn([row('Zoe'), row('Ana'), row('Bea'), row('Cal'), row('Dan')]);
  // The names are chosen so that ranking "not recorded" as zero would sort Ana
  // and Bea AHEAD of Zoe's real 0% on the alphabetical tiebreak. It must not.
  assert.deepEqual(out.map(r => r.player.name), ['Dan', 'Cal', 'Zoe', 'Ana', 'Bea'],
    'highest first; a REAL 0% outranks "not recorded", which goes last');
});

test('the dead player attendance screen is gone, and stays gone', () => {
  // Proven unreachable before removal: its only occurrence in the file was its
  // own definition — no nav entry (playerSections), no render-registry entry,
  // no onclick, no dynamic call — and its sole job was to draw the fabricated
  // field. Both it and its hidden <section> are removed.
  assert.ok(!html.includes('renderPlayerAttendance'), 'the function is gone');
  assert.ok(!html.includes('player-attendance'), 'and its hidden section with it');
  // The player DOES have attendance — the Build F card on their Training page.
  assert.ok(html.includes('function myAttendanceCardHtml('), 'the real player card is untouched');
  assert.ok(html.includes('${myAttendanceCardHtml()}'), 'and still mounted on the Training page');
});

test('the legacy field survives in the data model, read by nobody', () => {
  // Deliberately not deleted: it is persisted in the roster blob, and removing
  // it would change a stored shape for no gain. What is removed is its standing
  // as an attendance value.
  assert.match(html, /attendance: 0,/, 'the creation paths are untouched — no migration');
  const merge = extractFn(html, 'mergeRosterMember');
  assert.match(merge, /merged\.attendance = Number\(preferred\.attendance/, 'the merge still preserves shape');
  assert.match(merge, /LEGACY FIELD, no longer read anywhere/, 'and says so');
});

test('attendance and availability stay in separate cards on the profile', () => {
  // The edit form's "Availability" card used to head itself with an attendance
  // bar. Regression pin: availability figures must not creep back in as
  // attendance, and the authoritative card keeps its own words.
  const i = html.indexOf('<!-- ATTENDANCE CARD');
  const card = strip(html.slice(i, html.indexOf('<!-- AVAILABILITY THIS WEEK', i)));
  const split = card.indexOf("sectionTitle('Availability answers')");
  assert.ok(split > 0, 'the two halves must still be distinguishable');
  const attHalf = card.slice(0, split);
  assert.ok(!/m\.trainingPct|m\.matchPct|m\.availabilityPct/.test(attHalf));
  assert.match(attHalf, /attendanceStats\(att\.sessions, playerMatchKey\(p\)/);
  assert.match(card, /not whether they came/);
});

test('every surface branches on NULL, never on falsiness — a real 0% must survive', () => {
  // `!att` and `att || 0` both swallow a genuine 0%: a player who was on four
  // registers and missed all four. Each surface that prints attendance must
  // test for the ABSENCE of an answer, not for a falsy number.
  const surfaces = {
    'buildPlayerDetailHtml':        extractFn(html, 'buildPlayerDetailHtml'),
    'openPlayerAvailabilityPopup':  extractFn(html, 'openPlayerAvailabilityPopup'),
    'renderMessageCenterV2':        extractFn(html, 'renderMessageCenterV2'),
    'exportAvailabilityCSV':        extractFn(html, 'exportAvailabilityCSV'),
    'exportMembersCSV':             extractFn(html, 'exportMembersCSV'),
  };
  for (const [name, src] of Object.entries(surfaces)) {
    const code = strip(src);
    const idx = code.indexOf('playerAttendancePct') >= 0 ? code.indexOf('playerAttendancePct')
                                                         : code.indexOf('attendanceStats');
    assert.ok(idx >= 0, `${name} must resolve attendance through the shared path`);
    assert.ok(!/playerAttendancePct\([^)]*\)\s*\|\|\s*0/.test(code), `${name} defaults a missing figure to 0`);
    assert.ok(!/!\s*attPct|!\s*att\b\s*\?[^:]*%/.test(code), `${name} tests falsiness where it means absence`);
    assert.match(code, /=== null/, `${name} must distinguish "no answer" from zero`);
  }
  // The Members table cell, which is markup rather than a function.
  const table = html.slice(html.indexOf('class="player-db-table"'), html.indexOf('</tbody>', html.indexOf('class="player-db-table"')));
  assert.match(table, /att === null/, 'the Members cell too');
  assert.ok(!/att \|\| 0/.test(table));

  // The player's own card (Build F) states the same rule in its own idiom: it
  // never reaches a percentage unless something was actually RECORDED, so a
  // genuine 0% is shown and an empty register says so in words.
  const mine = strip(extractFn(html, 'myAttendanceCardHtml'));
  assert.match(mine, /!stats\.recorded/, 'the player card gates on what was recorded');
  assert.ok(!/attendancePct \|\| 0|!pct/.test(mine), 'and never defaults the figure');
});

test('"no training access" is never a percentage, whatever the document holds', () => {
  // playerAttendancePct refuses a denied document outright. That guard is belt
  // and braces — loadAttendance only ever pairs `denied` with an EMPTY register
  // — so this pins the brace as well as the belt, since a mutation can only
  // tell them apart together.
  const s = scope({ att: { denied: true, sessions: {
    s1: sess('2026-08-04', { 'id:user_amy': 'present' }) } } });
  assert.equal(s.playerAttendancePct(AMY), null, 'a denied document answers nothing');
  assert.equal(s.attendanceUnknownReason(), 'Attendance needs training access');
  const load = strip(extractFn(html, 'loadAttendance'));
  assert.match(load, /_attendance = \{ denied: true, sessions: \{\} \}/,
    'and the loader never puts a register behind a denial');
});
