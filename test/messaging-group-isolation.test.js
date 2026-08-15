/**
 * MESSAGING GROUP ISOLATION — 3-group club, ONE inbox per person.
 *
 * The audience model is explicit:
 *   DIRECT        dm:A:B            — its two participants, private
 *   PLAYER GROUP  group:<gid>       — that group's PLAYING members + the
 *                                     staff who OPERATE the group
 *   CLUB-WIDE     squad / announce  — the existing whole-club channels,
 *                                     legacy semantics unchanged
 *   STAFF         coaching          — the existing all-staff channel
 *
 * Rules pinned here:
 *   · recipients of a group send are resolved SERVER-side from playerGroupId
 *     (active members only) — a client never supplies the list
 *   · coaching authority = accessScope; playing membership grants NO send
 *     authority over a group broadcast (Alex: Seniors player + U18 coach
 *     cannot broadcast to Seniors)
 *   · coaching scope never makes a person a player RECIPIENT
 *   · one authenticated userId = one inbox: conversation list and unread are
 *     account-level, never partitioned by operational group
 *   · legacy conversations keep their real audience — no group is guessed
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.msg-groups.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv    = new Map();
const lists = new Map();
function rangeList(list, start, end) {
  const s = Number(start), e = Number(end);
  const finalEnd = e < 0 ? list.length + e : e;
  return list.slice(s, finalEnd + 1);
}
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'LPUSH') {
    const list = lists.get(args[0]) || [];
    list.unshift(args[1]); lists.set(args[0], list); result = list.length;
  }
  if (command === 'LRANGE') result = rangeList(lists.get(args[0]) || [], args[1], args[2]);
  if (command === 'LTRIM')  { lists.set(args[0], rangeList(lists.get(args[0]) || [], args[1], args[2])); result = 'OK'; }
  if (command === 'DEL')    { kv.delete(args[0]); lists.delete(args[0]); result = 1; }
  if (command === 'RENAME') { lists.set(args[1], lists.get(args[0]) || []); lists.delete(args[0]); result = 'OK'; }
  if (command === 'SCAN')   result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const { default: chatHandler } = await import('../api/chat.js');
const { createSession, SESSION_COOKIE, DEFAULT_TEAM } = await import('../api/_identityStore.js');

const CLUB  = DEFAULT_TEAM.id;          // 'boitsfort-rfc' — built-ins stay on plain storage keys
const OTHER = 'club-rivals';
const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_womens';

const STRUCTURE = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18',     type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_premier', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_u18p',    groupId: U18, name: 'U18 Premier', status: 'active' },
    { id: 'team_womp',    groupId: WOM, name: "Women's Premier", status: 'active' },
  ] };

const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const MEMBERS = [
  { id: 'm-owner', teamId: CLUB, userId: 'u-owner', role: 'admin', status: 'active', isOwner: true, accessProfile: 'full' },
  { id: 'm-sen-c', teamId: CLUB, userId: 'u-sen-c', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
  { id: 'm-u18-c', teamId: CLUB, userId: 'u-u18-c', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
  { id: 'm-wom-c', teamId: CLUB, userId: 'u-wom-c', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([WOM]) },
  { id: 'm-uw-c',  teamId: CLUB, userId: 'u-uw-c',  role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([U18, WOM]) },
  // Alex: SENIORS player who coaches U18 + Women's — one login, one inbox.
  { id: 'm-alex', teamId: CLUB, userId: 'u-alex', role: 'coach', status: 'active', accessProfile: 'coach',
    playerGroupId: SEN, accessScope: scope([U18, WOM]) },
  { id: 'm-s1', teamId: CLUB, userId: 'u-s1', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-s2', teamId: CLUB, userId: 'u-s2', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u1', teamId: CLUB, userId: 'u-u1', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-u2', teamId: CLUB, userId: 'u-u2', role: 'player', status: 'active', playerGroupId: U18 },
  { id: 'm-w1', teamId: CLUB, userId: 'u-w1', role: 'player', status: 'active', playerGroupId: WOM },
  { id: 'm-w2', teamId: CLUB, userId: 'u-w2', role: 'player', status: 'active', playerGroupId: WOM },
  { id: 'm-arch', teamId: CLUB, userId: 'u-arch', role: 'player', status: 'archived', playerGroupId: U18 },
  // A different club entirely, with its OWN structure reusing the same gid.
  { id: 'm-rival', teamId: OTHER, userId: 'u-rival', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
  { id: 'm-rival-p', teamId: OTHER, userId: 'u-rival-p', role: 'player', status: 'active', playerGroupId: U18 },
];

const cookies = new Map();
async function seed() {
  kv.clear(); lists.clear(); cookies.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }, { id: OTHER, name: 'Rivals' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(STRUCTURE));
  kv.set(`app:structure:${OTHER}`, JSON.stringify({ version: 1,
    groups: [{ id: U18, name: 'Rival U18', type: 'general', status: 'active' }],
    teams:  [{ id: 'rt1', groupId: U18, name: 'Rival U18 XV', status: 'active' }] }));
  for (const m of MEMBERS) {
    const s = await createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}

function buildReq(method, url, body = null, userId = null) {
  return {
    method, url, headers: { cookie: userId ? cookies.get(userId) : '' },
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); },
  };
}
function buildRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    setHeader(n, v) { this.headers[n] = v; },
    writeHead(s, h = {}) { this.statusCode = s; this.headers = { ...this.headers, ...h }; },
    end(chunk = '') { this.body = String(chunk || ''); },
  };
}
async function chat(userId, method, url, body = null) {
  const r = buildRes();
  await chatHandler(buildReq(method, url, body, userId), r);
  return { code: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
}

const recips = (userId, gid) => chat(userId, 'GET', `/api/chat?action=group_recipients&groupId=${gid}`);
const send   = (userId, convId, text) => chat(userId, 'POST', '/api/chat', { action: 'send', convId, text });
const createGroupChannel = (userId, gid, type = 'GROUP') =>
  chat(userId, 'POST', '/api/chat', { action: 'create_conv', id: `group:${gid}`, groupId: gid,
    name: `${gid} players`, type });
const msgCount = sid => (lists.get(`app:chat:conv:${sid}:msgs`) || []).length;

// ── GROUP BROADCAST — server-resolved recipients ──────────────────────────
test('recipients resolve server-side from playerGroupId: exactly the group\'s active players', async () => {
  await seed();
  const sen = await recips('u-owner', SEN);
  assert.equal(sen.code, 200);
  assert.deepEqual(sen.body.recipients.map(r => r.userId).sort(), ['u-alex', 'u-s1', 'u-s2'],
    'Seniors = S1, S2 and Alex — Alex PLAYS Seniors');
  const u18 = await recips('u-owner', U18);
  assert.deepEqual(u18.body.recipients.map(r => r.userId).sort(), ['u-u1', 'u-u2'],
    'U18 = U1, U2 only — coaching U18 does NOT make Alex a U18 recipient');
  const wom = await recips('u-owner', WOM);
  assert.deepEqual(wom.body.recipients.map(r => r.userId).sort(), ['u-w1', 'u-w2']);
});

test('archived memberships are never recipients', async () => {
  await seed();
  const u18 = await recips('u-owner', U18);
  assert.equal(u18.body.recipients.some(r => r.userId === 'u-arch'), false, 'archived U18 player excluded');
});

test('a client-supplied recipient list is ignored — the server resolves its own', async () => {
  await seed();
  const r = await chat('u-owner', 'GET',
    `/api/chat?action=group_recipients&groupId=${U18}&recipients=u-s1,u-w1`);
  assert.deepEqual(r.body.recipients.map(x => x.userId).sort(), ['u-u1', 'u-u2'],
    'the forged query recipients change nothing');
});

// ── COACH AUTHORIZATION MATRIX ────────────────────────────────────────────
test('each coach may target exactly their accessScope groups — nothing else', async () => {
  await seed();
  const matrix = [
    ['u-owner', { [SEN]: 200, [U18]: 200, [WOM]: 200 }],
    ['u-sen-c', { [SEN]: 200, [U18]: 403, [WOM]: 403 }],
    ['u-u18-c', { [SEN]: 403, [U18]: 200, [WOM]: 403 }],
    ['u-wom-c', { [SEN]: 403, [U18]: 403, [WOM]: 200 }],
    ['u-uw-c',  { [SEN]: 403, [U18]: 200, [WOM]: 200 }],
    ['u-alex',  { [SEN]: 403, [U18]: 200, [WOM]: 200 }],
  ];
  for (const [user, expected] of matrix) {
    for (const [gid, code] of Object.entries(expected)) {
      const r = await recips(user, gid);
      assert.equal(r.code, code, `${user} → ${gid}`);
    }
  }
});

test('playing Seniors grants Alex NO Seniors broadcast authority — pinned distinction', async () => {
  await seed();
  assert.equal((await recips('u-alex', SEN)).code, 403, 'recipient resolution refused');
  assert.equal((await createGroupChannel('u-alex', SEN)).code, 403, 'channel creation refused');
  const senChan = await createGroupChannel('u-sen-c', SEN, 'ANNOUNCEMENT');
  assert.equal(senChan.code, 200);
  const blocked = await send('u-alex', `group:${SEN}`, 'Sneaky Seniors broadcast');
  assert.equal(blocked.code, 403, 'a group ANNOUNCEMENT accepts scoped staff only');
  assert.equal(msgCount(`group:${SEN}`), 0, 'zero messages written');
});

test('a player cannot send a coach broadcast; unknown groups are 404', async () => {
  await seed();
  assert.equal((await recips('u-s1', SEN)).code, 403, 'players have no recipient-resolution surface');
  assert.equal((await createGroupChannel('u-s1', SEN)).code, 403);
  assert.equal((await recips('u-owner', 'grp_forged')).code, 404);
  assert.equal((await createGroupChannel('u-owner', 'grp_forged')).code, 404);
});

test('another club\'s coach cannot touch this club\'s groups — and no write ever lands', async () => {
  await seed();
  // 'grp_womens' exists in Boitsfort only — for the rival club it is unknown.
  assert.equal((await recips('u-rival', WOM)).code, 404);
  assert.equal((await createGroupChannel('u-rival', WOM)).code, 404);
  assert.equal(lists.size, 0, 'no message list was created anywhere');
});

// ── GROUP CHANNEL READ/WRITE ISOLATION ────────────────────────────────────
test('a group channel serves its players and its operating staff — nobody else', async () => {
  await seed();
  assert.equal((await createGroupChannel('u-u18-c', U18)).code, 200);
  assert.equal((await send('u-u18-c', `group:${U18}`, 'U18: session moved to 18:00')).code, 200);

  assert.equal((await chat('u-u1', 'GET', `/api/chat?action=messages&convId=group:${U18}`)).code, 200, 'U18 player reads');
  assert.equal((await send('u-u1', `group:${U18}`, 'Got it coach')).code, 200, 'U18 player chats in their own channel');
  assert.equal((await chat('u-s1', 'GET', `/api/chat?action=messages&convId=group:${U18}`)).code, 403, 'Seniors player: no');
  assert.equal((await chat('u-w1', 'GET', `/api/chat?action=messages&convId=group:${U18}`)).code, 403, 'Women\'s player: no');
  assert.equal((await chat('u-sen-c', 'GET', `/api/chat?action=messages&convId=group:${U18}`)).code, 403,
    'a SENIORS coach has no window into the U18 channel — staff blanket access stops at group targeting');
  assert.equal((await send('u-sen-c', `group:${U18}`, 'crossing groups')).code, 403);
  assert.equal(msgCount(`group:${U18}`), 2, 'only the two legitimate messages exist');
});

test('the conversations list shows each person their OWN standing\'s channels', async () => {
  await seed();
  await createGroupChannel('u-sen-c', SEN);
  await createGroupChannel('u-u18-c', U18);
  await createGroupChannel('u-wom-c', WOM);
  const ids = async user => (await chat(user, 'GET', '/api/chat?action=conversations')).body.conversations.map(c => c.id);
  const s1 = await ids('u-s1');
  assert.ok(s1.includes(`group:${SEN}`), 'Seniors player sees the Seniors channel');
  assert.ok(!s1.includes(`group:${U18}`) && !s1.includes(`group:${WOM}`), 'and no other group\'s');
  const u18c = await ids('u-u18-c');
  assert.ok(u18c.includes(`group:${U18}`) && !u18c.includes(`group:${SEN}`) && !u18c.includes(`group:${WOM}`),
    'a U18 coach sees exactly the U18 channel');
  const owner = await ids('u-owner');
  assert.ok(owner.includes(`group:${SEN}`) && owner.includes(`group:${U18}`) && owner.includes(`group:${WOM}`),
    'the owner operates all three');
});

// ── ONE INBOX / DUAL ROLE ─────────────────────────────────────────────────
test('Phase 16 — Alex: one inbox holds Seniors (plays), U18+Women\'s (coaches) and his DM', async () => {
  await seed();
  await createGroupChannel('u-sen-c', SEN);
  await createGroupChannel('u-u18-c', U18);
  await createGroupChannel('u-wom-c', WOM);
  await send('u-sen-c', `group:${SEN}`, 'A: Seniors players message');
  await send('u-u18-c', `group:${U18}`, 'B: U18 players message');
  await send('u-wom-c', `group:${WOM}`, 'C: Women\'s players message');
  const dm = 'dm:u-alex:u-owner';
  await chat('u-owner', 'POST', '/api/chat', { action: 'create_conv', id: dm, type: 'DIRECT', participants: ['u-owner', 'u-alex'] });
  await send('u-owner', dm, 'D: direct to Alex');

  const list = (await chat('u-alex', 'GET', '/api/chat?action=conversations')).body.conversations;
  const byId = Object.fromEntries(list.map(c => [c.id, c]));
  assert.ok(byId[`group:${SEN}`]?.unread >= 1, 'A received — he PLAYS Seniors');
  assert.ok(byId[dm]?.unread >= 1, 'D received — direct to him');
  // B and C surface because he OPERATES those groups (the sender-side staff
  // standing, existing product semantics) — but he is NOT a recipient there:
  assert.equal((await recips('u-u18-c', U18)).body.recipients.some(r => r.userId === 'u-alex'), false);
  assert.equal((await recips('u-wom-c', WOM)).body.recipients.some(r => r.userId === 'u-alex'), false);
  // and his sends follow accessScope, from the same single account:
  assert.equal((await send('u-alex', `group:${U18}`, 'U18 kit note')).code, 200);
  assert.equal((await send('u-alex', `group:${WOM}`, 'Women\'s kit note')).code, 200);
  assert.equal((await send('u-alex', `group:${SEN}`, 'Seniors broadcast attempt')).code, 200,
    'the Seniors GROUP chat accepts him as a PLAYING member (like squad)');
  const senAnn = await chat('u-sen-c', 'POST', '/api/chat',
    { action: 'create_conv', groupId: SEN, type: 'ANNOUNCEMENT', name: 'Seniors notices' });
  assert.equal((await send('u-alex', senAnn.body.convId, 'broadcast attempt')).code, 403,
    'the Seniors BROADCAST refuses him — playing grants no broadcast authority');
});

test('one userId = one unread state: the conversations answer has no group dimension', async () => {
  await seed();
  await createGroupChannel('u-u18-c', U18);
  await send('u-u18-c', `group:${U18}`, 'note');
  const plain    = (await chat('u-alex', 'GET', '/api/chat?action=conversations')).body.conversations;
  const withHint = (await chat('u-alex', 'GET', `/api/chat?action=conversations&group=${WOM}`)).body.conversations;
  assert.deepEqual(
    withHint.map(c => [c.id, c.unread]),
    plain.map(c => [c.id, c.unread]),
    'a group hint changes NOTHING — inbox and unread are account-level');
});

// ── DIRECT MESSAGES / THREAD AUTHORIZATION ────────────────────────────────
test('group accessScope grants NO access to private DMs — participants only', async () => {
  await seed();
  const dm = 'dm:u-s1:u-sen-c';
  await chat('u-sen-c', 'POST', '/api/chat', { action: 'create_conv', id: dm, type: 'DIRECT', participants: ['u-s1', 'u-sen-c'] });
  await send('u-sen-c', dm, 'private Seniors matter');
  assert.equal((await chat('u-u18-c', 'GET', `/api/chat?action=messages&convId=${dm}`)).code, 403,
    'another coach cannot read it by guessing the id');
  assert.equal((await chat('u-owner', 'GET', `/api/chat?action=messages&convId=${dm}`)).code, 403,
    'even the owner is not a participant');
  assert.equal((await chat('u-s1', 'GET', `/api/chat?action=messages&convId=${dm}`)).code, 200, 'its participant reads');
});

// ── LEGACY COMPATIBILITY ──────────────────────────────────────────────────
test('legacy club-wide channels keep their exact semantics — no group is guessed', async () => {
  await seed();
  // announce = the existing whole-club broadcast: any staff writes, players read.
  assert.equal((await send('u-u18-c', 'announce', 'club-wide notice')).code, 200,
    'club-wide announce stays staff-writable (existing semantics preserved)');
  assert.equal((await send('u-s1', 'announce', 'player broadcast')).code, 403);
  assert.equal((await chat('u-w1', 'GET', '/api/chat?action=messages&convId=announce')).code, 200,
    'every player still reads club-wide announcements');
  // A legacy custom group without groupId keeps its old audience — all staff.
  await chat('u-owner', 'POST', '/api/chat', { action: 'create_conv', id: 'match-day-crew', type: 'GROUP', name: 'Match day crew' });
  assert.equal((await chat('u-u18-c', 'GET', '/api/chat?action=messages&convId=match-day-crew')).code, 200,
    'no group is inferred for legacy conversations');
});

// ── CROSS-CLUB COLLISION ──────────────────────────────────────────────────
test('two clubs may hold group:<same gid> — records, messages and access never mix', async () => {
  await seed();
  assert.equal((await createGroupChannel('u-u18-c', U18)).code, 200, 'Boitsfort U18 channel');
  assert.equal((await createGroupChannel('u-rival', U18)).code, 200, 'Rivals\' own U18 channel — their structure has that gid');
  await send('u-u18-c', `group:${U18}`, 'Boitsfort U18 message');
  await send('u-rival', `group:${U18}`, 'Rival U18 message');
  assert.equal(msgCount(`group:${U18}`), 1, 'default club stores on the plain key');
  assert.equal(msgCount(`group:${U18}@${OTHER}`), 1, 'rival club stores on its scoped key');
  const boitsfort = (await chat('u-u1', 'GET', `/api/chat?action=messages&convId=group:${U18}`)).body.messages;
  assert.deepEqual(boitsfort.map(m => m.text), ['Boitsfort U18 message'], 'each club reads only its own');
  const rival = (await chat('u-rival-p', 'GET', `/api/chat?action=messages&convId=group:${U18}`)).body.messages;
  assert.deepEqual(rival.map(m => m.text), ['Rival U18 message']);
});

// ── CLIENT — pinned wiring ────────────────────────────────────────────────
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

test('the coach directory follows the OPERATING group; players gain only their own channel', () => {
  const contacts = fn('chatBuildContacts');
  assert.match(contacts, /chatDirectoryPlayers\(\)\.filter\(p => p\.id !== me\.id\)/,
    'DM rows come from the operating group\'s pool');
  assert.match(contacts, /group:\$\{opGid\}/, 'the group channel row targets the operating group');
  assert.match(contacts, /operationalGroups\(\)\.length >= 2 \|\| opGid !== CE_INITIAL_GROUP_ID/,
    'a legacy single-group club keeps its Squad-only layout');
  assert.match(fn('chatCoachDmPickerPlayers'), /chatDirectoryPlayers\(\)/, 'the New-message picker is scoped too');
  // The directory helper itself: a SINGLE-group coach in a grouped club is
  // scoped to their group; only a pre-structure club keeps the full list.
  const dir = (gid, members, players) => new Function(`
    const state = { operationalGroupId: arguments[0] };
    const _adminData = { members: arguments[1] };
    function canonicalVisiblePlayers() { return arguments[2] || []; }
    const _rows = arguments[2];
    ${fn('chatDirectoryPlayers').replace('canonicalVisiblePlayers()', '_rows')}
    return chatDirectoryPlayers().map(p => p.id);
  `)(gid, members, players);
  const players = [
    { id: 'p-s', userId: 'u-s' }, { id: 'p-u', userId: 'u-u' }, { id: 'p-w', userId: 'u-w' }];
  const grouped = [
    { status: 'active', userId: 'u-s', playerGroupId: 'grp_initial' },
    { status: 'active', userId: 'u-u', playerGroupId: 'grp_u18' },
    { status: 'active', userId: 'u-w', playerGroupId: 'grp_womens' }];
  assert.deepEqual(dir('grp_u18', grouped, players), ['p-u'],
    'a U18-only coach discovers U18 people only — even with a single-group scope');
  assert.deepEqual(dir('grp_initial', [{ status: 'active', userId: 'u-s' }], players),
    ['p-s', 'p-u', 'p-w'], 'a pre-structure club (no grouped memberships) keeps the full directory');
  const allowed = fn('playerAllowedConversationIds');
  assert.match(allowed, /_myOperational\?\.player\?\.groups\?\.\[0\]\?\.id/, 'a player\'s channel comes from the identity payload');
});

test('the composer audience follows the group in force — never the one just left', () => {
  const sw = fn('setOperationalGroup');
  assert.match(sw, /startsWith\('group:'\)/, 'group-channel selection is re-pointed on switch');
  assert.match(sw, /group:\$\{groupId\}/);
  const load = fn('chatLoadGroupRecipients');
  assert.match(load, /_groupRecipients\[asked\]/, 'recipient replies file under the group they were ASKED for');
  assert.equal(/_groupRecipients\[state\.operationalGroupId\]\s*=/.test(load), false,
    'never keyed by whatever group is current when the reply lands');
  assert.match(fn('resetIdentityScopedState'), /_groupRecipients = \{\}/, 'identity reset clears the cache');
});

test('the Messages screen carries the inline group switcher (topbar is hidden there)', () => {
  assert.match(fn('renderChatShell'), /chatGroupSwitch/, 'permanent host in the once-built shell');
  assert.match(fn('chatRenderGroupSwitcher'), /operationalGroupSwitcherHTML\(\)/, 'filled from the shared switcher');
  assert.match(fn('chatRenderContactList'), /chatRenderGroupSwitcher\(\)/,
    'refilled on every list refresh, so late-arriving identity still surfaces it');
});

test('opening a group channel lazily creates it with explicit group metadata', () => {
  const ensure = fn('chatEnsureGroupChannel');
  assert.match(ensure, /groupId: gid/, 'the conversation stores its target group');
  assert.match(ensure, /operationalGroups\(\)\.find/, 'only groups this identity operates');
  assert.match(fn('selectChat'), /chatEnsureGroupChannel/);
});
