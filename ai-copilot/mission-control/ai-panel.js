/**
 * AI Panel — Mission Control Integration
 *
 * Provides:
 *   1. Express router: mount at /ai-copilot in the Mission Control server
 *   2. Standalone HTML panel string (for embedding or static serve)
 *   3. REST API handler for the chat interface
 *
 * Mount in mission-control/app.js:
 *   import { aiPanelRouter } from '../ai-copilot/mission-control/ai-panel.js';
 *   app.use('/ai-copilot', aiPanelRouter);
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Lazy Copilot import ───────────────────────────────────────────────────────

let _copilot = null;
async function getCopilot() {
  if (!_copilot) {
    try { _copilot = await import('../index.js'); }
    catch { _copilot = null; }
  }
  return _copilot;
}

// ── REST API handlers (framework-agnostic) ────────────────────────────────────

export async function handleChat(body = {}) {
  const { message, conversationId } = body;
  if (!message?.trim()) return { error: 'message is required' };

  const c = await getCopilot();
  if (!c) return { error: 'AI Copilot not available' };

  const { response, conversationId: convId } = await c.chat(message, { conversationId });
  return { conversationId: convId, response };
}

export async function handleQuickAction(body = {}) {
  const { actionId, payload, context, conversationId } = body;
  if (!actionId) return { error: 'actionId is required' };

  const c = await getCopilot();
  if (!c) return { error: 'AI Copilot not available' };

  const result = await c.quickAction(actionId, payload ?? {}, context ?? {}, conversationId);
  return result;
}

export async function handleGetInsights(conversationId) {
  const c = await getCopilot();
  if (!c) return { insights: [] };
  return { insights: c.getInsights(conversationId) };
}

export async function handleGetActions(conversationId) {
  const c = await getCopilot();
  if (!c) return { actions: [] };
  return { actions: c.getActions(conversationId) };
}

export async function handleGetEngines() {
  const c = await getCopilot();
  if (!c) return { engines: [] };
  return { engines: c.listEngines() };
}

// ── Express router factory ────────────────────────────────────────────────────

export function createAiPanelRouter() {
  // Returns a minimal Express-compatible router
  // Usage: const { createAiPanelRouter } = await import('./mission-control/ai-panel.js');
  //        app.use('/ai-copilot', createAiPanelRouter());

  const routes = {
    'POST /chat':          req => handleChat(req.body),
    'POST /action':        req => handleQuickAction(req.body),
    'GET /insights':       req => handleGetInsights(req.query?.conversationId),
    'GET /actions':        req => handleGetActions(req.query?.conversationId),
    'GET /engines':        ()  => handleGetEngines(),
    'GET /':               ()  => Promise.resolve({ html: getPanelHtml() }),
  };

  return async function aiPanelMiddleware(req, res, next) {
    const key = `${req.method} ${req.path}`;
    const handler = routes[key];
    if (!handler) { next?.(); return; }

    try {
      const result = await handler(req);
      if (result.html) {
        res.setHeader('Content-Type', 'text/html');
        res.end(result.html);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      }
    } catch (err) {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  };
}

// ── Panel HTML ────────────────────────────────────────────────────────────────

export function getPanelHtml() {
  const htmlPath = join(__dirname, 'ai-panel.html');
  if (existsSync(htmlPath)) return readFileSync(htmlPath, 'utf8');
  return '<html><body>AI Panel HTML not found — ensure ai-panel.html exists alongside ai-panel.js</body></html>';
}

// Alias for legacy import
export const aiPanelRouter = createAiPanelRouter();
