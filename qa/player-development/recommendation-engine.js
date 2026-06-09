/**
 * Recommendation Engine
 * Generates structured, WHY-explained recommendations from analysis results.
 * Every recommendation includes: type, priority, action, why, suggestedInput.
 *
 * "Every recommendation must explain WHY it was made."
 */

// ── Recommendation priorities ─────────────────────────────────────────────────

export const PRIORITY = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };

// ── Individual recommendation builders ────────────────────────────────────────

function recommendation(type, priority, action, why, suggestedInput = null, tags = []) {
  return { type, priority, action, why, suggestedInput, tags };
}

// ── Rule: Active injury → rehab plan ─────────────────────────────────────────

function checkInjuryRules(player, programmes, analyses) {
  const recs = [];
  const activeInjuries = (player.injuries ?? []).filter(i => i.status === 'active');

  if (activeInjuries.length > 0) {
    const inj = activeInjuries[0];
    const hasRehabPlan = programmes.some(p => p.requestType === 'rehab' && p.input?.injuries?.some(i => String(i).toLowerCase().includes(inj.type?.toLowerCase())));

    if (!hasRehabPlan) {
      recs.push(recommendation(
        'rehab-plan',
        PRIORITY.critical,
        `Generate a rehabilitation plan for the ${inj.type} injury`,
        `Player has an active ${inj.type} injury. No rehabilitation programme has been generated yet. Without a structured return-to-play protocol, the player risks extended absence or re-injury. World Rugby guidelines require a graduated return-to-play process.`,
        {
          player:      { ...playerInput(player), injuries: player.injuries },
          injuryDetail: inj.description ?? inj.type,
        },
        ['rehab', 'injury', inj.type ?? 'injury'],
      ));
    } else {
      recs.push(recommendation(
        'injury-monitoring',
        PRIORITY.high,
        `Monitor ${inj.type} injury progress — check clearance criteria`,
        `Player has an active ${inj.type} injury with a rehab plan in place. Confirm the player is following the return-to-play protocol and track progress toward clearance criteria.`,
        null,
        ['injury', 'monitoring'],
      ));
    }
  }

  return recs;
}

// ── Rule: Attendance issues ───────────────────────────────────────────────────

function checkAttendanceRules(player, analyses) {
  const recs = [];
  const attScore = analyses.attendance?.score ?? null;
  const attRate  = player.attendance?.rate ?? null;

  if (attScore != null && attScore < 60) {
    recs.push(recommendation(
      'attendance-intervention',
      PRIORITY.critical,
      'Arrange a one-to-one with the player to understand attendance barriers',
      `Attendance is at ${Math.round((attRate ?? 0) * 100)}% — well below the 75% minimum. At this level, the player is missing too much training to develop consistently. Physical conditioning will regress, and other players will advance past them. Common causes: transport, work/school conflicts, motivation issues, or undisclosed niggles.`,
      null,
      ['attendance', 'pastoral'],
    ));
  } else if (attScore != null && attScore < 75) {
    recs.push(recommendation(
      'attendance-review',
      PRIORITY.medium,
      `Set an attendance target with the player (aim for 80%+)`,
      `Attendance is at ${Math.round((attRate ?? 0) * 100)}% — below the recommended 75–80% minimum for consistent physical development. A simple goal-setting conversation can significantly improve attendance when players understand the connection between showing up and developing.`,
      null,
      ['attendance'],
    ));
  }

  return recs;
}

// ── Rule: No programme → generate one ────────────────────────────────────────

