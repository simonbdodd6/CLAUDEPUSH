import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.identity.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';
process.env.COACH_DEMO_EMAIL = 'simonbdodd@gmail.com';
process.env.COACH_DEMO_PASSWORD = '1111';

const store = new Map();
globalThis.fetch = async (url, options = {}) => {
  const parsed = JSON.parse(options.body || '[]');
  if (!Array.isArray(parsed)) {
    return {
      ok: true,
      json: async () => ({ id: 'email_test_123', url }),
    };
  }
  const [command, ...args] = parsed;
  let result = null;
  if (command === 'GET') result = store.has(args[0]) ? store.get(args[0]) : null;
  if (command === 'SET') { store.set(args[0], args[1]); result = 'OK'; }
  return { ok: true, json: async () => ({ result }) };
};

const {
  approveJoinRequest,
  claimInvite,
  clearSessionCookie,
  createPasswordResetRequest,
  createSession,
  createJoinRequest,
  destroySession,
  listPendingJoinRequests,
  loginUser,
  rejectJoinRequest,
  resetPasswordWithToken,
  resolveSession,
  sessionCookie,
} = await import('../api/_identityStore.js');
const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { dmConvId, filterCoachDmPlayers } = await import('../src/chat-state.js');

function apiReq(method, { query = {}, body = {}, headers = {} } = {}) {
  return { method, query, body, headers };
}

function apiRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function callApi(handler, method, options = {}) {
  const response = apiRes();
  await handler(apiReq(method, options), response);
  return response;
}

async function seedActiveAccount({ id, email, role = 'coach', displayName = 'Coach User', teamId = 'boitsfort-rfc' }) {
  const users = JSON.parse(store.get('app:identity:users') || '[]');
  const members = JSON.parse(store.get('app:identity:team_members') || '[]');
  const profiles = JSON.parse(store.get('app:identity:player_profiles') || '[]');
  users.push({ id, email, firstName: displayName.split(' ')[0], lastName: displayName.split(' ').slice(1).join(' '), displayName });
  members.push({ id: `tm-${id}`, teamId, userId: id, role, status: 'active' });
  if (role === 'player') {
    profiles.push({ id: `profile-${id}`, teamId, teamMemberId: `tm-${id}`, userId: id, displayName, email });
  }
  store.set('app:identity:users', JSON.stringify(users));
  store.set('app:identity:team_members', JSON.stringify(members));
  store.set('app:identity:player_profiles', JSON.stringify(profiles));
  const session = await createSession({ userId: id, teamId, role });
  return { session, headers: { cookie: `ce_session=${encodeURIComponent(session.token)}` } };
}

test('player can create a pending join request with team code and email account', async () => {
  store.clear();
  const result = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Dodsy',
    lastName: 'Player',
    email: 'dodsy@example.com',
    password: 'password123',
  });

  assert.equal(result.user.email, 'dodsy@example.com');
  assert.equal(result.user.displayName, 'Dodsy Player');
  assert.equal(Object.hasOwn(result.user, 'passwordHash'), false);
  assert.equal(Object.hasOwn(result.user, 'passwordSalt'), false);
  assert.equal(result.team.id, 'boitsfort-rfc');
  assert.equal(result.teamMember.status, 'pending');
  assert.equal(result.teamMember.userId, result.user.id);
  const rawUsers = JSON.parse(store.get('app:identity:users'));
  assert.equal(typeof rawUsers[0].passwordHash, 'string');
  assert.equal(rawUsers[0].passwordAlgo, 'scrypt');
});

