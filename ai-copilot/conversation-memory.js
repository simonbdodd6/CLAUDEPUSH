/**
 * Conversation Memory
 * Stores conversation turns in-memory for the current session.
 * Backs up pinned insights and persists conversations via the Memory Engine.
 */

import { randomBytes } from 'crypto';

// ── Turn shape ────────────────────────────────────────────────────────────────
// {
//   id:        string
//   role:      'user' | 'assistant'
//   message:   string
//   intent?:   string          — only for assistant turns
//   response?: CopilotResponse — structured response object
//   timestamp: number
// }

// ── Conversation store ────────────────────────────────────────────────────────

const _conversations = new Map();  // conversationId → { turns[], pinnedInsights[], metadata }

function newId() {
  return randomBytes(6).toString('hex');
}

export function createConversation(metadata = {}) {
  const id = newId();
  _conversations.set(id, {
    id,
    turns:          [],
    pinnedInsights: [],
    recentActions:  [],
    metadata: {
      createdAt: Date.now(),
      coachId:   metadata.coachId ?? null,
      teamId:    metadata.teamId  ?? null,
      label:     metadata.label  ?? `Conversation ${id}`,
      ...metadata,
    },
  });
  return id;
}

export function getConversation(conversationId) {
  return _conversations.get(conversationId) ?? null;
}

export function appendTurn(conversationId, turn) {
  const conv = _conversations.get(conversationId);
  if (!conv) throw new Error(`Conversation ${conversationId} not found`);
  const fullTurn = { id: newId(), timestamp: Date.now(), ...turn };
  conv.turns.push(fullTurn);
  return fullTurn;
}

export function getTurns(conversationId, limit = 20) {
  const conv = _conversations.get(conversationId);
  if (!conv) return [];
  return conv.turns.slice(-limit);
}

export function getLastNTurns(conversationId, n = 6) {
  return getTurns(conversationId, n);
}

// ── Pinned Insights ───────────────────────────────────────────────────────────

export function pinInsight(conversationId, insight) {
  const conv = _conversations.get(conversationId);
  if (!conv) return;
  conv.pinnedInsights.unshift({
    id:        newId(),
    text:      insight.text,
    source:    insight.source ?? 'copilot',
    tags:      insight.tags  ?? [],
    pinnedAt:  Date.now(),
  });
  if (conv.pinnedInsights.length > 20) conv.pinnedInsights.pop();
}

export function getPinnedInsights(conversationId) {
  return _conversations.get(conversationId)?.pinnedInsights ?? [];
}

// ── Recent Actions ────────────────────────────────────────────────────────────

export function recordAction(conversationId, action) {
  const conv = _conversations.get(conversationId);
  if (!conv) return;
  conv.recentActions.unshift({
    id:          newId(),
    type:        action.type,
    label:       action.label,
    description: action.description ?? '',
    result:      action.result ?? null,
    performedAt: Date.now(),
  });
  if (conv.recentActions.length > 50) conv.recentActions.pop();
}

export function getRecentActions(conversationId, limit = 10) {
  return (_conversations.get(conversationId)?.recentActions ?? []).slice(0, limit);
}

// ── Conversation context window ───────────────────────────────────────────────
// Returns a condensed string summary of recent turns for use as context

export function buildContextWindow(conversationId, maxTurns = 6) {
  const turns = getLastNTurns(conversationId, maxTurns);
  if (!turns.length) return '';

  return turns.map(t => {
    if (t.role === 'user') return `Coach: ${t.message}`;
    if (t.role === 'assistant') return `Copilot: ${t.response?.summary ?? t.message ?? '(response)'}`;
    return '';
  }).filter(Boolean).join('\n');
}

// ── List all conversations ────────────────────────────────────────────────────

export function listConversations() {
  return [..._conversations.values()].map(c => ({
    id:         c.id,
    label:      c.metadata.label,
    turnCount:  c.turns.length,
    lastTurnAt: c.turns[c.turns.length - 1]?.timestamp ?? c.metadata.createdAt,
    createdAt:  c.metadata.createdAt,
  })).sort((a, b) => b.lastTurnAt - a.lastTurnAt);
}

// ── Default session ───────────────────────────────────────────────────────────
// Singleton for CLI / single-coach use

let _defaultConversationId = null;

export function getDefaultConversationId() {
  if (!_defaultConversationId) {
    _defaultConversationId = createConversation({ label: 'Default Session' });
  }
  return _defaultConversationId;
}

export function resetDefaultConversation() {
  _defaultConversationId = null;
}
