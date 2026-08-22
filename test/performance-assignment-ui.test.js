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
  let i = start, d = 0, seen = false;
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
  assert.match(athletes, /_perfAssign\.athletes/);
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
