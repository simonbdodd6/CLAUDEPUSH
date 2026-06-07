/**
 * Workflow 3 — Invite Claim → Registration → Verify Player in Members
 *
 * Steps:
 *   1.  Open app                   — coach context, #authPanel visible
 *   2.  Coach login                — shared helper
 *   3.  Navigate to Members        — shared helper
 *   4.  Open invite panel          — shared helper  [skipped if QA_INVITE_URL set]
 *   5.  Generate invite            — shared helper  [skipped if QA_INVITE_URL set]
 *   6.  Verify invite link         — shared helper  [skipped if QA_INVITE_URL set]
 *   7.  Open invite URL as player  — fresh browser context, #invite-modal visible
 *   8.  Fill registration form     — #invite-email-input + #invite-password-input
 *   9.  Submit registration        — #invite-modal .btn.primary → modal detaches
 *   10. Return to coach context    — assert coach nav still active
 *   11. Verify player in Members   — re-click Members, check player name in #coach-players
 *
 * QA_INVITE_URL env var: when set, steps 4–6 are skipped and the URL is used directly.
 * This lets you re-run the player registration half without consuming Redis invite quota.
 *
 * Stops on first failure. Saves PNG + HTML at every step (both contexts).
 * Writes qa/results/workflow-3.json and QA_WORKFLOW_3_REPORT.md.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  openApp,
  coachLogin,
  navigateToMembers,
  openInvitePanel,
  generateInvite,
  verifyInviteLink,
  openInviteUrl,
  fillRegistrationForm,
  submitRegistration,
  verifyPlayerInMembers,
  redisEstimate,
} from '../helpers/shared-steps.js';

// ─── Run identity ────────────────────────────────────────────────────────────
const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow3-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-3.json');
const reportPath  = path.join(process.cwd(), 'QA_WORKFLOW_3_REPORT.md');

// ─── Config ──────────────────────────────────────────────────────────────────
const ts = Date.now();
const config = {
  baseURL:            process.env.QA_BASE_URL             || 'http://127.0.0.1:3000',
  coachEmail:         process.env.QA_COACH_EMAIL          || 'simonbdodd@gmail.com',
  coachPassword:      process.env.QA_COACH_PASSWORD       || '',
  // Player identity — used for both invite creation and registration form
  testPlayerName:     process.env.QA_TEST_PLAYER_NAME     || `QA W3 Player ${ts}`,
  testPlayerEmail:    process.env.QA_TEST_PLAYER_EMAIL     || `qa.w3+${ts}@coachseye.test`,
  testPlayerPassword: process.env.QA_TEST_PLAYER_PASSWORD || 'qatest12345',
  // generateInvite expects these aliases
  get inviteName()  { return this.testPlayerName; },
  get inviteEmail() { return this.testPlayerEmail; },
};

const skipGeneration = Boolean(process.env.QA_INVITE_URL);

// ─── Result accumulator ──────────────────────────────────────────────────────
const result = {
  workflow:     'workflow-3',
  runId,
  startedAt:    new Date().toISOString(),
  finishedAt:   null,
  status:       'running',
  baseURL:      config.baseURL,
  commit:       gitCommit(),
  loginMethod:  config.coachPassword ? 'credentials' : 'dev-login-btn',
  skipGeneration,
  inviteLink:   skipGeneration ? (process.env.QA_INVITE_URL || null) : null,
  inviteToken:  null,
  steps:        [],
  // Coach context
  console:      [],
  toasts:       [],
  pageErrors:   [],
  // Player context (separate to avoid cross-contamination of toast detection)
  playerConsole:    [],
  playerToasts:     [],
  playerPageErrors: [],
  // Combined API tracking
  requestFailures:         [],
  apiCalls:                [],
  missingSelectorWarnings: [],
};

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

// ─── Filesystem helpers ──────────────────────────────────────────────────────
function ensureDirs() {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
}

function rel(file) {
  return file ? path.relative(process.cwd(), file).replaceAll(path.sep, '/') : '';
}

function slug(v) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function mdList(items, empty) {
  return items.length ? items.map(i => `- ${i}`).join('\n') : `- ${empty}`;
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function writeResult(status = result.status) {
  result.status     = status;
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

function writeReport() {
  const failed  = result.steps.find(s => s.status === 'failed');
  const passed  = result.steps.filter(s => s.status === 'passed');
  const skipped = result.steps.filter(s => s.status === 'skipped');
  const consErr = [
    ...result.console.filter(e => ['error', 'warning'].includes(e.type)).map(e => `[coach] ${e.type}: ${e.text}`),
    ...result.playerConsole.filter(e => ['error', 'warning'].includes(e.type)).map(e => `[player] ${e.type}: ${e.text}`),
  ];

  // Redis impact table
  const apiGroups = {};
  for (const call of result.apiCalls) {
    const key = `${call.endpoint} [${call.context || 'coach'}]`;
    if (!apiGroups[key]) apiGroups[key] = { calls: 0, methods: new Set(), estimatedOps: 0 };
    apiGroups[key].calls += 1;
    apiGroups[key].methods.add(call.method);
    apiGroups[key].estimatedOps += redisEstimate(call.endpoint, call.method);
  }
  const apiRows = Object.entries(apiGroups)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([ep, g]) => `| \`${ep}\` | ${[...g.methods].join('/')} | ${g.calls} | ~${g.estimatedOps} |`);
  const totalCalls = Object.values(apiGroups).reduce((s, g) => s + g.calls, 0);
  const totalOps   = Object.values(apiGroups).reduce((s, g) => s + g.estimatedOps, 0);

  // Step table
  const stepRows = result.steps.map((step, i) => {
    const shot  = step.screenshot ? `[png](${rel(step.screenshot)})` : '—';
    const ms    = (step.finishedAt && step.startedAt)
      ? Math.round(new Date(step.finishedAt) - new Date(step.startedAt)) : '—';
    const note  = (step.error || step.note || '').slice(0, 130);
    const ctx   = step.context ? ` [${step.context}]` : '';
    return `| ${i + 1} | ${step.name}${ctx} | ${step.status.toUpperCase()} | ${ms}ms | ${shot} | ${note} |`;
  });

  const lines = [
    '# QA Workflow 3 — Invite Claim → Registration → Verify Player',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Commit:** \`${result.commit}\``,
    `**Base URL:** ${result.baseURL}`,
    `**Login method:** ${result.loginMethod}`,
    `**Generation skipped:** ${skipGeneration ? `yes — QA_INVITE_URL was set` : 'no — invite generated during run'}`,
    `**Status:** ${result.status.toUpperCase()}`,
    '',
    '---',
    '',
    '## Result',
    '',
    `- **Overall:** ${result.status === 'passed' ? '✅ PASS' : result.status === 'failed' ? '❌ FAIL' : '⚠️ ' + result.status.toUpperCase()}`,
    failed
      ? `- **First failure:** Step ${result.steps.indexOf(failed) + 1} — "${failed.name}"`
      : '- **First failure:** none',
    failed ? `- **Error:** ${failed.error || '(none)'}` : '',
    failed?.screenshot ? `- **Failure screenshot:** ${rel(failed.screenshot)}` : '',
    '',
    '## Steps',
    '',
    '| # | Step | Status | Duration | Screenshot | Notes |',
    '|---|---|---|---|---|---|',
    ...stepRows,
    '',
    '## Invite & Registration Details',
    '',
    `- **Invite name:** \`${config.inviteName}\``,
    `- **Invite email:** \`${config.inviteEmail}\``,
    result.inviteLink
      ? `- **Invite URL:** \`${result.inviteLink}\``
      : '- **Invite URL:** not generated (step did not reach)',
    result.inviteToken
      ? `- **Invite token:** \`${result.inviteToken}\` (${result.inviteToken.length} chars)`
      : '- **Invite token:** not extracted',
    `- **Registration email:** \`${config.testPlayerEmail}\``,
    `- **Player name to verify:** \`${config.testPlayerName}\``,
    '',
    '## Browser Contexts',
    '',
    '- **Coach context:** standard Playwright \`page\` fixture — steps 1–3, 10–11',
    '- **Player context:** fresh \`browser.newContext()\` — steps 7–9; isolated from coach session',
    '',
    '## Redis Impact (API Calls — Both Contexts)',
    '',
    '| Endpoint [context] | Method | Calls | Est. ops |',
    '|---|---|---|---|',
    ...apiRows,
    `| **Total** | | **${totalCalls}** | **~${totalOps}** |`,
    '',
    '> Estimates per `REDIS_OPTIMIZATION_SUMMARY.md`. POST /api/identity (claim_invite) ≈ 15 ops',
    '> (session resolve + load invite + validate + write user + write member + create session).',
    '',
    '## Estimated Manual Testing Time Saved',
    '',
    '| Task | Manual | Automated |',
    '|---|---|---|',
    '| Open browser, navigate to app | 30s | — |',
    '| Log in as coach | 30s | — |',
    '| Click Members, wait for load | 20s | — |',
    '| Open invite panel, fill form, generate | 45s | — |',
    '| Copy invite link | 10s | — |',
    '| Open incognito / new browser | 15s | — |',
    '| Paste invite URL, navigate | 10s | — |',
    '| Fill registration form | 45s | — |',
    '| Submit, wait for completion | 20s | — |',
    '| Switch back to coach tab | 10s | — |',
    '| Click Members, verify player | 30s | — |',
    '| Screenshot both tabs + record result | 90s | — |',
    '| **Total per run** | **~6 min** | **~60s** |',
    '',
    '- **Saved per run:** ~5 minutes',
    '- **At 2 runs/day (pre-push + post-merge):** ~10 min/day = **~50 min/week**',
    '- **Workflows 1 + 2 + 3 combined:** ~11.5 min saved per full run → **~2 hrs/week** at 2 full passes/day',
    '',
    '## Missing Selectors / Test Hooks Needed',
    '',
    ...result.missingSelectorWarnings.map(w => `- ⚠️ ${w}`),
    '',
    '**Known gaps:**',
    '- No `data-testid` on player rows in `#coach-players` — verification uses `.toContainText()` which matches any text node; add `data-testid="player-row"` for count assertions.',
    '- `#invite-name-input` is pre-filled but not verified before form submit — add assertion that it contains expected name.',
    '- No explicit "registration success" DOM state besides modal removal — a `data-testid="registration-success"` element would give a positive signal.',
    '- Player may be in pending state after registration (group invites require approval) — individual invite flow auto-approves, but this is not explicitly verified.',
    '',
    '## Console Errors & Warnings',
    '',
    mdList(consErr, 'None'),
    '',
    '## Toast Messages',
    '',
    '### Coach context',
    mdList(result.toasts.map(t => `${t.at} — ${t.text}`), 'None'),
    '',
    '### Player context',
    mdList(result.playerToasts.map(t => `${t.at} — ${t.text}`), 'None'),
    '',
    '## Network Failures',
    '',
    mdList(
      result.requestFailures
        .filter(r => r.failure?.errorText && !r.failure.errorText.match(/^HTTP [45]/))
        .map(r => `[${r.context || 'coach'}] ${r.method} ${r.url} — ${JSON.stringify(r.failure)}`),
      'None'
    ),
    '',
    '## HTTP 4xx / 5xx Responses',
    '',
    mdList(
      result.requestFailures
        .filter(r => r.failure?.errorText?.match(/^HTTP [45]/))
        .map(r => `[${r.context || 'coach'}] ${r.failure.errorText} — ${r.method} ${r.url}`),
      'None'
    ),
    '',
    '## Page Errors',
    '',
    '### Coach context',
    mdList(result.pageErrors.map(e => e.message), 'None'),
    '',
    '### Player context',
    mdList(result.playerPageErrors.map(e => e.message), 'None'),
    '',
    '## What Passes',
    '',
    ...(passed.length ? passed.map(s => `- ${s.name}`) : ['- Nothing passed before stop.']),
    '',
    ...(skipped.length ? ['## Skipped Steps', '', ...skipped.map(s => `- ${s.name}: ${s.note || '(no reason given)'}`), ''] : []),
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- Player registration was exercised against the live API (claim_invite POST) — one QA invite record will exist in Redis.',
    '- Workflow 3 stops at the first failure.',
    '',
  ].filter(l => l !== null && l !== undefined);

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
}

// ─── Step runner ─────────────────────────────────────────────────────────────
async function capture(page, record) {
  const name    = `${String(result.steps.length).padStart(2, '0')}-${slug(record.name)}`;
  const shotPath = path.join(artifactDir, `${name}.png`);
  const domPath  = path.join(artifactDir, `${name}.html`);
  try {
    await page.screenshot({ path: shotPath, fullPage: true });
    record.screenshot = shotPath;
  } catch (e) { record.screenshotError = e?.message || String(e); }
  try {
    fs.writeFileSync(domPath, await page.content());
    record.domSnapshot = domPath;
  } catch (e) { record.domSnapshotError = e?.message || String(e); }
  record.url = page.url();
}

async function workflowStep(page, name, fn, opts = {}) {
  const record = {
    name,
    context: opts.context || 'coach',
    status:  'running',
    startedAt: new Date().toISOString(),
    url: page.url(),
  };
  result.steps.push(record);
  try {
    await fn();
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error  = error?.message || String(error);
    throw error;
  } finally {
    await capture(page, record);
    record.finishedAt = new Date().toISOString();
    writeResult(record.status === 'failed' ? 'failed' : 'running');
    writeReport();
  }
}

function skipStep(name, note) {
  result.steps.push({ name, status: 'skipped', note, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
}

// ─── Response listener factory ───────────────────────────────────────────────
function attachResponseListener(page, context = 'coach') {
  page.on('response', response => {
    const url    = response.url();
    const status = response.status();
    const parsed = (() => { try { return new URL(url); } catch { return null; } })();
    if (parsed?.pathname.startsWith('/api/')) {
      result.apiCalls.push({
        endpoint: parsed.pathname,
        method:   response.request().method(),
        status,
        context,
        at:       new Date().toISOString(),
      });
    }
    if (status >= 400) {
      result.requestFailures.push({
        method:  response.request().method(),
        url,
        failure: { errorText: `HTTP ${status} ${response.statusText()}` },
        context,
        at:      new Date().toISOString(),
      });
    }
  });
}

// ─── Main test ───────────────────────────────────────────────────────────────
test('Workflow 3 — Invite Claim → Registration → Verify Player in Members', async ({ page, browser }) => {
  ensureDirs();

  // ── Coach context setup ──────────────────────────────────────────────────
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const toastEl = document.getElementById('toast');
      if (!toastEl) return;
      new MutationObserver(() => {
        if (toastEl.classList.contains('visible') && toastEl.textContent.trim()) {
          console.log('[QA_TOAST] ' + toastEl.textContent.trim());
        }
      }).observe(toastEl, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    });
  });

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text(), at: new Date().toISOString() };
    result.console.push(entry);
    if (msg.text().startsWith('[QA_TOAST] ')) {
      result.toasts.push({ text: msg.text().replace('[QA_TOAST] ', ''), at: entry.at });
    }
  });
  page.on('pageerror', error => {
    result.pageErrors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() });
  });
  page.on('requestfailed', request => {
    result.requestFailures.push({
      method: request.method(), url: request.url(),
      failure: request.failure(), context: 'coach', at: new Date().toISOString(),
    });
  });
  attachResponseListener(page, 'coach');

  let playerContext = null;

  try {
    // ── Steps 1–3: shared login path ────────────────────────────────────────
    await workflowStep(page, 'Open app',           () => openApp(page));
    await workflowStep(page, 'Coach login',         () => coachLogin(page, config, result));
    await workflowStep(page, 'Navigate to Members', () => navigateToMembers(page));

    // ── Steps 4–6: invite generation (skip if QA_INVITE_URL provided) ───────
    if (skipGeneration) {
      skipStep('Open invite panel',  'QA_INVITE_URL env var set — skipping invite generation');
      skipStep('Generate invite',    'QA_INVITE_URL env var set — skipping invite generation');
      skipStep('Verify invite link', 'QA_INVITE_URL env var set — skipping invite generation');
    } else {
      await workflowStep(page, 'Open invite panel',  () => openInvitePanel(page, result));
      await workflowStep(page, 'Generate invite',    () => generateInvite(page, config, result));
      await workflowStep(page, 'Verify invite link', () => verifyInviteLink(page, result));
    }

    const inviteUrl = result.inviteLink;
    if (!inviteUrl) {
      throw new Error('No invite URL available — invite generation failed or QA_INVITE_URL was not set');
    }

    // ── Steps 7–9: fresh player context ─────────────────────────────────────
    playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();

    // Player context: toast observer
    await playerPage.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const toastEl = document.getElementById('toast');
        if (!toastEl) return;
        new MutationObserver(() => {
          if (toastEl.classList.contains('visible') && toastEl.textContent.trim()) {
            console.log('[QA_TOAST] ' + toastEl.textContent.trim());
          }
        }).observe(toastEl, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
      });
    });

    playerPage.on('console', msg => {
      const entry = { type: msg.type(), text: msg.text(), at: new Date().toISOString() };
      result.playerConsole.push(entry);
      if (msg.text().startsWith('[QA_TOAST] ')) {
        result.playerToasts.push({ text: msg.text().replace('[QA_TOAST] ', ''), at: entry.at });
      }
    });
    playerPage.on('pageerror', error => {
      result.playerPageErrors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() });
    });
    playerPage.on('requestfailed', request => {
      result.requestFailures.push({
        method: request.method(), url: request.url(),
        failure: request.failure(), context: 'player', at: new Date().toISOString(),
      });
    });
    attachResponseListener(playerPage, 'player');

    await workflowStep(playerPage, 'Open invite URL as player',  () => openInviteUrl(playerPage, inviteUrl),  { context: 'player' });
    await workflowStep(playerPage, 'Fill registration form',      () => fillRegistrationForm(playerPage, config), { context: 'player' });
    await workflowStep(playerPage, 'Submit registration',         () => submitRegistration(playerPage, result),   { context: 'player' });

    // ── Steps 10–11: return to coach and verify ──────────────────────────────
    await workflowStep(page, 'Return to coach context', async () => {
      // Assert coach is still logged in — nav should be present
      const coachNavVisible = await page.locator('#coachNav:not(.hidden)').isVisible({ timeout: 5_000 }).catch(() => false);
      if (!coachNavVisible) {
        result.missingSelectorWarnings.push('#coachNav not visible after player registration — coach session may have expired');
        throw new Error('Coach nav not visible — session may have expired during player registration');
      }
    });

    await workflowStep(page, 'Verify player in Members',
      () => verifyPlayerInMembers(page, config.testPlayerName, result));

    writeResult('passed');
    writeReport();
  } catch (error) {
    writeResult('failed');
    writeReport();
    throw error;
  } finally {
    if (playerContext) await playerContext.close().catch(() => {});
  }
});
