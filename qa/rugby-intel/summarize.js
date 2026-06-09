/**
 * Knowledge extraction — Claude-powered when API key is set, heuristic fallback otherwise.
 *
 * Two-pass design:
 *   1. classify.js runs first (heuristics, zero cost)
 *   2. summarize.js runs second (calls Claude if available, enriching the classification)
 *
 * Claude is called once per item with the pre-classified context in the system prompt.
 * This reduces token usage and improves output quality.
 */

import {
  extractTitle, extractDate, extractContext, extractKeywords,
  heuristicSummary, heuristicTakeaway, truncate,
} from './normalize.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.RUGBY_INTEL_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a rugby coaching intelligence analyst. Extract structured knowledge from rugby content — articles, law documents, drill guides, coaching notes.

Reply ONLY with valid JSON (no markdown, no commentary):
{
  "title": "concise title max 100 chars",
  "summary": "2-3 sentences covering the key rugby coaching insight",
  "takeaway": "one specific actionable coaching point (max 200 chars)",
  "categories": ["from: law-update,safety,attack,defence,kicking,set-piece,breakdown,contact-skills,youth,sc,team-culture,match-analysis,drill,philosophy"],
  "ageGroup": ["from: all,mini,youth,senior"],
  "coachingLevel": ["from: all,beginner,intermediate,advanced,elite"],
  "isLawUpdate": false,
  "isSafetyAlert": false,
  "isTactical": false,
  "isPractical": false,
  "country": null,
  "competition": null,
  "keywords": ["up to 10 rugby-specific keywords"],
  "confidence": 0.0
}

Guidelines:
- isSafetyAlert: true only for concussion, tackle height, or welfare concerns
- isPractical: true when content includes drills, exercises, or session plans
- isTactical: true when content covers attack, defence, or game strategy
- confidence: 0.9 for rich content, 0.7 for thin content, 0.5 for minimal rugby relevance`;

async function callClaude(content, preClassification) {
  const contextHint = preClassification.categories.length
    ? `Pre-classified as: ${preClassification.categories.join(', ')}. `
    : '';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `${contextHint}Analyse this rugby content:\n\n${truncate(content, 3000)}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content?.[0]?.text ?? '').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(text);
}

/**
 * Extract knowledge from a piece of text.
 *
 * @param {string} text — cleaned text content
 * @param {string} filePath — source file path
 * @param {object} preClassification — output from classify.js
 * @returns {Promise<object>} extracted fields to merge into KnowledgeItem
 */
export async function extractKnowledge(text, filePath, preClassification) {
  if (API_KEY) {
    try {
      const result = await callClaude(text, preClassification);
      return {
        title: result.title || extractTitle(text, filePath),
        summary: result.summary || '',
        takeaway: result.takeaway || '',
        categories: result.categories?.length ? result.categories : preClassification.categories,
        ageGroup: result.ageGroup?.length ? result.ageGroup : preClassification.ageGroup,
        coachingLevel: result.coachingLevel?.length ? result.coachingLevel : preClassification.coachingLevel,
        isLawUpdate: result.isLawUpdate ?? preClassification.isLawUpdate,
        isSafetyAlert: result.isSafetyAlert ?? preClassification.isSafetyAlert,
        isTactical: result.isTactical ?? preClassification.isTactical,
        isPractical: result.isPractical ?? preClassification.isPractical,
        country: result.country ?? null,
        competition: result.competition ?? null,
        keywords: result.keywords ?? [],
        confidence: result.confidence ?? 0.75,
        analysisMode: `claude (${MODEL})`,
      };
    } catch (err) {
      // Claude failed — fall through to heuristic
      console.warn(`  ⚠️  Claude extraction failed (${err.message}), using heuristics`);
    }
  }

  // Heuristic extraction
  const { country, competition } = extractContext(text);
  return {
    title: extractTitle(text, filePath),
    summary: heuristicSummary(text),
    takeaway: heuristicTakeaway(text),
    ...preClassification,
    country,
    competition,
    keywords: extractKeywords(text),
    confidence: 0.55,
    analysisMode: 'heuristic',
  };
}
