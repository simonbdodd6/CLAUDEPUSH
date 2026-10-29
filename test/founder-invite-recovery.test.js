/**
 * FOUNDER INVITATION STATUS AND REISSUE (trial readiness: Nick onboards a club alone).
 *
 * provision_club returns the founder's claim link exactly once and sends no
 * email. Lose it, mistype the founder's address, or let the 14 days pass, and
 * nothing in the product could say whether the founder ever claimed — let
 * alone mint a replacement: re-provisioning answers 409 club_name_taken. That
 * was a database job. These tests pin the two platform-administrator surfaces
 * that replace it:
 *
 *   GET  ?action=platform_founder_invites   status per club — never a token
 *   POST action=founder_invite_link         the current link, ONLY while pending
 *   POST action=reissue_founder_invite      revoke every live founder link, mint one
 *
 * Real handlers over an in-memory store. The platform administrator holds NO
 * membership of any club (as production); owner, admin, player and anonymous
 * are the people who must never reach these surfaces.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.founder-recovery.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;
delete process.env.APP_URL;

const kv = new Map();
/** Fault injection: make the Nth SET of one key fail once, as a storage outage would. */
let failSet = null;                       // { key, nth, seen }
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') {
    if (failSet && args[0] === failSet.key && ++failSet.seen === failSet.nth) {
      failSet = null;
      throw new Error('storage write failed');
    }
    // NX honoured, so the store locks behave as they do against Redis.
    if (String(args[2] || '').toUpperCase() === 'NX' && kv.has(args[0])) result = null;
    else { kv.set(args[0], args[1]); result = 'OK'; }
  }
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
const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { isClubOwner, accessProfileOf } = await import('../api/_permissions.js');

const CLUB = 'kestrel-rfc';              // a self-service club with an owner (never provisioned)
const LEGACY = 'oldfield-rfc';           // an ownerless club with no provisioning record at all
const DAY = 24 * 60 * 60 * 1000;

