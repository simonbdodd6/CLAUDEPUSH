/**
 * Provider registry.
 *
 * To add a new provider:
 *   1. Create qa/discovery/providers/your-provider.js exporting { provide, meta }
 *   2. Import and register it here.
 *   3. That's it — no changes to the core engine.
 */

import * as csvProvider from './csv-provider.js';
import * as manualProvider from './manual-provider.js';
import * as rugbyDirectoryProvider from './rugby-directory-provider.js';

const REGISTRY = new Map([
  ['csv', csvProvider],
  ['manual', manualProvider],
  ['rugby-directory', rugbyDirectoryProvider],
]);

/**
 * Get a registered provider by name.
 * @param {string} name
 * @returns {{ provide: AsyncGeneratorFunction, meta: object }}
 */
export function getProvider(name) {
  const p = REGISTRY.get(name);
  if (!p) throw new Error(`Unknown provider: "${name}". Registered: ${[...REGISTRY.keys()].join(', ')}`);
  return p;
}

export function listProviders() {
  return [...REGISTRY.entries()].map(([key, p]) => ({ key, ...p.meta }));
}

export const DEFAULT_PROVIDERS = ['csv', 'manual', 'rugby-directory'];
