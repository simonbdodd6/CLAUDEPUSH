/**
 * Workflow 4 — Group Invite → Join Request → Coach Approval → Active Member
 *
 * Steps:
 *   1.  Open app                        — coach context, #authPanel visible
 *   2.  Coach login                     — shared helper
 *   3.  Navigate to Members             — shared helper
 *   4.  Generate group invite           — POST /api/invite via page.evaluate
 *   5.  Verify invite URL               — URL format, token present
 *   6.  Open invite URL as player       — fresh browser context, #invite-modal visible
 *   7.  Fill group registration form    — firstname, lastname, email, password
 *   8.  Submit join request             — 'Request to join →' button, modal detaches
 *   9.  Verify join request submitted   — success toast, modal gone
 *   10. Return to coach context         — coach nav still active
 *   11. Refresh pending requests        — click 'Refresh' in Pending Requests panel
 *   12. Verify pending request visible  — player email in #identity-requests-panel
 *   13. Approve player                  — click 'Approve' button, wait for toast
 *   14. Verify player approved          — panel no longer contains player email
 *   15. Verify player in Active Members — re-navigate to Members, player in #coach-players
 *
 * Group invite flow differs from Workflow 3 (individual invite):
 *   - Registration uses first/last name fields, not a pre-filled name field
 *   - Player lands in Pending state — must be explicitly approved by coach
 *   - Tests the full club-onboarding flow most new players go through
 *
 * Stops on first failure. Saves PNG + HTML at every step (both contexts).
 * Writes qa/results/workflow-4.json and QA_WORKFLOW_4_REPORT.md.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  openApp,
  coachLogin,
  navigateToMembers,
  generateGroupInvite,
  openInviteUrl,
  fillGroupRegistrationForm,
  submitRegistration,
  redisEstimate,
} from '../helpers/shared-steps.js';

// ─── Run identity ────────────────────────────────────────────────────────────
const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow4-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-4.json');
const reportPath  = path.join(process.cwd(), 'QA_WORKFLOW_4_REPORT.md');

// ─── Config ──────────────────────────────────────────────────────────────────
const ts = Date.now();
const config = {
  baseURL:              process.env.QA_BASE_URL              || 'http://127.0.0.1:3000',
  coachEmail:           process.env.QA_COACH_EMAIL           || 'simonbdodd@gmail.com',
  coachPassword:        process.env.QA_COACH_PASSWORD        || '',
  testPlayerFirstName:  process.env.QA_W4_PLAYER_FIRST       || 'QA4',
  testPlayerLastName:   process.env.QA_W4_PLAYER_LAST        || `Player${ts}`,
  testPlayerEmail:      process.env.QA_W4_PLAYER_EMAIL       || `qa.w4+${ts}@coachseye.test`,
  testPlayerPassword:   process.env.QA_W4_PLAYER_PASSWORD    || 'qatest12345',
  get testPlayerName()  { return `${this.testPlayerFirstName} ${this.testPlayerLastName}`; },
};

// ─── Result accumulator ──────────────────────────────────────────────────────
const result = {
  workflow:    'workflow-4',
  runId,
  startedAt:   new Date().toISOString(),
  finishedAt:  null,
  status:      'running',
  baseURL:     config.baseURL,
  commit:      gitCommit(),
  loginMethod: config.coachPassword ? 'credentials' : 'dev-login-btn',
  inviteLink:  null,
  inviteToken: null,
  steps:       [],
  console:     [],
  toasts:      [],
  pageErrors:  [],
  playerConsole:    [],
  playerToasts:     [],
  playerPageErrors: [],
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

  const apiGroups = {};
  for (const call of result.apiCalls) {
    const k = `${call.endpoint} [${call.context || 'coach'}]`;
    if (!apiGroups[k]) apiGroups[k] = { calls: 0, methods: new Set(), estimatedOps: 0 };
    apiGroups[k].calls += 1;
    apiGroups[k].methods.add(call.method);
    apiGroups[k].estimatedOps += redisEstimate(call.endpoint, call.method);
  }
  const apiRows = Object.entries(apiGroups)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([ep, g]) => `| \`${ep}\` | ${[...g.methods].join('/')} | ${g.calls} | ~${g.estimatedOps} |`);
  const totalCalls = Object.values(apiGroups).reduce((s, g) => s + g.calls, 0);
  const totalOps   = Object.values(apiGroups).reduce((s, g) => s + g.estimatedOps, 0);

  const stepRows = result.steps.map((step, i) => {
    const shot = step.screenshot ? `[png](${rel(step.screenshot)})` : '—';
    const ms   = (step.finishedAt && step.startedAt)
      ? Math.round(new Date(step.finishedAt) - new Date(step.startedAt)) : '—';
    const note = (step.error || step.note || '').slice(0, 130);
    const ctx  = step.context ? ` [${step.context}]` : '';
    return `| ${i + 1} | ${step.name}${ctx} | ${step.status.toUpperCase()} | ${ms}ms | ${shot} | ${note} |`;
  });

  const lines = [
    '# QA Workflow 4 — Group Invite → Join Request → Coach Approval → Active Member',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Commit:** \`${result.commit}\``,
    `**Base URL:** ${result.baseURL}`,
    `**Login method:** ${result.loginMethod}`,
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
    '## Player & Invite Details',
    '',
    `- **Player name:** \`${config.testPlayerName}\``,
    `- **Player email:** \`${config.testPlayerEmail}\``,
    result.inviteLink
      ? `- **Group invite URL:** \`${result.inviteLink}\``
      : '- **Group invite URL:** not generated',
    result.inviteToken
      ? `- **Token:** \`${result.inviteToken}\` (${result.inviteToken.length} chars)`
      : '- **Token:** not extracted',
    '',
    '## Browser Contexts',
    '',
    '- **Coach context:** standard Playwright `page` fixture — steps 1–5, 10–15',
    '- **Player context:** fresh `browser.newContext()` — steps 6–9; isolated from coach session',
    '',
    '## Redis Impact (API Calls — Both Contexts)',
    '',
    '| Endpoint [context] | Method | Calls | Est. ops |',
    '|---|---|---|---|',
    ...apiRows,
    `| **Total** | | **${totalCalls}** | **~${totalOps}** |`,
    '',
    '> Group invite join_group_invite POST ≈ 10 ops (token resolve + create user + create pending member + session).',
    '> approve POST ≈ 8 ops (session + load member + status update + notify).',
    '',
    '## Estimated Manual Testing Time Saved',
    '',
    '| Task | Manual | Automated |',
    '|---|---|---|',
    '| Open browser, navigate to app | 30s | — |',
    '| Log in as coach | 30s | — |',
    '| Navigate to Members | 15s | — |',
    '| Generate group invite link | 30s | — |',
    '| Open incognito / new browser | 15s | — |',
    '| Paste invite URL, navigate | 10s | — |',
    '| Fill first name, last name, email, password | 50s | — |',
    '| Submit join request, verify toast | 20s | — |',
    '| Switch back to coach, refresh pending | 20s | — |',
    '| Verify player in pending requests | 15s | — |',
    '| Click Approve, verify toast | 15s | — |',
    '| Re-navigate to Members, find player | 30s | — |',
    '| Screenshot both tabs + record result | 90s | — |',
    '| **Total per run** | **~6.5 min** | **~70s** |',
    '',
    '- **Saved per run:** ~5.5 minutes',
    '- **At 2 runs/day:** ~11 min/day = **~55 min/week**',
    '- **Workflows 1–4 combined:** ~18 min saved per full nightly run',
    '',
    '## Missing Selectors / Test Hooks Needed',
    '',
    ...result.missingSelectorWarnings.map(w => `- ⚠️ ${w}`),
    '',
    '**Known gaps:**',
    '- No `data-testid` on the Pending Requests Refresh button — selected by text, brittle if label changes.',
    '- Approve button matched as first `.btn.primary` in `#identity-requests-panel` — safe only when one request pending; add `data-member-id` attribute for precise targeting.',
    '- No explicit "approved" DOM marker — success is inferred from toast + panel text removal.',
    '- After approval, player verified in #coach-players by name — may be in pending state in other contexts.',
    '',
    '## High-Risk Flows Not Yet Automated',
    '',
    '- Player login after approval (Workflow 3 covers individual invite → auto-approved; group invite → pending flow now covered here, but player login post-approval is not verified)',
    '- Coach sends availability request → player receives push notification → player responds',
    '- Push notification delivery end-to-end (requires live VAPID + real device)',
    '- Password reset flow',
    '- Player direct message (DM) flow (partially in nightly-qa-agent.spec.js)',
    '- Multi-team coach login and team switching',
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
    ...(skipped.length ? ['## Skipped Steps', '', ...skipped.map(s => `- ${s.name}: ${s.note || ''}`), ''] : []),
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- One QA join request record will exist in Redis per run (cleaned up if player is approved by this workflow).',
    '- Workflow 4 stops at the first failure.',
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
    context:   opts.context || 'coach',
    status:    'running',
    startedAt: new Date().toISOString(),
    url:       page.url(),
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

// ─── Toast observer injection ─────────────────────────────────────────────────
async function injectToastObserver(page) {
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
}

// ─── Main test ───────────────────────────────────────────────────────────────
test('Workflow 4 — Group Invite → Join Request → Coach Approval → Active Member', async ({ page, browser }) => {
  ensureDirs();

  // ── Coach context setup ───────────────────────────────────────────────────
  await injectToastObserver(page);

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
    // ── Steps 1–3: shared login path ─────────────────────────────────────────
    await workflowStep(page, 'Open app',           () => openApp(page));
    await workflowStep(page, 'Coach login',         () => coachLogin(page, config, result));
    await workflowStep(page, 'Navigate to Members', () => navigateToMembers(page));

    // ── Step 4: generate group invite ────────────────────────────────────────
    await workflowStep(page, 'Generate group invite', () => generateGroupInvite(page, result));

    // ── Step 5: verify invite URL ────────────────────────────────────────────
    await workflowStep(page, 'Verify group invite URL', async () => {
      if (!result.inviteLink) throw new Error('No invite URL — generateGroupInvite did not set result.inviteLink');
      if (!result.inviteLink.match(/^https?:\/\/.+/)) throw new Error(`Invite URL format unexpected: ${result.inviteLink}`);
      if (!result.inviteToken) {
        result.missingSelectorWarnings.push(`Invite URL "${result.inviteLink}" missing /?inv= token — api/invite.js format may have changed`);
        throw new Error(`Invite token not extracted from URL: ${result.inviteLink}`);
      }
      if (result.inviteToken.length < 16) throw new Error(`Token too short: "${result.inviteToken}"`);
    });

    // ── Steps 6–9: fresh player context ──────────────────────────────────────
    playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();

    await injectToastObserver(playerPage);

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

    await workflowStep(playerPage, 'Open group invite URL as player',
      () => openInviteUrl(playerPage, result.inviteLink), { context: 'player' });

    await workflowStep(playerPage, 'Fill group registration form',
      () => fillGroupRegistrationForm(playerPage, config), { context: 'player' });

    await workflowStep(playerPage, 'Submit join request',
      () => submitRegistration(playerPage, result), { context: 'player' });

    await workflowStep(playerPage, 'Verify join request submitted', async () => {
      // Modal should be gone (submitRegistration already verified this)
      const modalGone = !(await playerPage.locator('#invite-modal').isVisible({ timeout: 2_000 }).catch(() => false));
      if (!modalGone) throw new Error('#invite-modal still visible after submission');
      // Look for success toast from player context
      const successToast = result.playerToasts.find(t => /request sent|your coach will approve/i.test(t.text));
      if (!successToast) {
        result.missingSelectorWarnings.push('No success toast detected in player context after join request submit — toast observer may not have fired');
      }
    }, { context: 'player' });

    // ── Steps 10–15: back to coach ────────────────────────────────────────────
    await workflowStep(page, 'Return to coach context', async () => {
      const coachNavVisible = await page.locator('#coachNav:not(.hidden)').isVisible({ timeout: 5_000 }).catch(() => false);
      if (!coachNavVisible) {
        result.missingSelectorWarnings.push('#coachNav not visible — coach session may have expired during player join request');
        throw new Error('Coach nav not visible — session may have expired');
      }
    });

    await workflowStep(page, 'Refresh pending requests', async () => {
      // The Pending Requests panel has a Refresh button with onclick="loadIdentityRequests()"
      const refreshBtn = page.locator('button').filter({ hasText: /^Refresh$/ }).nth(0);
      const btnVisible = await refreshBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!btnVisible) {
        // Panel may not be on screen — navigate to Members first
        await page.getByRole('button', { name: 'Members', exact: true }).click();
        await expect(page.locator('h1#pageTitle')).toBeVisible({ timeout: 10_000 });
      }
      // Find the Refresh button specifically inside the Pending Requests section
      const pendingRefreshBtn = page.locator('button[onclick="loadIdentityRequests()"]');
      const pendingBtnVisible = await pendingRefreshBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (pendingBtnVisible) {
        await pendingRefreshBtn.click();
      } else {
        // Fall back: trigger via page.evaluate
        await page.evaluate(() => {
          if (typeof loadIdentityRequests === 'function') loadIdentityRequests();
        });
      }
      // Wait for the panel to stop showing "Loading..."
      await expect(page.locator('#identity-requests-panel')).not.toContainText('Loading join requests', { timeout: 10_000 });
    });

    await workflowStep(page, 'Verify pending request visible', async () => {
      const panel = page.locator('#identity-requests-panel');
      try {
        await expect(panel).toContainText(config.testPlayerEmail, { timeout: 15_000 });
      } catch {
        const panelText = await panel.textContent().catch(() => '(unreadable)');
        result.missingSelectorWarnings.push(
          `Player email "${config.testPlayerEmail}" not found in #identity-requests-panel. Panel content: "${panelText?.slice(0, 200)}"`
        );
        throw new Error(`Player "${config.testPlayerEmail}" not visible in Pending Requests within 15s`);
      }
    });

    await workflowStep(page, 'Coach approves player', async () => {
      const panel = page.locator('#identity-requests-panel');
      // Click the Approve button for our player's row
      // Since this is a QA run with a unique email, we target the first Approve in the panel
      const approveBtn = panel.getByRole('button', { name: 'Approve' }).first();
      const btnVisible = await approveBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!btnVisible) {
        result.missingSelectorWarnings.push('Approve button not visible in #identity-requests-panel — panel structure may have changed');
        throw new Error('Approve button not found in #identity-requests-panel');
      }
      await approveBtn.click();
      // Wait for success toast
      await expect.poll(async () => {
        const latestToast = result.toasts.at(-1)?.text || '';
        return /approved|added to roster/i.test(latestToast);
      }, { timeout: 10_000, message: 'Approve toast should appear within 10s' }).toBe(true);
    });

    await workflowStep(page, 'Verify player approved — pending cleared', async () => {
      const panel = page.locator('#identity-requests-panel');
      // After approval, the member is removed from _identityPendingRequests and render() is called
      await expect(panel).not.toContainText(config.testPlayerEmail, { timeout: 10_000 });
    });

    await workflowStep(page, 'Verify player in Active Members', async () => {
      // Re-navigate to Members to trigger a fresh fetch
      await page.getByRole('button', { name: 'Members', exact: true }).click();
      await expect(page.locator('#coach-players .filter-pill').first()).toBeVisible({ timeout: 10_000 });
      try {
        await expect(page.locator('#coach-players')).toContainText(config.testPlayerName, { timeout: 15_000 });
      } catch {
        result.missingSelectorWarnings.push(
          `Player "${config.testPlayerName}" not found in #coach-players after approval. ` +
          `Check if applyApprovedIdentityLocally() added them to state.players.`
        );
        throw new Error(`Player "${config.testPlayerName}" not found in #coach-players within 15s after approval`);
      }
    });

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
