import { createHash, randomUUID } from 'crypto';
import { checkAll } from '../../../platform/platform-health.js';
import { buildExecutiveBriefing } from '../../../dashboard/index.js';
import { runCheck } from '../../../autonomous-assistant/assistant-core.js';
import {
  INBOX_STATUS,
  loadInbox,
  saveBriefings,
  updateBriefingStatus,
} from './inbox-state.js';

export { INBOX_STATUS, loadInbox, updateBriefingStatus };

export const EVENT_CATEGORIES = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  INFORMATIONAL: 'Informational',
};

const CATEGORY_SCORE = {
  [EVENT_CATEGORIES.CRITICAL]: 100,
  [EVENT_CATEGORIES.HIGH]: 80,
  [EVENT_CATEGORIES.MEDIUM]: 55,
  [EVENT_CATEGORIES.LOW]: 30,
  [EVENT_CATEGORIES.INFORMATIONAL]: 10,
};

const IMPACT_SCORE = { VERY_HIGH: 100, HIGH: 80, MEDIUM: 55, LOW: 30, UNKNOWN: 20 };

function stableId(seed) {
  return `brief_${createHash('sha1').update(seed).digest('hex').slice(0, 16)}`;
}

function dedupeKey(signal) {
  return [
    signal.sourceEngine ?? 'unknown',
    signal.type ?? 'unknown',
    signal.subjectId ?? signal.headline ?? 'subject',
    signal.category ?? 'category',
  ].join(':').toLowerCase();
}

function rankScore(signal) {
  const urgency = CATEGORY_SCORE[signal.category] ?? 10;
  const confidence = signal.confidence ?? 50;
  const impact = IMPACT_SCORE[signal.estimatedBusinessImpact?.level ?? signal.impactLevel ?? 'UNKNOWN'] ?? 20;
  const ownerAttention = signal.ownerAttentionRequired ? 12 : 0;
  return Math.round((urgency * 0.45) + (impact * 0.30) + (confidence * 0.20) + ownerAttention);
}

function briefingFromSignal(signal) {
  const key = dedupeKey(signal);
  const rank = rankScore(signal);
  return {
    id: stableId(key),
    dedupeKey: key,
    status: INBOX_STATUS.UNREAD,
    category: signal.category,
    sourceEngine: signal.sourceEngine,
    type: signal.type,
    headline: signal.headline,
    executiveSummary: signal.executiveSummary,
    whyThisMatters: signal.whyThisMatters,
    evidence: signal.evidence ?? [],
    confidence: signal.confidence ?? 50,
    recommendedAction: signal.recommendedAction,
    timeSensitivity: signal.timeSensitivity ?? 'Monitor during the next operating cycle.',
    riskIfIgnored: signal.riskIfIgnored ?? 'Signal may become stale or compound into a larger issue.',
    estimatedBusinessImpact: signal.estimatedBusinessImpact ?? { level: 'UNKNOWN', narrative: 'Impact not yet quantified.' },
    ownerAttentionRequired: signal.ownerAttentionRequired ?? signal.category !== EVENT_CATEGORIES.INFORMATIONAL,
    requiresHumanApproval: true,
    autonomousExternalExecutionAllowed: false,
    rankScore: rank,
    createdAt: new Date().toISOString(),
    links: {
      missions: signal.links?.missions ?? [],
      opportunities: signal.links?.opportunities ?? [],
      worldModel: signal.links?.worldModel ?? [],
      companyMemory: signal.links?.companyMemory ?? [],
      executiveCouncilDecisions: signal.links?.executiveCouncilDecisions ?? [],
    },
  };
}

function uniqueBriefings(briefings) {
  const map = new Map();
  for (const briefing of briefings) {
    const current = map.get(briefing.dedupeKey);
    if (!current || briefing.rankScore > current.rankScore) map.set(briefing.dedupeKey, briefing);
  }
  return [...map.values()].sort((a, b) => b.rankScore - a.rankScore);
}

