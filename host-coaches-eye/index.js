/**
 * Coach's Eye Intelligence — host adapter (M31.5)
 *
 * Composition root: builds the façade's runtime port from the existing AI Brain.
 * DORMANT — imported by nobody yet (Core included). Not a platform package; it
 * deliberately lives outside packages/@brain/* because it bridges façade + engine.
 */

export {
  createCoachesEyeRuntime,
  invokeCoachesEye,
  ADAPTER_WIRED_CAPABILITIES,
} from './adapter.js'
