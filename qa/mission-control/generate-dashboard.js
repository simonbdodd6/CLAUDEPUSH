/**
 * Mission Control Dashboard Generator
 *
 * Reads qa/results/workflow-{1,2,3,4}.json and writes a self-contained
 * qa/mission-control/dashboard.html. Open the HTML file in any browser
 * after running qa:all-workflows to see the full suite status.
 *
 * To add a new workflow:
 *   1. Append a new entry to WORKFLOWS below.
 *   2. Make sure your spec writes to qa/results/workflow-N.json.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT          = process.cwd();
const RESULTS_DIR   = path.join(ROOT, 'qa/results');
const DASHBOARD_DIR = path.join(ROOT, 'qa/mission-control');
const OUT_PATH      = path.join(DASHBOARD_DIR, 'dashboard.html');

// ─── Workflow registry ────────────────────────────────────────────────────────
// Add one entry per workflow. resultFile is relative to qa/results/.
const WORKFLOWS = [
  {
    id: 1,
    name: 'Coach Login → Members',
    description: 'Open app → coach login → navigate to Members → verify member list renders',
    resultFile: 'workflow-1.json',
    reportFile: 'QA_WORKFLOW_REPORT.md',
    manualMinutes: 3,
  },
  {
    id: 2,
    name: 'Invite Generation',
    description: 'Coach login → open invite panel → generate individual invite → verify /?inv= URL',
    resultFile: 'workflow-2.json',
    reportFile: 'QA_WORKFLOW_2_REPORT.md',
    manualMinutes: 4,
  },
  {
    id: 3,
    name: 'Player Registration',
    description: 'Generate invite → fresh browser context → player claims invite → coach verifies member',
    resultFile: 'workflow-3.json',
    reportFile: 'QA_WORKFLOW_3_REPORT.md',
    manualMinutes: 6,
  },
  {
    id: 4,
    name: 'Pending Approval Flow',
    description: 'Group invite → player submits join request → coach approves → verify active member',
    resultFile: 'workflow-4.json',
    reportFile: 'QA_WORKFLOW_4_REPORT.md',
    manualMinutes: 7,
  },
  {
    id: 5,
    name: 'Coach ↔ Player Messaging',
    description: 'Coach sends timestamped DM → player receives via poll → player replies → coach verifies',
    resultFile: 'workflow-5.json',
    reportFile: 'QA_WORKFLOW_5_MESSAGING_REPORT.md',
    manualMinutes: 6,
  },
];

// ─── Load result data ─────────────────────────────────────────────────────────
function loadResult(def) {
  const filePath = path.join(RESULTS_DIR, def.resultFile);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function durationMs(result) {
  if (!result?.startedAt || !result?.finishedAt) return null;
  return Math.round(new Date(result.finishedAt) - new Date(result.startedAt));
}

function fmtDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function stepsStats(result) {
  if (!result?.steps?.length) return { total: 0, passed: 0, failed: 0, skipped: 0 };
  const total   = result.steps.length;
  const passed  = result.steps.filter(s => s.status === 'passed').length;
  const failed  = result.steps.filter(s => s.status === 'failed').length;
  const skipped = result.steps.filter(s => s.status === 'skipped').length;
  return { total, passed, failed, skipped };
}

function totalRedisOps(result) {
  if (!result?.apiCalls?.length) return 0;
  const estimate = (ep, method = 'GET') => {
    if (ep.startsWith('/api/identity'))     return method === 'GET' ? 6 : 8;
    if (ep.startsWith('/api/chat'))         return 8;
    if (ep.startsWith('/api/invite'))       return method === 'POST' ? 8 : 4;
    if (ep.startsWith('/api/availability')) return 4;
    if (ep.startsWith('/api/cron'))         return 6;
    return 2;
  };
  return result.apiCalls.reduce((sum, call) => sum + estimate(call.endpoint, call.method), 0);
}

function firstFailure(result) {
  return result?.steps?.find(s => s.status === 'failed') || null;
}

function screenshotRelPath(shotAbsPath) {
  if (!shotAbsPath) return null;
  return path.relative(DASHBOARD_DIR, shotAbsPath).replaceAll(path.sep, '/');
}

// ─── Build per-workflow data ──────────────────────────────────────────────────
const workflowData = WORKFLOWS.map(def => {
  const result = loadResult(def);
  if (!result) {
    return { def, result: null, status: 'not-run', steps: null, duration: null, redisOps: 0, failure: null };
  }
  const stats   = stepsStats(result);
  const failure = firstFailure(result);
  return {
    def,
    result,
    status:   result.status || 'unknown',
    steps:    stats,
    duration: durationMs(result),
    redisOps: totalRedisOps(result),
    failure,
    commit:   result.commit || null,
    loginMethod: result.loginMethod || null,
    screenshots: result.steps
      ?.filter(s => s.screenshot)
      .map(s => ({ step: s.name, path: screenshotRelPath(s.screenshot), status: s.status })) || [],
  };
});

const generatedAt      = new Date().toISOString();
const allPassed        = workflowData.filter(w => w.result).every(w => w.status === 'passed');
const anyFailed        = workflowData.some(w => w.status === 'failed');
const runCount         = workflowData.filter(w => w.result).length;
const totalManualMins  = WORKFLOWS.reduce((s, d) => s + d.manualMinutes, 0);
const totalDurationMs  = workflowData.reduce((s, w) => s + (w.duration || 0), 0);
const totalRedisOpsAll = workflowData.reduce((s, w) => s + w.redisOps, 0);

// ─── HTML generation ──────────────────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    passed:   ['#22c55e', '✓ PASS'],
    failed:   ['#ef4444', '✗ FAIL'],
    running:  ['#f59e0b', '⟳ RUNNING'],
    'not-run': ['#6b7280', '— NOT RUN'],
    unknown:  ['#6b7280', '? UNKNOWN'],
  };
  const [color, label] = map[status] || map.unknown;
  return `<span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${label}</span>`;
}

function stepBar(steps) {
  if (!steps || steps.total === 0) return '<span class="muted">—</span>';
  const pct = Math.round((steps.passed / steps.total) * 100);
  const bar = `<div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>`;
  const label = `${steps.passed}/${steps.total} steps`;
  const extra = steps.failed ? ` <span style="color:#ef4444">(${steps.failed} failed)</span>` : '';
  const skip  = steps.skipped ? ` <span class="muted">(${steps.skipped} skipped)</span>` : '';
  return `${bar}<span class="step-label">${label}${extra}${skip}</span>`;
}

function screenshotGallery(screenshots) {
  if (!screenshots?.length) return '<span class="muted">No screenshots</span>';
  const thumbs = screenshots.slice(0, 6).map(s => {
    const color = s.status === 'passed' ? '#22c55e' : s.status === 'failed' ? '#ef4444' : '#6b7280';
    return `<a href="${s.path}" target="_blank" class="thumb-link" title="${s.step}" style="border-color:${color}40">
      <img src="${s.path}" alt="${s.step}" onerror="this.parentElement.style.display='none'" />
      <div class="thumb-label">${s.step.slice(0, 20)}</div>
    </a>`;
  }).join('');
  const more = screenshots.length > 6 ? `<span class="muted">+${screenshots.length - 6} more</span>` : '';
  return `<div class="thumb-row">${thumbs}${more}</div>`;
}

function workflowCard(w) {
  const { def, result, status, steps, duration, redisOps, failure, screenshots } = w;
  const reportRelPath = result ? `../../${def.reportFile}` : null;
  const failureBlock = failure ? `
    <div class="failure-block">
      <div class="failure-title">Failed at: ${failure.name}</div>
      <div class="failure-msg">${failure.error || ''}</div>
      ${failure.screenshot ? `<a href="${screenshotRelPath(failure.screenshot)}" target="_blank" class="failure-shot">View failure screenshot</a>` : ''}
    </div>` : '';

  const metaRows = [
    ['Last run',      result ? fmtTime(result.finishedAt) : '—'],
    ['Duration',      fmtDuration(duration)],
    ['Commit',        result?.commit ? `<code>${result.commit}</code>` : '—'],
    ['Login method',  result?.loginMethod || '—'],
    ['Redis ops',     redisOps ? `~${redisOps} ops` : '—'],
    ['Manual time saved', `~${def.manualMinutes} min/run`],
  ];

  const metaHtml = metaRows
    .map(([k, v]) => `<div class="meta-row"><span class="meta-key">${k}</span><span class="meta-val">${v}</span></div>`)
    .join('');

  return `
  <div class="card ${status}">
    <div class="card-header">
      <div class="card-num">W${def.id}</div>
      <div class="card-title-block">
        <div class="card-title">${def.name}</div>
        <div class="card-desc">${def.description}</div>
      </div>
      ${statusBadge(status)}
    </div>
    <div class="card-body">
      <div class="steps-row">${stepBar(steps)}</div>
      ${failureBlock}
      <div class="meta">${metaHtml}</div>
      ${result ? `<div class="screenshots">${screenshotGallery(screenshots)}</div>` : ''}
    </div>
    <div class="card-footer">
      ${reportRelPath ? `<a href="${reportRelPath}" target="_blank" class="report-link">📄 View report</a>` : ''}
    </div>
  </div>`;
}

const suiteSummary = anyFailed
  ? `<span style="color:#ef4444">✗ SUITE FAILED</span>`
  : allPassed && runCount === WORKFLOWS.length
    ? `<span style="color:#22c55e">✓ ALL PASSING</span>`
    : runCount === 0
      ? `<span style="color:#6b7280">— NOT YET RUN</span>`
      : `<span style="color:#f59e0b">⟳ PARTIAL — ${runCount}/${WORKFLOWS.length} run</span>`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mission Control — Coach's Eye QA</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:        #0f1117;
      --surface:   #1a1d27;
      --border:    #2a2d3a;
      --text:      #e2e8f0;
      --muted:     #64748b;
      --accent:    #6366f1;
      --pass:      #22c55e;
      --fail:      #ef4444;
      --warn:      #f59e0b;
      --radius:    10px;
      --font:      -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; padding: 0; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: 'SF Mono', 'Fira Mono', monospace; font-size: 0.85em; background: #ffffff10; padding: 1px 4px; border-radius: 3px; }

    /* Header */
    .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 20px 32px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .header-logo { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.5px; }
    .header-logo span { color: var(--accent); }
    .header-meta { margin-left: auto; text-align: right; font-size: 0.82rem; color: var(--muted); line-height: 1.6; }
    .suite-status { font-size: 1rem; font-weight: 600; margin-bottom: 2px; }

    /* Summary bar */
    .summary-bar { display: flex; gap: 24px; padding: 16px 32px; background: var(--surface); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .stat { display: flex; flex-direction: column; gap: 2px; }
    .stat-label { font-size: 0.73rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    .stat-value { font-size: 1.1rem; font-weight: 600; }

    /* Card grid */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 20px; padding: 24px 32px; }

    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); display: flex; flex-direction: column; }
    .card.passed  { border-left: 3px solid var(--pass); }
    .card.failed  { border-left: 3px solid var(--fail); }
    .card.running { border-left: 3px solid var(--warn); }
    .card.not-run { border-left: 3px solid var(--border); opacity: 0.7; }

    .card-header { display: flex; align-items: flex-start; gap: 12px; padding: 16px 16px 12px; border-bottom: 1px solid var(--border); }
    .card-num { font-size: 0.7rem; font-weight: 700; color: var(--muted); background: var(--border); border-radius: 4px; padding: 2px 7px; margin-top: 2px; white-space: nowrap; }
    .card-title-block { flex: 1; min-width: 0; }
    .card-title { font-weight: 600; font-size: 0.95rem; }
    .card-desc { font-size: 0.78rem; color: var(--muted); margin-top: 3px; line-height: 1.4; }

    .badge { font-size: 0.72rem; font-weight: 700; padding: 3px 9px; border-radius: 20px; white-space: nowrap; }

    .card-body { padding: 14px 16px; flex: 1; display: flex; flex-direction: column; gap: 14px; }

    .steps-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .progress-wrap { width: 100px; height: 6px; background: var(--border); border-radius: 3px; flex-shrink: 0; }
    .progress-bar  { height: 100%; background: var(--pass); border-radius: 3px; transition: width 0.3s; }
    .step-label { font-size: 0.82rem; color: var(--text); }

    .failure-block { background: #ef444410; border: 1px solid #ef444430; border-radius: 6px; padding: 10px 12px; font-size: 0.82rem; }
    .failure-title { font-weight: 600; color: #ef4444; margin-bottom: 4px; }
    .failure-msg   { color: var(--text); word-break: break-word; }
    .failure-shot  { display: inline-block; margin-top: 6px; font-size: 0.78rem; }

    .meta { display: flex; flex-direction: column; gap: 5px; }
    .meta-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 0.8rem; }
    .meta-key { color: var(--muted); flex-shrink: 0; }
    .meta-val { text-align: right; color: var(--text); }

    .screenshots { }
    .thumb-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .thumb-link { display: block; width: 72px; flex-shrink: 0; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
    .thumb-link:hover { border-color: var(--accent); }
    .thumb-link img { width: 100%; height: 48px; object-fit: cover; display: block; background: var(--border); }
    .thumb-label { font-size: 0.6rem; color: var(--muted); padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .card-footer { padding: 10px 16px; border-top: 1px solid var(--border); font-size: 0.8rem; }
    .report-link { color: var(--muted); }
    .report-link:hover { color: var(--accent); }

    .muted { color: var(--muted); }

    /* Footer note */
    .footer { padding: 20px 32px; font-size: 0.78rem; color: var(--muted); border-top: 1px solid var(--border); margin-top: 8px; }
  </style>
</head>
<body>

<div class="header">
  <div>
    <div class="header-logo">Coach's Eye <span>QA</span> — Mission Control</div>
    <div style="font-size:0.82rem;color:var(--muted);margin-top:4px">Automated QA suite · branch <code>feature/nightly-qa-agent</code></div>
  </div>
  <div class="header-meta">
    <div class="suite-status">${suiteSummary}</div>
    <div>Generated ${fmtTime(generatedAt)}</div>
    <div>${runCount}/${WORKFLOWS.length} workflows run</div>
  </div>
</div>

<div class="summary-bar">
  <div class="stat">
    <span class="stat-label">Workflows run</span>
    <span class="stat-value">${runCount} / ${WORKFLOWS.length}</span>
  </div>
  <div class="stat">
    <span class="stat-label">Passing</span>
    <span class="stat-value" style="color:var(--pass)">${workflowData.filter(w => w.status === 'passed').length}</span>
  </div>
  <div class="stat">
    <span class="stat-label">Failing</span>
    <span class="stat-value" style="color:var(--fail)">${workflowData.filter(w => w.status === 'failed').length}</span>
  </div>
  <div class="stat">
    <span class="stat-label">Total duration</span>
    <span class="stat-value">${fmtDuration(totalDurationMs)}</span>
  </div>
  <div class="stat">
    <span class="stat-label">Redis ops (est.)</span>
    <span class="stat-value">~${totalRedisOpsAll}</span>
  </div>
  <div class="stat">
    <span class="stat-label">Manual time saved</span>
    <span class="stat-value">~${totalManualMins} min/run</span>
  </div>
</div>

<div class="grid">
${workflowData.map(workflowCard).join('\n')}
</div>

<div class="footer">
  Generated by <code>qa/mission-control/generate-dashboard.js</code> ·
  To add a workflow: append to the WORKFLOWS array in that file and write <code>qa/results/workflow-N.json</code> from your spec. ·
  Artifacts and result JSONs are git-ignored — run locally to populate.
</div>

</body>
</html>`;

// ─── Write output ─────────────────────────────────────────────────────────────
fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
fs.writeFileSync(OUT_PATH, html);

const relOut = path.relative(ROOT, OUT_PATH);
console.log(`Dashboard written → ${relOut}`);

const summary = workflowData.map(w =>
  `  W${w.def.id} ${w.def.name.padEnd(28)} ${(w.status).padEnd(8)} ${fmtDuration(w.duration).padStart(7)}  ${w.steps ? `${w.steps.passed}/${w.steps.total} steps` : ''}`
).join('\n');
console.log(`\n${summary}\n`);
console.log(`Open: open "${relOut}"`);
