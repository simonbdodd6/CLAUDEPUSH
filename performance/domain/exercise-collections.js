// CoachEasier Performance — exercise collections (SC3).
//
// A collection is an ORDERED, REUSABLE list of references to validated
// exercises — warm-ups, activation blocks, mobility resets, sprint prep,
// recovery blocks. Collections are building blocks for future programme
// templates and NOTHING more:
//   - they reference exercises by id and preserve order;
//   - they carry no loading, no sets/reps, no progression and no
//     prescription of any kind (the validator rejects such data);
//   - they are not programmes and are never auto-assigned.
//
// Pure module: no DOM, no fetch, no localStorage.

import { isEngineEligible } from './exercise-visibility.js';

export const COLLECTION_KINDS = [
  { id: 'warmup',      label: 'Warm-up' },
  { id: 'activation',  label: 'Activation' },
  { id: 'mobility',    label: 'Mobility' },
  { id: 'sprint_prep', label: 'Sprint Prep' },
  { id: 'recovery',    label: 'Recovery' },
  { id: 'cooldown',    label: 'Cooldown' },
  { id: 'trunk',       label: 'Trunk Block' },
  { id: 'custom',      label: 'Custom' },
];

// Item fields beyond these are rejected — a collection must never smuggle
// prescription data (load, sets, reps, tempo, rest...) past the engine rules.
const ALLOWED_ITEM_KEYS = new Set(['exerciseId', 'note']);

/** Build a well-formed collection. Items may be ids or {exerciseId, note}. */
export function makeCollection({ id, slug, name, kind, description = '', items = [], now = null }) {
  return {
    id: id || (slug ? `col-${slug}` : null),
    slug: slug || null,
    name: name || '',
    kind,
    description,
    items: items.map((it) => (typeof it === 'string'
      ? { exerciseId: it, note: '' }
      : { exerciseId: it.exerciseId, note: String(it.note || '').slice(0, 140) })),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Validate a collection against the catalogue.
 * Rules: known kind; non-empty ordered items; every reference resolves;
 * referenced exercises are approved + engine-eligible (validated tier);
 * no duplicate references; no prescription data on items.
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateCollection(collection, catalogue) {
  const errors = [];
  if (!collection || typeof collection !== 'object') return { ok: false, errors: ['not_an_object'] };
  if (!collection.id || !collection.name) errors.push('missing_identity');
  if (!COLLECTION_KINDS.some((k) => k.id === collection.kind)) errors.push('bad_kind');
  const items = collection.items || [];
  if (!Array.isArray(items) || items.length === 0) errors.push('empty_collection');

  const byId = new Map((catalogue || []).map((e) => [e.id, e]));
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object') { errors.push('bad_item'); continue; }
    for (const key of Object.keys(item)) {
      if (!ALLOWED_ITEM_KEYS.has(key)) errors.push(`prescription_data_forbidden:${key}`);
    }
    const ex = byId.get(item.exerciseId);
    if (!ex) { errors.push(`unknown_exercise:${item.exerciseId}`); continue; }
    if (seen.has(item.exerciseId)) errors.push(`duplicate_exercise:${item.exerciseId}`);
    seen.add(item.exerciseId);
    if (!isEngineEligible(ex)) errors.push(`not_engine_eligible:${item.exerciseId}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Resolve a collection's exercises IN ORDER, dropping unresolvable refs. */
export function resolveCollection(collection, catalogue) {
  const byId = new Map((catalogue || []).map((e) => [e.id, e]));
  return (collection?.items || [])
    .map((item) => ({ exercise: byId.get(item.exerciseId) || null, note: item.note || '' }))
    .filter((r) => r.exercise);
}
