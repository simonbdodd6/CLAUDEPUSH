/**
 * SC8 — the client half: real assignments replace the demo seam, the athlete
 * route stays athlete-only, and no Performance surface reads the club roster.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  let start = html.indexOf('    function ' + name + '(');
  if (start === -1) start = html.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('missing ' + name);
  // Skip the PARAMETER list first: a destructured default ({ quiet = true })
  // would otherwise be mistaken for the function body's opening brace.
  let i = html.indexOf('(', start), d = 0;
  while (i < html.length) {
    if (html[i] === '(') d++;
    else if (html[i] === ')') { d--; if (d === 0) break; }
    i++;
  }
  d = 0; let seen = false;
  while (i < html.length) {
    if (html[i] === '{') { d++; seen = true; }
    else if (html[i] === '}') { d--; if (seen && d === 0) return html.slice(start, i + 1); }
    i++;
  }
  throw new Error('unterminated ' + name);
}

// ── Today source ────────────────────────────────────────────────────────────

test('1. a REAL assignment always beats the demo fixture', () => {
  const gate = extractFn('perfWkAssignment');
  const liveIdx = gate.indexOf('perfLiveAssignment()');
  const demoIdx = gate.indexOf('getDemoAssignment()');
  assert.ok(liveIdx > -1, 'the gate consults real assignments');
  assert.ok(demoIdx > -1);
  assert.ok(liveIdx < demoIdx, 'the real assignment is resolved FIRST');
  assert.match(gate, /if \(!_isLocalDemoHost\(\)\) return null;/, 'demo remains local-only');
});

test('2. production with no assignment is still an honest empty state', () => {
  const gate = extractFn('perfWkAssignment');
  // Off a demo host, with no live assignment, the gate returns null.
  const scope = new Function(`
    const _isLocalDemoHost = () => false;
    const perfLiveAssignment = () => null;
    const perfCurrentAssignment = () => null;
    const _perfWkMod = { getDemoAssignment: () => ({ isDemo: true }) };
    const perfToday = () => '2026-08-24';
    ${gate}
    return perfWkAssignment();`)();
  assert.equal(scope, null, 'production must not fabricate a session');
});

test('3. a rest day inside a live programme yields no session, not a substitute', () => {
  const gate = extractFn('perfWkAssignment');
  const out = new Function(`
    const _isLocalDemoHost = () => true;   // even on a demo host...
    const live = { assignmentId: 'a1', programmeVersionId: 'v1', snapshot: {} };
    const perfLiveAssignment = () => live;
    const perfCurrentAssignment = () => live;
    const _perfWkMod = { sessionForDate: () => null, getDemoAssignment: () => ({ isDemo: true }) };
    const perfToday = () => '2026-08-25';
    ${gate}
    return perfWkAssignment();`)();
  assert.equal(out, null, '...a real assignment on a rest day must NOT fall back to the demo');
});

test('4. a live assignment produces a non-demo session from the pinned snapshot', () => {
  const gate = extractFn('perfWkAssignment');
  const out = new Function(`
    const _isLocalDemoHost = () => false;
    const live = { assignmentId: 'a1', programmeVersionId: 'pg@v1', programmeTitle: 'Pre-Season', snapshot: { k: 1 } };
    const perfLiveAssignment = () => live;
    const perfCurrentAssignment = () => live;
    const _perfWkMod = { sessionForDate: () => ({ session: { kind: 'session', title: 'Lower' }, weekNumber: 2,
      phase: { phaseType: 'pre_season' }, dayNode: { rugbyRelation: 'day_before_match' } }) };
    const perfToday = () => '2026-08-24';
    ${gate}
    return perfWkAssignment();`)();
  assert.equal(out.isDemo, false);
  assert.equal(out.assignmentId, 'a1');
  assert.equal(out.meta.week, 2);
  assert.equal(out.sessionNode.title, 'Lower');
  assert.equal(out.programme, null, 'a live programme object is never carried — only the pinned snapshot');
});

test('5. a real workout is built from the PINNED snapshot, not the live catalogue', () => {
  const start = extractFn('perfWkStart');
  assert.match(start, /catalogueFromSnapshot\(demo\.assignment\.snapshot\)/,
    'exercise definitions come from the assignment');
  assert.match(start, /: _perfWkMod\.getCatalogue\(\)/, 'the live catalogue is only the demo fallback');
});

test('6. the Today card only claims "Demo assignment" for an actual demo', () => {
  const today = extractFn('perfWkTodayHtml');
  assert.match(today, /const real = !demo\.isDemo;/);
  assert.match(today, /\$\{real \? '' : '<span class="pill">Demo assignment<\/span>'\}/);
});

test('6b. an athlete WITH a programme never sees the demo, even on a demo host', () => {
  const gate = extractFn('perfWkAssignment');
  assert.match(gate, /if \(perfCurrentAssignment\(\)\) return null;/,
    'a paused, scheduled or finished real programme still suppresses the fixture');
  const out = new Function(`
    const _isLocalDemoHost = () => true;
    const perfLiveAssignment = () => null;                 // paused: not live
    const perfCurrentAssignment = () => ({ assignmentId: 'a1', status: 'paused' });
    const _perfWkMod = { getDemoAssignment: () => ({ isDemo: true }) };
    const perfToday = () => '2026-08-24';
    ${gate}
    return perfWkAssignment();`)();
  assert.equal(out, null, 'a paused athlete is shown their own state, not a demo workout');
});

test('6c. "no session today" is never confused with "no programme"', () => {
  const empty = extractFn('perfWkNoAssignmentHtml');
  assert.match(empty, /Rest day/);
  assert.match(empty, /Programme paused/);
  assert.match(empty, /Programme starts soon/);
  assert.match(empty, /Programme finished/);
  assert.match(empty, /No programme assigned/);
  // The bare "no programme" copy is reserved for athletes who genuinely have none.
  assert.match(empty, /const title = !current \? 'No programme assigned'/);
  const build = (current, status) => new Function(`
    const esc = s => String(s);
    const perfCurrentAssignment = () => (${JSON.stringify(current)});
    const perfToday = () => '2026-08-24';
    const _perfWkMod = { effectiveStatus: () => ${JSON.stringify(status)} };
    const perfWkSyncPill = () => '';
    const perfWkHistoryListHtml = () => '';
    ${empty}
    return perfWkNoAssignmentHtml({ history: [] });`)();
  assert.match(build({ programmeTitle: 'Pre-Season' }, 'active'), /Rest day/);
  assert.ok(!/No programme assigned/.test(build({ programmeTitle: 'Pre-Season' }, 'active')),
    'an athlete on an active programme is never told they have none');
  assert.match(build({ programmeTitle: 'Pre-Season' }, 'paused'), /Programme paused/);
  assert.match(build(null, null), /No programme assigned/);
});

// ── Player route ────────────────────────────────────────────────────────────

test('7. the athlete tab set gains My Programme and nothing coach-facing', () => {
  const ids = new Function(`return ${html.match(/const PERF_PLAYER_TAB_IDS = (\[[^\]]*\])/)[1]}`)();
  assert.deepEqual(ids, ['programme', 'profile', 'workouts', 'library', 'settings']);
  for (const forbidden of ['athletes', 'programmes', 'analytics', 'tools', 'dashboard']) {
    assert.ok(!ids.includes(forbidden), `${forbidden} must stay a coach surface`);
  }
});

test('8. the player programme view renders only the athlete\'s own assignment', () => {
  const view = extractFn('perfProgrammeViewHtml');
  assert.match(view, /perfCurrentAssignment\(\)/);
  assert.match(view, /No programme assigned/);
  assert.ok(!/_perfAssign\.athletes/.test(view), 'a player view must never enumerate athletes');
  assert.ok(!/state\.players/.test(view));
});

test('9. paused / scheduled / completed all read honestly to the athlete', () => {
  const view = extractFn('perfProgrammeViewHtml');
  for (const s of ['paused', 'scheduled', 'completed', 'replaced', 'cancelled']) {
    assert.ok(view.includes(`${s}:`), `${s} needs an honest explanation`);
  }
  assert.match(view, /completed workouts are all still saved/);
});

// ── Isolation ───────────────────────────────────────────────────────────────

test('10. NO Performance surface reads the club-wide roster', () => {
  const names = [...html.matchAll(/\n    (?:async )?function (perf[A-Za-z0-9_]*|renderPerformance)\(/g)].map(m => m[1]);
  assert.ok(names.length > 100, `sanity: ${names.length} Performance functions`);
  // Comments are allowed to NAME the banned reads (they explain why we avoid
  // them); executable code is not. Strip line comments before checking.
  const source = names.map(extractFn).join('\n')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  for (const banned of ['state.players', 'canonicalVisiblePlayers', '_adminData.members', 'state.medicalRecords']) {
    assert.equal(source.split(banned).length - 1, 0,
      `Performance must not read ${banned} — it is club-wide on every coach's device`);
  }
});

test('11. the coach athlete list comes from the server, scoped', () => {
  const athletes = extractFn('perfAthletesHtml');
  // Server-owned, then narrowed to the group being viewed by the one shared
  // helper — the seam that keeps Athletes and the New Programme picker in step.
  assert.match(athletes, /perfScopedAthletes\(\)/);
  const scoped = extractFn('perfScopedAthletes');
  assert.match(scoped, /_perfAssign\.athletes/, 'the helper reads the scoped server payload');
  assert.match(extractFn('perfPickAthleteHtml'), /perfScopedAthletes\(\)/, 'and the picker uses the same helper');
  assert.match(athletes, /perfLoadAssignments\(\)/);
  assert.ok(!/PERF_SAMPLE_ATHLETES/.test(athletes), 'sample data is gone from the real view');
});

// ── Authoring guarantees ────────────────────────────────────────────────────

test('12. nothing auto-publishes and nothing auto-assigns', () => {
  const gen = extractFn('perfGenerateDraft');
  assert.ok(!/publish_programme/.test(gen), 'generating must not publish');
  assert.ok(!/create_assignment/.test(gen), 'generating must not assign');
  const publish = extractFn('perfPublishDraft');
  assert.ok(!/create_assignment/.test(publish), 'publishing must not assign');
  assert.match(publish, /step = 'assign'/, 'it moves the coach to an explicit assign step');
});

test('13. a missing athlete profile fails honestly, and never falls back to this device', () => {
  const gen = extractFn('perfGenerateDraft');
  const code = gen.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  assert.match(gen, /Performance profile is incomplete/);
  assert.match(gen, /Still needed:/, 'it says what is missing');
  assert.ok(!/fallbackProfile|defaultProfile|sampleProfile/.test(gen), 'no fabricated athlete context');
  // The whole point of SC8's profile correction: the coach's own device-local
  // profile can never stand in for the athlete's.
  assert.ok(!/state\.performanceProfile/.test(code),
    'the coach\'s own profile is not a fallback');
  assert.match(code, /athleteProfile=/, 'the athlete\'s own server projection is fetched');
});

test('14. publication validates and requires an explicit coach acknowledgement', () => {
  const publish = extractFn('perfPublishDraft');
  assert.match(publish, /validateProgrammeVersion/);
  assert.match(publish, /not valid yet/);
  assert.match(publish, /_perfAuthor\.ack/);
  const review = extractFn('perfReviewHtml');
  assert.match(review, /provisional/);
  assert.match(review, /not a medical or/, 'the wording must not claim medical approval');
  assert.match(review, /I have reviewed this programme/);
});

test('15. the review screen explains WHY the programme looks like this', () => {
  const review = extractFn('perfReviewHtml');
  for (const bit of ['volumeCategory', 'intensityCategory', 'frequency', 'developmentContext',
                     'daysChosen', 'flags', 'unresolvedSlots', 'patternCoverage']) {
    assert.ok(review.includes(bit), `review must surface ${bit}`);
  }
  assert.match(review, /Youth safeguards are active/);
});

test('16. an existing assignment forces an explicit choice, never a silent overwrite', () => {
  const assign = extractFn('perfAssignHtml');
  assert.match(assign, /already has a programme/);
  assert.match(assign, /Nothing is overwritten silently/);
  assert.match(assign, /intent='replace'/);
  assert.match(assign, /occupied\.length && _perfAuthor\.intent !== 'replace'\) \? 'disabled' : ''/,
    'the assign button stays disabled until the coach declares what happens to the current programme');
});

test('17. every mutation goes through one authenticated POST that fails loudly', () => {
  const post = extractFn('perfPost');
  assert.match(post, /resource=performance/);
  assert.match(post, /throw err/);
  assert.ok(!/localStorage/.test(post), 'assignments are server-owned, never local');
});

test('18. entitlement refusal is reported as itself, not as an empty list', () => {
  const load = extractFn('perfLoadAssignments');
  assert.match(load, /res\.status === 402/);
  assert.match(load, /'not_entitled'/);
  const err = extractFn('perfAssignErrorHtml');
  assert.match(err, /Performance is not enabled for this club/);
});

test('19. no AI, diagnosis or rehabilitation language enters the SC8 surface', () => {
  const names = ['perfGenerateDraft', 'perfReviewHtml', 'perfAssignHtml', 'perfProgrammeViewHtml',
                 'perfAthletesHtml', 'perfProgrammesHtml', 'perfPublishDraft'];
  const source = names.map(extractFn).join('\n').toLowerCase();
  for (const term of ['diagnos', 'rehabilitat', 'cleared to play', 'medically approved', 'ai generated']) {
    assert.ok(!source.includes(term), `SC8 must not contain "${term}"`);
  }
  // It should say the opposite about AI.
  assert.match(extractFn('perfGenerateHtml'), /No AI is involved/);
});

// ── Profile sync on completion ──────────────────────────────────────────────
// The defect these exist to prevent: an athlete completes the whole wizard
// with "Continue" and "Finish setup", never touches "Skip for now", and their
// profile stays on the device — the server keeps profile:null, so the coach's
// generate step refuses forever with "ask them to finish onboarding". The
// completion path must publish the authoring projection exactly as the skip
// path always has, and a stranded device must self-heal on the next load.

const { authoringProfileFrom, authoringProfileUsable, FORBIDDEN_PROFILE_SECTIONS } =
  await import('../performance/domain/authoring-profile.js');

const literal = re => {
  const m = html.match(re);
  if (!m) throw new Error(`literal ${re} not found`);
  return m[0];
};

/** A completed SC2 profile, deliberately carrying data that must NOT sync. */
function completedProfile() {
  return {
    personal: { ageBand: 'adult_18_39', dateOfBirth: null },
    rugby: { primaryPosition: 'flanker', playingLevel: 'club', seasonPhase: 'in_season', matchDay: 'Sat' },
    training: { experience: 'intermediate', preferredSessionMinutes: 45, techConfidence: 'confident' },
    schedule: { availableDays: ['Mon', 'Wed', 'Fri'], rugbyDays: [], matchDay: 'Sat', maxSessionMinutes: 60 },
    equipment: { locations: ['full_gym'], items: ['barbell'] },
    goals: [{ type: 'strength', importance: 4 }],
    sharing: { consentAcceptedAt: '2026-08-26T00:00:00.000Z' },
    pain: { present: true, area: 'left knee', note: 'sore after match' },
    health: { injuryHistory: [{ what: 'ACL 2024' }], physioInstructions: 'no deep squats' },
    wellnessLog: [{ sleep: 2 }],
    body: { weightKg: 104, heightCm: 188 },
    status: 'draft',
  };
}

