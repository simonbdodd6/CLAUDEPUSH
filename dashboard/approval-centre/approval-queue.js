// Approval queue — every AI-generated item enters here before release.
// In-memory store + JSONL persistence.

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = join(__dirname, '../../memory-engine/data');
const LOG_FILE  = join(LOG_DIR, 'approval-queue.jsonl');

export const APPROVAL_STATUS = {
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ARCHIVED: 'archived',
};

const _queue = new Map();

function persist(entry) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* non-fatal */ }
}

export function enqueue(item) {
  const id = item.approvalId ?? randomUUID();
  const entry = {
    approvalId:   id,
    type:         item.type,
    title:        item.title ?? item.type?.replace(/_/g, ' '),
    generatedBy:  item.generatedBy ?? 'unknown',
    confidence:   item.confidence  ?? 80,
    evidence:     item.evidence    ?? [],
    preview:      item.preview     ?? {},
    riskLevel:    item.riskLevel   ?? 'low',
    requiresRole: item.requiresRole ?? 'coach',
    status:       APPROVAL_STATUS.PENDING,
    editedContent: null,
    approvedBy:   null,
    rejectedBy:   null,
    rejectionReason: null,
    createdAt:    new Date().toISOString(),
    reviewedAt:   null,
    ...item,
    approvalId: id,
    status: APPROVAL_STATUS.PENDING,
  };
  _queue.set(id, entry);
  persist({ action: 'enqueue', ...entry });
  return entry;
}

export function approve(approvalId, reviewer = 'system') {
  const item = _queue.get(approvalId);
  if (!item) return { ok: false, reason: 'not found' };
  if (item.status !== APPROVAL_STATUS.PENDING) return { ok: false, reason: `already ${item.status}` };
  item.status     = APPROVAL_STATUS.APPROVED;
  item.approvedBy = reviewer;
  item.reviewedAt = new Date().toISOString();
  persist({ action: 'approve', approvalId, reviewer, at: item.reviewedAt });
  return { ok: true, item };
}

export function reject(approvalId, reviewer = 'system', reason = '') {
  const item = _queue.get(approvalId);
  if (!item) return { ok: false, reason: 'not found' };
  if (item.status !== APPROVAL_STATUS.PENDING) return { ok: false, reason: `already ${item.status}` };
  item.status          = APPROVAL_STATUS.REJECTED;
  item.rejectedBy      = reviewer;
  item.rejectionReason = reason;
  item.reviewedAt      = new Date().toISOString();
  persist({ action: 'reject', approvalId, reviewer, reason, at: item.reviewedAt });
  return { ok: true, item };
}

export function archive(approvalId) {
  const item = _queue.get(approvalId);
  if (!item) return { ok: false };
  item.status = APPROVAL_STATUS.ARCHIVED;
  persist({ action: 'archive', approvalId, at: new Date().toISOString() });
  return { ok: true };
}

export function edit(approvalId, editedContent) {
  const item = _queue.get(approvalId);
  if (!item) return { ok: false, reason: 'not found' };
  item.editedContent = editedContent;
  item.editedAt      = new Date().toISOString();
  persist({ action: 'edit', approvalId, at: item.editedAt });
  return { ok: true, item };
}

export function getPending()          { return [..._queue.values()].filter(i => i.status === APPROVAL_STATUS.PENDING); }
export function getApproved()         { return [..._queue.values()].filter(i => i.status === APPROVAL_STATUS.APPROVED); }
export function getAll()              { return [..._queue.values()]; }
export function getById(id)           { return _queue.get(id) ?? null; }
export function getByType(type)       { return [..._queue.values()].filter(i => i.type === type); }
export function getByEngine(engine)   { return [..._queue.values()].filter(i => i.generatedBy === engine); }
export function getByRisk(level)      { return [..._queue.values()].filter(i => i.riskLevel === level); }

export function stats() {
  const all = [..._queue.values()];
  const byStatus = {}, byType = {}, byRisk = {};
  all.forEach(i => {
    byStatus[i.status]   = (byStatus[i.status]   ?? 0) + 1;
    byType[i.type]       = (byType[i.type]       ?? 0) + 1;
    byRisk[i.riskLevel]  = (byRisk[i.riskLevel]  ?? 0) + 1;
  });
  return {
    total:   all.length,
    pending: byStatus[APPROVAL_STATUS.PENDING]  ?? 0,
    approved:byStatus[APPROVAL_STATUS.APPROVED] ?? 0,
    rejected:byStatus[APPROVAL_STATUS.REJECTED] ?? 0,
    byType, byRisk,
  };
}
