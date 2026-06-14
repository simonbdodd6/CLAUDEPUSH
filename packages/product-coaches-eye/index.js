/**
 * @brain/product-coaches-eye (M31.3)
 *
 * Coach's Eye product façade — the stable surface a host imports to reach the AI
 * Brain. DORMANT in M31.3: consumes only the platform packages, performs no
 * engine call, and is imported by nobody (Core included).
 */

export {
  PRODUCT_ID,
  gateCapability,
  getCapabilities,
  getManifest,
  request,
} from './facade.js'
