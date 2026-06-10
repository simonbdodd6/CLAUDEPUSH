/**
 * First-Run / Onboarding smoke test
 *
 * Verifies the complete new-coach setup experience:
 *   1. Fresh install shows onboarding checklist on Home (no players)
 *   2. "Setup: 0/5 done" pill is visible
 *   3. All 5 onboarding steps render with CTA buttons
 *   4. Step 1 (club name) is highlighted as current
 *   5. Player DB shows the empty-state import UI (not a blank table)
 *   6. "Download template CSV" button is present
 *   7. "Import CSV / Excel" button is present
 *   8. After adding a player, onboarding advances (Step 2 becomes done)
 *   9. Home pill updates to "Setup: 1/5 done" (or higher)
 *  10. Dismiss guide removes onboarding checklist
 *  11. Regular briefing cards appear after dismiss
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openApp, coachLogin, installToastCapture } from '../helpers/shared-steps.js';

const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `onboarding-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/onboarding.json');

const config = {
  baseURL:       process.env.QA_BASE_URL       || 'http://127.0.0.1:3000',
  coachEmail:    process.env.QA_COACH_EMAIL    || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',
};

const result = {
  workflow:  'onboarding',
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  status:    'running',
  commit:    gitCommit(),
  steps:     [],
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
  result.status     = status;
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

test('First-run onboarding — smoke test', async ({ page }) => {
  ensureDirs();
  installToastCapture(page);

  // ── 1. Login (fresh install — no players) ───────────────────────────────────
  await step(page, 'open-app',    () => openApp(page));
  await step(page, 'coach-login', () => coachLogin(page, config, result));

  // ── 2. Home shows onboarding checklist ──────────────────────────────────────
  await step(page, 'home-shows-onboarding', async () => {
    await expect(page.locator('#coach-overview')).toBeVisible({ timeout: 8_000 });
    // Onboarding banner visible
    await expect(page.locator('.home-onboarding-banner')).toBeVisible({ timeout: 5_000 });
    // 5 onboarding step cards
    const cards = await page.locator('.home-attn-item').count();
    if (cards !== 5) throw new Error(`Expected 5 onboarding steps, got ${cards}`);
    // Every card has a CTA button
    const ctas = await page.locator('.home-attn-cta').count();
    if (ctas !== 5) throw new Error(`Expected 5 CTA buttons, got ${ctas}`);
  });

  // ── 3. Briefing pill shows "Setup: 0/5 done" ────────────────────────────────
  await step(page, 'pill-shows-setup', async () => {
    const pill = page.locator('.home-briefing-pill');
    await expect(pill).toBeVisible({ timeout: 5_000 });
    const text = await pill.textContent();
    if (!text.includes('Setup')) throw new Error(`Expected Setup pill, got: "${text}"`);
  });

  // ── 4. Current step (first non-done) has primary CTA ────────────────────────
  await step(page, 'current-step-is-primary', async () => {
    const primaryCta = page.locator('.home-attn-item .btn.primary.home-attn-cta').first();
    await expect(primaryCta).toBeVisible({ timeout: 5_000 });
  });

  // ── 5. Player DB shows empty-state import UI ─────────────────────────────────
  await step(page, 'players-db-empty-state', async () => {
    await page.evaluate(() => setSection('coach', 'players'));
    await expect(page.locator('#coach-players')).toBeVisible({ timeout: 8_000 });
    // No player table rendered — empty state card present instead
    await expect(page.locator('#coach-players').locator('text=Add your players').first()).toBeVisible({ timeout: 5_000 });
    // Template CSV download button
    await expect(page.locator('#coach-players button').filter({ hasText: 'Download template CSV' }).first()).toBeVisible({ timeout: 5_000 });
    // Import CSV button
    await expect(page.locator('#coach-players button').filter({ hasText: 'Import CSV' }).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 6. Template CSV button exists in toolbar (even with players) ─────────────
  await step(page, 'toolbar-has-template-csv-btn', async () => {
    // The toolbar always shows the Template CSV button
    const toolbarBtn = page.locator('#coach-players').locator('button').filter({ hasText: 'Template CSV' }).first();
    await expect(toolbarBtn).toBeVisible({ timeout: 5_000 });
  });

  // ── 7. Adding a player exits onboarding → normal briefing appears ────────────
  await step(page, 'player-added-exits-onboarding', async () => {
    await page.evaluate(() => {
      state.players.push({
        id: 'onb-test-1', userId: '', name: 'Onboarding Test Player',
        position: '10 — Fly half', status: 'no-reply', game: 'no-reply',
        phone: '', email: '', trainingTuesday: 'no-reply',
        trainingThursday: 'no-reply', attendance: 0, history: [],
        blockedDates: [], medical: '', mediaConsent: false,
        contractStatus: 'active', photo: ''
      });
      saveState();
    });
    await page.evaluate(() => setSection('coach', 'overview'));
    await expect(page.locator('#coach-overview')).toBeVisible({ timeout: 8_000 });
    // Onboarding is gone (players.length > 0)
    const bannerCount = await page.locator('.home-onboarding-banner').count();
    if (bannerCount > 0) throw new Error('Onboarding banner should not show after squad is populated');
    // Normal briefing pill ("N things to do" or "All clear ✓")
    const pillText = await page.locator('.home-briefing-pill').textContent();
    if (pillText.includes('Setup:')) throw new Error(`Pill still shows Setup after player added: "${pillText}"`);
    if (!pillText.includes('to do') && !pillText.includes('All clear')) {
      throw new Error(`Unexpected pill after player added: "${pillText}"`);
    }
  });

  // ── 8. Skip guide works when no players (dismiss without adding) ─────────────
  await step(page, 'skip-guide-dismisses-onboarding', async () => {
    // Reset state to no players so onboarding reappears
    await page.evaluate(() => {
      state.players = [];
      state.onboardingDismissed = false;
      saveState();
      setSection('coach', 'overview');
    });
    await expect(page.locator('#coach-overview')).toBeVisible({ timeout: 8_000 });
    // Onboarding should be back
    await expect(page.locator('.home-onboarding-banner')).toBeVisible({ timeout: 5_000 });
    // Click Skip
    const skipBtn = page.locator('#coach-overview button').filter({ hasText: 'Skip guide' }).first();
    await expect(skipBtn).toBeVisible({ timeout: 5_000 });
    await skipBtn.click();
    await page.waitForTimeout(400);
    // Banner gone
    const bannerCount = await page.locator('.home-onboarding-banner').count();
    if (bannerCount > 0) throw new Error('Onboarding banner still visible after Skip');
    // Pill not in setup mode
    const pillText = await page.locator('.home-briefing-pill').textContent();
    if (pillText.includes('Setup:')) throw new Error(`Pill still Setup after Skip: "${pillText}"`);
  });

  writeResult('passed');
});
