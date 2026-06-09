/**
 * Lead Personalisation Engine Adapter
 * CLI pipeline (qa/lead-personalisation/) — returns structured stub.
 */

import { registerEngine } from '../engine-registry.js';

registerEngine({
  name:           'lead-personalisation',
  version:        '1.0.0',
  description:    'Personalised outreach generation for club leads and prospects',
  capabilities:   ['lead_outreach', 'personalise', 'email_draft'],
  requiredInputs: [],
  optionalInputs: ['scoredLeads', 'marketIntel', 'prospects'],
  outputs:        ['outreachDrafts', 'personalisedMessages'],
  priority:       45,
  alwaysRun:      false,

  async execute(ctx, opts) {
    const leads = ctx.scoredLeads ?? ctx.prospects?.leads ?? [];

    return {
      success: true,
      data:    { _stub: true, leadCount: leads.length },
      contextWrites: {
        outreachDrafts:     [],
        personalisedMessages: {
          count:  leads.length,
          drafts: [],
          note:   'Connect to qa/lead-personalisation/ pipeline to activate',
          _stub:  true,
        },
      },
      summary:  `Lead Personalisation (stub) — ${leads.length} lead(s) in context`,
      evidence: [
        'Lead Personalisation is a CLI pipeline (`npm run lead:personalise`)',
        'Supply scored leads from Market Intel to generate personalised outreach',
      ],
      warnings: ['Lead Personalisation: CLI-only — stub returned. Run `npm run lead:personalise` for live drafts.'],
    };
  },
});
