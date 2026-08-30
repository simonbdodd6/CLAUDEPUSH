/**
 * RECENT ACTIVITY — real events, or an honest silence.
 *
 * WHAT IT USED TO SHOW. Two sources, neither of which could carry a date:
 *
 *  · state.masterFeed writes the LITERAL string time:"Just now" and has no
 *    timestamp field at all, so an entry written three weeks ago still read
 *    "Just now" forever. It is device-local (this browser's own toasts, not the
 *    club's activity) and carries no group, so Seniors entries showed under U18.
 *
 *  · getTodayReceipts() mixes dated and undated facts. state.matchCentre
 *    .published is a bare boolean, so "Squad published" stayed true permanently
 *    once any squad had ever been published.
 *
 * WHAT IT SHOWS NOW. Only events carrying a real, server-written timestamp:
 * availability replies (respondedAt), sessions published (publishedAt), people
 * joining (joinedAt/approvedAt) and players updating their own profile
 * (detailsUpdatedAt). People are resolved by DURABLE membership id and named at
 * render time, so a rename moves the name and never the history.
 *
 * These tests drive the real extracted functions over real-shaped data. They do
 * not assert that strings exist in index.html.
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
const ago = mins => new Date(Date.parse(NOW) - mins * 60000).toISOString();

const SEN = 'grp_sen', U18 = 'grp_u18';
const SESSIONS = [
  { id: 'tue',  title: 'Tuesday training' },
  { id: 'game', title: 'Match vs Kituro' },
];

/**
 * A real scope: the extracted recentActivity + its real collaborators, over an
 * in-memory world shaped exactly like the running app's.
 *
 *   resolved  — the server's availability resolution, keyed by identity
 *   members   — server memberships (joinedAt / approvedAt / playerGroupId)
 *   profiles  — server player profiles (detailsUpdatedAt)
 */
function world({
  roster = [], resolved = {}, resolvedGroup = SEN, availSynced = true,
  members = [], profiles = [], adminLoaded = true, adminAttempted = true, adminLoading = false,
  schedule = SESSIONS, group = SEN, groupName = 'Seniors', coach = true,
} = {}) {
  return new Function('cfg', `
    "use strict";
    const state = { operationalGroupId: cfg.group, schedule: cfg.schedule, players: cfg.roster };
    let _resolvedAvailability = cfg.resolved;
    let _resolvedAvailabilityGroup = cfg.resolvedGroup;
    let _availLastSync = cfg.availSynced ? '${NOW}' : null;
    const _adminData = { members: cfg.members, profiles: cfg.profiles,
      loaded: cfg.adminLoaded, loading: cfg.adminLoading, attempted: cfg.adminAttempted };
    function isCoach() { return cfg.coach; }
    function operationalPlayers() { return cfg.roster; }
    function operationalGroupName() { return cfg.groupName; }
    function availabilityWeekSessions() { return state.schedule || []; }
    function ensureAdminData() {}
    function normalizeSessionId(id) { return String(id); }
    function liveAvailabilityPlayerKeys(p) {
      return [p.userId, p.id, p.legacyPlayerId].filter(Boolean).map(String);
    }
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'currentResolvedAvailability')}
    ${extractFn(html, 'resolvedAnswerFor')}
    ${extractConst(html, 'ACTIVITY_LIMIT')}
    ${extractFn(html, 'recentActivity')}
    ${extractFn(html, 'timeAgo')}
    return { recentActivity, timeAgo, currentResolvedAvailability, state };
  `)({ roster, resolved, resolvedGroup, availSynced, members, profiles,
       adminLoaded, adminAttempted, adminLoading, schedule, group, groupName, coach });
}

const ANA  = { id: 'p1', name: 'Ana Silva',  userId: 'u1' };
const BEN  = { id: 'p2', name: 'Ben Okafor', userId: 'u2' };
const YOUTH = { id: 'p9', name: 'Youth One', userId: 'u9' };
const answer = (sid, at, response = 'available') => ({ [sid]: { response, reason: '', respondedAt: at } });

// ───────────────────────────── real activity appears ─────────────────────────

test('an availability reply becomes an activity entry, with its real timestamp', () => {
  const w = world({ roster: [ANA], resolved: { u1: answer('tue', ago(10)) } });
  const a = w.recentActivity(NOW);
  assert.equal(a.status, 'ready');
  const avail = a.items.filter(i => i.kind === 'availability');
  assert.equal(avail.length, 1);
  assert.equal(avail[0].text, 'Ana Silva replied to Tuesday training');
  assert.equal(avail[0].at, ago(10), 'the SERVER timestamp, not now');
});

