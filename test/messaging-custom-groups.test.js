/**
 * CUSTOM MESSAGING GROUPS — coach-managed groups ("Forwards", "Leadership").
 *
 * A group is an ordinary conversation with an explicit member list, so it
 * reuses the whole existing pipeline: the conversations list, the message
 * store, read markers, unread counts and the channel push (whose audience for
 * a conversation with no player-group binding is already exactly its
 * participants, sender excluded).
 *
 * What is NEW is the audience rule. Every other channel a club owns is
 * readable by its staff; a custom group is private to its members, whatever
 * their role — otherwise "Leadership" would be readable by every coach.
 *
 * The contract pinned here:
 *   - creating/managing needs the club's messaging permission AND membership
 *   - the club comes from the SESSION (tenantTeamId), never from the body
 *   - every member must be an ACTIVE member of that same club
 *   - members read and send; non-members can do neither, and a group id alone
 *     grants nothing
 *   - removed members lose access immediately
 *   - Club A can neither see, read, write nor modify Club B's groups, with any
 *     combination of forged teamId / groupId / member id
 *   - DMs, the built-in channels and their notifications are untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.cg.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const parsed = JSON.parse(options.body || '[]');
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({}) };
  const [command, ...a] = parsed;
  const range = (l, s, e) => { const end = Number(e) < 0 ? l.length + Number(e) : Number(e); return l.slice(Number(s), end + 1); };
  let result = null;
  if (command === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); lists.delete(a[0]); result = 1; }
  if (command === 'EXPIRE') result = 1;
  if (command === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (command === 'LRANGE') result = range(lists.get(a[0]) || [], a[1], a[2]);
  if (command === 'LTRIM') { const l = lists.get(a[0]) || []; lists.set(a[0], range(l, a[1], a[2])); result = 'OK'; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: chatHandler } = await import('../api/chat.js');
const { SESSION_COOKIE, createSession } = store;

const A = 'club-alpha', B = 'club-beta';
const MEMBERS = [
  { id: 'm-ac', teamId: A, userId: 'u-a-coach',  role: 'coach', staffLevel: 'head', status: 'active' },
  { id: 'm-a2', teamId: A, userId: 'u-a-coach2', role: 'coach', staffLevel: 'assistant', status: 'active' },
  { id: 'm-ap', teamId: A, userId: 'u-a-player', role: 'player', status: 'active' },
  { id: 'm-ap2', teamId: A, userId: 'u-a-player2', role: 'player', status: 'active' },
  { id: 'm-bc', teamId: B, userId: 'u-b-coach',  role: 'coach', staffLevel: 'head', status: 'active' },
  { id: 'm-bp', teamId: B, userId: 'u-b-player', role: 'player', status: 'active' },
];
const cookies = new Map();
async function seed() {
  kv.clear(); lists.clear(); cookies.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: A, name: 'Alpha' }, { id: B, name: 'Beta' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set('app:chat:convs', JSON.stringify([]));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}

function res() {
  const out = { code: 0, body: null };
  return { out, setHeader() {}, writeHead(c) { out.code = c; return this; },
           end(b) { try { out.body = JSON.parse(b); } catch { out.body = b; } return this; } };
}
async function post(as, body) {
  const r = res();
  await chatHandler({ method: 'POST', url: '/api/chat', headers: as ? { cookie: cookies.get(as) } : {},
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }, r);
  return r.out;
}
async function get(as, qs) {
  const r = res();
  await chatHandler({ method: 'GET', url: `/api/chat?${qs}`, headers: as ? { cookie: cookies.get(as) } : {} }, r);
  return r.out;
}
const convs = () => JSON.parse(kv.get('app:chat:convs') || '[]');
/** The stored record for one group (the list also holds the built-in channels). */
const stored = id => convs().find(c => String(c.id) === String(id));
const listIds = async who => ((await get(who, 'action=conversations')).body?.conversations || []).map(c => c.id);

// ── creating ────────────────────────────────────────────────────────────────

test('1. an authorised coach creates a group, in their OWN club', async () => {
  await seed();
  const out = await post('u-a-coach', { action: 'create_group', name: 'Forwards', memberIds: ['u-a-player'] });
  assert.equal(out.code, 200);
  const g = out.body.conversation;
  assert.equal(g.teamId, A, 'the club comes from the session');
  assert.equal(g.type, 'CUSTOM');
  assert.equal(g.name, 'Forwards');
  assert.deepEqual(g.participants, ['u-a-coach', 'u-a-player'], 'the creator is always a member');
  assert.equal(g.createdBy, 'u-a-coach');
  assert.match(g.id, /^cg_/);
});

test('2. a player cannot create a group, and an anonymous caller cannot either', async () => {
  await seed();
  const player = await post('u-a-player', { action: 'create_group', name: 'Mine', memberIds: [] });
  assert.equal(player.code, 403);
  const anon = await post(null, { action: 'create_group', name: 'Mine', memberIds: [] });
  assert.equal(anon.code, 401);
  assert.equal(convs().length, 0, 'nothing was written');
});