function checkProgrammeRules(player, programmes, analyses) {
  const recs = [];
  const activeInjuries = (player.injuries ?? []).filter(i => i.status === 'active');
  const activeProgrammes = programmes.filter(p => p.status === 'active');
  const completedProgrammes = programmes.filter(p => p.status === 'completed');
  const core = player.core ?? {};

  if (activeInjuries.length > 0) return recs; // don't recommend programme if injured

  if (programmes.length === 0) {
    recs.push(recommendation(
      'programme',
      PRIORITY.high,
      `Generate the first training programme for ${core.name ?? 'this player'}`,
      `No training programmes have been generated yet. Without a structured programme, development is unguided and progress will be slower. A personalised programme, even in template mode, gives the player clear goals and progressions.`,
      playerInput(player),
      ['programme', 'first-programme'],
    ));
  } else if (activeProgrammes.length === 0 && completedProgrammes.length > 0) {
    const lastCompleted = completedProgrammes[completedProgrammes.length - 1];
    const nextPhase     = getNextPhase(lastCompleted?.input?.seasonPhase);

    recs.push(recommendation(
      'programme',
      PRIORITY.high,
      `Generate the next programme block: ${nextPhase}`,
      `The last programme (${lastCompleted?.input?.seasonPhase ?? 'training'}) has been completed. The player is ready for the next block. Allowing a gap between programme blocks risks losing training adaptations — typically 7–10 days is the maximum before detraining begins.`,
      { ...playerInput(player), seasonPhase: nextPhase },
      ['programme', 'progression'],
    ));
  } else if (activeProgrammes.length > 1) {
    recs.push(recommendation(
      'programme-review',
      PRIORITY.medium,
      'Review active programmes — player appears to be on multiple plans simultaneously',
      `${activeProgrammes.length} active programmes detected. Running multiple overlapping programmes leads to overtraining, confusion, and programme abandonment. Consolidate to a single programme with clear daily structure.`,
      null,
      ['programme', 'review'],
    ));
  }

  return recs;
}

// ── Rule: Development score specific advice ───────────────────────────────────

function checkDevelopmentScoreRules(player, analyses) {
  const recs = [];
  const devScore = analyses.developmentSummary?.score ?? null;
  const bottomDimension = getBottomDimension(analyses);

  if (devScore == null) return recs;

  if (devScore >= 80) {
    recs.push(recommendation(
      'recognition',
      PRIORITY.low,
      `Recognise ${player.core?.name ?? 'this player'}'s strong development — consider increased challenge`,
      `Development score of ${devScore}/100 puts this player in the top tier. Continued growth requires increased challenge: more complex drills, higher intensity, leadership responsibilities, or potential promotion to a higher squad. Players at this level can plateau if not challenged appropriately.`,
      null,
      ['recognition', 'progression'],
    ));
  } else if (bottomDimension && bottomDimension.score < 55) {
    recs.push(recommendation(
      'targeted-development',
      PRIORITY.medium,
      `Focus development attention on ${bottomDimension.name} (current: ${bottomDimension.score}/100)`,
      `The weakest dimension in the player's profile is ${bottomDimension.name} with a score of ${bottomDimension.score}/100. Targeted attention here will have the highest leverage on the overall development score. ${dimensionAdvice(bottomDimension.name)}`,
      null,
      ['development', bottomDimension.name],
    ));
  }

  return recs;
}

// ── Rule: Promotion readiness ─────────────────────────────────────────────────

function checkPromotionRules(player, promotionReadiness) {
  const recs = [];
  if (!promotionReadiness) return recs;

  if (promotionReadiness.ready) {
    recs.push(recommendation(
      'promotion',
      PRIORITY.medium,
      `Consider promoting ${player.core?.name ?? 'player'} to ${promotionReadiness.nextGroup}`,
      `${player.core?.name ?? 'Player'} meets all promotion criteria (development ≥70, readiness ≥70, attendance ≥75%, no active injuries) and is approaching the upper age boundary for ${player.core?.ageGroup ?? 'current group'}. Promotion to ${promotionReadiness.nextGroup} would provide appropriate challenge and competitive exposure.`,
      null,
      ['promotion', promotionReadiness.nextGroup ?? ''],
    ));
  } else if (promotionReadiness.blockers?.length > 0) {
    recs.push(recommendation(
      'promotion-planning',
      PRIORITY.low,
      `Address blockers to ${promotionReadiness.nextGroup} promotion`,
      `Player is approaching the age boundary but has ${promotionReadiness.blockers.length} blocker(s): ${promotionReadiness.blockers.join('; ')}. Addressing these now will ensure a smooth transition when the time comes.`,
      null,
      ['promotion', 'planning'],
    ));
  }

  return recs;
}

