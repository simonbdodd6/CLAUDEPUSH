/**
 * INT2 — Performance must not weaken tenant isolation, and must not corrupt
 * existing production club state.
 *
 * Multi-group: a Seniors-scoped coach and a U18-scoped coach in one club.
 * State: old Core state, new Performance state, malformed state, identity
 * switch, club switch, and a stale-build round-trip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.perf-isolation.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const { operationalGroupsFor, resolveEligibility, effectiveAccessScope } = await import('../api/_accessScope.js');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  let start = html.indexOf('    function ' + name + '(');
  if (start === -1) start = html.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('missing ' + name);
  let i = start, d = 0, seen = false;
  while (i < html.length) {
    if (html[i] === '{') { d++; seen = true; }
    else if (html[i] === '}') { d--; if (seen && d === 0) return html.slice(start, i + 1); }
    i++;
  }
  throw new Error('unterminated ' + name);
}

// ── Multi-group isolation ───────────────────────────────────────────────────

const SENIORS = 'grp_seniors', U18 = 'grp_u18';
const structure = {
  version: 1, clubId: 'club-1', synthesized: false,
  groups: [
    { id: SENIORS, name: 'Seniors', type: 'general', developmentCategory: 'adult', status: 'active' },
    { id: U18, name: 'U18', type: 'general', developmentCategory: 'youth_u18', status: 'active' },
  ],
  teams: [
    { id: 'team_prem', groupId: SENIORS, name: 'Premier', status: 'active' },
    { id: 'team_u18a', groupId: U18, name: 'U18 A', status: 'active' },
  ],
};
const coach = (groupId) => ({
  id: 'tm-' + groupId, teamId: 'club-1', userId: 'u-' + groupId, role: 'coach', status: 'active',
  staffLevel: 'assistant', accessProfile: 'coach',
  accessScope: { clubWide: false, groups: [{ groupId, role: 'coach', status: 'active' }], teams: [] },
});
const player = (groupId) => ({
  id: 'tm-p-' + groupId, teamId: 'club-1', userId: 'p-' + groupId, role: 'player', status: 'active',
  playerGroupId: groupId,
});

test('1. Coach A (Seniors) and Coach B (U18) resolve to their own group only', () => {
  const a = operationalGroupsFor(coach(SENIORS), structure, { as: 'staff' }).map(g => g.id);
  const b = operationalGroupsFor(coach(U18), structure, { as: 'staff' }).map(g => g.id);
  assert.deepEqual(a, [SENIORS], 'Seniors coach sees Seniors only');
  assert.deepEqual(b, [U18], 'U18 coach sees U18 only');
  assert.ok(!a.includes(U18), 'Coach A must never see U18 athletes');
  assert.ok(!b.includes(SENIORS), 'Coach B must never see Senior athletes');
  assert.equal(effectiveAccessScope(coach(SENIORS)).clubWide, false);
});

test('2. an athlete resolves to exactly one group, and is eligible only inside it', () => {
  const groups = operationalGroupsFor(player(U18), structure, { as: 'player' }).map(g => g.id);
  assert.deepEqual(groups, [U18]);
  const { teamIds } = resolveEligibility(player(U18), structure);
  assert.deepEqual(teamIds, ['team_u18a'], 'no Senior team for a U18 player');
});

test('3. development category is per group — one club can hold both at once', () => {
  const byId = Object.fromEntries(structure.groups.map(g => [g.id, g.developmentCategory]));
  assert.equal(byId[SENIORS], 'adult');
  assert.equal(byId[U18], 'youth_u18');
  const seen = operationalGroupsFor(coach(U18), structure, { as: 'staff' }).map(g => g.developmentCategory);
  assert.deepEqual(seen, ['youth_u18'], 'a scoped coach only ever resolves their own classification');
});

test('4. NO Performance surface reads the club-wide roster', () => {
  const names = [...html.matchAll(/\n    (?:async )?function (perf[A-Za-z0-9_]*|renderPerformance)\(/g)].map(m => m[1]);
  assert.ok(names.length > 100, 'sanity: found the Performance surface (' + names.length + ' functions)');
  // Comments may NAME the banned reads (they document why we avoid them);
  // executable code may not. Strip line comments before checking.
  const source = names.map(extractFn).join('\n')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  for (const banned of ['state.players', 'canonicalVisiblePlayers', '_adminData.members', 'state.medicalRecords']) {
    assert.equal(source.split(banned).length - 1, 0,
      `Performance must not read ${banned} — club-wide data would cross group boundaries`);
  }
});

test('5. the Athletes screen reads SERVER-SCOPED athletes, never the club roster', () => {
  // SC8 wires this screen to real data — but only through the server, which
  // filters by the caller's own operational scope. The old sample fixture is
  // gone; what replaced it is stricter, not looser.
  const athletes = extractFn('perfAthletesHtml');
  // The screen reads the ONE shared scoping helper, which narrows the scoped
  // server payload to the group being viewed. Both halves are pinned: the
  // helper is what the screen calls, and the helper's only source is the
  // server payload — never the club-wide roster.
  assert.match(athletes, /perfScopedAthletes\(\)/, 'athletes come through the shared scoping helper');
  const scoped = extractFn('perfScopedAthletes');
  assert.match(scoped, /_perfAssign\.athletes/, 'and that helper reads the scoped server payload');
  assert.match(scoped, /state\.operationalGroupId/, 'narrowed by the selected operational group');
  assert.ok(!/PERF_SAMPLE_ATHLETES/.test(athletes), 'sample data no longer backs the real view');
  const code = athletes.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/state\.players/.test(code), 'the club-wide roster is never read');
  assert.ok(!/canonicalVisiblePlayers/.test(code));
});

test('6. when a roster IS wired later, Core\'s scoped accessor is the only safe source', () => {
  // operationalPlayers() fails closed while group access data loads — the
  // property that makes it, and not state.players, the correct source.
  const scoped = extractFn('operationalPlayers');
  assert.match(scoped, /_adminData\.loaded/, 'fails closed while access data is pending');
  assert.match(scoped, /return \[\]/);
});

// ── State compatibility ─────────────────────────────────────────────────────

function normalizeScope() {
  const mirrors = ['perfInitialProfileState', 'perfNormalizeProfile', 'perfNormalizeProfileState',
                   'perfNormalizeLibraryState', 'perfNormalizeWorkoutState'].map(extractFn).join('\n');
  const consts = ['PERF_PROFILE_STATE_VERSION', 'PERF_LIBRARY_STATE_VERSION', 'PERF_WORKOUT_STATE_VERSION',
                  'PERF_WELLNESS_LOG_MAX', 'PERF_HISTORY_MAX', 'PERF_OB_STEPS', 'PERF_LIB_RECENT_MAX']
    .map(n => { const m = html.match(new RegExp('const ' + n + ' = [^;]+;')); return m ? m[0] : ''; })
    .filter(Boolean).join('\n');
  const body = `"use strict";
    ${consts}
    ${mirrors}
    return { perfNormalizeProfileState, perfNormalizeLibraryState, perfNormalizeWorkoutState };`;
  return new Function(body)();
}

test('A. old Core state with no Performance keys loads to safe defaults', () => {
  const n = normalizeScope();
  assert.equal(n.perfNormalizeWorkoutState(undefined).active, null);
  assert.deepEqual(n.perfNormalizeWorkoutState(undefined).history, []);
  // and index.html only normalises when a value is actually present
  assert.match(html, /next\.performanceProfile = input\.performanceProfile == null \? null : perfNormalizeProfileState/);
  assert.match(html, /next\.performanceWorkout = input\.performanceWorkout == null \? null : perfNormalizeWorkoutState/);
  assert.match(html, /next\.performanceLibrary = input\.performanceLibrary == null \? null : perfNormalizeLibraryState/);
});

test('B. valid Performance state survives a save/load round-trip unchanged', () => {
  const n = normalizeScope();
  const workout = {
    stateVersion: 1, active: null,
    history: [{ kind: 'workout_session', workoutSessionId: 'w1', completedAt: '2026-08-20T10:00:00.000Z', exerciseLogs: [] }],
    syncQueue: ['w1'], syncStatus: 'pending',
  };
  const out = n.perfNormalizeWorkoutState(JSON.parse(JSON.stringify(workout)));
  assert.equal(out.history.length, 1);
  assert.equal(out.history[0].workoutSessionId, 'w1');
  assert.equal(out.syncStatus, 'pending', 'never silently upgraded to synced');
});

test('C. malformed Performance state fails safe instead of corrupting the app', () => {
  const n = normalizeScope();
  for (const bad of [null, 'junk', 7, [], { stateVersion: 'x' }, { stateVersion: 99 }, { stateVersion: 1, active: 'nope', history: 'nope' }]) {
    const w = n.perfNormalizeWorkoutState(bad);
    assert.equal(w.active, null); assert.deepEqual(w.history, []); assert.equal(w.stateVersion, 1);
    assert.equal(n.perfNormalizeProfileState(bad).profile ?? null, null);
    assert.ok(Array.isArray(n.perfNormalizeLibraryState(bad).favourites));
  }
});

test('D. identity switch leaves nothing person-scoped behind', () => {
  const body = `"use strict";
    let _chatConversations, _chatLastPoll, _chatFeedPaintedFor, _groupRecipients,
        _trainingSchedule, _trainingScheduleAttempted, _trainingScheduleQueue,
        _trainingScheduleGroupId, _myPlatformRole,
        // Group context (added with the Player Home isolation fix) and the
        // server-scoped Performance payload: both are identity-scoped and both
        // are cleared by the real function, so the harness must declare them.
        _myOperational, _perfAssign;
    function chatSetUnreadTotal() {}
    ${extractFn('resetIdentityScopedState')}
    _perfAssign = { loaded: true, athletes: [{ userId: 'other-coachs-athlete' }],
                    programmes: [{ programmeId: 'pg-1' }], assignments: [{ assignmentId: 'pa-1' }] };
    _myOperational = { staff: { groups: [{ id: 'grp_seniors' }] } };
    resetIdentityScopedState();
    return { state, perfAssign: _perfAssign, myOperational: _myOperational };`;
  const out = new Function('state', body)({
    performanceProfile: { profile: {} }, performanceLibrary: { favourites: ['x'] },
    performanceWorkout: { stateVersion: 1, active: { workoutSessionId: 'w' }, history: [{}] },
    performanceSettings: { units: 'kg' },
  });
  const after = out.state;
  assert.equal(after.performanceProfile, null);
  assert.equal(after.performanceLibrary, null);
  assert.equal(after.performanceWorkout, null);
  assert.ok(after.performanceSettings, 'device preference kept');
  // The SERVER-scoped coach payload is identity-scoped too: the next person on
  // a shared device must not inherit the previous coach's athlete list.
  assert.equal(out.perfAssign.loaded, false, 'the Performance payload is marked unloaded');
  assert.deepEqual(out.perfAssign.athletes, [], 'no athlete survives the identity switch');
  assert.deepEqual(out.perfAssign.programmes, [], 'no programme survives');
  assert.deepEqual(out.perfAssign.assignments, [], 'no assignment survives');
  assert.equal(out.myOperational, null, 'and the group context is cleared with it');
  assert.equal(after.operationalGroupId, null);
});

test('E. club switch clears club-derived workout context', () => {
  const body = `"use strict";
    const defaultState = { matchCentre: {}, schedule: [], trainingBlocks: {} };
    function saveState() {}
    ${extractFn('resetTeamScopedState')}
    resetTeamScopedState(); return state;`;
  const after = new Function('state', 'structuredClone', body)({
    performanceWorkout: { stateVersion: 1, active: null, history: [{}] },
    performanceProfile: { profile: {} },
  }, structuredClone);
  assert.equal(after.performanceWorkout, null);
  assert.ok(after.performanceProfile, 'the athlete keeps their own profile across clubs');
});

test('F. a stale build round-trips Performance state without destroying it', () => {
  // Core's normalizeState spreads INPUT over defaults, so an older bundle that
  // has never heard of these keys preserves and rewrites them untouched.
  const norm = extractFn('normalizeState');
  assert.match(norm, /\{ \.\.\.structuredClone\(defaultState\), \.\.\.input \}/,
    'unknown namespaces survive an older build');
  // Each Performance sub-state carries its own version so a shape change is
  // detectable rather than silently mis-read.
  assert.match(html, /stateVersion: 1/);
  const w = normalizeScope().perfNormalizeWorkoutState({ stateVersion: 99, active: { kind: 'workout_session', workoutSessionId: 'x', exerciseLogs: [] }, history: [] });
  assert.equal(w.active, null, 'state from a NEWER build is not misinterpreted by this one');
});

test('G. Performance state never rides the roster sync to the server', () => {
  const sync = extractFn('rosterFingerprint') + extractFn('queueRosterSync');
  for (const k of ['performanceProfile', 'performanceWorkout', 'performanceLibrary']) {
    assert.ok(!sync.includes(k), k + ' must not be uploaded with the roster');
  }
  assert.ok(!/state\.players\[[^\]]*\]\.performance/.test(html), 'no per-athlete Performance data on roster rows');
});
