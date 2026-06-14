import { randomUUID } from 'crypto';
import {
  MEMORY_AUDIT_ACTIONS,
  MEMORY_DEFAULTS,
  MEMORY_ORIGIN,
  MEMORY_POLARITY,
  MEMORY_POLARITIES,
} from './constants.js';
import { InMemoryTravelMemoryRepository } from './repository.js';
import { notFoundError, validationError, versionNotFoundError } from './errors.js';

const EXACT_LOCATION_FIELDS = [
  'coordinates',
  'coordinate',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'exactLocation',
  'liveLocation',
  'travellerLocation',
  'currentLocation',
];

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function round(value, precision = 4) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function assertNoExactLocation(input = {}, label = 'travel memory input') {
  if (input == null || typeof input !== 'object') return input;
  const present = EXACT_LOCATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw validationError(`${label} must not include exact traveller location`, { fields: present });
  }
  return input;
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw validationError(`${field} is required`, { field });
  }
  return value.trim();
}

function assertPolarity(value, field = 'polarity') {
  if (!MEMORY_POLARITIES.includes(value)) {
    throw validationError(`${field} must be one of: ${MEMORY_POLARITIES.join(', ')}`, { [field]: value });
  }
  return value;
}

function oppositePolarity(polarity) {
  return polarity === MEMORY_POLARITY.POSITIVE ? MEMORY_POLARITY.NEGATIVE : MEMORY_POLARITY.POSITIVE;
}

function normalizeConfidence(value, fallback) {
  if (value == null) return fallback;
  const num = Number(value);
  if (Number.isNaN(num)) throw validationError('confidence must be a number between 0 and 1', { confidence: value });
  return round(clamp(num, MEMORY_DEFAULTS.CONFIDENCE_MIN, MEMORY_DEFAULTS.CONFIDENCE_MAX));
}

function daysBetween(fromIso, toIso) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, (to - from) / 86400000);
}

// Deterministic linear freshness: 1.0 at last-confirmed, 0.0 after the window.
function computeDecayScore(lastConfirmed, asOf) {
  const elapsed = daysBetween(lastConfirmed, asOf);
  return round(clamp(1 - elapsed / MEMORY_DEFAULTS.DECAY_WINDOW_DAYS, 0, 1));
}

function reinforceConfidence(confidence) {
  return round(clamp(confidence + MEMORY_DEFAULTS.LEARNED_STEP, MEMORY_DEFAULTS.CONFIDENCE_MIN, MEMORY_DEFAULTS.CONFIDENCE_MAX));
}

function weakenConfidence(confidence) {
  return round(clamp(confidence - MEMORY_DEFAULTS.LEARNED_STEP, MEMORY_DEFAULTS.CONFIDENCE_MIN, MEMORY_DEFAULTS.CONFIDENCE_MAX));
}

function effectiveConfidenceOf(memory) {
  return round(memory.confidence * memory.decayScore);
}

function snapshotOf(memory, label) {
  return {
    version: memory.version,
    label,
    state: clone(memory),
    createdAt: now(),
  };
}

function buildExplanation(memory) {
  const polarityLabel = memory.polarity === MEMORY_POLARITY.POSITIVE ? 'positive preference' : 'negative preference';
  const originLabel = memory.origin === MEMORY_ORIGIN.EXPLICIT ? 'stated by the traveller' : `learned from ${memory.observationCount} observation(s)`;
  const lock = memory.locked ? ' Memory is locked against automatic updates.' : '';
  const corrected = memory.manualCorrection ? ' It has been manually corrected.' : '';
  return `${polarityLabel} for ${memory.key}=${memory.value}, ${originLabel}. `
    + `Confidence ${memory.confidence} decayed to effective ${effectiveConfidenceOf(memory)} `
    + `(freshness ${memory.decayScore}). Last confirmed ${memory.lastConfirmed}.${lock}${corrected}`;
}