test('a published session and a join and a profile update all appear', () => {
  const w = world({
    roster: [ANA, BEN],
    schedule: [{ id: 'tue', title: 'Tuesday training', published: true, publishedAt: ago(30) }],
    members: [{ userId: 'u2', status: 'active', playerGroupId: SEN, joinedAt: ago(120) }],
    profiles: [{ userId: 'u1', detailsUpdatedAt: ago(45) }],
  });
  const kinds = w.recentActivity(NOW).items.map(i => i.kind);
  assert.deepEqual(kinds, ['training', 'profile', 'member'], 'newest first across all sources');
});

test('newest first, and equal timestamps break ties deterministically', () => {
  const same = ago(5);
  const resolved = { u1: answer('tue', same), u2: answer('tue', same) };
  // The tie-break only earns its keep when the INPUT order differs: Array.sort
  // is stable, so a same-order rerun would agree even with no tie-break at all.
  // Two renders that walked the roster in opposite orders must still agree.
  const forward  = world({ roster: [ANA, BEN], resolved }).recentActivity(NOW).items.map(i => i.key);
  const backward = world({ roster: [BEN, ANA], resolved }).recentActivity(NOW).items.map(i => i.key);
  assert.deepEqual(forward, backward, 'roster order must not decide what a coach sees');
  assert.deepEqual(forward, [...forward].sort(), 'ordered by durable key when the clock ties');
});

test('the feed is bounded', () => {
  const roster = Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, name: 'P' + i, userId: 'u' + i }));
  const resolved = {};
  roster.forEach((p, i) => { resolved[p.userId] = answer('tue', ago(i + 1)); });
  const a = world({ roster, resolved }).recentActivity(NOW);
  assert.equal(a.items.length, 6);
  assert.equal(a.items[0].text, 'P0 replied to Tuesday training', 'and it keeps the NEWEST six');
});

// ───────────────────────────── honest non-answers ────────────────────────────

test('loading is not empty', () => {
  const a = world({ roster: [ANA], availSynced: false, adminLoaded: false, adminAttempted: false }).recentActivity(NOW);
  assert.equal(a.status, 'loading');
  assert.deepEqual(a.items, []);
});

test('a failed read is not empty either', () => {
  const a = world({ roster: [ANA], availSynced: false, adminLoaded: false,
    adminAttempted: true, adminLoading: false }).recentActivity(NOW);
  assert.equal(a.status, 'error');
});

test('a genuinely quiet group is ready-and-empty, which is a different thing', () => {
  const a = world({ roster: [ANA] }).recentActivity(NOW);
  assert.equal(a.status, 'ready');
  assert.deepEqual(a.items, []);
  assert.equal(a.partial, false);
});

test('one source landing is reported as partial, not as the whole story', () => {
  const a = world({ roster: [ANA], resolved: { u1: answer('tue', ago(3)) },
    adminLoaded: false, adminAttempted: false }).recentActivity(NOW);
  assert.equal(a.status, 'ready');
  assert.equal(a.items.length, 1);
  assert.equal(a.partial, true);
});

test('an unanswered session produces no entry, and neither does a bare no-reply', () => {
  assert.equal(world({ roster: [ANA] }).recentActivity(NOW).items.length, 0);
  assert.equal(world({ roster: [ANA], resolved: { u1: answer('tue', ago(3), 'no-reply') } })
    .recentActivity(NOW).items.length, 0);
  // A response with NO respondedAt cannot prove when it happened.
  assert.equal(world({ roster: [ANA], resolved: { u1: { tue: { response: 'available', respondedAt: null } } } })
    .recentActivity(NOW).items.length, 0, 'undated is unprovable');
});

test('a future timestamp is refused rather than shown as the newest thing', () => {
  const future = new Date(Date.parse(NOW) + 5 * 3600e3).toISOString();
  const a = world({ roster: [ANA], resolved: { u1: answer('tue', future) } }).recentActivity(NOW);
  assert.equal(a.items.length, 0);
});

// ───────────────────────────── isolation ─────────────────────────────────────

test('a stale group read is UNKNOWN, not somebody else’s activity', () => {
  // Seniors answers still in memory while U18 is being operated.
  const w = world({ roster: [YOUTH], resolved: { u1: answer('tue', ago(2)) },
    resolvedGroup: SEN, group: U18, groupName: 'U18', adminLoaded: false, adminAttempted: false });
  assert.equal(w.currentResolvedAvailability(), null, 'a group mismatch means we do not know');
  assert.equal(w.recentActivity(NOW).status, 'loading', 'never "nothing happened"');
});

