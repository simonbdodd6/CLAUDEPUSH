/**
 * Password reset — what the player actually sees, and where the link points.
 *
 * A real player reported that "Forgot password?" does not send the email.
 * Production logs held no reset POST at all for the window we could see, and
 * the live client was reproduced doing this: with the email field empty the
 * handler returns before any request and says so in a toast at the BOTTOM of
 * the screen for about two seconds — under the phone keyboard. Someone who
 * has forgotten their password taps recovery FIRST, before typing anything,
 * and sees nothing happen. (That reproduction is the shape of the complaint;
 * it is not proof of this particular player's attempt, which no log covers.)
 *
 * Three things are pinned here:
 *   1. an empty email produces a PERSISTENT inline error and NO request;
 *   2. the rate limiter's own wait time reaches the user, instead of being
 *      replaced by "a few minutes" while the window is an hour;
 *   3. a reset link's origin is the application's configured URL and can
 *      never be chosen by the request's Host header.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

/** The reset request handler, with a recording fetch and a recording renderNav. */
function scope({ status = 200, body = { ok: true }, email = '', throwNetwork = false } = {}) {
  return new Function(`"use strict";
    let _resetFieldError = '';
    const calls = { fetch: [], toasts: [], renders: 0, focused: 0, warns: [] };
    const console = { warn: (...a) => calls.warns.push(a.map(String).join(' ')) };
    const field = { value: ${JSON.stringify(email)}, focus: () => { calls.focused++; },
                    setAttribute() {}, removeAttribute() {} };
    const errEl = { hidden: true };
    const btn = { disabled: false, textContent: 'Forgot password?' };
    const document = { getElementById: id =>
      id === 'identityLoginEmail' ? field :
      id === 'identityResetBtn' ? btn :
      id === 'identity-reset-error' ? errEl : null };
    function renderNav() { calls.renders++; }
    function showToast(m) { calls.toasts.push(String(m)); }
    async function fetch(url, opts) {
      calls.fetch.push({ url, body: opts && opts.body });
      if (${JSON.stringify(throwNetwork)}) throw new TypeError('Failed to fetch');
      return { ok: ${status} >= 200 && ${status} < 300, status: ${status},
               json: async () => (${JSON.stringify(body)}) };
    }
    ${fn('friendlyAuthError')}
    ${fn('clearResetFieldError')}
    ${fn('requestPasswordReset')}
    return { calls, requestPasswordReset, clearResetFieldError, friendlyAuthError,
             errEl, field, btn,
             error: () => _resetFieldError };
  `)();
}

// ── A. an empty email ─────────────────────────────────────────────────────
test('A. an empty email sends NOTHING and says so where the player is looking', async () => {
  const s = scope({ email: '' });
  await s.requestPasswordReset();
  assert.deepEqual(s.calls.fetch, [], 'no request leaves the browser');
  assert.equal(s.error(), 'Enter your email address first.', 'the panel now holds the message');
  assert.equal(s.calls.renders, 1, 'and repaints the panel so it is on screen');
  assert.equal(s.calls.focused, 1, 'the field still takes focus, as it always did');
});

test('A. the message lives in state, so a repaint cannot swallow it', () => {
  // #authPanel is rewritten wholesale by renderNav() on EVERY render pass, so
  // an error written straight into the DOM disappears at the next one. This is
  // why the message is a variable the template reads.
  const nav = fn('renderNav');
  assert.match(nav, /_resetFieldError/, 'the login template reads the error state');
  assert.match(nav, /id="identity-reset-error"/, 'and renders it as an element');
  assert.match(nav, /role="alert"/, 'announced to assistive tech');
  assert.match(nav, /aria-describedby="identity-reset-error"/, 'tied to the email field');
  assert.match(fn('requestPasswordReset'), /_resetFieldError = 'Enter your email address first\.'/);
  // It is NOT a toast-only path any more.
  assert.match(fn('requestPasswordReset'), /renderNav\(\)/, 'the empty case repaints');
});

test('A. it outlives the toast — nothing clears it on a timer', () => {
  const body = fn('requestPasswordReset') + fn('clearResetFieldError');
  assert.doesNotMatch(body, /setTimeout|setInterval/, 'the inline error has no expiry of any kind');
  // The toast's own lifetime, for contrast: ~2.2s minimum.
  assert.match(fn('showToast'), /el\.classList\.remove\("visible"\)/, 'the toast still fades, the field error does not');
});

