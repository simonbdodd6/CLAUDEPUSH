/**
 * THE LOGIN FORM MUST SURVIVE A REDRAW.
 *
 * renderNav() rebuilt #authPanel with `innerHTML =` on EVERY render pass, and
 * render() runs whenever any loader lands — so a redraw arriving while someone
 * was typing replaced the email and password inputs with fresh, empty ones.
 * Proven before changing anything, in a real browser: type the credentials,
 * let ONE render() happen, click Log in → both fields empty, no login request
 * sent, "Enter your email", no club context. Without the render, login
 * succeeded. The release gate caught it as an intermittent browser failure.
 *
 * 21c0b321 (never merged) fixed the same class for #coachNav/#playerNav — but
 * it never touched #authPanel, so porting it would not have fixed this.
 *
 * The fix applies the same rule to the login panel: when the markup it would
 * paint has not changed, leave the DOM alone. Typed values live in the input
 * elements, not in the markup, so a background redraw is now a no-op for
 * them. The password-reset prompt (5e6bd003) is applied IN PLACE rather than
 * interpolated into the markup, so clearing it as the player types cannot
 * turn the next background redraw into a "changed markup" rebuild either.
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

// ── the contract, in the source ───────────────────────────────────────────
test('7. #authPanel is written only when its markup actually changes', () => {
  const nav = fn('renderNav');
  assert.doesNotMatch(nav, /document\.getElementById\("authPanel"\)\.innerHTML\s*=/,
    'no unconditional innerHTML assignment to the login panel');
  assert.match(nav, /_ceAppliedMarkup !== authPanelHtml/, 'the write is guarded by the last-applied markup');
  assert.match(nav, /\._ceAppliedMarkup = authPanelHtml/, 'and the marker is recorded after a real write');
  // There is still exactly ONE writer of the panel in the whole app — so the
  // marker cannot go stale behind renderNav's back.
  assert.equal((src.match(/authPanel[^\n]{0,40}\.innerHTML\s*=/g) || []).length, 1, 'one writer only');
});

test('7. the reset prompt is state applied in place, not markup', () => {
  const nav = fn('renderNav');
  const tpl = nav.slice(nav.indexOf('const authPanelHtml'), nav.indexOf('_ceAppliedMarkup !== authPanelHtml'));
  assert.ok(tpl.length > 100, 'the template was found');
  assert.doesNotMatch(tpl, /_resetFieldError/,
    'the prompt state is NOT interpolated into the markup (clearing it would force a rebuild mid-typing)');
  assert.match(tpl, /id="identity-reset-error" role="alert" hidden/, 'the element is always rendered, hidden by default');
  assert.match(tpl, /aria-describedby="identity-reset-error" oninput="clearResetFieldError\(\)"/, 'still tied to the field');
  const after = nav.slice(nav.indexOf('_ceAppliedMarkup !== authPanelHtml'));
  assert.match(after, /_resetFieldError/, 'the prompt state is applied after the (guarded) write');
});

test('6. the authenticated navigation hosts are untouched by this change', () => {
  const nav = fn('renderNav');
  assert.match(nav, /document\.getElementById\("coachNav"\)\.innerHTML = /, 'coach nav still paints as before');
  assert.match(nav, /document\.getElementById\("playerNav"\)\.innerHTML = /, 'player nav still paints as before');
});

test('no credential is ever put anywhere but the input the user typed into', () => {
  const nav = fn('renderNav');
  for (const bad of [/localStorage/, /sessionStorage/, /identityLoginPassword'\)\??\.value\s*=/, /identityLoginEmail'\)\??\.value\s*=/]) {
    assert.doesNotMatch(nav, bad, `renderNav never copies or stores credentials: ${bad}`);
  }
});

// ── the real login form ───────────────────────────────────────────────────
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }

const TEAM = 'club-a';
const LOGIN = { ok: true, user: { id: 'u1', name: 'Coach Person', email: 'coach@x.test', role: 'coach', platformRole: '' },
  teamMember: { teamId: TEAM, userId: 'u1', role: 'coach', staffLevel: 'head', status: 'active' }, permissions: ['training'],
  memberships: [{ teamId: TEAM, teamName: 'Club A', role: 'coach', current: true }] };

/** Serves the real index.html; answers login, records every identity POST. */
function loginServer() {
  const posts = [];
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = (o, code = 200) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (req.method === 'POST' && u.startsWith('/api/identity')) {
      let b = ''; req.on('data', c => b += c);
      req.on('end', () => { let body = {}; try { body = JSON.parse(b || '{}'); } catch {} posts.push(body); send(body.action === 'login' ? LOGIN : { ok: true }); });
      return;
    }
    if (u.startsWith('/api/identity')) return send({ ok: false, error: 'No active session' }, 401);
    if (u.startsWith('/api/config')) return send({ version: 'test', devLogin: false });
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return { srv, posts };
}

