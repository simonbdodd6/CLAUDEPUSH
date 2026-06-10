/**
 * Squad Publish Workflow — smoke test
 *
 * Verifies the complete coach → player squad publish workflow:
 *   1. Coach enters match details (opposition, venue, kickoff)
 *   2. Coach types a team announcement
 *   3. Coach assigns a player to a formation slot
 *   4. Coach publishes the squad
 *   5. Match Centre header shows "✓ Squad Published"
 *   6. Player Availability section shows the published team sheet
 *   7. Player's squad status is shown (starting / bench / not selected)
 *   8. Team announcement is visible to the player
 *   9. Player "This Week" shows the squad published banner
 *  10. Coach Home shows Squad Published badge
 *  11. New Week button is present in Match Centre after publish
 *  12. New Week resets all state — player sees no team sheet
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openApp, coachLogin, installToastCapture } from '../helpers/shared-steps.js';

const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `squad-publish-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/squad-publish.json');

const config = {
  baseURL:       process.env.QA_BASE_URL       || 'http://127.0.0.1:3000',
  coachEmail:    process.env.QA_COACH_EMAIL    || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',
};

const result = {
  workflow:   'squad-publish',
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

test('Squad publish + New Week — full workflow smoke test', async ({ page }) => {
  ensureDirs();
  installToastCapture(page);

  // ── 1. Login and seed a test player ─────────────────────────────────────────
  await step(page, 'open-app',    () => openApp(page));
  await step(page, 'coach-login', () => coachLogin(page, config, result));

  await step(page, 'seed-test-player', async () => {
    await page.evaluate(() => {
      if (!state.players.find(p => p.userId === 'player-simon-test')) {
        state.players.push({
          id: 'test-p-squad', userId: 'player-simon-test', name: 'QA Test Player',
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

  // ── 2. Navigate to Match Centre and set match details ───────────────────────
  await step(page, 'navigate-to-match-centre', async () => {
    await page.evaluate(() => setSection('coach', 'matchday'));
    await expect(page.locator('#coach-matchday')).toBeVisible({ timeout: 8_000 });
  });

  await step(page, 'enter-match-details', async () => {
    // Enter opposition using the first text input in the Match details form
    const oppInput = page.locator('#coach-matchday input[type="text"]').first();
    await oppInput.fill('Test Opponent RFC');
    await oppInput.dispatchEvent('change');
    await page.waitForTimeout(400);
  });

  await step(page, 'enter-team-announcement', async () => {
    // Find the team announcement textarea
    const announceTa = page.locator('#coach-matchday textarea').filter({ hasText: '' }).nth(1);
    await announceTa.fill('Great work this week — let\'s finish strong. Pride on the line.');
    await announceTa.dispatchEvent('change');
    await page.waitForTimeout(400);
  });

  // ── 3. Assign a player to slot 7 via state (avoids complex drag-drop UI) ────
  await step(page, 'assign-player-to-slot', async () => {
    await page.evaluate(() => {
      setFormationName('7', 'QA Test Player');
      saveState();
      render();
    });
    await page.waitForTimeout(400);
  });

  // ── 4. Publish the squad ─────────────────────────────────────────────────────
  await step(page, 'publish-squad', async () => {
    const publishBtn = page.locator('.mc-publish-btn');
    await expect(publishBtn).toBeVisible({ timeout: 5_000 });
    await publishBtn.click();
    await page.waitForTimeout(600);
    // Button should now show "✓ Squad Published"
    await expect(page.locator('.mc-publish-btn.published')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.mc-publish-btn')).toContainText('Squad Published', { timeout: 5_000 });
  });

  // ── 5. Match Centre shows New Week button after publish ──────────────────────
  await step(page, 'new-week-btn-in-mc', async () => {
    const newWeekBtn = page.locator('#coach-matchday button').filter({ hasText: 'New Week' }).first();
    await expect(newWeekBtn).toBeVisible({ timeout: 5_000 });
  });

  // ── 6. Coach Home shows Squad Published badge ────────────────────────────────
  await step(page, 'home-shows-squad-published', async () => {
    await page.evaluate(() => setSection('coach', 'overview'));
    await expect(page.locator('#coach-overview')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('#coach-overview').locator('text=Squad Published').first()).toBeVisible({ timeout: 5_000 });
    // New Week button is present in home match card footer
    const newWeekHome = page.locator('#coach-overview button').filter({ hasText: 'New Week' }).first();
    await expect(newWeekHome).toBeVisible({ timeout: 5_000 });
  });

  // ── 7. Player Availability shows published team sheet ────────────────────────
  await step(page, 'player-sees-team-sheet', async () => {
    await page.evaluate(() => {
      devLogin('player-simon-test');
      setSection('player', 'availability');
    });
    await expect(page.locator('#player-availability')).toBeVisible({ timeout: 10_000 });
    // "Squad Published" badge must be in the team sheet card
    await expect(page.locator('#player-availability').locator('text=Squad Published').first()).toBeVisible({ timeout: 5_000 });
    // Player's own squad status is shown
    await expect(
      page.locator('#player-availability').locator('text=Starting 15').or(
        page.locator('#player-availability').locator('text=Bench')
      ).or(
        page.locator('#player-availability').locator('text=Not selected')
      ).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 8. Team announcement is visible to player ────────────────────────────────
  await step(page, 'player-sees-announcement', async () => {
    await expect(
      page.locator('#player-availability').locator('text=Great work this week').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 9. Player "This Week" shows squad published banner ───────────────────────
  await step(page, 'player-week-shows-squad-banner', async () => {
    await page.evaluate(() => setSection('player', 'week'));
    await expect(page.locator('#player-week')).toBeVisible({ timeout: 6_000 });
    await expect(page.locator('#player-week').locator('text=Squad published').first()).toBeVisible({ timeout: 5_000 });
    // Banner has "View team sheet →" button
    const viewBtn = page.locator('#player-week button').filter({ hasText: 'View team sheet' }).first();
    await expect(viewBtn).toBeVisible({ timeout: 5_000 });
  });

  // ── 10. New Week clears squad — player no longer sees team sheet ──────────────
  await step(page, 'new-week-clears-squad', async () => {
    // Switch back to coach, trigger New Week (auto-dismiss confirm via dialog handler)
    page.once('dialog', d => d.accept());
    await page.evaluate(() => {
      devLogin('coach-demo');
      setSection('coach', 'matchday');
    });
    await expect(page.locator('#coach-matchday')).toBeVisible({ timeout: 10_000 });
    const newWeekBtn = page.locator('#coach-matchday button').filter({ hasText: 'New Week' }).first();
    await expect(newWeekBtn).toBeVisible({ timeout: 5_000 });
    await newWeekBtn.click();
    await page.waitForTimeout(800);
    // Squad should be unpublished — button back to "Publish Squad"
    await expect(page.locator('.mc-publish-btn.draft')).toBeVisible({ timeout: 5_000 });
  });

  // ── 11. Player no longer sees team sheet after New Week ──────────────────────
  await step(page, 'player-no-team-sheet-after-new-week', async () => {
    await page.evaluate(() => {
      devLogin('player-simon-test');
      setSection('player', 'availability');
    });
    await expect(page.locator('#player-availability')).toBeVisible({ timeout: 10_000 });
    // Squad Published badge must be gone
    const pubCount = await page.locator('#player-availability').locator('text=Squad Published').count();
    if (pubCount > 0) throw new Error('Squad Published badge still visible after New Week');
    // Squad published banner in This Week must be gone
    await page.evaluate(() => setSection('player', 'week'));
    await expect(page.locator('#player-week')).toBeVisible({ timeout: 6_000 });
    const bannerCount = await page.locator('#player-week').locator('text=Squad published').count();
    if (bannerCount > 0) throw new Error('Squad published banner still visible in This Week after New Week');
  });

  writeResult('passed');
});
