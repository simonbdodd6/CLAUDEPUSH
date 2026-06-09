/**
 * Post-Match Review
 *
 * Records match results, generates AI-powered post-match analysis,
 * produces per-player performance notes, and feeds results back
 * into the Club Digital Twin.
 */

import { FIXTURE_STATUS, RESULT_STATUS, computeResultStatus } from './fixture-schema.js';
import { getFixture, saveFixture } from './fixture-store.js';
import { markTaskDone, TASK_TYPES } from './fixture-timeline.js';

// ── Lazy imports ──────────────────────────────────────────────────────────────

async function _knowledge() {
  try { return await import('../knowledge-engine/index.js'); } catch { return null; }
}
async function _twin() {
  try { return await import('../club-digital-twin/index.js'); } catch { return null; }
}

// ── Complete a fixture (record result) ────────────────────────────────────────

/**
 * Mark a fixture as completed with a result.
 *
 * @param {string} fixtureId
 * @param {object} result — { teamScore, opponentScore, scorers?, yellowCards?, manOfMatch?, coachNotes? }
 * @returns {Fixture} — updated fixture
 */
export async function completeFixture(fixtureId, result = {}) {
  const fixture = getFixture(fixtureId);
  if (!fixture) throw new Error(`Fixture not found: ${fixtureId}`);

  // Merge result
  fixture.result = {
    ...fixture.result,
    teamScore:      result.teamScore     ?? fixture.result?.teamScore    ?? 0,
    opponentScore:  result.opponentScore ?? fixture.result?.opponentScore ?? 0,
    scorers:        result.scorers       ?? fixture.result?.scorers      ?? [],
    yellowCards:    result.yellowCards   ?? fixture.result?.yellowCards  ?? [],
    redCards:       result.redCards      ?? fixture.result?.redCards     ?? [],
    manOfMatch:     result.manOfMatch    ?? fixture.result?.manOfMatch   ?? null,
    coachNotes:     result.coachNotes    ?? fixture.result?.coachNotes   ?? null,
    attendance:     result.attendance    ?? fixture.result?.attendance   ?? null,
  };

  fixture.result.status = computeResultStatus(fixture) ?? RESULT_STATUS.VOID;
  fixture.status        = FIXTURE_STATUS.COMPLETED;

  // Mark squad-lock and coach-review tasks as done
  markTaskDone(fixture, TASK_TYPES.SQUAD_LOCK);
  markTaskDone(fixture, TASK_TYPES.COACH_REVIEW);

  return saveFixture(fixture);
}

// ── Post-match review ─────────────────────────────────────────────────────────

/**
 * Generate a full post-match review.
 *
 * @param {string} fixtureId
 * @param {object} [additionalNotes] — any extra coach observations
 * @returns {PostMatchReview}
 */
export async function generatePostMatchReview(fixtureId, additionalNotes = {}) {
  const fixture   = getFixture(fixtureId);
  if (!fixture) throw new Error(`Fixture not found: ${fixtureId}`);
  if (fixture.status !== FIXTURE_STATUS.COMPLETED) {
    throw new Error(`Fixture ${fixtureId} is not completed — call completeFixture() first.`);
  }

  const knowledge = await _knowledge();
  const narrative = await buildReviewNarrative(fixture, knowledge, additionalNotes);
  const insights  = generateMatchInsights(fixture);

  const review = {
    fixtureId:   fixture.id,
    teamName:    fixture.teamName,
    opponent:    fixture.opponent,
    competition: fixture.competition,
    kickoff:     fixture.kickoff,

    result: {
      score:       `${fixture.result.teamScore}–${fixture.result.opponentScore}`,
      outcome:     fixture.result.status,
      scorers:     fixture.result.scorers,
      manOfMatch:  fixture.result.manOfMatch,
      yellowCards: fixture.result.yellowCards,
      redCards:    fixture.result.redCards,
    },

    narrative,
    insights,
    coachNotes:  fixture.result.coachNotes ?? additionalNotes.coachNotes ?? null,

    performanceAreas: buildPerformanceAreas(fixture, additionalNotes),
    nextFixtureFocus: buildNextFixtureFocus(fixture, additionalNotes),

    generatedAt: new Date().toISOString(),
    source:      knowledge ? 'knowledge-engine' : 'model',
  };

  // Persist review on fixture
  fixture.postMatchReview = review;
  markTaskDone(fixture, TASK_TYPES.PLAYER_REPORTS);
  saveFixture(fixture);

  return review;
}

// ── Player performance reports ────────────────────────────────────────────────

export function generatePlayerReports(fixture, ratings = []) {
  const selected = fixture.squadStatus?.selected ?? [];
  const reports  = [];

  // Use provided ratings if given, otherwise generate defaults
  const ratingMap = Object.fromEntries((ratings ?? []).map(r => [r.playerId ?? r.name, r]));

  for (const p of selected) {
    const r = ratingMap[p.id] ?? ratingMap[p.name] ?? {};
    reports.push({
      playerId: p.id,
      name:     p.name ?? 'Player',
      position: p.position ?? null,
      rating:   r.rating ?? null,
      notes:    r.notes  ?? `Performance noted — full review pending from coaching staff.`,
      manOfMatch: fixture.result?.manOfMatch === p.name || fixture.result?.manOfMatch === p.id,
    });
  }

  // Persist
  fixture.playerReports = reports;
  markTaskDone(fixture, TASK_TYPES.PLAYER_REPORTS);
  saveFixture(fixture);

  return reports;
}

