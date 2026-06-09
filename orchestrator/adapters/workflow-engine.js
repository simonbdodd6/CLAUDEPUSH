/**
 * Workflow Engine Adapter
 * Executes multi-step workflows: PDF generation, notifications, season plan updates.
 * Uses the session and player data from the context bus as workflow context.
 */

import { registerEngine } from '../engine-registry.js';

let _engine = null;
async function engine() {
  if (!_engine) { try { _engine = await import('../../workflow-engine/index.js'); } catch { _engine = null; } }
  return _engine;
}

registerEngine({
  name:           'workflow-engine',
  version:        '1.0.0',
  description:    'Executes multi-step workflows: PDF, notifications, season plan updates',
  capabilities:   ['pdf_generate', 'notify_coaches', 'season_update', 'workflow_execute', 'schedule_session'],
  requiredInputs: [],
  optionalInputs: ['session', 'players', 'injuries', 'team', 'playerAnalysis'],
  outputs:        ['workflowResult', 'workflowPlan', 'scheduledItems'],
  priority:       65,
  alwaysRun:      false,

  async execute(ctx, opts) {
    const eng = await engine();
    if (!eng) return stub(ctx);

    const message   = ctx._request?.originalMessage ?? '';
    const entities  = ctx._request?.entities ?? {};
    const session   = ctx.session;
    const players   = ctx.players ?? [];
    const injuries  = ctx.injuries ?? [];

    // Build rich workflow context from the bus
    const workflowCtx = {
      entities,
      session,
      players,
      injuries,
      team: ctx.team ?? null,
    };

    try {
      // First get a preview (safe, no side effects)
      const preview = eng.previewWorkflow(message, workflowCtx);

      if (!preview || preview.error) {
        return {
          success: true,
          data:    { _noWorkflow: true },
          contextWrites: { workflowPlan: null, workflowResult: null, scheduledItems: [] },
          summary:  'No workflow matched for this request',
          evidence: ['Workflow Engine: no matching workflow template found'],
          warnings: [],
        };
      }

      // Execute as dry-run unless explicitly told to run for real
      const { plan, result } = await eng.executeWorkflow(message, workflowCtx, {
        dryRun: opts?.dryRun !== false,  // default to dry-run in orchestration context
      });

      const steps = plan?.waves?.flatMap(w => w.steps) ?? [];
      const stepSummaries = steps.map(s => `${s.label}${s.optional ? ' (optional)' : ''}`);

      return {
        success:  result?.success ?? !!plan,
        data:     { plan, result, preview },
        contextWrites: {
          workflowPlan:   plan ? { name: plan.name, stepCount: plan.totalSteps, estimatedMs: plan.estimatedMs } : null,
          workflowResult: result ?? null,
          scheduledItems: [],
        },
        summary: plan
          ? `${result?.outcome === 'dry_run' ? 'Workflow plan ready' : result?.outcome}: ${plan.name} — ${steps.length} steps`
          : 'Workflow plan built',
        evidence: [
          `**Workflow:** ${preview?.name ?? plan?.name}`,
          `**Steps (${steps.length}):**`,
          ...stepSummaries.slice(0, 6).map(s => `  - ${s}`),
          result?.outcome ? `**Outcome:** ${result.outcome}` : null,
          preview?.estimatedMs ? `**Estimated time:** ~${Math.round(preview.estimatedMs / 1000)}s` : null,
        ].filter(Boolean),
        warnings: result?.warnings ?? preview?.warnings ?? [],
      };
    } catch (err) {
      return {
        success: false, data: null, contextWrites: {},
        summary: `Workflow Engine error: ${err.message}`,
        evidence: [], warnings: [`Workflow Engine: ${err.message}`],
        error: err.message,
      };
    }
  },
});

function stub(ctx) {
  return {
    success: true,
    data:    { _stub: true },
    contextWrites: { workflowPlan: null, workflowResult: null, scheduledItems: [] },
    summary:  'Workflow Engine (stub — engine unavailable)',
    evidence: ['Workflow Engine not found — stub result returned'],
    warnings: ['Workflow Engine unavailable'],
  };
}
