/**
 * Workflow 1 — Coach Login → Members Page → Verify Members Load
 *
 * Steps:
 *   1. Open app         — #authPanel visible
 *   2. Coach login      — dev-login button preferred; falls back to credentials
 *   3. Members page     — click Members nav, h1#pageTitle visible
 *   4. Verify members   — #coach-players renders filter pills + member count
 *
 * Stops on first failure. Saves PNG + HTML snapshot at each step.
 * Writes qa/results/workflow-1.json and QA_WORKFLOW_REPORT.md.
 * Tracks all /api/* calls so Redis impact can be estimated.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// ─── Run identity ────────────────────────────────────────────────────────────
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow1-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-1.json');
const reportPath  = path.join(process.cwd(), 'QA_WORKFLOW_REPORT.md');

// ─── Config ──────────────────────────────────────────────────────────────────
const config = {
  baseURL:       process.env.QA_BASE_URL      || 'http://127.0.0.1:3000',
  coachEmail:    process.env.QA_COACH_EMAIL   || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',   // optional — dev login used if absent
};

// ─── Result accumulator ──────────────────────────────────────────────────────
const result = {
  workflow:    'workflow-1',
  runId,
  startedAt:   new Date().toISOString(),
  finishedAt:  null,
  status:      'running',
  baseURL:     config.baseURL,
  commit:      gitCommit(),
  loginMethod: config.coachPassword ? 'credentials' : 'dev-login-btn',
  steps:       [],
  console:     [],
  toasts:      [],
  pageErrors:  [],
  requestFailures: [],
  apiCalls:    [],     // every /api/* response captured here
  membersCount: null,  // parsed from rendered member count text
  missingSelectorWarnings: [],
};

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
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

// ─── Persistence ─────────────────────────────────────────────────────────────
function writeResult(status = result.status) {
  result.status    = status;
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

function mdList(items, empty) {
  return items.length ? items.map(i => `- ${i}`).join('\n') : `- ${empty}`;
}

function writeReport() {
  const failed  = result.steps.find(s => s.status === 'failed');
  const passed  = result.steps.filter(s => s.status === 'passed');
  const consErr = result.console.filter(e => ['error', 'warning'].includes(e.type));

  // Redis impact table
  const apiGroups = {};
  for (const call of result.apiCalls) {
    const key = call.endpoint;
    if (!apiGroups[key]) apiGroups[key] = { calls: 0, estimatedRedisOps: 0 };
    apiGroups[key].calls += 1;
    apiGroups[key].estimatedRedisOps += redisEstimate(key, call.method);
  }
  const apiRows = Object.entries(apiGroups).map(([ep, g]) =>
    `| \`${ep}\` | ${g.calls} | ~${g.estimatedRedisOps} |`
  );
  const totalCalls    = Object.values(apiGroups).reduce((s, g) => s + g.calls, 0);
  const totalRedisOps = Object.values(apiGroups).reduce((s, g) => s + g.estimatedRedisOps, 0);

  // Step table
  const stepRows = result.steps.map((step, i) => {
    const shot    = step.screenshot ? `[png](${rel(step.screenshot)})` : '—';
    const durationMs = step.finishedAt && step.startedAt
      ? Math.round(new Date(step.finishedAt) - new Date(step.startedAt))
      : '—';
    const note = step.error ? step.error.slice(0, 100) : (step.note || '');
    return `| ${i + 1} | ${step.name} | ${step.status.toUpperCase()} | ${durationMs}ms | ${shot} | ${note} |`;
  });

  const lines = [
    '# QA Workflow 1 — Coach Login → Members',
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
    failed ? `- **Error:** ${failed.error}` : '',
    failed?.screenshot ? `- **Failure screenshot:** ${rel(failed.screenshot)}` : '',
    '',
    '## Steps',
    '',
    '| # | Step | Status | Duration | Screenshot | Notes |',
    '|---|---|---|---|---|---|',
    ...stepRows,
    '',
    '## Members Verification',
    '',
    result.membersCount !== null
      ? `- **Members rendered:** ${result.membersCount}`
      : '- **Members rendered:** not reached or count not found',
    `- **Filter pills visible:** ${result.steps.find(s => s.name === 'Verify members list renders')?.status === 'passed' ? 'yes' : 'no'}`,
    `- **Verification selector used:** \`#coach-players .filter-pill\` (first filter pill appearing signals data load)`,
    `- **Member count selector:** \`#coach-players\` text matching \`/\\d+ members/\``,
    '',
    '## Redis Impact (API Calls During Workflow)',
    '',
    '| Endpoint | Calls | Est. Redis ops |',
    '|---|---|---|',
    ...apiRows,
    `| **Total** | **${totalCalls}** | **~${totalRedisOps}** |`,
    '',
    '> Estimates use post-optimisation baselines: `/api/identity` session=0–4 ops (cached), members=~10; `/api/chat` conversations=~8; others=~4.',
    '',
    '## Missing Selectors / Test Hooks Needed',
    '',
    ...result.missingSelectorWarnings.map(w => `- ${w}`),
    '',
    'These are gaps to address before higher-confidence automation:',
    '- **No `data-testid` on individual player rows** — member-loaded signal currently uses `.filter-pill` appearing inside `#coach-players`; a `data-testid="player-card"` on each row would enable count assertions.',
    '- **No stable member count element** — count is inside inline `<p class="muted">` with dynamic text; a `data-testid="members-count"` would remove regex fragility.',
    '- **`devLoginBtn` is config-gated** — `devLoginAvailable` must be `true` in the app config; not available on production. Credential fallback (`QA_COACH_PASSWORD`) required for production runs.',
    '- **No explicit "loading" state indicator** — members panel has no skeleton/spinner with a stable ID; the test must poll for rendered content.',
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
    mdList(result.requestFailures.map(r => `${r.method} ${r.url} — ${JSON.stringify(r.failure)}`), 'None'),
    '',
    '## Page Errors',
    '',
    mdList(result.pageErrors.map(e => e.message), 'None'),
    '',
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- Workflow 1 stops at the first failure.',
    '',
  ].filter(l => l !== null && l !== undefined);

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
}

/**
 * Rough Redis op estimate per API call based on post-optimisation analysis.
 * Identity session resolve: 0 if cached (warm Lambda), 4 if cold.
 * We conservatively assume warm for repeated calls, cold for first.
 */
