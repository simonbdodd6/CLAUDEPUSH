/**
 * Club Intelligence Engine Adapter
 * Generates the top-level club overview: health score, insights, DoR brief.
 */

import { registerEngine } from '../engine-registry.js';

let _engine = null;
async function engine() {
  if (!_engine) { try { _engine = await import('../../qa/club-intelligence/index.js'); } catch { _engine = null; } }
  return _engine;
}

registerEngine({
  name:           'club-intelligence',
  version:        '1.0.0',
  description:    'Club-level intelligence: health score, insights, DoR brief, retention risk',
  capabilities:   ['club_overview', 'dor_report', 'health_score', 'retention_analysis'],
  requiredInputs: [],
  optionalInputs: ['players', 'teams', 'playerAnalysis'],
  outputs:        ['clubReport', 'clubHealth', 'dorBrief', 'clubInsights'],
  priority:       72,
  alwaysRun:      false,

  async execute(ctx, opts) {
    const eng = await engine();
    if (!eng) return stub();

    try {
      const report = await eng.generateClubReport();

      const health      = report.health  ?? {};
      const insights    = report.insights ?? {};
      const recs        = report.recommendations ?? {};

      return {
        success: true,
        data:    report,
        contextWrites: {
          clubReport:    report,
          clubHealth:    health,
          dorBrief:      recs,
          clubInsights:  insights.insights?.slice(0, 10) ?? [],
        },
        summary: `Club health: ${health.overallScore ?? 'n/a'}/100 (${health.overallGrade ?? '?'}) — ${insights.totalCount ?? 0} insights`,
        evidence: [
          `**Club health score:** ${health.overallScore ?? 'n/a'}/100 — grade ${health.overallGrade ?? '?'}`,
          `**Insights:** ${insights.totalCount ?? 0} (${insights.byPriority?.critical ?? 0} critical)`,
          `**This-week priorities:** ${recs.thisWeekPriorities?.length ?? 0}`,
          ...(health.criticalFlags?.slice(0, 2).map(f => `🚨 ${f.message}`) ?? []),
          ...(insights.insights?.slice(0, 2).map(i => `• ${i.title}: ${i.description?.slice(0, 80)}`) ?? []),
        ].filter(Boolean),
        warnings: (health.criticalFlags ?? []).map(f => f.message),
      };
    } catch (err) {
      return {
        success: false, data: null, contextWrites: {},
        summary: `Club Intelligence error: ${err.message}`,
        evidence: [], warnings: [`Club Intelligence: ${err.message}`],
        error: err.message,
      };
    }
  },
});

function stub() {
  return {
    success: true,
    data:    { _stub: true },
    contextWrites: {
      clubReport:   { _stub: true },
      clubHealth:   { overallScore: null, overallGrade: null },
      dorBrief:     { thisWeekPriorities: [] },
      clubInsights: [],
    },
    summary:  'Club Intelligence (stub — engine unavailable)',
    evidence: ['Club Intelligence Engine not found — stub result returned'],
    warnings: ['Club Intelligence Engine unavailable'],
  };
}
