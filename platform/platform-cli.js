#!/usr/bin/env node
// Coach's Eye Platform Integration Layer — CLI
// npm run platform:integration

import { writeFileSync } from 'fs';
import { dirname, join }  from 'path';
import { fileURLToPath }  from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║    COACH\'S EYE — AI PLATFORM INTEGRATION LAYER              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ── Imports ────────────────────────────────────────────────────────────────────

const { boot, listEngines, registryStats }     = await import('./platform-registry.js');
const { renderAsciiMap, buildDependencyReport, formatDependencyReport, buildLayers } = await import('./platform-map.js');
const { checkAll, formatHealth }               = await import('./platform-health.js');
const { runDiagnostics, formatDiagnostics }    = await import('./platform-diagnostics.js');
const { execute, detectPipeline, PIPELINES }   = await import('./platform-orchestrator.js');
const { listEntities }                         = await import('./platform-entities.js');
const { eventStats, getRecentEvents }          = await import('./platform-events.js');
const { EVENT_TYPES }                          = await import('./platform-events.js');

function hr(title = '') {
  const PAD = 64;
  const line = '─'.repeat(PAD);
  if (!title) { console.log('\n' + line); return; }
  const p = Math.max(0, Math.floor((PAD - title.length - 2) / 2));
  console.log('\n' + '─'.repeat(p) + ' ' + title + ' ' + '─'.repeat(Math.max(0, PAD - p - title.length - 2)));
}

// ── 1. Boot Registry ───────────────────────────────────────────────────────────

hr('1. ENGINE REGISTRY');
boot();
const regStats = registryStats();
console.log(`Registered engines: ${regStats.totalEngines}`);
console.log(`Total capabilities: ${regStats.totalCapabilities}\n`);

const engines = listEngines();
engines.forEach(e => {
  console.log(`  ${e.id.padEnd(24)} v${e.version} · ${e.capabilities.length} capabilities · deps:[${e.dependencies.join(', ') || 'none'}]`);
});

// ── 2. Engine Map ──────────────────────────────────────────────────────────────

hr('2. ENGINE DEPENDENCY MAP');
console.log(renderAsciiMap());

const depReport = buildDependencyReport();
console.log(formatDependencyReport(depReport));

// ── 3. Health Check ────────────────────────────────────────────────────────────

hr('3. ENGINE HEALTH CHECK');
console.log('Running health checks on all engines...\n');
const healthReport = await checkAll({ parallel: true });
console.log(formatHealth(healthReport));

// ── 4. Entity Models ───────────────────────────────────────────────────────────

hr('4. SHARED ENTITY MODELS');
const entities = listEntities();
console.log(`${entities.length} canonical entity types:\n`);
entities.forEach(e => console.log(`  ${e.name.padEnd(20)} ${e.fields} fields  (v${e.version})`));

// ── 5. Event Bus ───────────────────────────────────────────────────────────────

hr('5. EVENT BUS');
console.log(`Event types defined: ${Object.keys(EVENT_TYPES).length}`);
const evtCategories = {};
Object.keys(EVENT_TYPES).forEach(k => {
  const cat = k.split('_')[0].toLowerCase();
  evtCategories[cat] = (evtCategories[cat] ?? 0) + 1;
});
Object.entries(evtCategories).forEach(([cat, n]) => console.log(`  ${cat.padEnd(14)} ${n} event types`));

// ── 6. Platform Orchestrator — Pipeline Detection ──────────────────────────────

hr('6. PIPELINE DETECTION');
const testInputs = [
  "Prepare Thursday's U14 training.",
  "Summarise club health.",
  "Show all injured props.",
  "Who has missed the most training?",
  "Build this week's communications pack.",
  "How is the club performing overall?",
  "What should I focus on today?",
];

console.log('Detecting pipeline for sample queries:\n');
testInputs.forEach(text => {
  const { key, template } = detectPipeline(text);
  const phaseList = template.phases.map(p => `[${p.engines.join('+')}]`).join(' → ');
  console.log(`  "${text.slice(0, 50)}"`);
  console.log(`   → Pipeline: ${key} | ${phaseList}\n`);
});

// ── 7. Orchestrator — Live Execution ──────────────────────────────────────────

hr('7. ORCHESTRATOR — LIVE EXECUTION');
console.log('Testing multi-engine pipeline execution:\n');

const ORCHESTRATOR_TESTS = [
  { label: "\"Prepare Thursday's U14 training.\"",  text: "Prepare Thursday's U14 training.", context: { entities: { ageGroup: 'U14' } } },
  { label: "\"Summarise club health.\"",              text: "Summarise club health.", context: {} },
  { label: "\"Show all injured props.\"",             text: "Show all injured props.", context: {} },
];

