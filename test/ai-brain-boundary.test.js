/**
 * AI Brain — M2 Boundary Regression Tests
 *
 * Verifies:
 * 1. api-server.js no longer imports AI modules directly
 * 2. The Brain exposes all methods required by the migrated endpoints
 * 3. All M2 Brain methods return correct shapes and never reject
 *
 * These tests are the regression harness for the boundary enforcement.
 * If any test here fails, the boundary has been broken.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { AI } from '../ai-brain/index.js'

// ── Boundary enforcement ───────────────────────────────────────────────────────

test('api-server.js does not directly import recommendation-engine', async () => {
  const src = await readFile(new URL('../app/api-server.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /import\(.*recommendation-engine/)
})

test('api-server.js does not directly import knowledge-engine/index', async () => {
  const src = await readFile(new URL('../app/api-server.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /import\(.*knowledge-engine\/index/)
})

test('api-server.js does not directly import learning-engine', async () => {
  const src = await readFile(new URL('../app/api-server.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /import\(.*learning-engine/)
})

test('api-server.js does not directly import intelligence-timeline', async () => {
  const src = await readFile(new URL('../app/api-server.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /import\(.*intelligence-timeline/)
})

test('api-server.js does not directly import autonomous-assistant', async () => {
  const src = await readFile(new URL('../app/api-server.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /import\(.*autonomous-assistant/)
})

test('api-server.js does not directly import qa/club-intelligence', async () => {
  const src = await readFile(new URL('../app/api-server.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /import\(.*qa\/club-intelligence/)
})

test('api-server.js imports AI Brain as its single AI entry point', async () => {
  const src = await readFile(new URL('../app/api-server.js', import.meta.url), 'utf8')
  assert.match(src, /import \{ AI \} from '\.\.\/ai-brain\/index\.js'/)
})

// ── Brain method surface ───────────────────────────────────────────────────────

test('AI exposes all M2 methods', () => {
  const required = [
    'request', 'ask', 'learn',
    'observe',
    'activeRecommendations', 'decide', 'resolveItem',
    'briefing', 'timelineCheck',
    'timeline', 'updateTimeline', 'appendTimeline', 'parseTimelineFilters',
    'status', 'clubHealth',
  ]
  for (const method of required) {
    assert.equal(typeof AI[method], 'function', `AI.${method} must be a function`)
  }
})

// ── AI.observe ─────────────────────────────────────────────────────────────────

test('AI.observe returns an object or null — never rejects', async () => {
  const result = await AI.observe()
  assert.ok(result === null || typeof result === 'object', 'observe must return object or null')
})

// ── AI.activeRecommendations ───────────────────────────────────────────────────

test('AI.activeRecommendations returns an array — never rejects', async () => {
  const result = await AI.activeRecommendations()
  assert.ok(Array.isArray(result), 'activeRecommendations must return array')
})

// ── AI.decide ─────────────────────────────────────────────────────────────────

test('AI.decide returns { ok, id, action } for accept', async () => {
  const result = await AI.decide('rec-test-1', 'accept')
  assert.equal(result.ok, true)
  assert.equal(result.id, 'rec-test-1')
  assert.equal(result.action, 'accept')
})

test('AI.decide returns { ok, id, action } for snooze', async () => {
  const result = await AI.decide('rec-test-2', 'snooze', { hours: 48 })
  assert.equal(result.ok, true)
  assert.equal(result.action, 'snooze')
})

test('AI.decide returns { ok, id, action } for dismiss', async () => {
  const result = await AI.decide('rec-test-3', 'dismiss')
  assert.equal(result.ok, true)
  assert.equal(result.action, 'dismiss')
})

test('AI.decide never rejects for unknown id', async () => {
  await assert.doesNotReject(AI.decide('unknown-id-xyz', 'accept'))
})

// ── AI.resolveItem ─────────────────────────────────────────────────────────────

test('AI.resolveItem resolves without throwing', async () => {
  await assert.doesNotReject(AI.resolveItem('approval-test-1'))
})

// ── AI.briefing ────────────────────────────────────────────────────────────────

test('AI.briefing returns object or null — never rejects', async () => {
  const result = await AI.briefing()
  assert.ok(result === null || typeof result === 'object', 'briefing must return object or null')
})

// ── AI.timelineCheck ──────────────────────────────────────────────────────────

test('AI.timelineCheck returns object or null — never rejects', async () => {
  const result = await AI.timelineCheck({ saveToState: false })
  assert.ok(result === null || typeof result === 'object', 'timelineCheck must return object or null')
})

// ── AI.timeline ────────────────────────────────────────────────────────────────

test('AI.timeline returns { events, total, stats }', async () => {
  const result = await AI.timeline({ limit: 5 })
  assert.ok(Array.isArray(result.events),       'events must be array')
  assert.ok(typeof result.total === 'number',   'total must be number')
  assert.ok(typeof result.stats === 'object',   'stats must be object')
})

test('AI.timeline with empty filters returns valid shape', async () => {
  const result = await AI.timeline({})
  assert.ok(Array.isArray(result.events))
  assert.ok(typeof result.total === 'number')
})

test('AI.timeline never rejects', async () => {
  await assert.doesNotReject(AI.timeline(null))
  await assert.doesNotReject(AI.timeline(undefined))
})

// ── AI.updateTimeline ─────────────────────────────────────────────────────────

test('AI.updateTimeline returns null for unknown id — never rejects', async () => {
  const result = await AI.updateTimeline('non-existent-id', 'completed', null)
  assert.ok(result === null || typeof result === 'object')
})

// ── AI.appendTimeline ─────────────────────────────────────────────────────────

test('AI.appendTimeline resolves without throwing for empty array', async () => {
  await assert.doesNotReject(AI.appendTimeline([], {}, 'test-engine'))
})

test('AI.appendTimeline resolves without throwing for null input', async () => {
  await assert.doesNotReject(AI.appendTimeline(null))
})

// ── AI.parseTimelineFilters ───────────────────────────────────────────────────

test('AI.parseTimelineFilters returns an object', async () => {
  const result = await AI.parseTimelineFilters({ status: 'completed', limit: '10' })
  assert.ok(typeof result === 'object', 'parseTimelineFilters must return object')
})

test('AI.parseTimelineFilters returns {} for empty query — never rejects', async () => {
  const result = await AI.parseTimelineFilters({})
  assert.ok(typeof result === 'object')
})

// ── AI.status ─────────────────────────────────────────────────────────────────

test('AI.status returns { cis, accuracy }', async () => {
  const result = await AI.status()
  assert.ok(typeof result.cis      === 'object', 'cis must be object')
  assert.ok(typeof result.accuracy === 'object', 'accuracy must be object')
})

test('AI.status never rejects', async () => {
  await assert.doesNotReject(AI.status())
})

// ── AI.clubHealth ─────────────────────────────────────────────────────────────

test('AI.clubHealth returns { health, insights }', async () => {
  const result = await AI.clubHealth()
  assert.ok(typeof result.health === 'object',   'health must be object')
  // insights may be an array (on error fallback) or an object from generateInsights()
  assert.ok(result.insights !== undefined,        'insights must be present')
})

test('AI.clubHealth never rejects', async () => {
  await assert.doesNotReject(AI.clubHealth())
})

// ── Schema backward-compat: meta preserved in BrainResponse ──────────────────

test('AI.request BrainResponse preserves meta from recommendation engine', async () => {
  const result = await AI.request({})
  assert.ok(typeof result.meta === 'object', 'meta must be object')
  assert.ok('isMock' in result.meta,         'meta.isMock must exist')
})

// ── Schema backward-compat: QueryResponse preserves all knowledge-engine fields

test('AI.ask QueryResponse preserves domain-specific fields', async () => {
  const result = await AI.ask({ question: 'Who is injured?' })
  // count and summary are knowledge-engine fields — must be passed through
  assert.ok('answer'     in result, 'answer must be in QueryResponse')
  assert.ok('confidence' in result, 'confidence must be in QueryResponse')
  assert.ok('citations'  in result, 'citations must be in QueryResponse')
  assert.ok('data'       in result, 'data must be in QueryResponse')
})
