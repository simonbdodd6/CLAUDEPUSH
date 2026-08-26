/**
 * SC2 — Athlete Profile & Intelligent Onboarding integration.
 *
 * Verifies the index.html integration of the SC2 athlete-profile foundation:
 * state namespace + normalisation, the inline mirror's lockstep with the
 * /performance modules, onboarding wiring, safety wording, and that nothing
 * leaks into Core screens.
 *
 * Tests:
 *  1.  performanceProfile is namespaced in defaultState and normalised on load
 *  2.  inline mirror block extracts and evaluates cleanly
 *  3.  save & resume: normalisation preserves the saved onboarding step
 *  4.  malformed stored data fails safe to a fresh state
 *  5.  future-versioned data is refused, migration seam exists
 *  6.  completion mirror is in lockstep with performance/domain profileCompletion
 *  7.  required paths are in lockstep and never include strength (no 1RM gate)
 *  8.  unknown answers satisfy required fields
 *  9.  PERF_OB_STEPS: 11 steps; strength & readiness optional
 * 10.  onboarding UI: progress, back/continue, skip, validation, review edits
 * 11.  wellness one-entry safety: capped rolling log, snapshots only
 * 12.  diagnosis language guard: every "diagnos*" occurrence is a negation
 * 13.  athlete list shows categories/flags, never raw wellness/pain/health
 * 14.  athlete detail shell exists, excludes sensitive categories
 * 15.  consent is explicit, readable and revocable (audit on withdrawal)
 * 16.  privacy step states conservative boundaries (admins/coaches)
 * 17.  Core screens do not reference the Performance profile namespace
 * 18.  Performance gate still guards the section (entitlement unchanged)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createEmptyProfile, profileCompletion, REQUIRED_PATHS } from '../performance/domain/athlete-profile.js';
import { ONBOARDING_STEPS } from '../performance/types/athlete-profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// Extract the contiguous SC2 inline-mirror block (constants + pure helpers)
// and evaluate it in isolation. It is deliberately free of DOM and app state.
function mirrorScope() {
  const start = html.indexOf('// ── CoachEasier Performance — athlete profile model (SC2, inline mirror) ──');
  const end = html.indexOf('const playerSections = [');
  assert.ok(start !== -1 && end !== -1 && end > start, 'mirror block markers present');
  const block = html.slice(start, end);
  return new Function(`${block}
    return { PERF_OB_STEPS, PERF_REQUIRED_PATHS, PERF_STEP_REQUIRED, perfIsAnswered, perfGetPath,
      perfSetPath, perfMissingRequired, perfStepComplete, perfProfileCompletionPct, perfEmptyProfile,
      perfNormalizeProfile, perfNormalizeProfileState, perfInitialProfileState, PERF_PROFILE_MIGRATIONS,
      PERF_PROFILE_STATE_VERSION, PERF_WELLNESS_LOG_MAX };`)();
}
const M = mirrorScope();

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === '(') parenDepth++;
    if (source[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return source.slice(start, i);
}

function mirrorMinimalProfile() {
  const p = M.perfEmptyProfile('u1', '2026-08-01T10:00:00');
  p.personal.ageBand = '21_29';
  p.rugby.primaryPosition = 'openside_flanker';
  p.rugby.playingLevel = 'amateur_club';
  p.rugby.seasonPhase = 'pre_season';
  p.training.experience = 'intermediate';
  p.training.preferredSessionMinutes = 60;
  p.schedule.availableDays = ['Mon', 'Wed'];
  p.equipment.locations = ['team_gym'];
  p.goals = [{ id: 'g1', type: 'max_strength', importance: 5, status: 'active' }];
  p.sharing.consentAcceptedAt = '2026-08-01T10:00:00';
  return p;
}

test('1. performanceProfile namespaced in defaultState and normalised on load', () => {
  assert.match(html, /performanceProfile: null,/);
  assert.match(html, /next\.performanceProfile = input\.performanceProfile == null \? null : perfNormalizeProfileState\(input\.performanceProfile\);/);
});

test('2. inline mirror block evaluates', () => {
  assert.equal(typeof M.perfNormalizeProfileState, 'function');
  assert.equal(M.PERF_PROFILE_STATE_VERSION, 1);
});

test('3. save & resume: saved onboarding step survives normalisation', () => {
  const saved = {
    stateVersion: 1,
    profile: mirrorMinimalProfile(),
    onboarding: { step: 'equipment', startedAt: '2026-08-01T10:00:00', completedAt: null, skippedSteps: ['strength'] },
    wellnessLog: [],
  };
  const restored = M.perfNormalizeProfileState(JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.onboarding.step, 'equipment', 'resume returns to the saved step');
  assert.deepEqual(restored.onboarding.skippedSteps, ['strength']);
  assert.equal(restored.profile.rugby.primaryPosition, 'openside_flanker');
});

test('4. malformed stored data fails safe', () => {
  for (const bad of [null, 'junk', 9, [], { nonsense: 1 }, { stateVersion: 'x' }]) {
    const s = M.perfNormalizeProfileState(bad);
    assert.equal(s.stateVersion, 1);
    assert.equal(s.profile, null);
    assert.equal(s.onboarding.step, 'welcome');
  }
  const badStep = M.perfNormalizeProfileState({ stateVersion: 1, onboarding: { step: 'teleport' } });
  assert.equal(badStep.onboarding.step, 'welcome');
});

test('5. future versions refused; migration seam present', () => {
  assert.equal(M.perfNormalizeProfileState({ stateVersion: 2 }).profile, null);
  assert.equal(M.perfNormalizeProfile({ version: 99 }), null);
  assert.equal(typeof M.PERF_PROFILE_MIGRATIONS, 'object');
  assert.match(html, /PERF_PROFILE_MIGRATIONS\[st\.stateVersion\]/, 'normalizer consults the migration map');
});

test('6. completion mirror is in lockstep with performance/domain', () => {
  const cases = [];
  const empty = M.perfEmptyProfile('u1', null);
  cases.push([empty, createEmptyProfile({ userId: 'u1' })]);
  const min = mirrorMinimalProfile();
  const minModule = createEmptyProfile({ userId: 'u1' });
  Object.assign(minModule.personal, { ageBand: '21_29' });
  Object.assign(minModule.rugby, { primaryPosition: 'openside_flanker', playingLevel: 'amateur_club', seasonPhase: 'pre_season' });
  Object.assign(minModule.training, { experience: 'intermediate', preferredSessionMinutes: 60 });
  minModule.schedule.availableDays = ['Mon', 'Wed'];
  minModule.equipment.locations = ['team_gym'];
  minModule.goals = [{ id: 'g1', type: 'max_strength', importance: 5, status: 'active' }];
  minModule.sharing.consentAcceptedAt = '2026-08-01T10:00:00';
  cases.push([min, minModule]);
  for (const [mirror, module] of cases) {
    assert.equal(M.perfProfileCompletionPct(mirror), profileCompletion(module).pct, 'mirror pct === module pct');
  }
  assert.equal(M.perfProfileCompletionPct(mirrorMinimalProfile()), 70, 'required-only = 70%');
});

test('7. required paths lockstep; strength never required (no 1RM gate)', () => {
  assert.deepEqual(M.PERF_REQUIRED_PATHS, REQUIRED_PATHS);
  assert.ok(!M.PERF_REQUIRED_PATHS.some(p => p.includes('strength')));
  assert.deepEqual(M.PERF_STEP_REQUIRED.strength, [], 'strength step never blocks');
  assert.deepEqual(M.PERF_STEP_REQUIRED.readiness, [], 'readiness step never blocks');
});

test('8. unknown answers satisfy required fields', () => {
  const p = mirrorMinimalProfile();
  p.personal.ageBand = 'unknown';
  assert.deepEqual(M.perfMissingRequired(p), []);
  assert.equal(M.perfIsAnswered('unknown'), true);
  assert.equal(M.perfIsAnswered(null), false);
});

test('9. onboarding steps mirror the module: 11 steps, optional flags intact', () => {
  assert.equal(M.PERF_OB_STEPS.length, 11);
  assert.deepEqual(M.PERF_OB_STEPS.map(s => s.id), ONBOARDING_STEPS.map(s => s.id));
  assert.equal(M.PERF_OB_STEPS.find(s => s.id === 'strength').required, false);
  assert.equal(M.PERF_OB_STEPS.find(s => s.id === 'readiness').required, false);
});

test('10. wizard UI: progress, back/continue/skip, validation, review edit links', () => {
  const wizard = extractFn(html, 'perfOnboardingHtml');
  assert.match(wizard, /perf-ob-progress/, 'progress indicator');
  assert.match(wizard, /perfObBack\(\)/);
  assert.match(wizard, /perfObNext\(\)/);
  assert.match(wizard, /perfObSkip\(\)/, 'skip for optional steps');
  const next = extractFn(html, 'perfObNext');
  assert.match(next, /perfStepComplete/, 'continue validates the step');
  assert.match(next, /_perfObError = "Please answer/, 'validation message');
  const body = extractFn(html, 'perfObStepBody');
  assert.match(body, /perfObGoto\('\$\{stepId\}','review'\)/, 'review rows link back to their step');
  // The done screen must stay honest about generation: SC8 made programme
  // building real, so the claim is now "the coach can build from this, and it
  // appears once assigned" — never that a programme already exists.
  assert.match(body, /it will appear in My Programme once they assign it/i, 'no false generation claim');
  assert.doesNotMatch(body, /when programme building arrives/i, 'stale pre-SC8 copy removed');
});

test('11. wellness entries are capped snapshots, never permanent profile edits', () => {
  const commit = extractFn(html, 'perfObCommitWellness');
  assert.match(commit, /wellnessLog/, 'wellness goes to the rolling log');
  assert.match(commit, /slice\(-PERF_WELLNESS_LOG_MAX\)/, 'log capped');
  assert.ok(!/profile\.wellness/.test(commit), 'no permanent profile field is written');
  assert.match(html, /one rough day never defines your profile/i, 'copy states the snapshot rule');
});

test('12. diagnosis language guard: within Performance, "diagnos*" only ever appears negated', () => {
  // Scope to the Performance module regions — Core support screens legitimately
  // use "diagnostics" in the technical (system-report) sense.
  const regions = [
    html.slice(html.indexOf('athlete profile model (SC2, inline mirror)'), html.indexOf('const playerSections = [')),
    html.slice(html.indexOf('COACHEASIER PERFORMANCE — premium S&C module'), html.indexOf('    function render() {')),
  ];
  const re = /diagnos\w*/gi;
  let count = 0;
  for (const region of regions) {
    let m;
    while ((m = re.exec(region)) !== null) {
      count++;
      const before = region.slice(Math.max(0, m.index - 60), m.index).toLowerCase();
      assert.ok(/not a|never|no medical|isn'?t a|nothing here/.test(before),
        `"${m[0]}" must be negated; context: "${before.trim().slice(-50)}"`);
    }
  }
  assert.ok(count >= 2, 'the safety disclaimers exist in the Performance regions');
});

