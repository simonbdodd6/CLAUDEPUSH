/**
 * qa/nightly.js — Nightly QA runner for Workflows 4–7
 *
 * Runs W4 → W5 → W6 → W7 sequentially, waits for all to complete regardless
 * of individual failures, aggregates results, and writes:
 *
 *   NIGHTLY_QA_REPORT.md    — full run report with diff column vs previous run
 *   REGRESSION_REPORT.md    — concise regression / fix / new-failure summary
 *   qa/history/status.html  — color-coded dashboard (green/red/yellow)
 *   qa/history/<run>.json   — compact per-run snapshot (step names + statuses)
 *   qa/history/index.json   — ordered list of all runs (max 30)
 *
 * Color conventions (dashboard + diff column):
 *   🟢 Green  — passed, no change since previous run
 *   🔴 Red    — failed, no change since previous run
 *   🟡 Yellow — status changed (regression OR fix) since previous run
 *   ⚫ Grey   — no previous data (first run or new step)
 *
 * Usage:
 *   QA_BASE_URL=https://... node qa/nightly.js
 *   npm run qa:nightly
 *
 * Exit code: 0 if all four workflows pass, 1 if any fail.
 */

import { spawn }        from 'node:child_process';
import fs               from 'node:fs';
import path             from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE_URL    = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const ROOT        = process.cwd();
const REPORT      = path.join(ROOT, 'NIGHTLY_QA_REPORT.md');
const REG_REPORT  = path.join(ROOT, 'REGRESSION_REPORT.md');
const HISTORY_DIR = path.join(ROOT, 'qa/history');
const HISTORY_IDX = path.join(HISTORY_DIR, 'index.json');
const STATUS_HTML = path.join(HISTORY_DIR, 'status.html');

// ─── Workflow registry ────────────────────────────────────────────────────────
const WORKFLOWS = [
  {
    id:         4,
    flag:       '--workflow-4',
    label:      'Group Invite → Approval',
    resultPath: 'qa/results/workflow-4.json',
    reportFile: 'QA_WORKFLOW_4_REPORT.md',
  },
  {
    id:         5,
    flag:       '--workflow-5',
    label:      'Coach ↔ Player DM Messaging',
    resultPath: 'qa/results/workflow-5.json',
    reportFile: 'QA_WORKFLOW_5_MESSAGING_REPORT.md',
  },
  {
    id:         6,
    flag:       '--workflow-6',
    label:      'Squad Broadcast → Receive → Permissions',
    resultPath: 'qa/results/workflow-6.json',
    reportFile: 'QA_WORKFLOW_6_REPORT.md',
  },
  {
    id:         7,
    flag:       '--workflow-7',
    label:      'Player Session Expiry Recovery',
    resultPath: 'qa/results/workflow-7.json',
    reportFile: 'QA_WORKFLOW_7_SESSION_EXPIRY_REPORT.md',
  },
];

// ─── Formatting helpers ───────────────────────────────────────────────────────

function redisEst(endpoint, method = 'GET') {
  if (endpoint.startsWith('/api/identity'))     return method === 'GET' ? 6 : 8;
  if (endpoint.startsWith('/api/chat'))         return 8;
  if (endpoint.startsWith('/api/invite'))       return method === 'POST' ? 8 : 4;
  if (endpoint.startsWith('/api/availability')) return 4;
  if (endpoint.startsWith('/api/cron'))         return 6;
  return 2;
}

function computeRedis(apiCalls = []) {
  return apiCalls.reduce((sum, c) => sum + redisEst(c.endpoint, c.method), 0);
}

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
}

function fmtStatus(s) {
  return s === 'passed' ? '✅ PASS' : s === 'failed' ? '❌ FAIL' : '⚠️  ' + (s ?? 'unknown').toUpperCase();
}

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

function mdList(items, empty = 'None') {
  return items.length ? items.map(i => `- ${i}`).join('\n') : `- ${empty}`;
}

function runWorkflow(flag) {
  return new Promise(resolve => {
    const proc = spawn(
      'node',
      [path.join(ROOT, 'qa/run-qa.js'), flag],
      { stdio: 'inherit', env: { ...process.env, QA_BASE_URL: BASE_URL }, cwd: ROOT }
    );
    proc.on('close', code => resolve(code ?? 1));
    proc.on('error', err  => { console.error('[nightly] spawn error:', err.message); resolve(1); });
  });
}

function readResult(resultPath) {
  const abs = path.join(ROOT, resultPath);
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch { return null; }
}

