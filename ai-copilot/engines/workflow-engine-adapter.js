/**
 * Workflow Engine Adapter — registers the Workflow Engine with the AI Copilot
 *
 * Priority: 80 (executes after Club Intelligence at 95, before Discovery at 60)
 *
 * When the Copilot detects a workflow intent, this adapter:
 * 1. Parses the message into a WorkflowDefinition
 * 2. Plans the workflow (validates, topological sort, estimates time)
 * 3. Returns a structured preview — including planned steps and quick actions
 *    for "Execute now" / "Schedule" / "Dry run"
 *
 * Auto-execution: if context.autoExecute is true, the workflow runs immediately.
 */

import { registerTool } from '../tool-registry.js';

const WORKFLOW_INTENT_KEYWORDS = [
  'build', 'create', 'generate', 'make', 'run', 'execute',
  'plan', 'set up', 'start', 'schedule', 'send',
  'training session', 'session plan', 'rehab', 'rehabilitation',
  'notify', 'notification', 'match report', 'dor report',
  'player review', 'club report', 'weekly brief',
];

function mightBeWorkflow(message) {
  const lower = message.toLowerCase();
  return WORKFLOW_INTENT_KEYWORDS.some(kw => lower.includes(kw));
}

registerTool({
  name:        'workflow-engine',
  version:     '1.0.0',
  description: 'Execution layer — chains multiple Coach\'s Eye actions into auditable workflows',
  capabilities: [
    'session_plan',
    'rehab_workflow',
    'notification_workflow',
    'report_workflow',
    'player_review',
    'workflow_execution',
    'workflow_preview',
    'schedule_session',
  ],
  requiredContext: [],
  priority: 80,

  async execute(intent, context) {
    let engine;
    try {
      engine = await import('../../workflow-engine/index.js');
    } catch (err) {
      return {
        success: false,
        data:    null,
        summary: 'Workflow Engine not available',
        evidence: [],
        error:   err.message,
      };
    }

    const message = context?.message ?? intent?.message ?? '';

    if (!mightBeWorkflow(message)) {
      return {
        success: false,
        data:    null,
        summary: 'Message does not appear to be a workflow request',
        evidence: [],
      };
    }

    // If auto-execute is requested, run the full pipeline
    if (context?.autoExecute) {
      try {
        const { plan, result, parsed, error } = await engine.executeWorkflow(
          message,
          context,
          { dryRun: context.dryRun ?? false }
        );

        if (!parsed) {
          return {
            success: false,
            data:    null,
            summary: error ?? 'Could not parse workflow',
            evidence: [],
          };
        }

        const stepSummaries = plan.waves
          .flatMap(w => w.steps)
          .map(s => `${s.label}${s.optional ? ' (optional)' : ''}`);

        return {
          success:  result?.success ?? false,
          data: {
            runId:       result?.runId,
            planId:      plan?.planId,
            outcome:     result?.outcome,
            steps:       stepSummaries,
            stepResults: result?.stepResults ?? {},
            warnings:    result?.warnings ?? [],
          },
          summary: result?.summary ?? 'Workflow executed',
          evidence: buildEvidence(plan, result),
        };
      } catch (err) {
        return {
          success: false,
          data:    null,
          summary: `Workflow execution failed: ${err.message}`,
          evidence: [],
          error:   err.message,
        };
      }
    }

    // Default: return a preview (plan without executing)
    const preview = engine.previewWorkflow(message, context);

    if (!preview || preview.error) {
      return {
        success: false,
        data:    null,
        summary: preview?.error ?? 'Could not build workflow plan',
        evidence: [],
      };
    }

    const stepList = preview.steps
      .map((s, i) => `${i + 1}. ${s.label}${s.optional ? ' *(optional)*' : ''}`)
      .join('\n');

    const confidence = preview.confidence
      ? ` (${Math.round(preview.confidence * 100)}% match)`
      : '';

    return {
      success: true,
      data: {
        preview,
        workflowType: preview.name,
        readyToExecute: true,
        autoExecutePayload: { message, context, autoExecute: true },
      },
      summary: `${preview.name}${confidence} — ${preview.stepCount} steps, ~${Math.round((preview.estimatedMs ?? 0) / 1000)}s`,
      evidence: [
        `**Planned workflow:** ${preview.name}`,
        `**Steps (${preview.stepCount}):**\n${stepList}`,
        preview.warnings?.length
          ? `**Note:** ${preview.warnings.join(' · ')}`
          : null,
      ].filter(Boolean),
    };
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEvidence(plan, result) {
  if (!plan) return [];

  const evidence = [`**Workflow:** ${plan.name}`];

  const waves = plan.waves ?? [];
  for (const wave of waves) {
    for (const step of wave.steps) {
      const r = result?.stepResults?.[step.stepId];
      if (!r) continue;
      const icon = r.success ? '✓' : r.skipped ? '○' : '✗';
      evidence.push(`${icon} **${step.label}** — ${r.summary}`);
    }
  }

  if (result?.rolledBack?.length) {
    evidence.push(`↩ Rolled back: ${result.rolledBack.length} step(s)`);
  }

  return evidence;
}