function seed() {
  kv.clear();
  failSet = null;
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB, name: 'Kestrel RFC', plan: 'core', planStatus: 'active', teamCode: 'KESTR11',
      createdAt: '2026-01-01T00:00:00.000Z', signupSource: 'self_service' },
    { id: LEGACY, name: 'Oldfield RFC', plan: 'trial', planStatus: 'active', teamCode: 'OLDFI22',
      createdAt: '2026-02-02T00:00:00.000Z' },
  ]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon',  email: 'simon@coacheasier.com', displayName: 'Simon', platformRole: 'platform_admin' },
    { id: 'u-owner',  email: 'owner@kestrel.test',    displayName: 'Club Owner' },
    { id: 'u-admin',  email: 'admin@kestrel.test',    displayName: 'Club Admin' },
    { id: 'u-player', email: 'player@kestrel.test',   displayName: 'A Player' },
    { id: 'u-old',    email: 'coach@oldfield.test',   displayName: 'Old Coach' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-owner',  teamId: CLUB, userId: 'u-owner',  role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-admin',  teamId: CLUB, userId: 'u-admin',  role: 'admin', status: 'active', accessProfile: 'full' },
    { id: 'm-player', teamId: CLUB, userId: 'u-player', role: 'player', status: 'active', playerGroupId: 'grp_initial' },
    { id: 'm-old',    teamId: LEGACY, userId: 'u-old',  role: 'coach', staffLevel: 'head', status: 'active' },
  ]));
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
let ipSeq = 0;
async function call(handler, { method = 'POST', query = {}, body = null, token = '', host = 'test.local' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api/identity', query, body, on() {},
    headers: { 'content-type': 'application/json', host, 'x-forwarded-for': `10.9.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`,
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const identityGet = (query, token) => call(identityHandler, { method: 'GET', query, token });
const validate = token => call(inviteHandler, { method: 'GET', query: { token } });

const teams = () => kv.get('app:identity:teams');
const members = () => JSON.parse(kv.get('app:identity:team_members') || '[]');
const users = () => kv.get('app:identity:users');
const clubInvitesRaw = teamId => kv.get(`app:invites:${teamId}`) || '[]';
const clubInvites = teamId => JSON.parse(clubInvitesRaw(teamId));
const audits = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };
const sessionFor = (userId, teamId = CLUB, role = 'coach') => store.createSession({ userId, teamId, role });
const tokenOf = res => String(res.headers['Set-Cookie'] || '').split(';')[0].split('=')[1];

const founders = token => identityGet({ action: 'platform_founder_invites' }, token);
const rowFor = (res, teamId) => (res.body?.founders || []).find(f => f.teamId === teamId) || null;
const link = (teamId, token, extra = {}) => identity({ action: 'founder_invite_link', teamId, ...extra }, token);
const reissue = (teamId, token, extra = {}) => identity({ action: 'reissue_founder_invite', teamId, ...extra }, token);
const tokenFromUrl = url => decodeURIComponent(String(url).split('inv=')[1] || '');

/** A brand-new club exactly as Nick creates one; nothing claimed yet. */
async function provision(clubName, adminEmail, token) {
  const r = await identity({ action: 'provision_club', clubName, adminEmail, adminName: 'Fran Founder' }, token);
  assert.equal(r.code, 201, JSON.stringify(r.body));
  return { clubId: r.body.team.id, token: tokenFromUrl(r.body.inviteUrl), email: adminEmail };
}
const claim = (token, email) => identity({ action: 'claim_invite', token, email, name: 'Fran Founder',
  password: 'longEnough123', position: '2 — Hooker' });
/** Rewrite one field of the stored founder invite — the way time or an operator would. */
function patchInvite(teamId, token, patch) {
  const list = clubInvites(teamId);
  const at = list.findIndex(i => i.token === token);
  assert.ok(at >= 0, 'precondition: the invite is stored in its club list');
  list[at] = { ...list[at], ...patch };
  kv.set(`app:invites:${teamId}`, JSON.stringify(list));
}
const founderInvites = teamId => clubInvites(teamId).filter(i => i.createdBy === 'platform-provisioning');

// ── F1. Status ───────────────────────────────────────────────────────────────

test('F1. a platform admin sees a freshly provisioned club as PENDING, with email and expiry — and never the token', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const before = Date.now();
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const r = await founders(simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const row = rowFor(r, club.clubId);
  assert.ok(row, 'the new club is listed');
  assert.equal(row.clubName, 'Newbridge RFC');
  assert.equal(row.status, 'pending');
  assert.equal(row.email, 'founder@newbridge.test');
  assert.equal(row.ownerExists, false);
  assert.equal(row.canReissue, true);
  assert.equal(row.canCopyLink, true);
  const expires = new Date(row.expiresAt).getTime();
  assert.ok(expires > before + 13 * DAY && expires < before + 15 * DAY, `14-day expiry, got ${row.expiresAt}`);
  assert.ok(row.invitedAt, 'when the invitation was created');
  const raw = JSON.stringify(r.body);
  assert.equal(raw.includes(club.token), false, 'the status listing never carries the token');
  assert.equal(/"token"/.test(raw), false, 'no token field at all');
});

test('F1b. every club is classified: a self-service club is CLAIMED (it has its owner), an ownerless legacy club is NONE', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const r = await founders(simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const kestrel = rowFor(r, CLUB);
  assert.equal(kestrel.status, 'claimed');
  assert.equal(kestrel.ownerExists, true);
  assert.equal(kestrel.canReissue, false);
  assert.equal(kestrel.canCopyLink, false);
  const old = rowFor(r, LEGACY);
  assert.equal(old.status, 'none', 'no provisioning invitation exists to speak of');
  assert.equal(old.ownerExists, false);
  assert.equal(old.canReissue, false, 'nothing to reissue — there is no founder invitation to rotate');
  assert.equal(old.canCopyLink, false);
});

// ── F2. Authority ────────────────────────────────────────────────────────────

test('F2. only a platform administrator reaches any of the three surfaces; forged roles are ignored; nothing is written', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const invitesBefore = clubInvitesRaw(club.clubId);
  const actors = {
    owner: (await sessionFor('u-owner')).token,
    admin: (await sessionFor('u-admin')).token,
    player: (await sessionFor('u-player', CLUB, 'player')).token,
    anonymous: '',
  };
  for (const [who, token] of Object.entries(actors)) {
    const a = await founders(token);
    assert.equal(a.code, 403, `${who}: status is refused`);
    assert.match(String(a.body?.error), /Platform administrators only/);
    const b = await link(club.clubId, token);
    assert.equal(b.code, 403, `${who}: link is refused`);
    assert.equal(JSON.stringify(b.body).includes(club.token), false, `${who}: no token leaks in a refusal`);
    const c = await reissue(club.clubId, token);
    assert.equal(c.code, 403, `${who}: reissue is refused`);
    // Forged platform authority in the body or the query changes nothing.
    const d = await reissue(club.clubId, token, { platformRole: 'platform_admin', role: 'platform_admin' });
    assert.equal(d.code, 403, `${who}: a forged body role is ignored`);
    const e = await identityGet({ action: 'platform_founder_invites', platformRole: 'platform_admin' }, token);
    assert.equal(e.code, 403, `${who}: a forged query role is ignored`);
  }
  assert.equal(clubInvitesRaw(club.clubId), invitesBefore, 'no refusal wrote anything');
});

// ── F3. The current link, while pending ──────────────────────────────────────

test('F3. the current link is returned to a platform admin while the invitation is pending, and the view is audited without the token', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const r = await link(club.clubId, simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(tokenFromUrl(r.body.inviteUrl), club.token, 'the SAME invitation, not a new one');
  assert.match(r.body.inviteUrl, /^https:\/\/test\.local\/\?inv=/, 'a full link the admin can paste');
  assert.equal(r.body.email, 'founder@newbridge.test');
  assert.ok(r.body.expiresAt);
  assert.equal(r.body.clubName, 'Newbridge RFC');
  assert.equal(founderInvites(club.clubId).length, 1, 'copying the link minted nothing');
  const entry = audits().find(a => a.event === 'founder_invite_link_viewed');
  assert.ok(entry, 'the view is audited');
  assert.equal(entry.teamId_club, club.clubId);
  assert.equal(entry.changedBy, 'u-simon');
  assert.equal(JSON.stringify(audits()).includes(club.token), false, 'the audit trail never holds the token');
});

test('F3b. APP_URL, when configured, is the base of the founder link — never the request host', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  process.env.APP_URL = 'https://www.coacheasier.com/';
  try {
    const r = await call(identityHandler, { method: 'POST', token: simon.token, host: 'evil.example',
      body: { action: 'founder_invite_link', teamId: club.clubId } });
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(r.body.inviteUrl, `https://www.coacheasier.com/?inv=${encodeURIComponent(club.token)}`);
  } finally { delete process.env.APP_URL; }
});

