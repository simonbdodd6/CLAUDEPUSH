// api/_performanceStore.js — SC8: the club's Performance programmes and
// athlete assignments.
//
//   CLUB (session.teamId)
//   ├── PROGRAMME — an S&C programme with SC4 versions (draft → published)
//   ├── ASSIGNMENT — one athlete ↔ one PUBLISHED version, with a frozen
//   │                snapshot and the group/team/development context that
//   │                were true on the day it was assigned.
//   └── AUTHORING PROFILE — the small, coach-readable projection of an
//                    athlete's SC2 profile (programming inputs only). Wellness
//                    logs, pain detail and health information are NEVER stored
//                    here; see performance/domain/authoring-profile.js.
//
// WHY THIS EXISTS
// Every earlier Performance milestone stored state on the device, which was
// correct for a single-athlete prototype and useless for a real workflow: a
// coach assigns on a laptop and the athlete opens their phone. Assignments are
// therefore server-owned, exactly like the medical caseload.
//
// SAFETY MODEL
// This module writes exactly ONE key — performance:<clubId>. It cannot reach
// the roster, identity, drafts, fixtures, training or medical records, so a
// Performance write is structurally incapable of corrupting them. Field
// allow-lists mean an unknown or hostile key in a request body is dropped
// rather than stored, and every id the caller supplies is re-resolved against
// this club's own record before use.
//
// Reads NEVER write (the c79c07a8 rule): a club with no record reads as an
// empty programme list, and nothing is persisted until an explicit mutation.

import { kvGet, kvSet } from './_kv.js';
import { key } from './_keys.js';
import { randomBytes } from 'node:crypto';

const performanceKey = clubId => key(`performance:${clubId}`);

export const PERFORMANCE_SCHEMA_VERSION = 1;
export const ASSIGNMENT_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed', 'replaced', 'cancelled'];
export const TERMINAL_STATUSES = ['completed', 'replaced', 'cancelled'];
export const OCCUPYING_STATUSES = ['scheduled', 'active', 'paused'];
export const PROGRAMME_RECORD_STATUSES = ['draft', 'published', 'archived'];
export const AUTHORING_PROFILE_VERSION = 1;

const MAX_PROGRAMMES = 200;
const MAX_ASSIGNMENTS = 500;
const MAX_PROFILES = 500;
const AUDIT_MAX = 100;

const nowIso = () => new Date().toISOString();
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const isIsoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function newProgrammeId() { return `pg_${randomBytes(6).toString('hex')}`; }
export function newAssignmentId() { return `pa_${randomBytes(6).toString('hex')}`; }

/**
 * Fields a client may write on an ASSIGNMENT. Everything else — status,
 * athlete, club, group, snapshot, audit, timestamps — is server-owned and can
 * never be set from a request body.
 */
export const WRITABLE_ASSIGNMENT_FIELDS = ['startDate', 'endDate', 'notes'];

/** Fields a client may write on a PROGRAMME record wrapper. */
export const WRITABLE_PROGRAMME_FIELDS = ['title', 'notes'];

function appendAudit(log, entry) {
  return [...(Array.isArray(log) ? log : []), entry].slice(-AUDIT_MAX);
}

// ── Normalisation ───────────────────────────────────────────────────────────

/**
 * Coerce one stored programme wrapper into canonical shape. The SC4 programme
 * object itself is stored opaquely (the domain owns its shape); this wrapper
 * carries only what the SERVER needs to authorise and index.
 */
