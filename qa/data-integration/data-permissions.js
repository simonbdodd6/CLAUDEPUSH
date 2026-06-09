/**
 * Data Permissions
 *
 * Role-based access control for all data sources and fields.
 *
 * Role hierarchy (ascending): public < player < coach < manager < admin < dor
 * Sensitivity hierarchy:      public < internal < restricted < confidential
 *
 * Rules:
 * - A role can access a source if role rank >= source.requiredRole rank
 * - Sensitive fields are stripped unless role rank >= their minimum role
 * - Medical fields (injuries, notes) require manager+
 * - Financial fields (amounts, payment info) require manager+
 * - Personal contact info requires coach+
 */

import { SENSITIVITY } from './data-source.js';
import { ROLE_RANK } from './data-registry.js';

export { SENSITIVITY };

// Sensitivity → minimum role needed to read it
const SENSITIVITY_ROLE_MAP = {
  [SENSITIVITY.PUBLIC]:       'public',
  [SENSITIVITY.INTERNAL]:     'player',
  [SENSITIVITY.RESTRICTED]:   'coach',
  [SENSITIVITY.CONFIDENTIAL]: 'manager',
};

// Fields that are always stripped at each sensitivity level
const CONFIDENTIAL_FIELD_PATTERNS = [
  'dob', 'dateOfBirth', 'birthDate',
  'medicalNotes', 'medicalHistory', 'diagnosis', 'prescription',
  'bankAccount', 'iban', 'paymentMethod', 'cardLast4',
  'passportNumber', 'ppsNumber', 'insuranceNumber',
  'emergencyContact',
];

const RESTRICTED_FIELD_PATTERNS = [
  'phone', 'mobile', 'email', 'address', 'postcode',
  'parentContact', 'guardianPhone',
];

// ── Core permission checks ────────────────────────────────────────────────────

/**
 * Can this role access this data source?
 */
export function canAccess(role, dataSource) {
  const roleRank    = ROLE_RANK[role]               ?? 0;
  const reqRank     = ROLE_RANK[dataSource?.requiredRole] ?? 0;
  return roleRank >= reqRank;
}

/**
 * Can this role perform a specific action on a data source?
 */
export function canPerformAction(role, dataSource, action) {
  if (!canAccess(role, dataSource)) return false;
  return (dataSource.availableActions ?? []).includes(action);
}

/**
 * Filter an array of records to remove fields the role cannot see.
 */
export function filterFields(records, role, dataSource) {
  if (!records) return [];
  const roleRank = ROLE_RANK[role] ?? 0;

  return (Array.isArray(records) ? records : [records]).map(record => {
    return sanitizeRecord(record, role, roleRank);
  });
}

/**
 * Sanitize a single record — strip fields the role cannot access.
 */
export function sanitizeRecord(record, role, roleRankOverride) {
  if (!record || typeof record !== 'object') return record;
  const roleRank = roleRankOverride ?? ROLE_RANK[role] ?? 0;
  const out = {};

  for (const [key, value] of Object.entries(record)) {
    if (isConfidentialField(key) && roleRank < ROLE_RANK['manager']) {
      out[key] = '[RESTRICTED]';
      continue;
    }
    if (isRestrictedField(key) && roleRank < ROLE_RANK['coach']) {
      out[key] = '[RESTRICTED]';
      continue;
    }
    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      out[key] = sanitizeRecord(value, role, roleRank);
    } else {
      out[key] = value;
    }
  }

  return out;
}

function isConfidentialField(key) {
  const lower = key.toLowerCase();
  return CONFIDENTIAL_FIELD_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

function isRestrictedField(key) {
  const lower = key.toLowerCase();
  return RESTRICTED_FIELD_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

// ── Permission report ─────────────────────────────────────────────────────────

/**
 * Full permission matrix — for each role, which sources can it access?
 */
export function getPermissionMatrix(dataSources) {
  const roles = ['public', 'player', 'coach', 'manager', 'admin', 'dor'];

  return {
    roles,
    sensitivityLevels: Object.values(SENSITIVITY),
    matrix: roles.map(role => ({
      role,
      accessibleSources: dataSources
        .filter(s => canAccess(role, s))
        .map(s => s.name),
      sourceCount: dataSources.filter(s => canAccess(role, s)).length,
    })),
    sources: dataSources.map(s => ({
      name:        s.name,
      sensitivity: s.sensitivity,
      requiredRole: s.requiredRole,
      minRoleLabel: `${s.requiredRole}+`,
    })),
  };
}

/**
 * What data can the AI use for a given role + request context?
 * Returns approved sources with a note if mock data.
 */
export function getApprovedSources(role, dataSources, intent = null) {
  const approved = dataSources.filter(s => canAccess(role, s));
  return approved.map(s => ({
    name:          s.name,
    isMock:        s.isMock,
    sensitivity:   s.sensitivity,
    dataQuality:   s.adapterStatus === 'live' ? 'real' : s.adapterStatus === 'mock' ? 'sample' : 'unavailable',
    warning:       s.isMock ? `⚠ ${s.name} is using sample data — not real club data` : null,
  }));
}
