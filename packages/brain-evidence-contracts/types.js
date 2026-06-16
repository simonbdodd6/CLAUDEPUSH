/**
 * @brain/evidence-contracts — Type surface (M43)
 *
 * JSDoc typedefs for the evidence-ingestion shapes from the approved M42
 * architecture. DOCUMENTATION ONLY — no runtime values are exported here (the
 * value sets live in enums.js / weights.js). Pure, dormant, no logic.
 *
 * @typedef {import('./enums.js')} EvidenceEnums
 */

/**
 * Strict tenant scope. Every read/write is keyed by this (§4.6).
 * @typedef {Object} Tenant
 * @property {string}      clubId
 * @property {string|null} teamId    null = club-wide
 * @property {string|null} seasonId
 */

/**
 * Who/what produced a record.
 * @typedef {Object} Author
 * @property {'coach'|'provider'|'system'} kind
 * @property {string}      id          coachId | providerId | pipeline id
 * @property {string|null} name
 */

/**
 * Lineage of a record — how it was derived and what it corrects (§2).
 * @typedef {Object} Provenance
 * @property {string[]}    derivedFrom  upstream EvidenceRecord ids
 * @property {string|null} supersedes   prior record this corrects
 * @property {string}      ingestRunId  pipeline run that produced this
 * @property {string}      normalizer   normalizer name + version
 */

/**
 * One append-only state transition (§2 / §3).
 * @typedef {Object} AuditEntry
 * @property {string}      at      ISO timestamp
 * @property {string}      actor   author or pipeline id
 * @property {'received'|'validated'|'normalized'|'deduplicated'|'linked'|'reweighted'|'superseded'|'rejected'|'redacted'} action
 * @property {string|null} note
 */

/**
 * Privacy / sensitivity envelope (§2 / §4.9).
 * @typedef {Object} Sensitivity
 * @property {'public'|'club'|'medical'|'restricted'} level
 * @property {string[]}    piiSubjectIds  persons referenced — drives access/retention
 * @property {string|null} consentRef     consent record id where required
 */

/**
 * A typed, deduped fact derived from an EvidenceRecord's raw payload (§2).
 * @typedef {Object} NormalizedSignal
 * @property {string} key                                canonical signal name (e.g. 'lineout.winRate')
 * @property {number|string|boolean|null} value
 * @property {string|null} unit
 * @property {'strength'|'weakness'|'neutral'|null} polarity
 * @property {number} confidence                         0..1 — may be ≤ record confidence
 * @property {string} evidenceId                         back-reference to the owning record
 */

/**
 * The atomic, append-only, immutable unit of evidence (§2).
 * @typedef {Object} EvidenceRecord
 * @property {string}  id             stable, globally unique, time-ordered
 * @property {string}  schemaVersion  EVIDENCE_CONTRACT_VERSION at write time
 * @property {Tenant}  tenant
 * @property {string}  sourceType     a SOURCE_TYPE value
 * @property {'provider'|'manual'} sourceFamily
 * @property {'player'|'team'|'coach'|'fixture'|'opponent'|'club'|'drill'|'session'} subjectType
 * @property {string}  subjectId      entity key in the knowledge graph
 * @property {number}  confidence     0..1
 * @property {string}  observedAt     ISO — when the thing happened
 * @property {string}  recordedAt     ISO — when it entered the system
 * @property {string|null} validFrom
 * @property {string|null} validTo
 * @property {Author}  author
 * @property {any}     raw            verbatim source payload (immutable)
 * @property {NormalizedSignal[]} signals
 * @property {Provenance} provenance
 * @property {AuditEntry[]} audit
 * @property {Sensitivity} sensitivity
 */

/**
 * The declared confidence-weighting parameters (see weights.js).
 * @typedef {Object} ConfidenceWeightContract
 * @property {string} version
 * @property {{providerVerified:number, manualVerified:number, manualUnverified:number, providerUnverified:number}} sourceTrust
 * @property {{halfLifeDays:number, floor:number}} recency
 * @property {{perIndependentSource:number, cap:number}} corroboration
 * @property {{penalty:number, flag:string}} conflict
 * @property {{saturationK:number}} volume
 */

export {}