test('legacy SHA-256 password records login once and migrate to scrypt without changing userId', async () => {
  store.clear();
  const legacySalt = 'legacy-salt';
  const legacyPassword = 'password123';
  const legacyHash = createHash('sha256').update(`${legacySalt}:${legacyPassword}`).digest('hex');
  store.set('app:identity:users', JSON.stringify([
    {
      id: 'user_legacy_password',
      email: 'legacy.password@example.com',
      firstName: 'Legacy',
      lastName: 'Player',
      displayName: 'Legacy Player',
      passwordSalt: legacySalt,
      passwordHash: legacyHash,
      passwordSet: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
    },
  ]));
  store.set('app:identity:team_members', JSON.stringify([
    {
      id: 'tm_legacy_password',
      teamId: 'boitsfort-rfc',
      userId: 'user_legacy_password',
      role: 'player',
      status: 'active',
    },
  ]));

  const login = await loginUser({ email: 'legacy.password@example.com', password: legacyPassword });

  assert.equal(login.user.id, 'user_legacy_password');
  const users = JSON.parse(store.get('app:identity:users'));
  assert.equal(users[0].id, 'user_legacy_password');
  assert.equal(users[0].passwordAlgo, 'scrypt');
  assert.notEqual(users[0].passwordHash, legacyHash);
  assert.equal(typeof users[0].passwordMigratedAt, 'string');
});

test('coach approval creates active membership and player profile linked to permanent userId', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Nick',
    lastName: 'Player',
    email: 'nick.new@example.com',
    password: 'password123',
  });

  const approved = await approveJoinRequest(join.teamMember.id, 'coach-demo');

  assert.equal(approved.teamMember.status, 'active');
  assert.equal(approved.teamMember.approvedBy, 'coach-demo');
  assert.equal(approved.playerProfile.userId, join.user.id);
  assert.equal(approved.playerProfile.teamMemberId, join.teamMember.id);
  assert.equal(approved.playerProfile.legacyPlayerId, join.user.id);
  assert.equal(Object.hasOwn(approved.user, 'passwordHash'), false);
});

test('player cannot login before coach approval', async () => {
  store.clear();
  await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Dodsy',
    lastName: 'Player',
    email: 'dodsy@example.com',
    password: 'password123',
  });

  await assert.rejects(
    loginUser({ email: 'dodsy@example.com', password: 'password123' }),
    /Waiting for coach approval/
  );
});

test('approved player can login and resolve the same userId profile for messages', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Dodsy',
    lastName: 'Player',
    email: 'dodsy@example.com',
    password: 'password123',
  });
  await approveJoinRequest(join.teamMember.id, 'coach-demo');

  const login = await loginUser({ email: 'dodsy@example.com', password: 'password123' });

  assert.equal(login.user.id, join.user.id);
  assert.equal(login.playerProfile.userId, join.user.id);
  assert.equal(dmConvId('coach-demo', login.user.id), dmConvId('coach-demo', login.playerProfile.userId));
  assert.equal(Object.hasOwn(login.user, 'passwordHash'), false);
  assert.equal(typeof login.session.token, 'string');
  assert.equal(login.session.userId, join.user.id);
});

test('coach invite claim creates permanent player account profile and login session', async () => {
  store.clear();
  store.set('ce:invites', JSON.stringify([
    {
      token: 'InviteToken1',
      name: 'Dodsy Player',
      role: 'player',
      email: 'dodsy.invited@example.com',
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      acceptedAt: null,
    },
  ]));

  const claimed = await claimInvite({
    token: 'InviteToken1',
    name: 'Dodsy Player',
    email: 'dodsy.invited@example.com',
    password: 'password123',
  });

  assert.equal(claimed.user.email, 'dodsy.invited@example.com');
  assert.equal(claimed.user.role, 'player');
  assert.equal(claimed.teamMember.status, 'active');
  assert.equal(claimed.teamMember.userId, claimed.user.id);
  assert.equal(claimed.playerProfile.userId, claimed.user.id);
  assert.equal(claimed.playerProfile.legacyPlayerId, `inv-${'InviteToken1'.slice(-8)}`);
  assert.equal(typeof claimed.session.token, 'string');
  const invites = JSON.parse(store.get('ce:invites'));
  assert.equal(invites[0].status, 'accepted');
  assert.equal(invites[0].acceptedBy, claimed.user.id);
});

