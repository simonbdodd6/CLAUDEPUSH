/**
 * Phase 25C — the coach Availability board must link saved-roster rows to their
 * server identity before matching, so a pre-registration row attaches its reply.
 *
 * Production proof (build 26064af): API returned tue/thu/game for
 * userId user_1781605236629_8l19k5 / legacyPlayerId inv-E3CdnDE5 (label
 * "test player new") but the coach board showed "No Reply". Dumping the actual
 * roster row showed it was the SAVED roster row (from loadRosterFromServer):
 *   { id: "p-<ts>", name: "Newest Test Player", email: <invite email> }
 * with NO userId and NO legacyPlayerId — created before the player registered.
 * The Availability board never ran syncIdentityStateToLocalRoster, so the row was
 * never linked to the profile. Its keys [p-<ts>, "newest test player"] share
 * nothing with the entry keys [user_…, inv-…, "test player new"] → No Reply.
 *
 * Fix: refreshLiveAvailability now links roster rows to server identity (the
 * Players section already did this) before matching. After linking, the saved row
 * is matched to its profile BY EMAIL and stamped with userId + legacyPlayerId, so
 * the reply attaches.
 *
 * These tests drive the REAL syncIdentityStateToLocalRoster + matcher and also
 * assert the board path is wired to run the link.
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
    function findRow() { return (state.players||[]).find(p => /newest test player|test player new/i.test(p.name)) || null; }
    return { state, syncIdentityStateToLocalRoster, attach, findRow };
  `;
  return new Function(body)();
}

// EXACT production-shaped values.
const EMAIL = 'newestplayer@x.test';
const SAVED_ROW = { id: 'p-1781787451169', name: 'Newest Test Player', email: EMAIL, game: 'no-reply', trainingTuesday: 'no-reply', trainingThursday: 'no-reply' };
const IDENTITY = {
  users: [{ id: 'user_1781605236629_8l19k5', role: 'player', displayName: 'test player new', email: EMAIL }],
  team_members: [{ userId: 'user_1781605236629_8l19k5', role: 'player' }],
  player_profiles: [{ userId: 'user_1781605236629_8l19k5', legacyPlayerId: 'inv-E3CdnDE5', displayName: 'test player new', email: EMAIL }],
};
const apiRow = response => ({ key: 'user_1781605236629_8l19k5', userId: 'user_1781605236629_8l19k5', playerId: 'user_1781605236629_8l19k5', legacyPlayerId: 'inv-E3CdnDE5', label: 'test player new', response });
const API = { tue: apiRow('maybe'), thu: apiRow('unavailable'), game: apiRow('available') };

test('reproduces the bug: saved row (no ids, divergent name) does NOT match before linking', () => {
  const scope = buildScope([{ ...SAVED_ROW }]);
  const row = scope.findRow();
  const live = scope.attach(row, API);
  assert.equal(live, null, 'saved row shares no identifier with the reply → No Reply');
});

test('CRITICAL: after the board links identity, the saved row matches via email-linked ids', () => {
  const scope = buildScope([{ ...SAVED_ROW }]);
  scope.syncIdentityStateToLocalRoster(IDENTITY);          // what the board now does
  const row = scope.findRow();
  assert.ok(row, 'row still present (linked, not duplicated/pruned)');
  assert.equal(row.userId, 'user_1781605236629_8l19k5', 'row stamped with permanent userId via email link');
  assert.equal(row.legacyPlayerId, 'inv-E3CdnDE5', 'row stamped with invite id');
  const live = scope.attach(row, API);
  assert.ok(live, 'reply now attaches — not No Reply');
  assert.equal(live.tue.response, 'maybe');
  assert.equal(live.thu.response, 'unavailable');
  assert.equal(live.game.response, 'available');
});

test('no duplicate row created when linking the saved row', () => {
  const scope = buildScope([{ ...SAVED_ROW }]);
  scope.syncIdentityStateToLocalRoster(IDENTITY);
  const matches = scope.state.players.filter(p =>
    p.email === EMAIL || p.userId === 'user_1781605236629_8l19k5' || /newest test player|test player new/i.test(p.name));
  assert.equal(matches.length, 1, 'exactly one canonical row');
});

test('WIRING: refreshLiveAvailability links roster identity before matching', () => {
  // Lock in the fix: the Availability matcher must invoke the identity link.
  const fn = extractFn('refreshLiveAvailability');
  assert.match(fn, /ensureCoachRosterIdentityLinked\s*\(\s*\)/, 'refreshLiveAvailability calls ensureCoachRosterIdentityLinked()');
  assert.match(src, /async function ensureCoachRosterIdentityLinked\b/, 'the link helper exists');
  assert.match(src, /ensureCoachRosterIdentityLinked[\s\S]{0,400}syncIdentityStateToLocalRoster/, 'the helper runs syncIdentityStateToLocalRoster');
});

test('unrelated saved row (different email) is not linked to this profile', () => {
  const scope = buildScope([{ id: 'p-other', name: 'Someone Else', email: 'someone@else.test', game: 'no-reply', trainingTuesday: 'no-reply', trainingThursday: 'no-reply' }]);
  scope.syncIdentityStateToLocalRoster(IDENTITY);
  // The profile creates its own row; Someone Else is not given this profile's ids.
  const other = scope.state.players.find(p => p.email === 'someone@else.test');
  if (other) assert.notEqual(other.userId, 'user_1781605236629_8l19k5', 'unrelated row never gets this profile id');
  assert.ok(scope.state.players.find(p => p.userId === 'user_1781605236629_8l19k5'), 'profile row exists separately');
});
