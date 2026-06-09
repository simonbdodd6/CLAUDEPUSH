// Coach's Eye Platform Integration Layer — Public API
//
// The AI Copilot is the single entry point.
// The platform connects every engine without duplication.
//
// Usage:
//   import { ask, platform } from './platform/index.js';
//
//   // Single-call interface — platform decides which engines run
//   const result = await ask("Prepare Thursday's U14 training.");
//   console.log(result.unified.summary);
//   console.log(result.data);           // merged data from all engines
//
//   // Direct pipeline execution
//   const result = await platform.executePipeline('health_report', { role: 'coach' });
//
//   // Engine health
//   const health = await platform.health.checkAll();

import { boot } from './platform-registry.js';

// Ensure engines are registered on first import
boot();

// Core entry point — NL text → unified response
export { execute as ask, executePipeline, detectPipeline, PIPELINES } from './platform-orchestrator.js';

// Registry
export {
  registerEngine, boot, listEngines, getEngine, getEngineOrNull,
  hasEngine, getCapable, getDependencies, getDependents, topoSort,
  registryStats, updateStatus,
} from './platform-registry.js';

// Contracts
export {
  createRequest, validateRequest, createResponse, createErrorResponse,
  mergeResponses, fromToolResult, validateResponse, PLATFORM_INTENTS,
} from './platform-contracts.js';

// Entities
export { SCHEMAS, ENTITY_VERSION, listEntities, validatePlayer, validateTeam, validateCommunication } from './platform-entities.js';

// Events
export {
  EVENT_TYPES, on, once, off, emit, events,
  getRecentEvents, getEventsByType, getEventsBySource, eventStats,
} from './platform-events.js';

// Errors
export {
  ERROR_CODES, PlatformError, EngineNotFoundError, EngineUnavailableError,
  EngineTimeoutError, InvalidRequestError, DependencyFailedError,
  PipelineFailedError, normalise, errorResponse,
} from './platform-errors.js';

// Health
export { checkAll as checkHealth, checkEngine, formatHealth, STATUS as HEALTH_STATUS } from './platform-health.js';

// Map
export {
  buildDependencyGraph, buildLayers, renderAsciiMap,
  buildDependencyReport, formatDependencyReport,
} from './platform-map.js';

// Diagnostics
export { runDiagnostics, formatDiagnostics } from './platform-diagnostics.js';

// ── Convenience namespace ─────────────────────────────────────────────────────

export const platform = {
  ask:             async (text, ctx) => { const { execute } = await import('./platform-orchestrator.js'); return execute(text, ctx); },
  pipeline:        async (key, ctx) =>  { const { executePipeline } = await import('./platform-orchestrator.js'); return executePipeline(key, ctx); },
  health:          { checkAll: async (o) => { const { checkAll } = await import('./platform-health.js'); return checkAll(o); } },
  diagnostics:     async (o) =>         { const { runDiagnostics } = await import('./platform-diagnostics.js'); return runDiagnostics(o); },
  map:             async () =>          { const { renderAsciiMap } = await import('./platform-map.js'); return renderAsciiMap(); },
  engines:         listEngines,
};
