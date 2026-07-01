/**
 * DM read-access regression — coach→player direct messages must be visible to
 * the player even when the conversation is stored under one of the player's
 * SECONDARY identity aliases (e.g. their legacyPlayerId living on an invite
 * profile) rather than the primary user id the session surfaces.
 *
 * Reproduces the reported bug: coach sends a DM, player never sees it and gets
 * no notification, because the read gate only checked the session's 3 raw ids.
 * The additive fix expands the player's alias set via player_profiles (same
 * expansion sendDmPush already uses for push targeting).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_KEY_PREFIX = process.env.APP_KEY_PREFIX || 'app';

const {
  expandParticipantAliases,
  sessionCanReadConversation,
  participantIdsForSession,
} = await import('../api/chat.js');

// Basile Rey: registered player. The session loads his PERMANENT profile, which
// carries no legacyPlayerId. A separate invite profile (same user, same email)
// carries the legacyPlayerId the coach's roster used to address the DM.
const BASILE_USER = 'user_basile_rey_01';
const BASILE_INV  = 'inv-BASILE';
const COACH_ID    = 'user_coach_99';

const profiles = [
  { userId: BASILE_USER, legacyPlayerId: '',         email: 'basile@rey.com', teamId: 'beta-test-club' },
  { userId: BASILE_USER, legacyPlayerId: BASILE_INV, email: 'basile@rey.com', teamId: 'beta-test-club' },
  // An unrelated player — must never be pulled into Basile's alias set.
  { userId: 'user_other_02', legacyPlayerId: 'inv-OTHER', email: 'other@club.com', teamId: 'beta-test-club' },
];

const basileSession = {
  user: { id: BASILE_USER, email: 'basile@rey.com' },
  teamMember: { role: 'player', status: 'active', teamId: 'beta-test-club' },
  playerProfile: { userId: BASILE_USER, legacyPlayerId: '', teamId: 'beta-test-club' },
};

// DM the coach created addressed to Basile's legacyPlayerId (unlinked roster record).
const dmToBasile = {
  id: `dm:${BASILE_INV}:${COACH_ID}`,
  teamId: 'beta-test-club',
  type: 'DIRECT',
  participants: [COACH_ID, BASILE_INV],
};

test('expandParticipantAliases follows userId <-> legacyPlayerId links to a fixed point', () => {
  const ids = expandParticipantAliases([BASILE_USER], profiles);
  assert.ok(ids.includes(BASILE_USER), 'keeps the seed id');
  assert.ok(ids.includes(BASILE_INV), 'pulls in the legacyPlayerId from the invite profile');
  assert.ok(!ids.includes('inv-OTHER'), 'does NOT pull in an unrelated player alias');
});

test('BUG REPRO: without alias expansion the player cannot read the DM', () => {
  const rawIds = participantIdsForSession(basileSession); // [user, user] — no legacy id
  assert.ok(!rawIds.includes(BASILE_INV), 'session raw ids lack the legacyPlayerId');
  assert.equal(sessionCanReadConversation(basileSession, dmToBasile, rawIds), false,
    'raw-id gate hides a DM stored under the secondary alias — the reported bug');
});

test('FIX: with the expanded alias set the player CAN read the DM', () => {
  const expanded = expandParticipantAliases(participantIdsForSession(basileSession).concat(BASILE_USER), profiles);
  assert.equal(sessionCanReadConversation(basileSession, dmToBasile, expanded), true,
    'player sees the coach DM once aliases are expanded');
});

test('no leak: a different player cannot read Basile\'s DM even with expansion', () => {
  const otherSession = {
    user: { id: 'user_other_02', email: 'other@club.com' },
    teamMember: { role: 'player', status: 'active', teamId: 'beta-test-club' },
    playerProfile: { userId: 'user_other_02', legacyPlayerId: 'inv-OTHER', teamId: 'beta-test-club' },
  };
  const otherExpanded = expandParticipantAliases(participantIdsForSession(otherSession), profiles);
  assert.equal(sessionCanReadConversation(otherSession, dmToBasile, otherExpanded), false);
});

test('regression: a DM keyed on the primary user id still reads (common case)', () => {
  const dmPrimary = { id: `dm:${BASILE_USER}:${COACH_ID}`, teamId: 'beta-test-club', type: 'DIRECT', participants: [COACH_ID, BASILE_USER] };
  const expanded = expandParticipantAliases(participantIdsForSession(basileSession), profiles);
  assert.equal(sessionCanReadConversation(basileSession, dmPrimary, expanded), true);
});

test('team + staff gates unchanged: wrong-team DM denied, staff always allowed', () => {
  const wrongTeam = { ...dmToBasile, teamId: 'other-club' };
  const expanded = expandParticipantAliases(participantIdsForSession(basileSession).concat(BASILE_USER), profiles);
  assert.equal(sessionCanReadConversation(basileSession, wrongTeam, expanded), false, 'cross-team DM stays denied');

  const coachSession = { user: { id: COACH_ID }, teamMember: { role: 'coach', status: 'active', teamId: 'beta-test-club' } };
  assert.equal(sessionCanReadConversation(coachSession, dmToBasile, null), true, 'staff bypass intact');
});