test('A. typing an address clears it — without a repaint that would eat the keystroke', () => {
  const s = scope({ email: '' });
  return s.requestPasswordReset().then(() => {
    const rendersBefore = s.calls.renders;
    s.errEl.hidden = false;
    s.clearResetFieldError();
    assert.equal(s.error(), '', 'the state is cleared');
    assert.equal(s.errEl.hidden, true, 'and the element hidden directly');
    assert.equal(s.calls.renders, rendersBefore, 'no render — it would replace the field being typed in');
    // Idempotent: a second keystroke does nothing at all.
    s.clearResetFieldError();
    assert.equal(s.calls.renders, rendersBefore);
  });
});

test('A. the email field is wired to clear it as the player types', () => {
  const nav = fn('renderNav');
  const input = (nav.match(/<input id="identityLoginEmail"[^>]*>/) || [''])[0];
  assert.ok(input, 'the email field is still there');
  assert.match(input, /oninput="clearResetFieldError\(\)"/, 'typing clears the error');
  assert.match(input, /onkeydown="if\(event\.key==='Enter'\)loginIdentityAccount\(\)"/, 'Enter still logs in');
  assert.match(input, /type="email"/, 'and the field is otherwise untouched');
});

// ── B. a real address still works ─────────────────────────────────────────
test('B. a real address sends the request exactly as before', async () => {
  const s = scope({ email: '  Player@Club.com  ' });
  await s.requestPasswordReset();
  assert.equal(s.calls.fetch.length, 1, 'one request, not two');
  assert.equal(s.calls.fetch[0].url, '/api/identity');
  assert.deepEqual(JSON.parse(s.calls.fetch[0].body),
    { action: 'request_password_reset', email: 'Player@Club.com' }, 'trimmed, otherwise untouched');
  assert.ok(s.calls.toasts.some(t => /If that email has an account/.test(t)), 'the constant reply is unchanged');
  assert.equal(s.error(), '', 'and no stale error is left behind');
  assert.equal(s.btn.disabled, false, 'the button is released');
  assert.equal(s.btn.textContent, 'Forgot password?');
});

test('B. a stale error is cleared the moment a real attempt is made', async () => {
  const s = scope({ email: '' });
  await s.requestPasswordReset();
  assert.equal(s.error(), 'Enter your email address first.');
  const s2 = scope({ email: 'player@club.com' });
  await s2.requestPasswordReset();
  assert.equal(s2.error(), '', 'a sent request never leaves the "enter your email" message up');
});

// ── C. the rate limiter's own wait time ───────────────────────────────────
const RATE = 'Too many attempts. Wait 47 minutes, then double-check the exact email spelling and try again.';

test('C. a 429 shows the server\'s wait time, not "a few minutes"', async () => {
  const s = scope({ email: 'player@club.com', status: 429, body: { error: RATE } });
  await s.requestPasswordReset();
  const shown = s.calls.toasts[s.calls.toasts.length - 1];
  assert.equal(shown, RATE, 'the real wait reaches the player');
  assert.doesNotMatch(shown, /a few minutes/, 'the window is an hour — "a few minutes" sent them back to try again');
});

test('C. only the rate limiter\'s own sentence is surfaced — any other 429 body is not', () => {
  const s = scope();
  assert.equal(s.friendlyAuthError({ status: 429, message: RATE }, 'reset'), RATE);
  for (const message of ['Upstream redis://user:pw@host refused the connection',
                         'quota exceeded for key sk_live_abc', '', undefined]) {
    assert.equal(s.friendlyAuthError({ status: 429, message }, 'reset'),
      'Too many attempts. Please wait a few minutes and try again.',
      `server text that is not the rate-limit sentence is never echoed: ${JSON.stringify(message)}`);
  }
  assert.equal(s.friendlyAuthError(429, 'reset'), 'Too many attempts. Please wait a few minutes and try again.',
    'a bare status still has a message');
});

