// api/_coachMemoryCapture.js — First Coach Memory capture path (Core Memory M4, DORMANT)
//
// The first WRITE entry point that turns a coach's manual input into a persisted, Brain-readable
// coach memory. It is the one seam in the memory stack where a real-world action (with a real
// timestamp) enters an otherwise byte-deterministic pipeline — so the two non-deterministic
// effects it needs, the entry id and the createdAt timestamp, are minted through INJECTABLE seams
// (clock, idFactory) with production defaults that follow the existing Core convention
// (_identityStore.js newId/nowIso). Tests inject fixed values and the whole path becomes
// deterministic again.
//
// It is a capture path only — no reasoning, no classification, no scoring, no summarising, no
// recommendation. It whitelists ONLY the eight M108 content fields, invents NO content (confidence
// and weight are required from the caller, not defaulted), mints id + createdAt server-side,
// and delegates ALL validation and persistence to the M1 store (createCoachMemory). Any id or
// timestamp a caller tries to supply is ignored — the server owns those, so records cannot be
// forged or collided on by the caller.
//
// Tenant safety: the scope { teamId, coachId } comes from the CALLER (in production, from the
// authenticated session) and is validated here before any store access. A missing/invalid scope
// is rejected before minting — a write can never fall through to another tenant's collection.
//
// Dormant: nothing imports this module yet; there is no HTTP route and no UI. Wiring a reachable
// endpoint is a separate, later, deliberate step.

import { createCoachMemory } from './_coachMemoryStore.js';

const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// The eight M108 CONTENT fields a caller may supply. `id`/`createdAt`/`updatedAt` are deliberately
// NOT here — the server mints id + createdAt; anything else is dropped.
const CONTENT_FIELDS = Object.freeze(['type', 'statement', 'confidence', 'weight', 'tags', 'ontologyLinks', 'evidenceRefs', 'source']);

// Production defaults — mirror the Core server-issued-id convention (_identityStore.js:156/160).
export const defaultCoachMemoryTimestamp = () => new Date().toISOString();
export const defaultCoachMemoryId = () => `cmem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Copy a caller value without sharing references, so capture can never mutate the caller's input.
// Invalid shapes pass through untouched for the store to reject with an accurate message.
function copyContentValue(field, value) {
  if (field === 'tags' || field === 'evidenceRefs') return Array.isArray(value) ? [...value] : value;
  if (field === 'ontologyLinks') return Array.isArray(value) ? value.map(l => (isObject(l) ? { ...l } : l)) : value;
  return value;
}

/**
 * Capture one manual coach memory into the persisted store.
 *
 * @param {{ teamId: string, coachId: string }} scope caller-owned tenant scope (from the session).
 * @param {object} input the eight M108 content fields; extra/id/timestamp fields are ignored.
 * @param {{ clock?: () => string, idFactory?: () => string }} [seam] injectable id/timestamp mint.
 * @returns {Promise<object>} the frozen, normalised entry as stored.
 * @throws {TypeError} on invalid scope/input; delegates entry validation + duplicate rejection to the store.
 */
export async function captureCoachMemory(scope, input, seam = {}) {
  const teamId = isObject(scope) ? scope.teamId : undefined;
  const coachId = isObject(scope) ? scope.coachId : undefined;
  if (!isNonEmptyString(teamId)) throw new TypeError('coach memory capture requires a non-empty scope.teamId');
  if (!isNonEmptyString(coachId)) throw new TypeError('coach memory capture requires a non-empty scope.coachId');
  if (!isObject(input)) throw new TypeError('coach memory capture requires an input object');

  const clock = isObject(seam) && typeof seam.clock === 'function' ? seam.clock : defaultCoachMemoryTimestamp;
  const idFactory = isObject(seam) && typeof seam.idFactory === 'function' ? seam.idFactory : defaultCoachMemoryId;

  // Whitelist content fields only, then stamp server-owned id + createdAt. No content is invented:
  // an absent required field (e.g. confidence) is left absent so the store rejects it by name.
  const entry = { id: idFactory() };
  for (const field of CONTENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) entry[field] = copyContentValue(field, input[field]);
  }
  entry.createdAt = clock();

  // The store validates the full M108 shape, rejects duplicate ids, and persists to the
  // tenant-scoped key. Capture adds no rules of its own beyond scope + whitelist + mint.
  return createCoachMemory({ teamId, coachId }, entry);
}
