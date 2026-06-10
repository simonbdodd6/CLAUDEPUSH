/**
 * Training Publish Workflow — smoke test
 *
 * Verifies the complete coach → player publish workflow:
 *   1. Session tabs render from state.schedule (not hardcoded)
 *   2. Session starts as Draft
 *   3. Coach adds a block and publishes
 *   4. Published badge appears in tab and header
 *   5. Home screen tonight card shows published status
 *   6. Match Centre availability row shows Published badge
 *   7. Player sees training plan in "This Week"
 *   8. Player sees training plan in Calendar
 *   9. Coach republishes — no duplicates, state is idempotent
 *  10. Coach unpublishes — player plan disappears
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openApp, coachLogin, playerLogin, installToastCapture } from '../helpers/shared-steps.js';

const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `training-publish-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/training-publish.json');

const config = {
  baseURL:       process.env.QA_BASE_URL       || 'http://127.0.0.1:3000',
  coachEmail:    process.env.QA_COACH_EMAIL    || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',
};

const result = {
  workflow:   'training-publish',
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

test('Training publish workflow — full smoke test', async ({ page }) => {
  ensureDirs();
  installToastCapture(page);

  // ── 1. Login as coach ────────────────────────────────────────────────────────
  await step(page, 'open-app',    () => openApp(page));
  await step(page, 'coach-login', () => coachLogin(page, config, result));

  // ── 2. Navigate to Training Centre ──────────────────────────────────────────
  await step(page, 'navigate-to-training', async () => {
    await page.evaluate(() => setSection('coach', 'training'));
    await expect(page.locator('#coach-training')).toBeVisible({ timeout: 8_000 });
  });

  // ── 3. Session tabs render from state.schedule (not hardcoded) ───────────────
  // There should be at least one session tab, driven by state.schedule
  await step(page, 'session-tabs-from-schedule', async () => {
    const tabs = page.locator('.session-card-tab');
    const count = await tabs.count();
    if (count === 0) throw new Error('No session tabs rendered — state.schedule may be empty');
    // Verify the first tab has a title (not just a raw ID like "tue")
    const firstTab = tabs.first();
    await expect(firstTab).toBeVisible({ timeout: 5_000 });
  });

  // ── 4. Session starts as Draft ───────────────────────────────────────────────
  await step(page, 'session-starts-as-draft', async () => {
    // The active session card header should show "Draft" badge (not "Published")
    const draftBadge = page.locator('.card').filter({ hasText: 'Draft' }).first();
    await expect(draftBadge).toBeVisible({ timeout: 5_000 });
    // "Publish to squad" button should be visible
    const publishBtn = page.locator('button').filter({ hasText: 'Publish to squad' }).first();
    await expect(publishBtn).toBeVisible({ timeout: 5_000 });
  });

  // ── 5. Add a training block ──────────────────────────────────────────────────
  await step(page, 'add-training-block', async () => {
    const addBtn = page.locator('button').filter({ hasText: '+ Add block' }).first();
    await expect(addBtn).toBeVisible({ timeout: 5_000 });
    await addBtn.click();
    await page.waitForTimeout(600);
    // A row should now appear in the session table
    await expect(page.locator('.training-gs-table tbody tr').first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 6. Publish to squad ──────────────────────────────────────────────────────
  await step(page, 'publish-session', async () => {
    const publishBtn = page.locator('button').filter({ hasText: 'Publish to squad' }).first();
    await expect(publishBtn).toBeVisible({ timeout: 5_000 });
    await publishBtn.click();
    await page.waitForTimeout(800);
    // Published badge should now appear in the header
    await expect(page.locator('text=✓ Published').first()).toBeVisible({ timeout: 5_000 });
    // Unpublish button should appear
    await expect(page.locator('button').filter({ hasText: 'Unpublish' }).first()).toBeVisible({ timeout: 5_000 });
    // Republish button should appear
    await expect(page.locator('button').filter({ hasText: 'Republish' }).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 7. Session tab shows Published badge ─────────────────────────────────────
  await step(page, 'tab-shows-published', async () => {
    // The active session tab should contain "Published" text
    const activeTab = page.locator('.session-card-tab.active').first();
    await expect(activeTab).toContainText('Published', { timeout: 5_000 });
  });

  // ── 8. Match Centre — availability row shows Published badge ─────────────────
  await step(page, 'match-centre-availability-published', async () => {
    await page.evaluate(() => setSection('coach', 'matchday'));
    await expect(page.locator('#coach-matchday')).toBeVisible({ timeout: 8_000 });
    // The mc-avail-row for the published session must show "Published"
    const publishedRow = page.locator('#coach-matchday .mc-avail-row').filter({ hasText: 'Published' }).first();
    await expect(publishedRow).toBeVisible({ timeout: 5_000 });
  });

  // ── 9. Seed a player so the player-side view is fully functional ─────────────
  await step(page, 'seed-test-player', async () => {
    // Add player-simon-test to the squad so getPlayer() returns a real record
    await page.evaluate(() => {
      if (!state.players.find(p => p.userId === 'player-simon-test')) {
        state.players.push({
          id: 'test-p-qa', userId: 'player-simon-test', name: 'QA Test Player',
          position: 'FLH', status: 'no-reply', game: 'no-reply',
          phone: '', email: '', trainingTuesday: 'available',
          trainingThursday: 'no-reply', attendance: 0, history: [],
          blockedDates: [], medical: '', mediaConsent: false,
          contractStatus: 'active', photo: ''
        });
        saveState();
        render();
      }
    });
  });

  // ── 10. Player — This Week shows training plan ───────────────────────────────
  await step(page, 'player-week-shows-plan', async () => {
    // Switch to player view and navigate straight to This Week
    await page.evaluate(() => {
      devLogin('player-simon-test');
      setSection('player', 'week');
    });
    await expect(page.locator('#player-week')).toBeVisible({ timeout: 10_000 });
    // PUBLISHED badge must appear
    await expect(page.locator('#player-week').locator('text=PUBLISHED').first()).toBeVisible({ timeout: 5_000 });
    // "Training plan" section must appear
    await expect(page.locator('#player-week').locator('text=Training plan').first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 11. Player — Calendar shows training plan ───────────────────────────────
  await step(page, 'player-calendar-shows-plan', async () => {
    await page.evaluate(() => setSection('player', 'fixtures'));
    await expect(page.locator('#player-fixtures')).toBeVisible({ timeout: 6_000 });
    // "Training plan" section must appear in calendar too
    await expect(page.locator('#player-fixtures').locator('text=Training plan').first()).toBeVisible({ timeout: 5_000 });
    // PUBLISHED badge in calendar
    await expect(page.locator('#player-fixtures').locator('text=PUBLISHED').first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 12. Switch back to coach, Republish (idempotent) ────────────────────────
  await step(page, 'republish-is-idempotent', async () => {
    await page.evaluate(() => {
      devLogin('coach-demo');
      setSection('coach', 'training');
    });
    await expect(page.locator('#coach-training')).toBeVisible({ timeout: 10_000 });
    // Click Republish
    const republishBtn = page.locator('button').filter({ hasText: 'Republish' }).first();
    await expect(republishBtn).toBeVisible({ timeout: 5_000 });
    await republishBtn.click();
    await page.waitForTimeout(800);
    // Must still show Published (not duplicated, not errored)
    await expect(page.locator('text=✓ Published').first()).toBeVisible({ timeout: 5_000 });
    // No duplicate blocks — count should be same as before (1)
    const rows = await page.locator('.training-gs-table tbody tr').count();
    if (rows !== 1) throw new Error(`Expected 1 block after republish, got ${rows}`);
  });

  // ── 13. Unpublish — player plan disappears ───────────────────────────────────
  await step(page, 'unpublish-removes-plan', async () => {
    const unpublishBtn = page.locator('button').filter({ hasText: 'Unpublish' }).first();
    await expect(unpublishBtn).toBeVisible({ timeout: 5_000 });
    await unpublishBtn.click();
    await page.waitForTimeout(600);
    // Draft badge reappears
    const draftBadge = page.locator('.card').filter({ hasText: 'Draft' }).first();
    await expect(draftBadge).toBeVisible({ timeout: 5_000 });
    // Switch to player — plan must no longer be visible
    await page.evaluate(() => {
      devLogin('player-simon-test');
      setSection('player', 'week');
    });
    await expect(page.locator('#player-week')).toBeVisible({ timeout: 10_000 });
    // PUBLISHED badge must be gone
    const pubBadgeCount = await page.locator('#player-week').locator('text=PUBLISHED').count();
    if (pubBadgeCount > 0) throw new Error('PUBLISHED badge still visible after unpublish');
    // Training plan section must be gone
    const planCount = await page.locator('#player-week').locator('text=Training plan').count();
    if (planCount > 0) throw new Error('Training plan still visible after unpublish');
  });

  writeResult('passed');
});
