/**
 * Password recovery — REAL browser, REAL client, REAL api handlers.
 *
 * Boots index.html in headless Chromium (phone viewport) against the real
 * api/*.js handlers running in-process on an in-memory KV, with the email
 * provider captured. A signed-out player walks the whole journey exactly as a
 * user would — welcome card → Log in → "Forgot password?" → the emailed link →
 * the reset modal → new password → log in — and the support route on the login
 * form is checked at the point a stuck player would look for it.
 *
 * Skips (never fails) when Playwright or its browser is not installed, so the
 * suite stays runnable on a machine without it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.recovery-browser.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
process.env.RESEND_API_KEY           = 'test-key-not-real';
delete process.env.VERCEL; delete process.env.NODE_ENV;     // the session cookie must not be Secure on http://127.0.0.1

let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const kv = new Map(); const lists = new Map(); const outbox = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const u = String(url || '');
  if (u.includes('api.resend.com')) { outbox.push(JSON.parse(options.body || '{}')); return { ok: true, status: 200, json: async () => ({ id: 'email_' + outbox.length }) }; }
  if (u.startsWith(process.env.UPSTASH_REDIS_REST_URL)) {
    let parsed; try { parsed = JSON.parse(options.body || '[]'); } catch { parsed = null; }
    if (!Array.isArray(parsed)) return { ok: true, json: async () => ({ result: null }) };
    const [cmd, ...args] = parsed; let result = null;
    if (cmd === 'GET')    result = kv.has(args[0]) ? kv.get(args[0]) : null;
    if (cmd === 'SET')  { kv.set(args[0], args[1]); result = 'OK'; }
    if (cmd === 'DEL')  { kv.delete(args[0]); result = 1; }
    if (cmd === 'LPUSH'){ const l = lists.get(args[0]) || []; l.unshift(args[1]); lists.set(args[0], l); result = l.length; }
    if (cmd === 'LRANGE') result = (lists.get(args[0]) || []).slice(Number(args[1]), Number(args[2]) + 1);
    if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
    return { ok: true, json: async () => ({ result }) };
  }
  return realFetch(url, options);
};

const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}
const store = await import('../api/_identityStore.js');

function mime(f) { return f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream'; }
/** Vercel-style req/res over node's http, so the handlers run unmodified. */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).split('/')[0];
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const vreq = { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' }, query: Object.fromEntries(url.searchParams), body, url: req.url, socket: req.socket };
    const vres = { statusCode: 200,
      status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res.setHeader(k, v); }, getHeader(k) { return res.getHeader(k); },
      writeHead(c, h) { res.writeHead(c, h); return this; }, write(d) { res.write(d); },
      json(d) { res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); },
      end(d) { res.statusCode = this.statusCode; res.end(d); }, send(d) { this.end(typeof d === 'string' ? d : JSON.stringify(d)); } };
    const h = handlers[name];
    if (!h) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    try { await h(vreq, vres); } catch { res.statusCode = 500; res.end('{}'); }
    return;
  }
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try { res.setHeader('content-type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
});

const PLAYER = 'gaetan.player@browser.test', OLD = 'OldPass123', NEW = 'NewPass456';

test('a signed-out player recovers their password in the browser and logs in with the new one', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const api = async body => { const r = await realFetch(BASE + '/api/identity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
  try {
    // Seed: a club, and a player approved through a join request.
    const club = await api({ action: 'create_club', clubName: 'Browser RFC', teamName: 'Seniors', sport: 'Rugby', name: 'Coach', email: 'coach@browser.test', password: 'CoachPass123' });
    assert.equal(club.status, 201);
    const teamCode = club.data.team?.code || club.data.team?.teamCode || club.data.teamCode;
    const join = await store.createJoinRequest({ teamCode, firstName: 'Gaetan', lastName: 'Player', email: PLAYER, password: OLD });
    await store.approveJoinRequest(join.teamMember.id, club.data.user.id, join.team.id);
    assert.equal((await api({ action: 'login', email: PLAYER, password: OLD })).status, 200, 'player can log in before');

    const ctx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    const page = await ctx.newPage();
    const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });

    // The stuck player's two routes are reachable from the login form itself.
    assert.ok(await page.isVisible('#identityResetBtn'), '"Forgot password?" is visible on the login form');
    await page.click('#authPanel summary:has-text("Trouble signing in?")');
    assert.ok(await page.isVisible('#authPanel a[href="mailto:support@coacheasier.com"]'), 'support address is visible once the welcome card is gone');
    await page.click('#authPanel button:has-text("Copy address")');
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    if (copied !== null) assert.equal(copied, 'support@coacheasier.com', 'the Copy button puts the address on the clipboard');

    // Recovery.
    await page.fill('#identityLoginEmail', PLAYER.toUpperCase());
    await page.click('#identityResetBtn');
    await page.waitForFunction(() => document.body.innerText.includes('If that email has an account'), null, { timeout: 10000 });
    const mail = outbox.find(m => /Reset your CoachEasier password/.test(m.subject || ''));
    assert.ok(mail, 'the reset email is produced'); assert.equal(mail.to, PLAYER);
    const link = ((mail.text || '').match(/https?:\/\/\S+/) || [])[0] || '';
    assert.ok(link.startsWith(BASE + '/?reset='), 'the link points at the host that served the form');

    await page.goto(link, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#reset-modal', { state: 'visible', timeout: 20000 });
    const reachable = await page.evaluate(() => { const i = document.getElementById('reset-password-input'); const r = i.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === i || i.contains(e); });
    assert.ok(reachable, 'the password field is on top of every other layer');
    await page.fill('#reset-password-input', NEW);
    await page.click('#reset-modal .btn.primary');
    await page.waitForFunction(() => !document.getElementById('reset-modal') && document.body.innerText.includes('Password updated'), null, { timeout: 10000 });
    assert.equal(new URL(page.url()).search, '', 'the token is removed from the address bar');

    // Log in with the NEW password, through the UI.
    if (await page.$('#ce-welcome')) await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#identityLoginEmail', PLAYER); await page.fill('#identityLoginPassword', NEW);
    await page.click('#identityLoginBtn');
    await page.waitForFunction(async () => (await fetch('/api/identity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'session' }) })).ok, null, { timeout: 20000 });
    const who = await page.evaluate(async () => (await (await fetch('/api/identity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'session' }) })).json()));
    assert.equal(who.user?.email, PLAYER); assert.equal(who.teamMember?.status, 'active');
    assert.equal(await page.evaluate(() => state.activeView), 'player', 'lands in the player view');
    assert.equal((await api({ action: 'login', email: PLAYER, password: OLD })).status, 401, 'old password dead');
    assert.deepEqual(pageErrors, [], 'no page errors along the way');
    await ctx.close();
  } finally {
    await browser.close(); server.close();
  }
});
