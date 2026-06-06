import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', runId);
const resultPath = path.join(process.cwd(), 'qa/results/qa-run.json');

const config = {
  baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:3000',
  coachEmail: process.env.QA_COACH_EMAIL || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '1111',
  playerEmail: process.env.QA_TEST_PLAYER_EMAIL || `qa-player-${Date.now()}@coachseye.test`,
  playerPassword: process.env.QA_TEST_PLAYER_PASSWORD || 'CoachEyeQA123!',
  expectedBaselinePlayers: (process.env.QA_EXPECTED_BASELINE_PLAYERS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
};

const result = {
  status: 'running',
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  baseURL: config.baseURL,
  testPlayerEmail: config.playerEmail,
  expectedBaselinePlayers: config.expectedBaselinePlayers,
  steps: [],
  notes: [],
};

function ensureDirs() {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
}

function writeResult(status = result.status) {
  result.status = status;
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

async function saveScreenshot(page, name) {
  const file = path.join(artifactDir, `${String(result.steps.length + 1).padStart(2, '0')}-${slug(name)}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function qaStep(name, page, fn) {
  const record = { name, status: 'running', screenshot: null, error: null, startedAt: new Date().toISOString() };
  result.steps.push(record);
  try {
    const note = await fn();
    record.status = 'passed';
    record.note = note || null;
  } catch (error) {
    record.status = 'failed';
    record.error = error?.message || String(error);
    throw error;
  } finally {
    try {
      record.screenshot = await saveScreenshot(page, name);
    } catch (error) {
      record.screenshotError = error?.message || String(error);
    }
    record.finishedAt = new Date().toISOString();
    writeResult(record.status === 'failed' ? 'failed' : 'running');
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
  await expect(page.getByRole('button', { name: 'Members' })).toBeVisible();

  const coachVisible = await page.getByRole('button', { name: 'Members' }).isVisible().catch(() => false);
  if (coachVisible) return 'Logged in with identity email/password.';

  if (config.coachPassword === '1111') {
    await page.evaluate(() => {
      if (typeof window.loginAs === 'function') window.loginAs('coach-demo');
    });
    await expect(page.getByRole('button', { name: 'Members' })).toBeVisible();
    result.notes.push('Used temporary seeded Simon Coach PIN/password fallback.');
    return 'Used temporary seeded Simon Coach fallback.';
  }

  throw new Error('Could not log in as Simon Coach.');
}

async function openMembers(page) {
  await page.getByRole('button', { name: 'Members' }).click();
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
}

async function visiblePlayerNames(page) {
  return page.locator('.player-db-table tbody tr strong').evaluateAll(nodes =>
    nodes.map(node => node.textContent.trim()).filter(Boolean)
  );
}

async function createGroupInvite(page) {
  const data = await page.evaluate(async () => {
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'group', role: 'player', sendEmail: false }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  });
  if (data.status >= 400 || data.body?.ok === false || !data.body?.url) {
    throw new Error(data.body?.error || `Group invite API failed with ${data.status}`);
  }
  result.notes.push('Created group invite through the real API; the current UI only exposes personal invite links.');
  return data.body.url;
}

async function registerPlayer(browser, inviteUrl) {
  const context = await browser.newContext({ baseURL: config.baseURL });
  const page = await context.newPage();
  await page.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#invite-modal')).toBeVisible();
  await page.locator('#invite-firstname-input').fill('Nightly');
  await page.locator('#invite-lastname-input').fill('QA');
  await page.locator('#invite-email-input').fill(config.playerEmail);
  await page.locator('#invite-password-input').fill(config.playerPassword);
  await page.locator('#invite-modal .btn.primary').click();
  await expect(page.locator('#invite-modal')).toHaveCount(0);
  await page.screenshot({ path: path.join(artifactDir, 'player-registration-complete.png'), fullPage: true });
  await context.close();
}

async function approvePendingPlayer(page) {
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.locator('#identity-requests-panel')).toContainText(config.playerEmail);
  const panel = page.locator('#identity-requests-panel');
  await panel.getByRole('button', { name: 'Approve' }).click();
  await expect(panel).not.toContainText(config.playerEmail);
}

async function loginAsApprovedPlayer(browser) {
  const context = await browser.newContext({ baseURL: config.baseURL });
  const page = await context.newPage();
  await openApp(page);
  await page.getByRole('button', { name: /^Login$/ }).click();
  await page.locator('#identityLoginEmail').fill(config.playerEmail);
  await page.locator('#identityLoginPassword').fill(config.playerPassword);
  await page.locator('#identityLoginBtn').click();
  await expect(page.getByRole('button', { name: 'Messages' })).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, 'approved-player-login.png'), fullPage: true });
  return { context, page };
}

async function sendMessage(page, text) {
  await page.locator('#chatComposer').fill(text);
  await page.locator('#chatSendBtn').click();
  await expect(page.locator('#chatFeed')).toContainText(text);
}

test('nightly Coach Eye QA user journey', async ({ browser, page }) => {
  ensureDirs();
  let inviteUrl = '';
  let playerSession = null;
  const coachMessage = `QA coach message ${runId}`;
  const playerReply = `QA player reply ${runId}`;

  try {
    await qaStep('Open latest preview or local app', page, () => openApp(page));
    await qaStep('Log in as Simon Coach', page, () => loginAsCoach(page));
    await qaStep('Verify Members page loads', page, () => openMembers(page));
    await qaStep('Verify only expected baseline players are visible', page, async () => {
      const actual = await visiblePlayerNames(page);
      expect(actual.sort()).toEqual([...config.expectedBaselinePlayers].sort());
      return `Visible players: ${actual.join(', ') || '(none)'}`;
    });
    await qaStep('Create a group invite link', page, async () => {
      inviteUrl = await createGroupInvite(page);
      return inviteUrl;
    });
    await qaStep('Register new player from invite in separate browser context', page, async () => {
      await registerPlayer(browser, inviteUrl);
    });
    await qaStep('Verify player appears in Pending Requests', page, async () => {
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(page.locator('#identity-requests-panel')).toContainText(config.playerEmail);
    });
    await qaStep('Approve the player as coach', page, () => approvePendingPlayer(page));
    await qaStep('Log in as the approved player', page, async () => {
      playerSession = await loginAsApprovedPlayer(browser);
    });
    await qaStep('Coach sends the player a direct message', page, async () => {
      await page.bringToFront();
      await openMembers(page);
      await page.getByRole('button', { name: 'Messages' }).click();
      await page.getByTitle('New message').click();
      await page.locator('#chatNewDmPicker input').fill('Nightly QA');
      await page.locator('[data-chat-new-dm-player]').filter({ hasText: 'Nightly QA' }).first().click();
      await expect(page.locator('#chatHeaderName')).toContainText('Nightly QA');
      await sendMessage(page, coachMessage);
    });
    await qaStep('Player receives the message', playerSession.page, async () => {
      await playerSession.page.bringToFront();
      await playerSession.page.getByRole('button', { name: 'Messages' }).click();
      await playerSession.page.getByText('Coach', { exact: true }).first().click();
      await expect(playerSession.page.locator('#chatFeed')).toContainText(coachMessage);
    });
    await qaStep('Player replies', playerSession.page, async () => {
      await sendMessage(playerSession.page, playerReply);
    });
    await qaStep('Coach sees the reply', page, async () => {
      await page.bringToFront();
      await expect(page.locator('#chatFeed')).toContainText(playerReply, { timeout: 20_000 });
    });
    writeResult('passed');
  } catch (error) {
    writeResult('failed');
    throw error;
  } finally {
    await playerSession?.context?.close().catch(() => {});
  }
});
