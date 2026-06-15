// Platform Kernel — exact-location protection.
//
// One canonical set of forbidden exact-location field names and the deep scan
// used to reject/scrub them. Privacy rule: no module may store or expose an
// exact traveller location; broad/approximate references only.
//
// `assertNoExactLocation` accepts an injected `errorFactory` and `label` so each
// module keeps its exact error type and message (e.g. "Context output must not
// include exact location field: lat"). The scan is deep and throws on the first
// offending key — matching the existing behaviour of the deep-scrubbing modules.

import { kernelValidationError } from './errors.js';

export const EXACT_LOCATION_FIELDS = Object.freeze([
  'coordinates',
  'coordinate',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'exactLocation',
  'liveLocation',
  'travellerLocation',
  'currentLocation',
  'gps',
  'geo',
]);

// Pure: returns every forbidden field name found anywhere in the value (deep).
export function findExactLocationFields(value, fields = EXACT_LOCATION_FIELDS) {
  const found = new Set();
  (function scan(node) {
    if (Array.isArray(node)) { node.forEach(scan); return; }
    if (node && typeof node === 'object') {
      for (const [key, nested] of Object.entries(node)) {
        if (fields.includes(key)) found.add(key);
        scan(nested);
      }
    }
  })(value);
  return [...found];
}

// Throws (via the injected factory) on the first forbidden field, deep.
export function assertNoExactLocation(value, errorFactory = kernelValidationError, options = {}) {
  const { label = 'input', fields = EXACT_LOCATION_FIELDS } = options;
  (function scan(node) {
    if (Array.isArray(node)) { node.forEach(scan); return; }
    if (node && typeof node === 'object') {
      for (const [key, nested] of Object.entries(node)) {
        if (fields.includes(key)) {
          throw errorFactory(`${label} must not include exact location field: ${key}`, { field: key });
        }
        scan(nested);
      }
    }
  })(value);
  return value;
}

// Shallow (top-level only) variant used by the older domain modules whose guard
// reports ALL offending top-level fields in one batch error and uses the message
// "<label> must not include exact traveller location". Callers pass their own
// `fields` list so each module's exact field set is preserved. Non-objects pass
// through unchanged (matching those modules' existing behaviour).
export function assertNoExactLocationShallow(input, errorFactory = kernelValidationError, options = {}) {
  const { label = 'input', fields = EXACT_LOCATION_FIELDS } = options;
  if (input == null || typeof input !== 'object') return input;
  const present = fields.filter(field => Object.prototype.hasOwnProperty.call(input, field));
  if (present.length) {
    throw errorFactory(`${label} must not include exact traveller location`, { fields: present });
  }
  return input;
}

// Returns a deep copy with all forbidden fields removed.
export function scrubExactLocation(value, fields = EXACT_LOCATION_FIELDS) {
  if (Array.isArray(value)) return value.map(v => scrubExactLocation(v, fields));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (fields.includes(key)) continue;
      out[key] = scrubExactLocation(nested, fields);
    }
    return out;
  }
  return value;
}
