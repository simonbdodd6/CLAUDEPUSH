/**
 * Memory Engine Adapter
 * Loads the foundation data layer: players, teams, injuries, programmes, club.
 * Always runs first — everything else consumes from the context bus it populates.
 */

import { registerEngine } from '../engine-registry.js';

let _engine = null;
async function engine() {
  if (!_engine) { try { _engine = await import('../../memory-engine/index.js'); } catch { _engine = null; } }
  return _engine;
}

registerEngine({
  name:           'memory-engine',
  version:        '1.0.0',
  description:    'Foundation data layer — players, teams, injuries, programmes, club profile',
  capabilities:   ['data_load', 'player_lookup', 'team_lookup', 'memory_read'],
  requiredInputs: [],
  optionalInputs: [],
  outputs:        ['players', 'teams', 'injuries', 'programmes', 'club', 'memoryStats'],
  priority:       100,
  alwaysRun:      false,   // included automatically by request-analyser when coaching engines are needed

  async execute(ctx, opts) {
    const eng = await engine();
    if (!eng) return stub();

    try {
      const players = eng.getAllPlayers?.() ?? [];
      const teams   = eng.getAllTeams?.()   ?? [];
      const stats   = eng.getStats?.()      ?? {};

      // Extract injury data from players
      const injuries = players
        .filter(p => (p.injuries ?? []).some(i => i.status === 'active'))
        .map(p => ({
          playerId:  p.id,
          playerName: p.core?.name ?? 'Unknown',
          injuries:  (p.injuries ?? []).filter(i => i.status === 'active'),
        }));

      // Extract active programmes
      const programmes = players
        .flatMap(p => (p.programmes ?? []).map(pr => ({ ...pr, playerId: p.id, playerName: p.core?.name })))
        .filter(pr => pr.status === 'active');

      const ageGroup = ctx._request?.entities?.ageGroup;

      return {
        success: true,
        data:    { players, teams, injuries, programmes, stats },
        contextWrites: {
          players:     ageGroup
            ? players.filter(p => !p.core?.ageGroup || p.core.ageGroup === ageGroup)
            : players,
          teams:        ageGroup
            ? teams.filter(t => !t.ageGroup || t.ageGroup === ageGroup)
            : teams,
          injuries,
          programmes,
          memoryStats:  stats,
        },
        summary:  `Loaded ${players.length} players, ${teams.length} teams, ${injuries.length} active injuries`,
        evidence: [
          `Players loaded: **${players.length}**`,
          `Teams: **${teams.length}**`,
          `Active injuries: **${injuries.length}**`,
          `Active programmes: **${programmes.length}**`,
          ageGroup ? `Filtered to age group: **${ageGroup}**` : null,
        ].filter(Boolean),
        warnings: [],
      };
    } catch (err) {
      return {
        success: false, data: null, contextWrites: {},
        summary: `Memory Engine error: ${err.message}`,
        evidence: [], warnings: [`Memory Engine: ${err.message}`],
        error: err.message,
      };
    }
  },
});

function stub() {
  return {
    success: true,
    data:    { _stub: true },
    contextWrites: { players: [], teams: [], injuries: [], programmes: [] },
    summary:  'Memory Engine (stub — no data store found)',
    evidence: ['No memory data available — engine returned empty dataset'],
    warnings: ['Memory Engine not found — continuing with empty dataset'],
  };
}