test('coach invite email sends secure expiring link when email provider is configured', async () => {
  store.clear();
  process.env.RESEND_API_KEY = 'resend_test_key';
  const coachAuth = await seedActiveAccount({
    id: 'user-email-coach',
    email: 'email.coach@example.com',
    role: 'coach',
    displayName: 'Email Coach',
  });
  const created = await callApi(inviteHandler, 'POST', {
    headers: { ...coachAuth.headers, host: 'preview.example.test', 'x-forwarded-proto': 'https' },
    body: { name: 'Email Invite Player', role: 'player', email: 'email.invite@example.com' },
  });
  delete process.env.RESEND_API_KEY;

  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.emailDelivery.sent, true);
  assert.equal(created.payload.emailDelivery.provider, 'resend');
  assert.equal(created.payload.token.length >= 24, true);
  assert.match(created.payload.url, /^https:\/\/preview\.example\.test\/\?inv=/);
  assert.ok(created.payload.invite.expiresAt);

  const token = created.payload.token;
  const valid = await callApi(inviteHandler, 'GET', { query: { token } });
  assert.equal(valid.statusCode, 200);

  const invites = JSON.parse(store.get('ce:invites'));
  invites[0].expiresAt = '2020-01-01T00:00:00.000Z';
  store.set('ce:invites', JSON.stringify(invites));
  const expired = await callApi(inviteHandler, 'GET', { query: { token } });
  assert.equal(expired.statusCode, 410);
});

test('login attempts are rate limited and audited', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Rate',
    lastName: 'Player',
    email: 'rate.player@example.com',
    password: 'password123',
  });
  await approveJoinRequest(join.teamMember.id, 'coach-demo');

  const headers = { 'x-forwarded-for': '203.0.113.10' };
  for (let i = 0; i < 5; i += 1) {
    const failed = await callApi(identityHandler, 'POST', {
      headers,
      body: { action: 'login', email: 'rate.player@example.com', password: 'wrongpass' },
    });
    assert.equal(failed.statusCode, 401);
  }
  const limited = await callApi(identityHandler, 'POST', {
    headers,
    body: { action: 'login', email: 'rate.player@example.com', password: 'wrongpass' },
  });
  assert.equal(limited.statusCode, 429);

  const audit = JSON.parse(store.get('app:identity:audit_log'));
  assert.equal(audit.filter(entry => entry.event === 'login_failure').length, 5);
  assert.equal(audit[0].email, 'rate.player@example.com');
});

test('successful login and invite claim write audit log entries without exposing passwords', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Audit',
    lastName: 'Player',
    email: 'audit.player@example.com',
    password: 'password123',
  });
  await approveJoinRequest(join.teamMember.id, 'coach-demo');

  const login = await callApi(identityHandler, 'POST', {
    headers: { 'x-forwarded-for': '203.0.113.11' },
    body: { action: 'login', email: 'audit.player@example.com', password: 'password123' },
  });
  assert.equal(login.statusCode, 200);

  store.set('ce:invites', JSON.stringify([
    {
      token: 'AuditInviteToken',
      name: 'Audit Invite',
      role: 'player',
      email: 'audit.invite@example.com',
      status: 'pending',
      createdAt: '2026-06-04T00:00:00.000Z',
      acceptedAt: null,
    },
  ]));
  const claim = await callApi(identityHandler, 'POST', {
    headers: { 'x-forwarded-for': '203.0.113.12' },
    body: {
      action: 'claim_invite',
      token: 'AuditInviteToken',
      name: 'Audit Invite',
      email: 'audit.invite@example.com',
      password: 'password123',
    },
  });
  assert.equal(claim.statusCode, 201);

  const audit = JSON.parse(store.get('app:identity:audit_log'));
  assert.ok(audit.some(entry => entry.event === 'login_success' && entry.userId === join.user.id));
  assert.ok(audit.some(entry => entry.event === 'invite_claimed' && entry.email === 'audit.invite@example.com'));
  assert.equal(audit.some(entry => Object.hasOwn(entry, 'password')), false);
});

