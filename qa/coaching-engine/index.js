/**
 * Coach's Eye Coaching Engine — Public API
 *
 * The reusable AI engine that every future coaching feature calls.
 * Accepts structured JSON input, produces structured JSON output.
 * Provider-independent: Claude, OpenAI, Gemini, or local LLM.
 *
 * Usage:
 *   import { generateProgramme, generateSession } from './qa/coaching-engine/index.js';
 *
 *   const programme = await generateProgramme(playerProfile, coachProfile, { provider });
 *   const session   = await generateSession(teamProfile, { focus: 'breakdown' }, coachProfile);
 */

import { generateProgramme, generateRehabPlan } from './programme-generator.js';
import { generateSession } from './session-generator.js';
import { resolveProvider, listProviders } from './providers/index.js';
import { buildProgrammeContext, buildSeasonContext } from './context-builder.js';
import { buildPrompt } from './prompt-builder.js';

export { generateProgramme, generateRehabPlan, generateSession };
export { resolveProvider, listProviders } from './providers/index.js';
export { buildPlayerProfile, normalizePosition, getPositionProfile } from './player-profile.js';
export { buildTeamProfile }    from './team-profile.js';
export { buildCoachProfile }   from './coach-profile.js';
export { SEASON_PHASES, GOAL_OBJECTIVES } from './training-objectives.js';
export { programmeToMarkdown, sessionToMarkdown, generateEngineReport, writeReport } from './report-generator.js';
export { getProgrammePDFOutline, getSessionPDFOutline } from './pdf-outline.js';

/**
 * Generate a full season plan for a team.
 * @param {object} teamInput    — team profile
 * @param {object} seasonOpts   — { seasonLength, seasonStart, provider }
 * @param {object} coachInput   — optional coach profile
 */
export async function generateSeasonPlan(teamInput, seasonOpts = {}, coachInput = null) {
  const start    = Date.now();
  const provider = seasonOpts.provider ?? resolveProvider();
  const ctx      = buildSeasonContext({
    team:         teamInput,
    coach:        coachInput,
    seasonLength: seasonOpts.seasonLength ?? 20,
    seasonStart:  seasonOpts.seasonStart  ?? null,
  });

  let output, mode;

  if (provider?.available) {
    try {
      const prompt = buildPrompt(ctx);
      output = await provider.generateJSON(prompt);
      mode   = provider.name;
    } catch (err) {
      output = templateSeasonPlan(ctx);
      mode   = `template (${provider.name} failed: ${err.message})`;
    }
  } else {
    output = templateSeasonPlan(ctx);
    mode   = 'template';
  }

  return {
    ...output,
    _meta: {
      requestType: 'season-plan',
      ageGroup:    ctx.team.ageGroup,
      mode,
      provider:    provider?.name ?? 'none',
      elapsed:     Date.now() - start,
      generatedAt: new Date().toISOString(),
    },
  };
}