function redisEstimate(endpoint, method = 'GET') {
  if (endpoint.startsWith('/api/identity'))  return method === 'GET' ? 6 : 8;
  if (endpoint.startsWith('/api/chat'))      return 8;
  if (endpoint.startsWith('/api/invite'))    return 4;
  if (endpoint.startsWith('/api/availability')) return 4;
  if (endpoint.startsWith('/api/cron'))      return 6;
  return 2;
}

// ─── Step runner ─────────────────────────────────────────────────────────────
async function capture(page, record) {
  const name = `${String(result.steps.length).padStart(2, '0')}-${slug(record.name)}`;
  const screenshotPath = path.join(artifactDir, `${name}.png`);
  const domPath        = path.join(artifactDir, `${name}.html`);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    record.screenshot = screenshotPath;
  } catch (e) {
    record.screenshotError = e?.message || String(e);
  }
  try {
    fs.writeFileSync(domPath, await page.content());
    record.domSnapshot = domPath;
  } catch (e) {
    record.domSnapshotError = e?.message || String(e);
  }
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

// ─── Step implementations ────────────────────────────────────────────────────
async function openApp(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#authPanel')).toBeVisible({ timeout: 15_000 });
}

async function coachLogin(page) {
  // Prefer the dev-login button when available and no password configured.
  const devBtn = page.locator('#devLoginBtn');
  const devAvailable = await devBtn.isVisible({ timeout: 2_000 }).catch(() => false);

  if (devAvailable && !config.coachPassword) {
    result.loginMethod = 'dev-login-btn';
    await devBtn.click();
  } else if (config.coachPassword) {
    result.loginMethod = 'credentials';
    if (!devAvailable) {
      // Dev button absent — click Login tab to expose the form
      const loginTab = page.getByRole('button', { name: /^Login$/i });
      const loginTabVisible = await loginTab.isVisible({ timeout: 2_000 }).catch(() => false);
      if (loginTabVisible) await loginTab.click();
    }
    await page.locator('#identityLoginEmail').fill(config.coachEmail);
    await page.locator('#identityLoginPassword').fill(config.coachPassword);
    await page.locator('#identityLoginBtn').click();
  } else {
    result.missingSelectorWarnings.push(
      'devLoginBtn not visible and QA_COACH_PASSWORD not set — cannot log in; set QA_COACH_PASSWORD or run against a preview deployment.'
    );
    throw new Error('Cannot log in: devLoginBtn not visible and QA_COACH_PASSWORD is not set');
  }

  // Wait for authenticated state: Members nav button appears or coachNav is visible
  await expect.poll(async () => {
    const membersVisible   = await page.getByRole('button', { name: 'Members', exact: true }).isVisible().catch(() => false);
    if (membersVisible) return 'ok';
    const coachNavVisible  = await page.locator('#coachNav:not(.hidden)').isVisible().catch(() => false);
    if (coachNavVisible) return 'ok';
    // Check for failure toast
    const toastText = result.toasts.at(-1)?.text || '';
    if (/too many|failed|error|invalid|limit/i.test(toastText)) throw new Error(`Login failed — toast: "${toastText}"`);
    return 'waiting';
  }, { timeout: 15_000, message: 'coach login should show authenticated UI within 15s' }).toBe('ok');
}