// ─── History ──────────────────────────────────────────────────────────────────

/**
 * Load the most recently completed nightly run from qa/history/.
 * Called BEFORE the current run executes, so "previous" is always the last
 * completed run, not the one being built right now.
 */
function loadPreviousRun() {
  if (!fs.existsSync(HISTORY_IDX)) return null;
  try {
    const idx = JSON.parse(fs.readFileSync(HISTORY_IDX, 'utf8'));
    if (!idx.runs?.length) return null;
    const prev     = idx.runs.at(-1);
    const prevFile = path.join(HISTORY_DIR, prev.file);
    if (!fs.existsSync(prevFile)) return null;
    return JSON.parse(fs.readFileSync(prevFile, 'utf8'));
  } catch { return null; }
}

/**
 * Build a compact run snapshot for history storage.
 * Passed steps store name/status/context only.
 * Failed steps also store error + artifact paths so the analyst can read them
 * from history without needing qa/results/ to still be on disk.
 */
function buildRunSummary(entries, totalMs) {
  return {
    runAt:       runAt,
    commit:      commit,
    baseURL:     BASE_URL,
    overall:     entries.every(e => e.status === 'passed') ? 'passed' : 'failed',
    passedSteps: entries.reduce((s, e) => s + (e.result?.steps?.filter(st => st.status === 'passed').length ?? 0), 0),
    totalSteps:  entries.reduce((s, e) => s + (e.result?.steps?.length ?? 0), 0),
    durationMs:  totalMs,
    redisOps:    entries.reduce((s, e) => s + computeRedis(e.result?.apiCalls), 0),
    workflows:   entries.map(e => ({
      id:         e.id,
      label:      e.label,
      status:     e.status,
      durationMs: e.durationMs,
      redisOps:   computeRedis(e.result?.apiCalls),
      steps:      (e.result?.steps ?? []).map(s => ({
        name:        s.name,
        status:      s.status,
        context:     s.context     ?? null,
        ...(s.status === 'failed' && {
          error:       s.error       ?? null,
          screenshot:  s.screenshot  ?? null,
          domSnapshot: s.domSnapshot ?? null,
        }),
      })),
    })),
  };
}

