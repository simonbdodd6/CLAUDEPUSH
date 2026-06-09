#!/usr/bin/env node
/**
 * Coach's Eye Orchestrator — CLI test
 * Runs 6 scenarios end-to-end and produces ORCHESTRATOR_REPORT.md.
 */

import { writeFileSync }         from 'fs';
import { join, dirname }         from 'path';
import { fileURLToPath }         from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

function hr(c = '─', n = 60) { return c.repeat(n); }

const SCENARIOS = [
  {
    label:   'Full U14 Thursday training workflow (spec example)',
    message: "Prepare Thursday's U14 training, check injured players, create a session, generate PDFs, notify coaches and update the season plan.",
  },
  {
    label:   'Player development + injury review',
    message: "Analyse all players, check injury risk and flag anyone needing a review.",
  },
  {
    label:   'Club-level Director of Rugby overview',
    message: "Give me a full club overview for the Director of Rugby — health score, risks, and priorities.",
  },
  {
    label:   'Rugby knowledge + session plan for scrummaging',
    message: "Build a scrum technique session for the Senior front row.",
    options: { entities: { ageGroup: 'Senior', sessionFocus: 'scrummaging' } },
  },
  {
    label:   'Market intelligence + lead personalisation',
    message: "Research our market, find leads and generate personalised outreach.",
  },
  {
    label:   'Preview-only mode (no execution)',
    message: "Create a match preparation session for the U18s on Friday evening.",
    options: { previewOnly: true },
  },
];

async function main() {
  console.log('\n' + hr('═') + '\n  Coach\'s Eye Orchestrator — CLI Test\n' + hr('═') + '\n');

  const { createConsoleOrchestrator, registryStats, listEngines } = await import('./index.js');

  // ── Registry summary ────────────────────────────────────────────────────────
  const stats   = registryStats();
  const engines = listEngines();
  console.log(`Registered engines: ${stats.totalEngines}`);
  for (const e of engines) {
    console.log(`  • ${e.name.padEnd(28)} priority ${e.priority}  ${e.capabilities.slice(0,3).join(', ')}`);
  }
  console.log('');

  const allResults = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    console.log(`\n[${i + 1}/${SCENARIOS.length}] ${s.label}`);
    console.log(hr('─', 56));
    console.log(`  "${s.message}"`);
    console.log('');

    const orch = createConsoleOrchestrator();
    const t0   = Date.now();

    try {
      const result = await orch.run(s.message, { dryRun: true, ...(s.options ?? {}) });

      const elapsed = Date.now() - t0;
      const icon    = result.success ? '✓' : result.outcome === 'preview' ? '◻' : '✗';

      console.log(`\n  ${icon} ${result.outcome?.toUpperCase()} in ${elapsed}ms`);

      if (result.outcome === 'preview') {
        console.log(`\n  Plan preview:`);
        for (const line of result.report.split('\n').slice(0, 12)) {
          console.log(`  ${line}`);
        }
      } else {
        if (result.request?.requiredEngines?.length) {
          console.log(`  Engines used: ${result.request.requiredEngines.join(', ')}`);
        }
        const phases = result.plan?.phases ?? [];
        console.log(`  Phases: ${phases.length}`);

        const successes = Object.entries(result.engineResults ?? {})
          .filter(([, r]) => r.success && !r.skipped);
        const failures  = Object.entries(result.engineResults ?? {})
          .filter(([, r]) => !r.success && !r.skipped);

        for (const [name, r] of successes) {
          console.log(`    ✓ ${name}: ${r.summary?.slice(0, 70)}`);
        }
        for (const [name, r] of failures) {
          console.log(`    ✗ ${name}: ${r.error ?? r.summary}`);
        }

        // Context bus
        if (result.contextSnapshot) {
          const keys = Object.keys(result.contextSnapshot).filter(k => !k.startsWith('_'));
          if (keys.length) console.log(`  Context bus: ${keys.join(', ')}`);
        }
      }

      allResults.push({ scenario: s, result, elapsed });
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
      allResults.push({ scenario: s, result: null, error: err.message, elapsed: Date.now() - t0 });
    }
  }

  console.log('\n' + hr('─', 56));
  const passed = allResults.filter(r => r.result?.success).length;
  console.log(`${passed}/${SCENARIOS.length} scenarios completed successfully`);

  // ── Write report ────────────────────────────────────────────────────────────
  console.log('\nGenerating ORCHESTRATOR_REPORT.md...');
  const report  = buildArchReport(allResults, engines, stats);
  const outPath = join(ROOT, 'ORCHESTRATOR_REPORT.md');
  writeFileSync(outPath, report, 'utf8');
  console.log(`Report: ${outPath}`);

  console.log('\n' + hr('═') + '\n  Done\n' + hr('═') + '\n');
}