// ── F4. States ───────────────────────────────────────────────────────────────

test('F4a. past its expiry the invitation reads EXPIRED: no link, reissue offered', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  patchInvite(club.clubId, club.token, { expiresAt: '2020-01-01T00:00:00.000Z' });
  const row = rowFor(await founders(simon.token), club.clubId);
  assert.equal(row.status, 'expired');
  assert.equal(row.canCopyLink, false);
  assert.equal(row.canReissue, true);
  const r = await link(club.clubId, simon.token);
  assert.equal(r.code, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, 'founder_invite_not_pending');
  assert.equal(JSON.stringify(r.body).includes(club.token), false, 'an expired token is not handed out');
});

test('F4b. once the founder has claimed, the club reads CLAIMED: no link, no reissue', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const c = await claim(club.token, club.email);
  assert.equal(c.code, 201, JSON.stringify(c.body));
  const row = rowFor(await founders(simon.token), club.clubId);
  assert.equal(row.status, 'claimed');
  assert.ok(row.claimedAt, 'when it was claimed');
  assert.equal(row.ownerExists, true);
  assert.equal(row.email, 'founder@newbridge.test');
  assert.equal(row.canCopyLink, false);
  assert.equal(row.canReissue, false);
  const l = await link(club.clubId, simon.token);
  assert.equal(l.code, 409);
  assert.equal(l.body.code, 'founder_invite_not_pending');
  const invitesBefore = clubInvitesRaw(club.clubId);
  const r = await reissue(club.clubId, simon.token);
  assert.equal(r.code, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, 'owner_exists');
  assert.equal(clubInvitesRaw(club.clubId), invitesBefore, 'a refused reissue writes nothing');
});

