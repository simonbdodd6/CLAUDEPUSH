# AI Integration Guide — Coach's Eye

Technical reference for adding AI-powered features to the Coach's Eye serverless API.
Distilled from patterns proved in the WebsiteLeadAgent project (June 2026).

---

## Architecture overview

Coach's Eye already has a complete AI provider layer in `qa/coaching-engine/providers/`. The work
to add AI features to the live app is mostly about bridging that engine into the `api/` serverless
layer — not rebuilding the AI logic.

```
Browser / native app
    ↓  POST /api/ai-[feature]
api/ai-[feature].js           ← new serverless function
    ↓  resolveProvider() / ClaudeProvider.generateJSON()
qa/coaching-engine/providers/ ← existing provider layer (Claude, OpenAI, Gemini, Local)
    ↓  fetch()
Anthropic API (claude-haiku / claude-sonnet)
```

---

## Environment variables

Set these in Vercel → Settings → Environment Variables. Never commit them.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | For Claude | (none) | sk-ant-… — enables all Claude features |
| `COACHING_ENGINE_MODEL` | No | `claude-haiku-4-5-20251001` | Override default model |
| `COACHING_ENGINE_PROVIDER` | No | (auto-detect) | Force a specific provider: `claude`, `openai`, `gemini`, `local` |
| `OPENAI_API_KEY` | For OpenAI fallback | (none) | sk-… — used if Anthropic unavailable |

`resolveProvider()` auto-selects the best available provider. With `ANTHROPIC_API_KEY` set it
returns `ClaudeProvider`. With neither key set it returns `null` and callers fall back to template
output — no crash, no degraded UI.

### Setting on Vercel

```bash
# Via CLI
npx vercel env add ANTHROPIC_API_KEY production

# Or in the dashboard: Settings → Environment Variables → Add → Save → Redeploy
```

Set scope to **Production** only unless you want real API calls from preview deployments.

---

## AI request architecture

### The existing provider interface

`qa/coaching-engine/providers/base.js` defines the contract:

```js
class BaseProvider {
  get name()      { return 'base'; }
  get available() { return false; }   // checked before calling

  async generate({ system, user }, opts)         // returns raw string
  async generateJSON({ system, user }, opts)     // strips markdown fences, parses JSON
}
```

`generateJSON()` handles the fences problem automatically — Claude sometimes wraps output in
` ```json ``` ` even when instructed not to. Always use `generateJSON()` when you need structured
output.

### ClaudeProvider call shape

```js
// api/_ai.js — shared helper for API routes
import { resolveProvider } from '../qa/coaching-engine/providers/index.js';

export function getProvider() {
  const p = resolveProvider();
  if (!p) throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY.');
  return p;
}

export async function generateAI(system, user, opts = {}) {
  const provider = getProvider();
  return provider.generateJSON({ system, user }, opts);
}
```

Under the hood `ClaudeProvider.generate()` calls:

```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: {ANTHROPIC_API_KEY}
  anthropic-version: 2023-06-01
  Content-Type: application/json
Body:
  { model, max_tokens, system, messages: [{ role: 'user', content: user }] }
```

### Adding a new AI endpoint

Create `api/ai-[feature].js`:

```js
// api/ai-session-summary.js
// POST { playerId, sessionNotes }  →  { summary, keyPoints, nextActions }

import { setCors, readSecret }  from './_http.js';
import { resolveProvider }      from '../qa/coaching-engine/providers/index.js';

const SYSTEM = `You are a rugby coaching analyst. Summarise a training session.
Reply ONLY with valid JSON:
{
  "summary": "2-3 sentence overview",
  "keyPoints": ["point 1", "point 2"],
  "nextActions": ["action 1", "action 2"]
}`;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  const secret = readSecret(req);
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { playerId, sessionNotes } = req.body ?? {};
  if (!playerId || !sessionNotes) return res.status(400).json({ error: 'playerId and sessionNotes required' });

  const provider = resolveProvider();
  if (!provider) return res.status(503).json({ error: 'AI not configured', fallback: true });

  try {
    const result = await provider.generateJSON(
      { system: SYSTEM, user: `Player: ${playerId}\n\nNotes:\n${sessionNotes}` },
      { maxTokens: 800 },
    );
    return res.status(200).json({ ok: true, data: result, provider: provider.name });
  } catch (err) {
    return handleAiError(err, res);
  }
}
```

---

## Error handling

### Rate limits and quota errors (429 / 529)

The most common production failure. Anthropic returns HTTP 529 for overload, 429 for rate limits.