test('13. athlete list: programme decision data only — no sensitive data', () => {
  // SC8 replaced the sample fixture with REAL server-scoped athletes. The
  // guarantee that mattered is unchanged and now stronger: the coach list
  // carries squad classification and assignment status, never health data —
  // and the server projection (performance-assignment-api test 6) enforces it
  // rather than the browser merely declining to render it.
  const list = extractFn(html, 'perfAthletesHtml');
  // The list now reaches that payload through the shared scoping helper, which
  // narrows it to the group being viewed. Both halves stay pinned.
  assert.match(list, /perfScopedAthletes\(\)/, 'athletes come through the shared scoping helper');
  assert.match(extractFn(html, 'perfScopedAthletes'), /_perfAssign\.athletes/,
    'and that helper reads the scoped server payload');
  assert.match(list, /perfDevCategoryLabel/, 'development category shown as a category');
  assert.match(list, /No programme assigned/, 'assignment status shown honestly');
  for (const banned of ['wellnessLog', 'pain.', 'health.', 'injuryHistory', 'physioInstructions',
                        'readiness', 'medical']) {
    assert.ok(!list.includes(banned), `list must not reference ${banned}`);
  }
});

test('14. athlete detail shell excludes sensitive data references', () => {
  const detail = extractFn(html, 'perfAthleteDetailHtml');
  // Ban DATA references (paths/fields), not prose — the shell's disclaimer
  // legitimately mentions the words "wellness and health information".
  for (const banned of ['wellnessLog', '.pain', '.health', 'injuryHistory', 'physioInstructions', 'medicalRestrictions', 'a.readiness >', 'severity']) {
    assert.ok(!detail.includes(banned), `detail shell must not surface ${banned}`);
  }
  assert.match(detail, /not shown here/i, 'explains sensitive data stays private');
  assert.match(detail, /perfAthleteClose/, 'back control present');
});

