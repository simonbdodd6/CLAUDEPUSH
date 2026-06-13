// Executive Cognitive Engine — Objective Planner (stage 1).
//
// Normalises a free-text objective into a deterministic, inspectable structure.
// No model: lowercase, tokenise, strip noise. This is the input every later stage
// reasons over.

import { InvalidObjectiveError } from './errors.js';

const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'for', 'in', 'on', 'our', 'we', 'i', 'my', 'this', 'that', 'with', 'by', 'at', 'is', 'are', 'be']);

export function interpretObjective(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new InvalidObjectiveError('Objective must be a non-empty string.');
  }
  const normalized = raw.trim().replace(/\s+/g, ' ');
  const tokens = normalized
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOPWORDS.has(t));

  // Crude but deterministic intent verb (first recognised action word).
  const VERBS = ['increase', 'grow', 'boost', 'improve', 'reduce', 'cut', 'lower', 'acquire', 'win', 'plan', 'launch', 'optimise', 'optimize'];
  const verb = tokens.find(t => VERBS.includes(t)) ?? null;

  return { raw, normalized, tokens, verb, keywords: [...new Set(tokens)] };
}
