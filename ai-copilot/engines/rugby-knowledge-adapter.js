/**
 * Rugby Knowledge Engine Adapter
 * Answers coaching questions, explains drills, laws, and tactics.
 */

import { registerTool } from '../tool-registry.js';

let _assistant = null;
async function assistant() {
  if (!_assistant) {
    try { _assistant = await import('../../qa/rugby-assistant/assistant.js'); }
    catch { _assistant = null; }
  }
  return _assistant;
}

let _sessionBuilder = null;
async function sessionBuilder() {
  if (!_sessionBuilder) {
    try { _sessionBuilder = await import('../../qa/rugby-assistant/session-builder.js'); }
    catch { _sessionBuilder = null; }
  }
  return _sessionBuilder;
}

registerTool({
  name:        'rugby-knowledge',
  version:     '1.0.0',
  description: 'Answers coaching questions using the rugby knowledge base — drills, tactics, laws, techniques',
  capabilities: ['knowledge_query', 'build_session', 'weekly_plan'],
  priority:    70,

  async execute(intent, context, options = {}) {
    const entities = context.entities ?? {};
    const message  = context.message ?? options.message ?? '';

    if (intent === 'build_session') {
      const sb = await sessionBuilder();
      if (!sb) {
        return {
          success:  false,
          error:    'Rugby session builder not available',
          data:     null,
          summary:  '',
          evidence: [],
        };
      }

      const ageGroup = entities.ageGroup ?? 'Senior';
      const focus    = entities.sessionFocus ?? message.slice(0, 60) ?? 'General skills';

      try {
        const session = await sb.buildSession({ ageGroup, focus, playerCount: 20 });
        return {
          success:  true,
          data:     session,
          summary:  `Session plan for ${ageGroup}: ${focus}`,
          evidence: [
            `Age group: ${ageGroup}`,
            `Focus: ${focus}`,
            `Knowledge base drills applied`,
          ],
        };
      } catch (err) {
        return { success: false, error: err.message, data: null, summary: '', evidence: [] };
      }
    }

    // Knowledge query — askAssistant
    const a = await assistant();
    if (!a) {
      return {
        success:  false,
        error:    'Rugby knowledge assistant not available',
        data:     null,
        summary:  '',
        evidence: [],
      };
    }

    const query = message || entities.sessionFocus || 'rugby coaching best practice';
    try {
      const result = await a.askAssistant(query);
      const data   = typeof result === 'string' ? { answer: result } : result;
      return {
        success:  true,
        data,
        summary:  data.summary ?? (typeof result === 'string' ? result.slice(0, 120) : 'Knowledge base result'),
        evidence: [
          data.keyCoachingPoints?.slice(0, 3).map(p => p.slice(0, 80)) ?? [],
          data.safetyNotes ? `Safety: ${data.safetyNotes.slice(0, 80)}` : null,
        ].flat().filter(Boolean),
      };
    } catch (err) {
      return { success: false, error: err.message, data: null, summary: '', evidence: [] };
    }
  },
});
