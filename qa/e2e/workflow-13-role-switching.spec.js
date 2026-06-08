/**
 * Workflow 13 — Role Switching: Coach ↔ Player
 *
 * Covers the bug where switching Coach → Player → select specific player
 * would show the wrong account due to stale selectedPlayerId (inv-YYYY IDs
 * becoming stale after syncIdentityStateToLocalRoster upgrades them to user_XXXX).
 *
 * Steps:
 *   1. Coach login
 *   2. Visit Members (triggers syncIdentityStateToLocalRoster — upgrades player IDs)
 *   3. Enter Player view (setView('player') must normalize selectedPlayerId)
 *   4. Verify dropdown shows the correct selected player
 *   5. Select "Simon Test Player 2" from dropdown → verify correct profile loads
 *   6. Navigate to Availability — verify data belongs to selected player
 *   7. Navigate to Messages — verify correct player identity
 *   8. Switch back to Coach view — no stale profile survives
 *   9. Re-enter Player view — correct player still shown (no regression)
 *
 * Writes qa/results/workflow-13.json.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openApp, coachLogin, navigateToMembers } from '../helpers/shared-steps.js';

const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow13-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-13.json');

const config = {
  baseURL:       process.env.QA_BASE_URL       || 'http://127.0.0.1:3000',
  coachEmail:    process.env.QA_COACH_EMAIL    || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',
};

const STP2_NAME = 'Simon Test Player 2';

const result = {
  workflow: 'workflow-13',
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

test('Workflow 13 — Role Switching Coach ↔ Player', async ({ page }) => {
  ensureDirs();

  await page.addInitScript(() => {
    window.__qaToasts = [];
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

  // ─── 1–2. Login + visit Members to trigger syncIdentityStateToLocalRoster ────
  await step(page, 'open-app',     () => openApp(page));
  await step(page, 'coach-login',  () => coachLogin(page, config, result));

  await step(page, 'visit-members-to-trigger-id-sync', async () => {
    await navigateToMembers(page);
    await expect(page.locator('#coach-players')).toBeVisible({ timeout: 10_000 });
    // Wait for member data to load — the player list should appear
    await page.waitForTimeout(1_500);
  });

  // ─── 3. Enter Player view ─────────────────────────────────────────────────────
  await step(page, 'enter-player-view', async () => {
    await page.evaluate(() => setView('player'));
    // Default activePlayerSection is 'messages'; all sections are always in the DOM,
    // only the active one has class 'section active' and is visible.
    await expect(page.locator('#player-messages')).toBeVisible({ timeout: 8_000 });
  });

  // ─── 4. Dropdown shows a valid selected player ────────────────────────────────
  await step(page, 'dropdown-selected-player-valid', async () => {
    // The player profile dropdown must have a selected option that reflects the actual player shown.
    // Before the fix, selectedPlayerId was stale (inv-YYYY) — no option was selected, browser picked [0].
    const selectedName = await page.evaluate(() => {
      const sel = document.querySelector('label select');
      if (!sel) return null;
      const opt = sel.options[sel.selectedIndex];
      return opt ? opt.text : null;
    });
    if (!selectedName) throw new Error('No player dropdown found in player view');
    if (!selectedName.trim()) throw new Error('Selected option has empty text — stale selectedPlayerId bug still present');

    // The name shown in the input must match the dropdown selection
    const profileName = await page.evaluate(() => {
      // getPlayer().name — read from the disabled input or h2 heading
      const disabled = document.querySelector('label input[disabled]');
      if (disabled) return disabled.value;
      // fallback: read player name from UI
      const h2 = document.querySelector('#player-week h2, #player-messages h2');
      return h2 ? h2.textContent.trim() : null;
    });
    // Both sources should name the same player
    if (profileName && profileName !== selectedName) {
      throw new Error(`Dropdown says "${selectedName}" but profile shows "${profileName}" — visual/state mismatch`);
    }
  });

  // ─── 5. Select Simon Test Player 2 → correct profile loads ───────────────────
  await step(page, 'select-stp2', async () => {
    // Find STP2 in the player list and set selectedPlayerId to that player's id
    const stp2Id = await page.evaluate((name) => {
      if (typeof canonicalVisiblePlayers !== 'function') return null;
      const players = canonicalVisiblePlayers();
      const p = players.find(pl => pl.name === name);
      return p ? p.id : null;
    }, STP2_NAME);

    if (!stp2Id) throw new Error(`"${STP2_NAME}" not found in canonicalVisiblePlayers()`);

    // Select via dropdown onchange (mirrors real user interaction)
    await page.evaluate((id) => {
      const sel = document.querySelector('label select');
      if (!sel) throw new Error('Player selector dropdown not found');
      sel.value = id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, stp2Id);

    // After render(), the selected option and profile should both name STP2
    await expect.poll(async () => {
      return page.evaluate((name) => {
        const sel = document.querySelector('label select');
        if (!sel) return false;
        const opt = sel.options[sel.selectedIndex];
        return opt && opt.text === name;
      }, STP2_NAME);
    }, { timeout: 5_000, message: `Dropdown should show "${STP2_NAME}" as selected` }).toBeTruthy();
  });

  // ─── 6. Verify getPlayer() resolves to STP2 ──────────────────────────────────
  await step(page, 'getplayer-resolves-stp2', async () => {
    const resolvedName = await page.evaluate(() => {
      if (typeof getPlayer !== 'function') return null;
      return getPlayer()?.name || null;
    });
    if (resolvedName !== STP2_NAME) {
      throw new Error(`getPlayer() returned "${resolvedName}", expected "${STP2_NAME}" — wrong player loaded`);
    }
  });

  // ─── 7. Availability section shows STP2 ──────────────────────────────────────
  await step(page, 'availability-section-stp2', async () => {
    await page.evaluate(() => setSection('player', 'availability'));
    await expect(page.locator('#player-availability')).toBeVisible({ timeout: 6_000 });

    const resolvedName = await page.evaluate(() =>
      typeof getPlayer === 'function' ? getPlayer()?.name : null
    );
    if (resolvedName !== STP2_NAME) {
      throw new Error(`Availability: getPlayer()="${resolvedName}", expected "${STP2_NAME}"`);
    }
  });

  // ─── 8. Messages section shows STP2 ──────────────────────────────────────────
  await step(page, 'messages-section-stp2', async () => {
    await page.evaluate(() => setSection('player', 'messages'));
    await expect(page.locator('#player-messages')).toBeVisible({ timeout: 6_000 });

    const resolvedName = await page.evaluate(() =>
      typeof getPlayer === 'function' ? getPlayer()?.name : null
    );
    if (resolvedName !== STP2_NAME) {
      throw new Error(`Messages: getPlayer()="${resolvedName}", expected "${STP2_NAME}"`);
    }
  });

  // ─── 9. Switch back to Coach view ────────────────────────────────────────────
  await step(page, 'switch-back-to-coach', async () => {
    await page.evaluate(() => setView('coach'));
    // We navigated to Members earlier, so activeCoachSection = 'players'
    await expect(page.locator('#coach-players')).toBeVisible({ timeout: 6_000 });

    // currentUser().role must be 'coach' still (we haven't called switchToUser)
    const role = await page.evaluate(() =>
      typeof currentUser === 'function' ? currentUser()?.role : null
    );
    if (role !== 'coach') throw new Error(`After setView('coach'), role="${role}", expected "coach"`);
  });

  // ─── 10. Re-enter Player view — STP2 still selected ─────────────────────────
  await step(page, 're-enter-player-view-stp2-persists', async () => {
    await page.evaluate(() => setView('player'));
    // activePlayerSection stays 'messages' from step 8
    await expect(page.locator('#player-messages')).toBeVisible({ timeout: 8_000 });

    const resolvedName = await page.evaluate(() =>
      typeof getPlayer === 'function' ? getPlayer()?.name : null
    );
    // After fix, setView('player') normalizes selectedPlayerId so STP2 is still shown
    if (resolvedName !== STP2_NAME) {
      throw new Error(`After re-entering player view, getPlayer()="${resolvedName}", expected "${STP2_NAME}" — stale ID bug still present`);
    }
  });

  // ─── Final ───────────────────────────────────────────────────────────────────
  result.toasts = await page.evaluate(() => window.__qaToasts || []).catch(() => []);
  writeResult('passed');
});
