#!/usr/bin/env node
// npm run deploy:check [-- <branch>] [--skip-tests]
//
// The release gate. Independently runnable against any deployment branch.
// Verifies the production protections declared in config/production-exclusions.json
// and compares the test suite against the PREVIOUS production branch, blocking
// only on failures this candidate introduces.
//
// Read-only: inspects git and runs tests. It never writes to the repository,
// never deploys, and never edits application code to make itself pass.
//
// Exit 0 = safe to release. Non-zero = blocked.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  REPO_ROOT, loadConfig, git, patchIdOf, subjectOf, commitExists,
  verifyExclusionIntegrity, evaluateProtections, isBlocking,
  parseTestFailures, parseTestCounts, compareFailuresChecked,
  requiredRuntimeDependencies, probeDependencyResolution, assessTestEnvironments,
  listDeployBranches, selectBaseline,
  h1, ok, bad, info, die,
} from './deploy-lib.mjs';

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const candidate = args.find(a => !a.startsWith('--')) || git(['branch', '--show-current']);

const cfg = loadConfig();
const prefix = cfg.deployBranchPrefix;

console.log(`CoachEasier Core — deployment gate`);
console.log(`candidate branch: ${candidate}`);

// ── baseline: the previous deploy branch below the candidate ─────────────
function deployBranches() {
  return listDeployBranches(prefix);
}
/**
 * The baseline is WHAT PRODUCTION IS SERVING, not simply NN-1.
 *
 * Deploy branches are not always a straight line: core-deploy-81 was prepared
 * and then abandoned (it carried an unrelated Performance cleanup), and 82 was
 * branched from 80 instead. Taking NN-1 blindly compared a release against a
 * branch that never shipped and reported 33 phantom "performance drift" files.
 * So: ask production, and fall back to the highest branch below the candidate
 * only when production cannot be reached — saying so loudly.
 */
async function baselineFor(branch) {
  let live = null;
  try {
    const res = await fetch('https://www.coacheasier.com/api/config', { signal: AbortSignal.timeout(20_000) });
    live = (await res.json())?.version ?? null;
  } catch { /* fall through to the positional fallback */ }

  const { baseline, reason } = selectBaseline({
    branches: deployBranches(),
    candidate: branch,
    live,
    shortShaOf: b => git(['rev-parse', '--short=7', b], { allowFail: true }),
    prefix,
  });
  if (reason === 'live') info(`live production serves ${live} → baseline ${baseline}`);
  if (reason === 'no-match') info(`live production serves ${live}, which matches no local deploy branch — falling back to position`);
  if (reason === 'unreachable') info('could not reach production to identify the baseline — falling back to position');
  if (!baseline) die(`cannot determine a production baseline below ${branch}`);
  return baseline;
}
const baseline = await baselineFor(candidate);
console.log(`production baseline: ${baseline}`);

// ── exclusion integrity: does the config still describe reality? ─────────
h1('exclusion integrity');
const resolved = cfg.exclusions.map(e => {
  const exists = commitExists(e.commit);
  return {
    id: e.id, exists, configured: e,
    actualSubject: exists ? subjectOf(e.commit) : null,
    actualPatchId: exists ? patchIdOf(e.commit) : null,
  };
});
const integrity = verifyExclusionIntegrity(resolved);
if (integrity.length) {
  integrity.forEach(bad);
  die('the declared production exclusions no longer match this repository — refusing to guess');
}
resolved.forEach(r => ok(`${r.id}: ${r.configured.commit.slice(0, 8)} "${r.actualSubject}"`));

// ── are excluded commits absent from the candidate? ──────────────────────
h1('excluded work absent from candidate');
for (const r of resolved) {
  // `git cherry <upstream> <head>`: a '-' line means the patch IS present upstream.
  const present = git(['cherry', candidate, r.configured.commit, `${r.configured.commit}^`], { allowFail: true });
  const inBranch = git(['branch', '--contains', r.configured.commit, '--list', candidate], { allowFail: true });
  const byPatch = present && present.startsWith('-');
  if ((inBranch && inBranch.trim()) || byPatch) {
    bad(`${r.id}: excluded work IS present in ${candidate}`);
    die(`${r.id} must never ship in Core production`);
  }
  ok(`${r.id}: absent`);
}

// ── gather facts ─────────────────────────────────────────────────────────
const show = (ref, file) => git(['show', `${ref}:${file}`], { allowFail: true }) || '';
const changedFiles = (a, b, p) => {
  const out = git(['diff', '--name-only', `${a}..${b}`, '--', p], { allowFail: true });
  return out ? out.split('\n').filter(Boolean) : [];
};
const idx = show(candidate, 'index.html');
const secretPatterns = cfg.policies.secrets.patterns.join('|');
const boundaryPatterns = cfg.policies.coreIntelligenceBoundary.patterns.join('|');
const grepCount = (pattern, paths) => {
  const out = git(['grep', '-lE', pattern, candidate, '--', ...paths], { allowFail: true });
  return out ? out.split('\n').filter(Boolean).length : 0;
};

const expected = new Set(['index.html', 'test/', 'src/', 'config/', 'scripts/', 'DEPLOY.md', 'package.json']);
const allChanged = changedFiles(baseline, candidate, '.');

