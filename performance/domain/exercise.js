// CoachEasier Performance — exercise domain rules (SC3).
//
// Pure validation, search/filter and relationship rules for the exercise
// library. No programme generation, no loading recommendations, no
// medical logic. Free of DOM, fetch, and localStorage.

import {
  BODY_REGIONS, CHAIN_TYPES, COMPLEXITY_LEVELS, CONTENT_TIERS,
  CONTRAINDICATION_TAGS, DIFFICULTY_LEVELS, EQUIPMENT_CATALOGUE,
  EXERCISE_CATEGORIES, EXERCISE_STATUSES, IMPACT_LEVELS, LATERALITY,
  MEDIA_STATUSES, MOVEMENT_PATTERNS, PHYSICAL_QUALITIES, PLANES,
  PRECAUTION_TAGS, PRESCRIPTION_TYPES, RELATIONSHIP_KINDS,
  RELEVANCE_LEVELS, REVIEW_GATES, RUGBY_POSITION_IDS, GOAL_RELEVANCE_IDS,
  SEASON_PHASE_IDS, SETUP_COMPLEXITY, SPACE_REQUIREMENTS,
  SURFACE_REQUIREMENTS, YOUTH_SUITABILITY,
} from '../types/exercise.js';

const ids = (list) => new Set(list.map((x) => (typeof x === 'string' ? x : x.id)));
const CATEGORY_IDS = ids(EXERCISE_CATEGORIES);
const PATTERN_IDS = ids(MOVEMENT_PATTERNS);
const QUALITY_IDS = ids(PHYSICAL_QUALITIES);
const EQUIPMENT_IDS = ids(EQUIPMENT_CATALOGUE);
const PRESCRIPTION_IDS = ids(PRESCRIPTION_TYPES);
const TIER_IDS = ids(CONTENT_TIERS);
const GATE_IDS = ids(REVIEW_GATES);

// ── Schema validation ───────────────────────────────────────────────────────

const REQUIRED_STRINGS = ['id', 'slug', 'name', 'shortDescription'];

