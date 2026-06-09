/**
 * Programme generator — the main generation pipeline for training programmes.
 * Orchestrates: context → prompt → provider → validate → (fallback if needed).
 */

import { buildProgrammeContext, buildRehabContext } from './context-builder.js';
import { buildPrompt } from './prompt-builder.js';

// ── Template fallback ─────────────────────────────────────────────────────────

function templateProgramme(ctx) {
  const { player, positionProfile, seasonPhaseData, objectives, equipmentProfile, injuryMods, ageGuidelines } = ctx;

  const weeks      = seasonPhaseData.recommendedWeeks;
  const days       = player.trainingDays;
  const isProp     = ['prop', 'loosehead-prop', 'tighthead-prop', 'hooker'].includes(player.position);
  const isForward  = positionProfile.group !== 'back-three' && positionProfile.group !== 'half-backs' && positionProfile.group !== 'midfield';
  const needsMass  = player.goals.some(g => g.toLowerCase().includes('mass') || g.toLowerCase().includes('strength'));

  const phaseLabel = `${player.seasonPhase.charAt(0).toUpperCase()}${player.seasonPhase.slice(1)} programme`;

  const primaryObjectives = objectives.filter(o => o.priority === 'primary').map(o => o.goal);
  const avoidMovements    = injuryMods.flatMap(m => m.avoidMovements);
  const prioritiseList    = injuryMods.flatMap(m => m.prioritise);

  const weeklySplit = buildWeeklySplit(days, player, isForward);
  const exerciseBlocks = buildExerciseBlocks(ctx, isProp, needsMass, avoidMovements, equipmentProfile);

  return {
    overview: {
      summary:    `${weeks}-week ${phaseLabel} for a ${player.age}-year-old ${player.positionLabel} (${player.experience} level). Focus: ${player.goals.join(', ')}.`,
      duration:   `${weeks} weeks`,
      weeksTotal: weeks,
      daysPerWeek: days,
      primaryGoals: player.goals,
      keyConsiderations: [
        ageGuidelines.loadingNote,
        positionProfile.bodyMassNote ?? `${player.position} — ${positionProfile.physicalPriority?.join(', ')} development`,
        ...(injuryMods.length ? injuryMods.map(m => m.consideration) : []),
        `Season phase: ${seasonPhaseData.label} — ${seasonPhaseData.keyNote}`,
      ].filter(Boolean),
    },
    weeklySplit,
    exerciseBlocks,
    conditioning: {
      description:      `${player.position}-appropriate conditioning to support match performance`,
      methods:          isForward
        ? ['sled push sequences (5×20m)', 'heavy carry circuits', 'scrummaging conditioning', 'aerobic threshold runs (3×8min at RPE 7)']
        : ['tempo runs (6×200m at 75%)', 'repeat sprint drills (10×30m with 30s rest)', 'agility circuits', 'aerobic intervals'],
      weeklyVolume:     seasonPhaseData.phase === 'mid-season' ? '2 sessions per week' : '3 sessions per week',
      progressionModel: `Weeks 1-${Math.floor(weeks/3)}: volume build. Weeks ${Math.floor(weeks/3)+1}-${Math.floor(weeks*2/3)}: intensity increase. Weeks ${Math.floor(weeks*2/3)+1}-${weeks}: conversion to match-specific effort.`,
    },
    mobility: {
      daily:       ['hip flexor holds (90s per side)', 'thoracic rotation (10 reps)', 'ankle dorsiflexion mobility'],
      preworkout:  ['hip circles (×10)', 'shoulder CARs (×5 per side)', 'dynamic hamstring sweep (×10)', 'lateral lunge (×8 per side)'],
      postworkout: ['pigeon pose (2min per side)', 'couch stretch (90s per side)', 'supine spinal twist (60s per side)'],
      priorityAreas: positionProfile.injuryRisks?.map(r => `${r} mobility and stability`) ?? ['hip and shoulder mobility'],
    },
    recovery: {
      protocols:      ['cold shower or contrast bath post-training', 'foam rolling 10min post-session', 'prioritise 8+ hours sleep during programme'],
      deloadWeek:     weeks > 6 ? `Week ${Math.ceil(weeks * 0.75)} — reduce volume 40%, maintain intensity` : 'No formal deload — keep intensity manageable week-to-week',
      sleepGuidelines: '8–9 hours per night for optimal adaptation. Avoid screens 30min before bed.',
    },
    nutritionNotes: {
      preTraining:    'Carbohydrate-based meal 2–3 hours before training. Light snack (banana, rice cakes) 45min before.',
      postTraining:   '20–30g protein + carbohydrates within 30 minutes of training. Whole foods preferred over supplements.',
      generalGuidelines: needsMass
        ? 'Caloric surplus of 200–300kcal above maintenance required for muscle gain. Track protein intake (1.8–2.2g per kg bodyweight).'
        : 'Maintain caloric balance to support training. Prioritise whole foods, adequate hydration.',
    },
    progression: {
      weeklyRules:      [
        'Increase working weight by 2.5–5kg on main lifts when 3×3 sets are completed with good technique',
        'If any set form breaks down, hold weight and increase volume instead',
        'Do not progress conditioning volume and gym volume simultaneously — choose one each week',
      ],
      deloadTriggers:   [
        'Persistent joint pain or soreness that is not improving after 48 hours',
        'Drop in performance across 2+ consecutive sessions',
        'Illness, high stress, or poor sleep for 3+ consecutive days',
      ],
      testingSchedule:  [`Week 1: record all working weights`, `Week ${Math.ceil(weeks/2)}: retest and adjust programme`, `Week ${weeks}: final test to set next phase targets`],
    },
    testing: [
      { week: 1,     tests: ['Back squat 3RM', 'Broad jump (cm)', '10m sprint time', 'pull-up max reps'], benchmarks: 'Record baseline values' },
      { week: weeks, tests: ['Back squat 3RM', 'Broad jump (cm)', '10m sprint time', 'pull-up max reps'], benchmarks: 'Compare to week 1 baseline' },
    ],
    coachNotes: [
      `${player.position} — ${positionProfile.technicalSkills?.[0] ?? 'technical skill'} should be practised on-field concurrently with this programme`,
      ...(prioritiseList.length ? [`Injury prehab priority: ${prioritiseList.slice(0, 2).join(', ')}`] : []),
      `${ageGuidelines.keyNote}`,
      'This programme was generated without AI — for personalised detail, set ANTHROPIC_API_KEY and re-run.',
    ],
  };
}