/** Append the current run to qa/history/, pruning to 30 entries. */
function saveRunHistory(summary) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const filename = `nightly-${runAt.replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(HISTORY_DIR, filename), JSON.stringify(summary, null, 2));

  const idx = fs.existsSync(HISTORY_IDX)
    ? JSON.parse(fs.readFileSync(HISTORY_IDX, 'utf8'))
    : { runs: [] };
  idx.runs.push({ runAt, file: filename, overall: summary.overall, commit: summary.commit });
  if (idx.runs.length > 30) idx.runs = idx.runs.slice(-30);
  fs.writeFileSync(HISTORY_IDX, JSON.stringify(idx, null, 2));
}

// ─── Regression comparison ────────────────────────────────────────────────────

/**
 * Diff the current run against the previous run.
 * Returns structured lists of regressions, fixes, and new failures.
 *
 * Definitions:
 *   regression  — step was PASS in previous run, is FAIL now
 *   fix         — step was FAIL in previous run, is PASS now
 *   new failure — step is FAIL and has no entry in the previous run
 */
function compareRuns(current, previous) {
  const regressions    = [];
  const fixes          = [];
  const newFailures    = [];
  const workflowDiffs  = [];

  for (const wf of current.workflows) {
    const prevWf = previous?.workflows?.find(w => w.id === wf.id);

    // Workflow-level status change
    const wfChange = prevWf
      ? (prevWf.status !== wf.status
          ? (prevWf.status === 'passed' ? 'regression' : 'fix')
          : null)
      : 'new';
    workflowDiffs.push({ id: wf.id, label: wf.label, current: wf.status, previous: prevWf?.status ?? null, change: wfChange });

    // Step-level comparison
    for (const step of wf.steps) {
      const key      = step.context ? `${step.name} [${step.context}]` : step.name;
      const prevStep = prevWf?.steps?.find(s => {
        const k = s.context ? `${s.name} [${s.context}]` : s.name;
        return k === key;
      });

      if (!prevStep) {
        if (step.status === 'failed') {
          newFailures.push({ wfId: wf.id, label: wf.label, stepName: key });
        }
      } else if (prevStep.status === 'passed' && step.status === 'failed') {
        regressions.push({ wfId: wf.id, label: wf.label, stepName: key });
      } else if (prevStep.status === 'failed' && step.status === 'passed') {
        fixes.push({ wfId: wf.id, label: wf.label, stepName: key });
      }
    }
  }

  return {
    hasPrevious:     !!previous,
    hasChanges:      regressions.length > 0 || fixes.length > 0 || newFailures.length > 0,
    regressions,
    fixes,
    newFailures,
    workflowDiffs,
    previousRunAt:   previous?.runAt    ?? null,
    previousCommit:  previous?.commit   ?? null,
    previousOverall: previous?.overall  ?? null,
  };
}

/** Returns the diff indicator for a single step in markdown. */
function stepDiffIndicator(step, prevWf) {
  const key      = step.context ? `${step.name} [${step.context}]` : step.name;
  const prevStep = prevWf?.steps?.find(s => {
    const k = s.context ? `${s.name} [${s.context}]` : s.name;
    return k === key;
  });
  if (!prevStep) return '⚫ new';
  if (prevStep.status === 'passed' && step.status === 'failed') return '🟡 regr';
  if (prevStep.status === 'failed' && step.status === 'passed') return '🟡 fixed';
  return '—';
}

/** Returns the workflow-level diff badge for the dashboard table. */
function wfDiffBadge(wfDiff) {
  if (!wfDiff || wfDiff.change === 'new')        return '⚫ new';
  if (wfDiff.change === 'regression')            return '🟡 REGR';
  if (wfDiff.change === 'fix')                   return '🟡 FIXED';
  const hasStepChange = wfDiff._hasStepChanges;
  return hasStepChange ? '🟡 steps↑' : '—';
}

// ─── Report generators ────────────────────────────────────────────────────────

function generateNightlyReport(entries, totalMs, allPassed, diff, previousRun) {
  // Enrich wfDiffs with step-level change flag
  const wfDiffs = diff.workflowDiffs.map(d => ({
    ...d,
    _hasStepChanges: diff.regressions.some(r => r.wfId === d.id)
                  || diff.fixes.some(f => f.wfId === d.id)
                  || diff.newFailures.some(n => n.wfId === d.id),
  }));

  const passedSteps = entries.reduce((s, e) => s + (e.result?.steps?.filter(st => st.status === 'passed').length ?? 0), 0);
  const totalSteps  = entries.reduce((s, e) => s + (e.result?.steps?.length ?? 0), 0);
  const totalRedis  = entries.reduce((s, e) => s + computeRedis(e.result?.apiCalls), 0);

  const diffColHeader = diff.hasPrevious ? 'vs prev' : 'vs prev';

  const dashRows = entries.map(e => {
    const steps    = e.result?.steps ?? [];
    const passed   = steps.filter(s => s.status === 'passed').length;
    const redis    = computeRedis(e.result?.apiCalls);
    const wfDiff   = wfDiffs.find(d => d.id === e.id);
    const badge    = diff.hasPrevious ? wfDiffBadge(wfDiff) : '⚫ new';
    return `| W${e.id} | ${e.label} | ${fmtStatus(e.status)} | ${badge} | ${passed}/${steps.length} | ${fmtMs(e.durationMs)} | ~${redis} |`;
  });

  const dashTotal = `| **—** | **Total** | **${fmtStatus(allPassed ? 'passed' : 'failed')}** | | **${passedSteps}/${totalSteps}** | **${fmtMs(totalMs)}** | **~${totalRedis}** |`;

  const prevLine = diff.hasPrevious
    ? `**Previous run:** ${diff.previousRunAt} (commit \`${diff.previousCommit}\`, overall: ${fmtStatus(diff.previousOverall)})`
    : `**Previous run:** _none — this is the first recorded run_`;

  // Per-workflow step tables (with diff column)
  const wfSections = entries.map(e => {
    const steps   = e.result?.steps ?? [];
    const prevWf  = previousRun?.workflows?.find(w => w.id === e.id);
    const heading = `### W${e.id} — ${e.label} — ${fmtStatus(e.status)}`;
    const header  = '| # | Step | Status | vs prev | Duration | Notes |';
    const sep     = '|---|---|---|---|---|---|';
    const rows    = steps.map((s, i) => {
      const ms   = (s.finishedAt && s.startedAt)
        ? Math.round(new Date(s.finishedAt) - new Date(s.startedAt)) + 'ms' : '—';
      const note = (s.error || s.note || '').slice(0, 100);
      const diff_ = diff.hasPrevious ? stepDiffIndicator(s, prevWf) : '⚫ new';
      return `| ${i + 1} | ${s.name}${s.context ? ' [' + s.context + ']' : ''} | ${s.status === 'passed' ? '✅' : '❌'} | ${diff_} | ${ms} | ${note} |`;
    });
    const meta = e.result
      ? `**Login method:** ${e.result.loginMethod ?? '—'}  |  **Base URL:** ${e.result.baseURL ?? '—'}`
      : '_No result data_';
    return [heading, '', meta, '', header, sep, ...rows].join('\n');
  });

  const failures = entries.filter(e => e.status !== 'passed').map(e => {
    const failStep = e.result?.steps?.find(s => s.status === 'failed');
    const shot     = failStep?.screenshot ? `  - Screenshot: \`${path.relative(ROOT, failStep.screenshot)}\`` : '';
    const snap     = failStep?.domSnapshot ? `  - HTML: \`${path.relative(ROOT, failStep.domSnapshot)}\`` : '';
    return [
      `#### W${e.id} — ${e.label}`,
      `- **First failure:** ${failStep ? `Step ${(e.result.steps.indexOf(failStep) + 1)} — "${failStep.name}"` : 'unknown'}`,
      failStep?.error ? `- **Error:** ${failStep.error.slice(0, 300)}` : '',
      shot, snap,
    ].filter(Boolean).join('\n');
  });

  const redisRows = entries.map(e =>
    `| W${e.id} | ${e.label} | ${e.result?.apiCalls?.length ?? 0} | ~${computeRedis(e.result?.apiCalls)} |`
  );

  const consoleErrors = entries.flatMap(e =>
    (e.result?.console ?? [])
      .filter(c => c.type === 'error' && !/401|403|404/.test(c.text))
      .slice(0, 5)
      .map(c => `[W${e.id}] ${c.text.slice(0, 120)}`)
  );

  const historyRows = (() => {
    if (!fs.existsSync(HISTORY_IDX)) return ['| — | — | — | — |'];
    const idx = JSON.parse(fs.readFileSync(HISTORY_IDX, 'utf8'));
    return idx.runs.slice(-10).reverse().map((r, i) =>
      `| ${r.runAt.slice(0, 19).replace('T', ' ')} | \`${r.commit}\` | ${r.overall === 'passed' ? '✅' : '❌'} ${r.overall.toUpperCase()} | ${i === 0 ? '← current' : ''} |`
    );
  })();

  const lines = [
    '# Coach\'s Eye — Nightly QA Report',
    '',
    `**Date:** ${runAt}`,
    `**Commit:** \`${commit}\``,
    `**Base URL:** ${BASE_URL}`,
    `**Overall: ${fmtStatus(allPassed ? 'passed' : 'failed')}**`,
    prevLine,
    '',
    '---',
    '',
    '## Dashboard Summary',
    '',
    `| # | Workflow | Status | ${diffColHeader} | Steps | Duration | ~Redis ops |`,
    '|---|---|---|---|---|---|---|',
    ...dashRows,
    dashTotal,
    '',
    diff.hasPrevious && diff.hasChanges
      ? `> 🟡 = status changed vs previous run · ⚫ = new step · — = unchanged`
      : `> ⚫ = no previous run data for comparison`,
    '',
    '---',
    '',
    '## Failures',
    '',
    ...(failures.length > 0 ? failures : ['_No failures — all workflows passed._']),
    '',
    '---',
    '',
    '## Per-Workflow Step Detail',
    '',
    ...wfSections.flatMap(s => [s, '']),
    '---',
    '',
    '## Redis Impact',
    '',
    '| Workflow | Description | API calls | ~Redis ops |',
    '|---|---|---|---|',
    ...redisRows,
    `| **—** | **Total** | **${entries.reduce((s, e) => s + (e.result?.apiCalls?.length ?? 0), 0)}** | **~${totalRedis}** |`,
    '',
    '---',
    '',
    '## Run History (last 10)',
    '',
    '| Run at | Commit | Overall | |',
    '|---|---|---|---|',
    ...historyRows,
    '',
    '---',
    '',
    '## Per-Workflow Reports',
    '',
    ...entries.map(e => `- W${e.id}: [${e.reportFile}](${e.reportFile})`),
    '',
    '## Artifacts',
    '',
    ...entries.map(e => {
      const dir  = path.join(ROOT, 'qa/artifacts');
      if (!fs.existsSync(dir)) return `- W${e.id}: no artifacts directory`;
      const runs = fs.readdirSync(dir).filter(d => d.startsWith(`workflow${e.id}-`)).sort().reverse();
      return runs.length
        ? `- W${e.id}: \`qa/artifacts/${runs[0]}/\``
        : `- W${e.id}: no artifact directory found`;
    }),
    '',
    '## Console Errors (non-4xx)',
    '',
    mdList(consoleErrors, 'None'),
    '',
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- All workflows run even when earlier ones fail.',
    '- NIGHTLY_QA_REPORT.md and REGRESSION_REPORT.md are overwritten on each run.',
    '',
  ].filter(l => l !== null && l !== undefined);

  fs.writeFileSync(REPORT, `${lines.join('\n')}\n`);
  console.log('[nightly] Report written: NIGHTLY_QA_REPORT.md');
}

