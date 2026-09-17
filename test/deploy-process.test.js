/**
 * CORE DEPLOYMENT SYSTEM — the decision logic that decides what reaches
 * production.
 *
 * These exercise the real functions from scripts/deploy-lib.mjs with plain
 * data: no repository, no network, no deployment. The rule under test
 * throughout is that ambiguity produces a REFUSAL, never a guess — a
 * deployment system that guesses is worse than one that stops.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  nextDeployNumber, classifyCandidates, verifyExclusionIntegrity,
  parseTestFailures, parseTestCounts, compareFailures,
  evaluateProtections, isBlocking, loadConfig, CONFIG_PATH,
  classifyAgainstProduction, lineOverlap,
  requiredRuntimeDependencies, assessTestEnvironments, compareFailuresChecked,
} from '../scripts/deploy-lib.mjs';

const TACTICS = { id: 'tactics-mount', commit: 'aaa111', subject: 'feat: mount the Tactics Board as a coach section', patchId: 'pt-tactics' };
const EXPORT = { id: 'club-export', commit: 'bbb222', subject: 'feat: add scoped club export for AI CEO', patchId: 'pt-export' };
const EXCLUSIONS = [TACTICS, EXPORT];

// ── branch numbering ─────────────────────────────────────────────────────
test('next deploy number follows the highest existing branch', () => {
  assert.equal(nextDeployNumber(['core-deploy-80', 'core-deploy-81', 'core-deploy-82']), 83);
  assert.equal(nextDeployNumber(['* core-deploy-82', '  core-deploy-9']), 83, 'numeric, not lexical; tolerates git markers');
  assert.equal(nextDeployNumber(['core-deploy-7', 'core-deploy-70', 'feature/x']), 71);
});

test('refuses to invent a starting number when no deploy branches exist', () => {
  assert.throws(() => nextDeployNumber(['main', 'feature/x']), /refusing to guess/);
  assert.throws(() => nextDeployNumber(['core-deploy-rc1', 'core-deploy-old']), /refusing to guess/,
    'non-numeric suffixes are not a basis for guessing');
});

// ── exclusion recognition ────────────────────────────────────────────────
test('a recognised exclusion is excluded — by patch identity, whatever its sha', () => {
  const candidates = [
    { sha: 'zzz999', subject: 'feat: mount the Tactics Board as a coach section', patchId: 'pt-tactics' },
    { sha: 'ccc333', subject: 'fix: something ordinary', patchId: 'pt-ordinary' },
  ];
  const { include, exclude, ambiguous } = classifyCandidates({ candidates, exclusions: EXCLUSIONS });
  assert.equal(exclude.length, 1);
  assert.equal(exclude[0].exclusionId, 'tactics-mount');
  assert.match(exclude[0].reason, /patch-id/);
  assert.deepEqual(include.map(c => c.sha), ['ccc333']);
  assert.deepEqual(ambiguous, [], 'a clean patch-id match is never ambiguous');
});

test('an exclusion is also caught by its recorded sha', () => {
  const { exclude } = classifyCandidates({
    candidates: [{ sha: 'bbb222', subject: 'renamed in a rebase', patchId: 'different' }],
    exclusions: EXCLUSIONS,
  });
  assert.equal(exclude.length, 1);
  assert.equal(exclude[0].exclusionId, 'club-export');
});

test('FAIL CLOSED: an adapted cherry-pick of excluded work is ambiguous, never included', () => {
  // Same subject, different patch — exactly how an adapted cherry-pick looks.
  const candidates = [{ sha: 'ddd444', subject: 'feat: mount the Tactics Board as a coach section', patchId: 'pt-DIFFERENT' }];
  const { include, exclude, ambiguous } = classifyCandidates({ candidates, exclusions: EXCLUSIONS });
  assert.deepEqual(include, [], 'must NOT ship');
  assert.deepEqual(exclude, [], 'and must not be silently swallowed either');
  assert.equal(ambiguous.length, 1);
  assert.match(ambiguous[0].reason, /adapted cherry-pick|patch differs/);
});

test('ordinary commits are selected, with no duplicate application', () => {
  const candidates = [
    { sha: 'e1', subject: 'fix: a', patchId: 'p1' },
    { sha: 'e2', subject: 'fix: b', patchId: 'p2' },
  ];
  const { include, exclude, ambiguous } = classifyCandidates({ candidates, exclusions: EXCLUSIONS });
  assert.deepEqual(include.map(c => c.sha), ['e1', 'e2']);
  assert.equal(exclude.length + ambiguous.length, 0);
  // Already-in-production commits never reach this function (git cherry filters
  // them by patch id), so selection cannot re-apply them.
  const second = classifyCandidates({ candidates: [], exclusions: EXCLUSIONS });
  assert.deepEqual(second.include, []);
});

// ── config integrity ─────────────────────────────────────────────────────
test('exclusion integrity: missing commit, subject drift and patch drift all reported', () => {
  assert.deepEqual(verifyExclusionIntegrity([
    { id: 'tactics-mount', exists: true, configured: TACTICS, actualSubject: TACTICS.subject, actualPatchId: 'pt-tactics' },
  ]), [], 'a matching exclusion reports no problem');

  const problems = verifyExclusionIntegrity([
    { id: 'gone', exists: false, configured: { commit: 'deadbeef', subject: 'x' } },
    { id: 'drifted', exists: true, configured: TACTICS, actualSubject: 'feat: something else entirely', actualPatchId: 'pt-tactics' },
    { id: 'repatched', exists: true, configured: EXPORT, actualSubject: EXPORT.subject, actualPatchId: 'pt-OTHER' },
  ]);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /does not exist/);
  assert.match(problems[1], /subject drift/);
  assert.match(problems[2], /patch-id drift/);
});

test('the committed config is valid and declares both production exclusions', () => {
  const cfg = loadConfig(CONFIG_PATH);
  assert.equal(cfg.exclusions.length, 2);
  assert.deepEqual(cfg.exclusions.map(e => e.id).sort(), ['club-export', 'tactics-mount']);
  assert.equal(cfg.policies.apiFunctionCap.max, 12);
  assert.equal(cfg.policies.baselineRelativeTesting.knownBaselineFailures.length, 2,
    'the two known failures stay declared, not quietly dropped');
  assert.ok(cfg.policies.performance.rule.includes('byte-identical'));
  // Critical rules must be inspectable as data, not buried in code.
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  for (const needle of ['tactics', 'club-export', 'performance', 'apiFunctionCap', 'baselineRelativeTesting', 'aliases']) {
    assert.ok(raw.includes(needle), `${needle} policy is documented in the config`);
  }
});

// ── adapted cherry-pick detection ────────────────────────────────────────
//
// Production is built by cherry-picking, so identical work can carry a
// different patch-id. The real case: e5fe0f20 was already live as c4c2ea09 —
// byte-identical changes, different patch-id — and re-applying it conflicted.

const MEDICAL_LINES = ['+  if (!injury.date) return false;', '-  return true;', '+  return validate(injury);'];
const LIVE = {
  sha: 'c4c2ea09aaaa', subject: 'fix(core): repair medical injury form validation',
  hash: 'sig-medical', lines: MEDICAL_LINES,
};
const OTHER_LIVE = { sha: 'bbb111222333', subject: 'feat: reorder training blocks', hash: 'sig-blocks', lines: ['+  moveBlock(id);'] };
const PRODUCTION = [LIVE, OTHER_LIVE];

test('an exact adapted cherry-pick is recognised as already live and skipped', () => {
  const candidate = { sha: 'e5fe0f20ffff', subject: LIVE.subject, hash: 'sig-medical', lines: [...MEDICAL_LINES] };
  const v = classifyAgainstProduction({ candidate, production: PRODUCTION });
  assert.equal(v.verdict, 'already-in-production');
  assert.equal(v.match.sha, LIVE.sha);
  assert.match(v.reason, /adapted cherry-pick|already in production/);
});

test('a genuinely new commit is included', () => {
  const candidate = { sha: '15865a6a0000', subject: 'feat(beta): hide manual training attendance recording', hash: 'sig-brand-new', lines: ['+  const hidden = true;'] };
  assert.equal(classifyAgainstProduction({ candidate, production: PRODUCTION }).verdict, 'new');
});

test('FAIL CLOSED: same subject but different content is ambiguous, never skipped', () => {
  // The dangerous case — looks like the live fix, is not the live fix.
  const candidate = { sha: 'dddd44445555', subject: LIVE.subject, hash: 'sig-DIFFERENT', lines: ['+  something else entirely;'] };
  const v = classifyAgainstProduction({ candidate, production: PRODUCTION });
  assert.equal(v.verdict, 'ambiguous');
  assert.match(v.reason, /same subject but DIFFERENT content/);
});

test('FAIL CLOSED: a near-match by content overlap is ambiguous, not included', () => {
  // Two of three lines shared: clearly related, provably not identical.
  const candidate = {
    sha: 'eeee55556666', subject: 'fix: a partially overlapping change', hash: 'sig-near',
    lines: [MEDICAL_LINES[0], MEDICAL_LINES[1], '+  brand new line;'],
  };
  const v = classifyAgainstProduction({ candidate, production: PRODUCTION });
  assert.equal(v.verdict, 'ambiguous');
  assert.match(v.reason, /overlap/);
});

test('an unrelated commit is NOT falsely skipped by incidental overlap', () => {
  const candidate = { sha: 'ffff66667777', subject: 'fix: unrelated work', hash: 'sig-unrelated', lines: ['+  unrelated();', '+  alsoUnrelated();'] };
  assert.equal(classifyAgainstProduction({ candidate, production: PRODUCTION }).verdict, 'new');
});

test('subject alone never causes a skip, and content alone never causes ambiguity', () => {
  // Same content, different subject → still already live (content is what ships).
  const renamed = { sha: 'aaaa11112222', subject: 'totally different wording', hash: 'sig-medical', lines: [...MEDICAL_LINES] };
  assert.equal(classifyAgainstProduction({ candidate: renamed, production: PRODUCTION }).verdict, 'already-in-production');
  // Empty production can never mark anything as live.
  assert.equal(classifyAgainstProduction({ candidate: renamed, production: [] }).verdict, 'new');
});

test('line overlap is a deterministic Jaccard ratio', () => {
  assert.equal(lineOverlap(['a', 'b'], ['a', 'b']), 1);
  assert.equal(lineOverlap(['a', 'b'], ['c', 'd']), 0);
  assert.equal(lineOverlap(['a', 'b'], ['a', 'c']), 1 / 3);
  assert.equal(lineOverlap([], []), 1, 'two empty changes are trivially equivalent');
});

test('exclusions and already-live detection compose without double-handling', () => {
  // A Tactics commit must be caught by the EXCLUSION layer and never reach
  // production comparison, even if production somehow contained similar lines.
  const candidates = [{ sha: 'zzz999', subject: TACTICS.subject, patchId: 'pt-tactics' }];
  const { include, exclude } = classifyCandidates({ candidates, exclusions: EXCLUSIONS });
  assert.equal(exclude.length, 1);
  assert.deepEqual(include, [], 'excluded work never reaches the already-live comparison');
});

// ── baseline-relative testing ────────────────────────────────────────────
const SPEC = [
  '✖ composes a full deterministic traveller twin (12.5ms)',
  '✖ permissions, navigation and group isolation are unchanged (2.0ms)',
  'ℹ tests 5474', 'ℹ pass 5472', 'ℹ fail 2',
].join('\n');

test('failing test names and counts are parsed from real spec output', () => {
  assert.deepEqual(parseTestFailures(SPEC), [
    'composes a full deterministic traveller twin',
    'permissions, navigation and group isolation are unchanged',
  ]);
  assert.deepEqual(parseTestCounts(SPEC), { total: 5474, passed: 5472, failed: 2 });
  assert.deepEqual(parseTestFailures('✖ failing tests:\nℹ fail 0'), [], 'the summary header is not a test name');
});

test('known pre-existing failures do not block, and are reported not hidden', () => {
  const known = ['composes a full deterministic traveller twin', 'permissions, navigation and group isolation are unchanged'];
  const v = compareFailures({ baseline: known, candidate: known });
  assert.equal(v.ok, true, 'a release is not blocked by failures it did not cause');
  assert.deepEqual(v.newFailures, []);
  assert.deepEqual(v.knownFailures.sort(), [...known].sort(), 'still surfaced, never silently swallowed');
});

test('a NEW failure blocks the release', () => {
  const v = compareFailures({
    baseline: ['composes a full deterministic traveller twin'],
    candidate: ['composes a full deterministic traveller twin', 'season stats export blanks unknown counts'],
  });
  assert.equal(v.ok, false);
  assert.deepEqual(v.newFailures, ['season stats export blanks unknown counts']);
  assert.deepEqual(v.knownFailures, ['composes a full deterministic traveller twin']);
});

test('a release that FIXES a baseline failure is credited and still passes', () => {
  const v = compareFailures({ baseline: ['a', 'b'], candidate: ['a'] });
  assert.equal(v.ok, true);
  assert.deepEqual(v.fixedFailures, ['b']);
});

test('a zero-failure baseline still blocks any new failure', () => {
  assert.equal(compareFailures({ baseline: [], candidate: ['boom'] }).ok, false);
  assert.equal(compareFailures({ baseline: [], candidate: [] }).ok, true);
});

// ── test-environment validity ────────────────────────────────────────────
//
// The real failure this guards against: a git worktree checks out tracked
// files only, node_modules is gitignored but partially tracked, so the
// baseline ran without `stripe` — 45 test files failed to load, 43 were
// reported as "fixed by this release", and a genuine regression could have
// hidden among the phantom failures.

const VALID_ENV = { dir: '/repo', resolved: ['stripe', 'web-push'], missing: [] };
const BROKEN_ENV = { dir: '/worktree', resolved: ['web-push'], missing: ['stripe'] };

test('a valid, equivalent pair of environments is accepted', () => {
  const v = assessTestEnvironments({ baseline: { ...VALID_ENV, dir: '/wt' }, candidate: VALID_ENV });
  assert.equal(v.ok, true);
  assert.match(v.reason, /both environments resolve/);
});

test('an incomplete baseline environment fails the gate — the exact node_modules bug', () => {
  const v = assessTestEnvironments({ baseline: BROKEN_ENV, candidate: VALID_ENV });
  assert.equal(v.ok, false);
  assert.match(v.reason, /baseline environment cannot resolve: stripe/);
  assert.match(v.reason, /hide a real regression/);
});

test('an incomplete candidate environment also fails the gate', () => {
  const v = assessTestEnvironments({ baseline: VALID_ENV, candidate: BROKEN_ENV });
  assert.equal(v.ok, false);
  assert.match(v.reason, /candidate environment cannot resolve: stripe/);
});

test('environments that resolve different dependency sets are not like-for-like', () => {
  const v = assessTestEnvironments({
    baseline: { dir: '/wt', resolved: ['web-push'], missing: [] },
    candidate: { dir: '/repo', resolved: ['stripe', 'web-push'], missing: [] },
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /different dependency sets|not be like-for-like/);
});

test('a missing probe is treated as unproven, never as valid', () => {
  assert.equal(assessTestEnvironments({ baseline: null, candidate: VALID_ENV }).ok, false);
  assert.equal(assessTestEnvironments({ baseline: VALID_ENV, candidate: null }).ok, false);
});

test('an INVALID baseline can never produce a comparison — no "known", no "fixed"', () => {
  const broken = assessTestEnvironments({ baseline: BROKEN_ENV, candidate: VALID_ENV });
  assert.throws(() => compareFailuresChecked({
    baseline: ['test/stripe-phase4.test.js', 'composes a full deterministic traveller twin'],
    candidate: ['composes a full deterministic traveller twin'],
    environment: broken,
  }), /refusing to compare test results/,
  'without this guard the phantom stripe failure would have been reported as "fixed by this release"');

  // And an omitted environment is refused too, so a future caller cannot
  // reintroduce the bug by simply forgetting to check.
  assert.throws(() => compareFailuresChecked({ baseline: [], candidate: [], environment: undefined }),
    /validity was never established/);
});

test('with a VALID environment the comparison behaves exactly as before', () => {
  const good = assessTestEnvironments({ baseline: { ...VALID_ENV, dir: '/wt' }, candidate: VALID_ENV });
  const known = 'composes a full deterministic traveller twin';
  const v = compareFailuresChecked({ baseline: [known], candidate: [known, 'brand new breakage'], environment: good });
  assert.equal(v.ok, false, 'a candidate-only failure is NEW and blocks');
  assert.deepEqual(v.newFailures, ['brand new breakage']);
  assert.deepEqual(v.knownFailures, [known], 'a genuine baseline failure stays known');
  assert.deepEqual(v.fixedFailures, []);
});

test('required runtime dependencies come from package.json dependencies', () => {
  assert.deepEqual(requiredRuntimeDependencies({ dependencies: { stripe: '1', 'web-push': '2' }, devDependencies: { playwright: '3' } }),
    ['stripe', 'web-push'], 'devDependencies are not needed to run the suite');
  assert.deepEqual(requiredRuntimeDependencies({}), []);
  // The real package.json must declare the two the api/ modules import.
  const real = requiredRuntimeDependencies(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
  assert.ok(real.includes('stripe') && real.includes('web-push'));
});

// ── production protections ───────────────────────────────────────────────
const CLEAN = {
  cleanTree: true, tacticsFileCount: 0, vercelignoreAllowsTactics: false,
  indexHasTacticsMount: false, indexHasTacticsSection: false,
  clubExportFileCount: 0, availabilityHasClubExport: false,
  performanceChangedFiles: 0, apiChangedFiles: 0, apiFunctionCount: 12,
  missionControlChanged: false, secretMatches: 0, boundaryMatches: 0,
  diffCheckClean: true, unexpectedFiles: [],
};
const POLICIES = { apiFunctionCap: { max: 12 } };
const ids = vs => vs.filter(x => x.severity === 'block').map(x => x.id);

test('a clean production candidate raises no blocking violation', () => {
  const v = evaluateProtections(CLEAN, POLICIES);
  assert.deepEqual(ids(v), []);
  assert.equal(isBlocking(v), false);
});

test('unexpected Tactics is detected in every form it could arrive', () => {
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, tacticsFileCount: 2 }, POLICIES)), ['tactics-files']);
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, vercelignoreAllowsTactics: true }, POLICIES)), ['tactics-vercelignore']);
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, indexHasTacticsMount: true }, POLICIES)), ['tactics-mount']);
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, indexHasTacticsSection: true }, POLICIES)), ['tactics-section']);
});

test('unexpected club-export is detected as files or as an endpoint', () => {
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, clubExportFileCount: 2 }, POLICIES)), ['club-export-files']);
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, availabilityHasClubExport: true }, POLICIES)), ['club-export-endpoint']);
});

test('Performance drift blocks: legacy S&C code must not move as a side effect', () => {
  const v = evaluateProtections({ ...CLEAN, performanceChangedFiles: 33 }, POLICIES);
  assert.deepEqual(ids(v), ['performance-drift']);
  assert.match(v[0].message, /33 file/);
});

test('platform constraints block: function cap, mission-control, secrets, boundary, whitespace', () => {
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, apiFunctionCount: 13 }, POLICIES)), ['api-function-cap']);
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, missionControlChanged: true }, POLICIES)), ['mission-control']);
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, secretMatches: 1 }, POLICIES)), ['secrets']);
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, boundaryMatches: 1 }, POLICIES)), ['core-intelligence-boundary']);
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, diffCheckClean: false }, POLICIES)), ['diff-check']);
});

test('a dirty working tree blocks — a deploy ships the working directory', () => {
  assert.deepEqual(ids(evaluateProtections({ ...CLEAN, cleanTree: false }, POLICIES)), ['clean-tree']);
});

test('api and out-of-surface changes warn for human attention without blocking', () => {
  const v = evaluateProtections({ ...CLEAN, apiChangedFiles: 1, unexpectedFiles: ['weird.txt'] }, POLICIES);
  assert.deepEqual(ids(v), [], 'not blocking');
  assert.deepEqual(v.map(x => x.id).sort(), ['api-changed', 'unexpected-files']);
  assert.equal(isBlocking(v), false);
});

test('several violations are all reported, not just the first', () => {
  const v = evaluateProtections({ ...CLEAN, tacticsFileCount: 1, clubExportFileCount: 1, apiFunctionCount: 13 }, POLICIES);
  assert.deepEqual(ids(v).sort(), ['api-function-cap', 'club-export-files', 'tactics-files']);
});
