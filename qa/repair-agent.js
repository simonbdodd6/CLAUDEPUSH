/**
 * qa/repair-agent.js — Repair Agent (Phase 6)
 *
 * Reads the failure data produced by qa/analyst.js and generates a concrete,
 * human-reviewable patch proposal. The agent:
 *
 *   1. Loads the latest nightly run from qa/history/
 *   2. Loads INVESTIGATION_REPORT.md for the analyst's conclusions
 *   3. Reads the actual source files mentioned in the investigation
 *   4. Calls Claude API to propose the minimal code change
 *   5. Writes PATCH_PROPOSAL.md — never modifies source files
 *
 * SCOPE CONSTRAINT: The repair agent only generates patchable diffs for
 * qa/ files (test specs, shared-steps.js). For root causes that live in
 * application code (api/, src/, index.html) it describes the required fix
 * in prose and marks it "app-code: requires human review".
 *
 * Usage:
 *   node qa/repair-agent.js                      # analyze latest run
 *   ANTHROPIC_API_KEY=sk-... node qa/repair-agent.js
 *   QA_REPAIR_MODEL=claude-haiku-4-5-20251001 node qa/repair-agent.js
 *
 * Called automatically by qa/nightly.js after qa/analyst.js completes.
 */

import fs   from 'node:fs';
import path from 'node:path';

const ROOT         = process.cwd();
const HISTORY_DIR  = path.join(ROOT, 'qa/history');
const HISTORY_IDX  = path.join(HISTORY_DIR, 'index.json');
const INVEST_REPORT = path.join(ROOT, 'INVESTIGATION_REPORT.md');
const PATCH_REPORT  = path.join(ROOT, 'PATCH_PROPOSAL.md');
const API_KEY       = process.env.ANTHROPIC_API_KEY;
const MODEL         = process.env.QA_REPAIR_MODEL ?? 'claude-sonnet-4-6';

// Max bytes to include from any single file in the Claude prompt
const FILE_MAX = 18_000;
// Max bytes from index.html (searched by keyword, not read whole)
const HTML_EXCERPT_MAX = 10_000;

// ─── QA file registry ─────────────────────────────────────────────────────────
// Maps workflow IDs to their spec files and the shared helper.
// The repair agent reads these in full to propose patches.

const QA_FILES = {
  shared:  'qa/helpers/shared-steps.js',
  specs: {
    4: 'qa/e2e/workflow-4-pending-approval.spec.js',
    5: 'qa/e2e/workflow-5-messaging.spec.js',
    6: 'qa/e2e/workflow-6-squad-broadcast.spec.js',
    7: 'qa/e2e/workflow-7-session-expiry.spec.js',
  },
};

// App code is read for context only — never patched by this agent.
const APP_FILES_SMALL = [
  'api/invite.js',
  'api/chat.js',
  'api/identity.js',
  'src/chat-state.js',
  'src/player-identity.js',
];
// index.html is too large for full read — we excerpt it by keyword search.

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
  const failures = [];
  for (const wf of (run?.workflows ?? [])) {
    for (const [i, step] of wf.steps.entries()) {
      if (step.status === 'failed') {
        failures.push({ wf, step, stepIndex: i + 1 });
      }
    }
  }
  return failures;
}

// ─── File loading ─────────────────────────────────────────────────────────────

function readFileFull(relPath, maxBytes = FILE_MAX) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    if (raw.length <= maxBytes) return raw;
    // Truncate with a notice
    return raw.slice(0, maxBytes) + `\n\n... [file truncated at ${maxBytes} bytes — ${raw.length} total] ...`;
  } catch { return null; }
}

/**
 * Extract relevant sections from index.html by searching for keyword mentions.
 * Returns up to HTML_EXCERPT_MAX bytes of matched context.
 */
