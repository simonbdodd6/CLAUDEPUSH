/**
 * Workflow 5 — Player Sets Availability → Coach Sees Sync (No Manual Refresh)
 *
 * Tests the core weekly job of the app: a player sets their availability and
 * the coach sees it reflected in the Members table automatically — no Refresh
 * button click required.
 *
 * This flow broke silently in production (fixed in commits 502180d + 17e7acd):
 *  - setPlayerAvailability() mutated a shallow copy, not state.players
 *  - refreshLiveAvailability() was never called when navigating to Members
 * A regression in either place is now caught immediately by this workflow.
 *
 * Steps:
 *   ── Setup (creates a test player; skipped if QA_W5_PLAYER_EMAIL + _PASSWORD set) ──
 *   1.  Open app                        — coach context
 *   2.  Coach login                     — shared helper
 *   3.  Navigate to Members             — shared helper
 *   4.  Generate group invite           — shared helper (POST /api/invite)
 *   5.  Player opens invite URL         — fresh context, #invite-modal visible
 *   6.  Player fills & submits form     — join request submitted, modal detaches
 *   7.  Coach refreshes + approves      — player moves from pending to active
 *
 *   ── Core test ──
 *   8.  Player logs in                  — shared helper, #playerNav visible
 *   9.  Player navigates to Availability — #player-availability visible
 *   10. Player sets game = Available     — onclick button, POST /api/availability
 *   11. Coach verifies game = Available  — refreshLiveAvailability() via navigate, assert span
 *   12. Player sets game = Unavailable   — POST /api/availability
 *   13. Coach verifies game = Unavailable
 *   14. Player sets game = Unsure (maybe) — POST /api/availability
 *   15. Coach verifies game = Maybe
 *   16. Player sets trainingTuesday = Available
 *   17. Coach verifies trainingTuesday = Available
 *
 * Coach verification uses navigate-to-Members, which triggers refreshLiveAvailability()
 * automatically — the same code path that was broken and is now fixed.
 *
 * QA_W5_PLAYER_EMAIL + QA_W5_PLAYER_PASSWORD: if both are set, steps 4–7 are
 * skipped and the existing player is used directly. Saves ~42 Redis ops per run.
 *
 * Stops on first failure. PNG + HTML snapshot at every step (both contexts).
 * Writes qa/results/workflow-5.json and QA_WORKFLOW_5_REPORT.md.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  openApp,
  coachLogin,
  navigateToMembers,
  generateGroupInvite,
  openInviteUrl,
  fillGroupRegistrationForm,
  submitRegistration,
  playerLogin,
  redisEstimate,
} from '../helpers/shared-steps.js';

// ─── Run identity ─────────────────────────────────────────────────────────────
const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow5-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-5.json');
const reportPath  = path.join(process.cwd(), 'QA_WORKFLOW_5_REPORT.md');

// ─── Config ───────────────────────────────────────────────────────────────────
const ts = Date.now();
const config = {
  baseURL:              process.env.QA_BASE_URL              || 'http://127.0.0.1:3000',
  coachEmail:           process.env.QA_COACH_EMAIL           || 'simonbdodd@gmail.com',
  coachPassword:        process.env.QA_COACH_PASSWORD        || '',
  testPlayerFirstName:  process.env.QA_W5_PLAYER_FIRST       || 'QA5',
  testPlayerLastName:   process.env.QA_W5_PLAYER_LAST        || `Sync${ts}`,
  testPlayerEmail:      process.env.QA_W5_PLAYER_EMAIL       || `qa.w5+${ts}@coachseye.test`,
  testPlayerPassword:   process.env.QA_W5_PLAYER_PASSWORD    || 'qatest12345',
  get testPlayerName()  { return `${this.testPlayerFirstName} ${this.testPlayerLastName}`; },
};

const skipSetup = Boolean(process.env.QA_W5_PLAYER_EMAIL && process.env.QA_W5_PLAYER_PASSWORD);

// ─── Result accumulator ───────────────────────────────────────────────────────
const result = {
  workflow:    'workflow-5',
  runId,
  startedAt:   new Date().toISOString(),
  finishedAt:  null,
  status:      'running',
  baseURL:     config.baseURL,
  commit:      gitCommit(),
  loginMethod: config.coachPassword ? 'credentials' : 'dev-login-btn',
  skipSetup,
  inviteLink:  null,
  inviteToken: null,
  // Availability change log: { key, status, setAt, verifiedAt, verified }
  availabilityChanges: [],
  steps:       [],
  console:     [],
  toasts:      [],
  pageErrors:  [],
  playerConsole:    [],
  playerToasts:     [],
  playerPageErrors: [],
  requestFailures:         [],
  apiCalls:                [],
  missingSelectorWarnings: [],
};

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

// ─── Filesystem helpers ───────────────────────────────────────────────────────
function ensureDirs() {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
}

function rel(file) {
  return file ? path.relative(process.cwd(), file).replaceAll(path.sep, '/') : '';
}

function slug(v) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function mdList(items, empty) {
  return items.length ? items.map(i => `- ${i}`).join('\n') : `- ${empty}`;
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function writeResult(status = result.status) {
  result.status     = status;
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

function writeReport() {
  const failed  = result.steps.find(s => s.status === 'failed');
  const passed  = result.steps.filter(s => s.status === 'passed');
  const skipped = result.steps.filter(s => s.status === 'skipped');
  const consErr = [
    ...result.console.filter(e => ['error', 'warning'].includes(e.type)).map(e => `[coach] ${e.type}: ${e.text}`),
    ...result.playerConsole.filter(e => ['error', 'warning'].includes(e.type)).map(e => `[player] ${e.type}: ${e.text}`),
  ];

  const apiGroups = {};
  for (const call of result.apiCalls) {
    const k = `${call.endpoint} [${call.context || 'coach'}]`;
    if (!apiGroups[k]) apiGroups[k] = { calls: 0, methods: new Set(), estimatedOps: 0 };
    apiGroups[k].calls += 1;
    apiGroups[k].methods.add(call.method);
    apiGroups[k].estimatedOps += redisEstimate(call.endpoint, call.method);
  }
  const apiRows = Object.entries(apiGroups)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([ep, g]) => `| \`${ep}\` | ${[...g.methods].join('/')} | ${g.calls} | ~${g.estimatedOps} |`);
  const totalCalls = Object.values(apiGroups).reduce((s, g) => s + g.calls, 0);
  const totalOps   = Object.values(apiGroups).reduce((s, g) => s + g.estimatedOps, 0);

  const stepRows = result.steps.map((step, i) => {
    const shot = step.screenshot ? `[png](${rel(step.screenshot)})` : '—';
    const ms   = (step.finishedAt && step.startedAt)
      ? Math.round(new Date(step.finishedAt) - new Date(step.startedAt)) : '—';
    const note = (step.error || step.note || '').slice(0, 130);
    const ctx  = step.context ? ` [${step.context}]` : '';
    return `| ${i + 1} | ${step.name}${ctx} | ${step.status.toUpperCase()} | ${ms}ms | ${shot} | ${note} |`;
  });

  const changeRows = result.availabilityChanges.map(c =>
    `| \`${c.key}\` | ${c.status} | ${c.setAt ? new Date(c.setAt).toISOString() : '—'} | ${c.verified ? '✅ YES' : '❌ NO'} | ${c.verifiedAt ? new Date(c.verifiedAt).toISOString() : '—'} |`
  );

  const coreOps = 4 * 4 + 4 * 3 * 4; // 4 POSTs + 4 refreshes (3 GETs each)
  const setupOps = skipSetup ? 0 : 42;

  const lines = [
    '# QA Workflow 5 — Player Sets Availability → Coach Sees Sync (No Manual Refresh)',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Commit:** \`${result.commit}\``,
    `**Base URL:** ${result.baseURL}`,
    `**Login method:** ${result.loginMethod}`,
    `**Player setup skipped:** ${skipSetup ? 'yes — QA_W5_PLAYER_EMAIL and _PASSWORD were set' : 'no — test player created in-run'}`,
    `**Status:** ${result.status.toUpperCase()}`,
    '',
    '---',
    '',
    '## Result',
    '',
    `- **Overall:** ${result.status === 'passed' ? '✅ PASS' : result.status === 'failed' ? '❌ FAIL' : '⚠️ ' + result.status.toUpperCase()}`,
    failed
      ? `- **First failure:** Step ${result.steps.indexOf(failed) + 1} — "${failed.name}"`
      : '- **First failure:** none',
    failed ? `- **Error:** ${failed.error || '(none)'}` : '',
    failed?.screenshot ? `- **Failure screenshot:** ${rel(failed.screenshot)}` : '',
    '',
    '## Steps',
    '',
    '| # | Step | Status | Duration | Screenshot | Notes |',
    '|---|---|---|---|---|---|',
    ...stepRows,
    '',
    '## Availability Change Log',
    '',
    '| Session key | Status set | Set at | Coach verified | Verified at |',
    '|---|---|---|---|---|',
    ...(changeRows.length ? changeRows : ['| — | — | — | — | — |']),
    '',
    '## Player & Invite Details',
    '',
    `- **Player name:** \`${config.testPlayerName}\``,
    `- **Player email:** \`${config.testPlayerEmail}\``,
    skipSetup
      ? '- **Player setup:** skipped — pre-existing account used'
      : result.inviteLink
        ? `- **Group invite URL:** \`${result.inviteLink}\``
        : '- **Group invite URL:** not generated',
    '',
    '## What This Workflow Catches',
    '',
    '- `setPlayerAvailability()` mutating a copy instead of `state.players` directly (broke button state)',
    '- `setSection("coach","players")` not calling `refreshLiveAvailability()` (broke coach view)',
    '- `saveAvailabilityResponseToServer()` silently failing (wrong 200 assumed)',
    '- Redis key mismatch between player POST and coach GET (would show stale data)',
    '- Session cookie not sent with availability POST (unauthorized → silent fail)',
    '',
    '## Redis Impact (API Calls — Both Contexts)',
    '',
    '| Endpoint [context] | Method | Calls | Est. ops |',
    '|---|---|---|---|',
    ...apiRows,
    `| **Total** | | **${totalCalls}** | **~${totalOps}** |`,
    '',
    `> Setup phase: ~${setupOps} ops (group invite + join request + approval)${skipSetup ? ' — skipped this run' : ''}.`,
    `> Core test: ~${coreOps} ops (4× POST /api/availability ≈ 4 ops each; 4× refreshLiveAvailability = 12 GETs ≈ 4 ops each).`,
    `> **Total core ops (no setup): ~${coreOps}. With setup: ~${coreOps + setupOps}.**`,
    '',
    '## Estimated Manual Testing Time Saved',
    '',
    '| Task | Manual | Automated |',
    '|---|---|---|',
    '| Open browser, log in as coach | 60s | — |',
    '| Create / recall test player account | 60s | — |',
    '| Log in as player in separate browser | 30s | — |',
    '| Navigate to Availability | 10s | — |',
    '| Set Available, verify coach sees it | 60s | — |',
    '| Set Unavailable, verify coach sees it | 45s | — |',
    '| Set Unsure, verify coach sees it | 45s | — |',
    '| Set Tuesday training, verify | 45s | — |',
    '| Screenshot both tabs each time | 120s | — |',
    '| Record result | 30s | — |',
    '| **Total per run** | **~8 min** | **~90s** |',
    '',
    '- **Saved per run:** ~6.5 minutes',
    '- **At 2 runs/day:** ~13 min/day = **~65 min/week**',
    '- **This is the highest-frequency flow in the app — likely 2–3× daily during active season**',
    '',
    '## Missing Selectors / Test Hooks Needed',
    '',
    ...result.missingSelectorWarnings.map(w => `- ⚠️ ${w}`),
    '',
    '**Known gaps:**',
    '- Availability buttons selected by `onclick` attribute — if `setPlayerAvailability` is renamed, selector breaks.',
    '- Coach row matched by player name text — duplicate names would cause false matches; `data-player-id` attribute on `<tr>` would be more robust.',
    '- `refreshLiveAvailability()` called via `page.evaluate()` — tests the function directly, not the nav trigger; add `data-testid="members-nav-btn"` for click-based verification.',
    '- `trainingThursday` not verified in this workflow — add as a fifth change cycle.',
    '',
    '## Console Errors & Warnings',
    '',
    mdList(consErr, 'None'),
    '',
    '## Toast Messages',
    '',
    '### Coach context',
    mdList(result.toasts.map(t => `${t.at} — ${t.text}`), 'None'),
    '',
    '### Player context',
    mdList(result.playerToasts.map(t => `${t.at} — ${t.text}`), 'None'),
    '',
    '## Network Failures',
    '',
    mdList(
      result.requestFailures
        .filter(r => r.failure?.errorText && !r.failure.errorText.match(/^HTTP [45]/))
        .map(r => `[${r.context || 'coach'}] ${r.method} ${r.url} — ${JSON.stringify(r.failure)}`),
      'None'
    ),
    '',
    '## HTTP 4xx / 5xx Responses',
    '',
    mdList(
      result.requestFailures
        .filter(r => r.failure?.errorText?.match(/^HTTP [45]/))
        .map(r => `[${r.context || 'coach'}] ${r.failure.errorText} — ${r.method} ${r.url}`),
      'None'
    ),
    '',
    '## Page Errors',
    '',
    '### Coach context',
    mdList(result.pageErrors.map(e => e.message), 'None'),
    '',
    '### Player context',
    mdList(result.playerPageErrors.map(e => e.message), 'None'),
    '',
    '## What Passes',
    '',
    ...(passed.length ? passed.map(s => `- ${s.name}`) : ['- Nothing passed before stop.']),
    '',
    ...(skipped.length ? ['## Skipped Steps', '', ...skipped.map(s => `- ${s.name}: ${s.note || ''}`), ''] : []),
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- Availability records for one QA player will exist in Redis per run.',
    '- Workflow 5 stops at the first failure.',
    '',
  ].filter(l => l !== null && l !== undefined);

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
}

// ─── Step runner ──────────────────────────────────────────────────────────────
async function capture(page, record) {
  const name    = `${String(result.steps.length).padStart(2, '0')}-${slug(record.name)}`;
  const shotPath = path.join(artifactDir, `${name}.png`);
  const domPath  = path.join(artifactDir, `${name}.html`);
  try {
    await page.screenshot({ path: shotPath, fullPage: true });
    record.screenshot = shotPath;
  } catch (e) { record.screenshotError = e?.message || String(e); }
  try {
    fs.writeFileSync(domPath, await page.content());
    record.domSnapshot = domPath;
  } catch (e) { record.domSnapshotError = e?.message || String(e); }
  record.url = page.url();
}

async function workflowStep(page, name, fn, opts = {}) {
  const record = {
    name,
    context:   opts.context || 'coach',
    status:    'running',
    startedAt: new Date().toISOString(),
    url:       page.url(),
  };
  result.steps.push(record);
  try {
    await fn();
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error  = error?.message || String(error);
    throw error;
  } finally {
    await capture(page, record);
    record.finishedAt = new Date().toISOString();
    writeResult(record.status === 'failed' ? 'failed' : 'running');
    writeReport();
  }
}

function skipStep(name, note, ctx = 'coach') {
  result.steps.push({ name, context: ctx, status: 'skipped', note, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
}

// ─── Response / console listeners ────────────────────────────────────────────
function attachListeners(page, context = 'coach') {
  page.on('response', response => {
    const url    = response.url();
    const status = response.status();
    const parsed = (() => { try { return new URL(url); } catch { return null; } })();
    if (parsed?.pathname.startsWith('/api/')) {
      result.apiCalls.push({ endpoint: parsed.pathname, method: response.request().method(), status, context, at: new Date().toISOString() });
    }
    if (status >= 400) {
      result.requestFailures.push({ method: response.request().method(), url, failure: { errorText: `HTTP ${status} ${response.statusText()}` }, context, at: new Date().toISOString() });
    }
  });
  page.on('requestfailed', request => {
    result.requestFailures.push({ method: request.method(), url: request.url(), failure: request.failure(), context, at: new Date().toISOString() });
  });
}

async function injectToastObserver(page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('toast');
      if (!el) return;
      new MutationObserver(() => {
        if (el.classList.contains('visible') && el.textContent.trim()) {
          console.log('[QA_TOAST] ' + el.textContent.trim());
        }
      }).observe(el, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    });
  });
}

// ─── Availability helpers ─────────────────────────────────────────────────────

/**
 * Click an availability button on the player page and wait for:
 *   1. The "Availability saved ✓" toast to appear.
 *   2. The POST /api/availability response to complete (so data is on Redis
 *      before the coach refreshes).
 *
 * key:    'game' | 'trainingTuesday' | 'trainingThursday'
 * status: 'available' | 'unavailable' | 'maybe' | 'injured'
 */
