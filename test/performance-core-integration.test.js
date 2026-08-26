/**
 * INT2 — Performance ↔ Core integration contracts.
 *
 * Covers the three integration corrections and the athlete route:
 *   1. Person-scoped Performance state dies with the identity (shared devices).
 *   2. The SC7 demo assignment never masquerades as a real coach assignment.
 *   3. A locked premium section is not offered as a dead end under the Beta
 *      no-commercial policy — without nav hiding ever replacing route gating.
 *   4. An entitled ATHLETE reaches their own Performance experience, and only
 *      their own.
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
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let d = 0;
  while (i < source.length) { if (source[i] === '(') d++; if (source[i] === ')') { d--; if (d === 0) { i++; break; } } i++; }
  while (i < source.length && source[i] !== '{') i++;
  d = 0;
  while (i < source.length) { if (source[i] === '{') d++; if (source[i] === '}') { d--; if (d === 0) { i++; break; } } i++; }
  return source.slice(start, i);
}
const constLiteral = (name) => html.match(new RegExp('const ' + name + ' = (\\[[^\\]]*\\]|\\{[^}]*\\});'))[1];

// ── 1. Identity-scoped Performance reset (shared-device privacy) ─────────────

/** Player A's device: profile with wellness log, history, an ACTIVE workout. */
function playerAState() {
  return {
    currentUserId: 'user-A',
    performanceProfile: { stateVersion: 1, profile: { trainingAge: 'developing' }, wellnessLog: [{ date: '2026-08-20', sleep: 2 }] },
    performanceLibrary: { favourites: ['ex-back-squat'], recent: ['ex-db-bench'] },
    performanceWorkout: {
      stateVersion: 1,
      active: { kind: 'workout_session', workoutSessionId: 'w-A-1', athleteId: 'user-A', exerciseLogs: [] },
      history: [{ kind: 'workout_session', workoutSessionId: 'w-A-0', completedAt: '2026-08-19T10:00:00.000Z', exerciseLogs: [] }],
      syncQueue: ['w-A-0'], syncStatus: 'pending',
    },
    performanceSettings: { units: 'lb', weekStart: 'Sun', readinessCheckins: true, pbCelebrations: true, showBodyweight: true },
    selectedPlayerId: 'p-A', selectedPlayerOwnerId: 'user-A', selectedMessagePlayerId: '', selectedChatId: 'coach', messages: [{ id: 1 }],
  };
}

function runIdentityReset(state) {
  const body = `"use strict";
    let _chatConversations, _chatLastPoll, _chatFeedPaintedFor, _groupRecipients,
        _trainingSchedule, _trainingScheduleAttempted, _trainingScheduleQueue,
        _trainingScheduleGroupId, _myPlatformRole,
        // Group context (added with the Player Home isolation fix), the
        // server-scoped Performance payload, and the platform-administrator
        // list: all identity-scoped, all cleared by the real function, so the
        // harness must declare them.
        _myOperational, _perfAssign, _platformAdmins;
    function chatSetUnreadTotal() {}
    ${extractFn(html, 'resetIdentityScopedState')}
    resetIdentityScopedState();
    return state;`;
  return new Function('state', body)(state);
}

test('1. identity switch removes Player A\'s profile, history and active workout', () => {
  const after = runIdentityReset(playerAState());
  assert.equal(after.performanceProfile, null, 'athlete profile (incl. wellness log) must not survive');
  assert.equal(after.performanceWorkout, null, 'workout history and active session must not survive');
  assert.equal(after.performanceLibrary, null, 'favourites/recent are one athlete\'s curation');
});

test('2. Player B then boots on safe defaults — and cannot resume A\'s workout', () => {
  const after = runIdentityReset(playerAState());
  const normalize = new Function('return ' + extractFn(html, 'perfNormalizeWorkoutState').replace('function perfNormalizeWorkoutState', 'function '))();
  const fresh = normalize(after.performanceWorkout);
  assert.equal(fresh.active, null, 'no stale active session for the next athlete');
  assert.deepEqual(fresh.history, [], 'no inherited history');
  assert.equal(fresh.syncStatus, 'device');
  assert.deepEqual(fresh.syncQueue, []);
});

test('3. device display preferences are deliberately kept, not indiscriminately erased', () => {
  const after = runIdentityReset(playerAState());
  assert.deepEqual(after.performanceSettings, playerAState().performanceSettings,
    'units/week-start are a device preference, not personal data');
});

test('4. club/team switch clears workout context but keeps the athlete\'s own profile', () => {
  const state = playerAState();
  state.matchCentre = {}; state.schedule = []; state.trainingBlocks = {};
  const body = `"use strict";
    const defaultState = { matchCentre: {}, schedule: [], trainingBlocks: {} };
    function saveState() {}
    ${extractFn(html, 'resetTeamScopedState')}
    resetTeamScopedState();
    return state;`;
  const after = new Function('state', 'structuredClone', body)(state, structuredClone);
  assert.equal(after.performanceWorkout, null, 'another club must not inherit sessions or programme titles');
  assert.ok(after.performanceProfile, 'the athlete\'s own body/training data follows the person, not the club');
});

