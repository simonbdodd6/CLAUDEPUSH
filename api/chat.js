// api/chat.js — Unified WhatsApp-style messaging API
// GET  /api/chat?action=conversations&userId=X   → list conversations
// GET  /api/chat?action=messages&convId=X&since=TS → messages (newest last)
// POST /api/chat  { action:'send', convId, senderId, senderName, text, type, replyTo }
// POST /api/chat  { action:'react', msgId, convId, userId, userName, emoji }
// POST /api/chat  { action:'typing', convId, userId, userName }
// POST /api/chat  { action:'read', convId, userId }
// POST /api/chat  { action:'delete', msgId, convId }
// POST /api/chat  { action:'edit', msgId, convId, text }

import { kvGet, kvSet, kvLpush, kvLrange, kvLtrim } from './_kv.js';
import { key } from './_keys.js';
import { requireAuth } from './_auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function ok(res, data) {
  res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, ...data }));
}
function err(res, status, msg) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: msg }));
}

// ─── Key helpers ────────────────────────────────────────────────────
const CONVS_KEY     = () => key('chat:convs');          // JSON array of conv objects
const CONV_KEY      = (id) => key(`chat:conv:${id}`);   // single conv metadata
const MSGS_KEY      = (id) => key(`chat:conv:${id}:msgs`); // Redis list
const TYPING_KEY    = (id) => key(`chat:conv:${id}:typing`);
const PRESENCE_KEY  = (u)  => key(`chat:presence:${u}`);

async function getConvs() {
  return (await kvGet(CONVS_KEY())) || [];
}
async function saveConvs(list) {
  return kvSet(CONVS_KEY(), list);
}

// ─── Ensure default conversations exist ─────────────────────────────
async function ensureDefaults() {
  const convs = await getConvs();
  if (convs.some(c => c.id === 'squad')) return convs;
  const defaults = [
    { id: 'squad',    name: 'Squad',           type: 'GROUP',        icon: '🏉', description: 'All squad members & coaches', pinned: true, createdAt: Date.now() },
    { id: 'coaching', name: 'Coaching Team',   type: 'GROUP',        icon: '📋', description: 'Coaches only', pinned: true, createdAt: Date.now() },
    { id: 'announce', name: 'Announcements',   type: 'ANNOUNCEMENT', icon: '📢', description: 'Coach broadcasts — read only for players', pinned: true, createdAt: Date.now() },
  ];
  const merged = [...defaults, ...convs.filter(c => !defaults.some(d => d.id === c.id))];
  await saveConvs(merged);
  return merged;
}

// ─── GET handler ────────────────────────────────────────────────────
async function handleGet(req, res, auth) {
  const url    = new URL(req.url, `http://x`);
  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('userId') || auth.uid;

  // Update presence
  await kvSet(PRESENCE_KEY(userId), { userId, ts: Date.now() }, 60);

  if (action === 'conversations') {
    const convs = await ensureDefaults();
    // Enrich with last message + unread count per user
    const enriched = await Promise.all(convs.map(async c => {
      const msgs = await kvLrange(MSGS_KEY(c.id), 0, 0); // last message only
      const last = msgs[0] || null;
      // Unread: messages after this user's last read timestamp
      const readKey = key(`chat:read:${c.id}:${userId}`);
      const lastRead = (await kvGet(readKey)) || 0;
      // Count unread — read last 30 msgs and count newer than lastRead that aren't from this user
      const recent = await kvLrange(MSGS_KEY(c.id), 0, 29);
      const unread = recent.filter(m => m.ts > lastRead && m.senderId !== userId && !m.isDeleted).length;
      return { ...c, lastMessage: last, unread, lastActivity: last?.ts || c.createdAt };
    }));
    // Sort: pinned first, then by lastActivity
    enriched.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.lastActivity || 0) - (a.lastActivity || 0);
    });
    return ok(res, { conversations: enriched });
  }

  if (action === 'messages') {
    const convId = url.searchParams.get('convId');
    const since  = parseInt(url.searchParams.get('since') || '0', 10);
    const limit  = parseInt(url.searchParams.get('limit') || '60', 10);
    if (!convId) return err(res, 400, 'convId required');
    // LRANGE returns newest-first; we reverse for chronological
    const raw   = await kvLrange(MSGS_KEY(convId), 0, limit - 1);
    const msgs  = raw.reverse(); // oldest first
    const filtered = since > 0 ? msgs.filter(m => m.ts > since) : msgs;
    return ok(res, { messages: filtered, ts: Date.now() });
  }

  if (action === 'typing') {
    const convId = url.searchParams.get('convId');
    if (!convId) return err(res, 400, 'convId required');
    const raw = await kvGet(TYPING_KEY(convId));
    const now = Date.now();
    const active = (raw || []).filter(t => now - t.ts < 5000); // 5s window
    return ok(res, { typing: active.filter(t => t.userId !== userId) });
  }

  if (action === 'presence') {
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
    const now = Date.now();
    const presence = await Promise.all(ids.map(async id => {
      const p = await kvGet(PRESENCE_KEY(id));
      const online = p && (now - p.ts < 60000); // online if seen in last 60s
      return { userId: id, online, lastSeen: p?.ts || null };
    }));
    return ok(res, { presence });
  }

  return err(res, 400, 'Unknown action');
}

