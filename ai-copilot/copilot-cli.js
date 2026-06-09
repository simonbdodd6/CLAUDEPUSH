#!/usr/bin/env node
/**
 * AI Copilot CLI Test
 * Tests all 10 intent types against the full engine stack.
 * Produces COPILOT_REPORT.md at project root.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Test prompts (verbatim from spec) ─────────────────────────────────────────

const TEST_PROMPTS = [
  "Build tonight's U16 session.",
  "Create a 12-week prop programme.",
  "How is Tom progressing?",
  "Who is at highest injury risk?",
  "What should we work on this week?",
  "Summarise our last four training sessions.",
  "Compare our two hookers.",
  "Build next week's preseason plan.",
  "Generate a rehab programme.",
  "Find the weakest area in our squad.",
];

function hr(char = '─', len = 60) { return char.repeat(len); }

async function main() {
  console.log('\n' + hr('═') + '\n  Coach\'s Eye AI Copilot — CLI Test\n' + hr('═') + '\n');

  const { copilot, createConsoleStream } = await import('./index.js');

  // ── Inspect registry ──────────────────────────────────────────────────────

  const stats = copilot.registryStats();
  console.log(`Engines registered: ${stats.totalTools}`);
  console.log(`Engine names: ${stats.toolNames.join(', ')}`);
  console.log(`Capabilities covered: ${Object.keys(stats.capabilityIndex).join(', ')}`);
  console.log('');

  // ── Run all test prompts ──────────────────────────────────────────────────

  const conversationId = copilot.createConversation({ label: 'CLI Test Session' });
  const results = [];

  for (let i = 0; i < TEST_PROMPTS.length; i++) {
    const prompt = TEST_PROMPTS[i];
    console.log(`\n[${i + 1}/${TEST_PROMPTS.length}] "${prompt}"`);
    console.log(hr('─', 50));

    const stream = createConsoleStream({ verbose: true, prefix: '  ' });
    const start  = Date.now();

    try {
      const { response } = await copilot.chat(prompt, { conversationId, stream });
      const duration = Date.now() - start;

      console.log(`\n  Summary: ${response.summary}`);
      if (response.evidence?.length) {
        console.log(`  Evidence: ${response.evidence.slice(0, 2).join(' · ')}`);
      }
      if (response.recommendedActions?.length) {
        console.log(`  Action 1: ${response.recommendedActions[0]}`);
      }
      if (response.quickActions?.length) {
        console.log(`  Quick actions: ${response.quickActions.map(a => a.label).join(', ')}`);
      }
      console.log(`  Duration: ${duration}ms | Engines: ${response.metadata?.enginesUsed?.join(', ') ?? '?'}`);

      results.push({
        prompt,
        intent:          response.intent,
        intentLabel:     response.label,
        confidence:      response.metadata?.confidence,
        summary:         response.summary,
        evidence:        response.evidence ?? [],
        recommendedActions: response.recommendedActions ?? [],
        quickActions:    (response.quickActions ?? []).map(a => a.label),
        warnings:        response.warnings ?? [],
        enginesUsed:     response.metadata?.enginesUsed ?? [],
        duration,
        success:         true,
      });

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      results.push({ prompt, success: false, error: err.message, duration: Date.now() - start });
    }
  }

  // ── Quick action test ─────────────────────────────────────────────────────

  console.log('\n' + hr('─', 50));
  console.log('\n[Quick Action Test] pin_insight');
  try {
    const ar = await copilot.quickAction('pin_insight', { text: 'U16 squad needs attendance improvement across the board' }, {}, conversationId);
    console.log(`  Result: ${ar.message}`);
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }

  // ── Registry test ─────────────────────────────────────────────────────────

  console.log('\n[Intent Detection Test]');
  const testPhrases = [
    ['Build tonight\'s session', 'build_session'],
    ['How is Ciarán doing?',     'player_progress'],
    ['Who\'s at risk?',          'injury_risk'],
    ['Compare the two props',    'player_compare'],
  ];
  for (const [phrase, expected] of testPhrases) {
    const route = copilot.detectIntent(phrase);
    const ok    = route.intent === expected ? '✓' : '✗';
    console.log(`  ${ok} "${phrase}" → ${route.intent} (expected: ${expected}, confidence: ${route.band})`);
  }

  // ── Write report ──────────────────────────────────────────────────────────

  console.log('\n\nGenerating COPILOT_REPORT.md...');
  const report = buildReport(results, stats);
  const outPath = join(ROOT, 'COPILOT_REPORT.md');
  writeFileSync(outPath, report, 'utf8');
  console.log(`Report written: ${outPath}`);

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed  = results.filter(r => r.success).length;
  const failed  = results.filter(r => !r.success).length;
  const avgMs   = Math.round(results.filter(r => r.success).reduce((s, r) => s + r.duration, 0) / Math.max(passed, 1));

  console.log('\n' + hr('═'));
  console.log(`  Results: ${passed}/${results.length} passed · ${failed} failed · avg ${avgMs}ms`);
  console.log(hr('═') + '\n');
}

// ── Report builder ────────────────────────────────────────────────────────────

function buildReport(results, stats) {
  const now     = new Date().toISOString().split('T')[0];
  const passed  = results.filter(r => r.success).length;
  const avgMs   = Math.round(results.filter(r => r.success).reduce((s, r) => s + r.duration, 0) / Math.max(passed, 1));

  let md = `# Coach's Eye AI Copilot — Architecture & Test Report

*Generated: ${now}*

---

## What Is This?

The **AI Copilot** is the main coaching AI workspace inside Coach's Eye. It is NOT a chatbot.
It is a structured AI workspace that automatically routes coaching requests to the right engines,
returns evidence-based structured responses, and exposes quick actions for every output.

---

## Architecture

\`\`\`
Coach (message)
      │
      ▼
ai-copilot/
├── index.js              ← Public API: copilot.chat(), copilot.quickAction(), etc.
├── chat-manager.js       ← Orchestrator: routes → context → tools → response
├── intent-router.js      ← Keyword-weighted intent detection (no LLM required)
├── tool-registry.js      ← Plugin registry: engines self-register on import
├── context-loader.js     ← Memory Engine + entity resolution
├── response-builder.js   ← Structured response: summary, reasoning, evidence, actions
├── stream-handler.js     ← Event-based streaming for real-time UI updates
├── action-engine.js      ← Quick actions: save, assign, pin, PDF, send
├── conversation-memory.js← Per-session turn history, pinned insights, recent actions
├── citation-engine.js    ← Source tracking — every fact traced to its engine
│
├── engines/              ← Engine adapters (plugin registry)
│   ├── index.js          ← Bootstrap: imports all adapters (self-registration)
│   ├── coaching-engine-adapter.js
│   ├── memory-engine-adapter.js
│   ├── player-development-adapter.js
│   ├── rugby-knowledge-adapter.js
│   ├── discovery-adapter.js
│   ├── market-intel-adapter.js
│   └── lead-personalisation-adapter.js
│
└── mission-control/      ← Mission Control AI Panel
    ├── ai-panel.js        ← Express router + REST API handlers
    └── ai-panel.html      ← Self-contained React-free workspace UI
\`\`\`

---

## Plugin Registry Contract

Every engine exposes exactly:
\`\`\`js
registerTool({
  name:           'engine-name',      // unique identifier
  version:        '1.0.0',
  description:    'one sentence',
  capabilities:   ['intent_type'],    // which intents this engine handles
  priority:       85,                 // higher = preferred
  execute:        async (intent, context, options) => ({
    success:  boolean,
    data:     any,
    summary:  string,
    evidence: string[],
  }),
});
\`\`\`

The Copilot never imports engine internals. It only calls \`execute()\`.

---

## Intent Detection

Keyword-weighted scoring. No LLM required. Detects:

| Intent | Trigger examples |
|--------|-----------------|
| \`build_session\` | "Build tonight's U16 session", "Plan a training" |
| \`build_programme\` | "12-week prop programme", "Create a training plan" |
| \`build_rehab\` | "Rehab programme", "Return to play plan" |
| \`player_progress\` | "How is Tom progressing?", "Player status" |
| \`injury_risk\` | "Who is at highest injury risk?", "Injury assessment" |
| \`weekly_plan\` | "What should we work on this week?" |
| \`session_summary\` | "Summarise our last four sessions" |
| \`player_compare\` | "Compare our two hookers" |
| \`squad_analysis\` | "Find the weakest area in our squad" |
| \`knowledge_query\` | Fallback for any coaching question |

---

## Response Structure

Every response returns the same shape — never just paragraphs:

\`\`\`json
{
  "intent":             "build_session",
  "label":              "Build Training Session",
  "summary":            "1-2 sentence headline",
  "reasoning":          "Why this intent, which engines, what context was used",
  "evidence":           ["fact 1", "fact 2"],
  "content":            {},
  "recommendedActions": ["what the coach should do next"],
  "quickActions":       [{ "id": "save_session", "label": "Save Session", "icon": "💾" }],
  "citations":          { "engines": [], "factCount": 0 },
  "warnings":           [],
  "metadata":           { "intent", "confidence", "enginesUsed", "generatedAt" }
}
\`\`\`

---

## Quick Actions

Available for every response:

| Action | Description |
|--------|-------------|
| 💾 Save Session | Saves to Memory Engine |
| 📄 Create PDF | Exports via PDF engine |
| 📋 Assign Programme | Assigns to player in memory |
| 🧠 Update Memory | Saves insights to Coach Memory |
| 📱 Send to Player | Push notification to player |
| 📌 Pin Insight | Pins to Mission Control dashboard |
| 👥 Share with Coach | Generates share link |

---

## Registered Engines (${stats.totalTools})

${stats.toolNames.map(n => `- **${n}**`).join('\n')}

---

## Mission Control AI Panel

The panel at \`ai-copilot/mission-control/ai-panel.html\` provides:
- Live conversation history with structured response cards
- Suggested prompts (all spec examples)
- Real-time engine status list
- Pinned insights panel
- Recent AI actions panel
- Recommended coaching actions (updated per response)
- Quick action buttons on every response

Mount in Mission Control:
\`\`\`js
import { aiPanelRouter } from './ai-copilot/mission-control/ai-panel.js';
app.use('/ai-copilot', aiPanelRouter);
\`\`\`

---

## Future Engine Integration

To add a new engine (e.g., Video Analysis Engine):
\`\`\`js
// ai-copilot/engines/video-engine-adapter.js
import { registerTool } from '../tool-registry.js';

registerTool({
  name:         'video-analysis',
  description:  'Analyses training video and match footage',
  capabilities: ['session_summary', 'player_progress'],
  execute:      async (intent, context) => { /* ... */ },
});
\`\`\`
Then add one import line to \`engines/index.js\`. Done.

---

## Live Test Results (${now})

**${passed}/${results.length} passed · avg ${avgMs}ms**

${results.map((r, i) => {
  if (!r.success) return `### ${i + 1}. "${r.prompt}"\n❌ Error: ${r.error}\n`;
  return `### ${i + 1}. "${r.prompt}"

- **Intent:** \`${r.intent}\` (${r.intentLabel}) — confidence: ${r.confidence}
- **Engines:** ${r.enginesUsed.join(', ') || 'none'}
- **Duration:** ${r.duration}ms
- **Summary:** ${r.summary}
${r.evidence.length ? `- **Evidence:** ${r.evidence.slice(0, 2).join(' · ')}` : ''}
${r.recommendedActions.length ? `- **Top action:** ${r.recommendedActions[0]}` : ''}
- **Quick actions:** ${r.quickActions.join(', ') || 'none'}
${r.warnings.length ? `- **Warnings:** ${r.warnings.join(', ')}` : ''}

`;
}).join('')}

---

*Report generated by the Coach's Eye AI Copilot CLI*
`;

  return md;
}

main().catch(err => {
  console.error('CLI error:', err);
  process.exit(1);
});
