/**
 * Context Loader
 * Loads relevant context before dispatching to engines.
 * Pulls from Memory Engine using entities extracted by the intent router.
 */

// Lazy Memory Engine import
let _mem = null;
async function mem() {
  if (!_mem) {
    try { _mem = await import('../memory-engine/index.js'); }
    catch { _mem = null; }
  }
  return _mem;
}

// ── Entity resolver ───────────────────────────────────────────────────────────

async function resolvePlayer(entities) {
  if (!entities?.playerName) return null;
  const m = await mem();
  if (!m) return null;
  try {
    return await m.getPlayer({ name: entities.playerName }) ?? null;
  } catch { return null; }
}

async function resolveTeam(entities) {
  if (!entities?.ageGroup) return null;
  const m = await mem();
  if (!m) return null;
  try {
    return await m.getTeam({ ageGroup: entities.ageGroup }) ?? null;
  } catch { return null; }
}

async function resolveAllPlayers() {
  const m = await mem();
  if (!m) return [];
  try { return await m.getAllPlayers() ?? []; }
  catch { return []; }
}

async function resolveAllTeams() {
  const m = await mem();
  if (!m) return [];
  try { return await m.getAllTeams() ?? []; }
  catch { return []; }
}

async function resolveMemoryContext(intent, entities) {
  const m = await mem();
  if (!m) return { hasHistory: false };
  try {
    return m.getRelevantContext({
      player:      entities.playerName ? { name: entities.playerName } : null,
      team:        entities.ageGroup   ? { ageGroup: entities.ageGroup } : null,
      requestType: intent,
    }) ?? { hasHistory: false };
  } catch { return { hasHistory: false }; }
}

// ── Main loader ───────────────────────────────────────────────────────────────

export async function loadContext(route, conversationContext = '') {
  const { intent, entities } = route;

  // Run independent lookups in parallel
  const [player, team, allPlayers, memoryContext] = await Promise.all([
    resolvePlayer(entities),
    resolveTeam(entities),
    (intent === 'squad_analysis' || intent === 'player_compare' || intent === 'injury_risk')
      ? resolveAllPlayers()
      : Promise.resolve([]),
    resolveMemoryContext(intent, entities),
  ]);

  return {
    // Core entities
    player,
    team,
    allPlayers,

    // Memory context (prior history)
    memoryContext,
    hasMemory: memoryContext?.hasHistory ?? false,

    // Routing info
    intent,
    entities,

    // Conversation window
    conversationContext,

    // Convenience flags
    hasPlayer:    !!player,
    hasTeam:      !!team,
    hasSquadData: allPlayers.length > 0,
  };
}

// ── Context summary (for prompt injection) ────────────────────────────────────

export function summariseContext(ctx) {
  const parts = [];
  if (ctx.player?.core?.name) {
    parts.push(`Player: ${ctx.player.core.name} (${ctx.player.core.position ?? '?'}, ${ctx.player.core.ageGroup ?? '?'})`);
  }
  if (ctx.team?.name) {
    parts.push(`Team: ${ctx.team.name}`);
  }
  if (ctx.entities?.ageGroup) parts.push(`Age group: ${ctx.entities.ageGroup}`);
  if (ctx.entities?.position)  parts.push(`Position: ${ctx.entities.position}`);
  if (ctx.entities?.durationWeeks) parts.push(`Duration: ${ctx.entities.durationWeeks} weeks`);
  if (ctx.entities?.seasonPhase)   parts.push(`Phase: ${ctx.entities.seasonPhase}`);
  if (ctx.hasSquadData) parts.push(`Squad: ${ctx.allPlayers.length} players in memory`);
  if (ctx.hasMemory)    parts.push('Prior history: yes');
  return parts.join(' | ');
}
