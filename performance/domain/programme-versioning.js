// CoachEasier Performance — programme versioning, snapshots & access (SC4).
//
// Immutable version history, assignment-time snapshots, ownership/visibility
// and audit rules for the programme domain. Nothing here generates,
// assigns or executes anything — it defines the contracts those future
// features must obey. Pure module: no DOM, no fetch, no localStorage.

import { snapshotForAssignment as snapshotExercise } from './exercise-visibility.js';
import { createProgrammeVersion } from './programme.js';

// ── Deep freeze ─────────────────────────────────────────────────────────────

export function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) deepFreeze(value);
  }
  return obj;
}

// ── Audit ───────────────────────────────────────────────────────────────────

export const PROGRAMME_AUDIT_MAX = 200;

/** Append an audit entry (pure, capped). Used at programme + version level. */
export function appendProgrammeAudit(log, { action, actor = null, at = null, detail = '' }) {
  const next = [...(log || []), { action, actor, at, detail: String(detail).slice(0, 200) }];
  return next.length > PROGRAMME_AUDIT_MAX ? next.slice(next.length - PROGRAMME_AUDIT_MAX) : next;
}

// ── Immutable versioning ────────────────────────────────────────────────────
//
// Contract:
//  - a DRAFT version may be edited in place;
//  - PUBLISHING deep-freezes the version tree — it can never change again;
//  - editing a programme whose latest version is published creates a NEW
//    draft version (deep copy, versionNumber+1) and marks the published one
//    'superseded' in programme history semantics (its content stays frozen
//    and any assignment made against it keeps working);
//  - old assigned versions never change: assignments reference the frozen
//    version and their own snapshot (below).

/**
 * Publish a draft version: stamps status/time and deep-freezes the TRAINING
 * CONTENT (the phases tree). The envelope's `versionStatus` stays mutable —
 * it must legally transition published → superseded when a newer version is
 * published — but the structure a workout could ever be assigned from can
 * never change again.
 */
export function publishProgrammeVersion(programme, versionNumber, { actor = null, now = null } = {}) {
  const version = (programme.versions || []).find((v) => v.versionNumber === versionNumber);
  if (!version) throw new Error(`unknown_version:${versionNumber}`);
  if (version.versionStatus !== 'draft') throw new Error(`not_a_draft:${versionNumber}`);
  for (const v of programme.versions) {
    if (v.versionStatus === 'published') {
      v.versionStatus = 'superseded';
      v.audit = appendProgrammeAudit(v.audit, { action: 'superseded', actor, at: now, detail: `by v${versionNumber}` });
    }
  }
  version.versionStatus = 'published';
  version.publishedAt = now;
  version.audit = appendProgrammeAudit(version.audit, { action: 'published', actor, at: now });
  programme.audit = appendProgrammeAudit(programme.audit, { action: 'version_published', actor, at: now, detail: `v${versionNumber}` });
  deepFreeze(version.phases);
  return version;
}

/**
 * Begin editing a programme. If the latest version is a draft, that draft
 * is returned. If it is published/superseded, a NEW draft version is
 * created as a deep copy with versionNumber+1 — the frozen original is
 * never touched.
 */
export function beginEdit(programme, { actor = null, now = null } = {}) {
  const versions = programme.versions || [];
  const latest = versions.reduce((a, b) => (!a || b.versionNumber > a.versionNumber ? b : a), null);
  if (latest && latest.versionStatus === 'draft') return latest;

  const nextNumber = latest ? latest.versionNumber + 1 : 1;
  const draft = latest
    ? reviveAsDraft(structuredClone(latest), programme.id, nextNumber, actor, now)
    : createProgrammeVersion(programme, { versionNumber: 1, createdBy: actor, now });
  programme.versions = [...versions, draft];
  programme.audit = appendProgrammeAudit(programme.audit, { action: 'draft_created', actor, at: now, detail: `v${nextNumber}` });
  return draft;
}

function reviveAsDraft(copy, programmeId, versionNumber, actor, now) {
  const oldPrefix = copy.id;
  const newId = `${programmeId}@v${versionNumber}`;
  const renamed = JSON.parse(JSON.stringify(copy).split(oldPrefix).join(newId));
  renamed.versionNumber = versionNumber;
  renamed.order = versionNumber;
  renamed.versionStatus = 'draft';
  renamed.publishedAt = null;
  renamed.createdBy = actor;
  renamed.meta = { createdAt: now, updatedAt: now };
  renamed.audit = [{ action: 'drafted_from_previous', actor, at: now, detail: `from v${versionNumber - 1}` }];
  return renamed;
}