export function normalizeProgramme(raw = {}) {
  const p = raw || {};
  return {
    programmeId: text(p.programmeId, 64),
    clubId: text(p.clubId, 64),
    title: text(p.title, 120) || 'Untitled programme',
    goal: text(p.goal, 40),
    phase: text(p.phase, 40),
    // Which athlete this was authored FOR (may be null for a template).
    athleteUserId: text(p.athleteUserId, 64) || null,
    athleteName: text(p.athleteName, 120),
    groupId: text(p.groupId, 64),
    status: PROGRAMME_RECORD_STATUSES.includes(p.status) ? p.status : 'draft',
    source: text(p.source, 40) || 'coach_authored',
    programme: p.programme && typeof p.programme === 'object' ? p.programme : null,
    provenance: p.provenance && typeof p.provenance === 'object' ? p.provenance : null,
    requiresReview: p.requiresReview === true,
    reviewAcknowledgedBy: text(p.reviewAcknowledgedBy, 64) || null,
    reviewAcknowledgedAt: text(p.reviewAcknowledgedAt, 40) || null,
    publishedVersion: Number.isInteger(p.publishedVersion) ? p.publishedVersion : null,
    createdBy: text(p.createdBy, 64),
    createdAt: text(p.createdAt, 40) || nowIso(),
    updatedBy: text(p.updatedBy, 64),
    updatedAt: text(p.updatedAt, 40) || nowIso(),
    notes: text(p.notes, 1000),
    audit: Array.isArray(p.audit) ? p.audit.slice(-AUDIT_MAX) : [],
  };
}

export function normalizeAssignment(raw = {}) {
  const a = raw || {};
  return {
    assignmentId: text(a.assignmentId, 64),
    clubId: text(a.clubId, 64),
    athleteUserId: text(a.athleteUserId, 64),
    athleteMemberId: text(a.athleteMemberId, 64) || null,
    athleteName: text(a.athleteName, 120),
    // Context AT ASSIGNMENT TIME — never re-derived on read, so a player who
    // changes group next season does not rewrite their own history.
    groupId: text(a.groupId, 64),
    groupName: text(a.groupName, 120),
    teamId: text(a.teamId, 64),
    teamName: text(a.teamName, 120),
    programmeId: text(a.programmeId, 64),
    programmeVersionId: text(a.programmeVersionId, 128),
    versionNumber: Number.isInteger(a.versionNumber) ? a.versionNumber : null,
    programmeTitle: text(a.programmeTitle, 120),
    snapshot: a.snapshot && typeof a.snapshot === 'object' ? a.snapshot : null,
    assignedBy: text(a.assignedBy, 64),
    assignedAt: text(a.assignedAt, 40),
    startDate: isIsoDate(a.startDate) ? a.startDate : '',
    endDate: isIsoDate(a.endDate) ? a.endDate : null,
    status: ASSIGNMENT_STATUSES.includes(a.status) ? a.status : 'scheduled',
    source: text(a.source, 40) || 'coach_authored',
    notes: text(a.notes, 1000),
    developmentContextSnapshot: a.developmentContextSnapshot && typeof a.developmentContextSnapshot === 'object'
      ? a.developmentContextSnapshot : { context: 'unknown', source: 'none', youthSafeguards: true },
    entitlementSnapshot: a.entitlementSnapshot && typeof a.entitlementSnapshot === 'object' ? a.entitlementSnapshot : null,
    reviewFlags: Array.isArray(a.reviewFlags) ? a.reviewFlags.slice(0, 30) : [],
    requiresReview: a.requiresReview === true,
    reviewAcknowledgedBy: text(a.reviewAcknowledgedBy, 64) || null,
    progressionReview: a.progressionReview && typeof a.progressionReview === 'object' ? a.progressionReview : null,
    pausedAt: text(a.pausedAt, 40) || null,
    resumedAt: text(a.resumedAt, 40) || null,
    endedAt: text(a.endedAt, 40) || null,
    replacedByAssignmentId: text(a.replacedByAssignmentId, 64) || null,
    createdAt: text(a.createdAt, 40) || nowIso(),
    updatedAt: text(a.updatedAt, 40) || nowIso(),
    audit: Array.isArray(a.audit) ? a.audit.slice(-AUDIT_MAX) : [],
  };
}

