/**
 * Phase 10 — Feature Usage Analytics & Upgrade Intelligence.
 *
 * Tests the in-memory analytics layer extracted from index.html:
 * _featureUsageLog, _USAGE_LOG_MAX, recordFeatureUsage(),
 * getFeatureUsageSummary(), getMostViewedFeatures(), getMostClickedUpgrades(),
 * upgradeFromFeature(), dismissUpgradeCard().
 *
 * Tests:
 *  1.  recordFeatureUsage records an event with all required fields
 *  2.  recordFeatureUsage uses state.teamId, userId, teamPlan from closure
 *  3.  recordFeatureUsage ring-buffer: oldest event dropped when log exceeds cap
 *  4.  recordFeatureUsage null featureId is stored as null (not undefined)
 *  5.  getFeatureUsageSummary returns correct totalEvents
 *  6.  getFeatureUsageSummary returns correct byAction breakdown
 *  7.  getFeatureUsageSummary returns oldestEvent and newestEvent timestamps
 *  8.  getFeatureUsageSummary on empty log returns zero totals and null timestamps
 *  9.  getMostViewedFeatures returns top features by upgrade_prompt_view count
 * 10.  getMostViewedFeatures ignores non-upgrade_prompt_view events
 * 11.  getMostViewedFeatures respects limit parameter (default 5)
 * 12.  getMostViewedFeatures returns empty array when no views recorded
 * 13.  getMostClickedUpgrades returns top features by upgrade_click count
 * 14.  getMostClickedUpgrades ignores non-upgrade_click events
 * 15.  upgradeFromFeature records upgrade_click then calls settingsUpgradeToPro
 * 16.  dismissUpgradeCard records upgrade_prompt_close with featureId
 * 17.  renderUpgradePrompt records upgrade_prompt_view on every call
 * 18.  All analytics functions and constants are present in index.html
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Extraction helpers ────────────────────────────────────────────────────────

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
    // Primitive value — read to end of statement
    while (i < source.length && source[i] !== ';') i++;
    i++;
  }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

// Build an isolated scope with the analytics layer and minimal dependencies.
// Uses string concatenation to avoid backtick collision with extracted source.
function buildScope({
  teamPlan = 'core', teamPlanStatus = 'active',
  teamId = 'team-001', userId = 'user-001',
  permissions = [],
} = {}) {
  const stateJson = JSON.stringify({ teamPlan, teamPlanStatus, teamId, userId });
  const permsJson = JSON.stringify(permissions);

  // Minimal stubs for functions called by the analytics layer helpers.
  const body =
    '"use strict";\n' +
    'const state = ' + stateJson + ';\n' +
    'const _myPermissions = ' + permsJson + ';\n' +
    'let _upgradeCallCount = 0;\n' +
    'function isCoach() { return true; }\n' +
    'function canI(perm) { return _myPermissions.includes(perm); }\n' +
    'function esc(s) { return String(s || ""); }\n' +
    'function settingsUpgradeToPro() { _upgradeCallCount++; }\n' +
    extractConst(html, 'PLAN_LEVEL') + '\n' +
    extractFn(html, 'planLevel') + '\n' +
    extractConst(html, 'FEATURE_REGISTRY') + '\n' +
    extractConst(html, 'CATEGORY_META') + '\n' +
    extractFn(html, 'getFeature') + '\n' +
    extractFn(html, 'getAllFeatures') + '\n' +
    extractFn(html, 'isProPlan') + '\n' +
    extractFn(html, 'isProTeam') + '\n' +
    extractFn(html, 'isEnterpriseTeam') + '\n' +
    extractFn(html, 'canUseFeature') + '\n' +
    extractConst(html, '_featureUsageLog') + '\n' +
    extractConst(html, '_USAGE_LOG_MAX') + '\n' +
    extractFn(html, 'recordFeatureUsage') + '\n' +
    extractFn(html, 'getFeatureUsageSummary') + '\n' +
    extractFn(html, 'getMostViewedFeatures') + '\n' +
    extractFn(html, 'getMostClickedUpgrades') + '\n' +
    extractFn(html, 'upgradeFromFeature') + '\n' +
    extractFn(html, 'dismissUpgradeCard') + '\n' +
    extractFn(html, 'renderUpgradePrompt') + '\n' +
    'return {\n' +
    '  _featureUsageLog, _USAGE_LOG_MAX,\n' +
    '  recordFeatureUsage, getFeatureUsageSummary,\n' +
    '  getMostViewedFeatures, getMostClickedUpgrades,\n' +
    '  upgradeFromFeature, dismissUpgradeCard, renderUpgradePrompt,\n' +
    '  get _upgradeCallCount() { return _upgradeCallCount; },\n' +
    '};\n';

  return new Function(body)();
}

// ── 1. recordFeatureUsage records required fields ─────────────────────────────

test('recordFeatureUsage records event with all required fields', () => {
  const s = buildScope({ teamPlan: 'pro', teamId: 'team-abc', userId: 'user-xyz' });
  s.recordFeatureUsage('upgrade_click', 'ai_intelligence');
  assert.equal(s._featureUsageLog.length, 1);
  const e = s._featureUsageLog[0];
  assert.ok(e.timestamp,                     'timestamp must be set');
  assert.equal(e.teamId,      'team-abc',    'teamId must match state');
  assert.equal(e.userId,      'user-xyz',    'userId must match state');
  assert.equal(e.featureId,   'ai_intelligence', 'featureId must be stored');
  assert.equal(e.action,      'upgrade_click',   'action must be stored');
  assert.equal(e.currentPlan, 'pro',             'currentPlan must come from state.teamPlan');
});

// ── 2. recordFeatureUsage reads state fields at call time ─────────────────────

test('recordFeatureUsage reads teamId, userId and teamPlan from state', () => {
  const s = buildScope({ teamPlan: 'enterprise', teamId: 'team-ent', userId: 'coach-ent' });
  s.recordFeatureUsage('discovery_open', null);
  const e = s._featureUsageLog[0];
  assert.equal(e.currentPlan, 'enterprise');
  assert.equal(e.teamId,      'team-ent');
  assert.equal(e.userId,      'coach-ent');
});

// ── 3. Ring buffer: oldest dropped when log exceeds cap ───────────────────────

test('recordFeatureUsage ring buffer drops oldest event when cap exceeded', () => {
  const s = buildScope();
  const cap = s._USAGE_LOG_MAX;
  // Fill exactly at cap
  for (let i = 0; i < cap; i++) {
    s.recordFeatureUsage('filter_change', 'f' + i);
  }
  assert.equal(s._featureUsageLog.length, cap, 'Should be exactly at cap');
  assert.equal(s._featureUsageLog[0].featureId, 'f0', 'First item should be f0');

  // One more — f0 should drop
  s.recordFeatureUsage('filter_change', 'overflow');
  assert.equal(s._featureUsageLog.length, cap, 'Length must stay at cap');
  assert.equal(s._featureUsageLog[0].featureId, 'f1', 'f0 should have been dropped');
  assert.equal(s._featureUsageLog[cap - 1].featureId, 'overflow', 'overflow should be last');
});

// ── 4. null featureId stored as null ─────────────────────────────────────────

test('recordFeatureUsage stores null featureId as null (not undefined)', () => {
  const s = buildScope();
  s.recordFeatureUsage('discovery_open', null);
  assert.strictEqual(s._featureUsageLog[0].featureId, null);
  s.recordFeatureUsage('billing_portal_open', undefined);
  assert.strictEqual(s._featureUsageLog[1].featureId, null);
});

// ── 5. getFeatureUsageSummary totalEvents ─────────────────────────────────────

test('getFeatureUsageSummary returns correct totalEvents', () => {
  const s = buildScope();
  s.recordFeatureUsage('discovery_open',    null);
  s.recordFeatureUsage('filter_change',     'ai');
  s.recordFeatureUsage('upgrade_click',     'ai_intelligence');
  const summary = s.getFeatureUsageSummary();
  assert.equal(summary.totalEvents, 3);
});

// ── 6. getFeatureUsageSummary byAction breakdown ──────────────────────────────

test('getFeatureUsageSummary returns correct byAction counts', () => {
  const s = buildScope();
  s.recordFeatureUsage('upgrade_prompt_view', 'ai_intelligence');
  s.recordFeatureUsage('upgrade_prompt_view', 'advanced_analytics');
  s.recordFeatureUsage('upgrade_click',       'ai_intelligence');
  s.recordFeatureUsage('filter_change',       'locked');
  const { byAction } = s.getFeatureUsageSummary();
  assert.equal(byAction.upgrade_prompt_view, 2, 'upgrade_prompt_view should be 2');
  assert.equal(byAction.upgrade_click,       1, 'upgrade_click should be 1');
  assert.equal(byAction.filter_change,       1, 'filter_change should be 1');
  assert.equal(byAction.discovery_open, undefined, 'unlogged action should be absent');
});

// ── 7. getFeatureUsageSummary timestamps ─────────────────────────────────────

test('getFeatureUsageSummary returns oldestEvent and newestEvent timestamps', () => {
  const s = buildScope();
  s.recordFeatureUsage('discovery_open', null);
  s.recordFeatureUsage('filter_change',  'core');
  s.recordFeatureUsage('feature_open',   'availability');
  const { oldestEvent, newestEvent } = s.getFeatureUsageSummary();
  assert.ok(oldestEvent, 'oldestEvent must be set');
  assert.ok(newestEvent, 'newestEvent must be set');
  // Oldest should be ≤ newest (ISO strings compare lexicographically)
  assert.ok(oldestEvent <= newestEvent, 'oldest must be before or equal to newest');
  assert.equal(oldestEvent, s._featureUsageLog[0].timestamp);
  assert.equal(newestEvent, s._featureUsageLog[s._featureUsageLog.length - 1].timestamp);
});

// ── 8. getFeatureUsageSummary on empty log ────────────────────────────────────

test('getFeatureUsageSummary on empty log returns zero totals and null timestamps', () => {
  const s = buildScope();
  const summary = s.getFeatureUsageSummary();
  assert.equal(summary.totalEvents, 0);
  assert.deepEqual(summary.byAction, {});
  assert.strictEqual(summary.oldestEvent, null);
  assert.strictEqual(summary.newestEvent, null);
});

// ── 9. getMostViewedFeatures top features ────────────────────────────────────

test('getMostViewedFeatures returns features sorted by upgrade_prompt_view count', () => {
  const s = buildScope();
  for (let i = 0; i < 3; i++) s.recordFeatureUsage('upgrade_prompt_view', 'ai_intelligence');
  for (let i = 0; i < 1; i++) s.recordFeatureUsage('upgrade_prompt_view', 'advanced_analytics');
  for (let i = 0; i < 2; i++) s.recordFeatureUsage('upgrade_prompt_view', 'unlimited_push');
  const top = s.getMostViewedFeatures(3);
  assert.equal(top[0].featureId, 'ai_intelligence',   'Most viewed should be first');
  assert.equal(top[0].views,     3);
  assert.equal(top[1].featureId, 'unlimited_push',    'Second most viewed should be second');
  assert.equal(top[1].views,     2);
  assert.equal(top[2].featureId, 'advanced_analytics','Third should be third');
  assert.equal(top[2].views,     1);
});

// ── 10. getMostViewedFeatures ignores non-view events ─────────────────────────

test('getMostViewedFeatures ignores events that are not upgrade_prompt_view', () => {
  const s = buildScope();
  s.recordFeatureUsage('upgrade_click',     'ai_intelligence'); // not a view
  s.recordFeatureUsage('feature_open',      'availability');    // not a view
  s.recordFeatureUsage('upgrade_prompt_view', 'unlimited_push'); // is a view
  const top = s.getMostViewedFeatures();
  assert.equal(top.length, 1, 'Only one viewed feature');
  assert.equal(top[0].featureId, 'unlimited_push');
  assert.ok(!top.some(f => f.featureId === 'ai_intelligence'), 'upgrade_click must not appear as viewed');
});

// ── 11. getMostViewedFeatures limit parameter ─────────────────────────────────

test('getMostViewedFeatures respects limit and defaults to 5', () => {
  const s = buildScope();
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach(id => {
    s.recordFeatureUsage('upgrade_prompt_view', id);
  });
  const top5 = s.getMostViewedFeatures();
  assert.equal(top5.length, 5, 'Default limit is 5');
  const top3 = s.getMostViewedFeatures(3);
  assert.equal(top3.length, 3, 'Custom limit should be respected');
});

// ── 12. getMostViewedFeatures on empty log ────────────────────────────────────

test('getMostViewedFeatures returns empty array when no views recorded', () => {
  const s = buildScope();
  s.recordFeatureUsage('discovery_open', null);
  const top = s.getMostViewedFeatures();
  assert.deepEqual(top, []);
});

// ── 13. getMostClickedUpgrades top features ───────────────────────────────────

test('getMostClickedUpgrades returns features sorted by upgrade_click count', () => {
  const s = buildScope();
  for (let i = 0; i < 5; i++) s.recordFeatureUsage('upgrade_click', 'unlimited_videos');
  for (let i = 0; i < 2; i++) s.recordFeatureUsage('upgrade_click', 'ai_intelligence');
  const top = s.getMostClickedUpgrades(2);
  assert.equal(top[0].featureId, 'unlimited_videos', 'Most clicked should be first');
  assert.equal(top[0].clicks,    5);
  assert.equal(top[1].featureId, 'ai_intelligence');
  assert.equal(top[1].clicks,    2);
});

// ── 14. getMostClickedUpgrades ignores non-upgrade events ─────────────────────

test('getMostClickedUpgrades ignores non-upgrade_click events', () => {
  const s = buildScope();
  s.recordFeatureUsage('upgrade_prompt_view', 'ai_intelligence'); // not a click
  s.recordFeatureUsage('filter_change',       'locked');           // not a click
  s.recordFeatureUsage('upgrade_click',       'advanced_analytics'); // is a click
  const top = s.getMostClickedUpgrades();
  assert.equal(top.length, 1);
  assert.equal(top[0].featureId, 'advanced_analytics');
  assert.ok(!top.some(f => f.featureId === 'ai_intelligence'), 'view events must not appear');
});

// ── 15. upgradeFromFeature records click and delegates to settingsUpgradeToPro ─

test('upgradeFromFeature records upgrade_click and calls settingsUpgradeToPro', () => {
  const s = buildScope({ permissions: ['manage_subscriptions'] });
  s.upgradeFromFeature('unlimited_push');
  // Should have recorded the upgrade click
  assert.equal(s._featureUsageLog.length, 1);
  assert.equal(s._featureUsageLog[0].action,    'upgrade_click');
  assert.equal(s._featureUsageLog[0].featureId, 'unlimited_push');
  // Should have called settingsUpgradeToPro
  assert.equal(s._upgradeCallCount, 1, 'settingsUpgradeToPro should have been called once');
});

// ── 16. dismissUpgradeCard records upgrade_prompt_close ───────────────────────

test('dismissUpgradeCard records upgrade_prompt_close event', () => {
  const s = buildScope();
  // Provide a mock button with no closest() to avoid DOM dependency
  const mockBtn = { closest: function() { return null; }, parentElement: null };
  s.dismissUpgradeCard(mockBtn, 'ai_intelligence');
  assert.equal(s._featureUsageLog.length, 1);
  assert.equal(s._featureUsageLog[0].action,    'upgrade_prompt_close');
  assert.equal(s._featureUsageLog[0].featureId, 'ai_intelligence');
});

// ── 17. renderUpgradePrompt records upgrade_prompt_view ───────────────────────

test('renderUpgradePrompt calls recordFeatureUsage with upgrade_prompt_view', () => {
  const s = buildScope({ teamPlan: 'core', permissions: [] });
  s.renderUpgradePrompt('advanced_analytics');
  assert.equal(s._featureUsageLog.length, 1);
  assert.equal(s._featureUsageLog[0].action,    'upgrade_prompt_view');
  assert.equal(s._featureUsageLog[0].featureId, 'advanced_analytics');
  // Second call records a second event
  s.renderUpgradePrompt('ai_intelligence');
  assert.equal(s._featureUsageLog.length, 2);
  assert.equal(s._featureUsageLog[1].featureId, 'ai_intelligence');
});

// ── 18. All analytics symbols present in index.html ──────────────────────────

test('All Phase 10 analytics functions and constants are defined in index.html', () => {
  assert.ok(html.includes('const _featureUsageLog ='),       '_featureUsageLog must be defined');
  assert.ok(html.includes('const _USAGE_LOG_MAX'),           '_USAGE_LOG_MAX must be defined');
  assert.ok(html.includes('function recordFeatureUsage('),   'recordFeatureUsage must be defined');
  assert.ok(html.includes('function getFeatureUsageSummary('), 'getFeatureUsageSummary must be defined');
  assert.ok(html.includes('function getMostViewedFeatures('), 'getMostViewedFeatures must be defined');
  assert.ok(html.includes('function getMostClickedUpgrades('), 'getMostClickedUpgrades must be defined');
  assert.ok(html.includes('function upgradeFromFeature('),   'upgradeFromFeature must be defined');
  assert.ok(html.includes('function dismissUpgradeCard('),   'dismissUpgradeCard must be defined');
  // Verify call sites are instrumented
  assert.ok(html.includes("recordFeatureUsage('discovery_open'"),    'discovery_open instrumented');
  assert.ok(html.includes("recordFeatureUsage('filter_change'"),     'filter_change instrumented');
  assert.ok(html.includes("recordFeatureUsage('feature_open'"),      'feature_open instrumented');
  assert.ok(html.includes("recordFeatureUsage('upgrade_prompt_view'"), 'upgrade_prompt_view instrumented');
  assert.ok(html.includes("recordFeatureUsage('upgrade_click'"),     'upgrade_click instrumented');
  assert.ok(html.includes("recordFeatureUsage('billing_portal_open'"), 'billing_portal_open instrumented');
  assert.ok(html.includes("recordFeatureUsage('upgrade_prompt_close'"), 'upgrade_prompt_close instrumented');
  // Verify dismiss button in full upgrade card
  assert.ok(html.includes('dismissUpgradeCard(this,'),        'dismiss button must be in renderUpgradePrompt');
  assert.ok(html.includes('data-upgrade-card='),              'data-upgrade-card attribute must be present');
});
