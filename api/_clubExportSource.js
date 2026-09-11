// ─── SCOPED CLUB EXPORT — the read layer (CE-EXPORT-001) ─────────────────────
//
// Gathers one club's operational state for `coacheasier.club-export.v1`,
// through this product's OWN authorisation gates and no others.
//
// THE SCOPE IS THE SESSION.
//
// clubId comes from tenantTeamId(sessionContext) — the authenticated session —
// and there is no parameter that can change it. A caller-supplied clubId is not
// read, not validated, not echoed: it has no meaning here. Groups and teams are
// then filtered by canViewGroup / canViewTeam, so a group-scoped coach exports
// their own group and a club-wide coach exports the club.
//
// READ ONLY. Every store helper below is a loader; there is no branch that
// writes. Served by the existing `availability` function rather than a new one,
// because the deployment ceiling is twelve and this is a read of club state.

import { kvGet } from './_kv.js';
import { key } from './_keys.js';
import { loadTeamMembers, loadPlayerProfiles } from './_identityStore.js';
import { tenantTeamId } from './_tenant.js';
import { loadClubStructure } from './_structureStore.js';
import { canViewClub, canViewGroup, canViewTeam, resolvePlayerGroup, isPlayingMember } from './_accessScope.js';
import { loadAllGroupAvailability } from './_availabilityStore.js';
import { buildClubExport } from './_clubExport.js';

const clubKey = teamId => key(`club:${teamId}`);
const attendanceKey = (teamId, groupId) => key(`publish:${teamId}:group:${encodeURIComponent(String(groupId))}:attendance`);
const trainingScheduleGroupKey = (teamId, groupId) => key(`publish:${teamId}:group:${encodeURIComponent(String(groupId))}:training-schedule`);

function accessError(message, status = 403) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

/**
 * Build the export for the caller's own club.
 *
 * `sessionContext` must already be an authenticated session. Throws 403 when
 * the caller has no club or no group within their scope — never an empty
 * success, which would read as a club with no teams.
 */
export async function gatherClubExport(sessionContext) {
  const clubId = tenantTeamId(sessionContext);
  if (!clubId || !canViewClub(sessionContext)) accessError('Not authorized for this club');

  const structure = await loadClubStructure(clubId);

  // Only what this session may actually see.
  const groups = (structure?.groups || []).filter(g => canViewGroup(sessionContext, structure, g.id));
  const visibleGroupIds = new Set(groups.map(g => String(g.id)));
  const teams = (structure?.teams || []).filter(
    t => visibleGroupIds.has(String(t.groupId)) && canViewTeam(sessionContext, structure, t.id)
  );
  if (!groups.length || !teams.length) accessError('No group or team is within your access scope');

  const activeTeamsInGroup = groupId =>
    teams.filter(t => String(t.groupId) === String(groupId) && String(t.status || 'active') !== 'archived');

  // Members of THIS club only. loadTeamMembers is club-wide storage, so the
  // filter is what keeps another club's people out of this document.
  const members = (await loadTeamMembers()).filter(m => String(m?.teamId || '') === String(clubId));
  // Profiles are keyed by club AND user, the same pairing resolveSession uses.
  const profiles = await loadPlayerProfiles();
  const profileFor = new Map(
    (Array.isArray(profiles) ? profiles : [])
      .filter(p => String(p?.teamId || '') === String(clubId))
      .map(p => [String(p?.userId || ''), p])
  );

  const players = [];
  for (const member of members) {
    if (!isPlayingMember(member)) continue;
    // resolvePlayerGroup returns { groupId, group, source, needsAssignment }.
    // An unresolvable group is skipped rather than guessed at, exactly as the
    // resolver intends — a player in no known group is a data-integrity state
    // for an admin, not a squad member to invent.
    const { groupId: resolvedGroupId } = resolvePlayerGroup(member, structure);
    const groupId = String(resolvedGroupId || '');
    if (!visibleGroupIds.has(groupId)) continue;

    const userId = String(member?.userId || member?.id || '');
    if (!userId) continue;
    const profile = profileFor.get(userId) || {};
    // Four fields. Read nothing else off the member or profile.
    const name = String(member?.displayName || profile?.name || profile?.displayName || '').trim();
    const position = String(profile?.position || member?.position || '').trim();
    const status = String(member?.status || 'active');

    for (const team of activeTeamsInGroup(groupId)) {
      players.push({ id: userId, teamId: team.id, name, position, status });
    }
  }

  const club = (await kvGet(clubKey(clubId))) || {};
  const fixtures = Array.isArray(club.fixtures) ? club.fixtures : [];

  const trainingByGroup = {};
  const availabilityByGroup = {};
  const attendanceByGroup = {};
  for (const group of groups) {
    const groupId = String(group.id);
    const schedule = await kvGet(trainingScheduleGroupKey(clubId, groupId));
    trainingByGroup[groupId] = Array.isArray(schedule?.slots) ? schedule.slots : [];
    availabilityByGroup[groupId] = await loadAllGroupAvailability(clubId, groupId);
    attendanceByGroup[groupId] = (await kvGet(attendanceKey(clubId, groupId))) || {};
  }

  return buildClubExport({
    club: { clubId, name: club?.name || club?.clubName || structure?.name || '' },
    groups, teams, players, fixtures,
    trainingByGroup, availabilityByGroup, attendanceByGroup,
    // The contract's observedAt. The one timestamp in the document, and it
    // describes the read rather than any club fact.
    exportedAt: new Date().toISOString(),
  });
}