/**
 * The REAL wizard/sync/adopt functions from index.html in one scope, with the
 * DOM, network and storage stubbed. `posts` records every successful
 * save_athlete_profile POST body.
 */
function syncShell({ profile = completedProfile(), completedAt = null, step = 'review',
                     fetchImpl = null } = {}) {
  const posts = [];
  const build = new Function('state', 'posts', 'authoringProfileFrom', 'fetchImpl', `
    let _perfObError = '', _perfObShowDone = false, _perfObReturn = null, _perfProfileSync = 'device';
    const _perfWkMod = { authoringProfileFrom };
    const fetch = fetchImpl || ((url, opts) => {
      posts.push({ url, body: JSON.parse(opts.body) });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    });
    const saveState = () => {}; const render = () => {};
    const renderPerformance = () => {}; const showToast = () => {};
    ${literal(/const PERF_OB_STEPS = \[[\s\S]*?\];/)}
    ${literal(/const PERF_REQUIRED_PATHS = \[[\s\S]*?\];/)}
    ${literal(/const PERF_STEP_REQUIRED = \{[\s\S]*?\};/)}
    ${extractFn('perfIsAnswered')}
    ${extractFn('perfGetPath')}
    ${extractFn('perfMissingRequired')}
    ${extractFn('perfStepComplete')}
    function perfObEnsure() { return state.performanceProfile; }
    function perfObStepIndex(s) { return PERF_OB_STEPS.findIndex(x => x.id === s); }
    function perfObCommitWellness() {}
    function perfInitialProfileState() {
      return { profile: null, onboarding: { step: 'welcome', startedAt: null, completedAt: null, skippedSteps: [] } };
    }
    function perfEmptyProfile() {
      return { personal: {}, rugby: {}, training: {},
               equipment: { locations: [], items: [] },
               schedule: { availableDays: [], rugbyDays: [] }, goals: [] };
    }
    ${extractFn('perfObResolveReturn')}
    ${extractFn('perfPublishAuthoringProfile')}
    ${extractFn('perfAdoptServerProfile')}
    ${extractFn('perfObNext')}
    ${extractFn('perfObSkip')}
    ${extractFn('perfObSubmit')}
    return { perfObSubmit, perfObNext, perfObSkip, perfAdoptServerProfile,
             setReturn: v => { _perfObReturn = v; },
             setSync: v => { _perfProfileSync = v; },
             getSync: () => _perfProfileSync,
             getShowDone: () => _perfObShowDone };
  `);
  const state = { currentUserId: 'u-self', performanceProfile: profile === null ? null : {
    profile, onboarding: { step, startedAt: 'x', completedAt, skippedSteps: [] } } };
  return { posts, state, api: build(state, posts, authoringProfileFrom, fetchImpl) };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('20. "Finish setup" publishes the authoring projection — exactly one POST', async () => {
  const { posts, state, api } = syncShell();
  api.perfObSubmit();
  await tick();
  assert.equal(posts.length, 1, 'one completion = one profile sync');
  assert.equal(posts[0].body.op, 'save_athlete_profile');
  assert.match(posts[0].url, /resource=performance/);
  assert.equal(state.performanceProfile.profile.status, 'active', 'local completion behaviour kept');
  assert.ok(state.performanceProfile.onboarding.completedAt, 'completion still recorded locally');
  assert.equal(api.getSync(), 'synced');
});

test('21. the completion payload is the minimised projection — usable, no health data', async () => {
  const { posts, api } = syncShell();
  api.perfObSubmit();
  await tick();
  const sent = posts[0].body.profile;
  assert.equal(sent.kind, 'authoring_profile');
  assert.equal(authoringProfileUsable(sent), true, 'the server copy can drive generation');
  assert.equal(sent.profileComplete, true);
  const json = JSON.stringify(sent);
  for (const secret of ['left knee', 'sore after match', 'ACL 2024', 'no deep squats', '104', '188']) {
    assert.ok(!json.includes(secret), `must not sync "${secret}"`);
  }
  for (const section of FORBIDDEN_PROFILE_SECTIONS) {
    assert.ok(!json.includes(`"${section}":`), `must not sync a "${section}" section`);
  }
});

test('22. mid-onboarding Continue does not POST; an edit to a completed profile re-syncs once', async () => {
  // Continue during first-run onboarding: the one sync happens at completion.
  const first = syncShell({ step: 'rugby' });
  first.api.perfObNext();
  await tick();
  assert.equal(first.posts.length, 0, 'no POST per wizard step');

  // An edit jump on an ALREADY-COMPLETED profile re-syncs when it resolves.
  const edit = syncShell({ step: 'goals', completedAt: '2026-08-20T00:00:00.000Z' });
  edit.api.setReturn('profile');
  edit.api.perfObNext();
  await tick();
  assert.equal(edit.posts.length, 1, 'a finished edit re-syncs the projection');
  assert.equal(edit.posts[0].body.op, 'save_athlete_profile');

  // The same edit jump before completion does not sync — submit will.
  const preEdit = syncShell({ step: 'goals', completedAt: null });
  preEdit.api.setReturn('review');
  preEdit.api.perfObNext();
  await tick();
  assert.equal(preEdit.posts.length, 0, 'review-stage edits wait for completion');
});

test('23. "Skip for now" still publishes, unchanged', async () => {
  const { posts, api } = syncShell({ step: 'readiness' });
  api.perfObSkip();
  await tick();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.op, 'save_athlete_profile');
});

