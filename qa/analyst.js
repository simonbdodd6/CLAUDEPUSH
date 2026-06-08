/**
 * qa/analyst.js — QA Analyst Mode
 *
 * When regressions are detected in the nightly run, this script automatically:
 *   1. Loads the latest history run (step data + artifact paths)
 *   2. Finds the most recent previous PASSING run for comparison baseline
 *   3. For each failed step, reads the HTML snapshot and error context
 *   4. Calls Claude API for analysis (falls back to heuristics if no key)
 *   5. Writes INVESTIGATION_REPORT.md with root cause, component, endpoint,
 *      confidence score, DOM evidence, and suggested files to inspect
 *
 * Called automatically by qa/nightly.js when regressions are detected.
 * Also runnable standalone:
 *   node qa/analyst.js
 *   QA_ANALYST_MODEL=claude-haiku-4-5-20251001 node qa/analyst.js
 *
 * If ANTHROPIC_API_KEY is not set, heuristic analysis runs instead.
 * Heuristic mode covers the known Coach's Eye failure patterns and produces
 * useful output without requiring an API call.
 */

import fs   from 'node:fs';
import path from 'node:path';

const ROOT          = process.cwd();
const HISTORY_DIR   = path.join(ROOT, 'qa/history');
const HISTORY_IDX   = path.join(HISTORY_DIR, 'index.json');
const REPORT_PATH   = path.join(ROOT, 'INVESTIGATION_REPORT.md');
const API_KEY       = process.env.ANTHROPIC_API_KEY;
const MODEL         = process.env.QA_ANALYST_MODEL ?? 'claude-sonnet-4-6';
const SNAP_MAX      = 14_000;   // bytes of HTML snapshot sent to Claude
const SNAP_PREVIEW  = 3_000;    // bytes shown in report DOM evidence section

// ─── App knowledge base ───────────────────────────────────────────────────────
// Component → file mapping, maintained here rather than in the spec files
// so the analyst can produce specific file:function references.

const KNOWN_COMPONENTS = {
  '#authPanel':              { file: 'public/app.js', fn: 'setAuthTab() / handleSessionExpiry()' },
  '#playerNav':              { file: 'public/app.js', fn: 'playerLogin() render path' },
  '#coachNav':               { file: 'public/app.js', fn: 'coachLogin() render path' },
  '#chatInput':              { file: 'public/app.js', fn: 'sendMessage()' },
  '#chatMessages':           { file: 'public/app.js', fn: 'renderChat() / pollChat()' },
  '#identityLoginEmail':     { file: 'public/app.js', fn: 'authPanel login form' },
  '#identityLoginBtn':       { file: 'public/app.js', fn: 'authPanel login submit' },
  '#devLoginBtn':            { file: 'public/app.js', fn: 'dev-mode login bypass' },
  '#teamSelect':             { file: 'public/app.js', fn: 'team selection dropdown' },
  'nav-badge':               { file: 'public/app.js', fn: 'unread badge render' },
  'intercept401':            { file: 'public/app.js', fn: 'window.fetch wrapper — 401/403 handler' },
  'handleSessionExpiry':     { file: 'public/app.js', fn: 'sets _sessionExpiredMessage, authTab=login' },
  'ce_session':              { file: 'server.js',     fn: 'session middleware / cookie validation' },
  '/api/identity':           { file: 'server.js',     fn: 'POST /api/identity/login|logout|verify' },
  '/api/chat':               { file: 'server.js',     fn: 'GET|POST /api/chat' },
  '/api/invite':             { file: 'server.js',     fn: 'POST /api/invite — 403 for players' },
  '/api/schedules':          { file: 'server.js',     fn: 'GET /api/schedules — 403 for players' },
  '/api/availability':       { file: 'server.js',     fn: 'GET|POST /api/availability' },
  'shared-steps:playerLogin':{ file: 'qa/helpers/shared-steps.js', fn: 'playerLogin()' },
  'shared-steps:coachLogin': { file: 'qa/helpers/shared-steps.js', fn: 'coachLogin()' },
  'shared-steps:navigateToMessages': { file: 'qa/helpers/shared-steps.js', fn: 'navigateToMessages()' },
};

