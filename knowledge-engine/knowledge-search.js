// Knowledge Search — runs a structured query against the index and returns results.

import { getIndex, DOMAINS } from './knowledge-index.js';
import { rankResults, sortByAttendanceMissed, sortByExpiryDate, sortByLastActive } from './knowledge-ranking.js';

export async function search(parsedQuery, options = {}) {
  const { limit = parsedQuery.limit ?? 20 } = options;
  const idx = await getIndex(parsedQuery.domain);

  let entries = [];

  if (parsedQuery.domain) {
    // Single-domain search
    const domainIdx = idx?.entries ?? [];
    entries = applyFilters(domainIdx, parsedQuery);
  } else {
    // Cross-domain search (general)
    const fullIndex = await getIndex();
    for (const [, di] of fullIndex.entries()) {
      entries.push(...applyFilters(di.entries ?? [], parsedQuery));
    }
  }

  // Apply intent-specific sort before generic ranking
  entries = intentSort(entries, parsedQuery.intent);

  // Apply generic ranking
  const ranked = rankResults(entries, parsedQuery.raw, { limit });

  return {
    results:  ranked,
    count:    ranked.length,
    total:    entries.length,
    domain:   parsedQuery.domain,
    isMock:   ranked.some(r => r.isMock),
  };
}

function applyFilters(entries, q) {
  let results = [...entries];
  const f = q.filters ?? {};

  // Position filter (for players and medical)
  if (f.positions?.length) {
    results = results.filter(r => {
      const tags = r.tags ?? [];
      const pos  = (r.data?.core?.position ?? r.data?.position ?? '').toLowerCase();
      return f.positions.some(p => tags.includes(p) || pos.includes(p));
    });
  }

  // Age group filter
  if (f.ageGroups?.length) {
    results = results.filter(r => {
      const ag = r.data?.ageGroup ?? r.data?.core?.ageGroup ?? r.data?.team ?? '';
      return f.ageGroups.some(a => ag.toLowerCase().includes(a.toLowerCase()));
    });
  }

  // Active/injury filter
  if (f.injured === true) {
    results = results.filter(r =>
      r.tags?.includes('injured') ||
      r.data?.status === 'active' ||
      r.domain === DOMAINS.MEDICAL
    );
  }

  // Name filter (fuzzy)
  if (f.name) {
    const lowerName = f.name.toLowerCase();
    results = results.filter(r =>
      r.name?.toLowerCase().includes(lowerName) ||
      (r.data?.core?.name ?? r.data?.name ?? '').toLowerCase().includes(lowerName) ||
      r.tags?.some(t => t?.toLowerCase().includes(lowerName))
    );
  }

  // Time range filter
  if (q.timeRange) {
    const cutoff = q.timeRange.days > 0
      ? Date.now() + q.timeRange.days * 86400000     // future (upcoming)
      : Date.now() + q.timeRange.days * 86400000;    // past (history)
    results = filterByTimeRange(results, q.timeRange);
  }

  return results;
}

function filterByTimeRange(entries, timeRange) {
  const { range, days } = timeRange;
  const now = Date.now();

  return entries.filter(r => {
    const d    = r.data ?? {};
    const dateMs = _parseDateMs(d.date ?? d.validUntil ?? d.expiresAt ?? d.updatedAt);
    if (!dateMs) return true; // no date = include (no filter possible)

    if (range === 'this_month' || range === 'upcoming') return dateMs >= now && dateMs <= now + 30 * 86400000;
    if (range === 'this_week')   return dateMs >= now && dateMs <= now + 7 * 86400000;
    if (range === 'this_season') return dateMs >= now - 300 * 86400000;
    if (range === 'recent')      return dateMs >= now - 30 * 86400000;
    return true;
  });
}

function _parseDateMs(val) {
  if (!val) return null;
  const ms = new Date(val).getTime();
  return isNaN(ms) ? null : ms;
}

function intentSort(entries, intent) {
  switch (intent) {
    case 'attendance_worst':
      return sortByAttendanceMissed(entries);
    case 'sponsor_expiry':
      return sortByExpiryDate(entries);
    case 'volunteer_inactive':
      return sortByLastActive(entries);
    default:
      return entries;
  }
}

// Cross-domain keyword search (for general queries)
export async function keywordSearch(text, options = {}) {
  const { limit = 15, domains = null } = options;
  const words  = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const idx    = await getIndex();
  const results = [];

  for (const [domain, di] of idx.entries()) {
    if (domains && !domains.includes(domain)) continue;
    for (const e of (di.entries ?? [])) {
      const haystack = [
        e.name, ...(e.tags ?? []),
        ...(Object.values(e.data ?? {}).filter(v => typeof v === 'string')),
      ].join(' ').toLowerCase();

      const matchCount = words.filter(w => haystack.includes(w)).length;
      if (matchCount > 0) {
        results.push({ ...e, baseScore: matchCount * 10 });
      }
    }
  }

  return rankResults(results, text, { limit });
}
