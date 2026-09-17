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

// ── PURE: next deploy branch number ──────────────────────────────────────
/** Highest existing <prefix>N plus one. Ignores anything not strictly numeric. */
export function nextDeployNumber(branchNames, prefix = 'core-deploy-') {
  const nums = branchNames
    .map(b => b.trim().replace(/^\*?\s*/, ''))
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
  return { hash: createHash('sha256').update(body).digest('hex'), lines: [...files.values()].flat() };
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
  if (facts.performanceChangedFiles > 0) {
    block('performance-drift', `performance/ differs from the production baseline in ${facts.performanceChangedFiles} file(s) — legacy S&C shell code must not change as a release side effect`);
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
