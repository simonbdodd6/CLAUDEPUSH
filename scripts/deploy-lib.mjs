// Core deployment system — shared logic.
//
// Everything that DECIDES something lives here as a pure function taking
// plain data, so test/deploy-process.test.js can exercise the real decision
// logic without a repository, a network, or a deployment. The thin git/shell
// helpers below are the only part that touches the world, and none of them
// writes to production.
//
// Design rule for every decision function: when the evidence is ambiguous it
// returns a FAILURE, never a guess. A deployment system that guesses is worse
// than one that stops.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'production-exclusions.json');

export function loadConfig(file = CONFIG_PATH) {
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(cfg.exclusions) || cfg.exclusions.length === 0) {
    throw new Error('production-exclusions.json declares no exclusions — refusing to run');
  }
  for (const e of cfg.exclusions) {
    if (!e.id || !e.commit || !e.subject) {
      throw new Error(`exclusion ${JSON.stringify(e.id || e)} is missing id/commit/subject`);
    }
  }
  return cfg;
}

// ── shell helpers (read-only unless the name says otherwise) ─────────────
export function git(args, { cwd = REPO_ROOT, allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trimEnd();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`git ${args.slice(0, 3).join(' ')} failed: ${String(e.stderr || e.message).trim().slice(0, 300)}`);
  }
}

