/**
 * Shared world for the Build 134 authority tests (not a test file itself).
 *
 * Two clubs. Club A has two active groups (the initial group "Seniors" and
 * "U18"), so a member whose scope is ONE group does not cover the club. Every
 * actor the authority matrix distinguishes, each with a live session:
 *   owner           — the founder (club-wide by ownership)
 *   admin           — head coach with explicit Full profile (club-wide)
 *   headSeniors     — head coach, default profile, scoped to Seniors only
 *   headU18         — head coach scoped to U18 only
 *   assistant       — assistant coach, club-wide scope (lacks manage-coaches)
 *   manager         — team manager, club-wide scope (lacks manage-coaches)
 *   player          — an active Seniors player
 *   pendingPlayer   — a pending join request (Seniors)
 *   pendingCoach    — a pending STAFF request
 *   ownerB          — Club B's owner (another club's staff)
 * Storage is an in-memory Upstash stand-in; every call goes straight to the
 * real handlers, so client validation is never in the way.
 */
process.env.UPSTASH_REDIS_REST_URL = 'https://redis.b134.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

export const kv = new Map();
export const lists = new Map();
const range = (list, s, e) => { const end = Number(e) < 0 ? list.length + Number(e) : Number(e); return list.slice(Number(s), end + 1); };
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  if (!String(u).includes('redis.b134.test')) return realFetch(u, o);
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET') r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { const nx = a.includes('NX'); if (nx && kv.has(a[0])) r = null; else { kv.set(a[0], a[1]); r = 'OK'; } }
  if (c === 'DEL') { kv.delete(a[0]); lists.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys(), ...lists.keys()].filter(k => re.test(k))]; }
  if (c === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); r = l.length; }
  if (c === 'LRANGE') r = range(lists.get(a[0]) || [], a[1], a[2]);
  if (c === 'LTRIM') { lists.set(a[0], range(lists.get(a[0]) || [], a[1], a[2])); r = 'OK'; }
  if (c === 'RENAME') { lists.set(a[1], lists.get(a[0]) || []); lists.delete(a[0]); r = 'OK'; }
  if (c === 'EXPIRE' || c === 'PING') r = c === 'PING' ? 'PONG' : 1;
  return { ok: true, json: async () => ({ result: r }) };
};

export const store = await import('../api/_identityStore.js');
export const structureStore = await import('../api/_structureStore.js');
export const { default: identity } = await import('../api/identity.js');
export const { default: invite } = await import('../api/invite.js');
export const { default: chat } = await import('../api/chat.js');
export const { default: publish } = await import('../api/publish.js');
export const { default: config } = await import('../api/config.js');
export const { SESSION_COOKIE } = store;
export const PW = 'password123';

export const read = k => { const v = kv.get(k); return typeof v === 'string' ? JSON.parse(v) : (v ?? []); };
export const members = () => read('app:identity:team_members');
export const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;

function jres() { return { statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, setHeader(n, v) { this.headers[n] = v; }, end() { return this; } }; }
let _ip = 0;
const ip = () => `10.34.${Math.floor(++_ip / 250)}.${_ip % 250}`;
export async function idCall(body, actor) {
  const r = jres(); await identity({ method: 'POST', query: {}, headers: { 'x-forwarded-for': ip(), ...(actor ? { cookie: ck(actor.session) } : {}) }, body }, r); return r;
}
export async function inviteCall(method, { body = {}, query = {}, actor } = {}) {
  const r = jres(); await invite({ method, query, headers: { host: 'b134.test', 'x-forwarded-for': ip(), ...(actor ? { cookie: ck(actor.session) } : {}) }, body }, r); return r;
}
export async function publishCall(method, query, body, actor) {
  const r = jres(); await publish({ method, query, headers: { 'x-forwarded-for': ip(), ...(actor ? { cookie: ck(actor.session) } : {}) }, body: body || {} }, r); return r;
}
export async function configCall(method, query, body, actor) {
  const r = jres(); await config({ method, query, headers: { 'x-forwarded-for': ip(), ...(actor ? { cookie: ck(actor.session) } : {}) }, body: body || {} }, r); return r;
}
export async function chatCall(method, url, body, actor) {
  const r = { statusCode: 0, body: '', headers: {}, setHeader(n, v) { this.headers[n] = v; }, writeHead(s) { this.statusCode = s; }, end(c = '') { this.body = String(c || ''); } };
  await chat({ method, url, headers: actor ? { cookie: ck(actor.session) } : {}, body, async *[Symbol.asyncIterator]() {} }, r);
  let data = null; try { data = JSON.parse(r.body); } catch {}
  return { status: r.statusCode, data };
}