/**
 * Validate one exercise record against the canonical schema and controlled
 * taxonomies. Returns every problem found, not just the first.
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateExercise(ex) {
  const errors = [];
  if (!ex || typeof ex !== 'object') return { ok: false, errors: ['not_an_object'] };

  for (const f of REQUIRED_STRINGS) {
    if (typeof ex[f] !== 'string' || !ex[f].trim()) errors.push(`missing:${f}`);
  }
  if (ex.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ex.slug)) errors.push('bad_slug');
  if (!EXERCISE_STATUSES.includes(ex.status)) errors.push('bad_status');
  if (!TIER_IDS.has(ex.tier)) errors.push('bad_tier');
  if (typeof ex.version !== 'number' || ex.version < 1) errors.push('bad_version');

  // Classification
  const c = ex.classification || {};
  if (!CATEGORY_IDS.has(c.category)) errors.push('bad_category');
  if (!PATTERN_IDS.has(c.pattern)) errors.push('bad_pattern');
  for (const p of c.secondaryPatterns || []) if (!PATTERN_IDS.has(p)) errors.push(`bad_secondary_pattern:${p}`);
  if (!LATERALITY.includes(c.laterality)) errors.push('bad_laterality');
  if (c.chain && !CHAIN_TYPES.includes(c.chain)) errors.push('bad_chain');
  if (!PLANES.includes(c.plane)) errors.push('bad_plane');
  if (!BODY_REGIONS.includes(c.region)) errors.push('bad_region');
  if (!QUALITY_IDS.has(c.primaryQuality)) errors.push('bad_primary_quality');
  for (const q of c.secondaryQualities || []) if (!QUALITY_IDS.has(q)) errors.push(`bad_secondary_quality:${q}`);
  if (!Array.isArray(c.primaryMuscles) || !c.primaryMuscles.length) errors.push('missing_primary_muscles');
  if (!DIFFICULTY_LEVELS.includes(c.difficulty)) errors.push('bad_difficulty');
  if (!IMPACT_LEVELS.includes(c.impact)) errors.push('bad_impact');
  if (!COMPLEXITY_LEVELS.includes(c.complexity)) errors.push('bad_complexity');

  // Equipment
  const eq = ex.equipment || {};
  for (const e of eq.required || []) if (!EQUIPMENT_IDS.has(e)) errors.push(`bad_equipment:${e}`);
  for (const e of eq.optional || []) if (!EQUIPMENT_IDS.has(e)) errors.push(`bad_optional_equipment:${e}`);
  if (!Array.isArray(eq.required)) errors.push('missing_equipment_required');
  if (eq.space && !SPACE_REQUIREMENTS.includes(eq.space)) errors.push('bad_space');
  if (eq.surface && !SURFACE_REQUIREMENTS.includes(eq.surface)) errors.push('bad_surface');
  if (eq.setup && !SETUP_COMPLEXITY.includes(eq.setup)) errors.push('bad_setup');
  if (typeof eq.bodyweightOnly !== 'boolean') errors.push('missing_bodyweight_flag');

  // Prescription capabilities
  if (!Array.isArray(ex.prescription) || !ex.prescription.length) errors.push('missing_prescription');
  for (const p of ex.prescription || []) if (!PRESCRIPTION_IDS.has(p)) errors.push(`bad_prescription:${p}`);

  // Coaching content
  const coach = ex.coaching || {};
  if (!coach.setup?.trim()) errors.push('missing_setup');
  if (!coach.execution?.trim()) errors.push('missing_execution');
  if (!Array.isArray(coach.cues) || !coach.cues.length) errors.push('missing_cues');
  if (!Array.isArray(coach.mistakes) || !coach.mistakes.length) errors.push('missing_mistakes');
  if (!coach.playerExplanation?.trim()) errors.push('missing_player_explanation');

  // Safety content
  const s = ex.safety || {};
  if (!Array.isArray(s.notes) || !s.notes.length) errors.push('missing_safety_notes');
  for (const t of s.contraindicationTags || []) if (!CONTRAINDICATION_TAGS.includes(t)) errors.push(`bad_contra_tag:${t}`);
  for (const t of s.precautionTags || []) if (!PRECAUTION_TAGS.includes(t)) errors.push(`bad_precaution_tag:${t}`);
  if (!YOUTH_SUITABILITY.includes(s.youth)) errors.push('bad_youth_suitability');
  if (typeof s.painStop !== 'string' || !s.painStop.trim()) errors.push('missing_pain_stop');

  // Relationships
  for (const r of ex.relationships || []) {
    if (!RELATIONSHIP_KINDS.includes(r.kind)) errors.push(`bad_relationship_kind:${r.kind}`);
    if (typeof r.target !== 'string' || !r.target) errors.push('bad_relationship_target');
  }

  // Relevance
  const rel = ex.relevance || {};
  for (const [pos, lvl] of Object.entries(rel.positions || {})) {
    if (!RUGBY_POSITION_IDS.includes(pos)) errors.push(`bad_position:${pos}`);
    if (!RELEVANCE_LEVELS.includes(lvl)) errors.push(`bad_position_level:${pos}`);
  }
  for (const g of rel.goals || []) if (!GOAL_RELEVANCE_IDS.includes(g)) errors.push(`bad_goal:${g}`);
  for (const ph of rel.phases || []) if (!SEASON_PHASE_IDS.includes(ph)) errors.push(`bad_phase:${ph}`);

  // Media — placeholders only in SC3; no external URLs.
  const m = ex.media || {};
  if (!MEDIA_STATUSES.includes(m.status)) errors.push('bad_media_status');
  for (const asset of m.assets || []) {
    if (typeof asset.src === 'string' && /^https?:\/\//i.test(asset.src)) errors.push('external_media_url');
  }

  // Ownership & review
  const own = ex.ownership || {};
  if (!own.source) errors.push('missing_source');
  for (const g of ex.reviewRequired || []) if (!GATE_IDS.has(g)) errors.push(`bad_review_gate:${g}`);

  return { ok: errors.length === 0, errors };
}

/** Validate a whole catalogue: per-record errors + unique ids/slugs. */
export function validateCatalogue(list) {
  const errors = [];
  const seenIds = new Set();
  const seenSlugs = new Set();
  for (const ex of list || []) {
    const v = validateExercise(ex);
    if (!v.ok) errors.push({ id: ex?.id || '?', errors: v.errors });
    if (seenIds.has(ex.id)) errors.push({ id: ex.id, errors: ['duplicate_id'] });
    if (seenSlugs.has(ex.slug)) errors.push({ id: ex.id, errors: ['duplicate_slug'] });
    seenIds.add(ex.id);
    seenSlugs.add(ex.slug);
  }
  return { ok: errors.length === 0, errors };
}

// ── Relationship integrity ──────────────────────────────────────────────────

/** Every relationship target must exist in the catalogue. */
export function findBrokenRelationships(list) {
  const known = new Set((list || []).map((e) => e.id));
  const broken = [];
  for (const ex of list || []) {
    for (const r of ex.relationships || []) {
      if (!known.has(r.target)) broken.push({ from: ex.id, kind: r.kind, target: r.target });
    }
  }
  return broken;
}

