// api/chat.js — Unified WhatsApp-style messaging API
// GET  /api/chat?action=conversations&userId=X   → list conversations
// GET  /api/chat?action=messages&convId=X&since=TS → messages (newest last)
// POST /api/chat  { action:'send', convId, senderId, senderName, text, type, replyTo }
// POST /api/chat  { action:'react', msgId, convId, userId, userName, emoji }
// POST /api/chat  { action:'typing', convId, userId, userName }
// POST /api/chat  { action:'read', convId, userId }
// POST /api/chat  { action:'delete', msgId, convId }
// POST /api/chat  { action:'edit', msgId, convId, text }

import webpush from 'web-push';
import { kvGet, kvSet, kvLpush, kvLrange, kvLtrim } from './_kv.js';
import { key } from './_keys.js';
import { unreadCountForUser } from '../src/chat-notifications.js';
import { DEFAULT_TEAM, resolveSessionFromRequest, loadHealedPlayerProfiles } from './_identityStore.js';
import { tenantTeamId } from './_tenant.js';
import { load as loadSubs, save as saveSubs } from './_lib.js';
import { setCors, vapidContact, notificationUrl } from './_http.js';

function configurePush() {
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(vapidContact(), publicKey, privateKey);
  return true;
}

// convId: 'dm:A:B', senderId: session user ID (may differ from convId participants)
async function sendDmPush(convId, senderId, senderDisplayName, text) {
  if (!configurePush()) {
    console.warn('[DM push] VAPID keys not configured — push skipped');
    return;
  }

  const [allSubs, profiles] = await Promise.all([
    loadSubs(),
    kvGet(key('identity:player_profiles')).then(v => Array.isArray(v) ? v : []),
  ]);

  // Expand sender's ID aliases via player profiles so we can exclude the right participant.
  const senderIds = new Set([senderId]);
  profiles.forEach(p => {
    const pL = String(p.legacyPlayerId || '');
    const pU = String(p.userId || '');
    if ((pL && (pL === senderId || senderIds.has(pL))) || (pU && (pU === senderId || senderIds.has(pU)))) {
      if (pL) senderIds.add(pL);
      if (pU) senderIds.add(pU);
    }
  });

  const participants = convId.split(':').slice(1);
  const recipientId = participants.find(p => !senderIds.has(p));
  if (!recipientId) {
    console.error(`[DM push] cannot determine recipient — convId=${convId} senderIds=[${[...senderIds].join(', ')}]`);
    return;
  }

  // Expand recipient's ID aliases via player profiles.
  const recipientIds = new Set([recipientId]);
  profiles.forEach(p => {
    const pL = String(p.legacyPlayerId || '');
    const pU = String(p.userId || '');
    if ((pL && pL === recipientId) || (pU && pU === recipientId)) {
      if (pL) recipientIds.add(pL);
      if (pU) recipientIds.add(pU);
    }
  });

  const targets = allSubs.filter(sub => {
    const checked = [String(sub.userId || ''), String(sub.playerId || ''), String(sub.legacyPlayerId || '')];
    return checked.some(v => v && recipientIds.has(v));
  });

  if (!targets.length) {
    console.error(`[DM push] 0 targets matched — recipientIds=[${[...recipientIds].join(', ')}] subs=[${allSubs.map(s => s.userId || s.playerId || '?').join(', ')}]`);
    return;
  }

  const payload = JSON.stringify({
    title: senderDisplayName,
    body:  String(text || '').slice(0, 200),
    tag:   `dm-${recipientId}`,
    url:   notificationUrl('dm'),
    type:  'dm',
  });

  const results = await Promise.allSettled(
    targets.map(({ subscription }) => webpush.sendNotification(subscription, payload))
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const t = targets[i];
      console.warn(`[DM push] send failed — status=${r.reason?.statusCode} msg="${r.reason?.message}" userId=${t.userId}`);
    }
  });

  const expired = new Set(
    results.flatMap((r, i) =>
      r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode)
        ? [targets[i].subscription.endpoint] : []
    )
  );
  if (expired.size) {
    await saveSubs(allSubs.filter(s => !expired.has(s.subscription.endpoint)));
  }
}

function ok(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, ...data }));
}
function err(res, status, msg) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: msg }));
}

