// Message template CRUD backed by Upstash Redis.
import { kvGet, kvSet, kvConfigured } from './_kv.js';
import { key, legacyKey } from './_keys.js';
import { setCors } from './_http.js';

const TEMPLATES_KEY = key('templates');
const LEGACY_TEMPLATES_KEY = legacyKey('templates');
const DEFAULT_TEMPLATES = [
  {
    id: 'tpl-availability', name: 'Weekly Availability', category: 'availability',
    title: "coacheseyeGPT - Availability Check",
    body: 'Hi {{first_name}}! Please confirm your availability for {{session_day}} and {{match_day}}. Tap a response below. Thanks - {{coach_name}}',
  },
  {
    id: 'tpl-training-reminder', name: 'Training Reminder', category: 'training',
    title: 'Training Reminder - {{session_day}}',
    body: 'Hi {{first_name}}! Training is at {{session_time}}. Open Coach\'s Eye for the plan. - {{coach_name}}',
  },
];

async function readTemplates() {
  const current = await kvGet(TEMPLATES_KEY);
  if (Array.isArray(current) && current.length) return current;
  const legacy = await kvGet(LEGACY_TEMPLATES_KEY);
  if (Array.isArray(legacy) && legacy.length) return legacy;
  const seeded = DEFAULT_TEMPLATES.map(template => ({ ...template, createdAt: new Date().toISOString() }));
  await kvSet(TEMPLATES_KEY, seeded);
  return seeded;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  if (req.method === 'GET') {
    return res.status(200).json({ templates: await readTemplates() });
  }

  if (req.method === 'POST') {
    const { id, name, category, title, body } = req.body || {};
    if (!String(name || '').trim() || !String(title || '').trim() || !String(body || '').trim()) {
      return res.status(400).json({ error: 'name, title and body are required' });
    }
    const templates = await readTemplates();
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
    await kvSet(TEMPLATES_KEY, next);
    return res.status(200).json({ ok: true, template });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const templates = (await readTemplates()).filter(template => template.id !== id);
    await kvSet(TEMPLATES_KEY, templates);
    return res.status(200).json({ ok: true, count: templates.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
