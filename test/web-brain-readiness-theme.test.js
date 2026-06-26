/**
 * web/brain-readiness-theme — Readiness Coach View Theme Pack (M222) tests
 *
 * Reusable presentation helpers: badges, chips, banners, cards, table, trend badge. Pure, escaped,
 * deterministic; malformed input degrades safely. No production change.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  escapeHtml, statusBadge, confidenceChip, warningBanner, keyNumberCards, positionGroupTable, trendBadge,
} from '../web/brain-readiness-theme.js'

// ── status badges (every type) ─────────────────────────────────────────────────────────

test('status badge renders a variant class per readiness level', () => {
  for (const [level, cls] of [['READY', 'ready'], ['FULLY_READY', 'fully-ready'], ['MATCH_READY', 'match-ready'], ['UNDERSTRENGTH', 'understrength'], ['NOT_READY', 'not-ready'], ['NO_SQUAD', 'no-squad']]) {
    const html = statusBadge(level)
    assert.ok(html.includes(`readiness-badge--${cls}`), `${level} → ${cls}`)
    assert.ok(html.includes(`>${level}</span>`))
  }
})

test('status badge falls back to UNKNOWN for missing/bad input', () => {
  assert.ok(statusBadge(null).includes('readiness-badge--unknown'))
  assert.ok(statusBadge('').includes('readiness-badge--unknown'))
  assert.ok(statusBadge(5).includes('readiness-badge--unknown'))
})

// ── confidence chip ──────────────────────────────────────────────────────────────────

test('confidence chip styles each level', () => {
  for (const lvl of ['HIGH', 'MEDIUM', 'LOW', 'NONE']) {
    const html = confidenceChip(lvl)
    assert.ok(html.includes(`readiness-chip--${lvl.toLowerCase()}`))
    assert.ok(html.includes(`Confidence: ${lvl}`))
  }
  assert.ok(confidenceChip(undefined).includes('readiness-chip--unknown'))
})

// ── warning banner (combinations + empty) ───────────────────────────────────────────────

test('warning banner: empty → ok banner', () => {
  assert.equal(warningBanner([]), '<div class="readiness-banner readiness-banner--ok">No warnings</div>')
  assert.equal(warningBanner(null), '<div class="readiness-banner readiness-banner--ok">No warnings</div>')
})

test('warning banner: multiple warnings → chips with count', () => {
  const html = warningBanner(['LOW_CONFIDENCE', 'MISSING_PLAYER_INFORMATION', 'NO_TREND'])
  assert.ok(html.includes('data-count="3"'))
  assert.ok(html.includes('readiness-banner__chip--low-confidence'))
  assert.ok(html.includes('readiness-banner__chip--missing-player-information'))
  assert.ok(html.includes('readiness-banner__chip--no-trend'))
})

test('warning banner ignores non-string entries', () => {
  assert.ok(warningBanner(['LOW_CONFIDENCE', 5, null]).includes('data-count="1"'))
})

// ── key-number cards ─────────────────────────────────────────────────────────────────

test('key-number cards render all five cards', () => {
  const html = keyNumberCards({ total: 20, available: 16, injuries: 2, unavailableOrSuspended: 3, limitedTraining: 1, missing: 13 })
  assert.ok(html.includes('readiness-card--available') && html.includes('>16/20<'))
  assert.ok(html.includes('readiness-card--injuries') && html.includes('>2<'))
  assert.ok(html.includes('readiness-card--missing') && html.includes('>13<'))
  assert.equal((html.match(/readiness-card /g) || []).length, 5)
})

test('key-number cards default missing values to 0', () => {
  const html = keyNumberCards(null)
  assert.ok(html.includes('>0/0<'))
  assert.equal((html.match(/readiness-card /g) || []).length, 5)
})

// ── position-group table (present + empty) ──────────────────────────────────────────────

test('position-group table renders rows', () => {
  const html = positionGroupTable([
    { group: 'FRONT_ROW', total: 3, available: 2, injuryConcern: 0, unavailableOrSuspended: 1 },
    { group: 'BACK_THREE', total: 3, available: 3, injuryConcern: 1, unavailableOrSuspended: 0 },
  ])
  assert.ok(html.startsWith('<table class="readiness-table">'))
  assert.ok(html.includes('FRONT_ROW') && html.includes('>2/3<'))
  assert.ok(html.includes('BACK_THREE'))
  assert.equal((html.match(/readiness-table__row/g) || []).length, 2)
})

test('position-group table: empty → labelled empty table', () => {
  assert.ok(positionGroupTable([]).includes('readiness-table--empty'))
  assert.ok(positionGroupTable('x').includes('No position data'))
})

// ── trend badge (present/absent) ─────────────────────────────────────────────────────

test('trend badge renders only when comparable', () => {
  assert.ok(trendBadge({ direction: 'IMPROVING', comparable: true }).includes('readiness-badge--trend-improving'))
  assert.ok(trendBadge({ direction: 'IMPROVING', comparable: true }).includes('↑ Improving'))
  assert.ok(trendBadge({ direction: 'DECLINING', comparable: true }).includes('↓ Declining'))
  assert.equal(trendBadge({ direction: 'IMPROVING', comparable: false }), '')
  assert.equal(trendBadge(null), '')
})

// ── escaping ──────────────────────────────────────────────────────────────────────────

test('escapes interpolated values throughout', () => {
  assert.equal(escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;')
  assert.ok(!statusBadge('<script>').includes('<script>'))
  assert.ok(warningBanner(['<img src=x>']).includes('&lt;img src=x&gt;'))
  assert.ok(positionGroupTable([{ group: '<x>', total: 1, available: 1 }]).includes('&lt;x&gt;'))
})

// ── determinism / export ─────────────────────────────────────────────────────────────

test('deterministic — repeated calls are identical', () => {
  const kn = { total: 20, available: 16, injuries: 2, unavailableOrSuspended: 3, limitedTraining: 1, missing: 13 }
  assert.equal(keyNumberCards(kn), keyNumberCards(kn))
  assert.equal(statusBadge('MATCH_READY'), statusBadge('MATCH_READY'))
  assert.equal(warningBanner(['LOW_CONFIDENCE']), warningBanner(['LOW_CONFIDENCE']))
})

test('exports exist', () => {
  for (const fn of [escapeHtml, statusBadge, confidenceChip, warningBanner, keyNumberCards, positionGroupTable, trendBadge]) {
    assert.equal(typeof fn, 'function')
  }
})
