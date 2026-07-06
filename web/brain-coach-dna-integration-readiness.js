/**
 * web/brain-coach-dna-integration-readiness.js - Coach DNA Integration Readiness (M284, DORMANT)
 *
 * The first integration-readiness layer: a deterministic report answering whether the completed Brain pipeline
 * (M230 view → core/selection/training chains → M283 cross-domain summary) COULD be fed by the current Coach's
 * Eye Core data. It declares the pipeline's fixed data requirements and checks a SUPPLIED availability/mapping
 * declaration against them: which required inputs are available, missing, partial or unknown, which still need
 * field mapping, what blocks a real-data dry run, and a rule-based readiness score and state.
 *
 * It is critically NOT an integration: it performs NO production wiring, activates NOTHING at runtime, reads NO
 * Core files, queries NO database and inspects NO production data. Its ONLY input is the availability object the
 * caller supplies — a declaration about Core data, never the data itself. Fields not declared stay 'unknown';
 * nothing is ever assumed available or invented. It makes NO recommendation and gives NO advice — it reports
 * requirement status only.
 *
 * Pure function. It imports nothing, mutates no input, performs no writes, calls no AI/LLM, and uses no
 * DOM/network/storage/env/database/clock/randomness. Same input → same report, byte for byte.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`
}

// FNV-1a 32-bit — the same fingerprint convention used across the Coach DNA pipeline, for consistency.
function fingerprint(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`
}

// ---- The Brain pipeline's fixed data requirements (fixed order — never ranked) ----
// criticality: 'critical' inputs gate the dry run entirely; 'important' inputs degrade it to partial;
// 'optional' inputs only affect the score and warnings.
const REQUIRED_INPUTS = Object.freeze([
  { key: 'coachIdentity', category: 'coach-identity', criticality: 'critical', description: 'stable coach identifier and profile record', consumedBy: 'M230 view assembly' },
  { key: 'coachProfileVersion', category: 'coach-identity', criticality: 'optional', description: 'version label of the coach DNA profile', consumedBy: 'M230 view (profileVersion)' },
  { key: 'coachMemoryRecords', category: 'coach-memory', criticality: 'critical', description: 'persisted coach memory records with type and content', consumedBy: 'M230 view (knowledge, themes)' },
  { key: 'memoryTypeTaxonomy', category: 'coach-memory', criticality: 'important', description: 'memory type/category taxonomy used to bucket records', consumedBy: 'M230 view (themes[].type, dominantSignals[].category)' },
  { key: 'selectionPreferenceSignals', category: 'selection-evidence', criticality: 'critical', description: 'memories categorised as selection preferences', consumedBy: 'M261-M268 selection chain' },
  { key: 'playerManagementSignals', category: 'selection-evidence', criticality: 'important', description: 'memories categorised as player management', consumedBy: 'selection trust lens + training development lens' },
  { key: 'trainingPreferenceSignals', category: 'training-evidence', criticality: 'critical', description: 'memories categorised as training preferences', consumedBy: 'M269-M276 training chain' },
  { key: 'tacticalPreferenceSignals', category: 'training-evidence', criticality: 'important', description: 'memories categorised as tactical preferences', consumedBy: 'training tactical lens' },
  { key: 'communicationStyleSignals', category: 'training-evidence', criticality: 'important', description: 'memories categorised as communication style', consumedBy: 'training feedback lens' },
  { key: 'learnedPatternSignals', category: 'training-evidence', criticality: 'important', description: 'memories categorised as learned patterns', consumedBy: 'training planning lens' },
  { key: 'memoryConfidenceScores', category: 'confidence-evidence', criticality: 'critical', description: 'per-memory confidence values', consumedBy: 'confidence summaries across all chains' },
  { key: 'evidenceCounts', category: 'confidence-evidence', criticality: 'important', description: 'supporting evidence counts per memory or signal', consumedBy: 'evidence assessments (M267, M275)' },
  { key: 'ontologyLinks', category: 'confidence-evidence', criticality: 'optional', description: 'ontology link counts between memories', consumedBy: 'M230 view (knowledge.totalOntologyLinks)' },
  { key: 'memorySourceIdentifiers', category: 'provenance', criticality: 'critical', description: 'stable ids linking memories to their source records', consumedBy: 'provenance chains (every layer)' },
  { key: 'memoryTimestamps', category: 'provenance', criticality: 'optional', description: 'creation/update timestamps on memory records', consumedBy: 'future recency handling (not yet consumed)' },
])
const REQUIRED_KEYS = Object.freeze(REQUIRED_INPUTS.map((r) => r.key))

// ---- Documented deterministic scoring/state rules (recorded in derivationMetadata.rules) ----
const CRITICALITY_WEIGHT = Object.freeze({ critical: 3, important: 2, optional: 1 })
const AVAILABILITY_SCORE = Object.freeze({ available: 1, partial: 0.5, missing: 0, unknown: 0 })
const MAPPING_MULTIPLIER = Object.freeze({ mapped: 1, unknown: 0.75, unmapped: 0.5 })

// Normalise one supplied field declaration. Absent → unknown; nothing is ever assumed.
function normaliseField(declared) {
  if (declared === true) return { availability: 'available', mapping: 'unknown', path: null }
  if (declared === false) return { availability: 'missing', mapping: 'unknown', path: null }
  if (!isObj(declared)) return { availability: 'unknown', mapping: 'unknown', path: null }
  const availability = declared.available === true ? 'available'
    : declared.available === false ? 'missing'
    : declared.available === 'partial' ? 'partial'
    : 'unknown'
  const mapping = declared.mapped === true ? 'mapped' : declared.mapped === false ? 'unmapped' : 'unknown'
  return { availability, mapping, path: strOrNull(declared.path) }
}

/**
 * Build the deterministic Coach DNA integration readiness report from a supplied availability declaration.
 *
 * @param {object} declaration { source?: string, fields?: { [requiredKey]: boolean | { available, mapped, path? } } }
 * @returns {object} frozen readiness report.
 */