/**
 * Normalise one stored authoring profile.
 *
 * This is the privacy boundary in code: the shape below is the ENTIRE set of
 * fields that may ever be stored or returned. A client that posts a whole SC2
 * profile — wellness log, pain notes, injury history and all — has every one of
 * those fields dropped here rather than persisted. What is not stored cannot
 * leak.
 */
export function normalizeAuthoringProfile(raw = {}) {
  const a = raw || {};
  const strList = (v, max = 20) => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string').slice(0, max).map(x => text(x, 40));
  return {
    kind: 'authoring_profile',
    schemaVersion: AUTHORING_PROFILE_VERSION,
    athleteUserId: text(a.athleteUserId, 64),
    clubId: text(a.clubId, 64),
    sport: text(a.sport, 40) || 'rugby_union',
    // Age BAND only — a date of birth is precision programming never needs.
    personal: { ageBand: text(a.personal?.ageBand, 20) || null },
    rugby: {
      primaryPosition: text(a.rugby?.primaryPosition, 40) || null,
      secondaryPosition: text(a.rugby?.secondaryPosition, 40) || null,
      playingLevel: text(a.rugby?.playingLevel, 40) || null,
      seasonPhase: text(a.rugby?.seasonPhase, 40) || null,
      matchDay: text(a.rugby?.matchDay, 10) || null,
      rugbySessionsPerWeek: Number.isFinite(a.rugby?.rugbySessionsPerWeek) ? a.rugby.rugbySessionsPerWeek : null,
    },
    training: {
      experience: text(a.training?.experience, 40) || null,
      techConfidence: text(a.training?.techConfidence, 40) || null,
      preferredSessionMinutes: Number.isFinite(a.training?.preferredSessionMinutes) ? a.training.preferredSessionMinutes : null,
    },
    equipment: { locations: strList(a.equipment?.locations), items: strList(a.equipment?.items, 40) },
    schedule: {
      availableDays: strList(a.schedule?.availableDays, 7),
      rugbyDays: strList(a.schedule?.rugbyDays, 7),
      matchDay: text(a.schedule?.matchDay, 10) || null,
      maxSessionMinutes: Number.isFinite(a.schedule?.maxSessionMinutes) ? a.schedule.maxSessionMinutes : null,
    },
    goals: (Array.isArray(a.goals) ? a.goals : []).slice(0, 10)
      .map(g => ({ type: text(g?.type, 40), importance: Number.isFinite(g?.importance) ? g.importance : 3 }))
      .filter(g => g.type),
    // Non-identifying flags only: that a restriction EXISTS, never what it is.
    restrictions: {
      restrictionsKnown: a.restrictions?.restrictionsKnown === true,
      trainingRestricted: a.restrictions?.trainingRestricted === true,
      hasMovementRestrictions: a.restrictions?.hasMovementRestrictions === true,
      coachRestrictionCount: Number.isFinite(a.restrictions?.coachRestrictionCount) ? a.restrictions.coachRestrictionCount : 0,
    },
    profileComplete: a.profileComplete === true,
    status: text(a.status, 20) || 'draft',
    updatedAt: text(a.updatedAt, 40) || nowIso(),
    updatedBy: text(a.updatedBy, 64),
  };
}

export function normalizePerformanceRecord(clubId, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    schemaVersion: PERFORMANCE_SCHEMA_VERSION,
    clubId: String(clubId || ''),
    programmes: (Array.isArray(r.programmes) ? r.programmes : [])
      .filter(p => p && p.programmeId).map(normalizeProgramme).slice(-MAX_PROGRAMMES),
    assignments: (Array.isArray(r.assignments) ? r.assignments : [])
      .filter(a => a && a.assignmentId).map(normalizeAssignment).slice(-MAX_ASSIGNMENTS),
    profiles: (Array.isArray(r.profiles) ? r.profiles : [])
      .filter(p => p && p.athleteUserId).map(normalizeAuthoringProfile).slice(-MAX_PROFILES),
    updatedAt: text(r.updatedAt, 40) || null,
  };
}