function buildWeeklySplit(days, player, isForward) {
  const split = [];
  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const patterns = {
    2: [['Monday', 'Thursday']],
    3: [['Monday', 'Wednesday', 'Friday']],
    4: [['Monday', 'Tuesday', 'Thursday', 'Friday']],
    5: [['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday']],
  };

  const trainingDays = (patterns[days] || patterns[3])[0];
  const restDays     = allDays.filter(d => !trainingDays.includes(d));

  const sessionTypes = isForward
    ? ['Lower body strength + scrum conditioning', 'Upper body push/pull + contact conditioning', 'Full body power + aerobic work', 'Accessory + sprint work']
    : ['Lower body strength + speed work', 'Upper body push/pull + agility', 'Full body power + aerobic work', 'Accessory + sprint conditioning'];

  trainingDays.forEach((day, i) => {
    split.push({ day, type: 'training', focus: sessionTypes[i % sessionTypes.length], duration: 75, intensity: i % 2 === 0 ? 'high' : 'medium' });
  });

  restDays.forEach(day => {
    split.push({ day, type: day === 'Sunday' ? 'rest' : 'active-recovery', focus: 'mobility, foam rolling, aerobic base walk', duration: 0, intensity: 'rest' });
  });

  return split.sort((a, b) => allDays.indexOf(a.day) - allDays.indexOf(b.day));
}

