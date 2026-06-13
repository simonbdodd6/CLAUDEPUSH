// Approval Ledger — durable, swappable persistence for the approval centre.
//
// Purpose (PIF-2): make approval state, decisions, evidence references and learning
// outcomes survive process restarts and (later) multi-instance / serverless
// deployments — WITHOUT introducing a new store schema, a new AI system, or any
// duplication of engine logic. It is pure platform infrastructure.
//
// Two append-only streams, both reached through ONE adapter interface:
//   • events  (approval-queue.jsonl) — the existing event log; replayed on startup
//                                       to rebuild live queue state.
//   • audit   (approval-audit.jsonl) — consolidated, traceable decision records
//                                       (decision id, action, timestamp, source
//                                       engine, evidence/citation ids, human
//                                       decision, learning outcome).
//
// LedgerAdapter interface (duck-typed):
//   append(stream: string, record: object): void   — append one JSON record
//   readAll(stream: string): object[]               — read + parse every record
//
// Default adapter: FileLedgerAdapter — local/dev, file-based, safe, no deps.
// Placeholder adapter: ProductionLedgerAdapter — where a managed store (Postgres /
//   Supabase / Vercel) would plug in later. NOT connected; holds no credentials.

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '../../memory-engine/data');

// Logical stream name → physical file. The events file is the SAME path the
// approval queue has always written to, so existing logs replay unchanged.
const STREAM_FILE = {
  events: 'approval-queue.jsonl',
  audit:  'approval-audit.jsonl',
};

// ── Default adapter: file-based (local / dev) ──────────────────────────────────
export class FileLedgerAdapter {
  constructor(dir = DATA_DIR) { this.dir = dir; }

  _path(stream) { return join(this.dir, STREAM_FILE[stream] ?? `${stream}.jsonl`); }

  append(stream, record) {
    try {
      if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
      appendFileSync(this._path(stream), JSON.stringify(record) + '\n', 'utf8');
    } catch { /* durability is best-effort in dev; never throw on the write path */ }
  }

  readAll(stream) {
    try {
      const p = this._path(stream);
      if (!existsSync(p)) return [];
      return readFileSync(p, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);
    } catch { return []; }
  }
}

// ── Placeholder adapter: production (NOT wired) ────────────────────────────────
// Intentionally inert. To implement later: back append()/readAll() with a managed
// store, reading connection details from env AT CALL TIME. Do not embed secrets.
export class ProductionLedgerAdapter {
  constructor() {
    this.reason =
      'Production approval ledger is not configured. Use APPROVAL_LEDGER=file for ' +
      'local/dev, or implement append()/readAll() against a managed store ' +
      '(e.g. Postgres / Supabase / Vercel) with credentials supplied via env.';
  }
  append()  { throw new Error(this.reason); }
  readAll() { throw new Error(this.reason); }
}

// ── Adapter selection ──────────────────────────────────────────────────────────
let _ledger = null;
export function getLedger() {
  if (_ledger) return _ledger;
  const kind = (process.env.APPROVAL_LEDGER ?? 'file').toLowerCase();
  _ledger = kind === 'production' ? new ProductionLedgerAdapter() : new FileLedgerAdapter();
  return _ledger;
}

// For tests / advanced callers that want to inject an adapter.
export function setLedger(adapter) { _ledger = adapter; }

// ── Event log (state durability) ───────────────────────────────────────────────
export function appendEvent(record) { getLedger().append('events', record); }
export function readEvents()         { return getLedger().readAll('events'); }

// Rebuild the approval items map by replaying the event log. Pure → returns a Map.
// Event shapes (existing, unchanged):
//   { action:'enqueue', ...fullItem }
//   { action:'approve', approvalId, reviewer, at }
//   { action:'reject',  approvalId, reviewer, reason, at }
//   { action:'archive', approvalId, at }
//   { action:'edit',    approvalId, at }
export function replayState() {
  const items = new Map();
  for (const ev of readEvents()) {
    const id = ev?.approvalId;
    if (!id) continue;
    switch (ev.action) {
      case 'enqueue': {
        const { action, ...item } = ev;
        items.set(id, item);
        break;
      }
      case 'approve': {
        const it = items.get(id); if (!it) break;
        it.status = 'approved'; it.approvedBy = ev.reviewer ?? null; it.reviewedAt = ev.at ?? null;
        break;
      }
      case 'reject': {
        const it = items.get(id); if (!it) break;
        it.status = 'rejected'; it.rejectedBy = ev.reviewer ?? null;
        it.rejectionReason = ev.reason ?? null; it.reviewedAt = ev.at ?? null;
        break;
      }
      case 'archive': {
        const it = items.get(id); if (!it) break;
        it.status = 'archived';
        break;
      }
      case 'edit': {
        const it = items.get(id); if (!it) break;
        it.editedAt = ev.at ?? null;
        break;
      }
      default: break;
    }
  }
  return items;
}

// ── Audit trail (traceability) ─────────────────────────────────────────────────
// One consolidated record per coach decision. Required fields are always present;
// optional evidence/learning fields are included when available.
export function appendAudit(record) {
  const row = {
    auditId:     `aud-${randomUUID()}`,
    recordedAt:  new Date().toISOString(),
    ...record,
  };
  getLedger().append('audit', row);
  return row;
}

export function readAudit({ limit = 100 } = {}) {
  const all = getLedger().readAll('audit');
  return limit > 0 ? all.slice(-limit) : all;
}