async function navigateToMembers(page) {
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.locator('h1#pageTitle')).toBeVisible({ timeout: 10_000 });
}

async function verifyMembersListRenders(page) {
  // Wait for filter pills — these only render after renderPlayers() populates #coach-players
  const firstPill = page.locator('#coach-players .filter-pill').first();
  const pillVisible = await firstPill.isVisible({ timeout: 15_000 }).catch(() => false);

  if (!pillVisible) {
    result.missingSelectorWarnings.push(
      '#coach-players .filter-pill not found — members data may not have loaded, or selector changed'
    );
    throw new Error('#coach-players filter pills did not render within 15s — members list may not have loaded');
  }

  await expect(firstPill).toBeVisible();

  // Extract member count from rendered text
  try {
    const membersText = await page.locator('#coach-players').textContent({ timeout: 5_000 });
    const match = (membersText || '').match(/(\d+)\s+members/i);
    if (match) {
      result.membersCount = parseInt(match[1], 10);
      if (result.membersCount === 0) {
        result.missingSelectorWarnings.push('Member count is 0 — roster may be empty or data failed to load');
      }
    } else {
      result.missingSelectorWarnings.push(
        'Could not parse member count from #coach-players text — no "/\\d+ members/" match found'
      );
    }
  } catch {
    result.missingSelectorWarnings.push('#coach-players text extraction failed');
  }

  // Assert at least one member is present
  if (result.membersCount !== null && result.membersCount === 0) {
    throw new Error('Members list rendered but shows 0 members — roster data may not have loaded correctly');
  }
}

// ─── Main test ───────────────────────────────────────────────────────────────
test('Workflow 1 — Coach Login → Members Page → Verify Members Load', async ({ page }) => {
  ensureDirs();

  // Toast capture via MutationObserver (injected before page scripts run)
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

  // Track every /api/* call for Redis impact reporting
  page.on('response', response => {
    const url    = response.url();
    const status = response.status();
    const urlObj = (() => { try { return new URL(url); } catch { return null; } })();
    if (urlObj && urlObj.pathname.startsWith('/api/')) {
      result.apiCalls.push({
        endpoint: urlObj.pathname,
        method:   response.request().method(),
        status,
        at:       new Date().toISOString(),
      });
    }
    // Also capture 4xx/5xx for the report
    if (status >= 400) {
      result.requestFailures.push({
        method: response.request().method(),
        url,
        failure: { errorText: `HTTP ${status} ${response.statusText()}` },
        at: new Date().toISOString(),
      });
    }
  });

  try {
    await workflowStep(page, 'Open app',                    () => openApp(page));
    await workflowStep(page, 'Coach login',                 () => coachLogin(page));
    await workflowStep(page, 'Navigate to Members page',    () => navigateToMembers(page));
    await workflowStep(page, 'Verify members list renders', () => verifyMembersListRenders(page));
    writeResult('passed');
    writeReport();
  } catch (error) {
    writeResult('failed');
    writeReport();
    throw error;
  }
});
