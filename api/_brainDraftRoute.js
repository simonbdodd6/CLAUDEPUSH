// api/_brainDraftRoute.js — GET /api/brain-draft (staging/brain-integration)
//
// PREVIEW-ONLY, READ-ONLY Brain draft XV, ported from the Brain branch's api/brain-draft.js. It is
// NOT a serverless function of its own (Vercel Hobby ceiling: 12): vercel.json rewrites
//   /api/brain-draft  →  /api/publish?resource=brain-draft
// and publish.js dynamically imports this module only for that resource. This module is light; the
// Brain (packages/, via _brainProviders.js) is imported dynamically ONLY after every gate has passed,
// so a disabled Brain never loads its code.
//
// OFF BY DEFAULT — two gates, both required, unchanged from the Brain branch:
//   1. env BRAIN_ENABLED === 'true'                      (unset in production ⇒ 404 for everyone)
//   2. Redis `brain:flags:{teamId}` → { enabled: true }  (per club ⇒ 404 when off)
//
// Contract (as the Brain branch), in order: OPTIONS 200 · non-GET 405 · Brain off 404 · storage 503 ·
// not permitted 403 · club flag off 404 · bad sessionId 400 · 200 draft body · 500.
// Core-owned changes, all narrowing:
//   - permission is PERM.AI_INTELLIGENCE (was the role list ['coach','admin']);
//   - the draft is for ONE playing group the caller operates: ?group= is checked by
//     assertOperationalGroup, otherwise the caller's only operational group; several ⇒ 400 —
//     the same rule as a staff training publish;
//   - a 500 never echoes an internal error message (it is logged server-side instead).
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';
import { requireTenantPermission, PERM } from './_tenant.js';
import { loadClubStructure } from './_structureStore.js';
import { assertOperationalGroup, operationalGroupsFor } from './_accessScope.js';
import { brainGloballyEnabled, teamFlagEnabled } from './_brainFlags.js';

const validSessionId = (s) => /^[a-z0-9_-]{1,80}$/i.test(String(s || ''));

/** The one playing group this draft is for — authorised for the caller, never guessed. */
async function draftGroup(session, requestedGroup) {
  const structure = await loadClubStructure(session.teamId);
  const requested = String(requestedGroup || '').trim();
  if (requested) return assertOperationalGroup(session, structure, requested, { as: 'staff' }).id;
  const mine = operationalGroupsFor(session.teamMember, structure, { as: 'staff' });
  if (mine.length === 1) return mine[0].id;
  const e = new Error(mine.length ? 'Choose which group' : 'No playing group to draft for');
  e.status = mine.length ? 400 : 403;
  throw e;
}

export async function brainDraftHandler(req, res, { loadBrain = () => import('./_brainProviders.js') } = {}) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Global kill-switch first — production has BRAIN_ENABLED unset ⇒ unavailable for everyone.
  if (!brainGloballyEnabled()) return res.status(404).json({ error: 'Not found' });
  if (!kvConfigured()) return res.status(503).json({ error: 'Storage not configured' });

  let session;
  try {
    session = await requireTenantPermission(req, PERM.AI_INTELLIGENCE);
  } catch (error) {
    return res.status(error?.status || 403).json({ error: error?.message || 'Not authorized' });
  }

  const coachId = session?.user?.id;
  const teamId = session?.teamId;

  // Per-club flag ⇒ unavailable when off.
  if (!(await teamFlagEnabled(teamId))) return res.status(404).json({ error: 'Not found' });

  const sessionId = req.query?.sessionId;
  if (sessionId !== undefined && !validSessionId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

  let groupId;
  try {
    groupId = await draftGroup(session, req.query?.group);
  } catch (error) {
    return res.status(error?.status || 403).json({ error: error?.message || 'Not authorized' });
  }

  try {
    const { buildBrainDraft } = await loadBrain();
    const body = await buildBrainDraft({ coachId, teamId, groupId, sessionId });
    return res.status(200).json(body);
  } catch (error) {
    console.error('[brain-draft]', error && error.message);
    return res.status(500).json({ error: 'Brain draft failed' });
  }
}

export default brainDraftHandler;
