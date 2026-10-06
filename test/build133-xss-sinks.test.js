/**
 * PLAYER-CONTROLLED TEXT IS INERT, AT THE SERVER AND ON THE PAGE (Build 133, P0 #1)
 *
 * Build 132 found stored XSS reachable by any player:
 *   - the Members table wrote name, email and position without escaping, and
 *     the position check accepted any 40-character string containing 1–15
 *     ("1<img src=x onerror=…>" passed on its "1");
 *   - a chat reply's id was stored verbatim and placed inside an inline click
 *     handler; reaction keys were stored as sent and placed in a handler too;
 *   - a conversation's icon was stored as sent and painted as avatar initials.
 * The CSP allows inline script, so markup there runs in the coach's session.
 *
 * Two walls, each proved here on its own:
 *   SERVER — hostile values sent straight to the API (no client validation in
 *            the way) are REFUSED with 400 and nothing is written;
 *   CLIENT — hostile values already stored (legacy data, or a future path the
 *            server misses) render as inert text on desktop and Pixel 5: no
 *            script runs, no element is injected, and clicking the reply quote,
 *            the reaction and the conversation does not run the payload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.b133-xss.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const lists = new Map();
const range = (list, s, e) => { const end = Number(e) < 0 ? list.length + Number(e) : Number(e); return list.slice(Number(s), end + 1); };
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  if (!String(u).includes('redis.b133-xss.test')) return realFetch(u, o);
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { const nx = a.includes('NX'); if (nx && kv.has(a[0])) r = null; else { kv.set(a[0], a[1]); r = 'OK'; } }
  if (c === 'DEL') { kv.delete(a[0]); lists.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); r = l.length; }
  if (c === 'RPUSH') { const l = lists.get(a[0]) || []; l.push(a[1]); lists.set(a[0], l); r = l.length; }
  if (c === 'LRANGE') r = range(lists.get(a[0]) || [], a[1], a[2]);
  if (c === 'LTRIM') { lists.set(a[0], range(lists.get(a[0]) || [], a[1], a[2])); r = 'OK'; }
  if (c === 'RENAME') { lists.set(a[1], lists.get(a[0]) || []); lists.delete(a[0]); r = 'OK'; }
  if (c === 'EXPIRE') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: identity } = await import('../api/identity.js');
const { default: chat } = await import('../api/chat.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = store;

const PW = 'password123';
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
function jres() { return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader() {}, end() { return this; } }; }
function rawres() { return { statusCode: 0, headers: {}, body: '', setHeader(n, v) { this.headers[n] = v; }, writeHead(s, h = {}) { this.statusCode = s; }, end(c = '') { this.body = String(c || ''); } }; }
async function idCall(body, cookie) { const r = jres(); await identity({ method: 'POST', query: {}, headers: { 'x-forwarded-for': `10.9.${Math.random()}`, ...(cookie ? { cookie } : {}) }, body }, r); return r; }
async function chatCall(method, url, body, cookie) {
  const r = rawres();
  await chat({ method, url, headers: cookie ? { cookie } : {}, body, async *[Symbol.asyncIterator]() {} }, r);
  return { status: r.statusCode, data: (() => { try { return JSON.parse(r.body); } catch { return null; } })() };
}
async function rosterCall(method, body, cookie) {
  const r = jres();
  await publish({ method, query: { resource: 'roster' }, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Coach`, email: `c${++_t}@xss.test`, password: PW });
}
async function invitePlayer(teamId, { name = 'Pat Player', position = '2 — Hooker', email = `p${++_t}@xss.test` } = {}) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name: 'Invited', role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ position, token, email, name, password: PW });
}
const HOSTILE = {
  html: '<img src=x onerror="window.__xss=(window.__xss||0)+1">',
  attr: 'x" onmouseover="window.__xss=1" data-x="',
  quoteJs: "x');window.__xss=1;('",
  position: '1<img src=x onerror=alert(1)>',
  email: 'x"><svg/onload=window.__xss=1>@a.bc',
};

// ═══ SERVER ════════════════════════════════════════════════════════════════

test('SERVER chat: a hostile reply id, extra reply fields or a non-object reply is refused; a real reply is stored as {id, senderName, text} only', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const seed = await chatCall('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'first' }, ck(A.session));
  assert.equal(seed.status, 200);
  const firstId = seed.data.message.id;
  for (const replyTo of [{ id: HOSTILE.quoteJs }, { id: HOSTILE.html }, { id: firstId, onclick: 'x' }, 'not-an-object', [firstId], { id: '' }]) {
    const r = await chatCall('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'reply', replyTo }, ck(A.session));
    assert.equal(r.status, 400, `replyTo ${JSON.stringify(replyTo)} → ${r.status}`);
  }
  const ok = await chatCall('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'reply', replyTo: { id: firstId, senderName: 'A', text: 'first' } }, ck(A.session));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.message.replyTo, { id: firstId, senderName: 'A', text: 'first' });
  const read = await chatCall('GET', '/api/chat?action=messages&convId=squad&since=0', null, ck(A.session));
  assert.equal(read.data.messages.length, 2, 'only the two good messages were stored');
});

test('SERVER chat: a reaction must be an emoji — markup and quote-breaking keys are refused, real emoji work', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const m = (await chatCall('POST', '/api/chat', { action: 'send', convId: 'squad', text: 'hi' }, ck(A.session))).data.message;
  for (const emoji of [HOSTILE.html, HOSTILE.quoteJs, 'x', '', '❤️<b>']) {
    const r = await chatCall('POST', '/api/chat', { action: 'react', msgId: m.id, convId: 'squad', emoji }, ck(A.session));
    assert.equal(r.status, 400, `emoji ${JSON.stringify(emoji)} → ${r.status}`);
  }
  for (const emoji of ['👍', '❤️', '😂', '🙏', '🔥', '👍🏽']) {
    const r = await chatCall('POST', '/api/chat', { action: 'react', msgId: m.id, convId: 'squad', emoji }, ck(A.session));
    assert.equal(r.status, 200, `emoji ${emoji} → ${r.status} ${JSON.stringify(r.data)}`);
  }
  const stored = (await chatCall('GET', '/api/chat?action=messages&convId=squad&since=0', null, ck(A.session))).data.messages[0];
  assert.deepEqual(Object.keys(stored.reactions).sort(), ['❤️', '👍', '👍🏽', '😂', '🔥', '🙏'].sort());
});

test('SERVER chat: a conversation id, name or icon that could be markup is refused; group names too', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const me = A.user.id;
  const bad = [
    { id: HOSTILE.quoteJs, name: 'DM', type: 'DIRECT', participants: [me] },
    { id: 'dm:ok:conv', name: HOSTILE.html, type: 'DIRECT', participants: [me] },
    { id: 'dm:ok:conv2', name: 'DM', icon: HOSTILE.html, type: 'DIRECT', participants: [me] },
    { id: 'dm:ok:conv3', name: 'DM', icon: "'x", type: 'DIRECT', participants: [me] },
  ];
  for (const b of bad) {
    const r = await chatCall('POST', '/api/chat', { action: 'create_conv', ...b }, ck(A.session));
    assert.equal(r.status, 400, `${JSON.stringify(b)} → ${r.status} ${JSON.stringify(r.data)}`);
  }
  const good = await chatCall('POST', '/api/chat', { action: 'create_conv', id: `dm:${me}:user_other`, name: "Zoë O'Brien", type: 'DIRECT', participants: [me] }, ck(A.session));
  assert.notEqual(good.status, 400, `a real DM is not refused (${good.status} ${JSON.stringify(good.data)})`);
  const grp = await chatCall('POST', '/api/chat', { action: 'create_group', name: HOSTILE.html, memberIds: [] }, ck(A.session));
  assert.equal(grp.status, 400, JSON.stringify(grp.data));
});

test('SERVER identity: a hostile name or position is refused at the invite claim, the join and the profile update', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  await assert.rejects(() => invitePlayer(A.team.id, { position: HOSTILE.position }), e => e.code === 'position_required', 'markup position is not a position');
  await assert.rejects(() => invitePlayer(A.team.id, { position: '9;alert(1)' }), e => e.code === 'position_required');
  await assert.rejects(() => invitePlayer(A.team.id, { name: HOSTILE.html }), e => e.status === 400 && e.code === 'unsafe_name');
  await assert.rejects(() => invitePlayer(A.team.id, { name: HOSTILE.attr }), e => e.status === 400);
  // a real one is unchanged
  const ok = await invitePlayer(A.team.id, { name: "Seán O'Neill-Dupont", position: 'No. 8' });
  assert.ok(ok.user?.id, 'an ordinary claim still works');
  // the profile update refuses before writing
  const before = JSON.stringify(JSON.parse(kv.get('app:identity:users')).find(u => u.id === ok.user.id));
  for (const body of [{ displayName: HOSTILE.html }, { firstName: HOSTILE.attr }, { playerDetails: { position: HOSTILE.position } }]) {
    const r = await idCall({ action: 'update_profile', ...body }, ck(ok.session));
    assert.equal(r.statusCode, 400, `${JSON.stringify(body)} → ${r.statusCode}`);
  }
  assert.equal(JSON.stringify(JSON.parse(kv.get('app:identity:users')).find(u => u.id === ok.user.id)), before, 'nothing written');
  const good = await idCall({ action: 'update_profile', displayName: 'Seán Ó Néill', playerDetails: { position: 'Back row (6/7)' } }, ck(ok.session));
  assert.equal(good.statusCode, 200, JSON.stringify(good.body));
});

test('SERVER roster: a row whose name, position or email could be markup refuses the save; nothing is written', async () => {
  kv.clear(); lists.clear(); _t = 0;
  const A = await club('Alpha');
  const okSave = await rosterCall('POST', { players: [{ id: 'r1', name: 'Ana Ruiz', position: 'Prop', email: "ana.o'brien@x.test" }] }, ck(A.session));
  assert.equal(okSave.statusCode, 200, JSON.stringify(okSave.body));
  const keyFor = [...kv.keys()].find(k => /roster/.test(k));
  const storedBefore = kv.get(keyFor);
  for (const row of [
    { id: 'r1', name: HOSTILE.html, position: 'Prop' },
    { id: 'r1', name: 'Ana Ruiz', position: HOSTILE.position },
    { id: 'r1', name: 'Ana Ruiz', position: 'Prop', email: HOSTILE.email },
  ]) {
    const r = await rosterCall('POST', { players: [row] }, ck(A.session));
    assert.equal(r.statusCode, 400, `${JSON.stringify(row)} → ${r.statusCode}`);
    assert.match(String(r.body?.error || ''), /Roster row "r1"/);
  }
  assert.equal(kv.get(keyFor), storedBefore, 'the stored roster is unchanged');
});

// ═══ CLIENT ════════════════════════════════════════════════════════════════

let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* skipped below — and reported, never silently */ }
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const COACH = { id: 'u1', name: 'Coach Stub', email: 'c@s.test', role: 'coach' };
// Stored BEFORE validation existed (legacy data): the page must still render it inert.
const PLAYERS = [
  { id: 'h1', userId: 'u_h1', name: HOSTILE.html, position: HOSTILE.position, email: HOSTILE.email, playerGroupId: 'grp_a' },
  { id: 'h2', userId: 'u_h2', name: HOSTILE.attr, position: 'Prop', email: 'ok@x.test', playerGroupId: 'grp_a' },
  { id: 'h3', userId: 'u_h3', name: "Seán O'Neill", position: '2 — Hooker', email: "sean.o'neill@x.test", playerGroupId: 'grp_a' },
];
const NOW = Date.now();
const SQUAD_MSGS = [
  { id: 'm1', convId: 'squad', senderId: 'u_h1', senderName: HOSTILE.html, senderRole: 'player', text: HOSTILE.html, ts: NOW - 60000, reactions: {}, replyTo: null },
  { id: 'm2', convId: 'squad', senderId: 'u_h2', senderName: 'Pat', senderRole: 'player', text: 'reply', ts: NOW - 30000,
    replyTo: { id: HOSTILE.quoteJs, senderName: HOSTILE.html, text: HOSTILE.html },
    reactions: { [HOSTILE.quoteJs]: [{ userId: 'u_h2', userName: 'Pat' }], [HOSTILE.html]: [{ userId: 'u_h1', userName: 'x' }], '👍': [{ userId: 'u_h3', userName: 'S' }] } },
];
const CONVS = [
  // A group-type record so the contact list keeps it (a DIRECT one is merged
  // into the roster's own DM contact for the same partner).
  { id: HOSTILE.quoteJs, name: HOSTILE.html, type: 'GROUP', icon: HOSTILE.html, participants: ['u1', 'u_h1'], lastActivity: NOW, teamId: 'team_a' },
];

