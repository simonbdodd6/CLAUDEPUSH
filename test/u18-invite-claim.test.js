/**
 * U18 INVITE CLAIM — the "You don't have access yet" blocker.
 *
 *  Production forensics: the U18 reusable link works — 19 accepts, 16 real
 *  U18 players onboarded in one morning, every one active with
 *  playerGroupId grp_2b0aa7f9. The ONLY 403 in the whole claim chain is the
 *  account-takeover guard (email already has an account, typed password
 *  doesn't match — e.g. a re-submitting player or a shared family email),
 *  and friendlyAuthError mapped EVERY invite-context 403 to "You don't have
 *  access yet — check with your coach", sending players to the coach for a
 *  problem only they could fix. The claim path itself is proven healthy
 *  here end-to-end; the fix is the truthful message.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.u18-claim.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
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
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const { resolvePlayerGroup } = await import('../api/_accessScope.js');


/**
 * Every invitation, wherever it lives. Invitations are stored one list per
 * club now (api/_inviteStore.js); the pre-namespace global list is still read
 * so records created before the split are visible too.
 */
function allStoredInvites(map) {
  const out = [];
  for (const [k, v] of map) {
    if (!/^app:invites:/.test(k)) continue;
    try { out.push(...(JSON.parse(v) || [])); } catch {}
  }
  try { out.push(...(JSON.parse(map.get('ce:invites') || '[]') || [])); } catch {}
  return out;
}

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-simon', email: 's@c.test', displayName: 'Simon' },
    { id: 'u-u18c', email: 'u18c@c.test', displayName: 'U18 Coach' },
    { id: 'u-senc', email: 'senc@c.test', displayName: 'Seniors Coach' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-u18c', teamId: CLUB, userId: 'u-u18c', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
    { id: 'm-senc', teamId: CLUB, userId: 'u-senc', role: 'coach', staffLevel: 'assistant', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'general', status: 'active' },
      { id: WOM, name: "Women's", type: 'general', status: 'active' },
    ],
    teams: [
      { id: 'team_initial', groupId: SEN, name: 'Premier development', status: 'active' },
      { id: 'team_u18a', groupId: U18, name: 'U18 Premier', status: 'active' },
      { id: 'team_u18b', groupId: U18, name: 'U18 Development', status: 'active' },
    ] }));
  kv.set('ce:invites', JSON.stringify([]));
}
async function inviteApi(body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await inviteHandler({ method: 'POST', url: '/api/invite', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
    body, on() {} }, res);
  return res;
}
const sessionFor = userId => store.createSession({ userId, teamId: CLUB, role: 'coach' });
const u18LinkBody = { group: true, playerGroupId: U18, scope: { groupId: U18 } };

// ── 1: a U18-scoped coach can generate AND reuse the U18 player link ──────
test('U18-scoped coach mints the U18 player link, and pressing again reuses it', async () => {
  seed();
  const coach = await sessionFor('u-u18c');
  const a = await inviteApi(u18LinkBody, coach.token);
  assert.equal(a.code, 200, JSON.stringify(a.body));
  const b = await inviteApi(u18LinkBody, coach.token);
  assert.equal(b.body.token, a.body.token, 'idempotent reuse, no duplicate link');
});

// ── 2-5: a fresh player claims into the U18 portal immediately ────────────
test('fresh claim: active Boitsfort member, playerGroupId U18, portal access at once', async () => {
  seed();
  const coach = await sessionFor('u-u18c');
  const link = await inviteApi(u18LinkBody, coach.token);
  const claim = await store.claimInvite({ token: link.body.token, name: 'Real U18 Kid',
    email: 'realkid@u18.test', password: 'freshPassword12' });
  assert.equal(claim.teamMember.teamId, CLUB, 'session tenant is Boitsfort');
  assert.equal(claim.teamMember.status, 'active', 'recognised immediately — no approval gate');
  assert.equal(claim.teamMember.role, 'player');
  assert.equal(claim.teamMember.playerGroupId, U18, 'plays in U18');
  assert.equal(claim.session.teamId, CLUB);
  const structure = JSON.parse(kv.get(`app:structure:${CLUB}`));
  assert.equal(resolvePlayerGroup(claim.teamMember, structure).groupId, U18,
    'the portal resolves them straight into U18');
});

// ── 6: the club-wide-created link works identically ───────────────────────
test('a club-wide admin\'s U18 link claims identically', async () => {
  seed();
  const admin = await sessionFor('u-simon');
  const link = await inviteApi(u18LinkBody, admin.token);
  const claim = await store.claimInvite({ token: link.body.token, name: 'Second Kid',
    email: 'second@u18.test', password: 'freshPassword12' });
  assert.equal(claim.teamMember.playerGroupId, U18);
  assert.equal(claim.teamMember.status, 'active');
});

