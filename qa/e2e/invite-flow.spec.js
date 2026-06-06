import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `phase5-${runId}`);
const resultPath = path.join(process.cwd(), 'qa/results/phase5-invite-flow.json');
const reportPath = path.join(process.cwd(), 'QA_PHASE5_INVITE_REPORT.md');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for QA login`);
  return value;
}

const config = {
  baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:3000',
  coachEmail: process.env.QA_COACH_EMAIL || 'simonbdodd@gmail.com',
  coachPassword: requiredEnv('QA_COACH_PASSWORD'),
  testPlayerName: process.env.QA_TEST_PLAYER_NAME || 'QA Phase5 Player',
  testPlayerEmail: process.env.QA_TEST_PLAYER_EMAIL || `qa.phase5+${Date.now()}@coachseye.test`,
  testPlayerPassword: process.env.QA_TEST_PLAYER_PASSWORD || 'qatest12345',
};

const result = {
  status: 'running',
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  baseURL: config.baseURL,
  steps: [],
  console: [],
  toasts: [],
  pageErrors: [],
  requestFailures: [],
  responses: [],
  inviteUrl: null,
};

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

function writeResult(status = result.status) {
  result.status = status;
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

function mdList(items, empty) {
  return items.length ? items.map(item => `- ${item}`).join('\n') : `- ${empty}`;
}

function writeReport() {
  const failed = result.steps.find(step => step.status === 'failed');
  const passed = result.steps.filter(step => step.status === 'passed');
  const consoleErrors = result.console.filter(item => ['error', 'warning'].includes(item.type));
  const lines = [
    '# QA Phase 5 Invite Flow Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Base URL: ${result.baseURL}`,
    `Status: ${result.status}`,
    result.inviteUrl ? `Invite URL: ${result.inviteUrl}` : '',
    '',
    '## First Failure',
    '',
    failed ? `- Step: ${failed.name}` : '- Step: none',
    failed ? `- Error: ${failed.error}` : '- Error: none',
    failed ? `- Page URL: ${failed.url}` : `- Page URL: ${result.steps.at(-1)?.url || result.baseURL}`,
    failed?.screenshot ? `- Screenshot: ${rel(failed.screenshot)}` : '- Screenshot: none',
    failed?.domSnapshot ? `- DOM snapshot: ${rel(failed.domSnapshot)}` : '- DOM snapshot: none',
    '',
    '## Steps',
    '',
    ...result.steps.map((step, index) => {
      const shot = step.screenshot ? `; screenshot: ${rel(step.screenshot)}` : '';
      return `- ${index + 1}. ${step.name}: ${step.status}${step.error ? ` — ${step.error}` : ''}${shot}`;
    }),
    '',
    '## What Passes',
    '',
    ...(passed.length ? passed.map(step => `- ${step.name}`) : ['- Nothing passed before stop.']),
    '',
    '## Toast Messages',
    '',
    mdList(result.toasts.map(t => `${t.at} — ${t.text}`), 'No toasts captured.'),
    '',
    '## Network Failures',
    '',
    mdList(result.requestFailures.map(item => `${item.method} ${item.url} — ${JSON.stringify(item.failure)}`), 'No requestfailed events captured.'),
    '',
    '## HTTP 4xx/5xx And Auth-Related Responses',
    '',
    mdList(result.responses.map(item => `${item.status} ${item.statusText} — ${item.url}`), 'No 4xx/5xx or auth responses captured.'),
    '',
    '## Console Errors And Warnings',
    '',
    mdList(consoleErrors.map(item => `${item.type}: ${item.text}`), 'No console errors or warnings captured.'),
    '',
    '## Page Errors',
    '',
    mdList(result.pageErrors.map(item => item.message), 'No pageerror events captured.'),
    '',
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- No auth, messaging, invite, Redis, database, or feature logic was modified.',
    '- Phase 5 stops at the first QA failure.',
    '',
  ].filter(line => line !== null && line !== undefined);
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
}

