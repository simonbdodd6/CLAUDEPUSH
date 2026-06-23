/**
 * coach-core-adapter — Position Normalization tests
 *
 * Maps Core position strings to canonical Brain tokens: real Core values, coarse families,
 * specific variants, jersey numbers, case/whitespace tolerance, unknown→null, determinism,
 * constants, exports.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizePosition, isKnownPosition, BRAIN_FORMATION_POSITIONS, COARSE_POSITIONS, POSITION_ALIASES,
} from '../packages/coach-core-adapter/index.js'

// ── real Core position strings ───────────────────────────────────────────────────────

test('normalizes the position strings Core actually stores', () => {
  assert.equal(normalizePosition('Loosehead Prop'), 'LH')
  assert.equal(normalizePosition('Tighthead Prop'), 'TH')
  assert.equal(normalizePosition('Hooker'), 'Hooker')
  assert.equal(normalizePosition('Lock'), 'Lock')
  assert.equal(normalizePosition('Number 8'), 'Number8')
  assert.equal(normalizePosition('Scrum-half'), 'ScrumHalf')
  assert.equal(normalizePosition('Fly-half'), 'FlyHalf')
  assert.equal(normalizePosition('Fullback'), 'Fullback')
})

// ── coarse Core families (no single Brain equivalent) ────────────────────────────────

test('coarse Core terms normalize to coarse family tokens (no guessing)', () => {
  assert.equal(normalizePosition('Flanker'), 'Flanker')
  assert.equal(normalizePosition('Wing'), 'Wing')
  assert.equal(normalizePosition('Centre'), 'Centre')
})

// ── specific variants ────────────────────────────────────────────────────────────────

test('specific positions normalize when supplied', () => {
  assert.equal(normalizePosition('Blindside Flanker'), 'Blindside')
  assert.equal(normalizePosition('Openside'), 'Openside')
  assert.equal(normalizePosition('Left Wing'), 'LeftWing')
  assert.equal(normalizePosition('Inside Centre'), 'InsideCentre')
  assert.equal(normalizePosition('Outside Centre'), 'OutsideCentre')
  assert.equal(normalizePosition('Right Wing'), 'RightWing')
})

// ── jersey numbers ───────────────────────────────────────────────────────────────────

test('jersey-number strings normalize to their default-formation position', () => {
  assert.equal(normalizePosition('1'), 'LH')
  assert.equal(normalizePosition('9'), 'ScrumHalf')
  assert.equal(normalizePosition('10'), 'FlyHalf')
  assert.equal(normalizePosition('15'), 'Fullback')
})

// ── tolerance ────────────────────────────────────────────────────────────────────────

test('case, whitespace and punctuation are tolerated', () => {
  assert.equal(normalizePosition('  fly-half '), 'FlyHalf')
  assert.equal(normalizePosition('FLYHALF'), 'FlyHalf')
  assert.equal(normalizePosition('Scrum  Half'), 'ScrumHalf')
  assert.equal(normalizePosition('out_half'), 'FlyHalf')
})

// ── unknown → null ───────────────────────────────────────────────────────────────────

test('unknown / TBC / empty / ambiguous / non-string → null', () => {
  assert.equal(normalizePosition('TBC'), null)
  assert.equal(normalizePosition(''), null)
  assert.equal(normalizePosition('Prop'), null)        // ambiguous LH vs TH → not guessed
  assert.equal(normalizePosition('Coach'), null)
  assert.equal(normalizePosition(null), null)
  assert.equal(normalizePosition(undefined), null)
  assert.equal(normalizePosition(12), null)            // non-string
})

test('isKnownPosition reflects normalization', () => {
  assert.equal(isKnownPosition('Hooker'), true)
  assert.equal(isKnownPosition('TBC'), false)
})

// ── constants / determinism ──────────────────────────────────────────────────────────

test('exported constants are correct', () => {
  assert.equal(BRAIN_FORMATION_POSITIONS.length, 14)   // 15 jerseys, Lock fills two → 14 distinct positions
  assert.ok(BRAIN_FORMATION_POSITIONS.includes('ScrumHalf') && BRAIN_FORMATION_POSITIONS.includes('Fullback'))
  assert.deepEqual([...COARSE_POSITIONS], ['Flanker', 'Wing', 'Centre'])
  assert.equal(POSITION_ALIASES['loosehead prop'], 'LH')
})

test('deterministic — same input, same output', () => {
  assert.equal(normalizePosition('Scrum-half'), normalizePosition('Scrum-half'))
})

test('exports exist', () => {
  assert.equal(typeof normalizePosition, 'function')
  assert.equal(typeof isKnownPosition, 'function')
})