export function patchIdOf(sha, cwd = REPO_ROOT) {
  const show = execFileSync('git', ['show', sha], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = execFileSync('git', ['patch-id', '--stable'], { cwd, input: show, encoding: 'utf8' }).trim();
  return out ? out.split(/\s+/)[0] : null;
}

export function subjectOf(sha, cwd = REPO_ROOT) {
  return git(['log', '-1', '--format=%s', sha], { cwd });
}

export function commitExists(sha, cwd = REPO_ROOT) {
  return git(['cat-file', '-t', sha], { cwd, allowFail: true }) === 'commit';
}

// ── deploy branch names ──────────────────────────────────────────────────
/**
 * `git branch` decorates its output: `* ` for the branch checked out HERE and
 * `+ ` for one checked out in ANOTHER worktree. Stripping only `*` once turned
 * `+ core-deploy-85` — production, held open in a linked worktree — into an
 * unresolvable name, so the gate could not find production and fell back to a
 * stale branch. Any display marker, either kind, never part of the name.
 */
export function stripBranchMarker(line) {
  return String(line || '').trim().replace(/^[*+]\s*/, '');
}

/**
 * The deploy branches, by NAME. Asked of `for-each-ref`, which prints ref names
 * and nothing else — no current-branch or worktree markers to strip at all.
 * stripBranchMarker still runs over the result: a harmless no-op here, and the
 * one normaliser every caller shares.
 */
export function listDeployBranches(prefix = 'core-deploy-', cwd = REPO_ROOT) {
  const out = git(['for-each-ref', '--format=%(refname:short)', `refs/heads/${prefix}*`], { cwd, allowFail: true }) || '';
  return out.split('\n').map(stripBranchMarker).filter(Boolean);
}

/**
 * Which deploy branch is production? PURE: the caller supplies the branch
 * names, how to read a branch's short SHA, and what production reported.
 *
 *   production answered + a branch serves it  → that branch   (reason 'live')
 *   production answered, no branch matches     → highest below the candidate
 *                                                (reason 'no-match' — loud)
 *   production unreachable                     → highest below the candidate
 *                                                (reason 'unreachable' — loud)
 *   nothing below the candidate                → null        (reason 'none')
 *
 * The candidate itself is never its own baseline.
 */
export function selectBaseline({ branches, candidate, live, shortShaOf, prefix = 'core-deploy-' }) {
  const all = branches.map(stripBranchMarker).filter(b => b && b !== candidate);
  const tail = String(candidate || '').startsWith(prefix) ? String(candidate).slice(prefix.length) : '';
  const num = /^\d+$/.test(tail) ? Number(tail) : null;

  if (live) {
    const match = all.find(b => shortShaOf(b) === live);
    if (match) return { baseline: match, reason: 'live' };
  }
  const nums = all.map(b => Number(b.slice(prefix.length))).filter(n => Number.isInteger(n));
  const below = num === null ? nums : nums.filter(n => n < num);
  if (!below.length) return { baseline: null, reason: 'none' };
  return { baseline: `${prefix}${Math.max(...below)}`, reason: live ? 'no-match' : 'unreachable' };
}

// ── PURE: next deploy branch number ──────────────────────────────────────
/** Highest existing <prefix>N plus one. Ignores anything not strictly numeric. */
export function nextDeployNumber(branchNames, prefix = 'core-deploy-') {
  const nums = branchNames
    .map(stripBranchMarker)
    .filter(b => b.startsWith(prefix))
    .map(b => b.slice(prefix.length))
    .filter(s => /^\d+$/.test(s))
    .map(Number);
  if (!nums.length) throw new Error(`no existing ${prefix}N branches found — refusing to guess a starting number`);
  return Math.max(...nums) + 1;
}

// ── PURE: exclusion matching + candidate selection ───────────────────────
/**
 * Decide, for each candidate commit, whether it ships or is an excluded
 * production-only commit.
 *
 * FAIL-CLOSED RULE: a candidate whose SUBJECT matches an exclusion but whose
 * PATCH-ID does not is AMBIGUOUS — it may be an adapted cherry-pick of work
 * we have decided never ships. We stop and ask rather than deciding.
 *
 * candidates: [{ sha, subject, patchId }]
 * exclusions: [{ id, commit, subject, patchId }]
 */
export function classifyCandidates({ candidates, exclusions }) {
  const include = [];
  const exclude = [];
  const ambiguous = [];

  for (const c of candidates) {
    const byPatch = exclusions.find(e => e.patchId && c.patchId && e.patchId === c.patchId);
    const bySubject = exclusions.find(e => e.subject === c.subject);
    const bySha = exclusions.find(e => e.commit === c.sha);

    if (byPatch || bySha) {
      exclude.push({ ...c, exclusionId: (byPatch || bySha).id, reason: byPatch ? 'patch-id match' : 'commit sha match' });
    } else if (bySubject) {
      ambiguous.push({
        ...c,
        exclusionId: bySubject.id,
        reason: `subject matches excluded commit "${bySubject.subject}" but the patch differs — this may be an adapted cherry-pick of work that must never ship`,
      });
    } else {
      include.push(c);
    }
  }
  return { include, exclude, ambiguous };
}

/**
 * Verify the configured exclusions still describe reality. Returns a list of
 * problems; a non-empty list must abort the run.
 * resolved: [{ id, exists, actualSubject, actualPatchId, configured{...} }]
 */
export function verifyExclusionIntegrity(resolved) {
  const problems = [];
  for (const r of resolved) {
    if (!r.exists) {
      problems.push(`exclusion "${r.id}": commit ${r.configured.commit} does not exist in this repository`);
      continue;
    }
    if (r.actualSubject !== r.configured.subject) {
      problems.push(`exclusion "${r.id}": subject drift — config says "${r.configured.subject}", repository says "${r.actualSubject}"`);
    }
    if (r.configured.patchId && r.actualPatchId && r.configured.patchId !== r.actualPatchId) {
      problems.push(`exclusion "${r.id}": patch-id drift — config ${r.configured.patchId.slice(0, 12)}, repository ${r.actualPatchId.slice(0, 12)}`);
    }
  }
  return problems;
}

// ── adapted cherry-pick detection ────────────────────────────────────────
//
// Production is built by cherry-picking, and a cherry-pick applied against
// different surrounding code produces a DIFFERENT patch-id for identical
// work. `git cherry` therefore reports such a commit as "not in production",
// and re-applying it conflicts — which is exactly what stopped the first
// rehearsal (e5fe0f20 was already live as c4c2ea09, byte-identical changes,
// different patch-id).
//
// The signature below is what a patch actually CHANGES, with line numbers and
// surrounding context removed: per file, the ordered sequence of added and
// removed lines. Two commits with the same signature made the same change,
// wherever it landed in the file.

/** Normalised change signature for one commit: { hash, lines }. */
export function changeSignature(sha, cwd = REPO_ROOT) {
  const out = execFileSync('git', ['show', '--format=', '--no-color', '-U0', sha],
    { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const files = new Map();
  let current = null;
  for (const line of out.split('\n')) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) { current = m[2]; files.set(current, []); continue; }
    if (!current) continue;
    // Drop headers and hunk markers; keep only real content changes.
    if (/^(\+\+\+|---|index |new file|deleted file|old mode|new mode|similarity|rename|copy|Binary|@@)/.test(line)) continue;
    if (/^[+-]/.test(line)) files.get(current).push(line);
  }
  const body = [...files.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([f, ls]) => `${f}\n${ls.join('\n')}`)
    .join('\n--\n');
  return {
    hash: createHash('sha256').update(body).digest('hex'),
    lines: [...files.values()].flat(),
    // Per file, so containment is judged WITHIN a file: an identical line in a
    // different file is a different change.
    files: Object.fromEntries(files),
  };
}

/** Jaccard overlap of two changed-line collections. */
export function lineOverlap(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let shared = 0;
  for (const x of A) if (B.has(x)) shared++;
  const union = A.size + B.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * A candidate's changes need this many meaningful lines before containment may
 * claim them. One coincidental line proves nothing, and a commit too small to
 * clear this falls through to the ordinary checks — where an empty cherry-pick
 * is still caught, and explained, when the branch is built.
 */
export const MIN_CONTAINED_LINES = 2;

/**
 * PURE. Is EVERY change in `candidate` already made by the single commit `prod`?
 *
 * Jaccard (lineOverlap) measures how alike two commits are, so a small commit
 * living inside a large one scores low: 48f50d72's 6 lines all sit inside
 * 65326e14's 47, yet overlap is 0.13. Containment asks the question that
 * matters — is all of the candidate's change already there?
 *
 * Deliberately strict, because a false "already live" silently drops real work
 * from a release:
 *   - judged per FILE: the same line in another file is a different change;
 *   - a file production never touched means the change is not there;
 *   - with multiplicity: a line added twice needs production to add it twice;
 *   - at least MIN_CONTAINED_LINES lines with real content (not just
 *     punctuation or whitespace) must be contained.
 *
 * Returns how many lines are contained, or 0 when containment does not hold.
 */
export function containedChangeLines(candidateFiles, prodFiles) {
  const names = Object.keys(candidateFiles || {});
  if (!names.length || !prodFiles) return 0;
  let contained = 0, meaningful = 0;
  for (const file of names) {
    const need = candidateFiles[file] || [];
    const have = prodFiles[file];
    if (!have) return 0;
    const pool = new Map();
    for (const l of have) pool.set(l, (pool.get(l) || 0) + 1);
    for (const l of need) {
      const left = pool.get(l) || 0;
      if (!left) return 0;
      pool.set(l, left - 1);
      contained++;
      if (/[A-Za-z0-9]/.test(l.slice(1))) meaningful++;
    }
  }
  return meaningful >= MIN_CONTAINED_LINES ? contained : 0;
}

/**
 * PURE. Is this candidate already in production, genuinely new, or unclear?
 *
 *   'already-in-production' — an exact signature match exists. Safe to skip.
 *   'ambiguous'             — overlapping or same-subject work whose content
 *                             differs. We cannot prove equivalence, so we stop.
 *   'new'                   — nothing comparable in production. Ship it.
 *
 * Subject is used only to RAISE suspicion, never to skip on its own: two
 * commits sharing a subject but not content are precisely the dangerous case.
 */
export function classifyAgainstProduction({ candidate, production, ambiguityThreshold = 0.5 }) {
  const exact = production.find(p => p.hash === candidate.hash);
  if (exact) {
    return {
      verdict: 'already-in-production',
      basis: 'exact',
      match: exact,
      reason: `identical changes already in production as ${exact.sha.slice(0, 8)} "${exact.subject}" (adapted cherry-pick: same content, different patch-id)`,
    };
  }
  const sameSubject = production.find(p => p.subject === candidate.subject);
  if (sameSubject) {
    return {
      verdict: 'ambiguous',
      match: sameSubject,
      reason: `production commit ${sameSubject.sha.slice(0, 8)} has the same subject but DIFFERENT content — cannot prove whether this work is already live`,
    };
  }
  // Contained: every change here is already made by ONE production commit. Only
  // when both sides carry per-file data. `basis: 'contained'` asks the caller
  // to confirm it against the real production TREE before skipping anything.
  if (candidate.files) {
    for (const p of production) {
      const n = containedChangeLines(candidate.files, p.files);
      if (n) {
        return {
          verdict: 'already-in-production',
          basis: 'contained',
          match: p,
          reason: `all ${n} changed line(s) are already made inside production commit ${p.sha.slice(0, 8)} "${p.subject}" (contained in a larger commit)`,
        };
      }
    }
  }
  for (const p of production) {
    const overlap = lineOverlap(candidate.lines, p.lines);
    if (overlap >= ambiguityThreshold) {
      return {
        verdict: 'ambiguous',
        match: p,
        reason: `${Math.round(overlap * 100)}% of these changes overlap production commit ${p.sha.slice(0, 8)} "${p.subject}" without matching it exactly`,
      };
    }
  }
  return { verdict: 'new' };
}

// ── git-backed: is a change really in the tree, and applying one safely ────
/**
 * Does applying `sha` to `target` change NOTHING? The proof behind a
 * containment claim: commit-to-commit comparison cannot see a line that
 * production added and a LATER production commit removed again, but the tree
 * can. A three-way merge onto the target that yields the target's own tree
 * means the change is present. Anything else — a difference, a conflict, an
 * unsupported git — is not proof, and returns false.
 */
export function changeAlreadyIn(sha, target, cwd = REPO_ROOT) {
  const out = git(['merge-tree', '--write-tree', `--merge-base=${sha}^`, target, sha], { cwd, allowFail: true });
  if (out === null) return false;
  const merged = out.split('\n')[0].trim();
  const targetTree = git(['rev-parse', `${target}^{tree}`], { cwd, allowFail: true });
  return !!merged && merged === targetTree;
}

/**
 * Cherry-pick one commit onto the current branch and say what happened.
 *
 *   'applied'          — committed normally.
 *   'already-present'  — git reports an EMPTY result: the change is already in
 *                        this branch. Skipped explicitly, never committed.
 *   'conflict'         — anything else, including any failure that cannot be
 *                        shown to be empty. The pick is aborted.
 *
 * "Empty" is proven, not inferred from failure: a cherry-pick must still be in
 * progress, with no unmerged paths and nothing staged. A failure that is not
 * that — a bad revision, a genuine conflict — is a conflict, and stops.
 */
export function applyCherryPick(sha, cwd = REPO_ROOT) {
  if (git(['cherry-pick', sha], { cwd, allowFail: true }) !== null) return { outcome: 'applied' };
  const inProgress = git(['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD'], { cwd, allowFail: true });
  const unmerged = (git(['diff', '--name-only', '--diff-filter=U'], { cwd, allowFail: true }) || '')
    .split('\n').filter(Boolean);
  const staged = git(['diff', '--cached', '--name-only'], { cwd, allowFail: true });
  if (inProgress && !unmerged.length && staged === '') {
    git(['cherry-pick', '--skip'], { cwd, allowFail: true });
    return { outcome: 'already-present' };
  }
  git(['cherry-pick', '--abort'], { cwd, allowFail: true });
  return { outcome: 'conflict', unmerged };
}

// ── PURE: baseline-relative test comparison ──────────────────────────────
/** Failing top-level test names from `node --test` spec output. */
export function parseTestFailures(output) {
  const names = new Set();
  for (const line of String(output || '').split('\n')) {
    const m = line.match(/^✖ (.+?)(?: \([\d.]+ms\))?\s*$/);
    if (m && m[1] !== 'failing tests:') names.add(m[1].trim());
  }
  return [...names];
}

export function parseTestCounts(output) {
  const grab = re => { const m = String(output || '').match(re); return m ? Number(m[1]) : null; };
  return { total: grab(/ℹ tests (\d+)/), passed: grab(/ℹ pass (\d+)/), failed: grab(/ℹ fail (\d+)/) };
}

// ── test-environment validity ────────────────────────────────────────────
//
// A baseline measured in a broken environment is worse than no baseline: it
// invents failures, reports them as "fixed", and can HIDE a real regression
// by making it look pre-existing. That happened — a git worktree checks out
// tracked files only, and because node_modules is gitignored but partially
// tracked, the baseline ran without `stripe` and produced 45 phantom
// failures. So the environments are now proven equivalent BEFORE any
// comparison, and the comparison refuses to run otherwise.

/** Runtime dependencies a test environment must be able to resolve. */
export function requiredRuntimeDependencies(pkg) {
  return Object.keys(pkg?.dependencies || {}).sort();
}

/** IO: which of `packages` resolve from `dir`. */
export function probeDependencyResolution(dir, packages) {
  const resolved = [];
  const missing = [];
  for (const name of packages) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '-e', `import.meta.resolve(${JSON.stringify(name)})`],
        { cwd: dir, stdio: 'ignore', timeout: 60_000 });
      resolved.push(name);
    } catch { missing.push(name); }
  }
  return { dir, resolved, missing };
}

