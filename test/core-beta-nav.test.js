// Core Beta — simplified coach navigation (Phase 1).
//
// Verifies the beta sidebar allow-list:
//   - BETA_SIMPLE_NAV is enabled and BETA_NAV_IDS holds exactly the 8 beta items.
//   - renderNav() renders ONLY those 8 sidebar buttons for a coach.
//   - Advanced / club / automation surfaces are withheld from the sidebar.
//   - Nothing is deleted: every original coachSections entry still exists, so
//     the hidden sections remain reachable programmatically.
//
// Mechanism is a pure nav-level filter — no API, auth, identity, storage or
// availability-logic change. Flip BETA_SIMPLE_NAV to false to restore full nav.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Workflow order: Overview → Availability → Training → Match Centre → Messages
// → Members → Medical → Settings.
const BETA_IDS = ['overview', 'message', 'training', 'matchday', 'messages', 'players', 'medical', 'settings'];
const HIDDEN_IDS = ['fixtures', 'selection', 'admin', 'club', 'reports', 'calendar', 'qa', 'beta', 'search'];

function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's'));
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function extractArrayConst(name) {
  const start = src.indexOf(`const ${name} = [`);
  if (start === -1) throw new Error(`Array const ${name} not found`);
  let depth = 0, i = start + `const ${name} = `.length;
  while (i < src.length) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  return src.slice(start, i) + ';';
}

// ── Static structure ────────────────────────────────────────────────────────

test('BETA_SIMPLE_NAV is enabled on the Core Beta branch', () => {
  assert.match(src, /const BETA_SIMPLE_NAV\s*=\s*true\s*;/,
    'beta navigation must be ON for the simplified beta');
});

test('BETA_NAV_IDS is exactly the 8 beta sections', () => {
  const scope = new Function(`${extractArrayConst('BETA_NAV_IDS')} return BETA_NAV_IDS;`)();
  assert.deepEqual(scope, BETA_IDS);
});

test('no hidden section leaks into the beta allow-list', () => {
  const scope = new Function(`${extractArrayConst('BETA_NAV_IDS')} return BETA_NAV_IDS;`)();
  for (const id of HIDDEN_IDS) {
    assert.ok(!scope.includes(id), `hidden section "${id}" must not be in BETA_NAV_IDS`);
  }
});

test('nothing deleted: every hidden section still exists in coachSections', () => {
  const coachSections = new Function(`${extractArrayConst('coachSections')} return coachSections;`)();
  const ids = coachSections.map(([id]) => id);
  for (const id of [...BETA_IDS, ...HIDDEN_IDS]) {
    assert.ok(ids.includes(id), `coachSections must still contain "${id}" (hidden, not removed)`);
  }
});

// ── renderNav() behaviour ────────────────────────────────────────────────────

function buildNavScope() {
  const store = {};
  const makeEl = () => ({ innerHTML: '', classList: { toggle() {}, add() {}, remove() {} },
    style: {}, setAttribute() {}, classList_: {}, disabled: false, title: '', textContent: '' });
  const mockDoc = {
    getElementById(id) { if (!store[id]) store[id] = makeEl(); return store[id]; },
    querySelector() { return null; }, querySelectorAll() { return []; }, title: '',
  };
  const state = {
    users: [{ id: 'c1', role: 'coach', name: 'Coach' }], currentUserId: 'c1',
    players: [], schedule: [], activeView: 'coach', activeCoachSection: 'overview',
    activePlayerSection: 'availability', clubName: 'Test RFC',
  };
  const body = `"use strict";
    const document = mockDoc;
    const state = ${JSON.stringify(state)};
    let _myPermissions = null; let _myMemberships = null; let _chatNavUnread = 0;
    let authTab = 'closed';
    const window = { _devLoginEnabled: false };
    function currentUser() { return state.users.find(u => u.id === state.currentUserId) || state.users[0]; }
    function isCoach() { return currentUser()?.role === 'coach'; }
    function canI() { return isCoach(); }   // grant all perms — isolate the beta filter
    function icon() { return ''; }
    function esc(s) { return String(s||''); }
    function sessionKey(id) { return 'sess_' + id; }
    function canonicalSwitchAccounts() { return []; }
    function renderPushSidebar() {}
    function updateNavBadge() {}
    ${extractArrayConst('coachSections')}
    ${extractArrayConst('BETA_NAV_IDS')}
    const BETA_SIMPLE_NAV = true;
    const playerSections = [['availability','Availability']];
    const SECTION_ICONS = {};
    ${extractFn('renderNav')}
    renderNav();
    return document.getElementById('coachNav').innerHTML;
  `;
  return new Function('mockDoc', body)(mockDoc);
}

test('renderNav() shows only the 8 beta buttons for a coach', () => {
  const html = buildNavScope();
  for (const id of BETA_IDS) {
    assert.ok(html.includes(`setSection('coach','${id}')`), `beta nav must include "${id}"`);
  }
});

test('renderNav() hides advanced / club / automation sections from the sidebar', () => {
  const html = buildNavScope();
  for (const id of HIDDEN_IDS) {
    assert.ok(!html.includes(`setSection('coach','${id}')`), `beta nav must hide "${id}"`);
  }
});

test('renderNav() renders exactly 8 coach buttons', () => {
  const html = buildNavScope();
  const count = (html.match(/setSection\('coach',/g) || []).length;
  assert.equal(count, 8);
});

test('renderNav() renders the beta buttons in BETA_NAV_IDS (workflow) order', () => {
  const html = buildNavScope();
  const order = [...html.matchAll(/setSection\('coach','([^']+)'\)/g)].map(m => m[1]);
  assert.deepEqual(order, BETA_IDS);
});