test('invite creation and password reset actions are audited and rate limited', async () => {
  store.clear();
  const coachAuth = await seedActiveAccount({
    id: 'user-security-coach',
    email: 'security.coach@example.com',
    role: 'coach',
    displayName: 'Security Coach',
  });
  const invite = await callApi(inviteHandler, 'POST', {
    headers: { ...coachAuth.headers, 'x-forwarded-for': '203.0.113.13' },
    body: { name: 'Security Invite', role: 'player', email: 'security.invite@example.com', sendEmail: false },
  });
  assert.equal(invite.statusCode, 201);

  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Reset',
    lastName: 'Audit',
    email: 'reset.audit@example.com',
    password: 'password123',
  });
  await approveJoinRequest(join.teamMember.id, 'coach-demo');
  const request = await callApi(identityHandler, 'POST', {
    headers: { 'x-forwarded-for': '203.0.113.14' },
    body: { action: 'request_password_reset', email: 'reset.audit@example.com' },
  });
  assert.equal(request.statusCode, 200);

  const resetToken = (await createPasswordResetRequest({ email: 'reset.audit@example.com' })).token;
  const reset = await callApi(identityHandler, 'POST', {
    headers: { 'x-forwarded-for': '203.0.113.14' },
    body: { action: 'reset_password', token: resetToken, password: 'newpass123' },
  });
  assert.equal(reset.statusCode, 200);

  for (let i = 0; i < 5; i += 1) {
    const allowed = await callApi(identityHandler, 'POST', {
      headers: { 'x-forwarded-for': '203.0.113.15' },
      body: { action: 'request_password_reset', email: 'reset.audit@example.com' },
    });
    assert.equal(allowed.statusCode, 200);
  }
  const limited = await callApi(identityHandler, 'POST', {
    headers: { 'x-forwarded-for': '203.0.113.15' },
    body: { action: 'request_password_reset', email: 'reset.audit@example.com' },
  });
  assert.equal(limited.statusCode, 429);

  const audit = JSON.parse(store.get('app:identity:audit_log'));
  assert.ok(audit.some(entry => entry.event === 'invite_created' && entry.createdBy === 'user-security-coach'));
  assert.ok(audit.some(entry => entry.event === 'password_reset_requested' && entry.email === 'reset.audit@example.com'));
  assert.ok(audit.some(entry => entry.event === 'password_reset_completed' && entry.userId === join.user.id));
});

test('session validation and logout use opaque server-side session tokens', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Session',
    lastName: 'Player',
    email: 'session.player@example.com',
    password: 'password123',
  });
  await approveJoinRequest(join.teamMember.id, 'coach-demo');
  const login = await loginUser({ email: 'session.player@example.com', password: 'password123' });
  const cookie = sessionCookie(login.session.token);

  assert.match(cookie, /^ce_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const resolved = await resolveSession(login.session.token);
  assert.equal(resolved.user.id, join.user.id);
  assert.equal(resolved.teamMember.status, 'active');
  assert.equal(resolved.playerProfile.userId, join.user.id);

  await destroySession(login.session.token);
  assert.equal(await resolveSession(login.session.token), null);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test('password reset uses expiring token and preserves permanent userId and message keys', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Reset',
    lastName: 'Player',
    email: 'reset.player@example.com',
    password: 'oldpass123',
  });
  await approveJoinRequest(join.teamMember.id, 'coach-demo');
  const beforeLogin = await loginUser({ email: 'reset.player@example.com', password: 'oldpass123' });
  const beforeUserId = beforeLogin.user.id;
  const beforeConvId = dmConvId('coach-demo', beforeUserId);

  const request = await createPasswordResetRequest({ email: 'reset.player@example.com' });
  assert.equal(request.user.id, beforeUserId);
  assert.equal(typeof request.token, 'string');
  assert.ok(request.expiresAt);

  const reset = await resetPasswordWithToken({ token: request.token, password: 'newpass123' });
  assert.equal(reset.user.id, beforeUserId);
  assert.equal(dmConvId('coach-demo', reset.user.id), beforeConvId);

  await assert.rejects(
    loginUser({ email: 'reset.player@example.com', password: 'oldpass123' }),
    /Invalid email or password/
  );
  const afterLogin = await loginUser({ email: 'reset.player@example.com', password: 'newpass123' });
  assert.equal(afterLogin.user.id, beforeUserId);

  await assert.rejects(
    resetPasswordWithToken({ token: request.token, password: 'another123' }),
    /invalid or expired/i
  );
});

