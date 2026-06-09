/**
 * Coaching Engine Adapter
 * Generates training sessions using players and injury data from the context bus.
 */

import { registerEngine } from '../engine-registry.js';

let _engine = null;
async function engine() {
  if (!_engine) { try { _engine = await import('../../qa/coaching-engine/index.js'); } catch { _engine = null; } }
  return _engine;
}

registerEngine({
  name:           'coaching-engine',
  version:        '1.0.0',
  description:    'Generates training sessions, rehab plans, and season programmes',
  capabilities:   ['session_create', 'rehab_create', 'programme_generate', 'drill_lookup'],
  requiredInputs: [],
  optionalInputs: ['players', 'injuries', 'team', 'playerAnalysis'],
  outputs:        ['session', 'drills', 'sessionMarkdown'],
  priority:       80,
  alwaysRun:      false,

  async execute(ctx, opts) {
    const eng = await engine();
    if (!eng) return stub(ctx);

    const entities  = ctx._request?.entities ?? {};
    const ageGroup  = entities.ageGroup ?? 'Senior';
    const focus     = entities.sessionFocus ?? 'General training';
    const duration  = entities.durationMinutes ?? (ageGroup.startsWith('U1') ? 90 : 75);
    const players   = ctx.players ?? [];
    const injuries  = ctx.injuries ?? [];

    const injuredIds = new Set(injuries.map(i => i.playerId));
    const available  = players.filter(p => !injuredIds.has(p.id));

    const teamInput = {
      ageGroup,
      players:       available,
      playerCount:   available.length || 20,
    };
    const sessionOpts = {
      focus,
      duration,
      avoidContact: injuries.length > 0,
    };

    try {
      const result = await eng.generateSession(teamInput, sessionOpts, null, { memory: false });
      const markdown = eng.sessionToMarkdown?.(result) ?? '';

      return {
        success: true,
        data:    result,
        contextWrites: { session: result, sessionMarkdown: markdown },
        summary:  `Session generated for ${ageGroup} — ${focus} (${duration} min)`,
        evidence: [
          `**Age group:** ${ageGroup}`,
          `**Focus:** ${focus}`,
          `**Available players:** ${available.length} (${injuredIds.size} injured, excluded)`,
          `**Duration:** ${duration} min`,
          result._meta?.provider ? `**Provider:** ${result._meta.provider}` : null,
        ].filter(Boolean),
        warnings: injuries.length > 0
          ? [`${injuries.length} player(s) excluded from session due to active injury`]
          : [],
      };
    } catch (err) {
      return {
        success: false, data: null, contextWrites: {},
        summary: `Coaching Engine error: ${err.message}`,
        evidence: [], warnings: [`Coaching Engine: ${err.message}`],
        error: err.message,
      };
    }
  },
});

function stub(ctx) {
  const ageGroup = ctx._request?.entities?.ageGroup ?? 'Senior';
  const focus    = ctx._request?.entities?.sessionFocus ?? 'General training';
  return {
    success: true,
    data:    { _stub: true, ageGroup, focus },
    contextWrites: {
      session: {
        ageGroup, focus,
        durationMinutes: 90,
        warmup:   { duration: 15, activities: ['Dynamic stretch', 'Ball work'] },
        mainBody: { duration: 60, blocks: [{ name: focus, duration: 60 }] },
        cooldown: { duration: 15, activities: ['Static stretch', 'Debrief'] },
        _stub: true,
      },
    },
    summary:  `Session template for ${ageGroup} — ${focus} (Coaching Engine unavailable)`,
    evidence: ['Coaching Engine not found — template session returned'],
    warnings: ['Coaching Engine unavailable — stub session used'],
  };
}
