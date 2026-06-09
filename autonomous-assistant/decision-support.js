/**
 * Decision Support
 *
 * Classifies each recommendation as:
 *   AUTO        — confidence > 75, impact != HIGH, no personnel decision
 *   APPROVE     — confidence 50-75 OR urgency HIGH (one-tap confirm)
 *   HUMAN       — low confidence, CRITICAL urgency, or personnel/medical decision
 *
 * The assistant auto-executes AUTO items (with logging) and queues the rest.
 */

const AUTO_THRESHOLD       = 75;  // confidence %
const APPROVE_THRESHOLD    = 50;

const HUMAN_TYPES = new Set([
  'INJURY_POSITION_CRISIS',
  'PLAYER_OVERLOAD',
  'SAFEGUARDING',
  'FINANCIAL_DECISION',
]);

const AUTO_TYPES = new Set([
  'MEMBERSHIP_EXPIRY',
  'COMMUNICATION_GAP',
  'WEATHER_RISK',
]);

function classify(rec) {
  if (HUMAN_TYPES.has(rec.type))  return 'HUMAN';
  if (rec.urgency === 'CRITICAL') return 'HUMAN';
  if ((rec.confidence ?? 0) < APPROVE_THRESHOLD) return 'HUMAN';

  if (AUTO_TYPES.has(rec.type) && (rec.confidence ?? 0) >= AUTO_THRESHOLD) return 'AUTO';
  if ((rec.confidence ?? 0) >= AUTO_THRESHOLD && rec.impact !== 'HIGH') return 'AUTO';

  return 'APPROVE';
}

export function classifyRecommendations(recommendations) {
  const classified = recommendations.map(r => ({ ...r, decision: classify(r) }));
  return {
    auto:    classified.filter(r => r.decision === 'AUTO'),
    approve: classified.filter(r => r.decision === 'APPROVE'),
    human:   classified.filter(r => r.decision === 'HUMAN'),
    all:     classified,
  };
}

export function getAutomationReport(recommendations) {
  const { auto, approve, human } = classifyRecommendations(recommendations);
  const total = recommendations.length;
  const autoMinutes    = auto.reduce((s, r)    => s + (r.timeSaved ?? 0), 0);
  const approveMinutes = approve.reduce((s, r) => s + (r.timeSaved ?? 0) * 0.5, 0); // half saved via one-tap
  const totalMinutes   = autoMinutes + approveMinutes;

  return {
    total,
    autoCount:    auto.length,
    approveCount: approve.length,
    humanCount:   human.length,
    autoPercent:  total ? Math.round((auto.length / total) * 100) : 0,
    minutesSaved: Math.round(totalMinutes),
    breakdown: {
      auto:    auto.map(r    => ({ id: r.id, type: r.type, title: r.title, timeSaved: r.timeSaved })),
      approve: approve.map(r => ({ id: r.id, type: r.type, title: r.title, timeSaved: r.timeSaved })),
      human:   human.map(r   => ({ id: r.id, type: r.type, title: r.title })),
    },
  };
}

export function getDecisionQueue(recommendations) {
  const { approve } = classifyRecommendations(recommendations);
  return approve
    .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
    .map(r => ({
      id:          r.id,
      type:        r.type,
      title:       r.title,
      urgency:     r.urgency,
      confidence:  r.confidence,
      primaryAction: r.actions?.find(a => !a.system),
      timeSaved:   r.timeSaved,
    }));
}

export function getAutoExecutableActions(recommendations) {
  const { auto } = classifyRecommendations(recommendations);
  return auto.flatMap(r =>
    (r.actions ?? [])
      .filter(a => !a.system && a.actionId)
      .map(a => ({ recId: r.id, recType: r.type, ...a }))
  );
}

export function generateCoachBriefing(recommendations, timeline, observations) {
  const { auto, approve, human } = classifyRecommendations(recommendations);
  const criticals = recommendations.filter(r => r.urgency === 'CRITICAL');
  const highPriority = recommendations.filter(r => r.urgency === 'HIGH');
  const nextFixture  = observations?.fixtures?.next;
  const healthScore  = observations?.twinStatus?.healthScore ?? '—';

  const lines = [];

  if (criticals.length > 0) {
    lines.push(`🔴 CRITICAL: ${criticals.map(r => r.title).join(' · ')}`);
  }

  if (nextFixture) {
    const days = nextFixture.daysToKickoff;
    lines.push(`⚽ Next match: ${nextFixture.opponent ?? 'TBD'} in ${days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`}`);
  }

  lines.push(`📊 ${recommendations.length} recommendations — ${auto.length} can be automated, ${approve.length} need your approval, ${human.length} need your judgement`);

  if (highPriority.length > 0) {
    lines.push(`⚡ Top priority: ${highPriority[0].title}`);
  }

  const timeSaved = auto.reduce((s,r) => s + (r.timeSaved ?? 0), 0);
  if (timeSaved > 0) {
    lines.push(`⏱ Auto-executing ${auto.length} tasks will save ~${timeSaved} minutes today`);
  }

  const todayEvents = timeline?.byDay?.find(d => d.label === 'Today')?.events ?? [];
  if (todayEvents.length > 0) {
    lines.push(`📅 Today: ${todayEvents.map(e => e.title).join(' · ')}`);
  }

  return {
    headline:  criticals.length > 0 ? criticals[0].title : (highPriority[0]?.title ?? 'All clear — no critical issues'),
    severity:  criticals.length > 0 ? 'CRITICAL' : highPriority.length > 0 ? 'HIGH' : 'NORMAL',
    summary:   lines.join('\n'),
    lines,
    stats: {
      recommendations: recommendations.length,
      auto:            auto.length,
      approve:         approve.length,
      human:           human.length,
      minutesSaved:    timeSaved,
    },
  };
}