// ─── POST handler ────────────────────────────────────────────────────
async function handlePost(req, res, auth) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); }
  catch { return err(res, 400, 'Invalid JSON'); }

  const { action } = body;

  if (action === 'send') {
    let { convId, senderId, senderName, senderRole, text, type = 'TEXT', replyTo = null, mediaUrl = null, mediaType = null, isAutomated = false } = body;
    senderId = senderId || auth.uid;
    if (senderId !== auth.uid) return err(res, 403, 'Sender must match authenticated user');
    if (!convId || !senderId || !text?.trim()) return err(res, 400, 'convId, senderId, text required');
    const msg = {
      id:          `msg_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      convId, senderId, senderName: senderName || senderId,
      senderRole:  senderRole || 'player',
      text:        text.trim(),
      type,
      replyTo,     // { id, senderName, text } or null
      mediaUrl, mediaType,
      isAutomated,
      reactions:   {},  // { emoji: [{ userId, userName }] }
      isEdited:    false,
      isDeleted:   false,
      ts:          Date.now(),
    };
    await kvLpush(MSGS_KEY(convId), msg);
    await kvLtrim(MSGS_KEY(convId), 500); // keep last 500 messages
    // Update conv last activity
    const convs = await getConvs();
    const idx = convs.findIndex(c => c.id === convId);
    if (idx >= 0) { convs[idx].lastActivity = msg.ts; await saveConvs(convs); }
    // Mark sender as read
    await kvSet(key(`chat:read:${convId}:${senderId}`), msg.ts);
    return ok(res, { message: msg });
  }

  if (action === 'react') {
    let { msgId, convId, userId, userName, emoji } = body;
    userId = userId || auth.uid;
    if (userId !== auth.uid) return err(res, 403, 'User must match authenticated user');
    if (!msgId || !convId || !userId || !emoji) return err(res, 400, 'msgId, convId, userId, emoji required');
    const msgs = await kvLrange(MSGS_KEY(convId), 0, 499);
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx < 0) return err(res, 404, 'Message not found');
    const msg = msgs[idx];
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const existing = msg.reactions[emoji].findIndex(r => r.userId === userId);
    if (existing >= 0) {
      msg.reactions[emoji].splice(existing, 1); // toggle off
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push({ userId, userName });
    }
    msgs[idx] = msg;
    // Rewrite list (expensive but necessary for edits)
    // Use a SET approach via kvSet on a dedicated msg key
    await kvSet(key(`chat:msg:${msgId}`), msg);
    // Also update in the list
    await rebuildConvMsgs(convId, msgs);
    return ok(res, { message: msg });
  }

  if (action === 'read') {
    let { convId, userId } = body;
    userId = userId || auth.uid;
    if (!convId || !userId) return err(res, 400, 'convId, userId required');
    if (userId !== auth.uid) return err(res, 403, 'User must match authenticated user');
    await kvSet(key(`chat:read:${convId}:${userId}`), Date.now());
    return ok(res, {});
  }

  if (action === 'typing') {
    let { convId, userId, userName, active } = body;
    userId = userId || auth.uid;
    if (!convId || !userId) return err(res, 400, 'convId, userId required');
    if (userId !== auth.uid) return err(res, 403, 'User must match authenticated user');
    const current = (await kvGet(TYPING_KEY(convId))) || [];
    const filtered = current.filter(t => t.userId !== userId);
    if (active !== false) filtered.push({ userId, userName: userName || userId, ts: Date.now() });
    await kvSet(TYPING_KEY(convId), filtered, 10); // TTL 10s
    return ok(res, {});
  }

  if (action === 'edit') {
    let { msgId, convId, text, editorId } = body;
    editorId = editorId || auth.uid;
    if (!msgId || !convId || !text?.trim()) return err(res, 400, 'msgId, convId, text required');
    const msgs = await kvLrange(MSGS_KEY(convId), 0, 499);
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx < 0) return err(res, 404, 'Message not found');
    if (msgs[idx].senderId !== editorId) return err(res, 403, 'Can only edit your own messages');
    msgs[idx] = { ...msgs[idx], text: text.trim(), isEdited: true, editedAt: Date.now() };
    await rebuildConvMsgs(convId, msgs);
    return ok(res, { message: msgs[idx] });
  }

  if (action === 'delete') {
    let { msgId, convId, deleterId } = body;
    deleterId = deleterId || auth.uid;
    if (!msgId || !convId) return err(res, 400, 'msgId, convId required');
    const msgs = await kvLrange(MSGS_KEY(convId), 0, 499);
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx < 0) return err(res, 404, 'Message not found');
    if (msgs[idx].senderId !== deleterId) return err(res, 403, 'Can only delete your own messages');
    msgs[idx] = { ...msgs[idx], isDeleted: true, deletedAt: Date.now(), text: '' };
    await rebuildConvMsgs(convId, msgs);
    return ok(res, {});
  }

  if (action === 'create_conv') {
    const { id, name, type = 'DIRECT', icon = '💬', description = '', participants = [] } = body;
    const convId = id || `conv_${Date.now()}`;
    const convs = await getConvs();
    if (!convs.some(c => c.id === convId)) {
      convs.push({ id: convId, name, type, icon, description, participants, pinned: false, createdAt: Date.now(), lastActivity: Date.now() });
      await saveConvs(convs);
    }
    return ok(res, { convId });
  }

  return err(res, 400, 'Unknown action');
}

// Rebuild the Redis list (needed for edits/deletes — newest first)
async function rebuildConvMsgs(convId, msgs) {
  const k = MSGS_KEY(convId);
  // Delete and re-push in reverse (oldest first so LPUSH makes newest first)
  // Using pipelining isn't available, so we do sequential operations
  // For simplicity, store as a single JSON value for small-ish convs
  // Then switch to list when > threshold
  // Actually: just re-write the entire list using a temp key approach
  // Simplest: iterate and lpush in reverse order (oldest → newest via lpush = newest on top)
  // First delete the key
  const { default: redis } = await import('./_kv.js');
  try {
    // Delete old list
    const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
    const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (REDIS_URL && REDIS_TOKEN) {
      // Delete and repopulate
      await fetch(REDIS_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['DEL', k]),
      });
      // lpush all in order from oldest to newest (so newest ends up at index 0)
      for (const m of msgs) {
        await kvLpush(k, m);
      }
    }
  } catch(e) { /* best effort */ }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end(); return;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET')  return await handleGet(req, res, auth);
    if (req.method === 'POST') return await handlePost(req, res, auth);
    return err(res, 405, 'Method not allowed');
  } catch(e) {
    console.error('chat handler error:', e);
    return err(res, 500, e.message);
  }
}