function generateRegressionReport(diff, currentSummary, previousRun) {
  const ts = new Date().toISOString();

  const topLine = diff.regressions.length > 0
    ? `🔴 **${diff.regressions.length} REGRESSION${diff.regressions.length > 1 ? 'S' : ''} DETECTED**`
    : diff.newFailures.length > 0
      ? `🟡 **${diff.newFailures.length} NEW FAILURE${diff.newFailures.length > 1 ? 'S' : ''} (no previous data)**`
      : diff.fixes.length > 0
        ? `🟢 **${diff.fixes.length} FIX${diff.fixes.length > 1 ? 'ES' : ''} — no regressions**`
        : !diff.hasPrevious
          ? `⚫ **FIRST RUN — no previous data to compare**`
          : `✅ **CLEAN — no changes detected**`;

  const wfCompRows = diff.workflowDiffs.map(d => {
    const prev    = d.previous ? fmtStatus(d.previous) : '_(none)_';
    const curr    = fmtStatus(d.current);
    const change  = !d.change  ? '—'
                  : d.change === 'regression' ? '🟡 REGRESSED'
                  : d.change === 'fix'        ? '🟡 FIXED'
                  : d.change === 'new'        ? '⚫ NEW'
                  :                            '—';
    return `| W${d.id} | ${d.label} | ${prev} | ${curr} | ${change} |`;
  });

  const stepDiffSection = (label, items, icon) =>
    items.length === 0
      ? `### ${label}\n\n_None._`
      : `### ${label}\n\n` + items.map(i =>
          `- **W${i.wfId}** — ${i.label} → \`${i.stepName}\``
        ).join('\n');

  // Run history sparkline (last 10 runs, most recent last)
  const sparkline = (() => {
    if (!fs.existsSync(HISTORY_IDX)) return '_(no history)_';
    const idx = JSON.parse(fs.readFileSync(HISTORY_IDX, 'utf8'));
    return idx.runs.slice(-10).map(r => r.overall === 'passed' ? '🟢' : '🔴').join(' ');
  })();

  const lines = [
    '# Coach\'s Eye — Regression Report',
    '',
    `**Generated:** ${ts}`,
    `**Current run:** ${currentSummary.runAt} (commit \`${currentSummary.commit}\`)`,
    diff.hasPrevious
      ? `**Previous run:** ${diff.previousRunAt} (commit \`${diff.previousCommit}\`)`
      : `**Previous run:** _none (first recorded run)_`,
    '',
    `## ${topLine}`,
    '',
    '---',
    '',
    `## Run History (last 10 runs, oldest → newest)`,
    '',
    sparkline,
    '',
    '---',
    '',
    '## Workflow Status Comparison',
    '',
    '| # | Workflow | Previous | Current | Change |',
    '|---|---|---|---|---|',
    ...wfCompRows,
    '',
    '---',
    '',
    stepDiffSection('🔴 Regressions — were PASS, now FAIL', diff.regressions, '🔴'),
    '',
    stepDiffSection('🟢 Fixes — were FAIL, now PASS', diff.fixes, '🟢'),
    '',
    stepDiffSection('🟡 New Failures — no previous data', diff.newFailures, '🟡'),
    '',
    '---',
    '',
    '## What "regression" means here',
    '',
    '- A specific **step** within a workflow had status `passed` in the previous run',
    '  and has status `failed` in the current run.',
    '- Workflow-level regressions are derived: if any step regresses, its workflow regresses.',
    '- A "new failure" is a failed step with no history entry — it may be a pre-existing problem',
    '  or a step added since the last run.',
    '',
    '## What to do next',
    '',
    diff.regressions.length > 0
      ? '1. Open `NIGHTLY_QA_REPORT.md` → find the 🟡 rows in the per-workflow step table.\n'
      + '2. Check the screenshot and HTML snapshot listed in the Artifacts section.\n'
      + '3. Run the failing workflow individually: `QA_BASE_URL=... npm run qa:workflow-N`'
      : '_No action required — no regressions._',
    '',
  ].filter(l => l !== null && l !== undefined);

  fs.writeFileSync(REG_REPORT, `${lines.join('\n')}\n`);
  console.log('[nightly] Report written: REGRESSION_REPORT.md');
}