// ─── Key helpers ────────────────────────────────────────────────────
const CONVS_KEY     = () => key('chat:convs');          // JSON array of conv objects
const CONV_KEY      = (id) => key(`chat:conv:${id}`);   // single conv metadata
const MSGS_KEY      = (id) => key(`chat:conv:${id}:msgs`); // Redis list
const TYPING_KEY    = (id) => key(`chat:conv:${id}:typing`);
const PRESENCE_KEY  = (u)  => key(`chat:presence:${u}`);

// RC4.9A — the built-in channels (squad / coaching / announce) are PER-CLUB.
// The client protocol keeps the plain ids; STORAGE (messages, read markers,
// typing) is scoped to the session's club via `<id>@<teamId>`. The default
// club keeps the legacy flat keys so existing beta messages survive unchanged.
// Before this, the built-ins were one global room: any club's members could
// read and write every other club's squad messages.
const BUILTIN_CONV_IDS = new Set(['squad', 'coaching', 'announce']);
function storageConvId(sessionContext, convId) {
  const id = String(convId || '');
  if (!BUILTIN_CONV_IDS.has(id)) return id;
  const teamId = tenantTeamId(sessionContext) || DEFAULT_TEAM.id;
  return teamId === DEFAULT_TEAM.id ? id : `${id}@${teamId}`;
}

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
  // Built-in global conversations (squad / coaching / announce) carry NO teamId and
  // are shared app-wide — they must be reachable by any authenticated session, not
  // locked to DEFAULT_TEAM. Only conversations with an EXPLICIT teamId (DMs and
  // custom groups, set at create_conv) stay club-scoped.
  // Fix: conversationTeamId() previously defaulted the built-ins to DEFAULT_TEAM.id
  // ('boitsfort-rfc'), which 403'd the squad channel for EVERY coach/player whose
  // team wasn't the default — even before the staff bypass ran.
  if (!conversation?.teamId) return true;
  return tenantTeamId(sessionContext) === String(conversation.teamId);
}

export function participantIdsForSession(sessionContext = {}) {
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

// Expand participant ids to every alias that resolves to the same person by
// following userId <-> legacyPlayerId links across player profiles (to a fixed
// point). Mirrors the sender/recipient expansion in sendDmPush so the DM READ
// gate is exactly as tolerant as push targeting. Pure and additive-only.
export function expandParticipantAliases(seedIds = [], profiles = []) {
  const ids = new Set((Array.isArray(seedIds) ? seedIds : []).map(String).filter(Boolean));
  const list = Array.isArray(profiles) ? profiles : [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of list) {
      const pL = String(p?.legacyPlayerId || '');
      const pU = String(p?.userId || '');
      if ((pL && ids.has(pL)) || (pU && ids.has(pU))) {
        if (pL && !ids.has(pL)) { ids.add(pL); changed = true; }
        if (pU && !ids.has(pU)) { ids.add(pU); changed = true; }
      }
    }
  }
  return [...ids];
}

// Beta identity normalization (Option A): a session's chat read-access / unread id
// set is EXACTLY its authenticated userId. Previously this expanded by email match
// and by the userId↔legacyPlayerId profile alias graph, which let accounts sharing
// an email (or a shared/aliased legacy id) inherit each other's DM threads and
// unread — the cross-account bleed behind the "Simon Coach / Simon2Coach" confusion
// and the phantom 9+ counts. Now one account = one messaging identity, full stop.
async function actorIdsForSession(sessionContext) {
  const uid = String(sessionContext?.user?.id || '').trim();
  return uid ? [uid] : [];
}

// A conversation is a DIRECT message when it is typed DIRECT or keyed under the
// dm: namespace. DMs are PRIVATE to their participants; group/team/system channels
// (squad, coaching, announce, custom groups) are not.
function conversationIsDirect(conversation = {}) {
  const type = String(conversation?.type || '').toUpperCase();
  return type === 'DIRECT' || String(conversation?.id || '').startsWith('dm:');
}

function sessionIsConversationParticipant(sessionContext, conversation = {}, actorIds = null) {
  const participants = conversationParticipants(conversation);
  const ids = Array.isArray(actorIds) ? actorIds : participantIdsForSession(sessionContext);
  return participants.some(id => ids.includes(id));
}

