/**
 * JOIN FORM — the delayed autofocus never takes focus from the person.
 *
 * showInviteModal focuses the first field 80 ms after the form is added. On a
 * busy page that timer fires late, and when it landed between a field being
 * focused and the typing that followed, the typing went into the FIRST field:
 * test/roster-duplicate-client.test.js saw "Gaëtanpassword-dup1" in First name
 * and an empty password (2026-10-24). The timer now stands down when focus is
 * already inside the form; with nothing focused it still focuses the first field.
 *
 * No sleeps: an init script holds the app's own 80 ms autofocus callback, and
 * each test runs it at the exact moment it needs — after the person has moved
 * into a field, or with nothing focused at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* not installed: the browser tests skip */ }
const BOOT_MS = 60000;

const INVITES = {
  tok_group: { valid: true, group: true, role: 'player', status: 'pending', teamName: 'Focus RFC', playerGroupId: 'grp_initial' },
  tok_personal: { valid: true, group: false, role: 'player', status: 'pending', teamName: 'Focus RFC', name: 'Pat Personal' },
};

function stub() {
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    const send = (o, s = 200) => { res.statusCode = s; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const m = /^\/api\/invite\?token=([^&]+)/.exec(u);
    if (m) return send(INVITES[decodeURIComponent(m[1])] || { valid: false }, INVITES[decodeURIComponent(m[1])] ? 200 : 404);
    if (u.startsWith('/api/identity')) return send({ ok: false }, 401);
    if (u.startsWith('/api/')) return send({ ok: true });
    const f = u.split('?')[0] === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, u.split('?')[0]);
    try { res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(f)); }
    catch { res.statusCode = 404; res.end(); }
  });
  return srv;
}

/** Hold the join form's own 80 ms autofocus callback until the test runs it. */
function holdAutofocus() {
  window.__heldAutofocus = [];
  const real = window.setTimeout;
  window.setTimeout = function (fn, ms, ...args) {
    if (ms === 80 && typeof fn === 'function' && /invite-(first|name)-input/.test(String(fn))) {
      window.__heldAutofocus.push(fn);
      return 0;
    }
    return real.call(this, fn, ms, ...args);
  };
}

async function openJoinForm(t, token) {
  if (!chromium) { t.skip('playwright not installed'); return null; }
  let browser;
  try { browser = await chromium.launch(); } catch { t.skip('no browser available'); return null; }
  const srv = stub();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(holdAutofocus);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/?inv=${token}`, { waitUntil: 'domcontentloaded', timeout: BOOT_MS });
  await page.waitForSelector('#invite-modal #invite-password-input', { timeout: BOOT_MS });
  await page.waitForFunction(() => window.__heldAutofocus.length === 1, null, { timeout: BOOT_MS });
  const runAutofocus = () => page.evaluate(() => { window.__heldAutofocus.forEach(fn => fn()); });
  const active = () => page.evaluate(() => document.activeElement?.id || '');
  const value = id => page.evaluate(i => document.getElementById(i)?.value, id);
  const close = async () => { await browser.close(); srv.close(); };
  return { page, errors, runAutofocus, active, value, close };
}

test('a field the person has moved into keeps focus when the delayed autofocus fires, and their typing stays in it', { timeout: 120000 }, async t => {
  const h = await openJoinForm(t, 'tok_group'); if (!h) return;
  try {
    // Into the password field, part of the password typed — then the autofocus fires.
    await h.page.focus('#invite-password-input');
    await h.page.keyboard.type('password');
    await h.runAutofocus();
    assert.equal(await h.active(), 'invite-password-input', 'focus stayed where the person put it');
    await h.page.keyboard.type('-dup1');
    assert.equal(await h.value('invite-password-input'), 'password-dup1', 'the whole password is in the password field');
    assert.equal(await h.value('invite-first-input'), '', 'nothing was redirected into First name');
    // The same holds for any field of the form, e.g. email.
    await h.page.focus('#invite-email-input');
    await h.runAutofocus();
    assert.equal(await h.active(), 'invite-email-input');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('with nothing focused, the delayed autofocus still puts the person in First name (group invite)', { timeout: 120000 }, async t => {
  const h = await openJoinForm(t, 'tok_group'); if (!h) return;
  try {
    await h.page.evaluate(() => document.activeElement?.blur());
    assert.notEqual(await h.active(), 'invite-first-input');
    await h.runAutofocus();
    assert.equal(await h.active(), 'invite-first-input');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('with nothing focused, the delayed autofocus still puts the person in Your name (personal invite)', { timeout: 120000 }, async t => {
  const h = await openJoinForm(t, 'tok_personal'); if (!h) return;
  try {
    await h.page.evaluate(() => document.activeElement?.blur());
    await h.runAutofocus();
    assert.equal(await h.active(), 'invite-name-input');
    assert.equal(await h.value('invite-name-input'), 'Pat Personal', 'the prefilled name is untouched');
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test('focus OUTSIDE the form (e.g. the page behind it) does not stop the autofocus', { timeout: 120000 }, async t => {
  const h = await openJoinForm(t, 'tok_group'); if (!h) return;
  try {
    await h.page.evaluate(() => {
      const b = document.createElement('button'); b.id = 'outside-probe'; document.body.prepend(b); b.focus();
    });
    assert.equal(await h.active(), 'outside-probe');
    await h.runAutofocus();
    assert.equal(await h.active(), 'invite-first-input', 'only focus INSIDE the form is respected');
  } finally { await h.close(); }
});
