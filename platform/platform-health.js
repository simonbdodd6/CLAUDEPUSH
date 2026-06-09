// Platform Health Monitor — runs health checks on all registered engines
// and returns a structured report.

import { boot, listEngines, getEngine, updateStatus, getDependencies } from './platform-registry.js';
import { emit, EVENT_TYPES } from './platform-events.js';

const HEALTH_TIMEOUT_MS = 8000;

export const STATUS = {
  HEALTHY:    'healthy',
  DEGRADED:   'degraded',
  UNHEALTHY:  'unhealthy',
  UNKNOWN:    'unknown',
};

async function checkOne(engineId) {
  const start    = Date.now();
  const engine   = getEngine(engineId);

  try {
    const timeoutP = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${HEALTH_TIMEOUT_MS}ms`)), HEALTH_TIMEOUT_MS)
    );
    const result = await Promise.race([engine.healthCheck(), timeoutP]);
    const durationMs = Date.now() - start;

    const status = result.ok ? STATUS.HEALTHY : STATUS.UNHEALTHY;
    updateStatus(engineId, status);
    emit(EVENT_TYPES.ENGINE_HEALTH_CHANGED, { engineId, status, durationMs }, 'platform-health');

    return {
      engineId,
      name:       engine.name,
      status,
      durationMs,
      details:    result.details ?? null,
      optional:   engine.optional,
      error:      null,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    updateStatus(engineId, STATUS.UNHEALTHY);
    return {
      engineId,
      name:     engine.name,
      status:   STATUS.UNHEALTHY,
      durationMs,
      details:  null,
      optional: engine.optional,
      error:    err.message,
    };
  }
}

export async function checkAll(options = {}) {
  boot();
  const { parallel = true } = options;
  const engines = listEngines();
  const start   = Date.now();

  let results;
  if (parallel) {
    results = await Promise.all(engines.map(e => checkOne(e.id)));
  } else {
    results = [];
    for (const e of engines) results.push(await checkOne(e.id));
  }

  const healthy   = results.filter(r => r.status === STATUS.HEALTHY);
  const unhealthy = results.filter(r => r.status === STATUS.UNHEALTHY && !r.optional);
  const degraded  = results.filter(r => r.status === STATUS.UNHEALTHY &&  r.optional);

  const platformStatus = unhealthy.length > 0 ? STATUS.UNHEALTHY
    : degraded.length > 0 ? STATUS.DEGRADED : STATUS.HEALTHY;

  // Check dependency satisfaction
  const dependencyIssues = [];
  results.forEach(r => {
    if (r.status === STATUS.HEALTHY) return;
    const dependents = engines.filter(e => e.dependencies.includes(r.engineId));
    dependents.forEach(dep => {
      dependencyIssues.push(`${dep.id} depends on ${r.engineId} which is ${r.status}`);
    });
  });

  return {
    status:    platformStatus,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: {
      total:    results.length,
      healthy:  healthy.length,
      degraded: degraded.length,
      unhealthy: unhealthy.length,
    },
    engines:    results,
    dependencyIssues,
  };
}

export async function checkEngine(engineId) {
  boot();
  return checkOne(engineId);
}

export function formatHealth(report) {
  const icon = report.status === STATUS.HEALTHY ? '✅' : report.status === STATUS.DEGRADED ? '⚠️' : '❌';
  const lines = [
    `## Platform Health ${icon} — ${report.status.toUpperCase()}`,
    `Checked: ${new Date(report.checkedAt).toLocaleTimeString('en-IE')} · ${report.durationMs}ms`,
    `Engines: ${report.summary.healthy}/${report.summary.total} healthy · ${report.summary.degraded} degraded (optional) · ${report.summary.unhealthy} critical`,
    '',
    '| Engine | Status | Time | Notes |',
    '|---|---|---|---|',
  ];

  report.engines.forEach(e => {
    const icon   = e.status === STATUS.HEALTHY ? '✅' : '❌';
    const opt    = e.optional ? '_(optional)_' : '';
    const detail = e.error ?? (e.details?.score !== undefined ? `score ${e.details.score}` : e.details?.available ? 'module loaded' : JSON.stringify(e.details ?? {}).slice(0, 60));
    lines.push(`| **${e.name}** | ${icon} ${e.status} | ${e.durationMs}ms | ${detail} ${opt} |`);
  });

  if (report.dependencyIssues.length) {
    lines.push('', '### Dependency Issues');
    report.dependencyIssues.forEach(i => lines.push(`- ⚠️  ${i}`));
  }

  return lines.join('\n');
}