const orchResults = [];
for (const test of ORCHESTRATOR_TESTS) {
  console.log(`Query: ${test.label}`);
  const start = Date.now();
  const result = await execute(test.text, { role: 'coach', ...test.context });
  const ms     = Date.now() - start;

  console.log(`  Pipeline: ${result.pipelineKey ?? 'general'} (${ms}ms)`);
  console.log(`  Engines:  ${result.unified?.engines?.join(', ') ?? 'none'}`);
  console.log(`  Success:  ${result.unified?.succeeded ?? 0}/${result.unified?.engines?.length ?? 0} engines`);
  console.log(`  Summary:  ${(result.unified?.summary ?? 'no summary').slice(0, 100)}\n`);

  orchResults.push({ ...test, result, durationMs: ms });
}

// ── 8. Full Diagnostics ────────────────────────────────────────────────────────

hr('8. FULL PLATFORM DIAGNOSTICS');
console.log('Running comprehensive diagnostics (includes pipeline smoke tests)...\n');
const diag = await runDiagnostics({ runPipelineTest: true });
console.log(formatDiagnostics(diag));

// ── 9. Event Log ──────────────────────────────────────────────────────────────

hr('9. PLATFORM EVENT LOG');
const recentEvents = getRecentEvents(12);
console.log(`Recent platform events (${recentEvents.length}):\n`);
recentEvents.forEach(e => {
  const ts = new Date(e.emittedAt).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`  \`${ts}\` [${e.source}] ${e.type}`);
});

// ── 10. Generate PLATFORM_ARCHITECTURE_REPORT.md ──────────────────────────────

hr('10. GENERATING PLATFORM_ARCHITECTURE_REPORT.md');

const REPORT_PATH = join(__dirname, '..', 'PLATFORM_ARCHITECTURE_REPORT.md');
const report = buildArchitectureReport(engines, depReport, healthReport, diag, orchResults);
writeFileSync(REPORT_PATH, report, 'utf8');
console.log(`Report written to: PLATFORM_ARCHITECTURE_REPORT.md`);

hr();
console.log('\nCoach\'s Eye Platform Integration Layer — online.\n');
console.log('Run "npm run platform:integration" to regenerate.\n');

// ── Report builder ─────────────────────────────────────────────────────────────

