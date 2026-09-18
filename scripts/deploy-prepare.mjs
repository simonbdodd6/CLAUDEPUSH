#!/usr/bin/env node
// npm run deploy:prepare [-- --source <branch>] [--dry-run]
//
// Builds the next core-deploy-NN branch: the current production branch plus
// every feature commit not yet in production, MINUS the production-only
// commits declared in config/production-exclusions.json.
//
// It never deploys. It stops rather than guessing: an exclusion that no longer
// matches the repository, an ambiguous commit, or a cherry-pick conflict all
// abort and leave the repository as it was found.

import {
  loadConfig, git, patchIdOf, subjectOf, commitExists, listDeployBranches,
  verifyExclusionIntegrity, classifyCandidates, nextDeployNumber,
  changeSignature, classifyAgainstProduction, changeAlreadyIn, applyCherryPick,
  h1, ok, bad, info, die,
} from './deploy-lib.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cfg = loadConfig();
const prefix = cfg.deployBranchPrefix;
const source = (args.includes('--source') ? args[args.indexOf('--source') + 1] : null) || cfg.sourceBranch;

console.log('CoachEasier Core — prepare production branch');

// ── 1. repository must be quiet ──────────────────────────────────────────
h1('preconditions');
const startBranch = git(['branch', '--show-current']);
if (git(['status', '--porcelain']).trim() !== '') {
  die('working tree is not clean — commit or stash before preparing a release');
}
ok(`clean working tree (currently on ${startBranch})`);
if (!git(['rev-parse', '--verify', '--quiet', source], { allowFail: true })) die(`source branch ${source} not found`);
ok(`source branch: ${source} @ ${git(['rev-parse', '--short', source])}`);

// ── 2. current production branch, verified against LIVE production ───────
const branches = listDeployBranches(prefix);
const nextNum = nextDeployNumber(branches, prefix);
const production = `${prefix}${nextNum - 1}`;
const productionShort = git(['rev-parse', '--short=7', production]);
ok(`current production branch: ${production} @ ${productionShort}`);

let live = null;
try {
  const res = await fetch('https://www.coacheasier.com/api/config', { signal: AbortSignal.timeout(20_000) });
  live = (await res.json())?.version ?? null;
} catch (e) { info(`could not reach production to verify version (${e.message})`); }

if (live === null) {
  info('LIVE VERSION UNVERIFIED — continuing, but confirm manually before releasing');
} else if (live !== productionShort) {
  bad(`live production reports ${live}, but ${production} is ${productionShort}`);
  die('the newest deploy branch is not what production is serving — resolve this before preparing a release');
} else {
  ok(`live production matches ${production} (${live})`);
}

// ── 3. exclusion integrity ───────────────────────────────────────────────
h1('exclusion integrity');
const resolved = cfg.exclusions.map(e => {
  const exists = commitExists(e.commit);
  return { id: e.id, exists, configured: e, actualSubject: exists ? subjectOf(e.commit) : null, actualPatchId: exists ? patchIdOf(e.commit) : null };
});
const integrity = verifyExclusionIntegrity(resolved);
if (integrity.length) { integrity.forEach(bad); die('declared exclusions no longer match this repository'); }
resolved.forEach(r => ok(`${r.id}: "${r.actualSubject}"`));

// ── 4. what is eligible to ship ──────────────────────────────────────────
h1('commit selection');
const cherry = git(['cherry', production, source]).split('\n').filter(l => l.startsWith('+'));
const candidates = cherry.map(l => {
  const sha = l.split(/\s+/)[1];
  return { sha, subject: subjectOf(sha), patchId: patchIdOf(sha) };
});
info(`${candidates.length} commit(s) on ${source} not represented in ${production}`);

const exclusionsForMatching = cfg.exclusions.map(e => ({ id: e.id, commit: e.commit, subject: e.subject, patchId: e.patchId }));
const { include: notExcluded, exclude, ambiguous } = classifyCandidates({ candidates, exclusions: exclusionsForMatching });
exclude.forEach(c => info(`EXCLUDED  ${c.sha.slice(0, 8)} ${c.subject}  [${c.exclusionId}, ${c.reason}]`));

// ── 4b. is any remaining candidate ALREADY in production under a different
// patch-id? Production is built by cherry-picking, so identical work can
// carry a different patch identity; re-applying it conflicts.
const mergeBase = git(['merge-base', production, source]);
const prodShas = git(['rev-list', `${mergeBase}..${production}`]).split('\n').filter(Boolean);
info(`comparing against ${prodShas.length} production commit(s) since divergence for adapted cherry-picks…`);
const productionSignatures = prodShas.map(sha => {
  const sig = changeSignature(sha);
  return { sha, subject: subjectOf(sha), hash: sig.hash, lines: sig.lines, files: sig.files };
});

