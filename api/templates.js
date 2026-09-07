// Message template CRUD backed by Upstash Redis.
import { kvGet, kvSet, kvConfigured } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { setCors } from './_http.js';
import { requireTenantPermission, tenantTeamId, PERM } from './_tenant.js';
import { DEFAULT_TEAM } from './_identityStore.js';

function sendAuthError(res, error) {
  return res.status(error?.status || 403).json({ ok: false, error: error?.message || 'Not authorized' });
}

const TEMPLATES_KEY = key('templates');
const LEGACY_TEMPLATES_KEY = legacyKey('templates');
const DEFAULT_TEMPLATES = [
  {
    id: 'tpl-availability', name: 'Weekly Availability', category: 'availability',
    title: "CoachEasier - Availability Check",
    body: 'Hi {{first_name}}! Please confirm your availability for {{session_day}} and {{match_day}}. Tap a response below. Thanks - {{coach_name}}',
  },
  {
    id: 'tpl-training-reminder', name: 'Training Reminder', category: 'training',
    title: 'Training Reminder - {{session_day}}',
    body: 'Hi {{first_name}}! Training is at {{session_time}}. Open CoachEasier for the plan. - {{coach_name}}',
  },
];

// ── PER-CLUB template lists (tenant isolation) ──────────────────────────────
// Templates used to live in ONE flat list shared by every club — the same
// cross-tenant shape the invitation store was rescued from. Any club could
// rewrite or delete the template BODIES another club's scheduled reminders
// send. Each club now keeps its own list under templates:<teamId>; the flat
// legacy list stays readable for the DEFAULT team only, which is the
// documented owner of all pre-namespace data, so its existing edits survive.
// A club with no stored list starts from the pristine defaults.
function templatesKeyFor(teamId) {
  return key(`templates:${teamId}`);
}

/**
 * The template list ONE club sees — also what the cron dispatcher resolves a
 * schedule's message body from, so no other club's edit can ever reach this
 * club's players. Pure read: nothing is seeded or persisted here.
 */
export async function templatesForClub(teamId) {
  const own = await kvGet(templatesKeyFor(teamId));
  if (Array.isArray(own) && own.length) return own;
  if (String(teamId) === DEFAULT_TEAM.id) {
    const current = await kvGet(TEMPLATES_KEY);
    if (Array.isArray(current) && current.length) return current;
    const legacy = await kvGet(LEGACY_TEMPLATES_KEY);
    if (Array.isArray(legacy) && legacy.length) return legacy;
  }
  return DEFAULT_TEMPLATES.map(template => ({ ...template, createdAt: new Date().toISOString() }));
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });
  let sessionContext;
  try {
    sessionContext = await requireTenantPermission(req, PERM.MESSAGING);
  } catch (error) {
    return sendAuthError(res, error);
  }
  const teamId = tenantTeamId(sessionContext);

  if (req.method === 'GET') {
    return res.status(200).json({ templates: await templatesForClub(teamId) });
  }

  if (req.method === 'POST') {
    const { id, name, category, title, body } = req.body || {};
    if (!String(name || '').trim() || !String(title || '').trim() || !String(body || '').trim()) {
      return res.status(400).json({ error: 'name, title and body are required' });
    }
    // Edits apply to THIS club's effective list and persist under its own
    // key — the DEFAULT team's first save lazily adopts its legacy list.
    const templates = await templatesForClub(teamId);
    const existing = templates.find(template => template.id === id);
    const now = new Date().toISOString();
    const template = {
      id: String(id || `tpl-${Date.now()}`),
      name: String(name).trim().slice(0, 80),
      category: String(category || 'custom').slice(0, 30),
      title: String(title).trim().slice(0, 120),
      body: String(body).trim().slice(0, 1000),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const next = existing
      ? templates.map(item => item.id === template.id ? template : item)
      : [...templates, template];
    await kvSet(templatesKeyFor(teamId), next);
    return res.status(200).json({ ok: true, template });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const templates = (await templatesForClub(teamId)).filter(template => template.id !== id);
    await kvSet(templatesKeyFor(teamId), templates);
    return res.status(200).json({ ok: true, count: templates.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
