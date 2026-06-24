/**
 * Mobile subscribe reachability: the only player-facing control that reaches
 * subscribePush() is the #pushSidebar pill. It must NOT be hidden at phone width,
 * otherwise a player on a phone can never create a push subscription.
 *
 * Static guards over index.html (CSS visibility + the wired subscribe path).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('(', start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === '(') pd++; else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  let depth = 0; i = src.indexOf('{', i);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}

// Isolate the mobile media query block (the one that tightens the sidebar).
function mobileMediaBlock() {
  const anchor = src.indexOf('hide decorative elements and tighten spacing on mobile');
  assert.ok(anchor > 0, 'mobile sidebar media block present');
  // walk back to the enclosing @media opener, forward to its closing brace
  const open = src.lastIndexOf('@media', anchor);
  let depth = 0, end = open;
  for (let i = src.indexOf('{', open); i < src.length; i++) {
    if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return src.slice(open, end + 1);
}

test('the mobile media query no longer hides #pushSidebar', () => {
  const block = mobileMediaBlock();
  assert.match(block, /max-width:\s*980px/, 'is the phone-width media block');
  assert.doesNotMatch(block, /#pushSidebar\s*\{\s*display:\s*none/, '#pushSidebar is NOT display:none on mobile');
});

test('there is no remaining rule hiding #pushSidebar anywhere', () => {
  assert.doesNotMatch(src, /#pushSidebar\s*\{[^}]*display:\s*none/, 'no display:none rule targets #pushSidebar');
});

test('#pushSidebar element + its subscribe button still exist in markup', () => {
  assert.match(src, /id="pushSidebar"/, '#pushSidebar element present');
  assert.match(src, /id="pushSidebarBtn"/, 'subscribe button present');
});

test('renderPushSidebar still wires the not-subscribed CTA to subscribePush()', () => {
  const fn = extractFn('renderPushSidebar');
  assert.match(fn, /onclick="subscribePush\(/, 'Turn on notifications calls subscribePush');
  assert.match(fn, /Turn on notifications/, 'CTA label present');
});

test('renderPushSidebar still gates by push support (regression)', () => {
  const fn = extractFn('renderPushSidebar');
  assert.match(fn, /classList\.toggle\("hidden",\s*!supported\)/, 'still hidden when push unsupported');
});

test('subscribePush() flow is unchanged (permission -> subscribe -> save)', () => {
  const fn = extractFn('subscribePush');
  assert.match(fn, /Notification\.requestPermission\(\)/);
  assert.match(fn, /pushManager\.subscribe/);
  assert.match(fn, /refreshPushSubscriptionMetadata/);
});