export function buildCoachDnaIntegrationReadiness(declaration) {
  const inputOk = isObj(declaration) && isObj(declaration.fields)
  const declaredFields = inputOk ? declaration.fields : {}

  // Per-required-input status, in fixed registry order.
  const statusByKey = {}
  for (const req of REQUIRED_INPUTS) {
    const field = normaliseField(Object.prototype.hasOwnProperty.call(declaredFields, req.key) ? declaredFields[req.key] : undefined)
    statusByKey[req.key] = { ...req, ...field }
  }
  const entries = REQUIRED_KEYS.map((k) => statusByKey[k])

  const availableInputs = entries.filter((e) => e.availability === 'available').map((e) => e.key)
  const missingInputs = entries.filter((e) => e.availability === 'missing').map((e) => e.key)
  const partialInputs = entries.filter((e) => e.availability === 'partial').map((e) => e.key)
  const unknownInputs = entries.filter((e) => e.availability === 'unknown').map((e) => e.key)

  const mappingStatus = {
    mapped: entries.filter((e) => e.mapping === 'mapped').map((e) => e.key),
    needsMapping: entries.filter((e) => e.mapping === 'unmapped' && e.availability !== 'missing').map((e) => e.key),
    unknown: entries.filter((e) => e.mapping === 'unknown').map((e) => e.key),
  }

  // blockers: critical inputs that gate the dry run. warnings: everything else that degrades it.
  const blockers = []
  const warnings = []
  for (const e of entries) {
    const id = { key: e.key, category: e.category, criticality: e.criticality }
    if (e.criticality === 'critical') {
      if (e.availability === 'missing') blockers.push({ ...id, reason: 'critical input declared missing from Core data' })
      else if (e.mapping === 'unmapped') blockers.push({ ...id, reason: 'critical input present but declared unmapped to the M230 view' })
      else if (e.availability === 'partial') warnings.push({ ...id, reason: 'critical input only partially available' })
      else if (e.availability === 'unknown') warnings.push({ ...id, reason: 'critical input availability not declared' })
      else if (e.mapping === 'unknown') warnings.push({ ...id, reason: 'critical input mapping not declared' })
    } else if (e.criticality === 'important') {
      if (e.availability !== 'available' || e.mapping !== 'mapped') warnings.push({ ...id, reason: `important input ${e.availability === 'available' ? 'not yet mapped' : e.availability}` })
    } else if (e.availability === 'missing' || e.availability === 'partial') {
      warnings.push({ ...id, reason: `optional input ${e.availability}` })
    }
  }

  // readinessScore: Σ(weight × availabilityScore × mappingMultiplier) / Σ(weight), rounded to 4 dp.
  let weighted = 0
  let totalWeight = 0
  for (const e of entries) {
    const w = CRITICALITY_WEIGHT[e.criticality]
    totalWeight += w
    weighted += w * AVAILABILITY_SCORE[e.availability] * MAPPING_MULTIPLIER[e.mapping]
  }
  const readinessScore = Math.round((totalWeight ? weighted / totalWeight : 0) * 10000) / 10000

  // readinessState: documented rule — malformed/undeclared → unknown; any critical blocker → blocked;
  // every critical AND important available+mapped → ready; otherwise partial.
  const criticalOrImportant = entries.filter((e) => e.criticality !== 'optional')
  let readinessState
  if (!inputOk || entries.every((e) => e.availability === 'unknown')) readinessState = 'unknown'
  else if (blockers.length > 0) readinessState = 'blocked'
  else if (criticalOrImportant.every((e) => e.availability === 'available' && e.mapping === 'mapped')) readinessState = 'ready'
  else readinessState = 'partial'

  const dryRunReady = readinessState === 'ready'

  // Fields declared by the caller that the Brain does not require — reported, never silently dropped.
  const unrecognizedFields = inputOk ? Object.keys(declaredFields).filter((k) => !REQUIRED_KEYS.includes(k)).sort() : []

  const provenance = {
    describedBy: 'supplied-availability-declaration',
    declarationSource: inputOk ? strOrNull(declaration.source) : null,
    assessedForPipeline: ['M230', 'M256', 'M268', 'M276', 'M283'],
    requirementRegistryVersion: 1,
    declaredFieldCount: inputOk ? Object.keys(declaredFields).length : 0,
  }

  const issues = []
  if (!inputOk) issues.push('availability declaration missing or malformed')
  const validationState = {
    declarationRecognized: inputOk,
    requiredInputCount: REQUIRED_INPUTS.length,
    declaredRequiredInputs: REQUIRED_KEYS.filter((k) => inputOk && Object.prototype.hasOwnProperty.call(declaredFields, k)).length,
    unrecognizedFields,
    issues,
  }

  const derivationMetadata = {
    milestone: 'M284',
    domain: 'integration',
    layer: 'integration-readiness',
    derivedFrom: 'supplied-availability-declaration',
    deterministic: true,
    ruleBased: true,
    llmGenerated: false,
    readOnly: true,
    dormant: true,
    productionWiring: false,
    runtimeActivation: false,
    readsCoreFiles: false,
    queriesDatabases: false,
    inspectsProductionData: false,
    coachAdvice: false,
    createsRecommendations: false,
    containsPlayerData: false,
    playerEvaluation: false,
    playerSelection: false,
    playerRanking: false,
    playerScoring: false,
    teamRecommendation: false,
    trainingRecommendation: false,
    generatesTrainingContent: false,
    analysesSessions: false,
    rules: {
      criticalityWeight: CRITICALITY_WEIGHT,
      availabilityScore: AVAILABILITY_SCORE,
      mappingMultiplier: MAPPING_MULTIPLIER,
      state: 'malformed/undeclared→unknown; any critical missing or critical unmapped→blocked; all critical+important available and mapped→ready; else partial',
    },
  }

  const draft = {
    type: 'coach-dna-integration-readiness',
    schemaVersion: 1,
    readinessVersion: 1,
    milestone: 'M284',
    requiredInputs: REQUIRED_INPUTS.map((r) => ({ ...r })),
    availableInputs,
    missingInputs,
    partialInputs,
    unknownInputs,
    mappingStatus,
    inputStatus: entries.map((e) => ({ key: e.key, category: e.category, criticality: e.criticality, availability: e.availability, mapping: e.mapping, path: e.path })),
    readinessState,
    readinessScore,
    dryRunReady,
    blockers,
    warnings,
    provenance,
    validationState,
    derivationMetadata,
  }

  // A self-fingerprint over every field except the fingerprint itself — an auditable id for this report.
  draft.readinessFingerprint = fingerprint(canonicalStringify(draft))
  return deepFreeze(draft)
}

