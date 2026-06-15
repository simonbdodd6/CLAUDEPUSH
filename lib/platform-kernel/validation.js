// Platform Kernel — generic validation & ordering helpers.
//
// Domain-agnostic guards. Throwing helpers accept an injected `errorFactory` so
// each module keeps its own error type/message.

import { kernelValidationError } from './errors.js';

export function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function assertNonEmptyString(value, field, errorFactory = kernelValidationError) {
  if (typeof value !== 'string' || !value.trim()) {
    throw errorFactory(`${field} is required`, { field });
  }
  return value.trim();
}

export function assertPlainObject(value, field, errorFactory = kernelValidationError) {
  if (!isPlainObject(value)) {
    throw errorFactory(`${field} must be an object`, { field });
  }
  return value;
}

// Deterministic string comparison for stable ordering.
export function compareStrings(a, b) {
  return String(a).localeCompare(String(b));
}

// Build a stable comparator from an ordered list of key extractors.
// Each extractor returns a value compared with `<`/`>`; ties fall through.
export function byKeys(...extractors) {
  return (a, b) => {
    for (const extract of extractors) {
      const av = extract(a);
      const bv = extract(b);
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  };
}
