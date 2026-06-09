/**
 * Club Predictions
 *
 * Uses trend data and current Digital Twin state to forecast future metrics
 * and flag emerging risks before they become critical.
 *
 * Prediction horizons: 7 days, 30 days, 90 days.
 * Method: linear extrapolation + rule-based scenario detection.
 *
 * Note: This is deterministic modelling, not probabilistic ML.
 *       AI narrative is added via the Knowledge Engine where available.
 */

// ── Lazy engine imports ───────────────────────────────────────────────────────

async function _knowledge() {
  try { return await import('../knowledge-engine/index.js'); } catch { return null; }
}

// ── Prediction engine ─────────────────────────────────────────────────────────

/**
 * Generate predictions from current model + trend data.
 */
export async function generatePredictions(model, trends) {
  const knowledge = await _knowledge();

  const forecastMetrics = forecastFromTrends(model, trends);
  const scenarios       = detectScenarios(model, trends, forecastMetrics);
  const interventions   = recommendInterventions(scenarios, model);

  const narrative = knowledge
    ? await buildAINarrative(knowledge, model, forecastMetrics, scenarios)
    : buildFallbackNarrative(forecastMetrics, scenarios);

  return {
    horizon:      '90 days',
    computedAt:   new Date().toISOString(),
    forecasts:    forecastMetrics,
    scenarios,
    interventions,
    narrative,
    confidence:   computeConfidence(trends),
    source:       knowledge ? 'knowledge-engine + trend-analysis' : 'trend-analysis',
  };
}

// ── Metric forecasting ────────────────────────────────────────────────────────

function forecastFromTrends(model, trends) {
  const current = extractCurrentMetrics(model);
  const trendData = trends?.windows?.['30d']?.metrics ?? {};

  const forecasts = {};

  for (const [metric, curr] of Object.entries(current)) {
    const t = trendData[metric];
    if (!t || t.samples < 3) {
      forecasts[metric] = { current: curr, '7d': curr, '30d': curr, '90d': curr, confidence: 'low', trend: 'unknown' };
      continue;
    }

    // Linear extrapolation: change per sample → project forward
    const samplesPerDay = t.samples / 30; // we have 30-day window
    const changePerDay  = t.change / 30;

    const f7  = round(curr + changePerDay * 7,  metric);
    const f30 = round(curr + changePerDay * 30, metric);
    const f90 = round(curr + changePerDay * 90, metric);

    forecasts[metric] = {
      current:    curr,
      '7d':       f7,
      '30d':      f30,
      '90d':      f90,
      changeRate: changePerDay.toFixed(2) + '/day',
      trend:      t.direction,
      confidence: t.samples >= 10 ? 'medium' : 'low',
    };
  }

  return forecasts;
}

function extractCurrentMetrics(model) {
  return {
    healthScore:      model.health?.score ?? 0,
    playerCount:      model.players?.activeCount ?? 0,
    injuredCount:     model.players?.injuredCount ?? 0,
    availabilityRate: model.players?.availabilityRate ?? 0,
    retentionRate:    model.membership?.retentionRate ?? 0,
    dataCompleteness: model.dataCompleteness ?? 0,
    pendingApprovals: model.committee?.pendingApprovals ?? 0,
  };
}

function round(value, metric) {
  const intMetrics = ['playerCount', 'injuredCount', 'pendingApprovals'];
  const v = intMetrics.includes(metric) ? Math.round(value) : Math.round(value * 10) / 10;
  // Clamp to reasonable ranges
  if (metric === 'healthScore' || metric === 'availabilityRate' || metric === 'retentionRate' || metric === 'dataCompleteness') {
    return Math.max(0, Math.min(100, v));
  }
  if (metric === 'playerCount' || metric === 'injuredCount' || metric === 'pendingApprovals') {
    return Math.max(0, v);
  }
  return v;
}

// ── Scenario detection ────────────────────────────────────────────────────────