export function detectSignificantEvents(snapshot = {}) {
  const signals = [
    ...detectProviderLayerEvents(snapshot.platformHealth),
    ...detectCompanyHealthEvents(snapshot.executiveDashboard, snapshot.assistant),
    ...detectExecutiveCouncilEvents(snapshot.executiveDashboard, snapshot.assistant),
    ...detectDigitalTwinEvents(snapshot.assistant),
    ...detectOpportunityEvents(snapshot.assistant),
    ...detectAutonomousWorkforceEvents(snapshot.assistant),
    ...detectWorldAndMemoryEvents(snapshot),
  ];

  return uniqueBriefings(signals.map(briefingFromSignal));
}

function detectProviderLayerEvents(platformHealth) {
  if (!platformHealth) return [];
  const unhealthy = platformHealth.engines?.filter(e => e.status === 'unhealthy' && !e.optional) ?? [];
  const degraded = platformHealth.engines?.filter(e => e.status === 'unhealthy' && e.optional) ?? [];
  const dependencyIssues = platformHealth.dependencyIssues ?? [];
  const signals = [];

  if (unhealthy.length) {
    signals.push({
      sourceEngine: 'Provider Layer',
      type: 'PROVIDER_OUTAGE',
      subjectId: unhealthy.map(e => e.engineId).sort().join(','),
      category: unhealthy.length >= 3 ? EVENT_CATEGORIES.CRITICAL : EVENT_CATEGORIES.HIGH,
      headline: `${unhealthy.length} required engine${unhealthy.length === 1 ? '' : 's'} unavailable`,
      executiveSummary: `Required platform engines are failing health checks: ${unhealthy.map(e => e.name).join(', ')}.`,
      whyThisMatters: 'Required engine outages can block mission execution, owner briefings, and AI worker progress.',
      evidence: unhealthy.map(e => ({ label: e.name, value: e.error ?? e.status, engineId: e.engineId })),
      confidence: 90,
      recommendedAction: 'Review provider/engine health, restore required dependencies, and avoid approving dependent external actions until healthy.',
      timeSensitivity: 'Immediate if missions or customer-facing workflows depend on these engines.',
      riskIfIgnored: 'Blocked work may compound, AI outputs may become incomplete, and owner attention may be misdirected.',
      estimatedBusinessImpact: { level: unhealthy.length >= 3 ? 'VERY_HIGH' : 'HIGH', narrative: 'Operational continuity risk.' },
      links: { worldModel: ['platform-health'], companyMemory: ['engine-registry'] },
    });
  }

  if (!unhealthy.length && degraded.length) {
    signals.push({
      sourceEngine: 'Provider Layer',
      type: 'PROVIDER_DEGRADED',
      subjectId: degraded.map(e => e.engineId).sort().join(','),
      category: EVENT_CATEGORIES.MEDIUM,
      headline: `${degraded.length} optional engine${degraded.length === 1 ? '' : 's'} degraded`,
      executiveSummary: `Optional engines are degraded: ${degraded.map(e => e.name).join(', ')}.`,
      whyThisMatters: 'Optional engine degradation may reduce intelligence quality without fully blocking core operations.',
      evidence: degraded.map(e => ({ label: e.name, value: e.error ?? e.status, engineId: e.engineId })),
      confidence: 85,
      recommendedAction: 'Monitor degradation and restore if the affected capability is needed today.',
      timeSensitivity: 'Same day.',
      riskIfIgnored: 'Briefings may omit useful context and recommendations may become less complete.',
      estimatedBusinessImpact: { level: 'MEDIUM', narrative: 'Reduced intelligence completeness.' },
      ownerAttentionRequired: false,
    });
  }

  if (dependencyIssues.length) {
    signals.push({
      sourceEngine: 'Provider Layer',
      type: 'DEPENDENCY_RISK',
      subjectId: 'dependency-issues',
      category: EVENT_CATEGORIES.HIGH,
      headline: `${dependencyIssues.length} engine dependency issue${dependencyIssues.length === 1 ? '' : 's'} detected`,
      executiveSummary: 'The platform registry reports dependency breakage that may affect downstream engines.',
      whyThisMatters: 'Dependency issues cause hidden failures where one healthy-looking surface returns incomplete intelligence.',
      evidence: dependencyIssues.map(issue => ({ label: 'Dependency issue', value: issue })),
      confidence: 88,
      recommendedAction: 'Fix upstream dependencies before trusting downstream executive recommendations.',
      timeSensitivity: 'Today.',
      riskIfIgnored: 'False confidence in incomplete intelligence.',
      estimatedBusinessImpact: { level: 'HIGH', narrative: 'Execution and decision-quality risk.' },
    });
  }

  return signals;
}