// ── Rule: Injury prevention / prehab ─────────────────────────────────────────

function checkPrehabRules(player, analyses) {
  const recs = [];
  const injuryRisk = analyses.injuryRisk;
  if (!injuryRisk) return recs;

  if (injuryRisk.score >= 45 && !hasActiveInjury(player)) {
    const riskAreas = injuryRisk.rawData?.positionRisks?.slice(0, 2) ?? [];
    recs.push(recommendation(
      'prehab',
      PRIORITY.medium,
      `Introduce a prehab routine targeting ${riskAreas.length > 0 ? riskAreas.join(' and ') : 'position-specific risk areas'}`,
      `Injury risk score is ${injuryRisk.score}/100. ${injuryRisk.reasons.filter(r => r.includes('risk') || r.includes('injury') || r.includes('history')).slice(0, 2).join('. ')}. Proactive prehab reduces injury incidence by up to 50% in rugby players (Gabbett, 2012). 10 minutes per session is sufficient.`,
      null,
      ['prehab', 'prevention'],
    ));
  }

  return recs;
}

// ── Main recommendation generator ─────────────────────────────────────────────

export function generateRecommendations(player, programmes = [], analyses = {}, promotionReadiness = null) {
  const allRecs = [
    ...checkInjuryRules(player, programmes, analyses),
    ...checkAttendanceRules(player, analyses),
    ...checkProgrammeRules(player, programmes, analyses),
    ...checkPrehabRules(player, analyses),
    ...checkDevelopmentScoreRules(player, analyses),
    ...checkPromotionRules(player, promotionReadiness),
  ];

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return allRecs.sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function playerInput(player) {
  const core = player.core ?? {};
  return {
    name:        core.name,
    age:         core.age,
    position:    core.position,
    experience:  core.experience,
    goals:       (player.goals ?? []).map(g => g.goal ?? g),
    injuries:    (player.injuries ?? []).filter(i => i.status === 'active').map(i => i.type),
    trainingDays: 3,
    equipment:   ['Full gym'],
    seasonPhase: 'preseason',
  };
}

function getNextPhase(currentPhase = '') {
  const progression = {
    'preseason':   'Early Season',
    'early-season': 'Mid Season',
    'mid-season':  'Late Season',
    'late-season': 'Off Season',
    'off-season':  'Preseason',
  };
  return progression[currentPhase.toLowerCase().replace(' ', '-')] ?? 'Preseason';
}

function hasActiveInjury(player) {
  return (player.injuries ?? []).some(i => i.status === 'active');
}

function getBottomDimension(analyses) {
  const dims = ['attendance', 'programmeCompliance', 'strengthProgress', 'speedProgress', 'coachFeedback']
    .map(k => analyses[k] ? { name: k, score: analyses[k].score } : null)
    .filter(d => d?.score != null);
  if (!dims.length) return null;
  return dims.reduce((worst, d) => d.score < worst.score ? d : worst, dims[0]);
}

function dimensionAdvice(dimension) {
  const advice = {
    'attendance':          'Investigate barriers to attendance and set a joint goal with the player.',
    'programmeCompliance': 'Simplify the programme structure and confirm the player understands the schedule.',
    'strengthProgress':    'Review whether the strength programme is appropriately loaded and progressed.',
    'speedProgress':       'Increase conditioning work — aerobic base training 3× per week is the foundation.',
    'coachFeedback':       'Request detailed session notes from the coach after each session.',
  };
  return advice[dimension] ?? 'Review this area with the player and set a specific improvement target.';
}