test('a never-synced read is unknown even when the map happens to hold data', () => {
  const w = world({ roster: [ANA], resolved: { u1: answer('tue', ago(2)) }, availSynced: false,
    adminLoaded: false, adminAttempted: false });
  assert.equal(w.currentResolvedAvailability(), null);
  assert.equal(w.recentActivity(NOW).status, 'loading');
});

test('another group’s player cannot appear, even with their answer in the map', () => {
  // U18 roster; the map still carries a Seniors reply under u1, stamped U18.
  const a = world({ roster: [YOUTH], resolved: { u1: answer('tue', ago(2)) },
    resolvedGroup: U18, group: U18, groupName: 'U18' }).recentActivity(NOW);
  assert.equal(a.items.length, 0, 'the walk is over THIS group’s roster, not over the map');
});

test('a membership in another group produces nothing', () => {
  const a = world({ roster: [ANA],
    members: [
      { userId: 'u1', status: 'active', playerGroupId: SEN, joinedAt: ago(20) },
      { userId: 'u9', status: 'active', playerGroupId: U18, joinedAt: ago(10) },
    ] }).recentActivity(NOW);
  assert.deepEqual(a.items.map(i => i.text), ['Ana Silva joined Seniors']);
});

test('the group filter holds even when the roster itself is broader', () => {
  // operationalPlayers() narrows to the operating group, so the roster lookup
  // usually hides a cross-group membership on its own. It does NOT always:
  // a pre-structure club returns its whole roster, and a roster read can lag a
  // group switch. The membership's own playerGroupId — the product's single
  // authority on where somebody plays — has to do the work independently.
  const a = world({ roster: [ANA, YOUTH], group: SEN, groupName: 'Seniors',
    members: [
      { userId: 'u1', status: 'active', playerGroupId: SEN, joinedAt: ago(20) },
      { userId: 'u9', status: 'active', playerGroupId: U18, joinedAt: ago(10) },
    ] }).recentActivity(NOW);
  assert.deepEqual(a.items.map(i => i.text), ['Ana Silva joined Seniors'],
    'the U18 player is on the roster here and STILL must not appear');
});

test('a member of this group who is not on its roster produces nothing', () => {
  // A forged or cross-club membership naming an unknown user resolves to nobody.
  const a = world({ roster: [ANA],
    members: [{ userId: 'u-other-club', status: 'active', playerGroupId: SEN, joinedAt: ago(5) }],
    profiles: [{ userId: 'u-other-club', detailsUpdatedAt: ago(5) }] }).recentActivity(NOW);
  assert.equal(a.items.length, 0, 'the roster is the gate, not the incoming record');
});

test('a pending (non-active) membership is not activity', () => {
  const a = world({ roster: [ANA],
    members: [{ userId: 'u1', status: 'pending', playerGroupId: SEN, joinedAt: ago(5) }] }).recentActivity(NOW);
  assert.equal(a.items.length, 0);
});

// ───────────────────────────── identity ──────────────────────────────────────

test('a renamed player keeps their history and is shown under their NEW name', () => {
  const before = world({ roster: [ANA], resolved: { u1: answer('tue', ago(15)) } }).recentActivity(NOW);
  const renamed = { ...ANA, name: 'Ana Marie Silva-Fernandes' };
  const after = world({ roster: [renamed], resolved: { u1: answer('tue', ago(15)) } }).recentActivity(NOW);
  assert.equal(before.items.length, 1);
  assert.equal(after.items.length, 1, 'the entry survives the rename');
  assert.equal(after.items[0].text, 'Ana Marie Silva-Fernandes replied to Tuesday training');
  assert.equal(after.items[0].key, before.items[0].key, 'same durable key either side of the rename');
  assert.match(before.items[0].key, /^id:u1:/, 'keyed by the canonical identity');
});

test('two players sharing a display name stay separate entries', () => {
  const twinA = { id: 'pA', name: 'Sam Jones', userId: 'uA' };
  const twinB = { id: 'pB', name: 'Sam Jones', userId: 'uB' };
  const a = world({ roster: [twinA, twinB],
    resolved: { uA: answer('tue', ago(4)), uB: answer('tue', ago(6)) } }).recentActivity(NOW);
  assert.equal(a.items.length, 2);
  assert.equal(new Set(a.items.map(i => i.key)).size, 2, 'never merged by name');
});

// ───────────────────────────── privacy ───────────────────────────────────────

