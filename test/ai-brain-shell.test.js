/**
 * AI Brain — M1 Shell Tests
 *
 * Verify the public API contract: correct response shapes, no throws on valid
 * input, and backward-compatible string shorthand on AI.ask().
 *
 * These tests do not assert specific recommendation content because M1 uses
 * mock fallback data. They assert shape contracts that must hold for every
 * future milestone.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AI, request, ask, learn, BRAIN_SCHEMA_VERSION } from '../ai-brain/index.js'
import { toBrainResponse, toQueryResponse } from '../ai-brain/schema.js'

// ── Schema helpers ─────────────────────────────────────────────────────────────

test('BRAIN_SCHEMA_VERSION is a non-empty string', () => {
  assert.equal(typeof BRAIN_SCHEMA_VERSION, 'string')
  assert.ok(BRAIN_SCHEMA_VERSION.length > 0)
})

test('toBrainResponse always returns required fields', () => {
  const r = toBrainResponse([], {})
  assert.equal(r.schemaVersion, BRAIN_SCHEMA_VERSION)
  assert.ok(Array.isArray(r.recommendations))
  assert.ok(Array.isArray(r.insights))
  assert.ok(Array.isArray(r.warnings))
  assert.ok(typeof r.trace === 'object')
  assert.ok(Array.isArray(r.trace.modules))
  assert.ok(typeof r.trace.duration === 'number')
})

test('toBrainResponse coerces non-array recommendations to empty array', () => {
  const r = toBrainResponse(null, {})
  assert.ok(Array.isArray(r.recommendations))
  assert.equal(r.recommendations.length, 0)
})

test('toQueryResponse always returns required fields', () => {
  const r = toQueryResponse({}, {})
  assert.equal(r.schemaVersion, BRAIN_SCHEMA_VERSION)
  assert.ok(typeof r.answer === 'string')
  assert.ok(typeof r.confidence === 'number')
  assert.ok(Array.isArray(r.citations))
  assert.ok(Array.isArray(r.data))
  assert.ok(typeof r.trace === 'object')
})

test('toQueryResponse coerces missing fields to safe defaults', () => {
  const r = toQueryResponse(null, {})
  assert.equal(r.answer, '')
  assert.equal(r.confidence, 0)
  assert.equal(r.intent, 'general')
})

// ── Named exports ──────────────────────────────────────────────────────────────

test('named exports request, ask, learn are functions', () => {
  assert.equal(typeof request, 'function')
  assert.equal(typeof ask,     'function')
  assert.equal(typeof learn,   'function')
})

test('AI namespace exposes request, ask, learn', () => {
  assert.equal(typeof AI.request, 'function')
  assert.equal(typeof AI.ask,     'function')
  assert.equal(typeof AI.learn,   'function')
})

// ── AI.request ─────────────────────────────────────────────────────────────────

test('AI.request returns a BrainResponse with correct schema version', async () => {
  const response = await AI.request({})
  assert.equal(response.schemaVersion, BRAIN_SCHEMA_VERSION)
})

test('AI.request returns required BrainResponse fields', async () => {
  const response = await AI.request({})
  assert.ok(Array.isArray(response.recommendations), 'recommendations must be array')
  assert.ok(Array.isArray(response.insights),        'insights must be array')
  assert.ok(Array.isArray(response.warnings),        'warnings must be array')
  assert.ok(typeof response.trace === 'object',      'trace must be object')
  assert.ok(typeof response.trace.duration === 'number', 'trace.duration must be number')
  assert.ok(Array.isArray(response.trace.modules),   'trace.modules must be array')
})

test('AI.request with mock context returns recommendations with valid shape', async () => {
  const response = await AI.request({ useMockFallback: true })
  assert.ok(Array.isArray(response.recommendations))
  for (const rec of response.recommendations) {
    assert.ok(typeof rec.id        === 'string',  `rec.id must be string, got ${typeof rec.id}`)
    assert.ok(typeof rec.title     === 'string',  `rec.title must be string`)
    assert.ok(typeof rec.priority  !== 'undefined', 'rec.priority must exist')
    assert.ok(typeof rec.confidence === 'number', `rec.confidence must be number`)
  }
})

test('AI.request trace.duration is a non-negative number', async () => {
  const response = await AI.request({})
  assert.ok(response.trace.duration >= 0)
})

test('AI.request never rejects — errors are wrapped in BrainResponse', async () => {
  // Pass a completely invalid context — should still return a BrainResponse
  await assert.doesNotReject(AI.request(null))
  await assert.doesNotReject(AI.request(undefined))
})

// ── AI.ask ─────────────────────────────────────────────────────────────────────

test('AI.ask returns a QueryResponse with correct schema version', async () => {
  const response = await AI.ask({ question: 'What are our injury risks?' })
  assert.equal(response.schemaVersion, BRAIN_SCHEMA_VERSION)
})

test('AI.ask returns required QueryResponse fields', async () => {
  const response = await AI.ask({ question: 'What drills do we have for lineouts?' })
  assert.ok(typeof response.answer     === 'string',  'answer must be string')
  assert.ok(typeof response.confidence === 'number',  'confidence must be number')
  assert.ok(Array.isArray(response.citations),        'citations must be array')
  assert.ok(Array.isArray(response.data),             'data must be array')
  assert.ok(typeof response.trace      === 'object',  'trace must be object')
})

test('AI.ask accepts a string shorthand', async () => {
  const response = await AI.ask('What is our squad health?')
  assert.equal(response.schemaVersion, BRAIN_SCHEMA_VERSION)
  assert.ok(typeof response.answer === 'string')
})

test('AI.ask string shorthand and object form return same schema version', async () => {
  const q = 'Test question'
  const r1 = await AI.ask(q)
  const r2 = await AI.ask({ question: q })
  assert.equal(r1.schemaVersion, r2.schemaVersion)
})

test('AI.ask with empty question returns a valid QueryResponse', async () => {
  const response = await AI.ask({ question: '' })
  assert.equal(response.schemaVersion, BRAIN_SCHEMA_VERSION)
  assert.equal(response.answer, '')
  assert.equal(response.confidence, 0)
})

test('AI.ask never rejects — errors are wrapped in QueryResponse', async () => {
  await assert.doesNotReject(AI.ask(null))
  await assert.doesNotReject(AI.ask(undefined))
})

// ── AI.learn ───────────────────────────────────────────────────────────────────

test('AI.learn resolves for accepted outcome', async () => {
  await assert.doesNotReject(
    AI.learn({ recommendationId: 'test-rec-1', outcome: 'accepted', coachId: 'coach-1' })
  )
})

test('AI.learn resolves for dismissed outcome', async () => {
  await assert.doesNotReject(
    AI.learn({ recommendationId: 'test-rec-2', outcome: 'dismissed', coachId: 'coach-1' })
  )
})

test('AI.learn resolves for snoozed outcome', async () => {
  await assert.doesNotReject(
    AI.learn({ recommendationId: 'test-rec-3', outcome: 'snoozed', coachId: 'coach-1' })
  )
})

test('AI.learn resolves for actioned outcome (alias for accepted)', async () => {
  await assert.doesNotReject(
    AI.learn({ recommendationId: 'test-rec-4', outcome: 'actioned', coachId: 'coach-1' })
  )
})

test('AI.learn resolves with empty input without throwing', async () => {
  await assert.doesNotReject(AI.learn({}))
  await assert.doesNotReject(AI.learn(null))
  await assert.doesNotReject(AI.learn(undefined))
})
