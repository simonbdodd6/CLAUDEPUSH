/**
 * AI Brain — Integration Fallbacks (M17)
 *
 * Valid empty responses for every CoachAI method.
 * Used when a tier doesn't include a feature, AI is globally disabled,
 * or the Brain product call fails.
 *
 * Every fallback is structurally identical to a real response — same fields,
 * same types, all arrays empty, all nullable fields null.
 * Core can render these without any null-checks on individual fields.
 *
 * IMPORTANT: fallbacks are functions (not constants) so each call gets a
 * fresh copy. Callers must never mutate the returned object.
 */

// ── IntegrationResponse envelope ─────────────────────────────────────────────

/**
 * Build the outer IntegrationResponse envelope.
 * This is what CoachAI returns to Core — Core reads only this shape.
 *
 * @param {object} opts
 * @param {boolean}      opts.ok
 * @param {boolean}      opts.available
 * @param {string}       opts.tier
 * @param {string|null}  opts.reason
 * @param {object|null}  opts.data
 * @returns {IntegrationResponse}
 */
export function makeResponse({ ok, available, tier, reason, data }) {
  return {
    integrationVersion: '1.0',
    ok:                  ok        ?? false,
    available:           available ?? false,
    tier:                tier      ?? 'free',
    reason:              reason    ?? null,
    data:                data      ?? null,
  }
}

// ── Data fallbacks per product ────────────────────────────────────────────────
// Each function returns a valid empty data object that mirrors the real shape.

export function dashboardFallback(coachId = null, clubId = null) {
  return {
    coachId,
    clubId,
    topPriorities:      [],
    biggestRisks:       [],
    trainingChecklist:  [],
    attendanceSummary:  {
      trend:             'unknown',
      observationCount:  0,
      observations:      [],
      recommendationId:  null,
    },
    medicalSummary:     { total: 0, concerns: [] },
    selectionReminders: [],
    recommendedActions: [],
    explanationIds:     [],
    confidence:         null,
    isMock:             true,
  }
}

export function playerCardFallback(playerId = null) {
  const emptyTrend = { trend: 'unknown', recentRate: null, evidence: [] }
  return {
    playerId,
    attendance:           { ...emptyTrend },
    availability:         { ...emptyTrend },
    improvementTrend:     { direction: 'unknown', observations: [] },
    coachObservations:    [],
    welfareIndicators:    [],
    developmentPriorities:[],
    explanationIds:       [],
    confidence:           null,
    isMock:               true,
  }
}

export function matchReadinessFallback(teamId = null) {
  return {
    teamId,
    squadReadinessPct:    null,
    availabilityPct:      null,
    injuryConcerns:       [],
    trainingCompletion:   { total: 0, estimatedMinutes: 0 },
    preparationChecklist: [],
    missingActions:       [],
    explanationIds:       [],
    confidence:           null,
    isMock:               true,
  }
}

export function clubSnapshotFallback(clubId = null) {
  const emptyHealth = { score: null, grade: 'N/A', isMock: true }
  return {
    clubId,
    engagement:          { score: null, trend: 'unknown', grade: 'N/A', isMock: true },
    attendance:          { trend: 'unknown', summary: null },
    operationalHealth:   { ...emptyHealth, summary: 'Status unavailable', rawGrade: null },
    activityTrends:      [],
    keyWarnings:         [],
    suggestedFocusAreas: [],
    explanationIds:      [],
    confidence:          null,
    isMock:              true,
  }
}

export function capabilitiesFallback(tier = 'free') {
  return {
    integrationVersion: '1.0',
    tier,
    isEnabled:          false,
    features: {
      dashboard:       false,
      weeklyBrief:     false,
      matchReadiness:  false,
      playerCard:      false,
      clubSnapshot:    false,
    },
    availableProducts:  [],
    upgradeAvailable:   true,
    limitations:        ['AI features are not available'],
    reason:             'ai_not_enabled',
  }
}
