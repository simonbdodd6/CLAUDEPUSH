import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.onboarding.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();
const sentEmails = [];

function range(list, start, end) {
  const s = Number(start);
  const e = Number(end);
  const finalEnd = e < 0 ? list.length + e : e;
  return list.slice(s, finalEnd + 1);
}

globalThis.fetch = async (_url, options = {}) => {
  const parsed = JSON.parse(options.body || '[]');
  if (!Array.isArray(parsed)) {
    sentEmails.push(parsed);
    return { ok: true, json: async () => ({ id: `email_${sentEmails.length}` }) };
  }
  const [command, ...args] = parsed;
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
  if (command === 'LRANGE') result = range(lists.get(args[0]) || [], args[1], args[2]);
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

const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { default: chatHandler } = await import('../api/chat.js');
const { default: subscribeHandler } = await import('../api/subscribe.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const { dmConvId } = await import('../src/chat-state.js');

function apiRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

async function callApi(handler, method, { query = {}, body = {}, headers = {} } = {}) {
  const response = apiRes();
  await handler({ method, query, body, headers }, response);
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
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body = String(chunk || '');
    },
  };
}

async function callChat(method, url, body = null, headers = {}) {
  const response = chatRes();
  await chatHandler(chatReq(method, url, body, headers), response);
  assert.equal(response.statusCode, 200, response.body);
  return JSON.parse(response.body);
}

function sessionCookieFrom(response) {
  const cookie = response.headers['Set-Cookie'];
  assert.match(cookie, /ce_session=/);
  return cookie.split(';')[0];
}

