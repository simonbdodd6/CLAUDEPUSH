/**
 * Beta stabilisation hotfix regression tests.
 *
 * Bug 1 — Player availability must be independent per session/match.
 * Bug 2 — Coach availability board must reflect the player's per-session response
 *         (the live state.players record must be found and updated reliably).
 * Bug 4 — Match Centre layout: match-details panel collapses, team graphic enlarges.
 *
 * (Bug 3 — messaging conversation ID consistency — is covered in
 *  messaging-stability.test.js, alongside the existing alignment tests.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start + m[0].length - 1; // start brace-count at the body '{' (skip default-param braces)
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

function buildScope() {
  const fns = [
    // findLiveAvailabilityRecords now groups by the canonical rosterIdentityKeys,
    // so its identity-grouping dependency graph must be in scope too.
    'identityNameKey', 'identityCompactKey', 'canonicalIdentityNameKey', 'identityEmailKey',
    'isPermanentPlayerUserId', 'findPermanentRosterUser', 'resolveRosterMessagingId', 'rosterIdentityKeys',
    'sessionKey',
    'keyToSessionId',
    'availabilityApplyToRecord',
    'findLiveAvailabilityRecords',
    'findLiveAvailabilityRecord',
    'matchPlannerLayout',
  ].map(extractFn).join('\n');
  const body = `
    "use strict";
    ${fns}
    return { sessionKey, keyToSessionId, availabilityApplyToRecord, findLiveAvailabilityRecords, findLiveAvailabilityRecord, matchPlannerLayout };
  `;
  return new Function(body)();
}

// ── Bug 1: session key mapping is fully invertible ────────────────────────────

test('sessionKey maps default session ids to distinct keys', () => {
  const { sessionKey } = buildScope();
  assert.equal(sessionKey('tue'),  'trainingTuesday');
  assert.equal(sessionKey('thu'),  'trainingThursday');
  assert.equal(sessionKey('game'), 'game');
  assert.equal(sessionKey('xyz'),  'avail_xyz');
});

test('keyToSessionId round-trips every default session id', () => {
  const { sessionKey, keyToSessionId } = buildScope();
  ['tue', 'thu', 'game'].forEach(id => {
    assert.equal(keyToSessionId(sessionKey(id)), id, `${id} must round-trip`);
  });
});

test('keyToSessionId round-trips custom session ids (no collapse to game)', () => {
  const { sessionKey, keyToSessionId } = buildScope();
  ['friday', 'gym1', 'extra-fitness'].forEach(id => {
    assert.equal(keyToSessionId(sessionKey(id)), id,
      `custom session ${id} must not collapse to "game"`);
  });
});

test('keyToSessionId: game key resolves to game (not via fallback collision)', () => {
  const { keyToSessionId } = buildScope();
  assert.equal(keyToSessionId('game'), 'game');
});

// ── Bug 1: per-session writes are independent ─────────────────────────────────

test('availabilityApplyToRecord changes only the targeted session', () => {
  const { availabilityApplyToRecord } = buildScope();
  const player = {
    trainingTuesday: 'available', trainingTuesdayReason: '',
    trainingThursday: 'maybe',    trainingThursdayReason: 'work',
    game: 'unavailable',          gameReason: 'injury',
  };
  availabilityApplyToRecord(player, 'trainingTuesday', 'unavailable', 'holiday');
  // targeted session updated
  assert.equal(player.trainingTuesday, 'unavailable');
  assert.equal(player.trainingTuesdayReason, 'holiday');
  // other sessions untouched
  assert.equal(player.trainingThursday, 'maybe');
  assert.equal(player.trainingThursdayReason, 'work');
  assert.equal(player.game, 'unavailable');
  assert.equal(player.gameReason, 'injury');
});

test('availabilityApplyToRecord: changing Training 1 does not affect Training 2 or Match', () => {
  const { availabilityApplyToRecord, sessionKey } = buildScope();
  const player = {};
  availabilityApplyToRecord(player, sessionKey('tue'), 'available', '');
  availabilityApplyToRecord(player, sessionKey('thu'), 'unavailable', 'work');
  availabilityApplyToRecord(player, sessionKey('game'), 'maybe', '');
  // Now flip ONLY tuesday and assert the others are stable
  availabilityApplyToRecord(player, sessionKey('tue'), 'maybe', 'family');
  assert.equal(player[sessionKey('tue')],  'maybe');
  assert.equal(player[sessionKey('thu')],  'unavailable');
  assert.equal(player[sessionKey('game')], 'maybe');
  assert.equal(player[sessionKey('thu')  + 'Reason'], 'work');
  assert.equal(player[sessionKey('game') + 'Reason'], '');
});

test('availabilityApplyToRecord: empty reason normalises to empty string', () => {
  const { availabilityApplyToRecord } = buildScope();
  const player = {};
  availabilityApplyToRecord(player, 'game', 'available');
  assert.equal(player.gameReason, '');
});

test('availabilityApplyToRecord: null record returns gracefully', () => {
  const { availabilityApplyToRecord } = buildScope();
  assert.equal(availabilityApplyToRecord(null, 'game', 'available', ''), null);
});

test('availabilityApplyToRecord: missing key is a no-op', () => {
  const { availabilityApplyToRecord } = buildScope();
  const player = { game: 'available' };
  availabilityApplyToRecord(player, '', 'maybe', '');
  assert.equal(player.game, 'available');
});

// ── Bug 2: coach board finds the live record across identity variants ─────────

test('findLiveAvailabilityRecord matches by id', () => {
  const { findLiveAvailabilityRecord } = buildScope();
  const players = [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }];
  const found = findLiveAvailabilityRecord(players, { id: 'p2' });
  assert.equal(found.name, 'Bob');
});

test('findLiveAvailabilityRecord matches canonical userId against raw record', () => {
  const { findLiveAvailabilityRecord } = buildScope();
  // raw state.players entry keeps the invite id but links via userId
  const players = [{ id: 'inv-123', userId: 'user_abc', name: 'Carol' }];
  // canonical/deduped copy presents the permanent user id as its id
  const canonical = { id: 'user_abc', legacyPlayerId: 'inv-123', name: 'Carol' };
  const found = findLiveAvailabilityRecord(players, canonical);
  assert.equal(found.name, 'Carol', 'must find raw record despite differing id field');
});

test('findLiveAvailabilityRecord matches via legacyPlayerId', () => {
  const { findLiveAvailabilityRecord } = buildScope();
  const players = [{ id: 'user_x', legacyPlayerId: 'inv-999', name: 'Dee' }];
  const found = findLiveAvailabilityRecord(players, { id: 'inv-999' });
  assert.equal(found.name, 'Dee');
});

test('findLiveAvailabilityRecord returns null when no identity overlaps', () => {
  const { findLiveAvailabilityRecord } = buildScope();
  const players = [{ id: 'p1', name: 'Alice' }];
  assert.equal(findLiveAvailabilityRecord(players, { id: 'nobody' }), null);
});

test('findLiveAvailabilityRecord returns null for empty inputs', () => {
  const { findLiveAvailabilityRecord } = buildScope();
  assert.equal(findLiveAvailabilityRecord([], { id: 'p1' }), null);
  assert.equal(findLiveAvailabilityRecord(null, { id: 'p1' }), null);
  assert.equal(findLiveAvailabilityRecord([{ id: 'p1' }], null), null);
  assert.equal(findLiveAvailabilityRecord([{ id: 'p1' }], {}), null);
});

test('coach board update flows through the live record', () => {
  // Simulate the setPlayerAvailability path: player is a canonical copy,
  // live is the state.players record the coach board reads via sessionRows.
  const { findLiveAvailabilityRecord, availabilityApplyToRecord, sessionKey } = buildScope();
  const live = { id: 'inv-55', userId: 'user_55', name: 'Eve', game: 'no-reply' };
  const players = [live];
  const canonical = { id: 'user_55', legacyPlayerId: 'inv-55', name: 'Eve', game: 'no-reply' };

  const target = findLiveAvailabilityRecord(players, canonical);
  availabilityApplyToRecord(target, sessionKey('game'), 'unavailable', 'injury');

  // The coach board reads state.players[*].game — it must now show the change
  assert.equal(players[0].game, 'unavailable');
  assert.equal(players[0].gameReason, 'injury');
});

// ── Bug 4: Match Centre layout helper ─────────────────────────────────────────

test('matchPlannerLayout: collapsed by default hides details and enlarges pitch', () => {
  const { matchPlannerLayout } = buildScope();
  const layout = matchPlannerLayout(true);
  assert.equal(layout.detailsCollapsed, true);
  assert.equal(layout.detailsOpenAttr, '');
  assert.equal(layout.pitchClass, 'pitch-big'); // no pitch-compact → full size
});

test('matchPlannerLayout: undefined defaults to collapsed', () => {
  const { matchPlannerLayout } = buildScope();
  const layout = matchPlannerLayout(undefined);
  assert.equal(layout.detailsCollapsed, true);
  assert.equal(layout.pitchClass, 'pitch-big');
});

test('matchPlannerLayout: expanded shows details and compacts pitch', () => {
  const { matchPlannerLayout } = buildScope();
  const layout = matchPlannerLayout(false);
  assert.equal(layout.detailsCollapsed, false);
  assert.equal(layout.detailsOpenAttr, 'open');
  assert.equal(layout.pitchClass, 'pitch-big pitch-compact');
});

test('matchPlannerLayout: deterministic for the same input', () => {
  const { matchPlannerLayout } = buildScope();
  assert.deepEqual(matchPlannerLayout(true), matchPlannerLayout(true));
  assert.deepEqual(matchPlannerLayout(false), matchPlannerLayout(false));
});

// ── Source-level wiring checks ────────────────────────────────────────────────

test('setPlayerAvailability uses the robust live-record finder', () => {
  const fn = extractFn('setPlayerAvailability');
  assert.ok(fn.includes('findLiveAvailabilityRecord'),
    'setPlayerAvailability must locate the live record via findLiveAvailabilityRecord');
  assert.ok(fn.includes('availabilityApplyToRecord'),
    'setPlayerAvailability must write via availabilityApplyToRecord');
});

test('match details rendered inside a collapsible details element', () => {
  assert.ok(src.includes('ontoggle="toggleMatchDetails(this.open)"'),
    'match details panel must be a collapsible <details> with toggle handler');
});

test('matchDetailsCollapsed defaults to true in defaultState', () => {
  assert.ok(src.includes('matchDetailsCollapsed: true'),
    'defaultState must default matchDetailsCollapsed to true');
});

test('individual message send resolves target from canonical roster', () => {
  // The compose path must use canonicalVisiblePlayers() so the coach writes to
  // the same conv id the player listens on (Bug 3).
  const idx = src.lastIndexOf("audience === 'individual' && playerId");
  assert.ok(idx !== -1, 'compose path must exist');
  const block = src.slice(idx, idx + 1400);
  assert.ok(block.includes('canonicalVisiblePlayers()'),
    'individual send must resolve target via canonicalVisiblePlayers()');
});

test('no new API files referenced by the hotfix helpers', () => {
  const apiFiles = fs.readdirSync(new URL('../api', import.meta.url)).filter(f => f.endsWith('.js'));
  apiFiles.forEach(f => {
    const apiSrc = fs.readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');
    assert.ok(!apiSrc.includes('availabilityApplyToRecord'), `API ${f} must not contain UI helpers`);
    assert.ok(!apiSrc.includes('matchPlannerLayout'), `API ${f} must not contain UI helpers`);
  });
});
