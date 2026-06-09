/**
 * AI Copilot Adapter
 * Synthesises all context-bus data into a high-quality natural language response.
 * Runs late in the pipeline — after other engines have populated the bus.
 */

import { registerEngine } from '../engine-registry.js';

let _copilot = null;
async function copilot() {
  if (!_copilot) {
    try {
      const mod = await import('../../ai-copilot/index.js');
      _copilot  = mod.copilot ?? null;
    } catch { _copilot = null; }
  }
  return _copilot;
}

registerEngine({
  name:           'ai-copilot',
  version:        '1.0.0',
  description:    'AI synthesis layer — produces holistic recommendations from all engine outputs',
  capabilities:   ['ai_assist', 'question_answering', 'synthesis', 'recommendation'],
  requiredInputs: [],
  optionalInputs: ['players', 'session', 'playerAnalysis', 'clubReport', 'clubHealth', 'workflowPlan'],
  outputs:        ['aiResponse', 'aiRecommendations', 'copilotSummary'],
  priority:       70,
  alwaysRun:      false,

  async execute(ctx, opts) {
    const cop = await copilot();
    const message = ctx._request?.originalMessage ?? '';

    if (!cop) return stub(message);

    try {
      const { response } = await cop.chat(message, {
        contextOverride: {
          players:       ctx.players ?? [],
          session:       ctx.session,
          playerAnalysis: ctx.playerAnalysis,
          clubHealth:    ctx.clubHealth,
        },
      });

      const recs = response.recommendedActions ?? [];

      return {
        success: true,
        data:    response,
        contextWrites: {
          aiResponse:       response,
          aiRecommendations: recs,
          copilotSummary:   response.summary ?? '',
        },
        summary:  response.summary?.slice(0, 100) ?? 'AI Copilot response generated',
        evidence: [
          response.summary ? `**Summary:** ${response.summary.slice(0, 120)}` : null,
          response.reasoning ? `**Reasoning:** ${response.reasoning.slice(0, 100)}` : null,
          ...(recs.slice(0, 3).map(r => `→ ${typeof r === 'string' ? r : r.action ?? r.label ?? JSON.stringify(r)}`)),
        ].filter(Boolean),
        warnings: response.warnings ?? [],
      };
    } catch (err) {
      return {
        success: false, data: null, contextWrites: {},
        summary: `AI Copilot error: ${err.message}`,
        evidence: [], warnings: [`AI Copilot: ${err.message}`],
        error: err.message,
      };
    }
  },
});

function stub(message) {
  return {
    success: true,
    data:    { _stub: true },
    contextWrites: {
      aiResponse:        { _stub: true, summary: `Request processed: ${message.slice(0, 60)}` },
      aiRecommendations: [],
      copilotSummary:    `AI synthesis unavailable — individual engine results available above`,
    },
    summary:  'AI Copilot (stub — engine unavailable)',
    evidence: ['AI Copilot not found — individual engine results returned directly'],
    warnings: ['AI Copilot unavailable'],
  };
}
