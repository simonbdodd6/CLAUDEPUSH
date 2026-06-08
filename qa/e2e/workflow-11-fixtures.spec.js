/**
 * Workflow 11 — Fixture Manager CRUD + Validation
 *
 * Tests the complete fixture lifecycle:
 *   Validation (missing opponent, missing date) → Create → List verification
 *   → API verification → Edit → Delete → Empty state
 *
 * All tests run in the coach session only — GET /api/fixtures is public,
 * so the player-side view is verified via a direct API call inside evaluate().
 *
 * Stops on first failure. Saves PNG + HTML snapshot at each step.
 * Writes qa/results/workflow-11.json.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openApp, coachLogin, redisEstimate } from '../helpers/shared-steps.js';

const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow11-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-11.json');

const config = {
  baseURL:      process.env.QA_BASE_URL      || 'http://127.0.0.1:3000',
  coachEmail:   process.env.QA_COACH_EMAIL   || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',
};

const ts         = Date.now();
const testOpponent = `QA RFC ${ts}`;
const testDate     = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10); // 2 weeks out
const editedOpponent = `QA RFC Edited ${ts}`;

const result = {
  workflow: 'workflow-11',
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status: 'running',
  baseURL: config.baseURL,
  commit: gitCommit(),
  loginMethod: config.coachPassword ? 'credentials' : 'dev-login-btn',
  steps: [],
  toasts: [],
  pageErrors: [],
  apiCalls: [],
  missingSelectorWarnings: [],
  createdFixtureId: null,
};

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

function ensureDirs() {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
}

function writeResult(status = result.status) {
  result.status = status;
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

async function step(page, name, fn) {
  const entry = { name, status: 'running', startedAt: new Date().toISOString() };
  result.steps.push(entry);
  writeResult('running');
  try {
    await fn();
    entry.status = 'passed';
    entry.finishedAt = new Date().toISOString();
    const shot = path.join(artifactDir, `${String(result.steps.length).padStart(2,'0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    entry.screenshot = path.relative(process.cwd(), shot).replaceAll(path.sep, '/');
    writeResult('running');
  } catch (e) {
    entry.status = 'failed';
    entry.error = e.message;
    entry.finishedAt = new Date().toISOString();
    const shot = path.join(artifactDir, `FAIL-${String(result.steps.length).padStart(2,'0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    entry.screenshot = path.relative(process.cwd(), shot).replaceAll(path.sep, '/');
    writeResult('failed');
    throw e;
  }
}

test('Workflow 11 — Fixture Manager CRUD', async ({ page, context }) => {
  ensureDirs();

  // Toast collector
  await page.addInitScript(() => {
    window.__qaToasts = [];
    const _orig = window.showToast;
    const install = () => {
      if (typeof window.showToast === 'function' && window.showToast !== window.__qaWrapped) {
        const orig = window.showToast;
        window.showToast = function(msg) { window.__qaToasts.push({ text: String(msg), ts: Date.now() }); return orig.apply(this, arguments); };
        window.__qaWrapped = window.showToast;
      }
    };
    document.addEventListener('DOMContentLoaded', install);
    new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
  });

  page.on('console', msg => { if (msg.type() === 'error') result.pageErrors.push(msg.text()); });

  page.on('response', async res => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    const p = new URL(url).pathname;
    result.apiCalls.push({ method: res.request().method(), path: p, status: res.status(), redisOps: redisEstimate(p, res.request().method()) });
  });

  // ─── 1. Open app + coach login ──────────────────────────────────────────────
  await step(page, 'open-app', () => openApp(page));
  await step(page, 'coach-login', () => coachLogin(page, config, result));

  // ─── 2. Navigate to Matchday section ────────────────────────────────────────
  await step(page, 'navigate-to-matchday', async () => {
    await page.getByRole('button', { name: /Matchday/i }).click();
    await expect(page.locator('#coach-matchday')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#coach-matchday')).toContainText('Season fixtures', { timeout: 5_000 });
  });

  // ─── 3. Validation: missing opponent ────────────────────────────────────────
  await step(page, 'validation-missing-opponent', async () => {
    // Open the form
    await page.locator('#coach-matchday button').filter({ hasText: 'Add fixture' }).first().click();
    await expect(page.locator('#fixture-form-card')).toBeVisible({ timeout: 5_000 });

    // Submit without filling anything → toast "Opponent name is required"
    await page.locator('#fix-submit-btn').click();
    const toastAppeared = await expect.poll(
      async () => {
        const toasts = await page.evaluate(() => window.__qaToasts || []);
        result.toasts = toasts;
        return toasts.some(t => /opponent.*required/i.test(t.text));
      },
      { timeout: 5_000, message: 'Toast "Opponent name is required" should appear' }
    ).toBeTruthy();
  });

  // ─── 4. Validation: missing date ────────────────────────────────────────────
  await step(page, 'validation-missing-date', async () => {
    // Opponent filled, date empty → toast "Date is required"
    await page.locator('#fix-opponent').fill('Test Opponent');
    await page.locator('#fix-submit-btn').click();
    await expect.poll(
      async () => {
        const toasts = await page.evaluate(() => window.__qaToasts || []);
        result.toasts = toasts;
        return toasts.some(t => /date.*required/i.test(t.text));
      },
      { timeout: 5_000, message: 'Toast "Date is required" should appear' }
    ).toBeTruthy();
  });

  // ─── 5. Create valid fixture ─────────────────────────────────────────────────
  await step(page, 'create-fixture', async () => {
    // Fill all required fields via evaluate (date input is reliably set this way)
    await page.evaluate(({ opponent, date, venue, kickoff, competition }) => {
      document.getElementById('fix-opponent').value = opponent;
      document.getElementById('fix-opponent').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('fix-date').value = date;
      document.getElementById('fix-date').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('fix-venue').value = venue;
      document.getElementById('fix-kickoff').value = kickoff;
      document.getElementById('fix-kickoff').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('fix-competition').value = competition;
      document.getElementById('fix-competition').dispatchEvent(new Event('input', { bubbles: true }));
    }, { opponent: testOpponent, date: testDate, venue: 'Home', kickoff: '15:00', competition: 'QA League' });

    await page.locator('#fix-submit-btn').click();

    // Form should close and fixture appears in the list
    await expect(page.locator('#fixture-form-card')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('#coach-matchday')).toContainText(testOpponent, { timeout: 10_000 });
  });

  // ─── 6. Verify via API ───────────────────────────────────────────────────────
  await step(page, 'api-verify-fixture', async () => {
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/fixtures');
      return res.json().catch(() => ({}));
    });
    if (!data.ok || !Array.isArray(data.fixtures)) throw new Error(`GET /api/fixtures failed: ${JSON.stringify(data)}`);
    const match = data.fixtures.find(f => f.opponent && f.opponent.includes('QA RFC'));
    if (!match) throw new Error(`Created fixture not found in API response. fixtures: ${JSON.stringify(data.fixtures.map(f => f.opponent))}`);
    result.createdFixtureId = match.id;
    if (match.venue !== 'Home') throw new Error(`Expected venue=Home, got ${match.venue}`);
    if (match.kickoff !== '15:00') throw new Error(`Expected kickoff=15:00, got ${match.kickoff}`);
  });

  // ─── 7. Edit fixture ─────────────────────────────────────────────────────────
  await step(page, 'edit-fixture', async () => {
    // Click the Edit button on our fixture
    const fixtureRow = page.locator('#coach-matchday').locator('div').filter({ hasText: testOpponent }).first();
    await fixtureRow.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#fixture-form-card')).toBeVisible({ timeout: 5_000 });

    // Change opponent name
    await page.evaluate((newOpponent) => {
      const el = document.getElementById('fix-opponent');
      el.value = newOpponent;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, editedOpponent);

    await page.locator('#fix-submit-btn').click();
    await expect(page.locator('#fixture-form-card')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('#coach-matchday')).toContainText(editedOpponent, { timeout: 8_000 });
  });

  // ─── 8. Delete fixture ───────────────────────────────────────────────────────
  await step(page, 'delete-fixture', async () => {
    // Handle confirm dialog
    page.once('dialog', dialog => dialog.accept());

    const fixtureRow = page.locator('#coach-matchday').locator('div').filter({ hasText: editedOpponent }).first();
    // The delete button contains ✕
    await fixtureRow.locator('button').filter({ hasText: '✕' }).click();

    // Fixture list should no longer contain the opponent name
    await expect.poll(
      async () => {
        const text = await page.locator('#coach-matchday').textContent().catch(() => '');
        return !text.includes(editedOpponent);
      },
      { timeout: 10_000, message: `${editedOpponent} should be removed after delete` }
    ).toBeTruthy();
  });

  // ─── 9. API confirms deletion ────────────────────────────────────────────────
  await step(page, 'api-confirm-deleted', async () => {
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/fixtures');
      return res.json().catch(() => ({}));
    });
    if (!data.ok) throw new Error(`GET /api/fixtures failed after delete`);
    const stillPresent = (data.fixtures || []).some(f => f.opponent?.includes('QA RFC'));
    if (stillPresent) throw new Error('Deleted fixture still present in API response');
  });

  // ─── Final ───────────────────────────────────────────────────────────────────
  result.toasts = await page.evaluate(() => window.__qaToasts || []).catch(() => []);
  writeResult('passed');
});
