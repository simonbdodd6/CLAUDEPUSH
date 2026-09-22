/**
 * Password recovery — the complete production workflow, end to end, against the
 * real handler and store with an in-memory KV and a captured email provider.
 *
 * Written for the first real recovery case: a PLAYER who forgot their password.
 * Every step a real user takes is exercised in order — request, email, link,
 * token, new password, login — for a player (join-request account) AND a staff
 * account, plus the failure and security edges the flow must hold:
 *   unknown email is indistinguishable · invalid / expired / reused token rejected
 *   · old password dead · no token or password in any log · a provider
 *   rejection is RECORDED for staff (the one failure the constant public
 *   response hides) without recipient, link or any identifying detail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.recovery-workflow.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
process.env.RESEND_API_KEY           = 'test-key-must-never-appear';

const kv = new Map();          // plain keys
const lists = new Map();       // LPUSH/LRANGE lists
const outbox = [];
let provider = { ok: true, status: 200, body: { id: 'email_mock' } };
globalThis.fetch = async (url, options = {}) => {
  const u = String(url || '');
  if (u.includes('api.resend.com')) {
    outbox.push(JSON.parse(options.body || '{}'));
    return { ok: provider.ok, status: provider.status, json: async () => provider.body };
  }
  let parsed; try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
  if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ result: null }) };
  const [cmd, ...args] = parsed; let result = null;
  if (cmd === 'GET')    result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (cmd === 'SET')  { kv.set(args[0], args[1]); result = 'OK'; }
  if (cmd === 'DEL')  { kv.delete(args[0]); result = 1; }
  if (cmd === 'LPUSH'){ const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(args[0]) || []).slice(Number(args[1]), Number(args[2]) + 1);
  if (cmd === 'LTRIM'){ const l = lists.get(args[0]) || []; lists.set(args[0], l.slice(Number(args[1]), Number(args[2]) + 1)); result = 'OK'; }
  if (cmd === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identity } = await import('../api/identity.js');
const store = await import('../api/_identityStore.js');

function buildRes() {
  return { statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; },
    setHeader(n, v) { this.headers[n] = v; }, end() { return this; } };
}
let ipSeq = 0;
async function api(body, { ip = `203.0.113.${++ipSeq % 250}`, cookie = '' } = {}) {
  const res = buildRes();
  await identity({ method: 'POST', query: {}, headers: { 'x-forwarded-for': ip, 'x-forwarded-host': 'www.coacheasier.com', 'x-forwarded-proto': 'https', ...(cookie ? { cookie } : {}) }, body }, res);
  return res;
}
function resetRecords() { const raw = kv.get('app:identity:password_resets'); return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []; }
function errorLog() { return (lists.get('app:error_log') || []).map(v => (typeof v === 'string' ? JSON.parse(v) : v)); }
function captureConsole(fn) {
  const lines = []; const orig = { warn: console.warn, error: console.error, log: console.log };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  return fn().finally(() => Object.assign(console, orig)).then(r => ({ result: r, lines }));
}
const resetLinkOf = mail => ((mail?.text || '').match(/https?:\/\/\S+/) || [])[0] || '';
const tokenOf = link => decodeURIComponent(link.split('?reset=')[1] || '');

// ── Seed: a club with a staff account, and a player approved through a join request ──
const STAFF = 'coach@recovery.test', PLAYER = 'Player.One@Recovery.Test', PLAYER_OLD = 'PlayerOld123', PLAYER_NEW = 'PlayerNew456';
const club = await api({ action: 'create_club', clubName: 'Recovery RFC', teamName: 'Seniors', sport: 'Rugby', name: 'Head Coach', email: STAFF, password: 'CoachPass123' });
assert.equal(club.statusCode, 201, 'seed club');
const teamCode = club.body.team?.code || club.body.team?.teamCode || club.body.teamCode || club.body.team?.joinCode;
const join = await store.createJoinRequest({ teamCode, firstName: 'Player', lastName: 'One', email: PLAYER, password: PLAYER_OLD });
await store.approveJoinRequest(join.teamMember.id, club.body.user.id, join.team.id);
outbox.length = 0;

test('1–2. an existing PLAYER can request recovery and the intended reset email is produced', async () => {
  const res = await api({ action: 'request_password_reset', email: PLAYER.toUpperCase() });   // any casing
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true });
  const mail = outbox.find(m => /Reset your CoachEasier password/.test(m.subject));
  assert.ok(mail, 'a reset email was handed to the provider');
  assert.equal(mail.to, PLAYER.toLowerCase(), 'sent to the stored, normalised address');
  const link = resetLinkOf(mail);
  assert.match(link, /^https:\/\/www\.coacheasier\.com\/\?reset=[A-Za-z0-9_-]{20,}$/, 'link targets the production host with a URL-safe token');
  assert.ok(mail.html.includes(link), 'HTML button carries the same link');
  const record = resetRecords().find(r => r.email === PLAYER.toLowerCase());
  assert.ok(record && !record.usedAt, 'an unused reset record exists');
  assert.notEqual(record.tokenHash, tokenOf(link), 'only a HASH of the token is stored');
  assert.ok(new Date(record.expiresAt) > new Date(), 'with a future expiry');
});

test('3. an unknown email gets the identical public response and no email', async () => {
  const before = outbox.length;
  const res = await api({ action: 'request_password_reset', email: 'nobody@recovery.test' });
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true });
  assert.equal(outbox.length, before, 'nothing handed to the provider');
  assert.ok(!resetRecords().some(r => r.email === 'nobody@recovery.test'), 'no reset record');
});

test('4. an invalid token is rejected and changes nothing', async () => {
  const res = await api({ action: 'reset_password', token: 'definitely-not-a-token', password: 'Whatever123' });
  assert.equal(res.statusCode, 410);
  assert.equal((await api({ action: 'login', email: PLAYER, password: PLAYER_OLD })).statusCode, 200, 'old password still works');
});

test('5. an expired token is rejected', async () => {
  outbox.length = 0;
  await api({ action: 'request_password_reset', email: PLAYER });
  const link = resetLinkOf(outbox.find(m => /Reset your/.test(m.subject)));
  const all = resetRecords();
  const rec = all.find(r => r.tokenHash === createHash('sha256').update(tokenOf(link)).digest('hex'));
  assert.ok(rec, 'the record for THIS link is found by its token hash');
  rec.expiresAt = new Date(Date.now() - 1000).toISOString();          // the hour has passed
  kv.set('app:identity:password_resets', JSON.stringify(all));
  const res = await api({ action: 'reset_password', token: tokenOf(link), password: 'Whatever123' });
  assert.equal(res.statusCode, 410);
  assert.equal((await api({ action: 'login', email: PLAYER, password: PLAYER_OLD })).statusCode, 200, 'old password untouched');
});

let usedLink = '';
test('6–8. a valid token sets the new password; new password logs in; old one is dead; the token is spent', async () => {
  outbox.length = 0;
  await api({ action: 'request_password_reset', email: PLAYER });
  usedLink = resetLinkOf(outbox.find(m => /Reset your/.test(m.subject)));
  const res = await api({ action: 'reset_password', token: tokenOf(usedLink), password: PLAYER_NEW });
  assert.equal(res.statusCode, 200); assert.equal(res.body.ok, true);
  assert.ok(!('passwordHash' in (res.body.user || {})) && !('passwordSalt' in (res.body.user || {})), 'no hash material in the response');
  const login = await api({ action: 'login', email: PLAYER, password: PLAYER_NEW });
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.user.email, PLAYER.toLowerCase());
  assert.equal(login.body.teamMember.role, 'player'); assert.equal(login.body.teamMember.status, 'active');
  assert.match(login.headers['Set-Cookie'] || '', /ce_session=/, 'a session is issued');
  assert.equal((await api({ action: 'login', email: PLAYER, password: PLAYER_OLD })).statusCode, 401, 'old password no longer authenticates');
  assert.equal((await api({ action: 'reset_password', token: tokenOf(usedLink), password: 'Again12345' })).statusCode, 410, 'the token cannot be used twice');
  assert.equal((await api({ action: 'login', email: PLAYER, password: 'Again12345' })).statusCode, 401, 'and the second attempt changed nothing');
});

test('9. the player path IS the staff path: the same request → email → token → login sequence works for staff', async () => {
  outbox.length = 0;
  await api({ action: 'request_password_reset', email: STAFF });
  const link = resetLinkOf(outbox.find(m => /Reset your/.test(m.subject)));
  assert.ok(link, 'staff receive the same reset email');
  assert.equal((await api({ action: 'reset_password', token: tokenOf(link), password: 'CoachNew789' })).statusCode, 200);
  const login = await api({ action: 'login', email: STAFF, password: 'CoachNew789' });
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.teamMember.role, 'coach', 'staff role intact after recovery');
  assert.ok(Array.isArray(login.body.permissions) && login.body.permissions.length > 0, 'staff permissions intact');
});

test('10. the player account remains functional after both recoveries (membership, session)', async () => {
  const login = await api({ action: 'login', email: PLAYER, password: PLAYER_NEW });
  assert.equal(login.statusCode, 200);
  const cookie = (login.headers['Set-Cookie'] || '').split(';')[0];
  const session = await api({ action: 'session' }, { cookie });
  assert.equal(session.statusCode, 200);
  assert.equal(session.body.user.id, join.user.id, 'the session is the same account that was approved');
});

test('12. no token, link or password is written to any log — request, reset, and provider failure', async () => {
  outbox.length = 0;
  provider = { ok: false, status: 403, body: { message: 'domain is not verified' } };
  const before = errorLog().length;
  const { result: res, lines } = await captureConsole(() => api({ action: 'request_password_reset', email: PLAYER }));
  provider = { ok: true, status: 200, body: { id: 'email_mock' } };
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true }, 'a provider rejection is still the constant public response');
  const record = resetRecords().find(r => r.email === PLAYER.toLowerCase() && !r.usedAt);
  const joined = lines.join('\n');
  assert.ok(!/reset=/.test(joined) && !new RegExp(record.tokenHash).test(joined), 'no link, token or token hash in logs');
  assert.ok(!/test-key-must-never-appear/.test(joined), 'no API key in logs');
  assert.ok(!new RegExp(PLAYER.toLowerCase()).test(joined), 'no recipient in logs');
  // The reset itself never logs the password.
  const { lines: resetLines } = await captureConsole(() => api({ action: 'reset_password', token: 'x'.repeat(40), password: 'SecretPw999' }));
  assert.ok(!/SecretPw999/.test(resetLines.join('\n')), 'password never logged');
  // 12b. …but the rejection IS recorded for staff, with nothing identifying in it.
  const entries = errorLog().slice(0, errorLog().length - before);
  const hit = entries.find(e => /password_reset/.test(e.message));
  assert.ok(hit, 'provider rejection of a password-reset email is recorded in the Production health log');
  assert.equal(hit.kind, 'api_failure'); assert.equal(hit.status, 502);
  assert.match(hit.message, /provider HTTP 403/);
  const dump = JSON.stringify(hit);
  assert.ok(!/recovery\.test|reset=|coach@|player/i.test(dump.replace(/password_reset/g, '')), `nothing identifying stored: ${dump}`);
});

test('11. the audit trail records the request without any secret', async () => {
  const audit = (() => { const raw = kv.get('app:identity:audit_log'); return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []; })();
  const reqs = audit.filter(a => a.event === 'password_reset_requested');
  assert.ok(reqs.length > 0, 'requests are audited');
  const dump = JSON.stringify(audit);
  assert.ok(!/reset=|tokenHash|PlayerNew456|PlayerOld123|CoachNew789/.test(dump), 'no token or password in the audit trail');
});
