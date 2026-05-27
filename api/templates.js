// api/templates.js — Message template CRUD
// GET            → { templates: [...] }
// POST   { id?, name, title, body, category? } → save / upsert
// DELETE { id }  → remove one template

import { kvGet, kvSet } from './_kv.js';

const TEMPLATES_KEY = 'ce:templates';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Seed defaults (only used when no templates exist yet) ────────────────────
const DEFAULT_TEMPLATES = [
  {
    id:       'tpl-availability',
    name:     'Weekly Availability',
    category: 'availability',
    title:    "Boitsfort RFC — Availability Check",
    body:     "Hi {{first_name}}! 👋 Please confirm your availability for {{session_day}} (19:45) and {{match_day}}. Reply AVAILABLE or UNAVAILABLE and flag any injuries. Thanks — {{coach_name}}",
  },
  {
    id:       'tpl-training-reminder',
    name:     'Training Reminder',
    category: 'training',
    title:    "Training Tonight — {{session_day}}",
    body:     "Hi {{first_name}}! Reminder: training tonight {{session_day}} at {{session_time}} at the usual ground. See you there! 🏉 — {{coach_name}}",
  },
  {
    id:       'tpl-match-reminder',
    name:     'Match Day Reminder',
    category: 'match',
    title:    "Match Day — {{match_day}} 🏉",
    body:     "Hi {{first_name}}! Big game {{match_day}}. Check the app for kick-off time, venue, and your position. Give it everything for Boitsfort RFC! — {{coach_name}}",
  },
  {
    id:       'tpl-selection',
    name:     'Team Selection',
    category: 'match',
    title:    "Team Selected — {{match_day}}",
    body:     "Hi {{first_name}}! The team for {{match_day}} has been posted. Open the Coach's Eye app to see your position. Any questions, speak to the coach. — {{coach_name}}",
  },
];

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    let templates = await kvGet(TEMPLATES_KEY);
    if (!Array.isArray(templates) || templates.length === 0) {
      templates = DEFAULT_TEMPLATES;
      await kvSet(TEMPLATES_KEY, templates); // seed once
    }
    return res.status(200).json({ templates });
  }

  // ── POST: create / upsert ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { id, name, title, body, category } = req.body || {};
    if (!name || !body) {
      return res.status(400).json({ error: 'name and body are required' });
    }
    const templates = (await kvGet(TEMPLATES_KEY)) || DEFAULT_TEMPLATES;
    const entry = {
      id:       id || `tpl-${Date.now()}`,
      name:     name.slice(0, 80),
      category: category || 'custom',
      title:    (title || "Coach's Eye Message").slice(0, 120),
      body:     body.slice(0, 500),
      updatedAt: new Date().toISOString(),
    };
    const idx = templates.findIndex(t => t.id === entry.id);
    if (idx >= 0) templates[idx] = entry; else templates.push(entry);
    await kvSet(TEMPLATES_KEY, templates);
    return res.status(201).json({ ok: true, template: entry });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const templates = ((await kvGet(TEMPLATES_KEY)) || DEFAULT_TEMPLATES)
      .filter(t => t.id !== id);
    await kvSet(TEMPLATES_KEY, templates);
    return res.status(200).json({ ok: true, count: templates.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
