/**
 * THE TEAM CODE IS THE SERVER'S (trial readiness: Nick onboards a club alone).
 *
 * The code players type to join a club lives on the tenant record and is
 * minted unique at creation (Build 123). The client never received it: Members
 * showed a device-local placeholder ("TEAM"), "Change code" edited that
 * placeholder on the device only, and a fresh device's join form was prefilled
 * with it — so a coach shared a code the server had never heard of. These
 * tests pin the server side of the fix: the authoritative code travels in the
 * SESSION payload of staff who may manage players, for the session's own club
 * only; nothing takes a club id from a client to answer a code; and the join
 * resolves a real code, refusing the placeholder like any unknown code.
 *
 * Real handlers over an in-memory store, from an EMPTY world with one platform
 * administrator — the production shape of a new club.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.team-code-server.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;

const kv = new Map();
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://api.resend.com')) return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
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
const store = await import('../api/_identityStore.js');

function emptyWorld() {
  kv.clear();
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-platform', email: 'platform@coacheasier.com', displayName: 'Platform Admin', platformRole: 'platform_admin' },
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
let ipSeq = 0;
async function call(handler, { method = 'GET', query = {}, body = null, token = '' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api', query, body, on() {},
    headers: { 'content-type': 'application/json', host: 'test.local',
               'x-forwarded-for': `10.7.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}`,
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const identityGet = (query, token) => call(identityHandler, { method: 'GET', query, token });
const publish = (method, query, body, token) => call(publishHandler, { method, query, body, token });
const invite = (body, token) => call(inviteHandler, { method: 'POST', body, token });
const tokenOf = res => String(res.headers['Set-Cookie'] || '').split(';')[0].split('=')[1];
const teamRecord = clubId => JSON.parse(kv.get('app:identity:teams') || '[]').find(t => t.id === clubId) || null;
const members = () => JSON.parse(kv.get('app:identity:team_members') || '[]');

/** provision → claim: a founder and their session, as Nick creates a club. */
async function freshClub(clubName, adminEmail) {
  const platform = await store.createSession({ userId: 'u-platform', teamId: 'none', role: 'coach' });
  const provisioned = await identity({ action: 'provision_club', clubName, adminEmail, adminName: 'Frankie Founder' }, platform.token);
  assert.equal(provisioned.code, 201, JSON.stringify(provisioned.body));
  const inviteToken = decodeURIComponent(String(provisioned.body.inviteUrl).split('inv=')[1]);
  const claimed = await identity({ action: 'claim_invite', token: inviteToken, email: adminEmail,
    name: 'Frankie Founder', password: 'longEnough123', position: '2 — Hooker' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  return { clubId: provisioned.body.team.id, provisioned: provisioned.body, token: tokenOf(claimed),
           founderId: claimed.body.user.id, email: adminEmail };
}
const session = token => identityGet({ action: 'session' }, token);

// ── T1–T3. The code travels with the right session, for the right club ──────

test('T1. the founder\'s session carries the club\'s stored team code, identical to what provisioning minted', async () => {
  emptyWorld();
  const club = await freshClub('Newbridge RFC', 'founder@newbridge.test');
  const stored = teamRecord(club.clubId).teamCode;
  assert.match(stored, /^[A-Z]{1,6}\d{2,}$/, `a minted code, got ${stored}`);
  assert.equal(club.provisioned.team.teamCode, stored, 'provisioning reported the stored code');
  const s = await session(club.token);
  assert.equal(s.code, 200, JSON.stringify(s.body));
  assert.equal(s.body.teamCode, stored, 'the session payload is the client\'s source of truth');
  // The login payload agrees — the first screen after sign-in needs it too.
  const login = await identity({ action: 'login', email: club.email, password: 'longEnough123' });
  assert.equal(login.code, 200, JSON.stringify(login.body));
  assert.equal(login.body.teamCode, stored);
});

test('T2. a player\'s session carries NO team code; an anonymous session read is refused', async () => {
  emptyWorld();
  const club = await freshClub('Newbridge RFC', 'founder@newbridge.test');
  const inv = await invite({ name: 'Pat Player', role: 'player', email: 'pat@newbridge.test', sendEmail: false }, club.token);
  assert.equal(inv.code, 201, JSON.stringify(inv.body));
  const claimed = await identity({ action: 'claim_invite', token: inv.body.token, email: 'pat@newbridge.test',
    name: 'Pat Player', password: 'longEnough123', position: '2 — Hooker' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  const s = await session(tokenOf(claimed));
  assert.equal(s.code, 200);
  assert.equal('teamCode' in s.body, false, 'staff-only data is absent, not blanked');
  assert.equal(JSON.stringify(s.body).includes(teamRecord(club.clubId).teamCode), false);
  assert.equal((await session('')).code, 401);
});

test('T3. the code is the CURRENT club\'s: a dual-club coach sees A\'s code in A and B\'s code after switching to B — never both', async () => {
  emptyWorld();
  const a = await freshClub('Alpha RFC', 'founder@alpha.test');
  const b = await freshClub('Bravo RFC', 'founder@bravo.test');
  const codeA = teamRecord(a.clubId).teamCode, codeB = teamRecord(b.clubId).teamCode;
  assert.notEqual(codeA, codeB);
  // Bravo's founder invites Alpha's founder as a coach; the same account now sits in both clubs.
  const inv = await invite({ name: 'Frankie Founder', role: 'coach', email: 'founder@alpha.test', sendEmail: false }, b.token);
  assert.equal(inv.code, 201, JSON.stringify(inv.body));
  const upgraded = await identity({ action: 'claim_invite', token: inv.body.token, email: 'founder@alpha.test',
    name: 'Frankie Founder', password: 'longEnough123' });
  assert.equal(upgraded.code, 201, JSON.stringify(upgraded.body));
  const inB = tokenOf(upgraded);
  let s = await session(inB);
  assert.equal(s.body.teamMember.teamId, b.clubId);
  assert.equal(s.body.teamCode, codeB, 'in Bravo, Bravo\'s code');
  assert.equal(JSON.stringify(s.body).includes(codeA), false, 'and not Alpha\'s');
  const sw = await identity({ action: 'switch_team', teamId: a.clubId }, inB);
  assert.equal(sw.code, 200, JSON.stringify(sw.body));
  s = await session(tokenOf(sw) || inB);
  assert.equal(s.body.teamMember.teamId, a.clubId);
  assert.equal(s.body.teamCode, codeA, 'in Alpha, Alpha\'s code');
  assert.equal(JSON.stringify(s.body).includes(codeB), false);
  // A club id in the query cannot steer the answer: the session's club decides.
  const steered = await identityGet({ action: 'session', teamId: b.clubId, clubId: b.clubId }, tokenOf(sw) || inB);
  assert.equal(steered.body.teamCode, codeA);
});

// ── T4. Nothing reads or writes another club's code ─────────────────────────

test('T4. Club A cannot read or modify Club B\'s code: the club-config surface neither returns nor accepts a team code', async () => {
  emptyWorld();
  const a = await freshClub('Alpha RFC', 'founder@alpha.test');
  const b = await freshClub('Bravo RFC', 'founder@bravo.test');
  const codeB = teamRecord(b.clubId).teamCode;
  const cfg = await publish('GET', { resource: 'club' }, null, a.token);
  assert.equal(cfg.code, 200);
  assert.equal(JSON.stringify(cfg.body).includes(codeB), false);
  assert.equal(JSON.stringify(cfg.body).includes(teamRecord(a.clubId).teamCode), false, 'the config record is not where the code lives');
  const teamsBefore = kv.get('app:identity:teams');
  const save = await publish('POST', { resource: 'club' },
    { club: { clubName: 'Alpha RFC', teamCode: 'HACKED1', teamId: b.clubId } }, a.token);
  assert.ok(save.code < 500, JSON.stringify(save.body));
  assert.equal(kv.get('app:identity:teams'), teamsBefore, 'no team code moved — in either club');
  // A's identity state names only A's team.
  const state = await identityGet({}, a.token);
  assert.equal(state.code, 200, JSON.stringify(state.body));
  assert.deepEqual((state.body.teams || []).map(t => t.id), [a.clubId]);
  assert.equal(JSON.stringify(state.body).includes(codeB), false, "B's code never reaches A's staff");
});

// ── T5. Joining with the code ───────────────────────────────────────────────

test('T5. a valid code (any case) joins the intended club as a pending player; an unknown code and the old placeholder are refused with nothing written', async () => {
  emptyWorld();
  const a = await freshClub('Alpha RFC', 'founder@alpha.test');
  const b = await freshClub('Bravo RFC', 'founder@bravo.test');
  const codeA = teamRecord(a.clubId).teamCode;
  const join = await identity({ action: 'join', teamCode: codeA.toLowerCase(), firstName: 'Jo', lastName: 'Joiner',
    email: 'jo@alpha.test', password: 'longEnough123' });
  assert.equal(join.code, 201, JSON.stringify(join.body));
  assert.equal(join.body.teamMember.teamId, a.clubId, 'Alpha, not Bravo');
  assert.equal(join.body.teamMember.status, 'pending');
  assert.equal(join.body.team.id, a.clubId);
  assert.equal(JSON.stringify(join.body).includes(codeA), false, 'the join answer does not echo the code');

  const snapshot = { m: kv.get('app:identity:team_members'), u: kv.get('app:identity:users') };
  for (const bad of ['TEAM', 'team', 'NOPE99', '', codeA + 'X']) {
    const r = await identity({ action: 'join', teamCode: bad, firstName: 'No', lastName: 'Body',
      email: `nobody.${bad || 'blank'}@alpha.test`, password: 'longEnough123' });
    assert.ok(r.code === 404 || r.code === 400, `${JSON.stringify(bad)} refused (${r.code})`);
    assert.equal(r.body.ok, false);
  }
  assert.equal(kv.get('app:identity:team_members'), snapshot.m, 'no membership from a bad code');
  assert.equal(kv.get('app:identity:users'), snapshot.u, 'no account from a bad code');
  assert.equal(members().some(m => m.teamId === b.clubId && m.status === 'pending'), false, 'Bravo got no request');
});

// ── T6. The client no longer carries a placeholder code ────────────────────

test('T6. index.html: no "TEAM" placeholder, no local "Change code", the code is hydrated from the session and cleared on a club change', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(/teamCode: ""/.test(html), 'the default is empty, not a word that looks like a code');
  assert.ok(!/teamCode: "TEAM"/.test(html), 'absent: ' + '/teamCode: "TEAM"/');
  assert.equal((html.match(/\|\|\s*'TEAM'/g) || []).length, 0, 'no "TEAM" fallback anywhere');
  assert.equal(html.includes('Change code'), false, 'the device-local editor is gone');
  assert.equal(html.includes("prompt('Set team code:'"), false);
  // Legacy devices that saved the placeholder read back an empty code.
  const norm = html.slice(html.indexOf('function normalizeState'), html.indexOf('function normalizeState') + 4000);
  assert.match(norm, /teamCode/, 'normalizeState handles the stored code');
  assert.match(norm, /'TEAM'|"TEAM"/, 'and recognises the old placeholder');
  // The session payload is adopted into state; a club change forgets the old club's code.
  const adopt = html.slice(html.indexOf('function adoptIdentityPayload'), html.indexOf('function adoptIdentityPayload') + 6000);
  assert.match(adopt, /state\.teamCode\s*=/, 'adoptIdentityPayload hydrates the code');
  const reset = html.slice(html.indexOf('function resetTeamScopedState'), html.indexOf('function resetTeamScopedState') + 3000);
  assert.match(reset, /state\.teamCode\s*=\s*''/, 'a club change clears it');
  // Members shows the real code or says honestly that it is not available.
  const card = html.slice(html.indexOf('Also share a general team code'), html.indexOf('Also share a general team code') + 2500);
  assert.match(card, /state\.teamCode/, 'the card reads the hydrated code');
  assert.match(card, /not available|unavailable|not loaded/i, 'and never invents one');
});
