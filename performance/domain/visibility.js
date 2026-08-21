// CoachEasier Performance — data ownership & visibility model (SC2).
//
// Product-level privacy boundaries for the athlete profile. This module
// makes NO legal claims — it defines who the product shows what, with
// conservative defaults and explicit, auditable, revocable grants.
//
// Pure module: no DOM, no fetch, no localStorage.

// ── Roles ───────────────────────────────────────────────────────────────────
// These are product roles for the Performance module. They map onto (never
// replace) existing CoachEasier identities: today's app roles are
// 'coach'/'player' plus server permission strings; richer roles arrive with
// the API adapter. mapCoachEasierRole() is that seam.

export const VISIBILITY_ROLES = [
  { id: 'player',       label: 'Player' },
  { id: 'team_coach',   label: 'Team coach' },
  { id: 'snc_coach',    label: 'S&C coach' },
  { id: 'medical',      label: 'Medical staff' },
  { id: 'club_admin',   label: 'Club admin' },
  { id: 'parent',       label: 'Parent / guardian' },
  { id: 'system_admin', label: 'System administrator' },
];

// ── Profile categories ──────────────────────────────────────────────────────

export const PROFILE_CATEGORIES = [
  { id: 'identity',           label: 'Identity & references',      owner: 'player' },
  { id: 'rugby',              label: 'Rugby profile',              owner: 'player' },
  { id: 'body',               label: 'Body profile',               owner: 'player' },
  { id: 'training',           label: 'Training profile',           owner: 'player' },
  { id: 'strength',           label: 'Strength & performance',     owner: 'player' },
  { id: 'equipment',          label: 'Equipment access',           owner: 'player' },
  { id: 'schedule',           label: 'Availability & schedule',    owner: 'player' },
  { id: 'goals',              label: 'Goals',                      owner: 'player' },
  { id: 'wellness',           label: 'Wellness check-ins',         owner: 'player', sensitive: true },
  { id: 'pain',               label: 'Pain & limitation reports',  owner: 'player', sensitive: true },
  { id: 'health',             label: 'Restricted health records',  owner: 'player', sensitive: true, restricted: true },
  { id: 'coach_restrictions', label: 'Coach-entered restrictions', owner: 'staff' },
  { id: 'sharing',            label: 'Sharing & permissions',      owner: 'player' },
];

export const VISIBILITY_LEVELS = ['none', 'summary', 'full'];

// ── Default matrix ──────────────────────────────────────────────────────────
// Conservative by default:
//  - players always see their own data in full;
//  - club admins get NO automatic access to restricted health data;
//  - rugby (team) coaches get NO automatic access to wellness/pain/health;
//  - S&C coaches see performance-relevant data for ASSIGNED athletes only,
//    and only summaries of player-reported wellness/pain — never the
//    restricted health category without an explicit grant;
//  - medical staff see nothing until explicitly authorised;
//  - parents/guardians are configurable, off by default;
//  - system administrators are an operational role — access is flagged as
//    audited, not a product surface.

const DEFAULTS = {
  player:       { identity: 'full', rugby: 'full', body: 'full', training: 'full', strength: 'full', equipment: 'full', schedule: 'full', goals: 'full', wellness: 'full', pain: 'full', health: 'full', coach_restrictions: 'summary', sharing: 'full' },
  team_coach:   { identity: 'summary', rugby: 'full', body: 'none', training: 'summary', strength: 'summary', equipment: 'summary', schedule: 'full', goals: 'summary', wellness: 'none', pain: 'none', health: 'none', coach_restrictions: 'full', sharing: 'none' },
  snc_coach:    { identity: 'summary', rugby: 'full', body: 'full', training: 'full', strength: 'full', equipment: 'full', schedule: 'full', goals: 'full', wellness: 'summary', pain: 'summary', health: 'none', coach_restrictions: 'full', sharing: 'none' },
  medical:      { identity: 'summary', rugby: 'summary', body: 'none', training: 'none', strength: 'none', equipment: 'none', schedule: 'none', goals: 'none', wellness: 'none', pain: 'none', health: 'none', coach_restrictions: 'summary', sharing: 'none' },
  club_admin:   { identity: 'summary', rugby: 'summary', body: 'none', training: 'none', strength: 'none', equipment: 'none', schedule: 'none', goals: 'none', wellness: 'none', pain: 'none', health: 'none', coach_restrictions: 'none', sharing: 'none' },
  parent:       { identity: 'none', rugby: 'none', body: 'none', training: 'none', strength: 'none', equipment: 'none', schedule: 'none', goals: 'none', wellness: 'none', pain: 'none', health: 'none', coach_restrictions: 'none', sharing: 'none' },
  system_admin: { identity: 'full', rugby: 'full', body: 'full', training: 'full', strength: 'full', equipment: 'full', schedule: 'full', goals: 'full', wellness: 'full', pain: 'full', health: 'full', coach_restrictions: 'full', sharing: 'full' },
};

