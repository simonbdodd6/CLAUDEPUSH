/**
 * Fixture Preparation
 *
 * Enriches a fixture with live data from the Club Digital Twin:
 * - Squad status (available, injured, uncertain)
 * - Medical alerts
 * - Player milestones
 * - Volunteer gaps
 * - Opposition analysis
 *
 * Called by prepareFixture() and at each timeline trigger.
 * Never modifies the Digital Twin — read-only.
 */

import { FIXTURE_STATUS, derivePrepStage } from './fixture-schema.js';
import { generateTimeline, TASK_STATUS } from './fixture-timeline.js';
import { saveFixture, getFixture } from './fixture-store.js';

// ── Lazy Digital Twin import ──────────────────────────────────────────────────

async function _twin() {
  try { return await import('../club-digital-twin/index.js'); } catch { return null; }
}
async function _knowledge() {
  try { return await import('../knowledge-engine/index.js'); } catch { return null; }
}

// ── Prepare a fixture ─────────────────────────────────────────────────────────

/**
 * Enrich a fixture with live Digital Twin data.
 * Returns the updated, persisted fixture.
 */
export async function prepareFixture(fixtureId) {
  const fixture = getFixture(fixtureId);
  if (!fixture) throw new Error(`Fixture not found: ${fixtureId}`);

  const twinMod = await _twin();
  const model   = twinMod ? await safeFetch(() => twinMod.getClub()) : null;

  // Update squad status from Digital Twin
  if (model) {
    enrichSquad(fixture, model);
    enrichMedicalAlerts(fixture, model);
    enrichPlayerMilestones(fixture, model);
    enrichVolunteers(fixture, model);
  }

  // Generate or refresh preparation timeline
  if (!fixture.preparationChecklist || fixture.preparationChecklist.length === 0) {
    fixture.preparationChecklist = generateTimeline(fixture);
  }

  fixture.status    = FIXTURE_STATUS.PREPARING;
  fixture.prepStage = derivePrepStage(fixture);

  return saveFixture(fixture);
}

// ── Squad enrichment ──────────────────────────────────────────────────────────

function enrichSquad(fixture, model) {
  const allPlayers = model.players ?? {};
  const injured    = allPlayers.injured    ?? [];
  const atRisk     = allPlayers.atRisk     ?? [];
  const available  = [];
  const uncertain  = [];
  const unavailable = [];

  // Map injured players for this team
  for (const p of injured) {
    if (!isInTeam(p, fixture)) continue;
    unavailable.push({
      id:               p.id,
      name:             p.name,
      reason:           'Injured',
      injuries:         p.injuries ?? [],
      expectedReturn:   null,
    });
  }

  // Map at-risk players as uncertain
  for (const p of atRisk) {
    if (!isInTeam(p, fixture)) continue;
    if (unavailable.some(u => u.id === p.id)) continue; // already in unavailable
    uncertain.push({
      id:          p.id,
      name:        p.name,
      reason:      `Retention risk: ${p.retentionRisk}. May be unavailable.`,
    });
  }

  // Derive team's available players (all team players minus injured/at-risk)
  const teamInContext = model.teams?.find(t => t.id === fixture.teamId);
  if (teamInContext) {
    available.push({
      label:        `${teamInContext.playerCount - unavailable.length} players estimated available`,
      playerCount:  teamInContext.playerCount,
      injured:      teamInContext.activeInjuries ?? 0,
    });
  }

  fixture.squadStatus.injured     = unavailable;
  fixture.squadStatus.uncertain   = uncertain;
  fixture.squadStatus.available   = available;
  fixture.squadStatus.unavailable = unavailable;

  // Availability rate
  const teamPlayers = teamInContext?.playerCount ?? 0;
  const unavailCount = unavailable.length + Math.floor(uncertain.length * 0.5);
  fixture._availabilityRate = teamPlayers > 0 ? Math.round(((teamPlayers - unavailCount) / teamPlayers) * 100) : null;
}

function isInTeam(player, fixture) {
  // If ageGroup known, match on it; otherwise accept all
  if (!fixture.ageGroup) return true;
  return (player.ageGroup ?? '') === fixture.ageGroup || player.teamId === fixture.teamId;
}

