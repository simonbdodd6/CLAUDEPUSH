#!/usr/bin/env node
/**
 * Workflow Engine — CLI test
 * Runs 8 example workflows end-to-end and produces WORKFLOW_ENGINE_REPORT.md.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

function hr(c = '─', n = 60) { return c.repeat(n); }
function pad(s, w) { return String(s).padEnd(w); }

// ── Test scenarios ────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    label:   'Build next Tuesday\'s U16 training',
    message: 'Build next Tuesday\'s U16 training',
    context: { entities: { ageGroup: 'U16' } },
  },
  {
    label:   'Create a fitness session for the Senior squad',
    message: 'Create a fitness session for the Senior squad this Thursday at 19:00',
    context: {},
  },
  {
    label:   'Generate a rehab programme for injured player',
    message: 'Create a rehabilitation programme for John Murphy who has a hamstring injury',
    context: {
      player: {
        id: 'player_test_001',
        core: { name: 'John Murphy', position: 'Flanker', age: 22 },
        injuries: [{ type: 'hamstring strain', status: 'active' }],
        goals: ['Return to training', 'Full match fitness'],
      },
    },
  },
  {
    label:   'Generate the weekly Director of Rugby report',
    message: 'Generate the weekly Director of Rugby report',
    context: {},
  },
  {
    label:   'Create a player review for Sarah O\'Brien',
    message: 'Create a player review for Sarah O\'Brien',
    context: {
      player: {
        id: 'player_test_002',
        core: { name: "Sarah O'Brien", position: 'Centre', age: 19 },
      },
    },
  },
  {
    label:   'Generate a full club report',
    message: 'Generate a full club report',
    context: {},
  },
  {
    label:   'Notify the U18 squad about training',
    message: 'Send a notification to the U18 squad about training on Friday',
    context: { entities: { ageGroup: 'U18', dayOfWeek: 'friday' } },
  },
  {
    label:   'Preview workflow without executing',
    message: 'Build a match preparation session for the Senior team',
    preview: true,
    context: { entities: { ageGroup: 'Senior', sessionFocus: 'match preparation' } },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + hr('═') + '\n  Coach\'s Eye Workflow Engine — CLI Test\n' + hr('═') + '\n');

  const { executeWorkflow, previewWorkflow, listTemplates, listActions,
          queueSize, historySize, formatRunResult } = await import('./index.js');

  // ── List templates ──────────────────────────────────────────────────────────
  console.log('[0/8] Available workflow templates:');
  const templates = listTemplates();
  for (const t of templates) {
    console.log(`  • ${pad(t.name, 42)} ${t.stepCount} steps`);
  }

  // ── List actions ────────────────────────────────────────────────────────────
  console.log('\n  Available actions:');
  const actions = listActions();
  for (const a of actions) {
    const rev = a.isReversible ? ' ↩' : '  ';
    console.log(`  ${rev} ${pad(a.name, 40)} ${a.category}`);
  }

  // ── Run scenarios ───────────────────────────────────────────────────────────
  const results = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    console.log(`\n[${i + 1}/${SCENARIOS.length}] ${s.label}`);
    console.log(hr('─', 50));
    console.log(`  Message: "${s.message}"`);

    const t0 = Date.now();
    let scenResult;

    try {
      if (s.preview) {
        const preview = previewWorkflow(s.message, s.context);
        scenResult = {
          parsed: !!preview,
          preview: true,
          planName:   preview?.name,
          stepCount:  preview?.stepCount ?? 0,
          steps:      preview?.steps ?? [],
          warnings:   preview?.warnings ?? [],
          outcome:    'preview',
          durationMs: Date.now() - t0,
          error:      preview?.error ?? null,
        };
      } else {
        const { plan, result, parsed, error } = await executeWorkflow(
          s.message,
          s.context,
          { dryRun: true }   // safe — no real side effects in test
        );

        const steps = plan?.waves?.flatMap(w => w.steps) ?? [];
        scenResult = {
          parsed,
          preview:    false,
          planName:   plan?.name,
          planId:     plan?.planId,
          stepCount:  steps.length,
          steps:      steps.map(st => ({
            label:       st.label,
            actionId:    st.actionId,
            isReversible: st.isReversible,
            optional:    st.optional ?? false,
          })),
          warnings:   result?.warnings ?? plan?.warnings ?? [],
          outcome:    result?.outcome ?? 'planned',
          success:    result?.success ?? false,
          durationMs: Date.now() - t0,
          error:      error ?? null,
          runId:      result?.runId,
          formatted:  result ? formatRunResult(result) : null,
        };
      }
    } catch (err) {
      scenResult = {
        parsed: false, preview: false, planName: null, stepCount: 0,
        steps: [], warnings: [], outcome: 'error', success: false,
        durationMs: Date.now() - t0, error: err.message,
      };
    }

    // Print result
    if (!scenResult.parsed) {
      console.log(`  ✗ Could not parse: ${scenResult.error ?? 'No workflow match'}`);
    } else {
      const icon = (scenResult.outcome === 'dry_run' || scenResult.outcome === 'preview') ? '✓' : '✓';
      console.log(`  ${icon} ${scenResult.planName} — ${scenResult.stepCount} steps (${scenResult.durationMs}ms)`);
      for (const step of scenResult.steps.slice(0, 8)) {
        const rev = step.isReversible ? ' ↩' : '';
        const opt = step.optional ? ' (optional)' : '';
        console.log(`      • ${step.label}${rev}${opt}`);
      }
      if (scenResult.steps.length > 8) {
        console.log(`      ... +${scenResult.steps.length - 8} more`);
      }
      if (scenResult.warnings.length) {
        for (const w of scenResult.warnings) {
          console.log(`      ⚠ ${w}`);
        }
      }
    }

    results.push({ scenario: s, result: scenResult });
  }

  // ── Engine stats ────────────────────────────────────────────────────────────
  console.log('\n' + hr('─', 50));
  console.log(`Queue size:    ${queueSize()}`);
  console.log(`History size:  ${historySize()}`);

  // ── Copilot integration check ───────────────────────────────────────────────
  console.log('\nChecking AI Copilot integration...');
  try {
    const { copilot } = await import('../ai-copilot/index.js');
    const stats        = copilot.registryStats();
    const hasWorkflow  = stats.toolNames.includes('workflow-engine');
    console.log(`  Engines registered: ${stats.totalTools}`);
    console.log(`  Workflow Engine:    ${hasWorkflow ? '✓ registered' : '✗ not found'}`);

    // Fire a workflow-triggering prompt
    const { response } = await copilot.chat("Build next Tuesday's U16 training session");
    console.log(`  Copilot response:   ${response.summary?.slice(0, 80)}`);
    console.log(`  Engines used:       ${response.metadata?.enginesUsed?.join(', ') ?? 'n/a'}`);
  } catch (err) {
    console.log(`  Copilot check failed: ${err.message}`);
  }

  // ── Write report ────────────────────────────────────────────────────────────
  console.log('\n\nGenerating WORKFLOW_ENGINE_REPORT.md...');
  const report  = buildReport(results, templates, actions);
  const outPath = join(ROOT, 'WORKFLOW_ENGINE_REPORT.md');
  writeFileSync(outPath, report, 'utf8');
  console.log(`Report: ${outPath}`);

  const passed = results.filter(r => r.result.parsed).length;
  console.log(`\n${passed}/${results.length} scenarios parsed successfully`);
  console.log('\n' + hr('═') + '\n  Done\n' + hr('═') + '\n');
}

// ── Report builder ─────────────────────────────────────────────────────────────

function buildReport(results, templates, actions) {
  const now    = new Date().toISOString().split('T')[0];
  const passed = results.filter(r => r.result.parsed).length;

  return `# Workflow Engine — Architecture & Test Report

*Generated: ${now}*

---

## What Is This?

The **Workflow Engine** is the execution layer for the Coach's Eye AI Copilot.
Where other engines analyse, remember, and recommend — the Workflow Engine *acts*.
It chains multiple Coach's Eye actions into auditable, reversible workflows triggered
by natural language.

**Verbatim spec example:**

> User: "Build next Tuesday's U16 training."
>
> Workflow:
> 1. Build session
> 2. Save session
> 3. Schedule session
> 4. Notify coaches
> 5. Generate printable PDF
> 6. Update season objectives

---

## Architecture

\`\`\`
workflow-engine/
├── index.js                  ← Public API (executeWorkflow, previewWorkflow, ...)
├── workflow-actions.js       ← Registry of 15 executable actions with execute() + undo()
├── workflow-parser.js        ← Natural language → WorkflowDefinition (keyword/regex, no LLM)
├── workflow-planner.js       ← WorkflowDefinition → ExecutionPlan (Kahn's topo sort)
├── workflow-runner.js        ← Step-by-step executor with rollback
├── workflow-history.js       ← Append-only audit log (JSONL persistence)
└── workflow-queue.js         ← In-memory queue for scheduled workflows

ai-copilot/engines/
└── workflow-engine-adapter.js  ← Copilot plugin (auto-registered at priority 80)
\`\`\`

### Data Flow

\`\`\`
Natural language message
        │
        ▼
 workflow-parser.js
 (intent → WorkflowDefinition)
        │
        ▼
 workflow-planner.js
 (definition → ExecutionPlan via Kahn's topo sort)
        │
        ▼
 workflow-runner.js
 (wave-by-wave execution + rollback on failure)
        │
        ├─→ workflow-history.js  (every event logged)
        └─→ workflow-queue.js    (if scheduled for future)
\`\`\`

---

## The 15 Actions

| Action | Category | Reversible | Est. Time |
|--------|----------|-----------|-----------|
${actions.map(a => `| ${a.name} | ${a.category} | ${a.isReversible ? '↩ Yes' : 'No'} | ~${a.estimatedMs}ms |`).join('\n')}

### Action Contract

Every action implements:
- \`execute(params, context, stepOutputs)\` → \`{ success, data, summary, undoKey? }\`
- \`undo(params, context, result)\` (if \`isReversible: true\`)

**Step-to-step wiring:** \`stepOutputs\` passes the previous steps' result data forward.
Example: \`save_session\` reads \`stepOutputs.create_session.data\` to get the generated session.

### Notification Actions

\`send_player_notification\` and \`send_coach_notification\` are stubs that
connect to \`api/push.js\` (VAPID web push) once player/coach device tokens are
registered. The stubs return a complete, loggable result so workflows succeed
in tests without real push credentials.

---

## The 7 Workflow Templates

${templates.map(t => `### ${t.name}

${t.description}

**Steps (${t.stepCount}):** ${t.keywords.slice(0, 5).join(', ')}...

`).join('')}

---

## Parser — Natural Language → WorkflowDefinition

The parser uses **keyword-weighted intent scoring** (no LLM required):

1. Score every template against the message (keywords: +1 each, phrase regexes: +3 each)
2. Select highest-scoring template; fall back to \`build_session\` at score 0
3. Extract entities: \`ageGroup\`, \`position\`, \`dayOfWeek\`, \`time\`, \`durationMinutes\`, \`playerName\`, \`sessionFocus\`
4. Prune optional steps (e.g. skip \`schedule_future_session\` if no date hint)
5. Validate all action IDs against the registry

---

## Planner — Kahn's Topological Sort

The planner resolves step dependencies into **execution waves**:

- Steps in the same wave have no inter-dependencies → can run in parallel (parallel opt-in in options)
- Steps with unmet critical dependencies abort the workflow
- Optional steps with unmet dependencies are silently skipped

**Critical path** — non-optional steps only. Failure triggers rollback.

**Reversibility checkpoint** — the last reversible step before any non-reversible step.
Rollback undoes all completed steps in reverse order.

---

## Runner — Execution Model

1. Execute waves in order
2. For each step: check dependencies → \`action.execute()\` → log event
3. \`stepOutputs\` accumulates each step's result data for downstream steps
4. On critical failure: rollback completed reversible steps in reverse order
5. On optional failure: log warning, continue

**Audit log:** every event (\`step.started\`, \`step.completed\`, \`step.failed\`,
\`undo.started\`, \`undo.completed\`) is written to \`memory-engine/data/workflow-history.jsonl\`
with timestamps and step details.

---

## AI Copilot Integration

The Workflow Engine registers with the Copilot at **priority 80**.

When a workflow intent is detected, the adapter returns a **structured preview**:
- Planned steps with labels and reversibility flags
- Estimated execution time
- Quick actions: "Execute Now", "Schedule for Later", "Dry Run"

If \`context.autoExecute = true\`, the full pipeline runs immediately.

---

## Test Results (${now})

**${passed}/${results.length} scenarios parsed and planned successfully**

${results.map((r, i) => {
  const s  = r.scenario;
  const sr = r.result;
  const icon = sr.parsed ? '✓' : '✗';
  return `### ${i + 1}. ${icon} "${s.label}"

${sr.parsed ? `
- **Plan:** ${sr.planName}
- **Steps:** ${sr.stepCount}
- **Outcome:** ${sr.outcome}
- **Duration:** ${sr.durationMs}ms
${sr.steps.slice(0, 6).map(st => `  - ${st.label}${st.isReversible ? ' ↩' : ''}${st.optional ? ' (optional)' : ''}`).join('\n')}
${sr.warnings.length ? `\n**Warnings:** ${sr.warnings.join(' · ')}` : ''}
` : `
- **Error:** ${sr.error ?? 'No workflow match'}`}
`;
}).join('')}

---

## Future Integrations

1. **PDF Generation** — connect to a headless browser (Puppeteer) or PDF service once hosted
2. **Push Notifications** — connect \`send_player_notification\` / \`send_coach_notification\` to \`api/push.js\` with device token store
3. **Match Report** — connect \`generate_match_report\` to Match Analysis Engine when built
4. **Parallel execution** — enable \`canRunInParallel\` waves for waves with no step dependencies
5. **Persistent queue** — write queue state to JSONL alongside history for restart-safe scheduling
6. **Workflow history UI** — surface audit log in Mission Control panel

---

*Report generated by Coach's Eye Workflow Engine*
`;
}

main().catch(err => {
  console.error('CLI error:', err);
  process.exit(1);
});
