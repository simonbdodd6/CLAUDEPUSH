// Evidence View — read-only explainability surface.
//
// Composes two things that ALREADY exist:
//   1. Knowledge Engine citations  (every ask() answer cites its source engine)
//   2. Memory Engine entity links  (entities reference related entities by id)
//
// It introduces no new store, no new reasoning, and no new AI. It only reads
// from the existing engines and assembles a "why" payload. Safe to call read-only.

import { ask } from './index.js';

const LINK_FIELDS = ['programmes', 'injuries', 'goals', 'sessions', 'teams', 'seasons', 'conversations', 'feedback'];

// Surface an entity's relationship arrays as evidence links — without copying the
// underlying records. Each link is { relation, ref, label }.
function extractLinks(entity) {
  const out = [];
  for (const field of LINK_FIELDS) {
    const value = entity?.[field];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const ref = typeof item === 'string'
        ? item
        : (item?.id ?? item?.programmeId ?? item?.sessionId ?? item?.teamId ?? null);
      if (!ref) continue;
      out.push({
        relation: field,
        ref,
        label: (typeof item === 'object' ? (item?.title ?? item?.type ?? item?.name) : null) ?? null,
      });
    }
  }
  return out;
}

/**
 * Build a composed evidence payload.
 *
 * @param {object} opts
 * @param {string} [opts.question]  — natural-language question for the Knowledge Engine
 * @param {string} [opts.entityId]  — a Memory entity id to surface relationship links for
 * @param {string} [opts.role]      — caller role (passed through to ask())
 * @returns {Promise<object>} read-only evidence payload
 */
export async function buildEvidence({ question = '', entityId = null, role = 'coach' } = {}) {
  // 1. Knowledge citations (reuse ask() — it already produces cited, confidence-scored answers).
  let answer = null, confidence = null, citations = [], intent = null;
  if (question) {
    try {
      const result = await ask(question, { role });
      answer     = result?.answer ?? null;
      confidence = result?.confidence ?? null;
      citations  = result?.citations ?? [];
      intent     = result?.intent ?? null;
    } catch (e) {
      answer = `Evidence unavailable: ${e.message}`;
    }
  }

  // 2. Memory entity links (reuse Memory getters — read only).
  let entity = null, links = [];
  if (entityId) {
    try {
      const mem = await import('../memory-engine/index.js');
      const found = mem.getPlayerById?.(entityId) ?? mem.getTeamById?.(entityId) ?? null;
      if (found) {
        entity = { id: found.id ?? entityId, type: found.type ?? null, name: found.name ?? found.title ?? null };
        links  = extractLinks(found);
      }
    } catch { /* memory unavailable — links stay empty, non-fatal */ }
  }

  return {
    question:   question || null,
    entityId:   entityId || null,
    entity,
    intent,
    answer,
    confidence,
    citations,   // [{ citationId, engine, fact, entityId, field, retrievedAt }]
    links,       // [{ relation, ref, label }]
    generatedAt: new Date().toISOString(),
  };
}
