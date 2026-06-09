// Query history — ring buffer + JSONL audit log for all Knowledge Engine queries.

import { appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const LOG_PATH    = join(__dirname, '..', 'memory-engine', 'data', 'knowledge-history.jsonl');
const MAX_ENTRIES = 1000;
const _buffer     = [];

export function logQuery(entry) {
  const record = {
    queryId:   `kq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    query:     entry.query ?? '',
    intent:    entry.intent ?? 'unknown',
    domain:    entry.domain ?? 'general',
    resultCount: entry.resultCount ?? 0,
    confidence:  entry.confidence ?? 0,
    durationMs:  entry.durationMs ?? 0,
    cached:    entry.cached ?? false,
    error:     entry.error ?? null,
    ts:        new Date().toISOString(),
  };

  _buffer.push(record);
  if (_buffer.length > MAX_ENTRIES) _buffer.shift();

  try { appendFileSync(LOG_PATH, JSON.stringify(record) + '\n', 'utf8'); } catch { /* non-fatal */ }

  return record;
}

export function getRecentQueries(n = 20) {
  return [..._buffer].reverse().slice(0, n);
}

export function getQueryByIntent(intent, n = 10) {
  return _buffer.filter(q => q.intent === intent).slice(-n);
}

export function getQueryStats() {
  if (!_buffer.length) return { total: 0, byIntent: {}, byDomain: {}, avgConfidence: 0, avgDurationMs: 0, cacheHitRate: 0 };

  const byIntent = {}, byDomain = {};
  let totalConf = 0, totalDur = 0, cacheHits = 0;

  _buffer.forEach(q => {
    byIntent[q.intent]  = (byIntent[q.intent]  ?? 0) + 1;
    byDomain[q.domain]  = (byDomain[q.domain]  ?? 0) + 1;
    totalConf += q.confidence;
    totalDur  += q.durationMs;
    if (q.cached) cacheHits++;
  });

  return {
    total:          _buffer.length,
    byIntent,
    byDomain,
    avgConfidence:  Math.round(totalConf / _buffer.length),
    avgDurationMs:  Math.round(totalDur  / _buffer.length),
    cacheHitRate:   Math.round((cacheHits / _buffer.length) * 100),
  };
}

export function clearHistory() {
  _buffer.length = 0;
}