function generateStatusDashboard(entries, diff, currentSummary, previousRun) {
  const allPassed = entries.every(e => e.status === 'passed');

  // Determine per-workflow color: green, red, or yellow (changed)
  function wfColor(e) {
    const wfDiff = diff.workflowDiffs.find(d => d.id === e.id);
    if (!diff.hasPrevious) return e.status === 'passed' ? '#22c55e' : '#ef4444';
    const hasStepChange =
      diff.regressions.some(r => r.wfId === e.id)  ||
      diff.fixes.some(f => f.wfId === e.id)         ||
      diff.newFailures.some(n => n.wfId === e.id)   ||
      (wfDiff?.change && wfDiff.change !== 'new');
    if (hasStepChange) return '#eab308';   // yellow
    return e.status === 'passed' ? '#22c55e' : '#ef4444';
  }

  // Determine per-step color
  function stepColor(step, prevWf) {
    if (!diff.hasPrevious) return step.status === 'passed' ? '#86efac' : '#fca5a5';
    const key      = step.context ? `${step.name} [${step.context}]` : step.name;
    const prevStep = prevWf?.steps?.find(s => {
      const k = s.context ? `${s.name} [${s.context}]` : s.name;
      return k === key;
    });
    if (!prevStep) return step.status === 'passed' ? '#86efac' : '#fca5a5';
    if (prevStep.status !== step.status) return '#fde047';  // yellow
    return step.status === 'passed' ? '#86efac' : '#fca5a5';
  }

  const historyDots = (() => {
    if (!fs.existsSync(HISTORY_IDX)) return '';
    const idx = JSON.parse(fs.readFileSync(HISTORY_IDX, 'utf8'));
    return idx.runs.slice(-20).map(r =>
      `<span class="dot" style="background:${r.overall === 'passed' ? '#22c55e' : '#ef4444'}" title="${r.runAt.slice(0, 16)} — ${r.overall} (${r.commit})"></span>`
    ).join('');
  })();

  const wfCards = entries.map(e => {
    const prevWf = previousRun?.workflows?.find(w => w.id === e.id) ?? null;

    const steps    = e.result?.steps ?? [];
    const passed   = steps.filter(s => s.status === 'passed').length;
    const color    = wfColor(e);
    const isYellow = color === '#eab308';
    const changeLabel = !diff.hasPrevious ? '' : isYellow ? '&nbsp;🟡 CHANGED' : '';

    const stepDots = steps.map(s => {
      const c    = stepColor(s, prevWf);
      const ctx  = s.context ? ` [${s.context}]` : '';
      const err  = s.error   ? ` — ${s.error.slice(0, 80)}` : '';
      return `<span class="sdot" style="background:${c}" title="${s.name}${ctx}${err}"></span>`;
    }).join('');

    return `
    <div class="wf-card" style="border-left:6px solid ${color}">
      <div class="wf-header">
        <span class="wf-badge" style="background:${color}">W${e.id}</span>
        <span class="wf-label">W${e.id} — ${e.label}${changeLabel}</span>
        <span class="wf-status" style="color:${color}">${e.status.toUpperCase()}</span>
      </div>
      <div class="wf-meta">${passed}/${steps.length} steps &nbsp;·&nbsp; ${fmtMs(e.durationMs)} &nbsp;·&nbsp; ~${computeRedis(e.result?.apiCalls)} Redis ops</div>
      <div class="step-dots">${stepDots}</div>
    </div>`;
  }).join('\n');

  const overallBg = allPassed ? '#22c55e' : '#ef4444';
  const changeNote = diff.hasPrevious && diff.hasChanges
    ? `<p class="change-note">🟡 ${diff.regressions.length} regression${diff.regressions.length !== 1 ? 's' : ''} · ${diff.fixes.length} fix${diff.fixes.length !== 1 ? 'es' : ''} · ${diff.newFailures.length} new failure${diff.newFailures.length !== 1 ? 's' : ''} since last run</p>`
    : diff.hasPrevious
      ? `<p class="change-note" style="color:#64748b">✅ No changes vs previous run</p>`
      : `<p class="change-note" style="color:#94a3b8">⚫ First recorded run — no comparison available</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Coach's Eye — QA Status</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
  .page { max-width: 860px; margin: 0 auto; }
  .header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .overall-pill { padding: 10px 20px; border-radius: 999px; font-size: 22px; font-weight: 800; color: #fff; letter-spacing: 0.05em; }
  .header-meta { color: #94a3b8; font-size: 13px; line-height: 1.7; }
  .header-meta strong { color: #e2e8f0; }
  .change-note { font-size: 13px; margin: 6px 0 16px; color: #eab308; }
  .legend { display: flex; gap: 16px; margin-bottom: 20px; font-size: 12px; color: #94a3b8; }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
  .wf-card { background: #1e293b; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .wf-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .wf-badge { color: #fff; font-weight: 800; font-size: 12px; padding: 3px 8px; border-radius: 6px; }
  .wf-label { flex: 1; font-size: 14px; font-weight: 600; color: #e2e8f0; }
  .wf-status { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
  .wf-meta { font-size: 12px; color: #64748b; margin-bottom: 10px; }
  .step-dots { display: flex; flex-wrap: wrap; gap: 4px; }
  .sdot { width: 14px; height: 14px; border-radius: 3px; cursor: default; flex-shrink: 0; }
  .history-row { display: flex; align-items: center; gap: 10px; margin-top: 20px; }
  .history-label { font-size: 12px; color: #64748b; white-space: nowrap; }
  .dots { display: flex; gap: 5px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; cursor: default; flex-shrink: 0; }
  .footer { margin-top: 24px; font-size: 11px; color: #475569; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 20px 0 10px; }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="overall-pill" style="background:${overallBg}">${allPassed ? '✅ PASS' : '❌ FAIL'}</div>
    <div class="header-meta">
      <strong>Coach's Eye — Nightly QA</strong><br>
      Run: ${runAt.slice(0, 19).replace('T', ' ')} UTC &nbsp;·&nbsp; Commit: <code>${commit}</code><br>
      ${entries.reduce((s, e) => s + (e.result?.steps?.filter(st => st.status === 'passed').length ?? 0), 0)}/${entries.reduce((s, e) => s + (e.result?.steps?.length ?? 0), 0)} steps &nbsp;·&nbsp; ${fmtMs(Date.now() - nightlyStart)} &nbsp;·&nbsp; ~${entries.reduce((s, e) => s + computeRedis(e.result?.apiCalls), 0)} Redis ops
    </div>
  </div>

  ${changeNote}

  <div class="legend">
    <span class="legend-item"><span class="legend-dot" style="background:#86efac"></span> Step pass (no change)</span>
    <span class="legend-item"><span class="legend-dot" style="background:#fca5a5"></span> Step fail (no change)</span>
    <span class="legend-item"><span class="legend-dot" style="background:#fde047"></span> Step changed vs prev</span>
    <span class="legend-item"><span class="legend-dot" style="background:#94a3b8; opacity:0.5"></span> New step</span>
  </div>

  <p class="section-title">Workflows</p>
  ${wfCards}

  <div class="history-row">
    <span class="history-label">Run history (last 20, oldest → newest):</span>
    <div class="dots">${historyDots}</div>
  </div>

  <div class="footer">
    Generated by qa/nightly.js &nbsp;·&nbsp; Hover step dots for step name &nbsp;·&nbsp; Hover history dots for run details
    <br>Reports: <a href="../../NIGHTLY_QA_REPORT.md" style="color:#60a5fa">NIGHTLY_QA_REPORT.md</a>
    &nbsp;·&nbsp; <a href="../../REGRESSION_REPORT.md" style="color:#60a5fa">REGRESSION_REPORT.md</a>
  </div>
</div>
</body>
</html>`;

  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.writeFileSync(STATUS_HTML, html);
  console.log(`[nightly] Dashboard written: qa/history/status.html`);
}

