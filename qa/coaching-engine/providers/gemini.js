import { BaseProvider } from './base.js';

export class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey    = config.apiKey    || process.env.GEMINI_API_KEY || '';
    this.model     = config.model     || process.env.GEMINI_MODEL   || 'gemini-1.5-flash';
    this.maxTokens = config.maxTokens || 4096;
  }

  get name()      { return 'gemini'; }
  get available() { return !!this.apiKey; }

  async generate({ system, user }, opts = {}) {
    if (!this.available) throw new Error('GeminiProvider: GEMINI_API_KEY not set');

    const model = opts.model || this.model;
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `${system}\n\n${user}` }],
        }],
        generationConfig: {
          maxOutputTokens: opts.maxTokens || this.maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GeminiProvider: HTTP ${res.status} — ${text}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}
