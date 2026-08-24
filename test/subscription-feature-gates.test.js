/**
 * Phase 7 — Subscription Feature Gates.
 *
 * Tests the frontend capability layer: isProTeam(), isEnterpriseTeam(),
 * canUseFeature(), and renderUpgradePrompt(). These are pure functions of
 * `state`, so we extract them from index.html and evaluate them in an
 * isolated scope with mocked dependencies.
 *
 * Tests:
 *  1.  isProTeam() → true only for plan:pro + status:active
 *  2.  isProTeam() → false for trial, core, past_due, canceled
 *  3.  isEnterpriseTeam() → true only for plan:enterprise + status:active
 *  4.  canUseFeature('ai_intelligence') → true on Pro, false on Core/Trial
 *  5.  canUseFeature('unlimited_videos') → true on Pro, false on Core/Trial
 *  6.  canUseFeature('advanced_analytics') → true on Pro, false on Core/Trial
 *  7.  canUseFeature('unlimited_push') → true on Pro, false on Core/Trial
 *  8.  canUseFeature('unknown_feature') → true (defaults to accessible)
 *  9.  Enterprise team can use all premium features
 * 10.  renderUpgradePrompt renders PRO label and feature name
 * 11.  renderUpgradePrompt compact mode renders inline layout
 * 12.  renderUpgradePrompt shows Upgrade button when user has manage_subscriptions
 * 13.  renderUpgradePrompt shows admin message when user lacks manage_subscriptions
 * 14.  Core features are NOT blocked (canUseFeature returns true for unlisted keys)
 * 15.  canUseFeature(featureName) functions present in index.html source
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Extract and evaluate subscription helpers from index.html ─────────────────

// Finds the text of a function named `name` from the HTML source.
// Extracts from "function name(" to the matching closing brace.
// Skips past the parameter list before counting braces so that
// destructured params like `{ compact = false }` don't terminate the scan early.
function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  // Advance to the opening '(' of the parameter list
  while (i < source.length && source[i] !== '(') i++;
  // Skip the entire parameter list by matching parens
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === '(') parenDepth++;
    if (source[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }
  // Advance to the opening '{' of the function body
  while (i < source.length && source[i] !== '{') i++;
  // Count braces to find the matching closing '}'
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — could not find closing brace');
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
  if (source[i] === ';') i++;
  return source.slice(start, i);
}

// Build an isolated scope with mocked globals and return the helper functions.
// IMPORTANT: must NOT use a template literal to build the Function body — the
// extracted functions contain backtick template literals that would prematurely
// close an outer template literal. Use string concatenation instead.
// Phase 8: includes PLAN_LEVEL, FEATURE_REGISTRY, and registry helpers since
// canUseFeature() and renderUnavailableNotice() now read from the registry.
function buildScope({ teamPlan = null, teamPlanStatus = null, permissions = [], isCoach = false } = {}) {
  const stateJson = JSON.stringify({ teamPlan, teamPlanStatus });
  const permsJson = JSON.stringify(permissions);

  const body =
    '"use strict";\n' +
    'const state = ' + stateJson + ';\n' +
    'const _myPermissions = ' + permsJson + ';\n' +
    'function isCoach() { return ' + String(isCoach) + '; }\n' +
    'function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }\n' +
    'function canI(perm) { if (_myPermissions === null) return isCoach(); return _myPermissions.includes(perm); }\n' +
    'function recordFeatureUsage() {}\n' +
    extractConst(html, 'PLAN_LEVEL') + '\n' +
    'const BETA_HIDE_COMMERCIAL = false;\n' +
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
    extractFn(html, 'renderUnavailableNotice') + '\n' +
    'return { isProPlan, isProTeam, isEnterpriseTeam, canUseFeature, renderUnavailableNotice };\n';

  return new Function(body)();
}

// ── 1. isProTeam() → true only for plan:pro + status:active ──────────────────

test('isProTeam() returns true for plan:pro status:active', () => {
  const { isProTeam } = buildScope({ teamPlan: 'pro', teamPlanStatus: 'active' });
  assert.equal(isProTeam(), true);
});

// ── 2. isProTeam() → false for other states ───────────────────────────────────

test('isProTeam() returns false for trial, core, past_due, canceled', () => {
  for (const [plan, status] of [
    ['trial', 'active'],
    ['core', 'active'],
    [null, null],
    ['pro', 'past_due'],
    ['pro', 'canceled'],
    ['pro', 'paused'],
  ]) {
    const { isProTeam } = buildScope({ teamPlan: plan, teamPlanStatus: status });
    assert.equal(isProTeam(), false, `Expected false for plan:${plan} status:${status}`);
  }
});

// ── 3. isEnterpriseTeam() ─────────────────────────────────────────────────────

test('isEnterpriseTeam() returns true only for plan:enterprise status:active', () => {
  const yes = buildScope({ teamPlan: 'enterprise', teamPlanStatus: 'active' });
  assert.equal(yes.isEnterpriseTeam(), true);

  for (const [plan, status] of [['pro', 'active'], ['core', 'active'], ['enterprise', 'canceled']]) {
    const no = buildScope({ teamPlan: plan, teamPlanStatus: status });
    assert.equal(no.isEnterpriseTeam(), false, `Expected false for plan:${plan} status:${status}`);
  }
});

// ── 4–7. canUseFeature for each premium feature ───────────────────────────────

for (const feature of ['ai_intelligence', 'unlimited_videos', 'advanced_analytics', 'unlimited_push']) {
  test(`canUseFeature('${feature}') → true on Pro, false on Core/Trial`, () => {
    const pro  = buildScope({ teamPlan: 'pro',   teamPlanStatus: 'active' });
    const core = buildScope({ teamPlan: 'core',  teamPlanStatus: 'active' });
    const trial = buildScope({ teamPlan: 'trial', teamPlanStatus: 'active' });
    const none  = buildScope({ teamPlan: null, teamPlanStatus: null });

    assert.equal(pro.canUseFeature(feature),   true,  `Pro should use ${feature}`);
    assert.equal(core.canUseFeature(feature),  false, `Core should not use ${feature}`);
    assert.equal(trial.canUseFeature(feature), false, `Trial should not use ${feature}`);
    assert.equal(none.canUseFeature(feature),  false, `No-plan should not use ${feature}`);
  });
}

// ── 8. canUseFeature unknown key → true ──────────────────────────────────────

test("canUseFeature('unknown_feature') → true (defaults to accessible)", () => {
  const core = buildScope({ teamPlan: 'core', teamPlanStatus: 'active' });
  assert.equal(core.canUseFeature('unknown_feature'), true,
    'Unknown feature names must not accidentally block access');
});

// ── 9. Enterprise can use all premium features ────────────────────────────────

test('Enterprise team can use all premium features', () => {
  const { canUseFeature } = buildScope({ teamPlan: 'enterprise', teamPlanStatus: 'active' });
  for (const f of ['ai_intelligence', 'unlimited_videos', 'advanced_analytics', 'unlimited_push']) {
    assert.equal(canUseFeature(f), true, `Enterprise should use ${f}`);
  }
});

// ── 10-13. The unavailable notice — UPDATED when the upgrade CTAs were removed ─
//
// These four used to assert an "Upgrade to Pro" button, a PRO badge and an
// "ask your admin to upgrade" fallback. There is no public Pro tier, no pricing
// page and no checkout a club can complete, so every one of those advertised
// something nobody could buy. The gate itself is unchanged — canUseFeature and
// minimumPlan are untouched — only what an ungated feature SAYS has changed.

test('renderUnavailableNotice names the feature and states plainly that it is unavailable', () => {
  const { renderUnavailableNotice } = buildScope({ teamPlan: 'core', teamPlanStatus: 'active', permissions: [] });
  const html = renderUnavailableNotice('advanced_analytics');
  assert.ok(html.includes('Advanced Analytics'), 'names the feature');
  assert.ok(/not available for this club/i.test(html), 'states the fact');
  assert.ok(html.includes('card'), 'uses the ordinary card layout');
});

test('renderUnavailableNotice compact mode renders inline layout', () => {
  const { renderUnavailableNotice } = buildScope({ teamPlan: 'core', teamPlanStatus: 'active', permissions: [] });
  const full    = renderUnavailableNotice('ai_intelligence');
  const compact = renderUnavailableNotice('ai_intelligence', { compact: true });
  assert.ok(compact.length < full.length, 'compact is shorter than full');
  assert.ok(compact.includes('AI Intelligence'), 'compact still names the feature');
});

test('renderUnavailableNotice offers NO upgrade CTA — with or without manage_subscriptions', () => {
  for (const permissions of [['manage_subscriptions'], ['view_squad'], []]) {
    const { renderUnavailableNotice } = buildScope({ teamPlan: 'core', teamPlanStatus: 'active', permissions });
    for (const html of [renderUnavailableNotice('unlimited_videos'),
                        renderUnavailableNotice('unlimited_videos', { compact: true })]) {
      assert.ok(!/Upgrade/i.test(html), `no upgrade verb (permissions: ${permissions.join(',') || 'none'})`);
      assert.ok(!/upgradeFromFeature|settingsUpgradeToPro|create_checkout/.test(html), 'no checkout route');
      assert.ok(!/<button/i.test(html), 'no call to action at all');
    }
  }
});

test('renderUnavailableNotice names no tier, no price and no waitlist', () => {
  const { renderUnavailableNotice } = buildScope({ teamPlan: 'core', teamPlanStatus: 'active', permissions: ['manage_subscriptions'] });
  const html = renderUnavailableNotice('unlimited_push');
  for (const banned of [/\bPro\b/, /\bEnterprise\b/, /\bCore plan\b/, /£|\$|€/, /per month|\/mo\b/i,
                        /waitlist/i, /coming soon/i, /trial/i]) {
    assert.ok(!banned.test(html), `must not mention ${banned}`);
  }
});

// ── 14. Core features default to accessible ───────────────────────────────────

test('Core features are not blocked by canUseFeature', () => {
  const { canUseFeature } = buildScope({ teamPlan: 'core', teamPlanStatus: 'active' });
  const coreFeatures = [
    'availability', 'messaging', 'match_centre', 'team_selection',
    'medical', 'player_database', 'training', 'fixtures',
  ];
  for (const f of coreFeatures) {
    assert.equal(canUseFeature(f), true, `Core feature '${f}' must not be gated`);
  }
});

// ── 15. All helper functions are present in the HTML source ───────────────────

test('All Phase 7 helpers are present in index.html', () => {
  for (const name of ['isProTeam', 'isEnterpriseTeam', 'canUseFeature', 'renderUnavailableNotice']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must be defined in index.html`);
  }
  // All 4 premium feature keys must appear inside canUseFeature
  for (const key of ['ai_intelligence', 'unlimited_videos', 'advanced_analytics', 'unlimited_push']) {
    assert.ok(html.includes(`'${key}'`), `Premium feature key '${key}' must appear in index.html`);
  }
  // Gates must be applied at the actual use sites
  assert.ok(html.includes("canUseFeature('ai_intelligence')"), 'AI gate must be applied in renderWeeklyBriefSlot');
  assert.ok(html.includes("canUseFeature('unlimited_videos')"), 'Video limit gate must be applied');
  assert.ok(html.includes("canUseFeature('advanced_analytics')"), 'Analytics locked card must be applied');
  assert.ok(html.includes("canUseFeature('unlimited_push')"), 'Push limit gate must be applied');
});
