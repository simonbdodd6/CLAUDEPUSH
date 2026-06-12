/**
 * AI Brain — Coach Experience API (M15)
 *
 * The ONLY interface between Coach's Eye Core and Coach's Eye Intelligence.
 *
 * All methods return a stable ApiResponse envelope:
 *   { apiVersion, status, ok, generatedAt, durationMs, data, error }
 *
 * Core checks `response.ok` before reading `response.data`.
 * Core checks `response.apiVersion` to version-gate behaviour.
 * Core passes `opts.flags` to disable individual endpoints.
 *
 * Nothing below this line is exported to Core.
 */

export { getDashboard }    from './dashboard.js'
export { getPlayerInsight } from './player-insight.js'
export { getTeamInsight }  from './team-insight.js'
export { getClubInsight }  from './club-insight.js'

// Types re-exported for Core consumers who need the flag/version constants
export { API_VERSION, FEATURE_FLAG, API_STATUS, API_ERROR } from './api-types.js'
