import { BaseProvider } from './base.js';

const DEFAULT_MODEL = process.env.COACHING_ENGINE_MODEL || 'claude-haiku-4-5-20251001';

export class ClaudeProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey    = config.apiKey    || process.env.ANTHROPIC_API_KEY || '';
    this.model     = config.model     || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || 4096;
  }

  get name()      { return 'claude'; }
  get available() { return !!this.apiKey; }

  async generate({ system, user }, opts = {}) {
    if (!this.available) throw new Error('ClaudeProvider: ANTHROPIC_API_KEY not set');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      opts.model     || this.model,
        max_tokens: opts.maxTokens || this.maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ClaudeProvider: HTTP ${res.status} — ${text}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text ?? '';
  }
}
