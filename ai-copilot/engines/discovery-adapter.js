/**
 * Discovery Agent Adapter
 * Registers the Discovery Agent for club/market discovery tasks.
 */

import { registerTool } from '../tool-registry.js';

registerTool({
  name:        'discovery-agent',
  version:     '1.0.0',
  description: 'Discovers rugby clubs, coaches, and market opportunities',
  capabilities: ['squad_analysis'],  // surfaces when analysing the broader coaching landscape
  priority:    30,

  async execute(intent, context, options = {}) {
    // Lazy import — discovery agent is a pipeline tool not always available
    let discovery;
    try {
      discovery = await import('../../qa/discovery/discovery.js');
    } catch {
      return {
        success:  false,
        error:    'Discovery Agent not available in this environment',
        data:     null,
        summary:  '',
        evidence: [],
      };
    }

    return {
      success:  true,
      data:     { note: 'Discovery Agent available — run npm run discovery for full pipeline' },
      summary:  'Discovery Agent registered and available',
      evidence: ['Discovery Agent operational'],
    };
  },
});