/** Read the club's record. Never writes. */
export async function loadPerformanceRecord(clubId) {
  if (!clubId) return normalizePerformanceRecord('', null);
  return normalizePerformanceRecord(clubId, await kvGet(performanceKey(clubId)));
}

export async function savePerformanceRecord(clubId, record) {
  const clean = normalizePerformanceRecord(clubId, record);
  clean.updatedAt = nowIso();
  await kvSet(performanceKey(clubId), clean);
  return clean;
}

// ── Lookups ─────────────────────────────────────────────────────────────────

export function programmeById(record, programmeId) {
  return (record.programmes || []).find(p => p.programmeId === String(programmeId || '')) || null;
}

export function assignmentById(record, assignmentId) {
  return (record.assignments || []).find(a => a.assignmentId === String(assignmentId || '')) || null;
}

export function assignmentsForAthlete(record, athleteUserId) {
  const id = String(athleteUserId || '');
  if (!id) return [];
  return (record.assignments || []).filter(a => a.athleteUserId === id);
}

/** Assignments occupying an athlete's single primary slot. */
export function occupyingAssignments(record, athleteUserId) {
  return assignmentsForAthlete(record, athleteUserId).filter(a => OCCUPYING_STATUSES.includes(a.status));
}

export function authoringProfileFor(record, athleteUserId) {
  const id = String(athleteUserId || '');
  if (!id) return null;
  return (record.profiles || []).find(p => p.athleteUserId === id) || null;
}

/**
 * Save an athlete's own authoring projection.
 *
 * The athlete id is supplied by the CALLER from the session — never from the
 * request body — so a player can only ever write their own record and a coach
 * cannot write one at all (the handler refuses before reaching here).
 */
export async function saveAuthoringProfile(clubId, athleteUserId, input = {}, actor = {}) {
  if (!athleteUserId) { const e = new Error('Athlete required'); e.status = 400; throw e; }
  const record = await loadPerformanceRecord(clubId);
  const at = nowIso();
  const profile = normalizeAuthoringProfile({
    ...input, athleteUserId, clubId, updatedAt: at, updatedBy: text(actor.userId, 64),
  });
  record.profiles = [...(record.profiles || []).filter(p => p.athleteUserId !== String(athleteUserId)), profile]
    .slice(-MAX_PROFILES);
  await savePerformanceRecord(clubId, record);
  return { record, profile };
}

