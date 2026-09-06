/**
 * GROUP-CHANNEL STANDING FOR NON-COACH STAFF.
 *
 * A group channel (group:<gid>) is readable and writable by two standings:
 * the group's PLAYING members, and the staff who OPERATE the group. "Operate"
 * is operationalGroupsFor(member, …, {as:'staff'}) — the caller's accessScope,
 * the same canonical helper the roster, identity, medical and squad
 * boundaries all use.
 *
 * But the chat request's group standing was built only for role
 * 'coach'/'admin' (isStaffSession); every other staff role — Medical, S&C,
 * Analyst — resolved to NO operational groups, so the club physio who serves
 * Seniors could not read or post the Seniors group channel where "Message
 * this group" and group availability requests land, even though their scope
 * names that group.
 *
 * The standing now comes straight from operationalGroupsFor, which already
 * returns [] for players and guests — so this widens nothing for them and
 * grants each staff role exactly the groups their scope names, and no others.
 * Direct messages stay participant-only (unchanged); a group they do NOT
 * operate stays closed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.chan-standing.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();
function range(list, start, end) {
  const s = Number(start), e = Number(end);
  const finalEnd = e < 0 ? list.length + e : e;
  return list.slice(s, finalEnd + 1);
}
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = range(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM') { const l = lists.get(args[0]) || []; lists.set(args[0], range(l, args[1], args[2])); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', []];
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { INITIAL_GROUP_ID } = await import('../api/_structureStore.js');
const { default: chatHandler } = await import('../api/chat.js');
const { createSession, SESSION_COOKIE } = store;

const CLUB = 'club-cs';
const SEN = INITIAL_GROUP_ID, U18 = 'grp-u18';

const STRUCTURE = {
  version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'age-grade', status: 'active' },
  ],
  teams: [{ id: 't-prem', groupId: SEN, name: 'Premier', status: 'active' }],
};

const scope = groupId => ({ clubWide: false, groups: [{ groupId, status: 'active' }], teams: [] });
const MEMBERS = [
  { id: 'm-sen-medic', teamId: CLUB, userId: 'u-sen-medic', role: 'medical', status: 'active', accessScope: scope(SEN) },
  { id: 'm-sen-snc',   teamId: CLUB, userId: 'u-sen-snc',   role: 'snc',     status: 'active', accessScope: scope(SEN) },
  { id: 'm-sen-analyst', teamId: CLUB, userId: 'u-sen-analyst', role: 'analyst', status: 'active', accessScope: scope(SEN) },
  { id: 'm-u18-medic', teamId: CLUB, userId: 'u-u18-medic', role: 'medical', status: 'active', accessScope: scope(U18) },
  { id: 'm-sen-coach', teamId: CLUB, userId: 'u-sen-coach', role: 'coach', staffLevel: 'assistant', status: 'active', accessScope: scope(SEN) },
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true },
  { id: 'm-sen-player', teamId: CLUB, userId: 'u-sen-player', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-player', teamId: CLUB, userId: 'u-u18-player', role: 'player', status: 'active', playerGroupId: U18 },
];

function seedConvs() {
  return [
    { id: `group:${SEN}`, teamId: CLUB, type: 'GROUP', groupId: SEN, name: 'Seniors', participants: [] },
    { id: `group:${U18}`, teamId: CLUB, type: 'GROUP', groupId: U18, name: 'U18', participants: [] },
  ];
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: CLUB, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed() {
  kv.clear(); lists.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club CS' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set('app:chat:convs', JSON.stringify(seedConvs()));
  for (const m of MEMBERS) await login(m.userId);
}
function req(method, url, body = null, headers = {}) {
  return { method, url, headers, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } };
}
function res() {
  return { statusCode: 0, headers: {}, body: '',
    setHeader(n, v) { this.headers[n] = v; },
    writeHead(s, h = {}) { this.statusCode = s; this.headers = { ...this.headers, ...h }; },
    end(c = '') { this.body = String(c || ''); } };
}
async function raw(method, url, body = null, headers = {}) {
  const r = res();
  await chatHandler(req(method, url, body, headers), r);
  return r;
}
const readChannel = (userId, gid) =>
  raw('GET', `/api/chat?action=messages&convId=${encodeURIComponent('group:' + gid)}`, null, { cookie: cookies.get(userId) });
const postChannel = (userId, gid, text) =>
  raw('POST', '/api/chat', { action: 'send', convId: `group:${gid}`, senderId: userId, text }, { cookie: cookies.get(userId) });

// ── READ ─────────────────────────────────────────────────────────────────────

for (const [label, medicUser] of [['Medical', 'u-sen-medic'], ['S&C', 'u-sen-snc'], ['Analyst', 'u-sen-analyst']]) {
  test(`${label} staff who operate Seniors can READ the Seniors group channel`, async () => {
    await seed();
    const r = await readChannel(medicUser, SEN);
    assert.equal(r.statusCode, 200, r.body);
  });

  test(`${label} staff who operate Seniors CANNOT read the U18 group channel`, async () => {
    await seed();
    const r = await readChannel(medicUser, U18);
    assert.equal(r.statusCode, 403, r.body);
  });
}

test('a Medical member who operates Seniors can POST to the Seniors group channel', async () => {
  await seed();
  const r = await postChannel('u-sen-medic', SEN, 'physio note for the group');
  assert.equal(r.statusCode, 200, r.body);
  const back = await readChannel('u-sen-coach', SEN);
  assert.ok(JSON.parse(back.body).messages.some(m => m.text === 'physio note for the group'), 'the coach sees the physio\'s post');
});

test('a Medical member who operates Seniors CANNOT post to the U18 group channel', async () => {
  await seed();
  const r = await postChannel('u-sen-medic', U18, 'intruding');
  assert.equal(r.statusCode, 403, r.body);
});

test('a U18 medic reads U18 but not Seniors — the scope, not the role, decides', async () => {
  await seed();
  assert.equal((await readChannel('u-u18-medic', U18)).statusCode, 200);
  assert.equal((await readChannel('u-u18-medic', SEN)).statusCode, 403);
});

// ── PRESERVED STANDINGS ──────────────────────────────────────────────────────

test('a coach who operates Seniors still reads the Seniors channel, and the owner reads every group', async () => {
  await seed();
  assert.equal((await readChannel('u-sen-coach', SEN)).statusCode, 200);
  assert.equal((await readChannel('u-owner', SEN)).statusCode, 200);
  assert.equal((await readChannel('u-owner', U18)).statusCode, 200);
});

test('a playing member still reads their own group channel and not another\'s', async () => {
  await seed();
  assert.equal((await readChannel('u-sen-player', SEN)).statusCode, 200, 'plays Seniors → Seniors channel');
  assert.equal((await readChannel('u-sen-player', U18)).statusCode, 403, 'does not play U18');
  assert.equal((await readChannel('u-u18-player', SEN)).statusCode, 403);
});

test('DM authorization is untouched: a Medical non-participant still cannot read a DM', async () => {
  await seed();
  // A DM between the coach and a player — the physio is not a participant.
  const dm = `dm:u-sen-coach:u-sen-player`;
  kv.set('app:chat:convs', JSON.stringify([
    ...seedConvs(),
    { id: dm, teamId: CLUB, type: 'DIRECT', participants: ['u-sen-coach', 'u-sen-player'] },
  ]));
  const r = await raw('GET', `/api/chat?action=messages&convId=${encodeURIComponent(dm)}`, null, { cookie: cookies.get('u-sen-medic') });
  assert.equal(r.statusCode, 403, r.body);
});
