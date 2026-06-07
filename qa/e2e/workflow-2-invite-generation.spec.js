/**
 * Workflow 2 — Coach Login → Open Members → Open Invite Panel
 *              → Generate Invite → Verify Invite Link
 *
 * Steps:
 *   1. Open app            — #authPanel visible
 *   2. Coach login         — shared helper (dev-login or credentials)
 *   3. Navigate to Members — Members nav + h1#pageTitle visible
 *   4. Open invite panel   — details.srv-panel open, #inv-name visible
 *   5. Generate invite     — atomic fill + click, wait for #inv-link-field
 *   6. Verify invite link  — URL present, starts with https, contains /?inv=
 *
 * Stops on first failure. Saves PNG + HTML at each step.
 * Writes qa/results/workflow-2.json and QA_WORKFLOW_2_REPORT.md.
 * Tracks all /api/* calls and estimates Redis impact.
 *
 * Does NOT navigate to the invite URL — that is Workflow 3 territory.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  openApp,
  coachLogin,
  navigateToMembers,
  redisEstimate,
} from '../helpers/shared-steps.js';

// ─── Run identity ────────────────────────────────────────────────────────────
const runId      = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow2-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-2.json');
const reportPath  = path.join(process.cwd(), 'QA_WORKFLOW_2_REPORT.md');

// ─── Config ──────────────────────────────────────────────────────────────────
const config = {
  baseURL:       process.env.QA_BASE_URL        || 'http://127.0.0.1:3000',
  coachEmail:    process.env.QA_COACH_EMAIL     || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD  || '',
  inviteName:    process.env.QA_INVITE_NAME     || 'QA Workflow2 Test',
  inviteEmail:   process.env.QA_INVITE_EMAIL    || `qa.wf2+${Date.now()}@coachseye.test`,
};

// ─── Result accumulator ──────────────────────────────────────────────────────
const result = {
  workflow:     'workflow-2',
  runId,
  startedAt:    new Date().toISOString(),
  finishedAt:   null,
  status:       'running',
  baseURL:      config.baseURL,
  commit:       gitCommit(),
  loginMethod:  config.coachPassword ? 'credentials' : 'dev-login-btn',
  steps:        [],
  console:      [],
  toasts:       [],
  pageErrors:   [],
  requestFailures: [],
  apiCalls:     [],
  inviteLink:   null,   // captured from #inv-link-field
  inviteToken:  null,   // extracted from the URL ?inv= param
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

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
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
  const consErr = result.console.filter(e => ['error', 'warning'].includes(e.type));

  // Redis impact table
  const apiGroups = {};
  for (const call of result.apiCalls) {
    const key = call.endpoint;
    if (!apiGroups[key]) apiGroups[key] = { calls: 0, methods: new Set(), estimatedOps: 0 };
    apiGroups[key].calls += 1;
    apiGroups[key].methods.add(call.method);
    apiGroups[key].estimatedOps += redisEstimate(key, call.method);
  }
  const apiRows = Object.entries(apiGroups)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([ep, g]) => `| \`${ep}\` | ${[...g.methods].join('/')} | ${g.calls} | ~${g.estimatedOps} |`);
  const totalCalls = Object.values(apiGroups).reduce((s, g) => s + g.calls, 0);
  const totalOps   = Object.values(apiGroups).reduce((s, g) => s + g.estimatedOps, 0);

  // Step table
  const stepRows = result.steps.map((step, i) => {
    const shot = step.screenshot ? `[png](${rel(step.screenshot)})` : '—';
    const ms   = (step.finishedAt && step.startedAt)
      ? Math.round(new Date(step.finishedAt) - new Date(step.startedAt))
      : '—';
    const note = (step.error || step.note || '').slice(0, 120);
    return `| ${i + 1} | ${step.name} | ${step.status.toUpperCase()} | ${ms}ms | ${shot} | ${note} |`;
  });

  const lines = [
    '# QA Workflow 2 — Coach Login → Invite Generation',
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
    '## Invite Verification',
    '',
    result.inviteLink
      ? `- **Invite URL generated:** \`${result.inviteLink}\``
      : '- **Invite URL generated:** not reached',
    result.inviteToken
      ? `- **Token extracted:** \`${result.inviteToken}\``
      : '- **Token extracted:** —',
    `- **URL format check:** ${result.inviteLink && result.inviteLink.includes('/?inv=') ? '✅ contains \`/?inv=\`' : result.inviteLink ? '⚠️ unexpected format' : '—'}`,
    `- **Invite name used:** \`${config.inviteName}\``,
    `- **Invite email used:** \`${config.inviteEmail}\``,
    '',
    '## Redis Impact (API Calls During Workflow)',
    '',
    '| Endpoint | Method | Calls | Est. Redis ops |',
    '|---|---|---|---|',
    ...apiRows,
    `| **Total** | | **${totalCalls}** | **~${totalOps}** |`,
    '',
    '> Estimates based on post-optimisation baselines from `REDIS_OPTIMIZATION_SUMMARY.md`:',
    '> `/api/identity` GET ≈ 6 ops (session + members, warm Lambda); POST ≈ 8.',
    '> `/api/invite` POST ≈ 8 ops (session + write + reload); GET ≈ 4.',
    '> `/api/chat` ≈ 8 ops per conversations poll.',
    '',
    '## Estimated Manual Testing Time Saved',
    '',
    '| Task | Manual | Automated |',
    '|---|---|---|',
    '| Open browser + navigate to app | 30s | — |',
    '| Log in as coach | 30s | — |',
    '| Click Members + wait for load | 20s | — |',
    '| Scroll to / open invite panel | 20s | — |',
    '| Fill name, email, click Generate | 30s | — |',
    '| Wait for link + verify format | 20s | — |',
    '| Take screenshot + record result | 60s | — |',
    '| **Total per run** | **~3.5 min** | **~35s** |',
    '',
    '- **Saved per run:** ~3 minutes',
    '- **At 2 runs/day (pre-push + post-merge):** ~6 min/day = **~30 min/week**',
    '- **At 5 runs/day (active feature work):** ~15 min/day = **~75 min/week**',
    '',
    '## Missing Selectors / Test Hooks Needed',
    '',
    ...result.missingSelectorWarnings.map(w => `- ⚠️ ${w}`),
    '',
    '**Gaps identified during this workflow:**',
    '- No `data-testid` on the invite panel `<details>` — currently selected via `details.srv-panel summary` text match; brittle if text changes.',
    '- No `data-testid` on `#inv-link-field` — the element has a stable `id` (good), but the surrounding success card is fully dynamic HTML.',
    '- No explicit "invite created" event or DOM marker outside the card — success is inferred from `#inv-link-field` appearing.',
    '- `loadInviteList()` polling races with form input — atomic `page.evaluate` fill+click is required; standard Playwright `.fill()` is unreliable here.',
    '',
    '## Console Errors & Warnings',
    '',
    mdList(consErr.map(e => `\`${e.type}\`: ${e.text}`), 'None'),
    '',
    '## Toast Messages',
    '',
    mdList(result.toasts.map(t => `${t.at} — ${t.text}`), 'None'),
    '',
    '## Network Failures',
    '',
    mdList(
      result.requestFailures
        .filter(r => r.failure?.errorText && !r.failure.errorText.startsWith('HTTP 4'))
        .map(r => `${r.method} ${r.url} — ${JSON.stringify(r.failure)}`),
      'None'
    ),
    '',
    '## HTTP 4xx / 5xx Responses',
    '',
    mdList(
      result.requestFailures
        .filter(r => r.failure?.errorText?.startsWith('HTTP 4') || r.failure?.errorText?.startsWith('HTTP 5'))
        .map(r => `${r.failure.errorText} — ${r.method} ${r.url}`),
      'None'
    ),
    '',
    '## Page Errors',
    '',
    mdList(result.pageErrors.map(e => e.message), 'None'),
    '',
    '## What Passes',
    '',
    ...(passed.length ? passed.map(s => `- ${s.name}`) : ['- Nothing passed before stop.']),
    '',
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- Player registration was not triggered (Workflow 2 stops before navigating to the invite URL).',
    '- Workflow 2 stops at the first failure.',
    '',
  ].filter(l => l !== null && l !== undefined);

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
}

// ─── Step runner ─────────────────────────────────────────────────────────────
async function capture(page, record) {
  const name = `${String(result.steps.length).padStart(2, '0')}-${slug(record.name)}`;
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

async function workflowStep(page, name, fn) {
  const record = { name, status: 'running', startedAt: new Date().toISOString(), url: page.url() };
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

// ─── Workflow 2 – specific step implementations ───────────────────────────────

async function openInvitePanel(page) {
  // Panel is rendered inside #coach-players by renderPlayers() — wait for it to exist
  const panelSummary = page.locator('details.srv-panel summary').filter({ hasText: /Invite/i }).first();

  const panelExists = await panelSummary.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!panelExists) {
    result.missingSelectorWarnings.push(
      'details.srv-panel summary[Invite] not found — invite panel may not have rendered; check renderPlayers() output'
    );
    throw new Error('Invite panel summary not found — members page may not have fully rendered');
  }

  // Open the panel if the name input is not yet visible
  const nameVisible = await page.locator('#inv-name').isVisible().catch(() => false);
  if (!nameVisible) {
    await panelSummary.click();
  }

  await expect(page.locator('#inv-name')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#inv-email')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('#inv-create-btn')).toBeVisible({ timeout: 3_000 });
}

async function generateInvite(page) {
  // Use atomic evaluate to prevent loadInviteList() polling from clearing the form between fill and click.
  const filled = await page.evaluate(({ name, email }) => {
    const nameEl  = document.getElementById('inv-name');
    const emailEl = document.getElementById('inv-email');
    const btn     = document.getElementById('inv-create-btn');
    if (!nameEl || !emailEl || !btn) return { ok: false, missing: ['nameEl', 'emailEl', 'btn'].filter(k => !{ nameEl, emailEl, btn }[k]) };
    nameEl.value  = name;
    emailEl.value = email;
    nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    emailEl.dispatchEvent(new Event('input', { bubbles: true }));
    btn.click();
    return { ok: true };
  }, { name: config.inviteName, email: config.inviteEmail });

  if (!filled?.ok) {
    const missing = filled?.missing || ['unknown'];
    result.missingSelectorWarnings.push(
      `Invite form elements missing in page.evaluate: ${missing.join(', ')} — IDs may have changed`
    );
    throw new Error(`Invite form elements not found: ${missing.join(', ')}`);
  }

  // Wait for the invite link field to appear in #inv-result
  try {
    await page.waitForSelector('#inv-link-field', { state: 'visible', timeout: 20_000 });
  } catch {
    // Capture whatever toast explains the failure
    const latestToast = result.toasts.at(-1)?.text || '';
    const msg = latestToast.trim()
      ? `Invite creation failed — toast: "${latestToast.trim()}"`
      : '#inv-link-field did not appear within 20s — invite POST may have failed';
    throw new Error(msg);
  }
}

async function verifyInviteLink(page) {
  const linkValue = await page.locator('#inv-link-field').inputValue({ timeout: 5_000 });

  if (!linkValue || linkValue.trim() === '') {
    result.missingSelectorWarnings.push('#inv-link-field was visible but had an empty value');
    throw new Error('Invite link field appeared but was empty');
  }

  // Store the link for the report
  result.inviteLink = linkValue.trim();

  // Extract token from /?inv=TOKEN
  const tokenMatch = result.inviteLink.match(/[?&]inv=([^&]+)/);
  if (tokenMatch) {
    result.inviteToken = decodeURIComponent(tokenMatch[1]);
  } else {
    result.missingSelectorWarnings.push(
      `Invite URL "${result.inviteLink}" does not contain /?inv= — URL format may have changed (api/invite.js inviteUrl())`
    );
    throw new Error(`Unexpected invite URL format — expected /?inv=TOKEN, got: ${result.inviteLink}`);
  }

  // Verify token length is reasonable (randomBytes(24).toString('base64url') = 32 chars)
  if (result.inviteToken.length < 16) {
    result.missingSelectorWarnings.push(
      `Invite token "${result.inviteToken}" is suspiciously short (${result.inviteToken.length} chars) — expected ≥32`
    );
    throw new Error(`Invite token too short: "${result.inviteToken}" (${result.inviteToken.length} chars)`);
  }

  // Final assertion: confirm the field is visible with a real URL
  await expect(page.locator('#inv-link-field')).toBeVisible();
  await expect(page.locator('#inv-link-field')).toHaveValue(/^https?:\/\/.+/);
}

// ─── Main test ───────────────────────────────────────────────────────────────
test('Workflow 2 — Coach Login → Members → Open Invite Panel → Generate Invite → Verify Link', async ({ page }) => {
  ensureDirs();

  // Toast capture via MutationObserver
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
      method:       request.method(),
      url:          request.url(),
      resourceType: request.resourceType(),
      failure:      request.failure(),
      at:           new Date().toISOString(),
    });
  });

  // Track all /api/* calls for Redis impact
  page.on('response', response => {
    const url    = response.url();
    const status = response.status();
    const parsed = (() => { try { return new URL(url); } catch { return null; } })();
    if (parsed?.pathname.startsWith('/api/')) {
      result.apiCalls.push({
        endpoint: parsed.pathname,
        method:   response.request().method(),
        status,
        at:       new Date().toISOString(),
      });
    }
    if (status >= 400) {
      result.requestFailures.push({
        method:  response.request().method(),
        url,
        failure: { errorText: `HTTP ${status} ${response.statusText()}` },
        at:      new Date().toISOString(),
      });
    }
  });

  try {
    // Steps 1–3: shared login path (same as Workflow 1)
    await workflowStep(page, 'Open app',             () => openApp(page));
    await workflowStep(page, 'Coach login',           () => coachLogin(page, config, result));
    await workflowStep(page, 'Navigate to Members',   () => navigateToMembers(page));
    // Steps 4–6: Workflow 2 specific
    await workflowStep(page, 'Open invite panel',     () => openInvitePanel(page));
    await workflowStep(page, 'Generate invite',       () => generateInvite(page));
    await workflowStep(page, 'Verify invite link',    () => verifyInviteLink(page));

    writeResult('passed');
    writeReport();
  } catch (error) {
    writeResult('failed');
    writeReport();
    throw error;
  }
});
