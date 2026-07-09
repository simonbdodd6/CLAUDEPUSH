/**
 * Messages LIST row live-refresh for a NON-selected thread.
 *
 * Bug: a DM arriving while a DIFFERENT thread is selected did not update the incoming
 * thread's row — stale preview, no unread dot — until it was clicked. Cause: the row
 * preview/unread preferred the per-thread _chatMessages cache (localLast), which is only
 * refreshed while THAT thread is open, over the fresh server.lastMessage from the 5s
 * conversations poll; the stale local ts then suppressed the unread dot.
 *
 * chatFresherLastMessage / chatRowPreviewUnread fix it. Drives the REAL extracted funcs.
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
const { chatFresherLastMessage, chatRowPreviewUnread } = new Function(`"use strict";
  ${extractFn('chatFresherLastMessage')}
  ${extractFn('chatRowPreviewUnread')}
  return { chatFresherLastMessage, chatRowPreviewUnread };
`)();

test('fresher: a newer server message beats a stale local cache', () => {
  assert.deepEqual(chatFresherLastMessage({ text: 'old', ts: 100 }, { text: 'new', ts: 200 }), { text: 'new', ts: 200 });
});
test('fresher: an optimistic local send (newer) is kept', () => {
  assert.deepEqual(chatFresherLastMessage({ text: 'just sent', ts: 300 }, { text: 'server old', ts: 200 }), { text: 'just sent', ts: 300 });
});
test('fresher: no local → server; no server → local', () => {
  assert.deepEqual(chatFresherLastMessage(null, { text: 's', ts: 1 }), { text: 's', ts: 1 });
  assert.deepEqual(chatFresherLastMessage({ text: 'l', ts: 1 }, null), { text: 'l', ts: 1 });
});

// ── THE acceptance: incoming DM while another thread is selected ──────────────
test('background, previously-read row re-lights unread + updates preview on a new server message', () => {
  const r = chatRowPreviewUnread({
    localLast: { text: 'old hello', ts: 100 },  // stale per-thread cache (last time it was open)
    serverLast: { text: 'new ping', ts: 500 },  // fresh from the 5s conversations poll
    serverUnread: 1,
    localUnread: 0,
    localRead: 150,                             // last read this device: after old, before new
    serverLastActivity: 500,
  });
  assert.equal(r.lastMsg.text, 'new ping', 'preview updates to the new message');
  assert.equal(r.lastMsg.ts, 500, 'time reflects the new message');
  assert.equal(r.unread, 1, 'unread dot re-lights without opening the thread');
});

test('a thread genuinely read up to its latest activity stays cleared', () => {
  const r = chatRowPreviewUnread({
    localLast: { text: 'hi', ts: 500 }, serverLast: { text: 'hi', ts: 500 },
    serverUnread: 1, localUnread: 0,
    localRead: 600,                             // read AFTER the latest message
    serverLastActivity: 500,
  });
  assert.equal(r.unread, 0, 'no phantom unread on a locally-read thread');
});

test('server unread wins over a local unread count', () => {
  const r = chatRowPreviewUnread({
    localLast: null, serverLast: { text: 'x', ts: 10 },
    serverUnread: 3, localUnread: 1, localRead: 0, serverLastActivity: 10,
  });
  assert.equal(r.unread, 3);
});