test('no entry carries a reason, a message body or anything medical', () => {
  const a = world({ roster: [ANA],
    resolved: { u1: { tue: { response: 'unavailable', reason: 'hospital appointment — knee surgery', respondedAt: ago(9) } } },
  }).recentActivity(NOW);
  const blob = JSON.stringify(a);
  assert.equal(a.items.length, 1);
  assert.ok(!/hospital|surgery|knee/i.test(blob), 'the stated reason is private');
  assert.ok(!/unavailable|available|injured/i.test(a.items[0].text), 'the ANSWER itself is not broadcast');
  assert.equal(a.items[0].text, 'Ana Silva replied to Tuesday training');
});

test('the activity model exposes only what it needs to render', () => {
  const a = world({ roster: [ANA], resolved: { u1: answer('tue', ago(9)) } }).recentActivity(NOW);
  // `who` was added so a player profile can filter this feed by canonical
  // identity instead of keeping a second, name-matched feed of its own.
  assert.deepEqual(Object.keys(a.items[0]).sort(), ['at', 'key', 'kind', 'ms', 'text', 'who']);
});

// ───────────────────────────── time ──────────────────────────────────────────

test('timestamps render through the product’s one convention', () => {
  const { timeAgo } = world();
  const t = m => timeAgo(new Date(Date.now() - m * 60000).toISOString());
  assert.equal(t(0.2), 'just now');
  assert.equal(t(10), '10 min ago');
  assert.equal(t(150), '2h ago');
  assert.equal(t(60 * 30), 'Yesterday');
  assert.equal(t(60 * 24 * 3), '3 days ago');
  assert.match(t(60 * 24 * 30), /\d+ \w{3}/, 'older than a week falls back to a date');
  assert.equal(timeAgo(''), '');
  assert.equal(timeAgo('not-a-date'), '');
});

test('there is exactly ONE relative-time helper, not a second one for activity', () => {
  assert.equal(html.split('function timeAgo(').length - 1, 1);
  assert.ok(!/_draftTimeAgo/.test(html), 'the draft-specific name is gone, its callers now share timeAgo');
});

// ───────────────────────────── the fabricated sources are gone ───────────────

const CARD = html.slice(html.indexOf('// ── 4. Recent activity'), html.indexOf('// ── 6. Messages'));

test('the card no longer reads masterFeed or the undated receipts', () => {
  assert.ok(!/masterFeed/.test(CARD), 'masterFeed has no timestamp field at all');
  assert.ok(!/getTodayReceipts/.test(CARD), 'receipts mix dated and undated facts');
  assert.match(CARD, /recentActivity\(\)/);
});

test('masterFeed still writes no timestamp — which is why it is not used here', () => {
  const add = extractFn(html, 'addMasterFeed');
  assert.match(add, /time: "Just now"/, 'a literal, not a clock');
  assert.ok(!/Date\(\)\.toISOString|at:/.test(add), 'there is no timestamp field to sort or age by');
});

test('the card distinguishes loading, error and empty in its own markup', () => {
  assert.match(CARD, /act\.status === 'loading'/);
  assert.match(CARD, /act\.status === 'error'/);
  assert.match(CARD, /Loading activity…/);
  assert.match(CARD, /Activity unavailable/);
  assert.match(CARD, /No recent activity/);
  assert.match(CARD, /not a record of a quiet week/, 'the error state says what it is NOT');
});

test('activity type is a word, never colour or glyph alone', () => {
  assert.match(CARD, /ovw-feed-what/);
  assert.match(CARD, /ACT_WHAT\[it\.kind\]/);
  assert.match(CARD, /aria-hidden="true">\$\{ACT_MARK/, 'the mark is decorative; the word carries the meaning');
});

test('the card introduces no colour of its own', () => {
  const hexes = [...CARD.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
  assert.deepEqual(hexes, [], 'tokens only — light and dark both come free');
});

test('long names wrap instead of widening the card', () => {
  const css = html.slice(html.indexOf('.ovw-feed-text'), html.indexOf('.ovw-feed-text') + 200);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /min-width: 0/);
});

test('the Overview does not refetch on every render', () => {
  const ensure = extractFn(html, 'ensureRecentActivity');
  assert.match(ensure, /_activityFetchedFor === gid\) return/, 'once per group');
  assert.match(ensure, /if \(!isCoach\(\)\) return/);
  // and it must claim the guard before the async call, or a burst of renders all fetch
  assert.ok(ensure.indexOf('_activityFetchedFor = gid;') < ensure.indexOf('refreshLiveAvailability'));
});

test('the availability read is still stamped with its group at the source', () => {
  const refresh = extractFn(html, 'refreshLiveAvailability');
  assert.match(refresh, /_resolvedAvailabilityGroup = state\.operationalGroupId \|\| '';/);
  assert.ok(refresh.indexOf('_resolvedAvailability = resolved;') < refresh.indexOf('_resolvedAvailabilityGroup ='));
});
