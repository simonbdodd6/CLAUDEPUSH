// api/_medicalStore.js — RC4.7: the club's shared medical caseload.
//
//   CLUB (session.teamId)
//   └── PLAYER (roster id)
//       └── CASE — one medical episode: condition, severity, restrictions,
//                  clearance, notes and an append-only timeline.
//
// WHY THIS EXISTS
// Medical records previously lived inside each coach's PRIVATE draft blob
// (publish:<clubId>:draft:<userId>). Two coaches therefore saw two different
// caseloads, and a player granted Medical access had no readable source at all.
// This store is the single authoritative record for the club: every authorised
// Medical user reads and writes the same cases, regardless of who opened them.
//
// SAFETY MODEL
// This module writes exactly ONE key — medical:<clubId>. It cannot reach the
// roster, drafts, identity, fixtures, training or selections, so a medical
// write is structurally incapable of corrupting them. Field allow-lists mean
// an unknown or hostile key in a request body is dropped rather than stored.
//
// Reads NEVER write (the c79c07a8 lesson): a club with no record reads as an
// empty caseload, and nothing is persisted until an explicit mutation.

import { kvGet, kvSet } from './_kv.js';
import { key } from './_keys.js';
import { randomBytes } from 'node:crypto';

const medicalKey = clubId => key(`medical:${clubId}`);

export const CASE_STATUSES = ['active', 'resolved'];
export const CLEARANCE_STATUSES = ['', 'injured', 'rehab', 'modified', 'cleared'];

const nowIso = () => new Date().toISOString();
const text = (value, max) => String(value ?? '').trim().slice(0, max);

/**
 * The ONLY medical fields a client may write. Anything else in a request body
 * — playerGroupId, eligibility, accessScope, roster identity, fixtures — is
 * silently dropped here and can never reach storage.
 */
export const WRITABLE_CASE_FIELDS = [
  'condition', 'severity', 'dateInjured', 'trainingStatus',
  'gameAvailability', 'clearanceStatus', 'returnTarget', 'notes',
];

/** Server-owned fields — set here, never accepted from a client body. */
const SERVER_OWNED = [
  'id', 'playerId', 'playerGroupId', 'status', 'timeline',
  'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'resolvedAt', 'resolvedBy',
];

export function newCaseId() {
  return `mc_${randomBytes(6).toString('hex')}`;
}

/** Coerce one stored case into the canonical shape. */
export function normalizeCase(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const playerId = text(raw.playerId, 64);
  if (!playerId) return null;
  const status = CASE_STATUSES.includes(raw.status) ? raw.status : 'active';
  const timeline = (Array.isArray(raw.timeline) ? raw.timeline : []).slice(-100).map(entry => ({
    at: text(entry?.at, 40),
    by: text(entry?.by, 64),
    action: text(entry?.action, 40),
    note: text(entry?.note, 500),
  })).filter(entry => entry.at);
  return {
    id: text(raw.id, 64) || newCaseId(),
    playerId,
    // RC4.7 D1b readiness — a case is attributable to the group the player was
    // in when it was opened, so group isolation can filter later WITHOUT a
    // second migration. Nothing reads it yet.
    playerGroupId: text(raw.playerGroupId, 64),
    status,
    condition: text(raw.condition, 200),
    severity: text(raw.severity, 40),
    dateInjured: text(raw.dateInjured, 20),
    trainingStatus: text(raw.trainingStatus, 40),
    gameAvailability: text(raw.gameAvailability, 40),
    clearanceStatus: CLEARANCE_STATUSES.includes(raw.clearanceStatus) ? raw.clearanceStatus : '',
    returnTarget: text(raw.returnTarget, 40),
    notes: text(raw.notes, 2000),
    timeline,
    createdAt: text(raw.createdAt, 40) || nowIso(),
    createdBy: text(raw.createdBy, 64),
    updatedAt: text(raw.updatedAt, 40) || nowIso(),
    updatedBy: text(raw.updatedBy, 64),
    resolvedAt: status === 'resolved' ? (text(raw.resolvedAt, 40) || nowIso()) : '',
    resolvedBy: status === 'resolved' ? text(raw.resolvedBy, 64) : '',
  };
}

export function normalizeMedicalRecord(clubId, raw) {
  const cases = (Array.isArray(raw?.cases) ? raw.cases : [])
    .map(normalizeCase).filter(Boolean).slice(0, 1000);
  return { version: 1, clubId: String(clubId || ''), cases, updatedAt: text(raw?.updatedAt, 40) || null };
}