test('F4c. a revoked invitation reads REVOKED: no link, reissue offered', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  patchInvite(club.clubId, club.token, { status: 'revoked', revokedAt: '2026-10-01T00:00:00.000Z' });
  const row = rowFor(await founders(simon.token), club.clubId);
  assert.equal(row.status, 'revoked');
  assert.equal(row.canCopyLink, false);
  assert.equal(row.canReissue, true);
  assert.equal((await link(club.clubId, simon.token)).code, 409);
});

// ── F5–F7. Reissue ───────────────────────────────────────────────────────────

test('F5. reissue rotates the token: the old link is revoked and refused everywhere, exactly one founder link is live', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const before = Date.now();
  const r = await reissue(club.clubId, simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const fresh = tokenFromUrl(r.body.inviteUrl);
  assert.ok(fresh && fresh !== club.token, 'a NEW token');
  assert.match(r.body.inviteUrl, /^https:\/\/test\.local\/\?inv=/);
  assert.equal(r.body.email, 'founder@newbridge.test', 'same founder by default');
  assert.equal(r.body.revoked, 1, 'the previous link was revoked');
  const expires = new Date(r.body.expiresAt).getTime();
  assert.ok(expires > before + 13 * DAY && expires < before + 15 * DAY, 'a fresh 14-day window');
  assert.equal(rowFor(r, club.clubId)?.status, 'pending', 'the response carries the refreshed listing');

  const stored = founderInvites(club.clubId);
  const live = stored.filter(i => i.status === 'pending');
  assert.equal(live.length, 1, 'exactly one live founder invitation');
  assert.equal(live[0].token, fresh);
  assert.equal(live[0].founderInvite, true, 'the founder marker travels — the claim must still grant ownership');
  assert.equal(live[0].createdBy, 'platform-provisioning');
  assert.equal(live[0].role, 'coach'); assert.equal(live[0].staffLevel, 'head');
  assert.deepEqual(live[0].scope, { clubWide: true });
  const old = stored.find(i => i.token === club.token);
  assert.equal(old.status, 'revoked');
  assert.equal(old.revokedReason, 'reissued');
  assert.equal(old.revokedBy, 'u-simon');

  const v = await validate(club.token);
  assert.equal(v.code, 410, 'the old link no longer validates');
  const c = await claim(club.token, club.email);
  assert.equal(c.code, 410, JSON.stringify(c.body));
  assert.match(String(c.body.error), /revoked/i);
  assert.equal(members().some(m => m.teamId === club.clubId), false, 'the old link created nobody');
  assert.equal((await validate(fresh)).code, 200, 'the new link validates');
});

