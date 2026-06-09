/**
 * Memory Store — low-level file system read/write layer.
 * All entity files are stored as individual JSON files.
 * All event logs are JSONL (append-only).
 * This layer is synchronous-first for simplicity; async file I/O can be added later.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ENTITY_DIRS } from './entity-schemas.js';

const __dir = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dir, 'data');
const ENTITIES_DIR   = join(DATA_DIR, 'entities');
const LOGS_DIR       = join(DATA_DIR, 'logs');

// Ensure all directories exist on import
for (const subdir of Object.values(ENTITY_DIRS)) {
  mkdirSync(join(ENTITIES_DIR, subdir), { recursive: true });
}
mkdirSync(LOGS_DIR, { recursive: true });

// ── Entity paths ──────────────────────────────────────────────────────────────

function entityPath(type, id) {
  const dir = ENTITY_DIRS[type];
  if (!dir) throw new Error(`Unknown entity type: "${type}"`);
  return join(ENTITIES_DIR, dir, `${id}.json`);
}

// ── Entity read/write ─────────────────────────────────────────────────────────

export function readEntity(type, id) {
  const path = entityPath(type, id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write an entity. On update: snapshot current data to history (keep last 5).
 */
export function writeEntity(entity) {
  const path = entityPath(entity.type, entity.id);
  const existing = readEntity(entity.type, entity.id);

  if (existing) {
    // Snapshot the current state before overwriting (drop embedding to save space)
    const { history: _h, embedding: _e, summary: _s, ...snapshot } = existing;
    const truncatedHistory = (existing.history ?? []).slice(-4);
    entity.history     = [...truncatedHistory, { ...snapshot, _snapshotAt: new Date().toISOString() }];
    entity.updateCount = (existing.updateCount ?? 0) + 1;
    entity.firstSeen   = existing.firstSeen;
  }

  entity.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(entity, null, 2), 'utf8');
  return entity;
}

/**
 * Upsert: merge new data into existing entity if it exists.
 * Useful for partial updates (e.g., add an injury without rewriting everything).
 */
export function mergeEntity(type, id, patch) {
  const existing = readEntity(type, id);
  if (!existing) return null;

  const merged = deepMerge(existing, patch);
  return writeEntity(merged);
}

/**
 * Check if an entity exists in the store.
 */
export function entityExists(type, id) {
  return existsSync(entityPath(type, id));
}

/**
 * List all entity IDs of a given type.
 */
export function listEntityIds(type) {
  const dir = join(ENTITIES_DIR, ENTITY_DIRS[type] ?? type);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5));
}

/**
 * List all entities of a given type (full objects).
 */
export function listEntities(type) {
  return listEntityIds(type).map(id => readEntity(type, id)).filter(Boolean);
}

/**
 * Delete an entity (archive, not hard delete — move to archive).
 * Returns true if the entity existed.
 */
export function archiveEntity(type, id) {
  const entity = readEntity(type, id);
  if (!entity) return false;
  entity.archivedAt = new Date().toISOString();
  const archiveDir = join(ENTITIES_DIR, `${ENTITY_DIRS[type] ?? type}_archive`);
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(join(archiveDir, `${id}.json`), JSON.stringify(entity, null, 2), 'utf8');
  return true;
}

// ── Log read/write ────────────────────────────────────────────────────────────

export const LOG_TYPES = {
  generations:   join(LOGS_DIR, 'generations.jsonl'),
  conversations: join(LOGS_DIR, 'conversations.jsonl'),
  updates:       join(LOGS_DIR, 'updates.jsonl'),
};

export function appendLog(logType, entry) {
  const path = LOG_TYPES[logType];
  if (!path) throw new Error(`Unknown log type: "${logType}"`);
  const line = JSON.stringify({ ...entry, _ts: new Date().toISOString() });
  appendFileSync(path, line + '\n', 'utf8');
}

export function readLog(logType, { limit = 100, since = null } = {}) {
  const path = LOG_TYPES[logType];
  if (!path || !existsSync(path)) return [];

  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  const filtered = since
    ? lines.filter(l => l._ts >= since)
    : lines;

  return filtered.slice(-limit);
}

// ── Index read/write ──────────────────────────────────────────────────────────

const INDEX_PATH  = join(DATA_DIR, 'index.json');
const HEALTH_PATH = join(DATA_DIR, 'health.json');

export function readIndex() {
  if (!existsSync(INDEX_PATH)) return {};
  try { return JSON.parse(readFileSync(INDEX_PATH, 'utf8')); }
  catch { return {}; }
}

export function writeIndex(index) {
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
}

export function readHealth() {
  if (!existsSync(HEALTH_PATH)) return {};
  try { return JSON.parse(readFileSync(HEALTH_PATH, 'utf8')); }
  catch { return {}; }
}

export function writeHealth(health) {
  writeFileSync(HEALTH_PATH, JSON.stringify(health, null, 2), 'utf8');
}

// ── Storage stats ─────────────────────────────────────────────────────────────

export function storageStats() {
  const stats = { byType: {}, totalEntities: 0, totalLogLines: 0, dataDir: DATA_DIR };

  for (const [type, subdir] of Object.entries(ENTITY_DIRS)) {
    const dir = join(ENTITIES_DIR, subdir);
    if (!existsSync(dir)) { stats.byType[type] = 0; continue; }
    const count = readdirSync(dir).filter(f => f.endsWith('.json')).length;
    stats.byType[type] = count;
    stats.totalEntities += count;
  }

  for (const [name, path] of Object.entries(LOG_TYPES)) {
    if (existsSync(path)) {
      const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean).length;
      stats.totalLogLines += lines;
      stats[`${name}Log`] = lines;
    }
  }

  return stats;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function deepMerge(target, source) {
  const result = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof result[k] === 'object' && result[k] !== null) {
      result[k] = deepMerge(result[k], v);
    } else {
      result[k] = v;
    }
  }
  return result;
}