// ─── Main run ─────────────────────────────────────────────────────────────────

const runAt        = new Date().toISOString();
const nightlyStart = Date.now();
const commit       = gitCommit();

// Load previous run BEFORE executing (so it's the actual "previous", not the current)
const previousRun  = loadPreviousRun();

console.log(`\n${'═'.repeat(62)}`);
console.log(`  Coach's Eye — Nightly QA Runner`);
console.log(`  ${runAt}`);
console.log(`  Base URL : ${BASE_URL}`);
console.log(`  Commit   : ${commit}`);
if (previousRun) {
  console.log(`  Prev run : ${previousRun.runAt.slice(0, 19).replace('T', ' ')} (${previousRun.commit}) — ${previousRun.overall}`);
} else {
  console.log(`  Prev run : none (first recorded run)`);
}
console.log(`${'═'.repeat(62)}\n`);

const entries = [];

for (const wf of WORKFLOWS) {
  console.log(`\n${'─'.repeat(62)}`);
  console.log(`  ▶  Workflow ${wf.id} — ${wf.label}`);
  console.log(`${'─'.repeat(62)}`);

  const wfStart  = Date.now();
  const exitCode = await runWorkflow(wf.flag);
  const elapsed  = Date.now() - wfStart;
  const result   = readResult(wf.resultPath);
  const status   = result?.status ?? (exitCode === 0 ? 'passed' : 'failed');

  entries.push({ ...wf, result, durationMs: elapsed, exitCode, status });

  const icon        = status === 'passed' ? '✓' : '✗';
  const stepsTotal  = result?.steps?.length ?? 0;
  const stepsPassed = result?.steps?.filter(s => s.status === 'passed').length ?? 0;
  console.log(`\n  ${icon}  W${wf.id} — ${status.toUpperCase()}  |  ${stepsPassed}/${stepsTotal} steps  |  ${fmtMs(elapsed)}`);
}