test('legacy Simon coach test account can create a permanent coach session for invite management', async () => {
  store.clear();
  const login = await loginUser({ email: 'simonbdodd@gmail.com', password: '1111' });

  assert.equal(login.user.id, 'coach-demo');
  assert.equal(login.user.role, 'coach');
  assert.equal(login.teamMember.status, 'active');
  assert.equal(login.teamMember.approvedBy, 'legacy-migration');
  assert.equal(typeof login.session.token, 'string');

  const created = await callApi(inviteHandler, 'POST', {
    headers: { cookie: `ce_session=${encodeURIComponent(login.session.token)}` },
    body: { name: 'Invited From Coach', role: 'player', email: 'invited.from.coach@example.com' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.invite.createdBy, 'coach-demo');
});

test('legacy Simon coach bridge rejects the wrong password', async () => {
  store.clear();
  await assert.rejects(
    loginUser({ email: 'simonbdodd@gmail.com', password: 'wrong' }),
    /Invalid email or password/
  );
});

test('rejected join request does not create an active player profile', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Reject',
    lastName: 'Player',
    email: 'reject@example.com',
    password: 'password123',
  });

  const rejected = await rejectJoinRequest(join.teamMember.id, 'coach-demo');
  const pending = await listPendingJoinRequests();
  const profiles = JSON.parse(store.get('app:identity:player_profiles') || '[]');

  assert.equal(rejected.teamMember.status, 'rejected');
  assert.equal(pending.length, 0);
  assert.equal(profiles.length, 0);
});

test('approved account userId is the direct-message participant id for new players', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Dodsy',
    lastName: 'Player',
    email: 'dodsy@example.com',
    password: 'password123',
  });
  const approved = await approveJoinRequest(join.teamMember.id, 'coach-demo');

  const coachConvId = dmConvId('coach-demo', approved.user.id);
  const playerPortalConvId = dmConvId('coach-demo', approved.playerProfile.userId);

  assert.equal(playerPortalConvId, coachConvId);
});

test('existing legacy conversation ids remain intact while new userId ids are introduced', async () => {
  store.clear();
  const simonLegacyConv = dmConvId('coach-demo', 'inv-YxnjxnQa');
  const nickLegacyConv = dmConvId('coach-demo', 'inv-nick1234');
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'New',
    lastName: 'Player',
    email: 'new.player@example.com',
    password: 'password123',
  });
  const approved = await approveJoinRequest(join.teamMember.id, 'coach-demo');

  assert.equal(simonLegacyConv, 'dm:coach-demo:inv-YxnjxnQa');
  assert.equal(nickLegacyConv, 'dm:coach-demo:inv-nick1234');
  assert.equal(dmConvId('coach-demo', approved.user.id).startsWith('dm:coach-demo:user_'), true);
});