// ── 2. Demo assignment containment ───────────────────────────────────────────

function assignmentScope(hostname, { live = null } = {}) {
  // SC8: the gate resolves a REAL assignment first and only then considers the
  // demo fixture, so the harness must supply both seams.
  const body = `"use strict";
    const location = { hostname: ${JSON.stringify(hostname)} };
    const perfToday = () => '2026-08-24';
    const perfLiveAssignment = () => (${JSON.stringify(live)});
    // SC8: any real assignment record suppresses the demo, not only a live one.
    const perfCurrentAssignment = () => (${JSON.stringify(live)});
    const _perfWkMod = {
      getDemoAssignment: () => ({ isDemo: true, programme: { title: 'Pre-Season Strength (Demo)' } }),
      sessionForDate: () => ({ session: { kind: 'session', title: 'Real session' }, weekNumber: 1,
        phase: { phaseType: 'pre_season' }, dayNode: { rugbyRelation: 'none' } }),
    };
    ${extractFn(html, '_isLocalDemoHost')}
    ${extractFn(html, 'perfWkAssignment')}
    return perfWkAssignment();`;
  return new Function(body)();
}

test('5. demo assignment exists ONLY on a local demo host', () => {
  assert.ok(assignmentScope('localhost'), 'available for development');
  assert.ok(assignmentScope('127.0.0.1'));
  assert.equal(assignmentScope('coacheasier.com'), null, 'production must never see a fabricated assignment');
  assert.equal(assignmentScope('app.vercel.app'), null);
});

test('5b. SC8 — a REAL assignment outranks the demo, even on a demo host', () => {
  const live = { assignmentId: 'a-real', programmeVersionId: 'pg@v1', programmeTitle: 'Real Programme', snapshot: {} };
  const onDemoHost = assignmentScope('localhost', { live });
  assert.equal(onDemoHost.isDemo, false, 'the athlete gets their real programme, not the fixture');
  assert.equal(onDemoHost.assignmentId, 'a-real');
  const inProd = assignmentScope('coacheasier.com', { live });
  assert.equal(inProd.isDemo, false, 'and production serves the real assignment');
});

test('6. production Today view is an honest empty state, not a fake coach assignment', () => {
  const today = extractFn(html, 'perfWkTodayHtml');
  assert.match(today, /perfWkAssignment\(\)/, 'render resolves through the gate');
  assert.match(today, /if \(!demo\) return perfWkNoAssignmentHtml\(wstate\)/);
  const empty = extractFn(html, 'perfWkNoAssignmentHtml');
  assert.match(empty, /No programme assigned/);
  assert.ok(!/Demo assignment/.test(empty), 'the empty state never claims a demo');
  assert.ok(!/Start workout/.test(empty), 'nothing to start without an assignment');
});

test('7. direct perfWkStart() cannot fabricate a session in production', () => {
  const start = extractFn(html, 'perfWkStart');
  assert.match(start, /const demo = perfWkAssignment\(\);/);
  assert.match(start, /if \(!demo\)/, 'start refuses without a real assignment');
  assert.ok(!/getDemoAssignment/.test(start), 'start must not reach the demo fixture directly');
});

test('8. getDemoAssignment has exactly one call site — the gate itself', () => {
  assert.equal((html.match(/getDemoAssignment\(\)/g) || []).length, 1);
});

// ── 3. Beta nav visibility (never a substitute for route gating) ─────────────

function navScope({ plan = 'core', hostname = 'coacheasier.com', hideCommercial = true } = {}) {
  const body = `"use strict";
    const location = { hostname: ${JSON.stringify(hostname)} };
    const BETA_HIDE_COMMERCIAL = ${hideCommercial};
    const state = { teamPlan: ${JSON.stringify(plan)}, teamPlanStatus: 'active' };
    function isCoach() { return true; }
    function canI() { return true; }
    ${constLiteral('PLAN_LEVEL') ? 'const PLAN_LEVEL = ' + constLiteral('PLAN_LEVEL') + ';' : ''}
    ${extractFn(html, 'planLevel')}
    ${extractFn(html, 'isProTeam')}
    ${extractFn(html, 'isEnterpriseTeam')}
    function getFeature(id) { return id === 'performance' ? { id, minimumPlan: 'pro' } : null; }
    ${extractFn(html, 'canUseFeature')}
    ${extractFn(html, '_isLocalDemoHost')}
    const SECTION_PERM_MAP = ${html.match(/const SECTION_PERM_MAP = (\{[^}]*\});/)[1]};
    const SECTION_FEATURE_MAP = ${html.match(/const SECTION_FEATURE_MAP = (\{[^}]*\});/)[1]};
    ${extractFn(html, 'allowedCoachSections')}
    return allowedCoachSections([['training','Training'],['performance','Performance'],['medical','Medical']]).map(x => x[0]);`;
  return new Function(body)();
}

test('9. unentitled beta club is not offered a dead locked Performance destination', () => {
  const ids = navScope({ plan: 'core' });
  assert.ok(!ids.includes('performance'), 'no upgrade path exists while commercial discovery is hidden');
  assert.deepEqual(ids, ['training', 'medical'], 'no other section is affected');
});