export function sessionCanReadConversation(sessionContext, conversation = {}, actorIds = null) {
  if (!sessionContext?.user?.id) return true;
  if (!sessionMatchesConversationTeam(sessionContext, conversation)) return false;
  if (isStaffSession(sessionContext)) {
    // Staff may access all GROUP / TEAM / SYSTEM channels (squad, coaching, announce,
    // custom groups). Direct messages stay PRIVATE: a coach only sees a DM they are
    // actually a participant of — never another coach's DM or a player-to-player DM.
    // Previously staff returned true unconditionally, which leaked every DM in the club
    // into a coach's conversation list and counted the whole backlog as that coach's own
    // unread (the "Simon2Coach 9+" phantom + wrong row previews).
    return conversationIsDirect(conversation)
      ? sessionIsConversationParticipant(sessionContext, conversation, actorIds)
      : true;
  }
  const role = sessionRole(sessionContext);
  const type = String(conversation?.type || '').toUpperCase();
  if (role !== 'player') return false;
  if (['squad', 'announce'].includes(conversation?.id)) return true;
  if (conversation?.id === 'coaching' || type === 'COACHING') return false;
  return sessionIsConversationParticipant(sessionContext, conversation, actorIds);
}

function sessionCanWriteConversation(sessionContext, conversation = {}, actorIds = null) {
  if (!sessionContext?.user?.id) return true;
  if (!sessionMatchesConversationTeam(sessionContext, conversation)) return false;
  if (isStaffSession(sessionContext)) {
    // Mirror the read rule: staff can post to any group/team/system channel, but a DM
    // is writable only by its participants — a coach cannot post into another coach's
    // or two players' private thread.
    return conversationIsDirect(conversation)
      ? sessionIsConversationParticipant(sessionContext, conversation, actorIds)
      : true;
  }
  const role = sessionRole(sessionContext);
  if (role !== 'player') return false;
  const type = String(conversation?.type || '').toUpperCase();
  if (conversation?.id === 'announce' || type === 'ANNOUNCEMENT') return false;
  if (conversation?.id === 'coaching' || type === 'COACHING') return false;
  // A player may post to the open 'squad' channel. For ANY other group (or DM),
  // write access must be no broader than READ access — the player must be a
  // participant. Previously any type==='GROUP' was unconditionally writable, which
  // let a player post into a coach-created group they could not even read.
  if (conversation?.id === 'squad') return true;
  return sessionCanReadConversation(sessionContext, conversation, actorIds);
}

async function findConversation(convId) {
  const convs = await ensureDefaults();
  return convs.find(c => c.id === convId) || null;
}

async function requireConversationAccess(res, sessionContext, convId, mode = 'read') {
  if (!sessionContext?.user?.id) {
    err(res, 401, 'Authentication required');
    return false;
  }
  const conversation = await findConversation(convId);
  if (!conversation) {
    err(res, 404, 'Conversation not found');
    return false;
  }
  const actorIds = await actorIdsForSession(sessionContext);
  const allowed = mode === 'write'
    ? sessionCanWriteConversation(sessionContext, conversation, actorIds)
    : sessionCanReadConversation(sessionContext, conversation, actorIds);
  if (!allowed) {
    err(res, 403, 'Not authorized for this conversation');
    return false;
  }
  return true;
}

