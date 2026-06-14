// api/_permissions.js — THE single source of truth for authorization.
//
// One person → one identity → one or more team memberships → one or more
// roles → a computed permission set. Every server gate asks
// "can this identity perform this action?" via can()/permissionsFor().
// Role NAMES never appear in route code — only permission checks.
//
// AI compatibility: any future AI/Intelligence endpoint MUST authorize
// through this same module (can(sessionContext, PERM.X)). The AI Brain holds
// no privileges of its own — it acts as the identity that invoked it, and a
// recommendation it cannot execute for that identity must not be offered.
//
// Backward compatibility: the matrix below grants the legacy roles
// ('coach' + staffLevel, 'admin', 'medical', 'player') exactly the abilities
// they had under the old ['coach','admin'] role-name gates, so converting
// gates to permissions is behavior-preserving for every existing account.

export const PERM = {
  CREATE_CLUBS:    'create_clubs',
  DELETE_CLUBS:    'delete_clubs',     // danger-zone club data wipe
  MANAGE_SUBSCRIPTIONS: 'manage_subscriptions',
  MANAGE_TEAMS:    'manage_teams',     // club config: names, season, schedule, fixtures
  MANAGE_COACHES:  'manage_coaches',   // staff invites, removal, permission levels
  MANAGE_PLAYERS:  'manage_players',   // roster, player invites, approve/remove/archive
  PUBLISH_TRAINING:'publish_training',
  PUBLISH_SQUADS:  'publish_squads',
  MEDICAL_ACCESS:  'medical_access',
  MESSAGING:       'messaging',        // squad/coach messaging + push sends + schedules
  FINANCIAL:       'financial_settings',
  REPORTS:         'reports',          // availability boards, logs, attendance
  AI_INTELLIGENCE: 'ai_intelligence',
  CLUB_EXPORTS:    'club_exports',
  DANGER_ZONE:     'danger_zone',
};

export const ALL_PERMISSIONS = Object.values(PERM);

// Canonical role identifiers. Legacy member.role values map directly:
// 'coach' (+staffLevel head|assistant), 'admin', 'medical', 'player'.
export const ROLES = [
  'owner',        // Club Owner
  'dor',          // Director of Rugby
  'admin',        // Club Administrator (legacy 'admin')
  'head_coach',   // legacy 'coach' + staffLevel 'head' (or none)
  'assistant',    // legacy 'coach' + staffLevel 'assistant'
  'manager',      // Team Manager — legacy 'coach' + staffLevel 'manager'
  'medical',      // legacy 'medical'
  'snc',          // S&C Coach
  'analyst',      // Analyst
  'player',       // legacy 'player'
  'parent',
  'guest',
];

const P = PERM;
const STAFF_CORE = [P.MANAGE_PLAYERS, P.PUBLISH_TRAINING, P.PUBLISH_SQUADS, P.MESSAGING, P.REPORTS, P.CLUB_EXPORTS, P.MANAGE_TEAMS];

export const ROLE_PERMISSIONS = {
  owner:      [...ALL_PERMISSIONS],
  dor:        [...STAFF_CORE, P.MANAGE_COACHES, P.MEDICAL_ACCESS, P.AI_INTELLIGENCE, P.REPORTS, P.DANGER_ZONE],
  admin:      [...STAFF_CORE, P.MANAGE_COACHES, P.MEDICAL_ACCESS, P.MANAGE_SUBSCRIPTIONS, P.FINANCIAL, P.AI_INTELLIGENCE, P.DANGER_ZONE],
  head_coach: [...STAFF_CORE, P.MANAGE_COACHES, P.MEDICAL_ACCESS, P.MANAGE_SUBSCRIPTIONS, P.AI_INTELLIGENCE, P.DANGER_ZONE],
  assistant:  [...STAFF_CORE, P.MEDICAL_ACCESS, P.AI_INTELLIGENCE],
  manager:    [P.MANAGE_PLAYERS, P.MESSAGING, P.REPORTS, P.CLUB_EXPORTS, P.MANAGE_TEAMS],
  medical:    [P.MEDICAL_ACCESS, P.MESSAGING, P.REPORTS],
  snc:        [P.PUBLISH_TRAINING, P.MESSAGING, P.REPORTS],
  analyst:    [P.REPORTS, P.AI_INTELLIGENCE],
  player:     [],   // player abilities (own availability, own DMs, own profile)
                    // are self-scoped in routes, not club permissions
  parent:     [],
  guest:      [],
};

// Map a stored team_member record onto a canonical role id.
export function canonicalRole(member = {}) {
  const role = String(member.role || '').toLowerCase();
  if (role === 'coach') {
    const level = String(member.staffLevel || 'head').toLowerCase();
    if (level === 'assistant') return 'assistant';
    if (level === 'manager') return 'manager';
    return 'head_coach';
  }
  if (ROLES.includes(role)) return role;
  return 'guest';
}

export function permissionsFor(member = {}) {
  if (!member || member.status !== 'active') return new Set();
  return new Set(ROLE_PERMISSIONS[canonicalRole(member)] || []);
}

// The one question every gate asks.
export function can(sessionContext = {}, permission) {
  if (!sessionContext?.user?.id) return false;
  return permissionsFor(sessionContext.teamMember).has(permission);
}
