/**
 * @brain/evidence-gateway — gate manifest comparator / compareGateManifests (M84, DORMANT)
 *
 * A pure deterministic comparator that reports what changed between two M83 provenance
 * manifests. It reads MANIFEST FIELDS ONLY (the digests/summaries already inside them) —
 * it never re-digests source objects, calls createGateManifest, runs gateCI, or reruns any
 * check. Returns a deeply-frozen diff. Reads only: no store, engine, persistence,
 * filesystem, API, network, clock or randomness. Inputs are never mutated.
 */

import { canonicalStringify } from './snapshot.js'

const isObj = (v) => v !== null && typeof v === 'object'
/** Order-insensitive-for-keys structural equality (reuses the M65 canonicaliser). */
const sameJson = (x, y) => canonicalStringify(x) === canonicalStringify(y)

const ARTIFACT_KEYS = Object.freeze(['envelopeDigest', 'outcomeDigest', 'decisionDigest', 'reportDigest'])
const AREA_ORDER = Object.freeze(['inputs', 'policy', 'outcome', 'decision', 'report', 'artifacts'])

/** Minimal shape check for an M83 manifest. */
function assertManifest(m, label) {
  if (!isObj(m) || typeof m.pipelineDigest !== 'string' ||
      !isObj(m.inputs) || !Array.isArray(m.inputs.caseNames) || !Array.isArray(m.inputs.caseDigests) ||
      !isObj(m.policy) || !isObj(m.outcome) || !isObj(m.decision) || !isObj(m.report) || !isObj(m.artifacts)) {
    throw new TypeError(`compareGateManifests requires two M83 gate manifest objects (${label} invalid)`)
  }
}

/** name → caseDigest map from a manifest's parallel caseNames/caseDigests arrays. */
function caseMap(manifest) {
  const map = new Map()
  const { caseNames, caseDigests } = manifest.inputs
  for (let i = 0; i < caseNames.length; i++) map.set(caseNames[i], caseDigests[i])
  return map
}

/**
 * Compare two M83 gate manifests and report the differences.
 *
 * @param {object} a  an M83 manifest (the "before")
 * @param {object} b  an M83 manifest (the "after")
 * @returns {Readonly<{
 *   identical:boolean, pipelineDigestMatch:boolean, changed:ReadonlyArray<string>,
 *   caseChanges:ReadonlyArray<Readonly<{ name:string, status:string, beforeDigest:(string|null), afterDigest:(string|null) }>>,
 *   artifactChanges:ReadonlyArray<Readonly<{ name:string, beforeDigest:string, afterDigest:string }>>,
 *   policyChanged:boolean, outcomeChanged:boolean, decisionChanged:boolean, reportChanged:boolean
 * }>}
 */
export function compareGateManifests(a, b) {
  assertManifest(a, 'a')
  assertManifest(b, 'b')

  const pipelineDigestMatch = a.pipelineDigest === b.pipelineDigest
  const identical = sameJson(a, b)

  // case changes — by name, deterministic (sorted)
  const mapA = caseMap(a)
  const mapB = caseMap(b)
  const names = [...new Set([...mapA.keys(), ...mapB.keys()])].sort()
  const caseChanges = []
  for (const name of names) {
    const hasA = mapA.has(name)
    const hasB = mapB.has(name)
    const beforeDigest = hasA ? mapA.get(name) : null
    const afterDigest = hasB ? mapB.get(name) : null
    if (!hasA) caseChanges.push(Object.freeze({ name, status: 'added', beforeDigest, afterDigest }))
    else if (!hasB) caseChanges.push(Object.freeze({ name, status: 'removed', beforeDigest, afterDigest }))
    else if (beforeDigest !== afterDigest) caseChanges.push(Object.freeze({ name, status: 'changed', beforeDigest, afterDigest }))
  }

  // artifact changes — fixed key order
  const artifactChanges = []
  for (const name of ARTIFACT_KEYS) {
    if (a.artifacts[name] !== b.artifacts[name]) {
      artifactChanges.push(Object.freeze({ name, beforeDigest: a.artifacts[name], afterDigest: b.artifacts[name] }))
    }
  }

  const policyChanged = a.policy.policyAppliedDigest !== b.policy.policyAppliedDigest ||
    !sameJson(a.policy.reasonCodes, b.policy.reasonCodes)

  const outcomeChanged = a.outcome.outcomeDigest !== b.outcome.outcomeDigest ||
    a.outcome.status !== b.outcome.status ||
    a.outcome.statusLine !== b.outcome.statusLine ||
    !sameJson(a.outcome.affectedStages, b.outcome.affectedStages) ||
    a.outcome.totalViolations !== b.outcome.totalViolations ||
    a.outcome.totalTolerated !== b.outcome.totalTolerated

  const decisionChanged = a.decision.decisionDigest !== b.decision.decisionDigest ||
    a.decision.ok !== b.decision.ok ||
    a.decision.exitCode !== b.decision.exitCode ||
    a.decision.line !== b.decision.line

  const reportChanged = a.report.reportDigest !== b.report.reportDigest ||
    a.report.headline !== b.report.headline

  // changed areas — deterministic, fixed order
  const flags = {
    inputs: caseChanges.length > 0,
    policy: policyChanged,
    outcome: outcomeChanged,
    decision: decisionChanged,
    report: reportChanged,
    artifacts: artifactChanges.length > 0,
  }
  const changed = AREA_ORDER.filter((area) => flags[area])

  return Object.freeze({
    identical,
    pipelineDigestMatch,
    changed: Object.freeze(changed),
    caseChanges: Object.freeze(caseChanges),
    artifactChanges: Object.freeze(artifactChanges),
    policyChanged,
    outcomeChanged,
    decisionChanged,
    reportChanged,
  })
}
