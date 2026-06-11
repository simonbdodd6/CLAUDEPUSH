import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.chat-unread.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();

function range(list, start, end) {
  const s = Number(start);
  const e = Number(end);
  const finalEnd = e < 0 ? list.length + e : e;
  return list.slice(s, finalEnd + 1);
}

globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') {
    kv.set(args[0], args[1]);
    result = 'OK';
  }
  if (command === 'LPUSH') {
    const list = lists.get(args[0]) || [];
    list.unshift(args[1]);
    lists.set(args[0], list);
    result = list.length;
  }
  if (command === 'LRANGE') {
    result = range(lists.get(args[0]) || [], args[1], args[2]);
  }
  if (command === 'LTRIM') {
    const list = lists.get(args[0]) || [];
    lists.set(args[0], range(list, args[1], args[2]));
    result = 'OK';
  }
  if (command === 'DEL') {
    kv.delete(args[0]);
    lists.delete(args[0]);
    result = 1;
  }
  return { ok: true, json: async () => ({ result }) };
};

const { default: chatHandler } = await import('../api/chat.js');
const { createSession, SESSION_COOKIE } = await import('../api/_identityStore.js');
const { dmConvId } = await import('../src/chat-state.js');

function req(method, url, body = null, headers = {}) {
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body));
    },
  };
}

function res() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = { ...this.headers, ...headers };
    },
    end(chunk = '') {
      this.body = String(chunk || '');
    },
  };
}

async function call(method, url, body = null, headers = {}) {
  const response = res();
  await chatHandler(req(method, url, body, headers), response);
  assert.equal(response.statusCode, 200, response.body);
  return JSON.parse(response.body);
}

async function callRaw(method, url, body = null, headers = {}) {
  const response = res();
  await chatHandler(req(method, url, body, headers), response);
  return response;
}