test('15. consent is explicit and revocable, with audit entries', () => {
  const consent = extractFn(html, 'perfObConsent');
  assert.match(consent, /consent_accepted/);
  assert.match(consent, /consent_withdrawn/, 'withdrawal path exists');
  const grant = extractFn(html, 'perfObGrant');
  assert.match(grant, /grant_added/);
  assert.match(grant, /grant_revoked/);
});

test('16. privacy step states conservative boundaries', () => {
  const body = extractFn(html, 'perfObStepBody');
  assert.match(body, /Club admins.*never automatically see health/i);
  assert.match(body, /Medical staff.*see nothing unless/i);
  assert.match(body, /never your private notes/i);
});

test('17. Core screens never touch the Performance profile namespace', () => {
  for (const fn of ['renderCoachOverview', 'renderTraining', 'renderSettings', 'renderPlayerHome', 'renderPlayers', 'renderMedical']) {
    const src = extractFn(html, fn);
    for (const banned of ['performanceProfile', 'perfOb', 'PERF_OB', 'wellnessLog']) {
      assert.ok(!src.includes(banned), `${fn} must not reference ${banned}`);
    }
  }
});

test('18. Performance entitlement gate unchanged', () => {
  const fn = extractFn(html, 'renderPerformance');
  // THE GATE is what this test guards, and it is untouched.
  assert.match(fn, /if \(!canUseFeature\('performance'\)\)/);
  // What a gated club is TOLD changed when the upgrade CTAs were removed:
  // an honest unavailable notice instead of an "Upgrade to Pro" prompt.
  assert.match(fn, /renderUnavailableNotice\('performance'\)/);
  assert.doesNotMatch(fn, /renderUpgradePrompt|upgradeFromFeature/, 'no upgrade route remains');
});
