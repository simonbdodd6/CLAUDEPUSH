// Availability replies from notification actions or the player app.
import { load } from './_lib.js';
import { loadAvailability, saveAvailability } from './_availabilityStore.js';
import { setCors } from './_http.js';
import { kvConfigured } from './_kv.js';

const RESPONSES = new Set(['available', 'unavailable', 'maybe']);

function validSessionId(sessionId) {
  return /^[a-z0-9_-]{1,80}$/i.test(String(sessionId || ''));
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!kvConfigured()) return res.status(503).json({ error: 'Message storage not configured yet' });

  if (req.method === 'GET') {
    const sessionId = req.query?.sessionId || 'game';
    if (!validSessionId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });
    const responses = await loadAvailability(sessionId);
    const list = Object.entries(responses).map(([label, value]) => ({
      label,
      response: typeof value === 'string' ? value : value?.response,
      respondedAt: typeof value === 'string' ? null : value?.respondedAt,
    }));
    return res.status(200).json({ sessionId, responses: list, count: list.length });
  }

  if (req.method === 'POST') {
    const { endpoint, response, sessionId } = req.body || {};
    if (!endpoint || !validSessionId(sessionId) || !RESPONSES.has(response)) {
      return res.status(400).json({ error: 'endpoint, valid sessionId and response (available, unavailable or maybe) are required' });
    }

    // The endpoint-to-player lookup prevents a device inventing replies for
    // another player name. Real authenticated accounts can be added later.
    const subscription = (await load()).find(item => item.subscription?.endpoint === endpoint);
    if (!subscription) return res.status(404).json({ error: 'Subscription not registered' });

    const responses = await loadAvailability(sessionId);
    responses[subscription.label] = { response, respondedAt: new Date().toISOString() };
    await saveAvailability(sessionId, responses);
    return res.status(200).json({ ok: true, label: subscription.label, response, sessionId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