test('3. a group needs a name', async () => {
  await seed();
  assert.equal((await post('u-a-coach', { action: 'create_group', name: '   ', memberIds: [] })).code, 400);
  assert.equal(convs().length, 0);
});

test('6. a member of ANOTHER club can never be added', async () => {
  await seed();
  const out = await post('u-a-coach', { action: 'create_group', name: 'Forwards', memberIds: ['u-b-player'] });
  assert.equal(out.code, 403);
  assert.equal(convs().length, 0);
  // …nor slipped in beside a legitimate one.
  assert.equal((await post('u-a-coach', { action: 'create_group', name: 'Mixed', memberIds: ['u-a-player', 'u-b-coach'] })).code, 403);
  assert.equal(convs().length, 0);
});

test('14. a forged member id (unknown / inactive) is rejected', async () => {
  await seed();
  assert.equal((await post('u-a-coach', { action: 'create_group', name: 'Ghosts', memberIds: ['u-nobody'] })).code, 403);
  const members = JSON.parse(kv.get('app:identity:team_members'));
  members.push({ id: 'm-gone', teamId: A, userId: 'u-a-removed', role: 'player', status: 'removed' });
  kv.set('app:identity:team_members', JSON.stringify(members));
  assert.equal((await post('u-a-coach', { action: 'create_group', name: 'Stale', memberIds: ['u-a-removed'] })).code, 403);
});

test('12. a forged teamId in the body changes nothing — the session decides', async () => {
  await seed();
  const out = await post('u-a-coach', { action: 'create_group', name: 'Forged', memberIds: ['u-a-player'], teamId: B });
  assert.equal(out.code, 200);
  assert.equal(out.body.conversation.teamId, A, 'still the caller’s own club');
});

test('create_conv cannot mint a group behind create_group’s back', async () => {
  await seed();
  const out = await post('u-a-coach', { action: 'create_conv', id: 'cg_forged', type: 'CUSTOM', name: 'X',
    participants: ['u-a-coach', 'u-b-player'] });
  assert.equal(out.code, 400);
  assert.equal(convs().length, 0);
});

// ── membership, reading and sending ─────────────────────────────────────────

async function forwards() {
  await seed();
  const g = (await post('u-a-coach', { action: 'create_group', name: 'Forwards', memberIds: ['u-a-player'] })).body.conversation;
  return g;
}

test('7+8. a member reads the group and sends to it', async () => {
  const g = await forwards();
  assert.equal((await post('u-a-coach', { action: 'send', convId: g.id, senderId: 'u-a-coach', text: 'Scrum at 7' })).code, 200);
  const seen = await get('u-a-player', `action=messages&convId=${g.id}`);
  assert.equal(seen.code, 200);
  assert.deepEqual(seen.body.messages.map(m => m.text), ['Scrum at 7']);
  assert.equal((await post('u-a-player', { action: 'send', convId: g.id, senderId: 'u-a-player', text: 'Got it' })).code, 200);
  assert.ok((await listIds('u-a-player')).includes(g.id), 'it appears in the member’s list');
});

test('9+10. a non-member of the same club can neither read nor send — the id grants nothing', async () => {
  const g = await forwards();
  await post('u-a-coach', { action: 'send', convId: g.id, senderId: 'u-a-coach', text: 'Private' });
  // u-a-coach2 is a coach OF THE SAME CLUB and still has no window in.
  const read = await get('u-a-coach2', `action=messages&convId=${g.id}`);
  assert.equal(read.code, 403);
  assert.equal((await post('u-a-coach2', { action: 'send', convId: g.id, senderId: 'u-a-coach2', text: 'Butting in' })).code, 403);
  assert.ok(!(await listIds('u-a-coach2')).includes(g.id), 'and never sees it listed');
  assert.ok(!(await listIds('u-a-player2')).includes(g.id), 'nor does another player');
});

test('4. a member with messaging permission manages the group', async () => {
  const g = await forwards();
  const upd = await post('u-a-coach', { action: 'update_group', convId: g.id, name: 'Pack', memberIds: ['u-a-player', 'u-a-player2'] });
  assert.equal(upd.code, 200);
  assert.equal(upd.body.conversation.name, 'Pack');
  assert.deepEqual(upd.body.conversation.participants, ['u-a-coach', 'u-a-player', 'u-a-player2']);
  assert.ok((await listIds('u-a-player2')).includes(g.id), 'the new member sees it');
});

test('5. a non-member coach and a member player cannot manage it', async () => {
  const g = await forwards();
  assert.equal((await post('u-a-coach2', { action: 'update_group', convId: g.id, name: 'Hijack' })).code, 403);
  // a player is a member here, but has no messaging permission
  assert.equal((await post('u-a-player', { action: 'update_group', convId: g.id, name: 'Mine' })).code, 403);
  assert.equal(stored(g.id).name, 'Forwards', 'unchanged');
});

