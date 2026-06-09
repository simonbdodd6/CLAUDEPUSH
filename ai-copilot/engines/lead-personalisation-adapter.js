/**
 * Lead Personalisation Engine Adapter
 */

import { registerTool } from '../tool-registry.js';

registerTool({
  name:        'lead-personalisation',
  version:     '1.0.0',
  description: 'Personalises outreach to coaches and clubs based on their context',
  capabilities: [],  // passive — available for future coach-outreach intents
  priority:    20,

  async execute(intent, context, options = {}) {
    return {
      success:  true,
      data:     { note: 'Lead Personalisation Engine available' },
      summary:  'Lead Personalisation registered',
      evidence: [],
    };
  },
});
