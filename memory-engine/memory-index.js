/**
 * Memory Index — master index management, fast lookup, and keyword search.
 * The index is a flat JSON file keyed by entity ID.
 * It holds just enough metadata for fast search without loading full entities.
 *
 * Future: replace searchIndex() with vector similarity search when embeddings are added.
 */

import { readIndex, writeIndex, listEntities } from './memory-store.js';

// ── Index entry shape ─────────────────────────────────────────────────────────

function indexEntryFromEntity(entity) {
  const entry = {
    id:          entity.id,
    type:        entity.type,
    summary:     entity.summary ?? '',
    tags:        entity.tags ?? [],
    lastUpdated: entity.lastUpdated,
    updateCount: entity.updateCount ?? 0,
  };

  // Add type-specific searchable fields
  switch (entity.type) {
    case 'player':
      entry.name     = entity.core?.name;
      entry.position = entity.core?.position;
      entry.ageGroup = entity.core?.ageGroup;
      entry.club     = entity.core?.club;
      break;
    case 'coach':
      entry.name     = entity.core?.name;
      entry.club     = entity.core?.club;
      break;
    case 'team':
      entry.ageGroup = entity.core?.ageGroup;
      entry.club     = entity.core?.club;
      entry.level    = entity.core?.level;
      break;
    case 'club':
      entry.name    = entity.core?.name;
      entry.country = entity.core?.country;
      break;
    case 'programme':
      entry.player      = entity.player;
      entry.requestType = entity.requestType;
      entry.status      = entity.status;
      break;
    case 'session':
      entry.team       = entity.team;
      entry.ageGroup   = entity.ageGroup;
      entry.sessionDate = entity.sessionDate;
      entry.focus      = entity.focus;
      break;
    case 'season':
      entry.team  = entity.team;
      entry.label = entity.label;
      break;
  }

  return entry;
}

// ── Index operations ──────────────────────────────────────────────────────────

export function indexEntity(entity) {
  const index = readIndex();
  index[entity.id] = indexEntryFromEntity(entity);
  writeIndex(index);
}

export function removeFromIndex(id) {
  const index = readIndex();
  delete index[id];
  writeIndex(index);
}

export function getIndexEntry(id) {
  return readIndex()[id] ?? null;
}

export function getIndexEntriesOfType(type) {
  const index = readIndex();
  return Object.values(index).filter(e => e.type === type);
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Keyword search across the index.
 * Scores entries by how many query terms match their searchable fields.
 *
 * Future: replace with vector similarity once embeddings are populated.
 */
export function searchIndex(query, opts = {}) {
  const { types = null, limit = 10 } = opts;

  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const index  = readIndex();
  const scored = [];

  for (const entry of Object.values(index)) {
    if (types && !types.includes(entry.type)) continue;

    const text = entryToSearchText(entry);
    let score  = 0;

    for (const token of tokens) {
      if (text.includes(token)) score += 1;
    }

    // Boost recent entries
    const daysSince = (Date.now() - new Date(entry.lastUpdated).getTime()) / 86400000;
    score += Math.max(0, 1 - daysSince / 90);

    if (score > 0) scored.push({ ...entry, _score: score });
  }

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

/**
 * Find an entity by exact field values (used for upsert detection).
 */
export function findByFields(type, fields = {}) {
  const entries = getIndexEntriesOfType(type);
  return entries.filter(e => {
    return Object.entries(fields).every(([k, v]) =>
      v == null || e[k] === v
    );
  });
}

/**
 * Rebuild the full index from entity files.
 * Used by memory-health repair function.
 */
export function rebuildIndex() {
  const allTypes = ['player', 'coach', 'team', 'club', 'programme', 'session', 'season', 'conversation', 'ai-generation'];
  const newIndex = {};

  for (const type of allTypes) {
    const entities = listEntities(type);
    for (const entity of entities) {
      newIndex[entity.id] = indexEntryFromEntity(entity);
    }
  }

  writeIndex(newIndex);
  return Object.keys(newIndex).length;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function entryToSearchText(entry) {
  return [
    entry.summary,
    entry.name,
    entry.position,
    entry.ageGroup,
    entry.club,
    entry.country,
    entry.focus,
    entry.label,
    (entry.tags ?? []).join(' '),
  ].filter(Boolean).join(' ').toLowerCase();
}