// ─── Known failure pattern library ───────────────────────────────────────────
// Used as both the heuristic fallback AND to pre-seed confidence in Claude mode.

const HEURISTIC_PATTERNS = [
  {
    id:   'session-overlay-nav',
    test: (error, dom, step) =>
      (/navigat|Messages|playerNav|nav/i.test(step.name) || /Messages/i.test(error)) &&
      (/session.*expir|identityLogin|authPanel.*visible|Your session/i.test(dom + error)),
    confidence: 85,
    result: (wfId, stepIndex) => ({
      rootCause:
        '403-triggered session overlay is covering the navigation. A player-inaccessible ' +
        'endpoint returned 403 during initial data load, which incorrectly called ' +
        'handleSessionExpiry(), rendering the "session has expired" auth overlay over the nav.',
      component:   '#authPanel / handleSessionExpiry()',
      apiEndpoint: 'GET /api/invite or GET /api/schedules (returns 403 for player role)',
      explanation:
        'intercept401 wraps window.fetch globally and fires handleSessionExpiry() on any 401 ' +
        'when state.currentUserId is set. However, 403 responses from coach-only endpoints ' +
        '(/api/invite, /api/schedules) also trigger this path. During player login, these ' +
        'endpoints are polled as part of initial data load and return 403, causing the overlay ' +
        'to appear even though the session cookie is valid. The nav buttons become unreachable ' +
        'because the overlay sits above them in z-index.',
      domEvidence: [
        '#authPanel: visible with "Your session has expired. Please log in again." text',
        '#playerNav: class="" (nav rendered but obscured)',
        'Accessible name mismatch: Messages button may be "Messages2" if badge is present',
      ],
      suggestedFiles: [
        { path: 'qa/helpers/shared-steps.js', reason: 'playerLogin() — overlay dismissal guard after #playerNav:not(.hidden)' },
        { path: 'public/app.js',              reason: 'intercept401 — verify 403 is NOT treated as 401 for session expiry' },
        { path: `qa/e2e/workflow-${wfId}-*.spec.js`, reason: 'Failing workflow — step after player login' },
      ],
      immediateAction: `npm run qa:workflow-${wfId}:headed  # watch auth panel during step ${stepIndex}`,
    }),
  },

  {
    id:   'nav-badge-accessible-name',
    test: (error, dom, step) =>
      /Messages2|name.*Messages\d|getByRole.*Messages/i.test(error + dom) ||
      (/navigat.*Messages/i.test(step.name) && /strict mode|locator.*0 elements/i.test(error)),
    confidence: 88,
    result: (wfId, stepIndex) => ({
      rootCause:
        'Nav badge span is merging into the button accessible name. When unread messages exist, ' +
        'the Messages button becomes <button>Messages<span>2</span></button>, whose computed ' +
        'accessible name is "Messages2". A locator using exact name "Messages" finds 0 elements.',
      component:   'Messages nav button / nav-badge span',
      apiEndpoint: 'GET /api/chat/unread (sets unread count, triggers badge render)',
      explanation:
        'The nav badge span is a child of the nav button element, so its text is included ' +
        'in the button\'s accessible name computation. Any non-zero unread count appends the ' +
        'digit(s) to "Messages". Playwright\'s getByRole name matching is exact by default, so ' +
        '"Messages" no longer matches "Messages2". The fix is a regex prefix: /^Messages/.',
      domEvidence: [
        'button[role=button] accessible name: "Messages2" (badge digit included)',
        'nav-badge span is a direct child of the Messages button',
      ],
      suggestedFiles: [
        { path: 'qa/helpers/shared-steps.js', reason: 'navigateToMessages() — use /^Messages/ regex not exact string' },
        { path: 'public/app.js',              reason: 'nav badge render — check if aria-hidden on badge span would fix root cause' },
      ],
      immediateAction: `grep -n "Messages" qa/helpers/shared-steps.js  # verify regex locator is applied`,
    }),
  },

  {
    id:   'cookie-corrupt-no-401',
    test: (error, dom, step) =>
      /ce_session|EXPIRED_QA|session.*expir/i.test(dom + error) &&
      /waitForResponse.*401|step.*6|force.*expir/i.test(step.name + error),
    confidence: 78,
    result: (wfId, stepIndex) => ({
      rootCause:
        'Session cookie was corrupted but no 401 response arrived within the timeout window. ' +
        'The chat poll interval is 2500ms; if the poll fires after step timeout the test ends before ' +
        'seeing the 401.',
      component:   'ce_session cookie / chat poll (2500ms interval)',
      apiEndpoint: 'GET /api/chat (expected to return 401 after cookie corruption)',
      explanation:
        'expireSession() overwrites ce_session with a garbage value. The next request that ' +
        'validates the session should return 401. The test waits up to 8 seconds via ' +
        'waitForResponse(res => res.status() === 401). If the server returns a different error ' +
        'code (e.g., 400 bad request, 500) or the poll doesn\'t fire within the window, the ' +
        'step times out. Check server session validation response codes for malformed cookies.',
      domEvidence: [
        'ce_session cookie overwritten with EXPIRED_QA_SESSION_<timestamp>',
        'No 401 response observed in network log',
      ],
      suggestedFiles: [
        { path: 'server.js',                                      reason: 'session middleware — what status code does a malformed cookie return?' },
        { path: `qa/e2e/workflow-${wfId}-session-expiry.spec.js`, reason: 'expireSession() and waitForResponse — consider widening status check to 400|401|403' },
      ],
      immediateAction: `npm run qa:workflow-${wfId}:headed  # open DevTools Network tab, watch response codes after cookie corruption`,
    }),
  },

  {
    id:   'dev-login-btn-missing',
    test: (error, _dom, step) =>
      /#devLoginBtn|devLoginBtn/i.test(error) ||
      (/login|coach.*login/i.test(step.name) && /timeout|not found/i.test(error)),
    confidence: 75,
    result: (wfId, _stepIndex) => ({
      rootCause:
        '#devLoginBtn is not rendered in the current environment or takes longer than expected. ' +
        'The element only appears in development mode; if QA_BASE_URL points to a non-dev server ' +
        'the button will never be present.',
      component:   '#devLoginBtn (dev-only coach login)',
      apiEndpoint: 'POST /api/identity/login',
      explanation:
        'coachLogin() in shared-steps.js uses page.evaluate() as a fallback when #devLoginBtn ' +
        'is not present, calling the login API directly. If both the button and the evaluate() ' +
        'call fail, the coach will not be logged in. Verify the app is running in dev mode and ' +
        'check if the devLoginBtn re-render timing changed.',
      domEvidence: [
        '#devLoginBtn: not found or not visible within timeout',
        'page.evaluate() fallback may also have failed',
      ],
      suggestedFiles: [
        { path: 'qa/helpers/shared-steps.js', reason: 'coachLogin() — devLoginBtn check + evaluate fallback' },
        { path: 'public/app.js',              reason: 'dev mode guard around #devLoginBtn render' },
      ],
      immediateAction: `echo $QA_BASE_URL  # confirm dev server; check NODE_ENV in server`,
    }),
  },

  {
    id:   'chat-send-timeout',
    test: (error, _dom, step) =>
      /#chatInput|sendMessage|chatInput/i.test(error + step.name) &&
      /timeout|not found|not visible/i.test(error),
    confidence: 72,
    result: (wfId, stepIndex) => ({
      rootCause:
        'Chat input (#chatInput) was not visible or not interactable at step ' + stepIndex + '. ' +
        'This typically means the chat panel was not opened, or a prior step that should select ' +
        'a conversation did not complete.',
      component:   '#chatInput / chat panel',
      apiEndpoint: 'GET /api/chat (conversation list)',
      explanation:
        'The chat panel requires a conversation to be selected before #chatInput appears. ' +
        'If selectChat() or openPlayerDM() did not correctly open a conversation, the input ' +
        'will remain hidden. Also check if a DM conversation was created — the first time two ' +
        'users chat, chatStartCoachDm must be called to create the conversation.',
      domEvidence: [
        '#chatInput: not visible or not found',
        'Conversation may not have been selected or created',
      ],
      suggestedFiles: [
        { path: 'qa/helpers/shared-steps.js', reason: 'selectChat() / openPlayerDM() — conversation create guard' },
        { path: `qa/e2e/workflow-${wfId}-*.spec.js`, reason: 'Step before chatInput — which conversation is expected to be open?' },
      ],
      immediateAction: `npm run qa:workflow-${wfId}:headed  # inspect chat panel state at failing step`,
    }),
  },

  {
    id:   'api-invite-timeout',
    test: (error, _dom, step) =>
      /invite|joinRequest|pendingApproval/i.test(step.name) &&
      /timeout|status.*404|status.*500/i.test(error),
    confidence: 68,
    result: (wfId, stepIndex) => ({
      rootCause:
        '/api/invite returned an unexpected status or the expected invite/join-request ' +
        'did not appear in the UI within the timeout.',
      component:   'Group Invite / Join Request flow',
      apiEndpoint: 'POST /api/invite',
      explanation:
        'The invite flow requires: coach creates invite → player uses invite code → ' +
        'join request appears in coach\'s pending list → coach approves. If Redis TTL on ' +
        'the invite code expired, or if the invite was already consumed by a previous test ' +
        'run, the POST will 404 or 409. Check Redis state between test runs.',
      domEvidence: [
        'Invite or join-request element not found within timeout',
      ],
      suggestedFiles: [
        { path: 'server.js',                                      reason: '/api/invite — check Redis TTL and duplicate-use guard' },
        { path: `qa/e2e/workflow-${wfId}-pending-approval.spec.js`, reason: 'Step ' + stepIndex + ' — invite code lifecycle' },
        { path: 'qa/helpers/shared-steps.js',                     reason: 'coachLogin / playerLogin credential chain' },
      ],
      immediateAction: `npm run qa:workflow-${wfId}:headed  # watch /api/invite request in DevTools Network`,
    }),
  },
];