const totalMs   = Date.now() - nightlyStart;
const allPassed = entries.every(e => e.status === 'passed');

// Build compact summary, compare against previous, then persist
const currentSummary = buildRunSummary(entries, totalMs);
const diff           = compareRuns(currentSummary, previousRun);
saveRunHistory(currentSummary);

// ─── Generate all reports ─────────────────────────────────────────────────────
generateNightlyReport(entries, totalMs, allPassed, diff, previousRun);
generateRegressionReport(diff, currentSummary, previousRun);
generateStatusDashboard(entries, diff, currentSummary, previousRun);

// ─── QA Analyst: auto-investigate regressions and new failures ───────────────
if (diff.regressions.length > 0 || diff.newFailures.length > 0) {
  console.log('\n[nightly] Regressions detected — running QA Analyst…');
  await new Promise(resolve => {
    const proc = spawn(
      'node',
      [path.join(ROOT, 'qa/analyst.js')],
      { stdio: 'inherit', env: { ...process.env }, cwd: ROOT }
    );
    proc.on('close',  resolve);
    proc.on('error',  err => { console.error('[nightly] analyst error:', err.message); resolve(); });
  });
} else {
  console.log('\n[nightly] No regressions — skipping analyst.');
}

// ─── Refresh Mission Control dashboard ───────────────────────────────────────
await new Promise(resolve => {
  const proc = spawn(
    'node',
    [path.join(ROOT, 'qa/mission-control/generate-dashboard.js')],
    { stdio: 'inherit', cwd: ROOT }
  );
  proc.on('close',  resolve);
  proc.on('error',  () => resolve());
});

