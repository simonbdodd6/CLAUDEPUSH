// AI Recommendations widget — ranked by impact, with why/benefit/confidence/evidence/effort.

import { fetchRecommendations } from '../adapters/club-intel-adapter.js';
import { fetchPlayerSnapshot, fetchAttendanceSummary } from '../adapters/memory-adapter.js';
import { fetchMembershipAlerts, fetchDataHealth } from '../adapters/data-adapter.js';

const EFFORT_LABEL = { low: '⚡ Quick win', medium: '🔧 Moderate effort', high: '🏗️ Larger project' };
const IMPACT_ICON  = { high: '🟢', medium: '🟡', low: '⚪' };

export async function buildRecommendations(role = 'coach') {
  const [clubRecs, players, membership, dataHealth] = await Promise.all([
    fetchRecommendations(),
    fetchPlayerSnapshot(),
    fetchMembershipAlerts(),
    fetchDataHealth(),
  ]);

  const recommendations = [...(clubRecs.recommendations ?? [])];

  // Supplement with data-derived recommendations if Club Intelligence is sparse
  if (players.injuredCount >= 3) {
    recommendations.push({
      id: 'rec-injuries',
      title: 'Review return-to-play timelines for injured players',
      why: `${players.injuredCount} players are currently injured, reducing squad availability`,
      expectedBenefit: 'Faster return-to-play decisions, reduced re-injury risk',
      confidence: 90,
      evidence: players.injuries.map(i => `${i.playerName ?? i.id}: ${i.type ?? 'unknown'} injury`),
      effort: 'low',
      priority: 2,
      engine: 'player-development',
    });
  }

  if (membership.expiringSoon.length > 0) {
    recommendations.push({
      id: 'rec-renewals',
      title: `Send renewal reminders to ${membership.expiringSoon.length} expiring member${membership.expiringSoon.length === 1 ? '' : 's'}`,
      why: `${membership.expiringSoon.length} active memberships expire within 30 days`,
      expectedBenefit: 'Prevent membership lapse and retain club revenue',
      confidence: 95,
      evidence: [`${membership.expiringSoon.length} members near expiry`, 'Renewal campaign has historically 80%+ conversion'],
      effort: 'low',
      priority: 3,
      engine: 'communications-engine',
    });
  }

  if (membership.lapsed.length > 0) {
    recommendations.push({
      id: 'rec-lapsed',
      title: `Re-engage ${membership.lapsed.length} lapsed member${membership.lapsed.length === 1 ? '' : 's'}`,
      why: `${membership.lapsed.length} former members haven't renewed`,
      expectedBenefit: 'Potential €${membership.lapsed.length * 80}+ in recovered membership revenue',
      confidence: 70,
      evidence: [`${membership.lapsed.length} lapsed memberships on record`],
      effort: 'medium',
      priority: 4,
      engine: 'communications-engine',
    });
  }

  if (dataHealth.mock > 10) {
    recommendations.push({
      id: 'rec-data',
      title: 'Connect real data sources to improve AI accuracy',
      why: `${dataHealth.mock} of ${dataHealth.totalSources} data sources are using mock data — AI decisions are based on sample data`,
      expectedBenefit: 'All AI recommendations become based on real club data',
      confidence: 100,
      evidence: [`${dataHealth.mock} mock sources`, `${dataHealth.planned ?? 0} planned sources not yet connected`],
      effort: 'high',
      priority: 1,
      engine: 'data-integration',
    });
  }

  // Sort by priority (lower = more important) then by confidence
  recommendations.sort((a, b) => {
    const pa = a.priority ?? 5, pb = b.priority ?? 5;
    if (pa !== pb) return pa - pb;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  return {
    recommendations: recommendations.slice(0, 8),
    total:  recommendations.length,
    isMock: clubRecs.isMock,
  };
}

export function formatRecommendations(widget) {
  if (widget.recommendations.length === 0) return '## AI Recommendations\n\n_No recommendations available_\n';

  let out = `## AI Recommendations (${widget.total})\n\n`;

  widget.recommendations.forEach((r, i) => {
    const effort = EFFORT_LABEL[r.effort ?? 'medium'];
    const conf   = `${r.confidence ?? '?'}%`;
    const evidBlock = (r.evidence ?? []).map(e => `  - ${e}`).join('\n') || '  - No evidence';

    out += `### ${i + 1}. ${r.title}\n\n`;
    out += `| | |\n|--|--|\n`;
    out += `| **Why** | ${r.why ?? '—'} |\n`;
    out += `| **Benefit** | ${r.expectedBenefit ?? '—'} |\n`;
    out += `| **Confidence** | ${conf} |\n`;
    out += `| **Effort** | ${effort} |\n`;
    out += `| **Engine** | ${r.engine ?? '—'} |\n\n`;
    out += `**Evidence:**\n${evidBlock}\n\n---\n\n`;
  });

  return out;
}