test('F6. the new link claims the intended club and makes the founder its owner; the old link stays dead', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const other = await provision('Riverside RFC', 'founder@riverside.test', simon.token);
  const r = await reissue(club.clubId, simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const fresh = tokenFromUrl(r.body.inviteUrl);
  const c = await claim(fresh, club.email);
  assert.equal(c.code, 201, JSON.stringify(c.body));
  assert.equal(c.body.teamMember.teamId, club.clubId, 'lands in Newbridge, not Riverside');
  const founder = members().find(m => m.teamId === club.clubId && m.userId === c.body.user.id);
  assert.equal(isClubOwner(founder), true, 'the founder owns the club');
  assert.equal(accessProfileOf(founder), 'full');
  assert.equal(members().some(m => m.teamId === other.clubId), false, 'Riverside gained no member');
  const row = rowFor(await founders(simon.token), club.clubId);
  assert.equal(row.status, 'claimed');
  assert.equal(row.canReissue, false);
  assert.equal((await claim(club.token, club.email)).code, 410, 'the revoked original is still refused');
  assert.equal((await claim(fresh, club.email)).code, 409, 'the new link is single-use');
});

test('F7. reissue is refused while the club has an owner — even when a pending founder link also exists', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const c = await claim(club.token, club.email);
  assert.equal(c.code, 201);
  // An operator-created second pending founder record (the shape a repeat
  // provisioning attempt could leave) must not make the club reissuable.
  const list = clubInvites(club.clubId);
  list.unshift({ ...list.find(i => i.token === club.token), token: 'tok-second-pending', status: 'pending', acceptedAt: null, acceptedBy: undefined });
  kv.set(`app:invites:${club.clubId}`, JSON.stringify(list));
  const before = clubInvitesRaw(club.clubId);
  const r = await reissue(club.clubId, simon.token);
  assert.equal(r.code, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, 'owner_exists');
  assert.equal(clubInvitesRaw(club.clubId), before);
  assert.equal(rowFor(await founders(simon.token), club.clubId).status, 'claimed', 'an owned club is claimed whatever else is lying around');
});

// ── F8. Isolation and unknown clubs ──────────────────────────────────────────

test('F8. reissuing one club touches no other club; links and rows are per club; unknown and unprovisioned clubs are refused', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const a = await provision('Alpha RFC', 'founder@alpha.test', simon.token);
  const b = await provision('Bravo RFC', 'founder@bravo.test', simon.token);
  const bBefore = clubInvitesRaw(b.clubId);
  const r = await reissue(a.clubId, simon.token, { adminEmail: 'new.founder@alpha.test' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(clubInvitesRaw(b.clubId), bBefore, "Bravo's invitations are byte-identical");
  const raw = JSON.stringify({ reissue: r.body, link: (await link(a.clubId, simon.token)).body });
  assert.equal(raw.includes(b.token), false, "Bravo's token never travels in Alpha's responses");
  assert.equal(raw.includes(a.token), false, "Alpha's REVOKED token never travels either");
  const bl = await link(b.clubId, simon.token);
  assert.equal(tokenFromUrl(bl.body.inviteUrl), b.token, "Bravo's link is Bravo's own, untouched");
  const rows = await founders(simon.token);
  assert.equal(rowFor(rows, a.clubId).email, 'new.founder@alpha.test');
  assert.equal(rowFor(rows, b.clubId).email, 'founder@bravo.test');
  assert.equal((await reissue('no-such-club', simon.token)).code, 404);
  assert.equal((await link('no-such-club', simon.token)).code, 404);
  const legacy = await reissue(LEGACY, simon.token);
  assert.equal(legacy.code, 400, JSON.stringify(legacy.body));
  assert.equal(legacy.body.code, 'not_provisioned', 'no founder invitation exists to reissue from');
  assert.equal(clubInvitesRaw(LEGACY), '[]', 'and none was invented');
});

// ── F9. A corrected founder address ──────────────────────────────────────────

test('F9. reissue may correct the founder address; the audit records both; a malformed address writes nothing', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'typo@newbridge.test', simon.token);
  const bad = await reissue(club.clubId, simon.token, { adminEmail: 'not an email' });
  assert.equal(bad.code, 400, JSON.stringify(bad.body));
  assert.equal(founderInvites(club.clubId).filter(i => i.status === 'pending').length, 1, 'the original is still the live one');
  assert.equal(founderInvites(club.clubId)[0].token, club.token);

  const r = await reissue(club.clubId, simon.token, { adminEmail: 'Founder@Newbridge.test' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.email, 'founder@newbridge.test', 'normalised like every address');
  assert.equal(r.body.previousEmail, 'typo@newbridge.test');
  const live = founderInvites(club.clubId).filter(i => i.status === 'pending');
  assert.equal(live.length, 1);
  assert.equal(live[0].email, 'founder@newbridge.test');
  const entry = audits().find(x => x.event === 'founder_invite_reissued');
  assert.ok(entry, 'the reissue is audited');
  assert.equal(entry.teamId_club, club.clubId);
  assert.equal(entry.email, 'founder@newbridge.test');
  assert.equal(entry.previousEmail, 'typo@newbridge.test');
  assert.equal(entry.changedBy, 'u-simon');
  assert.equal(entry.revoked, 1);
  const auditRaw = JSON.stringify(audits());
  assert.equal(auditRaw.includes(club.token), false);
  assert.equal(auditRaw.includes(tokenFromUrl(r.body.inviteUrl)), false, 'neither token is in the audit trail');
});