test('15. a removed member loses access immediately', async () => {
  const g = await forwards();
  await post('u-a-coach', { action: 'send', convId: g.id, senderId: 'u-a-coach', text: 'Before' });
  assert.equal((await get('u-a-player', `action=messages&convId=${g.id}`)).code, 200);
  await post('u-a-coach', { action: 'update_group', convId: g.id, memberIds: [] });   // everyone but the manager
  assert.equal((await get('u-a-player', `action=messages&convId=${g.id}`)).code, 403);
  assert.equal((await post('u-a-player', { action: 'send', convId: g.id, senderId: 'u-a-player', text: 'Still here?' })).code, 403);
  assert.ok(!(await listIds('u-a-player')).includes(g.id));
  // the history itself is untouched for those still in the group
  assert.deepEqual((await get('u-a-coach', `action=messages&convId=${g.id}`)).body.messages.map(m => m.text), ['Before']);
});

// ── tenant isolation ────────────────────────────────────────────────────────

test('11+13. Club B cannot see, read, write or modify Club A’s group', async () => {
  const g = await forwards();
  await post('u-a-coach', { action: 'send', convId: g.id, senderId: 'u-a-coach', text: 'Alpha only' });
  assert.ok(!(await listIds('u-b-coach')).includes(g.id), 'not listed for the other club');
  assert.equal((await get('u-b-coach', `action=messages&convId=${g.id}`)).code, 403, 'a forged groupId reads nothing');
  assert.equal((await post('u-b-coach', { action: 'send', convId: g.id, senderId: 'u-b-coach', text: 'Hello Alpha' })).code, 403);
  assert.equal((await post('u-b-coach', { action: 'update_group', convId: g.id, name: 'Taken' })).code, 404, 'not even findable');
  assert.equal((await post('u-b-coach', { action: 'update_group', convId: g.id, memberIds: ['u-b-coach'] })).code, 404);
  assert.deepEqual(stored(g.id).participants, ['u-a-coach', 'u-a-player'], 'membership untouched');
  assert.equal(stored(g.id).name, 'Forwards');
});

test('Club B cannot add itself to a Club A group, even with a forged teamId', async () => {
  const g = await forwards();
  assert.equal((await post('u-b-coach', { action: 'update_group', convId: g.id, teamId: A, memberIds: ['u-b-coach'] })).code, 404);
  assert.deepEqual(stored(g.id).participants, ['u-a-coach', 'u-a-player']);
});

test('two clubs may hold groups of the same NAME without touching each other', async () => {
  const g = await forwards();
  const b = (await post('u-b-coach', { action: 'create_group', name: 'Forwards', memberIds: ['u-b-player'] })).body.conversation;
  await post('u-b-coach', { action: 'send', convId: b.id, senderId: 'u-b-coach', text: 'Beta only' });
  assert.notEqual(b.id, g.id);
  assert.equal(b.teamId, B);
  assert.deepEqual((await get('u-b-player', `action=messages&convId=${b.id}`)).body.messages.map(m => m.text), ['Beta only']);
  assert.ok(!(await listIds('u-a-coach')).includes(b.id));
  assert.equal((await get('u-a-coach', `action=messages&convId=${b.id}`)).code, 403);
});

// ── nothing else moved ──────────────────────────────────────────────────────

test('16. DMs and the built-in channels still behave exactly as before', async () => {
  await forwards();
  const dm = `dm:${['u-a-coach', 'u-a-player'].sort().join(':')}`;
  assert.equal((await post('u-a-coach', { action: 'create_conv', id: dm, type: 'DIRECT', name: 'DM',
    participants: ['u-a-coach', 'u-a-player'] })).code, 200);
  assert.equal((await post('u-a-coach', { action: 'send', convId: dm, senderId: 'u-a-coach', text: 'Just us' })).code, 200);
  assert.deepEqual((await get('u-a-player', `action=messages&convId=${dm}`)).body.messages.map(m => m.text), ['Just us']);
  assert.equal((await get('u-a-coach2', `action=messages&convId=${dm}`)).code, 403, 'another coach still cannot read a DM');
  // squad remains the club-wide channel every member can read
  assert.equal((await post('u-a-coach', { action: 'send', convId: 'squad', senderId: 'u-a-coach', text: 'All in' })).code, 200);
  assert.deepEqual((await get('u-a-player2', 'action=messages&convId=squad')).body.messages.map(m => m.text), ['All in']);
  assert.ok((await listIds('u-a-coach2')).includes('squad'));
});

test('17. group notifications reach the members, and only them', async () => {
  const { channelPushRecipientIds } = await import('../api/chat.js');
  const g = await forwards();
  const session = { user: { id: 'u-a-coach' }, teamMember: MEMBERS[0], permissions: ['messaging'] };
  const ids = await channelPushRecipientIds(session, stored(g.id));
  assert.deepEqual(ids.sort(), ['u-a-coach', 'u-a-player'], 'exactly the members — the sender is dropped later, by the push path');
  assert.ok(!ids.includes('u-a-coach2') && !ids.includes('u-b-coach'));
  // The built-in audiences are unchanged.
  const squad = await channelPushRecipientIds(session, { id: 'squad' });
  assert.deepEqual(squad.sort(), ['u-a-coach', 'u-a-coach2', 'u-a-player', 'u-a-player2']);
});