test('10. entitled club sees Performance; demo host always does', () => {
  assert.ok(navScope({ plan: 'pro' }).includes('performance'));
  assert.ok(navScope({ plan: 'enterprise' }).includes('performance'));
  assert.ok(navScope({ plan: 'core', hostname: 'localhost' }).includes('performance'), 'drivable locally');
});

test('11. when commercial discovery returns, the locked entry returns with it', () => {
  assert.ok(navScope({ plan: 'core', hideCommercial: false }).includes('performance'),
    'hiding is tied to the beta no-upsell policy, not baked in');
});

test('12. hiding navigation does NOT replace route-level gating', () => {
  const render = extractFn(html, 'renderPerformance');
  assert.match(render, /if \(!canUseFeature\('performance'\)\)/, 'the section keeps its own mandatory premium gate');
  assert.match(html, /const SECTION_PERM_MAP = \{[^}]*performance: 'publish_training'/,
    'and stays registered in the shared permission map used by setSection()');
});

test('13. Performance uses Core\'s single nav mechanism, not a parallel one', () => {
  assert.equal((html.match(/function allowedCoachSections/g) || []).length, 1);
  const nav = extractFn(html, 'renderNav');
  assert.match(nav, /allowedCoachSections\(_navSections\)/);
  assert.ok(!/canUseFeature\('performance'\)/.test(nav), 'renderNav holds no bespoke Performance rule');
});

// ── 4. Athlete route ─────────────────────────────────────────────────────────

function playerSections(plan) {
  const body = `"use strict";
    const state = { teamPlan: ${JSON.stringify(plan)}, teamPlanStatus: 'active' };
    const playerSections = ${html.match(/const playerSections = (\[[\s\S]*?\]);/)[1]};
    function canI() { return false; }
    const PLAN_LEVEL = ${constLiteral('PLAN_LEVEL')};
    ${extractFn(html, 'planLevel')}
    ${extractFn(html, 'isProTeam')}
    ${extractFn(html, 'isEnterpriseTeam')}
    function getFeature(id) { return id === 'performance' ? { id, minimumPlan: 'pro' } : null; }
    ${extractFn(html, 'canUseFeature')}
    ${extractFn(html, 'playerSectionsFor')}
    return playerSectionsFor().map(x => x[0]);`;
  return new Function(body)();
}

test('14. entitled athlete gets a Performance route; unentitled athlete does not', () => {
  assert.ok(playerSections('pro').includes('performance'));
  assert.ok(!playerSections('core').includes('performance'));
});

test('15. the player route is gated by the same list setSection() enforces', () => {
  const set = extractFn(html, 'setSection');
  assert.match(set, /view === "player" && !playerSectionsFor\(\)\.some\(\(\[id\]\) => id === section\)/);
});

test('16. an athlete sees only athlete surfaces — never roster, programming or coach tools', () => {
  const allowed = new Function('return ' + constLiteral('PERF_PLAYER_TAB_IDS'))();
  // SC8 adds 'programme' — the athlete's OWN assigned programme. It is not the
  // coach 'programmes' library: perfProgrammeViewHtml renders one assignment,
  // the athlete's, and cannot enumerate athletes (see test 16b).
  assert.deepEqual(allowed, ['programme', 'profile', 'workouts', 'library', 'settings']);
  for (const forbidden of ['athletes', 'programmes', 'analytics', 'tools', 'dashboard']) {
    assert.ok(!allowed.includes(forbidden), forbidden + ' is a coach/club surface');
  }
});

test('17. a stored coach tab cannot open a coach surface inside the player shell', () => {
  const render = extractFn(html, 'renderPerformance');
  assert.match(render, /const tabs = asPlayer \? PERF_TABS\.filter\(t => PERF_PLAYER_TAB_IDS\.includes\(t\.id\)\) : PERF_TABS;/);
  assert.match(render, /tabs\.some\(t => t\.id === state\.activePerformanceTab\)/,
    'the active tab is validated against the ALLOWED set, then falls back');
  assert.match(render, /\(asPlayer \? 'programme' : 'dashboard'\)/);
});

test('17b. the athlete programme page renders ONE assignment, never a roster', () => {
  const view = extractFn(html, 'perfProgrammeViewHtml');
  assert.match(view, /perfCurrentAssignment\(\)/, 'it renders the athlete\'s own current assignment');
  assert.ok(!/_perfAssign\.athletes/.test(view), 'an athlete surface may never enumerate athletes');
  assert.ok(!/perfStartAuthoring|create_assignment|publish_programme/.test(view),
    'an athlete cannot author, publish or assign');
});

test('18. Performance renders into the player shell for athletes (Medical\'s dual-host pattern)', () => {
  assert.match(html, /<section id="player-performance"  class="section"><\/section>/);
  assert.match(html, /safeRender\('player-performance',\s*\(\) => renderPerformance\(\)\)/);
  const render = extractFn(html, 'renderPerformance');
  assert.match(render, /getElementById\(asPlayer \? 'player-performance' : 'coach-performance'\)/);
});
