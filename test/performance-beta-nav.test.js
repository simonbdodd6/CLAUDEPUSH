/**
 * PERFORMANCE — BETA NAVIGATION MARKER.
 *
 * Performance is pre-release, so the main navigation says so. These pin that
 * the marker is DISPLAY ONLY: it must never change a section id, a route, a
 * permission or an entitlement, must appear in both the coach and the entitled
 * player shell, and must not spread to any other nav entry.
 *
 * Kept in its own file so the badge can be reverted independently of the
 * Performance group-isolation fix.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

// ── I / J / K — the BETA badge ────────────────────────────────────────────

test('I+J: Performance carries a BETA badge in BOTH coach and player navigation', () => {
  const badge = fn('navBetaBadge');
  assert.match(badge, /beta/i, 'the badge renders the word beta (displayed uppercase by .nav-beta)');
  assert.match(badge, /nav-beta/, 'as the styled badge element');
  // The section it applies to is declared in one list, next to the helper.
  assert.match(src, /const NAV_BETA_IDS = \['performance'\];/,
    'performance — and only performance — is marked beta');
  // Both nav builders must call it.
  const nav = fn('renderNav');
  const calls = (nav.match(/navBetaBadge\(/g) || []).length;
  assert.equal(calls, 2, `both coach and player nav must render the badge (found ${calls} call sites)`);
});

test('I2: the badge is display-only — no id, routing or entitlement change', () => {
  const badge = fn('navBetaBadge');
  assert.doesNotMatch(badge, /setSection|canUseFeature|teamPlan|SECTION_FEATURE_MAP|href/,
    'the badge must not touch routing or entitlement');
  // The section id and its registrations are untouched.
  assert.match(src, /const SECTION_FEATURE_MAP = \{ performance: 'performance' \};/);
  assert.match(src, /SECTION_PERM_MAP = \{[^}]*performance: 'publish_training'/);
  assert.match(src, /\["performance", "Performance"\]/, 'the section label/id pair is unchanged');
  assert.match(src, /if \(canUseFeature\('performance'\)\) base\.push\(\['performance', 'Performance'\]\)/,
    'player nav still gates on entitlement exactly as before');
});

test('K: BETA is applied to Performance ONLY — no other nav entry gains a badge', () => {
  const list = src.match(/const NAV_BETA_IDS = \[([^\]]*)\];/)[1];
  assert.equal(list.trim(), "'performance'", 'exactly one section is marked beta');
  for (const id of ['training', 'matchday', 'medical', 'messages', 'players', 'settings', 'overview', 'availability']) {
    assert.equal(list.includes(id), false, `${id} must not get a BETA badge`);
  }
});

test('K2: the badge uses existing design tokens and adds no dependency', () => {
  assert.match(src, /\.nav-beta\s*\{/, 'a styled class, not appended text');
  const css = src.slice(src.indexOf('.nav-beta {'), src.indexOf('.nav-beta {') + 500);
  assert.match(css, /var\(--brand-soft\)/, 'brand token background');
  assert.match(css, /var\(--brand-line\)/, 'brand token border');
  assert.match(css, /var\(--brand-2\)/, 'brand token text');
  assert.doesNotMatch(css, /#[0-9a-f]{6}/i, 'no hard-coded colour outside the token system');
  // No new dependency: the badge is markup + CSS only. (The single pre-existing
  // cdnjs reference is the SheetJS loader and is not touched by this change.)
  assert.doesNotMatch(fn('navBetaBadge'), /import|fetch|require|src=/, 'the badge loads nothing');
});
