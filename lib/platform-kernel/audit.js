// Platform Kernel — append-only audit record shape.
//
// The canonical shape for an append-only audit/event log entry, duplicated
// across many repositories: a stable id (caller-supplied or `${prefix}_<uuid>`)
// and an `occurredAt` timestamp, spread over the caller's fields. Append-only —
// the kernel offers no mutate/delete.

import { randomUUID } from 'crypto';

export function nowIso() {
  return new Date().toISOString();
}

export function createAuditEvent(event = {}, options = {}) {
  const { idPrefix = 'audit', idField = 'id' } = options;
  return {
    [idField]: event[idField] ?? `${idPrefix}_${randomUUID()}`,
    occurredAt: event.occurredAt ?? nowIso(),
    ...event,
  };
}
