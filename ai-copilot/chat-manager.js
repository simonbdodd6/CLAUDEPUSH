/**
 * Chat Manager — Main Copilot Orchestrator
 *
 * Flow for each message:
 *   1. Append user turn to conversation memory
 *   2. Route intent (intent-router)
 *   3. Load context (context-loader: Memory Engine, entities)
 *   4. Select tools capable of handling this intent
 *   5. Execute tools (tool-registry)
 *   6. Collect citations
 *   7. Build structured response (response-builder)
 *   8. Append assistant turn
 *   9. Return CopilotResponse
 *
 * The Chat Manager never knows engine implementation details.
 */

import { routeIntent }                                from './intent-router.js';
import { getCapable, executeTool }                    from './tool-registry.js';
import { loadContext, summariseContext }              from './context-loader.js';
import { buildResponse }                             from './response-builder.js';
import { createCitationContext }                     from './citation-engine.js';
import { NULL_STREAM }                               from './stream-handler.js';
import {
  createConversation,
  appendTurn,
  buildContextWindow,
  getDefaultConversationId,
  getPinnedInsights,
  getRecentActions,
  recordAction,
  pinInsight,
} from './conversation-memory.js';

// ── Tool selection strategy ───────────────────────────────────────────────────

function selectTools(intent, ctx) {
  const capable = getCapable(intent);

  // For squad/squad-adjacent intents with no squad data, skip dev engine
  if (!ctx.hasSquadData && !ctx.hasPlayer) {
    if (['squad_analysis', 'player_compare', 'injury_risk'].includes(intent)) {
      return capable.filter(t => t.name === 'memory-engine');
    }
  }

  // knowledge_query: prefer rugby-knowledge, skip player-development
  if (intent === 'knowledge_query') {
    return capable.filter(t => ['rugby-knowledge', 'memory-engine'].includes(t.name));
  }

  // build_session: coaching-engine is primary, rugby-knowledge as backup
  if (intent === 'build_session' || intent === 'weekly_plan') {
    const coaching = capable.find(t => t.name === 'coaching-engine');
    const kb       = capable.find(t => t.name === 'rugby-knowledge');
    return [coaching, kb].filter(Boolean);
  }

  // Default: use all capable tools (deduped by priority)
  return capable;
}

// ── Main chat handler ─────────────────────────────────────────────────────────

export async function chat(message, options = {}) {
  const {
    conversationId: convId,
    stream        = NULL_STREAM,
    metadata      = {},
  } = options;

  const conversationId = convId ?? getDefaultConversationId();

  // 1. Record user turn
  appendTurn(conversationId, { role: 'user', message });

  // 2. Route intent
  const route = routeIntent(message);
  stream.emitIntent(route);

  // 3. Build context window from prior turns
  const conversationContext = buildContextWindow(conversationId, 6);

  // 4. Load context from Memory Engine + entity resolution
  const ctx = await loadContext({ ...route, message }, conversationContext);
  const ctxSummary = summariseContext(ctx);
  stream.emitContext(ctxSummary);

  // 5. Select tools
  const tools = selectTools(route.intent, ctx);

  // 6. Execute tools
  const citations  = createCitationContext();
  const toolResults = [];

  for (const tool of tools) {
    stream.emitToolCall(tool.name, 'calling');
    const result = await executeTool(tool.name, route.intent, { ...ctx, message }, options);
    toolResults.push(result);
    stream.emitToolCall(tool.name, result.success ? 'done' : 'failed');

    if (result.success && result.evidence?.length) {
      for (const fact of result.evidence) {
        citations.cite(tool.name, fact);
      }
    }
  }

  // 7. Build structured response
  const response = buildResponse(route.intent, route, ctx, toolResults, citations);

  // 8. Emit main content chunk
  if (response.summary) stream.emitContent(response.summary);

  // 9. Record assistant turn
  appendTurn(conversationId, { role: 'assistant', message: response.summary, intent: route.intent, response });
  stream.emitResponse(response);
  stream.emitDone();

  return { conversationId, response };
}

// ── Quick action dispatcher ───────────────────────────────────────────────────

export async function quickAction(actionId, payload = {}, context = {}, conversationId) {
  const { executeAction } = await import('./action-engine.js');
  const resolvedConvId    = conversationId ?? getDefaultConversationId();

  const result = await executeAction(actionId, payload, context);

  // Record in conversation memory
  recordAction(resolvedConvId, {
    type:        actionId,
    label:       result.message ?? actionId,
    description: `Quick action executed`,
    result,
  });

  // Auto-pin for pin_insight action
  if (actionId === 'pin_insight') {
    pinInsight(resolvedConvId, { text: payload.text ?? payload.summary ?? 'Insight', source: 'user' });
  }

  return result;
}

// ── Conversation accessors ────────────────────────────────────────────────────

export function getConversationInsights(conversationId) {
  const convId = conversationId ?? getDefaultConversationId();
  return getPinnedInsights(convId);
}

export function getConversationActions(conversationId) {
  const convId = conversationId ?? getDefaultConversationId();
  return getRecentActions(convId);
}

export { createConversation };
