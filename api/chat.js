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
import { unreadCountForUser } from '../src/chat-notifications.js';
import { DEFAULT_TEAM, resolveSessionFromRequest } from './_identityStore.js';
import { tenantTeamId } from './_tenant.js';

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

// DM participant IDs for removed test accounts (user IDs and legacy player IDs).
export const OBSOLETE_DM_PARTICIPANT_IDS = new Set([
  'player-nick',        'inv-nick1234',
  'player-simon-player','p-simon-player',
  'player-nick-marshall','p-nick-marshall',
  'player-dodsy-compat','p-dodsy-001',
]);

/**
 * Pure filter: remove DM conversations whose participants include an obsolete ID.
 * Group conversations are always kept. Returns a new array — does not mutate input.
 */
export function filterObsoleteDmConversations(convs = []) {
  return (Array.isArray(convs) ? convs : []).filter(conv => {
    const id = String(conv?.id || '');
    if (!id.startsWith('dm:')) return true; // keep groups
    const parts = id.split(':').slice(1);   // ['a', 'b'] from 'dm:a:b'
    return !parts.some(part => OBSOLETE_DM_PARTICIPANT_IDS.has(part));
  });
}

async function getConvs() {
  return (await kvGet(CONVS_KEY())) || [];
}
async function saveConvs(list) {
  return kvSet(CONVS_KEY(), list);
}

// One-time migration: remove obsolete DM conversation list entries.
async function migrateRemoveObsoleteDmConversations() {
  const MIGRATION_KEY = key('migrate:conv-cleanup-v1');
  if (await kvGet(MIGRATION_KEY)) return;
  const convs = await getConvs();
  const filtered = filterObsoleteDmConversations(convs);
  if (filtered.length !== convs.length) await saveConvs(filtered);
  await kvSet(MIGRATION_KEY, { migratedAt: new Date().toISOString() });
}

function sessionRole(sessionContext = {}) {
  return sessionContext?.teamMember?.role || sessionContext?.user?.role || sessionContext?.session?.role || '';
}

function isStaffSession(sessionContext = {}) {
  return ['coach', 'admin'].includes(sessionRole(sessionContext));
}

function conversationTeamId(conversation = {}) {
  return String(conversation?.teamId || DEFAULT_TEAM.id);
}

function sessionMatchesConversationTeam(sessionContext = {}, conversation = {}) {
  if (!sessionContext?.user?.id) return true;
  return tenantTeamId(sessionContext) === conversationTeamId(conversation);
}

function participantIdsForSession(sessionContext = {}) {
  return [
    sessionContext?.user?.id,
    sessionContext?.playerProfile?.userId,
    sessionContext?.playerProfile?.legacyPlayerId,
  ].filter(Boolean).map(String);
}

function conversationParticipants(conversation = {}) {
  return (Array.isArray(conversation?.participants) ? conversation.participants : [])
    .filter(Boolean)
    .map(String);
}

function sessionCanReadConversation(sessionContext, conversation = {}) {
  if (!sessionContext?.user?.id) return true;
  if (!sessionMatchesConversationTeam(sessionContext, conversation)) return false;
  if (isStaffSession(sessionContext)) return true;
  const role = sessionRole(sessionContext);
  const type = String(conversation?.type || '').toUpperCase();
  if (role !== 'player') return false;
  if (['squad', 'announce'].includes(conversation?.id)) return true;
  if (conversation?.id === 'coaching' || type === 'COACHING') return false;
  const participants = conversationParticipants(conversation);
  const actorIds = participantIdsForSession(sessionContext);
  return participants.some(id => actorIds.includes(id));
}

function sessionCanWriteConversation(sessionContext, conversation = {}) {
  if (!sessionContext?.user?.id) return true;
  if (!sessionMatchesConversationTeam(sessionContext, conversation)) return false;
  if (isStaffSession(sessionContext)) return true;
  const role = sessionRole(sessionContext);
  if (role !== 'player') return false;
  const type = String(conversation?.type || '').toUpperCase();
  if (conversation?.id === 'announce' || type === 'ANNOUNCEMENT') return false;
  if (conversation?.id === 'coaching' || type === 'COACHING') return false;
  if (conversation?.id === 'squad' || type === 'GROUP') return true;
  return sessionCanReadConversation(sessionContext, conversation);
}

async function findConversation(convId) {
  const convs = await ensureDefaults();
  return convs.find(c => c.id === convId) || null;
}

async function requireConversationAccess(res, sessionContext, convId, mode = 'read') {
  if (!sessionContext?.user?.id) return true;
  const conversation = await findConversation(convId);
  if (!conversation) {
    err(res, 404, 'Conversation not found');
    return false;
  }
  const allowed = mode === 'write'
    ? sessionCanWriteConversation(sessionContext, conversation)
    : sessionCanReadConversation(sessionContext, conversation);
  if (!allowed) {
    err(res, 403, 'Not authorized for this conversation');
    return false;
  }
  return true;
}

