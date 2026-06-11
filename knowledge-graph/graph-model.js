/**
 * Knowledge Graph — Model
 *
 * Type vocabulary for every entity (node) and relationship (edge) in the
 * Coach's Eye Knowledge Graph. This file is the single place to add new types.
 * Adding a type here never requires a schema migration — the store is schemaless.
 */

// ── Node types ────────────────────────────────────────────────────────────────

export const NODE = {
  COACH:               'Coach',
  CLUB:                'Club',
  TEAM:                'Team',
  PLAYER:              'Player',
  FIXTURE:             'Fixture',
  TRAINING_SESSION:    'TrainingSession',
  EXERCISE:            'Exercise',
  DRILL:               'Drill',
  COACHING_PRINCIPLE:  'CoachingPrinciple',
  THEME:               'Theme',
  RECOMMENDATION:      'Recommendation',
  DECISION:            'Decision',
  OBSERVATION:         'Observation',
  VIDEO:               'Video',
  DOCUMENT:            'Document',
  SEASON:              'Season',
  COMPETITION:         'Competition',
  POSITION:            'Position',
  MEDICAL_EVENT:       'MedicalEvent',
  ATTENDANCE_EVENT:    'AttendanceEvent',
  INTELLIGENCE_ENGINE: 'IntelligenceEngine',
  KNOWLEDGE_BASE:      'KnowledgeBase',
}

// ── Edge types ────────────────────────────────────────────────────────────────

export const EDGE = {
  // Coaching authority
  COACHES:          'COACHES',
  CREATED:          'CREATED',
  UPLOADED:         'UPLOADED',
  ACCEPTED:         'ACCEPTED',
  DISMISSED:        'DISMISSED',
  REVIEWED:         'REVIEWED',

  // Membership / structure
  MEMBER_OF:        'MEMBER_OF',
  PART_OF:          'PART_OF',
  CONTAINS:         'CONTAINS',
  HAS_POSITION:     'HAS_POSITION',

  // Activity participation
  ATTENDED:         'ATTENDED',
  PARTICIPATED_IN:  'PARTICIPATED_IN',
  PLAYED:           'PLAYED',

  // Knowledge flow
  USES:             'USES',
  TEACHES:          'TEACHES',
  SUPPORTS:         'SUPPORTS',
  REFERENCES:       'REFERENCES',
  CONTRIBUTES_TO:   'CONTRIBUTES_TO',
  COVERS:           'COVERS',
  MENTIONS:         'MENTIONS',

  // Intelligence pipeline
  GENERATED:        'GENERATED',
  GENERATED_BY:     'GENERATED_BY',
  CREATED_FROM:     'CREATED_FROM',
  RESULTED_IN:      'RESULTED_IN',
  CONCERNS:         'CONCERNS',
  IMPROVED:         'IMPROVED',
  OBSERVED_IN:      'OBSERVED_IN',

  // Medical / welfare
  HAS_MEDICAL_EVENT:    'HAS_MEDICAL_EVENT',
  HAS_ATTENDANCE_EVENT: 'HAS_ATTENDANCE_EVENT',

  // Temporal
  PRECEDES:         'PRECEDES',
  FOLLOWS:          'FOLLOWS',

  // Semantic
  SIMILAR_TO:       'SIMILAR_TO',
  RELATED_TO:       'RELATED_TO',
}

// ── Display metadata ──────────────────────────────────────────────────────────

export const NODE_META = {
  [NODE.COACH]:               { color: '#7c3aed', label: 'Coach',            group: 'people'      },
  [NODE.CLUB]:                { color: '#4338ca', label: 'Club',             group: 'structure'   },
  [NODE.TEAM]:                { color: '#2563eb', label: 'Team',             group: 'structure'   },
  [NODE.PLAYER]:              { color: '#16a34a', label: 'Player',           group: 'people'      },
  [NODE.FIXTURE]:             { color: '#ea580c', label: 'Fixture',          group: 'events'      },
  [NODE.TRAINING_SESSION]:    { color: '#d97706', label: 'Session',          group: 'events'      },
  [NODE.EXERCISE]:            { color: '#ca8a04', label: 'Exercise',         group: 'knowledge'   },
  [NODE.DRILL]:               { color: '#b45309', label: 'Drill',            group: 'knowledge'   },
  [NODE.COACHING_PRINCIPLE]:  { color: '#9333ea', label: 'Principle',        group: 'knowledge'   },
  [NODE.THEME]:               { color: '#7c3aed', label: 'Theme',            group: 'knowledge'   },
  [NODE.RECOMMENDATION]:      { color: '#dc2626', label: 'Recommendation',   group: 'intelligence'},
  [NODE.DECISION]:            { color: '#059669', label: 'Decision',         group: 'intelligence'},
  [NODE.OBSERVATION]:         { color: '#0284c7', label: 'Observation',      group: 'intelligence'},
  [NODE.VIDEO]:               { color: '#0891b2', label: 'Video',            group: 'media'       },
  [NODE.DOCUMENT]:            { color: '#db2777', label: 'Document',         group: 'media'       },
  [NODE.SEASON]:              { color: '#0f766e', label: 'Season',           group: 'structure'   },
  [NODE.COMPETITION]:         { color: '#0891b2', label: 'Competition',      group: 'structure'   },
  [NODE.POSITION]:            { color: '#64748b', label: 'Position',         group: 'structure'   },
  [NODE.MEDICAL_EVENT]:       { color: '#b91c1c', label: 'Medical Event',    group: 'events'      },
  [NODE.ATTENDANCE_EVENT]:    { color: '#92400e', label: 'Attendance Event', group: 'events'      },
  [NODE.INTELLIGENCE_ENGINE]: { color: '#ec4899', label: 'Engine',           group: 'intelligence'},
  [NODE.KNOWLEDGE_BASE]:      { color: '#4f46e5', label: 'Knowledge Base',   group: 'knowledge'   },
}

