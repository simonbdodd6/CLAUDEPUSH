/**
 * Phase 25 — coach Availability board must attach API replies to the roster row.
 *
 * Bug: syncIdentityStateToLocalRoster built the coach roster record WITHOUT the
 * invite id (legacyPlayerId), even though the player_profile carries it. A player
 * who answers while authenticated is stored under their permanent user_ id, while
 * the coach roster row is frequently keyed by the invite id — so legacyPlayerId is
 * often the ONLY identifier shared between the roster row and the availability
 * reply. Omitting it meant the reply could not attach and the coach saw "No Reply"
 * (Phase 23C added legacyPlayerId to the API reply + matcher; this completes the
 * bridge on the roster side).
 *
 * These tests drive the REAL functions extracted from index.html:
 *   - syncIdentityStateToLocalRoster (builds the roster row from server identity)
 *   - liveAvailabilityEntryKeys / liveAvailabilityPlayerKeys (the matcher)
 * and assert the reply attaches (board shows the response, not No Reply).
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

// Build a scope with the REAL coach-side mapping functions (the three under test),
// plus faithful stubs for the small identity helpers they call.
function buildScope(initialPlayers = []) {
  const fns = [
    'syncIdentityStateToLocalRoster',
    'liveAvailabilityEntryKeys',
    'liveAvailabilityPlayerKeys',
  ].map(extractFn).join('\n');
  const body = `
    "use strict";
    const state = { players: ${JSON.stringify(initialPlayers)}, users: [] };
    let _allowedDmParticipantIds = new Set();
    function saveState() {}
    function render() {}
    function renderPlayers() {}
    // Faithful stubs (match the real index.html helpers' relevant behaviour).
    const identityNameKey = v => String(v || '').trim().toLowerCase();
    const identityCompactKey = v => identityNameKey(v).replace(/[^a-z0-9]/g, '');
    const canonicalIdentityNameKey = v => identityCompactKey(v);
    const canonicalIdentityDisplayName = (v, f) => String(v || f || '').trim();
    const isPermanentPlayerUserId = v => Boolean(v) && String(v).startsWith('user_');
    function ensurePlayerUserForRosterPlayer() {}
    function ensurePlayerUsersForRoster() { return state.users; }
    function canonicalizeStatePlayers() { return false; }
    ${fns}
    // Mirror refreshLiveAvailability's match+attach for one player against API rows.
    function attachReply(player, apiRowsBySid) {
      const byLabel = {};
      Object.entries(apiRowsBySid).forEach(([sid, entry]) => {
        liveAvailabilityEntryKeys(entry).forEach(k => { (byLabel[k] = byLabel[k] || {})[sid] = entry; });
      });
      let live = null;
      for (const k of liveAvailabilityPlayerKeys(player)) { if (byLabel[k]) { live = byLabel[k]; break; } }
      return live; // { sid: entry } or null
    }
    return { state, syncIdentityStateToLocalRoster, liveAvailabilityEntryKeys, liveAvailabilityPlayerKeys, attachReply };
  `;
  return new Function(body)();
}

// API availability reply for an authenticated player (stored under user_ id, with
// the invite id as legacyPlayerId — exactly what api/availability.js GET returns).
function apiReply({ userId, legacyPlayerId, label, response }) {
  return { key: userId, userId, playerId: userId, legacyPlayerId, label, response };
}

test('roster row built from identity carries legacyPlayerId (the bridge)', () => {
  const scope = buildScope();
  scope.syncIdentityStateToLocalRoster({
    users: [{ id: 'user_newest_1', role: 'player', displayName: 'Newest Test Player', email: 'newest@t.test' }],
    team_members: [{ userId: 'user_newest_1', role: 'player' }],
    player_profiles: [{ userId: 'user_newest_1', legacyPlayerId: 'inv-NEWEST', displayName: 'Newest Test Player', email: 'newest@t.test' }],
  });
  const row = scope.state.players.find(p => /newest test player/i.test(p.name));
  assert.ok(row, 'roster row created');
  assert.equal(row.legacyPlayerId, 'inv-NEWEST', 'invite id carried onto roster row');
});

test('CRITICAL: reply attaches when ONLY the legacyPlayerId is shared', () => {
  // PERMANENT-user roster row (id = user_…), so its id is NOT the invite id. The
  // only thing it can share with a reply written under a *different* id is the
  // invite id (legacyPlayerId). Without the fix the row omits legacyPlayerId, the
  // sets don't intersect, and the coach sees No Reply. This is load-bearing:
  // reverting the index.html fix makes this assertion fail.
  const scope = buildScope();
  scope.syncIdentityStateToLocalRoster({
    users: [{ id: 'user_newest_perm', role: 'player', displayName: 'Newest Test Player', email: 'newest@t.test' }],
    team_members: [{ userId: 'user_newest_perm', role: 'player' }],
    player_profiles: [{ userId: 'user_newest_perm', legacyPlayerId: 'inv-NEWEST', displayName: 'Newest Test Player', email: 'newest@t.test' }],
  });
  const row = scope.state.players.find(p => /newest test player/i.test(p.name));
  assert.ok(row, 'roster row present');
  assert.equal(row.id, 'user_newest_perm', 'row id is the permanent user id, not the invite id');

  // Reply written under a DIFFERENT id and a DIFFERENT label — only legacyPlayerId
  // is shared. (attachReply is the primary key matcher: no first-name fallback.)
  const rows = {
    tue:  apiReply({ userId: 'user_other_session', legacyPlayerId: 'inv-NEWEST', label: 'Imported Row 47', response: 'unavailable' }),
    thu:  apiReply({ userId: 'user_other_session', legacyPlayerId: 'inv-NEWEST', label: 'Imported Row 47', response: 'maybe' }),
    game: apiReply({ userId: 'user_other_session', legacyPlayerId: 'inv-NEWEST', label: 'Imported Row 47', response: 'available' }),
  };
  const live = scope.attachReply(row, rows);
  assert.ok(live, 'reply attaches via legacyPlayerId bridge — not No Reply');
  assert.equal(live.tue.response, 'unavailable');
  assert.equal(live.thu.response, 'maybe');
  assert.equal(live.game.response, 'available');
});

test('Newest Test Player: roster + API for tue/thu/game → board shows responses', () => {
  const scope = buildScope();
  scope.syncIdentityStateToLocalRoster({
    users: [{ id: 'user_newest_2', role: 'player', displayName: 'Newest Test Player', email: 'newest2@t.test' }],
    team_members: [{ userId: 'user_newest_2', role: 'player' }],
    player_profiles: [{ userId: 'user_newest_2', legacyPlayerId: 'inv-N2', displayName: 'Newest Test Player', email: 'newest2@t.test' }],
  });
  const row = scope.state.players.find(p => /newest test player/i.test(p.name));
  const rows = {
    tue:  apiReply({ userId: 'user_newest_2', legacyPlayerId: 'inv-N2', label: 'Newest Test Player', response: 'unavailable' }),
    thu:  apiReply({ userId: 'user_newest_2', legacyPlayerId: 'inv-N2', label: 'Newest Test Player', response: 'unavailable' }),
    game: apiReply({ userId: 'user_newest_2', legacyPlayerId: 'inv-N2', label: 'Newest Test Player', response: 'available' }),
  };
  const live = scope.attachReply(row, rows);
  assert.ok(live, 'attaches');
  assert.deepEqual(
    { tue: live.tue.response, thu: live.thu.response, game: live.game.response },
    { tue: 'unavailable', thu: 'unavailable', game: 'available' },
  );
});

test('still matches on userId and on name (no regression in existing bridges)', () => {
  const scope = buildScope();
  scope.syncIdentityStateToLocalRoster({
    users: [{ id: 'user_x', role: 'player', displayName: 'Pat Jones', email: 'pat@t.test' }],
    team_members: [{ userId: 'user_x', role: 'player' }],
    player_profiles: [{ userId: 'user_x', legacyPlayerId: 'inv-X', displayName: 'Pat Jones', email: 'pat@t.test' }],
  });
  const row = scope.state.players.find(p => /pat jones/i.test(p.name));
  // userId-only bridge
  assert.ok(scope.attachReply(row, { game: apiReply({ userId: 'user_x', legacyPlayerId: '', label: '', response: 'available' }) }));
  // name/label-only bridge
  assert.ok(scope.attachReply(row, { game: apiReply({ userId: 'user_other', legacyPlayerId: '', label: 'Pat Jones', response: 'available' }) }));
});
