/**
 * qa/github-agent.js — GitHub PR Agent (Phase 7)
 *
 * Planning only — generates PR documentation from PATCH_PROPOSAL.md.
 * Does NOT create branches, does NOT commit, does NOT push, does NOT open PRs.
 *
 * Writes three files to the repo root:
 *
 *   PR_SUMMARY.md        — GitHub PR description (problem, root cause, fix, risks, verification)
 *   COMMIT_MESSAGE.md    — Conventional commit (fix(qa): ...) ready to copy-paste
 *   REVIEW_CHECKLIST.md  — Manual + regression + approval checklist with sign-off block
 *
 * Also writes qa/history/pipeline-latest.json — machine-readable summary of what was
 * generated, so the Mission Control dashboard can surface the pipeline state.
 *
 * Called automatically by qa/nightly.js after qa/repair-agent.js completes.
 * Also runnable standalone:
 *   node qa/github-agent.js
 *   QA_GITHUB_MODEL=claude-haiku-4-5-20251001 node qa/github-agent.js
 *
 * If ANTHROPIC_API_KEY is not set, all three documents are generated deterministically
 * from the structured data in qa/history/ and PATCH_PROPOSAL.md.
 */

import fs   from 'node:fs';
import path from 'node:path';

const ROOT            = process.cwd();
const HISTORY_DIR     = path.join(ROOT, 'qa/history');
const HISTORY_IDX     = path.join(HISTORY_DIR, 'index.json');
const PATCH_REPORT    = path.join(ROOT, 'PATCH_PROPOSAL.md');
const INVEST_REPORT   = path.join(ROOT, 'INVESTIGATION_REPORT.md');
const PR_SUMMARY      = path.join(ROOT, 'PR_SUMMARY.md');
const COMMIT_MSG      = path.join(ROOT, 'COMMIT_MESSAGE.md');
const REVIEW_LIST     = path.join(ROOT, 'REVIEW_CHECKLIST.md');
const PIPELINE_JSON   = path.join(HISTORY_DIR, 'pipeline-latest.json');
const API_KEY         = process.env.ANTHROPIC_API_KEY;
const MODEL           = process.env.QA_GITHUB_MODEL ?? 'claude-sonnet-4-6';

// ─── History / failure loading ────────────────────────────────────────────────

function loadLatestRun() {
  if (!fs.existsSync(HISTORY_IDX)) return null;
  try {
    const idx   = JSON.parse(fs.readFileSync(HISTORY_IDX, 'utf8'));
    const entry = idx.runs?.at(-1);
    if (!entry) return null;
    const fp = path.join(HISTORY_DIR, entry.file);
    return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : null;
  } catch { return null; }
}

function loadPreviousPassingRun() {
  if (!fs.existsSync(HISTORY_IDX)) return null;
  try {
    const idx     = JSON.parse(fs.readFileSync(HISTORY_IDX, 'utf8'));
    const passing = idx.runs?.slice(0, -1).reverse().find(r => r.overall === 'passed');
    if (!passing) return null;
    const fp = path.join(HISTORY_DIR, passing.file);
    return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : null;
  } catch { return null; }
}

function findFailures(run) {
  const out = [];
  for (const wf of (run?.workflows ?? [])) {
    for (const [i, step] of wf.steps.entries()) {
      if (step.status === 'failed') out.push({ wf, step, stepIndex: i + 1 });
    }
  }
  return out;
}

function readFile(fp) {
  return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
}

// ─── Branch name ─────────────────────────────────────────────────────────────