let _n = 0;
/** A user + membership (+ player profile) written as the store writes them; a session when active. */
export async function addMember(teamId, { role = 'player', staffLevel, accessProfile, accessScope, status = 'active', playerGroupId, name } = {}) {
  const n = ++_n;
  const userId = `user_b134_${n}`;
  const email = `m${n}@b134.test`;
  const users = read('app:identity:users');
  users.push({ id: userId, email, displayName: name || `Member ${n}`, firstName: 'M', lastName: String(n), authProvider: 'password', passwordSet: true, emailVerified: true, createdAt: new Date().toISOString() });
  kv.set('app:identity:users', JSON.stringify(users));
  const list = members();
  const member = { id: `tm_b134_${n}`, teamId, userId, role, status, joinedAt: new Date().toISOString(),
    ...(staffLevel ? { staffLevel } : {}), ...(accessProfile ? { accessProfile } : {}),
    ...(accessScope ? { accessScope } : {}), ...(playerGroupId ? { playerGroupId } : {}) };
  list.push(member);
  kv.set('app:identity:team_members', JSON.stringify(list));
  if (role === 'player') {
    const ps = read('app:identity:player_profiles');
    ps.push({ id: `pp_b134_${n}`, teamId, teamMemberId: member.id, userId, displayName: name || `Member ${n}`, position: 'Prop', playerGroupId: playerGroupId || null });
    kv.set('app:identity:player_profiles', JSON.stringify(ps));
  }
  const session = status === 'active' ? await store.createSession({ userId, teamId, role }) : null;
  return { user: { id: userId, email }, member, session, email };
}

export async function world() {
  kv.clear(); lists.clear(); _n = 0;
  const A = await store.createClub({ clubName: 'Alpha RFC', teamName: 'Seniors', sport: 'rugby', name: 'Alpha Owner', email: 'owner.a@b134.test', password: PW });
  const B = await store.createClub({ clubName: 'Bravo RFC', teamName: 'Seniors', sport: 'rugby', name: 'Bravo Owner', email: 'owner.b@b134.test', password: PW });
  const a = A.team.id;
  const structA = await structureStore.loadClubStructure(a);
  const seniors = structA.groups.find(g => g.status !== 'archived').id;
  const u18 = (await structureStore.createGroup(a, { name: 'U18' })).group.id;
  const scoped = gid => ({ clubWide: false, groups: [{ groupId: gid, status: 'active' }], teams: [] });
  const w = {
    A, B, a, b: B.team.id, seniors, u18,
    owner: { user: A.user, member: members().find(m => m.userId === A.user.id && m.teamId === a), session: A.session, email: 'owner.a@b134.test' },
    ownerB: { user: B.user, member: members().find(m => m.userId === B.user.id), session: B.session, email: 'owner.b@b134.test' },
    admin: await addMember(a, { role: 'coach', staffLevel: 'head', accessProfile: 'full' }),
    headSeniors: await addMember(a, { role: 'coach', staffLevel: 'head', accessScope: scoped(seniors) }),
    headU18: await addMember(a, { role: 'coach', staffLevel: 'head', accessScope: scoped(u18) }),
    assistant: await addMember(a, { role: 'coach', staffLevel: 'assistant', accessScope: { clubWide: true, groups: [], teams: [] } }),
    manager: await addMember(a, { role: 'coach', staffLevel: 'manager', accessScope: { clubWide: true, groups: [], teams: [] } }),
    player: await addMember(a, { role: 'player', playerGroupId: seniors, name: 'Pat Player' }),
    pendingPlayer: await addMember(a, { role: 'player', status: 'pending', playerGroupId: seniors, name: 'Penny Pending' }),
    pendingU18: await addMember(a, { role: 'player', status: 'pending', playerGroupId: u18, name: 'Una U18' }),
    pendingCoach: await addMember(a, { role: 'coach', staffLevel: 'head', status: 'pending', name: 'Cody Coach' }),
  };
  w.bPending = await addMember(w.b, { role: 'player', status: 'pending', name: 'Bo Bravo' });
  return w;
}
