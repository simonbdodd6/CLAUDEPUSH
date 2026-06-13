// Executive Knowledge Graph — service factory.

import { ExecutiveKnowledgeGraph } from './graph.js';

/**
 * Create an Executive Knowledge Graph.
 * @param {object} [opts]
 * @param {Function} [opts.clock]  () => ISO string. Inject for deterministic builds.
 * @param {object}   [opts.sink]   optional append-only journal { append(record) }
 *                                 (e.g. the PIF-2 ledger) for durable change history.
 * @returns {ExecutiveKnowledgeGraph}
 */
export function createExecutiveKnowledgeGraph(opts = {}) {
  return new ExecutiveKnowledgeGraph(opts);
}