function suggestBranchName(failures, latestRun) {
  if (!failures.length) return `fix/qa-clean-${todayDate()}`;
  const first   = failures[0];
  const wfId    = first.wf.id;
  const slug    = first.step.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return `fix/qa-w${wfId}-${slug}-${todayDate()}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Deterministic document generators ───────────────────────────────────────

/**
 * Derive a short commit title (≤ 72 chars) from the failures.
 * Tries to describe the first failure mechanistically.
 */
function shortTitle(failures) {
  if (!failures.length) return 'fix(qa): correct test fragility';

  const first   = failures[0];
  const step    = first.step.name.toLowerCase();
  const error   = (first.step.error ?? '').toLowerCase();

  // Pattern-matched short titles
  if (/navigat.*messages|messages.*nav/i.test(step) || /session.*expir|authpanel/i.test(error)) {
    return `fix(qa): dismiss 403-overlay in navigateToMessages()`;
  }
  if (/messages2|nav.*badge|getByRole.*messages/i.test(error)) {
    return `fix(qa): use regex locator for Messages nav button`;
  }
  if (/chatinput|sendmessage/i.test(step + error)) {
    return `fix(qa): ensure conversation exists before chatInput step`;
  }
  if (/devloginbtn|coach.*login/i.test(step + error)) {
    return `fix(qa): handle devLoginBtn timing in coachLogin()`;
  }

  // Generic: derive from step name
  const wfId = failures.map(f => `W${f.wf.id}`).join('/');
  const desc = first.step.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 44);
  return `fix(qa): ${wfId} — ${desc}`;
}

/**
 * Build a conventional-commit body explaining the failure, root cause, and fix.
 */
function buildCommitBody(failures, latestRun, patchText) {
  const firstFail  = failures[0];
  const allWfIds   = [...new Set(failures.map(f => `W${f.wf.id}`))].join(', ');
  const runCommit  = latestRun?.commit ?? 'unknown';
  const runAt      = latestRun?.runAt?.slice(0, 19).replace('T', ' ') ?? 'unknown';

  // Extract root cause from patch proposal if it exists
  let rootCauseLine = '';
  if (patchText) {
    const m = patchText.match(/### Root Cause Summary\s*\n+([\s\S]+?)(?=\n###|\n---)/);
    if (m) rootCauseLine = m[1].trim().replace(/\n+/g, ' ').slice(0, 300);
  }

  const failList = failures
    .slice(0, 3)
    .map(f => `  W${f.wf.id} step ${f.stepIndex}: "${f.step.name}"`)
    .join('\n');
  const moreStr = failures.length > 3 ? `\n  … and ${failures.length - 3} more` : '';

  return [
    rootCauseLine ? rootCauseLine : `Test regression detected in ${allWfIds}.`,
    '',
    `Failing step(s):`,
    failList + moreStr,
    '',
    `Details in INVESTIGATION_REPORT.md and PATCH_PROPOSAL.md.`,
    '',
    `Nightly run: ${runAt} UTC (commit ${runCommit})`,
    `Regression report: REGRESSION_REPORT.md`,
    `Patch proposal: PATCH_PROPOSAL.md`,
  ].join('\n');
}

/** Extract the proposed changes list from PATCH_PROPOSAL.md as plain text. */
function extractProposedChanges(patchText) {
  if (!patchText) return '_Patch proposal not found._';
  const m = patchText.match(/## Summary\s*\n+([\s\S]+?)(?=\n---)/);
  return m ? m[1].trim() : '_See PATCH_PROPOSAL.md for proposed changes._';
}

/** Extract risks from PATCH_PROPOSAL.md. */
function extractRisks(patchText) {
  if (!patchText) return [];
  const risks = [];
  const m = patchText.match(/### Risks\s*\n+([\s\S]+?)(?=\n###|\n---)/g);
  if (!m) return [];
  for (const block of m) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('-'));
    risks.push(...lines.map(l => l.replace(/^-\s*/, '')));
  }
  return [...new Set(risks)].slice(0, 8);
}

/** Extract verification commands from PATCH_PROPOSAL.md. */
function extractVerifCmds(patchText) {
  if (!patchText) return ['npm run qa:nightly'];
  const m = patchText.match(/### Exact Commands\s*\n+```[a-z]*\n([\s\S]+?)```/g);
  if (!m) return ['npm run qa:nightly'];
  const cmds = [];
  for (const block of m) {
    const lines = block.split('\n').slice(1, -1).filter(l => l.trim() && !l.trim().startsWith('#'));
    cmds.push(...lines);
  }
  return [...new Set(cmds)].slice(0, 6);
}

/** Extract files to modify from PATCH_PROPOSAL.md. */
function extractModifiedFiles(patchText) {
  if (!patchText) return [];
  const files = [];
  for (const m of (patchText.matchAll(/\| \*\*Files to modify\*\* \| (.+?) \|/g))) {
    const frag = m[1].replace(/`/g, '').trim();
    if (frag && frag !== '_none_') files.push(frag);
  }
  return [...new Set(files)];
}

