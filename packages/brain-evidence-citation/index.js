/**
 * @brain/evidence-citation (M48)
 *
 * The dormant deterministic citation-validation layer for the AI Brain — the M42
 * §4a citation gate that guarantees a recommendation's evidence traces back to
 * real, same-tenant, non-duplicate records.
 *
 * Pure + deterministic: no side effects, no storage of its own, no network, no
 * files, no clock, no randomness; reads only through an INJECTED
 * @brain/evidence-store; all results immutable; caller input never mutated. No
 * recommendation generation, reasoning or prediction — validation only. Depends
 * only on @brain/evidence-store. Imported by nobody yet (dormant).
 */

export {
  validateEvidenceCitation,
  validateEvidenceSet,
  resolveCitationChain,
  citationCoverage,
  missingEvidence,
  duplicateEvidence,
} from './citation.js'
export { CitationError, CITATION_ERROR } from './errors.js'