function templateSeasonPlan(ctx) {
  const { team, seasonLength, ageGuidelines } = ctx;

  const preseasonWeeks    = Math.round(seasonLength * 0.25);
  const earlyWeeks        = Math.round(seasonLength * 0.15);
  const competitionWeeks  = Math.round(seasonLength * 0.45);
  const lateWeeks         = seasonLength - preseasonWeeks - earlyWeeks - competitionWeeks;

  return {
    overview: {
      summary:       `${seasonLength}-week season plan for ${team.ageGroup} ${team.levelLabel}`,
      totalWeeks:    seasonLength,
      phases:        ['Pre-season', 'Early season', 'Competition', 'Late season / playoffs'],
      keyObjectives: [
        ageGuidelines.primaryEmphasis,
        'Build team identity and system of play',
        'Develop physical condition to support match demands',
        'Peak for key fixture dates',
      ],
    },
    phases: [
      {
        name:           'Pre-season',
        weeks:          `1–${preseasonWeeks}`,
        primaryFocus:   'Physical foundation and system introduction',
        trainingBias:   'High volume, progressive intensity',
        matchFrequency: 'Nil or friendly only',
        weeklyTemplate: { trainings: team.trainingsPerWeek, gym: 2, recovery: 1 },
        keyWorkloads:   ['Aerobic base running', 'Strength foundation', 'Technical skill work unopposed'],
        setpieceFocus:  'Lineout — establish calls and jumpers. Scrum — binding and basic mechanics.',
        physicalBenchmarks: ['Establish fitness baseline in week 1', 'Each player can complete 3km in under 15min by week 4'],
      },
      {
        name:           'Early season',
        weeks:          `${preseasonWeeks + 1}–${preseasonWeeks + earlyWeeks}`,
        primaryFocus:   'Convert fitness to rugby fitness, first competitive matches',
        trainingBias:   'Moderate volume, increasing specificity',
        matchFrequency: '1 per week',
        weeklyTemplate: { trainings: team.trainingsPerWeek, gym: 1, recovery: 1 },
        keyWorkloads:   ['Repeat sprint conditioning', 'Contact conditioning', 'Tactical unit work'],
        setpieceFocus:  'Lineout — add movement. Scrum — introduce contested practice.',
        physicalBenchmarks: ['Match fitness test — can complete full 80min at intensity'],
      },
      {
        name:           'Competition',
        weeks:          `${preseasonWeeks + earlyWeeks + 1}–${preseasonWeeks + earlyWeeks + competitionWeeks}`,
        primaryFocus:   'Weekly performance, maintain condition',
        trainingBias:   'Reduced volume, high intensity and quality',
        matchFrequency: '1 per week',
        weeklyTemplate: { trainings: team.trainingsPerWeek, gym: 1, recovery: 2 },
        keyWorkloads:   ['Match-specific conditioning', 'Targeted skill refinement', 'Opponent preparation'],
        setpieceFocus:  'Build and refine based on match analysis.',
        physicalBenchmarks: ['Maintain or improve pre-season benchmarks across season'],
      },
      {
        name:           'Late season / Playoffs',
        weeks:          `${seasonLength - lateWeeks + 1}–${seasonLength}`,
        primaryFocus:   'Peak performance, freshness over fitness',
        trainingBias:   'Low volume, high quality, targeted work',
        matchFrequency: '1–2 per week',
        weeklyTemplate: { trainings: team.trainingsPerWeek - 1, gym: 1, recovery: 2 },
        keyWorkloads:   ['High-quality short sessions', 'Set-piece precision', 'Game-plan reinforcement'],
        setpieceFocus:  'Lock in high-percentage calls. Simplify where possible.',
        physicalBenchmarks: ['Players feeling fresh and sharp — monitor fatigue closely'],
      },
    ],
    keyFixtures:            ['Record in team calendar — plan backwards from key dates'],
    injuryPrevention:       ['Weekly contact-load monitoring', 'Progressive contact introduction in pre-season', 'Player welfare check-ins at start of each phase'],
    playerDevelopmentGoals: [`${ageGuidelines.primaryEmphasis}`, 'Individual skill targets set in week 1 review'],
    coachNotes:             [`${ageGuidelines.keyNote}`, 'Season plan should be reviewed at each phase transition and adjusted based on results and injuries.'],
  };
}

/**
 * Convenience function — resolve provider and run generateProgramme in one call.
 * This is the standard entry point for external callers.
 */
export async function run(requestType, inputData, coachProfile = null) {
  const provider = resolveProvider();

  switch (requestType) {
    case 'programme':
      return generateProgramme(inputData, coachProfile, { provider });
    case 'session':
      return generateSession(inputData.team ?? inputData, { focus: inputData.focus, provider }, coachProfile);
    case 'season-plan':
      return generateSeasonPlan(inputData.team ?? inputData, { provider }, coachProfile);
    case 'rehab':
      return generateRehabPlan(inputData.player ?? inputData, inputData.injuryDetail, coachProfile, { provider });
    default:
      throw new Error(`Unknown requestType: "${requestType}"`);
  }
}