export const SCENARIO_TYPES = {
  HEALTH_DECLINE:      'HEALTH_DECLINE',
  INJURY_SURGE:        'INJURY_SURGE',
  RETENTION_CRISIS:    'RETENTION_CRISIS',
  SQUAD_DEPTH_CRISIS:  'SQUAD_DEPTH_CRISIS',
  ENGAGEMENT_DROP:     'ENGAGEMENT_DROP',
  APPROVAL_BACKLOG:    'APPROVAL_BACKLOG',
  SPONSOR_CLIFF:       'SPONSOR_CLIFF',
  DATA_DRIFT:          'DATA_DRIFT',
};

function detectScenarios(model, trends, forecasts) {
  const scenarios = [];

  // Scenario 1: Health declining fast
  if (forecasts.healthScore?.['30d'] != null && forecasts.healthScore['30d'] < 50 && (model.health?.score ?? 100) > 50) {
    scenarios.push(scenario(SCENARIO_TYPES.HEALTH_DECLINE, 'HIGH',
      'Club health projected to fall below 50/100 in 30 days',
      forecasts.healthScore['30d'],
      '30 days',
    ));
  }

  // Scenario 2: Injury surge
  const f90inj = forecasts.injuredCount?.['90d'];
  const currPlayers = model.players?.activeCount ?? 0;
  if (f90inj != null && currPlayers > 0 && (f90inj / currPlayers) > 0.20) {
    scenarios.push(scenario(SCENARIO_TYPES.INJURY_SURGE, 'HIGH',
      `Injury count could reach ${f90inj} (${Math.round(f90inj/currPlayers*100)}% of squad) in 90 days`,
      f90inj,
      '90 days',
    ));
  }

  // Scenario 3: Retention crisis
  const f30ret = forecasts.retentionRate?.['30d'];
  if (f30ret != null && f30ret < 65 && (forecasts.retentionRate?.current ?? 100) > 65) {
    scenarios.push(scenario(SCENARIO_TYPES.RETENTION_CRISIS, 'HIGH',
      `Membership retention projected to fall to ${f30ret}% in 30 days`,
      f30ret,
      '30 days',
    ));
  }

  // Scenario 4: Squad depth crisis
  const f30avail = forecasts.availabilityRate?.['30d'];
  if (f30avail != null && f30avail < 70) {
    scenarios.push(scenario(SCENARIO_TYPES.SQUAD_DEPTH_CRISIS, 'MEDIUM',
      `Player availability could fall to ${f30avail}% in 30 days — match selection at risk`,
      f30avail,
      '30 days',
    ));
  }

  // Scenario 5: Approval backlog explosion
  const f7approvals = forecasts.pendingApprovals?.['7d'];
  if (f7approvals != null && f7approvals >= 8) {
    scenarios.push(scenario(SCENARIO_TYPES.APPROVAL_BACKLOG, 'MEDIUM',
      `Committee approval queue could grow to ${f7approvals} items within 7 days`,
      f7approvals,
      '7 days',
    ));
  }

  // Scenario 6: Data completeness drift
  const f30dc = forecasts.dataCompleteness?.['30d'];
  if (f30dc != null && f30dc < 60 && (forecasts.dataCompleteness?.current ?? 100) > 60) {
    scenarios.push(scenario(SCENARIO_TYPES.DATA_DRIFT, 'LOW',
      `Digital Twin data completeness may fall to ${f30dc}% — engine updates needed`,
      f30dc,
      '30 days',
    ));
  }

  // Scenario 7: Sponsor cliff
  const renewals = (model.sponsors?.upcomingRenewals ?? []).filter(s => (s.daysUntilRenewal ?? 999) <= 90);
  if (renewals.length >= 2) {
    scenarios.push(scenario(SCENARIO_TYPES.SPONSOR_CLIFF, 'HIGH',
      `${renewals.length} sponsor renewals due in the next 90 days — revenue at risk`,
      renewals.length,
      '90 days',
    ));
  }

  // Sort by urgency (days to horizon)
  const horizonDays = { '7 days': 7, '30 days': 30, '90 days': 90 };
  scenarios.sort((a, b) => (horizonDays[a.horizon] ?? 99) - (horizonDays[b.horizon] ?? 99));

  return scenarios;
}