// ─── History helpers ──────────────────────────────────────────────────────────

function loadRuns() {
  if (!fs.existsSync(HISTORY_IDX)) {
    console.error('[analyst] No history found at qa/history/index.json — run qa:nightly first.');
    return { latest: null, previousPassing: null };
  }
  const idx = JSON.parse(fs.readFileSync(HISTORY_IDX, 'utf8'));
  if (!idx.runs?.length) return { latest: null, previousPassing: null };

  // Latest = the last entry (current nightly run, just saved)
  const latestEntry = idx.runs.at(-1);
  const latestPath  = path.join(HISTORY_DIR, latestEntry.file);
  const latest      = fs.existsSync(latestPath)
    ? JSON.parse(fs.readFileSync(latestPath, 'utf8'))
    : null;

  // Previous passing = most recent PASSING entry before the latest
  const prevPassingEntry = idx.runs.slice(0, -1).reverse().find(r => r.overall === 'passed');
  let previousPassing    = null;
  if (prevPassingEntry) {
    const prevPath = path.join(HISTORY_DIR, prevPassingEntry.file);
    if (fs.existsSync(prevPath)) previousPassing = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
  }

  return { latest, previousPassing };
}

/**
 * Collect all failed steps from the latest run, annotated with regression info.
 * A "regression" means the step was PASS in previousPassing. A "new failure"
 * means the step was absent from previousPassing (or there is no passing run).
 */
