/**
 * Season Intelligence Engine — public API
 */

export {
  PHASE,
  detectCurrentPhase,
  getPhaseMeta,
  getSeasonYear,
  getSeasonLabel,
  getSeasonWeek,
  getPhaseProgress,
  getUpcomingPhases,
  getAllPhases,
  daysUntilNextPhase,
} from './season-phases.js';

export { getPrescription, compareToPrescription } from './phase-prescriptions.js';

export { buildTeamHealthScore, buildMultiTeamSummary, WEIGHTS } from './team-health-score.js';

export { buildClubHealthScore, getClubHealthDelta } from './club-health-score.js';

export {
  generateAllPredictions,
  playerWorkloadForecast,
  attendanceForecast,
  availabilityTrajectory,
  injuryRiskIndex,
  seasonOutcomeProjection,
} from './predictive-models.js';

export {
  runSimulation,
  getGapSummary,
  compareSimulations,
} from './season-simulation.js';

export {
  saveSnapshot,
  loadSnapshots,
  loadLatestSnapshot,
  getHealthTrend,
} from './season-store.js';