```js
function handleAiError(err, res) {
  const msg = String(err.message || '');

  // Anthropic overloaded / rate-limited
  if (msg.includes('529') || msg.includes('529') || msg.includes('overloaded')) {
    return res.status(503).json({
      error: 'AI service temporarily unavailable',
      retryAfter: 30,
      fallback: true,
    });
  }

  // Auth / quota failure
  if (msg.includes('401') || msg.includes('403') || msg.includes('credit')) {
    console.error('[AI] Auth/quota failure:', msg);
    return res.status(502).json({ error: 'AI provider configuration error' });
  }

  // JSON parse failure — model didn't return valid JSON
  if (msg.includes('JSON parse failed')) {
    console.error('[AI] Parse error:', msg);
    return res.status(500).json({ error: 'AI returned malformed response', fallback: true });
  }

  console.error('[AI] Unexpected error:', err);
  return res.status(500).json({ error: 'AI generation failed' });
}
```

### Graceful degradation

Always check `provider.available` before calling. If no provider, return `{ fallback: true }` so
the client can show template data instead of an error screen.

```js
const provider = resolveProvider();
if (!provider) {
  return res.status(200).json({ ok: true, data: buildTemplateOutput(input), fallback: true });
}
```

This is the same pattern used by `programme-generator.js` — the template fallback is already
written for the coaching programme case. New features should follow the same shape.

---

## Structured JSON output

Always use a system prompt that specifies the exact JSON schema. Use temperature 0 or low (0.2)
for consistent structure. Never ask the model to "describe" — give it the exact keys.

```js
const SYSTEM = `You are a rugby coaching expert.
Reply ONLY with valid JSON, no markdown fences:
{
  "fieldName": "type and description",
  "scores": { "dimension": number_0_to_10 },
  "recommendations": ["string array"]
}`;
```

If the model returns fences anyway, `generateJSON()` handles them. If it returns prose instead of
JSON entirely, catch the parse error and retry once or fall back to template.

---

## Streaming responses

The Anthropic API supports streaming via `stream: true`. The current `ClaudeProvider` does not
implement streaming — it waits for the full response. This is fine for most Coach's Eye features
(programmes, session plans) where the response is consumed all at once.

To add streaming to a new endpoint:

```js
// api/ai-stream-example.js — streaming via Anthropic SSE
export default async function handler(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Not configured' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      process.env.COACHING_ENGINE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      stream:     true,
      system:     req.body.system,
      messages:   [{ role: 'user', content: req.body.user }],
    }),
  });

  if (!upstream.ok) {
    res.end(`data: ${JSON.stringify({ error: `API ${upstream.status}` })}\n\n`);
    return;
  }

  // Pipe SSE chunks to the client
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value));
  }
  res.end();
}
```

Client-side:

```js
const es = new EventSource('/api/ai-stream-example');
es.onmessage = (e) => {
  const chunk = JSON.parse(e.data);
  if (chunk.type === 'content_block_delta') {
    appendToUI(chunk.delta?.text ?? '');
  }
  if (chunk.type === 'message_stop') es.close();
};
```

Streaming is worth adding for long-form outputs (>300 words) where users will wait >3 seconds.
For short coaching summaries, the non-streaming path is simpler and sufficient.

---

## Vercel deployment workflow

The workflow proven with WebsiteLeadAgent:

```bash
# First deploy: CLI creates .vercel/project.json automatically
npx vercel@latest --yes --prod

# Subsequent deploys
npx vercel@latest --prod

# Set env var from CLI
npx vercel env add ANTHROPIC_API_KEY production

# Check deployment status
npx vercel ls
```

**Important**: do not use `npm install -g vercel` if `/usr/local/lib/node_modules` is not writable.
`npx vercel@latest` works without global install and always uses the latest version.

### Build settings (auto-detected for this project)

| Setting | Value |
|---|---|
| Framework | Other |
| Build command | (none — static + serverless functions) |
| Output directory | (default) |
| Install command | `npm install` |

### Setting env vars on Vercel dashboard

1. Vercel dashboard → project → **Settings → Environment Variables**
2. Add `ANTHROPIC_API_KEY`, set scope **Production**
3. **Save** → **Redeploy** (required — env vars only take effect on next deploy)

Do not set scope to Preview unless you want real API calls burning tokens from preview deployments.

---

## Health endpoint

Add `api/health.js` so uptime monitors and Vercel can confirm the deployment is alive:

```js
// api/health.js
import { resolveProvider, listProviders } from '../qa/coaching-engine/providers/index.js';
import { setCors } from './_http.js';

export default function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const provider = resolveProvider();
  const providers = listProviders();

  return res.status(200).json({
    status:    'ok',
    version:   process.env.npm_package_version || '2.0.0',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    ai: {
      provider:   provider?.name ?? 'none',
      available:  !!provider,
      configured: providers,
    },
    timestamp: new Date().toISOString(),
  });
}
```

Route must be public — no auth middleware should block `/api/health`.
Ping with `GET /api/health` from an uptime monitor (UptimeRobot free tier works).

---

## Result caching

AI calls are expensive and slow. Cache results keyed on deterministic inputs.

For features where the same input always produces the same useful output (e.g. programme for a
given player profile + season phase), store in KV:

