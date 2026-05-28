// api/invite.js — Team invite link management
//
// POST { name, role, email? }
//   → creates a single-use invite token stored in Redis
//   → returns { token, url }
//
// GET ?token=xxx
//   → validates token, returns { valid, name, role, status }
//
// GET (no token)
//   → returns full invite list (coach dashboard)
//
// PATCH { token }
//   → marks invite as accepted (called when a player joins via the link)
//
// DELETE { token }
//   → revokes / removes the invite

import { kvGet, kvSet } from './_kv.js';

const INVITES_KEY = 'ce:invites';
const APP_URL     = process.env.APP_URL || 'https://boitsfort-coachseye.vercel.app';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Valid roles — maps to what the joining user will see in the app
const VALID_ROLES = ['player', 'coach', 'admin', 'medical'];

function makeToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: validate token OR list all invites ────────────────────────────────
  if (req.method === 'GET') {
    const token = req.query?.token;

    if (token) {
      // Validate a specific token
      const invites = (await kvGet(INVITES_KEY)) || [];
      const invite  = invites.find(i => i.token === token);
      if (!invite) {
        return res.status(404).json({ valid: false, error: 'Invite not found or expired' });
      }
      if (invite.status === 'revoked') {
        return res.status(410).json({ valid: false, error: 'This invite has been revoked' });
      }
      return res.status(200).json({
        valid:     true,
        token:     invite.token,
        name:      invite.name,
        role:      invite.role,
        email:     invite.email || '',
        status:    invite.status,
        createdAt: invite.createdAt,
      });
    }

    // List all invites
    const invites = (await kvGet(INVITES_KEY)) || [];
    return res.status(200).json({ invites });
  }

  // ── POST: create a new invite ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const { name, role, email } = req.body || {};
    if (!name?.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const normRole = (role || 'player').toLowerCase();
    if (!VALID_ROLES.includes(normRole)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const token  = makeToken();
    const invite = {
      token,
      name:      name.trim(),
      role:      normRole,
      email:     email?.trim() || '',
      status:    'pending',
      createdAt: new Date().toISOString(),
      acceptedAt: null,
    };

    const invites = (await kvGet(INVITES_KEY)) || [];
    invites.unshift(invite);
    // Keep last 200 invites
    const trimmed = invites.slice(0, 200);
    await kvSet(INVITES_KEY, trimmed);

    const url = `${APP_URL}/?inv=${token}`;
    console.log(`[invite] Created ${normRole} invite for "${name.trim()}" — ${token}`);

    return res.status(201).json({ ok: true, token, url, invite });
  }

  // ── PATCH: mark invite as accepted ────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    const invites = (await kvGet(INVITES_KEY)) || [];
    const idx     = invites.findIndex(i => i.token === token);
    if (idx < 0) return res.status(404).json({ error: 'Invite not found' });

    invites[idx].status     = 'accepted';
    invites[idx].acceptedAt = new Date().toISOString();
    await kvSet(INVITES_KEY, invites);

    console.log(`[invite] Accepted: ${invites[idx].name} (${invites[idx].role})`);
    return res.status(200).json({ ok: true, invite: invites[idx] });
  }

  // ── DELETE: revoke an invite ───────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });

    const invites = (await kvGet(INVITES_KEY)) || [];
    const idx     = invites.findIndex(i => i.token === token);
    if (idx < 0) return res.status(404).json({ error: 'Invite not found' });

    // Soft-revoke (keep record for audit, just change status)
    invites[idx].status = 'revoked';
    await kvSet(INVITES_KEY, invites);

    console.log(`[invite] Revoked: ${invites[idx].name} (${invites[idx].role})`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
