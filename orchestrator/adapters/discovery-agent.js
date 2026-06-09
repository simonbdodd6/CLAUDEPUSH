/**
 * Discovery Agent Adapter
 * Discovers prospects and leads. CLI-only engine — adapter returns structured stub
 * with the data shape that market-intel and lead-personalisation expect.
 */

import { registerEngine } from '../engine-registry.js';

registerEngine({
  name:           'discovery-agent',
  version:        '1.0.0',
  description:    'Prospect discovery and lead identification',
  capabilities:   ['prospect_discovery', 'market_research'],
  requiredInputs: [],
  optionalInputs: [],
  outputs:        ['prospects', 'discoveryInsights'],
  priority:       55,
  alwaysRun:      false,

  async execute(ctx, opts) {
    // Discovery agent is a CLI pipeline (qa/discovery/discovery.js) — no importable module API.
    // Returns a structured stub with the shape downstream engines expect.
    return {
      success: true,
      data:    { _stub: true },
      contextWrites: {
        prospects:         buildProspectStub(ctx),
        discoveryInsights: {
          totalDiscovered: 0,
          qualified:       0,
          note:            'Connect to qa/discovery/discovery.js pipeline to activate',
          _stub:           true,
        },
      },
      summary:  'Discovery Agent (stub — CLI pipeline, connect to activate)',
      evidence: [
        'Discovery Agent is a CLI pipeline (`npm run discovery`)',
        'Connect the output CSV/JSON to this adapter to activate live prospect data',
      ],
      warnings: ['Discovery Agent: CLI-only — stub data returned. Run `npm run discovery` for live data.'],
    };
  },
});

function buildProspectStub(ctx) {
  return {
    leads:   [],
    total:   0,
    source:  'stub',
    _stub:   true,
  };
}