function detectCompanyHealthEvents(executiveDashboard, assistant) {
  const signals = [];
  const score = executiveDashboard?.summary?.healthScore ?? assistant?.observations?.twinStatus?.healthScore ?? assistant?.observations?.health?.score;
  if (typeof score === 'number' && score < 60) {
    signals.push({
      sourceEngine: 'Company Health',
      type: 'COMPANY_HEALTH_DECLINING',
      subjectId: 'health-score',
      category: score < 45 ? EVENT_CATEGORIES.CRITICAL : EVENT_CATEGORIES.HIGH,
      headline: `Company health at ${score}/100`,
      executiveSummary: `The latest health score is below the safe operating threshold.`,
      whyThisMatters: 'Health deterioration is usually a leading indicator for revenue, retention, delivery, or operational risk.',
      evidence: [{ label: 'Health score', value: score }, { label: 'Headline', value: executiveDashboard?.summary?.headline ?? assistant?.briefing?.headline }],
      confidence: 82,
      recommendedAction: 'Review the top contributing issues and decide which mission should be prioritized today.',
      timeSensitivity: 'Today.',
      riskIfIgnored: 'Risks may compound into missed revenue, churn, or delivery failure.',
      estimatedBusinessImpact: { level: score < 45 ? 'VERY_HIGH' : 'HIGH', narrative: 'Core operating health is below threshold.' },
      links: { missions: ['company-health-review'], worldModel: ['health-score'], companyMemory: ['historical-health'] },
    });
  }

  const critical = assistant?.summary?.critical ?? 0;
  const high = assistant?.summary?.high ?? 0;
  if (critical || high >= 3) {
    signals.push({
      sourceEngine: 'Company Health',
      type: 'SIGNIFICANT_RISK_CLUSTER',
      subjectId: 'risk-cluster',
      category: critical ? EVENT_CATEGORIES.CRITICAL : EVENT_CATEGORIES.HIGH,
      headline: critical ? `${critical} critical risk${critical === 1 ? '' : 's'} detected` : `${high} high-priority risks detected`,
      executiveSummary: 'The autonomous assistant detected a cluster of risks that may need owner sequencing.',
      whyThisMatters: 'Multiple high-priority signals often compete for the same owner attention and require deliberate prioritization.',
      evidence: (assistant?.recommendations ?? []).slice(0, 5).map(r => ({ label: r.type, value: r.title, urgency: r.urgency })),
      confidence: 84,
      recommendedAction: 'Choose the top one to three risks to address before approving lower-impact work.',
      timeSensitivity: 'This operating cycle.',
      riskIfIgnored: 'Team attention may fragment and urgent work may be delayed.',
      estimatedBusinessImpact: { level: critical ? 'VERY_HIGH' : 'HIGH', narrative: 'Risk cluster needs owner prioritization.' },
      links: { missions: ['risk-triage'], executiveCouncilDecisions: ['priority-setting'] },
    });
  }
  return signals;
}

