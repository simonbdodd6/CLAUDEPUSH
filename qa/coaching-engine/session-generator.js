/**
 * Session generator — generates individual training sessions for teams.
 */

import { buildSessionContext } from './context-builder.js';
import { buildPrompt } from './prompt-builder.js';

// ── Template fallback ─────────────────────────────────────────────────────────

function templateSession(ctx) {
  const { team, focus, ageGuidelines, knowledgeBase } = ctx;
  const ageGroup = team.ageGroup;
  const duration = team.sessionDuration;

  const isYouth    = ['U8', 'U10', 'U12'].includes(ageGroup);
  const isContact  = ['U16', 'U18', 'Senior', 'Masters'].includes(ageGroup);
  const sessionFocus = focus || team.keyFocusAreas?.[0] || 'general skills and fitness';

  const warmUpMin  = Math.round(duration * 0.15);
  const skill1Min  = Math.round(duration * 0.25);
  const skill2Min  = Math.round(duration * 0.25);
  const gameMin    = Math.round(duration * 0.25);
  const coolDownMin = duration - warmUpMin - skill1Min - skill2Min - gameMin;

  const kbInsight = knowledgeBase?.items?.[0];

  return {
    theme:     `${sessionFocus} — ${ageGroup}`,
    duration,
    ageGroup,
    intensity: isYouth ? 'medium' : 'high',
    warmUp: {
      duration: warmUpMin,
      activities: [
        {
          name: 'Dynamic warm-up with ball',
          duration: Math.round(warmUpMin * 0.5),
          description: `Players in pairs with a ball. Easy passing jog, gradually increasing distance and pace. Add skip turns, high knees, and side shuffles.`,
          coachingPoints: ['Ball in two hands at all times', 'Eyes up — scan the space', 'Communicate with your partner'],
        },
        {
          name: isYouth ? 'Tig/tag game' : 'Competitive handling warm-up',
          duration: Math.round(warmUpMin * 0.5),
          description: isYouth
            ? 'Tag game to elevate heart rate and get all players handling in a fun, game-like context.'
            : `Small-sided passing game (3v3 or 4v4) — keep ball alive, continuous movement. 10×10m grid.`,
          coachingPoints: ['Catch first, then run', 'Support player — always be within pass distance'],
        },
      ],
    },
    skillBlocks: [
      {
        title:    `Skill Block 1 — ${sessionFocus} (technique)`,
        duration: skill1Min,
        focus:    'technique and decision-making at low speed',
        activities: [
          {
            name:        `${sessionFocus} — unopposed technical drill`,
            duration:    Math.round(skill1Min * 0.6),
            setup:       '4 cones in a 10×10m box. Groups of 4–6 players.',
            description: `Introduce the skill at walk pace → jog pace. Correct technique before adding speed. Use coaching questions: "What should your body be doing here?" Coach circles the group giving individual feedback.`,
            coachingPoints: [
              'Technique is non-negotiable — no shortcuts to keep pace',
              'Reset after every mistake — build good habit',
              kbInsight ? `Key insight from knowledge base: ${kbInsight.takeaway}` : 'Every rep counts — focus throughout',
            ],
            progressions: ['Add a second player', 'Add time pressure', 'Add a defender in passive role'],
          },
        ],
        safetyNotes: isYouth
          ? ['Ensure adequate warm-up before contact activity', 'All contact supervised — coach present at all contact drills']
          : ['Contact drills — check equipment', 'No contact until technique is established in unopposed phase'],
      },
      {
        title:    `Skill Block 2 — ${sessionFocus} (competitive application)`,
        duration: skill2Min,
        focus:    'apply the skill in a competitive context',
        activities: [
          {
            name:        `${sessionFocus} — conditioned game`,
            duration:    Math.round(skill2Min * 0.8),
            setup:       '20×15m grid. Two teams. Score points for executing the skill correctly.',
            description: `Small-sided game with a condition that rewards correct execution of the session skill. Example: a try only counts if the scoring sequence included the session skill.`,
            coachingPoints: [
              'The skill must appear under competitive pressure today',
              'Award bonus points for skill execution — make it worth doing correctly',
              'Stop and reset if the skill breaks down — reinforce the technique before restarting',
            ],
            progressions: ['Remove the condition', 'Add a second condition', 'Increase grid size'],
          },
        ],
        safetyNotes: [team.contactGuideline],
      },
    ],
    conditioning: {
      included: !isYouth,
      duration: isYouth ? 0 : Math.round(duration * 0.1),
      activity: isYouth
        ? 'Conditioning is embedded in the session games'
        : 'Interval runs (3×5min at threshold pace) or shuttle conditioning (10×30m with 20s rest)',
    },
    coolDown: {
      duration:   coolDownMin,
      activities: [
        'Light jog to bring heart rate down (2min)',
        'Static stretching: hip flexors, hamstrings, calves (30s each)',
        'Team debrief — 3 things we did well, 1 we need to improve',
        'Hydration reminder and next session information',
      ],
    },
    equipmentNeeded: ['Rugby balls (1 per 2 players)', 'Cones (20+)', 'Bibs (two colours)', ...(isContact ? ['Tackle bags (4)'] : [])],
    overallCoachingPoints: [
      `${sessionFocus} is the theme — every activity should reinforce it`,
      ageGuidelines.keyNote,
      'Positive coaching environment — celebrate effort, correct with purpose',
      'Give every player equal time with the ball',
    ],
    safetyNotes: [
      team.contactGuideline,
      `${ageGroup} session duration: ${duration} minutes — do not overrun`,
      'Ensure adequate water breaks — every 20 minutes minimum',
      'Injury incident protocol: any player showing signs of concussion leaves the field immediately',
    ],
    modifications: {
      largerGroup:       'Split into two groups working simultaneously on either end of the pitch',
      smallerGroup:      'Increase repetitions per player, reduce group size in drills',
      'limited equipment': 'Replace tackle bags with players in passive role',
    },
  };
}

function validateSessionOutput(output) {
  const required = ['theme', 'duration', 'warmUp', 'skillBlocks', 'coolDown'];
  for (const key of required) {
    if (!output[key]) throw new Error(`Session output missing required field: "${key}"`);
  }
  return true;
}

// ── Public generators ─────────────────────────────────────────────────────────

/**
 * Generate a training session for a team.
 * @param {object} teamInput  — team profile (ageGroup required)
 * @param {object} sessionOpts — { focus, provider }
 * @param {object} coachInput  — optional coach profile
 */
export async function generateSession(teamInput, sessionOpts = {}, coachInput = null) {
  const start = Date.now();
  const ctx   = buildSessionContext({
    team:  teamInput,
    coach: coachInput,
    focus: sessionOpts.focus ?? '',
  });

  let output, mode;
  const provider = sessionOpts.provider;

  if (provider?.available) {
    try {
      const prompt = buildPrompt(ctx);
      output = await provider.generateJSON(prompt);
      validateSessionOutput(output);
      mode = provider.name;
    } catch (err) {
      output = templateSession(ctx);
      mode = `template (${provider.name} failed: ${err.message})`;
    }
  } else {
    output = templateSession(ctx);
    mode = 'template';
  }

  return {
    ...output,
    _meta: {
      requestType:  'session',
      ageGroup:     ctx.team.ageGroup,
      focus:        ctx.focus,
      mode,
      provider:     provider?.name ?? 'none',
      kbItemsUsed:  ctx.knowledgeBase?.itemCount ?? 0,
      elapsed:      Date.now() - start,
      generatedAt:  new Date().toISOString(),
    },
  };
}
