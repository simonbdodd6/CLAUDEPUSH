/**
 * Workflow 5 — Coach ↔ Player Messaging QA
 *
 * Tests the full real-time messaging loop between a coach and a player:
 *   Coach sends timestamped DM → player receives it via 2.5s poll → player replies
 *   → coach receives reply via 2.5s poll.
 *
 * Prerequisites:
 *   A player must already exist as an approved member of the team.
 *   Provide credentials via env vars (or run Workflow 4 first to auto-populate):
 *     QA_W5_PLAYER_EMAIL    — player's login email (reads from workflow-4.json if not set)
 *     QA_W5_PLAYER_PASSWORD — player's login password (default: qatest12345)
 *     QA_W5_PLAYER_NAME     — player's full name as shown in Members roster
 *     QA_W5_PLAYER_FIRST    — player's first name (used to find DM contact)
 *
 * Steps:
 *   1.  Open app                        — coach context, #authPanel visible
 *   2.  Coach login                     — shared helper
 *   3.  Navigate to Members             — verify player exists in roster
 *   4.  Navigate to Messages            — click Messages nav, #chatContactList visible
 *   5.  Open player DM                  — find player in contact list, click to open
 *   6.  Send coach message              — timestamped text → #chatFeed optimistic render
 *   7.  Verify coach message in feed    — #chatFeed contains sent text
 *   8.  Player login                    — fresh browser context; playerLogin() does goto('/') + credential form + #playerNav
 *   9.  Player navigates to Messages    — #chatContactList visible
 *   10. Player opens Coach DM           — clicks "Coach" contact or uses auto-selected DM
 *   11. Player verifies coach message   — #chatFeed contains coach's timestamped text (poll)
 *   12. Player sends reply              — timestamped reply → #chatFeed optimistic render
 *   13. Coach verifies reply received   — coach #chatFeed contains player reply (poll 2.5s)
 *
 * Stops on first failure. Screenshots + HTML snapshots at every step (both contexts).
 * Writes qa/results/workflow-5.json and QA_WORKFLOW_5_MESSAGING_REPORT.md.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  openApp,
  coachLogin,
  navigateToMembers,
  navigateToMessages,
  openPlayerDM,
  openCoachDM,
  sendChatMessage,
  verifyChatMessage,
  playerLogin,   // handles goto('/') + credential form + waits for #playerNav
  verifyPlayerInMembers,
  redisEstimate,
} from '../helpers/shared-steps.js';

// ─── Run identity ────────────────────────────────────────────────────────────
const runId       = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = path.join(process.cwd(), 'qa/artifacts', `workflow5-${runId}`);
const resultPath  = path.join(process.cwd(), 'qa/results/workflow-5.json');
const reportPath  = path.join(process.cwd(), 'QA_WORKFLOW_5_MESSAGING_REPORT.md');

// ─── Credential resolution ────────────────────────────────────────────────────
// Try workflow-4.json first so W5 can run right after W4 without extra env vars.
function loadW4Credentials() {
  const p = path.join(process.cwd(), 'qa/results/workflow-4.json');
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Only use W4 credentials if W4 actually passed
    if (data.status !== 'passed') return null;
    return { email: data.playerEmail, name: data.playerName, password: data.playerPassword };
  } catch { return null; }
}

const w4Creds = loadW4Credentials();

// ─── Config ──────────────────────────────────────────────────────────────────
const ts = Date.now();
const coachMessage = `QA coach msg ${ts}`;
const playerReply  = `QA player reply ${ts}`;

const config = {
  baseURL:         process.env.QA_BASE_URL       || 'http://127.0.0.1:3000',
  coachEmail:      process.env.QA_COACH_EMAIL    || 'simonbdodd@gmail.com',
  coachPassword:   process.env.QA_COACH_PASSWORD || '',
  // Player credentials — prefer env vars, fall back to W4 result, then fail with clear message
  playerEmail:    process.env.QA_W5_PLAYER_EMAIL    || w4Creds?.email    || null,
  playerPassword: process.env.QA_W5_PLAYER_PASSWORD || w4Creds?.password || 'qatest12345',
  playerName:     process.env.QA_W5_PLAYER_NAME     || w4Creds?.name     || null,
  coachMessage,
  playerReply,
};

// ─── Result accumulator ──────────────────────────────────────────────────────
const result = {
  workflow:     'workflow-5',
  runId,
  startedAt:    new Date().toISOString(),
  finishedAt:   null,
  status:       'running',
  baseURL:      config.baseURL,
  commit:       gitCommit(),
  loginMethod:  config.coachPassword ? 'credentials' : 'dev-login-btn',
  playerEmail:  config.playerEmail,
  playerName:   config.playerName,
  coachMessage,
  playerReply,
  steps:        [],
  console:      [],
  toasts:       [],
  pageErrors:   [],
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

// ─── Filesystem helpers ──────────────────────────────────────────────────────
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
  const consErr = [
    ...result.console.filter(e => ['error', 'warning'].includes(e.type)).map(e => `[coach] ${e.type}: ${e.text}`),
    ...result.playerConsole.filter(e => ['error', 'warning'].includes(e.type)).map(e => `[player] ${e.type}: ${e.text}`),
  ];

  // Redis impact table
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

  // Step table
  const stepRows = result.steps.map((step, i) => {
    const shot = step.screenshot ? `[png](${rel(step.screenshot)})` : '—';
    const ms   = (step.finishedAt && step.startedAt)
      ? Math.round(new Date(step.finishedAt) - new Date(step.startedAt)) : '—';
    const note = (step.error || step.note || '').slice(0, 130);
    const ctx  = step.context ? ` [${step.context}]` : '';
    return `| ${i + 1} | ${step.name}${ctx} | ${step.status.toUpperCase()} | ${ms}ms | ${shot} | ${note} |`;
  });

  const credentialSource = w4Creds && !process.env.QA_W5_PLAYER_EMAIL
    ? 'qa/results/workflow-4.json (auto-read from W4 pass)'
    : process.env.QA_W5_PLAYER_EMAIL
      ? 'QA_W5_PLAYER_EMAIL env var'
      : 'none — workflow failed at credential check';

  const lines = [
    '# QA Workflow 5 — Coach ↔ Player Messaging',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Commit:** \`${result.commit}\``,
    `**Base URL:** ${result.baseURL}`,
    `**Login method (coach):** ${result.loginMethod}`,
    `**Player credentials from:** ${credentialSource}`,
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
    '## Messaging Details',
    '',
    `- **Player email:** \`${config.playerEmail || 'NOT SET'}\``,
    `- **Player name:** \`${config.playerName || 'NOT SET'}\``,
    `- **Coach message:** \`${coachMessage}\``,
    `- **Player reply:** \`${playerReply}\``,
    '',
    '## Browser Contexts',
    '',
    '- **Coach context:** standard Playwright `page` fixture — steps 1–7, 13',
    '- **Player context:** fresh `browser.newContext()` — steps 8–12; isolated from coach session',
    '',
    '## Chat Architecture Notes',
    '',
    '- Messages are persisted via `POST /api/chat { action:"send" }` → stored in Redis list (`chat:msgs:{convId}`)',
    '- Recipients receive messages via a 2500ms `setInterval` poll (`chatFetchMessages(convId, since)` → `GET /api/chat?action=messages&since=TS`)',
    '- Sent messages render **optimistically** in the sender\'s feed immediately (before API ack)',
    '- DM conversation ID: `dmConvId(coachId, participantId)` — sorts IDs alphabetically → `dm:a:b`',
    '- Player always defaults to Coach DM via `canonicalizePlayerSelectedChat()` → `playerCoachDmId()`',
    '',
    '## Redis Impact (API Calls — Both Contexts)',
    '',
    '| Endpoint [context] | Method | Calls | Est. ops |',
    '|---|---|---|---|',
    ...apiRows,
    `| **Total** | | **${totalCalls}** | **~${totalOps}** |`,
    '',
    '> `POST /api/chat action:send` = ~8 ops (session auth + Redis RPUSH + LTRIM + mark-read)',
    '> `GET /api/chat action:messages` = ~8 ops per poll tick (session + LRANGE + unread)',
    '> Full W5 run: ~4 polls each context × 8 ops + 2 sends × 8 ops = ~80 ops estimated',
    '',
    '## Estimated Manual Testing Time Saved',
    '',
    '| Task | Manual | Automated |',
    '|---|---|---|',
    '| Open app, coach login | 60s | — |',
    '| Navigate to Members, verify player in roster | 20s | — |',
    '| Navigate to Messages | 10s | — |',
    '| Find player in contact list, open DM | 15s | — |',
    '| Type + send timestamped message | 20s | — |',
    '| Open incognito / second browser | 15s | — |',
    '| Player login | 30s | — |',
    '| Player navigate to Messages | 10s | — |',
    '| Player verify coach message visible | 15s | — |',
    '| Player type + send reply | 20s | — |',
    '| Switch to coach tab, verify reply | 20s | — |',
    '| Screenshot both tabs + record result | 90s | — |',
    '| **Total per run** | **~5.5 min** | **~90s** |',
    '',
    '- **Saved per run:** ~4 minutes',
    '- **At 2 runs/day:** ~8 min/day = **~40 min/week**',
    '- **Workflows 1–5 combined:** ~23 min saved per full nightly run',
    '',
    '## Missing Selectors / Test Hooks Needed',
    '',
    mdList(
      result.missingSelectorWarnings.length ? result.missingSelectorWarnings : [],
      'None'
    ),
    '',
    '**Known gaps:**',
    '- No `data-msgid` on `.chat-bubble-wrap` rows — already present on `.chat-bubble` via `data-msgid="${m.id}"` but not verified here.',
    '- Push notification delivery not tested — covered by Workflow 6 (API-layer only).',
    '- Coach message-read receipts not verified — `chatMarkRead()` is called but read state not asserted.',
    '- Group chat messaging not tested (squad, coaching, announcements) — only coach–player DM.',
    '- Message edit + delete flows not tested.',
    '- File/media attachments not tested (`mediaUrl`, `mediaType` in send payload).',
    '',
    '## Remaining Manual Messaging Tests',
    '',
    '- **Group chat (Squad):** coach sends broadcast → multiple players receive it',
    '- **Announcements:** coach posts to announcements channel → players see it (player cannot reply)',
    '- **Message reactions:** player reacts with emoji → coach sees reaction count',
    '- **Message edit:** coach edits sent message → player sees updated text',
    '- **Message delete:** player deletes their own message → coach sees deletion',
    '- **Read receipts:** coach sees when player has read the message',
    '- **File attachments:** coach sends image → player receives and can view',
    '- **Reply quoting:** player replies to a specific message (reply-quote UI)',
    '- **Typing indicators:** one side sees "typing…" while other types',
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
    '## Scope Guard',
    '',
    '- No Coach\'s Eye application code was modified.',
    '- Two chat messages are written to Redis per run (one coach, one player reply).',
    '- Workflow 5 stops at the first failure.',
    '',
  ].filter(l => l !== null && l !== undefined);

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
}

// ─── Step runner ─────────────────────────────────────────────────────────────
async function capture(page, record) {
  const name     = `${String(result.steps.length).padStart(2, '0')}-${slug(record.name)}`;
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

// ─── Response listener factory ───────────────────────────────────────────────
function attachResponseListener(page, context = 'coach') {
  page.on('response', response => {
    const url    = response.url();
    const status = response.status();
    const parsed = (() => { try { return new URL(url); } catch { return null; } })();
    if (parsed?.pathname.startsWith('/api/')) {
      result.apiCalls.push({
        endpoint: parsed.pathname,
        method:   response.request().method(),
        status,
        context,
        at:       new Date().toISOString(),
      });
    }
    if (status >= 400) {
      result.requestFailures.push({
        method:  response.request().method(),
        url,
        failure: { errorText: `HTTP ${status} ${response.statusText()}` },
        context,
        at:      new Date().toISOString(),
      });
    }
  });
}

// ─── Toast observer injection ─────────────────────────────────────────────────
async function injectToastObserver(page) {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const toastEl = document.getElementById('toast');
      if (!toastEl) return;
      new MutationObserver(() => {
        if (toastEl.classList.contains('visible') && toastEl.textContent.trim()) {
          console.log('[QA_TOAST] ' + toastEl.textContent.trim());
        }
      }).observe(toastEl, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    });
  });
}

// ─── Main test ───────────────────────────────────────────────────────────────
test('Workflow 5 — Coach ↔ Player Messaging', async ({ page, browser }) => {
  ensureDirs();

  // Guard: fail early with a clear message if no player credentials are available
  if (!config.playerEmail || !config.playerName) {
    throw new Error(
      'Workflow 5 requires player credentials. ' +
      'Either run Workflow 4 first (it saves credentials to qa/results/workflow-4.json), ' +
      'or set QA_W5_PLAYER_EMAIL and QA_W5_PLAYER_NAME env vars.'
    );
  }

  // ── Coach context setup ───────────────────────────────────────────────────
  await injectToastObserver(page);

  page.on('console', msg => {
    const entry = { type: msg.type(), text: msg.text(), at: new Date().toISOString() };
    result.console.push(entry);
    if (msg.text().startsWith('[QA_TOAST] ')) {
      result.toasts.push({ text: msg.text().replace('[QA_TOAST] ', ''), at: entry.at });
    }
  });
  page.on('pageerror', error => {
    result.pageErrors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() });
  });
  page.on('requestfailed', request => {
    result.requestFailures.push({
      method: request.method(), url: request.url(),
      failure: request.failure(), context: 'coach', at: new Date().toISOString(),
    });
  });
  attachResponseListener(page, 'coach');

  let playerContext = null;

  try {
    // ── Steps 1–3: coach login + confirm player in roster ────────────────────
    await workflowStep(page, 'Open app',           () => openApp(page));
    await workflowStep(page, 'Coach login',         () => coachLogin(page, config, result));
    await workflowStep(page, 'Navigate to Members', () => navigateToMembers(page));

    // Verify the player we intend to chat with is actually in the roster
    await workflowStep(page, 'Verify player in roster', async () => {
      await verifyPlayerInMembers(page, config.playerName, result);
    });

    // ── Steps 4–7: coach sends a DM ──────────────────────────────────────────
    await workflowStep(page, 'Navigate to Messages',
      () => navigateToMessages(page, result));

    await workflowStep(page, 'Open player DM',
      () => openPlayerDM(page, config.playerName, result));

    await workflowStep(page, 'Send coach message',
      () => sendChatMessage(page, config.coachMessage, result));

    await workflowStep(page, 'Verify coach message in feed', async () => {
      // Message was just sent — verify it renders in coach's own feed
      await verifyChatMessage(page, config.coachMessage, result, { timeout: 8_000 });
    });

    // ── Steps 8–13: fresh player context ─────────────────────────────────────
    playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();

    await injectToastObserver(playerPage);

    playerPage.on('console', msg => {
      const entry = { type: msg.type(), text: msg.text(), at: new Date().toISOString() };
      result.playerConsole.push(entry);
      if (msg.text().startsWith('[QA_TOAST] ')) {
        result.playerToasts.push({ text: msg.text().replace('[QA_TOAST] ', ''), at: entry.at });
      }
    });
    playerPage.on('pageerror', error => {
      result.playerPageErrors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() });
    });
    playerPage.on('requestfailed', request => {
      result.requestFailures.push({
        method: request.method(), url: request.url(),
        failure: request.failure(), context: 'player', at: new Date().toISOString(),
      });
    });
    attachResponseListener(playerPage, 'player');

    // playerLogin handles goto('/') + #authPanel + credential form + waits for #playerNav
    await workflowStep(playerPage, 'Player login',
      () => playerLogin(playerPage, {
        testPlayerEmail:    config.playerEmail,
        testPlayerPassword: config.playerPassword,
      }, result),
      { context: 'player' });

    await workflowStep(playerPage, 'Player navigates to Messages',
      () => navigateToMessages(playerPage, result), { context: 'player' });

    await workflowStep(playerPage, 'Player opens Coach DM',
      () => openCoachDM(playerPage, result), { context: 'player' });

    // Poll: 2500ms chat interval — coach message should arrive in ≤ 3 poll cycles
    await workflowStep(playerPage, 'Player verifies coach message', async () => {
      await verifyChatMessage(playerPage, config.coachMessage, result, { timeout: 15_000 });
    }, { context: 'player' });

    await workflowStep(playerPage, 'Player sends reply',
      () => sendChatMessage(playerPage, config.playerReply, result),
      { context: 'player' });

    // ── Step 14: back to coach, verify reply ─────────────────────────────────
    // Poll: 2500ms chat interval — reply should arrive in ≤ 3 poll cycles
    await workflowStep(page, 'Coach verifies player reply', async () => {
      await verifyChatMessage(page, config.playerReply, result, { timeout: 15_000 });
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
