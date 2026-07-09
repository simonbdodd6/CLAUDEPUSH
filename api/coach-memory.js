// api/coach-memory.js — Gated Coach Memory capture route (Core Memory M5, DORMANT: no UI wiring)
//
// The first REACHABLE write endpoint for coach memories. It is the thin HTTP shell around the M4
// capture seam: it authenticates, derives the tenant scope from the SESSION only, applies a coarse
// payload cap, forwards the body's content fields to captureCoachMemory, and maps outcomes to safe
// status codes. It performs NO reasoning, classification, scoring, summarising or Brain call — it
// only moves a validated record into storage.
//
//   POST /api/coach-memory   { type, statement, confidence, weight, tags, ontologyLinks, evidenceRefs, source }
//     → 200 { ok:true, memory }   persisted (server-minted id + createdAt)
//     → 400 invalid content / oversized payload
//     → 403 unauthenticated OR lacks ai_intelligence
//     → 405 non-POST method
//     → 409 duplicate id (defensive — server-minted random ids do not collide over HTTP)
//     → 503 storage not configured
//     → 500 unexpected (generic message; no internals leaked)
//
// Tenant safety: teamId and coachId come from the authenticated session, never the request body.
// Any teamId/coachId/id/createdAt a caller puts in the body is ignored (the M4 seam whitelists only
// the eight M108 content fields and mints id + createdAt server-side). A coach can therefore only
// ever write into their OWN team+coach collection.
//
// No UI references this route; it is gated by PERM.AI_INTELLIGENCE. Linking it into any surface, or
// deploying it to a live target, is a separate deliberate activation step.

import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { requireTenantPermission, PERM } from './_tenant.js';
import { captureCoachMemory } from './_coachMemoryCapture.js';

// Coarse abuse guard applied before capture. Shape validation stays with the store; these are only
// size ceilings for the first externally-reachable write surface.
const MAX_STATEMENT_CHARS = 2000;
const MAX_ARRAY_ITEMS = 100;

function oversizeReason(body) {
  if (typeof body.statement === 'string' && body.statement.length > MAX_STATEMENT_CHARS) return 'statement is too long';
  for (const field of ['tags', 'ontologyLinks', 'evidenceRefs']) {
    if (Array.isArray(body[field]) && body[field].length > MAX_ARRAY_ITEMS) return `${field} has too many items`;
  }
  return null;
}

function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!kvConfigured()) return res.status(503).json({ ok: false, error: 'Memory storage not configured' });

  // Auth: unauthenticated (401) and unauthorized (403) both surface as 403 — never reveal which.
  let session;
  try {
    session = await requireTenantPermission(req, PERM.AI_INTELLIGENCE);
  } catch {
    return res.status(403).json({ ok: false, error: 'Not authorized' });
  }

  const body = readBody(req);
  const oversized = oversizeReason(body);
  if (oversized) return res.status(400).json({ ok: false, error: oversized });

  // Scope from the session ONLY — the body can never choose the tenant it writes to.
  const scope = { teamId: session.teamId, coachId: session.user?.id };

  try {
    const memory = await captureCoachMemory(scope, body);
    return res.status(200).json({ ok: true, memory });
  } catch (error) {
    const message = String(error?.message || '');
    // Capture/store validation failures are TypeErrors with descriptive, non-sensitive messages.
    if (error instanceof TypeError) return res.status(400).json({ ok: false, error: message || 'Invalid coach memory' });
    if (/already exists/.test(message)) return res.status(409).json({ ok: false, error: 'Coach memory already exists' });
    return res.status(500).json({ ok: false, error: 'Could not save coach memory' });
  }
}
