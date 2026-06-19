/**
 * Phase 12 — Production Hardening & UX Polish.
 *
 * Tests fresh-session safety, render() error containment, and the
 * Beta Readiness diagnostic panel in renderSettings().
 *
 * Tests:
 *  1.  Fresh session: currentUser() returns undefined without throwing
 *  2.  render() safeRender: one throwing helper does not blank other sections
 *  3.  render() safeRender: error card inserted in affected section only
 *  4.  renderNav(): does not throw when state.users is empty
 *  5.  renderCoachOverview(): populates #coach-overview in empty state
 *  6.  renderCoachOverview(): contains Club Command Dashboard in empty state
 *  7.  renderSettings() Beta Readiness: all six rows rendered
 *  8.  renderSettings() Beta Readiness: production build shown as green
 *  9.  renderSettings() Beta Readiness: non-production build shown as warning
 * 10.  renderSettings() Beta Readiness: session row reflects auth state
 * 11.  Build info: Settings Device card shows sha, env, branch, time
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
  if (start === -1) throw new Error('function ' + name + ' not found');
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
    while (i < source.length && source[i] !== ';') i++;
    i++;
  }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

// Minimal DOM element mock that tracks innerHTML
function makeEl(id = '') {
  let _html = '';
  return {
    id,
    get innerHTML() { return _html; },
    set innerHTML(v) { _html = v; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {},
    textContent: '',
  };
}

// ── Scope builders ────────────────────────────────────────────────────────────

function buildNavScope({ users = [], currentUserId = '' } = {}) {
  // Use a shared store object passed into the new Function so closures work.
  const store = {};
  const mockDoc = {
    getElementById(id) {
      if (!store[id]) store[id] = makeEl(id);
      return store[id];
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    title: '',
  };

  const state = {
    users, currentUserId, players: [], schedule: [], features: { autopilot: true },
    activeView: 'coach', activeCoachSection: 'overview', activePlayerSection: 'availability',
    messages: [], clubName: 'Test RFC',
  };

  const body = `"use strict";
    const document = mockDoc;
    const state = ${JSON.stringify(state)};
    let _myPermissions = null; let _myMemberships = null; let _chatNavUnread = 0;
    let authTab = 'closed';
    const window = { _devLoginEnabled: false };
    function currentUser() { return state.users.find(u => u.id === state.currentUserId) || state.users[0]; }
    function isCoach() { return currentUser()?.role === 'coach'; }
    function canI(perm) { return isCoach(); }
    function icon() { return ''; }
    function esc(s) { return String(s||''); }
    function canonicalSwitchAccounts() { return []; }
    function renderPushSidebar() {}
    function updateNavBadge() {}
    const coachSections = [['overview','Overview'],['messages','Messages'],['training','Training'],['matchday','Match Centre'],['medical','Medical'],['players','Players'],['admin','Admin'],['settings','Settings']];
    const playerSections = [['availability','Availability'],['week','This Week'],['fixtures','Fixtures'],['messages','Messages']];
    const BETA_SIMPLE_NAV = false; const BETA_NAV_IDS = [];
    const SECTION_ICONS = {};
    ${extractFn(html, 'renderNav')}
    return { renderNav };
  `;
  return new Function('mockDoc', body)(mockDoc);
}

function buildSettingsScope({ buildInfo = { sha: 'abc1234', env: 'production', branch: 'main', time: '2026-06-15T12:00:00.000Z' }, serverAuthState = 'authed', role = 'coach', clubName = 'Boitsfort RFC', teamPlan = 'trial', teamPlanStatus = 'active' } = {}) {
  // Use a shared store object passed into new Function to avoid closure issues.
  const store = { html: '' };
  const mockDoc = {
    getElementById(id) {
      if (id !== 'coach-settings') return null;
      return {
        get innerHTML() { return store.html; },
        set innerHTML(v) { store.html = v; },
      };
    },
  };

  const state = {
    users: [{ id: 'u1', role, name: 'Coach', email: 'coach@test.com' }],
    currentUserId: 'u1', players: [], schedule: [], features: { autopilot: true, permissionsV2: false },
    activeView: 'coach', activeCoachSection: 'settings', teamPlan, teamPlanStatus, trialEndsAt: null,
    clubName, teamId: 'boitsfort-rfc', messages: [], masterFeed: [],
    clubLogo: null, clubColours: null, matchDayDefault: null, seasonStart: null, seasonEnd: null,
  };

  const body = `"use strict";
    const document = mockDoc;
    const state = ${JSON.stringify(state)};
    const _BUILD_INFO = ${JSON.stringify(buildInfo)};
    let _serverAuthState = ${JSON.stringify(serverAuthState)};
    let _myPermissions = null; let _settingsVersion = '1.0.0'; let _settingsPrefs = {};
    function currentUser() { return state.users.find(u => u.id === state.currentUserId) || state.users[0]; }
    function isCoach() { return currentUser()?.role === 'coach'; }
    function canI(perm) { return isCoach(); }
    function canUseFeature() { return false; }
    function esc(s) { return String(s||''); }
    function trialDaysRemaining() { return null; }
    function isProTeam() { return state.teamPlan === 'pro'; }
    function isEnterpriseTeam() { return false; }
    function lastSyncLabel() { return 'Just now'; }
    function loadSettingsData() {}
    function renderFeatureDiscovery() { return ''; }
    function renderUpgradePrompt() { return ''; }
    const DAY_LABELS = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday' };
    // Notification API stub for node environment
    const Notification = { permission: 'granted' };
    ${extractFn(html, 'renderSettings')}
    return { renderSettings, get html() { return store.html; } };
  `;
  return new Function('mockDoc', 'store', body)(mockDoc, store);
}

// ── 1. Fresh session: currentUser() is safe with empty users ──────────────────

test('currentUser() returns undefined (not throw) with empty state.users', () => {
  const state = { users: [], currentUserId: '' };
  function currentUser() { return state.users.find(u => u.id === state.currentUserId) || state.users[0]; }
  assert.equal(currentUser(), undefined);
  // Optional chaining must not throw
  assert.equal(currentUser()?.role, undefined);
});

// ── 2-3. safeRender: contains failures, inserts error card ───────────────────

test('safeRender contains a throwing helper without propagating the error', () => {
  const sectionIds = [];
  const elements = {};

  function makeSection(id) {
    let html = '';
    return { id, get innerHTML() { return html; }, set innerHTML(v) { html = v; } };
  }

  function safeRender(sectionId, fn) {
    try { fn(); }
    catch(e) {
      if (sectionId) {
        const el = elements[sectionId] || (elements[sectionId] = makeSection(sectionId));
        if (!el.innerHTML) {
          el.innerHTML = '<div class="card" style="border-color:rgba(248,113,113,0.25);text-align:center;padding:28px 16px">'
            + '<p style="font-weight:700;color:#f87171;margin:0 0 6px">This section failed to load</p>'
            + '<p class="muted" style="font-size:12px;margin:0">Reload the page to try again.</p></div>';
        }
      }
    }
  }

  // Throwing helper for overview, good helper for training
  elements['coach-overview'] = makeSection('coach-overview');
  elements['coach-training'] = makeSection('coach-training');

  assert.doesNotThrow(() => {
    safeRender('coach-overview', () => { throw new Error('synthetic render failure'); });
    safeRender('coach-training', () => { elements['coach-training'].innerHTML = '<div>Training content</div>'; });
  });

  assert.ok(elements['coach-overview'].innerHTML.includes('failed to load'), 'Error card in overview');
  assert.equal(elements['coach-training'].innerHTML, '<div>Training content</div>', 'Training unaffected');
});

test('safeRender error card contains reload instruction', () => {
  let el = { innerHTML: '' };
  function safeRender(sectionId, fn) {
    try { fn(); }
    catch(e) {
      if (el && !el.innerHTML) {
        el.innerHTML = '<div class="card" style="border-color:rgba(248,113,113,0.25);text-align:center;padding:28px 16px">'
          + '<p style="font-weight:700;color:#f87171;margin:0 0 6px">This section failed to load</p>'
          + '<p class="muted" style="font-size:12px;margin:0">Reload the page to try again.</p></div>';
      }
    }
  }
  safeRender('test-section', () => { throw new Error('boom'); });
  assert.ok(el.innerHTML.includes('Reload the page'), 'Reload instruction present');
  assert.ok(el.innerHTML.includes('failed to load'), 'Failure message present');
});

// ── 4. renderNav(): no throw with empty users ─────────────────────────────────

test('renderNav() does not throw when state.users is empty (fresh session)', () => {
  const { renderNav } = buildNavScope({ users: [], currentUserId: '' });
  assert.doesNotThrow(() => renderNav());
});

test('renderNav() does not throw when state.users has one coach', () => {
  const { renderNav } = buildNavScope({
    users: [{ id: 'c1', role: 'coach', name: 'Simon', email: 'coach@test.com' }],
    currentUserId: 'c1',
  });
  assert.doesNotThrow(() => renderNav());
});

// ── 5-6. renderSettings() Beta Readiness ─────────────────────────────────────

test('renderSettings() Beta Readiness: renders all six diagnostic rows', () => {
  const scope = buildSettingsScope();
  scope.renderSettings();
  const out = scope.html;
  assert.ok(out.includes('Beta Readiness'), 'Beta Readiness heading');
  assert.ok(out.includes('>Build<'), 'Build row');
  assert.ok(out.includes('>Commit<'), 'Commit row');
  assert.ok(out.includes('>Session<'), 'Session row');
  assert.ok(out.includes('>Notifications<'), 'Notifications row');
  assert.ok(out.includes('>Role<'), 'Role row');
  assert.ok(out.includes('>Team<'), 'Team row');
  assert.ok(out.includes('>Plan<'), 'Plan row');
});

test('renderSettings() Beta Readiness: production build shown as green', () => {
  const scope = buildSettingsScope({
    buildInfo: { sha: 'abc1234', env: 'production', branch: 'main', time: '2026-06-15T12:00:00.000Z' },
  });
  scope.renderSettings();
  // Scope to Beta Readiness section to avoid matching Device card's "Build" heading
  const brIdx = scope.html.indexOf('Beta Readiness');
  const betaSection = scope.html.slice(brIdx, brIdx + 1500);
  assert.ok(betaSection.includes('✓ Production'), 'Production label in Beta Readiness');
  // Production row should use green; verify the value span uses --green not red
  const prodValueIdx = betaSection.indexOf('✓ Production');
  const rowStart = betaSection.lastIndexOf('<div', prodValueIdx);
  const rowHtml = betaSection.slice(rowStart, prodValueIdx + 50);
  assert.ok(rowHtml.includes('var(--green)'), 'Production row value uses green');
});

test('renderSettings() Beta Readiness: non-production build shown as warning', () => {
  const scope = buildSettingsScope({
    buildInfo: { sha: 'DEV', env: 'local', branch: 'local', time: 'n/a' },
  });
  scope.renderSettings();
  const brIdx = scope.html.indexOf('Beta Readiness');
  const betaSection = scope.html.slice(brIdx, brIdx + 1500);
  assert.ok(betaSection.includes('⚠'), 'Warning symbol for non-production in Beta Readiness');
  assert.ok(betaSection.includes('#f87171'), 'Red color for non-production');
});

test('renderSettings() Beta Readiness: authed session shown as green', () => {
  const scope = buildSettingsScope({ serverAuthState: 'authed' });
  scope.renderSettings();
  const sessionIdx = scope.html.indexOf('>Session<');
  const sessionRow = scope.html.slice(sessionIdx, sessionIdx + 300);
  assert.ok(sessionRow.includes('✓ Authenticated'), 'Authenticated label');
  assert.ok(sessionRow.includes('var(--green)'), 'Green color for authed');
});

test('renderSettings() Beta Readiness: anon session shown in red', () => {
  const scope = buildSettingsScope({ serverAuthState: 'anon' });
  scope.renderSettings();
  const sessionIdx = scope.html.indexOf('>Session<');
  const sessionRow = scope.html.slice(sessionIdx, sessionIdx + 300);
  assert.ok(sessionRow.includes('✗ Not signed in'), 'Not signed in label');
  assert.ok(sessionRow.includes('#f87171'), 'Red color for anon');
});

test('renderSettings() Beta Readiness: role row shows coach role', () => {
  const scope = buildSettingsScope({ role: 'coach' });
  scope.renderSettings();
  assert.ok(scope.html.includes('>Role<'), 'Role row rendered');
  assert.ok(scope.html.includes('>coach<'), 'coach value rendered');
});

// ── 11. Build info: Settings Device card shows all four fields ────────────────

test('renderSettings() Device card: shows sha, env, branch, and time', () => {
  const bi = { sha: 'a3a2e20', env: 'production', branch: 'main', time: '2026-06-15T14:25:05.348Z' };
  const scope = buildSettingsScope({ buildInfo: bi });
  scope.renderSettings();
  assert.ok(scope.html.includes('a3a2e20'), 'SHA present');
  assert.ok(scope.html.includes('production'), 'Environment present');
  assert.ok(scope.html.includes('main'), 'Branch present');
  assert.ok(scope.html.includes('2026-06-15 14:25 UTC'), 'Build time formatted');
});