// Roles whose non-'none' defaults only apply to athletes assigned to them.
const ASSIGNMENT_SCOPED_ROLES = new Set(['team_coach', 'snc_coach']);

// Categories that may NEVER be widened by default or by assignment alone —
// only an explicit grant (or being the player) reaches them.
const GRANT_ONLY = { health: new Set(['team_coach', 'snc_coach', 'medical', 'club_admin', 'parent']) };

const LEVEL_RANK = { none: 0, summary: 1, full: 2 };

/**
 * Resolve what a role can see of one category for one athlete profile.
 *
 * @param {string} role       VISIBILITY_ROLES id
 * @param {string} category   PROFILE_CATEGORIES id
 * @param {object} [ctx]
 * @param {boolean} [ctx.isSelf]     viewer is the athlete
 * @param {boolean} [ctx.assigned]   athlete is assigned to this viewer (coach roles)
 * @param {Array}   [ctx.grants]     sharing.grants list from the profile
 * @param {Date}    [ctx.now]
 * @returns {'none'|'summary'|'full'}
 */
export function resolveVisibility(role, category, { isSelf = false, assigned = false, grants = [], now = new Date() } = {}) {
  if (!DEFAULTS[role] || !PROFILE_CATEGORIES.some((c) => c.id === category)) return 'none';
  if (isSelf && role === 'player') return DEFAULTS.player[category] || 'none';

  let base = DEFAULTS[role][category] || 'none';
  if (ASSIGNMENT_SCOPED_ROLES.has(role) && !assigned) base = 'none';
  if (GRANT_ONLY[category]?.has(role)) base = 'none';

  // Explicit grants can widen access; a revoked grant contributes nothing.
  let granted = 'none';
  for (const g of grants || []) {
    if (g.role !== role || g.category !== category) continue;
    if (g.revokedAt && new Date(g.revokedAt).getTime() <= now.getTime()) continue;
    if (LEVEL_RANK[g.level] > LEVEL_RANK[granted]) granted = g.level;
  }
  return LEVEL_RANK[granted] > LEVEL_RANK[base] ? granted : base;
}

/** Convenience: every category this role can currently see, with levels. */
export function visibleCategories(role, ctx = {}) {
  const out = {};
  for (const c of PROFILE_CATEGORIES) {
    const level = resolveVisibility(role, c.id, ctx);
    if (level !== 'none') out[c.id] = level;
  }
  return out;
}

// ── Grants & consent ────────────────────────────────────────────────────────

/** Build a grant record. Grants are additive, explicit and revocable. */
export function makeGrant({ role, category, level = 'summary', grantedBy, now = null }) {
  return {
    role, category,
    level: VISIBILITY_LEVELS.includes(level) ? level : 'summary',
    grantedBy: grantedBy || null,
    grantedAt: now,
    revokedAt: null,
  };
}

/** Revoke a grant (pure — returns a new grants list). */
export function revokeGrant(grants, { role, category, now = null }) {
  return (grants || []).map((g) =>
    g.role === role && g.category === category && !g.revokedAt
      ? { ...g, revokedAt: now }
      : g
  );
}

// ── Audit ───────────────────────────────────────────────────────────────────

export const AUDIT_LOG_MAX = 100;

/**
 * Append an audit entry for any visibility/consent change. Pure; capped.
 * @param {Array} log
 * @param {{action:string, actor:string, role?:string, category?:string, level?:string, at:string, detail?:string}} entry
 */
export function appendAudit(log, entry) {
  const next = [...(log || []), {
    action: String(entry.action || 'change'),
    actor: entry.actor || null,
    role: entry.role || null,
    category: entry.category || null,
    level: entry.level || null,
    at: entry.at || null,
    detail: entry.detail ? String(entry.detail).slice(0, 200) : '',
  }];
  return next.length > AUDIT_LOG_MAX ? next.slice(next.length - AUDIT_LOG_MAX) : next;
}

// ── CoachEasier role seam ───────────────────────────────────────────────────

/**
 * Map today's CoachEasier identity onto a Performance visibility role.
 * The current app only distinguishes coach/player; richer staff roles are
 * introduced by grants until the identity system carries them natively.
 */
export function mapCoachEasierRole(user) {
  if (!user) return null;
  if (user.role === 'coach') return 'snc_coach';
  if (user.role === 'player') return 'player';
  return null;
}
