import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `phase4-${runId}`);
const resultPath = path.join(process.cwd(), 'qa/results/phase4-login-members.json');
const reportPath = path.join(process.cwd(), 'QA_PHASE4_LOGIN_MEMBERS_REPORT.md');

const config = {
  baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:3000',
  coachEmail: process.env.QA_COACH_EMAIL || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '1111',
};

const result = {
  status: 'running',
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  baseURL: config.baseURL,
  steps: [],
  console: [],
  pageErrors: [],
  requestFailures: [],
  responses: [],
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
    '# QA Phase 4 Login Members Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Base URL: ${result.baseURL}`,
    `Status: ${result.status}`,
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
      return `- ${index + 1}. ${step.name}: ${step.status}${step.error ? ` - ${step.error}` : ''}${shot}`;
    }),
    '',
    '## What Passes',
    '',
    ...(passed.length ? passed.map(step => `- ${step.name}`) : ['- Nothing passed before stop.']),
    '',
    '## Network Failures',
    '',
    mdList(result.requestFailures.map(item => `${item.method} ${item.url} - ${JSON.stringify(item.failure)}`), 'No requestfailed events captured.'),
    '',
    '## HTTP 4xx/5xx And Auth-Related Responses',
    '',
    mdList(result.responses.map(item => `${item.status} ${item.statusText} - ${item.url}`), 'No 4xx/5xx or /api/identity responses captured.'),
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
    '- No auth, messaging, invite, Redis, or production code was modified.',
    '- Phase 4 stops at the first QA failure.',
    '',
  ];
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
  await page.getByRole('button', { name: /^Login$/ }).click();
  await page.locator('#identityLoginEmail').fill(config.coachEmail);
  await page.locator('#identityLoginPassword').fill(config.coachPassword);
  await page.locator('#identityLoginBtn').click();

  await expect
    .poll(async () => {
      const membersVisible = await page.getByRole('button', { name: 'Members' }).isVisible().catch(() => false);
      if (membersVisible) return 'members-visible';
      const coachNavVisible = await page.locator('#coachNav:not(.hidden)').isVisible().catch(() => false);
      if (coachNavVisible) return 'coach-nav-visible';
      const authText = await page.locator('#authPanel').innerText().catch(() => '');
      if (/Simon Coach/i.test(authText)) return 'authenticated-user-visible';
      return 'not-ready';
    }, { timeout: 15_000, message: 'coach login should show an authenticated coach UI' })
    .not.toBe('not-ready');
}

async function openMembers(page) {
  await page.getByRole('button', { name: 'Members' }).click();
  await expect(page.locator('h1#pageTitle')).toBeVisible();
}

test('phase 4 coach login then members page', async ({ page }) => {
  ensureDirs();

  page.on('console', msg => {
    result.console.push({ type: msg.type(), text: msg.text(), location: msg.location(), at: new Date().toISOString() });
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
    if (status >= 400 || response.url().includes('/api/identity')) {
      result.responses.push({
        status,
        statusText: response.statusText(),
        url: response.url(),
        at: new Date().toISOString(),
      });
    }
  });

  try {
    await phaseStep(page, 'Open app', () => openApp(page));
    await phaseStep(page, 'Log in as Simon Coach', () => loginAsCoach(page));
    await phaseStep(page, 'Navigate to Members', () => openMembers(page));
    writeResult('passed');
    writeReport();
  } catch (error) {
    writeResult('failed');
    writeReport();
    throw error;
  }
});
