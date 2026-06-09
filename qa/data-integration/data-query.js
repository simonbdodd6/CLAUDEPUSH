/**
 * Data Query Engine
 *
 * Unified interface for querying any registered data source.
 * Handles: permission checks, cache lookup, fetch, filter, project, sort, paginate.
 *
 * QueryParams:
 * {
 *   source:   string         — data source name
 *   role:     string         — requesting role (default: 'coach')
 *   filter:   object         — field → value pairs to match
 *   fields:   string[]       — fields to include (projection; null = all permitted)
 *   sort:     { field, direction: 'asc'|'desc' }
 *   limit:    number         — max records (default 100)
 *   offset:   number         — skip N records
 *   useCache: boolean        — use cache (default true)
 * }
 *
 * QueryResult:
 * {
 *   success:    boolean
 *   data:       any[]
 *   count:      number
 *   total:      number        — before pagination
 *   isMock:     boolean
 *   sourceName: string
 *   dataQuality: 'real' | 'sample' | 'unavailable'
 *   role:       string
 *   warnings:   string[]
 *   metadata:   object
 * }
 */

import { getDataSource }   from './data-registry.js';
import { canAccess, filterFields } from './data-permissions.js';
import { get as cacheGet, set as cacheSet, cacheKey, TTL } from './data-cache.js';

// ── Main query function ───────────────────────────────────────────────────────

export async function query(params = {}) {
  const {
    source,
    role      = 'coach',
    filter    = {},
    fields    = null,
    sort      = null,
    limit     = 100,
    offset    = 0,
    useCache  = true,
  } = params;

  const warnings = [];

  // 1. Resolve source
  const ds = getDataSource(source);
  if (!ds) {
    return errorResult(`Unknown data source: '${source}'`, source, role);
  }

  // 2. Permission check
  if (!canAccess(role, ds)) {
    return errorResult(`Role '${role}' cannot access '${source}' (requires ${ds.requiredRole}+)`, source, role);
  }

  // 3. Mock/stub warning
  if (ds.isMock || ds.adapterStatus === 'mock') {
    warnings.push(`⚠ '${source}' is using sample data — results do not reflect real club data`);
  }
  if (ds.adapterStatus === 'stub' || ds.adapterStatus === 'planned') {
    return {
      success: true, data: [], count: 0, total: 0,
      isMock: true, sourceName: source,
      dataQuality: 'unavailable',
      role, warnings: [`'${source}' has no data yet — adapter status: ${ds.adapterStatus}`],
      metadata: { adapterStatus: ds.adapterStatus, realConnection: ds.realConnection },
    };
  }

  // 4. Cache lookup
  const key = useCache ? cacheKey(source, { role, filter, fields, sort, limit, offset }) : null;
  if (key) {
    const cached = cacheGet(key);
    if (cached) return { ...cached, _fromCache: true };
  }

  // 5. Fetch data
  if (!ds.fetch) {
    return errorResult(`Data source '${source}' has no fetch function`, source, role);
  }

  let fetchResult;
  try {
    fetchResult = await ds.fetch({ filter, fields, sort, limit, offset, role });
  } catch (err) {
    return errorResult(`Fetch failed for '${source}': ${err.message}`, source, role);
  }

  // 6. Apply permissions (strip sensitive fields)
  let data = filterFields(fetchResult.data ?? [], role, ds);

  // 7. Filter
  data = applyFilter(data, filter);
  const total = data.length;

  // 8. Sort
  if (sort?.field) {
    data = applySort(data, sort);
  }

  // 9. Paginate
  data = data.slice(offset, offset + limit);

  // 10. Project fields
  if (fields?.length) {
    data = projectFields(data, fields);
  }

  // 11. Build result
  const result = {
    success:     true,
    data,
    count:       data.length,
    total,
    isMock:      fetchResult.isMock ?? ds.isMock,
    sourceName:  source,
    dataQuality: ds.adapterStatus === 'live' ? 'real' : 'sample',
    role,
    warnings:    [...warnings, ...(fetchResult.warnings ?? [])],
    metadata: {
      adapterStatus: ds.adapterStatus,
      fetchedAt:     fetchResult.fetchedAt,
      sensitivity:   ds.sensitivity,
    },
  };

  // 12. Cache result
  if (key) {
    cacheSet(key, result, ds.adapterStatus === 'live' ? TTL.LIVE : TTL.MOCK);
  }

  return result;
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export async function queryPlayerData(params = {}) {
  return query({ source: 'players', ...params });
}

export async function queryTeamData(params = {}) {
  return query({ source: 'teams', ...params });
}

export async function queryClubData(params = {}) {
  return query(params);
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/**
 * Fetch from multiple sources and merge into a single result set.
 * Used by the Orchestrator to pre-load the context bus.
 */
export async function queryMultiple(sourcesAndParams, role = 'coach') {
  const results = {};
  await Promise.all(
    sourcesAndParams.map(async ({ source, ...rest }) => {
      try {
        results[source] = await query({ source, role, ...rest });
      } catch (err) {
        results[source] = errorResult(err.message, source, role);
      }
    })
  );
  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyFilter(data, filter) {
  if (!filter || Object.keys(filter).length === 0) return data;
  return data.filter(record => {
    return Object.entries(filter).every(([key, value]) => {
      if (value === null || value === undefined) return true;
      const recordValue = getNestedValue(record, key);
      if (Array.isArray(value)) return value.includes(recordValue);
      if (typeof value === 'string' && typeof recordValue === 'string') {
        return recordValue.toLowerCase().includes(value.toLowerCase());
      }
      return recordValue === value;
    });
  });
}

function applySort(data, sort) {
  const { field, direction = 'asc' } = sort;
  return [...data].sort((a, b) => {
    const va = getNestedValue(a, field);
    const vb = getNestedValue(b, field);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return direction === 'desc' ? -cmp : cmp;
  });
}

function projectFields(data, fields) {
  return data.map(record => {
    const out = {};
    for (const f of fields) {
      const v = getNestedValue(record, f);
      if (v !== undefined) out[f] = v;
    }
    // Always include id and _source for traceability
    if (record.id !== undefined) out.id = record.id;
    out._source  = record._source;
    out._isMock  = record._isMock;
    return out;
  });
}

function getNestedValue(obj, path) {
  if (!path.includes('.')) return obj[path];
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function errorResult(message, sourceName, role) {
  return {
    success: false, data: [], count: 0, total: 0,
    isMock: true, sourceName,
    dataQuality: 'unavailable',
    role, warnings: [message],
    error: message, metadata: {},
  };
}