function detectExecutiveCouncilEvents(executiveDashboard, assistant) {
  const signals = [];
  const pending = executiveDashboard?.approvalQueue?.items?.length ?? assistant?.classified?.approve?.length ?? 0;
  const human = assistant?.classified?.human?.length ?? 0;

  if (pending || human >= 3) {
    signals.push({
      sourceEngine: 'Executive Council',
      type: 'OWNER_ATTENTION_REQUIRED',
      subjectId: 'approval-queue',
      category: human >= 3 ? EVENT_CATEGORIES.HIGH : EVENT_CATEGORIES.MEDIUM,
      headline: `${pending + human} item${pending + human === 1 ? '' : 's'} awaiting owner judgement`,
      executiveSummary: 'There are decisions that should not be automated and need an owner or council decision.',
      whyThisMatters: 'Human approval remains mandatory for judgement-heavy or high-risk work.',
      evidence: [
        { label: 'Pending approvals', value: pending },
        { label: 'Human judgement items', value: human },
      ],
      confidence: 86,
      recommendedAction: 'Review the executive inbox and approve, reject, or defer the highest-impact item.',
      timeSensitivity: 'Today.',
      riskIfIgnored: 'Blocked work may accumulate and automated systems may wait without clear direction.',
      estimatedBusinessImpact: { level: human >= 3 ? 'HIGH' : 'MEDIUM', narrative: 'Decision latency risk.' },
      links: { executiveCouncilDecisions: ['approval-queue'], missions: ['owner-review'] },
    });
  }
  return signals;
}

function detectDigitalTwinEvents(assistant) {
  const obs = assistant?.observations;
  if (!obs) return [];
  const signals = [];
  if (obs.source === 'mock' || (obs.confidence ?? 100) < 55) {
    signals.push({
      sourceEngine: 'Digital Twin',
      type: 'WORLD_MODEL_CONFIDENCE_LOW',
      subjectId: 'digital-twin-confidence',
      category: EVENT_CATEGORIES.MEDIUM,
      headline: 'Digital Twin confidence is low',
      executiveSummary: 'The current intelligence snapshot is relying on mock or low-confidence observations.',
      whyThisMatters: 'Executive decisions should be based on live company state where possible.',
      evidence: [{ label: 'Observation source', value: obs.source }, { label: 'Confidence', value: obs.confidence }],
      confidence: 78,
      recommendedAction: 'Refresh or reconnect the Digital Twin inputs before making irreversible decisions.',
      timeSensitivity: 'Before major approval decisions.',
      riskIfIgnored: 'Recommendations may be directionally useful but operationally stale.',
      estimatedBusinessImpact: { level: 'MEDIUM', narrative: 'Decision-quality risk.' },
      ownerAttentionRequired: false,
      links: { worldModel: ['digital-twin'], companyMemory: ['observation-history'] },
    });
  }
  return signals;
}

function detectOpportunityEvents(assistant) {
  const recs = assistant?.recommendations ?? [];
  return recs
    .filter(r => ['MEMBERSHIP_EXPIRY', 'COMMUNICATION_GAP'].includes(r.type) || r.impact === 'HIGH')
    .slice(0, 3)
    .map(r => ({
      sourceEngine: 'Opportunities',
      type: 'SIGNIFICANT_OPPORTUNITY_OR_LEVER',
      subjectId: r.type,
      category: r.urgency === 'CRITICAL' ? EVENT_CATEGORIES.CRITICAL : r.urgency === 'HIGH' ? EVENT_CATEGORIES.HIGH : EVENT_CATEGORIES.MEDIUM,
      headline: r.title,
      executiveSummary: r.reason,
      whyThisMatters: 'This signal can convert into business value or risk reduction if acted on while timely.',
      evidence: [{ label: 'Recommendation type', value: r.type }, { label: 'Supporting data', value: r.supportingData }],
      confidence: r.confidence ?? 60,
      recommendedAction: r.actions?.find(a => !a.system)?.label ?? 'Review and decide whether to launch a mission.',
      timeSensitivity: r.urgency === 'HIGH' ? 'Today.' : 'This week.',
      riskIfIgnored: r.riskIfIgnored,
      estimatedBusinessImpact: { level: r.impact ?? 'MEDIUM', narrative: `Estimated time leverage: ${r.timeSaved ?? 0} minutes.` },
      links: { opportunities: [r.type], missions: [r.actions?.find(a => !a.system)?.actionId].filter(Boolean) },
    }));
}