/** Pure read. A club with no record reads as an empty caseload — no write. */
export async function loadMedicalRecord(clubId) {
  return normalizeMedicalRecord(clubId, await kvGet(medicalKey(clubId)));
}

export async function saveMedicalRecord(clubId, record) {
  const normalized = normalizeMedicalRecord(clubId, record);
  normalized.updatedAt = nowIso();
  await kvSet(medicalKey(clubId), normalized);
  return normalized;
}

/**
 * The Medical page is a CASE LIST, not the roster: a player with no active
 * case is simply absent. Resolving a case removes it from here while the
 * record itself — and its timeline — stays stored for history.
 */
export function activeCases(record) {
  return (record?.cases || []).filter(c => c.status === 'active');
}

export function caseHistoryFor(record, playerId) {
  const id = String(playerId || '');
  return (record?.cases || []).filter(c => c.playerId === id);
}

/** Strip a client body down to the writable medical fields only. */
export function pickWritable(body = {}) {
  const out = {};
  for (const field of WRITABLE_CASE_FIELDS) {
    if (body[field] !== undefined) out[field] = body[field];
  }
  return out;
}

/**
 * Open or update the player's active case. One active case per player: a
 * second open updates the first rather than creating a duplicate.
 */
export async function upsertCase(clubId, input = {}, actor = {}) {
  const playerId = text(input.playerId, 64);
  if (!playerId) { const e = new Error('playerId required'); e.status = 400; throw e; }

  const record = await loadMedicalRecord(clubId);
  const fields = pickWritable(input);
  const existing = record.cases.find(c => c.playerId === playerId && c.status === 'active');
  const at = nowIso();
  const by = text(actor.userId, 64);

  if (existing) {
    const merged = normalizeCase({ ...existing, ...fields, updatedAt: at, updatedBy: by });
    merged.timeline = [...existing.timeline, { at, by, action: 'updated', note: text(input.timelineNote, 500) }];
    record.cases = record.cases.map(c => (c.id === existing.id ? merged : c));
    await saveMedicalRecord(clubId, record);
    return merged;
  }

  const created = normalizeCase({
    ...fields,
    id: newCaseId(),
    playerId,
    playerGroupId: text(input.playerGroupId, 64),
    status: 'active',
    createdAt: at, createdBy: by, updatedAt: at, updatedBy: by,
    timeline: [{ at, by, action: 'opened', note: text(input.timelineNote, 500) }],
  });
  record.cases = [...record.cases, created];
  await saveMedicalRecord(clubId, record);
  return created;
}

/** Clear a case: it leaves the active caseload, the history remains. */
export async function resolveCase(clubId, caseId, actor = {}) {
  const record = await loadMedicalRecord(clubId);
  const target = record.cases.find(c => c.id === String(caseId || ''));
  if (!target) { const e = new Error('Case not found'); e.status = 404; throw e; }
  if (target.status === 'resolved') return target;

  const at = nowIso();
  const by = text(actor.userId, 64);
  const resolved = normalizeCase({
    ...target, status: 'resolved', clearanceStatus: 'cleared',
    resolvedAt: at, resolvedBy: by, updatedAt: at, updatedBy: by,
  });
  resolved.timeline = [...target.timeline, { at, by, action: 'resolved', note: '' }];
  record.cases = record.cases.map(c => (c.id === target.id ? resolved : c));
  await saveMedicalRecord(clubId, record);
  return resolved;
}

/**
 * The MEDICAL-SCOPED player projection.
 *
 * Medical staff need to know who a case belongs to, nothing more. Contact
 * details — phone, email, emergency contacts, guardians — are deliberately
 * absent: this is an allow-list, so a new roster field is excluded by default
 * rather than leaking the moment someone adds it.
 */
export const PROJECTED_PLAYER_FIELDS = ['id', 'name', 'position', 'playerGroupId', 'groupName'];

export function projectPlayer(player = {}, member = null, groupName = '') {
  return {
    id: String(player.id || ''),
    name: String(player.name || ''),
    position: String(player.position || player.primaryPosition || ''),
    playerGroupId: String(member?.playerGroupId || ''),
    groupName: String(groupName || ''),
  };
}

export { medicalKey };
