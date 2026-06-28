/**
 * Availability page header cleanup — the large "Availability Centre" hero box is
 * removed and its actions moved into a compact header above the Sessions board.
 * Presentation/layout only: the same handlers must remain wired.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — no closing brace');
}

const render = extractFn(html, 'renderMessageCenterV2');

test('the large Availability Centre hero box is no longer rendered', () => {
  assert.ok(!render.includes('class="msg-hero"'), 'msg-hero box removed');
  assert.ok(!render.includes('<h2>Availability Centre</h2>'), 'Availability Centre title removed');
  assert.ok(!render.includes('class="msg-hero-actions"'), 'old hero action row removed');
});

test('the five header actions are present with the SAME handlers', () => {
  assert.ok(render.includes('class="avail-head"'), 'compact header added');
  // exact handlers preserved (functional behaviour unchanged)
  assert.ok(/onclick="setSection\('coach','messages'\)">Open messages/.test(render), 'Open messages');
  assert.ok(/id="avail-refresh-btn"[^>]*onclick="refreshLiveAvailability\(\)">Refresh replies/.test(render), 'Refresh replies (id preserved)');
  assert.ok(/onclick="clearWeekAvailability\(\)"[^>]*>New week/.test(render), 'New week');
  assert.ok(render.includes('onclick="sendAllAvailabilityRequests()"'), 'Send all sessions');
  assert.ok(render.includes('onclick="sendAvailabilityRequest('), 'Send <session> request');
});

test('the header sits above the Sessions section (content moves up)', () => {
  const headIdx = render.indexOf('class="avail-head"');
  const sessionsIdx = render.indexOf('<h2>Sessions</h2>');
  assert.ok(headIdx > -1 && sessionsIdx > -1);
  assert.ok(headIdx < sessionsIdx, 'compact header renders before the Sessions card');
});

test('the shared topbar is hidden for Availability (no duplicate title, board pulls up)', () => {
  assert.ok(/\.workspace:has\(#coach-message\.active\) > \.topbar \{ display: none/.test(html),
    'topbar hidden for the availability section so its title is not duplicated');
});

test('a compact, mobile-safe header style exists', () => {
  assert.ok(html.includes('.avail-head {'), 'avail-head style present');
  assert.ok(html.includes('flex-wrap:wrap'), 'actions wrap (no overflow)');
  // mobile: the header stacks rather than overflowing horizontally
  assert.ok(/@media \(max-width: 760px\) \{[\s\S]*\.avail-head \{ flex-direction:column/.test(html), 'mobile stacks the header');
});
