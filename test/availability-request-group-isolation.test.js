/**
 * BUILD L — an availability request's message belongs to its GROUP.
 *
 * sendAvailabilityRequest() wrote its chat copy to the hardcoded club-wide
 * 'squad' channel — the pre-group-isolation pattern — so a U18 coach's
 * request landed in every Seniors inbox. It now writes to the OPERATING
 * group's canonical channel (`group:<gid>`), which the server already
 * restricts to that group's players and staff.
 *
 * 'squad' survives in exactly one context, proven from the data model: a
 * legacy single-group club, where Squad IS the group's canonical channel —
 * the one its players read, and the same audience the coach's own Messages
 * UI offers. availabilityChatChannel() mirrors that UI's condition verbatim.
 *
 * Both halves are exercised for real: the client write path with a captured
 * fetch, and the server boundary with the actual api/chat.js handler.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const fn = n => extractFn(html, n);
const strip = s => s.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');

// ═══════════════ CLIENT — the write path, executed ═════════════════════════

/** The real senders over a captured fetch. */
function client({ groups, opGid, players }) {
  return new Function('cfg', `
    "use strict";
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    const state = { operationalGroupId: cfg.opGid, players: cfg.players,
      schedule: [{ id: 'tue', title: 'Tuesday training', date: '2026-09-08' },
                 { id: 'thu', title: 'Thursday training', date: '2026-09-10' }],
      availabilityRequests: [], messages: [], clubName: 'Riverside',
      availabilityTemplate: '' };
    const posts = [];
    const fetch = async (url, init) => {
      posts.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
      return { ok: true, json: async () => ({ ok: true, sent: cfg.players.length, total: cfg.players.length }) };
    };
    function operationalGroups() { return cfg.groups; }
    // The group roster: players stamped with a groupId belong to it; the
    // legacy single-group club falls through to the whole list — the same
    // shape the real operationalPlayers() produces.
    function operationalPlayers() {
      if (!cfg.groups.length || !cfg.opGid) return cfg.players;
      return cfg.players.filter(p => p.groupId === cfg.opGid);
    }
    function isCoach() { return true; }
    function currentUser() { return { id: 'coach1', name: 'Head Coach', role: 'coach' }; }
    const ceConfirm = async (title, body) => { state._confirmBody = body; return true; };
    function showToast(m) { state._toast = m; }
    function render() {}
    function saveState() {}
    const document = { querySelector: () => null };
    let _chatConversations = [];
    async function chatLoadStateModule() { state._chatLoaded = true; }
    async function chatFetchConversations() {}
    function sendPushToPlayers(title, body, opts) { state._push = { title, body, opts }; }
    ${fn('createCoachMessage')}
    ${fn('availabilityChatChannel')}
    ${fn('chatEnsureGroupChannel')}
    ${fn('sendAvailabilityRequest')}
    ${fn('sendAllAvailabilityRequests')}
    ${fn('sendAvailabilityNow')}
    return { state, posts,
      sendAvailabilityRequest, sendAllAvailabilityRequests, sendAvailabilityNow,
      availabilityChatChannel };
  `)({ groups, opGid, players });
}

const MULTI = { groups: [{ id: 'grp_initial', name: 'Seniors' }, { id: 'grp_u18', name: 'U18' }] };
const PLAYERS = [
  { id: 'p1', name: 'Sen One', groupId: 'grp_initial' },
  { id: 'p2', name: 'Sen Two', groupId: 'grp_initial' },
  { id: 'p3', name: 'Sen Three', groupId: 'grp_initial' },
  { id: 'y1', name: 'Youth One', groupId: 'grp_u18' },
];

test('A: a U18 request writes to U18’s channel — and ensures it exists first', async () => {
  const c = client({ ...MULTI, opGid: 'grp_u18', players: PLAYERS });
  await c.sendAvailabilityRequest('tue');
  const chat = c.posts.filter(p => p.url.includes('/api/chat')).map(p => p.body);
  const send = chat.find(b => b.action === 'send');
  assert.equal(send.convId, 'group:grp_u18', 'the OPERATING group’s channel');
  const create = chat.find(b => b.action === 'create_conv');
  assert.equal(create.id, 'group:grp_u18', 'the channel is ensured before posting');
  assert.equal(create.groupId, 'grp_u18', 'and bound to the group server-side');
  assert.ok(chat.indexOf(create) < chat.indexOf(send), 'ensure BEFORE send');
  assert.ok(!chat.some(b => b.convId === 'squad'), 'nothing touches the club-wide channel');
});

