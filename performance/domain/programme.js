// CoachEasier Performance — programme domain: builders & validation (SC4).
//
// Constructs and validates the programme hierarchy. Creates NO programmes
// on its own, generates NO workouts and calculates NO values — everything
// here is authored structure. Pure module: no DOM, no fetch, no
// localStorage.

import {
  BLOCK_TYPES, DAY_PRIORITIES, NODE_STATUSES, PHASE_TYPES,
  PROGRAMME_GOALS, PROGRAMME_OWNER_TYPES, PROGRAMME_SCHEMA_VERSION,
  PROGRAMME_SEASONS, PROGRAMME_SPORTS, PROGRAMME_STATUSES,
  RUGBY_RELATIONS, SESSION_PURPOSES, SET_FIELDS, SET_FIELD_IDS,
  SUBSTITUTION_POLICIES, TRAINING_DAY_NAMES, VERSION_STATUSES,
} from '../types/programme.js';
import { isEngineEligible } from './exercise-visibility.js';

const PHASE_IDS = new Set(PHASE_TYPES.map((p) => p.id));
const BLOCK_IDS = new Set(BLOCK_TYPES.map((b) => b.id));
const OWNER_TYPE_IDS = new Set(PROGRAMME_OWNER_TYPES.map((o) => o.id));
const SET_FIELD_MAP = new Map(SET_FIELDS.map((f) => [f.id, f]));

// ── Node scaffolding ────────────────────────────────────────────────────────
// Every node in the tree carries the same spine: unique id, kind, schema
// version, planning status, sibling order, metadata and an audit seam.
// Ownership and visibility are defined ONCE on the programme and inherited
// by every node (see resolveNodeContext) — duplicating owners per node is
// how trees drift out of sync.

function node(kind, id, order, extra, now) {
  return {
    id,
    kind,
    schemaVersion: PROGRAMME_SCHEMA_VERSION,
    status: 'planned',
    order: Number.isInteger(order) ? order : 0,
    meta: { createdAt: now || null, updatedAt: now || null },
    audit: [],
    ...extra,
  };
}

// ── Builders ────────────────────────────────────────────────────────────────

/** Root programme record. Versions hold the actual training structure. */
export function createProgramme({ slug, title, description = '', sport = 'rugby_union', goal, season = 'year_round', ownerType = 'coach', ownerClub = null, ownerCoach = null, author, template = false, now = null }) {
  return {
    id: `prog-${slug}`,
    kind: 'programme',
    schemaVersion: PROGRAMME_SCHEMA_VERSION,
    slug,
    title,
    description,
    sport,
    goal,
    season,
    status: 'draft',
    template: !!template,
    archived: false,
    ownership: {
      ownerType,
      ownerClub,
      ownerCoach,
      author: author || null,
      reviewer: null,
    },
    approval: { status: 'draft', reviewer: null, approvedAt: null, notes: '' },
    meta: { createdAt: now, updatedAt: now },
    audit: now ? [{ action: 'created', actor: author || null, at: now }] : [],
    versions: [],
  };
}

export function createProgrammeVersion(programme, { versionNumber = 1, createdBy = null, notes = '', now = null } = {}) {
  return {
    ...node('programme_version', `${programme.id}@v${versionNumber}`, versionNumber, {}, now),
    programmeId: programme.id,
    versionNumber,
    versionStatus: 'draft',
    createdBy,
    publishedAt: null,
    notes,
    phases: [],
  };
}

export function createPhase(versionId, { phaseType, order, name = '', objective = '', now = null }) {
  return {
    ...node('phase', `${versionId}:phase-${order}`, order, {}, now),
    phaseType,
    name: name || (PHASE_TYPES.find((p) => p.id === phaseType)?.label ?? ''),
    objective,
    weeks: [],
  };
}

export function createWeek(phaseId, { weekNumber, objective = '', notes = '', now = null }) {
  return {
    ...node('week', `${phaseId}:week-${weekNumber}`, weekNumber, {}, now),
    weekNumber,
    objective,
    notes,
    // Placeholders only — populated by humans or a future engine, never here.
    plannedVolume: null,
    plannedIntensity: null,
    days: [],
  };
}