function buildExerciseBlocks(ctx, isProp, needsMass, avoidMovements, equipmentProfile) {
  const hasFullGym = equipmentProfile?.label?.includes('Full') || equipmentProfile?.label?.includes('Basic');
  const avoidOverhead = avoidMovements.some(m => m.includes('overhead'));

  const squatVariation = hasFullGym ? 'Barbell Back Squat' : 'Goblet Squat';
  const deadliftVariation = hasFullGym ? 'Romanian Deadlift' : 'Single-Leg Romanian Deadlift';
  const pressVariation = avoidOverhead ? 'Incline Dumbbell Press' : (hasFullGym ? 'Barbell Bench Press' : 'Push-Up');
  const sledVariation = hasFullGym ? 'Sled Push (heavy)' : 'Resisted Band Sprint';

  return [
    {
      blockName: 'Foundation Phase',
      phase:     'Weeks 1–4',
      weeks:     '1-4',
      sessions:  [
        {
          sessionType: 'Lower Body Strength A',
          exercises: [
            { name: squatVariation,              sets: '4', reps: '6', tempo: '3-0-1-0', rest: '3min', notes: 'Prioritise depth and bracing' },
            { name: deadliftVariation,           sets: '3', reps: '8', tempo: '3-1-1-0', rest: '2min', notes: isProp ? 'Hip hinge is the foundation of scrum drive' : 'Control the eccentric' },
            { name: 'Bulgarian Split Squat',      sets: '3', reps: '8 per leg', tempo: '3-0-1-0', rest: '90s', notes: 'Address any left-right imbalance' },
            { name: 'Hip Thrust',                 sets: '3', reps: '12', tempo: '1-2-1-0', rest: '90s', notes: 'Full hip extension at top' },
            { name: 'Pallof Press',               sets: '3', reps: '10 per side', tempo: '1-1-1-0', rest: '60s', notes: 'Anti-rotation core stability' },
          ],
        },
        {
          sessionType: 'Upper Body Push/Pull A',
          exercises: [
            { name: pressVariation,              sets: '4', reps: needsMass ? '10' : '6', tempo: '3-0-1-0', rest: '2min', notes: needsMass ? 'Hypertrophy focus — controlled tempo' : 'Strength focus' },
            { name: 'Barbell Bent-Over Row',      sets: '4', reps: '6', tempo: '3-1-1-0', rest: '2min', notes: 'Maintain neutral spine throughout' },
            { name: 'Dumbbell Shoulder Press',    sets: '3', reps: '10', tempo: '2-0-1-0', rest: '90s', notes: avoidOverhead ? 'Substitute: Cable Face Pull × 15' : 'Full range — control the descent' },
            { name: 'Seated Cable Row',           sets: '3', reps: '10', tempo: '2-1-1-0', rest: '90s', notes: 'Retract scapula at end of pull' },
            { name: 'Rear Delt Fly',              sets: '3', reps: '15', tempo: '2-0-1-0', rest: '60s', notes: 'Shoulder health priority — do not rush this' },
          ],
        },
      ],
    },
    {
      blockName: 'Development Phase',
      phase:     'Weeks 5–8',
      weeks:     '5-8',
      sessions:  [
        {
          sessionType: 'Lower Body Power',
          exercises: [
            { name: 'Trap Bar Deadlift',           sets: '5', reps: '5', tempo: 'explosive', rest: '3min', notes: 'Maximal intent on the concentric — this is power training' },
            { name: isProp ? sledVariation : 'Box Jump', sets: '4', reps: isProp ? '20m' : '5', tempo: 'maximal', rest: '3min', notes: isProp ? 'Horizontal force — this is scrum-specific' : 'Full hip extension, land soft' },
            { name: squatVariation,               sets: '4', reps: '4', tempo: '2-0-X-0', rest: '3min', notes: '5% heavier than week 4 max' },
            { name: 'Single-Leg Romanian Deadlift', sets: '3', reps: '8 per leg', tempo: '3-1-1-0', rest: '90s', notes: 'Maintain hip height' },
          ],
        },
      ],
    },
  ];
}

function templateRehab(ctx) {
  const { player, injuryDetail, injuryMods, equipmentProfile } = ctx;
  const primaryMod = injuryMods[0] ?? {};

  return {
    overview: {
      summary:              `Rehabilitation programme for ${player.positionLabel} (${player.age}yo) — ${injuryDetail}`,
      estimatedReturnWeeks: 6,
      rtpStages:            ['Stage 1: Pain-free ROM', 'Stage 2: Strength base', 'Stage 3: Power and contact', 'Stage 4: Full training', 'Stage 5: Match return'],
    },
    phases: [
      {
        name:  'Acute Phase',
        weeks: '1-2',
        criteria: ['Zero pain at rest', 'Medical clearance to begin loading'],
        exercises: [
          { name: 'Isometric loading (mid-range)', sets: '3', reps: '5×5s holds', notes: 'Pain-free range only' },
          { name: 'Light range-of-motion work',    sets: '2', reps: '10',         notes: 'Stay within pain-free range' },
          ...(primaryMod.prioritise ?? []).slice(0, 2).map(p => ({ name: p, sets: '3', reps: '12–15', notes: 'Low load, high control' })),
        ],
        restrictions:         primaryMod.avoidMovements ?? [],
        progressionCriteria: ['Pain score 0/10 during exercise', 'Full pain-free ROM restored'],
      },
      {
        name:  'Loading Phase',
        weeks: '3-4',
        criteria: ['Passed acute phase criteria', 'Pain 0/10 during loaded movement'],
        exercises: [
          { name: 'Progressive loading of primary movement pattern', sets: '4', reps: '8-10', notes: 'Begin at 50% perceived max, progress by 5% per session' },
          { name: 'Unilateral stability work',                       sets: '3', reps: '10',  notes: 'Address any imbalance between injured and uninjured side' },
        ],
        restrictions:        primaryMod.modifyMovements ?? [],
        progressionCriteria: ['Full strength symmetry (90%+)', 'Functional movement test passed'],
      },
      {
        name:  'Return-to-Training Phase',
        weeks: '5-6',
        criteria: ['Passed loading phase criteria', 'Physiotherapy sign-off'],
        exercises: [
          { name: 'Position-specific strength work', sets: '4', reps: '5-6', notes: 'Return to full programme with injury modifications noted' },
          { name: 'Field-based skill work',          sets: 'match-based', reps: 'match-based', notes: 'Non-contact then graduated contact' },
        ],
        restrictions:        [],
        progressionCriteria: ['Match fitness restored', 'Medical clearance for contact'],
      },
    ],
    returnToTraining: {
      criteria:            ['Pain-free full range of motion', 'Strength symmetry ≥90%', 'Passes functional movement screen'],
      gradualLoadProtocol: ['Week 1: non-contact training only', 'Week 2: contact drills at reduced intensity', 'Week 3: full training if symptom-free'],
    },
    returnToContact: {
      criteria: ['Passed return-to-training criteria', 'Medical or physiotherapy clearance'],
      protocol: ['Padded training contact first', 'Oppose with known players before full opposition', 'Monitor for 48h post-session'],
    },
    ongoingPrehab: primaryMod.prioritise ?? ['Targeted prehab 3× per week as part of ongoing warm-up'],
    redFlags: [
      'Increasing pain during or after exercise — stop and review',
      'Swelling or instability in the affected area',
      'Sharp or shooting pain',
      'Neurological symptoms (numbness, tingling)',
      'If in doubt — stop and seek medical review',
    ],
    coachNotes: [
      `${injuryDetail} — follow all physio guidance and do not rush return to contact`,
      'Return-to-play is a medical decision — coach must not override physiotherapy advice',
      'This template was generated without AI. For a personalised protocol, set ANTHROPIC_API_KEY.',
    ],
  };
}