function excerptHtml(keywords) {
  const abs = path.join(ROOT, 'index.html');
  if (!fs.existsSync(abs)) return null;
  let html;
  try { html = fs.readFileSync(abs, 'utf8'); } catch { return null; }

  const WINDOW = 40; // lines of context around each match
  const lines  = html.split('\n');
  const hits   = new Set();

  for (const kw of keywords) {
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        for (let j = Math.max(0, i - WINDOW); j < Math.min(lines.length, i + WINDOW); j++) {
          hits.add(j);
        }
      }
    }
  }

  if (hits.size === 0) return null;

  const sorted = [...hits].sort((a, b) => a - b);
  const parts  = [];
  let prev     = -2;

  for (const ln of sorted) {
    if (ln > prev + 1) parts.push(`\n... (lines skipped) ...\n`);
    parts.push(`${String(ln + 1).padStart(5)}: ${lines[ln]}`);
    prev = ln;
  }

  const result = parts.join('\n');
  return result.length > HTML_EXCERPT_MAX
    ? result.slice(0, HTML_EXCERPT_MAX) + '\n... [excerpt truncated] ...'
    : result;
}

/**
 * Build the file context bundle for a single failure.
 * Returns an object: { qaFiles: {path → content}, appFiles: {path → content} }
 */
function buildFileContext(failure) {
  const wfId   = failure.wf.id;
  const qaCtx  = {};
  const appCtx = {};

  // Always include the shared helper and the failing workflow's spec
  const sharedContent = readFileFull(QA_FILES.shared);
  if (sharedContent) qaCtx[QA_FILES.shared] = sharedContent;

  const specPath = QA_FILES.specs[wfId];
  if (specPath) {
    const specContent = readFileFull(specPath);
    if (specContent) qaCtx[specPath] = specContent;
  }

  // Include small app files (api/, src/) for context
  for (const f of APP_FILES_SMALL) {
    const c = readFileFull(path.join(f));
    if (c) appCtx[f] = c;
  }

  // If error or step name mentions a specific function, excerpt index.html
  const keywords = extractKeywordsFromFailure(failure);
  if (keywords.length > 0) {
    const excerpt = excerptHtml(keywords);
    if (excerpt) appCtx['index.html (excerpt)'] = excerpt;
  }

  return { qaCtx, appCtx };
}

function extractKeywordsFromFailure(failure) {
  const text = [failure.step.name, failure.step.error ?? ''].join(' ');
  const found = [];
  const SELECTORS = [
    '#authPanel', '#playerNav', '#coachNav', '#chatInput', '#chatMessages',
    '#identityLoginEmail', '#identityLoginBtn', '#devLoginBtn', '#teamSelect',
    'handleSessionExpiry', 'setAuthTab', 'intercept401', 'playerLogin',
    'ce_session', 'nav-badge', 'sendMessage', 'pollChat',
  ];
  for (const sel of SELECTORS) {
    if (text.includes(sel) || sel.includes(text.slice(0, 10))) found.push(sel);
  }
  // Also extract word-shaped tokens from the error message
  const tokens = text.match(/[a-zA-Z_$][a-zA-Z0-9_$]{4,}/g) ?? [];
  for (const t of tokens) {
    if (!found.includes(t) && found.length < 6) found.push(t);
  }
  return found.slice(0, 6);
}

// ─── Claude API ───────────────────────────────────────────────────────────────

