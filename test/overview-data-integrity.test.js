/**
 * Overview data integrity — the numbers on the Overview must be the numbers
 * the rest of the app already knows.
 *
 * Three symptoms were reported on a live club, and all three were the same
 * class of defect: the Overview had grown its OWN opinions about availability
 * instead of reading the one the Availability board and Match Centre read.
 *
 *   1. "77 players haven't replied" for a club whose operating group holds 57
 *      — getNeedsAttentionItems counted club-wide state.players.
 *   2. The fixture Availability card showed 0 / 0 / 0 beside a full squad
 *      — it read state.fixtureAvailability, a device-local map the server
 *      never writes, so on a real club it is empty.
 *   3. Squad Availability showed "0 of 57 replied" for a squad that had
 *      replied — it read the per-session field alone, which is blank for
 *      every player whose answer arrived through the server.
 *
 * The authority is sessionRows(id): server-resolved answer first
 * (resolvedAnswerFor), per-session device field only as a fallback, over the
 * OPERATING group's roster. These tests pin that, using the real extracted
 * functions rather than a reimplementation, so a regression in index.html
 * fails here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let paren = 0;
  while (i < source.length) {
    if (source[i] === '(') paren++;
    if (source[i] === ')') { paren--; if (paren === 0) { i++; break; } }
    i++;
  }
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — could not find closing brace');
}

function extractConst(source, name) {
  const marker = '    const ' + name + ' = ';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('const ' + name + ' not found');
  let i = start + marker.length;
  while (i < source.length && (source[i] === ' ' || source[i] === '\n')) i++;
  const open = source[i];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (close) {
    let depth = 0;
    while (i < source.length) {
      if (source[i] === open) depth++;
      else if (source[i] === close) { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
  } else {
    while (i < source.length && source[i] !== ';') i++;
    i++;
  }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

// ── Scope ─────────────────────────────────────────────────────────────────────
// operationalPlayers() is stubbed to a caller-supplied GROUP roster while
// state.players stays the whole club — that separation is exactly what the
// "77 vs 57" defect was about, so the harness has to keep them distinct.
// Everything that decides what a number IS — sessionRows, resolvedAnswerFor,
// the answer map and the counts — is the real code from index.html.

function buildScope({
  clubPlayers = [],           // every player on the device (all groups)
  groupPlayers = null,        // what operationalPlayers() returns; defaults to clubPlayers
  schedule = [],
  fixtures = [],
  messages = [],
  matchCentre = {},
  availabilityRequests = [],
  trainingBlocks = {},
  squadSelections = [],
  fixtureAvailability = {},
  masterFeed = [],
  resolvedAvailability = {},
  permissions = ['publish_training', 'manage_fixtures', 'manage_players', 'publish_squads', 'messaging', 'reports'],
  stubTonightId = null,
  stubPhase = { label: 'None', msLeft: 0, days: 99 },
  stubUnread = 0,
} = {}) {
  const stateObj = {
    players: clubPlayers, schedule, fixtures, messages, matchCentre, masterFeed,
    availabilityRequests, trainingBlocks, squadSelections, fixtureAvailability,
    operationalGroupId: null, formationNames: {}, medicalNotes: {},
  };

  const body =
    '"use strict";\n' +
    'const state = ' + JSON.stringify(stateObj) + ';\n' +
    'const _myPerms = ' + JSON.stringify(permissions) + ';\n' +
    'const _groupPlayers = ' + JSON.stringify(groupPlayers === null ? clubPlayers : groupPlayers) + ';\n' +
    'let _resolvedAvailability = ' + JSON.stringify(resolvedAvailability) + ';\n' +
    'let _chatNavUnread = 0;\n' +
    'let _identityPendingRequests = [];\n' +
    'function operationalPlayers() { return _groupPlayers; }\n' +
    'function getTonightSessionId() { return ' + JSON.stringify(stubTonightId) + '; }\n' +
    'function matchCentrePhase() { return ' + JSON.stringify(stubPhase) + '; }\n' +
    'function chatUnreadTotal() { return ' + JSON.stringify(stubUnread) + '; }\n' +
    'function getTodayReceipts() { return []; }\n' +
    'function getInjuredNoReturnDate() { return []; }\n' +
    'function setSection() {}\n' +
    'function operationalGroups() { return []; }\n' +
    'function canI(perm) { return _myPerms.includes(perm); }\n' +
    'function esc(s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }\n' +
    // Real code from here down.
    extractConst(html, 'CE_INITIAL_GROUP_ID') + '\n' +
    extractFn(html, 'sessionKey') + '\n' +
    extractFn(html, 'sessionReasonKey') + '\n' +
    extractFn(html, 'normalizeSessionId') + '\n' +
    extractFn(html, 'liveAvailabilityPlayerKeys') + '\n' +
    extractFn(html, 'resolvedAnswerFor') + '\n' +
    extractFn(html, 'sessionRows') + '\n' +
    extractConst(html, 'PLAYER_LIFECYCLE_LABELS') + '\n' +
    extractFn(html, 'playerIsArchived') + '\n' +
    extractFn(html, 'activeRosterPlayers') + '\n' +
    extractConst(html, 'rugbySlots') + '\n' +
    extractFn(html, 'positionSlotNumber') + '\n' +
    extractFn(html, 'fixturePositionWarnings') + '\n' +
    extractFn(html, 'fixtureBelongsToGroup') + '\n' +
    extractFn(html, 'contextFixtures') + '\n' +
    extractConst(html, 'HOME_AWAY_LABEL') + '\n' +
    extractFn(html, 'normalizeFixture') + '\n' +
    extractFn(html, 'fixtureSortByDate') + '\n' +
    extractFn(html, 'overviewRoster') + '\n' +
    extractFn(html, 'overviewAvailableCount') + '\n' +
    extractFn(html, 'overviewAnswerMap') + '\n' +
    extractFn(html, 'overviewAnswerCounts') + '\n' +
    extractFn(html, 'overviewAvailabilityContext') + '\n' +
    extractFn(html, 'getNeedsAttentionItems') + '\n' +
    'return { overviewAvailabilityContext, getNeedsAttentionItems, overviewAnswerMap,\n' +
    '         overviewAvailableCount, overviewRoster, sessionRows };\n';

  return new Function(body)();
}

const iso = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const named = (n, prefix, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ id: prefix + (i + 1), name: prefix.toUpperCase() + ' ' + (i + 1), ...extra }));

/** Answers as the SERVER returns them: identifier → sessionId → answer. */
const serverAnswers = (players, sessionId, response) =>
  Object.fromEntries(players.map(p => [String(p.id).toLowerCase(),
    { [sessionId]: { response, reason: '', respondedAt: '2026-08-27T10:00:00.000Z' } }]));