function findFailures(latest, previousPassing) {
  const failures = [];
  for (const wf of (latest?.workflows ?? [])) {
    for (const [i, step] of wf.steps.entries()) {
      if (step.status !== 'failed') continue;
      const prevWf   = previousPassing?.workflows?.find(w => w.id === wf.id);
      const key      = step.context ? `${step.name} [${step.context}]` : step.name;
      const prevStep = prevWf?.steps?.find(s => {
        const k = s.context ? `${s.name} [${s.context}]` : s.name;
        return k === key;
      });
      failures.push({
        wf,
        step,
        stepIndex:    i + 1,
        prevStep,
        isRegression: prevStep?.status === 'passed',
        isNewFailure: !prevStep,
        isPersistent: prevStep?.status === 'failed',
      });
    }
  }
  return failures;
}

// ─── DOM snapshot extraction ──────────────────────────────────────────────────

function readSnapshot(snapPath, maxBytes = SNAP_MAX) {
  if (!snapPath) return null;
  if (!fs.existsSync(snapPath)) return null;
  try {
    const raw = fs.readFileSync(snapPath, 'utf8');
    return raw.slice(0, maxBytes);
  } catch { return null; }
}

/**
 * Extract high-signal DOM sections: auth panel, nav, error banners, visible
 * elements — to include in the report's "DOM evidence" block without the
 * full ~100KB snapshot.
 */