const REPAIR_SYSTEM = `You are a QA repair agent for Coach's Eye, a real-time coaching platform.

## Your role
Analyze a test regression and propose the MINIMAL code change to fix it.
You may ONLY propose patches for files under qa/ (test specs and helpers).
For root causes in application code (api/, src/, index.html) you must
describe the fix in prose under "appFixRequired" — never generate a diff for those files.

## Architecture reminder
- Frontend SPA: index.html (inline JS) — contains handleSessionExpiry(), setAuthTab(), intercept401, playerLogin, coachLogin
- API routes: api/invite.js, api/chat.js, api/identity.js (Vercel serverless)
- QA helpers: qa/helpers/shared-steps.js — playerLogin(), coachLogin(), navigateToMessages(), openPlayerDM()
- QA specs: qa/e2e/workflow-N-*.spec.js

## Known fragility patterns and their fixes
1. 403-triggered session overlay during player navigation
   → Fix (qa): add overlay dismissal guard after #playerNav:not(.hidden) becomes visible
   → Already exists in playerLogin() — may need to be added to navigateToMessages() or post-login steps
2. Nav badge accessible-name mismatch (Messages2)
   → Fix (qa): use /^Messages/ regex in getByRole('button', { name: /^Messages/ })
3. Playwright locator too strict / missing .catch() on isVisible
   → Fix (qa): add .catch(() => false) to prevent test crash on optional elements
4. Missing conversation before chatInput
   → Fix (qa): ensure openPlayerDM/chatStartCoachDm is called before sending messages

## Output format
Respond with ONLY this exact JSON — no markdown wrapper, no extra keys:
{
  "rootCauseSummary": "2–3 sentences. Specific and mechanistic.",
  "confidence": <integer 0-100>,
  "patchCategory": "qa-only" | "app-fix-required" | "qa-and-app",
  "appFixRequired": "<string describing what needs to change in app code, or null>",
  "changes": [
    {
      "file": "<relative path under qa/ — MUST start with qa/>",
      "purpose": "<what this change achieves>",
      "contextNote": "<function name and rough location in file>",
      "searchFor": "<verbatim text that EXISTS in the file as provided — quote it exactly. If you cannot find an exact match, set to null>",
      "replaceWith": "<replacement text — full replacement including any unchanged surrounding lines needed for context>"
    }
  ],
  "risks": ["<risk> — <severity: low|medium|high>"],
  "verificationSteps": ["<human-readable step>"],
  "verificationCommands": ["<shell command>"],
  "decisionNote": "<1–2 sentences for the human reviewer>"
}`;

async function callRepairAgent(failure, investigationText, fileCtx) {
  if (!API_KEY) return null;

  const { wf, step, stepIndex } = failure;
  const { qaCtx, appCtx } = fileCtx;

  const qaFileBlocks = Object.entries(qaCtx)
    .map(([fp, content]) => `### ${fp}\n\`\`\`javascript\n${content}\n\`\`\``)
    .join('\n\n');

  const appFileBlocks = Object.entries(appCtx)
    .map(([fp, content]) => `### ${fp} (context only — do NOT generate patches for this)\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  const userContent = [
    `## Failure`,
    `Workflow: W${wf.id} — ${wf.label}`,
    `Step ${stepIndex}: "${step.name}"${step.context ? ` [${step.context}]` : ''}`,
    `Error: ${step.error ?? '(no message captured)'}`,
    ``,
    `## Analyst investigation`,
    investigationText.slice(0, 6_000),
    ``,
    `## QA source files (you may propose patches for these)`,
    qaFileBlocks,
    appFileBlocks ? `\n## Application files (context only — prose description only, no diffs)\n${appFileBlocks}` : '',
  ].filter(Boolean).join('\n');

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
        system:     REPAIR_SYSTEM,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[repair] Claude API error ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }

    const data    = await res.json();
    const rawText = data.content?.[0]?.text ?? '';
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return JSON.parse(cleaned);

  } catch (err) {
    console.error(`[repair] Claude call failed: ${err.message}`);
    return null;
  }
}

// ─── Heuristic fallback ───────────────────────────────────────────────────────

