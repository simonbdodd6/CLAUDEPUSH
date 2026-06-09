/**
 * Coaching Engine Adapter
 * Registers the Coaching Engine as a Copilot tool.
 * Handles: build_programme, build_session, build_rehab
 */

import { registerTool } from '../tool-registry.js';

let _engine = null;
async function engine() {
  if (!_engine) {
    try { _engine = await import('../../qa/coaching-engine/index.js'); }
    catch { _engine = null; }
  }
  return _engine;
}

function playerProfileFromContext(ctx) {
  const player   = ctx.player;
  const entities = ctx.entities ?? {};

  if (player?.core) {
    return {
      name:        player.core.name,
      age:         player.core.age,
      position:    player.core.position    ?? entities.position,
      experience:  player.core.experience  ?? 'Intermediate',
      goals:       (player.goals ?? []).map(g => g.goal ?? g),
      injuries:    (player.injuries ?? []).filter(i => i.status === 'active').map(i => i.type),
      trainingDays: 3,
      equipment:   ['Full gym'],
      seasonPhase: entities.seasonPhase ?? 'preseason',
    };
  }

  // No player in memory — build from entities
  return {
    name:        entities.playerName ?? 'Player',
    position:    entities.position   ?? 'Forward',
    experience:  'Intermediate',
    goals:       entities.sessionFocus ? [entities.sessionFocus] : ['Strength', 'Fitness'],
    injuries:    [],
    trainingDays: entities.durationWeeks ? Math.min(5, 3) : 3,
    equipment:   ['Full gym'],
    seasonPhase: entities.seasonPhase ?? 'preseason',
    durationWeeks: entities.durationWeeks ?? 8,
  };
}

function sessionInputFromContext(ctx) {
  const entities = ctx.entities ?? {};
  return {
    ageGroup:   entities.ageGroup   ?? ctx.team?.ageGroup ?? 'Senior',
    focus:      entities.sessionFocus ?? 'General fitness and skills',
    duration:   entities.ageGroup === 'U8' ? 60 : entities.ageGroup?.startsWith('U1') ? 75 : 90,
    playerCount: ctx.allPlayers?.length || 20,
    position:   entities.position,
    sessionType: 'standard',
  };
}

registerTool({
  name:        'coaching-engine',
  version:     '1.0.0',
  description: 'Generates personalised training programmes, sessions, and rehabilitation plans',
  capabilities: ['build_programme', 'build_session', 'build_rehab', 'weekly_plan'],
  priority:    90,

  async execute(intent, context, options = {}) {
    const e = await engine();

    if (intent === 'build_session' || intent === 'weekly_plan') {
      const sessionInput = sessionInputFromContext(context);

      if (e) {
        try {
          const result = await e.generateSession(
            { ageGroup: sessionInput.ageGroup, players: context.allPlayers },
            { focus: sessionInput.focus, duration: sessionInput.duration },
            null,
            { memory: false }
          );
          return {
            success:  true,
            data:     result,
            summary:  `Training session generated for ${sessionInput.ageGroup} — focus: ${sessionInput.focus}`,
            evidence: [
              `Age group: ${sessionInput.ageGroup}`,
              `Session focus: ${sessionInput.focus}`,
              `Duration: ${sessionInput.duration} minutes`,
            ],
          };
        } catch (err) {
          // fall through to template
        }
      }

      // Template fallback
      return {
        success:  true,
        data:     buildTemplateSession(sessionInput),
        summary:  `Training session template for ${sessionInput.ageGroup} — ${sessionInput.focus}`,
        evidence: [`Generated from template — install Coaching Engine for AI-powered sessions`],
      };
    }

    if (intent === 'build_programme' || intent === 'weekly_plan') {
      const profile = playerProfileFromContext(context);
      if (e) {
        try {
          const result = await e.generateProgramme(profile, null, { memory: false });
          return {
            success:  true,
            data:     result,
            summary:  `${profile.durationWeeks ?? 8}-week programme generated for ${profile.name}`,
            evidence: [
              `Player: ${profile.name} (${profile.position})`,
              `Goals: ${profile.goals.join(', ')}`,
              `Season phase: ${profile.seasonPhase}`,
            ],
          };
        } catch (err) {
          // fall through
        }
      }
      return {
        success:  true,
        data:     buildTemplateProgramme(profile),
        summary:  `${profile.durationWeeks ?? 8}-week programme template for ${profile.name}`,
        evidence: [`Generated from template — install Coaching Engine for AI-powered programmes`],
      };
    }

    if (intent === 'build_rehab') {
      const profile = playerProfileFromContext(context);
      if (e) {
        try {
          const result = await e.generateRehabPlan(profile, null, { memory: false });
          return {
            success:  true,
            data:     result,
            summary:  `Rehabilitation plan generated for ${profile.name}`,
            evidence: [`Injuries: ${profile.injuries.join(', ') || 'specified'}`],
          };
        } catch (err) {
          // fall through
        }
      }
      return {
        success:  true,
        data:     buildTemplateRehab(profile),
        summary:  `Rehabilitation plan template for ${profile.name}`,
        evidence: ['Template plan — specify injury type for targeted rehab'],
      };
    }

    return { success: false, error: `Intent ${intent} not handled by coaching-engine`, data: null, summary: '', evidence: [] };
  },
});

// ── Template fallbacks ────────────────────────────────────────────────────────

function buildTemplateSession(input) {
  return {
    ageGroup: input.ageGroup,
    focus:    input.focus,
    durationMinutes: input.duration,
    warmup: {
      duration: Math.round(input.duration * 0.15),
      activities: ['Dynamic stretching', 'Ball-handling circuit', 'Activation drills'],
    },
    mainBody: {
      duration: Math.round(input.duration * 0.65),
      blocks: [
        { name: `${input.focus} — Block 1`, duration: 20, description: 'Core skill development drills' },
        { name: `${input.focus} — Block 2`, duration: 20, description: 'Conditioned game or unit work' },
      ],
    },
    cooldown: {
      duration: Math.round(input.duration * 0.1),
      activities: ['Static stretching', 'Debrief', 'Session notes'],
    },
    coachNotes: `Focus on ${input.focus}. Monitor intensity for ${input.ageGroup} guidelines.`,
    _template: true,
  };
}

function buildTemplateProgramme(profile) {
  const weeks = profile.durationWeeks ?? 8;
  return {
    player: { name: profile.name, position: profile.position },
    durationWeeks: weeks,
    goals:  profile.goals,
    phases: [
      { weeks: '1-2', focus: 'Foundation & assessment', sessions: 3 },
      { weeks: `3-${Math.floor(weeks * 0.6)}`, focus: 'Progressive overload', sessions: 3 },
      { weeks: `${Math.floor(weeks * 0.6) + 1}-${weeks}`, focus: 'Peak & consolidation', sessions: 3 },
    ],
    _template: true,
  };
}

function buildTemplateRehab(profile) {
  return {
    player:    { name: profile.name },
    injuries:  profile.injuries,
    phases: [
      { week: '1-2', focus: 'Rest & reduce inflammation', load: 'None' },
      { week: '3-4', focus: 'Range of motion restoration', load: 'Light' },
      { week: '5-6', focus: 'Strength rebuild', load: 'Moderate' },
      { week: '7-8', focus: 'Return-to-play progression', load: 'Progressive' },
    ],
    clearanceCriteria: ['Full pain-free range of motion', 'Position-specific fitness test passed', 'Physio sign-off'],
    _template: true,
  };
}