// ── Digital Twin update ───────────────────────────────────────────────────────

/**
 * Feed match result back into the Club Digital Twin.
 * Updates: team results, player attendance (if squad selected), club health.
 */
export async function updateDigitalTwin(fixtureId) {
  const fixture = getFixture(fixtureId);
  if (!fixture) throw new Error(`Fixture not found: ${fixtureId}`);

  const twinMod = await _twin();
  if (!twinMod) {
    return { updated: false, reason: 'Digital Twin not available' };
  }

  // Trigger a fresh Digital Twin build which will pick up the result
  // (The twin reads from Memory Engine which would have been updated)
  try {
    await twinMod.runDigitalTwin({ saveTrends: true, withPredictions: false });
    fixture.twinUpdateApplied = true;
    markTaskDone(fixture, TASK_TYPES.TWIN_UPDATE);
    saveFixture(fixture);

    return {
      updated:   true,
      fixtureId: fixture.id,
      result:    `${fixture.teamName} ${fixture.result.teamScore}–${fixture.result.opponentScore} ${fixture.opponent}`,
      at:        new Date().toISOString(),
    };
  } catch (e) {
    return { updated: false, reason: e.message };
  }
}

// ── Narrative builder ─────────────────────────────────────────────────────────

async function buildReviewNarrative(fixture, knowledge, notes) {
  if (!knowledge) return buildFallbackNarrative(fixture, notes);

  const won    = fixture.result.status === RESULT_STATUS.WIN;
  const drew   = fixture.result.status === RESULT_STATUS.DRAW;
  const score  = `${fixture.result.teamScore}–${fixture.result.opponentScore}`;
  const outcome = won ? 'won' : drew ? 'drew' : 'lost';

  const prompt = `Write a concise 2-paragraph post-match review for ${fixture.teamName} who ${outcome} ${score} ` +
    `against ${fixture.opponent} (${fixture.competition}). ` +
    `${fixture.result.manOfMatch ? `Man of the match: ${fixture.result.manOfMatch}.` : ''} ` +
    `${fixture.result.coachNotes ? `Coach notes: ${fixture.result.coachNotes}` : ''} ` +
    `${notes.observations ? `Additional observations: ${notes.observations}` : ''} ` +
    `Tone: professional, analytical, constructive. Under 120 words.`;

  try {
    const result = await knowledge.ask(prompt, { maxTokens: 200 });
    return result?.answer ?? buildFallbackNarrative(fixture, notes);
  } catch {
    return buildFallbackNarrative(fixture, notes);
  }
}

function buildFallbackNarrative(fixture, _notes) {
  const r      = fixture.result;
  const won    = r.status === RESULT_STATUS.WIN;
  const drew   = r.status === RESULT_STATUS.DRAW;
  const score  = `${r.teamScore}–${r.opponentScore}`;
  const outcome = won ? 'victory' : drew ? 'draw' : 'defeat';

  return `${fixture.teamName} recorded a ${score} ${outcome} against ${fixture.opponent} ` +
    `in the ${fixture.competition} at ${fixture.venue ?? 'the venue'}. ` +
    `${r.manOfMatch ? `Man of the match: ${r.manOfMatch}. ` : ''}` +
    `${r.coachNotes ?? 'Full coaching review to follow.'}`;
}

function generateMatchInsights(fixture) {
  const insights = [];
  const r = fixture.result;

  if (r.status === RESULT_STATUS.WIN) {
    insights.push({ type: 'result', text: `${fixture.teamName} secured a ${r.teamScore - r.opponentScore}-point win.` });
  } else if (r.status === RESULT_STATUS.LOSS) {
    insights.push({ type: 'result', text: `${r.opponentScore - r.teamScore}-point margin to address in training.` });
  }

  if ((r.yellowCards ?? []).length >= 2) {
    insights.push({ type: 'discipline', text: `${r.yellowCards.length} yellow cards — discipline needs attention.`, priority: 'high' });
  }
  if ((r.redCards ?? []).length > 0) {
    insights.push({ type: 'discipline', text: `${r.redCards.length} red card(s) — serious discipline review required.`, priority: 'critical' });
  }
  if (r.scorers?.length >= 5) {
    insights.push({ type: 'attack', text: `Strong attacking performance — ${r.scorers.length} scorers involved.` });
  }
  if (fixture._availabilityRate && fixture._availabilityRate < 75) {
    insights.push({ type: 'squad', text: `Managed with reduced squad (${fixture._availabilityRate}% availability). Squad depth is a priority.` });
  }

  return insights;
}

function buildPerformanceAreas(fixture, notes) {
  const areas = {
    strengths: notes.strengths ?? [],
    improvements: notes.improvements ?? [],
    focus: [],
  };

  // Derive from result
  if (fixture.result.status === RESULT_STATUS.WIN) {
    areas.strengths.push('Secured the win under match conditions.');
    areas.focus.push('Maintain momentum into next fixture.');
  } else {
    areas.improvements.push('Review key moments where score changed.');
    areas.focus.push('Address identified weaknesses in next training block.');
  }

  // Discipline
  if ((fixture.result.redCards ?? []).length > 0) {
    areas.improvements.push('Discipline — red card(s) this match cannot be repeated.');
  }

  return areas;
}

function buildNextFixtureFocus(fixture, notes) {
  return notes.nextFocus ?? `Continue the ${fixture.result.status === RESULT_STATUS.WIN ? 'positive' : 'corrective'} work from this match. Review key phases in the next training session.`;
}