/**
 * Render a compact, deterministic, timestamp-free summary of the readiness report for logs or PR notes.
 * @param {object} declaration a supplied availability declaration
 * @returns {string}
 */
export function summarizeCoachDnaIntegrationReadiness(declaration) {
  const r = buildCoachDnaIntegrationReadiness(declaration)
  return [
    `Coach DNA integration readiness: ${r.readinessState}`,
    `Available: ${r.availableInputs.length}/${r.requiredInputs.length} · Missing: ${r.missingInputs.length} · Partial: ${r.partialInputs.length} · Unknown: ${r.unknownInputs.length}`,
    `Needs mapping: ${r.mappingStatus.needsMapping.length} · Blockers: ${r.blockers.length} · Warnings: ${r.warnings.length}`,
    `Score: ${r.readinessScore} · Dry-run ready: ${r.dryRunReady}`,
    `Fingerprint: ${r.readinessFingerprint}`,
  ].join('\n')
}

/**
 * Serialize the readiness report deterministically.
 * @param {object} declaration a supplied availability declaration
 * @param {{ format?: 'json' | 'line' }} [serializeOptions]
 * @returns {string}
 */
export function serializeCoachDnaIntegrationReadiness(declaration, serializeOptions = {}) {
  const format = isObj(serializeOptions) && serializeOptions.format ? serializeOptions.format : 'json'
  const r = buildCoachDnaIntegrationReadiness(declaration)
  if (format === 'json') return canonicalStringify(r)
  if (format === 'line') {
    return `coach-dna-integration-readiness state=${r.readinessState} score=${r.readinessScore} `
      + `available=${r.availableInputs.length}/${r.requiredInputs.length} blockers=${r.blockers.length} `
      + `dryRunReady=${r.dryRunReady} fp=${r.readinessFingerprint}`
  }
  throw new TypeError(`unsupported Coach DNA integration readiness format '${format}'`)
}
