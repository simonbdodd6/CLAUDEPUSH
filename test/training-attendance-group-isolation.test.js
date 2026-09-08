/**
 * TRAINING ATTENDANCE — the register lists the training group's players, and
 * NOBODY else (production bug: Seniors players appeared under the U18 planner).
 *
 * The planner shows the group stamped on the live training state
 * (trainingStateGroupId). Its attendance population used operationalPlayers(),
 * which keys on operationalGroupId — a value that is re-resolved to a
 * default/null on load while trainingStateGroupId is persisted — and which
 * fails OPEN to the whole club when its group is unresolved or the membership
 * list has not yet loaded its groups. Either divergence surfaced another
 * group's players in the register.
 *
 * trainingAttendancePlayers() fixes this: it follows the planner's own group
 * (validated against the groups the identity operates) and fails CLOSED — a
 * grouped club never widens to the whole roster; a genuine groupless club keeps
 * its single register. These pin that against the REAL extracted client code.
 *
 * Availability vs attendance is untouched here: this is purely WHO the register
 * lists, never whether anyone is present.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(name) {
  const start = html.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = html.indexOf('(', start), paren = 0;
  for (; i < html.length; i++) { if (html[i] === '(') paren++; else if (html[i] === ')') { paren--; if (!paren) { i++; break; } } }
  let depth = 0;
  for (let k = html.indexOf('{', i); k < html.length; k++) { if (html[k] === '{') depth++; else if (html[k] === '}') { depth--; if (!depth) return html.slice(start, k + 1); } }
  throw new Error('no closing brace for ' + name);
}

const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_wom';
const PLAYERS = [
  { id: 's1', userId: 'us1', name: 'Sen One' }, { id: 's2', userId: 'us2', name: 'Sen Two' },
  { id: 'u1', userId: 'uu1', name: 'U18 One' }, { id: 'u2', userId: 'uu2', name: 'U18 Two' }, { id: 'u3', userId: 'uu3', name: 'U18 Three' },
  { id: 'w1', userId: 'uw1', name: 'Wom One' },
];
const MEMBERS = [
  { userId: 'us1', status: 'active', role: 'player', playerGroupId: SEN }, { userId: 'us2', status: 'active', role: 'player', playerGroupId: SEN },
  { userId: 'uu1', status: 'active', role: 'player', playerGroupId: U18 }, { userId: 'uu2', status: 'active', role: 'player', playerGroupId: U18 }, { userId: 'uu3', status: 'active', role: 'player', playerGroupId: U18 },
  { userId: 'uw1', status: 'active', role: 'player', playerGroupId: WOM },
];
const OPERABLE = [{ id: SEN, name: 'Seniors' }, { id: U18, name: 'U18' }, { id: WOM, name: "Women's" }];

function attendancePopulation({
  operationalGroupId = null, trainingStateGroupId = null,
  operationalGroups = OPERABLE, members = MEMBERS, adminLoaded = true, players = PLAYERS,
} = {}) {
  const body = `
    "use strict";
    const state = { players: ${JSON.stringify(players)}, users: [],
      operationalGroupId: ${JSON.stringify(operationalGroupId)},
      trainingStateGroupId: ${JSON.stringify(trainingStateGroupId)} };
    const _adminData = { loaded: ${adminLoaded}, members: ${JSON.stringify(members)} };
    const _chatStateModule = null;
    function canI() { return true; }
    function dedupeRosterMembers(p) { return p; }
    function ensureAdminData() {}
    function operationalGroups() { return ${JSON.stringify(operationalGroups)}; }
    ${extractFn('clubUsesPlayerGroups')}
    ${extractFn('playerGroupIdOf')}
    ${extractFn('canonicalVisiblePlayers')}
    ${extractFn('trainingContextGroupId')}
    ${extractFn('trainingAttendancePlayers')}
    return { pop: trainingAttendancePlayers().map(p => p.name), gid: trainingContextGroupId() };
  `;
  return new Function(body)();
}
const names = r => r.pop.sort();
const hasSeniors = r => r.pop.some(n => n.startsWith('Sen'));

// ── THE BUG: Seniors under the U18 planner ──────────────────────────────────

test('U18 attendance population contains U18 players only (aligned context)', () => {
  const r = attendancePopulation({ operationalGroupId: U18, trainingStateGroupId: U18 });
  assert.deepEqual(names(r), ['U18 One', 'U18 Three', 'U18 Two']);
  assert.equal(hasSeniors(r), false);
});

test('Seniors players cannot appear in U18 attendance even when operationalGroupId lags on Seniors', () => {
  // The planner shows U18 (trainingStateGroupId), operationalGroupId still on Seniors.
  const r = attendancePopulation({ operationalGroupId: SEN, trainingStateGroupId: U18 });
  assert.deepEqual(names(r), ['U18 One', 'U18 Three', 'U18 Two'], 'follows the planner group, not operationalGroupId');
  assert.equal(hasSeniors(r), false);
});

test('Seniors players cannot appear when operationalGroupId is null after a reload', () => {
  const r = attendancePopulation({ operationalGroupId: null, trainingStateGroupId: U18 });
  assert.deepEqual(names(r), ['U18 One', 'U18 Three', 'U18 Two']);
  assert.equal(hasSeniors(r), false);
});

test('Seniors attendance population contains Seniors players only', () => {
  const r = attendancePopulation({ operationalGroupId: SEN, trainingStateGroupId: SEN });
  assert.deepEqual(names(r), ['Sen One', 'Sen Two']);
  assert.equal(r.pop.some(n => n.startsWith('U18') || n.startsWith('Wom')), false);
});

// ── Group switching refreshes the population ────────────────────────────────

test('switching Seniors → U18 → Seniors refreshes the population each time, no stale players', () => {
  assert.deepEqual(names(attendancePopulation({ operationalGroupId: SEN, trainingStateGroupId: SEN })), ['Sen One', 'Sen Two']);
  assert.deepEqual(names(attendancePopulation({ operationalGroupId: U18, trainingStateGroupId: U18 })), ['U18 One', 'U18 Three', 'U18 Two']);
  assert.deepEqual(names(attendancePopulation({ operationalGroupId: SEN, trainingStateGroupId: SEN })), ['Sen One', 'Sen Two']);
});

test('switching U18 → Women\'s shows Women\'s only (no U18, no Seniors)', () => {
  const r = attendancePopulation({ operationalGroupId: WOM, trainingStateGroupId: WOM });
  assert.deepEqual(names(r), ['Wom One']);
});

// ── FAIL CLOSED — never widen to the whole club ─────────────────────────────

test('a grouped club whose memberships have not loaded their groups yet fails CLOSED, not to the whole club', () => {
  // clubUsesPlayerGroups() reads false (no member carries a group), but the
  // identity operates real groups — so the register must be empty, never the club.
  const noGroupMembers = MEMBERS.map(m => ({ ...m, playerGroupId: undefined }));
  const r = attendancePopulation({ operationalGroupId: U18, trainingStateGroupId: U18, members: noGroupMembers });
  assert.deepEqual(r.pop, [], 'empty, not the whole club');
  assert.equal(hasSeniors(r), false);
});

test('before admin data loads, a grouped context yields an empty register (fail closed)', () => {
  const r = attendancePopulation({ operationalGroupId: U18, trainingStateGroupId: U18, adminLoaded: false, members: [] });
  assert.deepEqual(r.pop, []);
});

test('a grouped club with no group in force lists nobody — never the whole club', () => {
  const r = attendancePopulation({ operationalGroupId: null, trainingStateGroupId: null });
  assert.deepEqual(r.pop, [], 'no group chosen → empty, not every group at once');
});

// ── Scope validation + legacy ───────────────────────────────────────────────

test('a trainingStateGroupId the coach cannot operate is ignored (never widens scope)', () => {
  // operable = [Seniors] only, but the persisted training group names U18.
  const r = attendancePopulation({ operationalGroupId: SEN, trainingStateGroupId: U18, operationalGroups: [{ id: SEN, name: 'Seniors' }] });
  assert.deepEqual(names(r), ['Sen One', 'Sen Two'], 'falls back to the operable operational group, not the unauthorised U18');
});

test('a genuine club with NO groups at all keeps its single whole-roster register', () => {
  const noGroupMembers = MEMBERS.map(m => ({ ...m, playerGroupId: undefined }));
  const r = attendancePopulation({ operationalGroupId: null, trainingStateGroupId: null, operationalGroups: [], members: noGroupMembers });
  assert.equal(r.pop.length, PLAYERS.length, 'the whole roster — there is only one group');
});

// ── Availability is not attendance (contract guard) ─────────────────────────

test('trainingAttendancePlayers decides only WHO is listed, never their attendance state', () => {
  const src = extractFn('trainingAttendancePlayers');
  assert.equal(/present|absent|available|unavailable|attendanceMark|resolvedAnswerFor/i.test(src), false,
    'the population helper holds no attendance or availability opinion');
});
