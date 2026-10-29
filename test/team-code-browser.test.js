/**
 * THE CODE MEMBERS SHOWS IS THE SERVER'S — in a real browser.
 *
 * A provisioned club's founder signs in on a fresh device. Members must show
 * the code the tenant record holds (and nothing else that looks like one); the
 * device-local "Change code" editor is gone; and a fresh device's join form is
 * NOT prefilled with the old "TEAM" placeholder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.team-code-browser.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;
delete process.env.VERCEL; delete process.env.NODE_ENV;

const kv = new Map(), lists = new Map();
globalThis.fetch = async (url, options = {}) => {
  const u = String(url || '');
  if (!u.startsWith(process.env.UPSTASH_REDIS_REST_URL)) throw new Error('unexpected fetch ' + u);
  let p; try { p = JSON.parse(options.body || '[]'); } catch { p = null; }
  if (!Array.isArray(p)) return { ok: true, json: async () => ({ result: null }) };
  const [cmd, ...a] = p; let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { if (String(a[2] || '').toUpperCase() === 'NX' && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { kv.delete(a[0]); result = 1; }
  if (cmd === 'SCAN') {
    const glob = String(a[a.indexOf('MATCH') + 1] ?? '*');
    const re = new RegExp('^' + glob.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const S = await import('../api/_identityStore.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* not installed */ }

const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).split('/')[0];
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const vreq = { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' }, query: Object.fromEntries(url.searchParams), body, url: req.url, socket: req.socket, on() {} };
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

const PW = 'longEnough123';
/** Provision → claim through the store: Nick's path, no HTTP needed to set the scene. */
async function provisionedClub(clubName, email) {
  kv.set('app:identity:users', JSON.stringify([]));
  kv.set('app:identity:teams', JSON.stringify([]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  const { team, invite } = await S.provisionClub({ clubName, adminEmail: email, adminName: 'Frankie Founder' });
  await S.claimInvite({ token: invite.token, email, name: 'Frankie Founder', password: PW, position: '2 — Hooker' });
  return team;
}

test('browser: Members shows the server\'s team code for a provisioned club; no local editor; a fresh join form has no placeholder code', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const email = 'founder@codeclub.test';
    const team = await provisionedClub('Code Club RFC', email);
    assert.match(team.teamCode, /^[A-Z]{1,6}\d{2,}$/, 'precondition: a minted code');

    // A FRESH device, not signed in: the join form is empty — no "TEAM".
    const anon = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const page0 = await anon.newPage();
    const errors = []; page0.on('pageerror', e => errors.push(e.message));
    await page0.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page0.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page0.evaluate(() => setAuthTab('join'));
    await page0.waitForSelector('#joinCode', { state: 'attached', timeout: 10000 });
    const prefill = await page0.evaluate(() => document.getElementById('joinCode')?.value ?? null);
    assert.equal(prefill, '', 'a fresh device suggests no code at all');
    assert.equal(await page0.evaluate(() => state.teamCode), '', 'the device holds no placeholder');
    await anon.close();

    // The founder signs in on another fresh device.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#identityLoginEmail', email);
    await page.fill('#identityLoginPassword', PW);
    await page.click('#identityLoginBtn');
    await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId, null, { timeout: 20000 });
    await page.waitForFunction(() => typeof state !== 'undefined' && !!state.teamCode, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => state.teamCode), team.teamCode, 'the device holds the server\'s code');

    await page.evaluate(() => setSection('coach', 'players'));   // the Members page (section id 'players')
    await page.waitForSelector('.join-code-value', { state: 'attached', timeout: 15000 });
    const shown = await page.evaluate(() => (document.querySelector('.join-code-value')?.textContent || '').trim());
    assert.equal(shown, team.teamCode, 'Members shows exactly the stored code');
    const bodyText = await page.evaluate(() => document.body.innerText);
    assert.equal(/Change code/.test(bodyText), false, 'no device-local editor');
    assert.equal(/\bTEAM\b/.test(shown), false);

    // After a reload the code is still the server's (hydrated again from the session).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId, null, { timeout: 20000 });
    await page.waitForFunction(() => typeof state !== 'undefined' && !!state.teamCode, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => state.teamCode), team.teamCode);
    assert.deepEqual(errors, [], 'no page errors');
    await ctx.close();
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
});