const facts = {
  cleanTree: git(['status', '--porcelain']).trim() === '',
  tacticsFileCount: (git(['ls-tree', '-r', '--name-only', candidate], { allowFail: true }) || '')
    .split('\n').filter(f => f.startsWith('tactics/')).length,
  vercelignoreAllowsTactics: /^!\/tactics\s*$/m.test(show(candidate, '.vercelignore')),
  indexHasTacticsMount: idx.includes('TACTICS BOARD (separate product'),
  indexHasTacticsSection: idx.includes('coach-tactics'),
  clubExportFileCount: (git(['ls-tree', '-r', '--name-only', candidate], { allowFail: true }) || '')
    .split('\n').filter(f => /^api\/_clubExport/.test(f)).length,
  availabilityHasClubExport: show(candidate, 'api/availability.js').includes('club-export'),
  candidateBranch: candidate,
  performanceChangedFiles: changedFiles(baseline, candidate, 'performance/').length,
  apiChangedFiles: changedFiles(baseline, candidate, 'api/').length,
  apiFunctionCount: (git(['ls-tree', '-r', '--name-only', candidate], { allowFail: true }) || '')
    .split('\n').filter(f => /^api\/[^_/][^/]*\.js$/.test(f)).length,
  missionControlChanged: changedFiles(baseline, candidate, 'api/mission-control.js').length > 0,
  secretMatches: grepCount(secretPatterns, ['index.html', 'api/', 'src/']),
  boundaryMatches: grepCount(boundaryPatterns, cfg.policies.coreIntelligenceBoundary.appliesTo),
  diffCheckClean: git(['diff', '--check', `${baseline}..${candidate}`], { allowFail: true }) !== null,
  unexpectedFiles: allChanged.filter(f => ![...expected].some(p => f === p || f.startsWith(p))),
};

h1('production protections');
const violations = evaluateProtections(facts, cfg.policies);
info(`tactics files ${facts.tacticsFileCount} · club-export files ${facts.clubExportFileCount} · api functions ${facts.apiFunctionCount}/${cfg.policies.apiFunctionCap.max}`);
info(`performance/ changed ${facts.performanceChangedFiles} · api/ changed ${facts.apiChangedFiles} · files changed vs ${baseline}: ${allChanged.length}`);
if (!violations.length) ok('all structural protections hold');
violations.forEach(x => (x.severity === 'block' ? bad : info)(`[${x.severity}] ${x.id}: ${x.message}`));

// ── baseline-relative tests ──────────────────────────────────────────────
let testVerdict = null;
let environment = null;
if (skipTests) {
  info('tests SKIPPED (--skip-tests): structural checks only, NOT sufficient for a release');
} else {
  h1('baseline-relative test comparison');
  const runSuite = (cwd, label) => {
    info(`running full suite on ${label} (this takes a few minutes)…`);
    let out = '';
    try {
      out = execFileSync('npm', ['test'], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900_000 });
    } catch (e) { out = `${e.stdout || ''}${e.stderr || ''}`; }
    return { failures: parseTestFailures(out), counts: parseTestCounts(out) };
  };

  // Baseline runs in a throwaway worktree so the checkout is never disturbed.
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-deploy-baseline-'));
  let baseResult;
  try {
    git(['worktree', 'add', '--detach', wt, baseline]);

    // A worktree checks out TRACKED files only. node_modules is gitignored but
    // partially tracked, so the worktree gets an incomplete copy — without
    // `stripe`, 45 test files fail to load and the baseline becomes fiction.
    // Point the worktree at the same installed dependencies the candidate uses.
    fs.rmSync(path.join(wt, 'node_modules'), { recursive: true, force: true });
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(wt, 'node_modules'), 'dir');

    const required = requiredRuntimeDependencies(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')));
    const baseEnv = probeDependencyResolution(wt, required);
    const candEnv = probeDependencyResolution(REPO_ROOT, required);
    environment = assessTestEnvironments({ baseline: baseEnv, candidate: candEnv });
    if (!environment.ok) {
      bad(environment.reason);
      die('the baseline and candidate test environments are not provably valid and equivalent — no comparison was made, and nothing was classified as known or fixed');
    }
    ok(environment.reason);

    baseResult = runSuite(wt, baseline);
  } finally {
    git(['worktree', 'remove', '--force', wt], { allowFail: true });
    fs.rmSync(wt, { recursive: true, force: true });
  }
  const candResult = runSuite(REPO_ROOT, `${candidate} (current checkout)`);

  // Throws unless the environment was proven valid above.
  testVerdict = compareFailuresChecked({ baseline: baseResult.failures, candidate: candResult.failures, environment });
  info(`baseline  ${baseline}: ${baseResult.counts.passed}/${baseResult.counts.total} passed, ${baseResult.counts.failed} failing`);
  info(`candidate ${candidate}: ${candResult.counts.passed}/${candResult.counts.total} passed, ${candResult.counts.failed} failing`);
  testVerdict.knownFailures.forEach(f => info(`known pre-existing failure (not caused by this release): ${f}`));
  testVerdict.fixedFailures.forEach(f => ok(`this release FIXES a previously failing test: ${f}`));
  if (testVerdict.ok) ok('no new test failures introduced');
  else testVerdict.newFailures.forEach(f => bad(`NEW failure introduced by this release: ${f}`));
}

// ── verdict ──────────────────────────────────────────────────────────────
h1('verdict');
const blocked = isBlocking(violations) || (testVerdict && !testVerdict.ok);
if (blocked) {
  bad(`BLOCKED — ${candidate} must not be deployed`);
  console.log('\nFix the cause. Never weaken a test or strip a protection to pass this gate.\n');
  process.exit(1);
}
ok(`PASSED — ${candidate} satisfies every production protection`);
if (skipTests) { info('but tests were skipped, so this is NOT a release-ready verdict'); process.exit(2); }
console.log('');
