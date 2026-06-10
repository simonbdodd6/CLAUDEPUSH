/**
 * Home / Daily Briefing — smoke test
 *
 * Verifies the new context-aware Home screen renders correctly after coach login:
 *   1. Home section is the default active view
 *   2. Match card renders with opponent, phase badge, and countdown
 *   3. Progress bar is present
 *   4. Needs Attention section renders
 *   5. "Match Centre →" navigation button is present and works
 *   6. AI Intelligence slot is absent (feature flag off by default)
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openApp, coachLogin } from '../helpers/shared-steps.js';

const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `home-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/home.json');

const config = {
  baseURL:       process.env.QA_BASE_URL       || 'http://127.0.0.1:3000',
  coachEmail:    process.env.QA_COACH_EMAIL    || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',
};

const result = {
  workflow:  'home',
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

test('Home — coach daily briefing smoke test', async ({ page }) => {
  ensureDirs();

  // ── 1. Login ─────────────────────────────────────────────────────────────────
  await step(page, 'open-app',    () => openApp(page));
  await step(page, 'coach-login', () => coachLogin(page, config, result));

  // ── 2. Home is the default active section ────────────────────────────────────
  await step(page, 'home-section-active', async () => {
    await expect(page.locator('#coach-overview')).toBeVisible({ timeout: 6_000 });
    await expect(page.locator('.home-wrap')).toBeVisible({ timeout: 6_000 });
  });

  // ── 3. Briefing header shows today's date + status pill ──────────────────────
  await step(page, 'briefing-header-renders', async () => {
    await expect(page.locator('.home-briefing-hdr')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.home-briefing-date')).toBeVisible({ timeout: 5_000 });
    // Pill shows "X things to do", "All clear ✓", or "Setup: X/5 done"
    const pill = page.locator('.home-briefing-pill');
    await expect(pill).toBeVisible({ timeout: 5_000 });
    const pillText = await pill.textContent();
    if (!pillText.includes('to do') && !pillText.includes('All clear') && !pillText.includes('Setup')) {
      throw new Error(`Unexpected briefing pill text: "${pillText}"`);
    }
  });

  // ── 4. Match card renders ────────────────────────────────────────────────────
  await step(page, 'match-card-renders', async () => {
    const card = page.locator('.home-match-card');
    await expect(card).toBeVisible({ timeout: 5_000 });
    // Opponent name shown
    await expect(card.locator('.home-match-opponent')).toContainText('vs ', { timeout: 5_000 });
    // Phase badge visible within the card
    await expect(card.locator('.mc-phase-badge')).toBeVisible({ timeout: 5_000 });
    // Countdown visible
    await expect(card.locator('.home-match-countdown')).toBeVisible({ timeout: 5_000 });
  });

  // ── 5. Progress bar present ──────────────────────────────────────────────────
  await step(page, 'progress-bar-present', async () => {
    await expect(page.locator('.home-match-progress')).toBeVisible({ timeout: 5_000 });
  });

  // ── 6. Daily Briefing cards render ───────────────────────────────────────────
  await step(page, 'briefing-cards-render', async () => {
    const section = page.locator('.home-attn-list');
    await expect(section).toBeVisible({ timeout: 5_000 });
    // Either shows cards or the all-clear message — never empty
    const hasItems = await page.locator('.home-attn-item').count();
    const hasClear = await page.locator('.home-attn-clear').count();
    if (hasItems === 0 && hasClear === 0) {
      throw new Error('Daily Briefing is empty — expected cards or all-clear message');
    }
    // Max 6 cards
    if (hasItems > 6) throw new Error(`Too many briefing cards: ${hasItems} (max 6)`);
    // Each card has a CTA button
    if (hasItems > 0) {
      const ctaCount = await page.locator('.home-attn-cta').count();
      if (ctaCount !== hasItems) throw new Error(`Card/CTA count mismatch: ${hasItems} cards, ${ctaCount} CTAs`);
    }
  });

  // ── 7. Match Centre navigation button is present and navigates ───────────────
  await step(page, 'match-centre-nav-btn', async () => {
    const btn = page.locator('.home-match-card button').filter({ hasText: 'Match Centre' });
    await expect(btn).toBeVisible({ timeout: 5_000 });
    await btn.click();
    await expect(page.locator('#coach-matchday')).toBeVisible({ timeout: 6_000 });
  });

  // ── 8. AI slot absent by default ────────────────────────────────────────────
  await step(page, 'ai-slot-absent-by-default', async () => {
    // Navigate back to overview to check
    const navItem = page.locator('#coachNav li, #coachNav button').filter({ hasText: 'Overview' }).first();
    await navItem.click();
    await expect(page.locator('#coach-overview')).toBeVisible({ timeout: 5_000 });
    // AI slot must NOT be present when feature flag is off
    const aiSlot = page.locator('.home-ai-slot');
    await expect(aiSlot).toHaveCount(0);
  });

  writeResult('passed');
});
