/**
 * Data Source Descriptor
 *
 * Defines the shape every registered data source must conform to.
 * Used by the registry, permissions layer, query engine, and health checks.
 *
 * DataSource:
 * {
 *   name:            string          — unique slug ('players', 'bar-sales', ...)
 *   type:            DataSourceType
 *   description:     string
 *   fields:          FieldDescriptor[]
 *   sensitivity:     SensitivityLevel
 *   requiredRole:    Role
 *   availableActions: Action[]
 *   adapterStatus:   AdapterStatus   — 'live' | 'mock' | 'stub' | 'planned'
 *   isMock:          boolean
 *   sampleDataPath:  string | null
 *   realConnection:  null | { type, note }   — future real integration info
 *   registeredAt:    ISO string
 *   version:         string
 *   fetch:           async (params) → FetchResult  — injected by adapter
 * }
 */

export const DATA_SOURCE_TYPES = {
  PLAYER:        'player',
  TEAM:          'team',
  COACHING:      'coaching',
  ATTENDANCE:    'attendance',
  FINANCIAL:     'financial',
  OPERATIONAL:   'operational',
  COMMUNICATION: 'communication',
  FACILITY:      'facility',
  COMMERCIAL:    'commercial',
  MEDIA:         'media',
};

export const ADAPTER_STATUS = {
  LIVE:    'live',     // connected to a real data source
  MOCK:    'mock',     // returning structured mock/sample data
  STUB:    'stub',     // skeleton only, no data
  PLANNED: 'planned',  // documented but not built yet
};

export const SENSITIVITY = {
  PUBLIC:       'public',       // anyone can read
  INTERNAL:     'internal',     // members and above
  RESTRICTED:   'restricted',   // coaches and above
  CONFIDENTIAL: 'confidential', // managers/admin/DOR only
};

export const ACTIONS = {
  READ:      'read',
  AGGREGATE: 'aggregate',
  EXPORT:    'export',
  WRITE:     'write',
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a validated DataSource descriptor.
 * Throws if required fields are missing.
 */
export function createDataSource(descriptor) {
  const required = ['name', 'type', 'description'];
  for (const k of required) {
    if (!descriptor[k]) throw new Error(`DataSource missing required field: ${k}`);
  }

  return {
    name:             descriptor.name,
    type:             descriptor.type,
    description:      descriptor.description,
    fields:           descriptor.fields           ?? [],
    sensitivity:      descriptor.sensitivity      ?? SENSITIVITY.INTERNAL,
    requiredRole:     descriptor.requiredRole      ?? 'coach',
    availableActions: descriptor.availableActions  ?? [ACTIONS.READ, ACTIONS.AGGREGATE],
    adapterStatus:    descriptor.adapterStatus     ?? ADAPTER_STATUS.MOCK,
    isMock:           descriptor.adapterStatus !== ADAPTER_STATUS.LIVE,
    sampleDataPath:   descriptor.sampleDataPath    ?? null,
    realConnection:   descriptor.realConnection    ?? null,
    registeredAt:     new Date().toISOString(),
    version:          descriptor.version           ?? '1.0.0',
    tags:             descriptor.tags              ?? [],
    fetch:            descriptor.fetch             ?? null,
  };
}

/**
 * Create a field descriptor.
 */
export function field(name, type, description, options = {}) {
  return {
    name,
    type,
    description,
    sensitive:  options.sensitive  ?? false,
    required:   options.required   ?? false,
    nullable:   options.nullable   ?? true,
    example:    options.example    ?? null,
  };
}

/**
 * FetchResult shape returned by every adapter.
 * {
 *   data:       any[]    — normalized records
 *   count:      number
 *   isMock:     boolean
 *   sourceName: string
 *   fetchedAt:  ISO string
 *   warnings:   string[]
 * }
 */
export function fetchResult(data, sourceName, isMock, warnings = []) {
  return {
    data:       Array.isArray(data) ? data : [data],
    count:      Array.isArray(data) ? data.length : 1,
    isMock,
    sourceName,
    fetchedAt:  new Date().toISOString(),
    warnings,
  };
}