// ── Medical alerts ────────────────────────────────────────────────────────────

function enrichMedicalAlerts(fixture, model) {
  const alerts = [];
  const injured = model.players?.injured ?? [];

  for (const p of injured) {
    if (!isInTeam(p, fixture)) continue;
    for (const inj of (p.injuries ?? [])) {
      alerts.push({
        playerId: p.id,
        name:     p.name,
        alert:    `${inj} — player unavailable. Notify first aider on matchday.`,
        severity: 'high',
      });
    }
  }

  // Generic alert if availability is low
  if ((fixture._availabilityRate ?? 100) < 75) {
    alerts.push({
      playerId: null,
      name:     'Squad',
      alert:    `Low squad availability (${fixture._availabilityRate ?? '?'}%). Consider calling up reserves.`,
      severity: 'medium',
    });
  }

  fixture.medicalAlerts = alerts;
}

// ── Player milestones ─────────────────────────────────────────────────────────

function enrichPlayerMilestones(fixture, model) {
  // Synthetic milestone detection — in a full system this reads from player stats
  // For now: flag any player with 0 programmes as "development opportunity"
  const milestones = [];
  const atRisk = model.players?.atRisk ?? [];

  for (const p of atRisk.slice(0, 3)) {
    if (!isInTeam(p, fixture)) continue;
    milestones.push({
      playerId:  p.id,
      name:      p.name,
      milestone: 'Development focus',
      note:      `${p.name} flagged as retention risk — match appearance could re-engage.`,
    });
  }

  fixture.playerMilestones = milestones;
}

// ── Volunteer enrichment ──────────────────────────────────────────────────────

function enrichVolunteers(fixture, model) {
  const vols = model.volunteers ?? {};
  const missing = [...(fixture.volunteers?.required ?? [])];

  // Mark roles as missing based on club-level volunteer coverage
  const coverage = vols.coveragePercent ?? 70;
  if (coverage < 70) {
    for (const r of missing) {
      if (!r.filled) r.missing = true;
    }
  }

  const unfilledRoles = missing.filter(r => !r.filled);
  fixture.volunteers = {
    ...fixture.volunteers,
    missing: unfilledRoles.map(r => r.role),
  };
}

// ── Opposition analysis ───────────────────────────────────────────────────────

export async function analyseOpposition(fixture) {
  const knowledge = await _knowledge();
  if (!knowledge) {
    return {
      opponent:   fixture.opponent,
      analysis:   `No AI analysis available — Knowledge Engine not loaded.`,
      keyThreats: [],
      source:     'none',
    };
  }

  const prompt = `Give a brief tactical analysis for a rugby team preparing to play ${fixture.opponent}. ` +
    `Competition: ${fixture.competition}. ${fixture.isHome ? 'Playing at home.' : `Playing away at ${fixture.venue}.`} ` +
    `Include: likely formation, key threats, recommended defensive focus. Under 150 words.`;

  try {
    const result = await knowledge.ask(prompt, { maxTokens: 200 });
    return {
      opponent:   fixture.opponent,
      analysis:   result?.answer ?? `Analysis pending for ${fixture.opponent}.`,
      keyThreats: [],
      source:     'knowledge-engine',
    };
  } catch {
    return { opponent: fixture.opponent, analysis: `Analysis unavailable.`, keyThreats: [], source: 'error' };
  }
}

// ── Availability poll ─────────────────────────────────────────────────────────

export function buildAvailabilityPoll(fixture) {
  return {
    fixtureId:  fixture.id,
    question:   `Are you available for ${fixture.teamName} vs ${fixture.opponent} on ${dateLabel(fixture.kickoff)}?`,
    options:    ['Yes — I\'m available', 'No — I can\'t make it', 'Uncertain — will confirm later'],
    dueBy:      offsetDate(fixture.kickoff, -2),
    recipients: 'full squad',
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

async function safeFetch(fn) {
  try { return await fn(); } catch { return null; }
}

function dateLabel(isoDate) {
  if (!isoDate) return 'TBC';
  return new Date(isoDate).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function offsetDate(isoDate, days) {
  if (!isoDate) return null;
  return new Date(new Date(isoDate).getTime() + days * 86400_000).toISOString();
}
