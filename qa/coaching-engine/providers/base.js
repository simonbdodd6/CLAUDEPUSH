/**
 * Base provider interface.
 * All concrete providers extend this class and implement generate().
 */
export class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  get name() { return 'base'; }
  get available() { return false; }

  /**
   * @param {{ system: string, user: string }} prompt
   * @param {object} opts  — e.g. { maxTokens, model }
   * @returns {Promise<string>}
   */
  async generate(_prompt, _opts = {}) {
    throw new Error(`${this.name} provider: generate() not implemented`);
  }

  /**
   * Call generate() and parse the response as JSON.
   * Strips markdown fences if the model wraps output in ```json ... ```.
   */
  async generateJSON(prompt, opts = {}) {
    const raw = await this.generate(prompt, opts);
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`${this.name}: JSON parse failed — raw response was: ${raw.slice(0, 200)}`);
    }
  }
}