// ─── Ensure default conversations exist ─────────────────────────────
async function ensureDefaults() {
  await migrateRemoveObsoleteDmConversations();
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
async function handleGet(req, res) {
  const url    = new URL(req.url, `http://x`);
  const action = url.searchParams.get('action');
  const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
  const userId = sessionContext?.user?.id || url.searchParams.get('userId') || 'anon';

  // Update presence
  await kvSet(PRESENCE_KEY(userId), { userId, ts: Date.now() }, 60);

  if (action === 'conversations') {
    const convs = await ensureDefaults();
    const visibleConvs = sessionContext?.user?.id
      ? convs.filter(c => sessionCanReadConversation(sessionContext, c))
      : convs;
    // Enrich with last message + unread count per user
    const enriched = await Promise.all(visibleConvs.map(async c => {
      const msgs = await kvLrange(MSGS_KEY(c.id), 0, 0); // last message only
      const last = msgs[0] || null;
      // Unread: messages after this user's last read timestamp
      const readKey = key(`chat:read:${c.id}:${userId}`);
      const lastRead = (await kvGet(readKey)) || 0;
      // Count unread from the retained message window so refresh/login badge
      // state remains consistent even after long gaps between visits.
      const recent = await kvLrange(MSGS_KEY(c.id), 0, 499);
      const unread = unreadCountForUser(recent, userId, lastRead);
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
    if (!(await requireConversationAccess(res, sessionContext, convId, 'read'))) return;
    // LRANGE returns newest-first; we reverse for chronological
    const raw   = await kvLrange(MSGS_KEY(convId), 0, limit - 1);
    const msgs  = raw.reverse(); // oldest first
    const filtered = since > 0 ? msgs.filter(m => m.ts > since) : msgs;
    return ok(res, { messages: filtered, ts: Date.now() });
  }

  if (action === 'typing') {
    const convId = url.searchParams.get('convId');
    if (!convId) return err(res, 400, 'convId required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'read'))) return;
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
async function handlePost(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); }
  catch { return err(res, 400, 'Invalid JSON'); }

  const { action } = body;
  const sessionContext = await resolveSessionFromRequest(req).catch(() => null);
  const sessionUser = sessionContext?.user || null;

  if (action === 'send') {
    let { convId, senderId, senderName, senderRole, text, type = 'TEXT', replyTo = null, mediaUrl = null, mediaType = null, isAutomated = false } = body;
    if (sessionUser?.id) {
      senderId = sessionUser.id;
      senderName = sessionUser.displayName || [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(' ') || sessionUser.name || sessionUser.email || senderId;
      senderRole = sessionUser.role || senderRole;
    }
    if (!convId || !senderId || !text?.trim()) return err(res, 400, 'convId, senderId, text required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'write'))) return;
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
    if (sessionUser?.id) {
      userId = sessionUser.id;
      userName = sessionUser.displayName || [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(' ') || sessionUser.name || sessionUser.email || userId;
    }
    userId = userId || 'anon';
    if (!msgId || !convId || !userId || !emoji) return err(res, 400, 'msgId, convId, userId, emoji required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'read'))) return;
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
    if (sessionUser?.id) userId = sessionUser.id;
    userId = userId || 'anon';
    if (!convId || !userId) return err(res, 400, 'convId, userId required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'read'))) return;
    await kvSet(key(`chat:read:${convId}:${userId}`), Date.now());
    return ok(res, {});
  }

  if (action === 'typing') {
    let { convId, userId, userName, active } = body;
    if (sessionUser?.id) {
      userId = sessionUser.id;
      userName = sessionUser.displayName || [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(' ') || sessionUser.name || sessionUser.email || userId;
    }
    userId = userId || 'anon';
    if (!convId || !userId) return err(res, 400, 'convId, userId required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'read'))) return;
    const current = (await kvGet(TYPING_KEY(convId))) || [];
    const filtered = current.filter(t => t.userId !== userId);
    if (active !== false) filtered.push({ userId, userName: userName || userId, ts: Date.now() });
    await kvSet(TYPING_KEY(convId), filtered, 10); // TTL 10s
    return ok(res, {});
  }

  if (action === 'edit') {
    let { msgId, convId, text, editorId } = body;
    if (sessionUser?.id) editorId = sessionUser.id;
    editorId = editorId || 'anon';
    if (!msgId || !convId || !text?.trim()) return err(res, 400, 'msgId, convId, text required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'write'))) return;
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
    if (sessionUser?.id) deleterId = sessionUser.id;
    deleterId = deleterId || 'anon';
    if (!msgId || !convId) return err(res, 400, 'msgId, convId required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'write'))) return;
    const msgs = await kvLrange(MSGS_KEY(convId), 0, 499);
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx < 0) return err(res, 404, 'Message not found');
    if (msgs[idx].senderId !== deleterId) return err(res, 403, 'Can only delete your own messages');
    msgs[idx] = { ...msgs[idx], isDeleted: true, deletedAt: Date.now(), text: '' };
    await rebuildConvMsgs(convId, msgs);
    return ok(res, {});
  }

  if (action === 'create_conv') {
    if (sessionContext?.user?.id && !isStaffSession(sessionContext)) return err(res, 403, 'Only coaches can create conversations');
    const { id, name, type = 'DIRECT', icon = '💬', description = '', participants = [] } = body;
    const teamId = sessionContext?.user?.id ? tenantTeamId(sessionContext) : DEFAULT_TEAM.id;
    const convId = id || `conv_${Date.now()}`;
    const convs = await getConvs();
    if (!convs.some(c => c.id === convId)) {
      convs.push({ id: convId, teamId, name, type, icon, description, participants, pinned: false, createdAt: Date.now(), lastActivity: Date.now() });
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

  try {
    if (req.method === 'GET')  return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return err(res, 405, 'Method not allowed');
  } catch(e) {
    console.error('chat handler error:', e);
    return err(res, 500, e.message);
  }
}