test('C: a Seniors request in a multi-group club writes to SENIORS’ channel, not squad', async () => {
  const c = client({ ...MULTI, opGid: 'grp_initial', players: PLAYERS });
  await c.sendAvailabilityRequest('tue');
  const send = c.posts.map(p => p.body).find(b => b && b.action === 'send');
  assert.equal(send.convId, 'group:grp_initial',
    'a multi-group club’s Seniors audience is the Seniors channel — squad would reach U18 too');
});

test('legacy single-group club: squad IS the canonical channel and is kept', async () => {
  const c = client({ groups: [{ id: 'grp_initial', name: 'Seniors' }], opGid: 'grp_initial',
                     players: PLAYERS.slice(0, 3).map(p => ({ ...p })) });
  assert.equal(c.availabilityChatChannel(), 'squad');
  await c.sendAvailabilityRequest('tue');
  const chat = c.posts.filter(p => p.url.includes('/api/chat')).map(p => p.body);
  assert.equal(chat.find(b => b.action === 'send').convId, 'squad');
  assert.ok(!chat.some(b => b.action === 'create_conv'), 'no group channel is invented for a legacy club');
});

test('the confirm, the recipients and the toast all count the GROUP, not the club', async () => {
  const c = client({ ...MULTI, opGid: 'grp_u18', players: PLAYERS });
  await c.sendAvailabilityRequest('tue');
  assert.match(c.state._confirmBody, /all 1 players/, 'U18 has one player; the club has four');
  assert.equal(c.state.messages.length, 1, 'one message row, for the one U18 player');
  assert.equal(c.state.messages[0].to, 'Youth One');
  assert.match(c.state._toast, /sent to 1 players/);
});

test('an empty group refuses honestly instead of messaging nobody or everybody', async () => {
  const empty = client({ ...MULTI, opGid: 'grp_u18',
    players: PLAYERS.filter(p => p.groupId !== 'grp_u18') });
  await empty.sendAvailabilityRequest('tue');
  assert.match(empty.state._toast, /No players in this group yet/);
  assert.equal(empty.posts.length, 0, 'nothing was sent anywhere');
});

test('send-all and the Overview quick action scope their recipients the same way', async () => {
  const c = client({ ...MULTI, opGid: 'grp_u18', players: PLAYERS });
  await c.sendAllAvailabilityRequests();
  assert.match(c.state._toast, /sent to 1 players/, 'send-all counts the group');
  assert.ok(c.state.messages.every(m => m.to === 'Youth One'), 'rows only for group players');

  const c2 = client({ ...MULTI, opGid: 'grp_u18', players: PLAYERS });
  await c2.sendAvailabilityNow();
  assert.ok(c2.state.messages.every(m => m.to === 'Youth One'), 'quick action too');
  const push = c2.posts.find(p => p.url.includes('/api/push'));
  assert.equal(push.body.group, 'grp_u18', 'and its push still names the group');
});

test('the channel rule mirrors the Messages UI condition — one convention, verbatim', () => {
  const ui = html.slice(html.indexOf('const opGid = state.operationalGroupId;'),
                        html.indexOf('chatLoadGroupRecipients(opGid);'));
  assert.match(ui, /operationalGroups\(\)\.length >= 2 \|\| opGid !== CE_INITIAL_GROUP_ID/);
  assert.match(strip(fn('availabilityChatChannel')),
    /operationalGroups\(\)\.length >= 2 \|\| opGid !== CE_INITIAL_GROUP_ID/,
    'the same condition decides both — they must never disagree');
});