// ── Architecture report ───────────────────────────────────────────────────────

function buildArchReport(results, engines, stats) {
  const now = new Date().toISOString().split('T')[0];
  const passed = results.filter(r => r.result?.success).length;

  return `# Coach's Eye Orchestrator — Architecture & Test Report

*Generated: ${now}*

---

## What Is This?

The **Coach's Eye Orchestrator** is the brain above every AI system.

It accepts one natural language request, determines automatically which engines are
required, executes them in the correct order, shares context between them, prevents
duplicate work, retries failed steps, and returns a final execution report.

**Spec example handled:**

> "Prepare Thursday's U14 training, check injured players, create a session,
>  generate PDFs, notify coaches and update the season plan."

The Orchestrator detects 4 engines are needed, resolves their execution order,
shares player/injury data on the context bus, and produces a full report.

---

## Architecture

\`\`\`
orchestrator/
├── index.js                 ← Orchestrator class (EventEmitter) + public API
├── engine-registry.js       ← Plugin registry — engines self-register on import
├── context-bus.js           ← Shared key-value store with provenance tracking
├── request-analyser.js      ← NL → OrchestratorRequest (engines + entities)
├── execution-planner.js     ← Dependency graph → ExecutionPlan (Kahn's topo sort)
├── executor.js              ← Phase-by-phase runner with retry + progress events
├── report-builder.js        ← Markdown execution report builder
└── adapters/
    ├── index.js             ← Bootstrap (imports all → self-register)
    ├── memory-engine.js     ← Foundation data layer
    ├── coaching-engine.js   ← Session and programme generation
    ├── player-development.js← Development scores and injury risk
    ├── rugby-knowledge.js   ← Laws, technique, drills
    ├── discovery-agent.js   ← Prospect discovery (CLI stub)
    ├── market-intel.js      ← Market intelligence (CLI stub)
    ├── lead-personalisation.js ← Lead outreach (CLI stub)
    ├── ai-copilot.js        ← AI synthesis layer
    ├── workflow-engine.js   ← Multi-step workflow execution
    └── club-intelligence.js ← Club-level overview and DoR brief
\`\`\`

### Data Flow

\`\`\`
Natural language message
        │
        ▼
  request-analyser.js
  Extract entities, score intent signals, select engines
        │
        ▼
  execution-planner.js
  Build dependency graph (Kahn's topo sort) → phases
        │
        ▼
  context-bus (initialised with request metadata)
        │
        ▼
  executor.js — for each phase:
    ├─ engine.started event
    ├─ adapter.execute(contextSnapshot, options)
    │    └─ reads from bus, calls real engine, returns contextWrites
    ├─ contextWrites committed to bus
    ├─ engine.completed / engine.failed event
    └─ retry on failure (exponential backoff, default 2 retries)
        │
        ▼
  report-builder.js
  Markdown execution report
        │
        ▼
  OrchestrationResult { engines, phases, contextSnapshot, report }
\`\`\`

---

## Plugin Architecture

New engines require **only a registration call** — no other file needs to change:

\`\`\`js
// orchestrator/adapters/my-new-engine.js
import { registerEngine } from '../engine-registry.js';

registerEngine({
  name:           'my-new-engine',
  version:        '1.0.0',
  description:    'What this engine does',
  capabilities:   ['my_capability'],
  requiredInputs: [],           // bus keys that MUST exist
  optionalInputs: ['players'],  // bus keys consumed if present
  outputs:        ['myData'],   // bus keys this engine writes
  priority:       65,

  async execute(ctx, opts) {
    // ctx contains: all bus data + ctx._request.{ entities, originalMessage }
    return {
      success:       true,
      data:          rawResult,
      contextWrites: { myData: processedData },
      summary:       'One-line summary',
      evidence:      ['Bullet point 1', 'Bullet point 2'],
      warnings:      [],
    };
  },
});
\`\`\`

Then add one import line to \`adapters/index.js\`. That's it.

---

## Context Bus

The context bus is a shared key-value store that engines read from and write to.
It has provenance tracking (which engine wrote which key) and read tracking.

Standard keys populated during a coaching-focused orchestration:

| Key | Producer | Contents |
|-----|----------|---------|
| \`players\` | memory-engine | All player entities for the request |
| \`teams\` | memory-engine | All team entities |
| \`injuries\` | memory-engine | Active injury records |
| \`programmes\` | memory-engine | Active training programmes |
| \`playerAnalysis\` | player-development | Dev scores, injury risk, readiness |
| \`teamAnalysis\` | player-development | Team-level aggregates |
| \`injuryRiskSummary\` | player-development | High-risk players list |
| \`session\` | coaching-engine | Generated training session |
| \`sessionMarkdown\` | coaching-engine | Printable Markdown session |
| \`workflowPlan\` | workflow-engine | Planned workflow steps |
| \`workflowResult\` | workflow-engine | Execution result |
| \`clubReport\` | club-intelligence | Full club report |
| \`clubHealth\` | club-intelligence | 7-dimension health score |
| \`dorBrief\` | club-intelligence | Director of Rugby brief |
| \`aiResponse\` | ai-copilot | Synthesised AI response |
| \`aiRecommendations\` | ai-copilot | Recommended actions |

---

## Execution Order Example

**Request:** "Prepare Thursday's U14 training, check injured players, create a session, generate PDFs, notify coaches and update the season plan."

**Detected engines:** memory-engine, player-development, coaching-engine, workflow-engine

**Phases (auto-resolved by dependency graph):**

\`\`\`
Phase 1: memory-engine                  (no deps — produces players, teams, injuries)
Phase 2: player-development             (needs players → injury risk analysis)
Phase 3: coaching-engine                (needs players + injuryRisk → session)
Phase 4: workflow-engine                (needs session → PDF, notify, season update)
\`\`\`

Each phase can run multiple engines in parallel if their outputs don't depend on each other.

---

## Progress Events

The Orchestrator extends Node EventEmitter. Listen for live progress:

\`\`\`js
const orch = createOrchestrator();
orch.on('progress', event => {
  // event.type: analysis.complete | plan.ready | engine.started |
  //             engine.completed | engine.failed | engine.retrying |
  //             orchestration.completed
  console.log(event.type, event.engineName, event.durationMs);
});
const result = await orch.run("Prepare Thursday's U14 training...");
\`\`\`

---

## Retry Logic

- **Default:** 2 retries per engine (configurable via \`options.maxRetries\`)
- **Backoff:** linear — delay × attempt number (default 400ms base)
- **Deduplication:** engines that already completed successfully in this run are skipped
- **Required inputs:** engines with missing \`requiredInputs\` are skipped with a warning

---

## Registered Engines

${engines.map(e => `| **${e.name}** | ${e.priority} | ${e.capabilities.join(', ')} |`).join('\n')}

*(Priority: higher = runs earlier within the same dependency tier)*

---

## Test Results (${now})

**${passed}/${results.length} scenarios completed successfully** (all run as dry-run — no side effects)

${results.map((r, i) => {
  const s  = r.scenario;
  const res = r.result;
  const icon = res?.success ? '✓' : res?.outcome === 'preview' ? '◻' : '✗';

  const enginesUsed = res?.request?.requiredEngines?.join(', ') ?? 'n/a';
  const phases      = res?.plan?.phases?.length ?? 0;
  const duration    = r.elapsed ?? 0;

  const engineRows = Object.entries(res?.engineResults ?? {})
    .map(([name, er]) => `  - ${er.success ? '✓' : er.skipped ? '○' : '✗'} **${name}**: ${er.summary?.slice(0, 80) ?? ''}`)
    .join('\n');

  return `### ${i + 1}. ${icon} "${s.label}"

**Message:** ${s.message}
**Outcome:** ${res?.outcome?.toUpperCase() ?? 'ERROR'} (${duration}ms)
**Engines:** ${enginesUsed}
**Phases:** ${phases}

${engineRows || (r.error ? `**Error:** ${r.error}` : '')}

`;
}).join('')}

---

## Future Integrations

1. **WebSocket progress stream** — expose Orchestrator progress events via WebSocket for Mission Control real-time dashboard
2. **CLI-engine promotion** — Discovery, Market Intel, Lead Personalisation are currently CLI stubs; promote to importable modules with a public \`run(options)\` function
3. **Persistent orchestration log** — write every OrchestrationResult to JSONL alongside workflow-history for full system audit trail
4. **Conditional orchestration** — allow engines to signal "I need engine X to run first" at runtime, not just at registration
5. **Orchestration templates** — pre-defined engine combinations for common tasks (weekly prep, DoR brief, injury review)
6. **Mission Control panel** — live orchestration viewer showing phase progress, context bus state, engine results

---

*Report generated by Coach's Eye Orchestrator*
`;
}

main().catch(err => {
  console.error('CLI error:', err);
  process.exit(1);
});