// ─── Document: PR_SUMMARY.md ─────────────────────────────────────────────────

function generatePrSummaryDeterministic(failures, latestRun, prevPassing, patchText, investText, branch) {
  const allWfIds     = [...new Set(failures.map(f => `W${f.wf.id} — ${f.wf.label}`))];
  const risks        = extractRisks(patchText);
  const verifCmds    = extractVerifCmds(patchText);
  const modifiedFiles = extractModifiedFiles(patchText);
  const prevRunLine  = prevPassing
    ? `${prevPassing.runAt.slice(0, 10)} (commit \`${prevPassing.commit}\`)`
    : '_no previous passing run recorded_';

  // Extract analyst root cause
  let rootCause = '';
  if (investText) {
    const m = investText.match(/### Probable Root Cause\s*\n+([\s\S]+?)(?=\n###|\n---)/);
    if (m) rootCause = m[1].trim().replace(/\n+/g, ' ').slice(0, 400);
  }
  if (!rootCause && patchText) {
    const m = patchText.match(/### Root Cause Summary\s*\n+([\s\S]+?)(?=\n###|\n---)/);
    if (m) rootCause = m[1].trim().replace(/\n+/g, ' ').slice(0, 400);
  }
  if (!rootCause) rootCause = '_See INVESTIGATION_REPORT.md_';

  // Extract proposed fix summary
  let proposedFix = '';
  if (patchText) {
    const m = patchText.match(/\*\*Purpose:\*\* (.+)/g);
    if (m) proposedFix = m.map(line => `- ${line.replace(/\*\*Purpose:\*\* /, '')}`).join('\n');
  }
  if (!proposedFix) proposedFix = '_See PATCH_PROPOSAL.md_';

  const failureList = failures.map(f =>
    `| W${f.wf.id} | ${f.step.name}${f.step.context ? ' ['+f.step.context+']' : ''} | Step ${f.stepIndex} |`
  ).join('\n');

  return [
    `# PR: ${shortTitle(failures)}`,
    '',
    `**Branch:** \`${branch}\`  `,
    `**Type:** \`fix\` — QA regression repair  `,
    `**Scope:** \`qa\` — test helpers and specs only  `,
    `**Status:** PLANNED — not yet applied or pushed`,
    '',
    '---',
    '',
    '## Problem',
    '',
    `The nightly QA run at **${latestRun.runAt.slice(0, 19).replace('T', ' ')} UTC** (commit \`${latestRun.commit}\`) detected`,
    `${failures.length} regression${failures.length !== 1 ? 's' : ''} that were passing as of ${prevRunLine}.`,
    '',
    '**Affected workflows:**',
    ...allWfIds.map(w => `- ${w}`),
    '',
    '**Failed steps:**',
    '',
    '| Workflow | Step | # |',
    '|---|---|---|',
    failureList,
    '',
    '---',
    '',
    '## Root Cause',
    '',
    rootCause,
    '',
    '_Full analysis: [INVESTIGATION_REPORT.md](INVESTIGATION_REPORT.md)_',
    '',
    '---',
    '',
    '## Proposed Fix',
    '',
    proposedFix,
    '',
    ...(modifiedFiles.length ? [
      '**Files to modify:**',
      ...modifiedFiles.map(f => `- \`${f}\``),
      '',
    ] : []),
    '_Full patch: [PATCH_PROPOSAL.md](PATCH_PROPOSAL.md)_',
    '',
    '---',
    '',
    '## Risks',
    '',
    risks.length
      ? risks.map(r => `- ${r}`).join('\n')
      : '- No significant risks identified — all proposed changes target `qa/` files only',
    '',
    '---',
    '',
    '## Verification Steps',
    '',
    verifCmds.map((c, i) => `${i + 1}. Run \`${c}\` — expect all steps to pass`).join('\n'),
    '',
    '---',
    '',
    '## Related Files',
    '',
    '| File | Purpose |',
    '|---|---|',
    '| [REGRESSION_REPORT.md](REGRESSION_REPORT.md) | Run-vs-run diff, sparkline, regression list |',
    '| [INVESTIGATION_REPORT.md](INVESTIGATION_REPORT.md) | Root cause, component, confidence, DOM evidence |',
    '| [PATCH_PROPOSAL.md](PATCH_PROPOSAL.md) | Exact search/replace patch, risks, verification |',
    '| [COMMIT_MESSAGE.md](COMMIT_MESSAGE.md) | Ready-to-use conventional commit message |',
    '| [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) | Manual + regression + approval checklist |',
    '',
    '---',
    '',
    `_Generated by qa/github-agent.js · ${new Date().toISOString()}_`,
    '',
  ].join('\n');
}

// ─── Document: COMMIT_MESSAGE.md ─────────────────────────────────────────────

function generateCommitMessage(failures, latestRun, patchText) {
  const title = shortTitle(failures);
  const body  = buildCommitBody(failures, latestRun, patchText);

  return [
    '# COMMIT_MESSAGE.md',
    '',
    '> Copy the block below verbatim as your commit message.',
    '> Do not include the markdown header or the guidance lines.',
    '',
    '---',
    '',
    '```',
    title,
    '',
    body,
    '',
    'Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>',
    '```',
    '',
    '---',
    '',
    '## Usage',
    '',
    '```bash',
    `git add qa/helpers/shared-steps.js   # (or whichever file(s) the patch touches)`,
    `git commit -m "$(cat <<'EOF'`,
    title,
    '',
    body,
    '',
    'Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>',
    'EOF',
    `)"`,
    '```',
    '',
    `_Generated: ${new Date().toISOString()}_`,
    '',
  ].join('\n');
}

// ─── Document: REVIEW_CHECKLIST.md ───────────────────────────────────────────

function generateReviewChecklist(failures, latestRun, patchText, branch) {
  const verifCmds    = extractVerifCmds(patchText);
  const modifiedFiles = extractModifiedFiles(patchText);
  const risks        = extractRisks(patchText);

  // Extract confidence from patchText
  let confidence = '—';
  const confMatch = patchText?.match(/Confidence\s*\|\s*(\d+)%/);
  if (confMatch) confidence = `${confMatch[1]}%`;

  // Patch-apply steps derived from modifiedFiles
  const applySteps = modifiedFiles.length
    ? modifiedFiles.map((f, i) =>
        `- [ ] ${i + 1}. Open \`${f}\` and apply Change ${i + 1} from [PATCH_PROPOSAL.md](PATCH_PROPOSAL.md)`
      ).join('\n')
    : '- [ ] Apply changes described in [PATCH_PROPOSAL.md](PATCH_PROPOSAL.md)';

  // Per-workflow regression check rows
  const wfChecks = [...new Set(failures.map(f => f.wf.id))].map(id => {
    const wf = failures.find(f => f.wf.id === id)?.wf;
    return `- [ ] \`npm run qa:workflow-${id}\` — W${id} (${wf?.label ?? ''}) all steps pass`;
  }).join('\n');

  // Risk acknowledgements
  const riskAcks = risks.length
    ? risks.map((r, i) => `- [ ] Risk ${i + 1} acknowledged: _${r}_`).join('\n')
    : '- [ ] No significant risks — all changes target `qa/` files only';

  return [
    '# Review Checklist — QA Regression Fix',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Branch:** \`${branch}\``,
    `**Repair confidence:** ${confidence}`,
    `**Run:** ${latestRun.runAt.slice(0, 19).replace('T', ' ')} UTC (commit \`${latestRun.commit}\`)`,
    '',
    '> Complete each section in order before approving. Check each box only when confirmed.',
    '',
    '---',
    '',
    '## 1 — Pre-Apply: Read the Proposal',
    '',
    '- [ ] Read [INVESTIGATION_REPORT.md](INVESTIGATION_REPORT.md) — confirm root cause makes sense',
    '- [ ] Read [PATCH_PROPOSAL.md](PATCH_PROPOSAL.md) — confirm proposed change is correct',
    '- [ ] Verify the `searchFor` text in PATCH_PROPOSAL.md exists verbatim in the target file',
    '- [ ] Confirm **all** proposed changes target `qa/` files only (no app code)',
    '- [ ] Confirm no secrets, tokens, or config values are present in the patch',
    '',
    '---',
    '',
    '## 2 — Apply the Patch',
    '',
    applySteps,
    '- [ ] Double-check that no surrounding lines were accidentally modified',
    '- [ ] Run `git diff` to review changes before staging',
    '',
    '---',
    '',
    '## 3 — Regression Test',
    '',
    `Run these commands in order and confirm all pass:`,
    '',
    wfChecks,
    '- [ ] `npm run qa:nightly` — W4-W7 all pass, no new failures introduced',
    ...(verifCmds.filter(c => !c.includes('nightly') && !c.match(/workflow-\d/)).length
      ? ['', ...verifCmds
            .filter(c => !c.includes('nightly') && !c.match(/workflow-\d/))
            .map(c => `- [ ] \`${c}\``)]
      : []),
    '',
    '---',
    '',
    '## 4 — Risk Acknowledgement',
    '',
    riskAcks,
    '',
    '---',
    '',
    '## 5 — Final Approval',
    '',
    '- [ ] Root cause is mechanistically sound (not "retry harder" or "increase timeout")',
    '- [ ] Fix is minimal — no unrelated cleanup, refactoring, or added comments',
    '- [ ] All verification commands passed without modification to test expectations',
    '- [ ] This fix does not mask a real application bug (or, if it does, a separate issue has been filed)',
    '- [ ] REVIEW_CHECKLIST items 1–4 are all checked',
    '',
    '---',
    '',
    '## Sign-off',
    '',
    '```',
    'Reviewer  : ________________________',
    'Date      : ________________________',
    'Commit    : ________________________',
    'Notes     : ________________________',
    '```',
    '',
    '---',
    '',
    '## Quick Reference',
    '',
    '| Command | Purpose |',
    '|---|---|',
    ...verifCmds.map(c => `| \`${c}\` | Verify fix |`),
    `| \`git diff qa/\` | Review staged changes |`,
    `| \`node qa/analyst.js\` | Re-run analyst if needed |`,
    `| \`node qa/repair-agent.js\` | Regenerate patch proposal |`,
    '',
    `_Generated by qa/github-agent.js_`,
    '',
  ].join('\n');
}

// ─── Optional Claude enhancement ─────────────────────────────────────────────

const GITHUB_SYSTEM = `You are a technical writer generating GitHub PR documentation for a QA regression fix.

You will receive:
- Structured failure data (workflow, step, error)
- An investigation report (root cause, component, confidence)
- A patch proposal (proposed code change, risks, verification)

Write PR_SUMMARY.md: a clear, professional GitHub PR description.
Target audience: a senior engineer reviewing a QA-only patch.

Rules:
- Be precise and technical — no marketing language
- Under each section heading, write 2–5 concise sentences or a tight list
- Do NOT invent information not in the input
- Do NOT suggest changes to application code even if the root cause is an app bug

Respond with ONLY a JSON object — no markdown wrapper:
{
  "prSummary": "full PR_SUMMARY.md content as a string (use \\n for newlines)",
  "commitTitle": "conventional commit title, max 72 chars, format: fix(qa): ...",
  "commitBody": "commit body (multi-line, \\n between paragraphs)"
}`;

async function callGithubAgent(failures, latestRun, prevPassing, patchText, investText) {
  if (!API_KEY) return null;

  const failCtx = failures.slice(0, 3).map(f =>
    `W${f.wf.id} step ${f.stepIndex}: "${f.step.name}" — ${(f.step.error ?? 'no error').slice(0, 200)}`
  ).join('\n');

  const userContent = [
    `## Run metadata`,
    `Run: ${latestRun.runAt} (commit ${latestRun.commit})`,
    `Previous passing run: ${prevPassing?.runAt ?? 'none'}`,
    ``,
    `## Failures (${failures.length} total)`,
    failCtx,
    ``,
    `## Investigation report (excerpt)`,
    (investText ?? '(not available)').slice(0, 5_000),
    ``,
    `## Patch proposal (excerpt)`,
    (patchText ?? '(not available)').slice(0, 5_000),
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 2048,
        system:     GITHUB_SYSTEM,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      console.error(`[github] Claude API error ${res.status}`);
      return null;
    }

    const data    = await res.json();
    const rawText = data.content?.[0]?.text ?? '';
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);

  } catch (err) {
    console.error(`[github] Claude call failed: ${err.message}`);
    return null;
  }
}