function stub() {
  const log = [];
  const srv = http.createServer(async (req, res) => {
    const u = req.url || '/';
    let body = ''; if (req.method !== 'GET') { for await (const c of req) body += c; }
    const send = (o, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/')) {
      log.push(`${req.method} ${u}`);
      if (u.startsWith('/api/identity?action=session') || u.startsWith('/api/identity?')) {
        return send({ ok: true, user: { ...COACH, platformRole: '' }, teamMember: { teamId: 'team_a', userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null },
          permissions: ['reports', 'messaging', 'manage_players', 'manage_teams', 'manage_coaches', 'training', 'matchday', 'publish_training'],
          memberships: [{ teamId: 'team_a', teamName: 'Alpha RFC', role: 'coach', staffLevel: 'head', canonicalRole: 'head_coach', current: true }],
          operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: { groups: [{ id: 'grp_a', name: 'Seniors', developmentCategory: 'adult' }], defaultGroupId: 'grp_a', mustChoose: false } } });
      }
      if (u === '/api/identity' && req.method === 'GET') {
        return send({ ok: true, users: [{ id: 'u1', displayName: 'Coach Stub', email: 'c@s.test', role: 'coach' }, ...PLAYERS.map(p => ({ id: p.userId, displayName: p.name, email: p.email, role: 'player' }))],
          team_members: [{ teamId: 'team_a', userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: null }, ...PLAYERS.map(p => ({ teamId: 'team_a', userId: p.userId, role: 'player', status: 'active', playerGroupId: 'grp_a' }))],
          player_profiles: PLAYERS.map(p => ({ id: 'pp_' + p.id, userId: p.userId, teamId: 'team_a', displayName: p.name, position: p.position, playerGroupId: 'grp_a' })) });
      }
      if (u.startsWith('/api/roster') && req.method === 'GET') return send({ ok: true, players: PLAYERS });
      if (u.startsWith('/api/roster')) return send({ ok: true });
      if (u.startsWith('/api/chat?action=conversations')) return send({ ok: true, conversations: CONVS });
      if (u.startsWith('/api/chat?action=messages')) return send({ ok: true, messages: /convId=squad/.test(u) ? SQUAD_MSGS : [] });
      if (u.startsWith('/api/chat')) return send({ ok: true, conversations: [], messages: [] });
      if (u.startsWith('/api/availability')) return send({ resolved: {}, roster: PLAYERS });
      if (u.startsWith('/api/invite')) return send({ ok: true, invites: [] });
      if (u.startsWith('/api/publish?resource=fixtures')) return send({ ok: true, fixtures: [] });
      if (u.startsWith('/api/publish?resource=matchday-teams')) return send({ ok: true, groups: [{ id: 'grp_a', name: 'Seniors', status: 'active' }], teams: [] });
      if (u.startsWith('/api/publish?resource=training-schedule')) return send({ ok: true, slots: [], groupId: 'grp_a', canEdit: true });
      if (u.startsWith('/api/publish')) return send({ ok: true, club: { id: 'team_a', name: 'Alpha RFC', fixtures: [] } });
      if (u.startsWith('/api/schedules')) return send({ ok: true, schedules: [] });
      if (u.startsWith('/api/templates')) return send({ ok: true, templates: [] });
      return send({ ok: true });
    }
    const f = u.split('?')[0] === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return { srv, log };
}
const seedState = section => ({ activeView: 'coach', activeCoachSection: section, stateTeamId: 'team_a', clubName: 'Alpha RFC', currentUserId: 'u1',
  users: [{ ...COACH }], operationalGroupId: 'grp_a', players: PLAYERS, fixtures: [], messages: [], onboardingDismissed: true, availabilityRequests: [] });
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await f(); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise(r => setTimeout(r, 50)); } };