const include = [];
const alreadyPresent = [];
for (const c of notExcluded) {
  const sig = changeSignature(c.sha);
  const verdict = classifyAgainstProduction({
    candidate: { ...c, hash: sig.hash, lines: sig.lines, files: sig.files },
    production: productionSignatures,
  });
  // Containment is judged commit against commit; the TREE has the last word. A
  // claim the production tree does not bear out is never a reason to skip —
  // skipping it would silently drop real work — so it stops instead.
  if (verdict.basis === 'contained' && !changeAlreadyIn(c.sha, production)) {
    ambiguous.push({ ...c, reason: `${verdict.reason} — but applying it to ${production} would still change the tree, so it cannot be proven live` });
    continue;
  }
  if (verdict.verdict === 'already-in-production') { alreadyPresent.push({ ...c, ...verdict }); continue; }
  if (verdict.verdict === 'ambiguous') { ambiguous.push({ ...c, reason: verdict.reason }); continue; }
  include.push(c);
}

alreadyPresent.forEach(c => info(`ALREADY LIVE  ${c.sha.slice(0, 8)} ${c.subject}\n      ${c.reason}`));
include.forEach(c => ok(`include   ${c.sha.slice(0, 8)} ${c.subject}`));

if (ambiguous.length) {
  ambiguous.forEach(c => bad(`AMBIGUOUS ${c.sha.slice(0, 8)} ${c.subject}\n      ${c.reason}`));
  die('cannot decide whether the above ships — a human must resolve this. Nothing was created.');
}
if (!include.length) die('nothing to release: every eligible commit is already in production or excluded');

// ── 5. create the branch and apply ───────────────────────────────────────
const target = `${prefix}${nextNum}`;
if (git(['rev-parse', '--verify', '--quiet', target], { allowFail: true })) die(`${target} already exists`);

if (dryRun) {
  h1('dry run');
  info(`would create ${target} from ${production} and cherry-pick ${include.length} commit(s)`);
  process.exit(0);
}

h1(`creating ${target}`);
git(['checkout', '-q', '-b', target, production]);
ok(`created ${target} from ${production}`);

const applied = [];
const emptyPicks = [];
for (const c of include) {
  const r = applyCherryPick(c.sha);
  if (r.outcome === 'applied') { applied.push(c); ok(`applied ${c.sha.slice(0, 8)} ${c.subject}`); continue; }
  if (r.outcome === 'already-present') {
    // Proven empty: the change is already in this branch. Not an error, and
    // never committed as an empty commit — but always said out loud.
    emptyPicks.push(c);
    info(`ALREADY PRESENT ${c.sha.slice(0, 8)} ${c.subject}\n      applying it to ${production} changes nothing — skipped, not committed`);
    continue;
  }
  git(['checkout', '-q', startBranch], { allowFail: true });
  git(['branch', '-D', target], { allowFail: true });
  die(`cherry-pick of ${c.sha.slice(0, 8)} "${c.subject}" conflicted${r.unmerged?.length ? ` in ${r.unmerged.join(', ')}` : ''}. ${target} was removed and the repository restored to ${startBranch}. Resolve the conflict manually.`);
}
// Every selected commit proved to be already present: the branch would be a
// copy of production. That is nothing to release, not a release.
if (!applied.length) {
  git(['checkout', '-q', startBranch], { allowFail: true });
  git(['branch', '-D', target], { allowFail: true });
  die(`nothing to release: every selected commit was already present in ${production}. ${target} was removed.`);
}

// ── 6. summary ───────────────────────────────────────────────────────────
h1('result');
console.log(`  source branch:      ${source}`);
console.log(`  production base:    ${production} (${productionShort})`);
console.log(`  new deploy branch:  ${target} (${git(['rev-parse', '--short', 'HEAD'])})`);
console.log(`  commits included:   ${applied.length}`);
applied.forEach(c => console.log(`      + ${c.subject}`));
if (emptyPicks.length) {
  console.log(`  already present (empty cherry-pick, skipped): ${emptyPicks.length}`);
  emptyPicks.forEach(c => console.log(`      = ${c.subject}`));
}
console.log(`  commits excluded:   ${exclude.length}`);
exclude.forEach(c => console.log(`      - ${c.subject}  [${c.exclusionId}]`));
console.log(`  already in production (adapted cherry-pick): ${alreadyPresent.length}`);
alreadyPresent.forEach(c => console.log(`      = ${c.subject}  [live as ${c.match.sha.slice(0, 8)}]`));
console.log('\n  diff vs production:');
console.log(git(['diff', '--stat', `${production}..${target}`]).split('\n').map(l => `      ${l}`).join('\n'));

console.log(`\nNothing has been deployed. Next: inspect the diff, then run\n  npm run deploy:check\n`);