function buildArchitectureReport(engines, depReport, healthReport, diag, orchResults) {
  const generated = new Date().toISOString();
  const healthTable = healthReport.engines.map(e =>
    `| **${e.name}** | ${e.status === 'healthy' ? '✅' : '❌'} ${e.status} | ${e.durationMs}ms | ${e.error ?? JSON.stringify(e.details ?? {}).slice(0, 50)} |`
  ).join('\n');

  const engineTable = engines.map(e =>
    `| **${e.name}** | \`${e.id}\` | ${e.capabilities.length} | ${e.dependencies.join(', ') || '—'} |`
  ).join('\n');

  const orchTable = orchResults.map(r => {
    const res = r.result;
    const ok  = res?.unified?.succeeded > 0 ? '✅' : '❌';
    return `| "${r.text}" | ${res?.pipelineKey ?? '—'} | ${res?.unified?.engines?.join(', ') ?? '—'} | ${r.durationMs}ms | ${ok} |`;
  }).join('\n');

  const evtTypeList = Object.entries(EVENT_TYPES)
    .map(([k, v]) => `\`${v}\``)
    .join(', ');

  const entityList = listEntities().map(e => `| **${e.name}** | ${e.fields} | ${e.version} |`).join('\n');

  return `# Coach's Eye — AI Platform Integration Layer
## Architecture Report

**Generated:** ${generated}

---

## Overview

The Platform Integration Layer connects every Coach's Eye engine into one intelligent platform.
The **AI Copilot is the single entry point** — it accepts any natural language request, detects
the required pipeline, executes engines in dependency order, and returns one unified response.

---

## System Architecture

${renderAsciiMap()}

---

## Platform Components

\`\`\`
platform/
├── index.js                   ← Public API: ask(), checkHealth(), runDiagnostics()
├── platform-registry.js       ← Engine catalogue: 10 engines, capabilities, dependencies
├── platform-contracts.js      ← Standard PlatformRequest / PlatformResponse shapes
├── platform-entities.js       ← Canonical entity models (Player, Team, Injury, etc.)
├── platform-events.js         ← Event bus: ${Object.keys(EVENT_TYPES).length} event types, pub/sub, JSONL audit log
├── platform-errors.js         ← Standard error types with codes and JSON serialisation
├── platform-health.js         ← Parallel health checks on all ${engines.length} engines
├── platform-orchestrator.js   ← Multi-engine pipeline execution (phases, parallel, deps)
├── platform-map.js            ← Dependency graph, topological sort, ASCII renderer
└── platform-diagnostics.js    ← Full system check: health + deps + caps + smoke tests
\`\`\`

---

## Registered Engines

| Engine | ID | Capabilities | Dependencies |
|---|---|---|---|
${engineTable}

---

## Dependency Layers

${formatDependencyReport(depReport)}

---

## Engine Health (latest run)

| Engine | Status | Time | Details |
|---|---|---|---|
${healthTable}

**Platform status: ${healthReport.status.toUpperCase()}**

---

## Orchestration Pipelines

The orchestrator maps natural language → pipeline → parallel engine phases → unified response.

### Available Pipelines

${Object.entries(PIPELINES).map(([key, tmpl]) => `#### \`${key}\` — ${tmpl.name}
${tmpl.phases.map(p => `- **Phase: ${p.id}** → engines: [${p.engines.join(', ')}] (${p.parallel ? 'parallel' : 'sequential'}${p.optional ? ', optional' : ''})`).join('\n')}
`).join('\n')}

### Orchestrator Test Results

| Query | Pipeline | Engines Used | Time | Result |
|---|---|---|---|---|
${orchTable}

### Example: "Prepare Thursday's U14 training."

\`\`\`
1. detectPipeline() → training_prepare
2. Phase 1 [PARALLEL]: memory-engine + knowledge-engine
   - Memory: get U14 squad, recent sessions
   - Knowledge: check U14 injuries, recent results
3. Phase 2 [SEQUENTIAL]: ai-copilot
   - Build training session using squad + injury context
4. Phase 3 [OPTIONAL]: communications-engine
   - Draft training reminder for squad
5. mergeResponses() → unified PlatformResponse
   - data.memory-engine: { players, teams }
   - data.knowledge-engine: { injuries, answer }
   - data.ai-copilot: { session, drills, focus }
   - data.communications-engine: { reminderDraft }
   - unified.summary: "Session for U14..."
\`\`\`

---

## Standard Contracts

### PlatformRequest
\`\`\`json
{
  "requestId":   "req-1234567890-1",
  "intent":      "training_prepare",
  "payload":     { "text": "Prepare Thursday's U14 training." },
  "context":     { "entities": { "ageGroup": "U14" } },
  "role":        "coach",
  "requestedAt": "2026-06-09T14:00:00.000Z",
  "source":      "platform"
}
\`\`\`

### PlatformResponse
\`\`\`json
{
  "requestId":   "req-1234567890-1",
  "success":     true,
  "data":        { "memory-engine": { ... }, "ai-copilot": { ... } },
  "error":       null,
  "meta": {
    "engine":    "platform",
    "durationMs": 420,
    "confidence": 85,
    "isMock":    false,
    "citations": [ { "engine": "memory-engine", "fact": "14 players in U14 squad" } ]
  }
}
\`\`\`

---

## Shared Entity Models

| Entity | Fields | Version |
|---|---|---|
${entityList}

---

## Event Bus

${Object.keys(EVENT_TYPES).length} standard event types across ${Object.keys(evtTypeList.split('`').filter(s => s.includes('.'))).length} domains.

${evtTypeList}

All events are:
- Emitted synchronously (non-blocking handlers)
- Logged to \`memory-engine/data/platform-events.jsonl\`
- Available via \`getRecentEvents()\`, \`getEventsByType()\`, \`getEventsBySource()\`

---

## Error Handling

| Error Type | Code | When |
|---|---|---|
| \`EngineNotFoundError\` | \`ENGINE_NOT_FOUND\` | Engine ID not in registry |
| \`EngineUnavailableError\` | \`ENGINE_UNAVAILABLE\` | Module import failed |
| \`EngineTimeoutError\` | \`ENGINE_TIMEOUT\` | Health check / execution timed out |
| \`InvalidRequestError\` | \`INVALID_REQUEST\` | Request missing required fields |
| \`DependencyFailedError\` | \`ENGINE_DEPENDENCY_FAILED\` | Required dependency engine down |
| \`PipelineFailedError\` | \`PIPELINE_FAILED\` | Pipeline phase could not complete |

---

## Diagnostics

\`\`\`
Platform status:    ${diag.healthy ? 'HEALTHY' : 'DEGRADED'}
Engines:            ${diag.registry.totalEngines} registered
Capabilities:       ${diag.registry.totalCapabilities} total
Coverage:           ${diag.capabilityCoverage.coverage}% (${diag.capabilityCoverage.covered}/${diag.capabilityCoverage.required} required)
Circular deps:      ${diag.depValidation.cycles.length === 0 ? 'None' : diag.depValidation.cycles.join(', ')}
Issues:             ${diag.issues.length} (${diag.issues.filter(i => i.severity === 'error').length} errors)
\`\`\`

---

## npm Script

\`\`\`bash
npm run platform:integration
\`\`\`

---

## Design Principles

1. **Single entry point** — every request enters via \`platform.ask(text)\`; the orchestrator decides which engines run.
2. **No logic duplication** — platform layer never reimplements engine logic; it only routes, coordinates, and merges.
3. **Dependency-aware execution** — engines run in topological order; parallel where possible.
4. **Contract-first** — every engine I/O is a \`PlatformRequest\` / \`PlatformResponse\`; adapters normalise engine-native shapes.
5. **Observable** — every engine call, event, query, and approval is logged to JSONL.
6. **Graceful degradation** — optional engine failures don't fail required pipelines.
7. **Zero coupling** — engines communicate via the event bus; no engine imports another directly.

---

*Report generated by Coach's Eye Platform Integration Layer v1.0.0*
`;
}
