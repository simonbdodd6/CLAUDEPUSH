/**
 * Group-invite identity collision — heal + regression.
 *
 * Players who claimed the SAME reusable group invite were all assigned
 * legacyPlayerId = inv-<groupToken8>, so distinct people shared ONE id. That
 * collided roster dedup / DM addressing (a coach DM routed to the wrong sharer;
 * the intended player, e.g. Beta Test 5, never got a conversation). Beta Test 4
 * joined via team-code (unique legacyPlayerId = user.id) and always worked.
 *
 * healSharedLegacyPlayerIds resets any legacyPlayerId held by 2+ distinct users
 * to each profile's own userId, repairing existing invited players automatically
 * and leaving unique-id players untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { healSharedLegacyPlayerIds } from '../api/_identityStore.js';
import { createCoachDmConversationRequestForPlayerId } from '../src/chat-state.js';

const GROUP = 'inv-GROUPTOK';
const rawProfiles = [
  { userId: 'user_BT4', legacyPlayerId: 'user_BT4', email: 'bt4@x.com' }, // team-code, already unique
  { userId: 'user_BT5', legacyPlayerId: GROUP,      email: 'bt5@x.com' }, // group invite → shared
  { userId: 'user_BT6', legacyPlayerId: GROUP,      email: 'bt6@x.com' },
  { userId: 'user_BT7', legacyPlayerId: GROUP,      email: 'bt7@x.com' },
];

const usersFor = (roster) => [
  { id: 'coach', role: 'coach', name: 'Coach' },
  ...roster.map(r => ({ id: r.userId, role: 'player', name: r.name, email: r.email, playerId: r.userId })),
];
const rosterFrom = (profiles) => profiles.map(p => ({
  id: p.userId, userId: p.userId, legacyPlayerId: p.legacyPlayerId, name: 'Beta ' + p.userId, email: p.email,
}));

test('heal resets shared legacyPlayerIds to each userId, leaves unique ones untouched', () => {
  const { profiles, changed } = healSharedLegacyPlayerIds(rawProfiles);
  assert.equal(changed, true);
  const byUser = Object.fromEntries(profiles.map(p => [p.userId, p.legacyPlayerId]));
  assert.equal(byUser['user_BT5'], 'user_BT5'); // healed → unique
  assert.equal(byUser['user_BT6'], 'user_BT6');
  assert.equal(byUser['user_BT7'], 'user_BT7');
  assert.equal(byUser['user_BT4'], 'user_BT4'); // already unique → unchanged (no regression)
});

test('heal is idempotent (second pass changes nothing)', () => {
  const once = healSharedLegacyPlayerIds(rawProfiles).profiles;
  assert.equal(healSharedLegacyPlayerIds(once).changed, false);
});

test('BUG REPRO: with the shared id (unlinked roster) the coach DM mis-targets / drops Beta Test 5', () => {
  // Unlinked rows all key by the shared group id — the failing production shape.
  const brokenRoster = rawProfiles.filter(p => p.legacyPlayerId === GROUP)
    .map(p => ({ id: GROUP, legacyPlayerId: GROUP, name: 'Beta ' + p.userId, email: p.email }));
  const req = createCoachDmConversationRequestForPlayerId(brokenRoster, GROUP, 'coach', { users: usersFor([]), players: brokenRoster });
  // The request does NOT address Beta Test 5's own id — that's the bug.
  const targetsBT5 = req && (req.participants || []).includes('user_BT5');
  assert.equal(targetsBT5, false, 'pre-heal: BT5 is not correctly addressable');
});

test('FIX: after heal, coach DM to Beta Test 5 targets Beta Test 5', () => {
  const healed = healSharedLegacyPlayerIds(rawProfiles).profiles;
  const roster = rosterFrom(healed);
  const req = createCoachDmConversationRequestForPlayerId(roster, 'user_BT5', 'coach', { users: usersFor(roster), players: roster });
  assert.ok(req, 'request is not null');
  assert.deepEqual([...req.participants].sort(), ['coach', 'user_BT5'].sort());
});

test('regression: Beta Test 4 still resolves to its own DM', () => {
  const healed = healSharedLegacyPlayerIds(rawProfiles).profiles;
  const roster = rosterFrom(healed);
  const req = createCoachDmConversationRequestForPlayerId(roster, 'user_BT4', 'coach', { users: usersFor(roster), players: roster });
  assert.deepEqual([...req.participants].sort(), ['coach', 'user_BT4'].sort());
});

test('empty / malformed input is safe', () => {
  assert.deepEqual(healSharedLegacyPlayerIds([]).profiles, []);
  assert.equal(healSharedLegacyPlayerIds(undefined).changed, false);
});
