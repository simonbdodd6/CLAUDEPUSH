/**
 * coach-core-adapter — Availability Mapping tests
 *
 * Maps Core availability responses to booleans: available/unavailable, maybe policy, response
 * objects, unknown policy, case tolerance, bulk responses map, validation, determinism, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  mapAvailability, mapAvailabilityResponses, CORE_AVAILABILITY_RESPONSES,
} from '../packages/coach-core-adapter/index.js'

// ── core values ──────────────────────────────────────────────────────────────────────

test('available → true, unavailable → false', () => {
  assert.equal(mapAvailability('available'), true)
  assert.equal(mapAvailability('unavailable'), false)
})

// ── maybe policy ─────────────────────────────────────────────────────────────────────

test('maybe defaults to false, configurable to true', () => {
  assert.equal(mapAvailability('maybe'), false)
  assert.equal(mapAvailability('maybe', { maybeAvailable: true }), true)
})

// ── response objects ─────────────────────────────────────────────────────────────────

test('accepts a Core response object { response }', () => {
  assert.equal(mapAvailability({ response: 'available', userId: 'u1' }), true)
  assert.equal(mapAvailability({ response: 'unavailable' }), false)
  assert.equal(mapAvailability({ response: 'maybe' }, { maybeAvailable: true }), true)
})

// ── unknown policy ───────────────────────────────────────────────────────────────────

test('missing / unrecognised responses default to false, configurable to true', () => {
  assert.equal(mapAvailability(undefined), false)
  assert.equal(mapAvailability(null), false)
  assert.equal(mapAvailability('no-reply'), false)
  assert.equal(mapAvailability({}), false)
  assert.equal(mapAvailability(undefined, { unknownAvailable: true }), true)
})

// ── tolerance ────────────────────────────────────────────────────────────────────────

test('case and whitespace are tolerated', () => {
  assert.equal(mapAvailability('  AVAILABLE '), true)
  assert.equal(mapAvailability('Unavailable'), false)
})

// ── bulk responses ───────────────────────────────────────────────────────────────────

test('maps a Core responses object to { userId: boolean }', () => {
  const responses = {
    u1: { response: 'available', label: 'Cian' },
    u2: { response: 'unavailable', label: 'Sean' },
    u3: { response: 'maybe', label: 'Oisin' },
  }
  assert.deepEqual(mapAvailabilityResponses(responses), { u1: true, u2: false, u3: false })
  assert.deepEqual(mapAvailabilityResponses(responses, { maybeAvailable: true }), { u1: true, u2: false, u3: true })
})

// ── validation ───────────────────────────────────────────────────────────────────────

test('invalid options / responses → TypeError', () => {
  assert.throws(() => mapAvailability('available', null), TypeError)
  assert.throws(() => mapAvailability('available', []), TypeError)
  assert.throws(() => mapAvailabilityResponses(null), TypeError)
  assert.throws(() => mapAvailabilityResponses([]), TypeError)
})

// ── constants / determinism ──────────────────────────────────────────────────────────

test('exported constant lists the Core responses', () => {
  assert.deepEqual([...CORE_AVAILABILITY_RESPONSES], ['available', 'unavailable', 'maybe'])
})

test('deterministic and does not mutate the responses object', () => {
  const responses = { u1: { response: 'maybe' } }
  const before = JSON.stringify(responses)
  mapAvailabilityResponses(responses, { maybeAvailable: true })
  assert.equal(JSON.stringify(responses), before)
})

test('exports exist', () => {
  assert.equal(typeof mapAvailability, 'function')
  assert.equal(typeof mapAvailabilityResponses, 'function')
})