// ── E. every other failure behaves as it did ──────────────────────────────
test('E. non-429 errors keep their existing copy', async () => {
  for (const [status, expect] of [[401, /email or password is incorrect/i],
                                  [404, /couldn't find an account/i],
                                  [500, /Something went wrong/i]]) {
    const s = scope({ email: 'player@club.com', status, body: { error: 'server detail that must not leak' } });
    await s.requestPasswordReset();
    const shown = s.calls.toasts[s.calls.toasts.length - 1];
    assert.match(shown, expect, String(status));
    assert.doesNotMatch(shown, /server detail/, 'raw server text is not echoed for other statuses');
  }
});

test('E. a network failure is still reported, and the button still comes back', async () => {
  const s = scope({ email: 'player@club.com', throwNetwork: true });
  await s.requestPasswordReset();
  assert.ok(s.calls.toasts.length, 'the player is told something');
  assert.equal(s.btn.disabled, false, 'and can try again');
});

// ── F. where a reset link points ──────────────────────────────────────────
const { appBaseUrl } = await import('../api/_email.js');

test('F. a hostile Host header can never become the reset-link origin', () => {
  const saved = process.env.APP_URL;
  process.env.APP_URL = 'https://www.coacheasier.com';
  try {
    for (const headers of [
      { 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' },
      { host: 'attacker.example' },
      { 'x-forwarded-host': 'www.coacheasier.com.attacker.example' },
      { 'x-forwarded-host': 'attacker.example', host: 'attacker.example', 'x-forwarded-proto': 'http' },
    ]) {
      assert.equal(appBaseUrl({ headers }), 'https://www.coacheasier.com',
        'the application\'s own URL, whatever the caller claims to be: ' + JSON.stringify(headers));
    }
  } finally { if (saved === undefined) delete process.env.APP_URL; else process.env.APP_URL = saved; }
});

test('F. the configured application URL is what is used', () => {
  const saved = process.env.APP_URL;
  try {
    process.env.APP_URL = 'https://staging.coacheasier.com';
    assert.equal(appBaseUrl({ headers: { 'x-forwarded-host': 'attacker.example' } }), 'https://staging.coacheasier.com');
    delete process.env.APP_URL;
    assert.equal(appBaseUrl({ headers: {} }), 'https://www.coacheasier.com', 'and the real application by default');
    assert.equal(appBaseUrl(), 'https://www.coacheasier.com', 'even with no request at all');
  } finally { if (saved === undefined) delete process.env.APP_URL; else process.env.APP_URL = saved; }
});

test('F. the invite link already worked this way — reset now matches it', () => {
  const email = fs.readFileSync(path.join(ROOT, 'api', '_email.js'), 'utf8');
  const body = email.slice(email.indexOf('export function appBaseUrl'), email.indexOf('\n}', email.indexOf('export function appBaseUrl')));
  assert.doesNotMatch(body, /x-forwarded-host|headers\?\.\[?'?host/, 'the request host is not consulted');
  assert.match(body, /process\.env\.APP_URL/, 'the configured URL is');
  const invite = fs.readFileSync(path.join(ROOT, 'api', 'invite.js'), 'utf8');
  assert.match(invite, /const APP_URL\s*=\s*process\.env\.APP_URL \|\| 'https:\/\/www\.coacheasier\.com'/,
    'the invite link is unchanged — this is the rule it already followed');
});

test('F. no reset token is ever written to a log', () => {
  const email = fs.readFileSync(path.join(ROOT, 'api', '_email.js'), 'utf8');
  const identity = fs.readFileSync(path.join(ROOT, 'api', 'identity.js'), 'utf8');
  for (const [name, text] of [['api/_email.js', email], ['api/identity.js', identity]]) {
    for (const line of text.split('\n')) {
      if (!/console\.(log|warn|error|info)/.test(line)) continue;
      // Naming a secret in the PROSE of a diagnostic is fine ("RESEND_API_KEY
      // is not configured"); interpolating its VALUE is not. Strip the string
      // literals and look at what is left — the expressions.
      const code = line.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
      assert.doesNotMatch(code, /token|resetUrl|password|apiKey/i,
        `a secret VALUE reaches a log in ${name}: ${line.trim()}`);
    }
  }
  // And the reset link itself is built, never logged.
  assert.match(identity, /const resetUrl = `\$\{appBaseUrl\(req\)\}\/\?reset=/, 'the link is built from the trusted URL');
  assert.ok(!/console\.[a-z]+\([^)]*resetUrl/.test(identity), 'and never printed');
});

// ── the real login form ───────────────────────────────────────────────────
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

/** Serves the real index.html; records every /api/identity POST it receives. */
function loginServer(reply = { status: 200, body: { ok: true } }) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    if (req.method === 'POST' && u.startsWith('/api/identity')) {
      let b = ''; req.on('data', c => b += c);
      req.on('end', () => { seen.push(b); res.statusCode = reply.status;
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(reply.body)); });
      return;
    }
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.startsWith('/api/config')) return send({ version: 'test', emailConfigured: true, devLogin: false });
    if (u.startsWith('/api/identity')) { res.statusCode = 401; return send({ ok: false, error: 'No active session' }); }
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return { srv, seen, reply };
}

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): an empty email is answered where the player is looking`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    const { srv, seen } = loginServer();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    try {
      const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const resetPosts = []; page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/identity')) resetPosts.push(r.url()); });
      // In through the front door: the welcome card is a full-screen layer, so
      // its own "Log in" is the only way a player reaches this form.
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ce-welcome', { timeout: 20000 });
      await page.click('#ce-welcome button:has-text("Log in")');
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });

      // 1-3. tap recovery with nothing typed — what the reporting player did.
      await page.click('#identityResetBtn');
      await page.waitForSelector('#identity-reset-error', { state: 'visible', timeout: 5000 });
      const shown = async () => page.evaluate(() => {
        const el = document.getElementById('identity-reset-error');
        if (!el || el.hidden) return null;
        const r = el.getBoundingClientRect();
        return { text: el.textContent.trim(), w: r.width, h: r.height, top: r.top,
                 inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
                 invalid: document.getElementById('identityLoginEmail')?.getAttribute('aria-invalid') };
      });
      let e = await shown();
      assert.ok(e, '4. an inline error is on screen');
      assert.equal(e.text, 'Enter your email address first.');
      assert.ok(e.w > 0 && e.h > 0, 'it has real size');
      assert.ok(e.inViewport, 'and is inside the viewport, not below the fold');
      assert.equal(e.invalid, 'true', 'the field is marked invalid');
      assert.deepEqual(resetPosts, [], '5. no reset request was sent');
      assert.equal(seen.length, 0, 'and the server saw nothing');

      // It must outlive the toast (>=2.2s) AND survive the app's repaints.
      await page.evaluate(() => { render(); renderNav(); });
      await page.waitForTimeout(3200);
      e = await shown();
      assert.ok(e, 'the error is still there after the toast has gone and the app has repainted');
      assert.equal(e.text, 'Enter your email address first.');
      assert.equal(await page.evaluate(() => document.getElementById('toast')?.classList.contains('visible')), false,
        'the toast itself has faded — this is the point');

      // The field is still usable, and typing clears the error.
      await page.click('#identityLoginEmail');
      await page.type('#identityLoginEmail', 'player@club.test', { delay: 15 });
      assert.equal(await page.inputValue('#identityLoginEmail'), 'player@club.test', 'every keystroke survived');
      assert.equal(await shown(), null, 'and the error cleared as they typed');

      // 6-8. submit for real.
      await page.click('#identityResetBtn');
      await page.waitForFunction(() => /If that email has an account/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 10000 });
      assert.equal(resetPosts.length, 1, '7. exactly one request — no duplicate send');
      assert.deepEqual(JSON.parse(seen[0]), { action: 'request_password_reset', email: 'player@club.test' });

      assert.deepEqual(errors, [], 'no console errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0), 'no horizontal overflow');
      assert.ok(await page.isVisible('#identityLoginBtn') && await page.isVisible('#identityResetBtn'), 'the login form is intact');
      await ctx.close();
    } finally { await browser.close(); srv.close(); }
  });
}

test('browser: the rate limiter\'s real wait time reaches the player', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const { srv } = loginServer({ status: 429, body: { error: RATE } });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ce-welcome', { timeout: 20000 });
    await page.click('#ce-welcome button:has-text("Log in")');
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
    await page.fill('#identityLoginEmail', 'player@club.test');
    await page.click('#identityResetBtn');
    await page.waitForFunction(() => /Too many attempts/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 10000 });
    const toast = await page.evaluate(() => document.getElementById('toast')?.textContent || '');
    assert.equal(toast, RATE, 'the server\'s own wait time, verbatim');
    assert.doesNotMatch(toast, /a few minutes/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); srv.close(); }
});
