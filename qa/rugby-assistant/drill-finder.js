/**
 * Drill Finder — searches the knowledge base for matching drills.
 *
 * Filters for isPractical=true items, ranks by relevance, and enriches
 * with a brief coaching summary from Claude when available.
 */

import { retrieveRelevant } from './query.js';
import { loadAll } from '../rugby-intel/knowledge-db.js';
import { logActivity } from './activity-log.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL   = process.env.RUGBY_ASSISTANT_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `You are a rugby coaching expert. Given a list of drills from a knowledge base, write concise coaching notes for each drill in the context of the coach's specific topic/question.

Reply ONLY with valid JSON array:
[
  {
    "id": "item id from context",
    "coachingNotes": "2-3 sentences on how to use this drill effectively for the stated topic",
    "keyPoints": ["cue 1", "cue 2"],
    "progressions": ["easier variation", "harder variation"],
    "suitableFor": "who this drill suits best"
  }
]`;

async function enrichDrills(query, items) {
  if (!items.length) return [];
  const context = items.map((i, n) =>
    `ID:${i.id} | "${i.title}" | ${i.summary}`
  ).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Topic: ${query}\n\nDrills:\n${context}` }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const enriched = JSON.parse(raw);
  return Array.isArray(enriched) ? enriched : [];
}

/**
 * Find drills matching a topic query.
 * @param {string} query
 * @param {{ limit?: number }} opts
 * @returns {Promise<object>}
 */
export async function findDrills(query, opts = {}) {
  const { limit = 8 } = opts;
  const t0 = Date.now();

  // First pass: practical items matching query
  const { items: practical, detectedAgeGroup, knowledgeBaseSize } =
    retrieveRelevant(query, { limit, filterPractical: true });

  // Second pass: if not enough, widen search (any item with drill-related categories)
  let drills = practical;
  if (drills.length < 3) {
    const all = loadAll().filter(i =>
      (i.categories || []).some(c => ['drill', 'contact-skills', 'set-piece', 'breakdown', 'attack', 'defence'].includes(c))
    );
    const { items: extra } = retrieveRelevant(query, { limit: limit - drills.length });
    drills = [...drills, ...extra.filter(e => !drills.some(d => d.id === e.id))].slice(0, limit);
  }

  let enriched = [];
  if (API_KEY && drills.length) {
    try {
      enriched = await enrichDrills(query, drills);
    } catch (err) {
      process.stderr.write(`  ⚠  Claude enrichment failed — showing raw data\n`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logActivity({ type: 'drill-query', query, resultCount: drills.length, ageGroup: detectedAgeGroup });

  return { drills, enriched, detectedAgeGroup, elapsed, knowledgeBaseSize };
}
