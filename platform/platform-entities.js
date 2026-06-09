// Shared entity models — canonical shapes used across all Coach's Eye engines.
// Not enforced at runtime — these are schemas that engines SHOULD conform to.

export const ENTITY_VERSION = '1.0.0';

// ── Field type descriptors (documentation only) ────────────────────────────────

const T = {
  string:   'string',
  number:   'number',
  boolean:  'boolean',
  date:     'ISO 8601 date string',
  id:       'string (prefixed UUID)',
  enum:     (...values) => `enum(${values.join('|')})`,
  array:    (type) => `${type}[]`,
  nullable: (type) => `${type} | null`,
};

// ── Entity schemas ─────────────────────────────────────────────────────────────

export const SCHEMAS = {

  Player: {
    _version: ENTITY_VERSION,
    id:             T.id,                                    // 'player_...'
    type:           'player',
    core: {
      name:         T.string,
      dob:          T.nullable(T.date),
      age:          T.nullable(T.number),
      position:     T.nullable(T.string),                   // 'Prop', 'Lock', etc.
      ageGroup:     T.nullable(T.string),                   // 'U14', 'Senior'
      experience:   T.enum('Beginner','Intermediate','Advanced','Elite'),
      active:       T.boolean,
      gender:       T.nullable(T.enum('male','female','other')),
    },
    attendance: {
      totalSessions:  T.number,
      attended:       T.number,
      rate:           T.nullable(T.number),                 // 0.0–1.0
    },
    injuries:       T.array('Injury'),
    goals:          T.array('{ goal: string, createdAt: date }'),
    teams:          T.array('{ teamId, ageGroup, role }'),
    developmentScore: T.nullable(T.number),                 // 0–100
    injuryRiskScore:  T.nullable(T.number),                 // 0–100
    summary:          T.nullable(T.string),
    updatedAt:        T.date,
  },

  Team: {
    _version: ENTITY_VERSION,
    id:           T.id,                                     // 'team_...'
    type:         'team',
    name:         T.string,
    ageGroup:     T.string,
    gender:       T.nullable(T.enum('male','female','mixed')),
    division:     T.nullable(T.string),
    headCoach:    T.nullable(T.string),
    players:      T.array('string'),                        // player IDs
    status:       T.enum('active','inactive','disbanded'),
    avgDevelopmentScore: T.nullable(T.number),
    trend:        T.enum('improving','stable','declining'),
    updatedAt:    T.date,
  },

  Injury: {
    _version: ENTITY_VERSION,
    id:         T.nullable(T.id),
    playerId:   T.id,
    playerName: T.nullable(T.string),
    type:       T.string,                                   // 'hamstring', 'ACL', etc.
    bodyPart:   T.nullable(T.string),
    position:   T.nullable(T.string),
    status:     T.enum('active','recovering','cleared'),
    severity:   T.nullable(T.enum('minor','moderate','severe')),
    injuryDate: T.nullable(T.date),
    expectedReturn: T.nullable(T.date),
    clearedDate:    T.nullable(T.date),
    notes:          T.nullable(T.string),
  },

  TrainingSession: {
    _version: ENTITY_VERSION,
    id:          T.id,
    type:        'session',
    ageGroup:    T.string,
    date:        T.nullable(T.date),
    focus:       T.string,
    durationMins: T.number,
    venue:       T.nullable(T.string),
    playerCount: T.nullable(T.number),
    drills:      T.array('{ name, duration, description, players }'),
    warmUp:      T.nullable(T.string),
    coolDown:    T.nullable(T.string),
    coachNotes:  T.nullable(T.string),
    status:      T.enum('planned','completed','cancelled'),
    generatedBy: T.nullable(T.string),
    isMock:      T.boolean,
  },

  Fixture: {
    _version: ENTITY_VERSION,
    id:          T.id,
    homeTeam:    T.string,
    awayTeam:    T.string,
    date:        T.nullable(T.date),
    venue:       T.nullable(T.string),
    competition: T.nullable(T.string),
    ageGroup:    T.nullable(T.string),
    status:      T.enum('upcoming','played','postponed','cancelled'),
    homeScore:   T.nullable(T.number),
    awayScore:   T.nullable(T.number),
    result:      T.nullable(T.string),                      // 'WIN 24-17', 'LOSS 10-22'
  },

  Sponsor: {
    _version: ENTITY_VERSION,
    id:          T.id,
    name:        T.string,
    tier:        T.enum('title','gold','silver','bronze','community'),
    status:      T.enum('active','lapsed','negotiating'),
    annualValue: T.nullable(T.number),
    contactName: T.nullable(T.string),
    contactEmail: T.nullable(T.string),
    validFrom:   T.nullable(T.date),
    validUntil:  T.nullable(T.date),
    notes:       T.nullable(T.string),
  },

  Member: {
    _version: ENTITY_VERSION,
    id:             T.id,
    playerName:     T.nullable(T.string),
    membershipType: T.string,                               // 'adult', 'juvenile', etc.
    status:         T.enum('active','pending','lapsed','expired'),
    ageGroup:       T.nullable(T.string),
    validFrom:      T.nullable(T.date),
    validUntil:     T.nullable(T.date),
  },

  Volunteer: {
    _version: ENTITY_VERSION,
    id:          T.id,
    name:        T.string,
    role:        T.nullable(T.string),
    email:       T.nullable(T.string),
    phone:       T.nullable(T.string),
    status:      T.enum('active','inactive'),
    lastActive:  T.nullable(T.date),
    eventsHelped: T.number,
    teams:       T.array('string'),
  },

  Communication: {
    _version: ENTITY_VERSION,
    id:               T.id,
    type:             T.string,                             // 'newsletter', 'match_report', etc.
    status:           T.enum('draft','approved','sent','failed','scheduled'),
    requiresHumanApproval: T.boolean,
    audienceSummary:  T.nullable(T.string),
    recipientCount:   T.nullable(T.number),
    subject:          T.nullable(T.string),
    body:             T.nullable(T.string),
    channel:          T.nullable(T.string),
    riskLevel:        T.enum('low','medium','high'),
    scheduledFor:     T.nullable(T.date),
    createdAt:        T.date,
  },

  ApprovalCard: {
    _version: ENTITY_VERSION,
    approvalId:   T.id,
    type:         T.string,
    title:        T.string,
    generatedBy:  T.string,
    confidence:   T.number,                                 // 0–100
    evidence:     T.array('string'),
    preview:      T.nullable(T.string),
    riskLevel:    T.enum('low','medium','high'),
    requiresRole: T.string,
    status:       T.enum('pending','approved','rejected','archived'),
    editedContent: T.nullable(T.string),
    approvedBy:   T.nullable(T.string),
    rejectedBy:   T.nullable(T.string),
    rejectionReason: T.nullable(T.string),
    createdAt:    T.date,
    reviewedAt:   T.nullable(T.date),
  },
};

// ── Validators ─────────────────────────────────────────────────────────────────

export function validatePlayer(obj) {
  if (!obj?.id)           return { valid: false, errors: ['missing id'] };
  if (!obj?.core?.name)   return { valid: false, errors: ['missing core.name'] };
  return { valid: true, errors: [] };
}

export function validateTeam(obj) {
  if (!obj?.id)       return { valid: false, errors: ['missing id'] };
  if (!obj?.ageGroup) return { valid: false, errors: ['missing ageGroup'] };
  return { valid: true, errors: [] };
}

export function validateCommunication(obj) {
  if (!obj?.id)     return { valid: false, errors: ['missing id'] };
  if (!obj?.type)   return { valid: false, errors: ['missing type'] };
  if (!obj?.status) return { valid: false, errors: ['missing status'] };
  return { valid: true, errors: [] };
}

export function listEntities() {
  return Object.keys(SCHEMAS).map(name => ({
    name,
    version:  ENTITY_VERSION,
    fields:   Object.keys(SCHEMAS[name]).filter(k => !k.startsWith('_')).length,
  }));
}