export const EDGE_META = {
  [EDGE.COACHES]:          { color: '#7c3aed', label: 'coaches',         weight: 3 },
  [EDGE.CREATED]:          { color: '#6b7280', label: 'created',         weight: 1 },
  [EDGE.UPLOADED]:         { color: '#6b7280', label: 'uploaded',        weight: 1 },
  [EDGE.ACCEPTED]:         { color: '#16a34a', label: 'accepted',        weight: 2 },
  [EDGE.DISMISSED]:        { color: '#dc2626', label: 'dismissed',       weight: 1 },
  [EDGE.REVIEWED]:         { color: '#2563eb', label: 'reviewed',        weight: 1 },
  [EDGE.MEMBER_OF]:        { color: '#2563eb', label: 'member of',       weight: 2 },
  [EDGE.PART_OF]:          { color: '#6b7280', label: 'part of',         weight: 1 },
  [EDGE.CONTAINS]:         { color: '#6b7280', label: 'contains',        weight: 1 },
  [EDGE.HAS_POSITION]:     { color: '#64748b', label: 'has position',    weight: 1 },
  [EDGE.ATTENDED]:         { color: '#d97706', label: 'attended',        weight: 1 },
  [EDGE.PARTICIPATED_IN]:  { color: '#ea580c', label: 'participated in', weight: 1 },
  [EDGE.PLAYED]:           { color: '#ea580c', label: 'played',          weight: 1 },
  [EDGE.USES]:             { color: '#b45309', label: 'uses',            weight: 1 },
  [EDGE.TEACHES]:          { color: '#9333ea', label: 'teaches',         weight: 2 },
  [EDGE.SUPPORTS]:         { color: '#9333ea', label: 'supports',        weight: 2 },
  [EDGE.REFERENCES]:       { color: '#db2777', label: 'references',      weight: 1 },
  [EDGE.CONTRIBUTES_TO]:   { color: '#4f46e5', label: 'contributes to',  weight: 2 },
  [EDGE.COVERS]:           { color: '#db2777', label: 'covers',          weight: 1 },
  [EDGE.MENTIONS]:         { color: '#db2777', label: 'mentions',        weight: 1 },
  [EDGE.GENERATED]:        { color: '#ec4899', label: 'generated',       weight: 2 },
  [EDGE.GENERATED_BY]:     { color: '#ec4899', label: 'generated by',    weight: 2 },
  [EDGE.CREATED_FROM]:     { color: '#dc2626', label: 'created from',    weight: 2 },
  [EDGE.RESULTED_IN]:      { color: '#059669', label: 'resulted in',     weight: 2 },
  [EDGE.CONCERNS]:         { color: '#dc2626', label: 'concerns',        weight: 1 },
  [EDGE.IMPROVED]:         { color: '#059669', label: 'improved',        weight: 2 },
  [EDGE.OBSERVED_IN]:      { color: '#0284c7', label: 'observed in',     weight: 1 },
  [EDGE.HAS_MEDICAL_EVENT]:    { color: '#b91c1c', label: 'has medical event',    weight: 1 },
  [EDGE.HAS_ATTENDANCE_EVENT]: { color: '#92400e', label: 'has attendance event', weight: 1 },
  [EDGE.PRECEDES]:         { color: '#6b7280', label: 'precedes',        weight: 1 },
  [EDGE.FOLLOWS]:          { color: '#6b7280', label: 'follows',         weight: 1 },
  [EDGE.SIMILAR_TO]:       { color: '#a855f7', label: 'similar to',      weight: 1 },
  [EDGE.RELATED_TO]:       { color: '#a855f7', label: 'related to',      weight: 1 },
}

// ── Multi-club / versioning support ──────────────────────────────────────────

export const SYSTEM_METADATA = {
  version:  1,
  schema:   'lpe-v1',   // labeled property graph v1
  supports: ['multi-club', 'multi-coach', 'versioned-knowledge', 'autonomous-agents'],
}