function detectAutonomousWorkforceEvents(assistant) {
  const automation = assistant?.automation;
  if (!automation) return [];
  const blocked = automation.humanCount ?? automation.breakdown?.human?.length ?? 0;
  const approve = automation.approveCount ?? automation.breakdown?.approve?.length ?? 0;
  if (blocked < 3 && approve < 4) return [];
  return [{
    sourceEngine: 'Autonomous Workforce',
    type: 'AI_WORKERS_BLOCKED',
    subjectId: 'blocked-workers',
    category: blocked >= 3 ? EVENT_CATEGORIES.HIGH : EVENT_CATEGORIES.MEDIUM,
    headline: `${blocked || approve} AI work item${(blocked || approve) === 1 ? '' : 's'} blocked by required human approval`,
    executiveSummary: 'AI-generated work is waiting because external execution and judgement-heavy decisions require owner approval.',
    whyThisMatters: 'This keeps the system safe, but owner bottlenecks can slow delivery if not reviewed regularly.',
    evidence: [
      { label: 'Human judgement items', value: blocked },
      { label: 'Approval items', value: approve },
    ],
    confidence: 88,
    recommendedAction: 'Review the decision queue and approve only the items with clear evidence and low downside.',
    timeSensitivity: 'Today.',
    riskIfIgnored: 'Automation value is delayed and important work may remain stalled.',
    estimatedBusinessImpact: { level: 'MEDIUM', narrative: 'Delivery throughput risk.' },
    links: { missions: ['decision-queue'], executiveCouncilDecisions: ['human-approval'] },
  }];
}

function detectWorldAndMemoryEvents(snapshot) {
  const signals = [];
  const diagnostics = snapshot.diagnostics;
  if (diagnostics?.issues?.length) {
    signals.push({
      sourceEngine: 'World Model',
      type: 'WORLD_MODEL_ISSUES',
      subjectId: 'diagnostics',
      category: diagnostics.issues.some(i => i.severity === 'error') ? EVENT_CATEGORIES.HIGH : EVENT_CATEGORIES.MEDIUM,
      headline: `${diagnostics.issues.length} platform diagnostic issue${diagnostics.issues.length === 1 ? '' : 's'} detected`,
      executiveSummary: 'Platform diagnostics found issues that may affect data completeness or engine coordination.',
      whyThisMatters: 'The World Model is only useful if engines and data flows are connected cleanly.',
      evidence: diagnostics.issues.slice(0, 5).map(i => ({ label: i.area, value: i.message, severity: i.severity })),
      confidence: 85,
      recommendedAction: 'Fix diagnostic errors before relying on downstream briefings.',
      timeSensitivity: 'Today if errors exist; otherwise this week.',
      riskIfIgnored: 'Executive intelligence may look complete while missing important engine inputs.',
      estimatedBusinessImpact: { level: 'HIGH', narrative: 'Decision-quality and platform reliability risk.' },
      links: { worldModel: ['platform-diagnostics'], companyMemory: ['engine-events'] },
    });
  }
  return signals;
}

