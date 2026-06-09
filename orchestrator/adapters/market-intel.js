/**
 * Market Intelligence Engine Adapter
 * CLI pipeline (qa/market-intel/pipeline.js) — returns structured stub.
 */

import { registerEngine } from '../engine-registry.js';

registerEngine({
  name:           'market-intel',
  version:        '1.0.0',
  description:    'Market intelligence: prospect scoring, competitive analysis, market signals',
  capabilities:   ['market_research', 'competitive_analysis', 'lead_scoring'],
  requiredInputs: [],
  optionalInputs: ['prospects', 'discoveryInsights'],
  outputs:        ['marketIntel', 'scoredLeads'],
  priority:       52,
  alwaysRun:      false,

  async execute(ctx, opts) {
    const prospects = ctx.prospects?.leads ?? [];

    // Market Intel is a CLI pipeline (qa/market-intel/pipeline.js) — no importable API.
    return {
      success: true,
      data:    { _stub: true, prospectCount: prospects.length },
      contextWrites: {
        marketIntel: {
          prospects:    prospects.length,
          scoredLeads:  [],
          signals:      [],
          note:         'Connect to qa/market-intel/pipeline.js to activate',
          _stub:        true,
        },
        scoredLeads: [],
      },
      summary:  `Market Intelligence (stub) — ${prospects.length} prospect(s) from context`,
      evidence: [
        'Market Intel is a CLI pipeline (`npm run market:pipeline`)',
        'Import scored leads CSV to activate live market intelligence',
      ],
      warnings: ['Market Intel: CLI-only — stub data returned. Run `npm run market:pipeline` for live data.'],
    };
  },
});