export function createTravelMemoryPlatform(options = {}) {
  const repository = options.repository ?? new InMemoryTravelMemoryRepository();

  async function audit(action, memory, details = {}) {
    return repository.appendAudit({
      action,
      memoryId: memory.memoryId,
      travellerIdentityId: memory.travellerIdentityId,
      details,
    });
  }

  async function loadMemory(memoryId) {
    const memory = await repository.getMemory(memoryId);
    if (!memory) throw notFoundError(memoryId);
    return memory;
  }

  // Persist a mutated memory: bump version, snapshot into version history, audit.
  async function commit(memory, { action, details = {}, label }) {
    memory.version += 1;
    memory.updatedAt = now();
    await repository.saveMemory(memory);
    await repository.appendVersion(memory.memoryId, snapshotOf(memory, label ?? action));
    await audit(action, memory, details);
    return clone(memory);
  }

  function newMemory({ travellerIdentityId, key, value, polarity, origin, confidence, observedAt, source }) {
    const timestamp = observedAt ?? now();
    const memory = {
      memoryId: `memory_${randomUUID()}`,
      travellerIdentityId,
      key,
      value,
      polarity,
      origin,
      confidence,
      decayScore: 1,
      observationCount: 1,
      firstObserved: timestamp,
      lastConfirmed: timestamp,
      locked: false,
      manualCorrection: null,
      correctionCount: 0,
      sources: source ? [source] : [],
      deterministic: true,
      aiUsed: false,
      version: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return memory;
  }

  async function persistNew(memory, action, details) {
    memory.version = 1;
    await repository.saveMemory(memory);
    await repository.appendVersion(memory.memoryId, snapshotOf(memory, 'created'));
    await repository.appendAudit({
      action: MEMORY_AUDIT_ACTIONS.MEMORY_CREATED,
      memoryId: memory.memoryId,
      travellerIdentityId: memory.travellerIdentityId,
      details: { origin: memory.origin, key: memory.key, value: memory.value, polarity: memory.polarity },
    });
    if (action !== MEMORY_AUDIT_ACTIONS.MEMORY_CREATED) {
      await audit(action, memory, details);
    }
    return clone(memory);
  }

  function provenance({ origin, source, observedAt }) {
    if (!source) return null;
    assertNoExactLocation(source, 'source snapshot');
    return {
      origin,
      snapshotType: source.snapshotType ?? source.type ?? null,
      snapshotId: source.snapshotId ?? source.id ?? null,
      observedAt: observedAt ?? now(),
    };
  }

  /**
   * Record an explicit memory the traveller stated directly. Explicit input is
   * authoritative and is allowed even when the memory is locked (a lock only
   * blocks *automatic* updates, not the traveller's own corrections).
   */
  async function recordExplicitMemory(input = {}) {
    assertNoExactLocation(input, 'recordExplicitMemory input');
    const travellerIdentityId = assertNonEmptyString(input.travellerIdentityId, 'travellerIdentityId');
    const key = assertNonEmptyString(input.key, 'key');
    const value = assertNonEmptyString(input.value, 'value');
    const polarity = assertPolarity(input.polarity);
    const confidence = normalizeConfidence(input.confidence, MEMORY_DEFAULTS.EXPLICIT_BASE_CONFIDENCE);
    const source = provenance({ origin: MEMORY_ORIGIN.EXPLICIT, source: input.source, observedAt: input.observedAt });

    const existing = await repository.findMemory(travellerIdentityId, key, value);
    if (!existing) {
      const memory = newMemory({
        travellerIdentityId, key, value, polarity,
        origin: MEMORY_ORIGIN.EXPLICIT, confidence,
        observedAt: input.observedAt, source,
      });
      return persistNew(memory, MEMORY_AUDIT_ACTIONS.EXPLICIT_RECORDED, {});
    }

    existing.origin = MEMORY_ORIGIN.EXPLICIT;
    existing.polarity = polarity;
    existing.confidence = confidence;
    existing.lastConfirmed = input.observedAt ?? now();
    existing.decayScore = 1;
    existing.observationCount += 1;
    if (source) existing.sources.push(source);
    return commit(existing, {
      action: MEMORY_AUDIT_ACTIONS.EXPLICIT_RECORDED,
      details: { polarity, confidence },
    });
  }

  /**
   * Record a learned observation derived deterministically from behaviour.
   * Respects manual locks (locked memories ignore automatic updates).
   */
  async function observeLearnedMemory(input = {}) {
    assertNoExactLocation(input, 'observeLearnedMemory input');
    const travellerIdentityId = assertNonEmptyString(input.travellerIdentityId, 'travellerIdentityId');
    const key = assertNonEmptyString(input.key, 'key');
    const value = assertNonEmptyString(input.value, 'value');
    const polarity = assertPolarity(input.polarity);
    const observedAt = input.observedAt ?? now();
    const source = provenance({ origin: MEMORY_ORIGIN.LEARNED, source: input.source, observedAt });

    const existing = await repository.findMemory(travellerIdentityId, key, value);
    if (!existing) {
      const memory = newMemory({
        travellerIdentityId, key, value, polarity,
        origin: MEMORY_ORIGIN.LEARNED,
        confidence: MEMORY_DEFAULTS.LEARNED_BASE_CONFIDENCE,
        observedAt, source,
      });
      return persistNew(memory, MEMORY_AUDIT_ACTIONS.OBSERVATION_REINFORCED, {});
    }

    if (existing.locked) {
      await audit(MEMORY_AUDIT_ACTIONS.OBSERVATION_IGNORED_LOCKED, existing, { polarity });
      return clone(existing);
    }

    if (source) existing.sources.push(source);
    existing.lastConfirmed = observedAt;
    existing.decayScore = 1;

    if (existing.polarity === polarity) {
      existing.observationCount += 1;
      existing.confidence = reinforceConfidence(existing.confidence);
      return commit(existing, {
        action: MEMORY_AUDIT_ACTIONS.OBSERVATION_REINFORCED,
        details: { observationCount: existing.observationCount, confidence: existing.confidence },
      });
    }

    // Contradicting observation: weaken; flip polarity if confidence collapses.
    existing.confidence = weakenConfidence(existing.confidence);
    if (existing.confidence <= MEMORY_DEFAULTS.FLIP_THRESHOLD) {
      const previousPolarity = existing.polarity;
      existing.polarity = oppositePolarity(existing.polarity);
      existing.confidence = MEMORY_DEFAULTS.LEARNED_BASE_CONFIDENCE;
      existing.observationCount = 1;
      return commit(existing, {
        action: MEMORY_AUDIT_ACTIONS.POLARITY_FLIPPED,
        details: { from: previousPolarity, to: existing.polarity },
      });
    }
    return commit(existing, {
      action: MEMORY_AUDIT_ACTIONS.OBSERVATION_CONTRADICTED,
      details: { confidence: existing.confidence },
    });
  }

  /**
   * Consume an immutable snapshot from another platform and fold a set of
   * derived behaviour signals into learned memory. The snapshot is read, never
   * imported or mutated — provenance is recorded against each signal.
   */
  async function recordFromSnapshot(input = {}) {
    assertNoExactLocation(input, 'recordFromSnapshot input');
    const travellerIdentityId = assertNonEmptyString(input.travellerIdentityId, 'travellerIdentityId');
    const snapshot = input.snapshot;
    if (snapshot == null || typeof snapshot !== 'object') {
      throw validationError('snapshot must be an object', { field: 'snapshot' });
    }
    assertNoExactLocation(snapshot, 'snapshot');
    const signals = Array.isArray(input.signals) ? input.signals : [];
    if (!signals.length) throw validationError('signals must be a non-empty array', { field: 'signals' });

    const source = {
      snapshotType: snapshot.snapshotType ?? snapshot.type ?? null,
      snapshotId: snapshot.snapshotId ?? snapshot.id ?? null,
    };
    const results = [];
    for (const signal of signals) {
      results.push(await observeLearnedMemory({
        travellerIdentityId,
        key: signal.key,
        value: signal.value,
        polarity: signal.polarity,
        observedAt: input.observedAt,
        source,
      }));
    }
    return results;
  }

  /**
   * Manual correction by the traveller. Overrides a lock and is fully
   * authoritative; the prior state is retained in `manualCorrection`.
   */
  async function correctMemory(input = {}) {
    assertNoExactLocation(input, 'correctMemory input');
    const memory = await loadMemory(assertNonEmptyString(input.memoryId, 'memoryId'));
    const previous = {
      polarity: memory.polarity,
      value: memory.value,
      confidence: memory.confidence,
      origin: memory.origin,
    };

    if (input.polarity != null) memory.polarity = assertPolarity(input.polarity);
    if (input.value != null) memory.value = assertNonEmptyString(input.value, 'value');
    if (input.confidence != null) memory.confidence = normalizeConfidence(input.confidence);
    memory.origin = MEMORY_ORIGIN.EXPLICIT;
    memory.lastConfirmed = input.observedAt ?? now();
    memory.decayScore = 1;
    memory.correctionCount += 1;
    memory.manualCorrection = {
      at: now(),
      previous,
      reason: typeof input.reason === 'string' ? input.reason : null,
    };
    return commit(memory, {
      action: MEMORY_AUDIT_ACTIONS.MEMORY_CORRECTED,
      details: { previous, reason: memory.manualCorrection.reason },
    });
  }

  async function lockMemory(memoryId) {
    const memory = await loadMemory(assertNonEmptyString(memoryId, 'memoryId'));
    if (memory.locked) return clone(memory);
    memory.locked = true;
    return commit(memory, { action: MEMORY_AUDIT_ACTIONS.MEMORY_LOCKED });
  }

  async function unlockMemory(memoryId) {
    const memory = await loadMemory(assertNonEmptyString(memoryId, 'memoryId'));
    if (!memory.locked) return clone(memory);
    memory.locked = false;
    return commit(memory, { action: MEMORY_AUDIT_ACTIONS.MEMORY_UNLOCKED });
  }

  /**
   * Recompute the decay (freshness) score deterministically as of a supplied
   * timestamp. Locked memories are exempt from automatic decay.
   */
  async function applyDecay(input = {}) {
    const travellerIdentityId = assertNonEmptyString(input.travellerIdentityId, 'travellerIdentityId');
    const asOf = input.asOf ?? now();
    const memories = await repository.listMemoriesForTraveller(travellerIdentityId);
    const updated = [];
    for (const snapshot of memories) {
      if (snapshot.locked) continue;
      const memory = await repository.getMemory(snapshot.memoryId);
      const decayScore = computeDecayScore(memory.lastConfirmed, asOf);
      if (decayScore === memory.decayScore) continue;
      memory.decayScore = decayScore;
      updated.push(await commit(memory, {
        action: MEMORY_AUDIT_ACTIONS.DECAY_APPLIED,
        details: { decayScore, asOf },
      }));
    }
    return updated;
  }

  async function getMemory(memoryId) {
    return clone(await loadMemory(memoryId));
  }

  async function listMemoriesForTraveller(travellerIdentityId, filter = {}) {
    const memories = await repository.listMemoriesForTraveller(
      assertNonEmptyString(travellerIdentityId, 'travellerIdentityId'),
    );
    return memories
      .filter(memory => !filter.polarity || memory.polarity === filter.polarity)
      .filter(memory => !filter.origin || memory.origin === filter.origin)
      .filter(memory => !filter.key || memory.key === filter.key)
      .filter(memory => filter.minConfidence == null || memory.confidence >= filter.minConfidence);
  }

  async function explainMemory(memoryId) {
    const memory = await loadMemory(assertNonEmptyString(memoryId, 'memoryId'));
    return {
      memoryId: memory.memoryId,
      travellerIdentityId: memory.travellerIdentityId,
      key: memory.key,
      value: memory.value,
      polarity: memory.polarity,
      origin: memory.origin,
      confidence: memory.confidence,
      decayScore: memory.decayScore,
      effectiveConfidence: effectiveConfidenceOf(memory),
      observationCount: memory.observationCount,
      firstObserved: memory.firstObserved,
      lastConfirmed: memory.lastConfirmed,
      locked: memory.locked,
      corrected: Boolean(memory.manualCorrection),
      sources: clone(memory.sources),
      explanation: buildExplanation(memory),
    };
  }

  async function getVersionHistory(memoryId) {
    await loadMemory(memoryId);
    return repository.listVersions(memoryId);
  }

  async function getVersion(memoryId, version) {
    const snapshot = await repository.getVersion(memoryId, Number(version));
    if (!snapshot) throw versionNotFoundError(version);
    return snapshot;
  }

  async function getAuditEvents(filter = {}) {
    return repository.listAuditEvents(filter);
  }

  return {
    repository,
    recordExplicitMemory,
    observeLearnedMemory,
    recordFromSnapshot,
    correctMemory,
    lockMemory,
    unlockMemory,
    applyDecay,
    getMemory,
    listMemoriesForTraveller,
    explainMemory,
    getVersionHistory,
    getVersion,
    getAuditEvents,
  };
}
