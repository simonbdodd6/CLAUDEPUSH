/**
 * @brain/products (M31.0)
 *
 * Product registry: declarative manifests + pure resolution helpers. Depends
 * only on @brain/contracts. Dormant in M31.0 — no engine or Core imports it.
 */

export { COACHES_EYE_MANIFEST } from './coaches-eye.manifest.js'
export {
  getManifest, listProducts, getCapability, tierIncludes,
  resolveCapability, listFlags, listNamespaces,
} from './registry.js'
