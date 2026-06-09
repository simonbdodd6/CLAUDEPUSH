// Club Health widget — overall score, trend, risk indicators, top recommendations.

import { fetchHealthScore, fetchInsights } from '../adapters/club-intel-adapter.js';
import { fetchDataHealth } from '../adapters/data-adapter.js';
import { fetchPlayerSnapshot } from '../adapters/memory-adapter.js';

export async function buildClubHealthWidget(role = 'coach') {
  const [health, insights, dataHealth, players] = await Promise.all([
    fetchHealthScore(),
    fetchInsights(),
    fetchDataHealth(),
    fetchPlayerSnapshot(),
  ]);

  const score = health.score ?? estimateScore(players, dataHealth);
  const grade = health.grade ?? scoreToGrade(score);
  const trend = health.trend ?? 'stable';

  // Build risk indicators from available data
  const risks = [...(health.risks ?? [])];
  if (players.injuredCount >= 3) risks.push({ level: 'high', text: `${players.injuredCount} active injuries — squad availability impacted` });
  if (dataHealth.mock > 10) risks.push({ level: 'medium', text: `${dataHealth.mock} data sources using mock data — connect real sources for accurate scores` });
  if (score < 60) risks.push({ level: 'high', text: `Club health score below threshold (${score}/100)` });

  return {
    score,
    grade,
    trend,
    scoreBar: buildBar(score),
    breakdown: health.breakdown ?? {},
    risks: risks.slice(0, 5),
    topInsights: (insights.insights ?? []).slice(0, 3).map(i => i.title ?? i.text ?? i.description ?? i.summary ?? String(i)),
    dataQuality: { live: dataHealth.healthy ?? 0, mock: dataHealth.mock ?? 0, planned: dataHealth.planned ?? 0 },
    isMock: health.isMock,
  };
}

function estimateScore(players, dataHealth) {
  let score = 70; // baseline
  if (players.injuredCount > 3) score -= 10;
  if (dataHealth.mock > 10)      score -= 5;
  return Math.max(0, Math.min(100, score));
}

function scoreToGrade(score) {
  if (!score) return '—';
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

function buildBar(score) {
  const filled = Math.round((score / 100) * 20);
  return `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${score}/100`;
}

export function formatClubHealth(widget) {
  const trendIcon = widget.trend === 'improving' ? '📈' : widget.trend === 'declining' ? '📉' : '➡️';
  const riskBlock = widget.risks.length > 0
    ? widget.risks.map(r => `- ${r.level === 'high' ? '🔴' : r.level === 'medium' ? '🟡' : '🟢'} ${r.text}`).join('\n')
    : '- No active risk indicators';

  const insightBlock = widget.topInsights.length > 0
    ? widget.topInsights.map(i => `- ${i}`).join('\n')
    : '- No insights available — connect Club Intelligence Engine';

  return `## Club Health — ${widget.grade} (${widget.score ?? '—'}/100)

\`\`\`
${widget.scoreBar}
\`\`\`
${trendIcon} Trend: **${widget.trend ?? 'unknown'}**

### Risk Indicators
${riskBlock}

### Top Insights
${insightBlock}

### Data Quality
- ✅ Live sources: ${widget.dataQuality.live}
- ⚠️  Mock sources: ${widget.dataQuality.mock}
- 🔲 Planned: ${widget.dataQuality.planned}`;
}