// Additive — appends to existing KV arrays rather than replacing them, so
// multiple seedSessionAccount calls in one test don't clobber each other.
async function seedSessionAccount({ id, role = 'player', displayName = 'Session User', email = 'session@example.com', legacyPlayerId = null, teamId = 'boitsfort-rfc' }) {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === id)) {
    users.push({ id, email, firstName: displayName.split(' ')[0], lastName: displayName.split(' ').slice(1).join(' '), displayName });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === id)) {
    members.push({ id: `tm_${id}`, teamId, userId: id, role, status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  if (role === 'player') {
    const profiles = JSON.parse(kv.get('app:identity:player_profiles') || '[]');
    if (!profiles.find(p => p.userId === id)) {
      profiles.push({ id: `profile_${id}`, teamId, teamMemberId: `tm_${id}`, userId: id, displayName, email, legacyPlayerId: legacyPlayerId || id });
      kv.set('app:identity:player_profiles', JSON.stringify(profiles));
    }
  }
  const session = await createSession({ userId: id, teamId, role });
  return { session, headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` } };
}

async function coachSetup() {
  const users = JSON.parse(kv.get('app:identity:users') || '[]');
  if (!users.find(u => u.id === 'coach-demo')) {
    users.push({ id: 'coach-demo', email: 'coach@example.com', firstName: 'Simon', lastName: 'Coach', displayName: 'Simon Coach' });
    kv.set('app:identity:users', JSON.stringify(users));
  }
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  if (!members.find(m => m.userId === 'coach-demo')) {
    members.push({ id: 'tm-coach-demo', teamId: 'boitsfort-rfc', userId: 'coach-demo', role: 'coach', status: 'active' });
    kv.set('app:identity:team_members', JSON.stringify(members));
  }
  const session = await createSession({ userId: 'coach-demo', teamId: 'boitsfort-rfc', role: 'coach' });
  return { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };
}

// Fetch unread count for a conversation from the given user's authenticated perspective.
// `_userId` is informational only — the server derives identity from `headers`.
async function unreadFor(_userId, convId, headers = {}) {
  const data = await call('GET', '/api/chat?action=conversations', null, headers);
  const conversation = data.conversations.find(item => item.id === convId);
  return Number(conversation?.unread || 0);
}

test('chat API unread count increments on coach DM and survives refresh and login refetches', async () => {
  kv.clear();
  lists.clear();
  const playerId = 'user_dodsy_approved';
  const convId = dmConvId('coach-demo', playerId);
  const { headers: playerHeaders } = await seedSessionAccount({ id: playerId, role: 'player', displayName: 'Dodsy Player' });
  const coachHeaders = await coachSetup();

  await call('POST', '/api/chat', {
    action: 'create_conv',
    id: convId,
    name: 'Dodsy Player',
    type: 'DIRECT',
    participants: ['coach-demo', playerId],
  }, coachHeaders);
  await call('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'coach-demo',
    senderName: 'Simon Dodd',
    senderRole: 'coach',
    text: 'Unread ping',
  }, coachHeaders);

  assert.equal(await unreadFor(playerId, convId, playerHeaders), 1);
  assert.equal(await unreadFor('coach-demo', convId, coachHeaders), 0);
  assert.equal(await unreadFor(playerId, convId, playerHeaders), 1, 'refresh keeps unread until opened');

  await call('POST', '/api/chat', {
    action: 'read',
    convId,
    userId: playerId,
  }, playerHeaders);

  assert.equal(await unreadFor(playerId, convId, playerHeaders), 0);
  assert.equal(await unreadFor(playerId, convId, playerHeaders), 0, 'logout/login refetch keeps cleared read state');

  await call('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'coach-demo',
    senderName: 'Simon Dodd',
    senderRole: 'coach',
    text: 'Unread ping after login',
  }, coachHeaders);

  assert.equal(await unreadFor(playerId, convId, playerHeaders), 1);
});

test('chat API unread logic preserves Simon Test Player legacy conversation id', async () => {
  kv.clear();
  lists.clear();
  // Seed Simon Test Player with their legacy participant ID so their session
  // can access dm:coach-demo:inv-YxnjxnQa.
  const simonSession = await seedSessionAccount({
    id: 'player-simon-test',
    role: 'player',
    displayName: 'Simon Test Player',
    email: 'simon.test.player@player.test',
    legacyPlayerId: 'inv-YxnjxnQa',
  });
  const coachHeaders = await coachSetup();

  const playerId = 'inv-YxnjxnQa';
  const expectedConvId = 'dm:coach-demo:inv-YxnjxnQa';
  const convId = dmConvId('coach-demo', playerId);
  assert.equal(convId, expectedConvId);

  await call('POST', '/api/chat', {
    action: 'create_conv',
    id: convId,
    name: 'Simon Test Player',
    type: 'DIRECT',
    participants: ['coach-demo', playerId],
  }, coachHeaders);
  await call('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'coach-demo',
    senderName: 'Simon Coach',
    senderRole: 'coach',
    text: 'Hello Simon Test Player',
  }, coachHeaders);

  assert.equal(await unreadFor(playerId, convId, simonSession.headers), 1);
});

test('chat API trusts authenticated session identity over browser-supplied sender ids', async () => {
  kv.clear();
  lists.clear();
  kv.set('app:identity:users', JSON.stringify([
    {
      id: 'user_auth_player',
      email: 'auth.player@example.com',
      firstName: 'Auth',
      lastName: 'Player',
      displayName: 'Auth Player',
    },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    {
      id: 'tm_auth_player',
      teamId: 'boitsfort-rfc',
      userId: 'user_auth_player',
      role: 'player',
      status: 'active',
    },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([
    {
      id: 'profile_auth_player',
      teamId: 'boitsfort-rfc',
      teamMemberId: 'tm_auth_player',
      userId: 'user_auth_player',
      displayName: 'Auth Player',
      email: 'auth.player@example.com',
    },
  ]));
  const session = await createSession({ userId: 'user_auth_player', teamId: 'boitsfort-rfc', role: 'player' });
  const coachHeaders = await coachSetup();
  const convId = dmConvId('coach-demo', 'user_auth_player');
  const headers = { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.token)}` };

  await call('POST', '/api/chat', {
    action: 'create_conv',
    id: convId,
    name: 'Auth Player',
    type: 'DIRECT',
    participants: ['coach-demo', 'user_auth_player'],
  }, coachHeaders);
  const sent = await call('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'spoofed-browser-id',
    senderName: 'Spoofed Name',
    senderRole: 'coach',
    text: 'Authenticated message',
  }, headers);

  assert.equal(sent.message.senderId, 'user_auth_player');
  assert.equal(sent.message.senderName, 'Auth Player');
  assert.equal(sent.message.senderRole, 'player');
  assert.equal(await unreadFor('coach-demo', convId, coachHeaders), 1);
});

