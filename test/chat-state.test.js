import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dmConvId,
  isRedisBackedConversation,
  mergeMessages,
  resolveMessagesForRender,
  shouldUseLocalFallback,
} from '../src/chat-state.js';

const convId = 'dm:coach-demo:inv-YxnjxnQa';

function msg(id, text, ts, extra = {}) {
  return {
    id,
    convId,
    senderId: extra.senderId || 'coach-demo',
    senderName: extra.senderName || 'Simon Dodd',
    text,
    ts,
    ...extra,
  };
}

test('dmConvId creates one stable sorted direct-message id', () => {
  assert.equal(dmConvId('coach-demo', 'inv-YxnjxnQa'), convId);
  assert.equal(dmConvId('inv-YxnjxnQa', 'coach-demo'), convId);
});

test('merges full Redis history with a matching optimistic send', () => {
  const existing = [
    msg('m1', 'test new code', 1000),
    msg('opt_1', 'new send', 3000, { _optimistic: true }),
  ];
  const redisHistory = [
    msg('m1', 'test new code', 1000),
    msg('m2', 'trst nwe', 2000),
    msg('m3', 'new send', 3050),
  ];

  const merged = mergeMessages(existing, redisHistory);

  assert.deepEqual(merged.map(m => m.id), ['m1', 'm2', 'm3']);
  assert.equal(merged.some(m => m._optimistic), false);
});

test('prevents message history collapse when POST returns only the new message', () => {
  const existing = [
    msg('m1', 'test A', 1000),
    msg('m2', 'test B', 2000),
  ];
  const postResponseOnly = [msg('m3', 'test C', 3000)];

  const merged = mergeMessages(existing, postResponseOnly);

  assert.deepEqual(merged.map(m => m.text), ['test A', 'test B', 'test C']);
});

test('A/B/C/D remain visible after sequential send confirmations', () => {
  let visible = [];

  ['A', 'B', 'C', 'D'].forEach((label, index) => {
    const ts = (index + 1) * 1000;
    visible = mergeMessages(visible, [
      msg(`opt_${label}`, `test ${label}`, ts, { _optimistic: true }),
    ]);
    visible = mergeMessages(visible, [
      msg(`m${index + 1}`, `test ${label}`, ts + 20),
    ]);
  });

  assert.deepEqual(visible.map(m => m.text), ['test A', 'test B', 'test C', 'test D']);
  assert.deepEqual(visible.map(m => m.id), ['m1', 'm2', 'm3', 'm4']);
});

test('refresh preserves history after local send state is merged with Redis history', () => {
  const localAfterSend = [
    msg('m1', 'test A', 1000),
    msg('m2', 'test B', 2000),
    msg('m3', 'test C', 3000),
    msg('opt_D', 'test D', 4000, { _optimistic: true }),
  ];
  const fullRedisHistory = [
    msg('m1', 'test A', 1000),
    msg('m2', 'test B', 2000),
    msg('m3', 'test C', 3000),
    msg('m4', 'test D', 4050),
  ];

  const refreshed = mergeMessages(localAfterSend, fullRedisHistory);

  assert.deepEqual(refreshed.map(m => m.text), ['test A', 'test B', 'test C', 'test D']);
  assert.equal(refreshed.some(m => m._optimistic), false);
});

test('Redis history cannot collapse to newest message only during incremental merge', () => {
  const fullHistory = [
    msg('m1', 'test A', 1000),
    msg('m2', 'test B', 2000),
    msg('m3', 'test C', 3000),
  ];
  const newestOnly = [msg('m4', 'test D', 4000)];

  const merged = mergeMessages(fullHistory, newestOnly);

  assert.deepEqual(merged.map(m => m.text), ['test A', 'test B', 'test C', 'test D']);
  assert.notDeepEqual(merged.map(m => m.text), ['test D']);
});

test('preserves existing messages after a new send confirmation replaces optimistic row', () => {
  const existing = [
    msg('m1', 'old 1', 1000),
    msg('m2', 'old 2', 2000),
    msg('opt_2', 'new confirmed', 3000, { _optimistic: true }),
  ];
  const confirmed = [msg('m3', 'new confirmed', 3010)];

  const merged = mergeMessages(existing, confirmed);

  assert.deepEqual(merged.map(m => m.id), ['m1', 'm2', 'm3']);
  assert.deepEqual(merged.map(m => m.text), ['old 1', 'old 2', 'new confirmed']);
});

test('does not overwrite Redis-backed history with fallback or demo messages', () => {
  const fallback = [msg('local-1', 'demo fallback', 1000)];

  assert.equal(isRedisBackedConversation(convId), true);
  assert.equal(shouldUseLocalFallback(convId, { productionMode: true }), false);
  assert.deepEqual(resolveMessagesForRender(convId, [], fallback, { productionMode: true }), []);

  const cached = [msg('m1', 'redis history', 1000)];
  assert.deepEqual(resolveMessagesForRender(convId, cached, fallback, { productionMode: true }), cached);
});

test('allows local fallback only for non-Redis legacy conversations', () => {
  const fallback = [msg('legacy-1', 'legacy only', 1000, { convId: 'coach' })];

  assert.equal(isRedisBackedConversation('coach'), false);
  assert.equal(shouldUseLocalFallback('coach', { productionMode: true }), true);
  assert.deepEqual(resolveMessagesForRender('coach', [], fallback, { productionMode: true }), fallback);
});
