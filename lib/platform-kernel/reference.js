// Platform Kernel — the canonical Reference type.
//
// A Reference is the universal pointer to an entity owned by some platform:
// `{ type, id }` and nothing else. References never carry business data — extra
// keys are dropped — so no module can leak domain data through a reference.

import { kernelValidationError } from './errors.js';

function requireString(value, field, errorFactory) {
  if (typeof value !== 'string' || !value.trim()) {
    throw errorFactory(`${field} is required`, { field });
  }
  return value.trim();
}

// Normalises to `{ type, id }`: type lowercased (slug namespace), id trimmed
// (case preserved). Any other keys are discarded.
export function normalizeReference(input, errorFactory = kernelValidationError, label = 'reference') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw errorFactory(`${label} must be an object with { type, id }`, { field: label });
  }
  return {
    type: requireString(input.type, `${label}.type`, errorFactory).toLowerCase(),
    id: requireString(input.id, `${label}.id`, errorFactory),
  };
}

export function assertReference(input, errorFactory = kernelValidationError, label = 'reference') {
  normalizeReference(input, errorFactory, label);
  return input;
}

// Stable, deterministic key for a reference — `${type}:${id}` (type lowercased).
export function stableReferenceKey(reference) {
  return `${String(reference.type).toLowerCase()}:${reference.id}`;
}