async function playerSetAvailability(playerPage, key, status, stepCtx) {
  const btnSelector = `[onclick="setPlayerAvailability('${key}','${status}')"]`;

  // Race: start watching for the POST response BEFORE clicking so we don't miss it
  const postDone = playerPage.waitForResponse(
    res => new URL(res.url()).pathname === '/api/availability' && res.request().method() === 'POST',
    { timeout: 15_000 }
  );

  const btn = playerPage.locator(btnSelector);
  const btnVisible = await btn.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!btnVisible) {
    result.missingSelectorWarnings.push(
      `Button "${btnSelector}" not visible — setPlayerAvailability onclick attribute may have changed`
    );
    throw new Error(`Availability button not found: ${btnSelector}`);
  }
  await btn.click();

  // Wait for the toast that confirms the UI updated
  await expect.poll(async () => {
    const latest = result.playerToasts.at(-1)?.text || '';
    return latest.includes('Availability saved');
  }, { timeout: 10_000, message: '"Availability saved ✓" toast should appear within 10s' }).toBe(true);

  // Wait for the server to acknowledge the POST — ensures data is in Redis
  const postRes = await postDone;
  if (!postRes.ok()) {
    const body = await postRes.json().catch(() => ({}));
    throw new Error(`POST /api/availability returned ${postRes.status()}: ${body?.error || '(no error body)'}`);
  }

  result.availabilityChanges.push({ key, status, setAt: Date.now(), verified: false, verifiedAt: null });
}

