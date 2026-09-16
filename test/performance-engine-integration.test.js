// SC9.36 — Core ↔ Performance engine integration.
//
// Core's coach authoring screen used to generate programmes by assembling the
// chain by hand — engineInputFromAuthoringProfile → generateBlueprint →
// programmeDraftFromBlueprint — against Core's own copy of the domain modules.
// That copy predated the Gate 2 coaching decisions, the SC9.29 youth
// strength-frequency floor and the SC9.31/9.32 athlete-state pathway, so a
// coach could author and publish a programme in which a declared restriction
// excluded nothing whatsoever. The feature was live.
//
// These tests hold the replacement in place. They deliberately do NOT
// re-test the Performance rules themselves — the standalone repository's 948
// tests are authoritative for those. What is tested here is the SEAM: that
// Core calls the contract, that it cannot reach the old path, that what Core's
// vendored copy prescribes is identical to what the canonical engine
// prescribes, and that nothing internal leaks to a player.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  ENGINE_CONTRACT_VERSION, generateProgramme, releaseDecision,
} from '../performance/engine.js';
import { getCatalogue } from '../performance/services/exercise-catalogue.js';
import { authoringProfileFrom } from '../performance/domain/authoring-profile.js';
import { snapshotForProgrammeAssignment, publishProgrammeVersion } from '../performance/domain/programme-versioning.js';
import * as BARREL from '../performance/services/workout-runtime.js';
import {
  U18_FRONT_ROW, SCENARIO, digest, prescriptionProjection, exercisesIn,
} from './fixtures/sc936-scenario.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const CATALOGUE = getCatalogue();

/** The Performance regions of index.html, as the other Performance guards cut them. */
const perfRegions = () => [
  html.slice(html.indexOf('athlete profile model (SC2, inline mirror)'), html.indexOf('const playerSections = [')),
  html.slice(html.indexOf('COACHEASIER PERFORMANCE — premium S&C module'), html.indexOf('    function render() {')),
];

