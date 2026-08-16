/**
 * MESSAGING REPAIR — channel push, presence hardening, phantom-DM gate.
 *
 *  PUSH — messages to squad/announce/coaching/group:<gid> persisted but
 *  never notified anyone (push fired only for dm:). The audience is now
 *  resolved SERVER-side (channelPushRecipientIds) with the same standing
 *  rules the read gates use; the sender is excluded; persistence always
 *  precedes push and push failure is swallowed.
 *
 *  PRESENCE — was unauthenticated and stamped a client-chosen userId; now
 *  session-only writes, authenticated same-club reads.
 *
 *  DM CREATION — every creator, staff included, must be a participant of a
 *  DIRECT conversation they create (the dm: id shape can't dodge it).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.push-hardening.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.VAPID_PUBLIC_KEY;          // push unconfigured: dispatch is a no-op,
delete process.env.VAPID_PRIVATE_KEY;         // which is exactly the failure-path test bed

const kv = new Map();
const lists = new Map();
const rangeList = (l, s, e) => l.slice(Number(s), (Number(e) < 0 ? l.length + Number(e) : Number(e)) + 1);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = rangeList(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM') { lists.set(args[0], rangeList(lists.get(args[0]) || [], args[1], args[2])); result = 'OK'; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const chat = await import('../api/chat.js');
const { default: chatHandler, channelPushRecipientIds } = chat;
const store = await import('../api/_identityStore.js');

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const MEMBERS = [
  { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-flor', teamId: CLUB, userId: 'u-flor', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
  { id: 'm-u18c', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
  { id: 'm-sen1', teamId: CLUB, userId: 'u-sen1', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18p', teamId: CLUB, userId: 'u-u18p', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-womp', teamId: CLUB, userId: 'u-womp', role: 'player', status: 'active', playerGroupId: WOM },
  { id: 'm-med', teamId: CLUB, userId: 'u-med', role: 'medical', status: 'active' },
];

function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:player_profiles', JSON.stringify(MEMBERS.filter(m => m.role === 'player')
    .map(m => ({ teamId: CLUB, userId: m.userId, legacyPlayerId: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'general', status: 'active' },
      { id: WOM, name: "Women's", type: 'general', status: 'active' },
    ],
    teams: [{ id: 'team_initial', groupId: SEN, name: 'Premier development', status: 'active' }] }));
  kv.set('app:chat:convs', JSON.stringify([
    { id: 'squad', name: 'Squad', type: 'GROUP', pinned: true, createdAt: 1 },
    { id: 'coaching', name: 'Coaching Team', type: 'GROUP', pinned: true, createdAt: 1 },
    { id: 'announce', name: 'Announcements', type: 'ANNOUNCEMENT', pinned: true, createdAt: 1 },
    { id: `group:${U18}`, name: 'U18 players', type: 'GROUP', teamId: CLUB, groupId: U18, createdAt: 2 },
  ]));
}
const sessionFor = (userId, role) => store.createSession({ userId, teamId: CLUB, role });
async function call(method, urlQs, body, token) {
  const res = {
    code: 0, body: null,
    writeHead(c) { this.code = c; return this; },
    end(b) { if (b !== undefined) this.body = JSON.parse(b); return this; },
    setHeader() {},
  };
  await chatHandler({ method, url: `/api/chat${urlQs}`, headers: { cookie: token ? `ce_session=${token}` : '' },
    body: body || undefined, on() {} }, res);
  return res;
}
async function sessionCtxFor(userId, role) {
  const s = await sessionFor(userId, role);
  const { resolveSessionFromRequest } = store;
  return resolveSessionFromRequest({ headers: { cookie: `ce_session=${s.token}` } });
}

// ── PUSH AUDIENCE (server-resolved, real membership store) ────────────────
test('U18 group channel: audience is U18 players + staff operating U18 (Simon club-wide, U18 coach)', async () => {
  seed();
  const ctx = await sessionCtxFor('u-simon', 'coach');
  const ids = await channelPushRecipientIds(ctx, { id: `group:${U18}`, groupId: U18, teamId: CLUB });
  assert.deepEqual([...ids].sort(), ['u-simon', 'u-u18c', 'u-u18p'].sort(), JSON.stringify(ids));
});

test('Seniors-only and Women\'s-only people are NOT in the U18 push audience', async () => {
  seed();
  const ctx = await sessionCtxFor('u-simon', 'coach');
  const ids = await channelPushRecipientIds(ctx, { id: `group:${U18}`, groupId: U18, teamId: CLUB });
  for (const out of ['u-sen1', 'u-womp', 'u-flor', 'u-med']) {
    assert.ok(!ids.includes(out), `${out} must not receive U18 push`);
  }
});

test('coaching audience is staff only — players and medical never included', async () => {
  seed();
  const ctx = await sessionCtxFor('u-simon', 'coach');
  const ids = await channelPushRecipientIds(ctx, { id: 'coaching', type: 'GROUP' });
  assert.deepEqual([...ids].sort(), ['u-flor', 'u-simon', 'u-u18c'].sort(), JSON.stringify(ids));
});

test('squad/announce audience mirrors the read rule: players + staff, club-wide', async () => {
  seed();
  const ctx = await sessionCtxFor('u-simon', 'coach');
  for (const id of ['squad', 'announce']) {
    const ids = await channelPushRecipientIds(ctx, { id });
    assert.deepEqual([...ids].sort(),
      ['u-flor', 'u-sen1', 'u-simon', 'u-u18c', 'u-u18p', 'u-womp'].sort(),
      `${id}: ${JSON.stringify(ids)}`);
    assert.ok(!ids.includes('u-med'), 'medical role cannot read squad, so it is not pushed either');
  }
});

test('the sender is excluded at dispatch, and DM push code path is untouched', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../api/chat.js', import.meta.url), 'utf8');
  assert.match(src, /senderIds\.forEach\(idv => recipientIds\.delete\(idv\)\)/, 'sender aliases removed from channel audience');
  assert.match(src, /convId\.startsWith\('dm:'\) && !isAutomated/, 'DM branch unchanged');
  assert.match(src, /sendDmPush\(convId, senderId, msg\.senderName, msg\.text\)/, 'DM push still the DM path');
  assert.match(src, /CHANNEL_PUSH_MAX_TARGETS/, 'fan-out is bounded');
});

test('a channel send persists even when push cannot run (no VAPID configured)', async () => {
  seed();
  const coach = await sessionFor('u-simon', 'coach');
  const r = await call('POST', '', { action: 'send', convId: `group:${U18}`, text: 'training moved to 18:00' }, coach.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const stored = (lists.get(`app:chat:conv:group:${U18}@${CLUB}:msgs`) || []).map(x => JSON.parse(x));
  assert.equal(stored.length, 1, 'message stored despite push being unavailable');
  assert.equal(stored[0].senderId, 'u-simon');
});

// ── PRESENCE ──────────────────────────────────────────────────────────────
test('unauthenticated presence lookup is rejected', async () => {
  seed();
  const r = await call('GET', '?action=presence&ids=u-sen1', null, '');
  assert.equal(r.code, 401);
});

test('an anonymous caller can no longer stamp an arbitrary userId online', async () => {
  seed();
  await call('GET', '?action=presence&ids=u-sen1&userId=u-sen1', null, '');
  assert.ok(!kv.has('app:chat:presence:u-sen1'), 'no presence written without a session');
});

test('authenticated presence works and reflects the session identity only', async () => {
  seed();
  const p = await sessionFor('u-sen1', 'player');
  const coach = await sessionFor('u-simon', 'coach');
  await call('GET', '?action=conversations&userId=u-simon', null, p.token);   // any GET stamps the SESSION user
  const stamped = JSON.parse(kv.get('app:chat:presence:u-sen1') || 'null');
  assert.equal(stamped?.userId, 'u-sen1', 'stamp follows the session, not the query param');
  assert.ok(!kv.has('app:chat:presence:u-simon') || JSON.parse(kv.get('app:chat:presence:u-simon')).userId === 'u-simon');
  const r = await call('GET', '?action=presence&ids=u-sen1', null, coach.token);
  assert.equal(r.code, 200);
  assert.equal(r.body.presence[0].userId, 'u-sen1');
  assert.equal(r.body.presence[0].online, true);
});

test('out-of-club presence lookups are silently refused', async () => {
  seed();
  const coach = await sessionFor('u-simon', 'coach');
  const r = await call('GET', '?action=presence&ids=user_of_another_club,u-sen1', null, coach.token);
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.presence.map(p => p.userId), ['u-sen1'], 'foreign id dropped, never answered');
});

// ── PHANTOM DM CREATION ───────────────────────────────────────────────────
test('a participant can create their own DM', async () => {
  seed();
  const p = await sessionFor('u-sen1', 'player');
  const r = await call('POST', '', { action: 'create_conv', id: 'dm:u-sen1:u-simon', type: 'DIRECT',
    participants: ['u-sen1', 'u-simon'] }, p.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const convs = JSON.parse(kv.get('app:chat:convs'));
  assert.ok(convs.some(c => c.id === 'dm:u-sen1:u-simon'));
});

test('staff/admin cannot create a DM between two OTHER people — by type or by dm: id shape', async () => {
  seed();
  const coach = await sessionFor('u-simon', 'coach');
  const direct = await call('POST', '', { action: 'create_conv', id: 'dm:u-sen1:u-u18p', type: 'DIRECT',
    participants: ['u-sen1', 'u-u18p'] }, coach.token);
  assert.equal(direct.code, 403, JSON.stringify(direct.body));
  const disguised = await call('POST', '', { action: 'create_conv', id: 'dm:u-sen1:u-u18p', type: 'GROUP',
    participants: ['u-sen1', 'u-u18p'] }, coach.token);
  assert.equal(disguised.code, 403, 'the dm: id shape cannot dodge the gate');
  const convs = JSON.parse(kv.get('app:chat:convs'));
  assert.ok(!convs.some(c => c.id === 'dm:u-sen1:u-u18p'), 'nothing was written');
  // Staff group-channel and own-DM creation still work.
  const own = await call('POST', '', { action: 'create_conv', id: 'dm:u-sen1:u-simon', type: 'DIRECT',
    participants: ['u-sen1', 'u-simon'] }, coach.token);
  assert.equal(own.code, 200, 'a coach still creates DMs THEY participate in');
});