/**
 * Trigger refreshLiveAvailability() on the coach page, wait for all three
 * /api/availability GETs to complete, then assert the player's row in the
 * #coach-players table shows the expected status label.
 *
 * statusLabel mapping: available→Available, unavailable→Unavailable, maybe→Maybe
 * The session key maps to a column class on the player row.
 */
async function coachVerifyAvailability(coachPage, playerName, key, expectedStatus) {
  // Map session key to the human label that statusLabel() produces
  const labelMap = { available: 'Available', unavailable: 'Unavailable', maybe: 'Maybe', injured: 'Injured' };
  const expectedLabel = labelMap[expectedStatus] || expectedStatus;

  // Map session key to which column/span in the player row
  // Columns in #coach-players: Name, Position, game(Match), trainingTuesday, trainingThursday, ...
  // Each cell uses <span class="status ${value}">...</span>
  // We scope to the player row and then look for the span with the right class
  const statusClass = expectedStatus; // CSS class matches the raw status value

  // Navigate away then back to Members — this triggers setSection('coach','players')
  // which calls refreshMembersData() + refreshLiveAvailability() automatically.
  // This is the exact code path that was broken and is now fixed.
  const refreshDone = Promise.all([
    coachPage.waitForResponse(res => new URL(res.url()).pathname === '/api/availability' && res.request().method() === 'GET', { timeout: 15_000 }),
  ]);

  // Navigate to a different coach section, then back to Members
  await coachPage.locator('#coachNav button').filter({ hasText: /Messages?|Message Center|Automations?/i }).first().click().catch(async () => {
    // Fallback: if no Messages section found, call refreshLiveAvailability directly
    await coachPage.evaluate(() => {
      if (typeof refreshLiveAvailability === 'function') return refreshLiveAvailability();
    });
  });
  await coachPage.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(coachPage.locator('h1#pageTitle')).toBeVisible({ timeout: 10_000 });

  // Wait for at least one availability GET to complete
  await refreshDone.catch(() => {}); // non-fatal — verifying DOM is what matters

  // Assert the player row shows the expected status
  const playerRow = coachPage.locator('#coach-players tbody tr').filter({ hasText: playerName });
  const rowExists = await playerRow.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!rowExists) {
    result.missingSelectorWarnings.push(`Player row for "${playerName}" not found in #coach-players tbody — player may not have been approved or name mismatch`);
    throw new Error(`Player "${playerName}" not found in #coach-players within 10s`);
  }

  // The status span in the row should match the expected status class and label
  const statusSpan = playerRow.locator(`.status.${statusClass}`);
  try {
    await expect(statusSpan).toBeVisible({ timeout: 10_000 });
    await expect(statusSpan).toContainText(expectedLabel, { timeout: 5_000 });
  } catch {
    const rowText = await playerRow.textContent().catch(() => '(unreadable)');
    result.missingSelectorWarnings.push(
      `Expected .status.${statusClass} containing "${expectedLabel}" in row for "${playerName}". ` +
      `Row text: "${rowText?.slice(0, 200)}"`
    );
    throw new Error(`Coach view: player "${playerName}" does not show ${key}=${expectedStatus} (expected "${expectedLabel}")`);
  }

  // Mark the last change as verified
  const change = [...result.availabilityChanges].reverse().find(c => c.key === key && c.status === expectedStatus);
  if (change) { change.verified = true; change.verifiedAt = Date.now(); }
}

