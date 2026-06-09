import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { LocalProvider  } from './local.js';

export { ClaudeProvider, OpenAIProvider, GeminiProvider, LocalProvider };

const REGISTRY = new Map([
  ['claude', ClaudeProvider],
  ['openai', OpenAIProvider],
  ['gemini', GeminiProvider],
  ['local',  LocalProvider],
]);

/** Instantiate a provider by name. Adding a new provider = create file + 2 lines here. */
export function createProvider(name, config = {}) {
  const Cls = REGISTRY.get(name);
  if (!Cls) throw new Error(`Unknown provider: "${name}". Available: ${[...REGISTRY.keys()].join(', ')}`);
  return new Cls(config);
}

/**
 * Resolve the best available provider from the environment.
 * Priority: COACHING_ENGINE_PROVIDER env var → claude → openai → gemini → local → null
 * Returns null when no provider is configured — callers should fall back to template output.
 */
export function resolveProvider(config = {}) {
  const preferred = process.env.COACHING_ENGINE_PROVIDER;
  if (preferred) {
    try {
      const p = createProvider(preferred, config);
      if (p.available) return p;
    } catch { /* unknown name — fall through */ }
  }

  for (const name of ['claude', 'openai', 'gemini', 'local']) {
    const p = createProvider(name, config);
    if (p.available) return p;
  }

  return null;
}

/** List all providers and whether they are currently configured. */
export function listProviders() {
  return [...REGISTRY.keys()].map(name => {
    const p = createProvider(name);
    return { name, available: p.available };
  });
}