test('coach-only identity actions require an active coach or admin session', async () => {
  store.clear();
  const join = await createJoinRequest({
    teamCode: 'BOITSFORT',
    firstName: 'Approval',
    lastName: 'Player',
    email: 'approval.player@example.com',
    password: 'password123',
  });

  const noSession = await callApi(identityHandler, 'POST', {
    body: { action: 'approve', memberId: join.teamMember.id, approvedBy: 'spoofed-coach' },
  });
  assert.equal(noSession.statusCode, 401);

  const playerAuth = await seedActiveAccount({
    id: 'user-auth-player',
    email: 'auth.player@example.com',
    role: 'player',
    displayName: 'Auth Player',
  });
  const asPlayer = await callApi(identityHandler, 'POST', {
    headers: playerAuth.headers,
    body: { action: 'approve', memberId: join.teamMember.id },
  });
  assert.equal(asPlayer.statusCode, 403);

  const coachAuth = await seedActiveAccount({
    id: 'user-auth-coach',
    email: 'auth.coach@example.com',
    role: 'coach',
    displayName: 'Auth Coach',
  });
  const asCoach = await callApi(identityHandler, 'POST', {
    headers: coachAuth.headers,
    body: { action: 'approve', memberId: join.teamMember.id, approvedBy: 'spoofed-coach' },
  });
  assert.equal(asCoach.statusCode, 200);
  assert.equal(asCoach.payload.ok, true);
  assert.equal(asCoach.payload.teamMember.approvedBy, 'user-auth-coach');
});