/**
 * PURE. Are the two test environments valid and equivalent?
 * Returns { ok, reason }. Anything other than ok:true must abort the gate.
 */
export function assessTestEnvironments({ baseline, candidate }) {
  if (!baseline || !candidate) return { ok: false, reason: 'a test environment was not probed at all' };
  if (baseline.missing.length) {
    return { ok: false, reason: `baseline environment cannot resolve: ${baseline.missing.join(', ')} — a baseline measured here would invent failures and could hide a real regression` };
  }
  if (candidate.missing.length) {
    return { ok: false, reason: `candidate environment cannot resolve: ${candidate.missing.join(', ')}` };
  }
  const a = [...baseline.resolved].sort().join(',');
  const b = [...candidate.resolved].sort().join(',');
  if (a !== b) {
    return { ok: false, reason: `baseline and candidate resolve different dependency sets — the comparison would not be like-for-like (baseline: ${a || 'none'}; candidate: ${b || 'none'})` };
  }
  return { ok: true, reason: `both environments resolve ${baseline.resolved.length} required dependency/dependencies` };
}

/**
 * The gate: only failures the candidate INTRODUCES block a release.
 * Pre-existing failures are reported, never hidden, never used as an excuse.
 *
 * `environment` is REQUIRED and must be ok. Making it an argument rather than
 * a convention means an invalid baseline cannot produce a "known" or "fixed"
 * classification even if a future caller forgets to check first.
 */
