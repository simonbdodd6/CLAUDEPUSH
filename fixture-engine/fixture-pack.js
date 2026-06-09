/**
 * Match Pack Generator
 *
 * Produces the complete pre-match pack for any fixture.
 * The match pack is the single document coaches and players need on matchday.
 *
 * Sections:
 *   1. Fixture details (opponent, venue, kickoff, referee)
 *   2. Squad list (selected, injured, uncertain)
 *   3. Opposition analysis (AI-generated)
 *   4. Final session plan (AI-generated training focus)
 *   5. Volunteer assignments
 *   6. Transport details
 *   7. Medical alerts
 *   8. Player milestones to celebrate
 *   9. Head-to-head record
 *  10. Key messages for the team
 */

import { analyseOpposition } from './fixture-prep.js';
import { daysToKickoff } from './fixture-schema.js';

// ── Lazy imports ──────────────────────────────────────────────────────────────

async function _knowledge() {
  try { return await import('../knowledge-engine/index.js'); } catch { return null; }
}

// ── Match pack entry point ────────────────────────────────────────────────────

export async function generateMatchPack(fixture, options = {}) {
  const knowledge    = await _knowledge();
  const opposition   = await analyseOpposition(fixture);
  const sessionPlan  = await generateFinalSessionPlan(fixture, knowledge);
  const teamMessages = await generateTeamMessages(fixture, knowledge);

  const pack = {
    fixtureId:   fixture.id,
    generatedAt: new Date().toISOString(),
    version:     1,

    // Section 1: Fixture summary
    fixture: {
      teamName:     fixture.teamName,
      opponent:     fixture.opponent,
      competition:  fixture.competition,
      venue:        fixture.venue,
      isHome:       fixture.isHome,
      kickoff:      fixture.kickoff,
      kickoffLabel: dateLabel(fixture.kickoff),
      referee:      fixture.referee ?? 'TBC',
      daysToKickoff: daysToKickoff(fixture),
    },

    // Section 2: Squad
    squad: buildSquadSection(fixture),

    // Section 3: Opposition
    opposition: {
      name:     fixture.opponent,
      analysis: opposition.analysis,
      keyThreats: opposition.keyThreats,
      headToHead: buildHeadToHead(fixture),
    },

    // Section 4: Training focus
    finalSession: sessionPlan,

    // Section 5: Volunteers
    volunteers: buildVolunteerSection(fixture),

    // Section 6: Transport
    transport: buildTransportSection(fixture),

    // Section 7: Medical
    medical: {
      alerts:    fixture.medicalAlerts ?? [],
      firstAider: (fixture.volunteers?.required ?? []).find(v => v.role === 'First Aider')?.assignee ?? 'TBC',
      notes:     'All players with injuries must be cleared by physio before taking the field.',
    },

    // Section 8: Milestones
    milestones: fixture.playerMilestones ?? [],

    // Section 9–10: Messages
    messages: teamMessages,

    // Summary for notifications
    summary: buildPackSummary(fixture),
  };

  return pack;
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildSquadSection(fixture) {
  const s = fixture.squadStatus ?? {};
  const available = s.available ?? [];
  const unavailable = s.unavailable ?? [];
  const uncertain = s.uncertain ?? [];
  const selected = s.selected ?? [];

  const availInfo = available[0] ?? {};
  const fit = (availInfo.playerCount ?? 0) - (availInfo.injured ?? 0);

  return {
    summary:    selected.length > 0
      ? `${selected.length} players selected`
      : `${fit} players available (estimated)`,
    selected:   selected,
    injured:    unavailable.map(p => `${p.name} — ${(p.injuries ?? ['Injury']).join(', ')}`),
    uncertain:  uncertain.map(p => `${p.name} — ${p.reason}`),
    availabilityRate: fixture._availabilityRate ?? null,
    locked:     !!fixture.squadLockedAt,
    lockedAt:   fixture.squadLockedAt,
  };
}

function buildHeadToHead(fixture) {
  const prev = fixture.previousMeetings ?? [];
  if (prev.length === 0) {
    return { meetings: 0, record: 'No previous meetings recorded.', lastResult: null };
  }
  const wins   = prev.filter(m => m.result === 'win').length;
  const losses = prev.filter(m => m.result === 'loss').length;
  const draws  = prev.filter(m => m.result === 'draw').length;
  const last   = prev[prev.length - 1];
  return {
    meetings: prev.length,
    record:   `W${wins} D${draws} L${losses}`,
    lastResult: last ? `${last.date}: ${last.score ?? last.result}` : null,
    history:  prev.slice(-3),
  };
}

function buildVolunteerSection(fixture) {
  const required = fixture.volunteers?.required ?? [];
  const confirmed = required.filter(r => r.filled);
  const missing   = required.filter(r => !r.filled);
  return {
    roles:      required,
    confirmed:  confirmed.map(r => `${r.role}: ${r.assignee}`),
    missing:    missing.map(r => r.role),
    complete:   missing.length === 0,
    note:       missing.length > 0
      ? `⚠ ${missing.length} volunteer role(s) not yet filled. Action required.`
      : '✓ All volunteer roles confirmed.',
  };
}

function buildTransportSection(fixture) {
  const t = fixture.transport ?? {};
  if (!t.required) {
    return { required: false, note: 'Home fixture — no transport required.' };
  }
  return {
    required:      true,
    arranged:      t.arranged ?? false,
    details:       t.details   ?? 'Transport not yet arranged.',
    departureTime: t.departureTime ?? 'TBC',
    venue:         fixture.venue,
    note:          t.arranged
      ? `✓ Transport confirmed. Departure: ${t.departureTime ?? 'TBC'}.`
      : `⚠ Away fixture. Transport to ${fixture.venue} not yet arranged.`,
  };
}

function buildPackSummary(fixture) {
  const s       = fixture.squadStatus ?? {};
  const avail   = fixture._availabilityRate;
  const missingVols = (fixture.volunteers?.missing ?? []).length;

  const items = [
    `${fixture.teamName} vs ${fixture.opponent}`,
    `📅 ${dateLabel(fixture.kickoff)}`,
    `📍 ${fixture.isHome ? 'Home' : 'Away'} — ${fixture.venue}`,
    avail != null ? `👥 ~${avail}% squad available` : null,
    (s.injured ?? []).length > 0 ? `🤕 ${s.injured.length} player(s) unavailable` : null,
    missingVols > 0 ? `⚠ ${missingVols} volunteer role(s) unfilled` : '✓ Volunteers confirmed',
    fixture.transport?.required && !fixture.transport?.arranged ? '⚠ Transport not arranged' : null,
  ].filter(Boolean);

  return items.join(' · ');
}

// ── AI-generated sections ─────────────────────────────────────────────────────

async function generateFinalSessionPlan(fixture, knowledge) {
  if (!knowledge) {
    return {
      focus:       'Final preparation session',
      duration:    45,
      activities:  ['Light warm-up', 'Set piece practice', 'Game intensity drill', 'Team talk', 'Cool-down'],
      coachNotes:  'Keep the session short and sharp. Focus on confidence, not new patterns.',
      source:      'default',
    };
  }

  const injured = (fixture.squadStatus?.injured ?? []).length;
  const prompt  = `Generate a 45-minute pre-match preparation session plan for ${fixture.ageGroup ?? 'Senior'} rugby team playing ${fixture.opponent} tomorrow. ` +
    `${injured > 0 ? `${injured} players are injured and not training.` : ''} ` +
    `Keep it short, sharp, high-confidence. Include: warm-up, 2 key focus drills, set piece practice, team talk. Under 120 words.`;

  try {
    const result = await knowledge.ask(prompt, { maxTokens: 200 });
    return {
      focus:      `Preparation for ${fixture.opponent}`,
      duration:   45,
      activities: parseActivities(result?.answer),
      aiPlan:     result?.answer ?? null,
      source:     'knowledge-engine',
    };
  } catch {
    return {
      focus:      'Final preparation session',
      duration:   45,
      activities: ['Light warm-up', 'Set piece practice', 'Game intensity drill', 'Team talk'],
      source:     'fallback',
    };
  }
}

async function generateTeamMessages(fixture, knowledge) {
  const days = daysToKickoff(fixture);
  if (!knowledge) {
    return {
      playerMessage: `${fixture.teamName} — let's go. ${fixture.opponent} on ${dateLabel(fixture.kickoff)}.`,
      coachFocus:    'Execution. Keep to the game plan. Back yourselves.',
      source:        'default',
    };
  }

  const prompt = `Write two short messages for a ${fixture.ageGroup ?? 'Senior'} rugby team: ` +
    `(1) a motivational pre-match message for the players (2 sentences), ` +
    `(2) a coach's tactical focus message (1 sentence). ` +
    `Opponent: ${fixture.opponent}. ${fixture.isHome ? 'Home match.' : 'Away match.'}`;

  try {
    const result = await knowledge.ask(prompt, { maxTokens: 150 });
    return {
      playerMessage: result?.answer ?? `Ready for ${fixture.opponent}.`,
      source:        'knowledge-engine',
    };
  } catch {
    return {
      playerMessage: `Team — give everything on ${dateLabel(fixture.kickoff)}.`,
      source:        'fallback',
    };
  }
}

function parseActivities(text) {
  if (!text) return ['Warm-up', 'Drills', 'Set pieces', 'Team talk'];
  const lines = text.split('\n').map(l => l.replace(/^[-\d.*•]\s*/, '').trim()).filter(l => l.length > 5 && l.length < 80);
  return lines.slice(0, 6);
}

// ── Utility ───────────────────────────────────────────────────────────────────

function dateLabel(isoDate) {
  if (!isoDate) return 'TBC';
  return new Date(isoDate).toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}