// ── F10. Nothing else moves ──────────────────────────────────────────────────

test('F10. a reissue creates no club, no membership and no account — only the invitation list of that one club changes', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const snapshot = { teams: teams(), members: kv.get('app:identity:team_members'), users: users() };
  const r = await reissue(club.clubId, simon.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(teams(), snapshot.teams, 'tenants byte-identical (no duplicate club, plan untouched)');
  assert.equal(kv.get('app:identity:team_members'), snapshot.members, 'memberships byte-identical (none for the platform admin)');
  assert.equal(users(), snapshot.users, 'accounts byte-identical');
});

// ── F11. Partial failures ────────────────────────────────────────────────────

test('F11a. storage fails on the revoke write: the reissue fails, the original stays the one live link', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  const before = clubInvitesRaw(club.clubId);
  failSet = { key: `app:invites:${club.clubId}`, nth: 1, seen: 0 };
  const r = await reissue(club.clubId, simon.token);
  assert.ok(r.code >= 400, `the failure is reported, got ${r.code}`);
  assert.equal(failSet, null, 'the injected failure fired');
  assert.equal(clubInvitesRaw(club.clubId), before, 'nothing changed');
  assert.equal((await validate(club.token)).code, 200, 'the original link still works');
});

test('F11b. storage fails after the revoke, before the new link is stored: no link is live, the state says so, and a retry recovers', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  failSet = { key: `app:invites:${club.clubId}`, nth: 2, seen: 0 };
  const r = await reissue(club.clubId, simon.token);
  assert.ok(r.code >= 400, `the failure is reported, got ${r.code}`);
  assert.equal(failSet, null, 'the injected failure fired on the second write');
  const live = founderInvites(club.clubId).filter(i => i.status === 'pending');
  assert.equal(live.length, 0, 'never two live links — and here, deliberately, none');
  assert.equal((await validate(club.token)).code, 410, 'the old link is already dead');
  const row = rowFor(await founders(simon.token), club.clubId);
  assert.equal(row.status, 'revoked', 'the listing tells the admin there is no live link');
  assert.equal(row.canReissue, true, 'and offers the way out');
  const again = await reissue(club.clubId, simon.token);
  assert.equal(again.code, 200, JSON.stringify(again.body));
  assert.equal(founderInvites(club.clubId).filter(i => i.status === 'pending').length, 1, 'the retry leaves exactly one live link');
});