export function createTrainingDay(weekId, { day, order, priority = 'primary', rugbyRelation = 'none', optional = false, now = null }) {
  return {
    ...node('training_day', `${weekId}:day-${order}`, order, {}, now),
    day,
    priority,
    rugbyRelation,
    optional: !!optional,
    sessions: [],
  };
}

export function createSession(dayId, { title, order = 1, purpose = 'mixed', estimatedMinutes = null, objective = '', coachNotes = '', now = null }) {
  return {
    ...node('session', `${dayId}:session-${order}`, order, {}, now),
    title,
    purpose,
    estimatedMinutes,
    objective,
    coachNotes,
    blocks: [],
  };
}

export function createBlock(sessionId, { blockType, order, optional = false, coachNotes = '', collectionRefs = [], now = null }) {
  return {
    ...node('block', `${sessionId}:block-${order}`, order, {}, now),
    blockType,
    optional: !!optional,
    coachNotes,
    // Optional ordered references to SC3 exercise collections. References
    // pin the collections version; items are expanded at assignment time.
    collectionRefs: collectionRefs.map((r) => (typeof r === 'string' ? { collectionId: r, collectionsVersion: null } : { collectionId: r.collectionId, collectionsVersion: r.collectionsVersion || null })),
    prescriptions: [],
  };
}

/**
 * Exercise prescription — a REFERENCE to a validated exercise plus authored
 * structure. It must never duplicate exercise definitions: no names,
 * classifications or coaching text live here.
 */
export function createExercisePrescription(blockId, { exerciseId, exerciseVersion = 1, order, coachingNotes = '', substitutionPolicy = 'structural_allowed', collectionOrigin = null, now = null }) {
  return {
    ...node('exercise_prescription', `${blockId}:ex-${order}`, order, {}, now),
    exerciseId,
    exerciseVersion,
    coachingNotes,
    substitutionPolicy,
    collectionOrigin, // {collectionId, collectionsVersion} | null
    sets: [],
  };
}

/**
 * Set prescription — authored structure only. Every value is stored as
 * written; nothing is calculated, recommended or resolved here.
 */
export function createSetPrescription(prescriptionId, { order, fields = {}, now = null }) {
  const clean = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SET_FIELD_IDS.includes(k) && v !== undefined) clean[k] = v;
  }
  return {
    ...node('set_prescription', `${prescriptionId}:set-${order}`, order, {}, now),
    fields: clean,
  };
}

// ── Field-level checks ──────────────────────────────────────────────────────

function fieldTypeOk(def, value) {
  if (value === null) return true;
  switch (def.type) {
    case 'int': return Number.isInteger(value) && value >= 0;
    case 'number': return Number.isFinite(value) && value >= 0;
    case 'int_or_range': return (Number.isInteger(value) && value >= 0) || (typeof value === 'string' && /^\d+\s*[-–]\s*\d+$/.test(value));
    case 'string': return typeof value === 'string' && value.length <= 40;
    case 'bool': return typeof value === 'boolean';
    default: return false;
  }
}

// Keys that would mean an exercise definition got duplicated into the tree.
const DEFINITION_LEAK_KEYS = ['name', 'displayName', 'classification', 'coaching', 'safety', 'media', 'aliases'];

// ── Deep validation ─────────────────────────────────────────────────────────