test('authenticated player can read only their own legacy direct-message conversation', async () => {
  kv.clear();
  lists.clear();
  const simon = await seedSessionAccount({
    id: 'user_simon_session',
    role: 'player',
    displayName: 'Simon Test Player',
    email: 'simon.session@example.com',
    legacyPlayerId: 'inv-YxnjxnQa',
  });
  const coachHeaders = await coachSetup();
  const simonConvId = dmConvId('coach-demo', 'inv-YxnjxnQa');
  // Use a non-obsolete player ID to avoid the cleanup migration wiping the conversation
  const otherConvId = dmConvId('coach-demo', 'inv-other-player-1');

  await call('POST', '/api/chat', {
    action: 'create_conv',
    id: simonConvId,
    name: 'Simon Test Player',
    type: 'DIRECT',
    participants: ['coach-demo', 'inv-YxnjxnQa'],
  }, coachHeaders);
  await call('POST', '/api/chat', {
    action: 'create_conv',
    id: otherConvId,
    name: 'Other Player',
    type: 'DIRECT',
    participants: ['coach-demo', 'inv-other-player-1'],
  }, coachHeaders);
  await call('POST', '/api/chat', {
    action: 'send',
    convId: simonConvId,
    senderId: 'coach-demo',
    senderName: 'Simon Coach',
    senderRole: 'coach',
    text: 'Simon only',
  }, coachHeaders);

  const ownMessages = await call('GET', `/api/chat?action=messages&convId=${encodeURIComponent(simonConvId)}`, null, simon.headers);
  assert.equal(ownMessages.messages.length, 1);
  assert.equal(ownMessages.messages[0].text, 'Simon only');

  const otherMessages = await callRaw('GET', `/api/chat?action=messages&convId=${encodeURIComponent(otherConvId)}`, null, simon.headers);
  assert.equal(otherMessages.statusCode, 403);

  const convList = await call('GET', '/api/chat?action=conversations', null, simon.headers);
  assert.equal(convList.conversations.some(c => c.id === simonConvId), true);
  assert.equal(convList.conversations.some(c => c.id === otherConvId), false);
});

test('conversation creation permissions: players can start their own DMs, coaches can create anything', async () => {
  kv.clear();
  lists.clear();
  const player = await seedSessionAccount({
    id: 'user_create_player',
    role: 'player',
    displayName: 'Create Player',
    email: 'create.player@example.com',
  });

  // Player cannot create GROUP channels
  const groupBlocked = await callRaw('POST', '/api/chat', {
    action: 'create_conv',
    id: 'fake-group-chan',
    name: 'Fake Squad',
    type: 'GROUP',
    participants: ['user_create_player'],
  }, player.headers);
  assert.equal(groupBlocked.statusCode, 403);

  // Player cannot create a DM they are not part of
  const otherDmBlocked = await callRaw('POST', '/api/chat', {
    action: 'create_conv',
    id: dmConvId('coach-demo', 'other-player-abc'),
    name: 'Other Player',
    type: 'DIRECT',
    participants: ['coach-demo', 'other-player-abc'],
  }, player.headers);
  assert.equal(otherDmBlocked.statusCode, 403);

  // Player CAN create their own DM with the coach
  const playerCreated = await call('POST', '/api/chat', {
    action: 'create_conv',
    id: dmConvId('coach-demo', 'user_create_player'),
    name: 'Create Player',
    type: 'DIRECT',
    participants: ['coach-demo', 'user_create_player'],
  }, player.headers);
  assert.equal(playerCreated.convId, dmConvId('coach-demo', 'user_create_player'));

  const coach = await seedSessionAccount({
    id: 'user_create_coach',
    role: 'coach',
    displayName: 'Create Coach',
    email: 'create.coach@example.com',
  });

  // Coach can create any conversation including other-party DMs
  const coachCreated = await call('POST', '/api/chat', {
    action: 'create_conv',
    id: dmConvId('user_create_coach', 'user_create_player'),
    name: 'Create Player',
    type: 'DIRECT',
    participants: ['user_create_coach', 'user_create_player'],
  }, coach.headers);
  assert.equal(coachCreated.convId, 'dm:user_create_coach:user_create_player');
});

