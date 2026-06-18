/**
 * Phase 25B — a coach roster row keyed by the invite id must link to the player's
 * registered profile even when the display name differs, so the availability reply
 * attaches instead of showing "No Reply".
 *
 * Production proof (build 93f094f): API returned for user_1781605236629_8l19k5 /
 * legacyPlayerId inv-E3CdnDE5 (label "test player new") maybe/unavailable/available
 * for tue/thu/game, but the coach board showed "No Reply". The coach roster row was
 * "Newest Test Player" — a DIFFERENT name and keyed by the invite id, not the
 * permanent user id. syncIdentityStateToLocalRoster linked rows by id/userId/email/
 * name but NOT by legacyPlayerId, so the row stayed orphaned (and the prune dropped
 * rows matched only by invite id). Fix: bridge + retain by legacyPlayerId.
 *
 * Drives the REAL syncIdentityStateToLocalRoster + liveAvailability* from index.html.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's'));
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start + m[0].length - 1;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(start, i + 1);
}

function buildScope(initialPlayers = []) {
  const fns = ['syncIdentityStateToLocalRoster', 'liveAvailabilityEntryKeys', 'liveAvailabilityPlayerKeys'].map(extractFn).join('\n');
  const body = `
    "use strict";
    const state = { players: ${JSON.stringify(initialPlayers)}, users: [] };
    let _allowedDmParticipantIds = new Set();
    function saveState() {} function render() {} function renderPlayers() {}
    const identityNameKey = v => String(v || '').trim().toLowerCase();
    const identityCompactKey = v => identityNameKey(v).replace(/[^a-z0-9]/g, '');
    const canonicalIdentityNameKey = v => identityCompactKey(v);
    const canonicalIdentityDisplayName = (v, f) => String(v || f || '').trim();
    const isPermanentPlayerUserId = v => Boolean(v) && String(v).startsWith('user_');
    function ensurePlayerUserForRosterPlayer() {}
    function ensurePlayerUsersForRoster() { return state.users; }
    function canonicalizeStatePlayers() { return false; }
    ${fns}
    function attach(player, entriesBySid) {
      const byLabel = {};
      for (const [sid, e] of Object.entries(entriesBySid)) liveAvailabilityEntryKeys(e).forEach(k => { (byLabel[k] = byLabel[k] || {})[sid] = e; });
      let live = null;
      for (const k of liveAvailabilityPlayerKeys(player)) { if (byLabel[k]) { live = byLabel[k]; break; } }
      return live;
    }
    return { state, syncIdentityStateToLocalRoster, attach };
  `;
  return new Function(body)();
}

// EXACT production identity + API values.
const PROFILE = { userId: 'user_1781605236629_8l19k5', legacyPlayerId: 'inv-E3CdnDE5', displayName: 'test player new', email: '' };
const IDENTITY = {
  users: [{ id: 'user_1781605236629_8l19k5', role: 'player', displayName: 'test player new' }],
  team_members: [{ userId: 'user_1781605236629_8l19k5', role: 'player' }],
  player_profiles: [PROFILE],
};
const apiRow = response => ({ key: 'user_1781605236629_8l19k5', userId: 'user_1781605236629_8l19k5', playerId: 'user_1781605236629_8l19k5', legacyPlayerId: 'inv-E3CdnDE5', label: 'test player new', response });
const API = { tue: apiRow('maybe'), thu: apiRow('unavailable'), game: apiRow('available') };

test('CRITICAL: roster row keyed by invite id + divergent name → links and attaches', () => {
  // Coach roster row: keyed by the invite id, display name "Newest Test Player"
  // (differs from the API label "test player new"), no permanent userId.
  const scope = buildScope([
    { id: 'inv-E3CdnDE5', userId: '', name: 'Newest Test Player', game: 'no-reply', trainingTuesday: 'no-reply', trainingThursday: 'no-reply' },
  ]);
  scope.syncIdentityStateToLocalRoster(IDENTITY);

  // The row that the coach sees as "Newest Test Player" must survive and now carry
  // the registered identity so the reply attaches.
  const row = scope.state.players.find(p => /newest test player/i.test(p.name)) ||
              scope.state.players.find(p => p.legacyPlayerId === 'inv-E3CdnDE5' || p.id === 'inv-E3CdnDE5');
  assert.ok(row, 'roster row keyed by invite id survives sync (not pruned)');
  assert.equal(row.legacyPlayerId, 'inv-E3CdnDE5', 'row carries the invite id');

  const live = scope.attach(row, API);
  assert.ok(live, 'availability reply attaches — not No Reply');
  assert.equal(live.tue.response, 'maybe');
  assert.equal(live.thu.response, 'unavailable');
  assert.equal(live.game.response, 'available');
});

test('roster row carrying legacyPlayerId under its own field (diff primary id) links', () => {
  const scope = buildScope([
    { id: 'p-local-42', userId: '', legacyPlayerId: 'inv-E3CdnDE5', name: 'Newest Test Player', game: 'no-reply', trainingTuesday: 'no-reply', trainingThursday: 'no-reply' },
  ]);
  scope.syncIdentityStateToLocalRoster(IDENTITY);
  const row = scope.state.players.find(p => p.legacyPlayerId === 'inv-E3CdnDE5');
  assert.ok(row, 'row retained via legacyPlayerId');
  const live = scope.attach(row, API);
  assert.ok(live, 'attaches');
  assert.equal(live.game.response, 'available');
});

test('no duplicate: invite-id row merges with profile rather than spawning a 2nd row', () => {
  const scope = buildScope([
    { id: 'inv-E3CdnDE5', userId: '', name: 'Newest Test Player', game: 'no-reply', trainingTuesday: 'no-reply', trainingThursday: 'no-reply' },
  ]);
  scope.syncIdentityStateToLocalRoster(IDENTITY);
  const matches = scope.state.players.filter(p =>
    p.legacyPlayerId === 'inv-E3CdnDE5' || p.id === 'inv-E3CdnDE5' || p.userId === 'user_1781605236629_8l19k5' || /newest test player|test player new/i.test(p.name));
  assert.equal(matches.length, 1, 'exactly one canonical row for this player');
});

test('unrelated player is NOT merged (invite-id bridge is exact)', () => {
  // Roster row keyed by a DIFFERENT invite id; both players are real server
  // profiles. The bridge must link each row to its OWN profile, never cross-merge.
  const scope = buildScope([
    { id: 'inv-OTHER-XYZ', userId: '', name: 'Someone Else', game: 'no-reply', trainingTuesday: 'no-reply', trainingThursday: 'no-reply' },
  ]);
  scope.syncIdentityStateToLocalRoster({
    users: [
      { id: 'user_1781605236629_8l19k5', role: 'player', displayName: 'test player new' },
      { id: 'user_OTHER', role: 'player', displayName: 'Someone Else' },
    ],
    team_members: [
      { userId: 'user_1781605236629_8l19k5', role: 'player' },
      { userId: 'user_OTHER', role: 'player' },
    ],
    player_profiles: [
      { userId: 'user_1781605236629_8l19k5', legacyPlayerId: 'inv-E3CdnDE5', displayName: 'test player new' },
      { userId: 'user_OTHER', legacyPlayerId: 'inv-OTHER-XYZ', displayName: 'Someone Else' },
    ],
  });
  const target = scope.state.players.find(p => p.userId === 'user_1781605236629_8l19k5');
  const other  = scope.state.players.find(p => p.userId === 'user_OTHER');
  assert.ok(target, 'target player row exists');
  assert.ok(other, 'unrelated player row exists');
  assert.equal(target.legacyPlayerId, 'inv-E3CdnDE5');
  assert.equal(other.legacyPlayerId, 'inv-OTHER-XYZ');
  // No row carries both invite ids — the bridge never cross-merged them.
  assert.ok(!scope.state.players.some(p => p.legacyPlayerId === 'inv-E3CdnDE5' && p.userId === 'user_OTHER'));
});