/**
 * Detect cycles in direct progression/regression chains (an exercise must
 * never be reachable from itself through progressions, or through
 * regressions).
 * @returns {string[][]} list of cyclic paths (empty when clean)
 */
export function findRelationshipCycles(list, kind = 'progression') {
  const graph = new Map();
  for (const ex of list || []) {
    graph.set(ex.id, (ex.relationships || []).filter((r) => r.kind === kind).map((r) => r.target));
  }
  const cycles = [];
  const visiting = new Set();
  const done = new Set();
  const walk = (node, path) => {
    if (done.has(node)) return;
    if (visiting.has(node)) { cycles.push([...path.slice(path.indexOf(node)), node]); return; }
    visiting.add(node);
    for (const next of graph.get(node) || []) walk(next, [...path, node]);
    visiting.delete(node);
    done.add(node);
  };
  for (const id of graph.keys()) walk(id, []);
  return cycles;
}

// ── Search & filter ─────────────────────────────────────────────────────────

/**
 * Search by canonical name, display name or alias (case-insensitive,
 * substring). Empty query matches everything.
 */
export function matchesSearch(ex, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [ex.name, ex.displayName, ...(ex.aliases || [])].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

/**
 * Filter a catalogue. All criteria are AND-combined; each defaults to "any".
 * @param {Array} list
 * @param {{query?:string, category?:string, pattern?:string, equipment?:string[],
 *          difficulty?:string, favouritesOnly?:boolean, favourites?:string[],
 *          includeArchived?:boolean}} f
 */
export function filterCatalogue(list, f = {}) {
  const favs = new Set(f.favourites || []);
  return (list || []).filter((ex) => {
    if (!f.includeArchived && ex.status === 'archived') return false;
    if (f.favouritesOnly && !favs.has(ex.id)) return false;
    if (f.category && f.category !== 'all' && ex.classification.category !== f.category) return false;
    if (f.pattern && f.pattern !== 'all' &&
        ex.classification.pattern !== f.pattern &&
        !(ex.classification.secondaryPatterns || []).includes(f.pattern)) return false;
    if (f.difficulty && f.difficulty !== 'all' && ex.classification.difficulty !== f.difficulty) return false;
    if (Array.isArray(f.equipment) && f.equipment.length) {
      const have = new Set(f.equipment);
      const missing = (ex.equipment.required || []).filter((e) => e !== 'none' && !have.has(e));
      if (missing.length) return false;
    }
    if (!matchesSearch(ex, f.query)) return false;
    return true;
  });
}

// ── Equipment normalisation vs athlete access ──────────────────────────────

const EQUIP_TO_ATHLETE = Object.fromEntries(EQUIPMENT_CATALOGUE.map((e) => [e.id, e.athleteItem]));

/**
 * Which required equipment an athlete's SC2 equipment access does not cover.
 * Gym locations already imply the standard kit (mirrors SC2
 * equipmentCapability). Items with no athlete mapping (partner, wall,
 * pull-up bar, plyo box…) are reported as `unmapped` for coach judgement,
 * never as hard blockers.
 * @returns {{missing:string[], unmapped:string[]}}
 */
export function equipmentGap(ex, athleteEquipment = {}) {
  const locations = athleteEquipment.locations || [];
  const items = new Set(athleteEquipment.items || []);
  if (locations.includes('commercial_gym') || locations.includes('team_gym')) {
    ['barbell', 'rack', 'bench', 'dumbbells', 'machines', 'cardio'].forEach((i) => items.add(i));
  }
  const missing = [];
  const unmapped = [];
  for (const req of ex.equipment?.required || []) {
    if (req === 'none') continue;
    const mapped = EQUIP_TO_ATHLETE[req];
    if (mapped === null || mapped === undefined) { unmapped.push(req); continue; }
    if (!items.has(mapped)) missing.push(req);
  }
  return { missing, unmapped };
}

// ── Review & staleness ──────────────────────────────────────────────────────

/** Records that still need one or more human review gates before production. */
export function pendingReviewGates(ex) {
  const done = new Set((ex.reviewsCompleted || []).map((r) => r.gate));
  return (ex.reviewRequired || []).filter((g) => !done.has(g));
}

export function isReviewStale(ex, now = new Date(), days = 365) {
  const last = ex.ownership?.lastReviewedAt;
  if (!last) return true;
  const t = new Date(last).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > days * 86400000;
}
