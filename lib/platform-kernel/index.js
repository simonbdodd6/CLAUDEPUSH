// Platform Kernel — the zero-dependency shared foundation.
//
// Every platform/domain module may depend on the kernel; the kernel depends on
// nothing but Node built-ins. Imports point DOWNWARD into the kernel only.

export { PlatformKernelError, kernelValidationError } from './errors.js';
export { clone, deepClone } from './clone.js';
export {
  EXACT_LOCATION_FIELDS,
  findExactLocationFields,
  assertNoExactLocation,
  scrubExactLocation,
} from './location.js';
export { normalizeReference, assertReference, stableReferenceKey } from './reference.js';
export { createAuditEvent, nowIso } from './audit.js';
export { stableHash, buildIdempotencyKey, slug } from './idempotency.js';
export {
  isPlainObject,
  assertNonEmptyString,
  assertPlainObject,
  compareStrings,
  byKeys,
} from './validation.js';
export { cloneCollection } from './repository.js';