function extractDomHighlights(html) {
  if (!html) return [];
  const lines    = html.split('\n');
  const relevant = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l || l === '<html>' || l === '</html>') continue;
    if (
      /authPanel|playerNav|coachNav|chatInput|identityLogin|devLoginBtn|session.*expir|nav-badge|class=""/i.test(l) ||
      /style="display.*block|visible|opacity.*1/i.test(l) ||
      /hidden|display.*none/i.test(l)
    ) {
      relevant.push(l.slice(0, 200));
    }
    if (relevant.length >= 20) break;
  }
  return relevant;
}

// ─── Claude API analysis ──────────────────────────────────────────────────────

const CLAUDE_SYSTEM = `You are a QA analyst for Coach's Eye, a real-time coaching platform.

## Architecture
- Frontend: vanilla JS at public/app.js (SPA, no framework)
- Backend: Express + Redis at server.js
- Tests: Playwright E2E at qa/e2e/, shared helpers at qa/helpers/shared-steps.js
- Auth: session cookie ce_session, validated server-side per request
- Test runner: qa/nightly.js runs W4→W5→W6→W7

## Critical app internals
- intercept401: wraps window.fetch globally; fires handleSessionExpiry() when response is 401 AND state.currentUserId is set. Known issue: some 403 responses (from coach-only endpoints) incorrectly hit this path for players.
- handleSessionExpiry(): sets _sessionExpiredMessage, sets authTab='login', calls render(). Shows #authPanel overlay.
- setAuthTab('closed'): dismisses #authPanel without affecting session.
- #playerNav: shown/hidden via class toggle. The Messages nav button contains a <span class="nav-badge"> for unread count — this makes accessible name "Messages2" when count > 0.
- Coach-only endpoints that return 403 for players: /api/invite, /api/schedules
- ce_session cookie: session ID. Overwriting with garbage causes next API call to return 401.
- Chat poll: every 2500ms, GET /api/chat

## What to return
Respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON:
{
  "rootCause": "string — 1-2 sentences, specific and concrete",
  "component": "string — exact component name (e.g. '#authPanel / handleSessionExpiry()')",
  "apiEndpoint": "string or null — e.g. 'GET /api/invite'",
  "confidence": number — integer 0–100,
  "explanation": "string — 3–5 sentences. Explain the mechanism, not just the symptom.",
  "domEvidence": ["array of strings — specific observations from the DOM snapshot"],
  "suggestedFiles": [
    { "path": "relative/path.js", "reason": "why this specific file/function" }
  ],
  "immediateAction": "string — the single most useful next debugging step (a command or specific check)"
}`;

