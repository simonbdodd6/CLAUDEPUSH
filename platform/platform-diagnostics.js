// Platform Diagnostics — full system check: health, connectivity, data flow, performance.

import { boot, listEngines, registryStats, getDependencies } from './platform-registry.js';
import { checkAll }                   from './platform-health.js';
import { buildDependencyGraph }       from './platform-map.js';
import { eventStats }                 from './platform-events.js';
import { execute, detectPipeline }    from './platform-orchestrator.js';

// ── Full Diagnostic ────────────────────────────────────────────────────────────

export async function runDiagnostics(options = {}) {
  boot();
  const { runPipelineTest = false } = options;
  const start = Date.now();

  const [healthReport, graph] = await Promise.all([
    checkAll(),
    Promise.resolve(buildDependencyGraph()),
  ]);

  const regStats = registryStats();
  const evtStats = eventStats();

  // Dependency validation
  const depValidation = validateDependencies(healthReport.engines);

  // Capability coverage check
  const capabilityCoverage = checkCapabilityCoverage();

  // Optional: pipeline smoke test
  let pipelineTest = null;
  if (runPipelineTest) {
    pipelineTest = await smokePipelineTest();
  }

  const durationMs = Date.now() - start;

  const issues = [
    ...healthReport.dependencyIssues.map(i => ({ severity: 'warning', message: i, area: 'health' })),
    ...depValidation.issues.map(i => ({ severity: 'error', message: i, area: 'dependency' })),
    ...capabilityCoverage.gaps.map(g => ({ severity: 'warning', message: `No engine covers capability: ${g}`, area: 'capability' })),
  ];

  const healthy = issues.filter(i => i.severity === 'error').length === 0;

  return {
    healthy,
    durationMs,
    checkedAt:       new Date().toISOString(),
    health:          healthReport,
    registry:        regStats,
    dependencyGraph: { nodeCount: graph.engineCount, edgeCount: graph.edgeCount },
    depValidation,
    capabilityCoverage,
    events:          evtStats,
    pipelineTest,
    issues,
    summary: buildSummary(healthReport, regStats, issues),
  };
}

// ── Dependency validation ──────────────────────────────────────────────────────

function validateDependencies(engineHealthResults = []) {
  const healthMap = Object.fromEntries(engineHealthResults.map(r => [r.engineId, r]));
  const issues    = [];
  const warnings  = [];

  for (const result of engineHealthResults) {
    const deps = getDependencies(result.engineId);
    for (const dep of deps) {
      const depHealth = healthMap[dep];
      if (!depHealth) {
        issues.push(`${result.engineId} depends on unregistered engine: ${dep}`);
      } else if (depHealth.status === 'unhealthy' && !depHealth.optional) {
        warnings.push(`${result.engineId} has unhealthy dependency: ${dep}`);
      }
    }
  }

  // Circular dependency check
  const cycles = detectCycles();

  return { issues, warnings, cycles, valid: issues.length === 0 && cycles.length === 0 };
}

function detectCycles() {
  const engines = listEngines();
  const visited = new Set(), stack = new Set(), cycles = [];

  function dfs(id, path) {
    if (stack.has(id)) { cycles.push([...path, id].join(' → ')); return; }
    if (visited.has(id)) return;
    visited.add(id); stack.add(id);
    const e = engines.find(eng => eng.id === id);
    (e?.dependencies ?? []).forEach(dep => dfs(dep, [...path, id]));
    stack.delete(id);
  }

  engines.forEach(e => dfs(e.id, []));
  return cycles;
}

// ── Capability coverage ────────────────────────────────────────────────────────

// Core capabilities that MUST be covered by at least one engine
const REQUIRED_CAPABILITIES = [
  'player.read', 'team.read', 'session.build', 'knowledge.ask',
  'communication.draft', 'workflow.execute', 'health.score', 'copilot.chat',
];