test('24. SELF-HEAL — a stranded completed profile publishes on the next load', async () => {
  // Server has nothing; this device holds a COMPLETED profile (the athlete
  // finished onboarding before completion synced). The load path repairs it.
  const { posts, api } = syncShell({ completedAt: '2026-08-20T00:00:00.000Z', step: 'done' });
  api.perfAdoptServerProfile(null);
  await tick();
  assert.equal(posts.length, 1, 'the stranded profile is published');
  assert.equal(authoringProfileUsable(posts[0].body.profile), true,
    'the healed server copy is generation-ready');
});

test('25. SELF-HEAL guards: no completed profile, no POST; no storm while pending', async () => {
  // Mid-onboarding local profile → nothing to heal yet.
  const incomplete = syncShell({ completedAt: null, step: 'schedule' });
  incomplete.api.perfAdoptServerProfile(null);
  await tick();
  assert.equal(incomplete.posts.length, 0, 'an unfinished profile is not synced');

  // No local profile at all → nothing is sent.
  const empty = syncShell({ profile: null });
  empty.api.perfAdoptServerProfile(null);
  await tick();
  assert.equal(empty.posts.length, 0, 'an untouched device sends nothing');

  // A publish already in flight is never doubled.
  const pending = syncShell({ completedAt: '2026-08-20T00:00:00.000Z', step: 'done' });
  pending.api.setSync('pending');
  pending.api.perfAdoptServerProfile(null);
  await tick();
  assert.equal(pending.posts.length, 0, 'one request at a time');
});

