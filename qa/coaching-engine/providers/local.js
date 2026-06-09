import { BaseProvider } from './base.js';

/**
 * Ollama-compatible local LLM provider.
 * Works with any Ollama model (llama3, mistral, gemma, etc.).
 * Set LOCAL_LLM_URL and LOCAL_LLM_MODEL in environment, or pass in config.
 */
export class LocalProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.baseUrl = config.baseUrl || process.env.LOCAL_LLM_URL   || 'http://localhost:11434';
    this.model   = config.model   || process.env.LOCAL_LLM_MODEL || 'llama3';
  }

  get name()      { return 'local'; }
  get available() { return !!this.baseUrl; }

  async generate({ system, user }, opts = {}) {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  opts.model || this.model,
        prompt: `${system}\n\n${user}`,
        stream: false,
        options: { num_predict: opts.maxTokens || 4096 },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LocalProvider: HTTP ${res.status} — ${text}`);
    }

    const data = await res.json();
    return data.response ?? '';
  }
}
