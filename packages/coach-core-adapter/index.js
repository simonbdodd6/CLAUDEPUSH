/**
 * @coach-core-adapter (DORMANT) — Core → Brain adapter layer.
 *
 * Bridges real Coach's Eye Core data into the existing M108–M131 selection stack. It contains
 * NO intelligence engines — only pure mappers and dependency-injection interfaces:
 *   - position normalization  (Core position strings → Brain tokens)
 *   - availability mapping     (Core 'available'/'unavailable'/'maybe' → boolean)
 *   - player confidence provider interface (supplies the M120/M121 candidate confidence)
 *   - coach memory adapter interface       (supplies the M110 searchCoachMemory provider)
 *
 * Imported by nobody yet except its tests.
 */

export {
  normalizePosition,
  isKnownPosition,
  BRAIN_FORMATION_POSITIONS,
  COARSE_POSITIONS,
  POSITION_ALIASES,
} from './position-normalization.js'

export {
  mapAvailability,
  mapAvailabilityResponses,
  CORE_AVAILABILITY_RESPONSES,
} from './availability-mapping.js'

export {
  createConfidenceProvider,
  constantConfidenceProvider,
  fieldConfidenceProvider,
} from './player-confidence-provider.js'

export {
  createCoachMemoryAdapter,
  inMemoryCoachMemoryAdapter,
} from './coach-memory-adapter.js'

export {
  assembleCandidate,
  assembleCandidates,
} from './candidate-assembler.js'

export {
  resolveFormationFromCandidates,
  DEFAULT_FORMATION,
  DEFAULT_POSITION_GROUPS,
} from './formation-resolver.js'

export {
  buildSelectionContext,
} from './selection-context-builder.js'

export {
  buildDecisionPlanContext,
} from './decision-plan-builder.js'

export {
  runSelectionDryRun,
} from './selection-dry-run.js'

export {
  runPipelineBridge,
} from './pipeline-bridge.js'

export {
  assembleIntelligenceServices,
} from './intelligence-services-assembler.js'

export {
  completeIntelligenceInput,
} from './intelligence-input-completer.js'

export {
  resolvePositionAssignments,
} from './position-assignment-resolver.js'

export {
  deriveAvailabilityConfidence,
  createBaselineConfidenceProvider,
} from './confidence-source.js'
