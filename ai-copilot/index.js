/**
 * Coach's Eye AI Copilot — Public API
 *
 * The AI workspace that every coaching feature calls.
 * Integrates all existing engines via plugin registry.
 *
 * Usage:
 *   import { copilot } from './ai-copilot/index.js';
 *   const { response } = await copilot.chat("Build tonight's U16 session.");
 *
 * Or with streaming:
 *   import { copilot, createStream } from './ai-copilot/index.js';
 *   const stream = createStream(event => console.log(event));
 *   await copilot.chat("How is Tom progressing?", { stream });
 */

// ── Bootstrap engine registry ─────────────────────────────────────────────────
// All engines self-register on import.
import './engines/index.js';

// ── Re-export public surface ──────────────────────────────────────────────────
import {
  chat,
  quickAction,
  getConversationInsights,
  getConversationActions,
  createConversation,
} from './chat-manager.js';

import {
  createStream,
  createConsoleStream,
  NULL_STREAM,
} from './stream-handler.js';

import {
  listTools,
  registryStats,
} from './tool-registry.js';

import {
  listConversations,
  getPinnedInsights,
  getRecentActions,
  resetDefaultConversation,
} from './conversation-memory.js';

import { renderToMarkdown } from './response-builder.js';
import { routeIntent }      from './intent-router.js';

// ── Copilot namespace ─────────────────────────────────────────────────────────

export const copilot = {
  // Core
  chat,
  quickAction,

  // Conversation
  createConversation,
  listConversations,
  getInsights:  getConversationInsights,
  getActions:   getConversationActions,
  reset:        resetDefaultConversation,

  // Registry inspection
  listEngines:     listTools,
  registryStats,

  // Utilities
  renderToMarkdown,
  detectIntent:    routeIntent,
};

// Named exports for tree-shaking
export {
  chat,
  quickAction,
  createConversation,
  listConversations,
  createStream,
  createConsoleStream,
  NULL_STREAM,
  listTools,
  registryStats,
  renderToMarkdown,
  routeIntent,
};

export default copilot;
