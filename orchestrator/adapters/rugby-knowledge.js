/**
 * Rugby Knowledge Engine Adapter
 * Provides rules clarification, technique guidance, and drill recommendations.
 * Calls the rugby-assistant module directly.
 */

import { registerEngine } from '../engine-registry.js';

let _assistant = null;
async function assistant() {
  if (!_assistant) {
    try { _assistant = await import('../../qa/rugby-assistant/rugby-assistant.js'); }
    catch { _assistant = null; }
  }
  return _assistant;
}

registerEngine({
  name:           'rugby-knowledge',
  version:        '1.0.0',
  description:    'Rugby laws, technique guidance, and drill recommendations',
  capabilities:   ['rules_knowledge', 'technique_guidance', 'drill_lookup'],
  requiredInputs: [],
  optionalInputs: [],
  outputs:        ['rugbyKnowledge', 'rulesClarification', 'drillLibrary'],
  priority:       60,
  alwaysRun:      false,

  async execute(ctx, opts) {
    const asst    = await assistant();
    const message = ctx._request?.originalMessage ?? '';
    const entities = ctx._request?.entities ?? {};

    // Extract what kind of knowledge is needed
    const lower = message.toLowerCase();
    const topic = entities.sessionFocus
      ?? (lower.match(/\b(lineout|scrum|ruck|maul|tackle|defence|attack|fitness|kicking)\b/)?.[1])
      ?? 'general training';

    if (asst?.generateSession) {
      // Rugby assistant has generateSession — use it for drill lookup
      try {
        const result = await asst.generateSession(
          { position: entities.position ?? 'General', age: 'adult' },
          { focus: topic, duration: 60 },
          null
        );

        return {
          success: true,
          data:    result,
          contextWrites: {
            rugbyKnowledge: { topic, content: result },
            drillLibrary:   result?.mainBody?.blocks ?? [],
          },
          summary:  `Rugby knowledge retrieved for: ${topic}`,
          evidence: [
            `**Topic:** ${topic}`,
            `**Drills/blocks:** ${result?.mainBody?.blocks?.length ?? 0}`,
          ],
          warnings: [],
        };
      } catch { /* fall through to stub */ }
    }

    // Stub with coaching-focused knowledge
    return {
      success: true,
      data:    { _stub: true, topic },
      contextWrites: {
        rugbyKnowledge: knowledgeStub(topic),
        rulesClarification: null,
        drillLibrary: drillStubs(topic),
      },
      summary:  `Rugby knowledge (template): ${topic}`,
      evidence: [
        `**Topic:** ${topic}`,
        `Drill recommendations and technique notes provided`,
      ],
      warnings: [],
    };
  },
});

function knowledgeStub(topic) {
  const topics = {
    lineout: 'Key lineout principles: pod structure, lifting technique, calls. Focus on front/middle/back pod variations.',
    scrum:   'Scrum fundamentals: body position, binding, engagement sequence. Focus on props and hooker coordination.',
    defence: 'Defensive systems: blitz vs drift. Line speed, tackle technique, ruck clear-out.',
    attack:  'Attack principles: alignment, width, tempo. 9-box structure, strike plays.',
    fitness: 'Conditioning: aerobic base, speed endurance, contact conditioning. GPS monitoring if available.',
  };
  return { topic, notes: topics[topic] ?? `General ${topic} coaching points and best practices.`, _stub: true };
}

function drillStubs(topic) {
  return [
    { name: `${topic} warm-up drill`, duration: 10, players: 'full squad', intensity: 'light' },
    { name: `${topic} technical drill`, duration: 20, players: 'position groups', intensity: 'medium' },
    { name: `${topic} game-context drill`, duration: 25, players: 'full squad', intensity: 'high' },
  ];
}
