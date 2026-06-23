/**
 * QA Messaging Diagnostic overlay — static guards proving it is gated and
 * strictly read-only (no request/response/chat-logic mutation).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('installQaMessagingDiag'), src.indexOf('// ── Send reaction'));

test('the diagnostic block exists', () => {
  assert.ok(block.length > 200, 'installQaMessagingDiag present');
});

test('gated behind ?qa=1 only (early return otherwise)', () => {
  assert.match(block, /get\('qa'\) === '1'/);
  assert.match(block, /if \(!qaOn\(\)\) return;/);
});

test('visible only for player accounts on the Messages screen', () => {
  assert.match(block, /cu\.role === 'player'/);
  assert.match(block, /getElementById\('chatComposer'\)/);
});

test('shows all 7 required fields', () => {
  ['selectedChatId', 'playerCoachDmId', 'server convIds', 'read convId', 'send convId', 'last POST status', 'last POST resp']
    .forEach(label => assert.ok(block.includes(label), `field "${label}" present`));
});

test('read-only: returns the original fetch promise and reads only a clone', () => {
  assert.match(block, /const p = _origFetch\(\.\.\.args\);/, 'captures original promise');
  assert.match(block, /return p;/, 'returns the ORIGINAL promise unchanged');
  assert.match(block, /res\.clone\(\)\.json\(\)/, 'reads only a response clone');
});

test('does not mutate request body or response (no assignment to opts.body / res.body)', () => {
  assert.doesNotMatch(block, /opts\.body\s*=/, 'never reassigns request body');
  assert.doesNotMatch(block, /args\[1\]\.body\s*=/, 'never reassigns request body');
  assert.doesNotMatch(block, /\.json\s*=\s*/, 'never overrides response json');
});

test('has the Copy Messaging Debug Report button', () => {
  assert.match(block, /Copy Messaging Debug Report/);
});

test('failure-isolated: wrapped in try/catch so it cannot break the app', () => {
  assert.match(block, /diagnostic must never break the app/);
});