// ─── Ensure default conversations exist ─────────────────────────────
async function ensureDefaults() {
  // Always filter obsolete DMs — idempotent, no migration flag needed.
  const raw = await getConvs();
  const convs = filterObsoleteDmConversations(raw);
  if (convs.length !== raw.length) await saveConvs(convs);
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
    if (!sessionContext?.user?.id) return err(res, 401, 'Authentication required');
    const convs = await ensureDefaults();
    const actorIds = await actorIdsForSession(sessionContext);
    const visibleConvs = convs.filter(c => sessionCanReadConversation(sessionContext, c, actorIds));
    // Enrich with last message + unread count per user
    const enriched = await Promise.all(visibleConvs.map(async c => {
      const sid = storageConvId(sessionContext, c.id);
      const msgs = await kvLrange(MSGS_KEY(sid), 0, 0); // last message only
      const last = msgs[0] || null;
      // Unread: messages after this user's last read timestamp
      const readKey = key(`chat:read:${sid}:${userId}`);
      const lastRead = (await kvGet(readKey)) || 0;
      // Count unread from the retained message window so refresh/login badge
      // state remains consistent even after long gaps between visits.
      const recent = await kvLrange(MSGS_KEY(sid), 0, 499);
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
    const raw   = await kvLrange(MSGS_KEY(storageConvId(sessionContext, convId)), 0, limit - 1);
    const msgs  = raw.reverse(); // oldest first
    const filtered = since > 0 ? msgs.filter(m => m.ts > since) : msgs;
    return ok(res, { messages: filtered, ts: Date.now() });
  }

  if (action === 'typing') {
    const convId = url.searchParams.get('convId');
    if (!convId) return err(res, 400, 'convId required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'read'))) return;
    const raw = await kvGet(TYPING_KEY(storageConvId(sessionContext, convId)));
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
  // Vercel's Node runtime parses JSON bodies eagerly into req.body and consumes
  // the request stream, so reading the raw stream here yields '' and every send
  // failed with "Invalid JSON" in deployed environments. Prefer the pre-parsed
  // body; fall back to the raw stream for plain-Node harnesses that provide one.
  let body;
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); }
      catch { return err(res, 400, 'Invalid JSON'); }
    } else {
      body = req.body;
    }
  } else {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { return err(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return err(res, 400, 'Invalid JSON');

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
    const sendSid = storageConvId(sessionContext, convId);
    await kvLpush(MSGS_KEY(sendSid), msg);
    await kvLtrim(MSGS_KEY(sendSid), 500); // keep last 500 messages
    // Update conv last activity
    const convs = await getConvs();
    const idx = convs.findIndex(c => c.id === convId);
    if (idx >= 0) { convs[idx].lastActivity = msg.ts; await saveConvs(convs); }
    // Mark sender as read
    await kvSet(key(`chat:read:${sendSid}:${senderId}`), msg.ts);
    // Await push before responding — serverless functions terminate after res.end()
    // so fire-and-forget does not work; the async operation is abandoned.
    if (convId.startsWith('dm:') && !isAutomated) {
      await sendDmPush(convId, senderId, msg.senderName, msg.text).catch(e => {
        console.error('[DM push] top-level error:', e?.message);
      });
    }
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
    const reactSid = storageConvId(sessionContext, convId);
    const msgs = await kvLrange(MSGS_KEY(reactSid), 0, 499);
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
    await rebuildConvMsgs(reactSid, msgs);
    return ok(res, { message: msg });
  }

  if (action === 'read') {
    let { convId, userId } = body;
    if (sessionUser?.id) userId = sessionUser.id;
    userId = userId || 'anon';
    if (!convId || !userId) return err(res, 400, 'convId, userId required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'read'))) return;
    await kvSet(key(`chat:read:${storageConvId(sessionContext, convId)}:${userId}`), Date.now());
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
    const typingSid = storageConvId(sessionContext, convId);
    const current = (await kvGet(TYPING_KEY(typingSid))) || [];
    const filtered = current.filter(t => t.userId !== userId);
    if (active !== false) filtered.push({ userId, userName: userName || userId, ts: Date.now() });
    await kvSet(TYPING_KEY(typingSid), filtered, 10); // TTL 10s
    return ok(res, {});
  }

  if (action === 'edit') {
    let { msgId, convId, text, editorId } = body;
    if (sessionUser?.id) editorId = sessionUser.id;
    editorId = editorId || 'anon';
    if (!msgId || !convId || !text?.trim()) return err(res, 400, 'msgId, convId, text required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'write'))) return;
    const editSid = storageConvId(sessionContext, convId);
    const msgs = await kvLrange(MSGS_KEY(editSid), 0, 499);
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx < 0) return err(res, 404, 'Message not found');
    if (msgs[idx].senderId !== editorId) return err(res, 403, 'Can only edit your own messages');
    msgs[idx] = { ...msgs[idx], text: text.trim(), isEdited: true, editedAt: Date.now() };
    await rebuildConvMsgs(editSid, msgs);
    return ok(res, { message: msgs[idx] });
  }

  if (action === 'delete') {
    let { msgId, convId, deleterId } = body;
    if (sessionUser?.id) deleterId = sessionUser.id;
    deleterId = deleterId || 'anon';
    if (!msgId || !convId) return err(res, 400, 'msgId, convId required');
    if (!(await requireConversationAccess(res, sessionContext, convId, 'write'))) return;
    const delSid = storageConvId(sessionContext, convId);
    const msgs = await kvLrange(MSGS_KEY(delSid), 0, 499);
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx < 0) return err(res, 404, 'Message not found');
    if (msgs[idx].senderId !== deleterId) return err(res, 403, 'Can only delete your own messages');
    msgs[idx] = { ...msgs[idx], isDeleted: true, deletedAt: Date.now(), text: '' };
    await rebuildConvMsgs(delSid, msgs);
    return ok(res, {});
  }

  if (action === 'create_conv') {
    if (!sessionContext?.user?.id) return err(res, 401, 'Authentication required');
    const { id, name, type = 'DIRECT', icon = '💬', description = '', participants = [] } = body;
    const convType = String(type || 'DIRECT').toUpperCase();
    // '@' is reserved for the per-club storage scoping of built-in channels —
    // a forged id like 'squad@<otherTeamId>' must never become a conversation.
    if (String(id || '').includes('@')) return err(res, 400, "Conversation id cannot contain '@'");

    if (!isStaffSession(sessionContext)) {
      // Players may only create DIRECT conversations that include themselves.
      if (convType !== 'DIRECT') return err(res, 403, 'Players can only create direct conversations');
      const actorIds = participantIdsForSession(sessionContext);
      const isSelfParticipant = (Array.isArray(participants) ? participants : [])
        .some(p => actorIds.includes(String(p || '')));
      if (!isSelfParticipant) return err(res, 403, 'Players can only create conversations they participate in');
      // Prevent DM id spoofing: a player-created DIRECT conversation's id must embed
      // the creator, so a player cannot pre-create/hijack a dm:X:Y conversation
      // between two OTHER members (which they could then read as a listed
      // participant). Every legitimate client id is dm:sorted(me, other).
      const dmParts = String(id || '').split(':').slice(1);
      if (String(id || '').startsWith('dm:') && !dmParts.some(p => actorIds.includes(String(p)))) {
        return err(res, 403, 'Conversation id must include the creator');
      }
    }

    const teamId = tenantTeamId(sessionContext);
    const convId = id || `conv_${Date.now()}`;
    const convs = await getConvs();
    if (!convs.some(c => c.id === convId)) {
      convs.push({ id: convId, teamId, name, type: convType, icon, description, participants, pinned: false, createdAt: Date.now(), lastActivity: Date.now() });
      await saveConvs(convs);
    }
    return ok(res, { convId });
  }

  return err(res, 400, 'Unknown action');
}

// Rebuild the Redis message list after an in-place edit / react / delete.
//
// ORDERING: callers pass `msgs` NEWEST-first (exactly as kvLrange 0..N returns it).
// The stored list must stay newest-first (index 0 = newest, matching the send-path
// LPUSH and the `messages` GET which reverses for display). LPUSH prepends, so to end
// up newest-at-index-0 we must LPUSH oldest→newest — i.e. iterate the array REVERSED.
// (Previously it iterated newest→oldest, silently inverting the whole conversation on
// every edit/react/delete.)
//
// ATOMICITY: build the new list under a unique TEMP key, then swap it onto the live
// key with a single atomic RENAME. A failure mid-build leaves the ORIGINAL list
// untouched (RENAME never runs) — eliminating the previous DEL-then-partial-repush
// window that could truncate or wipe a conversation on a mid-loop crash. (Upstash REST
// exposes no MULTI here, so temp-key + RENAME is the smallest safe primitive.)
async function rebuildConvMsgs(convId, msgs) {
  const k = MSGS_KEY(convId);
  const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!REDIS_URL || !REDIS_TOKEN) return;
  // Unique per call so two concurrent rebuilds can't clobber each other's temp list.
  const tmp = `${k}:rebuild:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const rawCmd = (cmd) => fetch(REDIS_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  }).then(r => { if (!r.ok) throw new Error(`redis ${cmd[0]} → ${r.status}`); return r; });
  try {
    if (!msgs.length) { await rawCmd(['DEL', k]); return; }  // nothing left → clear the live list
    // kvLpush serialises with JSON.stringify, matching kvLrange's parse on read.
    for (const m of [...msgs].reverse()) await kvLpush(tmp, m);
    await rawCmd(['RENAME', tmp, k]);  // atomic swap onto the live key
  } catch(e) {
    console.error('[rebuildConvMsgs] failed for', convId, ':', e?.message);
    // Best-effort cleanup of the orphaned temp key; never mask the original error.
    await rawCmd(['DEL', tmp]).catch(() => {});
    throw e;
  }
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
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