function repairHeuristic(failure) {
  const { wf, step, stepIndex } = failure;
  const error = (step.error ?? '').toLowerCase();
  const snap  = ((step.domSnapshot && fs.existsSync(step.domSnapshot))
    ? fs.readFileSync(step.domSnapshot, 'utf8').slice(0, 8_000)
    : '').toLowerCase();

  // Pattern 1: session overlay over navigation
  if (
    /navigat|messages|playernav|nav/i.test(step.name) &&
    /session.*expir|identitylogin|authpanel/i.test(snap + error)
  ) {
    return {
      rootCauseSummary:
        '403-triggered session overlay is covering navigation. ' +
        'A coach-only endpoint returned 403 during player\'s initial data load, ' +
        'which incorrectly fires handleSessionExpiry() via intercept401.',
      confidence: 82,
      patchCategory: 'qa-only',
      appFixRequired: null,
      changes: [{
        file:        'qa/helpers/shared-steps.js',
        purpose:     'Add overlay dismissal guard in navigateToMessages() to handle post-login 403-triggered overlay',
        contextNote: 'navigateToMessages() — before or around the page.getByRole("button"... click',
        searchFor:   null,
        replaceWith:
          `// Dismiss 403-triggered overlay if it appeared since login\n` +
          `const overlayUp = await page.locator('#identityLoginEmail').isVisible({ timeout: 2_000 }).catch(() => false);\n` +
          `if (overlayUp) {\n` +
          `  await page.evaluate(() => { if (typeof window.setAuthTab === 'function') window.setAuthTab('closed'); });\n` +
          `  await expect(page.locator('#identityLoginEmail')).toBeHidden({ timeout: 5_000 });\n` +
          `}`,
      }],
      risks: [
        'setAuthTab("closed") dismisses auth panel without touching session — safe if #playerNav is already visible — low',
        'If overlay is genuinely showing because session expired, this dismissal hides a real problem — low (playerNav visibility confirms session is valid)',
      ],
      verificationSteps: [
        `Apply the change to qa/helpers/shared-steps.js in navigateToMessages()`,
        `Run W${wf.id} individually in headed mode to observe the overlay`,
        `Confirm step ${stepIndex} completes without timeout`,
        `Run full nightly to verify no regressions in other workflows`,
      ],
      verificationCommands: [
        `npm run qa:workflow-${wf.id}:headed`,
        `npm run qa:workflow-${wf.id}`,
        `npm run qa:nightly`,
      ],
      decisionNote:
        'This fix adds a defensive dismiss guard — it does not change login mechanics or session state. ' +
        'Safe to apply if #playerNav was confirmed visible before the navigation step.',
      _source: 'heuristic:session-overlay-nav',
    };
  }

  // Pattern 2: nav badge accessible name
  if (
    /Messages2|getByRole.*messages|nav.*badge/i.test(error) ||
    (/messages/i.test(step.name) && /strict mode|0 elements/i.test(error))
  ) {
    return {
      rootCauseSummary:
        'Nav badge span merges into the Messages button accessible name. ' +
        'When unread count > 0, the button accessible name becomes "Messages2", ' +
        'breaking the exact-match locator.',
      confidence: 90,
      patchCategory: 'qa-only',
      appFixRequired: null,
      changes: [{
        file:        'qa/helpers/shared-steps.js',
        purpose:     'Use regex prefix match for Messages nav button to tolerate badge digits',
        contextNote: 'navigateToMessages() — the getByRole("button"...) click',
        searchFor:   `getByRole('button', { name: 'Messages', exact: true })`,
        replaceWith: `getByRole('button', { name: /^Messages/ })`,
      }],
      risks: [
        'Regex /^Messages/ matches any button whose name starts with "Messages" — could match false positives if another button exists — low (no other buttons match this prefix in the app)',
      ],
      verificationSteps: [
        `Apply the change to qa/helpers/shared-steps.js`,
        `Run W${wf.id} with an active unread count (at least 1 squad message sent before step)`,
        `Confirm step ${stepIndex} finds the button correctly`,
      ],
      verificationCommands: [
        `npm run qa:workflow-${wf.id}`,
        `npm run qa:nightly`,
      ],
      decisionNote:
        'One-character change with very high confidence. The regex /^Messages/ is the established pattern already used elsewhere in shared-steps.js.',
      _source: 'heuristic:nav-badge',
    };
  }

  // Generic fallback
  return {
    rootCauseSummary: `No heuristic pattern matched for step "${step.name}". Manual investigation required.`,
    confidence: 30,
    patchCategory: 'app-fix-required',
    appFixRequired:
      `This failure could not be automatically diagnosed. ` +
      `Review INVESTIGATION_REPORT.md and the HTML snapshot at ${step.domSnapshot ?? '(not captured)'}. ` +
      `Error: ${(step.error ?? '(none)').slice(0, 200)}`,
    changes: [],
    risks: ['Unknown — manual analysis needed — high'],
    verificationSteps: [
      `Run W${wf.id} in headed mode and observe step ${stepIndex} visually`,
      `Open qa/artifacts/ to review screenshot and HTML snapshot`,
    ],
    verificationCommands: [`npm run qa:workflow-${wf.id}:headed`],
    decisionNote: 'No automated patch can be proposed. See INVESTIGATION_REPORT.md for analyst conclusions.',
    _source: 'heuristic:generic',
  };
}

