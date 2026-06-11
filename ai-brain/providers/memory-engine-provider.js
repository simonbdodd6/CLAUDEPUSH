export const name = 'memoryEngine'

export const fallback = {
  players:     [],
  teams:       [],
  playerCount: 0,
  teamCount:   0,
  available:   false,
}

export async function fetch() {
  try {
    const { getAllPlayers, getAllTeams } = await import('../../memory-engine/index.js')
    const [players, teams] = await Promise.all([
      Promise.resolve().then(() => getAllPlayers()).catch(() => []),
      Promise.resolve().then(() => getAllTeams()).catch(() => []),
    ])
    return {
      players:     Array.isArray(players) ? players : [],
      teams:       Array.isArray(teams)   ? teams   : [],
      playerCount: Array.isArray(players) ? players.length : 0,
      teamCount:   Array.isArray(teams)   ? teams.length   : 0,
      available:   true,
    }
  } catch {
    return fallback
  }
}
