// Platform I/O contracts — standardised request and response shapes.
// Every engine integration must accept PlatformRequest and return PlatformResponse.

import { InvalidRequestError } from './platform-errors.js';

let _reqSeq = 0;

// ── Request ────────────────────────────────────────────────────────────────────

export function createRequest(intent, payload = {}, options = {}) {
  return {
    requestId:   `req-${Date.now()}-${++_reqSeq}`,
    intent,
    payload:     payload ?? {},
    context:     options.context  ?? {},
    role:        options.role     ?? 'coach',
    requestedAt: new Date().toISOString(),
    source:      options.source   ?? 'platform',
    traceId:     options.traceId  ?? null,
  };
}

export function validateRequest(req) {
  const missing = [];
  if (!req?.requestId) missing.push('requestId');
  if (!req?.intent)    missing.push('intent');
  if (missing.length) throw new InvalidRequestError(`Request missing required fields: ${missing.join(', ')}`, missing);
  return true;
}

// ── Response ───────────────────────────────────────────────────────────────────

export function createResponse(requestId, data, meta = {}) {
  return {
    requestId,
    success:  true,
    data:     data ?? null,
    error:    null,
    meta: {
      engine:    meta.engine    ?? 'platform',
      durationMs: meta.durationMs ?? 0,
      confidence: meta.confidence ?? null,
      isMock:    meta.isMock    ?? false,
      citations: meta.citations ?? [],
      respondedAt: new Date().toISOString(),
    },
  };
}

export function createErrorResponse(requestId, error, meta = {}) {
  return {
    requestId,
    success: false,
    data:    null,
    error:   typeof error === 'string' ? { message: error } : (error?.toJSON?.() ?? error),
    meta: { engine: meta.engine ?? 'platform', durationMs: meta.durationMs ?? 0, isMock: false, respondedAt: new Date().toISOString() },
  };
}

export function validateResponse(res) {
  if (res?.success === undefined) return false;
  if (res.success && res.data === undefined) return false;
  return true;
}

// ── Merge multiple engine responses into one ───────────────────────────────────

export function mergeResponses(responses = [], requestId = null) {
  const successful = responses.filter(r => r?.success);
  const failed     = responses.filter(r => r && !r.success);

  const merged = {};
  successful.forEach(r => {
    const engine = r.meta?.engine ?? 'unknown';
    merged[engine] = r.data;
  });

  const avgConfidence = successful.length > 0
    ? Math.round(successful.reduce((s, r) => s + (r.meta?.confidence ?? 50), 0) / successful.length)
    : 0;

  const citations = successful.flatMap(r => r.meta?.citations ?? []);
  const isMock    = successful.some(r => r.meta?.isMock);

  return {
    requestId:  requestId ?? responses[0]?.requestId ?? null,
    success:    successful.length > 0,
    data:       merged,
    error:      failed.length > 0 ? { failed: failed.map(r => r.error) } : null,
    meta: {
      engine:    'platform',
      enginesRun: responses.length,
      succeeded: successful.length,
      failed:    failed.length,
      confidence: avgConfidence,
      isMock,
      citations,
      respondedAt: new Date().toISOString(),
    },
  };
}

// ── Adapters — convert tool-registry results to platform responses ─────────────

export function fromToolResult(toolResult, requestId, engineId) {
  if (!toolResult) return createErrorResponse(requestId, 'No result from engine', { engine: engineId });

  if (toolResult.success === false) {
    return createErrorResponse(requestId, toolResult.error ?? 'Engine returned failure', { engine: engineId, durationMs: toolResult.duration });
  }

  return createResponse(requestId, toolResult.data ?? toolResult, {
    engine:     engineId,
    durationMs: toolResult.duration ?? 0,
    confidence: toolResult.confidence ?? null,
    isMock:     toolResult.isMock ?? false,
    citations:  toolResult.evidence ? toolResult.evidence.map(e => ({ engine: engineId, fact: e })) : [],
  });
}

// ── Standard intent keys ────────────────────────────────────────────────────────

export const PLATFORM_INTENTS = {
  // Training
  TRAINING_PREPARE:    'training_prepare',
  SESSION_BUILD:       'session_build',
  PROGRAMME_BUILD:     'programme_build',
  REHAB_BUILD:         'rehab_build',
  // Players
  PLAYER_PROFILE:      'player_profile',
  PLAYER_PROGRESS:     'player_progress',
  SQUAD_ANALYSE:       'squad_analyse',
  // Knowledge
  KNOWLEDGE_ASK:       'knowledge_ask',
  HEALTH_SUMMARY:      'health_summary',
  INJURY_REPORT:       'injury_report',
  ATTENDANCE_REPORT:   'attendance_report',
  // Communications
  COMMS_PACK:          'comms_pack',
  MATCH_REPORT:        'match_report',
  NEWSLETTER_BUILD:    'newsletter_build',
  // Workflows
  WORKFLOW_EXECUTE:    'workflow_execute',
  // Dashboard
  DASHBOARD_BUILD:     'dashboard_build',
  APPROVAL_REVIEW:     'approval_review',
};