export function pickWritableAssignment(body = {}) {
  const out = {};
  for (const f of WRITABLE_ASSIGNMENT_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

// ── Mutations ───────────────────────────────────────────────────────────────

/**
 * Create or replace a programme DRAFT. The SC4 programme object is supplied by
 * the caller (built by the pure domain in the browser or a future service);
 * the server owns identity, ownership and audit around it.
 */
export async function saveProgrammeDraft(clubId, input = {}, actor = {}) {
  const record = await loadPerformanceRecord(clubId);
  const existing = input.programmeId ? programmeById(record, input.programmeId) : null;
  if (input.programmeId && !existing) { const e = new Error('Unknown programme'); e.status = 404; throw e; }
  if (existing && existing.status === 'archived') { const e = new Error('Programme is archived'); e.status = 400; throw e; }

  const at = nowIso();
  const wrapper = normalizeProgramme({
    ...(existing || {}),
    programmeId: existing?.programmeId || newProgrammeId(),
    clubId,
    title: text(input.title, 120) || existing?.title || 'Untitled programme',
    goal: text(input.goal, 40) || existing?.goal || '',
    phase: text(input.phase, 40) || existing?.phase || '',
    athleteUserId: text(input.athleteUserId, 64) || existing?.athleteUserId || null,
    athleteName: text(input.athleteName, 120) || existing?.athleteName || '',
    groupId: text(input.groupId, 64) || existing?.groupId || '',
    status: existing?.status === 'published' ? 'published' : 'draft',
    source: text(input.source, 40) || existing?.source || 'coach_authored',
    programme: input.programme && typeof input.programme === 'object' ? input.programme : existing?.programme || null,
    provenance: input.provenance && typeof input.provenance === 'object' ? input.provenance : existing?.provenance || null,
    requiresReview: input.requiresReview === true ? true : existing?.requiresReview === true,
    publishedVersion: existing?.publishedVersion ?? null,
    notes: input.notes !== undefined ? text(input.notes, 1000) : existing?.notes || '',
    createdBy: existing?.createdBy || text(actor.userId, 64),
    createdAt: existing?.createdAt || at,
    updatedBy: text(actor.userId, 64),
    updatedAt: at,
    audit: appendAudit(existing?.audit, {
      action: existing ? 'draft_updated' : 'draft_created',
      actor: text(actor.userId, 64), at, detail: '',
    }),
  });

  record.programmes = [...(record.programmes || []).filter(p => p.programmeId !== wrapper.programmeId), wrapper];
  await savePerformanceRecord(clubId, record);
  return { record, programme: wrapper };
}

/**
 * Mark a programme published at a given version. The SC4 domain has already
 * frozen the version's content; this records the club-level fact, the review
 * acknowledgement and the audit trail.
 */
export async function publishProgramme(clubId, programmeId, input = {}, actor = {}) {
  const record = await loadPerformanceRecord(clubId);
  const wrapper = programmeById(record, programmeId);
  if (!wrapper) { const e = new Error('Unknown programme'); e.status = 404; throw e; }
  if (wrapper.status === 'archived') { const e = new Error('Programme is archived'); e.status = 400; throw e; }
  if (!input.programme || typeof input.programme !== 'object') { const e = new Error('Published programme required'); e.status = 400; throw e; }
  const versionNumber = Number(input.versionNumber);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) { const e = new Error('Bad version number'); e.status = 400; throw e; }
  // Provisional rule tables mean a flagged programme needs an explicit human
  // acknowledgement. This records that a coach reviewed it — never that it was
  // medically approved.
  if (wrapper.requiresReview && input.reviewAcknowledged !== true) {
    const e = new Error('Coach review required before publishing'); e.status = 400; throw e;
  }

  const at = nowIso();
  const updated = normalizeProgramme({
    ...wrapper,
    programme: input.programme,
    status: 'published',
    publishedVersion: versionNumber,
    reviewAcknowledgedBy: wrapper.requiresReview ? text(actor.userId, 64) : wrapper.reviewAcknowledgedBy,
    reviewAcknowledgedAt: wrapper.requiresReview ? at : wrapper.reviewAcknowledgedAt,
    updatedBy: text(actor.userId, 64),
    updatedAt: at,
    audit: appendAudit(wrapper.audit, { action: 'programme_published', actor: text(actor.userId, 64), at, detail: `v${versionNumber}` }),
  });
  record.programmes = record.programmes.map(p => (p.programmeId === updated.programmeId ? updated : p));
  await savePerformanceRecord(clubId, record);
  return { record, programme: updated };
}

/**
 * Create an assignment. Every id is re-resolved against THIS club's record —
 * a caller cannot assign another club's programme, and the athlete/group
 * context is stamped by the caller only after the handler has authorised it.
 */
export async function createAssignmentRecord(clubId, input = {}, actor = {}) {
  const record = await loadPerformanceRecord(clubId);
  const wrapper = programmeById(record, input.programmeId);
  if (!wrapper) { const e = new Error('Unknown programme'); e.status = 404; throw e; }
  if (wrapper.status !== 'published') { const e = new Error('Only a published programme can be assigned'); e.status = 400; throw e; }
  if (!input.athleteUserId) { const e = new Error('Athlete required'); e.status = 400; throw e; }
  if (!isIsoDate(input.startDate)) { const e = new Error('Start date required'); e.status = 400; throw e; }
  if (input.endDate && !isIsoDate(input.endDate)) { const e = new Error('Bad end date'); e.status = 400; throw e; }
  if (!input.snapshot || typeof input.snapshot !== 'object'
      || input.snapshot.kind !== 'programme_assignment_snapshot') {
    const e = new Error('Assignment snapshot required'); e.status = 400; throw e;
  }

  const occupying = occupyingAssignments(record, input.athleteUserId);
  const intent = String(input.intent || 'assign');
  if (occupying.length && intent === 'assign') {
    const e = new Error('This athlete already has an active programme'); e.status = 409;
    e.code = 'active_assignment_exists'; throw e;
  }

  const at = nowIso();
  const assignmentId = newAssignmentId();
  const assignment = normalizeAssignment({
    assignmentId, clubId,
    athleteUserId: input.athleteUserId,
    athleteMemberId: input.athleteMemberId || null,
    athleteName: input.athleteName || '',
    groupId: input.groupId || '', groupName: input.groupName || '',
    teamId: input.teamId || '', teamName: input.teamName || '',
    programmeId: wrapper.programmeId,
    programmeVersionId: input.programmeVersionId,
    versionNumber: Number.isInteger(input.versionNumber) ? input.versionNumber : wrapper.publishedVersion,
    programmeTitle: wrapper.title,
    snapshot: input.snapshot,
    assignedBy: text(actor.userId, 64), assignedAt: at,
    startDate: input.startDate, endDate: input.endDate || null,
    status: 'scheduled',
    source: wrapper.source,
    notes: text(input.notes, 1000),
    developmentContextSnapshot: input.developmentContextSnapshot || null,
    entitlementSnapshot: input.entitlementSnapshot || null,
    reviewFlags: Array.isArray(input.reviewFlags) ? input.reviewFlags : [],
    requiresReview: wrapper.requiresReview === true,
    reviewAcknowledgedBy: wrapper.reviewAcknowledgedBy,
    createdAt: at, updatedAt: at,
    audit: appendAudit([], { action: 'assignment_created', actor: text(actor.userId, 64), at, detail: `${wrapper.title} v${input.versionNumber}` }),
  });

  let assignments = [...(record.assignments || [])];
  // Replacement closes the outgoing assignments explicitly — never silently.
  if (intent === 'replace' && occupying.length) {
    assignments = assignments.map(a => (occupying.some(o => o.assignmentId === a.assignmentId)
      ? normalizeAssignment({
          ...a, status: 'replaced', endedAt: at, replacedByAssignmentId: assignmentId, updatedAt: at,
          audit: appendAudit(a.audit, { action: 'assignment_replaced', actor: text(actor.userId, 64), at, detail: assignmentId }),
        })
      : a));
  }
  record.assignments = [...assignments, assignment].slice(-MAX_ASSIGNMENTS);
  await savePerformanceRecord(clubId, record);
  return { record, assignment, replaced: intent === 'replace' ? occupying.map(o => o.assignmentId) : [] };
}

const STATUS_ACTIONS = {
  pause:  { to: 'paused',    from: ['scheduled', 'active'],           action: 'assignment_paused',    stamp: 'pausedAt' },
  resume: { to: 'active',    from: ['paused'],                        action: 'assignment_resumed',   stamp: 'resumedAt' },
  end:    { to: 'completed', from: ['scheduled', 'active', 'paused'], action: 'assignment_completed', stamp: 'endedAt' },
  cancel: { to: 'cancelled', from: ['draft', 'scheduled', 'active', 'paused'], action: 'assignment_cancelled', stamp: 'endedAt' },
};

/** Explicit lifecycle transition. Terminal states never reopen. */
export async function updateAssignmentStatus(clubId, assignmentId, op, input = {}, actor = {}) {
  const spec = STATUS_ACTIONS[op];
  if (!spec) { const e = new Error('Unknown assignment operation'); e.status = 400; throw e; }
  const record = await loadPerformanceRecord(clubId);
  const current = assignmentById(record, assignmentId);
  if (!current) { const e = new Error('Unknown assignment'); e.status = 404; throw e; }
  if (!spec.from.includes(current.status)) {
    const e = new Error(`Cannot ${op} an assignment that is ${current.status}`); e.status = 400; throw e;
  }
  const at = nowIso();
  const updated = normalizeAssignment({
    ...current,
    status: spec.to,
    [spec.stamp]: at,
    updatedAt: at,
    audit: appendAudit(current.audit, { action: spec.action, actor: text(actor.userId, 64), at, detail: text(input.reason, 200) }),
  });
  record.assignments = record.assignments.map(a => (a.assignmentId === assignmentId ? updated : a));
  await savePerformanceRecord(clubId, record);
  return { record, assignment: updated };
}

/** Record a coach's decision on a pending SC6 suggestion. Never publishes. */
export async function reviewProgression(clubId, assignmentId, input = {}, actor = {}) {
  const outcome = String(input.outcome || '');
  if (!['accepted', 'modified', 'rejected'].includes(outcome)) { const e = new Error('Bad review outcome'); e.status = 400; throw e; }
  const record = await loadPerformanceRecord(clubId);
  const current = assignmentById(record, assignmentId);
  if (!current) { const e = new Error('Unknown assignment'); e.status = 404; throw e; }
  if (!current.progressionReview) { const e = new Error('No pending suggestion'); e.status = 400; throw e; }
  const at = nowIso();
  const updated = normalizeAssignment({
    ...current,
    progressionReview: {
      ...current.progressionReview, status: outcome, outcome,
      reviewedAt: at, reviewedBy: text(actor.userId, 64), note: text(input.note, 500),
    },
    updatedAt: at,
    audit: appendAudit(current.audit, { action: 'progression_reviewed', actor: text(actor.userId, 64), at, detail: outcome }),
  });
  record.assignments = record.assignments.map(a => (a.assignmentId === assignmentId ? updated : a));
  await savePerformanceRecord(clubId, record);
  return { record, assignment: updated };
}

/**
 * What a PLAYER may see of their own assignment. Deliberately narrow: the
 * training content and its context, never coach notes about them, never
 * another athlete, never health data.
 */
export const PLAYER_ASSIGNMENT_FIELDS = [
  'assignmentId', 'programmeId', 'programmeVersionId', 'versionNumber', 'programmeTitle',
  'snapshot', 'startDate', 'endDate', 'status', 'assignedBy', 'assignedAt',
  'developmentContextSnapshot', 'pausedAt', 'endedAt', 'groupName', 'teamName',
];

export function projectAssignmentForPlayer(a = {}) {
  const out = {};
  for (const f of PLAYER_ASSIGNMENT_FIELDS) out[f] = a[f] ?? null;
  return out;
}

/**
 * What a COACH needs for the athletes list. Programme decision information
 * only — no wellness, no medical, no profile health detail (SC8 Part 30).
 */
export function projectAssignmentForCoach(a = {}) {
  return {
    assignmentId: a.assignmentId, athleteUserId: a.athleteUserId, athleteName: a.athleteName,
    groupId: a.groupId, groupName: a.groupName,
    programmeId: a.programmeId, programmeTitle: a.programmeTitle,
    programmeVersionId: a.programmeVersionId, versionNumber: a.versionNumber,
    startDate: a.startDate, endDate: a.endDate, status: a.status,
    assignedBy: a.assignedBy, assignedAt: a.assignedAt,
    requiresReview: a.requiresReview, reviewFlags: a.reviewFlags,
    developmentContextSnapshot: a.developmentContextSnapshot,
    progressionReview: a.progressionReview ? { status: a.progressionReview.status, suggestedAt: a.progressionReview.suggestedAt } : null,
    pausedAt: a.pausedAt, endedAt: a.endedAt, updatedAt: a.updatedAt,
  };
}

export { performanceKey };