// ── 1. "77 players haven't replied" ───────────────────────────────────────────

test('non-responders are counted over the operating group, never the whole club', () => {
  // The reported shape: 77 on the device, 57 in the group the coach operates.
  const club  = named(77, 'p');
  const group = club.slice(0, 57);

  const items = buildScope({
    clubPlayers: club,
    groupPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }],
    availabilityRequests: [{ id: 'r1', sessionId: 'tue', status: 'sent' }],
  }).getNeedsAttentionItems();

  const nonResp = items.find(i => /replied/.test(i.text));
  assert.ok(nonResp, 'the non-responder item should be raised');
  assert.match(nonResp.text, /^57 players haven't replied$/,
    'must count the operating group (57), not the club-wide roster (77)');
});

test('a player who answered through the server is not chased as a non-responder', () => {
  // The device fields are blank — this is precisely the live situation, where
  // answers live in the resolved model and never on the local player record.
  const group = named(10, 'p');
  const replied = group.slice(0, 6);

  const items = buildScope({
    clubPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }],
    availabilityRequests: [{ id: 'r1', sessionId: 'tue', status: 'sent' }],
    resolvedAvailability: serverAnswers(replied, 'tue', 'available'),
  }).getNeedsAttentionItems();

  const nonResp = items.find(i => /replied/.test(i.text));
  assert.ok(nonResp, 'four players still owe an answer, so the item stands');
  assert.match(nonResp.text, /^4 players haven't replied$/,
    'the six server-side answers must count as replies');
});

test('a squad that has fully replied on the server raises no chase at all', () => {
  const group = named(8, 'p');
  const items = buildScope({
    clubPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }],
    availabilityRequests: [{ id: 'r1', sessionId: 'tue', status: 'sent' }],
    resolvedAvailability: serverAnswers(group, 'tue', 'unavailable'),
  }).getNeedsAttentionItems();

  assert.equal(items.find(i => /replied/.test(i.text)), undefined,
    '"unavailable" is an answer — nobody is outstanding');
});

test('several sessions do not multiply one player into several non-responders', () => {
  // The old code asked sessions.some(...): a player who had answered Tuesday
  // but not Thursday counted as a non-responder, inflating the number further.
  const group = named(5, 'p');
  const items = buildScope({
    clubPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' },
               { id: 'thu', title: 'Thursday', type: 'Training' }],
    availabilityRequests: [{ id: 'r1', sessionId: 'tue', status: 'sent' }],
    resolvedAvailability: serverAnswers(group.slice(0, 3), 'tue', 'available'),
  }).getNeedsAttentionItems();

  const nonResp = items.find(i => /replied/.test(i.text));
  assert.match(nonResp.text, /^2 players haven't replied$/,
    'answering any session is answering; the count is players, not player-sessions');
});