function checkCapabilityCoverage() {
  const regStats = registryStats();
  const covered  = new Set(Object.keys(regStats.capabilityIndex));
  const gaps     = REQUIRED_CAPABILITIES.filter(c => !covered.has(c));
  const coverage = Math.round(((REQUIRED_CAPABILITIES.length - gaps.length) / REQUIRED_CAPABILITIES.length) * 100);

  return {
    required:  REQUIRED_CAPABILITIES.length,
    covered:   REQUIRED_CAPABILITIES.length - gaps.length,
    gaps,
    coverage,
    allCapabilities: [...covered].sort(),
  };
}

// ── Pipeline smoke test ────────────────────────────────────────────────────────

async function smokePipelineTest() {
  const testQueries = [
    "Prepare tonight's Senior training.",
    "Summarise club health.",
  ];

  const results = [];
  for (const query of testQueries) {
    const start    = Date.now();
    const { key }  = detectPipeline(query);
    const result   = await execute(query, { role: 'coach' }).catch(err => ({ success: false, error: err.message }));
    results.push({
      query,
      pipeline:  key,
      success:   result.success ?? false,
      durationMs: Date.now() - start,
      enginesUsed: result.unified?.engines ?? [],
    });
  }

  const passed = results.filter(r => r.success).length;
  return { total: results.length, passed, failed: results.length - passed, results };
}

// ── Summary builder ────────────────────────────────────────────────────────────

function buildSummary(healthReport, regStats, issues) {
  const errors   = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;

  return [
    `${regStats.totalEngines} engines registered · ${regStats.healthy} healthy`,
    `${regStats.totalCapabilities} capabilities · ${issues.length} issues (${errors} errors, ${warnings} warnings)`,
    healthReport.status === 'healthy' ? '✅ Platform fully operational' : `⚠️  Platform status: ${healthReport.status}`,
  ].join('\n');
}

// ── Formatted output ────────────────────────────────────────────────────────────

export function formatDiagnostics(diag) {
  const statusIcon = diag.healthy ? '✅' : '❌';
  const lines      = [
    `# Platform Diagnostics ${statusIcon}`,
    `Checked: ${new Date(diag.checkedAt).toLocaleString('en-IE')} · ${diag.durationMs}ms`,
    '',
    diag.summary,
    '',
    '## Registry',
    `Engines: ${diag.registry.totalEngines} · Capabilities: ${diag.registry.totalCapabilities}`,
    '',
    '## Dependency Graph',
    `${diag.dependencyGraph.nodeCount} nodes · ${diag.dependencyGraph.edgeCount} edges`,
    diag.depValidation.cycles.length > 0 ? `⚠️  Circular dependencies: ${diag.depValidation.cycles.join(', ')}` : '✅ No circular dependencies',
    '',
    `## Capability Coverage: ${diag.capabilityCoverage.coverage}%`,
    diag.capabilityCoverage.gaps.length > 0 ? `Gaps: ${diag.capabilityCoverage.gaps.join(', ')}` : '✅ All required capabilities covered',
    '',
    '## Events',
    `${diag.events.total} events logged · ${Object.keys(diag.events.byType ?? {}).length} event types`,
  ];

  if (diag.issues.length > 0) {
    lines.push('', '## Issues');
    diag.issues.forEach(i => lines.push(`- ${i.severity === 'error' ? '❌' : '⚠️'} [${i.area}] ${i.message}`));
  }

  if (diag.pipelineTest) {
    lines.push('', '## Pipeline Smoke Tests');
    lines.push(`${diag.pipelineTest.passed}/${diag.pipelineTest.total} passed`);
    diag.pipelineTest.results.forEach(r => {
      lines.push(`- ${r.success ? '✅' : '❌'} "${r.query}" → pipeline:${r.pipeline} (${r.durationMs}ms) engines:[${r.enginesUsed.join(', ')}]`);
    });
  }

  return lines.join('\n');
}
