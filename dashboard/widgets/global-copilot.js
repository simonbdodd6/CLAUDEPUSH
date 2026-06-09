// Global Copilot widget — persistent AI assistant available everywhere.
// Thin wrapper around the AI Copilot, enriched with dashboard context.

let _copilot = null;
async function copilot() {
  if (!_copilot) { try { _copilot = await import('../../ai-copilot/index.js'); } catch { _copilot = null; } }
  return _copilot;
}

// Example prompts that appear in the dashboard UI.
export const EXAMPLE_PROMPTS = [
  "Prepare tonight's U16 training.",
  "Who needs contacting today?",
  "Generate committee report.",
  "How healthy is the club?",
  "Show injury trends.",
  "What should I focus on today?",
  "Build this week's club communications pack.",
  "Who are the top performers this season?",
  "Generate a match report for last weekend.",
  "Which players have low attendance?",
  "Create a sponsor update for Kildare Motor Group.",
  "Ask for volunteers for the Christmas Dinner.",
];

export async function ask(message, dashboardContext = {}) {
  const cp = await copilot();
  if (!cp) {
    return {
      success: false,
      response: null,
      summary: 'AI Copilot unavailable — engines not loaded',
      error: 'copilot not available',
    };
  }

  try {
    // Enrich context with dashboard snapshot
    const enrichedContext = {
      ...dashboardContext,
      source: 'dashboard',
      dashboardRole: dashboardContext.role ?? 'coach',
    };

    const result = await cp.chat(message, { context: enrichedContext });
    // chat() returns { conversationId, response } where response is structured
    const res = result?.response ?? result;
    const summary = res?.summary ?? (typeof res === 'string' ? res : '(no response)');

    return {
      success:  true,
      response: res,
      summary,
      tools:    res?.toolsUsed ?? [],
      evidence: res?.evidence ?? [],
    };
  } catch (err) {
    return {
      success: false,
      response: null,
      summary: `Copilot error: ${err.message}`,
      error:   err.message,
    };
  }
}

// Run a batch of demo queries and return results (used by CLI).
export async function runDemoQueries(queries, context = {}) {
  const results = [];
  for (const query of queries) {
    const result = await ask(query, context);
    results.push({ query, ...result });
  }
  return results;
}

export function formatCopilotResponse(result) {
  if (!result.success) return `❌ ${result.summary}`;
  return `✅ ${result.summary}${result.tools?.length > 0 ? `\n_Tools: ${result.tools.join(', ')}_` : ''}`;
}
