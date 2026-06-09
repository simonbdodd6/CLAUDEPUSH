/**
 * Training Session Builder
 *
 * Generates complete rugby training sessions using the knowledge base as context.
 * Uses Claude Haiku when available; falls back to a structured template otherwise.
 */

import { retrieveRelevant } from './query.js';
import { logActivity } from './activity-log.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL   = process.env.RUGBY_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';

export const VALID_AGE_GROUPS = ['U8', 'U10', 'U12', 'U14', 'U16', 'Senior'];

const DURATIONS = { U8: 60, U10: 60, U12: 75, U14: 90, U16: 90, Senior: 90 };

const GROUP_NOTES = {
  U8:     'Tag rugby focus. No scrums, no rucks. Fun and movement above all. Reduce contact.',
  U10:    'Touch/tag or uncontested contact. Short reps, lots of ball touches per player.',
  U12:    'Introduce contested contact with correct technique. Scrums may be introduced.',
  U14:    'Full contact with referee-like law enforcement. Technique under mild pressure.',
  U16:    'Near-adult session. Intensity and fitness appropriate. Full law application.',
  Senior: 'Full intensity. Game-realistic scenarios. Set-piece, fitness, and analysis.',
};

const SYSTEM = `You are an expert rugby coach specialising in age-grade player development.
Generate a complete, detailed training session plan in JSON.

Reply ONLY with valid JSON (no markdown fences):
{
  "ageGroup": "e.g. U12",
  "theme": "session theme e.g. 'Breakdown & Ruck Speed'",
  "totalDuration": 75,
  "equipmentNeeded": ["cones", "balls", "tackle bags"],
  "overallCoachingPoints": ["key point 1", "key point 2"],
  "safetyNotes": ["safety note 1"],
  "warmUp": {
    "duration": 10,
    "activities": [
      {"name": "Activity name", "duration": 5, "description": "What players do", "coachingPoints": ["cue 1"]}
    ]
  },
  "skillBlocks": [
    {
      "title": "Block title",
      "duration": 20,
      "focus": "what skill",
      "activities": [
        {"name": "Activity", "duration": 10, "description": "Setup and execution", "coachingPoints": ["cue"], "progressions": ["harder variation"]}
      ],
      "safetyNotes": "any safety note"
    }
  ],
  "game": {
    "name": "Game or conditioned match name",
    "duration": 20,
    "description": "How it works",
    "coachingPoints": ["thing to watch"],
    "variations": ["variation 1"]
  },
  "coolDown": {
    "duration": 5,
    "activities": ["Static stretch", "Team huddle"]
  }
}`;

async function callClaude(ageGroup, focus, items) {
  const dur = DURATIONS[ageGroup] ?? 90;
  const groupNote = GROUP_NOTES[ageGroup] ?? '';
  const context = items.length
    ? items.map((i, n) => `[KB${n + 1}] "${i.title}": ${i.takeaway || i.summary}`).join('\n')
    : 'No specific knowledge base items for this request.';

  const prompt = `Age group: ${ageGroup} (${dur} min session)
Session focus: ${focus || 'general skills'}
Age-group notes: ${groupNote}

Knowledge base context:
${context}

Generate a complete training session for this age group and focus.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(raw);
}

function templateSession(ageGroup, focus) {
  const dur = DURATIONS[ageGroup] ?? 90;
  return {
    ageGroup,
    theme: focus ? `${focus} Skills` : 'General Rugby Skills',
    totalDuration: dur,
    equipmentNeeded: ['Cones', 'Balls (1 per 3 players)', 'Tackle bags', 'Bibs/vests'],
    overallCoachingPoints: [
      'Positive reinforcement — catch them doing it right',
      'Correct technique before adding speed or opposition',
      'Encourage communication between players',
    ],
    safetyNotes: [
      'Check for injuries before session begins',
      'Ensure all contact work uses correct safe body position',
    ],
    warmUp: {
      duration: 10,
      activities: [
        {
          name: 'Tag Game',
          duration: 5,
          description: 'Players carry a ball and must avoid being tagged by defenders. If tagged, do 3 passes before re-entering.',
          coachingPoints: ['Change of direction', 'Heads up running'],
        },
        {
          name: 'Dynamic Stretching',
          duration: 5,
          description: 'Leg swings, hip circles, shoulder rolls, neck rotations. Light jogging with ball.',
          coachingPoints: ['Full range of motion', 'Controlled movement'],
        },
      ],
    },
    skillBlocks: [
      {
        title: `Skill Block 1: ${focus || 'Passing and Handling'}`,
        duration: Math.round(dur * 0.25),
        focus: focus || 'Passing',
        activities: [
          {
            name: 'Grid Passing',
            duration: 10,
            description: 'Groups of 4 in a 10m grid. Flat pass across the grid, return with pop pass. Increase distance.',
            coachingPoints: ['Lead hand on ball', 'Target — pass to the chest', 'Follow through to target'],
            progressions: ['Add passive defender', 'Add footwork before pass'],
          },
        ],
        safetyNotes: 'Ensure adequate spacing between groups.',
      },
      {
        title: `Skill Block 2: ${focus || 'Contact and Breakdown'}`,
        duration: Math.round(dur * 0.25),
        focus: focus || 'Contact',
        activities: [
          {
            name: 'Tackle Technique (or Tag)',
            duration: 10,
            description: 'Pairs work on dominant tackle position from walk speed to jog speed. U10 and below use tag only.',
            coachingPoints: ['Head to the side', 'Wrap the legs', 'Drive through the contact'],
            progressions: ['Add a support player', 'Channel exercise with ball carry'],
          },
        ],
        safetyNotes: ageGroup === 'U8' || ageGroup === 'U10'
          ? 'Tag only — no contact for this age group.'
          : 'Start at walk speed. Stop and correct high tackles immediately.',
      },
    ],
    game: {
      name: 'Conditioned Match',
      duration: Math.round(dur * 0.25),
      description: `${ageGroup === 'U8' || ageGroup === 'U10' ? 'Tag rugby match.' : 'Conditioned contact match.'} Small pitch (30m x 20m). Focus on the session theme.`,
      coachingPoints: ['Encourage applying the session skill in the game', 'Praise correct execution over outcome'],
      variations: ['Add bonus point for correct technique', 'Condition: ball must pass through 3 hands before scoring'],
    },
    coolDown: {
      duration: 5,
      activities: ['Static hamstring stretch', 'Quad stretch', 'Calf stretch', 'Team huddle — what went well?'],
    },
  };
}

/**
 * Build a training session for a given age group and optional focus.
 * @param {string} ageGroup — one of VALID_AGE_GROUPS
 * @param {string} [focus] — optional topic e.g. 'breakdown', 'lineout'
 * @returns {Promise<object>} complete session plan
 */
export async function buildSession(ageGroup, focus = '') {
  const t0 = Date.now();
  const searchQ = focus ? `${ageGroup} ${focus} drill session` : `${ageGroup} rugby session training`;
  const { items, knowledgeBaseSize } = retrieveRelevant(searchQ, { limit: 6, ageGroup: ageGroup.toLowerCase() });

  let session;
  let mode = 'template';

  if (API_KEY) {
    try {
      session = await callClaude(ageGroup, focus, items);
      mode = 'claude';
    } catch (err) {
      process.stderr.write(`  ⚠  Claude failed (${err.message}) — using template\n`);
      session = templateSession(ageGroup, focus);
    }
  } else {
    session = templateSession(ageGroup, focus);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logActivity({ type: 'session', ageGroup, focus, kbItemsUsed: items.length, mode });

  return { session, sources: items, elapsed, mode, knowledgeBaseSize };
}