test('the "not requested this week" prompt follows the group, not the club', () => {
  // A club with players but an EMPTY operating group must not be told to chase
  // a squad it cannot see.
  const items = buildScope({
    clubPlayers: named(30, 'p'),
    groupPlayers: [],
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }],
  }).getNeedsAttentionItems();

  assert.equal(items.find(i => /Availability not requested/.test(i.text)), undefined,
    'no players in this group means nothing to request');
});

// ── 2. The fixture Availability card ──────────────────────────────────────────

test('fixture availability reads the fixture\'s own answers, not the device-local map', () => {
  const group = named(20, 'p');
  const av = buildScope({
    clubPlayers: group,
    fixtures: [{ id: 'fx1', opposition: 'Acton Town', date: iso(5) }],
    // state.fixtureAvailability is EMPTY, as it always is on a real club: the
    // server never writes it. The answers are in the resolved model.
    fixtureAvailability: {},
    resolvedAvailability: serverAnswers(group.slice(0, 14), 'fx1', 'available'),
  }).overviewAvailabilityContext();

  assert.equal(av.kind, 'fixture');
  assert.equal(av.total, 20);
  assert.equal(av.available, 14, 'the fixture\'s real answers must be read');
  assert.equal(av.noReply, 6);
  assert.equal(av.responded, 14);
  assert.equal(av.respondedPct, 70);
});

test('the fixture card and the Match Centre read the same rows', () => {
  const group = named(12, 'p');
  const scope = buildScope({
    clubPlayers: group,
    fixtures: [{ id: 'fx9', opposition: 'Rivals', date: iso(3) }],
    resolvedAvailability: {
      ...serverAnswers(group.slice(0, 7), 'fx9', 'available'),
      ...serverAnswers(group.slice(7, 9), 'fx9', 'maybe'),
      ...serverAnswers(group.slice(9, 10), 'fx9', 'unavailable'),
    },
  });
  const av   = scope.overviewAvailabilityContext();
  const rows = scope.sessionRows('fx9');

  assert.equal(av.available,   rows.filter(r => r.status === 'available').length);
  assert.equal(av.maybe,       rows.filter(r => r.status === 'maybe').length);
  assert.equal(av.unavailable, rows.filter(r => r.status === 'unavailable').length);
  assert.equal(av.noReply,     rows.filter(r => !r.status || r.status === 'no-reply').length);
});

test('position warnings for the fixture are derived from the same answers', () => {
  const group = [
    // Positions carry their slot number, as the roster stores them.
    { id: 'p1', name: 'A', position: '2. Hooker' },
    { id: 'p2', name: 'B', position: '9. Scrum-half' },
    { id: 'p3', name: 'C', position: '10. Fly-half' },
  ];
  const av = buildScope({
    clubPlayers: group,
    fixtures: [{ id: 'fx1', opposition: 'Rivals', date: iso(4) }],
    resolvedAvailability: serverAnswers(group, 'fx1', 'available'),
  }).overviewAvailabilityContext();

  const messages = av.warnings.map(w => w.message).join(' | ');
  assert.ok(!/No hooker available/.test(messages),     'the hooker replied available');
  assert.ok(!/No scrum-half available/.test(messages), 'the scrum-half replied available');
  assert.match(messages, /Only 3 players available \(need 15\)/,
    'the genuine shortfall is still reported');
});

// ── 3. Squad Availability / session card ──────────────────────────────────────

test('session availability prefers the server answer over a stale device field', () => {
  const group = [
    { id: 'p1', name: 'A', trainingTuesday: 'unavailable' },   // stale on device
    { id: 'p2', name: 'B', trainingTuesday: 'available' },     // device only
    { id: 'p3', name: 'C' },
  ];
  const av = buildScope({
    clubPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday Session', type: 'Training' }],
    stubTonightId: 'tue',
    resolvedAvailability: serverAnswers([group[0]], 'tue', 'available'),
  }).overviewAvailabilityContext();

  assert.equal(av.kind, 'session');
  assert.equal(av.available, 2, 'p1\'s newer server answer wins; p2\'s device field still counts');
  assert.equal(av.unavailable, 0, 'the stale device value must not survive');
  assert.equal(av.noReply, 1);
});

test('every reading balances: the four states always sum to the squad', () => {
  const group = named(30, 'p');
  const av = buildScope({
    clubPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }],
    stubTonightId: 'tue',
    resolvedAvailability: {
      ...serverAnswers(group.slice(0, 11), 'tue', 'available'),
      ...serverAnswers(group.slice(11, 15), 'tue', 'maybe'),
      ...serverAnswers(group.slice(15, 18), 'tue', 'unavailable'),
      // A value the UI has no bucket for must still be accounted for.
      ...serverAnswers(group.slice(18, 20), 'tue', 'tentative'),
    },
  }).overviewAvailabilityContext();

  assert.equal(av.available + av.maybe + av.unavailable + av.noReply, av.total);
  assert.equal(av.responded + av.noReply, av.total);
  assert.ok(av.availPct >= 0 && av.availPct <= 100);
  assert.ok(av.respondedPct >= 0 && av.respondedPct <= 100);
});

