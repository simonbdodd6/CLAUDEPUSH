/**
 * Club Intelligence Engine Adapter
 * Registers the Club Intelligence Engine with the AI Copilot plugin registry.
 * Handles club-level, DoR-level, and squad-wide queries.
 */

import { registerTool } from '../tool-registry.js';

let _engine = null;
async function engine() {
  if (!_engine) {
    try { _engine = await import('../../qa/club-intelligence/index.js'); }
    catch { _engine = null; }
  }
  return _engine;
}

registerTool({
  name:        'club-intelligence',
  version:     '1.0.0',
  description: 'Living club overview — aggregates all engines into a Director of Rugby intelligence brief',
  capabilities: ['squad_analysis', 'weekly_plan', 'injury_risk', 'player_progress', 'session_summary'],
  priority:    95,  // above player-development for club-level queries

  async execute(intent, context, options = {}) {
    const e = await engine();
    if (!e) {
      return {
        success:  false,
        error:    'Club Intelligence Engine not available',
        data:     null,
        summary:  '',
        evidence: [],
      };
    }

    try {
      const result = await e.handleCopilotRequest(intent, context);
      return result;
    } catch (err) {
      return {
        success:  false,
        error:    err.message,
        data:     null,
        summary:  '',
        evidence: [],
      };
    }
  },
});