/** perfGenerateDraft's body, comments stripped — what the code DOES. */
function generateDraftCode() {
  const start = html.indexOf('    async function perfGenerateDraft(');
  assert.ok(start > 0, 'perfGenerateDraft exists');
  let i = start, depth = 0, seen = false, body = '';
  while (i < html.length) {
    if (html[i] === '{') { depth++; seen = true; }
    else if (html[i] === '}') { depth--; if (seen && depth === 0) { body = html.slice(start, i + 1); break; } }
    i++;
  }
  return { raw: body, code: body.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n') };
}

const generate = (profile, extra = {}) =>
  generateProgramme({ profile, catalogue: CATALOGUE, ...SCENARIO, ...extra });

const exerciseById = (id) => CATALOGUE.find(e => e.id === id || `ex-${e.slug}` === id);

// ── 1. A normal athlete generates through the canonical engine ──────────────

test('1. a valid athlete generates through the canonical engine', () => {
  const out = generate(U18_FRONT_ROW);
  const weeks = prescriptionProjection(out);
  assert.equal(weeks.length, 4, 'four weeks');
  assert.ok(weeks[0].days.length, 'with real training days');
  assert.ok(exercisesIn(out).length > 0, 'and real exercises');
  assert.equal(out.context.contractVersion, ENGINE_CONTRACT_VERSION);
});

test('1b. Core hands the projection to the engine WHOLE', () => {
  const { code } = generateDraftCode();
  assert.match(code, /engine\.generateProgramme\(/, 'one call to the contract');
  assert.match(code, /profile:\s*ap,/, 'the projection goes in as `profile`');
  assert.match(code, /await perfEngine\(\)/, 'resolved from the engine loader');
  // The loader itself, which is the only place performance/engine.js is named.
  assert.match(html, /_perfEnginePromise = import\('\.\/performance\/engine\.js'\)/,
    'and the loader imports the canonical engine module');
});

// ── 2. The old path is gone, not merely unused ──────────────────────────────

test('2. index.html cannot reach the pre-Gate-2 generator', () => {
  const { code } = generateDraftCode();
  for (const banned of ['generateBlueprint', 'programmeDraftFromBlueprint', 'engineInputFromAuthoringProfile']) {
    assert.ok(!code.includes(banned), `${banned} is not called`);
  }
  for (const region of perfRegions()) {
    const regionCode = region.split('\n').map(l => l.replace(/^\s*(\/\/|\*).*$/, '')).join('\n');
    for (const banned of ['generateBlueprint', 'programmeDraftFromBlueprint', 'engineInputFromAuthoringProfile']) {
      assert.ok(!regionCode.includes(banned), `${banned} appears nowhere in the Performance regions`);
    }
  }
});

test('2b. the runtime barrel does not hand the old generator out either', () => {
  // index.html reaches performance/ through exactly two dynamic imports. An
  // export nothing calls is still a door, so the barrel withholds these.
  for (const banned of ['generateBlueprint', 'validateBlueprint', 'programmeDraftFromBlueprint',
                        'chooseTrainingDays', 'engineInputFromAuthoringProfile']) {
    assert.ok(!(banned in BARREL), `workout-runtime must not re-export ${banned}`);
  }
  assert.ok('getCatalogue' in BARREL, 'the workout surface is otherwise intact');
});

// ── 3–4. The decisions the old path did not have ───────────────────────────

test('3. Gate 2 youth repetition constraints are applied', () => {
  const out = generate(U18_FRONT_ROW);
  let strengthSets = 0, mainStrengthSets = 0;
  for (const w of prescriptionProjection(out)) {
    for (const d of w.days) for (const s of d.sessions) for (const b of s.blocks) for (const p of b.prescriptions) {
      const ex = exerciseById(p.exerciseId);
      for (const st of p.sets) {
        if (!Number.isInteger(st.reps)) continue;
        // Gate 2 Q6 — youth RESISTANCE work sits inside the NSCA 6–15 band.
        // It is scoped to strength-category work on purpose: three
        // countermovement jumps in a power block is not a sub-band lift.
        if (ex?.classification?.category === 'strength') {
          strengthSets++;
          assert.ok(st.reps >= 6, `youth strength reps >= 6, got ${st.reps} on ${p.exerciseId}`);
          assert.ok(st.reps <= 15, `youth strength reps <= 15, got ${st.reps} on ${p.exerciseId}`);
        }
        // Gate 2 Q5 — the repetition fallback may not carry a main-strength
        // lift beyond 8 repetitions.
        if (b.blockType === 'main_strength') {
          mainStrengthSets++;
          assert.ok(st.reps <= 8, `main strength reps <= 8, got ${st.reps}`);
        }
      }
    }
  }
  assert.ok(strengthSets > 0, 'there was youth strength work to check');
  assert.ok(mainStrengthSets > 0, 'and main strength work to check');
});

test('4. the SC9.29 youth strength-frequency floor is applied', () => {
  // Two gym days against two rugby days and a Saturday match exceeds the
  // structured-day cap. The pre-Gate-2 rules cut the athlete to one gym
  // session; the floor holds him at two and tells the coach the week is dense.
  const out = generate(U18_FRONT_ROW);
  assert.equal(out.blueprint.frequency, 2, 'two strength sessions, not one');
  const days = prescriptionProjection(out)[0].days.map(d => d.day);
  assert.deepEqual(days, ['Mon', 'Wed'], 'on the days the athlete said he was free');
  const flags = out.blueprint.flags.map(f => f.id);
  assert.ok(flags.includes('youth_week_density_review'),
    'and the density is reported rather than silently accepted');
});

// ── 5. Restrictions actually exclude ───────────────────────────────────────

test('5. a supplied restriction excludes the exercises it contraindicates', () => {
  const clean = generate(U18_FRONT_ROW);
  const restricted = generate(U18_FRONT_ROW, {
    athleteState: {
      asOf: SCENARIO.now,
      availability: { status: 'constrained' },
      restrictions: [{
        id: 'r1', status: 'active', source: 'medical_staff', scope: 'movement',
        tags: ['unresolved_hamstring_issue'],
      }],
    },
  });

  // Every catalogue exercise carrying the tag, and what happened to it.
  const contraindicated = CATALOGUE
    .filter(e => (e.safety?.contraindicationTags || []).includes('unresolved_hamstring_issue'))
    .map(e => e.id);
  assert.ok(contraindicated.length >= 9, 'the SC9.32 mapping is present in Core\'s catalogue');

  const after = exercisesIn(restricted);
  for (const id of contraindicated) {
    assert.ok(!after.includes(id), `${id} is contraindicated and must not be prescribed`);
  }
  // And it actually bit: something the clean programme used is now gone.
  const removed = exercisesIn(clean).filter(id => contraindicated.includes(id));
  assert.ok(removed.length > 0,
    'the unrestricted programme did prescribe contraindicated work, so this is a real exclusion');
  assert.notEqual(digest(clean), digest(restricted), 'the programme genuinely changed');
});

test('5b. a REVIEW-ONLY tag is handed to the coach, never quietly dropped', () => {
  // `unresolved_knee_issue` is classified review_only: meaningful, but too
  // broad for the engine to turn into an exclusion list. It must not silently
  // do nothing — it is reported as something a coach has to apply by hand.
  const out = generate(U18_FRONT_ROW, {
    athleteState: {
      asOf: SCENARIO.now,
      availability: { status: 'constrained' },
      restrictions: [{
        id: 'r1', status: 'active', source: 'coach', scope: 'movement',
        tags: ['unresolved_knee_issue'],
      }],
    },
  });
  assert.ok(out.blueprint.flags.map(f => f.id).includes('athlete_restriction_not_mappable'));
  assert.ok(out.context.athleteState.statements.some(s => s.code === 'restriction_review_only'),
    'and the coach is told which restriction it was');
});

test('5b2. a restriction AWAITING REVIEW is applied meanwhile, and says so', () => {
  const out = generate(U18_FRONT_ROW, {
    athleteState: {
      asOf: SCENARIO.now,
      availability: { status: 'constrained' },
      restrictions: [{
        id: 'r1', status: 'requires_review', source: 'coach', scope: 'movement',
        tags: ['unresolved_hamstring_issue'],
      }],
    },
  });
  assert.ok(out.blueprint.flags.map(f => f.id).includes('athlete_restriction_review'));
  // Applied, not deferred: the exclusion happened while review is pending.
  const contraindicated = CATALOGUE
    .filter(e => (e.safety?.contraindicationTags || []).includes('unresolved_hamstring_issue'))
    .map(e => e.id);
  for (const id of exercisesIn(out)) {
    assert.ok(!contraindicated.includes(id), `${id} excluded while review is pending`);
  }
});

test('5c. a malformed or unknown restriction is REFUSED, not partially honoured', () => {
  // A tag outside the declared vocabulary cannot gate anything. The engine
  // refuses the whole call rather than generating a programme that silently
  // ignored one of the restrictions it was handed.
  const bad = (restrictions) => () => generate(U18_FRONT_ROW, {
    athleteState: { asOf: SCENARIO.now, availability: { status: 'constrained' }, restrictions },
  });
  assert.throws(bad([{ id: 'r1', status: 'active', tags: ['never_heard_of_this'] }]),
    /athlete_state_unknown_restriction_tag/);
  assert.throws(bad([{ id: 'r1', status: 'not_a_status', tags: [] }]),
    /athlete_state_bad_restriction_status/);
  assert.throws(bad('not an array'), /athlete_state_restrictions_must_be_an_array/);

  // A restriction with NO tags cannot reach selection — reported, never dropped.
  const out = generate(U18_FRONT_ROW, {
    athleteState: {
      asOf: SCENARIO.now, availability: { status: 'constrained' },
      restrictions: [{ id: 'r1', status: 'active', source: 'medical_staff', scope: 'movement', tags: [] }],
    },
  });
  assert.ok(out.blueprint.flags.map(f => f.id).includes('athlete_restriction_not_mappable'),
    'MISSING MAPPING is not CLEARANCE — a coach must be told to apply it');
});

test('5d. an unavailable training day is removed before anything is decided', () => {
  const out = generate(U18_FRONT_ROW, {
    athleteState: {
      asOf: SCENARIO.now,
      availability: { status: 'constrained', unavailableDays: ['Wed'] },
      restrictions: [],
    },
  });
  const days = prescriptionProjection(out).flatMap(w => w.days.map(d => d.day));
  assert.ok(!days.includes('Wed'), 'Wednesday is not programmed');
  assert.ok(days.includes('Mon'), 'Monday still is');
});

test('5e. no athleteState is recorded as absent, never as clearance', () => {
  const out = generate(U18_FRONT_ROW);
  assert.equal(out.context.athleteState.supplied, false);
  assert.ok(out.blueprint.flags.map(f => f.id).includes('restrictions_unknown')
    || out.context.athleteState.statements.some(s => s.code === 'athlete_state_absent'),
    'absence is stated, not assumed away');
});

// ── 6–7. Failure is failure ────────────────────────────────────────────────

test('6. an unavailable athlete fails generation rather than receiving a programme', () => {
  assert.throws(() => generate(U18_FRONT_ROW, {
    athleteState: { capturedAt: SCENARIO.now, availability: { status: 'unavailable' }, restrictions: [] },
  }), /athlete_unavailable/);
});

test('7. there is no fallback to the stale generator after an engine failure', () => {
  const { code } = generateDraftCode();
  const catchIdx = code.indexOf('} catch');
  assert.ok(catchIdx > 0, 'generation has a catch block');
  const handler = code.slice(catchIdx);
  for (const b of ['generateBlueprint', 'programmeDraftFromBlueprint']) {
    assert.ok(!handler.includes(b), `the catch must not reach for ${b}`);
  }
  assert.match(handler, /_perfAuthor\.error\s*=/, 'the failure is surfaced');
  assert.ok(!/_perfAuthor\.draft\s*=/.test(handler), 'and no draft is produced from a failure');
});

test('7b. engine refusals reach the coach in words, with the name kept', () => {
  const start = html.indexOf('    function perfEngineErrorText(');
  assert.ok(start > 0, 'the translator exists');
  const fn = html.slice(start, html.indexOf('\n    }', start));
  assert.match(fn, /athlete_unavailable/, 'the refusal names are translated');
  assert.match(fn, /\$\{name\}/, 'and the raw name is retained for support');
});

// ── 8. Review does not block ───────────────────────────────────────────────

test('8. review signals travel with a releasable programme, not in front of it', () => {
  const out = generate(U18_FRONT_ROW);
  const release = releaseDecision(out.blueprint);
  assert.equal(release.releasable, true, 'a healthy U18 is released');
  assert.ok(release.requiresCoachReview, 'while still giving the coach signals to read');
  assert.equal(release.blockedBy.length, 0);

  // Core reads the engine's decision rather than restating a policy of its own.
  const { code } = generateDraftCode();
  assert.match(code, /engine\.releaseDecision\(/, 'Core asks the engine');
  assert.match(code, /release\.releasable/, 'and gates on releasable, not on review');
  assert.ok(!/requiresCoachReview\s*\)\s*(\{|throw)/.test(code),
    'a review signal must never be turned into a block');
});

// ── 9. Provenance ──────────────────────────────────────────────────────────

test('9. the contract version is available and recorded with the programme', () => {
  assert.match(ENGINE_CONTRACT_VERSION, /^\d{4}\.\d{2}-sc\d+-beta\.\d+$/);
  const { code } = generateDraftCode();
  assert.match(code, /_perfAuthor\.engineContractVersion\s*=\s*built\.context\.contractVersion/,
    'the generating call records which contract produced the programme');
  assert.match(html, /engineContractVersion:\s*_perfAuthor\.engineContractVersion/,
    'and it is persisted with the draft');
});

// ── 10. Nothing internal reaches a player ──────────────────────────────────

test('10. the player-facing snapshot carries no engine internals', () => {
  const out = generate(U18_FRONT_ROW);
  // Core publishes before it assigns, exactly as perfPublishDraft does.
  publishProgrammeVersion(out.programme, 1, { actor: 'u-coach', now: SCENARIO.now });
  const snapshot = snapshotForProgrammeAssignment(out.programme, 1,
    { catalogue: CATALOGUE, now: SCENARIO.now });
  const json = JSON.stringify(snapshot);
  for (const leak of ['athleteState', 'restrictionTags', 'contraindicationTags', 'unresolved_hamstring_issue',
                      'developmentContext', 'eligibility', 'slotDefaults', 'blueprint_provenance',
                      'requiresReview', 'contractVersion']) {
    assert.ok(!json.includes(leak), `a player must not receive "${leak}"`);
  }
});

test('10b. Core never persists the engine context', () => {
  const { code } = generateDraftCode();
  assert.ok(!/provenance:\s*built\.context|context:\s*built\.context/.test(code),
    'the context is not stored');
  assert.ok(!/_perfAuthor\.context\s*=/.test(code), 'and it is not kept on the authoring state');
  // Only the version STRING is retained from it.
  assert.match(code, /built\.context\.contractVersion/);
});

// ── 11–12. Nothing else moved ──────────────────────────────────────────────

test('11. the Core draft → publish → assign flow is untouched', () => {
  assert.match(html, /op: 'save_draft'/, 'save_draft still posted');
  assert.match(html, /op: 'publish_programme'/, 'publish_programme still posted');
  assert.match(html, /op: 'create_assignment'/, 'create_assignment still posted');
  assert.match(html, /source: 'blueprint_generated'/, 'the stored source vocabulary is unchanged');
  // The review acknowledgement a coach already had is still theirs — SC9.36
  // changed where the programme comes from, not how a coach publishes it.
  assert.match(html, /requiresReview && !_perfAuthor\.ack/, 'the existing review step is preserved');
});

test('12. the existing Core workout surface still works', () => {
  for (const fn of ['createWorkoutSession', 'startWorkout', 'logSet', 'completeWorkout',
                    'eligibleSubstitutes', 'painStopExercise', 'getCatalogue', 'weekPlan',
                    'snapshotForProgrammeAssignment', 'authoringProfileFrom']) {
    assert.equal(typeof BARREL[fn], 'function', `${fn} is still exported`);
  }
  // A real session node out of a generated programme — the workout surface and
  // the generation surface still fit together.
  const out = generate(U18_FRONT_ROW);
  const sessionNode = out.programme.versions[0].phases[0].weeks[0].days[0].sessions[0];
  const session = BARREL.createWorkoutSession({
    athleteId: 'u-u18', sessionNode, catalogue: CATALOGUE, now: SCENARIO.now,
  });
  assert.equal(session.kind, 'workout_session');
  assert.ok(session.exerciseLogs.length, 'with the prescribed exercises loaded');
});

// ── 15–16. The real athlete, and equivalence with the canonical engine ─────

test('15. THE REAL ATHLETE — a U18 front row generates a coherent programme', () => {
  const out = generate(U18_FRONT_ROW);
  const weeks = prescriptionProjection(out);
  assert.equal(out.context.developmentContext, 'youth_u18', 'resolved as a youth athlete');
  assert.equal(weeks.length, 4);
  for (const w of weeks) {
    assert.deepEqual(w.days.map(d => d.day), ['Mon', 'Wed'], `week ${w.week} uses his gym days`);
    for (const d of w.days) {
      assert.ok(d.sessions.length, 'every day has a session');
      for (const s of d.sessions) assert.ok(s.blocks.some(b => b.prescriptions.length), 'with real work in it');
    }
  }
  assert.equal(releaseDecision(out.blueprint).releasable, true, 'and it is released to him');
});

test('16. EQUIVALENCE — Core prescribes byte-for-byte what the canonical engine does', () => {
  // The same digest is asserted by the standalone repository's own suite
  // (performance/tests/sc936-core-integration-contract.test.js). Core may
  // reshape a programme for its draft UI; it may not change one prescription.
  // If this fails, Core's vendored engine has drifted — resync it, do not
  // update the constant.
  const CANONICAL_DIGEST = '6cb832ba1db3f8c8c1747b95b7d6c099c687f51c91e46124da3ffe378d29cb79';
  assert.equal(digest(generate(U18_FRONT_ROW)), CANONICAL_DIGEST);
});

test('16b. generation is deterministic', () => {
  assert.equal(digest(generate(U18_FRONT_ROW)), digest(generate(U18_FRONT_ROW)));
});

test('16c. the projection Core sends is the one the engine reads', () => {
  // Core posts `authoringProfileFrom(...)` from the athlete's device and feeds
  // the server's copy straight back to the engine. Both ends of that round
  // trip must agree, or Core is generating from a shape nothing validated.
  const projection = authoringProfileFrom(U18_FRONT_ROW, { now: new Date(SCENARIO.now) });
  assert.equal(projection.kind, 'authoring_profile');
  const out = generateProgramme({ profile: projection, catalogue: CATALOGUE, ...SCENARIO });
  assert.equal(digest(out), digest(generate(U18_FRONT_ROW)),
    'the projection prescribes exactly what the full profile does');
});
