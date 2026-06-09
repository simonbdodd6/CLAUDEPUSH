// Coach's Eye Action Library — Runner
// Resolves NL text to an action, checks permissions, executes, logs history.

import { getAction, listActions, resolveFromNL }          from './action-registry.js';
import { hasPermission }                                   from './action-permissions.js';
import { previewAction }                                   from './action-preview.js';
import { logAction, historyStats }                         from './action-history.js';

// ── ActionResult shape ────────────────────────────────────────────────────────
// {
//   actionId, actionName, category,
//   success, data, summary, evidence?,
//   executedAt, durationMs, role,
//   preview: boolean,
//   error?: string,
//   historyId?,
// }

// ── Core runner ───────────────────────────────────────────────────────────────

export async function run(actionId, params = {}, context = {}) {
  const action = getAction(actionId);
  if (!action) return _errorResult(actionId, `Action '${actionId}' not found`, context);

  const role = context.role ?? 'coach';

  if (!hasPermission(role, action.requiredPermissions)) {
    return _errorResult(actionId, `Role '${role}' does not have permission to run '${action.name}'`, context, 403);
  }

  const startMs = Date.now();
  let result;

  try {
    const raw = await action.execute(params, { role, ...context });
    const durationMs = Date.now() - startMs;

    result = {
      actionId:   action.id,
      actionName: action.name,
      category:   action.category,
      success:    raw?.success ?? true,
      data:       raw?.data ?? raw,
      summary:    (raw?.summary ?? raw?.unified?.summary ?? raw?.answer ?? 'Completed').slice(0, 300),
      evidence:   raw?.evidence ?? raw?.unified?.evidence ?? [],
      executedAt: new Date().toISOString(),
      durationMs,
      role,
      preview:    false,
      pipelineKey: raw?.pipelineKey ?? null,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    result = _errorResult(action.id, err.message, context, 500);
    result.durationMs = durationMs;
    result.actionName = action.name;
    result.category   = action.category;
  }

  const histRecord = logAction({
    actionId:   result.actionId,
    actionName: result.actionName,
    category:   result.category,
    role,
    params,
    success:    result.success,
    summary:    result.summary,
    durationMs: result.durationMs,
    error:      result.error ?? null,
  });

  result.historyId = histRecord.historyId;
  return result;
}

// ── Preview mode (dry-run) ────────────────────────────────────────────────────

export async function preview(actionId, params = {}, context = {}) {
  const action = getAction(actionId);
  if (!action) return { error: `Action '${actionId}' not found` };

  const role = context.role ?? 'coach';

  if (!hasPermission(role, action.requiredPermissions)) {
    return { error: `Role '${role}' cannot access '${action.name}'`, code: 403 };
  }

  return previewAction(action, params, context);
}

// ── Natural Language resolution + run ────────────────────────────────────────

export async function runFromNL(text, context = {}) {
  const match = resolveFromNL(text);

  if (!match) {
    // Fallback: send directly to AI Copilot via platform
    const { execute } = await import('../platform/platform-orchestrator.js');
    const result = await execute(text, context);
    return {
      actionId:   'platform.general',
      actionName: 'Platform General',
      category:   'PLATFORM',
      success:    result.success ?? true,
      data:       result,
      summary:    result.unified?.summary ?? 'Completed via platform',
      evidence:   [],
      executedAt: new Date().toISOString(),
      durationMs: 0,
      role:       context.role ?? 'coach',
      preview:    false,
      resolved:   { confidence: 0, fallback: true },
    };
  }

  const result = await run(match.action.id, {}, context);
  result.resolved = { actionId: match.action.id, confidence: match.confidence };
  return result;
}

// ── Batch runner ──────────────────────────────────────────────────────────────

export async function runBatch(requests, context = {}) {
  const results = [];
  for (const req of requests) {
    const result = await run(req.actionId, req.params ?? {}, { ...context, ...req.context });
    results.push(result);
  }
  return {
    total:     results.length,
    succeeded: results.filter(r => r.success).length,
    failed:    results.filter(r => !r.success).length,
    results,
  };
}

// ── Discovery helpers ─────────────────────────────────────────────────────────

export function listAvailableActions(role) {
  return listActions().filter(a => hasPermission(role, a.requiredPermissions));
}

export function listByCategory(role = null) {
  const actions = role ? listAvailableActions(role) : listActions();
  const byCategory = {};
  for (const a of actions) {
    if (!byCategory[a.category]) byCategory[a.category] = [];
    byCategory[a.category].push(a);
  }
  return byCategory;
}

export { historyStats };

// ── Private helpers ───────────────────────────────────────────────────────────

function _errorResult(actionId, message, context, code = 500) {
  return {
    actionId,
    actionName: actionId,
    category:   'unknown',
    success:    false,
    data:       null,
    summary:    message,
    error:      message,
    code,
    executedAt: new Date().toISOString(),
    durationMs: 0,
    role:       context.role ?? 'unknown',
    preview:    false,
  };
}
