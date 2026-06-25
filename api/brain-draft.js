// api/brain-draft.js — GET /api/brain-draft
//
// PREVIEW-ONLY, READ-ONLY Brain draft XV. Off by default (BRAIN_ENABLED env + per-team flag), so when
// disabled the endpoint is unavailable (404) and production is completely unchanged. This is the ONLY
// activation surface that composes the Brain; it performs NO writes and never mutates Core data.
//
// Architecture: AI Brain consumes Core (read-only). Core never depends on the Brain.
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { requireTenantRole } from './_tenant.js';
import { brainGloballyEnabled, teamFlagEnabled } from './_brainFlags.js';
import { buildBrainDraft } from './_brainProviders.js';

const validSessionId = (s) => /^[a-z0-9_-]{1,80}$/i.test(String(s || ''));

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Global kill-switch first — production has BRAIN_ENABLED unset ⇒ endpoint unavailable for everyone.
  if (!brainGloballyEnabled()) return res.status(404).json({ error: 'Not found' });
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  // Coach auth (reuses the existing tenant-aware session resolution).
  let session;
  try {
    session = await requireTenantRole(req, ['coach', 'admin']);
  } catch (error) {
    return res.status(error?.status || 403).json({ error: error?.message || 'Not authorized' });
  }

  const coachId = session?.user?.id;
  const teamId = session?.teamId;

  // Per-team premium flag ⇒ unavailable when off (Core untouched).
  if (!(await teamFlagEnabled(teamId))) return res.status(404).json({ error: 'Not found' });

  const sessionId = req.query?.sessionId || 'game';
  if (!validSessionId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

  try {
    const body = await buildBrainDraft({ coachId, teamId, sessionId });
    return res.status(200).json(body);
  } catch (error) {
    return res.status(500).json({ error: 'Brain draft failed', detail: String(error?.message || error) });
  }
}
