// Thin adapter over the Club Intelligence Engine.
let _ci = null;
async function ci() {
  if (!_ci) { try { _ci = await import('../../qa/club-intelligence/index.js'); } catch { _ci = null; } }
  return _ci;
}

export async function fetchHealthScore() {
  const c = await ci();
  if (!c) return { score: null, trend: null, grade: '—', isMock: true };

  try {
    const health = await c.getClubHealth();
    return {
      score:    health.overallScore ?? health.score ?? null,
      grade:    health.grade ?? scoreToGrade(health.overallScore),
      trend:    health.trend ?? null,
      breakdown: health.categories ?? health.breakdown ?? {},
      risks:    health.risks ?? [],
      isMock:   false,
    };
  } catch { return { score: null, grade: '—', trend: null, isMock: true }; }
}

export async function fetchRecommendations() {
  const c = await ci();
  if (!c) return { recommendations: [], isMock: true };

  try {
    const result = await c.getRecommendations();
    const recs   = result.recommendations ?? result ?? [];
    return {
      recommendations: recs.slice(0, 8).map(r => ({
        id:              r.id ?? Math.random().toString(36).slice(2),
        // CI uses { action, why, effort, area, priority } — normalise to widget shape
        title:           r.title ?? r.action ?? r.recommendation ?? r.text ?? '—',
        why:             r.why ?? r.reasoning ?? r.context ?? '',
        expectedBenefit: r.expectedBenefit ?? r.impact ?? r.timeframe ?? '',
        confidence:      r.confidence ?? r.score ?? 0,
        evidence:        r.evidence ?? (r.who ? [`Who: ${r.who}`] : []),
        effort:          r.effort ?? r.estimatedEffort ?? 'medium',
        priority:        typeof r.priority === 'number' ? r.priority : _rankPriority(r.priority) ?? 5,
        engine:          r.engine ?? 'club-intelligence',
      })),
      isMock: false,
    };
  } catch { return { recommendations: [], isMock: true }; }
}

export async function fetchInsights() {
  const c = await ci();
  if (!c) return { insights: [], isMock: true };

  try {
    const result = await c.getInsights();
    return { insights: result.insights ?? result ?? [], isMock: false };
  } catch { return { insights: [], isMock: true }; }
}

function _rankPriority(p) {
  const map = { critical: 1, high: 2, medium: 3, low: 4 };
  return map[p] ?? 5;
}

function scoreToGrade(score) {
  if (!score) return '—';
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}
