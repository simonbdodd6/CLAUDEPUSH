/**
 * Fixture & Match Intelligence Engine — Public API
 *
 * The engine that makes the Club Digital Twin aware of time.
 * Every fixture is an intelligent object that tracks its own lifecycle.
 *
 * Quick start:
 *   import { createFixture, getUpcomingFixtures, prepareFixture, generateMatchPack } from './fixture-engine/index.js';
 *
 *   const f = createFixture({ teamId: 'team_senior_xxx', opponent: 'Rival RFC', kickoff: '2026-06-21T15:00:00Z', isHome: true });
 *   await prepareFixture(f.id);
 *   const pack = await generateMatchPack(f.id);
 */

// ── Schema & storage ──────────────────────────────────────────────────────────
export {
  createFixture, generateFixtureId,
  FIXTURE_STATUS, RESULT_STATUS, COMPETITION_TYPES, PREP_STAGE,
  daysToKickoff, derivePrepStage, formatScore, serializeFixture,
} from './fixture-schema.js';

export {
  saveFixture, getFixture, deleteFixture,
  listAllFixtures, listFixturesByTeam, listFixturesByStatus,
  listUpcomingFixtures, listRecentFixtures, getNextFixture,
  fixtureCount, fixtureStats, clearAllFixtures,
} from './fixture-store.js';

// ── Timeline ──────────────────────────────────────────────────────────────────
export {
  generateTimeline, getActionableTasks, getUpcomingTasks,
  markTaskDone, timelineProgress, TASK_TYPES, TASK_STATUS,
} from './fixture-timeline.js';

// ── Preparation ───────────────────────────────────────────────────────────────
export { prepareFixture, analyseOpposition, buildAvailabilityPoll } from './fixture-prep.js';

// ── Match pack ────────────────────────────────────────────────────────────────
export { generateMatchPack } from './fixture-pack.js';

// ── Post-match ────────────────────────────────────────────────────────────────
export {
  completeFixture, generatePostMatchReview, generatePlayerReports, updateDigitalTwin,
} from './fixture-review.js';

// ── Standings & season ────────────────────────────────────────────────────────
export {
  updateSeasonTimeline, getSeasonStandings, getTeamSeasonSummary, getUpcomingFixturesSummary,
} from './fixture-standings.js';

// ── Convenience functions ─────────────────────────────────────────────────────

import { createFixture }                                  from './fixture-schema.js';
import { saveFixture, getFixture, listUpcomingFixtures }  from './fixture-store.js';
import { generateTimeline }                               from './fixture-timeline.js';
import { prepareFixture }                                 from './fixture-prep.js';
import { generateMatchPack }                              from './fixture-pack.js';
import { completeFixture, generatePostMatchReview, updateDigitalTwin } from './fixture-review.js';
import { updateSeasonTimeline, getSeasonStandings }       from './fixture-standings.js';

/**
 * Create + save + auto-generate timeline for a new fixture.
 */
export async function scheduleFixture(data) {
  const fixture = createFixture(data);
  fixture.preparationChecklist = generateTimeline(fixture);
  return saveFixture(fixture);
}

/**
 * Get upcoming fixtures, each serialized with daysToKickoff.
 */
export async function getUpcomingFixtures(limit = 10) {
  const { serializeFixture } = await import('./fixture-schema.js');
  return listUpcomingFixtures(limit).map(serializeFixture);
}

/**
 * Get a single fixture by ID (throws if not found).
 */
export { getFixture as getFixtureById } from './fixture-store.js';

/**
 * Full post-match pipeline: complete → review → update twin.
 */
export async function finaliseMatch(fixtureId, result, reviewNotes = {}) {
  const completed = await completeFixture(fixtureId, result);
  const review    = await generatePostMatchReview(fixtureId, reviewNotes);
  const twinUpdate = await updateDigitalTwin(fixtureId);
  return { fixture: completed, review, twinUpdate };
}

// ── Default export ────────────────────────────────────────────────────────────

export default {
  // Lifecycle
  scheduleFixture,
  getUpcomingFixtures,
  prepareFixture,
  generateMatchPack,
  completeFixture,
  finaliseMatch,
  generatePostMatchReview,
  updateDigitalTwin,
  // Season
  updateSeasonTimeline,
  getSeasonStandings,
};