async function collectSnapshot(options = {}) {
  const { useMock = false, includeDiagnostics = false, platformHealth = null, assistant = null, executiveDashboard = null } = options;
  const [health, assistantResult, dashboardResult, diagnostics] = await Promise.all([
    platformHealth ? Promise.resolve(platformHealth) : checkAll({ parallel: true }).catch(error => ({ status: 'unhealthy', engines: [], dependencyIssues: [], error: error.message })),
    assistant ? Promise.resolve(assistant) : runCheck({ useMock, saveToState: false }).catch(error => ({ error: error.message, recommendations: [], summary: {}, automation: {} })),
    executiveDashboard ? Promise.resolve(executiveDashboard) : buildExecutiveBriefing('ceo', { clubName: 'Company', coachName: 'CEO' }).catch(() => null),
    includeDiagnostics ? import('../../../platform/platform-diagnostics.js').then(m => m.runDiagnostics({ runPipelineTest: false })).catch(() => null) : null,
  ]);

  return {
    capturedAt: new Date().toISOString(),
    platformHealth: health,
    assistant: assistantResult,
    executiveDashboard: dashboardResult,
    diagnostics,
  };
}

export async function runProactiveIntelligence(options = {}) {
  const { persist = true, stateFile = undefined } = options;
  const snapshot = await collectSnapshot(options);
  const briefings = detectSignificantEvents(snapshot);
  const saved = persist ? saveBriefings(briefings, { file: stateFile }) : [];
  const inbox = persist ? loadInbox({ file: stateFile, includeResolved: true }) : briefings;
  return {
    generatedAt: new Date().toISOString(),
    snapshot,
    briefings,
    saved,
    inbox: buildExecutiveInbox(inbox),
    dashboard: buildExecutiveDashboard(inbox),
    morningBriefing: buildMorningBriefing(snapshot, briefings, inbox),
  };
}

export function buildExecutiveInbox(briefings = []) {
  const byStatus = Object.fromEntries(Object.values(INBOX_STATUS).map(status => [status, []]));
  for (const briefing of briefings) {
    const status = briefing.status ?? INBOX_STATUS.UNREAD;
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push(briefing);
  }
  return {
    statuses: Object.values(INBOX_STATUS),
    unread: byStatus[INBOX_STATUS.UNREAD] ?? [],
    acknowledged: byStatus[INBOX_STATUS.ACKNOWLEDGED] ?? [],
    dismissed: byStatus[INBOX_STATUS.DISMISSED] ?? [],
    actedOn: byStatus[INBOX_STATUS.ACTED_ON] ?? [],
    snoozed: byStatus[INBOX_STATUS.SNOOZED] ?? [],
    all: briefings,
  };
}

export function buildExecutiveDashboard(briefings = []) {
  const sorted = [...briefings].sort((a, b) => b.rankScore - a.rankScore);
  const byDay = {};
  for (const b of briefings) {
    const day = (b.createdAt ?? new Date().toISOString()).slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  return {
    mostUrgent: sorted.slice(0, 5),
    newest: [...briefings].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0)).slice(0, 5),
    highestImpact: [...briefings].sort((a, b) => (IMPACT_SCORE[b.estimatedBusinessImpact?.level] ?? 0) - (IMPACT_SCORE[a.estimatedBusinessImpact?.level] ?? 0)).slice(0, 5),
    awaitingOwner: briefings.filter(b => b.ownerAttentionRequired && ![INBOX_STATUS.DISMISSED, INBOX_STATUS.ACTED_ON].includes(b.status)),
    resolved: briefings.filter(b => [INBOX_STATUS.DISMISSED, INBOX_STATUS.ACTED_ON].includes(b.status)),
    trendOverTime: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
  };
}