test('26. existing server-profile behaviour is preserved', async () => {
  const serverProfile = authoringProfileFrom(completedProfile(), { now: new Date('2026-08-26') });

  // Device already has a profile → the local (newer) copy re-publishes.
  const both = syncShell({ completedAt: '2026-08-20T00:00:00.000Z', step: 'done' });
  both.api.perfAdoptServerProfile(serverProfile);
  await tick();
  assert.equal(both.posts.length, 1, 'local working draft re-publishes over the older read');

  // Fresh device → the server copy is adopted, nothing is posted.
  const fresh = syncShell({ profile: null });
  fresh.api.perfAdoptServerProfile(serverProfile);
  await tick();
  assert.equal(fresh.posts.length, 0, 'adoption is a read, not a write');
  assert.equal(fresh.state.performanceProfile.profile.rugby.primaryPosition, 'flanker');
  assert.equal(fresh.api.getSync(), 'synced');
});

test('27. offline completion stays local-first and never claims a server save', async () => {
  const { posts, state, api } = syncShell({
    fetchImpl: () => Promise.reject(new Error('offline')) });
  api.perfObSubmit();
  await tick();
  assert.equal(posts.length, 0);
  assert.equal(api.getSync(), 'error', 'sync status reports the truth');
  assert.equal(state.performanceProfile.profile.status, 'active', 'the local completion is kept');
  assert.equal(api.getShowDone(), true, 'the athlete still finishes onboarding');
});

test('28. coach surfaces show whether the athlete profile is ready', () => {
  for (const name of ['perfAthletesHtml', 'perfPickAthleteHtml']) {
    const fn = extractFn(name);
    assert.match(fn, /a\.profileComplete \? '✓ Profile complete' : 'Waiting for athlete profile'/,
      `${name} renders the server-sent readiness state`);
  }
});

test('29. ticking the review acknowledgement actually enables Publish', () => {
  // The checkbox set _perfAuthor.ack without re-rendering, so the Publish
  // button — rendered disabled while unticked — stayed disabled forever and
  // no coach could publish through the review screen at all.
  const review = extractFn('perfReviewHtml');
  assert.match(review, /onchange="_perfAuthor\.ack = this\.checked; renderPerformance\(\)"/,
    'the acknowledgement re-renders so the disabled state follows it');
  assert.match(review, /_perfAuthor\.busy \|\| !_perfAuthor\.ack \? 'disabled' : ''/,
    'the button is still gated on the acknowledgement');
});