function scenario(type, severity, description, projectedValue, horizon) {
  return { type, severity, description, projectedValue, horizon, detectedAt: new Date().toISOString() };
}

// ── Intervention recommendations ──────────────────────────────────────────────

function recommendInterventions(scenarios, model) {
  const map = {
    [SCENARIO_TYPES.HEALTH_DECLINE]:     'Run a comprehensive club health review. Address the weakest scoring dimensions first.',
    [SCENARIO_TYPES.INJURY_SURGE]:       'Review training loads across all squads. Schedule physio assessments and reduce contact in next 2 sessions.',
    [SCENARIO_TYPES.RETENTION_CRISIS]:   'Launch immediate player engagement campaign. 1-1 check-ins with players flagged as at-risk.',
    [SCENARIO_TYPES.SQUAD_DEPTH_CRISIS]: 'Check junior squad availability for promotion. Contact reserve players about fixture availability.',
    [SCENARIO_TYPES.ENGAGEMENT_DROP]:    'Schedule a club social event. Send personalised player development updates.',
    [SCENARIO_TYPES.APPROVAL_BACKLOG]:   'Block 1 hour this week for committee approval session. Delegate routine approvals to head coach.',
    [SCENARIO_TYPES.SPONSOR_CLIFF]:      'Prepare renewal proposals for all at-risk sponsors. Schedule meetings immediately.',
    [SCENARIO_TYPES.DATA_DRIFT]:         'Update player and coach records. Run platform integration health check.',
  };

  return scenarios.map(s => ({
    scenario:    s.type,
    horizon:     s.horizon,
    severity:    s.severity,
    action:      map[s.type] ?? 'Review and address this emerging risk.',
  }));
}

// ── Confidence score ──────────────────────────────────────────────────────────

function computeConfidence(trends) {
  const snaps = trends?.totalSnapshots ?? 0;
  if (snaps >= 30) return 'high';
  if (snaps >= 10) return 'medium';
  if (snaps >= 3)  return 'low';
  return 'insufficient-data';
}

// ── AI narrative ──────────────────────────────────────────────────────────────

async function buildAINarrative(knowledge, model, forecasts, scenarios) {
  const prompt = `You are a sports club AI analyst. Based on these Digital Twin projections for ${model.identity.name}, ` +
    `write a 2-paragraph forward-looking analysis. ` +
    `Current health: ${model.health?.score ?? 'N/A'}/100. ` +
    `30-day health forecast: ${forecasts.healthScore?.['30d'] ?? 'stable'}. ` +
    `Scenarios detected: ${scenarios.map(s => s.description).join('; ') || 'none'}. ` +
    `Focus on what the club should do now to avoid the projected risks.`;

  try {
    const result = await knowledge.ask(prompt, { maxTokens: 400 });
    return result?.answer ?? buildFallbackNarrative(forecasts, scenarios);
  } catch {
    return buildFallbackNarrative(forecasts, scenarios);
  }
}

function buildFallbackNarrative(forecasts, scenarios) {
  const health30 = forecasts.healthScore?.['30d'];
  const lines = [];
  if (health30 != null) {
    const dir = health30 > (forecasts.healthScore?.current ?? 0) ? 'improve to' : 'decline to';
    lines.push(`Club health is projected to ${dir} ${health30}/100 over the next 30 days.`);
  } else {
    lines.push('Insufficient trend data to project health score — more data points needed.');
  }
  if (scenarios.length === 0) {
    lines.push('No major risk scenarios detected based on current trends.');
  } else {
    lines.push(`${scenarios.length} risk scenario${scenarios.length > 1 ? 's' : ''} detected: ${scenarios[0].description}.`);
  }
  return lines.join(' ');
}
