/**
 * Phase 8 — Feature Catalogue and Subscription Registry.
 *
 * Tests the FEATURE_REGISTRY constant and all registry helper functions
 * extracted from index.html and evaluated in an isolated scope.
 *
 * Tests:
 *  1.  Registry contains exactly 14 features (4 active + 10 coming soon)
 *  2.  No duplicate IDs in the registry
 *  3.  All required fields are present on every entry
 *  4.  All minimumPlan values are valid plan keys
 *  5.  All category values are non-empty strings
 *  6.  comingSoon is either true or absent (never false)
 *  7.  getFeature(id) returns the correct entry
 *  8.  getFeature('unknown') returns null
 *  9.  getAllFeatures() returns all 14 entries (immutable snapshot)
 * 10.  canUseFeature('unknown_feature') returns true (safe default)
 * 11.  canUseFeature reads minimumPlan from registry, not hardcoded switch
 * 12.  Pro team can use all pro-minimum features
 * 13.  Core team cannot use any pro-minimum feature
 * 14.  Enterprise team can use enterprise-minimum features that Pro cannot
 * 15.  getLockedFeatures('core') includes all pro and enterprise features
 * 16.  getLockedFeatures('pro') includes only enterprise features
 * 17.  getLockedFeatures('enterprise') is empty
 * 18.  getAvailableFeatures('pro') includes all pro-minimum active features
 * 19.  getAvailableFeatures('core') excludes all premium features
 * 20.  planLevel hierarchy: core < pro < enterprise
 * 21.  renderUpgradePrompt pulls displayName from registry
 * 22.  renderUpgradePrompt pulls upgradeMessage from registry
 * 23.  Phase 7 feature-gates still pass: canUseFeature calls return correct values
 * 24.  All Phase 8 helpers are defined in index.html source
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Extraction helpers ────────────────────────────────────────────────────────

// Extract a function by name, correctly skipping the parameter list before
// counting body braces (handles destructured params like { compact = false }).
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
  throw new Error('function ' + name + ' — no closing brace');
}

// Extract a const declaration whose value starts with [ or {.
// Counts only the outer bracket/brace type to correctly handle nested structures.
function extractConst(source, name) {
  const marker = '    const ' + name + ' = ';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('const ' + name + ' not found');
  let i = start + marker.length;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n')) i++;
  const opener = source[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (!closer) throw new Error('const ' + name + ': unexpected opener ' + JSON.stringify(opener));
  let depth = 0;
  while (i < source.length) {
    if (source[i] === opener) depth++;
    else if (source[i] === closer) { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  // Consume trailing semicolon if present
  if (source[i] === ';') i++;
  return source.slice(start, i);
}

// Build an isolated evaluation scope containing all registry functions.
// IMPORTANT: uses string concatenation — NOT a template literal — because
// the extracted source contains backtick strings that would close an outer
// template literal prematurely.
function buildScope({ teamPlan = null, teamPlanStatus = null, permissions = [], isCoach: isCoachVal = false } = {}) {
  const stateJson = JSON.stringify({ teamPlan, teamPlanStatus });
  const permsJson = JSON.stringify(permissions);

  const body =
    '"use strict";\n' +
    'const state = ' + stateJson + ';\n' +
    'const _myPermissions = ' + permsJson + ';\n' +
    'function isCoach() { return ' + String(isCoachVal) + '; }\n' +
    'function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }\n' +
    'function canI(perm) { return (_myPermissions || []).includes(perm); }\n' +
    'function settingsUpgradeToPro() {}\n' +
    'function recordFeatureUsage() {}\n' +
    'function upgradeFromFeature(id) { settingsUpgradeToPro(); }\n' +
    extractConst(html, 'PLAN_LEVEL') + '\n' +
    extractFn(html, 'planLevel') + '\n' +
    extractConst(html, 'FEATURE_REGISTRY') + '\n' +
    extractFn(html, 'getFeature') + '\n' +
    extractFn(html, 'getAllFeatures') + '\n' +
    extractFn(html, 'getLockedFeatures') + '\n' +
    extractFn(html, 'getAvailableFeatures') + '\n' +
    extractFn(html, 'isProPlan') + '\n' +
    extractFn(html, 'isProTeam') + '\n' +
    extractFn(html, 'isEnterpriseTeam') + '\n' +
    extractFn(html, 'canUseFeature') + '\n' +
    extractFn(html, 'renderUpgradePrompt') + '\n' +
    'return { FEATURE_REGISTRY, PLAN_LEVEL, planLevel, getFeature, getAllFeatures, ' +
    '         getLockedFeatures, getAvailableFeatures, isProTeam, isEnterpriseTeam, ' +
    '         canUseFeature, renderUpgradePrompt };\n';

  return new Function(body)();
}

// Convenience: build a scope for a given plan state
const proScope   = buildScope({ teamPlan: 'pro',        teamPlanStatus: 'active' });
const coreScope  = buildScope({ teamPlan: 'core',       teamPlanStatus: 'active' });
const trialScope = buildScope({ teamPlan: 'trial',      teamPlanStatus: 'active' });
const entScope   = buildScope({ teamPlan: 'enterprise', teamPlanStatus: 'active' });
const noneScope  = buildScope({ teamPlan: null,         teamPlanStatus: null });

const allFeatures = proScope.getAllFeatures();

// ── 1. Registry size ──────────────────────────────────────────────────────────

test('Registry contains exactly 22 features (8 core + 4 active pro + 10 coming soon)', () => {
  assert.equal(allFeatures.length, 22,
    'Expected 22 features; got ' + allFeatures.length + ': ' + allFeatures.map(f => f.id).join(', '));
  const coreFeatures = allFeatures.filter(f => f.minimumPlan === 'core');
  const activePro    = allFeatures.filter(f => !f.comingSoon && f.minimumPlan !== 'core');
  const comingSoon   = allFeatures.filter(f => f.comingSoon);
  assert.equal(coreFeatures.length, 8,  'Expected 8 core features');
  assert.equal(activePro.length,    4,  'Expected 4 active pro features');
  assert.equal(comingSoon.length,   10, 'Expected 10 coming-soon features');
});

// ── 2. No duplicate IDs ───────────────────────────────────────────────────────

test('No duplicate IDs in the registry', () => {
  const ids = allFeatures.map(f => f.id);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size,
    'Duplicate IDs: ' + ids.filter((id, i) => ids.indexOf(id) !== i).join(', '));
});

// ── 3. All required fields are present ───────────────────────────────────────

test('Every feature entry has all required fields', () => {
  const REQUIRED = ['id', 'displayName', 'description', 'minimumPlan', 'category', 'upgradeMessage'];
  for (const f of allFeatures) {
    for (const field of REQUIRED) {
      assert.ok(f[field], f.id + ' is missing required field: ' + field);
    }
  }
});

// ── 4. All minimumPlan values are known plan keys ─────────────────────────────

test('All minimumPlan values are valid plan keys', () => {
  const VALID_PLANS = new Set(['core', 'pro', 'enterprise']);
  for (const f of allFeatures) {
    assert.ok(VALID_PLANS.has(f.minimumPlan),
      f.id + ': invalid minimumPlan "' + f.minimumPlan + '"');
  }
});

// ── 5. All categories are non-empty strings ────────────────────────────────────

test('All category values are non-empty strings from the known set', () => {
  const VALID_CATS = new Set([
    'coaching', 'intelligence', 'video', 'analytics',
    'communication', 'player_development', 'club_intelligence',
  ]);
  for (const f of allFeatures) {
    assert.ok(typeof f.category === 'string' && f.category.length > 0,
      f.id + ' has empty category');
    assert.ok(VALID_CATS.has(f.category),
      f.id + ': unknown category "' + f.category + '"');
  }
});

// ── 6. comingSoon is boolean true or absent ────────────────────────────────────

test('comingSoon is either true or absent (never false)', () => {
  for (const f of allFeatures) {
    if ('comingSoon' in f) {
      assert.strictEqual(f.comingSoon, true, f.id + ': comingSoon must be true when present');
    }
  }
});

// ── 7. getFeature returns the correct entry ───────────────────────────────────

test('getFeature(id) returns the matching registry entry', () => {
  for (const f of allFeatures) {
    const found = proScope.getFeature(f.id);
    assert.ok(found, 'getFeature(' + f.id + ') returned null');
    assert.equal(found.id, f.id);
    assert.equal(found.displayName, f.displayName);
  }
});

// ── 8. getFeature unknown → null ─────────────────────────────────────────────

test('getFeature("unknown_feature") returns null', () => {
  assert.equal(proScope.getFeature('unknown_feature'), null);
  assert.equal(proScope.getFeature(''), null);
  assert.equal(proScope.getFeature(undefined), null);
});

// ── 9. getAllFeatures returns a snapshot ──────────────────────────────────────

test('getAllFeatures() returns all 22 entries as an independent array', () => {
  const a = proScope.getAllFeatures();
  const b = proScope.getAllFeatures();
  assert.equal(a.length, 22);
  assert.notEqual(a, b, 'getAllFeatures should return a new array each call');
});

// ── 10. canUseFeature unknown → true ─────────────────────────────────────────

test('canUseFeature("unknown_feature") → true on all plans', () => {
  for (const scope of [proScope, coreScope, trialScope, noneScope]) {
    assert.equal(scope.canUseFeature('unknown_feature'), true,
      'Unknown feature must default to accessible');
  }
});

// ── 11. canUseFeature reads from registry ─────────────────────────────────────

test('canUseFeature reads minimumPlan from registry (not a hardcoded switch)', () => {
  // Verify by checking a coming-soon feature that is NOT in the old switch statement
  // sc_ai is registered as minimumPlan:'pro' — Pro can use it, Core cannot
  assert.equal(proScope.canUseFeature('sc_ai'),  true,  'Pro should pass sc_ai registry gate');
  assert.equal(coreScope.canUseFeature('sc_ai'), false, 'Core should fail sc_ai registry gate');
});

// ── 12. Pro team can use all pro-minimum features ─────────────────────────────

test('Pro team can use all features with minimumPlan:pro', () => {
  const proFeatures = allFeatures.filter(f => f.minimumPlan === 'pro');
  for (const f of proFeatures) {
    assert.equal(proScope.canUseFeature(f.id), true, 'Pro should use ' + f.id);
  }
});

// ── 13. Core team cannot use any premium feature ──────────────────────────────

test('Core team cannot use any pro or enterprise feature', () => {
  const premiumFeatures = allFeatures.filter(f => f.minimumPlan !== 'core');
  for (const f of premiumFeatures) {
    assert.equal(coreScope.canUseFeature(f.id), false, 'Core should not use ' + f.id);
    assert.equal(trialScope.canUseFeature(f.id), false, 'Trial should not use ' + f.id);
    assert.equal(noneScope.canUseFeature(f.id), false, 'No-plan should not use ' + f.id);
  }
});

// ── 14. Enterprise can use enterprise features that Pro cannot ─────────────────

test('Enterprise team can use enterprise-minimum features; Pro cannot', () => {
  const entFeatures = allFeatures.filter(f => f.minimumPlan === 'enterprise');
  assert.ok(entFeatures.length > 0, 'Expected at least one enterprise-minimum feature');
  for (const f of entFeatures) {
    assert.equal(entScope.canUseFeature(f.id),  true,  'Enterprise should use ' + f.id);
    assert.equal(proScope.canUseFeature(f.id),  false, 'Pro should NOT use ' + f.id);
    assert.equal(coreScope.canUseFeature(f.id), false, 'Core should NOT use ' + f.id);
  }
});

// ── 15. getLockedFeatures('core') includes all premium features ────────────────

test("getLockedFeatures('core') includes all pro and enterprise features", () => {
  const locked = coreScope.getLockedFeatures('core');
  const premiumIds = allFeatures.filter(f => f.minimumPlan !== 'core').map(f => f.id);
  for (const id of premiumIds) {
    assert.ok(locked.some(f => f.id === id), 'getLockedFeatures(core) should include ' + id);
  }
});

// ── 16. getLockedFeatures('pro') includes only enterprise features ─────────────

test("getLockedFeatures('pro') includes only enterprise-minimum features", () => {
  const locked = proScope.getLockedFeatures('pro');
  const entFeatures = allFeatures.filter(f => f.minimumPlan === 'enterprise');
  assert.equal(locked.length, entFeatures.length,
    'getLockedFeatures(pro) should contain only enterprise features; got: ' + locked.map(f => f.id).join(', '));
  for (const f of locked) {
    assert.equal(f.minimumPlan, 'enterprise', 'Locked feature for Pro should be enterprise-minimum: ' + f.id);
  }
});

// ── 17. getLockedFeatures('enterprise') is empty ──────────────────────────────

test("getLockedFeatures('enterprise') is empty", () => {
  const locked = entScope.getLockedFeatures('enterprise');
  assert.equal(locked.length, 0,
    'Enterprise should have no locked features; got: ' + locked.map(f => f.id).join(', '));
});

// ── 18. getAvailableFeatures('pro') includes all pro-minimum features ──────────

test("getAvailableFeatures('pro') includes all pro-minimum features", () => {
  const available = proScope.getAvailableFeatures('pro');
  const proFeatures = allFeatures.filter(f => f.minimumPlan === 'pro');
  for (const f of proFeatures) {
    assert.ok(available.some(a => a.id === f.id), 'getAvailableFeatures(pro) should include ' + f.id);
  }
  // Must NOT include enterprise-minimum features
  const entFeatures = allFeatures.filter(f => f.minimumPlan === 'enterprise');
  for (const f of entFeatures) {
    assert.ok(!available.some(a => a.id === f.id), 'getAvailableFeatures(pro) must NOT include ' + f.id);
  }
});

// ── 19. getAvailableFeatures('core') excludes all premium features ─────────────

test("getAvailableFeatures('core') excludes all premium features", () => {
  const available = coreScope.getAvailableFeatures('core');
  const premiumIds = allFeatures.filter(f => f.minimumPlan !== 'core').map(f => f.id);
  for (const id of premiumIds) {
    assert.ok(!available.some(a => a.id === id),
      'getAvailableFeatures(core) must NOT include premium feature ' + id);
  }
});

// ── 20. planLevel hierarchy ───────────────────────────────────────────────────

test('planLevel hierarchy: trial = core < pro < enterprise', () => {
  const { planLevel } = proScope;
  assert.equal(planLevel('trial'),      0);
  assert.equal(planLevel('core'),       0);
  assert.equal(planLevel('pro'),        1);
  assert.equal(planLevel('enterprise'), 2);
  assert.equal(planLevel('unknown'),    0, 'Unknown plans default to level 0');
});

// ── 21. renderUpgradePrompt pulls displayName from registry ───────────────────

test('renderUpgradePrompt uses displayName from registry', () => {
  for (const f of allFeatures) {
    const html = coreScope.renderUpgradePrompt(f.id);
    assert.ok(html.includes(f.displayName),
      f.id + ': renderUpgradePrompt should include displayName "' + f.displayName + '"');
  }
});

// ── 22. renderUpgradePrompt pulls upgradeMessage from registry ────────────────

test('renderUpgradePrompt uses upgradeMessage from registry', () => {
  for (const f of allFeatures) {
    const html = coreScope.renderUpgradePrompt(f.id);
    assert.ok(html.includes(f.upgradeMessage),
      f.id + ': renderUpgradePrompt should include upgradeMessage "' + f.upgradeMessage + '"');
  }
});

// ── 23. Phase 7 active features still gate correctly ──────────────────────────

test('Phase 7 active feature gates still return correct values via registry', () => {
  const active = ['ai_intelligence', 'unlimited_videos', 'advanced_analytics', 'unlimited_push'];
  for (const id of active) {
    assert.equal(proScope.canUseFeature(id),   true,  'Pro should pass ' + id);
    assert.equal(coreScope.canUseFeature(id),  false, 'Core should fail ' + id);
    assert.equal(trialScope.canUseFeature(id), false, 'Trial should fail ' + id);
  }
});

// ── 24. All Phase 8 helpers present in index.html ────────────────────────────

test('All Phase 8 helpers and registry are defined in index.html', () => {
  assert.ok(html.includes('const PLAN_LEVEL ='),         'PLAN_LEVEL must be defined');
  assert.ok(html.includes('function planLevel('),         'planLevel must be defined');
  assert.ok(html.includes('const FEATURE_REGISTRY ='),   'FEATURE_REGISTRY must be defined');
  assert.ok(html.includes('function getFeature('),        'getFeature must be defined');
  assert.ok(html.includes('function getAllFeatures('),    'getAllFeatures must be defined');
  assert.ok(html.includes('function getLockedFeatures('), 'getLockedFeatures must be defined');
  assert.ok(html.includes('function getAvailableFeatures('), 'getAvailableFeatures must be defined');
  // All 22 feature IDs are registered
  const expectedIds = [
    // Core
    'availability', 'match_centre', 'training_planner', 'player_database',
    'fixtures', 'medical', 'messaging', 'video_library',
    // Active Pro
    'ai_intelligence', 'unlimited_videos', 'advanced_analytics', 'unlimited_push',
    // Coming Soon
    'sc_ai', 'player_dev_ai', 'match_prep_intelligence', 'coach_dna',
    'season_intelligence', 'club_intelligence', 'digital_twin',
    'ai_assistant', 'recruitment_intelligence', 'video_intelligence',
  ];
  for (const id of expectedIds) {
    assert.ok(html.includes("id: '" + id + "'"), 'Registry must contain id: ' + id);
  }
});
