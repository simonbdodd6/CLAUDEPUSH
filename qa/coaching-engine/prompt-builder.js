/**
 * Prompt builder — converts EngineContext into provider-ready { system, user } prompts.
 * No hardcoded content. All prompt content is derived from the context object.
 * Different request types produce structurally different prompts.
 */

// ── Output schemas (embedded in system prompts) ──────────────────────────────

const PROGRAMME_SCHEMA = `{
  "overview": {
    "summary": "string — 2-3 sentences describing the programme",
    "duration": "string — e.g. '12 weeks'",
    "weeksTotal": "number",
    "daysPerWeek": "number",
    "primaryGoals": ["string"],
    "keyConsiderations": ["string"]
  },
  "weeklySplit": [
    { "day": "string", "type": "string", "focus": "string", "duration": "number (minutes)", "intensity": "low|medium|high|very-high|rest" }
  ],
  "exerciseBlocks": [
    {
      "blockName": "string",
      "phase": "string",
      "weeks": "string — e.g. '1-4'",
      "sessions": [
        {
          "sessionType": "string",
          "exercises": [
            { "name": "string", "sets": "string", "reps": "string", "tempo": "string", "rest": "string", "notes": "string" }
          ]
        }
      ]
    }
  ],
  "conditioning": { "description": "string", "methods": ["string"], "weeklyVolume": "string", "progressionModel": "string" },
  "mobility": { "daily": ["string"], "preworkout": ["string"], "postworkout": ["string"], "priorityAreas": ["string"] },
  "recovery": { "protocols": ["string"], "deloadWeek": "string", "sleepGuidelines": "string" },
  "nutritionNotes": { "preTraining": "string", "postTraining": "string", "generalGuidelines": "string" },
  "progression": { "weeklyRules": ["string"], "deloadTriggers": ["string"], "testingSchedule": ["string"] },
  "testing": [{ "week": "number", "tests": ["string"], "benchmarks": "string" }],
  "coachNotes": ["string"]
}`;

const SESSION_SCHEMA = `{
  "theme": "string",
  "duration": "number (minutes)",
  "ageGroup": "string",
  "intensity": "low|medium|high",
  "warmUp": {
    "duration": "number (minutes)",
    "activities": [{ "name": "string", "duration": "number (minutes)", "description": "string", "coachingPoints": ["string"] }]
  },
  "skillBlocks": [
    {
      "title": "string",
      "duration": "number (minutes)",
      "focus": "string",
      "activities": [{ "name": "string", "duration": "number (minutes)", "setup": "string", "description": "string", "coachingPoints": ["string"], "progressions": ["string"] }],
      "safetyNotes": ["string"]
    }
  ],
  "conditioning": { "included": "boolean", "duration": "number", "activity": "string" },
  "coolDown": { "duration": "number (minutes)", "activities": ["string"] },
  "equipmentNeeded": ["string"],
  "overallCoachingPoints": ["string"],
  "safetyNotes": ["string"],
  "modifications": { "largerGroup": "string", "smallerGroup": "string", "limited equipment": "string" }
}`;

const SEASON_PLAN_SCHEMA = `{
  "overview": { "summary": "string", "totalWeeks": "number", "phases": ["string"], "keyObjectives": ["string"] },
  "phases": [
    {
      "name": "string",
      "weeks": "string",
      "primaryFocus": "string",
      "trainingBias": "string",
      "matchFrequency": "string",
      "weeklyTemplate": { "trainings": "number", "gym": "number", "recovery": "number" },
      "keyWorkloads": ["string"],
      "setpieceFocus": "string",
      "physicalBenchmarks": ["string"]
    }
  ],
  "keyFixtures": ["string"],
  "injuryPrevention": ["string"],
  "playerDevelopmentGoals": ["string"],
  "coachNotes": ["string"]
}`;

const REHAB_SCHEMA = `{
  "overview": { "summary": "string", "estimatedReturnWeeks": "number", "rtpStages": ["string"] },
  "phases": [
    {
      "name": "string",
      "weeks": "string",
      "criteria": ["string"],
      "exercises": [{ "name": "string", "sets": "string", "reps": "string", "notes": "string" }],
      "restrictions": ["string"],
      "progressionCriteria": ["string"]
    }
  ],
  "returnToTraining": { "criteria": ["string"], "gradualLoadProtocol": ["string"] },
  "returnToContact": { "criteria": ["string"], "protocol": ["string"] },
  "ongoingPrehab": ["string"],
  "redFlags": ["string"],
  "coachNotes": ["string"]
}`;

// ── System prompt templates ──────────────────────────────────────────────────