// ─── Diff computation ─────────────────────────────────────────────────────────

/**
 * Verify that `searchFor` actually appears in the file content.
 * Returns the line number of the first match, or -1 if not found.
 */
function findInFile(filePath, searchFor) {
  if (!searchFor) return -1;
  const abs = path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) return -1;
  try {
    const content = fs.readFileSync(abs, 'utf8');
    const idx     = content.indexOf(searchFor);
    if (idx === -1) return -1;
    return content.slice(0, idx).split('\n').length;
  } catch { return -1; }
}

// ─── Report generation ────────────────────────────────────────────────────────

function confidenceBadge(n) {
  if (n >= 80) return '🟢 High';
  if (n >= 60) return '🟡 Medium';
  return '🔴 Low';
}

function categoryLabel(cat) {
  if (cat === 'qa-only')        return '🔵 QA-only — no app code changes needed';
  if (cat === 'app-fix-required') return '🔴 App fix required — see prose description below';
  if (cat === 'qa-and-app')     return '🟡 Both QA and app changes required';
  return cat;
}

function renderChange(change, idx, total) {
  const lineHint = change.file && change.searchFor
    ? findInFile(change.file, change.searchFor)
    : -1;
  const foundNote = lineHint > 0
    ? `_(found at line ~${lineHint} in \`${change.file}\`)_`
    : change.searchFor
      ? `⚠ _search string not verified in current file — double-check before applying_`
      : `_(no search string — insert at context location described above)_`;

  const searchBlock = change.searchFor
    ? [`**Search for** ${foundNote}:`, '```javascript', change.searchFor, '```', '']
    : [`**Location:** ${change.contextNote ?? 'see context note above'}`, ''];

  const replaceBlock = change.replaceWith
    ? ['**Replace with:**', '```javascript', change.replaceWith, '```', '']
    : [];

  return [
    `### Change ${idx + 1} / ${total} — \`${change.file}\``,
    '',
    `**Purpose:** ${change.purpose}`,
    change.contextNote ? `**Location:** ${change.contextNote}` : '',
    '',
    ...searchBlock,
    ...replaceBlock,
  ].filter(l => l !== null).join('\n');
}