export function buildMorningBriefing(snapshot = {}, freshBriefings = [], persistedBriefings = []) {
  const briefings = uniqueBriefings([...freshBriefings, ...persistedBriefings]);
  const mostUrgent = briefings[0] ?? null;
  const biggestOpportunity = briefings.find(b => b.sourceEngine === 'Opportunities') ?? null;
  const biggestRisk = briefings.find(b => [EVENT_CATEGORIES.CRITICAL, EVENT_CATEGORIES.HIGH].includes(b.category)) ?? mostUrgent;
  const assistant = snapshot.assistant ?? {};
  const health = snapshot.executiveDashboard?.summary?.healthScore ?? snapshot.platformHealth?.status ?? 'unknown';
  const requiredApprovals = briefings.filter(b => b.ownerAttentionRequired && b.requiresHumanApproval && ![INBOX_STATUS.DISMISSED, INBOX_STATUS.ACTED_ON].includes(b.status));

  return {
    id: `morning_${randomUUID()}`,
    generatedAt: new Date().toISOString(),
    companyHealth: {
      status: snapshot.platformHealth?.status ?? 'unknown',
      score: health,
      summary: snapshot.executiveDashboard?.summary?.headline ?? assistant?.briefing?.headline ?? 'Company health requires review.',
    },
    biggestOpportunity: biggestOpportunity ? summarizeBriefing(biggestOpportunity) : null,
    biggestRisk: biggestRisk ? summarizeBriefing(biggestRisk) : null,
    aiWorkforceSummary: {
      recommendations: assistant?.summary?.total ?? assistant?.recommendations?.length ?? 0,
      auto: assistant?.automation?.autoCount ?? 0,
      approvalRequired: assistant?.automation?.approveCount ?? 0,
      humanJudgement: assistant?.automation?.humanCount ?? 0,
    },
    worldChanges: briefings.filter(b => ['World Model', 'Digital Twin', 'Company Memory'].includes(b.sourceEngine)).slice(0, 3).map(summarizeBriefing),
    requiredApprovals: requiredApprovals.slice(0, 5).map(summarizeBriefing),
    recommendedPriorities: briefings.slice(0, 5).map(b => b.recommendedAction),
    predictedRevenueImpact: estimateRevenueImpact(briefings),
    confidence: estimateMorningConfidence(snapshot, briefings),
    topThreeActions: briefings.slice(0, 3).map(b => ({
      headline: b.headline,
      action: b.recommendedAction,
      requiresHumanApproval: true,
      autonomousExternalExecutionAllowed: false,
    })),
    explainability: {
      evidenceCount: briefings.reduce((sum, b) => sum + (b.evidence?.length ?? 0), 0),
      sourceEngines: [...new Set(briefings.map(b => b.sourceEngine))],
      note: 'All actions are recommendations only. Human approval remains mandatory. No autonomous external execution is permitted.',
    },
  };
}

function summarizeBriefing(briefing) {
  return {
    id: briefing.id,
    category: briefing.category,
    headline: briefing.headline,
    summary: briefing.executiveSummary,
    confidence: briefing.confidence,
    estimatedBusinessImpact: briefing.estimatedBusinessImpact,
    recommendedAction: briefing.recommendedAction,
  };
}

function estimateRevenueImpact(briefings) {
  const high = briefings.filter(b => ['VERY_HIGH', 'HIGH'].includes(b.estimatedBusinessImpact?.level)).length;
  const medium = briefings.filter(b => b.estimatedBusinessImpact?.level === 'MEDIUM').length;
  if (high) return { level: 'HIGH', narrative: `${high} high-impact signal${high === 1 ? '' : 's'} could materially affect revenue, retention, or delivery.` };
  if (medium) return { level: 'MEDIUM', narrative: `${medium} medium-impact signal${medium === 1 ? '' : 's'} should be reviewed this cycle.` };
  return { level: 'LOW', narrative: 'No material revenue signal detected in this run.' };
}

function estimateMorningConfidence(snapshot, briefings) {
  const sourceConfidence = snapshot.assistant?.observations?.confidence ?? 60;
  const briefingConfidence = briefings.length ? Math.round(briefings.reduce((sum, b) => sum + b.confidence, 0) / briefings.length) : 70;
  const platformPenalty = snapshot.platformHealth?.status === 'healthy' ? 0 : -10;
  return Math.max(0, Math.min(100, Math.round((sourceConfidence + briefingConfidence) / 2 + platformPenalty)));
}