function programmeSystemPrompt() {
  return `You are an elite rugby strength and conditioning coach with 20+ years of experience at professional and community level. You design evidence-based, position-specific training programmes that develop players for the demands of modern rugby.

CRITICAL INSTRUCTIONS:
- Reply ONLY with valid JSON matching the schema provided.
- Do NOT include any text, explanation, or markdown outside the JSON.
- Every field in the schema must be present. Use empty arrays where no content applies.
- Exercise names must be specific (e.g. "Barbell Back Squat" not "Squat").
- Sets/reps must be specific (e.g. "4×5" not "multiple sets").
- All coaching notes must be rugby-specific and actionable.

Output schema:
${PROGRAMME_SCHEMA}`;
}

function sessionSystemPrompt() {
  return `You are an expert rugby coach with extensive experience designing training sessions at all levels of the game. You create safe, progressive, and enjoyable sessions that develop rugby skills and physical conditioning simultaneously.

CRITICAL INSTRUCTIONS:
- Reply ONLY with valid JSON matching the schema provided.
- Do NOT include any text, explanation, or markdown outside the JSON.
- Every field in the schema must be present.
- Session activities must have clear setup descriptions a volunteer coach can follow.
- Coaching points must be specific, not generic.
- Safety notes must specifically address the age group and session content.

Output schema:
${SESSION_SCHEMA}`;
}

function seasonPlanSystemPrompt() {
  return `You are an experienced rugby head coach and performance director. You design annual season plans that periodise training load, peaking for key fixtures while developing players over the full season.

CRITICAL INSTRUCTIONS:
- Reply ONLY with valid JSON matching the schema provided.
- Do NOT include any text, explanation, or markdown outside the JSON.
- Every field must be present.
- Plans must be realistic for the team level provided.

Output schema:
${SEASON_PLAN_SCHEMA}`;
}

function rehabSystemPrompt() {
  return `You are a rugby-specialist sports physiotherapist and strength coach with expertise in return-to-play protocols. You design evidence-based rehabilitation programmes that get players back safely and stronger than before injury.

CRITICAL INSTRUCTIONS:
- Reply ONLY with valid JSON matching the schema provided.
- Do NOT include any text, explanation, or markdown outside the JSON.
- All protocols must reference World Rugby return-to-play guidelines where applicable.
- Red flags must always be included — these are non-negotiable safety signals.
- Note where medical clearance is required before progressing.

Output schema:
${REHAB_SCHEMA}`;
}

// ── User prompt builders ─────────────────────────────────────────────────────

function buildKBSection(knowledgeBase) {
  if (!knowledgeBase?.hasKBData) return '';

  const lines = knowledgeBase.items.slice(0, 4).map(item =>
    `- ${item.title}: ${item.takeaway ?? item.summary ?? ''}${item.isLaw ? ' [LAW UPDATE]' : ''}${item.isSafety ? ' [SAFETY]' : ''}`
  );

  return `\nRelevant coaching knowledge from our database:\n${lines.join('\n')}`;
}

function buildInjurySection(injuryMods = []) {
  if (!injuryMods.length) return '';
  const lines = injuryMods.map(m =>
    `- ${m.injury}: avoid [${m.avoidMovements.join(', ')}]; prioritise [${m.prioritise.slice(0, 2).join(', ')}]`
  );
  return `\nInjury modifications required:\n${lines.join('\n')}`;
}

function buildEquipmentSection(equipmentProfile) {
  if (!equipmentProfile) return '';
  const constraints = equipmentProfile.constraints?.length
    ? `\nConstraints: ${equipmentProfile.constraints.join('; ')}`
    : '';
  return `\nEquipment available: ${equipmentProfile.label}${constraints}`;
}

function buildCoachSection(coach) {
  if (!coach || coach.name === 'Head Coach') return '';
  return `\nCoach philosophy: ${coach.philosophyLabel} — ${coach.philosophyEmphasis}`;
}