function generatePatchReport(proposals, latestRun) {
  const ts   = new Date().toISOString();
  const mode = API_KEY ? `Claude API — \`${MODEL}\`` : 'Heuristic (no ANTHROPIC_API_KEY)';

  const totalChanges = proposals.reduce((s, p) => s + p.proposal.changes.length, 0);
  const hasAppFix    = proposals.some(p => p.proposal.patchCategory !== 'qa-only');

  // Summary table
  const summaryRows = proposals.map((p, i) => {
    const { failure: f, proposal } = p;
    const cat = proposal.patchCategory === 'qa-only' ? '🔵 QA' : '🔴 App+QA';
    return `| ${i+1} | W${f.wf.id} | Step ${f.stepIndex} — ${f.step.name} | ${proposal.confidence}% ${confidenceBadge(proposal.confidence)} | ${cat} | ${proposal.changes.length} |`;
  });

  const investigations = proposals.map((p, total_p, arr) => {
    const { failure: f, proposal } = p;
    const changeBlocks = proposal.changes.map((c, ci) => renderChange(c, ci, proposal.changes.length));
    const riskList     = (proposal.risks ?? []).map(r => `- ${r}`).join('\n');
    const verifSteps   = (proposal.verificationSteps ?? []).map((s, i) => `${i+1}. ${s}`).join('\n');
    const cmds         = (proposal.verificationCommands ?? []).map(c => c).join('\n');

    const srcNote = proposal._source?.startsWith('heuristic')
      ? `\n> _Proposal source: ${proposal._source} — set ANTHROPIC_API_KEY for Claude-powered repair_`
      : '';

    return [
      `## Proposal ${arr.indexOf(p) + 1} / ${arr.length} — W${f.wf.id} Step ${f.stepIndex}`,
      '',
      `| | |`,
      `|---|---|`,
      `| **Workflow** | W${f.wf.id} — ${f.wf.label} |`,
      `| **Failed step** | Step ${f.stepIndex} — \`${f.step.name}\`${f.step.context ? ' ['+f.step.context+']' : ''} |`,
      `| **Confidence** | ${proposal.confidence}% — ${confidenceBadge(proposal.confidence)} |`,
      `| **Patch category** | ${categoryLabel(proposal.patchCategory)} |`,
      `| **Files to modify** | ${proposal.changes.map(c => `\`${c.file}\``).join(', ') || '_none_'} |`,
      '',
      '### Root Cause Summary',
      '',
      proposal.rootCauseSummary,
      srcNote,
      '',
      ...(proposal.appFixRequired ? [
        '### App Code Change Required',
        '',
        '> ⚠ The following describes a required change to application code.',
        '> This agent does NOT generate diffs for app code — apply manually after review.',
        '',
        proposal.appFixRequired,
        '',
      ] : []),
      ...(proposal.changes.length > 0 ? [
        '### Proposed QA Changes',
        '',
        ...changeBlocks.flatMap(b => [b, '']),
      ] : [
        '### Proposed Changes',
        '',
        '_No patchable QA changes identified. See app code section above._',
        '',
      ]),
      '### Risks',
      '',
      riskList || '- No significant risks identified.',
      '',
      '### Verification Plan',
      '',
      verifSteps,
      '',
      '### Exact Commands',
      '',
      '```bash',
      cmds,
      '```',
      '',
      proposal.decisionNote ? ['### Decision Note', '', proposal.decisionNote, ''].join('\n') : '',
      '---',
      '',
    ].filter(l => l !== null).join('\n');
  });

  const disclaimer = hasAppFix
    ? '> ⚠ Some proposals require changes to application code — those are described in prose only. Apply with care after human review.'
    : '> All proposals target qa/ files only. Application code is unchanged.';

  const lines = [
    '# Coach\'s Eye — Patch Proposal',
    '',
    `**Generated:** ${ts}`,
    `**Nightly run:** ${latestRun.runAt} (commit \`${latestRun.commit}\`)`,
    `**Repair agent:** ${mode}`,
    `**Status:** PROPOSED — not applied, not committed`,
    '',
    disclaimer,
    '',
    '---',
    '',
    '## Summary',
    '',
    `| # | Workflow | Failed Step | Confidence | Patch | Changes |`,
    `|---|---|---|---|---|---|`,
    ...summaryRows,
    '',
    `**Total proposed changes:** ${totalChanges} across ${proposals.length} failure(s)`,
    '',
    '---',
    '',
    ...investigations,
    '## How to Apply',
    '',
    '1. Review each "Proposed QA Changes" section above.',
    '2. For each change, open the named `qa/` file.',
    '3. Find the **Search for** text and replace it with the **Replace with** text.',
    '4. If `searchFor` is null, insert the replacement at the indicated location.',
    '5. Run the verification commands listed.',
    '6. If all workflows pass, commit the changes to the QA branch.',
    '',
    '> **Do not apply automatically.** Each change requires human review.',
    '> **Do not commit until verification commands pass.**',
    '',
    '## Scope Reminder',
    '',
    '- This agent only patches `qa/` files.',
    '- App code changes (api/, src/, index.html) are described in prose and require a separate human-authored commit.',
    '- This file (`PATCH_PROPOSAL.md`) is overwritten on each nightly run.',
    '',
    '---',
    '',
    `_Generated by qa/repair-agent.js · Analysis: ${mode}_`,
    '',
  ];

  fs.writeFileSync(PATCH_REPORT, lines.join('\n') + '\n');
  console.log('[repair] Report written: PATCH_PROPOSAL.md');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(62)}`);
console.log(`  Coach's Eye — Repair Agent`);
console.log(`  Mode: ${API_KEY ? `Claude API (${MODEL})` : 'Heuristic (no ANTHROPIC_API_KEY)'}`);
console.log(`${'─'.repeat(62)}\n`);

