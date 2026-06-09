/**
 * Memory Health — diagnostics, stats, and index repair.
 * Run manually or as part of a nightly job.
 */

import { storageStats, readIndex, writeHealth, readLog } from './memory-store.js';
import { rebuildIndex } from './memory-index.js';

// ── Health check ──────────────────────────────────────────────────────────────

export function checkHealth() {
  const storage  = storageStats();
  const index    = readIndex();
  const indexCount = Object.keys(index).length;

  const discrepancies = [];

  // Check index vs actual file counts
  const entityCounts = storage.byType;
  const indexedByType = {};
  for (const entry of Object.values(index)) {
    indexedByType[entry.type] = (indexedByType[entry.type] ?? 0) + 1;
  }

  for (const [type, count] of Object.entries(entityCounts)) {
    const indexed = indexedByType[type] ?? 0;
    if (count !== indexed) {
      discrepancies.push({
        type,
        entityFiles: count,
        indexEntries: indexed,
        diff: count - indexed,
        suggestion: count > indexed
          ? 'Run repairIndex() to add missing entries'
          : 'Stale index entries — run repairIndex() to clean',
      });
    }
  }

  // Recent generation stats
  const recentGens = readLog('generations', { limit: 50 });
  const genStats = {
    total:     recentGens.length,
    byType:    {},
    byProvider: {},
    avgElapsed: 0,
  };
  let totalElapsed = 0;
  for (const gen of recentGens) {
    genStats.byType[gen.requestType]     = (genStats.byType[gen.requestType] ?? 0) + 1;
    genStats.byProvider[gen.provider]    = (genStats.byProvider[gen.provider] ?? 0) + 1;
    if (gen.elapsed) totalElapsed += gen.elapsed;
  }
  if (recentGens.length) genStats.avgElapsed = Math.round(totalElapsed / recentGens.length);

  const health = {
    status:       discrepancies.length === 0 ? 'ok' : 'degraded',
    checkedAt:    new Date().toISOString(),
    storage,
    indexCount,
    discrepancies,
    recentGenerations: genStats,
    recommendations: buildRecommendations(storage, discrepancies, genStats),
  };

  writeHealth(health);
  return health;
}

// ── Index repair ──────────────────────────────────────────────────────────────

export function repairIndex() {
  const before = Object.keys(readIndex()).length;
  const count  = rebuildIndex();
  const after  = count;

  return {
    repairedAt: new Date().toISOString(),
    before,
    after,
    diff: after - before,
    message: after > before
      ? `Added ${after - before} missing index entries`
      : after === before
      ? 'Index was already consistent'
      : `Removed ${before - after} stale index entries`,
  };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getStats() {
  const storage = storageStats();
  const index   = readIndex();

  return {
    totalEntities: storage.totalEntities,
    byType:        storage.byType,
    indexEntries:  Object.keys(index).length,
    logLines:      storage.totalLogLines,
    generationsLog: storage.generationsLog ?? 0,
    dataDir:       storage.dataDir,
  };
}

// ── Recommendations ───────────────────────────────────────────────────────────

function buildRecommendations(storage, discrepancies, genStats) {
  const recs = [];

  if (discrepancies.length) {
    recs.push(`Run repairIndex() to fix ${discrepancies.length} index discrepancy/ies`);
  }

  if (storage.byType.session > 100) {
    recs.push(`${storage.byType.session} sessions stored — consider archiving sessions older than 6 months`);
  }

  if (storage.byType['ai-generation'] > 200) {
    recs.push(`${storage.byType['ai-generation']} generation records — JSONL log is the primary log; entity files can be pruned`);
  }

  if (genStats.byProvider?.template > genStats.total * 0.8) {
    recs.push(`${Math.round(genStats.byProvider.template / genStats.total * 100)}% of generations are template-mode — set ANTHROPIC_API_KEY for better output`);
  }

  if (!recs.length) recs.push('Memory engine is healthy — no action required');

  return recs;
}
