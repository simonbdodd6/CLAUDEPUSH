import { BaseProvider } from './base.js';

export class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey    = config.apiKey    || process.env.OPENAI_API_KEY || '';
    this.model     = config.model     || process.env.OPENAI_MODEL   || 'gpt-4o-mini';
    this.maxTokens = config.maxTokens || 4096;
  }

  get name()      { return 'openai'; }
  get available() { return !!this.apiKey; }

  async generate({ system, user }, opts = {}) {
    if (!this.available) throw new Error('OpenAIProvider: OPENAI_API_KEY not set');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model:      opts.model     || this.model,
        max_tokens: opts.maxTokens || this.maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAIProvider: HTTP ${res.status} — ${text}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}
