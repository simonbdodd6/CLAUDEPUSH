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
  // RC4.9C — access-profile model. PLAYER_DELETE is the ONLY gate for permanent
  // player deletion; no route may key that action off a job title again.
  PLAYER_DELETE:   'player_delete',    // irreversible player erasure, assigned team only
  ASSIGN_ACCESS:   'assign_access',    // grant/change another member's access profile
  // RC4.10B — fixture creation and bulk import. Deliberately separate from
  // MANAGE_TEAMS (club-wide settings): Coach Access runs fixtures for its
  // assigned teams without gaining unrestricted club configuration.
  MANAGE_FIXTURES: 'manage_fixtures',
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
const STAFF_CORE = [P.MANAGE_PLAYERS, P.PUBLISH_TRAINING, P.PUBLISH_SQUADS, P.MESSAGING, P.REPORTS, P.CLUB_EXPORTS, P.MANAGE_TEAMS, P.MANAGE_FIXTURES];

export const ROLE_PERMISSIONS = {
  owner:      [...ALL_PERMISSIONS],
  dor:        [...STAFF_CORE, P.MANAGE_COACHES, P.MEDICAL_ACCESS, P.AI_INTELLIGENCE, P.REPORTS, P.DANGER_ZONE],
  admin:      [...STAFF_CORE, P.MANAGE_COACHES, P.MEDICAL_ACCESS, P.MANAGE_SUBSCRIPTIONS, P.FINANCIAL, P.AI_INTELLIGENCE, P.DANGER_ZONE],
  head_coach: [...STAFF_CORE, P.MANAGE_COACHES, P.MEDICAL_ACCESS, P.MANAGE_SUBSCRIPTIONS, P.AI_INTELLIGENCE, P.DANGER_ZONE],
  assistant:  [...STAFF_CORE, P.MEDICAL_ACCESS, P.AI_INTELLIGENCE],
  manager:    [P.MANAGE_PLAYERS, P.MESSAGING, P.REPORTS, P.CLUB_EXPORTS, P.MANAGE_TEAMS, P.MANAGE_FIXTURES],
  medical:    [P.MEDICAL_ACCESS, P.MESSAGING, P.REPORTS],
  snc:        [P.PUBLISH_TRAINING, P.MESSAGING, P.REPORTS],
  analyst:    [P.REPORTS, P.AI_INTELLIGENCE],
  player:     [],   // player abilities (own availability, own DMs, own profile)
                    // are self-scoped in routes, not club permissions
  parent:     [],
  guest:      [],
};

// ─── ACCESS PROFILES (RC4.9C) ───────────────────────────────────────────────
// An access profile is what a person may DO. It is deliberately separate from
// their descriptive club role / job title ("Head Coach", "Team Manager"), which
// is presentation only. A Head Coach may hold Coach Access or Full Access; a
// Team Manager may hold Manager Access or Full Access. Profiles are stored on
// the team_member record, so they are inherently per-team: a person can hold
// Full Access at one club and Coach Access at another, and holds NOTHING in a
// team where they have no active membership ("assigned teams" = memberships).
export const ACCESS_PROFILES = ['full', 'coach', 'manager'];

export const ACCESS_PROFILE_LABELS = {
  full:    'Full access',
  coach:   'Coach access',
  manager: 'Manager access',
};

// Rank is used only to detect self-elevation; it is not a permission source.
const ACCESS_PROFILE_RANK = { manager: 1, coach: 2, full: 3 };

export const ACCESS_PROFILE_PERMISSIONS = {
  // Everything, including assigning access profiles and club-wide settings.
  full: [...ALL_PERMISSIONS],
  // Assigned teams: players, availability, training, selections/Match Centre,
  // team messaging and team reports. NOT club-wide settings, NOT access
  // assignment, NOT medical (separately granted), NOT diagnostics.
  coach: [
    P.MANAGE_PLAYERS, P.PLAYER_DELETE, P.PUBLISH_TRAINING, P.PUBLISH_SQUADS,
    P.MESSAGING, P.REPORTS, P.CLUB_EXPORTS, P.AI_INTELLIGENCE, P.MANAGE_FIXTURES,
  ],
  // Assigned teams: membership + invitations, availability, fixtures and
  // logistics, operational messaging and reports. NOT coaching publication,
  // NOT access assignment, NOT medical, NOT diagnostics.
  manager: [
    P.MANAGE_PLAYERS, P.PLAYER_DELETE, P.MANAGE_TEAMS, P.MANAGE_FIXTURES,
    P.MESSAGING, P.REPORTS, P.CLUB_EXPORTS,
  ],
};

// Legacy accounts carry no accessProfile. Derive one from the canonical role so
// existing clubs behave sensibly on day one; an explicit profile always wins.
const ROLE_DEFAULT_PROFILE = {
  owner: 'full', dor: 'full', admin: 'full', head_coach: 'full',
  assistant: 'coach', manager: 'manager',
};

export function accessProfileOf(member = {}) {
  const explicit = String(member.accessProfile || '').toLowerCase();
  if (ACCESS_PROFILES.includes(explicit)) return explicit;
  return ROLE_DEFAULT_PROFILE[canonicalRole(member)] || null;
}

export function hasExplicitAccessProfile(member = {}) {
  return ACCESS_PROFILES.includes(String(member.accessProfile || '').toLowerCase());
}

export function accessProfileRank(profile) {
  return ACCESS_PROFILE_RANK[String(profile || '').toLowerCase()] || 0;
}

/** True when this membership is the club owner (founder, or explicitly flagged). */
export function isClubOwner(member = {}) {
  return member?.isOwner === true ||
    canonicalRole(member) === 'owner' ||
    member?.approvedBy === 'club-creation';
}

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
  const profile = accessProfileOf(member);

  // Non-staff (player / medical / snc / analyst / parent / guest) have no access
  // profile — their abilities stay exactly as the legacy matrix defines them.
  if (!profile) {
    const base = new Set(ROLE_PERMISSIONS[canonicalRole(member)] || []);
    // RC4.7 — medicalAccess is an ADDITIVE grant and must apply here too. This
    // branch previously returned before the flag was read, so a player who is
    // also the club physio could never be given medical access on their single
    // membership — the dual-role case the grant exists for.
    if (member.medicalAccess === true) base.add(PERM.MEDICAL_ACCESS);
    return base;
  }

  const granted = new Set(ACCESS_PROFILE_PERMISSIONS[profile] || []);

  // Medical information is a SEPARATE authorisation, never implied by Coach or
  // Manager access. Explicitly-profiled members need the flag; legacy members
  // (no explicit profile yet) keep whatever their old role already granted, so
  // upgrading the model never silently removes access someone relies on today.
  const legacy = new Set(ROLE_PERMISSIONS[canonicalRole(member)] || []);
  if (member.medicalAccess === true) granted.add(PERM.MEDICAL_ACCESS);
  else if (!hasExplicitAccessProfile(member) && legacy.has(PERM.MEDICAL_ACCESS)) granted.add(PERM.MEDICAL_ACCESS);

  // Only the club owner, or a Full Access holder, may assign access profiles.
  if (profile !== 'full') granted.delete(PERM.ASSIGN_ACCESS);
  return granted;
}

// The one question every gate asks.
export function can(sessionContext = {}, permission) {
  if (!sessionContext?.user?.id) return false;
  return permissionsFor(sessionContext.teamMember).has(permission);
}
