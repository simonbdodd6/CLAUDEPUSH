/**
 * Group invite registration flow tests.
 *
 * Covers:
 *   1.  Coach creates a group invite link (no name, player-only)
 *   2.  Group invite cannot be created with non-player role
 *   3.  Group invite validates via GET /api/invite?token=... (returns type: 'group')
 *   4.  Player registers via group invite → pending team member
 *   5.  Pending player cannot log in
 *   6.  Pending player appears in identity list with status 'pending'
 *   7.  Group invite is still active after use (reusable), usageCount incremented
 *   8.  Second player registers via same group invite → both pending
 *   9.  Duplicate registration (same email) on active account → 409
 *  10.  Revoked group invite returns 410
 *  11.  Coach approves pending player → status becomes active
 *  12.  Approved player appears in Members (active)
 *  13.  Approved player can log in with email/password
 *  14.  Coach can DM approved player
 *  15.  Approved player can reply to coach DM
 *  16.  Simon Test Player is unaffected
 *  17.  Individual invite still works (regression)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.group-invite.test';
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
  joinViaGroupInvite,
  createSession,
  loginUser,
  approveJoinRequest,
} = await import('../api/_identityStore.js');
const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler }   = await import('../api/invite.js');
const { default: chatHandler }     = await import('../api/chat.js');
const { dmConvId }                 = await import('../src/chat-state.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'ce_session';

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
  return { headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('coach can create a group invite link with no name', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoachSession();

  const res = await callApi(inviteHandler, 'POST', {
    headers: { ...coach.headers, host: 'test.example.com', 'x-forwarded-proto': 'https' },
    body: { type: 'group', role: 'player', sendEmail: false },
  });

  assert.equal(res.statusCode, 201, `expected 201, got: ${JSON.stringify(res.payload)}`);
  assert.equal(res.payload.ok, true);
  assert.ok(res.payload.token, 'token should be returned');
  assert.ok(res.payload.url, 'url should be returned');
  assert.match(res.payload.url, /\/\?inv=/);
  assert.equal(res.payload.invite.type, 'group');
  assert.equal(res.payload.invite.name, '');
  assert.equal(res.payload.invite.role, 'player');
  assert.equal(res.payload.invite.status, 'active');
  assert.equal(res.payload.invite.expiresAt, null, 'group invites should not expire');
  assert.equal(res.payload.invite.usageCount, 0);
});

test('group invite cannot be created for non-player roles', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoachSession();

  const res = await callApi(inviteHandler, 'POST', {
    headers: { ...coach.headers, host: 'test.example.com', 'x-forwarded-proto': 'https' },
    body: { type: 'group', role: 'coach', sendEmail: false },
  });

  assert.equal(res.statusCode, 400);
  assert.ok(res.payload.error, 'error message should be present');
});

test('group invite token validates and returns type group', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoachSession();

  const created = await callApi(inviteHandler, 'POST', {
    headers: { ...coach.headers, host: 'test.example.com', 'x-forwarded-proto': 'https' },
    body: { type: 'group', role: 'player', sendEmail: false },
  });
  const token = created.payload.token;

  const validated = await callApi(inviteHandler, 'GET', { query: { token } });
  assert.equal(validated.statusCode, 200);
  assert.equal(validated.payload.valid, true);
  assert.equal(validated.payload.type, 'group');
  assert.equal(validated.payload.role, 'player');
  assert.equal(validated.payload.usageCount, 0);
});

test('player registers via group invite and gets pending status', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000001',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  const result = await joinViaGroupInvite({
    token: 'GroupToken000001',
    firstName: 'Jamie',
    lastName: 'Pending',
    email: 'jamie.pending@example.com',
    password: 'password123',
  });

  assert.match(result.user.id, /^user_/, 'userId should be user_ format');
  assert.equal(result.user.email, 'jamie.pending@example.com');
  assert.equal(result.teamMember.status, 'pending', 'new group invite member must be pending');
  assert.equal(result.teamMember.role, 'player');
  assert.equal(result.teamMember.teamId, 'boitsfort-rfc');
  assert.equal(result.teamMember.inviteToken, 'GroupToken000001');
});

test('pending player cannot log in', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000002',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  await joinViaGroupInvite({
    token: 'GroupToken000002',
    firstName: 'Blocked',
    lastName: 'Player',
    email: 'blocked.player@example.com',
    password: 'password123',
  });

  await assert.rejects(
    () => loginUser({ email: 'blocked.player@example.com', password: 'password123', teamId: 'boitsfort-rfc' }),
    (err) => { assert.ok(err.status >= 400, `expected 4xx, got ${err.status}`); return true; }
  );
});

test('pending player appears in identity list with pending status', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000003',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  await joinViaGroupInvite({
    token: 'GroupToken000003',
    firstName: 'Visible',
    lastName: 'Pending',
    email: 'visible.pending@example.com',
    password: 'password123',
  });

  const coach = await seedCoachSession();
  const identity = await callApi(identityHandler, 'GET', { headers: coach.headers });

  assert.equal(identity.statusCode, 200);
  const pendingMember = identity.payload.team_members.find(
    m => m.status === 'pending' && m.teamId === 'boitsfort-rfc'
  );
  assert.ok(pendingMember, 'pending member should appear in identity list');
});

test('group invite remains active after use and increments usageCount', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000004',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  await joinViaGroupInvite({
    token: 'GroupToken000004',
    firstName: 'First',
    lastName: 'User',
    email: 'first.user@example.com',
    password: 'password123',
  });

  // Invite should still be active
  const invites = JSON.parse(store.get('ce:invites'));
  const invite = invites.find(i => i.token === 'GroupToken000004');
  assert.equal(invite.status, 'active', 'group invite should remain active after first use');
  assert.equal(invite.usageCount, 1, 'usageCount should be 1 after first use');
});

test('second player can register via same group invite', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000005',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  const first = await joinViaGroupInvite({
    token: 'GroupToken000005',
    firstName: 'First',
    lastName: 'Player',
    email: 'first.player5@example.com',
    password: 'password123',
  });

  const second = await joinViaGroupInvite({
    token: 'GroupToken000005',
    firstName: 'Second',
    lastName: 'Player',
    email: 'second.player5@example.com',
    password: 'password123',
  });

  assert.notEqual(first.user.id, second.user.id, 'two distinct users must be created');
  assert.equal(first.teamMember.status, 'pending');
  assert.equal(second.teamMember.status, 'pending');

  const invites = JSON.parse(store.get('ce:invites'));
  const invite = invites.find(i => i.token === 'GroupToken000005');
  assert.equal(invite.usageCount, 2, 'usageCount should be 2 after two uses');
});

test('duplicate registration for active member returns 409', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000006',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  const coach = await seedCoachSession();

  // Register and then approve so status becomes active
  const joined = await joinViaGroupInvite({
    token: 'GroupToken000006',
    firstName: 'Duplicate',
    lastName: 'Player',
    email: 'duplicate.player@example.com',
    password: 'password123',
  });
  await approveJoinRequest(joined.teamMember.id, 'coach-demo', 'boitsfort-rfc');

  // Try to register again with same email
  await assert.rejects(
    () => joinViaGroupInvite({
      token: 'GroupToken000006',
      firstName: 'Duplicate',
      lastName: 'Player',
      email: 'duplicate.player@example.com',
      password: 'password123',
    }),
    (err) => { assert.equal(err.status, 409); return true; }
  );
});

test('revoked group invite returns 410', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000007',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'revoked',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  await assert.rejects(
    () => joinViaGroupInvite({
      token: 'GroupToken000007',
      firstName: 'Revoked',
      lastName: 'Player',
      email: 'revoked.player@example.com',
      password: 'password123',
    }),
    (err) => { assert.equal(err.status, 410); return true; }
  );
});

test('coach can approve a pending group invite player', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000008',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  const coach = await seedCoachSession();
  const joined = await joinViaGroupInvite({
    token: 'GroupToken000008',
    firstName: 'Approvable',
    lastName: 'Player',
    email: 'approvable.player@example.com',
    password: 'password123',
  });

  assert.equal(joined.teamMember.status, 'pending');

  const approved = await approveJoinRequest(joined.teamMember.id, 'coach-demo', 'boitsfort-rfc');

  assert.equal(approved.teamMember.status, 'active', 'approved member must have active status');
  assert.equal(approved.teamMember.approvedBy, 'coach-demo');
  assert.ok(approved.teamMember.approvedAt, 'approvedAt must be set');
  assert.ok(approved.playerProfile, 'player profile must be created on approval');
});

test('approved group invite player appears in Members', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000009',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  const coach = await seedCoachSession();
  const joined = await joinViaGroupInvite({
    token: 'GroupToken000009',
    firstName: 'Listed',
    lastName: 'Member',
    email: 'listed.member@example.com',
    password: 'password123',
  });
  await approveJoinRequest(joined.teamMember.id, 'coach-demo', 'boitsfort-rfc');

  const identity = await callApi(identityHandler, 'GET', { headers: coach.headers });
  assert.equal(identity.statusCode, 200);

  const member = identity.payload.team_members.find(m => m.userId === joined.user.id);
  assert.ok(member, 'approved player must appear in team_members');
  assert.equal(member.status, 'active');

  const profile = identity.payload.player_profiles.find(p => p.userId === joined.user.id);
  assert.ok(profile, 'approved player must appear in player_profiles');
});

test('approved group invite player can log in', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000010',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  const coach = await seedCoachSession();
  const joined = await joinViaGroupInvite({
    token: 'GroupToken000010',
    firstName: 'Loginable',
    lastName: 'Player',
    email: 'loginable.player@example.com',
    password: 'password123',
  });
  await approveJoinRequest(joined.teamMember.id, 'coach-demo', 'boitsfort-rfc');

  const login = await loginUser({ email: 'loginable.player@example.com', password: 'password123', teamId: 'boitsfort-rfc' });
  assert.ok(login.session?.token, 'approved player should get a session token');
  assert.equal(login.user.role, 'player');
  assert.equal(login.teamMember.status, 'active');
});

test('coach can DM an approved group invite player', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000011',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  const coach = await seedCoachSession();
  const joined = await joinViaGroupInvite({
    token: 'GroupToken000011',
    firstName: 'DM',
    lastName: 'Target',
    email: 'dm.target@example.com',
    password: 'password123',
  });
  const approved = await approveJoinRequest(joined.teamMember.id, 'coach-demo', 'boitsfort-rfc');

  const legacyId = approved.playerProfile.legacyPlayerId;
  const convId = dmConvId('coach-demo', legacyId);

  const createRes = await callChat('POST', '/api/chat', {
    action: 'create_conv',
    id: convId,
    name: 'DM Target',
    type: 'DIRECT',
    participants: ['coach-demo', legacyId],
  }, coach.headers);
  assert.equal(createRes.statusCode, 200, `create conv failed: ${JSON.stringify(createRes.payload)}`);

  const sendRes = await callChat('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'coach-demo',
    senderName: 'Simon Coach',
    senderRole: 'coach',
    text: 'Welcome to the squad!',
  }, coach.headers);
  assert.equal(sendRes.statusCode, 200, `send message failed: ${JSON.stringify(sendRes.payload)}`);
  assert.equal(sendRes.payload.ok, true);
});

test('approved group invite player can reply to coach DM', async () => {
  store.clear(); lists.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000012',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  const coach = await seedCoachSession();
  const joined = await joinViaGroupInvite({
    token: 'GroupToken000012',
    firstName: 'Replying',
    lastName: 'Player',
    email: 'replying.player@example.com',
    password: 'password123',
  });
  const approved = await approveJoinRequest(joined.teamMember.id, 'coach-demo', 'boitsfort-rfc');

  const loginResult = await loginUser({ email: 'replying.player@example.com', password: 'password123', teamId: 'boitsfort-rfc' });
  const playerHeaders = { cookie: `${SESSION_COOKIE}=${encodeURIComponent(loginResult.session.token)}` };

  const legacyId = approved.playerProfile.legacyPlayerId;
  const convId = dmConvId('coach-demo', legacyId);

  await callChat('POST', '/api/chat', {
    action: 'create_conv',
    id: convId,
    name: 'Replying Player',
    type: 'DIRECT',
    participants: ['coach-demo', legacyId],
  }, coach.headers);

  await callChat('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'coach-demo',
    senderName: 'Simon Coach',
    senderRole: 'coach',
    text: 'Hi there!',
  }, coach.headers);

  const replyRes = await callChat('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: legacyId,
    senderName: 'Replying Player',
    senderRole: 'player',
    text: 'Hi coach, thanks!',
  }, playerHeaders);

  assert.equal(replyRes.statusCode, 200, `player reply failed: ${JSON.stringify(replyRes.payload)}`);
  assert.equal(replyRes.payload.ok, true);

  const msgsRes = await callChat('GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}&userId=coach-demo`, null, coach.headers);
  assert.equal(msgsRes.statusCode, 200);
  const messages = msgsRes.payload.messages || [];
  assert.ok(messages.length >= 2, 'conversation should have at least 2 messages');
});

test('Simon Test Player is unaffected by group invite registrations', async () => {
  store.clear(); lists.clear();

  const coach = await seedCoachSession();

  // Seed Simon Test Player
  const users    = JSON.parse(store.get('app:identity:users')          || '[]');
  const members  = JSON.parse(store.get('app:identity:team_members')   || '[]');
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
  store.set('app:identity:users',           JSON.stringify(users));
  store.set('app:identity:team_members',    JSON.stringify(members));
  store.set('app:identity:player_profiles', JSON.stringify(profiles));

  store.set('ce:invites', JSON.stringify([
    {
      token: 'GroupToken000013',
      type: 'group',
      name: '',
      role: 'player',
      teamId: 'boitsfort-rfc',
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: null,
      usageCount: 0,
    },
  ]));

  await joinViaGroupInvite({
    token: 'GroupToken000013',
    firstName: 'New',
    lastName: 'Recruit',
    email: 'new.recruit@example.com',
    password: 'password123',
  });

  const identity = await callApi(identityHandler, 'GET', { headers: coach.headers });
  assert.equal(identity.statusCode, 200);

  const simonMember = identity.payload.team_members.find(m => m.userId === 'player-simon-test');
  assert.ok(simonMember, 'Simon Test Player must still exist in team_members');
  assert.equal(simonMember.status, 'active', 'Simon Test Player must remain active');

  const simonProfile = identity.payload.player_profiles.find(p => p.userId === 'player-simon-test');
  assert.ok(simonProfile, 'Simon Test Player must still have a player profile');
  assert.equal(simonProfile.legacyPlayerId, 'inv-YxnjxnQa', 'Simon Test Player legacyPlayerId must be unchanged');
});

test('individual invite still works after group invite feature (regression)', async () => {
  store.clear(); lists.clear();
  const coach = await seedCoachSession();

  const created = await callApi(inviteHandler, 'POST', {
    headers: { ...coach.headers, host: 'test.example.com', 'x-forwarded-proto': 'https' },
    body: { name: 'Individual Player', role: 'player', sendEmail: false },
  });

  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.invite.type, 'individual');
  assert.equal(created.payload.invite.name, 'Individual Player');
  assert.ok(created.payload.invite.expiresAt, 'individual invite must have an expiry');

  const validated = await callApi(inviteHandler, 'GET', { query: { token: created.payload.token } });
  assert.equal(validated.statusCode, 200);
  assert.equal(validated.payload.valid, true);
  assert.equal(validated.payload.type, 'individual');
  assert.equal(validated.payload.name, 'Individual Player');
});