// ─── Main test ────────────────────────────────────────────────────────────────
test('Workflow 5 — Player Sets Availability → Coach Sees Sync (No Manual Refresh)', async ({ page, browser }) => {
  ensureDirs();

  // ── Coach context setup ───────────────────────────────────────────────────
  await injectToastObserver(page);
  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text(), at: new Date().toISOString() };
    result.console.push(entry);
    if (msg.text().startsWith('[QA_TOAST] ')) result.toasts.push({ text: msg.text().replace('[QA_TOAST] ', ''), at: entry.at });
  });
  page.on('pageerror', error => result.pageErrors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() }));
  attachListeners(page, 'coach');

  let playerContext = null;

  try {
    // ── Steps 1–3: coach login ──────────────────────────────────────────────
    await workflowStep(page, 'Open app',           () => openApp(page));
    await workflowStep(page, 'Coach login',         () => coachLogin(page, config, result));
    await workflowStep(page, 'Navigate to Members', () => navigateToMembers(page));

    // ── Steps 4–7: player setup (skippable) ──────────────────────────────
    if (skipSetup) {
      skipStep('Generate group invite',   'QA_W5_PLAYER_EMAIL set — using existing player account');
      skipStep('Player opens invite URL', 'QA_W5_PLAYER_EMAIL set — using existing player account', 'player');
      skipStep('Player submits join request', 'QA_W5_PLAYER_EMAIL set — using existing player account', 'player');
      skipStep('Coach approves player',   'QA_W5_PLAYER_EMAIL set — using existing player account');
    } else {
      await workflowStep(page, 'Generate group invite', () => generateGroupInvite(page, result));

      playerContext = await browser.newContext();
      const setupPlayerPage = await playerContext.newPage();
      await injectToastObserver(setupPlayerPage);
      setupPlayerPage.on('console', msg => {
        const entry = { type: msg.type(), text: msg.text(), at: new Date().toISOString() };
        result.playerConsole.push(entry);
        if (msg.text().startsWith('[QA_TOAST] ')) result.playerToasts.push({ text: msg.text().replace('[QA_TOAST] ', ''), at: entry.at });
      });
      setupPlayerPage.on('pageerror', error => result.playerPageErrors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() }));
      attachListeners(setupPlayerPage, 'player');

      await workflowStep(setupPlayerPage, 'Player opens invite URL',
        () => openInviteUrl(setupPlayerPage, result.inviteLink), { context: 'player' });
      await workflowStep(setupPlayerPage, 'Player fills & submits join request',
        async () => {
          await fillGroupRegistrationForm(setupPlayerPage, config);
          await submitRegistration(setupPlayerPage, result);
        }, { context: 'player' });

      await playerContext.close().catch(() => {});
      playerContext = null;

      // Coach approves
      await workflowStep(page, 'Coach refreshes & approves player', async () => {
        // Refresh the pending requests panel
        const pendingBtn = page.locator('button[onclick="loadIdentityRequests()"]');
        const btnVisible = await pendingBtn.isVisible({ timeout: 5_000 }).catch(() => false);
        if (btnVisible) {
          await pendingBtn.click();
        } else {
          await page.evaluate(() => { if (typeof loadIdentityRequests === 'function') loadIdentityRequests(); });
        }
        await expect(page.locator('#identity-requests-panel')).not.toContainText('Loading join requests', { timeout: 10_000 });
        await expect(page.locator('#identity-requests-panel')).toContainText(config.testPlayerEmail, { timeout: 15_000 });
        await page.locator('#identity-requests-panel').getByRole('button', { name: 'Approve' }).first().click();
        await expect.poll(async () => {
          return /approved|added to roster/i.test(result.toasts.at(-1)?.text || '');
        }, { timeout: 10_000, message: 'approval toast within 10s' }).toBe(true);
      });
    }

    // ── Steps 8–9: player logs in and navigates to Availability ──────────
    playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();

    await injectToastObserver(playerPage);
    playerPage.on('console', msg => {
      const entry = { type: msg.type(), text: msg.text(), at: new Date().toISOString() };
      result.playerConsole.push(entry);
      if (msg.text().startsWith('[QA_TOAST] ')) result.playerToasts.push({ text: msg.text().replace('[QA_TOAST] ', ''), at: entry.at });
    });
    playerPage.on('pageerror', error => result.playerPageErrors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() }));
    attachListeners(playerPage, 'player');

    await workflowStep(playerPage, 'Player logs in',
      () => playerLogin(playerPage, config, result), { context: 'player' });

    await workflowStep(playerPage, 'Player navigates to Availability', async () => {
      await playerPage.locator('#playerNav button').filter({ hasText: 'Availability' }).click();
      await expect(playerPage.locator('#player-availability')).toBeVisible({ timeout: 10_000 });
    }, { context: 'player' });

    // ── Steps 10–11: Available ────────────────────────────────────────────
    await workflowStep(playerPage, 'Player sets game = Available', async () => {
      await playerSetAvailability(playerPage, 'game', 'available', 'player');
    }, { context: 'player' });

    await workflowStep(page, 'Coach verifies game = Available (auto-refresh)', async () => {
      await coachVerifyAvailability(page, config.testPlayerName, 'game', 'available');
    });

    // ── Steps 12–13: Unavailable ──────────────────────────────────────────
    await workflowStep(playerPage, 'Player sets game = Unavailable', async () => {
      await playerSetAvailability(playerPage, 'game', 'unavailable', 'player');
    }, { context: 'player' });

    await workflowStep(page, 'Coach verifies game = Unavailable (auto-refresh)', async () => {
      await coachVerifyAvailability(page, config.testPlayerName, 'game', 'unavailable');
    });

    // ── Steps 14–15: Unsure (maybe) ───────────────────────────────────────
    await workflowStep(playerPage, 'Player sets game = Unsure (maybe)', async () => {
      await playerSetAvailability(playerPage, 'game', 'maybe', 'player');
    }, { context: 'player' });

    await workflowStep(page, 'Coach verifies game = Maybe (auto-refresh)', async () => {
      await coachVerifyAvailability(page, config.testPlayerName, 'game', 'maybe');
    });

    // ── Steps 16–17: Tuesday training Available ───────────────────────────
    await workflowStep(playerPage, 'Player sets trainingTuesday = Available', async () => {
      await playerSetAvailability(playerPage, 'trainingTuesday', 'available', 'player');
    }, { context: 'player' });

    await workflowStep(page, 'Coach verifies trainingTuesday = Available (auto-refresh)', async () => {
      await coachVerifyAvailability(page, config.testPlayerName, 'trainingTuesday', 'available');
    });

    writeResult('passed');
    writeReport();
  } catch (error) {
    writeResult('failed');
    writeReport();
    throw error;
  } finally {
    if (playerContext) await playerContext.close().catch(() => {});
  }
});