export function buildProgrammePrompt(ctx) {
  const { player, positionProfile, ageGuidelines, objectives, seasonPhaseData, injuryMods, equipmentProfile, knowledgeBase, coach } = ctx;

  const objectiveLines = objectives
    .filter(o => o.priority === 'primary')
    .map(o => `- ${o.goal}: ${o.subcategory ?? ''} (${o.repRange ?? ''}, ${o.sets ?? ''} sets)`)
    .join('\n');

  const user = `Generate a ${seasonPhaseData.recommendedWeeks}-week ${player.seasonPhase} training programme for this player:

PLAYER PROFILE:
- Position: ${player.positionLabel} (${player.position})
- Age: ${player.age} (${player.ageGroup})
- Experience: ${player.experience}
- Training days per week: ${player.trainingDays}
- Season phase: ${player.seasonPhase} — ${seasonPhaseData.primaryFocus}

PRIMARY GOALS:
${player.goals.map(g => `- ${g}`).join('\n')}

POSITION PROFILE (${player.position}):
- Physical priority: ${positionProfile.physicalPriority?.join(', ')}
- Strength focus: ${positionProfile.strengthFocus?.join(', ')}
- Conditioning: ${positionProfile.conditioningMethod}
- Key injury risks: ${positionProfile.injuryRisks?.join(', ')}
${positionProfile.bodyMassNote ? `- Note: ${positionProfile.bodyMassNote}` : ''}

AGE GUIDELINES (${player.ageGroup}):
- Loading: ${ageGuidelines.loadingNote}
- Key note: ${ageGuidelines.keyNote}

TRAINING OBJECTIVES:
${objectiveLines || '- General rugby conditioning'}

PHASE CONTEXT:
- Training bias: ${seasonPhaseData.trainingBias}
- Strength phase: ${seasonPhaseData.strengthPhase}
- Conditioning phase: ${seasonPhaseData.conditioningPhase}
${buildInjurySection(injuryMods)}${buildEquipmentSection(equipmentProfile)}${buildKBSection(knowledgeBase)}${buildCoachSection(coach)}`;

  return { system: programmeSystemPrompt(), user };
}

export function buildSessionPrompt(ctx) {
  const { team, focus, ageGuidelines, equipmentProfile, knowledgeBase, coach } = ctx;

  const user = `Generate a complete ${team.sessionDuration}-minute training session for:

TEAM PROFILE:
- Age group: ${team.ageGroup}
- Level: ${team.levelLabel}
- Squad size: ${team.squadSize} players
- Session focus: ${focus || team.keyFocusAreas.join(', ') || 'general development'}
- Season phase: ${team.seasonPhase}

CONTACT GUIDELINE: ${team.contactGuideline}

AGE GUIDELINES:
- Primary emphasis: ${ageGuidelines.primaryEmphasis}
- Key note: ${ageGuidelines.keyNote}

EQUIPMENT: ${team.equipment?.join(', ') || 'standard (cones, balls, tackle bags)'}
${buildKBSection(knowledgeBase)}${buildCoachSection(coach)}`;

  return { system: sessionSystemPrompt(), user };
}

export function buildSeasonPlanPrompt(ctx) {
  const { team, ageGuidelines, knowledgeBase, coach, seasonLength } = ctx;

  const user = `Generate a ${seasonLength}-week season plan for:

TEAM PROFILE:
- Age group: ${team.ageGroup}
- Level: ${team.levelLabel}
- Squad size: ${team.squadSize}
- System of play: ${team.systemOfPlay || 'to be defined'}
- Key focus areas: ${team.keyFocusAreas.join(', ') || 'general development'}

AGE GUIDELINES:
- Key note: ${ageGuidelines.keyNote}
- Strength guidelines: ${ageGuidelines.strengthNote}

TRAINING CAPACITY: ${team.trainingsPerWeek} training sessions/week
${buildKBSection(knowledgeBase)}${buildCoachSection(coach)}`;

  return { system: seasonPlanSystemPrompt(), user };
}

export function buildRehabPrompt(ctx) {
  const { player, injuryDetail, injuryMods, ageGuidelines, equipmentProfile, knowledgeBase } = ctx;
  const primaryMod = injuryMods[0];

  const user = `Generate a rehabilitation and return-to-play programme for:

PLAYER:
- Position: ${player.positionLabel} (${player.position})
- Age: ${player.age} (${player.ageGroup})
- Experience: ${player.experience}

INJURY:
- Description: ${injuryDetail}
${primaryMod ? `- Movements to avoid: ${primaryMod.avoidMovements.join(', ')}` : ''}
${primaryMod ? `- Movements to modify: ${primaryMod.modifyMovements.join(', ')}` : ''}
${primaryMod ? `- Priority exercises: ${primaryMod.prioritise.join(', ')}` : ''}

CONTEXT:
- Season phase: ${player.seasonPhase}
${buildEquipmentSection(equipmentProfile)}${buildKBSection(knowledgeBase)}

IMPORTANT: Include specific return-to-contact criteria and red flags that require medical review.`;

  return { system: rehabSystemPrompt(), user };
}

/**
 * Dispatch to the correct prompt builder based on context.requestType.
 */
export function buildPrompt(ctx) {
  switch (ctx.requestType) {
    case 'programme':   return buildProgrammePrompt(ctx);
    case 'session':     return buildSessionPrompt(ctx);
    case 'season-plan': return buildSeasonPlanPrompt(ctx);
    case 'rehab':       return buildRehabPrompt(ctx);
    default:            throw new Error(`Unknown requestType: "${ctx.requestType}"`);
  }
}