test('a medically unavailable player counts unavailable whatever they replied', () => {
  const group = [
    { id: 'p1', name: 'A', trainingStatus: 'unavailable' },
    { id: 'p2', name: 'B' },
  ];
  const av = buildScope({
    clubPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }],
    stubTonightId: 'tue',
    resolvedAvailability: serverAnswers(group, 'tue', 'available'),
  }).overviewAvailabilityContext();

  assert.equal(av.available, 1,   'only the fit player is available');
  assert.equal(av.unavailable, 1, 'the medical override stands');
});

// ── 4. Scope: the group is the population, everywhere ─────────────────────────

test('another group\'s answers never leak into this group\'s reading', () => {
  const club  = named(20, 'p');
  const group = club.slice(0, 8);
  const others = club.slice(8);

  const av = buildScope({
    clubPlayers: club,
    groupPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }],
    stubTonightId: 'tue',
    resolvedAvailability: {
      ...serverAnswers(group.slice(0, 3), 'tue', 'available'),
      ...serverAnswers(others, 'tue', 'available'),   // a different group answered too
    },
  }).overviewAvailabilityContext();

  assert.equal(av.total, 8, 'the population is the operating group');
  assert.equal(av.available, 3, 'twelve other-group answers must not be counted');
});

test('archived players are in nobody\'s squad total', () => {
  const group = [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B', lifecycleStatus: 'archived' },
    { id: 'p3', name: 'C', _archived: true },
  ];
  const scope = buildScope({
    clubPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }],
    stubTonightId: 'tue',
    resolvedAvailability: serverAnswers(group, 'tue', 'available'),
  });
  assert.equal(scope.overviewAvailabilityContext().total, 1);
  assert.equal(scope.overviewAvailableCount('tue'), 1);
});

test('the confirmed count in an attention item equals the availability card', () => {
  // Two surfaces, one number. This is what "77" vs the card disagreeing looked
  // like to the coach.
  const group = named(15, 'p');
  const scope = buildScope({
    clubPlayers: group,
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training', published: false }],
    trainingBlocks: { tue: ['b1'] },
    stubTonightId: 'tue',
    resolvedAvailability: serverAnswers(group.slice(0, 9), 'tue', 'available'),
  });
  const av    = scope.overviewAvailabilityContext();
  const item  = scope.getNeedsAttentionItems().find(i => /not published/.test(i.text));

  assert.equal(av.available, 9);
  assert.ok(item, 'tonight\'s unpublished plan should be raised');
  assert.match(item.detail, /9 confirmed/, 'the attention item must quote the same 9');
});

// ── 5. No invented data ───────────────────────────────────────────────────────

test('an empty group reads as no data rather than a row of zeroes', () => {
  const av = buildScope({ clubPlayers: named(40, 'p'), groupPlayers: [],
    schedule: [{ id: 'tue', title: 'Tuesday', type: 'Training' }], stubTonightId: 'tue' })
    .overviewAvailabilityContext();
  assert.equal(av.kind, 'none');
});

test('nothing is filled in when nobody has answered', () => {
  const group = named(57, 'p');
  const av = buildScope({
    clubPlayers: group,
    fixtures: [{ id: 'fx1', opposition: 'Rivals', date: iso(6) }],
  }).overviewAvailabilityContext();

  assert.equal(av.total, 57,       'the squad is real and is reported');
  assert.equal(av.available, 0);
  assert.equal(av.maybe, 0);
  assert.equal(av.unavailable, 0);
  assert.equal(av.noReply, 57,     'an unanswered squad is honestly unanswered');
  assert.equal(av.responded, 0);
});

test('the Overview keeps no private opinion about availability', () => {
  // state.fixtureAvailability is written only by a coach tapping the local
  // fixture board; the server never populates it. If the Overview reads it
  // again, the fixture card goes back to showing zeroes on every real club.
  const start = html.indexOf('    function overviewAnswerMap(');
  const end   = html.indexOf('    function renderClubCommandDashboard(');
  assert.ok(start > 0 && end > start);
  const region = html.slice(start, end)
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  assert.ok(!/state\.fixtureAvailability/.test(region),
    'the Overview must not read the device-local fixture map');
  assert.ok(!/state\.players/.test(region),
    'the Overview must not read the club-wide roster');
  assert.match(region, /sessionRows\(/, 'it must read the shared, server-resolved rows');
});
