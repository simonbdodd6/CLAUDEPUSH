/**
 * PLAYER PROFILE — RECENT ACTIVITY, and why it could not stay as it was.
 *
 * THE OLD CARD had four fixed rows. Two of them ("Last training attended",
 * "Last match played") were hardcoded to the empty string, so they could only
 * ever read "No record yet" — a permanent claim about data the product never
 * computed. A third said "Last message" but showed an availability status with
 * no date. The fourth did this:
 *
 *     masterFeed.filter(f => String(f.event || '').includes(p.name))
 *
 * The fatal part is the MATCHING, not the feed: a substring of a free-text
 * sentence decided whose activity this was. Two players called Sam Jones shared
 * one history, a rename detached a player from theirs, and a name occurring
 * inside another sentence produced a false hit.
 *
 * ONE FEED, TWO CONTEXTS. The profile now calls the SAME recentActivity() the
 * Overview does, narrowed by canonical identity — not a second activity system.
 * These tests drive the real function; they do not assert strings in index.html.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = source.indexOf('(', start), paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === '(') paren++;
    else if (source[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = source.indexOf('{', i), depth = 0;
  for (let k = brace; k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (!depth) return source.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const extractConst = (src, n) => { const i = src.indexOf('    const ' + n + ' '); return src.slice(i, src.indexOf(';', i) + 1); };

const NOW = '2026-08-30T12:00:00.000Z';
const ago = m => new Date(Date.parse(NOW) - m * 60000).toISOString();
const SEN = 'grp_sen', U18 = 'grp_u18';
const SESSIONS = [{ id: 'tue', title: 'Tuesday training' }, { id: 'game', title: 'Match vs Kituro' }];

function world({
  roster = [], resolved = {}, resolvedGroup = SEN, availSynced = true,
  members = [], profiles = [], adminLoaded = true, adminAttempted = true, adminLoading = false,
  schedule = SESSIONS, group = SEN, groupName = 'Seniors',
} = {}) {
  return new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: cfg.group, schedule: cfg.schedule, players: cfg.roster };
    let _resolvedAvailability = cfg.resolved;
    let _resolvedAvailabilityGroup = cfg.resolvedGroup;
    let _availLastSync = cfg.availSynced ? '${NOW}' : null;
    const _adminData = { members: cfg.members, profiles: cfg.profiles,
      loaded: cfg.adminLoaded, loading: cfg.adminLoading, attempted: cfg.adminAttempted };
    function operationalPlayers() { return cfg.roster; }
    function operationalGroupName() { return cfg.groupName; }
    function availabilityWeekSessions() { return state.schedule || []; }
    function normalizeSessionId(id) { return String(id); }
    function liveAvailabilityPlayerKeys(p) { return [p.userId, p.id, p.legacyPlayerId].filter(Boolean).map(String); }
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'currentResolvedAvailability')}
    ${extractFn(html, 'resolvedAnswerFor')}
    ${extractConst(html, 'ACTIVITY_LIMIT')}
    ${extractFn(html, 'recentActivity')}
    return { recentActivity, playerMatchKey };
  `)({ roster, resolved, resolvedGroup, availSynced, members, profiles,
       adminLoaded, adminAttempted, adminLoading, schedule, group, groupName });
}

const ANA  = { id: 'p1', name: 'Ana Silva',  userId: 'u1' };
const BEN  = { id: 'p2', name: 'Ben Okafor', userId: 'u2' };
const YOUTH = { id: 'p9', name: 'Youth One', userId: 'u9' };
const answer = (sid, at, response = 'available') => ({ [sid]: { response, reason: '', respondedAt: at } });
const forPlayer = (w, p) => w.recentActivity(NOW, { playerKey: w.playerMatchKey(p) });

// ───────────────────────── this player, and only this player ─────────────────

test("a player's own activity appears on their profile", () => {
  const w = world({ roster: [ANA, BEN],
    resolved: { u1: answer('tue', ago(10)) },
    members: [{ userId: 'u1', status: 'active', playerGroupId: SEN, joinedAt: ago(300) }],
    profiles: [{ userId: 'u1', detailsUpdatedAt: ago(60) }] });
  const a = forPlayer(w, ANA);
  assert.equal(a.status, 'ready');
  assert.deepEqual(a.items.map(i => i.kind), ['availability', 'profile', 'member']);
  assert.deepEqual(a.items.map(i => i.text),
    ['Replied to Tuesday training', 'Updated their profile', 'Joined Seniors']);
});

test("another player's activity never appears", () => {
  const w = world({ roster: [ANA, BEN],
    resolved: { u1: answer('tue', ago(10)), u2: answer('tue', ago(5)) },
    members: [{ userId: 'u2', status: 'active', playerGroupId: SEN, joinedAt: ago(20) }],
    profiles: [{ userId: 'u2', detailsUpdatedAt: ago(30) }] });
  const a = forPlayer(w, ANA);
  assert.equal(a.items.length, 1, "only Ana's own reply");
  assert.equal(a.items[0].text, 'Replied to Tuesday training');
  assert.ok(a.items.every(i => i.who === 'id:u1'));
  // Ben's profile shows Ben's three, and none of Ana's.
  const b = forPlayer(w, BEN);
  assert.equal(b.items.length, 3);
  assert.ok(b.items.every(i => i.who === 'id:u2'));
});

test('an event belonging to nobody — a session publication — reaches no profile', () => {
  const w = world({ roster: [ANA],
    schedule: [{ id: 'tue', title: 'Tuesday training', published: true, publishedAt: ago(15) }] });
  assert.equal(forPlayer(w, ANA).items.length, 0, 'publishing is the coach’s doing, not a player’s');
  // …but it still belongs on the group feed.
  const group = w.recentActivity(NOW);
  assert.deepEqual(group.items.map(i => i.text), ['Tuesday training published']);
  assert.equal(group.items[0].who, '', 'no owner, so no profile can claim it');
});

// ───────────────────────── identity, not names ───────────────────────────────

test('two players sharing a display name keep separate histories', () => {
  const twinA = { id: 'pA', name: 'Sam Jones', userId: 'uA' };
  const twinB = { id: 'pB', name: 'Sam Jones', userId: 'uB' };
  const w = world({ roster: [twinA, twinB],
    resolved: { uA: answer('tue', ago(4)), uB: answer('game', ago(6)) } });
  const a = forPlayer(w, twinA), b = forPlayer(w, twinB);
  assert.deepEqual(a.items.map(i => i.text), ['Replied to Tuesday training']);
  assert.deepEqual(b.items.map(i => i.text), ['Replied to Match vs Kituro']);
  // The old card matched f.event.includes(p.name) — which would have given
  // BOTH of these to BOTH players.
  assert.notEqual(a.items[0].who, b.items[0].who);
});

test('a renamed player keeps their activity', () => {
  const before = forPlayer(world({ roster: [ANA], resolved: { u1: answer('tue', ago(9)) } }), ANA);
  const renamed = { ...ANA, name: 'Ana Marie Silva-Fernandes' };
  const after = forPlayer(world({ roster: [renamed], resolved: { u1: answer('tue', ago(9)) } }), renamed);
  assert.equal(before.items.length, 1);
  assert.equal(after.items.length, 1, 'the rename does not orphan the history');
  assert.equal(after.items[0].who, before.items[0].who, 'same durable identity either side');
});

test('a player whose name appears inside someone else’s event gets no false hit', () => {
  // The substring match this replaces: "Ana" is inside "Anastasia".
  const ana = { id: 'p1', name: 'Ana', userId: 'u1' };
  const anastasia = { id: 'p2', name: 'Anastasia Petrova', userId: 'u2' };
  const w = world({ roster: [ana, anastasia], resolved: { u2: answer('tue', ago(3)) } });
  assert.equal(forPlayer(w, ana).items.length, 0, '"Ana" must not inherit "Anastasia"’s reply');
  assert.equal(forPlayer(w, anastasia).items.length, 1);
});

test('a player with no durable identity claims nothing', () => {
  const noAccount = { id: 'p4', name: 'Trial Player' };   // roster row, no userId
  const w = world({ roster: [ANA, noAccount], resolved: { u1: answer('tue', ago(5)) } });
  // playerMatchKey falls back to the roster id, which owns no server events.
  assert.equal(forPlayer(w, noAccount).items.length, 0);
});

// ───────────────────────── ordering and bounds ───────────────────────────────

test('newest first, with a deterministic tie-break', () => {
  const same = ago(7);
  const mk = order => world({ roster: [ANA],
    resolved: { u1: { ...answer('tue', same), ...answer('game', same) } },
    schedule: order });
  const fwd = forPlayer(mk(SESSIONS), ANA).items.map(i => i.key);
  const rev = forPlayer(mk([...SESSIONS].reverse()), ANA).items.map(i => i.key);
  assert.deepEqual(fwd, rev, 'session order must not decide what a coach sees');
  assert.deepEqual(fwd, [...fwd].sort());
});

test('a profile feed is bounded', () => {
  const many = {};
  const sched = Array.from({ length: 20 }, (_, i) => ({ id: 's' + i, title: 'Session ' + i }));
  sched.forEach((s, i) => { many[s.id] = { response: 'available', reason: '', respondedAt: ago(i + 1) }; });
  const a = forPlayer(world({ roster: [ANA], resolved: { u1: many }, schedule: sched }), ANA);
  assert.equal(a.items.length, 6);
  assert.equal(a.items[0].text, 'Replied to Session 0', 'and keeps the newest');
});

// ───────────────────────── isolation ─────────────────────────────────────────

test('a stale group read is unknown on a profile too, never an empty history', () => {
  const w = world({ roster: [YOUTH], resolved: { u1: answer('tue', ago(2)) },
    resolvedGroup: SEN, group: U18, adminLoaded: false, adminAttempted: false });
  assert.equal(forPlayer(w, YOUTH).status, 'loading');
});

test('a U18 profile cannot surface Seniors activity', () => {
  const w = world({ roster: [YOUTH], resolved: { u1: answer('tue', ago(2)), u9: answer('tue', ago(4)) },
    resolvedGroup: U18, group: U18, groupName: 'U18',
    members: [{ userId: 'u1', status: 'active', playerGroupId: SEN, joinedAt: ago(9) }] });
  const a = forPlayer(w, YOUTH);
  assert.deepEqual(a.items.map(i => i.text), ['Replied to Tuesday training']);
  assert.ok(a.items.every(i => i.who === 'id:u9'));
  // And asking for the Seniors player while operating U18 yields nothing.
  assert.equal(w.recentActivity(NOW, { playerKey: 'id:u1' }).items.length, 0);
});

test('a membership in another group produces no profile entry', () => {
  const w = world({ roster: [ANA, YOUTH], group: SEN,
    members: [{ userId: 'u9', status: 'active', playerGroupId: U18, joinedAt: ago(10) }] });
  assert.equal(forPlayer(w, YOUTH).items.length, 0);
});

test('a forged identity from outside the roster claims nothing', () => {
  const w = world({ roster: [ANA], resolved: { u1: answer('tue', ago(3)) },
    members: [{ userId: 'u-other-club', status: 'active', playerGroupId: SEN, joinedAt: ago(4) }],
    profiles: [{ userId: 'u-other-club', detailsUpdatedAt: ago(4) }] });
  assert.equal(w.recentActivity(NOW, { playerKey: 'id:u-other-club' }).items.length, 0);
});

// ───────────────────────── honest states ─────────────────────────────────────

test('loading, failure and an genuinely quiet history are three different answers', () => {
  const loading = forPlayer(world({ roster: [ANA], availSynced: false,
    adminLoaded: false, adminAttempted: false }), ANA);
  assert.equal(loading.status, 'loading');

  const failed = forPlayer(world({ roster: [ANA], availSynced: false,
    adminLoaded: false, adminAttempted: true, adminLoading: false }), ANA);
  assert.equal(failed.status, 'error');

  const quiet = forPlayer(world({ roster: [ANA] }), ANA);
  assert.equal(quiet.status, 'ready');
  assert.deepEqual(quiet.items, []);
});

// ───────────────────────── privacy ───────────────────────────────────────────

test('no reason, no answer, no medical detail reaches a profile entry', () => {
  const w = world({ roster: [ANA],
    resolved: { u1: { tue: { response: 'injured', reason: 'ACL tear — surgery Thursday', respondedAt: ago(8) } } } });
  const a = forPlayer(w, ANA);
  assert.equal(a.items.length, 1);
  assert.equal(a.items[0].text, 'Replied to Tuesday training');
  const blob = JSON.stringify(a);
  assert.ok(!/ACL|tear|surgery/i.test(blob), 'the stated reason is private');
  assert.ok(!/injured|available|unavailable/i.test(a.items[0].text), 'the answer itself is not broadcast');
});

test('an activity item exposes only what it needs to render', () => {
  const a = forPlayer(world({ roster: [ANA], resolved: { u1: answer('tue', ago(9)) } }), ANA);
  // `ms` is the parsed sort key; `at` is the ISO value rendered. Both are needed;
  // nothing else — no reason, no response, no roster row — travels with an item.
  assert.deepEqual(Object.keys(a.items[0]).sort(), ['at', 'key', 'kind', 'ms', 'text', 'who']);
});

// ───────────────────────── one system, not two ───────────────────────────────

const PROFILE_CARD = (() => {
  const i = html.indexOf('<!-- RECENT ACTIVITY -->');
  return html.slice(i, html.indexOf('<!-- COACH NOTES -->', i));
})();
const strip = src => src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');

test('the profile calls the SHARED feed, not a second one', () => {
  assert.match(strip(PROFILE_CARD), /recentActivity\(null, \{ playerKey: playerMatchKey\(p\) \}\)/);
  assert.equal(html.split('function recentActivity(').length - 1, 1, 'one activity function');
  assert.equal(html.split('function timeAgo(').length - 1, 1, 'one relative-time convention');
  assert.equal(html.split('const ACT_MARK').length - 1, 1, 'one activity vocabulary');
  assert.equal(html.split('const ACT_WHAT').length - 1, 1);
});

test('the profile no longer matches by name, and the dead rows are gone', () => {
  const model = (() => {
    const i = html.indexOf('    function memberCentreModel(');
    let d = 0, j = html.indexOf('{', i);
    for (let k = j; k < html.length; k++) {
      if (html[k] === '{') d++;
      else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); }
    }
  })();
  assert.ok(!/masterFeed/.test(strip(model)), 'the device-local feed is not read here at all');
  assert.ok(!/includes\(p\.name\)/.test(strip(model)), 'no substring name matching survives');
  assert.ok(!/lastAvailabilityUpdate|lastMessage/.test(strip(model)), 'the name-matched model is gone');
  // The two rows that could only ever say "No record yet". Asserted against the
  // STRIPPED card: the comment explaining why they were removed necessarily
  // names them, and would otherwise match the assertion meant to prove they
  // are gone from the markup.
  const cardCode = strip(PROFILE_CARD);
  assert.ok(!/Last training attended|Last match played/.test(cardCode));
  assert.ok(!/No record yet/.test(cardCode));
});

test('the profile distinguishes its three states in markup', () => {
  assert.match(PROFILE_CARD, /act\.status === 'loading'/);
  assert.match(PROFILE_CARD, /act\.status === 'error'/);
  assert.match(PROFILE_CARD, /Loading activity…/);
  assert.match(PROFILE_CARD, /not a record of a quiet spell/);
  assert.match(PROFILE_CARD, /No recent activity for/);
});

test('the profile card introduces no colour of its own and wraps long names', () => {
  const hexes = [...strip(PROFILE_CARD).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
  assert.deepEqual(hexes, [], 'tokens only');
  assert.match(PROFILE_CARD, /ovw-feed-text/, 'reuses the wrapping the Overview feed already has');
  assert.match(PROFILE_CARD, /aria-hidden="true">\$\{ACT_MARK/, 'the mark is decorative; the word carries meaning');
});

test('the Overview feed still names people — the shared function serves both', () => {
  const w = world({ roster: [ANA], resolved: { u1: answer('tue', ago(10)) } });
  assert.equal(w.recentActivity(NOW).items[0].text, 'Ana Silva replied to Tuesday training');
  assert.equal(forPlayer(w, ANA).items[0].text, 'Replied to Tuesday training');
});
