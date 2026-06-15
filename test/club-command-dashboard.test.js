/**
 * Phase 11 — Club Command Dashboard.
 *
 * Tests the renderClubCommandDashboard() function in isolation.
 * The function is presentation-only: it reads state and calls existing
 * helpers — no mutations, no business logic. All complex helpers
 * (getTonightSessionId, chatUnreadTotal, getTodayReceipts) are stubbed.
 *
 * Tests:
 *  1.  Empty dashboard — no players, no schedule, no fixtures, no messages
 *  2.  Full dashboard — squad, training, fixture, messages, medical flags
 *  3.  Trial team — trial card and countdown visible
 *  4.  Pro team — Pro badge and billing button visible
 *  5.  No upcoming fixture — shows empty-state copy
 *  6.  No unread messages — shows "All caught up"
 *  7.  No medical issues — shows "All players fit"
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === '(') parenDepth++;
    if (source[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — could not find closing brace');
}

function extractConst(source, name) {
  const marker = '    const ' + name + ' = ';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('const ' + name + ' not found');
  let i = start + marker.length;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n')) i++;
  const opener = source[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (closer) {
    let depth = 0;
    while (i < source.length) {
      if (source[i] === opener) depth++;
      else if (source[i] === closer) { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
  } else {
    // Primitive value (number, string without braces/brackets) — read to ';'
    while (i < source.length && source[i] !== ';') i++;
    i++;
  }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

// ── Scope builder ─────────────────────────────────────────────────────────────
// Extracts real helper functions from index.html and wires up a minimal state
// and set of stubs so renderClubCommandDashboard() can run in isolation.
//
// Stubbed (require side-effects or module-level vars):
//   getTonightSessionId  — returned via stubTonightId
//   chatUnreadTotal      — returned via stubUnread
//   getTodayReceipts     — returned via stubReceipts
//   setSection           — no-op
//   settingsManageBilling — no-op
//   upgradeFromFeature    — no-op (records calls)
//
// Real (pure state reads):
//   sessionKey, matchCentrePhase, matchCountdownStr, getInjuredNoReturnDate,
//   trialDaysRemaining, isTrialActive, isProTeam, isEnterpriseTeam

function buildScope({
  teamPlan = null,
  teamPlanStatus = null,
  trialEndsAt = null,
  players = [],
  schedule = [],
  fixtures = [],
  messages = [],
  matchCentre = {},
  medicalNotes = {},
  masterFeed = [],
  autopilotReceipts = [],
  availabilityRequests = [],
  trainingBlocks = {},
  permissions = ['manage_subscriptions'],
  // Stubs
  stubTonightId = null,
  stubUnread = 0,
  stubReceipts = [],
} = {}) {
  const stateObj = {
    teamPlan, teamPlanStatus, trialEndsAt,
    players, schedule, fixtures, messages,
    matchCentre, medicalNotes, masterFeed,
    autopilotReceipts, availabilityRequests, trainingBlocks,
  };
  const permsJson = JSON.stringify(permissions);

  const body =
    '"use strict";\n' +
    'const state = ' + JSON.stringify(stateObj) + ';\n' +
    'const _myPerms = ' + permsJson + ';\n' +
    // Stubs
    'function getTonightSessionId() { return ' + JSON.stringify(stubTonightId) + '; }\n' +
    'function chatUnreadTotal() { return ' + JSON.stringify(stubUnread) + '; }\n' +
    'function getTodayReceipts() { return ' + JSON.stringify(stubReceipts) + '; }\n' +
    'function setSection() {}\n' +
    'function settingsManageBilling() {}\n' +
    'let _upgradeCallCount = 0;\n' +
    'function upgradeFromFeature() { _upgradeCallCount++; }\n' +
    'function recordFeatureUsage() {}\n' +
    'function canI(perm) { return _myPerms.includes(perm); }\n' +
    'function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }\n' +
    // Real helpers
    extractFn(html, 'sessionKey') + '\n' +
    extractFn(html, 'matchCentrePhase') + '\n' +
    extractFn(html, 'matchCountdownStr') + '\n' +
    extractFn(html, 'getInjuredNoReturnDate') + '\n' +
    extractFn(html, 'trialDaysRemaining') + '\n' +
    extractFn(html, 'isTrialActive') + '\n' +
    extractConst(html, 'PLAN_LEVEL') + '\n' +
    extractFn(html, 'planLevel') + '\n' +
    extractFn(html, 'isProTeam') + '\n' +
    extractFn(html, 'isEnterpriseTeam') + '\n' +
    // Phase 17 player lifecycle helpers (needed by renderClubCommandDashboard)
    extractConst(html, 'PLAYER_LIFECYCLE_LABELS') + '\n' +
    extractFn(html, 'playerIsArchived') + '\n' +
    // The function under test
    extractFn(html, 'renderClubCommandDashboard') + '\n' +
    'return { renderClubCommandDashboard, _get: function(k) { return eval(k); } };\n';

  return new Function(body)();
}

// ── 1. Empty dashboard ────────────────────────────────────────────────────────

test('empty dashboard: shows all empty states', () => {
  const { renderClubCommandDashboard } = buildScope();
  const out = renderClubCommandDashboard();

  assert.ok(out.includes('No players added yet'), 'Availability empty state missing');
  assert.ok(out.includes('No sessions scheduled yet'), 'Training empty state missing');
  assert.ok(out.includes('No upcoming fixtures'), 'Fixture empty state missing');
  assert.ok(out.includes('All caught up'), 'Messages empty state missing');
  assert.ok(out.includes('All players fit'), 'Medical empty state missing');
  assert.ok(out.includes('No activity yet today'), 'Activity empty state missing');
});

// ── 2. Full dashboard ─────────────────────────────────────────────────────────

test('full dashboard: renders all card values', () => {
  const tonightSessId = 'tue';
  const todayIso = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

  const players = [
    { id: 'p1', trainingTuesday: 'available' },
    { id: 'p2', trainingTuesday: 'available' },
    { id: 'p3', trainingTuesday: 'unavailable' },
  ];
  const schedule = [
    { id: 'tue', type: 'Training', title: 'Tuesday Session', date: 'Tue 19:00', published: true, publishedAt: todayIso },
  ];
  const fixtures = [
    { id: 'fx1', opposition: 'Acton Town', date: futureDate, time: '15:00', venue: 'Home' },
  ];

  const { renderClubCommandDashboard } = buildScope({
    players,
    schedule,
    fixtures,
    trainingBlocks: { tue: ['block1', 'block2'] },
    stubTonightId: tonightSessId,
    stubUnread: 3,
    stubReceipts: ['Tuesday Session published', 'Availability request sent (1)'],
  });

  const out = renderClubCommandDashboard();

  // Availability
  assert.ok(out.includes('67%'), 'Should show 67% availability (2/3)');
  assert.ok(out.includes('/ 3'), 'Should show total of 3 players');
  assert.ok(out.match(/1\s*unavailable/), 'Should show 1 unavailable');

  // Training
  assert.ok(out.includes('Tuesday Session'), 'Should show session title');
  assert.ok(out.includes('Published'), 'Should show Published badge');
  assert.ok(out.includes('2 blocks'), 'Should show block count');

  // Fixture
  assert.ok(out.includes('Acton Town'), 'Should show opposition name');

  // Messages
  assert.ok(out.includes('>3<'), 'Should show 3 unread messages');

  // Activity
  assert.ok(out.includes('Tuesday Session published'), 'Should include receipt');
});

// ── 3. Trial team ─────────────────────────────────────────────────────────────

test('trial team: shows trial remaining card and Pro upgrade button', () => {
  const farFuture = new Date(Date.now() + 8 * 86400000).toISOString();

  const { renderClubCommandDashboard } = buildScope({
    teamPlan: 'trial',
    teamPlanStatus: 'active',
    trialEndsAt: farFuture,
    permissions: ['manage_subscriptions'],
  });
  const out = renderClubCommandDashboard();

  // Trial Remaining card (shown only on trial)
  assert.ok(out.includes('Trial Remaining'), 'Should render Trial Remaining card');

  // Subscription card shows trial copy
  assert.ok(out.includes('free trial'), 'Subscription card should mention free trial');
  assert.ok(out.includes('Upgrade to Pro'), 'Should show Upgrade to Pro button');

  // Plan badge
  assert.ok(out.includes('Trial'), 'Should show Trial badge');
});

// ── 4. Pro team ───────────────────────────────────────────────────────────────

test('pro team: shows Pro badge, no upgrade prompt, billing button', () => {
  const { renderClubCommandDashboard } = buildScope({
    teamPlan: 'pro',
    teamPlanStatus: 'active',
    permissions: ['manage_subscriptions'],
  });
  const out = renderClubCommandDashboard();

  assert.ok(out.includes('>Pro<'), 'Should show Pro badge');
  assert.ok(out.includes('all features unlocked'), 'Should confirm all features unlocked');
  assert.ok(out.includes('Manage billing'), 'Pro team should see billing button');

  // Should NOT show upgrade prompt
  assert.ok(!out.includes('Upgrade to Pro'), 'Pro team must not see Upgrade to Pro button');

  // Trial Remaining card must be absent
  assert.ok(!out.includes('Trial Remaining'), 'Trial card must not appear for Pro team');
});

// ── 5. No upcoming fixture ────────────────────────────────────────────────────

test('no upcoming fixture: shows empty-state in fixture card', () => {
  // All fixtures are in the past
  const { renderClubCommandDashboard } = buildScope({
    fixtures: [
      { id: 'fx1', opposition: 'Old Team', date: '2020-01-01', time: '15:00', venue: 'Away' },
    ],
    matchCentre: {}, // no kickoffDate
  });
  const out = renderClubCommandDashboard();

  assert.ok(out.includes('No upcoming fixtures'), 'Fixture empty state must appear');
  assert.ok(!out.includes('Old Team'), 'Past fixture must not appear');
});

// ── 6. No unread messages ─────────────────────────────────────────────────────

test('no unread messages: shows all-caught-up state', () => {
  const { renderClubCommandDashboard } = buildScope({
    messages: [],
    stubUnread: 0,
  });
  const out = renderClubCommandDashboard();

  assert.ok(out.includes('All caught up'), 'Should show all-caught-up when no messages');
  assert.ok(!out.match(/\d+ unread message/), 'Must not show a message count when zero');
});

// ── 7. No medical issues ──────────────────────────────────────────────────────

test('no medical issues: shows all-players-fit state', () => {
  const { renderClubCommandDashboard } = buildScope({
    players: [
      { id: 'p1', status: 'fit' },
      { id: 'p2', status: 'fit' },
    ],
    medicalNotes: {},
  });
  const out = renderClubCommandDashboard();

  assert.ok(out.includes('All players fit'), 'Medical card should show all-fit state');
  assert.ok(!out.includes('injured'), 'Must not show injury count when zero');
});
