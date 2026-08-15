#!/usr/bin/env node
/**
 * READ-ONLY production staff-scope audit — run BEFORE creating U18/Women's.
 *
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
 *     node scripts/audit-staff-scopes.js [teamId]
 *
 * Classifies every ACTIVE staff membership by what their access becomes once
 * the club holds SEVERAL groups:
 *
 *   CLUB-WIDE        owner / accessProfile 'full' / club-wide role or scope —
 *                    will operate every group, including the new ones.
 *   EXPLICIT SCOPE   stored accessScope naming groups/teams — keeps exactly
 *                    those; new groups require an explicit grant.
 *   LEGACY (null)    no stored accessScope — the documented derivation pins
 *                    them to the INITIAL group (Seniors). Safe and unchanged,
 *                    but they will NOT see U18/Women's until granted.
 *   EMPTY (stored)   an explicitly-empty stored scope — resolves to NO groups
 *                    once several exist. ⚠ MANUAL DECISION REQUIRED before
 *                    group creation.
 *
 * Reads identity + structure only. Writes nothing.
 */
import { loadTeamMembers, loadUsers, DEFAULT_TEAM } from '../api/_identityStore.js';
import { loadClubStructure } from '../api/_structureStore.js';
import { effectiveAccessScope, operationalGroupsFor, resolvePlayerGroup } from '../api/_accessScope.js';

const teamId = process.argv[2] || DEFAULT_TEAM.id;

const [members, users, structure] = await Promise.all([
  loadTeamMembers(), loadUsers(), loadClubStructure(teamId),
]);
const nameOf = id => users.find(u => u.id === id)?.displayName || id;
const staff = members.filter(m =>
  m.teamId === teamId && m.status === 'active' && m.role !== 'player');

// Project against a HYPOTHETICAL 3-group structure so the "after creation"
// column is honest even while the club still has one group.
const projected = {
  ...structure,
  groups: [
    ...structure.groups,
    ...(structure.groups.some(g => g.id === 'grp_projected_u18') ? [] : [
      { id: 'grp_projected_u18', name: '(projected) U18', type: 'general', status: 'active' },
      { id: 'grp_projected_wom', name: "(projected) Women's", type: 'general', status: 'active' },
    ]),
  ],
};

let needsDecision = 0;
for (const m of staff) {
  const stored = m.accessScope;
  const eff = effectiveAccessScope(m);
  const now = operationalGroupsFor(m, structure, { as: 'staff' }).map(g => g.name);
  const after = operationalGroupsFor(m, projected, { as: 'staff' }).map(g => g.name);
  const playing = resolvePlayerGroup(m, structure).groupId || '';
  const cls = eff.clubWide ? 'CLUB-WIDE'
    : stored == null ? 'LEGACY (null scope → initial group)'
    : (eff.groups.some(g => g.status === 'active') || eff.teams.some(t => t.status === 'active'))
      ? 'EXPLICIT SCOPE'
      : 'EMPTY (stored) ⚠ MANUAL DECISION REQUIRED';
  if (cls.startsWith('EMPTY')) needsDecision += 1;
  console.log([
    nameOf(m.userId),
    `role=${m.role}${m.staffLevel ? '/' + m.staffLevel : ''}${m.accessProfile ? ' profile=' + m.accessProfile : ''}`,
    `class=${cls}`,
    `operates-now=[${now.join(', ')}]`,
    `after-3-groups=[${after.join(', ')}]`,
    playing ? `dual-role: plays=${playing}` : '',
  ].filter(Boolean).join(' | '));
}
console.log(`\n${staff.length} active staff · ${needsDecision} need a manual scope decision before group creation`);
process.exit(needsDecision ? 2 : 0);
