/**
 * M57 — Evidence Gateway deduplicate-stage dedupe-key contract tests
 *
 * Deterministic tests for the dormant, data-only §3.4 dedupe-key derivation over the
 * accepted entries of an ApplicationPlan: empty, single, duplicate→same key,
 * non-duplicate→different keys, observedAt-bucket determinism, every key component
 * (tenant/subjectId/signal.key/observedAt/sourceType), unknown/invalid exclusion, no
 * collapsing, immutability — plus the deduplicate stage's deferred grouping output.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deriveDedupeGroups, deriveDedupeKey, observedAtBucket, STAGE_BY_NAME,
} from '@brain/evidence-gateway'
import {
  createNormalizerRegistry, planBatchNormalization, planNormalizationApplication,
} from '@brain/evidence-normalization'
import { SOURCE_TYPE, SIGNAL_POLARITY } from '@brain/evidence-contracts'

const TENANT = Object.freeze({ clubId: 'c1', teamId: 't1', seasonId: 's1' })

// an EvidenceRecord with the fields §3.4 needs
const rec = (id, over = {}) => Object.freeze({
  id, tenant: TENANT, subjectId: 'player-9', sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS,
  observedAt: '2026-06-16T09:30:00.000Z', confidence: 0.8, ...over,
})
// an accepted ApplicationPlan entry referencing that record
const acc = (recordId, signalKeys, index = 0) => Object.freeze({
  index, recordId, normalizerKey: 'provider.frameSports@1.0',
  signals: Object.freeze(signalKeys.map(k => Object.freeze({ key: k, value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: recordId }))),
})

// ── empty / single ──────────────────────────────────────────────────────────────────

test('empty accepted entries — empty grouping, frozen', () => {
  const r = deriveDedupeGroups({ accepted: [], records: [] })
  assert.deepEqual(r, { groups: [], total: 0, duplicateGroups: 0, wouldCollapseAny: false })
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.groups))
})

test('one accepted signal — one group, count 1, wouldCollapse false', () => {
  const r = deriveDedupeGroups({ accepted: [acc('ev_1', ['lineout.winRate'])], records: [rec('ev_1')] })
  assert.equal(r.groups.length, 1)
  assert.equal(r.groups[0].count, 1)
  assert.equal(r.groups[0].wouldCollapse, false)
  assert.equal(r.total, 1)
  assert.deepEqual(r.groups[0].entries, [{ index: 0, recordId: 'ev_1', signalKey: 'lineout.winRate' }])
})

// ── duplicate vs non-duplicate ──────────────────────────────────────────────────────

test('duplicate accepted signals produce the same key (would collapse, but are NOT collapsed)', () => {
  const accepted = [acc('ev_1', ['lineout.winRate'], 0), acc('ev_2', ['lineout.winRate'], 1)]
  const records = [rec('ev_1'), rec('ev_2')]   // identical tenant/subject/day/sourceType
  const r = deriveDedupeGroups({ accepted, records })
  assert.equal(r.groups.length, 1)
  assert.equal(r.groups[0].count, 2)            // both occurrences retained — nothing collapsed
  assert.equal(r.groups[0].wouldCollapse, true)
  assert.equal(r.duplicateGroups, 1)
  assert.equal(r.wouldCollapseAny, true)
  assert.deepEqual(r.groups[0].entries.map(e => e.recordId), ['ev_1', 'ev_2'])
})

test('non-duplicates produce different keys', () => {
  const r = deriveDedupeGroups({
    accepted: [acc('ev_1', ['lineout.winRate']), acc('ev_2', ['scrum.winRate'], 1)],
    records: [rec('ev_1'), rec('ev_2')],
  })
  assert.equal(r.groups.length, 2)
  assert.ok(r.groups.every(g => g.count === 1 && !g.wouldCollapse))
})

// ── key component coverage ──────────────────────────────────────────────────────────

const keyOf = (record, signalKey) => deriveDedupeKey(record, signalKey)

test('signal.key is part of the key', () => {
  assert.notEqual(keyOf(rec('ev_1'), 'lineout.winRate'), keyOf(rec('ev_1'), 'scrum.winRate'))
})

test('subjectId is part of the key', () => {
  assert.notEqual(keyOf(rec('ev_1'), 'k.a'), keyOf(rec('ev_1', { subjectId: 'player-10' }), 'k.a'))
})

test('sourceType is part of the key', () => {
  assert.notEqual(keyOf(rec('ev_1'), 'k.a'), keyOf(rec('ev_1', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE }), 'k.a'))
})

test('tenant is part of the key', () => {
  const other = { clubId: 'c2', teamId: 't1', seasonId: 's1' }
  assert.notEqual(keyOf(rec('ev_1'), 'k.a'), keyOf(rec('ev_1', { tenant: other }), 'k.a'))
})

// ── observedAt bucket determinism ───────────────────────────────────────────────────

test('observedAt bucket — calendar-day prefix, deterministic, no Date', () => {
  assert.equal(observedAtBucket('2026-06-16T09:30:00.000Z'), '2026-06-16')
  assert.equal(observedAtBucket('2026-06-16T23:59:59.999Z'), '2026-06-16')
  assert.equal(observedAtBucket('not-a-date'), '')
  assert.equal(observedAtBucket(undefined), '')
})

test('same calendar day (different time) → same key; different day → different key', () => {
  const morning = rec('ev_1', { observedAt: '2026-06-16T08:00:00.000Z' })
  const evening = rec('ev_2', { observedAt: '2026-06-16T20:00:00.000Z' })
  const nextDay = rec('ev_3', { observedAt: '2026-06-17T08:00:00.000Z' })
  assert.equal(keyOf(morning, 'k.a'), keyOf(evening, 'k.a'))      // same day bucket
  assert.notEqual(keyOf(morning, 'k.a'), keyOf(nextDay, 'k.a'))   // different day bucket
})

// ── exclusion of unknown / invalid via the real pipeline ────────────────────────────

test('unknown_source and invalid_signals records never enter dedupe groups', () => {
  const frame = { sourceType: SOURCE_TYPE.PROVIDER_FRAME_SPORTS, version: '1.0',
    normalize: (r) => [{ key: 'lineout.winRate', value: 1, unit: null, polarity: SIGNAL_POLARITY.STRENGTH, confidence: 0.5, evidenceId: r.id }] }
  const badNote = { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE, version: '1.0',
    normalize: (r) => [{ key: 'bad key', value: 1, unit: null, polarity: null, confidence: 0.5, evidenceId: r.id }] }
  const registry = createNormalizerRegistry([frame, badNote])

  const records = [
    rec('ev_ok'),
    rec('ev_unknown', { sourceType: SOURCE_TYPE.MANUAL_SCOUTING_NOTE }),  // no normalizer → unknown_source
    rec('ev_bad', { sourceType: SOURCE_TYPE.MANUAL_MATCH_NOTE }),         // invalid emission → invalid_signals
  ]
  const ctx = { now: '2026-06-16T09:30:00.000Z', ingestRunId: 'run_1' }
  const appPlan = planNormalizationApplication(planBatchNormalization(registry, records, ctx))

  const r = deriveDedupeGroups({ accepted: appPlan.accepted, records })
  const ids = r.groups.flatMap(g => g.entries.map(e => e.recordId))
  assert.deepEqual(ids, ['ev_ok'])                       // only the accepted record contributes
  assert.equal(ids.includes('ev_unknown'), false)
  assert.equal(ids.includes('ev_bad'), false)
})

// ── no collapsing + immutability ────────────────────────────────────────────────────

test('no actual collapsing — every occurrence is retained in the group', () => {
  const accepted = [acc('ev_1', ['k.a'], 0), acc('ev_2', ['k.a'], 1), acc('ev_3', ['k.a'], 2)]
  const r = deriveDedupeGroups({ accepted, records: [rec('ev_1'), rec('ev_2'), rec('ev_3')] })
  assert.equal(r.groups[0].count, 3)
  assert.equal(r.total, 3)
})

test('result is deeply frozen and input is not mutated', () => {
  const accepted = [acc('ev_1', ['k.a'])]
  const records = [rec('ev_1')]
  const snap = JSON.stringify({ accepted, records })
  const r = deriveDedupeGroups({ accepted, records })
  assert.ok(Object.isFrozen(r) && r.groups.every(g => Object.isFrozen(g) && Object.isFrozen(g.entries)))
  assert.throws(() => r.groups.push({}))
  assert.equal(JSON.stringify({ accepted, records }), snap)
})

test('deterministic — identical input → identical grouping', () => {
  const accepted = [acc('ev_1', ['k.a']), acc('ev_2', ['k.a'], 1)]
  const records = [rec('ev_1'), rec('ev_2')]
  assert.deepEqual(deriveDedupeGroups({ accepted, records }), deriveDedupeGroups({ accepted, records }))
})

test('malformed input throws TypeError (programmer error)', () => {
  assert.throws(() => deriveDedupeGroups({ accepted: 'x', records: [] }), TypeError)
  assert.throws(() => deriveDedupeGroups({ accepted: [], records: 'x' }), TypeError)
})

// ── deduplicate stage exposes the deferred grouping ─────────────────────────────────

test('deduplicate stage — run() stays inert; groups() returns a DEFERRED grouping', () => {
  const dedupe = STAGE_BY_NAME.deduplicate
  assert.deepEqual(dedupe.run().output, { isDuplicate: false, dedupeKey: null })   // unchanged placeholder
  const out = dedupe.groups({ accepted: [acc('ev_1', ['k.a']), acc('ev_2', ['k.a'], 1)], records: [rec('ev_1'), rec('ev_2')] })
  assert.equal(out.stage, 'deduplicate')
  assert.equal(out.status, 'deferred')                  // nothing collapsed/persisted
  assert.equal(out.output.groups[0].wouldCollapse, true)
  assert.ok(Object.isFrozen(out))
})
