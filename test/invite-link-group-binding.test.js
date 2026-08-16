/**
 * MEMBERS "Player invite link" — GROUP BINDING.
 *
 * The reusable-link modal resolved its group via invitePlayerGroupValue(),
 * which reads the #inv-playergroup dropdown that exists only in the PER-NAME
 * invite form. In a multi-group club that returned '' — the server then
 * refused with "Choose which group this player will play in" even though the
 * operator had already selected an operational group in Members.
 *
 * Fix: inviteLinkPlayerGroup() makes the OPERATING group the source of truth,
 * and the request names it as the link's SCOPE too, so the server's
 * fingerprint dedupe returns the club's EXISTING scoped link for that group
 * instead of minting a duplicate. Single-group clubs keep the exact legacy
 * body (unscoped fingerprint) so their existing link keeps matching.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.link-binding.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');

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

const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';
const GROUPS3 = [
  { id: SEN, name: 'Seniors', status: 'active' },
  { id: U18, name: 'U18', status: 'active' },
  { id: WOM, name: "Women's", status: 'active' },
];

// ── CLIENT: the operating group is the source of truth ────────────────────
function resolveFor(operationalGroupId, groups, opts = {}) {
  return new Function(`"use strict";
    const state = { activeView: ${JSON.stringify(opts.activeView || 'coach')},
                    operationalGroupId: ${JSON.stringify(operationalGroupId)} };
    const _adminData = { structure: { groups: ${JSON.stringify(groups)} } };
    const document = { getElementById: () => null };   // reusable-link modal has NO picker
    ${fn('activePlayerGroups')}
    ${fn('invitePlayerGroupValue')}
    ${fn('inviteLinkPlayerGroup')}
    return inviteLinkPlayerGroup();
  `)();
}

test('Seniors selected → the link binds to grp_initial', () => {
  assert.equal(resolveFor(SEN, GROUPS3), SEN);
});
test('U18 selected → the link binds to grp_2b0aa7f9', () => {
  assert.equal(resolveFor(U18, GROUPS3), U18);
});
test("Women's selected → the link binds to grp_1b0fb56b", () => {
  assert.equal(resolveFor(WOM, GROUPS3), WOM);
});
test('single-group club auto-resolves with no operational group (legacy)', () => {
  assert.equal(resolveFor('', [GROUPS3[0]]), SEN);
});
test('genuinely ambiguous legacy case stays empty — server validation keeps guarding', () => {
  assert.equal(resolveFor('', GROUPS3), '', 'multi-group + no operating group + no picker → \'\'');
  assert.equal(resolveFor('grp_gone', GROUPS3), '', 'an unknown operating group never binds');
});

test('the modal sends the group as BOTH playerGroupId and scope (multi-group only)', () => {
  const opener = fn('openInvitePlayersModal');
  assert.match(opener, /inviteLinkPlayerGroup\(\)/, 'modal resolves via the operating group');
  assert.match(opener, /scope: \{ groupId: pgid \}/, 'names the scope so the dedupe matches');
  assert.match(opener, /activePlayerGroups\(\)\.length > 1/, 'single-group clubs keep the legacy unscoped body');
});

test('coach/staff invites are untouched — the per-name form keeps its own picker path', () => {
  assert.match(fn('createInvite'), /invitePlayerGroupValue\(\)/,
    'per-name invites still resolve via the form picker');
  assert.ok(!fn('createInvite').includes('inviteLinkPlayerGroup'),
    'the reusable-link resolver is not wired into per-name invites');
  assert.ok(!fn('inviteLinkPlayerGroup').includes('coach'),
    'the resolver knows nothing about staff roles');
});

// ── SERVER: existing scoped links are REUSED, never duplicated ────────────
const CLUB = 'boitsfort';
function seed(existingInvites) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: GROUPS3.map(g => ({ ...g, type: 'general' })),
    teams: [{ id: 'team_premier', groupId: SEN, name: 'Premier', status: 'active' }] }));
  kv.set('app:identity:users', JSON.stringify([{ id: 'u-owner', email: 'owner@club.test', displayName: 'Owner' }]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'tm-owner', teamId: CLUB, userId: 'u-owner', role: 'coach', staffLevel: 'head',
      status: 'active', isOwner: true, accessProfile: 'full' },
  ]));
  kv.set('ce:invites', JSON.stringify(existingInvites));
}
// The three production-shaped reusable scoped player links.
const PROD_LINKS = [U18, WOM, SEN].map((gid, i) => ({
  token: `ProdLink${gid.slice(0, 6)}${i}`, kind: 'group', role: 'player', name: '', email: '',
  status: 'open', teamId: CLUB, createdAt: '2026-08-16T00:00:00.000Z', expiresAt: null,
  createdBy: 'u-owner', acceptedAt: null, acceptedCount: 0,
  scope: { groupId: gid }, playerGroupId: gid,
}));
const invitesNow = () => JSON.parse(kv.get('ce:invites') || '[]');
async function post(body) {
  const { token } = await store.createSession({ userId: 'u-owner', teamId: CLUB, role: 'coach' });
  const res = { statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; },
    setHeader() {}, end() { return this; } };
  await inviteHandler({ method: 'POST', url: '/api/invite', query: {},
    headers: { 'content-type': 'application/json', cookie: `ce_session=${token}`, host: 'test.local' },
    body, on() {} }, res);
  return res;
}
const clientBody = gid => ({ group: true, playerGroupId: gid, scope: { groupId: gid } });

test('an existing scoped reusable link is REUSED — same token, no new record', async () => {
  seed(PROD_LINKS);
  for (const gid of [SEN, U18, WOM]) {
    const res = await post(clientBody(gid));
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const expected = PROD_LINKS.find(l => l.playerGroupId === gid).token;
    assert.equal(res.body.token, expected, `${gid} returns its existing link`);
  }
  assert.equal(invitesNow().length, 3, 'no new invite records were created');
});

test('pressing the button repeatedly never creates duplicates', async () => {
  seed(PROD_LINKS);
  const tokens = new Set();
  for (let i = 0; i < 4; i++) tokens.add((await post(clientBody(U18))).body.token);
  assert.equal(tokens.size, 1, 'every press returns the same U18 link');
  assert.equal(invitesNow().length, 3);
});

test('the multi-group body no longer trips "Choose which group" (and a fresh club mints once)', async () => {
  seed([]);   // no links yet — first press creates, second reuses
  const first = await post(clientBody(WOM));
  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  const again = await post(clientBody(WOM));
  assert.equal(again.body.token, first.body.token, 'second press reuses the fresh link');
  const created = invitesNow();
  assert.equal(created.length, 1);
  assert.equal(created[0].playerGroupId, WOM, 'link is stamped with the playing group');
  assert.deepEqual(created[0].scope, { groupId: WOM }, 'and scoped to it');
});

test('the OLD ambiguous body still gets the safe validation error (nothing written)', async () => {
  seed([]);
  const res = await post({ group: true });   // pre-fix client shape, revoked-link club
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body.error || ''), /Choose which group this player will play in/);
  assert.equal(invitesNow().length, 0, 'no record written on refusal');
});