// ── Output validation ─────────────────────────────────────────────────────────

function validateProgrammeOutput(output) {
  const required = ['overview', 'weeklySplit', 'exerciseBlocks', 'conditioning', 'mobility', 'recovery', 'coachNotes'];
  for (const key of required) {
    if (!output[key]) throw new Error(`Programme output missing required field: "${key}"`);
  }
  return true;
}

// ── Public generators ─────────────────────────────────────────────────────────

/**
 * Generate a training programme for a player.
 * @param {object} playerInput — matches the specified engine input shape
 * @param {object} coachInput  — optional coach profile
 * @param {object} opts        — { provider } to use a specific provider instance
 */
export async function generateProgramme(playerInput, coachInput = null, opts = {}) {
  const start = Date.now();
  const ctx   = buildProgrammeContext({ player: playerInput, coach: coachInput, memoryContext: opts.memoryContext ?? null });

  let output, mode;

  if (opts.provider?.available) {
    try {
      const prompt = buildPrompt(ctx);
      output = await opts.provider.generateJSON(prompt);
      validateProgrammeOutput(output);
      mode = opts.provider.name;
    } catch (err) {
      output = templateProgramme(ctx);
      mode = `template (${opts.provider.name} failed: ${err.message})`;
    }
  } else {
    output = templateProgramme(ctx);
    mode = 'template';
  }

  return {
    ...output,
    _meta: {
      requestType: 'programme',
      player:      { position: ctx.player.position, age: ctx.player.age, ageGroup: ctx.player.ageGroup },
      mode,
      provider:    opts.provider?.name ?? 'none',
      kbItemsUsed: ctx.knowledgeBase?.itemCount ?? 0,
      elapsed:     Date.now() - start,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generate a rehabilitation plan.
 */
export async function generateRehabPlan(playerInput, injuryDetail = '', coachInput = null, opts = {}) {
  const start = Date.now();
  const ctx   = buildRehabContext({ player: playerInput, injuryDetail, coach: coachInput, memoryContext: opts.memoryContext ?? null });

  let output, mode;

  if (opts.provider?.available) {
    try {
      const prompt = buildPrompt(ctx);
      output = await opts.provider.generateJSON(prompt);
      mode = opts.provider.name;
    } catch (err) {
      output = templateRehab(ctx);
      mode = `template (${opts.provider.name} failed: ${err.message})`;
    }
  } else {
    output = templateRehab(ctx);
    mode = 'template';
  }

  return {
    ...output,
    _meta: {
      requestType: 'rehab',
      player:      { position: ctx.player.position, age: ctx.player.age },
      injuryDetail,
      mode,
      provider:    opts.provider?.name ?? 'none',
      elapsed:     Date.now() - start,
      generatedAt: new Date().toISOString(),
    },
  };
}