test('coach-only invite management requires coach or admin session while token validation stays public', async () => {
  store.clear();
  const noSessionCreate = await callApi(inviteHandler, 'POST', {
    body: { name: 'Invite Player', role: 'player', email: 'invite.player@example.com' },
  });
  assert.equal(noSessionCreate.statusCode, 401);

  const playerAuth = await seedActiveAccount({
    id: 'user-invite-player',
    email: 'invite.player.session@example.com',
    role: 'player',
    displayName: 'Invite Player',
  });
  const playerCreate = await callApi(inviteHandler, 'POST', {
    headers: playerAuth.headers,
    body: { name: 'Invite Player', role: 'player', email: 'invite.player@example.com' },
  });
  assert.equal(playerCreate.statusCode, 403);

  const adminAuth = await seedActiveAccount({
    id: 'user-invite-admin',
    email: 'invite.admin@example.com',
    role: 'admin',
    displayName: 'Invite Admin',
  });
  const created = await callApi(inviteHandler, 'POST', {
    headers: adminAuth.headers,
    body: { name: 'Invite Player', role: 'player', email: 'invite.player@example.com' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.payload.invite.createdBy, 'user-invite-admin');

  const token = created.payload.token;
  const publicValidate = await callApi(inviteHandler, 'GET', { query: { token } });
  assert.equal(publicValidate.statusCode, 200);
  assert.equal(publicValidate.payload.valid, true);

  const publicList = await callApi(inviteHandler, 'GET');
  assert.equal(publicList.statusCode, 401);

  const adminList = await callApi(inviteHandler, 'GET', { headers: adminAuth.headers });
  assert.equal(adminList.statusCode, 200);
  assert.equal(adminList.payload.invites.length, 1);
});

test('tenant isolation blocks coaches from reading or approving another team identity data', async () => {
  store.clear();
  store.set('app:identity:teams', JSON.stringify([
    { id: 'boitsfort-rfc', name: 'Boitsfort RFC', teamCode: 'BOITSFORT' },
    { id: 'other-club', name: 'Other Club', teamCode: 'OTHER' },
  ]));
  const coach = await seedActiveAccount({
    id: 'tenant-coach-a',
    email: 'tenant.coach.a@example.com',
    role: 'coach',
    displayName: 'Tenant Coach A',
    teamId: 'boitsfort-rfc',
  });
  await seedActiveAccount({
    id: 'tenant-player-a',
    email: 'tenant.player.a@example.com',
    role: 'player',
    displayName: 'Tenant Player A',
    teamId: 'boitsfort-rfc',
  });
  await seedActiveAccount({
    id: 'tenant-player-b',
    email: 'tenant.player.b@example.com',
    role: 'player',
    displayName: 'Tenant Player B',
    teamId: 'other-club',
  });
  const members = JSON.parse(store.get('app:identity:team_members'));
  members.push({
    id: 'tm-pending-other',
    teamId: 'other-club',
    userId: 'tenant-pending-other',
    role: 'player',
    status: 'pending',
  });
  const users = JSON.parse(store.get('app:identity:users'));
  users.push({
    id: 'tenant-pending-other',
    email: 'pending.other@example.com',
    firstName: 'Pending',
    lastName: 'Other',
    displayName: 'Pending Other',
  });
  store.set('app:identity:users', JSON.stringify(users));
  store.set('app:identity:team_members', JSON.stringify(members));

  const ownState = await callApi(identityHandler, 'GET', { headers: coach.headers });
  assert.equal(ownState.statusCode, 200);
  assert.deepEqual(ownState.payload.teams.map(team => team.id), ['boitsfort-rfc']);
  assert.equal(ownState.payload.users.some(user => user.id === 'tenant-player-a'), true);
  assert.equal(ownState.payload.users.some(user => user.id === 'tenant-player-b'), false);

  const crossRead = await callApi(identityHandler, 'GET', {
    headers: coach.headers,
    query: { teamId: 'other-club' },
  });
  assert.equal(crossRead.statusCode, 403);

  const crossApprove = await callApi(identityHandler, 'POST', {
    headers: coach.headers,
    body: { action: 'approve', memberId: 'tm-pending-other' },
  });
  assert.equal(crossApprove.statusCode, 403);
});

test('coach sees Boitsfort compatibility members and pending requests after tenant isolation', async () => {
  store.clear();
  const coach = await seedActiveAccount({
    id: 'boitsfort-compat-coach',
    email: 'boitsfort.compat.coach@example.com',
    role: 'coach',
    displayName: 'Boitsfort Compat Coach',
    teamId: 'boitsfort-rfc',
  });
  const users = JSON.parse(store.get('app:identity:users'));
  const members = JSON.parse(store.get('app:identity:team_members'));
  users.push({
    id: 'pending-boitsfort-player',
    email: 'pending.boitsfort@example.com',
    firstName: 'Pending',
    lastName: 'Boitsfort',
    displayName: 'Pending Boitsfort',
  }, {
    id: 'pending-other-player',
    email: 'pending.other.club@example.com',
    firstName: 'Pending',
    lastName: 'Other',
    displayName: 'Pending Other',
  });
  members.push({
    id: 'tm-pending-boitsfort-player',
    teamId: 'boitsfort-rfc',
    userId: 'pending-boitsfort-player',
    role: 'player',
    status: 'pending',
  }, {
    id: 'tm-pending-other-player',
    teamId: 'other-club',
    userId: 'pending-other-player',
    role: 'player',
    status: 'pending',
  });
  store.set('app:identity:users', JSON.stringify(users));
  store.set('app:identity:team_members', JSON.stringify(members));

  const state = await callApi(identityHandler, 'GET', { headers: coach.headers });

  assert.equal(state.statusCode, 200);
  const profileNames = state.payload.player_profiles.map(profile => profile.displayName);

  // After the cleanup migration, only Simon Test Player is a legacy compat account.
  assert.equal(profileNames.includes('Simon Test Player'), true);

  // Removed legacy test accounts must not appear in profiles.
  assert.equal(profileNames.includes('Nick Player'), false,    'Nick Player must be removed');
  assert.equal(profileNames.includes('Nick Marshall'), false,  'Nick Marshall must be removed');
  assert.equal(profileNames.includes('Dodsy Player'), false,   'Dodsy Player must be removed');
  assert.equal(profileNames.includes('Simon Player'), false,   'Simon Player must be removed');

  assert.equal(state.payload.pending.length, 1);
  assert.equal(state.payload.pending[0].id, 'tm-pending-boitsfort-player');

  const pickerPlayers = state.payload.player_profiles.map(profile => ({
    id: String(profile.userId || '').startsWith('player-') && profile.legacyPlayerId ? profile.legacyPlayerId : profile.userId,
    name: profile.displayName,
    position: profile.position || 'TBC',
    email: profile.email || '',
  }));
  const simonResults = filterCoachDmPlayers(pickerPlayers, 'simon', 'coach-demo');
  assert.equal(simonResults.some(player => player.name === 'Simon Test Player'), true);
});

test('tenant isolation scopes invite management to the coach session team', async () => {
  store.clear();
  const coach = await seedActiveAccount({
    id: 'invite-tenant-coach',
    email: 'invite.tenant.coach@example.com',
    role: 'coach',
    displayName: 'Invite Tenant Coach',
    teamId: 'boitsfort-rfc',
  });
  store.set('ce:invites', JSON.stringify([
    {
      token: 'OtherTeamInvite',
      teamId: 'other-club',
      name: 'Other Team Player',
      role: 'player',
      email: 'other.team.player@example.com',
      status: 'pending',
      createdAt: '2026-06-05T00:00:00.000Z',
    },
    {
      token: 'OwnTeamInvite',
      teamId: 'boitsfort-rfc',
      name: 'Own Team Player',
      role: 'player',
      email: 'own.team.player@example.com',
      status: 'pending',
      createdAt: '2026-06-05T00:00:00.000Z',
    },
  ]));

  const list = await callApi(inviteHandler, 'GET', { headers: coach.headers });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.payload.invites.map(invite => invite.token), ['OwnTeamInvite']);

  const crossList = await callApi(inviteHandler, 'GET', {
    headers: coach.headers,
    query: { teamId: 'other-club' },
  });
  assert.equal(crossList.statusCode, 403);

  const crossApprove = await callApi(inviteHandler, 'PATCH', {
    headers: coach.headers,
    body: { token: 'OtherTeamInvite' },
  });
  assert.equal(crossApprove.statusCode, 403);

  const ownApprove = await callApi(inviteHandler, 'PATCH', {
    headers: coach.headers,
    body: { token: 'OwnTeamInvite' },
  });
  assert.equal(ownApprove.statusCode, 200);
});

// ─── Production incident regression (2026-06-11) ─────────────────────────────
// "Invalid email or password" reported for the coach account. Root cause was
// credential confusion (near-miss email), NOT a broken store. These tests pin
// the guarantees that made diagnosis possible:
//  1. The env-credential fallback logs the coach in even when the stored
//     Redis hash is stale or corrupted (credential drift protection)
//  2. A near-miss email fails with exactly 'Invalid email or password'
//  3. A successful fallback login REPAIRS the stored hash so the next login
//     passes the normal verification path

test('coach env-credential fallback survives a stale stored hash and repairs it', async () => {
  store.clear();
  // Seed coach-demo with a CORRUPTED password hash (credential drift)
  store.set('app:identity:users', JSON.stringify([{
    id: 'coach-demo', email: 'simonbdodd@gmail.com',
    firstName: 'Simon', lastName: 'Coach', displayName: 'Simon Coach',
    authProvider: 'legacy-password', passwordSet: true,
    passwordAlgo: 'scrypt', passwordSalt: 'deadbeef', passwordHash: 'not-a-real-hash',
  }]));
  store.set('app:identity:team_members', JSON.stringify([{
    id: 'tm_coach-demo', teamId: 'boitsfort-rfc', userId: 'coach-demo', role: 'coach', status: 'active',
  }]));

  // Env password still logs in despite the corrupted stored hash
  const login = await loginUser({ email: 'simonbdodd@gmail.com', password: '1111' });
  assert.equal(login.user.id, 'coach-demo');
  assert.equal(login.user.role, 'coach');

  // The fallback repaired the stored hash — normal verification now passes
  const second = await loginUser({ email: 'simonbdodd@gmail.com', password: '1111' });
  assert.equal(second.user.id, 'coach-demo');
  const users = JSON.parse(store.get('app:identity:users'));
  assert.notEqual(users.find(u => u.id === 'coach-demo').passwordHash, 'not-a-real-hash');
});

test('near-miss coach email fails with exactly the reported error', async () => {
  store.clear();
  await assert.rejects(
    // simonbdodd1@ (git author email) vs simonbdodd@ (account email)
    loginUser({ email: 'simonbdodd1@gmail.com', password: '1111' }),
    /Invalid email or password/,
  );
});
