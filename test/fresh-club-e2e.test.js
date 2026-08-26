/**
 * FRESH CLUB, DAY ZERO — the seam nothing else covered.
 *
 * Every other onboarding suite proves one half: club creation stops at the
 * tenant record, and the operational suites (availability, training, fixtures,
 * multi-group readiness) all START from a pre-seeded Boitsfort-shaped club
 * that already has a stored structure, members and history. Nothing walked a
 * club that has NEVER been touched through to actually running a session — so
 * the contract that makes it work, the read-time synthesized structure in
 * api/_structureStore.js, was upheld by nothing but hope.
 *
 * This file walks that journey end to end against the real handlers, from an
 * EMPTY store. There is no Boitsfort record anywhere in it: the only thing
 * seeded is the one platform administrator production already has.
 *
 *   provision_club  →  founder claims (and IS the owner)
 *   →  synthesized grp_initial / team_initial is real and usable
 *   →  player invited with no group named, claims into grp_initial
 *   →  the coach's availability board resolves that player's answer
 *   →  the training schedule serves its seeded slots
 *   →  a fixture is created and the player can read it
 *
 * It also pins the two failure modes a brand-new club hits first: an invite
 * whose email delivery is rejected must still hand the coach a working link,
 * and ownership must never leak to an ordinary invitation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.freshclub.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;          // public signup stays CLOSED

const kv = new Map();
/** Set by a test to make the next email send fail the way Resend rejects one. */
let emailFailure = null;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://api.resend.com')) {
    if (emailFailure) return { ok: false, status: emailFailure, json: async () => ({ message: 'Domain is not verified' }) };
    return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
  }
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const { default: publishHandler } = await import('../api/publish.js');
const { default: inviteHandler } = await import('../api/invite.js');
const { default: availabilityHandler } = await import('../api/availability.js');
const store = await import('../api/_identityStore.js');
const { permissionsFor, isClubOwner, accessProfileOf, PERM } = await import('../api/_permissions.js');
const { INITIAL_GROUP_ID, INITIAL_TEAM_ID } = await import('../api/_structureStore.js');