async function analyzeWithClaude(failure, snapshot) {
  if (!API_KEY) return null;

  const { wf, step, stepIndex, prevStep, isRegression } = failure;
  const prevStatus = prevStep
    ? (prevStep.status === 'passed' ? 'PASSED in previous run → REGRESSION' : 'also FAILED in previous run (persistent)')
    : 'no previous run data (new step or first run)';

  const userContent = [
    `## Failure context`,
    `Workflow: W${wf.id} — ${wf.label}`,
    `Step ${stepIndex}: "${step.name}"${step.context ? ` [${step.context}]` : ''}`,
    `Previous run: ${prevStatus}`,
    ``,
    `## Error message`,
    step.error ?? '(no error captured — test may have timed out without a message)',
    ``,
    `## DOM snapshot (${snapshot ? `first ${Math.min(snapshot.length, SNAP_MAX)} chars` : 'unavailable'})`,
    snapshot ?? '(HTML snapshot not found — check qa/artifacts/)',
  ].join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 1200,
        system:     CLAUDE_SYSTEM,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[analyst] Claude API error ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '';

    // Strip ```json ... ``` wrapper if present
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);

  } catch (err) {
    console.error(`[analyst] Claude analysis failed: ${err.message}`);
    return null;
  }
}

// ─── Heuristic analysis (no API key required) ─────────────────────────────────

function analyzeHeuristic(failure) {
  const { wf, step, stepIndex } = failure;
  const error = (step.error ?? '').toLowerCase();
  const snap  = ((step.domSnapshot && fs.existsSync(step.domSnapshot))
    ? fs.readFileSync(step.domSnapshot, 'utf8').slice(0, SNAP_MAX)
    : '').toLowerCase();

  for (const pat of HEURISTIC_PATTERNS) {
    if (pat.test(error, snap, step)) {
      const r = pat.result(wf.id, stepIndex);
      return { ...r, confidence: pat.confidence, _source: `heuristic:${pat.id}` };
    }
  }

  // Generic fallback
  return {
    rootCause:
      `Step "${step.name}" failed with no matching known pattern. ` +
      `Manual investigation required — inspect screenshot and HTML snapshot.`,
    component:   'Unknown — see artifacts',
    apiEndpoint: null,
    confidence:  35,
    explanation:
      `Error: ${(step.error ?? '(none)').slice(0, 200)}. ` +
      `No heuristic pattern matched. Check the HTML snapshot for the DOM state at failure time. ` +
      `Run the workflow in headed mode to observe the failure live.`,
    domEvidence: ['(no pattern matched — heuristic analysis insufficient)'],
    suggestedFiles: [
      { path: `qa/e2e/workflow-${wf.id}-*.spec.js`, reason: 'Failing workflow spec' },
      { path: 'qa/helpers/shared-steps.js',          reason: 'Shared step helpers called by this workflow' },
      { path: 'public/app.js',                        reason: 'Frontend state machine — look for the element or action the step expected' },
    ],
    immediateAction: `npm run qa:workflow-${wf.id}:headed  # observe UI state at step ${stepIndex}`,
    _source: 'heuristic:generic',
  };
}

// ─── Report generation ────────────────────────────────────────────────────────

function confidenceBadge(n) {
  if (n >= 80) return '🟢 High';
  if (n >= 60) return '🟡 Medium';
  return '🔴 Low';
}

function statusChange(failure) {
  if (failure.isRegression)  return '✅ PASS → ❌ FAIL  _(regression)_';
  if (failure.isNewFailure)  return '⚫ new step → ❌ FAIL';
  if (failure.isPersistent)  return '❌ FAIL → ❌ FAIL  _(persistent)_';
  return '❌ FAIL';
}