// ── Assignment snapshots ────────────────────────────────────────────────────
//
// RULE: every completed workout must always be renderable exactly as
// assigned, even if the programme, its exercises or its collections are
// later edited or archived. An assignment therefore captures — frozen:
//   - the programme version reference (already immutable once published),
//   - a snapshot of every referenced exercise at its pinned version,
//   - the collections version for every collection origin,
//   - the full prescription structure it was assigned with.

export function snapshotForProgrammeAssignment(programme, versionNumber, { catalogue = [], collectionsMeta = null, now = null } = {}) {
  const version = (programme.versions || []).find((v) => v.versionNumber === versionNumber);
  if (!version) throw new Error(`unknown_version:${versionNumber}`);
  if (version.versionStatus === 'draft') throw new Error('cannot_assign_draft');

  const exById = new Map(catalogue.map((e) => [e.id, e]));
  const exerciseSnapshots = {};
  const collectionRefs = new Set();

  for (const p of iteratePrescriptions(version)) {
    if (!exerciseSnapshots[p.exerciseId]) {
      const ex = exById.get(p.exerciseId);
      if (!ex) throw new Error(`unknown_exercise:${p.exerciseId}`);
      exerciseSnapshots[p.exerciseId] = snapshotExercise(ex, now);
    }
    if (p.collectionOrigin?.collectionId) collectionRefs.add(p.collectionOrigin.collectionId);
  }
  for (const block of iterateBlocks(version)) {
    for (const ref of block.collectionRefs || []) collectionRefs.add(ref.collectionId);
  }

  return deepFreeze({
    kind: 'programme_assignment_snapshot',
    programmeId: programme.id,
    programmeTitle: programme.title,
    programmeVersionId: version.id,
    versionNumber: version.versionNumber,
    // Provenance for historical interpretation — who authored the version
    // and when it was published, preserved even if the programme is later
    // archived or the audit logs roll over.
    versionCreatedBy: version.createdBy || null,
    versionPublishedAt: version.publishedAt || null,
    collectionsVersion: collectionsMeta?.version || null,
    collectionIds: [...collectionRefs].sort(),
    exerciseSnapshots,
    prescriptionTree: structuredClone(version.phases),
    capturedAt: now,
  });
}

export function* iterateBlocks(version) {
  for (const phase of version.phases || [])
    for (const week of phase.weeks || [])
      for (const day of week.days || [])
        for (const session of day.sessions || [])
          for (const block of session.blocks || []) yield block;
}

export function* iteratePrescriptions(version) {
  for (const block of iterateBlocks(version))
    for (const p of block.prescriptions || []) yield p;
}

// ── Ownership & visibility ──────────────────────────────────────────────────
// Mirrors the SC3 exercise-tier rules: platform content is platform-owned,
// club programmes stay in their club, coach programmes stay with their
// coach; approval always needs an independent reviewer.

export function canViewProgramme(programme, viewer = {}) {
  if (!programme) return false;
  const role = viewer.role || 'player';
  if (role === 'system_admin') return true;
  if (programme.archived) {
    return role === 'snc_coach' || role === 'club_admin'
      ? ownershipMatches(programme, viewer)
      : false;
  }
  switch (programme.ownership?.ownerType) {
    case 'coacheasier':
      return programme.status === 'approved' || role === 'snc_coach';
    case 'club':
      return viewer.clubId === programme.ownership.ownerClub &&
        (programme.status === 'approved' || role === 'snc_coach' || role === 'club_admin');
    case 'coach':
      return viewer.userId === programme.ownership.ownerCoach;
    default:
      return false;
  }
}

function ownershipMatches(programme, viewer) {
  const own = programme.ownership || {};
  if (own.ownerType === 'club') return viewer.clubId === own.ownerClub;
  if (own.ownerType === 'coach') return viewer.userId === own.ownerCoach;
  return viewer.role === 'system_admin';
}

const EDIT_ACTIONS = ['create', 'edit', 'archive', 'restore', 'publish_version'];

export function canPerformProgrammeAction(action, programme, viewer = {}) {
  const role = viewer.role || 'player';
  if (role === 'system_admin') return true;
  if (!EDIT_ACTIONS.includes(action) && action !== 'approve') return false;
  const own = programme.ownership || {};
  if (own.ownerType === 'coacheasier') return false;              // platform-owned
  if (own.ownerType === 'club') {
    if (role === 'club_admin' && viewer.clubId === own.ownerClub) return true;
    if (role === 'snc_coach' && viewer.clubId === own.ownerClub) return action !== 'approve';
    return false;
  }
  if (own.ownerType === 'coach') {
    return role === 'snc_coach' && viewer.userId === own.ownerCoach && action !== 'approve';
  }
  return false;
}

/** Approval always requires someone other than the author. */
export function canApproveProgramme(programme, viewer = {}) {
  if (!canPerformProgrammeAction('approve', programme, viewer)) return false;
  return programme.ownership?.author !== viewer.userId;
}
