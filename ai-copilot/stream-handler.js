/**
 * Stream Handler
 * Manages streaming responses from the Copilot.
 * Supports event-based streaming for real-time UI updates.
 *
 * Stream events:
 *   { type: 'intent',    data: { intent, label, confidence } }
 *   { type: 'context',   data: { summary } }
 *   { type: 'tool_call', data: { toolName, status } }
 *   { type: 'content',   data: { chunk } }
 *   { type: 'response',  data: CopilotResponse }
 *   { type: 'error',     data: { message } }
 *   { type: 'done' }
 */

// ── Stream context (emitter pattern) ─────────────────────────────────────────

export function createStream(onEvent) {
  const emit = (type, data = {}) => {
    try { onEvent({ type, data, timestamp: Date.now() }); }
    catch { /* never let a handler crash the stream */ }
  };

  return {
    emitIntent(route) {
      emit('intent', { intent: route.intent, label: route.label, confidence: route.confidence });
    },
    emitContext(summary) {
      emit('context', { summary });
    },
    emitToolCall(toolName, status = 'calling') {
      emit('tool_call', { toolName, status });
    },
    emitContent(chunk) {
      emit('content', { chunk });
    },
    emitResponse(response) {
      emit('response', { response });
    },
    emitError(message) {
      emit('error', { message });
    },
    emitDone() {
      emit('done');
    },
  };
}

// ── No-op stream (when caller doesn't provide a handler) ─────────────────────

export const NULL_STREAM = createStream(() => {});

// ── Text chunker (simulates streaming for non-streaming engines) ──────────────

export async function streamText(text, onChunk, chunkSize = 40, delayMs = 0) {
  for (let i = 0; i < text.length; i += chunkSize) {
    onChunk(text.slice(i, i + chunkSize));
    if (delayMs > 0) await sleep(delayMs);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Console stream (for CLI use) ──────────────────────────────────────────────

export function createConsoleStream(options = {}) {
  const { verbose = false, prefix = '' } = options;

  return createStream(event => {
    const p = prefix ? `[${prefix}] ` : '';
    switch (event.type) {
      case 'intent':
        if (verbose) process.stdout.write(`\n${p}Intent: ${event.data.label} (${Math.round(event.data.confidence * 100)}%)\n`);
        break;
      case 'context':
        if (verbose && event.data.summary) process.stdout.write(`${p}Context: ${event.data.summary}\n`);
        break;
      case 'tool_call':
        if (verbose) process.stdout.write(`${p}→ ${event.data.toolName} [${event.data.status}]\n`);
        break;
      case 'content':
        process.stdout.write(event.data.chunk);
        break;
      case 'error':
        process.stderr.write(`\n${p}Error: ${event.data.message}\n`);
        break;
      case 'done':
        if (verbose) process.stdout.write(`\n${p}Done.\n`);
        break;
    }
  });
}

// ── Collect stream to array ───────────────────────────────────────────────────

export function createCollectorStream() {
  const events = [];
  const stream = createStream(event => events.push(event));
  stream.getEvents = () => events;
  stream.getFinalResponse = () => events.find(e => e.type === 'response')?.data?.response ?? null;
  return stream;
}