// ─── Pipeline metadata ────────────────────────────────────────────────────────

function writePipelineJson(failures, latestRun, branch) {
  const meta = {
    generatedAt:   new Date().toISOString(),
    runAt:         latestRun.runAt,
    commit:        latestRun.commit,
    overall:       latestRun.overall,
    branch,
    failureCount:  failures.length,
    affectedWfs:   [...new Set(failures.map(f => f.wf.id))],
    outputs: {
      prSummary:    'PR_SUMMARY.md',
      commitMsg:    'COMMIT_MESSAGE.md',
      reviewList:   'REVIEW_CHECKLIST.md',
      investigation:'INVESTIGATION_REPORT.md',
      patchProposal:'PATCH_PROPOSAL.md',
      regression:   'REGRESSION_REPORT.md',
    },
  };
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.writeFileSync(PIPELINE_JSON, JSON.stringify(meta, null, 2));
}

// ─── Nightly report append ────────────────────────────────────────────────────

function appendPipelineToNightlyReport(failures, branch) {
  const NIGHTLY = path.join(ROOT, 'NIGHTLY_QA_REPORT.md');
  if (!fs.existsSync(NIGHTLY)) return;

  const existing = fs.readFileSync(NIGHTLY, 'utf8');
  // Avoid double-appending on re-runs
  if (existing.includes('## Regression Pipeline Artifacts')) return;

  const section = [
    '',
    '---',
    '',
    '## Regression Pipeline Artifacts',
    '',
    `> Regressions detected — the following documents were generated automatically.`,
    `> **None of these files modify application code.**`,
    '',
    `| Document | Purpose |`,
    `|---|---|`,
    `| [INVESTIGATION_REPORT.md](INVESTIGATION_REPORT.md) | Root cause, component, confidence, DOM evidence |`,
    `| [PATCH_PROPOSAL.md](PATCH_PROPOSAL.md) | Exact search/replace patch for qa/ files |`,
    `| [PR_SUMMARY.md](PR_SUMMARY.md) | GitHub PR description |`,
    `| [COMMIT_MESSAGE.md](COMMIT_MESSAGE.md) | Conventional commit, ready to copy-paste |`,
    `| [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) | Manual + regression + approval checklist |`,
    '',
    `**Suggested branch:** \`${branch}\``,
    '',
    `_Affected workflows: ${[...new Set(failures.map(f => `W${f.wf.id}`))].join(', ')}_`,
    '',
  ].join('\n');

  fs.appendFileSync(NIGHTLY, section);
  console.log('[github] Appended pipeline artifacts section to NIGHTLY_QA_REPORT.md');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(62)}`);
console.log(`  Coach's Eye — GitHub PR Agent`);
console.log(`  Mode: ${API_KEY ? `Claude API (${MODEL})` : 'Deterministic'}`);
console.log(`${'─'.repeat(62)}\n`);

