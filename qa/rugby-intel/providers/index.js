/**
 * Provider registry for the Rugby Intelligence Agent.
 *
 * To add a new provider:
 *   1. Create qa/rugby-intel/providers/your-provider.js (export provide() + meta)
 *   2. Import and register it below.
 *   3. No changes to ingest.js or any core module required.
 *
 * Future providers to add here:
 *   - world-rugby-provider    (World Rugby news feed — when live fetch allowed)
 *   - podcast-provider        (Whistle podcast transcripts)
 *   - youtube-provider        (YouTube transcript exports)
 *   - club-article-provider   (Club website news sections)
 *   - match-report-provider   (CSV/JSON match data from sports platforms)
 */

import * as manualProvider from './manual-provider.js';
import * as articleProvider from './article-provider.js';
import * as lawUpdateProvider from './law-update-provider.js';
import * as drillProvider from './drill-provider.js';

const REGISTRY = new Map([
  ['manual', manualProvider],
  ['article', articleProvider],
  ['law-update', lawUpdateProvider],
  ['drill', drillProvider],
]);

export function getProvider(name) {
  const p = REGISTRY.get(name);
  if (!p) throw new Error(`Unknown provider: "${name}". Available: ${[...REGISTRY.keys()].join(', ')}`);
  return p;
}

export function listProviders() {
  return [...REGISTRY.entries()].map(([key, p]) => ({ key, ...p.meta }));
}

export const DEFAULT_PROVIDERS = ['manual', 'article', 'law-update', 'drill'];
