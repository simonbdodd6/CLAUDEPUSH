// Knowledge Engine health — checks index coverage, engine connectivity, freshness.

import { getIndex, indexStats, getLastBuilt, DOMAINS } from './knowledge-index.js';
import { stats as cacheStats } from './knowledge-cache.js';
import { getQueryStats } from './knowledge-history.js';

// Minimum expected entry counts per domain (0 = optional)
const DOMAIN_THRESHOLDS = {
  [DOMAINS.PLAYERS]:        0,
  [DOMAINS.TEAMS]:          0,
  [DOMAINS.FIXTURES]:       0,
  [DOMAINS.MATCH_HISTORY]:  0,
  [DOMAINS.ATTENDANCE]:     0,
  [DOMAINS.TRAINING]:       0,
  [DOMAINS.MEDICAL]:        0,
  [DOMAINS.MEMBERSHIP]:     0,
  [DOMAINS.SPONSORS]:       0,
  [DOMAINS.VOLUNTEERS]:     0,
  [DOMAINS.COMMUNICATIONS]: 0,
};

export async function checkHealth() {
  const idx       = await getIndex();
  const stats     = indexStats();
  const lastBuilt = getLastBuilt();

  const domains    = {};
  const warnings   = [];
  const errors     = [];
  let   totalLive  = 0, totalMock = 0;

  for (const [domain, di] of idx.entries()) {
    const threshold = DOMAIN_THRESHOLDS[domain] ?? 0;
    const status = di.error
      ? 'error'
      : di.count === 0 && threshold > 0
        ? 'empty'
        : di.isMock
          ? 'mock'
          : 'live';

    domains[domain] = {
      status,
      count:       di.count,
      isMock:      di.isMock,
      lastIndexed: di.lastIndexed,
      engine:      di.engine,
      error:       di.error ?? null,
    };

    if (status === 'error')  errors.push(`${domain}: ${di.error}`);
    if (status === 'mock')   totalMock += di.count;
    if (status === 'live')   totalLive += di.count;
    if (status === 'empty' && threshold > 0) warnings.push(`${domain}: no entries (expected ≥${threshold})`);
  }

  // Freshness check — warn if index is >10 minutes old
  const ageMs = lastBuilt ? Date.now() - new Date(lastBuilt).getTime() : Infinity;
  if (ageMs > 10 * 60 * 1000) warnings.push(`Index is ${Math.round(ageMs / 60000)} minutes old — consider refreshing`);

  const healthy = errors.length === 0;
  const coverage = stats.domains > 0 ? Math.round((Object.values(domains).filter(d => d.status !== 'error').length / stats.domains) * 100) : 0;
  const liveRatio = stats.total > 0 ? Math.round((totalLive / stats.total) * 100) : 0;

  return {
    healthy,
    coverage,
    liveRatio,
    totalEntries:  stats.total,
    totalLive,
    totalMock,
    domains,
    warnings,
    errors,
    lastBuilt,
    indexAgeMinutes: Math.round(ageMs / 60000),
    cache:    cacheStats(),
    queryHistory: getQueryStats(),
  };
}

export function formatHealth(h) {
  const icon = h.healthy ? '✅' : '❌';
  const lines = [
    `## Knowledge Engine Health ${icon}`,
    `Coverage: ${h.coverage}% · Live data: ${h.liveRatio}% · Total entries: ${h.totalEntries}`,
    `Last built: ${h.lastBuilt ? new Date(h.lastBuilt).toLocaleTimeString('en-IE') : 'never'} (${h.indexAgeMinutes} min ago)`,
    '',
    '### Domain Status',
  ];

  for (const [domain, di] of Object.entries(h.domains)) {
    const icon  = di.status === 'live' ? '✅' : di.status === 'mock' ? '⚠️' : di.status === 'error' ? '❌' : '🔲';
    lines.push(`${icon} **${domain}**: ${di.count} entries (${di.status}) — ${di.engine ?? 'unknown engine'}`);
  }

  if (h.warnings.length) {
    lines.push('', '### Warnings');
    h.warnings.forEach(w => lines.push(`- ⚠️  ${w}`));
  }

  if (h.errors.length) {
    lines.push('', '### Errors');
    h.errors.forEach(e => lines.push(`- ❌ ${e}`));
  }

  lines.push(
    '',
    `### Cache: ${h.cache.live} live entries · ${h.cache.totalHits} hits`,
    `### Queries: ${h.queryHistory.total} total · avg ${h.queryHistory.avgConfidence}% confidence · avg ${h.queryHistory.avgDurationMs}ms`,
  );

  return lines.join('\n');
}