test('tenant isolation blocks players and coaches from reading another team messages', async () => {
  kv.clear();
  lists.clear();
  kv.set('app:identity:users', JSON.stringify([
    { id: 'team-a-player', email: 'team.a.player@example.com', firstName: 'Team', lastName: 'Player', displayName: 'Team A Player' },
    { id: 'team-a-coach', email: 'team.a.coach@example.com', firstName: 'Team', lastName: 'Coach', displayName: 'Team A Coach' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-team-a-player', teamId: 'team-a', userId: 'team-a-player', role: 'player', status: 'active' },
    { id: 'tm-team-a-coach', teamId: 'team-a', userId: 'team-a-coach', role: 'coach', status: 'active' },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([
    { id: 'profile-team-a-player', teamId: 'team-a', teamMemberId: 'tm-team-a-player', userId: 'team-a-player', displayName: 'Team A Player' },
  ]));
  const playerSession = await createSession({ userId: 'team-a-player', teamId: 'team-a', role: 'player' });
  const coachSession = await createSession({ userId: 'team-a-coach', teamId: 'team-a', role: 'coach' });
  const playerHeaders = { cookie: `${SESSION_COOKIE}=${encodeURIComponent(playerSession.token)}` };
  const coachHeaders = { cookie: `${SESSION_COOKIE}=${encodeURIComponent(coachSession.token)}` };
  const ownConvId = 'dm:team-a-coach:team-a-player';
  const otherConvId = 'dm:other-team-coach:team-a-player';
  kv.set('app:chat:convs', JSON.stringify([
    {
      id: ownConvId,
      teamId: 'team-a',
      name: 'Team A Player',
      type: 'DIRECT',
      participants: ['team-a-coach', 'team-a-player'],
      createdAt: 1,
    },
    {
      id: otherConvId,
      teamId: 'team-b',
      name: 'Other Team Thread',
      type: 'DIRECT',
      participants: ['other-team-coach', 'team-a-player'],
      createdAt: 2,
    },
  ]));

  const playerCrossRead = await callRaw('GET', `/api/chat?action=messages&convId=${encodeURIComponent(otherConvId)}`, null, playerHeaders);
  assert.equal(playerCrossRead.statusCode, 403);

  const coachCrossRead = await callRaw('GET', `/api/chat?action=messages&convId=${encodeURIComponent(otherConvId)}`, null, coachHeaders);
  assert.equal(coachCrossRead.statusCode, 403);

  const playerList = await call('GET', '/api/chat?action=conversations', null, playerHeaders);
  assert.equal(playerList.conversations.some(conversation => conversation.id === ownConvId), true);
  assert.equal(playerList.conversations.some(conversation => conversation.id === otherConvId), false);

  const coachList = await call('GET', '/api/chat?action=conversations', null, coachHeaders);
  assert.equal(coachList.conversations.some(conversation => conversation.id === ownConvId), true);
  assert.equal(coachList.conversations.some(conversation => conversation.id === otherConvId), false);
});