export function compareFailuresChecked({ baseline, candidate, environment }) {
  if (!environment || environment.ok !== true) {
    throw new Error(`refusing to compare test results: ${environment?.reason || 'test environment validity was never established'}`);
  }
  return compareFailures({ baseline, candidate });
}

export function compareFailures({ baseline, candidate }) {
  const b = new Set(baseline);
  const c = new Set(candidate);
  return {
    newFailures: candidate.filter(n => !b.has(n)),
    knownFailures: candidate.filter(n => b.has(n)),
    fixedFailures: baseline.filter(n => !c.has(n)),
    ok: candidate.filter(n => !b.has(n)).length === 0,
  };
}

// ── PURE: production protection evaluation ───────────────────────────────
/**
 * `facts` are gathered by the caller (so this stays testable); `policies`
 * comes from production-exclusions.json. Returns [{ id, severity, message }].
 * severity 'block' stops a release; 'warn' is reported and continues.
 */
export function evaluateProtections(facts, policies) {
  const v = [];
  const block = (id, message) => v.push({ id, severity: 'block', message });
  const warn = (id, message) => v.push({ id, severity: 'warn', message });

  if (facts.cleanTree === false) block('clean-tree', 'working tree is not clean — a deploy ships the working directory, so uncommitted state would go live');

  // Tactics
  if (facts.tacticsFileCount > 0) block('tactics-files', `${facts.tacticsFileCount} tactics/ file(s) present — Tactics must never ship in Core`);
  if (facts.vercelignoreAllowsTactics) block('tactics-vercelignore', '.vercelignore contains `!/tactics` — the Tactics bundle would be uploaded');
  if (facts.indexHasTacticsMount) block('tactics-mount', 'index.html contains the Tactics mount block');
  if (facts.indexHasTacticsSection) block('tactics-section', 'index.html contains the coach-tactics section');

  // Club export
  if (facts.clubExportFileCount > 0) block('club-export-files', `${facts.clubExportFileCount} api/_clubExport*.js file(s) present`);
  if (facts.availabilityHasClubExport) block('club-export-endpoint', 'api/availability.js contains the club-export branch');

  // Performance / S&C
  //
  // The rule is "never as a SIDE EFFECT", not "never". The policy has always
  // said so in words; until SC9.38A the code said "never", so the one release
  // the exception exists for could not have shipped.
  //
  // An approval is PINNED to a named release branch. It therefore cannot leak
  // into the next one: ship performance/ again and this blocks again, which is
  // the point — the protection stays armed by default and opting out costs a
  // deliberate, reviewable edit to the config naming the exact branch.
  if (facts.performanceChangedFiles > 0) {
    const approved = policies?.performance?.approvedChange;
    const pinnedToThisRelease = !!approved
      && typeof approved.release === 'string'
      && approved.release === facts.candidateBranch;
    if (pinnedToThisRelease) {
      warn('performance-approved-change',
        `performance/ differs from the production baseline in ${facts.performanceChangedFiles} file(s) — APPROVED for ${approved.release}: ${approved.purpose}`);
    } else if (approved) {
      block('performance-drift',
        `performance/ differs from the production baseline in ${facts.performanceChangedFiles} file(s). An approvedChange exists but names ${approved.release}, not ${facts.candidateBranch} — approvals do not carry forward.`);
    } else {
      block('performance-drift',
        `performance/ differs from the production baseline in ${facts.performanceChangedFiles} file(s) — the vendored Performance engine must not change as a release side effect`);
    }
  }

  // Hard platform constraints
  const cap = policies?.apiFunctionCap?.max ?? 12;
  if (facts.apiFunctionCount > cap) block('api-function-cap', `${facts.apiFunctionCount} api functions exceeds the Vercel cap of ${cap} — every production deploy would fail`);
  if (facts.missionControlChanged) block('mission-control', 'api/mission-control.js differs from the production baseline');
  if (facts.secretMatches > 0) block('secrets', `${facts.secretMatches} hardcoded-secret pattern match(es) in shipped files`);
  if (facts.boundaryMatches > 0) block('core-intelligence-boundary', `${facts.boundaryMatches} Core/Intelligence boundary violation(s) in api/`);
  if (facts.diffCheckClean === false) block('diff-check', 'git diff --check reports whitespace or conflict-marker problems');

  if (facts.apiChangedFiles > 0) warn('api-changed', `${facts.apiChangedFiles} file(s) under api/ differ from the production baseline — confirm this API change is an approved part of this release`);
  if (Array.isArray(facts.unexpectedFiles) && facts.unexpectedFiles.length) {
    const shown = facts.unexpectedFiles.slice(0, 8).join(', ');
    const more = facts.unexpectedFiles.length > 8 ? ` (+${facts.unexpectedFiles.length - 8} more)` : '';
    warn('unexpected-files', `${facts.unexpectedFiles.length} file(s) outside the expected release surface changed: ${shown}${more}`);
  }
  return v;
}

export const isBlocking = violations => violations.some(x => x.severity === 'block');

// ── output helpers ───────────────────────────────────────────────────────
export const h1 = s => console.log(`\n=== ${s} ===`);
export const ok = s => console.log(`  ✓ ${s}`);
export const bad = s => console.log(`  ✗ ${s}`);
export const info = s => console.log(`  · ${s}`);

export function die(message) {
  console.error(`\nSTOPPED: ${message}\n`);
  process.exit(1);
}