```js
import { kvGet, kvSet } from './_kv.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function getCachedOrGenerate(cacheKey, generate) {
  const cached = await kvGet(cacheKey);
  if (cached && (Date.now() - cached.at) < CACHE_TTL_MS) {
    return { ...cached.data, fromCache: true };
  }
  const data = await generate();
  await kvSet(cacheKey, { data, at: Date.now() });
  return data;
}
```

Usage:

```js
const key = `ai:session-summary:${playerId}:${hashNotes(sessionNotes)}`;
const result = await getCachedOrGenerate(key, () => provider.generateJSON(prompt, opts));
```

Do not cache if the output is personalised to real-time context (e.g. today's availability).

---

## Prompt construction patterns

### Separate system from user content

The system prompt is stable. The user message carries the variable data. Keep them separate —
it makes debugging easier and maps directly to the Anthropic API structure.

```js
function buildSessionPrompt(player, notes) {
  return {
    system: SYSTEM_PROMPT,  // constant, defined at module top
    user: [
      `Player: ${player.name} (${player.position}, ${player.age})`,
      `Season phase: ${player.seasonPhase}`,
      '',
      'Session notes:',
      notes.trim(),
    ].join('\n'),
  };
}
```

### Tell the model the exact schema

Include the JSON schema inline in the system prompt. The model follows explicit schemas reliably.
Do not describe the schema in prose — write it as a literal example.

### Ground the model with real data

When you have real data (availability responses, match history, injury records), inject it into the
user message. The model produces better output when working from facts rather than inferences.

```js
const availability = await getRecentAvailability(playerId);
user += `\n\nRecent availability:\n${JSON.stringify(availability, null, 2)}`;
```

This is the same pattern used by WebsiteLeadAgent's live scraper enrichment — real data in the
user message, stable instructions in the system message.

---

## Production checklist

Before enabling AI features in production:

### Configuration
- [ ] `ANTHROPIC_API_KEY` set in Vercel **Production** environment (not Preview)
- [ ] Billing active on Anthropic console (platform.anthropic.com → Settings → Billing)
- [ ] Usage limits set (platform.anthropic.com → Settings → Limits) — prevents surprise bills
- [ ] `COACHING_ENGINE_MODEL` set explicitly (don't rely on default surviving model deprecations)

### Verification
- [ ] `GET /api/health` returns `{ "status": "ok", "ai": { "available": true } }`
- [ ] POST one real AI request from the live URL — confirm non-mock response
- [ ] Confirm `fallback: true` response when API key is removed (test graceful degradation)
- [ ] Check Vercel → Functions tab for any cold-start errors after first deploy

### Security
- [ ] API key is in Vercel env only — not in git, not in `.env` committed to repo
- [ ] AI endpoints check `CRON_SECRET` or equivalent auth — no anonymous POST access
- [ ] Response does not echo back the raw prompt (no key leakage through error messages)

### Cost controls
- [ ] Estimate token usage: `haiku-4-5` ~$0.0008 per 1K input tokens, ~$0.004 per 1K output
- [ ] Add per-user or per-session rate limiting for user-facing AI endpoints
- [ ] Consider caching aggressively for repeated inputs (same player profile → same programme)

---

## Model selection

| Model | Best for | Input cost | Output cost |
|---|---|---|---|
| `claude-haiku-4-5-20251001` | Fast structured JSON, summaries, short coaching advice | $0.80/M tokens | $4.00/M tokens |
| `claude-sonnet-4-6` | Complex programme generation, nuanced analysis | $3.00/M tokens | $15.00/M tokens |
| `claude-opus-4-8` | Maximum quality, long-form content | $15.00/M tokens | $75.00/M tokens |

Default to Haiku for API endpoints — it's fast, cheap, and produces excellent structured JSON.
Use Sonnet for the coaching engine's programme and session generation where quality matters.

Set `COACHING_ENGINE_MODEL=claude-sonnet-4-6` in production if Haiku quality is insufficient.

---

## Known production issues (from WebsiteLeadAgent)

**429 / insufficient_quota on first deploy**: The Anthropic API key can be valid but have no
billing credits, causing every call to fail silently. Confirm at platform.anthropic.com that
billing is active and the account has credits before deploying.

**Startup log spam**: If `logStartupWarnings()` or similar is called at module level in a
Vercel function, it fires once per serverless instance cold-start, not once per deploy. This
is expected — do not treat repeated log lines as bugs.

**`resolveProvider()` returns `null` in production**: This means the env var is not set for the
production scope. Setting it only for Preview is a common mistake. Check Vercel → Settings →
Environment Variables → confirm scope is Production.

**Model name deprecations**: Anthropic renames and deprecates model IDs. Always pin the model
explicitly via `COACHING_ENGINE_MODEL` so you can update without a code deploy. Set a calendar
reminder to review the Anthropic changelog quarterly.
