/**
 * Data Health
 *
 * Health checks for all registered data sources.
 * Answers: "Is this source available, returning data, and how fresh is it?"
 */

import { getAllDataSources } from './data-registry.js';
import { ADAPTER_STATUS }   from './data-source.js';

export const HEALTH_STATUS = {
  HEALTHY:     'healthy',
  DEGRADED:    'degraded',
  UNAVAILABLE: 'unavailable',
  MOCK:        'mock',
  PLANNED:     'planned',
};

// ── Per-source health check ───────────────────────────────────────────────────

export async function checkSourceHealth(source) {
  const t0     = Date.now();
  const status = source.adapterStatus;

  if (status === ADAPTER_STATUS.PLANNED || status === ADAPTER_STATUS.STUB) {
    return {
      name:        source.name,
      status:      status === ADAPTER_STATUS.PLANNED ? HEALTH_STATUS.PLANNED : HEALTH_STATUS.UNAVAILABLE,
      isMock:      true,
      recordCount: 0,
      latencyMs:   0,
      lastChecked: new Date().toISOString(),
      message:     `${source.name}: adapter status is '${status}'`,
    };
  }

  if (!source.fetch) {
    return {
      name:        source.name,
      status:      HEALTH_STATUS.UNAVAILABLE,
      isMock:      true,
      recordCount: 0,
      latencyMs:   0,
      lastChecked: new Date().toISOString(),
      message:     `${source.name}: no fetch function registered`,
    };
  }

  try {
    const result = await source.fetch({ limit: 1, role: 'admin' });
    const latencyMs = Date.now() - t0;
    const records   = result?.data ?? [];

    return {
      name:        source.name,
      status:      source.adapterStatus === ADAPTER_STATUS.LIVE
        ? HEALTH_STATUS.HEALTHY
        : HEALTH_STATUS.MOCK,
      isMock:      source.isMock,
      recordCount: result?.count ?? records.length,
      latencyMs,
      lastChecked: new Date().toISOString(),
      message:     `${source.name}: ${records.length > 0 ? 'returning data' : 'no records'} (${latencyMs}ms)`,
    };
  } catch (err) {
    return {
      name:        source.name,
      status:      HEALTH_STATUS.UNAVAILABLE,
      isMock:      source.isMock,
      recordCount: 0,
      latencyMs:   Date.now() - t0,
      lastChecked: new Date().toISOString(),
      message:     `${source.name}: error — ${err.message}`,
      error:       err.message,
    };
  }
}

// ── Full health check ─────────────────────────────────────────────────────────

export async function checkAllHealth() {
  const sources = getAllDataSources();
  const results = await Promise.all(sources.map(checkSourceHealth));

  const healthy     = results.filter(r => r.status === HEALTH_STATUS.HEALTHY).length;
  const mock        = results.filter(r => r.status === HEALTH_STATUS.MOCK).length;
  const unavailable = results.filter(r => r.status === HEALTH_STATUS.UNAVAILABLE).length;
  const planned     = results.filter(r => r.status === HEALTH_STATUS.PLANNED).length;

  let overall;
  if (unavailable > sources.length / 2) overall = HEALTH_STATUS.UNAVAILABLE;
  else if (healthy + mock > 0)          overall = healthy > 0 ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.MOCK;
  else                                  overall = HEALTH_STATUS.DEGRADED;

  return {
    overall,
    totalSources:     sources.length,
    healthy,
    mock,
    unavailable,
    planned,
    liveDataAvailable: healthy > 0,
    checkedAt:        new Date().toISOString(),
    sources:          results,
    summary: `${healthy} live, ${mock} mock, ${unavailable} unavailable, ${planned} planned`,
  };
}

/**
 * Quick health check (no fetch — just registry status).
 */
export function quickHealthCheck() {
  const sources = getAllDataSources();
  const byStatus = {};
  for (const s of sources) {
    byStatus[s.adapterStatus] = (byStatus[s.adapterStatus] ?? 0) + 1;
  }
  return {
    totalSources: sources.length,
    byStatus,
    hasMockOnly:  !sources.some(s => s.adapterStatus === ADAPTER_STATUS.LIVE),
    checkedAt:    new Date().toISOString(),
  };
}