/** An EMPTY world plus the single platform administrator production has. */
function emptyWorld() {
  kv.clear();
  emailFailure = null;
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-platform', email: 'platform@coacheasier.com', displayName: 'Platform Admin',
      platformRole: 'platform_admin' },
  ]));
  kv.set('app:identity:teams', JSON.stringify([]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set('ce:invites', JSON.stringify([]));
}

function makeRes() {
  return { code: 0, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end(b) { this.body = this.body ?? b ?? null; return this; } };
}
async function call(handler, { method = 'GET', query = {}, body = null, token = '' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api', query, body, on() {},
    headers: { 'content-type': 'application/json', host: 'test.local',
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const publish = (method, query, body, token) => call(publishHandler, { method, query, body, token });
const invite = (body, token) => call(inviteHandler, { method: 'POST', body, token });
const members = () => JSON.parse(kv.get('app:identity:team_members') || '[]');
const tokenOf = res => String(res.headers['Set-Cookie'] || '').split(';')[0].split('=')[1];

/** provision → claim: the founder of a brand-new club, and their session. */
async function freshClub(clubName = 'Newbridge RFC', adminEmail = 'founder@newbridge.test', plan) {
  const platform = await store.createSession({ userId: 'u-platform', teamId: 'none', role: 'coach' });
  const provisioned = await identity({ action: 'provision_club', clubName, adminEmail,
    adminName: 'Frankie Founder', ...(plan === undefined ? {} : { plan }) }, platform.token);
  assert.equal(provisioned.code, 201, JSON.stringify(provisioned.body));
  const inviteToken = decodeURIComponent(String(provisioned.body.inviteUrl).split('inv=')[1]);
  const claimed = await identity({ action: 'claim_invite', token: inviteToken, email: adminEmail,
    name: 'Frankie Founder', password: 'longEnough123' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  return { clubId: provisioned.body.team.id, founder: claimed.body, provisioned: provisioned.body,
           token: tokenOf(claimed), platformToken: platform.token };
}
const teamRecord = clubId => JSON.parse(kv.get('app:identity:teams') || '[]')
  .find(t => t.id === clubId) || null;

// ── 1. THE WHOLE JOURNEY ────────────────────────────────────────────────────

test('1. day zero: a brand-new club runs a session without a single seeded record', async () => {
  emptyWorld();
  const club = await freshClub();

  // (a) The founder is the OWNER, with the permissions to set the club up.
  const founderMember = members().find(m => m.teamId === club.clubId);
  assert.equal(isClubOwner(founderMember), true, 'the first administrator owns the club');
  assert.equal(accessProfileOf(founderMember), 'full');
  const granted = permissionsFor(founderMember);
  for (const p of [PERM.MANAGE_TEAMS, PERM.MANAGE_PLAYERS, PERM.MANAGE_COACHES,
                   PERM.MANAGE_FIXTURES, PERM.REPORTS, PERM.ASSIGN_ACCESS]) {
    assert.equal(granted.has(p), true, `founder holds ${p}`);
  }

  // (b) NOTHING is stored for the structure — and the club still has one.
  assert.equal(kv.has(`app:structure:${club.clubId}`), false, 'no structure record was written');
  const structure = await publish('GET', { resource: 'structure' }, null, club.token);
  assert.equal(structure.code, 200, JSON.stringify(structure.body));
  assert.deepEqual(structure.body.structure.groups.map(g => g.id), [INITIAL_GROUP_ID]);
  assert.deepEqual(structure.body.structure.teams.map(t => t.id), [INITIAL_TEAM_ID]);
  assert.equal(structure.body.structure.groups[0].status, 'active');
  assert.equal(structure.body.structure.groups[0].name, 'Newbridge RFC', 'named after the club');

  // (c) A player is invited WITHOUT naming a group — the single synthesized
  //     group is unambiguous, so the invite resolves it silently.
  const playerInvite = await invite({ name: 'Poppy Player', role: 'player',
    email: 'poppy@newbridge.test', sendEmail: false }, club.token);
  assert.equal(playerInvite.code, 201, JSON.stringify(playerInvite.body));
  assert.equal(playerInvite.body.invite.playerGroupId, INITIAL_GROUP_ID,
    'the synthesized group is stamped on the invite');

  // (d) …and claims into that group as an active member with a roster profile.
  const claim = await identity({ action: 'claim_invite', token: playerInvite.body.token,
    email: 'poppy@newbridge.test', name: 'Poppy Player', password: 'longEnough123' });
  assert.equal(claim.code, 201, JSON.stringify(claim.body));
  const playerToken = tokenOf(claim);
  const playerId = claim.body.user.id;
  assert.equal(claim.body.teamMember.playerGroupId, INITIAL_GROUP_ID);
  assert.equal(claim.body.teamMember.status, 'active');
  assert.equal(isClubOwner(claim.body.teamMember), false, 'a player invite never confers ownership');
  const state = await store.listIdentityState(club.clubId);
  assert.ok((state.player_profiles || []).some(p => p.userId === playerId), 'roster profile created');

  // (e) The player answers availability and the COACH'S BOARD resolves it.
  const answered = await call(availabilityHandler, { method: 'POST', token: playerToken,
    body: { sessionId: 'slot_tue', response: 'available', reason: '' } });
  assert.equal(answered.code, 200, JSON.stringify(answered.body));
  const board = await call(availabilityHandler, { method: 'GET', token: club.token,
    query: { resolveRoster: '1', group: INITIAL_GROUP_ID } });
  assert.equal(board.code, 200, JSON.stringify(board.body));
  const mine = board.body.resolved[String(playerId).toLowerCase()];
  assert.ok(mine, "the new player appears on the coach's board");
  assert.equal(mine.slot_tue.response, 'available');

  // (f) The training schedule serves a usable week with no stored record.
  const schedule = await publish('GET', { resource: 'training-schedule' }, null, club.token);
  assert.equal(schedule.code, 200, JSON.stringify(schedule.body));
  assert.ok((schedule.body.slots || []).length >= 1, 'a fresh club has training nights to answer');
  assert.ok((schedule.body.slots || []).every(s => s.id && s.day), 'slots are well formed');

  // (g) A fixture is created for the synthesized group, and the PLAYER sees it.
  const fixture = await publish('POST', { resource: 'fixtures' },
    { action: 'create', groupId: INITIAL_GROUP_ID,
      fixture: { opposition: 'Oldtown RFC', date: '2026-09-12', time: '15:00', venue: 'Home' } },
    club.token);
  assert.equal(fixture.code, 201, JSON.stringify(fixture.body));
  const playerFixtures = await publish('GET', { resource: 'fixtures' }, null, playerToken);
  assert.equal(playerFixtures.code, 200);
  assert.deepEqual((playerFixtures.body.fixtures || []).map(f => f.opposition), ['Oldtown RFC']);

  // (h) Nothing about this club leaned on a legacy tenant.
  assert.equal([...kv.keys()].some(k => k.includes('boitsfort')), false,
    'no Boitsfort record was created or required at any point');
});

test('2. the synthesized structure becomes REAL on the first admin action, and keeps working', async () => {
  emptyWorld();
  const club = await freshClub('Riverside RFC', 'founder@riverside.test');

  // Creating the club's own group persists the structure (synthesized first).
  const created = await publish('POST', { resource: 'structure' },
    { op: 'create_group', name: 'Colts' }, club.token);
  assert.equal(created.code, 200, JSON.stringify(created.body));
  assert.equal(kv.has(`app:structure:${club.clubId}`), true, 'the record now exists');
  const ids = created.body.structure.groups.map(g => g.id);
  assert.ok(ids.includes(INITIAL_GROUP_ID), 'the initial group survived being materialised');
  assert.equal(ids.length, 2);

  // With TWO groups an unscoped player invite must now name one — the guard
  // that protects a club the moment it stops being single-group.
  const ambiguous = await invite({ name: 'Unassigned', role: 'player', sendEmail: false }, club.token);
  assert.equal(ambiguous.code, 400, JSON.stringify(ambiguous.body));
  assert.match(String(ambiguous.body.error), /which group/i);

  // Naming the new group works, and the claim lands there — not in the initial one.
  const colts = created.body.structure.groups.find(g => g.name === 'Colts');
  const scoped = await invite({ name: 'Colt One', role: 'player', sendEmail: false,
    playerGroupId: colts.id }, club.token);
  assert.equal(scoped.code, 201, JSON.stringify(scoped.body));
  const claim = await identity({ action: 'claim_invite', token: scoped.body.token,
    email: 'colt@riverside.test', name: 'Colt One', password: 'longEnough123' });
  assert.equal(claim.code, 201, JSON.stringify(claim.body));
  assert.equal(claim.body.teamMember.playerGroupId, colts.id);
});

// ── 2. INVITE EMAIL DELIVERY FAILURE ────────────────────────────────────────

test('3. a rejected invite email never hides the invitation — the link still comes back', async () => {
  emptyWorld();
  const club = await freshClub('Sendfail RFC', 'founder@sendfail.test');
  process.env.RESEND_API_KEY = 'test-key';
  emailFailure = 403;                                   // provider rejects the send
  try {
    const r = await invite({ name: 'Emailed Player', role: 'player',
      email: 'player@sendfail.test', sendEmail: true }, club.token);
    // The invitation was already persisted and is perfectly valid: it must be
    // returned, not buried under a 500.
    assert.equal(r.code, 201, JSON.stringify(r.body));
    assert.ok(r.body.token, 'the token is returned');
    assert.match(String(r.body.url), /\?inv=/, 'the shareable link is returned');
    assert.equal(r.body.emailDelivery.ok, false, 'delivery is reported honestly');
    assert.equal(r.body.emailDelivery.sent, false);
    assert.equal(r.body.emailDelivery.reason, 'delivery_failed');
    // Nothing sensitive travels back with the failure.
    const asText = JSON.stringify(r.body.emailDelivery);
    assert.equal(asText.includes('test-key'), false, 'the API key never leaks');
    assert.equal(asText.includes('player@sendfail.test'), false, 'the recipient is not echoed');

    // And the link genuinely works: the player can claim it.
    const claim = await identity({ action: 'claim_invite', token: r.body.token,
      email: 'player@sendfail.test', name: 'Emailed Player', password: 'longEnough123' });
    assert.equal(claim.code, 201, JSON.stringify(claim.body));
    assert.equal(claim.body.teamMember.status, 'active');
  } finally {
    delete process.env.RESEND_API_KEY;
    emailFailure = null;
  }
});

test('4. a successful send still reports success, and an unconfigured mailer is not a failure', async () => {
  emptyWorld();
  const club = await freshClub('Sendok RFC', 'founder@sendok.test');

  process.env.RESEND_API_KEY = 'test-key';
  try {
    const ok = await invite({ name: 'Mailed Player', role: 'player',
      email: 'ok@sendok.test', sendEmail: true }, club.token);
    assert.equal(ok.code, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.emailDelivery.ok, true);
    assert.equal(ok.body.emailDelivery.sent, true, 'a real send is reported as sent');
    const stored = JSON.parse(kv.get('ce:invites')).find(i => i.token === ok.body.token);
    assert.ok(stored.emailSentAt, 'the send is recorded on the invite');
  } finally { delete process.env.RESEND_API_KEY; }

  // No API key configured: skipped, not failed — unchanged behaviour.
  const skipped = await invite({ name: 'Unmailed Player', role: 'player',
    email: 'none@sendok.test', sendEmail: true }, club.token);
  assert.equal(skipped.code, 201, JSON.stringify(skipped.body));
  assert.equal(skipped.body.emailDelivery.ok, true);
  assert.equal(skipped.body.emailDelivery.sent, false);
  assert.equal(skipped.body.emailDelivery.reason, 'email_not_configured');
  assert.match(String(skipped.body.url), /\?inv=/, 'the link is always available');
});

test('5. a rejected RE-SEND is reported, and leaves the invite claimable', async () => {
  emptyWorld();
  const club = await freshClub('Resend RFC', 'founder@resend.test');
  const created = await invite({ name: 'Resend Player', role: 'player',
    email: 'resend@resend.test', sendEmail: false }, club.token);
  assert.equal(created.code, 201);

  process.env.RESEND_API_KEY = 'test-key';
  emailFailure = 422;
  try {
    const res = makeRes();
    await inviteHandler({ method: 'PATCH', query: {}, on() {},
      headers: { cookie: `ce_session=${club.token}`, host: 'test.local' },
      body: { token: created.body.token, action: 'resend' } }, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    assert.equal(res.body.emailDelivery.ok, false);
    assert.equal(res.body.emailDelivery.reason, 'delivery_failed');
    assert.equal(res.body.invite.status, 'pending', 'the invite is untouched and still claimable');
  } finally { delete process.env.RESEND_API_KEY; emailFailure = null; }

  const claim = await identity({ action: 'claim_invite', token: created.body.token,
    email: 'resend@resend.test', name: 'Resend Player', password: 'longEnough123' });
  assert.equal(claim.code, 201, JSON.stringify(claim.body));
});

// ── 3. OWNERSHIP: EXACTLY THE FOUNDER, AND NOBODY ELSE ──────────────────────

test('6. ownership reaches the provisioned founder and NO other invitation', async () => {
  emptyWorld();
  const club = await freshClub('Owned RFC', 'founder@owned.test');
  const founder = members().find(m => m.teamId === club.clubId);
  assert.equal(founder.isOwner, true);
  assert.equal(founder.accessProfile, 'full');

  // Every ordinary invitation the founder can mint — including a head coach
  // and a club administrator — creates a member who is NOT an owner.
  const cases = [
    ['coach', { name: 'Head Coach', role: 'coach', staffLevel: 'head' }, 'hc@owned.test'],
    ['admin', { name: 'Club Admin', role: 'admin' }, 'ca@owned.test'],
    ['medical', { name: 'Club Physio', role: 'medical' }, 'md@owned.test'],
    ['player', { name: 'A Player', role: 'player' }, 'pl@owned.test'],
  ];
  for (const [label, body, email] of cases) {
    const created = await invite({ ...body, email, sendEmail: false }, club.token);
    assert.equal(created.code, 201, `${label}: ${JSON.stringify(created.body)}`);
    const claim = await identity({ action: 'claim_invite', token: created.body.token,
      email, name: body.name, password: 'longEnough123' });
    assert.equal(claim.code, 201, `${label}: ${JSON.stringify(claim.body)}`);
    assert.equal(isClubOwner(claim.body.teamMember), false, `${label} must not become an owner`);
    assert.equal(claim.body.teamMember.isOwner, undefined, `${label} carries no owner flag`);
  }
  const owners = members().filter(m => m.teamId === club.clubId && isClubOwner(m));
  assert.equal(owners.length, 1, 'exactly one owner exists');
  assert.equal(owners[0].userId, founder.userId);
});

test('7. a forged founder marker in a request body is ignored', async () => {
  emptyWorld();
  const club = await freshClub('Forge RFC', 'founder@forge.test');
  // /api/invite builds its own record: the marker fields are never copied.
  const hostile = await invite({ name: 'Sneaky Coach', role: 'coach', staffLevel: 'head',
    email: 'sneak@forge.test', sendEmail: false,
    founderInvite: true, createdBy: 'platform-provisioning', isOwner: true,
    accessProfile: 'full' }, club.token);
  assert.equal(hostile.code, 201, JSON.stringify(hostile.body));
  const stored = JSON.parse(kv.get('ce:invites')).find(i => i.token === hostile.body.token);
  assert.equal(stored.founderInvite, undefined, 'the marker is not accepted from a body');
  assert.notEqual(stored.createdBy, 'platform-provisioning', 'createdBy is the real actor');

  const claim = await identity({ action: 'claim_invite', token: hostile.body.token,
    email: 'sneak@forge.test', name: 'Sneaky Coach', password: 'longEnough123' });
  assert.equal(claim.code, 201, JSON.stringify(claim.body));
  assert.equal(isClubOwner(claim.body.teamMember), false, 'no ownership from a forged marker');
});

test('8. owner protections cover the provisioned founder', async () => {
  emptyWorld();
  const club = await freshClub('Protected RFC', 'founder@protected.test');
  const founder = members().find(m => m.teamId === club.clubId);

  // A second full-access admin joins, so "last admin" rules cannot be what
  // does the protecting here.
  const adminInvite = await invite({ name: 'Second Admin', role: 'admin',
    email: 'second@protected.test', sendEmail: false }, club.token);
  const adminClaim = await identity({ action: 'claim_invite', token: adminInvite.body.token,
    email: 'second@protected.test', name: 'Second Admin', password: 'longEnough123' });
  const adminMemberId = adminClaim.body.teamMember.id;
  await store.setAccessProfile(adminMemberId, 'full', founder.userId, club.clubId);

  // The owner cannot be downgraded…
  await assert.rejects(
    () => store.setAccessProfile(founder.id, 'coach', adminClaim.body.user.id, club.clubId),
    /owner/i, 'the owner cannot be reduced');
  // …nor permanently deleted, even by another Full Access administrator.
  await assert.rejects(
    () => store.permanentlyDeleteTeamMember(founder.id, adminClaim.body.user.id, club.clubId),
    /owner/i, 'the owner cannot be deleted');
  const still = members().find(m => m.id === founder.id);
  assert.equal(isClubOwner(still), true);
  assert.equal(still.status, 'active');
  assert.equal(accessProfileOf(still), 'full');
});

test('9. a stale founder invite can never mint a SECOND owner', async () => {
  emptyWorld();
  // Provision, then hand-issue a duplicate founder-marked invite the way a
  // replayed provisioning would, and claim it with a different person.
  const club = await freshClub('Single RFC', 'founder@single.test');
  const invites = JSON.parse(kv.get('ce:invites'));
  const original = invites.find(i => i.founderInvite === true);
  assert.ok(original, 'the provisioning invite carries the marker');
  invites.push({ ...original, token: 'DUPLICATE_FOUNDER_TOKEN', email: 'second@single.test',
    status: 'pending', acceptedAt: null, acceptedBy: undefined });
  kv.set('ce:invites', JSON.stringify(invites));

  const claim = await identity({ action: 'claim_invite', token: 'DUPLICATE_FOUNDER_TOKEN',
    email: 'second@single.test', name: 'Second Person', password: 'longEnough123' });
  assert.equal(claim.code, 201, JSON.stringify(claim.body));
  assert.equal(isClubOwner(claim.body.teamMember), false,
    'the club already has an owner, so no second one is created');
  const owners = members().filter(m => m.teamId === club.clubId && isClubOwner(m));
  assert.equal(owners.length, 1);
});

test('10. self-service founders are unchanged, and ownership never crosses clubs', async () => {
  emptyWorld();
  process.env.PUBLIC_CLUB_SIGNUP = 'true';
  try {
    const self = await identity({ action: 'create_club', clubName: 'Selfmade RFC',
      teamName: 'Seniors', name: 'Sam Self', email: 'sam@selfmade.test', password: 'longEnough123' });
    assert.equal(self.code, 201, JSON.stringify(self.body));
    const m = members().find(x => x.userId === self.body.user.id);
    assert.equal(m.isOwner, true, 'self-service founder still owns their club');
    assert.equal(m.accessProfile, 'full');
    assert.equal(m.approvedBy, 'club-creation', 'and by the same route as before');
  } finally { delete process.env.PUBLIC_CLUB_SIGNUP; }

  // A second, provisioned club: its founder owns THAT club and holds nothing
  // in the first one.
  const other = await freshClub('Otherside RFC', 'founder@otherside.test');
  const otherFounder = members().find(m => m.teamId === other.clubId);
  assert.equal(isClubOwner(otherFounder), true);
  const elsewhere = members().filter(m => m.userId === otherFounder.userId && m.teamId !== other.clubId);
  assert.deepEqual(elsewhere, [], 'the founder has no membership in any other club');
  const selfmade = members().filter(m => m.teamId !== other.clubId && isClubOwner(m));
  assert.ok(selfmade.every(m => m.userId !== otherFounder.userId), 'no cross-club ownership');
});

// ── 4. PROVISIONING PLAN — the tier a club STARTS on ────────────────────────
// A provisioned club used to be born on `trial`, which sits at the same
// feature level as core, so Performance answered 402 for every new customer
// until someone edited the database by hand. The platform administrator can
// now name the tier at provisioning time. Nothing about what a plan MEANS
// changes here: trial is still trial, and only pro/enterprise entitle
// Performance (PERFORMANCE_ENTITLED_PLANS, api/publish.js).

const { PROVISIONABLE_PLANS, DEFAULT_PROVISIONED_PLAN } = store;

/** The server's own entitlement answer for a club, read the way publish.js reads it. */
async function performanceStatusFor(clubToken) {
  const r = await publish('GET', { resource: 'performance' }, null, clubToken);
  return { code: r.code, entitled: r.code === 200, reason: r.body?.code || null,
           plan: r.body?.entitlement?.plan || null };
}

test('11. provisioning on PRO entitles Performance from the first session', async () => {
  emptyWorld();
  const club = await freshClub('Prova RFC', 'founder@prova.test', 'pro');

  // Stored server-side on the club's canonical record — not just echoed back.
  assert.equal(teamRecord(club.clubId).plan, 'pro');
  assert.equal(teamRecord(club.clubId).planStatus, 'active');
  assert.equal(club.provisioned.team.plan, 'pro', 'the response reports the stored plan');
  // A pro club is not on a trial, so it carries no evaluation deadline.
  assert.equal(teamRecord(club.clubId).trialEndsAt, null);

  // The founder's session carries it, and Performance is genuinely open.
  const session = await call(identityHandler, { method: 'GET', query: { action: 'session' }, token: club.token });
  assert.equal(session.body.teamPlan, 'pro');
  assert.equal(session.body.teamPlanStatus, 'active');
  const perf = await performanceStatusFor(club.token);
  assert.equal(perf.entitled, true, `Performance must be open on pro: ${JSON.stringify(perf)}`);
  assert.equal(perf.plan, 'pro');

  // And the founder is still the owner — the ownership fix is unaffected.
  const founder = members().find(m => m.teamId === club.clubId);
  assert.equal(isClubOwner(founder), true);
  assert.equal(accessProfileOf(founder), 'full');
});

test('12. provisioning on TRIAL is unchanged: Core behaviour, Performance closed', async () => {
  emptyWorld();
  const explicit = await freshClub('Trialla RFC', 'founder@trialla.test', 'trial');
  assert.equal(teamRecord(explicit.clubId).plan, 'trial');
  assert.ok(teamRecord(explicit.clubId).trialEndsAt, 'a trial still gets its 30-day deadline');
  const perf = await performanceStatusFor(explicit.token);
  assert.equal(perf.entitled, false);
  assert.equal(perf.code, 402);
  assert.equal(perf.reason, 'performance_not_entitled');

  // Omitting the plan entirely must behave exactly as provisioning did before.
  const omitted = await freshClub('Defaulta RFC', 'founder@defaulta.test');   // no plan argument
  const stored = teamRecord(omitted.clubId);
  assert.equal(stored.plan, DEFAULT_PROVISIONED_PLAN);
  assert.equal(stored.plan, 'trial', 'backwards compatible default');
  assert.ok(stored.trialEndsAt, 'and the same 30-day trial deadline as before');
  assert.equal((await performanceStatusFor(omitted.token)).entitled, false);
});

test('13. provisioning on CORE is accepted and stays unentitled', async () => {
  emptyWorld();
  const club = await freshClub('Corea RFC', 'founder@corea.test', 'core');
  assert.equal(teamRecord(club.clubId).plan, 'core');
  assert.equal(teamRecord(club.clubId).trialEndsAt, null, 'core is a steady state, not a countdown');
  const perf = await performanceStatusFor(club.token);
  assert.equal(perf.entitled, false, 'core does not include Performance');
  assert.equal(perf.code, 402);
});

test('14. an unknown or unsupported plan is REFUSED, and creates nothing', async () => {
  emptyWorld();
  const platform = await store.createSession({ userId: 'u-platform', teamId: 'none', role: 'coach' });
  const before = JSON.parse(kv.get('app:identity:teams')).length;

  for (const bad of ['unlimited', 'free', ' ', 'pro; drop table']) {
    const r = await identity({ action: 'provision_club', clubName: `Bad ${bad} RFC`,
      adminEmail: 'bad@x.test', plan: bad }, platform.token);
    assert.equal(r.code, 400, `plan ${JSON.stringify(bad)}: ${JSON.stringify(r.body)}`);
    assert.match(String(r.body.error), /plan must be one of/i);
    assert.match(String(r.body.error), /trial/, 'the error names the valid values');
  }
  // Enterprise exists as a level but is deliberately not provisionable.
  const ent = await identity({ action: 'provision_club', clubName: 'Enterprisey RFC',
    adminEmail: 'ent@x.test', plan: 'enterprise' }, platform.token);
  assert.equal(ent.code, 400, JSON.stringify(ent.body));
  assert.equal(PROVISIONABLE_PLANS.includes('enterprise'), false);

  // NOTHING survives a refusal: no club, no team id, no orphan invitation.
  assert.equal(JSON.parse(kv.get('app:identity:teams')).length, before, 'no club created');
  const invites = JSON.parse(kv.get('ce:invites'));
  assert.equal(invites.filter(i => /^(bad|ent)@/.test(String(i.email))).length, 0, 'no invite minted');
});

test('14b. a non-string plan cannot be coerced, and case/whitespace normalise', async () => {
  emptyWorld();
  const platform = await store.createSession({ userId: 'u-platform', teamId: 'none', role: 'coach' });

  // `["pro"]` would become "pro" under String() — the type is checked instead.
  for (const bad of [['pro'], 42, true, {}]) {
    const r = await identity({ action: 'provision_club', clubName: `Typed ${JSON.stringify(bad)} RFC`,
      adminEmail: 'typed@x.test', plan: bad }, platform.token);
    assert.equal(r.code, 400, `plan ${JSON.stringify(bad)}: ${JSON.stringify(r.body)}`);
  }
  assert.deepEqual(JSON.parse(kv.get('app:identity:teams')), [], 'no club from any coercion attempt');

  // Case and surrounding whitespace ARE normalised — the same house rule the
  // role and email validators use. The allow-list still decides.
  const shouty = await identity({ action: 'provision_club', clubName: 'Shouty RFC',
    adminEmail: 'shouty@x.test', plan: '  PRO  ' }, platform.token);
  assert.equal(shouty.code, 201, JSON.stringify(shouty.body));
  assert.equal(shouty.body.team.plan, 'pro', 'normalised to the canonical value');
  assert.equal(teamRecord(shouty.body.team.id).plan, 'pro');
});

test('15. only a PLATFORM admin may choose a plan; nobody else can provision at all', async () => {
  emptyWorld();
  // A fully-powered club owner of a real club — the most privileged ordinary user.
  const club = await freshClub('Guarded RFC', 'founder@guarded.test', 'trial');
  const ownerAttempt = await identity({ action: 'provision_club', clubName: 'Sneaky Pro RFC',
    adminEmail: 'sneak@x.test', plan: 'pro' }, club.token);
  assert.equal(ownerAttempt.code, 403, JSON.stringify(ownerAttempt.body));
  assert.match(String(ownerAttempt.body.error), /Platform administrators only/i);

  // A player, and an anonymous caller.
  const playerInvite = await invite({ name: 'Plain Player', role: 'player', sendEmail: false }, club.token);
  const playerClaim = await identity({ action: 'claim_invite', token: playerInvite.body.token,
    email: 'plain@guarded.test', name: 'Plain Player', password: 'longEnough123' });
  for (const [label, token] of [['player', tokenOf(playerClaim)], ['anonymous', '']]) {
    const r = await identity({ action: 'provision_club', clubName: `${label} RFC`,
      adminEmail: `${label}@x.test`, plan: 'pro' }, token);
    assert.equal(r.code, 403, `${label}: ${JSON.stringify(r.body)}`);
  }

  // Nothing was created by any refusal, and the caller's OWN club is untouched.
  const teams = JSON.parse(kv.get('app:identity:teams'));
  assert.equal(teams.length, 1, 'only the legitimately provisioned club exists');
  assert.equal(teamRecord(club.clubId).plan, 'trial', "the caller's own plan is unchanged");
  assert.equal((await performanceStatusFor(club.token)).entitled, false);
});

test('16. a provisioned plan is scoped to its own club and changes no existing one', async () => {
  emptyWorld();
  const first = await freshClub('Alpha RFC', 'founder@alpha.test', 'trial');
  const firstBefore = JSON.stringify(teamRecord(first.clubId));

  // A second club provisioned on pro must not touch the first.
  const second = await freshClub('Beta RFC', 'founder@beta.test', 'pro');
  assert.equal(teamRecord(second.clubId).plan, 'pro');
  assert.equal(JSON.stringify(teamRecord(first.clubId)), firstBefore,
    'the existing club record is byte-identical');

  // Entitlement follows each club independently, both directions.
  assert.equal((await performanceStatusFor(second.token)).entitled, true);
  assert.equal((await performanceStatusFor(first.token)).entitled, false);

  // The pro club's founder cannot read the trial club's data, or vice versa.
  const crossRead = await publish('GET', { resource: 'structure' }, null, second.token);
  assert.equal(crossRead.code, 200);
  assert.equal(crossRead.body.structure.clubId ?? second.clubId, second.clubId);
  const alphaMembers = members().filter(m => m.teamId === first.clubId);
  assert.equal(alphaMembers.every(m => m.userId !== second.founder.user.id), true,
    'no membership leaked between clubs');
});

test('17. the admin plan list mirrors the server, and is presentation only', async () => {
  // The UI must offer exactly what the server will accept — no more (a plan
  // the server refuses would be a dead option) and no fewer.
  const html = await (await import('node:fs/promises')).readFile(
    new URL('../index.html', import.meta.url), 'utf8');
  const block = html.slice(html.indexOf('const PROVISIONING_PLAN_OPTIONS'),
                          html.indexOf('const PROVISIONING_PLAN_DEFAULT'));
  const offered = [...block.matchAll(/\['([a-z]+)',/g)].map(m => m[1]);
  assert.deepEqual(offered, PROVISIONABLE_PLANS, 'client options mirror PROVISIONABLE_PLANS');
  assert.match(html, /const PROVISIONING_PLAN_DEFAULT = 'trial'/, 'the form defaults to trial');
  assert.match(html, /id="pa-plan"/, 'the selector exists on the provisioning card');
  assert.match(html, /action: 'provision_club', clubName: name, adminEmail: email, plan/,
    'the chosen plan is sent to the server');
  // The card stays platform-admin only and free of commercial claims.
  const card = html.slice(html.indexOf('function renderPlatformAdminCard'),
                          html.indexOf('async function platformProvisionClub'));
  assert.match(card, /_myPlatformRole !== 'platform_admin'/, 'still platform-admin gated');
  for (const forbidden of ['Upgrade', '/month', 'per month', 'Buy ', 'Checkout', 'Subscribe']) {
    assert.equal(card.includes(forbidden), false, `no commercial surface: ${forbidden}`);
  }
  // No pricing is stated anywhere on the card (a currency next to a number).
  assert.equal(/[$€£]\s?\d/.test(card), false, 'no prices on an internal provisioning card');
});
