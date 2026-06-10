/**
 * Match Centre — smoke test
 *
 * Verifies the Match Centre renders correctly after coach login:
 *   1. Navigation shows "Match Centre" (not "Matchday Centre")
 *   2. Hero section renders with opponent name
 *   3. KPI grid renders (Available, Unavailable, Medical alerts, To kickoff)
 *   4. Match details form is present and editable
 *   5. Team selection pitch renders
 *   6. Publish Squad button is present
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openApp, coachLogin } from '../helpers/shared-steps.js';

const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `match-centre-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/match-centre.json');

const config = {
  baseURL:       process.env.QA_BASE_URL       || 'http://127.0.0.1:3000',
  coachEmail:    process.env.QA_COACH_EMAIL    || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',
};

const result = {
  workflow:   'match-centre',
  runId,
  startedAt:  new Date().toISOString(),
  finishedAt: null,
  status:     'running',
  commit:     gitCommit(),
  steps:      [],
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
  result.status    = status;
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

async function step(page, name, fn) {
  const entry = { name, status: 'running', startedAt: new Date().toISOString() };
  result.steps.push(entry);
  writeResult('running');
  try {
    await fn();
    entry.status     = 'passed';
    entry.finishedAt = new Date().toISOString();
    const shot = path.join(artifactDir, `${String(result.steps.length).padStart(2,'0')}-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    entry.screenshot = path.relative(process.cwd(), shot).replaceAll(path.sep, '/');
    writeResult('running');
  } catch (e) {
    entry.status     = 'failed';
    entry.error      = e.message;
    entry.finishedAt = new Date().toISOString();
    const shot = path.join(artifactDir, `FAIL-${String(result.steps.length).padStart(2,'0')}-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    entry.screenshot = path.relative(process.cwd(), shot).replaceAll(path.sep, '/');
    writeResult('failed');
    throw e;
  }
}

test('Match Centre — coach smoke test', async ({ page }) => {
  ensureDirs();

  // ── 1. Login ────────────────────────────────────────────────────────────────
  await step(page, 'open-app',    () => openApp(page));
  await step(page, 'coach-login', () => coachLogin(page, config, result));

  // ── 2. Navigate to Match Centre ─────────────────────────────────────────────
  await step(page, 'navigate-to-match-centre', async () => {
    // Nav item must say "Match Centre" not "Matchday Centre"
    const navItem = page.locator('#coachNav li, #coachNav button').filter({ hasText: 'Match Centre' }).first();
    await expect(navItem).toBeVisible({ timeout: 8_000 });
    await navItem.click();
    await expect(page.locator('#coach-matchday')).toBeVisible({ timeout: 8_000 });
  });

  // ── 3. Hero renders with opponent ───────────────────────────────────────────
  await step(page, 'hero-renders', async () => {
    // The hero contains "vs <opponent>" — default is "Kituro RFC"
    const hero = page.locator('.mc-hero').first();
    await expect(hero).toBeVisible({ timeout: 6_000 });
    await expect(hero.locator('h1')).toContainText('vs ', { timeout: 5_000 });
  });

  // ── 4. KPI grid visible ─────────────────────────────────────────────────────
  await step(page, 'kpi-grid-renders', async () => {
    const kpiGrid = page.locator('.mc-kpi-grid').first();
    await expect(kpiGrid).toBeVisible({ timeout: 5_000 });
    // Four KPI cells
    await expect(kpiGrid.locator('.mc-kpi')).toHaveCount(4);
  });

  // ── 5. Match details form present ───────────────────────────────────────────
  await step(page, 'match-details-form', async () => {
    const card = page.locator('#coach-matchday .mc-detail-row').first();
    await expect(card).toBeVisible({ timeout: 5_000 });
  });

  // ── 6. Phase badge visible ──────────────────────────────────────────────────
  await step(page, 'phase-badge-visible', async () => {
    const badge = page.locator('.mc-phase-badge').first();
    await expect(badge).toBeVisible({ timeout: 5_000 });
    const text = await badge.textContent();
    const valid = ['Prepare','Refine','Confirm','Live','Post-match'];
    if (!valid.some(v => text.includes(v))) {
      throw new Error(`Phase badge shows unexpected text: "${text}"`);
    }
  });

  // ── 7. Pitch renders ────────────────────────────────────────────────────────
  await step(page, 'pitch-renders', async () => {
    await expect(page.locator('#matchday-pitch')).toBeVisible({ timeout: 5_000 });
  });

  // ── 8. Publish button present ───────────────────────────────────────────────
  await step(page, 'publish-button-present', async () => {
    const btn = page.locator('.mc-publish-btn').first();
    await expect(btn).toBeVisible({ timeout: 5_000 });
  });

  // ── 9. Edit opposition field ─────────────────────────────────────────────────
  await step(page, 'edit-opposition', async () => {
    const input = page.locator('#coach-matchday input[type="text"]').first();
    await input.fill('RFC Test Opponent');
    await input.dispatchEvent('change');
    await page.waitForTimeout(500);
    // Hero should update with new name after render()
    await expect(page.locator('.mc-hero h1')).toContainText('RFC Test Opponent', { timeout: 5_000 });
  });

  writeResult('passed');
});
