/**
 * Player Development Intelligence Engine — Public API
 *
 * Every AI feature that needs to assess player progress calls this module.
 * Integrates with the Memory Engine automatically when available.
 */

import {
  runPlayerAnalysis,
  runTeamAnalysis,
  comparePlayers as _comparePlayers,
  generateDevelopmentReport as _generateDevelopmentReport,
} from './progress-engine.js';
import { predictNextPhase as _predictNextPhase } from './projection-engine.js';

// Lazy memory engine import to avoid circular deps
let _memoryEngine = null;
async function getMemoryEngine() {
  if (!_memoryEngine) {
    try {
      _memoryEngine = await import('../../memory-engine/index.js');
    } catch {
      _memoryEngine = null;
    }
  }
  return _memoryEngine;
}

// ── Resolve player data from memory or raw input ──────────────────────────────

async function resolvePlayerData(playerInput) {
  const mem = await getMemoryEngine();
  if (mem && playerInput?.name) {
    try {
      const memoryPlayer = await mem.getPlayer(playerInput);
      if (memoryPlayer) return memoryPlayer;
    } catch {
      // fall through to raw input
    }
  }
  return playerInput;
}

async function resolvePlayerProgrammes(player) {
  const mem = await getMemoryEngine();
  if (mem && player?.id) {
    try {
      const allProgrammes = await mem.getAllProgrammes?.({ playerId: player.id }) ?? [];
      if (allProgrammes.length > 0) return allProgrammes;
    } catch {
      // fall through
    }
  }
  return player?.programmes ?? [];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a full development analysis for a single player.
 *
 * @param {Object} playerInput - Player data or identifier (name/id)
 * @param {Object} options     - { programmes: [], memoryOff: false }
 * @returns {Promise<Object>}  - Full analysis result
 */
export async function analysePlayer(playerInput, options = {}) {
  const player     = options.memoryOff ? playerInput : await resolvePlayerData(playerInput);
  const programmes = options.programmes ?? (options.memoryOff ? [] : await resolvePlayerProgrammes(player));
  return runPlayerAnalysis(player, programmes);
}

/**
 * Run a development analysis for an entire team.
 *
 * @param {Object[]} players          - Array of player inputs
 * @param {Object}   programmesByPlayer - { [playerId]: programmes[] }
 * @returns {Promise<Object>}
 */
export async function analyseTeam(players, programmesByPlayer = {}) {
  return runTeamAnalysis(players, programmesByPlayer);
}

/**
 * Compare multiple players side-by-side.
 *
 * @param {Object[]} players
 * @param {Object}   programmesByPlayer
 * @returns {Promise<Object>}
 */
export async function comparePlayers(players, programmesByPlayer = {}) {
  return _comparePlayers(players, programmesByPlayer);
}

/**
 * Generate a formatted development report (Markdown or JSON).
 *
 * @param {Object} playerInput
 * @param {Object[]} programmes
 * @param {Object} options - { format: 'markdown'|'json', generatedAt }
 * @returns {Promise<string|Object>}
 */
export async function generateDevelopmentReport(playerInput, programmes = [], options = {}) {
  const player   = await resolvePlayerData(playerInput);
  const progs    = programmes.length > 0 ? programmes : await resolvePlayerProgrammes(player);
  return _generateDevelopmentReport(player, progs, options);
}

/**
 * Predict the next development phase for a player.
 *
 * @param {Object}   playerInput
 * @param {Object[]} programmes
 * @returns {Promise<Object>}
 */
export async function predictNextPhase(playerInput, programmes = []) {
  const player = await resolvePlayerData(playerInput);
  const progs  = programmes.length > 0 ? programmes : await resolvePlayerProgrammes(player);
  const analysis = await runPlayerAnalysis(player, progs);
  return _predictNextPhase(player, progs, analysis.analyses);
}

export default {
  analysePlayer,
  analyseTeam,
  comparePlayers,
  generateDevelopmentReport,
  predictNextPhase,
};
