/**
 * ATTENDANCE + SEASON MATCH STATS V1 (ATTENDANCE-MATCH-STATS-V1-1).
 *
 * The recording foundations (attendance register, match participation via
 * substitutions, seasonPlayerStats) already exist, are server-authoritative,
 * group-isolated, and covered by their own suites. This build adds three
 * things and these tests pin them:
 *   1. the CURRENT-SEASON window is refused when start > end (client + server),
 *      because a reversed window silently blanks every season-scoped stat;
 *   2. a PLAYER self-view of their own current-season attendance
 *      (playerSelfAttendanceStats) — self-scoped, honest "—", never fabricated;
 *   3. a coach CURRENT-SEASON attendance+stats CSV export that reuses the ONE
 *      aggregation and never fabricates a 0% for unknown attendance.
 *
 * Availability is never read here (attendance ≠ availability); a selected bench
 * player is never an appearance (that invariant lives in the existing
 * season-player-stats suite and is only relied on, not re-implemented).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pub  = readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

// ── 1. SEASON WINDOW: start > end is refused ────────────────────────────────

function runSaveSeason({ start, end }) {
  const calls = { toast: [], save: [], saveState: 0, state: {} };
  const body =
    '"use strict";\n' +
    'const CALLS = arguments[0], START = arguments[1], END = arguments[2];\n' +
    'const state = CALLS.state;\n' +
    'const document = { getElementById: id => ({ value: id === "set-season-start" ? START : END }) };\n' +
    'function showToast(m){ CALLS.toast.push(m); }\n' +
    'function saveState(){ CALLS.saveState++; }\n' +
    'function saveClubConfigToServer(x){ CALLS.save.push(x); return Promise.resolve(true); }\n' +
    fn('settingsSaveSeason') + '\n' +
    'settingsSaveSeason();\n' +
    'return CALLS;';
  return new Function(body)(calls, start, end);
}

test('CLIENT: a reversed season window (start after end) is refused — nothing saved', () => {
  const r = runSaveSeason({ start: '2027-06-30', end: '2026-08-01' });
  assert.ok(r.toast.some(t => /on or before/i.test(t)), 'the coach is told why');
  assert.equal(r.save.length, 0, 'no server write');
  assert.equal(r.saveState, 0, 'no local persist');
  assert.equal(r.state.seasonStart, undefined, 'the stored dates are untouched');
});

test('CLIENT: a valid window (start ≤ end) saves through the club config, with "Current season" feedback', () => {
  const r = runSaveSeason({ start: '2026-08-01', end: '2027-06-30' });
  assert.equal(r.save.length, 1, 'one server write');
  assert.deepEqual(r.save[0], { seasonStart: '2026-08-01', seasonEnd: '2027-06-30' });
  assert.equal(r.state.seasonStart, '2026-08-01');
  assert.equal(r.state.seasonEnd, '2027-06-30');
});

test('CLIENT: a single open-ended date is allowed (unconfigured season stays honest)', () => {
  const r = runSaveSeason({ start: '2026-08-01', end: '' });
  assert.equal(r.save.length, 1, 'saved — one bound is not a reversed window');
});

test('SERVER: clubHandler refuses a reversed season window with 400 (source contract)', () => {
  assert.match(pub, /if \(club\.seasonStart && club\.seasonEnd && club\.seasonStart > club\.seasonEnd\)/,
    'the start≤end guard exists');
  assert.match(pub, /Season start must be on or before season end/, 'and answers 400 with a clear message');
  // The guard runs BEFORE the record is written (kvGet(clubKey) / record build).
  const guardAt = pub.indexOf('Season start must be on or before season end');
  const writeAt = pub.indexOf('const existing = (await kvGet(clubKey(session.teamId)))', guardAt - 400);
  assert.ok(writeAt > guardAt, 'the guard short-circuits before the club record is assembled/written');
});

test('SERVER: the club write still requires MANAGE_TEAMS (unchanged)', () => {
  assert.match(pub, /requireTenantPermission\(req, PERM\.MANAGE_TEAMS\)/, 'club config write stays MANAGE_TEAMS');
});

// ── 2. PLAYER SELF-VIEW: own attendance only, self-scoped, honest null ───────

function makeSelfEnv({ scope, selfKey, sessions, held, denied = false, matchKey = 'id:u1' } = {}) {
  const body =
    '"use strict";\n' +
    'const CFG = arguments[0];\n' +
    'const state = { seasonStart: "2026-08-01", seasonEnd: "2027-06-30" };\n' +
    'let _attendanceSelfKey = CFG.selfKey || "";\n' +
    'function currentAttendance(){ return CFG.denied ? { denied: true } : (CFG.sessions === null ? null : { scope: CFG.scope, sessions: CFG.sessions, held: CFG.held }); }\n' +
    'function playerMatchKey(){ return CFG.matchKey; }\n' +
    'function availToday(){ return "2026-09-15"; }\n' +
    'function attendanceFailed(){ return false; }\n' +
    'function attendanceOccurrenceId(sid){ return sid; }\n' +   // already-dated ids pass through
    fn('availWeekStart') + '\n' + fn('availAddDays') + '\n' +
    fn('attendanceHeldSessions') + '\n' + fn('attendanceStats') + '\n' +
    fn('attendanceUnknownReason') + '\n' +
    fn('playerSelfAttendanceStats') + '\n' +
    'return playerSelfAttendanceStats({ id: "p1", userId: "u1" });';
  return new Function(body)({ scope, selfKey, sessions, held, denied, matchKey });
}

test('SELF-VIEW: a player reads their OWN self-scoped attendance (rate + present/held)', () => {
  const sessions = {
    'slot_tue-20260901': { date: '2026-09-01', marks: { 'id:u1': 'present' } },
    'slot_thu-20260903': { date: '2026-09-03', marks: { 'id:u1': 'absent' } },
    'slot_tue-20260908': { date: '2026-09-08', marks: { 'id:u1': 'present' } },
  };
  const r = makeSelfEnv({ scope: 'self', selfKey: 'id:u1', sessions, held: 3 });
  assert.equal(r.present, 2);
  assert.equal(r.absent, 1);
  assert.equal(r.held, 3);
  assert.equal(r.pct, 67, 'present ÷ held (2/3), never present ÷ recorded');
  assert.equal(r.reason, '');
});

test('SELF-VIEW: a self register that is not THIS player\'s key claims nothing (never reads another record)', () => {
  const r = makeSelfEnv({ scope: 'self', selfKey: 'id:OTHER', sessions: {}, held: 0 });
  assert.equal(r.pct, null);
  assert.equal(r.reason, 'No attendance recorded yet');
});

test('SELF-VIEW: no register / denied access yields an honest reason, never a fabricated 0%', () => {
  assert.equal(makeSelfEnv({ sessions: null }).pct, null);
  assert.equal(makeSelfEnv({ denied: true }).pct, null);
  assert.ok(/access/i.test(makeSelfEnv({ denied: true }).reason));
});

test('SELF-VIEW: an empty held denominator answers null (unknown rate), not 0%', () => {
  const r = makeSelfEnv({ scope: 'self', selfKey: 'id:u1', sessions: {}, held: 0 });
  assert.equal(r.pct, null);
});

test('SOURCE: playerSelfAttendanceStats reuses playerAttendancePct\'s guards and reads NO availability', () => {
  const src = fn('playerSelfAttendanceStats');
  assert.match(src, /att\.scope === 'self' && key !== _attendanceSelfKey/, 'the self-key guard is present');
  assert.ok(!/availability|resolvedAnswerFor|sessionRows|playerAvailabilityWeek/.test(src),
    'attendance never reads availability');
  // The player home card consumes it, and does NOT try to read squad-gated appearances.
  const home = fn('renderPlayerHome');
  assert.match(home, /playerSelfAttendanceStats\(player\)/, 'the card uses the self helper');
  assert.ok(!/seasonPlayerStats|currentSeasonSheets|resource=season-sheets/.test(home),
    'the player home never reads the squad-publishing-gated season sheets');
});

// ── 3. SEASON STATS CSV EXPORT ──────────────────────────────────────────────

function runExport({ rows, attByKey = {}, isCoach = true, seasonStart = '2026-08-01', seasonEnd = '2027-06-30' } = {}) {
  const calls = { toast: [], csv: null, download: '' };
  const body =
    '"use strict";\n' +
    'const CALLS = arguments[0], ROWS = arguments[1], ATT = arguments[2], IS_COACH = arguments[3], SS = arguments[4], SE = arguments[5];\n' +
    'const state = { clubName: "Boitsfort", seasonStart: SS, seasonEnd: SE };\n' +
    'function isCoach(){ return IS_COACH; }\n' +
    'function showToast(m){ CALLS.toast.push(m); }\n' +
    'function currentSeasonSheets(){ return { sheets: [{}] }; }\n' +
    'function seasonPlayerStats(){ return { byPlayer: {} }; }\n' +
    'function operationalPlayers(){ return []; }\n' +
    'function seasonTableRows(){ return { rows: ROWS, offSquad: 0 }; }\n' +
    'function currentAttendance(){ return { scope: "group", sessions: {} }; }\n' +
    'function attendanceStats(_s, key){ const a = ATT[key] || { attendancePct: null, present: 0, held: 0 }; return a; }\n' +
    'function availToday(){ return "2026-09-15"; }\n' +
    'const URL = { createObjectURL: () => "blob:x" };\n' +
    'function Blob(parts){ CALLS.csv = parts.join(""); }\n' +
    'const document = { createElement: () => ({ set href(v){}, set download(v){ CALLS.download = v; }, click(){} }) };\n' +
    fn('exportSeasonStatsCSV') + '\n' +
    'exportSeasonStatsCSV();\n' +
    'return CALLS;';
  return new Function(body)(calls, rows, attByKey, isCoach, seasonStart, seasonEnd);
}

test('EXPORT: header + one row per player, from the ONE aggregation (season sheets + attendance)', () => {
  const rows = [{ key: 'id:u1', name: 'Alex', position: 'Prop', appearances: 5, starts: 4,
    benchAppearances: 1, subsOn: 1, subsOff: 2, minutes: 320, playingTimePct: 72 }];
  const att = { 'id:u1': { attendancePct: 80, present: 8, held: 10 } };
  const r = runExport({ rows, attByKey: att });
  const lines = r.csv.split('\n');
  assert.match(lines[0], /Player","Position","Attendance %","Sessions present","Sessions held","Appearances","Starts","Bench","Subs on","Subs off","Minutes","Playing time %/);
  assert.match(lines[1], /"Alex","Prop","80%","8","10","5","4","1","1","2","320","72%"/);
  assert.match(r.download, /boitsfort-season-stats-2026-08-01-to-2027-06-30\.csv/);
  assert.ok(r.toast.some(t => /1 players exported/.test(t)));
});

test('EXPORT: unknown attendance is BLANK, never a fabricated 0%', () => {
  const rows = [{ key: 'id:u2', name: 'Sam', position: 'Wing', appearances: 0, starts: 0,
    benchAppearances: 0, subsOn: 0, subsOff: 0, minutes: 0, playingTimePct: 0 }];
  const att = { 'id:u2': { attendancePct: null, present: 0, held: 0 } };
  const r = runExport({ rows, attByKey: att });
  const cells = r.csv.split('\n')[1].split(',');
  assert.equal(cells[2], '""', 'attendance % blank when unknown — not "0%"');
});

test('EXPORT: a non-coach is refused and nothing is written', () => {
  const r = runExport({ rows: [{ key: 'id:u1', name: 'A' }], isCoach: false });
  assert.equal(r.csv, null, 'no CSV built');
  assert.ok(r.toast.some(t => /coach access/i.test(t)));
});

test('EXPORT: no players → honest message, no download', () => {
  const r = runExport({ rows: [] });
  assert.equal(r.csv, null);
  assert.ok(r.toast.some(t => /no players/i.test(t)));
});

test('SOURCE: export is wired into the season stats view and reuses seasonPlayerStats (no 2nd engine)', () => {
  assert.match(html, /onclick="exportSeasonStatsCSV\(\)"/, 'the Export CSV button exists in the season view');
  const src = fn('exportSeasonStatsCSV');
  assert.match(src, /seasonPlayerStats\(season\.sheets\)/, 'reuses the ONE aggregation');
  assert.match(src, /seasonTableRows\(operationalPlayers\(\), stats\)/, 'and the same roster join the on-screen table uses');
  assert.match(src, /state\.seasonStart, state\.seasonEnd/, 'season-windowed');
});