const latestRun = loadLatestRun();

if (!latestRun) {
  console.error('[repair] No run data found at qa/history/ — run qa:nightly first.');
  process.exit(1);
}

console.log(`[repair] Latest run  : ${latestRun.runAt} — ${latestRun.overall}`);

const failures = findFailures(latestRun);

if (failures.length === 0) {
  console.log('[repair] No failed steps in latest run — nothing to repair.');
  const clean = [
    '# Coach\'s Eye — Patch Proposal',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Run:** ${latestRun.runAt} (commit \`${latestRun.commit}\`)`,
    '',
    '## ✅ No Failures',
    '',
    'All steps passed. No patch proposal required.',
    '',
  ].join('\n');
  fs.writeFileSync(PATCH_REPORT, clean + '\n');
  process.exit(0);
}

console.log(`[repair] ${failures.length} failed step(s) found\n`);

// Read the investigation report as additional context for Claude
const investigationText = fs.existsSync(INVEST_REPORT)
  ? fs.readFileSync(INVEST_REPORT, 'utf8')
  : '(INVESTIGATION_REPORT.md not found — analyst may not have run yet)';

const proposals = [];

for (const failure of failures) {
  const label = `W${failure.wf.id} Step ${failure.stepIndex} — "${failure.step.name}"`;
  process.stdout.write(`[repair] Generating patch for ${label}… `);

  const fileCtx = buildFileContext(failure);
  let proposal  = null;

  if (API_KEY) {
    proposal = await callRepairAgent(failure, investigationText, fileCtx);
    if (proposal) {
      console.log(`✓ Claude (${proposal.confidence}% confidence, ${proposal.changes.length} change(s))`);
    } else {
      console.log('✗ Claude failed — falling back to heuristics');
    }
  }

  if (!proposal) {
    proposal = repairHeuristic(failure);
    if (!API_KEY) console.log(`heuristic (${proposal.confidence}%)`);
  }

  // Safety check: strip any proposed changes targeting non-qa/ files
  const safeguardedChanges = (proposal.changes ?? []).filter(c => {
    const isQa = c.file?.startsWith('qa/');
    if (!isQa) {
      console.warn(`[repair] ⚠ Stripping non-qa/ change: ${c.file} — moved to appFixRequired`);
      proposal.appFixRequired = [
        proposal.appFixRequired,
        `Proposed change to ${c.file}: ${c.purpose} — apply manually after review.`,
      ].filter(Boolean).join('\n');
    }
    return isQa;
  });
  proposal.changes = safeguardedChanges;
  if (safeguardedChanges.length === 0 && proposal.patchCategory === 'qa-only') {
    proposal.patchCategory = 'app-fix-required';
  }

  proposals.push({ failure, proposal });
}

generatePatchReport(proposals, latestRun);

const totalChanges = proposals.reduce((s, p) => s + p.proposal.changes.length, 0);
console.log(`\n[repair] Done. ${totalChanges} change(s) proposed across ${proposals.length} failure(s).`);
console.log(`[repair] PATCH_PROPOSAL.md written.\n`);
