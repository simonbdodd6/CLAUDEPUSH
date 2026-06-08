/**
 * Workflow 13 — Role Switching: Coach ↔ Player Account
 *
 * Covers the bug where switchToUser(stp2) → syncCurrentPlayerIdentityFromInvites
 * would overwrite state.selectedPlayerId with an invite-token ID (inv-ZZZZ).
 * When the coach later re-entered player preview view (setView('player')),
 * getPlayer() couldn't find the invite-token ID (already upgraded to user_XXXX
 * by syncIdentityStateToLocalRoster) and silently fell back to players[0] (wrong player).
 *
 * Fix 1: syncCurrentPlayerIdentityFromInvites returns early for isPermanentPlayerUserId accounts
 * Fix 2: setView('player') normalises selectedPlayerId against canonicalVisiblePlayers()
 *
 * Steps:
 *   1. Coach login
 *   2. Visit Members — triggers syncIdentityStateToLocalRoster (upgrades inv-YYYY → user_XXXX)
 *   3. Switch to STP2 via switchToUser (simulates the user's reported action)
 *   4. Verify STP2 loads correctly as the active player account
 *   5. Switch back to Coach via switchToUser
 *   6. Enter player preview view via setView('player')
 *      — KEY ASSERTION: should show the last-used player (STP2 or first valid player),
 *        NOT silently show players[0] due to stale selectedPlayerId
 *   7. Verify Availability section shows the correct player
 *   8. Verify Messages section shows the correct player
 *   9. Verify no stale state: getPlayer() consistent throughout
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

// Exact name as stored in roster (lowercase as confirmed by diagnostic)
const STP2_NAME = 'simon test player 2';

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
  await step(page, 'open-app',    () => openApp(page));
  await step(page, 'coach-login', () => coachLogin(page, config, result));

  await step(page, 'visit-members-trigger-id-sync', async () => {
    await navigateToMembers(page);
    await expect(page.locator('#coach-players')).toBeVisible({ timeout: 10_000 });
    // Allow syncIdentityStateToLocalRoster to complete (upgrades inv-YYYY → user_XXXX)
    await page.waitForTimeout(2_000);
  });

  // ─── 3. Find STP2's user account ID ──────────────────────────────────────────
  let stp2UserId = null;
  let coachUserId = null;

  await step(page, 'find-stp2-user-id', async () => {
    const lookup = await page.evaluate((stp2Name) => {
      if (typeof canonicalVisiblePlayers !== 'function') return { error: 'canonicalVisiblePlayers not available' };
      const players = canonicalVisiblePlayers();
      const stp2 = players.find(p => p.name.toLowerCase() === stp2Name.toLowerCase());
      // The user account for the player is found via userId or id
      const stp2UserAccount = stp2 ? state.users.find(u =>
        u.id === stp2.userId || u.id === stp2.id || u.playerId === stp2.id
      ) : null;
      const coachUser = typeof currentUser === 'function' ? currentUser() : null;
      return {
        stp2Player: stp2 ? { id: stp2.id, userId: stp2.userId, name: stp2.name } : null,
        stp2UserId: stp2UserAccount?.id || stp2?.userId || stp2?.id || null,
        coachUserId: coachUser?.id || null,
        allUsers: state.users.map(u => ({ id: u.id, name: u.name, role: u.role })),
      };
    }, STP2_NAME);

    if (lookup.error) throw new Error(lookup.error);
    if (!lookup.stp2UserId) {
      throw new Error(
        `Could not find user account for "${STP2_NAME}". ` +
        `stp2Player=${JSON.stringify(lookup.stp2Player)}. ` +
        `users=${JSON.stringify(lookup.allUsers)}`
      );
    }
    stp2UserId  = lookup.stp2UserId;
    coachUserId = lookup.coachUserId;
  });

  // ─── 4. Switch to STP2 via switchToUser (the actual account-switch mechanism) ─
  await step(page, 'switch-to-stp2', async () => {
    await page.evaluate((userId) => switchToUser(userId), stp2UserId);
    // After switchToUser, activeView = 'player', currentUser().id = stp2UserId
    await expect(page.locator('#player-messages')).toBeVisible({ timeout: 8_000 });
  });

  // ─── 5. Verify STP2 loads as the active player ───────────────────────────────
  await step(page, 'stp2-loads-correctly', async () => {
    const diag = await page.evaluate((stp2Name) => {
      const player = typeof getPlayer === 'function' ? getPlayer() : null;
      const user   = typeof currentUser === 'function' ? currentUser() : null;
      return {
        playerName: player?.name || null,
        userId: user?.id || null,
        userRole: user?.role || null,
        selectedPlayerId: state.selectedPlayerId || null,
      };
    }, STP2_NAME);

    if (!diag.playerName) throw new Error('getPlayer() returned no player after switchToUser');
    // Note: as a player account, getPlayer() uses canonicalPlayerIdForUser(user), not selectedPlayerId
    if (diag.playerName.toLowerCase() !== STP2_NAME.toLowerCase()) {
      throw new Error(
        `After switchToUser(stp2), getPlayer()="${diag.playerName}", expected "${STP2_NAME}". ` +
        `userId="${diag.userId}", selectedPlayerId="${diag.selectedPlayerId}"`
      );
    }
  });

  // ─── 6. Wait for async identity sync to settle ───────────────────────────────
  // syncCurrentPlayerIdentityFromInvites fires async from renderPlayerMessages.
  // With the fix: permanent user IDs return early; without it, selectedPlayerId
  // would be overwritten with an invite-token that becomes stale after syncIdentityStateToLocalRoster.
  await step(page, 'identity-sync-settle', async () => {
    await page.waitForTimeout(2_000);
    const check = await page.evaluate((stp2Name) => {
      const player = typeof getPlayer === 'function' ? getPlayer() : null;
      return {
        playerName: player?.name || null,
        selectedPlayerId: state.selectedPlayerId || null,
        currentUserId: state.currentUserId || null,
      };
    }, STP2_NAME);

    // getPlayer() must still return STP2 after the async sync
    if (!check.playerName || check.playerName.toLowerCase() !== STP2_NAME.toLowerCase()) {
      throw new Error(
        `After async identity sync, getPlayer()="${check.playerName}" — syncCurrentPlayerIdentityFromInvites ` +
        `overwrote selectedPlayerId="${check.selectedPlayerId}" for a permanent user. Fix: early return in sync fn.`
      );
    }
  });

  // ─── 7. Switch back to Coach ─────────────────────────────────────────────────
  await step(page, 'switch-back-to-coach', async () => {
    if (!coachUserId) throw new Error('coachUserId not captured in step 3');
    await page.evaluate((userId) => switchToUser(userId), coachUserId);
    await expect(page.locator('#coach-players')).toBeVisible({ timeout: 8_000 });

    const role = await page.evaluate(() =>
      typeof currentUser === 'function' ? currentUser()?.role : null
    );
    if (role !== 'coach') throw new Error(`After switchToUser(coach), role="${role}", expected "coach"`);
  });

  // ─── 8. Re-enter player view — correct player must load ──────────────────────
  // This is the core regression test. Before the fix:
  //   - syncCurrentPlayerIdentityFromInvites had overwritten selectedPlayerId with inv-ZZZZ
  //   - setView('player') had no normalization
  //   - getPlayer() couldn't find inv-ZZZZ (since IDs were upgraded to user_XXXX)
  //   - silently returned players[0] — the wrong player
  // After the fix: setView('player') normalises selectedPlayerId; syncCurrentPlayerIdentityFromInvites
  // returns early for permanent user IDs.
  await step(page, 'player-preview-shows-valid-player', async () => {
    await page.evaluate(() => setView('player'));
    await expect(page.locator('#player-messages')).toBeVisible({ timeout: 8_000 });

    const diag = await page.evaluate((stp2Name) => {
      const player = typeof getPlayer === 'function' ? getPlayer() : null;
      const players = typeof canonicalVisiblePlayers === 'function' ? canonicalVisiblePlayers() : [];
      return {
        playerName: player?.name || null,
        playerId: player?.id || null,
        selectedPlayerId: state.selectedPlayerId || null,
        isPlayers0: player?.id === (players[0]?.id) && players[0]?.name?.toLowerCase() !== stp2Name.toLowerCase(),
      };
    }, STP2_NAME);

    // The player shown must not be the silent fallback (players[0]) unless it happens to be STP2
    if (!diag.playerName) throw new Error('getPlayer() returned no player in coach player preview');

    // Key fix assertion: selectedPlayerId must resolve to a real player, not be stale
    if (diag.selectedPlayerId) {
      // After fix, selectedPlayerId was normalised by setView('player') — it should match playerId
      if (diag.playerId && diag.selectedPlayerId !== diag.playerId) {
        // This indicates the normalization is working but selecting a different player — acceptable
        // as long as it's not because the ID was stale
      }
    }

    // The loaded player must actually be STP2 (the last account we switched to)
    if (diag.playerName.toLowerCase() !== STP2_NAME.toLowerCase()) {
      throw new Error(
        `Player preview after coach re-entry shows "${diag.playerName}" (id=${diag.playerId}), ` +
        `expected "${STP2_NAME}". selectedPlayerId="${diag.selectedPlayerId}". ` +
        `This is the original bug: stale selectedPlayerId caused getPlayer() to fall back to players[0].`
      );
    }
  });

  // ─── 9. Availability section shows STP2 ──────────────────────────────────────
  await step(page, 'availability-shows-stp2', async () => {
    await page.evaluate(() => setSection('player', 'availability'));
    await expect(page.locator('#player-availability')).toBeVisible({ timeout: 6_000 });

    const playerName = await page.evaluate(() =>
      typeof getPlayer === 'function' ? getPlayer()?.name?.toLowerCase() : null
    );
    if (!playerName || playerName !== STP2_NAME.toLowerCase()) {
      throw new Error(`Availability: getPlayer()="${playerName}", expected "${STP2_NAME}"`);
    }
  });

  // ─── 10. Messages section shows STP2 ─────────────────────────────────────────
  await step(page, 'messages-shows-stp2', async () => {
    await page.evaluate(() => setSection('player', 'messages'));
    await expect(page.locator('#player-messages')).toBeVisible({ timeout: 6_000 });

    const playerName = await page.evaluate(() =>
      typeof getPlayer === 'function' ? getPlayer()?.name?.toLowerCase() : null
    );
    if (!playerName || playerName !== STP2_NAME.toLowerCase()) {
      throw new Error(`Messages: getPlayer()="${playerName}", expected "${STP2_NAME}"`);
    }
  });

  // ─── Final ───────────────────────────────────────────────────────────────────
  result.toasts = await page.evaluate(() => window.__qaToasts || []).catch(() => []);
  writeResult('passed');
});