// ── 7-8: scope walls — a Seniors coach cannot reach U18, nothing escapes ──
test('a Seniors-scoped coach cannot mint a U18 player link', async () => {
  seed();
  const senCoach = await sessionFor('u-senc');
  const r = await inviteApi(u18LinkBody, senCoach.token);
  assert.equal(r.code, 403, JSON.stringify(r.body));
  assert.equal(allStoredInvites(kv).length, 0, 'nothing written');
});

test('the invite cannot escape its club or group', async () => {
  seed();
  const coach = await sessionFor('u-u18c');
  const forged = await inviteApi({ group: true, playerGroupId: 'grp_of_other_club', scope: { groupId: 'grp_of_other_club' } }, coach.token);
  assert.equal([403, 404].includes(forged.code), true, 'unknown/foreign group refused');
  const link = await inviteApi(u18LinkBody, coach.token);
  const invite = allStoredInvites(kv).find(i => i.token === link.body.token);
  assert.equal(invite.teamId, CLUB, 'tenant-bound');
  assert.equal(invite.playerGroupId, U18, 'group-bound');
});

// ── 9: the EXISTING-account path works with the right password ────────────
test('an existing account claiming with its CORRECT password joins fine (re-submit / shared device)', async () => {
  seed();
  const coach = await sessionFor('u-u18c');
  const link = await inviteApi(u18LinkBody, coach.token);
  const first = await store.claimInvite({ token: link.body.token, name: 'Twice Kid',
    email: 'twice@u18.test', password: 'samePassword12' });
  // Same person submits the form again (didn't realise it worked).
  const again = await store.claimInvite({ token: link.body.token, name: 'Twice Kid',
    email: 'twice@u18.test', password: 'samePassword12' });
  assert.equal(again.teamMember.id, first.teamMember.id, 'same membership — idempotent');
  assert.equal(again.teamMember.playerGroupId, U18);
  const members = JSON.parse(kv.get('app:identity:team_members'))
    .filter(m => m.userId === first.user.id);
  assert.equal(members.length, 1, 'no duplicate membership');
});

// ── 10 + the root cause: wrong password → 403, now with a TRUTHFUL message ─
test('existing email + wrong password 403s with the real reason, and the client now says so', async () => {
  seed();
  const coach = await sessionFor('u-u18c');
  const link = await inviteApi(u18LinkBody, coach.token);
  await store.claimInvite({ token: link.body.token, name: 'First Kid',
    email: 'shared@family.test', password: 'firstPassword12' });
  await assert.rejects(
    store.claimInvite({ token: link.body.token, name: 'Sibling Kid',
      email: 'shared@family.test', password: 'differentPass12' }),
    err => {
      assert.equal(err.status, 403);
      assert.match(err.message, /account already exists/i, 'server names the real reason');
      return true;
    });

  // The client maps invite-context 403 to actionable copy — never the old
  // "check with your coach" dead end.
  const friendly = new Function(`${fn('friendlyAuthError')}; return friendlyAuthError;`)();
  const msg = friendly({ status: 403 }, 'invite');
  assert.match(msg, /account with this email already exists/i, msg);
  assert.match(msg, /log in/i, 'tells them the actual way forward');
  assert.equal(/check with your coach/.test(msg), false, 'the misleading copy is gone for invites');
  // Other contexts keep their existing wording.
  assert.match(friendly({ status: 403 }, 'join'), /coach needs to approve/);
  assert.match(friendly({ status: 403 }, 'auth'), /check with your coach/);
});

// ── stale/different logged-in identity cannot corrupt a claim ─────────────
test('a claim ignores whoever is logged in on the device — the invite alone decides', async () => {
  const identitySrc = fs.readFileSync(new URL('../api/identity.js', import.meta.url), 'utf8');
  const claimRoute = identitySrc.slice(identitySrc.indexOf("action === 'claim_invite'"),
    identitySrc.indexOf("action === 'claim_invite'") + 700);
  assert.equal(/resolveSessionFromRequest/.test(claimRoute), false,
    'the claim route never reads the request session');
  // And functionally: a claim while "someone else" holds a session produces
  // the invited identity, not the logged-in one.
  seed();
  const coach = await sessionFor('u-u18c');
  const link = await inviteApi(u18LinkBody, coach.token);
  const claim = await store.claimInvite({ token: link.body.token, name: 'Clean Kid',
    email: 'clean@u18.test', password: 'freshPassword12' });
  assert.notEqual(claim.user.id, 'u-u18c', 'a brand-new identity, never the device session');
  assert.equal(claim.teamMember.playerGroupId, U18);
});