// ═══════════════ SERVER — the boundary, exercised for real ════════════════

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.avail-req-isolation.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'LPUSH') { const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (command === 'LRANGE') result = (lists.get(args[0]) || []).slice(Number(args[1]), Number(args[2]) + 1);
  if (command === 'LTRIM') result = 'OK';
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const { default: chatHandler } = await import('../api/chat.js');
const store = await import('../api/_identityStore.js');

const CLUB = 'riverside';
const SEN = 'grp_initial', U18 = 'grp_u18';
const scope = gids => ({ clubWide: false, groups: gids.map(g => ({ groupId: g, status: 'active' })), teams: [] });
const MEMBERS = [
  { id: 'm-sen-c', teamId: CLUB, userId: 'u-sen-c', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([SEN]) },
  { id: 'm-u18-c', teamId: CLUB, userId: 'u-u18-c', role: 'coach', status: 'active', accessProfile: 'coach', accessScope: scope([U18]) },
  { id: 'm-sen-p', teamId: CLUB, userId: 'u-sen-p', role: 'player', status: 'active', playerGroupId: SEN },
  { id: 'm-u18-p', teamId: CLUB, userId: 'u-u18-p', role: 'player', status: 'active', playerGroupId: U18 },
];
const cookies = new Map();
async function seed() {
  kv.clear(); lists.clear(); cookies.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Riverside' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@t.test`, displayName: m.userId }))));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18', type: 'general', status: 'active' }], teams: [] }));
  for (const m of MEMBERS) {
    const s = await store.createSession({ userId: m.userId, teamId: m.teamId, role: m.role });
    cookies.set(m.userId, `${store.SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
  }
}
async function chat(userId, method, url, body = null) {
  const res = { statusCode: 0, headers: {}, body: '',
    setHeader(n, v) { this.headers[n] = v; },
    writeHead(s, h = {}) { this.statusCode = s; this.headers = { ...this.headers, ...h }; },
    end(chunk = '') { this.body = String(chunk || ''); } };
  await chatHandler({ method, url, headers: { cookie: cookies.get(userId) || '' },
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } }, res);
  return { code: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}
const REQ_TEXT = 'Availability request — Tuesday training (2026-09-08): Please confirm your availability.';

test('B+D+E: the server enforces exactly the boundary the client now writes to', async () => {
  await seed();
  // The U18 coach's client ensures the channel then posts the request — replay
  // those exact calls against the real handler.
  const create = await chat('u-u18-c', 'POST', '/api/chat',
    { action: 'create_conv', id: `group:${U18}`, groupId: U18, name: 'U18 players', type: 'GROUP' });
  assert.equal(create.code, 200);
  const send = await chat('u-u18-c', 'POST', '/api/chat',
    { action: 'send', convId: `group:${U18}`, text: REQ_TEXT });
  assert.equal(send.code, 200, 'A: the group write lands');

  // B: the Seniors player cannot read it.
  const senRead = await chat('u-sen-p', 'GET', `/api/chat?action=messages&convId=group:${U18}`);
  assert.equal(senRead.code, 403, 'B: Seniors is refused U18’s availability request');
  // ...and their conversation list does not even offer the channel.
  const senConvs = await chat('u-sen-p', 'GET', '/api/chat?action=conversations');
  assert.ok(!(senConvs.body.conversations || []).some(c => c.id === `group:${U18}`),
    'B: the channel is not in Seniors’ list');

  // The U18 player CAN read it — the request reaches its own audience.
  const u18Read = await chat('u-u18-p', 'GET', `/api/chat?action=messages&convId=group:${U18}`);
  assert.equal(u18Read.code, 200);
  assert.ok(u18Read.body.messages.some(m => m.text === REQ_TEXT), 'the audience receives it');

  // E: squad received NOTHING from this request.
  const squad = await chat('u-sen-p', 'GET', '/api/chat?action=messages&convId=squad');
  assert.equal(squad.code, 200, 'squad itself still works (F)');
  assert.ok(!(squad.body.messages || []).some(m => m.text === REQ_TEXT),
    'E: the club-wide channel holds no availability request');

  // C+D symmetric: Seniors’ request stays out of U18’s reach.
  await chat('u-sen-c', 'POST', '/api/chat',
    { action: 'create_conv', id: `group:${SEN}`, groupId: SEN, name: 'Seniors players', type: 'GROUP' });
  const senSend = await chat('u-sen-c', 'POST', '/api/chat',
    { action: 'send', convId: `group:${SEN}`, text: 'Availability request — Seniors only' });
  assert.equal(senSend.code, 200, 'C');
  const u18Cross = await chat('u-u18-p', 'GET', `/api/chat?action=messages&convId=group:${SEN}`);
  assert.equal(u18Cross.code, 403, 'D: U18 is refused Seniors’ request');

  // H: and a coach scoped to ONE group cannot post into the other’s channel.
  const forged = await chat('u-sen-c', 'POST', '/api/chat',
    { action: 'send', convId: `group:${U18}`, text: 'Sneaky cross-group request' });
  assert.equal(forged.code, 403, 'H: the send permission is group-scoped server-side');
});
