// api/_structureStore.js — RC4.7 Phase B: the club's internal structure.
//
//   CLUB (the existing tenant — session.teamId)
//   └── GROUP  — an operating unit: shared player pool, availability,
//                training, messages, staff. e.g. Senior Men, U18, Ladies.
//       └── TEAM — a selectable match-day squad inside a group: fixtures,
//                  selections, lineup, published sheet. e.g. Senior 1/2.
//
// MIGRATION MODEL (deliberately computed, never written on read):
// A club with no stored structure record is presented a synthesized initial
// structure — one group and one team named from the club's own team record.
// The synthesis is pure and deterministic: same club, same result, every call,
// with no Redis write. Persistence happens only through an explicit
// persistClubStructure() call (the future admin UI's first mutation), which is
// idempotent — it writes the synthesized default only when no record exists.
// This is the c79c07a8 lesson applied forward: reads must never mutate
// production, and importing a helper must never migrate anything.

import { kvGet, kvSet } from './_kv.js';
import { key, groupPublishKey, teamPublishKey } from './_keys.js';

// Deterministic ids for the migrated initial scope. Every club's first group
// and team use these ids, so legacy-key fallback rules can name them without
// lookups. Ids are unique per club (structure is stored per club), so the
// constants cannot collide across clubs.
export const INITIAL_GROUP_ID = 'grp_initial';
export const INITIAL_TEAM_ID = 'team_initial';

export const SCOPE_STATUSES = ['active', 'archived'];

const structureKey = clubId => key(`structure:${clubId}`);

const cleanName = (value, fallback) =>
  String(value ?? '').trim().slice(0, 80) || fallback;

/** Read the club's own team record WITHOUT the identity store's dev seeding. */
async function rawClubRecord(clubId) {
  const teams = (await kvGet(key('identity:teams'))) || [];
  if (!Array.isArray(teams)) return null;
  return teams.find(team => String(team?.id ?? '') === String(clubId || '')) || null;
}

/** Pure, deterministic initial structure for a club that predates RC4.7. */
export function synthesizeInitialStructure(clubId, clubRecord = null) {
  const name = cleanName(clubRecord?.teamName, cleanName(clubRecord?.name, 'First Team'));
  return {
    version: 1,
    clubId: String(clubId || ''),
    synthesized: true,        // stripped on persist; marks "not yet stored"
    groups: [
      { id: INITIAL_GROUP_ID, name, type: 'general', status: 'active' },
    ],
    teams: [
      { id: INITIAL_TEAM_ID, groupId: INITIAL_GROUP_ID, name, ageGrade: '', genderCategory: '', status: 'active' },
    ],
  };
}

function normalizeStructure(clubId, stored) {
  if (!stored || typeof stored !== 'object') return null;
  const groups = Array.isArray(stored.groups) ? stored.groups : [];
  const teams = Array.isArray(stored.teams) ? stored.teams : [];
  return {
    version: Number(stored.version) || 1,
    clubId: String(clubId || ''),
    synthesized: false,
    groups: groups
      .filter(g => g && typeof g === 'object' && g.id)
      .map(g => ({
        id: String(g.id), name: cleanName(g.name, 'Group'),
        type: String(g.type || 'general'),
        status: SCOPE_STATUSES.includes(g.status) ? g.status : 'active',
      })),
    teams: teams
      .filter(t => t && typeof t === 'object' && t.id && t.groupId)
      .map(t => ({
        id: String(t.id), groupId: String(t.groupId), name: cleanName(t.name, 'Team'),
        ageGrade: String(t.ageGrade || ''), genderCategory: String(t.genderCategory || ''),
        status: SCOPE_STATUSES.includes(t.status) ? t.status : 'active',
      })),
  };
}

/**
 * The club's structure: stored record if present, synthesized default
 * otherwise. Read-only — never writes.
 */
export async function loadClubStructure(clubId) {
  if (!clubId) return synthesizeInitialStructure('');
  const stored = normalizeStructure(clubId, await kvGet(structureKey(clubId)));
  if (stored) return stored;
  return synthesizeInitialStructure(clubId, await rawClubRecord(clubId));
}

/**
 * Idempotent explicit persistence: writes the synthesized default ONLY when no
 * structure record exists yet. Running any number of times cannot duplicate
 * groups, teams or anything else. Returns the stored structure either way.
 */
export async function persistClubStructure(clubId) {
  const existing = normalizeStructure(clubId, await kvGet(structureKey(clubId)));
  if (existing) return existing;
  const synthesized = synthesizeInitialStructure(clubId, await rawClubRecord(clubId));
  const { synthesized: _flag, ...record } = synthesized;
  await kvSet(structureKey(clubId), record);
  return { ...record, synthesized: false };
}

export async function saveClubStructure(clubId, structure) {
  const normalized = normalizeStructure(clubId, structure);
  if (!normalized) throw new Error('Invalid club structure');
  const { synthesized: _flag, ...record } = normalized;
  await kvSet(structureKey(clubId), record);
  return record;
}

// ─── Pure lookups (fail closed on anything unknown) ─────────────────────────

export function groupById(structure, groupId) {
  if (!structure || !groupId) return null;
  return (structure.groups || []).find(g => g.id === String(groupId)) || null;
}

export function teamById(structure, teamId) {
  if (!structure || !teamId) return null;
  return (structure.teams || []).find(t => t.id === String(teamId)) || null;
}

export function activeGroups(structure) {
  return (structure?.groups || []).filter(g => g.status === 'active');
}

export function activeTeams(structure, groupId = null) {
  const teams = (structure?.teams || []).filter(t => t.status === 'active');
  if (!groupId) return teams;
  return teams.filter(t => t.groupId === String(groupId));
}

/** 404-style guard: the group must exist in THIS club's structure. */
export function assertGroupBelongsToClub(structure, groupId) {
  const group = groupById(structure, groupId);
  if (!group) {
    const error = new Error('Unknown group for this club');
    error.status = 404;
    throw error;
  }
  return group;
}

/** 404-style guard: the team must exist in THIS club's structure. */
export function assertTeamBelongsToClub(structure, teamId) {
  const team = teamById(structure, teamId);
  if (!team) {
    const error = new Error('Unknown team for this club');
    error.status = 404;
    throw error;
  }
  return team;
}

// ─── Scoped publication blocks (Phase B foundation) ─────────────────────────
// Group blocks: training, training_schedule, sessions — shared by every team
// in the group. Team blocks: squad and future match-day sheets — one per team.
// Reads fall back to the legacy club-scoped key ONLY for the migrated initial
// scope, so pre-RC4.7 data keeps appearing without any rewrite. Writes always
// use the scoped key.

export async function readGroupBlock(clubId, groupId, block, legacyReader = null) {
  const scoped = await kvGet(groupPublishKey(clubId, groupId, block));
  if (scoped !== null && scoped !== undefined) return scoped;
  if (String(groupId) === INITIAL_GROUP_ID && typeof legacyReader === 'function') {
    return legacyReader();
  }
  return null;
}

export async function writeGroupBlock(clubId, groupId, block, value) {
  return kvSet(groupPublishKey(clubId, groupId, block), value);
}

export async function readTeamBlock(clubId, teamId, block, legacyReader = null) {
  const scoped = await kvGet(teamPublishKey(clubId, teamId, block));
  if (scoped !== null && scoped !== undefined) return scoped;
  if (String(teamId) === INITIAL_TEAM_ID && typeof legacyReader === 'function') {
    return legacyReader();
  }
  return null;
}

export async function writeTeamBlock(clubId, teamId, block, value) {
  return kvSet(teamPublishKey(clubId, teamId, block), value);
}