function generateReport(analyses, latest, previousPassing) {
  const ts      = new Date().toISOString();
  const mode    = API_KEY ? `Claude API — \`${MODEL}\`` : 'Heuristic (no ANTHROPIC_API_KEY)';
  const total   = analyses.length;
  const regs    = analyses.filter(a => a.failure.isRegression).length;
  const news    = analyses.filter(a => a.failure.isNewFailure).length;
  const persist = analyses.filter(a => a.failure.isPersistent).length;

  const headline = regs > 0
    ? `🔴 ${regs} regression${regs !== 1 ? 's' : ''} detected`
    : news > 0
      ? `🟡 ${news} new failure${news !== 1 ? 's' : ''} (no prior data)`
      : `⚫ ${persist} persistent failure${persist !== 1 ? 's' : ''} (pre-existing)`;

  const summaryRows = analyses.map((a, i) => {
    const { failure: f, analysis } = a;
    const shortCause = analysis.rootCause.slice(0, 75) + (analysis.rootCause.length > 75 ? '…' : '');
    return `| ${i+1} | W${f.wf.id} | Step ${f.stepIndex} — ${f.step.name}${f.step.context ? ' ['+f.step.context+']' : ''} | ${analysis.confidence}% | ${shortCause} |`;
  });

  const investigations = analyses.map((a, i) => {
    const { failure: f, analysis } = a;
    const shotPath = f.step.screenshot  ? `\`${path.relative(ROOT, f.step.screenshot)}\`` : '_not captured_';
    const snapPath = f.step.domSnapshot ? `\`${path.relative(ROOT, f.step.domSnapshot)}\`` : '_not captured_';

    const highlights = extractDomHighlights(
      f.step.domSnapshot && fs.existsSync(f.step.domSnapshot)
        ? fs.readFileSync(f.step.domSnapshot, 'utf8').slice(0, SNAP_PREVIEW)
        : null
    );
    const domEvidenceLines = [
      ...(analysis.domEvidence ?? []).map(e => `- ${e}`),
      ...(highlights.length ? ['', '**Raw DOM highlights:**', ...highlights.map(h => `  \`${h}\``)] : []),
    ].join('\n');

    const filesList = (analysis.suggestedFiles ?? [])
      .map((f, fi) => `${fi+1}. [\`${f.path}\`](${f.path}) — ${f.reason}`)
      .join('\n');

    const srcNote = analysis._source?.startsWith('heuristic')
      ? `\n> _Analysis source: ${analysis._source} — set ANTHROPIC_API_KEY for Claude-powered analysis_`
      : '';

    return [
      `## Investigation ${i+1} / ${total} — W${f.wf.id} Step ${f.stepIndex}`,
      '',
      `| Field | Value |`,
      `|---|---|`,
      `| **Workflow** | W${f.wf.id} — ${f.wf.label} |`,
      `| **Step** | Step ${f.stepIndex} — \`${f.step.name}\`${f.step.context ? ' \\['+f.step.context+'\\]' : ''} |`,
      `| **Status change** | ${statusChange(f)} |`,
      `| **Confidence** | ${analysis.confidence}% — ${confidenceBadge(analysis.confidence)} |`,
      `| **Screenshot** | ${shotPath} |`,
      `| **HTML snapshot** | ${snapPath} |`,
      '',
      '### Error',
      '',
      '```',
      (f.step.error ?? '(no error message captured)').slice(0, 400),
      '```',
      '',
      '### Probable Root Cause',
      '',
      analysis.rootCause,
      '',
      '### Affected Component',
      '',
      `\`${analysis.component}\``,
      '',
      '### Affected API Endpoint',
      '',
      analysis.apiEndpoint ? `\`${analysis.apiEndpoint}\`` : '_Not identified_',
      '',
      '### Explanation',
      '',
      analysis.explanation,
      srcNote,
      '',
      '### DOM Evidence',
      '',
      domEvidenceLines || '_No snapshot available._',
      '',
      '### Suggested Files to Inspect',
      '',
      filesList || '_None identified._',
      '',
      '### Immediate Next Step',
      '',
      '```',
      analysis.immediateAction ?? `npm run qa:workflow-${f.wf.id}:headed`,
      '```',
      '',
      '---',
      '',
    ].join('\n');
  });

  const prevPassLine = previousPassing
    ? `**Previous passing run:** ${previousPassing.runAt} (commit \`${previousPassing.commit}\`)`
    : `**Previous passing run:** _none recorded_`;

  const lines = [
    '# Coach\'s Eye — QA Investigation Report',
    '',
    `**Generated:** ${ts}`,
    `**Nightly run:** ${latest.runAt} (commit \`${latest.commit}\`, overall: ${latest.overall})`,
    prevPassLine,
    `**Analysis mode:** ${mode}`,
    '',
    `## ${headline}`,
    '',
    '---',
    '',
    '## Summary',
    '',
    `| # | Workflow | Failed Step | Confidence | Root Cause |`,
    `|---|---|---|---|---|`,
    ...summaryRows,
    '',
    '---',
    '',
    ...investigations,
    '## Methodology',
    '',
    '- Failure data read from: `qa/history/` (step names, statuses, error messages, artifact paths)',
    '- HTML snapshots analyzed from: `qa/artifacts/` (captured at failure time by Playwright)',
    `- Analysis model: ${mode}`,
    '- Confidence score reflects: error message specificity, DOM evidence match strength, pattern library match',
    '',
    '> To run analyst standalone: `node qa/analyst.js`  ',
    '> To use Claude API: set `ANTHROPIC_API_KEY` in environment  ',
    '> To override model: `QA_ANALYST_MODEL=claude-haiku-4-5-20251001 node qa/analyst.js`',
    '',
  ];

  fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
  console.log('[analyst] Report written: INVESTIGATION_REPORT.md');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(62)}`);
console.log(`  Coach's Eye — QA Analyst`);
console.log(`  Mode: ${API_KEY ? `Claude API (${MODEL})` : 'Heuristic (no ANTHROPIC_API_KEY)'}`);
console.log(`${'─'.repeat(62)}\n`);

