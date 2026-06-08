/**
 * Workflow 12 — Squad Selection + Matchday Publish
 *
 * Tests the matchday selection workflow:
 *   Fill slots 10 & 15 + bench slot 0 via setFormationName/setBenchPlayer →
 *   Save → Navigate away and back → Verify persistence →
 *   Publish → Verify "Last published" text + state._matchdayPublishedAt set →
 *   Verify player-selection section shows published Starting XV
 *
 * Uses setFormationName() and setBenchPlayer() directly via evaluate()
 * to avoid flaky oninput triggering on text inputs.
 *
 * Stops on first failure. Saves PNG + HTML snapshot at each step.
 * Writes qa/results/workflow-12.json.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openApp, coachLogin, navigateToMembers, redisEstimate } from '../helpers/shared-steps.js';

const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow12-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-12.json');

const config = {
  baseURL:      process.env.QA_BASE_URL      || 'http://127.0.0.1:3000',
  coachEmail:   process.env.QA_COACH_EMAIL   || 'simonbdodd@gmail.com',
  coachPassword: process.env.QA_COACH_PASSWORD || '',
};

const ts        = Date.now();
const slot10Name  = `QA Slot10 ${ts}`;
const slot15Name  = `QA Slot15 ${ts}`;
const bench0Name  = `QA Bench0 ${ts}`;

const result = {
  workflow: 'workflow-12',
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

test('Workflow 12 — Squad Selection + Matchday Publish', async ({ page }) => {
  ensureDirs();

  // Toast collector — wraps showToast() once it's available on window
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
    // Matchday Centre card should be present
    await expect(page.locator('#matchday-pitch')).toBeVisible({ timeout: 8_000 });
  });

  // ─── 3. Fill slots via app functions ────────────────────────────────────────
  await step(page, 'fill-squad-slots', async () => {
    const ok = await page.evaluate(({ s10, s15, b0 }) => {
      if (typeof setFormationName !== 'function') return { ok: false, error: 'setFormationName not found' };
      if (typeof setBenchPlayer  !== 'function') return { ok: false, error: 'setBenchPlayer not found' };
      setFormationName('10', s10);
      setFormationName('15', s15);
      setBenchPlayer(0, b0);
      // setFormationName calls saveState() but not render() — trigger render so DOM reflects the values
      if (typeof render === 'function') render();
      return { ok: true };
    }, { s10: slot10Name, s15: slot15Name, b0: bench0Name });

    if (!ok.ok) throw new Error(ok.error || 'Could not call setFormationName/setBenchPlayer');

    // Verify inputs show the values on the pitch (render() re-generates them from state.formationNames)
    const slot10Input = page.locator('[data-slot="10"] .slot-name-input');
    await expect(slot10Input).toHaveValue(slot10Name, { timeout: 5_000 });
  });

  // ─── 4. Save selection ───────────────────────────────────────────────────────
  await step(page, 'save-selection', async () => {
    await page.locator('#matchday-save-btn').click();

    await expect.poll(
      async () => {
        const toasts = await page.evaluate(() => window.__qaToasts || []);
        result.toasts = toasts;
        return toasts.some(t => /selection saved/i.test(t.text));
      },
      { timeout: 10_000, message: 'Toast "Selection saved ✓" should appear after save' }
    ).toBeTruthy();
  });

  // ─── 5. API confirms save ────────────────────────────────────────────────────
  await step(page, 'api-verify-save', async () => {
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/matchday');
      return res.json().catch(() => ({}));
    });
    if (!data.selection) throw new Error('GET /api/matchday returned no selection');
    const slot10 = data.selection.slots?.['10'];
    if (slot10 !== slot10Name) throw new Error(`Expected slot 10="${slot10Name}", got "${slot10}"`);
    const bench0 = data.selection.bench?.[0];
    if (bench0 !== bench0Name) throw new Error(`Expected bench[0]="${bench0Name}", got "${bench0}"`);
  });

  // ─── 6. Navigate away and back — verify persistence ─────────────────────────
  await step(page, 'navigate-away-and-back', async () => {
    // Navigate to Members
    await navigateToMembers(page);
    await expect(page.locator('#coach-players')).toBeVisible({ timeout: 8_000 });

    // Navigate back to Matchday
    await page.getByRole('button', { name: /Matchday/i }).click();
    await expect(page.locator('#matchday-pitch')).toBeVisible({ timeout: 10_000 });
  });

  await step(page, 'verify-persistence-after-reload', async () => {
    // The slot inputs should show the persisted names (loaded via loadMatchdaySelection)
    const slot10Val = await page.locator('[data-slot="10"] .slot-name-input').inputValue({ timeout: 5_000 });
    if (slot10Val !== slot10Name) {
      throw new Error(`Slot 10 did not persist. Expected "${slot10Name}", got "${slot10Val}"`);
    }
    // Bench slot 0 input
    const bench0Val = await page.locator('.bench-slot input').first().inputValue({ timeout: 3_000 });
    if (bench0Val !== bench0Name) {
      throw new Error(`Bench 0 did not persist. Expected "${bench0Name}", got "${bench0Val}"`);
    }
  });

  // ─── 7. Publish to squad ─────────────────────────────────────────────────────
  await step(page, 'publish-to-squad', async () => {
    await page.locator('#matchday-publish-btn').click();

    await expect.poll(
      async () => {
        const toasts = await page.evaluate(() => window.__qaToasts || []);
        result.toasts = toasts;
        return toasts.some(t => /published/i.test(t.text));
      },
      { timeout: 15_000, message: 'Toast "Selection published" should appear after publish' }
    ).toBeTruthy();
  });

  // ─── 8. Verify published state in UI ────────────────────────────────────────
  await step(page, 'verify-published-state', async () => {
    // "Last published" timestamp should appear below the pitch export bar
    await expect(page.locator('#coach-matchday')).toContainText('Last published', { timeout: 8_000 });
  });

  // ─── 9. API confirms publish ─────────────────────────────────────────────────
  await step(page, 'api-verify-publish', async () => {
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/matchday');
      return res.json().catch(() => ({}));
    });
    if (!data.selection?.publishedAt) throw new Error('GET /api/matchday: publishedAt not set after publish');
    const slot10 = data.selection.slots?.['10'];
    if (slot10 !== slot10Name) throw new Error(`Published slot 10 mismatch: expected "${slot10Name}", got "${slot10}"`);
  });

  // ─── 10. Player-selection section shows published board ─────────────────────
  await step(page, 'player-selection-shows-published', async () => {
    // Switch to player view on the same page to read the player-selection section
    // This verifies renderPlayerSelection() renders the published XV correctly.
    await page.evaluate(() => {
      if (typeof setSection === 'function') setSection('player', 'selection');
    });

    const selectionEl = page.locator('#player-selection');
    await expect(selectionEl).toBeVisible({ timeout: 5_000 });

    // Should NOT show "Team not yet selected" since we just published
    const text = await selectionEl.textContent({ timeout: 3_000 });
    if (/Team not yet selected/i.test(text)) {
      throw new Error('#player-selection shows "Team not yet selected" even though selection was published');
    }

    // Should show "Starting XV"
    await expect(selectionEl).toContainText('Starting XV', { timeout: 3_000 });

    // Slot 10 name should appear in the board
    await expect(selectionEl).toContainText(slot10Name, { timeout: 3_000 });
  });

  // ─── Final ───────────────────────────────────────────────────────────────────
  result.toasts = await page.evaluate(() => window.__qaToasts || []).catch(() => []);
  writeResult('passed');
});