const latestRun  = loadLatestRun();
const prevPassing = loadPreviousPassingRun();
const patchText  = readFile(PATCH_REPORT);
const investText = readFile(INVEST_REPORT);

if (!latestRun) {
  console.error('[github] No run data found at qa/history/ — run qa:nightly first.');
  process.exit(1);
}

console.log(`[github] Latest run  : ${latestRun.runAt} — ${latestRun.overall}`);

if (!patchText) {
  console.warn('[github] PATCH_PROPOSAL.md not found — repair agent may not have run yet.');
  console.warn('[github] Continuing with limited context (history data only).');
}

const failures = findFailures(latestRun);

if (failures.length === 0) {
  console.log('[github] No failures in latest run — writing "clean" PR documents.');
  const clean = `# PR_SUMMARY.md\n\n✅ No regressions detected in run \`${latestRun.runAt}\`. No PR required.\n`;
  fs.writeFileSync(PR_SUMMARY,  clean);
  fs.writeFileSync(COMMIT_MSG,  `# COMMIT_MESSAGE.md\n\n✅ No failures — no commit required.\n`);
  fs.writeFileSync(REVIEW_LIST, `# Review Checklist\n\n✅ All workflows passed — no review required.\n`);
  process.exit(0);
}

console.log(`[github] ${failures.length} failure(s) to document\n`);