const { latest, previousPassing } = loadRuns();

if (!latest) {
  console.error('[analyst] No run data found. Run qa:nightly first.');
  process.exit(1);
}

console.log(`[analyst] Latest run  : ${latest.runAt} — ${latest.overall}`);
console.log(`[analyst] Prev passing: ${previousPassing?.runAt ?? '(none)'}`);

const failures = findFailures(latest, previousPassing);

if (failures.length === 0) {
  console.log('[analyst] No failed steps in latest run — nothing to investigate.');
  const cleanReport = [
    '# Coach\'s Eye — QA Investigation Report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Run:** ${latest.runAt} (commit \`${latest.commit}\`)`,
    '',
    '## ✅ No Failures',
    '',
    'All steps in the latest nightly run passed. No investigation required.',
    '',
  ].join('\n');
  fs.writeFileSync(REPORT_PATH, cleanReport + '\n');
  process.exit(0);
}

console.log(`[analyst] Found ${failures.length} failed step(s) across ${[...new Set(failures.map(f => f.wf.id))].length} workflow(s)\n`);

const analyses = [];

for (const failure of failures) {
  const label = `W${failure.wf.id} Step ${failure.stepIndex} — "${failure.step.name}"`;
  process.stdout.write(`[analyst] Analyzing ${label}… `);

  const snapshot = readSnapshot(failure.step.domSnapshot);
  let   analysis = null;

  if (API_KEY) {
    analysis = await analyzeWithClaude(failure, snapshot);
    if (analysis) {
      console.log(`✓ Claude (${analysis.confidence}% confidence)`);
    } else {
      console.log('✗ Claude failed — falling back to heuristics');
    }
  }

  if (!analysis) {
    analysis = analyzeHeuristic(failure);
    if (!API_KEY) console.log(`heuristic (${analysis.confidence}%)`);
  }

  analyses.push({ failure, analysis });
}

generateReport(analyses, latest, previousPassing);

const regressionsCount = failures.filter(f => f.isRegression).length;
const newCount         = failures.filter(f => f.isNewFailure).length;
console.log(`\n[analyst] Done. ${regressionsCount} regression(s), ${newCount} new failure(s).`);
console.log(`[analyst] INVESTIGATION_REPORT.md written.\n`);