async function capture(page, record) {
  const name = `${String(result.steps.length).padStart(2, '0')}-${slug(record.name)}`;
  const screenshot = path.join(artifactDir, `${name}.png`);
  const domSnapshot = path.join(artifactDir, `${name}.html`);
  try {
    await page.screenshot({ path: screenshot, fullPage: true });
    record.screenshot = screenshot;
  } catch (error) {
    record.screenshotError = error?.message || String(error);
  }
  try {
    fs.writeFileSync(domSnapshot, await page.content());
    record.domSnapshot = domSnapshot;
  } catch (error) {
    record.domSnapshotError = error?.message || String(error);
  }
  record.url = page.url();
}

async function phaseStep(page, name, fn) {
  const record = { name, status: 'running', startedAt: new Date().toISOString(), url: page.url() };
  result.steps.push(record);
  try {
    await fn();
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error = error?.message || String(error);
    throw error;
  } finally {
    await capture(page, record);
    record.finishedAt = new Date().toISOString();
    writeResult(record.status === 'failed' ? 'failed' : 'running');
    writeReport();
  }
}

async function openApp(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#authPanel')).toBeVisible();
}

async function loginAsCoach(page) {
  const toastCountBefore = result.toasts.length;
  await page.getByRole('button', { name: /^Login$/ }).click();
  await page.locator('#identityLoginEmail').fill(config.coachEmail);
  await page.locator('#identityLoginPassword').fill(config.coachPassword);
  await page.locator('#identityLoginBtn').click();

  // Wait for a login toast — success emits "Welcome...", failure emits "Too many attempts..." etc.
  // Using result.toasts (Node.js side) which is populated by the MutationObserver console listener
  await expect
    .poll(() => result.toasts.length, { timeout: 15_000, message: 'login should emit a toast within 15s' })
    .toBeGreaterThan(toastCountBefore);

  const latestToast = result.toasts[result.toasts.length - 1];
  if (!/welcome/i.test(latestToast.text)) {
    throw new Error(`Login failed — toast: "${latestToast.text}"`);
  }
}

async function openMembers(page) {
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.locator('h1#pageTitle')).toBeVisible();
}

async function ensureInvitePanelOpen(page) {
  // If #inv-name is already visible the panel is open (it has `open` attr by default)
  const alreadyOpen = await page.locator('#inv-name').isVisible().catch(() => false);
  if (!alreadyOpen) {
    await page.locator('details.srv-panel summary').filter({ hasText: /Invite.*team access/i }).click();
  }
  await expect(page.locator('#inv-name')).toBeVisible();
  await expect(page.locator('#inv-email')).toBeVisible();
  await expect(page.locator('#inv-create-btn')).toBeVisible();
}

async function fillAndGenerateInvite(page) {
  // loadInviteList() polls every ~0.5s and re-renders the form, clearing fields between actions.
  // Fill + click atomically in a single page.evaluate so no network response can race between them.
  await page.evaluate(({ name, email }) => {
    const nameEl = document.getElementById('inv-name');
    const emailEl = document.getElementById('inv-email');
    const btn = document.getElementById('inv-create-btn');
    nameEl.value = name;
    emailEl.value = email;
    nameEl.dispatchEvent(new Event('input', { bubbles: true }));
    emailEl.dispatchEvent(new Event('input', { bubbles: true }));
    btn.click();
  }, { name: config.testPlayerName, email: config.testPlayerEmail });

  try {
    await page.waitForSelector('#inv-link-field', { state: 'visible', timeout: 20_000 });
  } catch {
    const toastText = await page.locator('#toast').textContent().catch(() => '');
    const msg = toastText.trim()
      ? `Invite creation failed — toast: "${toastText.trim()}"`
      : 'Invite link field did not appear within 20s';
    throw new Error(msg);
  }

  const inviteUrl = await page.locator('#inv-link-field').inputValue();
  result.inviteUrl = inviteUrl;
  return inviteUrl;
}

