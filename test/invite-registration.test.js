/**
 * Invite and registration flow tests.
 *
 * Covers:
 *   1. Coach creates invite link (token, URL, expiry)
 *   2. Invite token validates via GET /api/invite?token=...
 *   3. Expired token returns 410
 *   4. Invite cannot be claimed twice (409 on second claim)
 *   5. Player account gets permanent userId (user_XXXX format) after claim
 *   6. Claimed player appears in GET /api/identity (Members)
 *   7. Claimed player has correct legacyPlayerId = inv-{last8 of token}
 *   8. Coach can start a DM conversation with the invited player
 *   9. Invited player can log in with email/password and gets a session
 *  10. Simon Test Player baseline is unaffected
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.invite.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const store = new Map();
const lists = new Map();

function rangeList(list, start, end) {
  const s = Number(start);
  const e = Number(end);
  const finalEnd = e < 0 ? list.length + e : e;
  return list.slice(s, finalEnd + 1);
}

globalThis.fetch = async (url, options = {}) => {
  const parsed = JSON.parse(options.body || '[]');
  if (!Array.isArray(parsed)) {
    return { ok: true, json: async () => ({ id: 'email_test_000', url }) };
  }
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET')   result = store.has(args[0]) ? store.get(args[0]) : null;
  if (command === 'SET') { store.set(args[0], args[1]); result = 'OK'; }
  if (command === 'LPUSH') {
    const list = lists.get(args[0]) || [];
    list.unshift(args[1]);
    lists.set(args[0], list);
    result = list.length;
  }
  if (command === 'LRANGE') result = rangeList(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM') {
    const list = lists.get(args[0]) || [];
    lists.set(args[0], rangeList(list, args[1], args[2]));
    result = 'OK';
  }
  if (command === 'DEL') { store.delete(args[0]); lists.delete(args[0]); result = 1; }
  return { ok: true, json: async () => ({ result }) };
};

const {
  claimInvite,
  createSession,
  loginUser,
} = await import('../api/_identityStore.js');
const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler }   = await import('../api/invite.js');
const { default: chatHandler }     = await import('../api/chat.js');
const { dmConvId }                 = await import('../src/chat-state.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// identity.js / invite.js use Express-style req/res
function apiReq(method, { query = {}, body = {}, headers = {} } = {}) {
  return { method, query, body, headers };
}

function apiRes() {
  return {
    statusCode: 0, headers: {}, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

async function callApi(handler, method, options = {}) {
  const response = apiRes();
  await handler(apiReq(method, options), response);
  return response;
}

// chat.js uses raw IncomingMessage-style req / ServerResponse-style res
function chatReq(method, url, body = null, headers = {}) {
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body));
    },
  };
}

function chatRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    writeHead(status, hdrs = {}) { this.statusCode = status; this.headers = hdrs; },
    end(chunk = '') { this.body = String(chunk || ''); },
    json() { return this; },
  };
}

async function callChat(method, url, body = null, headers = {}) {
  const response = chatRes();
  await chatHandler(chatReq(method, url, body, headers), response);
  return { statusCode: response.statusCode, payload: JSON.parse(response.body || '{}') };
}

async function seedCoachSession() {
  const users   = JSON.parse(store.get('app:identity:users')        || '[]');
  const members = JSON.parse(store.get('app:identity:team_members') || '[]');
  if (!users.find(u => u.id === 'coach-demo')) {
    users.push({
      id: 'coach-demo', email: 'coach@example.com',
      firstName: 'Simon', lastName: 'Coach', displayName: 'Simon Coach',
    });
    store.set('app:identity:users', JSON.stringify(users));
  }
  if (!members.find(m => m.userId === 'coach-demo')) {
    members.push({ id: 'tm-coach', teamId: 'boitsfort-rfc', userId: 'coach-demo', role: 'coach', status: 'active' });
    store.set('app:identity:team_members', JSON.stringify(members));
  }
  const session = await createSession({ userId: 'coach-demo', teamId: 'boitsfort-rfc', role: 'coach' });
  return { headers: { cookie: `ce_session=${encodeURIComponent(session.token)}` } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('coach can create an invite link for a player', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoachSession();

  const res = await callApi(inviteHandler, 'POST', {
    headers: { ...coach.headers, host: 'test.example.com', 'x-forwarded-proto': 'https' },
    body: { name: 'Alex Player', role: 'player', sendEmail: false },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.ok, true);
  assert.ok(res.payload.token, 'token should be returned');
  assert.ok(res.payload.url, 'url should be returned');
  assert.match(res.payload.url, /\/\?inv=/);
  assert.ok(res.payload.invite.expiresAt, 'invite should have expiry');
  assert.equal(res.payload.invite.role, 'player');
  assert.equal(res.payload.invite.name, 'Alex Player');
});

test('invite token validates via GET /api/invite?token=...', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoachSession();

  const created = await callApi(inviteHandler, 'POST', {
    headers: { ...coach.headers, host: 'test.example.com', 'x-forwarded-proto': 'https' },
    body: { name: 'Ben Player', role: 'player', sendEmail: false },
  });
  const token = created.payload.token;

  const validated = await callApi(inviteHandler, 'GET', { query: { token } });
  assert.equal(validated.statusCode, 200);
  assert.equal(validated.payload.valid, true);
  assert.equal(validated.payload.name, 'Ben Player');
  assert.equal(validated.payload.role, 'player');
});

test('expired invite token returns 410', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoachSession();

  const created = await callApi(inviteHandler, 'POST', {
    headers: { ...coach.headers, host: 'test.example.com', 'x-forwarded-proto': 'https' },
    body: { name: 'Expired Player', role: 'player', sendEmail: false },
  });
  const token = created.payload.token;

  // Backdate expiry
  const invites = JSON.parse(store.get('ce:invites'));
  invites[0].expiresAt = '2020-01-01T00:00:00.000Z';
  store.set('ce:invites', JSON.stringify(invites));

  const expired = await callApi(inviteHandler, 'GET', { query: { token } });
  assert.equal(expired.statusCode, 410);
  assert.equal(expired.payload.valid, false);
});

test('invite token cannot be claimed twice', async () => {
  store.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'OneTimeToken123',
      name: 'Once Player',
      role: 'player',
      email: 'once@example.com',
      teamId: 'boitsfort-rfc',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]));

  await claimInvite({ token: 'OneTimeToken123', name: 'Once Player', email: 'once@example.com', password: 'password123' });

  await assert.rejects(
    () => claimInvite({ token: 'OneTimeToken123', name: 'Once Player', email: 'once@example.com', password: 'password123' }),
    (err) => { assert.equal(err.status, 409); return true; }
  );
});

test('player account gets a permanent user_XXXX userId after claiming invite', async () => {
  store.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'PermanentIdToken',
      name: 'Permanent Player',
      role: 'player',
      email: 'permanent@example.com',
      teamId: 'boitsfort-rfc',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]));

  const claimed = await claimInvite({
    token: 'PermanentIdToken',
    name: 'Permanent Player',
    email: 'permanent@example.com',
    password: 'password123',
  });

  assert.match(claimed.user.id, /^user_/, 'userId should be a generated user_ ID');
  assert.equal(claimed.user.email, 'permanent@example.com');
  assert.equal(claimed.user.role, 'player');
  assert.equal(claimed.teamMember.status, 'active');
  assert.equal(typeof claimed.session.token, 'string');
});

test('legacyPlayerId is inv-{last8 of token} after invite claim', async () => {
  store.clear();
  const token = 'AbcDef1234567890';
  store.set('ce:invites', JSON.stringify([
    {
      token,
      name: 'Legacy Id Player',
      role: 'player',
      email: 'legacy.id@example.com',
      teamId: 'boitsfort-rfc',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]));

  const claimed = await claimInvite({
    token,
    name: 'Legacy Id Player',
    email: 'legacy.id@example.com',
    password: 'password123',
  });

  const expectedLegacyId = `inv-${token.slice(-8)}`;
  assert.equal(claimed.playerProfile.legacyPlayerId, expectedLegacyId);
});

test('invited player appears in GET /api/identity (Members list)', async () => {
  store.clear();
  const token = 'MembersListToken1';
  store.set('ce:invites', JSON.stringify([
    {
      token,
      name: 'Members Player',
      role: 'player',
      email: 'members@example.com',
      teamId: 'boitsfort-rfc',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]));

  const claimed = await claimInvite({
    token,
    name: 'Members Player',
    email: 'members@example.com',
    password: 'password123',
  });

  const coach = await seedCoachSession();
  const identity = await callApi(identityHandler, 'GET', { headers: coach.headers });

  assert.equal(identity.statusCode, 200);
  assert.equal(identity.payload.ok, true);
  const playerIds = identity.payload.player_profiles.map(p => p.userId);
  assert.ok(playerIds.includes(claimed.user.id), 'invited player must appear in identity profiles');
  const member = identity.payload.team_members.find(m => m.userId === claimed.user.id);
  assert.ok(member, 'invited player must have an active team_member record');
  assert.equal(member.status, 'active');
});

test('invited player can log in with email and password', async () => {
  store.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'LoginToken0001',
      name: 'Login Player',
      role: 'player',
      email: 'login.player@example.com',
      teamId: 'boitsfort-rfc',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]));

  await claimInvite({
    token: 'LoginToken0001',
    name: 'Login Player',
    email: 'login.player@example.com',
    password: 'securepass1',
  });

  const login = await loginUser({ email: 'login.player@example.com', password: 'securepass1', teamId: 'boitsfort-rfc' });
  assert.ok(login.session?.token, 'player should get a session token on login');
  assert.equal(login.user.role, 'player');
});

test('coach can open a DM conversation channel with an invited player', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'DmToken0001234',
      name: 'DM Player',
      role: 'player',
      email: 'dm.player@example.com',
      teamId: 'boitsfort-rfc',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]));

  const claimed = await claimInvite({
    token: 'DmToken0001234',
    name: 'DM Player',
    email: 'dm.player@example.com',
    password: 'password123',
  });

  const convId = dmConvId('coach-demo', claimed.playerProfile.legacyPlayerId);

  // Create the conversation first, then send a message
  const createRes = await callChat('POST', '/api/chat', {
    action: 'create_conv',
    id: convId,
    name: 'DM Player',
    type: 'DIRECT',
    participants: ['coach-demo', claimed.playerProfile.legacyPlayerId],
  });
  assert.equal(createRes.statusCode, 200, `create conv failed: ${JSON.stringify(createRes.payload)}`);

  const sendRes = await callChat('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'coach-demo',
    senderName: 'Simon Coach',
    senderRole: 'coach',
    text: 'Welcome to Boitsfort!',
  });
  assert.equal(sendRes.statusCode, 200, `send message failed: ${JSON.stringify(sendRes.payload)}`);
  assert.equal(sendRes.payload.ok, true);
});

test('invited player can reply to coach DM', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'ReplyToken012345',
      name: 'Reply Player',
      role: 'player',
      email: 'reply.player@example.com',
      teamId: 'boitsfort-rfc',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]));

  const claimed = await claimInvite({
    token: 'ReplyToken012345',
    name: 'Reply Player',
    email: 'reply.player@example.com',
    password: 'password123',
  });

  const convId = dmConvId('coach-demo', claimed.playerProfile.legacyPlayerId);

  // Create conv and have coach send first
  await callChat('POST', '/api/chat', {
    action: 'create_conv',
    id: convId,
    name: 'Reply Player',
    type: 'DIRECT',
    participants: ['coach-demo', claimed.playerProfile.legacyPlayerId],
  });
  await callChat('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'coach-demo',
    senderName: 'Simon Coach',
    senderRole: 'coach',
    text: 'Hi there',
  });

  // Player replies
  const replyRes = await callChat('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: claimed.playerProfile.legacyPlayerId,
    senderName: 'Reply Player',
    senderRole: 'player',
    text: 'Hi coach!',
  });

  assert.equal(replyRes.statusCode, 200, `player reply failed: ${JSON.stringify(replyRes.payload)}`);
  assert.equal(replyRes.payload.ok, true);

  // Verify both messages exist in the conversation
  const msgsRes = await callChat('GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}&userId=coach-demo`);
  assert.equal(msgsRes.statusCode, 200);
  const messages = msgsRes.payload.messages || [];
  assert.ok(messages.length >= 2, 'conversation should have at least 2 messages');
});

test('Simon Test Player baseline is unaffected after new player invite', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoachSession();

  // Seed Simon Test Player as legacy compat account would
  const users   = JSON.parse(store.get('app:identity:users')        || '[]');
  const members = JSON.parse(store.get('app:identity:team_members') || '[]');
  const profiles = JSON.parse(store.get('app:identity:player_profiles') || '[]');
  users.push({
    id: 'player-simon-test', email: 'simon.test.player@player.test',
    firstName: 'Simon', lastName: 'Test Player', displayName: 'Simon Test Player',
    authProvider: 'legacy-compatibility',
  });
  members.push({ id: 'tm_player-simon-test', teamId: 'boitsfort-rfc', userId: 'player-simon-test', role: 'player', status: 'active' });
  profiles.push({
    id: 'profile_player-simon-test', teamId: 'boitsfort-rfc', teamMemberId: 'tm_player-simon-test',
    userId: 'player-simon-test', displayName: 'Simon Test Player', legacyPlayerId: 'inv-YxnjxnQa',
  });
  store.set('app:identity:users',          JSON.stringify(users));
  store.set('app:identity:team_members',   JSON.stringify(members));
  store.set('app:identity:player_profiles', JSON.stringify(profiles));

  // Invite a new player
  store.set('ce:invites', JSON.stringify([
    {
      token: 'NewPlayerToken11',
      name: 'New Player',
      role: 'player',
      email: 'new.player@example.com',
      teamId: 'boitsfort-rfc',
      status: 'pending',
      createdAt: new Date().toISOString(),
    },
  ]));
  const claimed = await claimInvite({
    token: 'NewPlayerToken11',
    name: 'New Player',
    email: 'new.player@example.com',
    password: 'password123',
  });

  const identity = await callApi(identityHandler, 'GET', { headers: coach.headers });
  assert.equal(identity.statusCode, 200);
  const profileUserIds = identity.payload.player_profiles.map(p => p.userId);

  assert.ok(profileUserIds.includes('player-simon-test'), 'Simon Test Player must still appear');
  assert.ok(profileUserIds.includes(claimed.user.id),     'new player must also appear');
  assert.equal(identity.payload.player_profiles.length, 2, 'exactly 2 players in the team');
});
