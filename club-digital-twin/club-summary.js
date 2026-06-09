/**
 * Club Summary Generator
 *
 * Produces executive summaries, weekly reports and board packs
 * by combining the structured Digital Twin model with AI narrative
 * from the Knowledge Engine.
 *
 * All summaries are structured (sections + narrative) so they can be
 * rendered in the UI, exported as PDF, or sent as email.
 */

// ── Lazy engine imports ───────────────────────────────────────────────────────

async function _knowledge() {
  try { return await import('../knowledge-engine/index.js'); } catch { return null; }
}

// ── Executive Summary ─────────────────────────────────────────────────────────

/**
 * Weekly executive summary — concise, 1 page equivalent.
 * Audience: Chair, DoR, Head Coach.
 */
export async function generateExecutiveSummary(model, risks, trends) {
  const knowledge = await _knowledge();
  const date = new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const structuredData = buildSummaryContext(model, risks, trends);
  const aiNarrative    = knowledge ? await getAINarrative(knowledge, structuredData, 'weekly_executive') : null;

  return {
    type:      'executive_summary',
    title:     `Weekly Executive Summary — ${model.identity.name}`,
    date,
    audience:  ['Chair', 'Director of Rugby', 'Head Coach'],
    sections:  buildExecutiveSections(model, risks, trends, structuredData),
    narrative: aiNarrative?.answer ?? buildFallbackNarrative(structuredData),
    data:      structuredData,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Monthly board report — formal, comprehensive.
 * Audience: Full committee.
 */
export async function generateBoardReport(model, risks, trends) {
  const knowledge = await _knowledge();
  const month = new Date().toLocaleDateString('en-IE', { month: 'long', year: 'numeric' });

  const structuredData = buildSummaryContext(model, risks, trends);
  const aiNarrative    = knowledge ? await getAINarrative(knowledge, structuredData, 'monthly_board') : null;

  return {
    type:      'board_report',
    title:     `Monthly Board Report — ${model.identity.name} — ${month}`,
    date:      month,
    audience:  ['Full Committee', 'Board of Directors'],
    sections:  buildBoardSections(model, risks, trends, structuredData),
    narrative: aiNarrative?.answer ?? buildFallbackNarrative(structuredData),
    data:      structuredData,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Morning briefing — daily snapshot for the Head Coach.
 */
export async function generateMorningBriefing(model, risks) {
  const critRisks = (risks?.risks ?? []).filter(r => r.severity === 'CRITICAL' || r.severity === 'HIGH');
  return {
    type:    'morning_briefing',
    title:   `Good morning, Coach — ${new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    summary: buildMorningSummary(model),
    topRisks: critRisks.slice(0, 3),
    todayPriorities: buildTodayPriorities(model, critRisks),
    healthScore: model.health?.score,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Custom question — AI answers any ad hoc question about the club.
 */
export async function answerClubQuestion(question, model, risks, trends) {
  const knowledge = await _knowledge();
  if (!knowledge) return { question, answer: buildFallbackAnswer(question, model), source: 'model' };

  const context = buildSummaryContext(model, risks, trends);
  const prompt  = `[Club Digital Twin context]\n${JSON.stringify(context, null, 2)}\n\nQuestion: ${question}`;

  const result = await safeFetch(() => knowledge.ask(prompt, { maxTokens: 600 }));
  return {
    question,
    answer:   result?.answer ?? buildFallbackAnswer(question, model),
    evidence: result?.citations ?? [],
    source:   result ? 'knowledge-engine' : 'model',
    answeredAt: new Date().toISOString(),
  };
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildExecutiveSections(model, risks, trends, ctx) {
  return [
    {
      title: 'Club Health',
      content: [
        `Overall score: ${ctx.healthScore ?? 'N/A'}/100 (${ctx.healthGrade ?? 'N/A'}) — ${ctx.healthStatus}`,
        ctx.healthDelta != null ? `Change from last period: ${ctx.healthDelta > 0 ? '+' : ''}${ctx.healthDelta} points` : null,
        `Weakest dimension: ${ctx.weakestDimension ?? 'unknown'}`,
      ].filter(Boolean),
    },
    {
      title: 'Squad Status',
      content: [
        `Players: ${ctx.playerCount} active, ${ctx.injuredCount} injured (${ctx.availabilityRate ?? '?'}% available)`,
        ctx.atRiskCount > 0 ? `${ctx.atRiskCount} players flagged as high retention risk` : null,
        `Development: ${ctx.devImproving} improving, ${ctx.devDeclining} declining`,
      ].filter(Boolean),
    },
    {
      title: 'Key Risks',
      content: (risks?.risks ?? []).slice(0, 5).map(r => `[${r.severity}] ${r.title} — ${r.recommendedAction}`),
    },
    {
      title: 'This Week\'s Priorities',
      content: (model.recommendations ?? []).slice(0, 5).map(r => `→ ${r.action ?? r.title ?? r}`),
    },
    {
      title: 'Communications',
      content: [
        `${ctx.pendingDrafts} drafts awaiting approval`,
        `${ctx.pendingApprovals} items in committee queue`,
      ],
    },
  ];
}

function buildBoardSections(model, risks, trends, ctx) {
  const exec = buildExecutiveSections(model, risks, trends, ctx);
  return [
    ...exec,
    {
      title: 'Membership & Retention',
      content: [
        `Active members: ${ctx.playerCount}`,
        ctx.retentionRate != null ? `Retention rate: ${ctx.retentionRate}%` : 'Retention data unavailable',
        `Membership trend: ${ctx.membershipTrend ?? 'stable'}`,
      ],
    },
    {
      title: 'Coaching & Development',
      content: [
        `Active coaches: ${ctx.coachCount}`,
        ctx.playerRatio ? `Player:coach ratio: 1:${ctx.playerRatio}` : null,
        `Sessions delivered: ${ctx.sessionsDelivered ?? 0}`,
      ].filter(Boolean),
    },
    {
      title: 'Sponsorship',
      content: [
        `Active sponsors: ${ctx.sponsorCount ?? 0}`,
        ctx.sponsorsAtRisk > 0 ? `⚠ ${ctx.sponsorsAtRisk} renewals due within 30 days` : 'No urgent renewals',
      ],
    },
    {
      title: 'Finance',
      content: ['Finance module — coming in next development phase.'],
    },
    {
      title: 'Data Completeness',
      content: [`Digital Twin data completeness: ${ctx.dataCompleteness}%`],
    },
  ];
}

function buildMorningSummary(model) {
  const h = model.health;
  return `Club health ${h?.score ?? 'N/A'}/100 (${h?.grade ?? '?'}). ` +
         `${model.players?.injuredCount ?? 0} players injured. ` +
         `${model.committee?.pendingApprovals ?? 0} approvals waiting.`;
}

function buildTodayPriorities(model, critRisks) {
  const prios = [];
  for (const r of critRisks.slice(0, 3)) prios.push(r.recommendedAction);
  for (const rec of (model.recommendations ?? []).slice(0, 3)) {
    const text = rec.action ?? rec.title ?? rec;
    if (!prios.includes(text)) prios.push(text);
  }
  return prios.slice(0, 5);
}

// ── AI narrative helper ───────────────────────────────────────────────────────

async function getAINarrative(knowledge, ctx, type) {
  const prompts = {
    weekly_executive: `You are the AI coach for ${ctx.clubName}. Write a concise 3-paragraph weekly executive summary. ` +
      `Club health: ${ctx.healthScore}/100 (${ctx.healthGrade}). ` +
      `Players: ${ctx.playerCount} active, ${ctx.injuredCount} injured. ` +
      `Top risks: ${(ctx.topRisks ?? []).slice(0, 3).map(r => r.title).join(', ')}. ` +
      `Top recommendations: ${(ctx.topRecommendations ?? []).slice(0, 3).join(', ')}.`,
    monthly_board: `Write a formal monthly board report executive summary for ${ctx.clubName}. ` +
      `Key metrics: health score ${ctx.healthScore}/100, ${ctx.playerCount} players, ${ctx.coachCount} coaches, ` +
      `${ctx.injuredCount} injuries, ${ctx.retentionRate ?? 'unknown'}% retention rate. ` +
      `Include forward-looking paragraph on opportunities and risks.`,
  };

  return safeFetch(() => knowledge.ask(prompts[type] ?? prompts.weekly_executive, { maxTokens: 400 }));
}

function buildFallbackNarrative(ctx) {
  return `${ctx.clubName} is operating at ${ctx.healthScore ?? 'N/A'}/100 club health (${ctx.healthGrade ?? 'N/A'} grade). ` +
         `The squad currently has ${ctx.playerCount} active players with ${ctx.injuredCount} injuries. ` +
         (ctx.topRisks?.length > 0 ? `Top priority: ${ctx.topRisks[0]?.title}.` : 'No critical risks detected.');
}

function buildFallbackAnswer(question, model) {
  return `Based on the Digital Twin: ${model.identity.name} — health ${model.health?.score ?? 'N/A'}/100. ` +
         `${model.players?.activeCount ?? 0} players, ${model.players?.injuredCount ?? 0} injured. ` +
         `(Knowledge Engine unavailable — install for AI-powered answers.)`;
}

// ── Context builder (shared across all summary types) ────────────────────────

function buildSummaryContext(model, risks, trends) {
  const dims       = model.health?.dimensions ?? [];
  const weakest    = [...dims].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const trendNarr  = trends?.windows?.['30d']?.metrics?.healthScore;

  return {
    clubName:         model.identity.name,
    healthScore:      model.health?.score,
    healthGrade:      model.health?.grade,
    healthStatus:     model.health?.status ?? healthStatus(model.health?.score),
    healthDelta:      model.health?.delta,
    weakestDimension: weakest?.label,
    playerCount:      model.players?.activeCount ?? 0,
    injuredCount:     model.players?.injuredCount ?? 0,
    availabilityRate: model.players?.availabilityRate,
    atRiskCount:      model.players?.atRiskCount ?? 0,
    devImproving:     model.players?.development?.improving ?? 0,
    devDeclining:     model.players?.development?.declining ?? 0,
    coachCount:       model.coaches?.activeCount ?? 0,
    playerRatio:      model.coaches?.playerRatio,
    sessionsDelivered: model.coaches?.sessionsDelivered ?? 0,
    retentionRate:    model.membership?.retentionRate,
    membershipTrend:  model.membership?.trend,
    sponsorCount:     model.sponsors?.active ?? 0,
    sponsorsAtRisk:   (model.sponsors?.upcomingRenewals ?? []).filter(s => (s.daysUntilRenewal ?? 999) <= 30).length,
    pendingApprovals: model.committee?.pendingApprovals ?? 0,
    pendingDrafts:    model.communications?.pendingDrafts ?? 0,
    dataCompleteness: model.dataCompleteness ?? 0,
    topRisks:         (risks?.risks ?? []).slice(0, 5),
    topRecommendations: (model.recommendations ?? []).slice(0, 3).map(r => r.action ?? r.title ?? r),
    trendSummary:     trendNarr ? `Health ${trendNarr.direction === 'up' ? 'improved' : 'declined'} ${Math.abs(trendNarr.change)} pts (30d)` : null,
  };
}

function healthStatus(score) {
  if (score == null) return 'unknown';
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 50) return 'fair';
  return 'needs attention';
}

// ── Utility ───────────────────────────────────────────────────────────────────

async function safeFetch(fn) {
  try { return await fn(); } catch { return null; }
}