async function openInviteUrl(page, inviteUrl) {
  await page.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#invite-modal')).toBeVisible({ timeout: 15_000 });
}

async function fillRegistrationForm(page) {
  // Name is pre-filled from the invite
  await page.locator('#invite-email-input').fill(config.testPlayerEmail);
  await page.locator('#invite-password-input').fill(config.testPlayerPassword);
}

async function submitRegistration(page) {
  await page.locator('#invite-modal .btn.primary').click();

  // On success, acceptInvite() calls document.getElementById('invite-modal')?.remove()
  // waitForSelector with state:'detached' is the reliable Playwright primitive for this
  try {
    await page.waitForSelector('#invite-modal', { state: 'detached', timeout: 20_000 });
  } catch {
    // Modal didn't detach — check if an error toast explains why
    const toastText = await page.locator('#toast').textContent().catch(() => '');
    const msg = toastText.trim()
      ? `Registration failed — toast: "${toastText.trim()}"`
      : 'Registration did not complete — modal stayed open for 20s';
    throw new Error(msg);
  }
}

async function switchBackToCoach(page) {
  await page.getByRole('button', { name: /Switch/i }).click();
  // Wait for the Simon Coach entry to appear in the switch panel, then click it
  await page.waitForSelector('button:has-text("Simon Coach")', { state: 'visible', timeout: 10_000 });
  await page.locator('button:has-text("Simon Coach")').first().click();
  // Verify coach view is active
  await page.waitForSelector('button:has-text("Members")', { state: 'visible', timeout: 10_000 });
}

async function verifyPlayerInMembers(page) {
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.locator('h1#pageTitle')).toBeVisible();
  // The test player's name should appear somewhere in the members section
  await expect(page.locator('#coach-players')).toContainText(config.testPlayerName, { timeout: 10_000 });
}

test('phase 5 invite flow', async ({ page }) => {
  ensureDirs();

  // Capture toast messages via DOM mutation observer before page scripts run
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const el = document.getElementById('toast');
      if (el && el.classList.contains('visible') && el.textContent.trim()) {
        console.log('[QA_TOAST] ' + el.textContent.trim());
      }
    });
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('toast');
      if (el) {
        observer.observe(el, { attributes: true, attributeFilter: ['class'], childList: true });
      }
    });
  });

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text(), location: msg.location(), at: new Date().toISOString() };
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
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      failure: request.failure(),
      at: new Date().toISOString(),
    });
  });
  page.on('response', response => {
    const status = response.status();
    if (status >= 400 || response.url().includes('/api/invite') || response.url().includes('/api/identity')) {
      result.responses.push({
        status,
        statusText: response.statusText(),
        url: response.url(),
        method: response.request().method(),
        at: new Date().toISOString(),
      });
    }
  });

  try {
    await phaseStep(page, 'Open app', () => openApp(page));
    await phaseStep(page, 'Login as Simon Coach', () => loginAsCoach(page));
    await phaseStep(page, 'Navigate to Members', () => openMembers(page));
    await phaseStep(page, 'Open invite panel', () => ensureInvitePanelOpen(page));
    let inviteUrl;
    await phaseStep(page, 'Generate player invite', async () => {
      inviteUrl = await fillAndGenerateInvite(page);
    });
    await phaseStep(page, 'Open invite registration URL', () => openInviteUrl(page, inviteUrl));
    await phaseStep(page, 'Fill registration form', () => fillRegistrationForm(page));
    await phaseStep(page, 'Submit registration', () => submitRegistration(page));
    await phaseStep(page, 'Switch back to coach', () => switchBackToCoach(page));
    await phaseStep(page, 'Verify player appears in Members', () => verifyPlayerInMembers(page));
    writeResult('passed');
    writeReport();
  } catch (error) {
    writeResult('failed');
    writeReport();
    throw error;
  }
});
