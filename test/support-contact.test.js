/**
 * Support contact discoverability (RC4.6D3).
 *
 * The readiness audit found support@coacheasier.com only existed on the hidden
 * Beta Info screen. These tests pin the fix:
 *  1. Settings renders a Support card with a mailto link to the support inbox.
 *  2. The Support card is NOT hidden by the commercial Beta UI flag.
 *  3. support@coacheasier.com is the only user-facing support address —
 *     no personal Gmail or legacy test addresses in served files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');

function settingsSource() {
  const start = html.indexOf('function renderSettings()');
  assert.ok(start !== -1, 'renderSettings() exists');
  let depth = 0, i = html.indexOf('{', start);
  const open = i;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  return html.slice(start, i + 1);
}

test('Settings renders a Support card with the support mailto link', () => {
  const src = settingsSource();
  assert.ok(src.includes('mailto:support@coacheasier.com'), 'mailto link present in Settings');
  assert.match(src, /<h2[^>]*>(?:<img[^>]*>)?CoachEasier Support<\/h2>/, 'CoachEasier Support heading present in Settings');
  assert.ok(/Contact CoachEasier support/i.test(src), 'helper line present');
});

test('Support card is not gated behind the Beta UI flag', () => {
  const src = settingsSource();
  const cardStart = src.search(/<h2[^>]*>(?:<img[^>]*>)?CoachEasier Support<\/h2>/);
  assert.ok(cardStart !== -1, 'Support heading found');
  // The card opening tag immediately before the heading must be a plain card,
  // not the `${_betaUI ? " beta-hidden" : ""}` conditional used by hidden cards.
  const before = src.slice(Math.max(0, cardStart - 200), cardStart);
  const openTag = before.slice(before.lastIndexOf('<div'));
  assert.ok(!openTag.includes('beta-hidden'), `Support card must not be beta-hidden (got: ${openTag.trim()})`);
});

test('support@coacheasier.com is the only user-facing support address', () => {
  for (const [name, src] of [['index.html', html], ['sw.js', sw], ['manifest.json', manifest]]) {
    assert.ok(!/gmail\.com/i.test(src), `${name} must not contain a Gmail address`);
    assert.ok(!/simonbdodd|simondodd@/i.test(src), `${name} must not contain a personal address`);
    assert.ok(!/@coachseye\.test/i.test(src), `${name} must not contain legacy test addresses`);
  }
  const supportAddresses = [...html.matchAll(/[a-z0-9._%+-]+@coacheasier\.com/gi)]
    .map(m => m[0].toLowerCase());
  assert.ok(supportAddresses.length > 0, 'support address present in index.html');
  const nonSupport = supportAddresses.filter(a => a !== 'support@coacheasier.com' && a !== 'noreply@coacheasier.com');
  assert.deepEqual(nonSupport, [], 'only support@/noreply@coacheasier.com addresses are user-facing');
});

// ── Support from the LOGIN form (first real recovery case, 2026-09-22) ─────
// A signed-out player who taps "Log in" loses the welcome card — and with it
// the only support address on screen. "Trouble signing in?" offered nothing
// but a device wipe. The login panel must carry its own route to a human, as
// a mailto link AND as a copyable address for devices with no mail app.
function renderNavSource() {
  const start = html.indexOf('function renderNav()');
  assert.ok(start !== -1, 'renderNav() exists');
  let depth = 0, i = html.indexOf('{', start);
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  return html.slice(start, i + 1);
}

test('the login form\'s "Trouble signing in?" section reaches support by link and by copy', () => {
  const nav = renderNavSource();
  const start = nav.indexOf('Trouble signing in?');
  assert.ok(start !== -1, 'the trouble section exists in the login panel');
  const section = nav.slice(start, nav.indexOf('</details>', start));
  assert.ok(section.includes('mailto:support@coacheasier.com'), 'support mailto link inside the trouble section');
  assert.match(section, /onclick="copySupportAddress\(this\)"/, 'a Copy button for devices without a mail app');
  assert.match(section, /Forgot password\?/, 'points at the recovery route before support');
  assert.ok(section.indexOf('support@coacheasier.com') < section.indexOf('clearDeviceState()'), 'support comes before the device wipe');
});

test('copySupportAddress copies the support inbox and never fails silently', () => {
  const start = html.indexOf('function copySupportAddress(btn)');
  assert.ok(start !== -1, 'copySupportAddress exists');
  const body = html.slice(start, html.indexOf('\n    }\n', start));
  assert.match(body, /'support@coacheasier\.com'/, 'copies the support address');
  assert.match(body, /navigator\.clipboard\?\.writeText/, 'guards a missing clipboard API');
  assert.match(body, /showToast\(`Could not copy — the address is \$\{address\}`\)/, 'the fallback names the address so it can be typed');
  assert.match(body, /showToast\('Support address copied/, 'success is confirmed');
});