const branch = suggestBranchName(failures, latestRun);
console.log(`[github] Suggested branch: ${branch}`);

// Try Claude for PR summary + commit message enhancement
let claudeResult = null;
if (API_KEY) {
  process.stdout.write('[github] Calling Claude for PR prose… ');
  claudeResult = await callGithubAgent(failures, latestRun, prevPassing, patchText, investText);
  console.log(claudeResult ? '✓' : '✗ fallback to deterministic');
}

// ─── Write PR_SUMMARY.md ─────────────────────────────────────────────────────
if (claudeResult?.prSummary) {
  fs.writeFileSync(PR_SUMMARY, claudeResult.prSummary + '\n');
} else {
  const content = generatePrSummaryDeterministic(
    failures, latestRun, prevPassing, patchText, investText, branch
  );
  fs.writeFileSync(PR_SUMMARY, content + '\n');
}
console.log('[github] Written: PR_SUMMARY.md');

// ─── Write COMMIT_MESSAGE.md ─────────────────────────────────────────────────
const commitTitle = claudeResult?.commitTitle ?? shortTitle(failures);
const commitBody  = claudeResult?.commitBody  ?? buildCommitBody(failures, latestRun, patchText);
const commitContent = generateCommitMessage(failures, latestRun, patchText);
// Splice in Claude's title/body if provided
const finalCommitContent = claudeResult
  ? commitContent
      .replace(shortTitle(failures), commitTitle)
      .replace(buildCommitBody(failures, latestRun, patchText), commitBody)
  : commitContent;
fs.writeFileSync(COMMIT_MSG, finalCommitContent + '\n');
console.log('[github] Written: COMMIT_MESSAGE.md');

// ─── Write REVIEW_CHECKLIST.md ───────────────────────────────────────────────
// Always deterministic — it's a checklist, not prose
const checklistContent = generateReviewChecklist(failures, latestRun, patchText, branch);
fs.writeFileSync(REVIEW_LIST, checklistContent + '\n');
console.log('[github] Written: REVIEW_CHECKLIST.md');

// ─── Write pipeline metadata ──────────────────────────────────────────────────
writePipelineJson(failures, latestRun, branch);
console.log('[github] Written: qa/history/pipeline-latest.json');

// ─── Append to nightly report ─────────────────────────────────────────────────
appendPipelineToNightlyReport(failures, branch);

console.log(`\n[github] Done. Branch: ${branch}`);
console.log(`[github] PR_SUMMARY.md · COMMIT_MESSAGE.md · REVIEW_CHECKLIST.md written.\n`);
