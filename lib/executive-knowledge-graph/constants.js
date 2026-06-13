// Executive Knowledge Graph — shared vocabulary (the canonical registries).
//
// These are OPEN registries: the conventional values are listed here so panels and
// queries stay consistent, but the graph accepts ANY non-empty string for type /
// relationship / domain. That is what lets future products ("not yet imagined")
// participate without modifying this module.

export const KG_SCHEMA_VERSION = '1.0.0';

// ── Entity type registry ──────────────────────────────────────────────────────
// The kinds of thing the platform connects. Domain-neutral.
export const ENTITY_TYPE = {
  PERSON:         'person',
  COMPANY:        'company',
  PROJECT:        'project',
  LEAD:           'lead',
  MEETING:        'meeting',
  TASK:           'task',
  RECOMMENDATION: 'recommendation',
  EVIDENCE:       'evidence',
  DECISION:       'decision',
  MEMORY:         'memory',
  EVENT:          'event',
  PRODUCT:        'product',
  CUSTOMER:       'customer',
  // Domain-specific examples that map onto the same model:
  PLAYER:         'player',     // Coach's Eye
  TEAM:           'team',       // Coach's Eye
  VENUE:          'venue',      // Wedding / Hospitality
  TRIP:           'trip',       // Travel
  BOOKING:        'booking',    // Hospitality / Travel
};

// ── Relationship type registry ────────────────────────────────────────────────
// How entities connect. Direction is per-edge (directed by default).
export const RELATIONSHIP_TYPE = {
  OWNS:         'owns',
  MEMBER_OF:    'member_of',
  PART_OF:      'part_of',
  WORKS_FOR:    'works_for',
  ASSIGNED_TO:  'assigned_to',
  ATTENDS:      'attends',
  REFERENCES:   'references',
  RELATED_TO:   'related_to',
  DEPENDS_ON:   'depends_on',     // recommendation / decision dependency graphs
  DERIVED_FROM: 'derived_from',
  CITES:        'cites',          // evidence relationship graph
  EVIDENCED_BY: 'evidenced_by',
  DECIDED_BY:   'decided_by',
  APPROVED_BY:  'approved_by',
  ABOUT:        'about',
  PRODUCED:     'produced',
};

export const ENTITY_STATUS = {
  ACTIVE:   'active',
  ARCHIVED: 'archived',
  MERGED:   'merged',
  DELETED:  'deleted',
};

export const RELATIONSHIP_STATUS = {
  ACTIVE:   'active',
  ENDED:    'ended',      // validUntil has passed
  REVOKED:  'revoked',
};

// Conventional domains (open — any string accepted).
export const DOMAIN = {
  COACHES_EYE:   'coaches-eye',
  WEBSITE_LEAD:  'website-lead',
  WEDDING:       'wedding',
  TRAVEL:        'travel',
  HOSPITALITY:   'hospitality',
  PLATFORM:      'platform',
};

export const DIRECTION = {
  OUT:  'out',     // follow edges from → to
  IN:   'in',      // follow edges to → from
  BOTH: 'both',
};