/** Everything that would betray an injected element or an executed payload. */
const INJECTED = () => ({
  ran: window.__xss || 0,
  imgX: document.querySelectorAll('img[src="x"]').length,
  svg: document.querySelectorAll('svg[onload]').length,
  handlers: [...document.querySelectorAll('[onerror],[onmouseover],[onload]')].filter(e => e.tagName !== 'BODY').length,
  forgedAttr: document.querySelectorAll('[data-x]').length,
});

for (const view of ['desktop', 'phone']) {
  test(`CLIENT (${view}): hostile names, positions and emails render as text in Members, the Availability board and the pickers — nothing runs, nothing is injected`, { timeout: 90000 }, async (t) => {
    assert.ok(chromium, 'playwright must be installed: this security test may not skip');
    const browser = await chromium.launch();
    const { srv } = stub();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), seedState('players'));
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss().catch(() => {}); });
      await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
      assert.ok(await waitFor(() => page.evaluate(() => document.querySelectorAll('#coach-players tr.member-row').length >= 3)), 'Members table painted');
      // the hostile text is visible AS TEXT
      const shown = await page.evaluate(() => document.getElementById('coach-players').innerText);
      assert.ok(shown.includes('<img src=x onerror='), 'the hostile name is shown literally');
      assert.ok(shown.includes('1<img src=x onerror=alert(1)>'), 'the hostile position is shown literally');
      assert.ok(shown.includes("Seán O'Neill"), 'an ordinary name still reads normally');
      // hover every row (a forged onmouseover would fire here) and open the picker views
      for (const row of await page.$$('#coach-players tr.member-row')) await row.hover().catch(() => {});
      for (const section of ['message', 'matchday', 'training', 'overview']) {
        await page.evaluate(id => setSection('coach', id), section);
        await page.waitForTimeout(400);
      }
      const inj = await page.evaluate(INJECTED);
      assert.deepEqual(inj, { ran: 0, imgX: 0, svg: 0, handlers: 0, forgedAttr: 0 }, `nothing injected or executed: ${JSON.stringify(inj)}`);
      assert.equal(dialogs, 0, 'no alert() ran');
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });

  test(`CLIENT (${view}): hostile chat text, sender, reply reference, reaction keys and conversation id/icon render inert — and clicking the reply quote, the reactions and the conversation runs nothing`, { timeout: 90000 }, async (t) => {
    assert.ok(chromium, 'playwright must be installed: this security test may not skip');
    const browser = await chromium.launch();
    const { srv, log } = stub();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      await ctx.addInitScript(s => localStorage.setItem('coach-eye-real-workflow-mvp-state-v1', JSON.stringify(s)), seedState('messages'));
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss().catch(() => {}); });
      await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
      assert.ok(await waitFor(() => page.evaluate(() => typeof selectChat === 'function' && _adminData.loaded === true)), 'app ready');
      assert.ok(await waitFor(() => page.evaluate(() => document.querySelectorAll('.chat-contact').length > 0)), 'contact list painted');
      // the hostile stored conversation's contact button: clicking it passes the id as DATA
      const findHostile = () => [...document.querySelectorAll('.chat-contact')].find(b => /window\.__xss/.test(b.getAttribute('onclick') || '')) || null;
      await waitFor(() => page.evaluate(findHostile).then(Boolean));
      const hostileContact = await page.evaluateHandle(findHostile);
      assert.ok(await hostileContact.evaluate(b => !!b), 'the stored hostile conversation is listed (so its click is really exercised): '
        + JSON.stringify(await page.evaluate(() => ({ convs: (_chatConversations || []).map(c => c.id), contacts: [...document.querySelectorAll('.chat-contact')].map(b => b.getAttribute('onclick')) }))) + ' ' + JSON.stringify(log.filter(l => /chat/.test(l)).slice(0, 8)));
      await hostileContact.evaluate(b => b.click());
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => state.selectedChatId), "x');window.__xss=1;('", 'the conversation id arrived as a plain string');
      // the squad thread with the hostile messages
      await page.evaluate(() => selectChat('squad'));
      assert.ok(await waitFor(() => page.evaluate(() => document.querySelectorAll('.reply-quote').length >= 1 && document.querySelectorAll('.chat-reaction').length >= 3)), 'thread painted: ' + JSON.stringify(log.slice(-6)));
      const thread = await page.evaluate(() => (document.querySelector('.chat-feed, #chatFeed, .chat-messages')?.innerText) || document.body.innerText);
      assert.ok(thread.includes('<img src=x onerror='), 'the hostile message text is shown literally');
      // click the reply quote and every reaction: the handlers receive data, never code
      await page.evaluate(() => { window.__scrolled = []; const real = chatScrollToMsg; window.chatScrollToMsg = id => { window.__scrolled.push(id); try { return real(id); } catch {} }; });
      await page.evaluate(() => document.querySelector('.reply-quote').click());
      assert.deepEqual(await page.evaluate(() => window.__scrolled), ["x');window.__xss=1;('"], 'the reply id reached the handler as one string');
      const reactions = await page.$$('.chat-reaction');
      for (const r of reactions) await r.evaluate(b => b.click());
      await page.waitForTimeout(300);
      const inj = await page.evaluate(INJECTED);
      assert.deepEqual(inj, { ran: 0, imgX: 0, svg: 0, handlers: 0, forgedAttr: 0 }, `nothing injected or executed: ${JSON.stringify(inj)}`);
      assert.equal(dialogs, 0, 'no alert() ran');
      // the react requests carried the hostile keys as data (the server now refuses them)
      assert.ok(log.some(l => l.startsWith('POST /api/chat')), 'the reaction clicks reached the API as ordinary requests');
      assert.deepEqual(errors, []);
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

test('SOURCE: inline-handler arguments use jsAttr(); no handler interpolates a reply id, reaction key, message id or conversation id raw', () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(src, /function jsAttr\(value\) \{\s*return esc\(JSON\.stringify\(String\(value \?\? ''\)\)\);\s*\}/);
  for (const raw of [`chatScrollToMsg('\${m.replyTo.id}')`, `chatReact('\${m.id}','\${em}')`, `chatReact('\${msgId}','\${em}')`, `selectChat('\${c.id}')`]) {
    assert.ok(!src.includes(raw), `raw handler interpolation is gone: ${raw}`);
  }
  for (const raw of ['${p.name}</strong>', '<span class="pill" style="font-size:11px">${p.position}</span>', '${p.email||""}</div>', '${initials}</div>']) {
    assert.ok(!src.includes(raw), `raw text sink is gone: ${raw}`);
  }
});