/**
 * Validate a whole programme (root + versions + full hierarchy).
 * @param {object} programme
 * @param {{catalogue?:Array, collections?:Array}} refs  SC3 catalogue + collections for reference checks
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateProgramme(programme, refs = {}) {
  const errors = [];
  if (!programme || typeof programme !== 'object') return { ok: false, errors: ['not_an_object'] };
  if (!programme.id || !programme.slug || !programme.title) errors.push('missing_identity');
  if (!PROGRAMME_SPORTS.includes(programme.sport)) errors.push('bad_sport');
  if (!PROGRAMME_GOALS.includes(programme.goal)) errors.push('bad_goal');
  if (!PROGRAMME_SEASONS.includes(programme.season)) errors.push('bad_season');
  if (!PROGRAMME_STATUSES.includes(programme.status)) errors.push('bad_status');
  if (!OWNER_TYPE_IDS.has(programme.ownership?.ownerType)) errors.push('bad_owner_type');
  if (programme.ownership?.ownerType === 'club' && !programme.ownership.ownerClub) errors.push('club_owner_missing_club');
  if (programme.ownership?.ownerType === 'coach' && !programme.ownership.ownerCoach) errors.push('coach_owner_missing_coach');
  if (typeof programme.template !== 'boolean') errors.push('missing_template_flag');
  if (typeof programme.archived !== 'boolean') errors.push('missing_archived_flag');

  const versionNumbers = new Set();
  for (const v of programme.versions || []) {
    if (versionNumbers.has(v.versionNumber)) errors.push(`duplicate_version:${v.versionNumber}`);
    versionNumbers.add(v.versionNumber);
    const vErrors = validateProgrammeVersion(v, refs);
    errors.push(...vErrors.errors.map((e) => `v${v.versionNumber}:${e}`));
  }
  return { ok: errors.length === 0, errors };
}

/** Validate one version tree: kinds, ids, ordering, references, fields. */
export function validateProgrammeVersion(version, { catalogue = [], collections = [] } = {}) {
  const errors = [];
  if (!version || version.kind !== 'programme_version') return { ok: false, errors: ['bad_version_node'] };
  if (!VERSION_STATUSES.includes(version.versionStatus)) errors.push('bad_version_status');
  if (!Number.isInteger(version.versionNumber) || version.versionNumber < 1) errors.push('bad_version_number');

  const ids = new Set();
  const dupId = (id) => { if (ids.has(id)) errors.push(`duplicate_id:${id}`); ids.add(id); };
  dupId(version.id);

  const exById = new Map(catalogue.map((e) => [e.id, e]));
  const colById = new Map(collections.map((c) => [c.id, c]));

  checkSiblingOrder(version.phases, 'phases', errors);
  for (const phase of version.phases || []) {
    dupId(phase.id);
    if (phase.kind !== 'phase') errors.push(`bad_kind:${phase.id}`);
    if (!PHASE_IDS.has(phase.phaseType)) errors.push(`bad_phase_type:${phase.phaseType}`);
    if (!NODE_STATUSES.includes(phase.status)) errors.push(`bad_node_status:${phase.id}`);

    checkSiblingOrder(phase.weeks, `weeks:${phase.id}`, errors);
    let prevWeek = 0;
    for (const week of phase.weeks || []) {
      dupId(week.id);
      if (week.kind !== 'week') errors.push(`bad_kind:${week.id}`);
      if (!Number.isInteger(week.weekNumber) || week.weekNumber < 1) errors.push(`bad_week_number:${week.id}`);
      if (week.weekNumber <= prevWeek) errors.push(`week_out_of_sequence:${week.id}`);
      prevWeek = week.weekNumber;
      if (week.plannedVolume !== null && typeof week.plannedVolume !== 'string') errors.push(`planned_volume_not_placeholder:${week.id}`);
      if (week.plannedIntensity !== null && typeof week.plannedIntensity !== 'string') errors.push(`planned_intensity_not_placeholder:${week.id}`);

      checkSiblingOrder(week.days, `days:${week.id}`, errors);
      for (const day of week.days || []) {
        dupId(day.id);
        if (day.kind !== 'training_day') errors.push(`bad_kind:${day.id}`);
        if (!TRAINING_DAY_NAMES.includes(day.day)) errors.push(`bad_day:${day.id}`);
        if (!DAY_PRIORITIES.includes(day.priority)) errors.push(`bad_priority:${day.id}`);
        if (!RUGBY_RELATIONS.includes(day.rugbyRelation)) errors.push(`bad_rugby_relation:${day.id}`);

        checkSiblingOrder(day.sessions, `sessions:${day.id}`, errors);
        for (const session of day.sessions || []) {
          dupId(session.id);
          if (session.kind !== 'session') errors.push(`bad_kind:${session.id}`);
          if (!session.title) errors.push(`missing_session_title:${session.id}`);
          if (!SESSION_PURPOSES.includes(session.purpose)) errors.push(`bad_purpose:${session.id}`);

          checkSiblingOrder(session.blocks, `blocks:${session.id}`, errors);
          for (const block of session.blocks || []) {
            dupId(block.id);
            if (block.kind !== 'block') errors.push(`bad_kind:${block.id}`);
            if (!BLOCK_IDS.has(block.blockType)) errors.push(`bad_block_type:${block.blockType}`);
            for (const ref of block.collectionRefs || []) {
              if (!colById.has(ref.collectionId)) errors.push(`unknown_collection:${ref.collectionId}`);
            }

            checkSiblingOrder(block.prescriptions, `prescriptions:${block.id}`, errors);
            for (const p of block.prescriptions || []) {
              dupId(p.id);
              validatePrescription(p, exById, colById, errors);
              for (const set of p.sets || []) dupId(set.id);
            }
          }
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function validatePrescription(p, exById, colById, errors) {
  if (p.kind !== 'exercise_prescription') errors.push(`bad_kind:${p.id}`);
  // Reference-only rule: definitions must never be duplicated into the tree.
  for (const leak of DEFINITION_LEAK_KEYS) {
    if (leak in p) errors.push(`definition_duplicated:${p.id}:${leak}`);
  }
  const ex = exById.get(p.exerciseId);
  if (!ex) { errors.push(`unknown_exercise:${p.exerciseId}`); return; }
  if (!isEngineEligible(ex)) errors.push(`exercise_not_engine_eligible:${p.exerciseId}`);
  if (!SUBSTITUTION_POLICIES.includes(p.substitutionPolicy)) errors.push(`bad_substitution_policy:${p.id}`);
  if (p.collectionOrigin && !colById.has(p.collectionOrigin.collectionId)) {
    errors.push(`unknown_collection_origin:${p.id}`);
  }

  checkSiblingOrder(p.sets, `sets:${p.id}`, errors);
  const declared = new Set(ex.prescription || []);
  for (const set of p.sets || []) {
    if (set.kind !== 'set_prescription') errors.push(`bad_kind:${set.id}`);
    for (const [field, value] of Object.entries(set.fields || {})) {
      const def = SET_FIELD_MAP.get(field);
      if (!def) { errors.push(`unknown_set_field:${set.id}:${field}`); continue; }
      if (!fieldTypeOk(def, value)) errors.push(`bad_set_value:${set.id}:${field}`);
      if (!declared.has(def.maps)) errors.push(`field_not_declared_by_exercise:${set.id}:${field}`);
    }
  }
}

function checkSiblingOrder(list, label, errors) {
  const seen = new Set();
  for (const item of list || []) {
    if (!Number.isInteger(item.order)) { errors.push(`bad_order:${label}`); continue; }
    if (seen.has(item.order)) errors.push(`duplicate_order:${label}:${item.order}`);
    seen.add(item.order);
  }
}

// ── Ordering helpers ────────────────────────────────────────────────────────

/** Return siblings sorted by order (pure). */
export function sortedByOrder(list) {
  return [...(list || [])].sort((a, b) => a.order - b.order);
}

/** Move a node within its siblings; renumbers 1..n (pure). */
export function reorderSiblings(list, nodeId, newIndex) {
  const items = sortedByOrder(list);
  const idx = items.findIndex((n) => n.id === nodeId);
  if (idx === -1) return items;
  const [moved] = items.splice(idx, 1);
  items.splice(Math.max(0, Math.min(newIndex, items.length)), 0, moved);
  return items.map((n, i) => ({ ...n, order: i + 1 }));
}