async function openLogin(browser, view) {
  const { srv, posts } = loginServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const ctx = await browser.newContext({ ...(view === 'phone' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }), serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ce-welcome', { timeout: 20000 });
  await page.click('#ce-welcome button:has-text("Log in")');
  await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
  return { srv, posts, ctx, page, errors };
}
const fields = page => page.evaluate(() => ({
  email: document.getElementById('identityLoginEmail')?.value ?? '(gone)',
  password: document.getElementById('identityLoginPassword')?.value ?? '(gone)',
}));
const redraw = page => page.evaluate(() => { render(); renderNav(); render(); });

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): typed credentials survive redraws, and login goes through`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    let h;
    try {
      h = await openLogin(browser, view);
      const { page, posts, errors } = h;
      // 1. The inputs are the SAME nodes after a redraw — not look-alikes.
      await page.evaluate(() => { window.__email = document.getElementById('identityLoginEmail'); });

      // Redraws interleaved with typing, as loaders landing mid-keystroke would.
      await page.click('#identityLoginEmail');
      for (const ch of 'coach@x.test') { await page.keyboard.type(ch); await redraw(page); }
      await page.click('#identityLoginPassword');
      for (const ch of 'password123') { await page.keyboard.type(ch); await redraw(page); }
      await redraw(page);

      assert.equal(await page.evaluate(() => window.__email === document.getElementById('identityLoginEmail')), true,
        '1. the email input was never replaced');
      const f = await fields(page);
      assert.equal(f.email, 'coach@x.test', '2. the email survived every redraw');
      assert.equal(f.password, 'password123', '3. the password survived every redraw');

      // 4. Submitting still works — one real login request, one club context.
      await page.click('#identityLoginBtn');
      await page.waitForFunction(() => typeof state !== 'undefined' && state.stateTeamId === 'club-a', null, { timeout: 20000 });
      const logins = posts.filter(p => p.action === 'login');
      assert.equal(logins.length, 1, 'exactly one login request');
      assert.deepEqual({ email: logins[0].email, password: logins[0].password }, { email: 'coach@x.test', password: 'password123' },
        'carrying exactly what was typed');

      // 6. Authenticated navigation is unaffected.
      await page.evaluate(() => setSection('coach', 'training'));
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => state.activeCoachSection), 'training');
      assert.ok(await page.evaluate(() => document.querySelectorAll('#coachNav button').length > 0), 'the coach nav is painted');

      assert.deepEqual(errors, [], 'no page errors');
      assert.ok(await page.evaluate(() => (document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0), 'no horizontal overflow');
    } finally { if (h) { await h.ctx.close(); h.srv.close(); } await browser.close(); }
  });
}

test('browser: the exact reported sequence — type, one render, click — now logs in', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  let h;
  try {
    h = await openLogin(browser, 'desktop');
    const { page, posts } = h;
    await page.fill('#identityLoginEmail', 'coach@x.test');
    await page.fill('#identityLoginPassword', 'password123');
    await page.evaluate(() => render());              // a late boot loader landing
    assert.deepEqual(await fields(page), { email: 'coach@x.test', password: 'password123' });
    await page.click('#identityLoginBtn');
    await page.waitForFunction(() => typeof state !== 'undefined' && state.stateTeamId === 'club-a', null, { timeout: 20000 });
    assert.equal(posts.filter(p => p.action === 'login').length, 1, 'the login request was sent');
  } finally { if (h) { await h.ctx.close(); h.srv.close(); } await browser.close(); }
});

test('browser: 5. an empty login still says so, and sends nothing', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  let h;
  try {
    h = await openLogin(browser, 'desktop');
    const { page, posts } = h;
    await redraw(page);
    await page.click('#identityLoginBtn');
    await page.waitForFunction(() => /Enter your email/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 10000 });
    assert.equal(posts.filter(p => p.action === 'login').length, 0, 'no request for an empty form');
    assert.equal(await page.evaluate(() => state.stateTeamId || null), null, 'and no club context');
  } finally { if (h) { await h.ctx.close(); h.srv.close(); } await browser.close(); }
});

test('browser: the reset prompt persists across redraws and never costs the user their typing', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  let h;
  try {
    h = await openLogin(browser, 'phone');
    const { page } = h;
    // A password typed first, then "Forgot password?" with no email.
    await page.fill('#identityLoginPassword', 'half-remembered');
    await page.click('#identityResetBtn');
    await page.waitForSelector('#identity-reset-error', { state: 'visible', timeout: 5000 });
    await redraw(page);
    assert.equal(await page.evaluate(() => document.getElementById('identity-reset-error')?.hidden), false,
      'the prompt survives redraws (5e6bd003 contract)');
    assert.equal(await page.evaluate(() => document.getElementById('identityLoginEmail')?.getAttribute('aria-invalid')), 'true');
    assert.equal((await fields(page)).password, 'half-remembered', 'showing the prompt did not wipe the password');

    // THE TRAP: the first keystroke clears the prompt in place; a background
    // redraw right after must not treat that as changed markup and rebuild.
    await page.click('#identityLoginEmail');
    await page.keyboard.type('c');
    await redraw(page);
    await page.keyboard.type('oach@x.test');
    await redraw(page);
    const f = await fields(page);
    assert.equal(f.email, 'coach@x.test', 'typing after the prompt survives the redraws that follow');
    assert.equal(f.password, 'half-remembered');
    assert.equal(await page.evaluate(() => document.getElementById('identity-reset-error')?.hidden), true, 'and the prompt is gone');
    assert.equal(await page.evaluate(() => document.getElementById('identityLoginEmail')?.hasAttribute('aria-invalid')), false);
  } finally { if (h) { await h.ctx.close(); h.srv.close(); } await browser.close(); }
});

test('browser: a REAL change to the panel still repaints (tabs switch, prompt appears)', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  let h;
  try {
    h = await openLogin(browser, 'desktop');
    const { page } = h;
    await page.evaluate(() => setAuthTab('join'));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => !!document.getElementById('identityLoginEmail')), false, 'the join form replaced the login form');
    await page.evaluate(() => setAuthTab('login'));
    await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 5000 });
    assert.ok(true, 'and back again');
  } finally { if (h) { await h.ctx.close(); h.srv.close(); } await browser.close(); }
});

// ── the second way a login lost its password: a late autofocus ────────────
// Found while verifying the redraw fix under concurrent load: 3 in 50 logins
// still failed with NO redraw at all. The panel's delayed autofocus (a 120 ms
// timer, scheduled twice by the welcome card) fired late on a busy page,
// pulled focus back to the email field, and the password being typed landed
// in the EMAIL field in plain text: "coach@x.testpassword123", password empty.

test('the delayed autofocus only ever takes focus that nobody has', () => {
  const run = activeIsBody => new Function(`"use strict";
    const focused = [];
    const body = { id: 'body' }, html = { id: 'html' }, other = { id: 'identityLoginPassword' };
    const document = { body, documentElement: html, activeElement: ${activeIsBody ? 'body' : 'other'},
      getElementById: id => ({ focus: () => focused.push(id) }) };
    ${fn('focusIfNothingChosen')}
    focusIfNothingChosen('identityLoginEmail');
    return focused;
  `)();
  assert.deepEqual(run(true), ['identityLoginEmail'], 'a freshly opened panel still gets its first field focused');
  assert.deepEqual(run(false), [], 'but focus the user already moved elsewhere is never taken back');
});

test('no delayed focus call can steal focus any more', () => {
  assert.doesNotMatch(src, /setTimeout\(\(\) => document\.getElementById\('identityLoginEmail'\)\?\.focus\(\)/,
    'the raw late focus on the email field is gone');
  assert.doesNotMatch(src, /setTimeout\(\(\) => document\.getElementById\('joinCode'\)\?\.focus\(\)/,
    'and on the join form');
  assert.match(fn('welcomeLogin'), /focusIfNothingChosen\('identityLoginEmail'\)/);
  assert.match(fn('welcomeJoin'), /focusIfNothingChosen\('joinCode'\)/);
  assert.match(fn('setAuthTab'), /focusIfNothingChosen\('identityLoginEmail'\)/);
});

for (const view of ['desktop', 'phone']) {
  test(`browser (${view}): a late autofocus never pulls the password into the email field`, async (t) => {
    if (!chromium) return t.skip('playwright not installed');
    let browser;
    try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
    let h;
    try {
      h = await openLogin(browser, view);
      const { page, posts, errors } = h;
      await page.fill('#identityLoginEmail', 'coach@x.test');
      await page.click('#identityLoginPassword');
      await page.keyboard.type('pass');
      // Deterministically recreate the late timer: re-open the login tab (and
      // the welcome path) while focus is ALREADY in the password field. Both
      // schedule the 120 ms autofocus; before the fix it fired into this.
      await page.evaluate(() => { setAuthTab('login'); welcomeLogin(); });
      await page.waitForTimeout(400);                    // let both timers fire
      await page.keyboard.type('word123');
      const s = await page.evaluate(() => ({
        email: document.getElementById('identityLoginEmail')?.value,
        password: document.getElementById('identityLoginPassword')?.value,
        active: document.activeElement?.id,
      }));
      assert.equal(s.active, 'identityLoginPassword', 'focus stayed where the user put it');
      assert.equal(s.email, 'coach@x.test', 'the email field never received the password');
      assert.equal(s.password, 'password123', 'the password is whole, in the password field');
      await page.click('#identityLoginBtn');
      await page.waitForFunction(() => typeof state !== 'undefined' && state.stateTeamId === 'club-a', null, { timeout: 20000 });
      const logins = posts.filter(p => p.action === 'login');
      assert.equal(logins.length, 1);
      assert.equal(logins[0].password, 'password123');
      assert.deepEqual(errors, []);
    } finally { if (h) { await h.ctx.close(); h.srv.close(); } await browser.close(); }
  });
}

test('browser: a freshly opened login panel still focuses the email field', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  let h;
  try {
    h = await openLogin(browser, 'desktop');
    await h.page.waitForFunction(() => document.activeElement?.id === 'identityLoginEmail', null, { timeout: 5000 });
    assert.ok(true, 'the convenience is kept for the case it was written for');
  } finally { if (h) { await h.ctx.close(); h.srv.close(); } await browser.close(); }
});