// ─── Final summary ────────────────────────────────────────────────────────────
const totalSteps  = entries.reduce((s, e) => s + (e.result?.steps?.length ?? 0), 0);
const passedSteps = entries.reduce((s, e) => s + (e.result?.steps?.filter(st => st.status === 'passed').length ?? 0), 0);
const totalRedis  = entries.reduce((s, e) => s + computeRedis(e.result?.apiCalls), 0);

console.log(`\n${'═'.repeat(62)}`);
console.log(`  Overall    : ${allPassed ? '✅  PASS' : '❌  FAIL'}`);
console.log(`  Steps      : ${passedSteps}/${totalSteps}`);
console.log(`  Duration   : ${fmtMs(totalMs)}`);
console.log(`  Redis      : ~${totalRedis} ops`);
if (diff.hasPrevious) {
  const r = diff.regressions.length, f = diff.fixes.length, n = diff.newFailures.length;
  if (r > 0) console.log(`  ⚠ Regressions : ${r} step${r !== 1 ? 's' : ''}`);
  if (f > 0) console.log(`  ✓ Fixed       : ${f} step${f !== 1 ? 's' : ''}`);
  if (r === 0 && f === 0 && n === 0) console.log(`  ✓ No changes vs previous run`);
} else {
  console.log(`  ⚫ First recorded run`);
}
console.log(`${'═'.repeat(62)}\n`);

process.exit(allPassed ? 0 : 1);