test('F11c. a busy audit log never turns a successful reissue into a failure', async () => {
  seed();
  const simon = await sessionFor('u-simon');
  const club = await provision('Newbridge RFC', 'founder@newbridge.test', simon.token);
  kv.set('app:lock:audit_log', 'someone-else');          // the audit lock is held elsewhere
  const errors = [];
  const orig = console.error; console.error = (...a) => errors.push(a.join(' '));
  try {
    const r = await reissue(club.clubId, simon.token);
    assert.equal(r.code, 200, JSON.stringify(r.body));
    assert.equal(founderInvites(club.clubId).filter(i => i.status === 'pending').length, 1);
    assert.ok(errors.some(e => /audit/.test(e) && /founder_invite_reissued/.test(e)), 'the dropped entry is noted server-side');
    assert.equal(errors.some(e => e.includes(tokenFromUrl(r.body.inviteUrl))), false, 'without the token');
  } finally { console.error = orig; kv.delete('app:lock:audit_log'); }
});

// ── F12. The UI speaks only to these endpoints ───────────────────────────────

test('F12. the Existing clubs card shows founder status with copy + reissue, persists results, and stays gated to platform admins', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const from = html.indexOf('function renderPlatformClubsCard');
  const to = html.indexOf('function platformTogglePlanEditor');
  assert.ok(from > 0 && to > from, 'the card renderer is where it was');
  const card = html.slice(from, to);
  assert.match(card, /_myPlatformRole !== 'platform_admin'\) return ''/, 'presentation gate');
  assert.match(card, /founder/i, 'the row speaks of the founder');
  assert.match(card, /platformFounderLink\(/, 'a copy-link action');
  assert.match(card, /platformReissueFounder\(|platformToggleFounderEditor\(/, 'a reissue action');
  assert.match(card, /_platformFounderResult/, 'per-club results and errors are rendered, not toasted away');
  // The actions call exactly the two new endpoints, and confirm before rotating a credential.
  const actions = html.slice(to, html.indexOf('function platformTogglePlanEditor', to + 10) > 0 ? html.length : html.length);
  assert.ok(/action: 'founder_invite_link'/.test(html), "/action: 'founder_invite_link'/");
  assert.ok(/action: 'reissue_founder_invite'/.test(html), "/action: 'reissue_founder_invite'/");
  const reissueFn = html.slice(html.indexOf('async function platformReissueFounder'), html.indexOf('async function platformReissueFounder') + 3000);
  assert.match(reissueFn, /ceConfirm\(/, 'reissue is confirmed first');
  assert.match(reissueFn, /action: 'reissue_founder_invite'/);
  // Provisioning's own result is state, rendered by the card — not innerHTML that the next render erases.
  assert.ok(/_platformProvisionResult/.test(html), '/_platformProvisionResult/');
  void actions;
});

test('F13. signing out (resetIdentityScopedState) forgets the founder list, the open editor, every per-club founder result and the provisioning result — a founder claim link never survives into the next identity', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const from = html.indexOf('function resetIdentityScopedState()');
  assert.ok(from > 0, 'the identity reset is where it was');
  const to = html.indexOf('\n    function ', from + 10);
  const body = html.slice(from, to > from ? to : from + 8000);
  assert.ok(/_platformClubs = \{ loaded: false/.test(body), 'the sibling platform caches are reset here — the pattern this follows');
  assert.ok(/let _platformFounderResult = \{\}/.test(html), 'the per-club result map is reassignable (a const would throw on reset)');
  assert.ok(/_platformFounders = \{ loaded: false, loading: false, error: null, rows: \[\] \}/.test(body), 'the founder list is forgotten');
  assert.ok(/_platformFounderEditing = ''/.test(body), 'an open reissue editor is closed');
  assert.ok(/_platformFounderResult = \{\}/.test(body), 'per-club results — which may carry a founder link — are forgotten');
  assert.ok(/_platformProvisionResult = null/.test(body), 'the provisioning result — which carries a founder link — is forgotten');
  assert.ok(!/until you leave Settings/.test(html), 'the panel does not promise a clearing it does not perform');
});
