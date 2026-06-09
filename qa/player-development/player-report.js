/**
 * Player Report
 * Generates a Markdown (and JSON-passthrough) report from a full player analysis.
 */

function line(text = '') { return `${text}\n`; }
function h1(text) { return `# ${text}\n`; }
function h2(text) { return `\n## ${text}\n`; }
function h3(text) { return `\n### ${text}\n`; }
function hr()     { return '\n---\n'; }

function scoreBar(score) {
  if (score == null) return '`n/a`';
  const filled = Math.round(score / 10);
  const bar    = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return `\`[${bar}]\` ${score}/100`;
}

function gradeLabel(grade) {
  if (!grade) return 'n/a';
  const labels = { 'A+': 'Excellent', A: 'Strong', 'B+': 'Good', B: 'Above Average', 'C+': 'Average', C: 'Below Average', D: 'Needs Work', F: 'Poor' };
  return `**${grade}** — ${labels[grade] ?? grade}`;
}

function priorityEmoji(priority) {
  return { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[priority] ?? '⚪';
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildHeader(player, generatedAt) {
  const core    = player.core ?? {};
  const name    = core.name ?? 'Unknown Player';
  const pos     = core.position ?? 'Unknown position';
  const age     = core.age ?? '?';
  const ageGrp  = core.ageGroup ?? '';
  const club    = player.club?.name ?? 'Unknown club';
  const exp     = core.experience ?? 'Unknown';

  let out = h1(`Player Development Report: ${name}`);
  out += line(`**Club:** ${club} | **Position:** ${pos} | **Age:** ${age}${ageGrp ? ` (${ageGrp})` : ''} | **Experience:** ${exp}`);
  out += line(`**Report generated:** ${generatedAt ?? new Date().toISOString().split('T')[0]}`);
  out += hr();
  return out;
}

function buildScoreSummary(devSummary, readiness, projection) {
  let out = h2('Development Overview');
  out += line(`**Development Score:** ${scoreBar(devSummary?.score)} — ${gradeLabel(devSummary?.grade)}`);
  out += line(`**Readiness Score:**   ${scoreBar(readiness?.score)} — ${gradeLabel(readiness?.grade)}`);
  out += line(`**Overall Trend:**     ${devSummary?.trend ?? 'n/a'}`);
  out += line(`**Data Completeness:** ${devSummary?.rawData?.dataCompleteness ?? '?'}%`);

  if (projection?.trajectoryNarrative) {
    out += h3('Trajectory');
    out += line(`> ${projection.trajectoryNarrative}`);
  }

  if (projection?.projections) {
    out += h3('Score Projections');
    out += line('| Timeframe | Projected Score | Grade | Assumption |');
    out += line('|-----------|----------------|-------|------------|');
    for (const [key, proj] of Object.entries(projection.projections)) {
      const label = key.replace('weeks', '') + ' weeks';
      out += line(`| +${label} | ${proj.score ?? 'n/a'}/100 | ${proj.grade ?? '?'} | ${proj.assumption ?? ''} |`);
    }
  }

  return out;
}

function buildDimensionScores(analyses) {
  const DIMENSION_LABELS = {
    attendance:          'Attendance',
    programmeCompliance: 'Programme Compliance',
    injuryRisk:          'Injury Risk',
    strengthProgress:    'Strength Progress',
    speedProgress:       'Speed / Conditioning',
    coachFeedback:       'Coach Feedback',
    readiness:           'Training Readiness',
  };

  let out = h2('Dimension Scores');
  out += line('| Dimension | Score | Grade | Trend | Confidence |');
  out += line('|-----------|-------|-------|-------|------------|');

  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    const a = analyses[key];
    if (!a) continue;
    const scoreDisplay = key === 'injuryRisk'
      ? `${a.score ?? 'n/a'}/100 (risk)` // higher = more risk
      : `${a.score ?? 'n/a'}/100`;
    out += line(`| ${label} | ${scoreDisplay} | ${a.grade ?? 'n/a'} | ${a.trend ?? 'n/a'} | ${a.confidence ?? 'n/a'} |`);
  }

  return out;
}

function buildKeyReasons(analyses) {
  let out = h2('Analysis Details');

  const SECTIONS = [
    { key: 'attendance',          label: 'Attendance' },
    { key: 'injuryRisk',          label: 'Injury Risk' },
    { key: 'strengthProgress',    label: 'Strength Progress' },
    { key: 'speedProgress',       label: 'Speed / Conditioning' },
    { key: 'programmeCompliance', label: 'Programme Compliance' },
    { key: 'coachFeedback',       label: 'Coach Feedback' },
    { key: 'readiness',           label: 'Readiness' },
  ];

  for (const { key, label } of SECTIONS) {
    const a = analyses[key];
    if (!a?.reasons?.length) continue;
    out += h3(label);
    for (const reason of (a.reasons ?? []).slice(0, 4)) {
      out += line(`- ${reason}`);
    }
  }

  return out;
}

function buildRecommendations(recommendations = []) {
  if (!recommendations.length) return '';
  let out = h2('Recommendations');
  out += line('*Every recommendation includes the reason (WHY) it was made.*\n');

  for (const rec of recommendations) {
    out += line(`${priorityEmoji(rec.priority)} **[${rec.priority.toUpperCase()}] ${rec.action}**`);
    out += line(`> **Why:** ${rec.why}`);
    if (rec.suggestedInput) {
      out += line(`> **Suggested input ready:** Yes — use \`suggestedInput\` from JSON output to generate immediately`);
    }
    out += line('');
  }

  return out;
}

function buildProjectionDetails(projection) {
  if (!projection) return '';
  let out = h2('Blockers & Accelerators');

  if (projection.blockers?.length) {
    out += h3('Blockers (address these first)');
    for (const b of projection.blockers) {
      out += line(`- **${b.blocker}** *(${b.impact})* — ${b.clearableBy}`);
    }
  } else {
    out += h3('Blockers');
    out += line('*No critical blockers identified.*');
  }

  if (projection.accelerators?.length) {
    out += h3('Accelerators (unlock faster growth)');
    for (const a of projection.accelerators) {
      out += line(`- **${a.accelerator}** *(${a.impact})* — ${a.reason}`);
    }
  }

  if (projection.nextProgrammePhase) {
    out += h3('Next Programme Phase');
    const ph = projection.nextProgrammePhase;
    out += line(`**Recommended:** ${ph.nextPhase} (typically ${ph.typicalWeeks ?? '?'} weeks)`);
    out += line(`> ${ph.reason ?? ''}`);
  }

  if (projection.timeToNextGrade?.message) {
    out += h3('Grade Progression');
    out += line(`> ${projection.timeToNextGrade.message}`);
  }

  return out;
}

function buildPromotionSection(promotionReadiness) {
  if (!promotionReadiness || (!promotionReadiness.ready && !promotionReadiness.blockers?.length)) return '';
  let out = h2('Promotion Readiness');

  if (promotionReadiness.ready) {
    out += line(`**Status:** Ready for promotion to **${promotionReadiness.nextGroup}**`);
  } else {
    out += line(`**Status:** Not yet ready for promotion to ${promotionReadiness.nextGroup ?? 'next group'}`);
  }

  if (promotionReadiness.criteriaPass?.length) {
    out += h3('Criteria Met');
    for (const c of promotionReadiness.criteriaPass) out += line(`- ✓ ${c}`);
  }

  if (promotionReadiness.criteriaMiss?.length) {
    out += h3('Criteria Not Yet Met');
    for (const c of promotionReadiness.criteriaMiss) out += line(`- ✗ ${c}`);
  }

  if (promotionReadiness.blockers?.length) {
    out += h3('Hard Blockers');
    for (const b of promotionReadiness.blockers) out += line(`- 🔴 ${b}`);
  }

  return out;
}

function buildFlags(analyses) {
  const allFlags = Object.values(analyses)
    .flatMap(a => a?.flags ?? [])
    .filter(f => f.level === 'critical' || f.level === 'warning');

  if (!allFlags.length) return '';

  let out = h2('Flags & Alerts');
  for (const f of allFlags) {
    const icon = f.level === 'critical' ? '🔴' : '⚠️';
    out += line(`${icon} ${f.message}`);
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generatePlayerReport(fullAnalysis, options = {}) {
  const { player, analyses, recommendations, projection, promotionReadiness } = fullAnalysis;
  const generatedAt = options.generatedAt ?? new Date().toISOString().split('T')[0];

  if (options.format === 'json') {
    return fullAnalysis;
  }

  // Build Markdown
  let report = '';
  report += buildHeader(player, generatedAt);
  report += buildScoreSummary(analyses.developmentSummary, analyses.readiness, projection);
  report += buildDimensionScores(analyses);
  report += buildFlags(analyses);
  report += buildRecommendations(recommendations);
  report += buildProjectionDetails(projection);
  report += buildPromotionSection(promotionReadiness);
  report += buildKeyReasons(analyses);
  report += hr();
  report += line(`*Report generated by Coach's Eye Player Development Intelligence Engine*`);

  return report;
}
