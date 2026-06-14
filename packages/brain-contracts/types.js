/**
 * @brain/contracts — Type surface (M31.0)
 *
 * JSDoc typedefs only — the documented shapes the platform exchanges. These
 * describe objects the existing engines ALREADY produce (M17 envelope, M18–M28
 * recommendation, M19 profile/observation). No runtime code; importing this
 * module has no effect. Kept as a module so the surface has a stable home.
 *
 * @typedef {string} TenantId
 * @typedef {string} ProductId
 * @typedef {string} SubjectId
 * @typedef {'free'|'starter'|'performance'|'club'|'professional'|'enterprise'} Tier
 * @typedef {'private'|'shared'} Visibility
 * @typedef {'high'|'medium'|'low'} Severity
 * @typedef {'insufficient_tier'|'feature_disabled'|'brain_unavailable'|'invalid_input'|'ai_not_enabled'} Reason
 *
 * @typedef {Object} Scope
 * @property {TenantId}   tenant
 * @property {ProductId}  product
 * @property {string}     namespace
 * @property {Visibility} visibility
 *
 * @typedef {Object} Envelope
 * @property {boolean}      available
 * @property {boolean}      ok
 * @property {Reason|null}  reason
 * @property {*}            data
 * @property {string}      version
 *
 * @typedef {Object} Recommendation
 * @property {string}        id
 * @property {string}        recommendation
 * @property {string}        why
 * @property {string[]}      evidence
 * @property {number|null}   confidence
 * @property {Severity}      priority
 * @property {string|null}   fallback
 *
 * @typedef {Object} MemoryRecord
 * @property {string} key
 * @property {Scope}  scope
 * @property {*}      value
 * @property {string} version
 * @property {string|null} updatedAt
 *
 * @typedef {Object} Observation
 * @property {string}    observationId
 * @property {SubjectId} subjectId
 * @property {string}    type
 * @property {*}         data
 * @property {string|null} recordedAt
 *
 * @typedef {Object} SubjectProfile
 * @property {SubjectId}     subjectId
 * @property {string}        kind
 * @property {string}        profileVersion
 * @property {Observation[]} observations
 * @property {*}             derived
 * @property {number}        observationCount
 *
 * @typedef {Object} BrainEvent
 * @property {string} id
 * @property {Scope}  scope
 * @property {string} type
 * @property {*}      payload
 * @property {string|null} at
 *
 * @typedef {Object} AuditRecord
 * @property {string}   id
 * @property {Scope}    scope
 * @property {string}   action
 * @property {string}   actor
 * @property {string[]} evidence
 * @property {'allow'|'deny'|'approve'|'reject'} outcome
 * @property {string|null} at
 *
 * @typedef {Object} ApprovalRequest
 * @property {string}    id
 * @property {ProductId} product
 * @property {TenantId}  tenant
 * @property {string}    action
 * @property {string[]}  evidence
 * @property {Severity}  risk
 * @property {string}    requestedBy
 *
 * @typedef {Object} ApprovalDecision
 * @property {string} id
 * @property {'pending'|'approved'|'rejected'|'expired'} state
 * @property {string|null} decidedBy
 * @property {string|null} at
 *
 * @typedef {Object} Capability
 * @property {string}  key
 * @property {Tier[]}  tiers
 *
 * @typedef {Object} FeatureFlag
 * @property {string}  key
 * @property {boolean} defaultOn
 * @property {boolean} [killSwitch]
 *
 * @typedef {Object} VersionContract
 * @property {string}   capability
 * @property {string}   outputVersion
 * @property {string[]} supports
 * @property {string[]} [deprecates]
 *
 * @typedef {Object} ShareRule
 * @property {string}      namespace
 * @property {string}      schema
 * @property {string}      retention
 * @property {ProductId[]} readableBy
 *
 * @typedef {Object} ApprovalRule
 * @property {string}   action
 * @property {Severity} risk
 *
 * @typedef {Object} PluginRegistration
 * @property {string}  slot
 * @property {string}  engine
 * @property {string}  version
 * @property {Tier[]}  tiers
 * @property {string}  [flag]
 *
 * @typedef {Object} ProductManifest
 * @property {ProductId}            productId
 * @property {Tier[]}               tiers
 * @property {Capability[]}         capabilities
 * @property {string[]}             namespaces
 * @property {ShareRule[]}          shares
 * @property {FeatureFlag[]}        flags
 * @property {ApprovalRule[]}       approvals
 * @property {PluginRegistration[]} plugins
 * @property {VersionContract[]}    versions
 * @property {string}               globalKillFlag
 */

export {}   // JSDoc-only module — no runtime exports.