test('coach invite to claimed player creates one permanent userId across auth chat availability and subscriptions', async () => {
  kv.clear();
  lists.clear();
  sentEmails.length = 0;
  process.env.RESEND_API_KEY = 'resend_test_key';

  const coachLogin = await callApi(identityHandler, 'POST', {
    body: { action: 'login', email: 'simonbdodd@gmail.com', password: '1111' },
  });
  assert.equal(coachLogin.statusCode, 200);
  assert.equal(coachLogin.payload.user.id, 'coach-demo');
  assert.equal(coachLogin.payload.user.role, 'coach');
  const coachCookie = sessionCookieFrom(coachLogin);

  const invite = await callApi(inviteHandler, 'POST', {
    headers: { cookie: coachCookie, host: 'preview.example.test', 'x-forwarded-proto': 'https' },
    body: { name: 'Test Registered Player', role: 'player', email: 'registered.player@example.com' },
  });
  delete process.env.RESEND_API_KEY;
  assert.equal(invite.statusCode, 201);
  assert.equal(invite.payload.invite.createdBy, 'coach-demo');
  assert.equal(invite.payload.token.length >= 24, true);
  assert.match(invite.payload.url, /^https:\/\/preview\.example\.test\/\?inv=/);
  assert.equal(invite.payload.emailDelivery.sent, true);
  assert.equal(invite.payload.emailDelivery.provider, 'resend');
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'registered.player@example.com');
  assert.match(sentEmails[0].subject, /invited/i);

  const claimed = await callApi(identityHandler, 'POST', {
    body: {
      action: 'claim_invite',
      token: invite.payload.token,
      name: 'Test Registered Player',
      email: 'registered.player@example.com',
      password: 'password123',
    },
  });
  assert.equal(claimed.statusCode, 201);
  const playerUserId = claimed.payload.user.id;
  const playerCookie = sessionCookieFrom(claimed);
  assert.equal(claimed.payload.playerProfile.userId, playerUserId);
  assert.equal(claimed.payload.teamMember.userId, playerUserId);
  assert.equal(claimed.payload.teamMember.status, 'active');

  const sessionCheck = await callApi(identityHandler, 'GET', {
    query: { action: 'session' },
    headers: { cookie: playerCookie },
  });
  assert.equal(sessionCheck.statusCode, 200);
  assert.equal(sessionCheck.payload.user.id, playerUserId);
  assert.equal(sessionCheck.payload.playerProfile.userId, playerUserId);

  const coachIdentityState = await callApi(identityHandler, 'GET', {
    headers: { cookie: coachCookie },
  });
  assert.equal(coachIdentityState.statusCode, 200);
  assert.ok(coachIdentityState.payload.users.some(user => user.id === playerUserId && user.email === 'registered.player@example.com'));
  assert.ok(coachIdentityState.payload.team_members.some(member => member.userId === playerUserId && member.status === 'active'));
  assert.ok(coachIdentityState.payload.player_profiles.some(profile =>
    profile.userId === playerUserId &&
    profile.displayName === 'Test Registered Player' &&
    profile.email === 'registered.player@example.com'
  ));

  const acceptedInvites = JSON.parse(kv.get('ce:invites'));
  assert.equal(acceptedInvites[0].status, 'accepted');
  assert.equal(acceptedInvites[0].acceptedBy, playerUserId);
  assert.equal(acceptedInvites[0].name, 'Test Registered Player');

  const subscribe = await callApi(subscribeHandler, 'POST', {
    headers: { cookie: playerCookie },
    body: {
      subscription: { endpoint: 'endpoint-registered-player', keys: { p256dh: 'p', auth: 'a' } },
      label: 'Browser Label',
    },
  });
  assert.equal(subscribe.statusCode, 201);
  const subscriptions = JSON.parse(kv.get('app:subscriptions'));
  assert.equal(subscriptions[0].userId, playerUserId);
  assert.equal(subscriptions[0].playerId, playerUserId);
  assert.equal(subscriptions[0].label, 'Test Registered Player');

  const availability = await callApi(availabilityHandler, 'POST', {
    headers: { cookie: playerCookie },
    body: { response: 'available', sessionId: 'game' },
  });
  assert.equal(availability.statusCode, 200);
  const availabilityStore = JSON.parse(kv.get('app:availability:game'));
  assert.equal(availabilityStore[playerUserId].response, 'available');
  assert.equal(availabilityStore[playerUserId].label, 'Test Registered Player');
  assert.equal(availabilityStore[playerUserId].userId, playerUserId);

  const availabilityReadback = await callApi(availabilityHandler, 'GET', {
    query: { sessionId: 'game' },
    headers: { cookie: coachCookie },
  });
  assert.equal(availabilityReadback.statusCode, 200);
  assert.ok(availabilityReadback.payload.responses.some(row =>
    row.userId === playerUserId &&
    row.label === 'Test Registered Player' &&
    row.response === 'available'
  ));

  const convId = dmConvId('coach-demo', playerUserId);
  await callChat('POST', '/api/chat', {
    action: 'create_conv',
    id: convId,
    name: 'Test Registered Player',
    type: 'DIRECT',
    participants: ['coach-demo', playerUserId],
  }, { cookie: coachCookie });

  const coachMessage = await callChat('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'browser-spoof',
    senderName: 'Spoofed Coach',
    senderRole: 'player',
    text: 'Welcome to Coach Eye',
  }, { cookie: coachCookie });
  assert.equal(coachMessage.message.senderId, 'coach-demo');
  assert.equal(coachMessage.message.senderRole, 'coach');

  const playerMessages = await callChat('GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}`, null, { cookie: playerCookie });
  assert.equal(playerMessages.messages.length, 1);
  assert.equal(playerMessages.messages[0].text, 'Welcome to Coach Eye');

  const playerConversations = await callChat('GET', '/api/chat?action=conversations', null, { cookie: playerCookie });
  assert.ok(playerConversations.conversations.some(conversation => conversation.id === convId));

  const playerReply = await callChat('POST', '/api/chat', {
    action: 'send',
    convId,
    senderId: 'browser-spoof-player',
    senderName: 'Spoofed Player',
    senderRole: 'coach',
    text: 'Thanks coach',
  }, { cookie: playerCookie });
  assert.equal(playerReply.message.senderId, playerUserId);
  assert.equal(playerReply.message.senderRole, 'player');

  const coachView = await callChat('GET', `/api/chat?action=messages&convId=${encodeURIComponent(convId)}`, null, { cookie: coachCookie });
  assert.deepEqual(coachView.messages.map(message => message.text), ['Welcome to Coach Eye', 'Thanks coach']);
});
