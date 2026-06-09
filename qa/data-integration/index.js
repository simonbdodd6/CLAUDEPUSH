// Coach's Eye Data Integration Layer — public API
// Import this module to register all adapters and access club data.

import './adapters/index.js';

export { registerDataSource, getDataSource, getAvailableData, getMissingData, getSourcesForIntent, registryStats, ROLE_RANK } from './data-registry.js';
export { canAccess, filterFields, sanitizeRecord, getPermissionMatrix, getApprovedSources, getDataPermissions } from './data-permissions.js';
export { query, queryPlayerData, queryTeamData, queryClubData, queryMultiple } from './data-query.js';
export { checkSourceHealth, checkAllHealth, quickHealthCheck, HEALTH_STATUS } from './data-health.js';
export { createDataSource, field, fetchResult, DATA_SOURCE_TYPES, ADAPTER_STATUS, SENSITIVITY, ACTIONS } from './data-source.js';
export { normalizePlayer, normalizeTeam, normalizeSession, normalizeInjury, normalizeFixture, normalizeAttendance, normalizeMembership, normalizeFinancial, normalizeGeneric, normalizeRecords } from './data-normalizer.js';
export { get as cacheGet, set as cacheSet, has as cacheHas, invalidate as cacheInvalidate, stats as cacheStats } from './data-cache.js';

import { checkAllHealth } from './data-health.js';
import { getAvailableData, getMissingData, registryStats } from './data-registry.js';
import { getPermissionMatrix } from './data-permissions.js';

export async function getDataHealth() { return checkAllHealth(); }
export function getDataPermissions(role = 'coach') { const r = getAvailableData(role); return getPermissionMatrix(r.sources ?? r); }
