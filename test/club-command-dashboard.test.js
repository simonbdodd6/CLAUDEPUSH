/**
 * Overview command centre — renderClubCommandDashboard() and
 * renderOverviewQuickActions().
 *
 * Both are presentation-only: they read state and call existing helpers, and
 * mutate nothing. The harness below runs them in isolation against real
 * extracted helpers, so what these tests pin is the behaviour the browser
 * gets, not a reimplementation of it.
 *
 * The card set is: upcoming fixture · training · availability (row 1), then
 * recent activity · squad availability · messages (row 2), then quick actions.
 *
 * The load-bearing rule throughout is that nothing may be invented. Every
 * number must trace to state, an absent value must produce an empty state
 * rather than a zero dressed up as information, and no placeholder from a
 * design mock may ever reach production.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = start;
  while (i < source.length && source[i] !== '(') i++;
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === '(') parenDepth++;
    if (source[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
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
  const opener = source[i];
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : null;
  if (closer) {
    let depth = 0;
    while (i < source.length) {
      if (source[i] === opener) depth++;
      else if (source[i] === closer) { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
  } else {
    while (i < source.length && source[i] !== ';') i++;
    i++;
  }
  if (i < source.length && source[i] === ';') i++;
  return source.slice(start, i);
}

// ── Scope builder ─────────────────────────────────────────────────────────────
// Stubbed (module-level state or side effects): getTonightSessionId,
// chatUnreadTotal, getTodayReceipts, setSection, canI, esc, operationalGroups.
// Everything that decides what a NUMBER is — availability, position warnings,
// selection counts, fixture ordering and group ownership — is the real code.

function buildScope({
  players = [],
  schedule = [],
  fixtures = [],
  messages = [],
  matchCentre = {},
  masterFeed = [],
  trainingBlocks = {},
  squadSelections = [],
  fixtureAvailability = {},
  permissions = ['reports', 'publish_training', 'manage_fixtures', 'messaging', 'manage_players', 'publish_squads'],
  groups = [],
  operationalGroupId = null,
  stubTonightId = null,
  stubUnread = 0,
  stubReceipts = [],
  resolvedAvailability = {},
  // Recent activity inputs. The defaults describe a club whose reads HAVE
  // landed and where nothing has happened — so a dashboard test that says
  // nothing about activity gets the honest empty state, not a loading one.
  adminData = { members: [], profiles: [], loaded: true, loading: false, attempted: true },
  availLastSync = '2026-08-30T12:00:00.000Z',
  // '' not null: refreshLiveAvailability stamps `state.operationalGroupId || ''`,
  // so a club with no group in force stamps the empty string, and the harness
  // must match or currentResolvedAvailability() reads every scope as stale.
  resolvedAvailabilityGroup = '',
} = {}) {
  const stateObj = {
    players, schedule, fixtures, messages, matchCentre, masterFeed,
    trainingBlocks, squadSelections, fixtureAvailability, operationalGroupId,
  };

  const body =
    '"use strict";\n' +
    'const state = ' + JSON.stringify(stateObj) + ';\n' +
    'const _myPerms = ' + JSON.stringify(permissions) + ';\n' +
    'const _groups = ' + JSON.stringify(groups) + ';\n' +
    // Stubs
    'function getTonightSessionId() { return ' + JSON.stringify(stubTonightId) + '; }\n' +
    'function chatUnreadTotal() { return ' + JSON.stringify(stubUnread) + '; }\n' +
    'function getTodayReceipts() { return ' + JSON.stringify(stubReceipts) + '; }\n' +
    'function setSection() {}\n' +
    // Recent activity's real collaborators. Stubbed only where they reach the
    // NETWORK or the admin cache; the model itself is the real one, so a change
    // to what counts as activity is felt here rather than silently missed.
    'function isCoach() { return true; }\n' +
    'function ensureAdminData() {}\n' +
    'function refreshLiveAvailability() { return Promise.resolve(); }\n' +
    'function operationalGroupName() { return "Seniors"; }\n' +
    'const _adminData = ' + JSON.stringify(adminData) + ';\n' +
    'let _availLastSync = ' + JSON.stringify(availLastSync) + ';\n' +
    'let _resolvedAvailabilityGroup = ' + JSON.stringify(resolvedAvailabilityGroup) + ';\n' +
    'let _activityFetchedFor = null;\n' +
    'function operationalGroups() { return _groups; }\n' +
    'function operationalPlayers() { return state.players || []; }\n' +
    // The server-resolved availability model, exactly as loadAvailability sets it:
    // { <player identifier>: { <sessionId>: {response, reason, respondedAt} } }.
    'let _resolvedAvailability = ' + JSON.stringify(resolvedAvailability) + ';\n' +
    'function canI(perm) { return _myPerms.includes(perm); }\n' +
    'function esc(s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }\n' +
    // Real helpers — these are what turn state into the displayed numbers
    extractConst(html, 'CE_INITIAL_GROUP_ID') + '\n' +
    extractFn(html, 'fixtureBelongsToGroup') + '\n' +
    extractFn(html, 'contextFixtures') + '\n' +
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
    extractFn(html, 'fixtureAvailabilitySummary') + '\n' +
    extractConst(html, 'HOME_AWAY_LABEL') + '\n' +
    extractFn(html, 'normalizeFixture') + '\n' +
    extractFn(html, 'fixtureSortByDate') + '\n' +
    extractFn(html, 'fixtureCountdown') + '\n' +
    extractFn(html, 'fixtureHasBeenPlayed') + '\n' +
    extractFn(html, 'fixtureDisplayStatus') + '\n' +
    extractFn(html, 'fixtureTypeStyle') + '\n' +
    extractFn(html, 'selectionFindForFixture') + '\n' +
    extractFn(html, 'selectionStarterCount') + '\n' +
    extractFn(html, 'selectionBenchCount') + '\n' +
    extractFn(html, 'playerMatchKey') + '\n' +
    extractFn(html, 'availabilityWeekSessions') + '\n' +
    extractFn(html, 'currentResolvedAvailability') + '\n' +
    extractFn(html, 'timeAgo') + '\n' +
    extractConst(html, 'ACTIVITY_LIMIT') + '\n' +
    // Hoisted out of renderClubCommandDashboard so the player profile shares
    // one activity vocabulary with the Overview rather than keeping its own.
    extractConst(html, 'ACT_MARK') + '\n' +
    extractConst(html, 'ACT_WHAT') + '\n' +
    extractFn(html, 'recentActivity') + '\n' +
    extractFn(html, 'ensureRecentActivity') + '\n' +
    // The functions under test
    extractFn(html, 'overviewRoster') + '\n' +
    extractFn(html, 'overviewAvailableCount') + '\n' +
    extractFn(html, 'overviewAnswerMap') + '\n' +
    extractFn(html, 'overviewAnswerCounts') + '\n' +
    extractFn(html, 'overviewAvailabilityContext') + '\n' +
    extractFn(html, 'overviewDonutSvg') + '\n' +
    extractFn(html, 'overviewLegendRow') + '\n' +
    extractFn(html, 'renderClubCommandDashboard') + '\n' +
    extractConst(html, 'OVW_ACTION_ICON') + '\n' +
    extractFn(html, 'renderOverviewQuickActions') + '\n' +
    'return { renderClubCommandDashboard, renderOverviewQuickActions, overviewAvailabilityContext,\n' +
    '         overviewAnswerMap, overviewAvailableCount, overviewRoster };\n';

  return new Function(body)();
}

const iso = days => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/** A populated club: 6 players, a fixture next week, tonight's session. */
function fullClub(extra = {}) {
  return buildScope({
    players: [
      { id: 'p1', name: 'A One',   position: 'Hooker',     trainingTuesday: 'available' },
      { id: 'p2', name: 'B Two',   position: 'Scrum-half', trainingTuesday: 'available' },
      { id: 'p3', name: 'C Three', position: 'Fly-half',   trainingTuesday: 'maybe' },
      { id: 'p4', name: 'D Four',  position: 'Lock',       trainingTuesday: 'unavailable' },
      { id: 'p5', name: 'E Five',  position: 'Prop' },
      { id: 'p6', name: 'F Six',   position: 'Wing',       trainingTuesday: 'available' },
    ],
    schedule: [{ id: 'tue', type: 'Training', title: 'Tuesday Session', date: 'Tue 19:00', published: true }],
    fixtures: [{ id: 'fx1', opposition: 'Acton Town', date: iso(7), kickoffTime: '15:00', venue: 'Memorial Ground', type: 'League', homeAway: 'home' }],
    trainingBlocks: { tue: ['b1', 'b2'] },
    stubTonightId: 'tue',
    stubUnread: 3,
    stubReceipts: ['Tuesday Session published'],
    ...extra,
  });
}

// ── 1. Empty states ───────────────────────────────────────────────────────────

test('empty club: every card shows a real empty state, not a zero', () => {
  const out = buildScope().renderClubCommandDashboard();

  assert.ok(out.includes('No fixture scheduled'),   'fixture empty state missing');
  assert.ok(out.includes('No sessions scheduled'),  'training empty state missing');
  assert.ok(out.includes('No players yet'),         'availability empty state missing');
  assert.ok(out.includes('All caught up'),          'messages empty state missing');
  // Wording changed with the source: the card used to say "Nothing yet today"
  // over device-local receipts, and now says "No recent activity" over the
  // server-stamped feed. Same invariant — an empty state, never a zero.
  assert.ok(out.includes('No recent activity'),     'activity empty state missing');

  // An empty club must not be shown a donut of nothing.
  assert.ok(!out.includes('<svg'), 'no donut should be drawn with no responses');
  assert.ok(!/\b0%/.test(out), 'must not present 0% as if it were a reading');
});

test('empty states adapt to what the viewer may actually do', () => {
  const canAdd = buildScope({ permissions: ['manage_fixtures', 'publish_training', 'manage_players'] })
    .renderClubCommandDashboard();
  assert.match(canAdd, /Add your next match|import a season list/i);

  const readOnly = buildScope({ permissions: [] }).renderClubCommandDashboard();
  assert.ok(!/Add your next match/i.test(readOnly), 'must not invite an action the viewer cannot take');
  assert.match(readOnly, /will appear here once/i, 'read-only viewer still gets an explanation');
});

// ── 2. Real data renders ──────────────────────────────────────────────────────

test('upcoming fixture renders from real fixture data', () => {
  const out = fullClub().renderClubCommandDashboard();
  assert.ok(out.includes('vs Acton Town'),   'opposition missing');
  assert.ok(out.includes('KO 15:00'),        'kick-off missing');
  assert.ok(out.includes('Memorial Ground'), 'venue missing');
  assert.ok(out.includes('League'),          'competition type missing');
  assert.ok(out.includes('Home'),            'home/away missing');
});

test('a past fixture is never presented as upcoming', () => {
  const out = buildScope({ fixtures: [{ id: 'old', opposition: 'Old Team', date: '2020-01-01' }] })
    .renderClubCommandDashboard();
  assert.ok(out.includes('No fixture scheduled'), 'should fall back to the empty state');
  assert.ok(!out.includes('Old Team'), 'a 2020 fixture must not be shown as next');
});

test('training renders from real schedule data', () => {
  const out = fullClub().renderClubCommandDashboard();
  assert.ok(out.includes('Tuesday Session'), 'session title missing');
  assert.ok(out.includes('Tue 19:00'),       'session time missing');
  assert.ok(out.includes('2 blocks planned'), 'planned block count missing');
  assert.ok(out.includes('Published'),       'published state missing');
  assert.ok(out.includes('Tonight'),         "tonight's session should be marked as tonight");
});

test('an unpublished session reads as a draft, never as published', () => {
  const out = buildScope({
    schedule: [{ id: 'tue', type: 'Training', title: 'Session', date: 'Tue 19:00', published: false }],
    stubTonightId: 'tue',
  }).renderClubCommandDashboard();
  assert.ok(out.includes('Draft'), 'draft badge missing');
  assert.ok(!out.includes('>Published<'), 'must not claim published');
});

test('availability renders the four recorded answers from real data', () => {
  const out = fullClub().renderClubCommandDashboard();
  // 6 players: 3 available, 1 maybe, 1 unavailable, 1 never answered.
  assert.ok(out.includes('Available'),   'available row missing');
  assert.ok(out.includes('Maybe'),       'maybe row missing');
  assert.ok(out.includes('Unavailable'), 'unavailable row missing');
  assert.ok(out.includes('No reply'),    'no-reply row missing');

  const { available, maybe, unavailable, noReply, total } = fullClub().overviewAvailabilityContext();
  assert.equal(total, 6);
  assert.equal(available, 3);
  assert.equal(maybe, 1);
  assert.equal(unavailable, 1);
  assert.equal(noReply, 1);
  assert.equal(available + maybe + unavailable + noReply, total, 'the four answers must account for the whole squad');
});

test('the availability reading and the donut cannot disagree', () => {
  const scope = fullClub();
  const ctx = scope.overviewAvailabilityContext();
  const out = scope.renderClubCommandDashboard();
  // Both cards are rendered from the one context object, so the donut's
  // aria-label carries exactly the counts the legend lists.
  assert.ok(out.includes(`${ctx.available} available, ${ctx.maybe} maybe, ${ctx.unavailable} unavailable, ${ctx.noReply} no reply`),
    'donut description must match the availability reading');
});

test('messages count renders from the real unread total', () => {
  const out = fullClub().renderClubCommandDashboard();
  assert.ok(out.includes('3 new'), 'unread badge missing');
  assert.ok(out.includes('unread messages waiting'), 'unread line missing');
});

test('legacy coach messages are counted alongside chat unreads', () => {
  const out = buildScope({
    stubUnread: 2,
    messages: [{ unread: true, to: 'Coach' }, { unread: true, to: 'Coach' }, { unread: false, to: 'Coach' }],
  }).renderClubCommandDashboard();
  assert.ok(out.includes('4 new'), 'should be 2 chat + 2 legacy = 4');
});

test('no unread messages: shows all-caught-up and no count', () => {
  const out = buildScope({ messages: [], stubUnread: 0 }).renderClubCommandDashboard();
  assert.ok(out.includes('All caught up'));
  assert.ok(!/\d+ unread message/.test(out), 'must not show a count when there is none');
});

// ── 3. Recent activity is never fabricated ────────────────────────────────────

// These two used to drive the card through getTodayReceipts() and masterFeed.
// Both were dropped as SOURCES because neither can carry a date — masterFeed has
// no timestamp field at all (it writes the literal "Just now") and receipts mix
// dated facts with undated ones. The INVARIANTS they protected are unchanged and
// asserted below over the real source: a real event renders, and nothing is ever
// padded. They are stronger now, because the event has to prove when it happened.
test('recent activity renders real, server-stamped events', () => {
  const out = buildScope({
    players: [{ id: 'p1', name: 'Ana Silva', userId: 'u1' }],
    schedule: [{ id: 'tue', type: 'Training', title: 'Tuesday Session', date: 'Tue 19:00',
                 published: true, publishedAt: new Date(Date.now() - 90 * 60000).toISOString() }],
    resolvedAvailability: { u1: { tue: { response: 'available', reason: '',
                 respondedAt: new Date(Date.now() - 12 * 60000).toISOString() } } },
  }).renderClubCommandDashboard();
  assert.ok(out.includes('Ana Silva replied to Tuesday Session'), 'the availability reply renders');
  assert.ok(out.includes('Tuesday Session published'),            'the publication renders');
  assert.ok(out.includes('12 min ago'), 'and each carries its own real elapsed time');
  assert.ok(out.includes('1h ago'));
  assert.ok(!out.includes('Just now'), 'no fabricated timestamp survives');
});

test('recent activity is never padded to fill the card', () => {
  const one = buildScope({
    schedule: [{ id: 'tue', type: 'Training', title: 'Only thing that happened',
                 published: true, publishedAt: new Date(Date.now() - 60000).toISOString() }],
  }).renderClubCommandDashboard();
  assert.equal((one.match(/ovw-feed-item/g) || []).length, 1, 'one real event must render as exactly one row');

  const none = buildScope().renderClubCommandDashboard();
  assert.ok(none.includes('No recent activity'), 'no events must produce the empty state');
  assert.equal((none.match(/ovw-feed-item/g) || []).length, 0);
});

test('an unloaded club shows loading, never the empty state', () => {
  // The distinction the old card could not make: nothing known yet is not the
  // same as nothing happened, and must never render as a quiet week.
  const out = buildScope({ availLastSync: null,
    adminData: { members: [], profiles: [], loaded: false, loading: true, attempted: true },
  }).renderClubCommandDashboard();
  assert.ok(out.includes('Loading activity…'));
  assert.ok(!out.includes('No recent activity'));
});

// ── 4. Nothing invented, nothing broken ───────────────────────────────────────

test('no undefined, null or NaN reaches the page in any state', () => {
  const scopes = [
    buildScope(),
    fullClub(),
    buildScope({ players: [{ id: 'p1' }] }),
    buildScope({ fixtures: [{ id: 'f' }] }),                                   // fixture with no fields at all
    buildScope({ fixtures: [{ id: 'f', opposition: 'X', date: iso(3) }], squadSelections: [{ id: 's', fixtureId: 'f', status: 'draft' }] }),
    buildScope({ schedule: [{ id: 'tue' }], stubTonightId: 'tue' }),           // session with no title or date
    buildScope({ players: [{ id: 'p1', lifecycleStatus: 'archived' }] }),      // whole roster archived
    buildScope({ masterFeed: [{}], stubReceipts: [''] }),                      // empty feed entries
  ];
  for (const [i, scope] of scopes.entries()) {
    const out = scope.renderClubCommandDashboard();
    for (const bad of ['undefined', 'NaN', 'null']) {
      assert.ok(!out.includes(bad), `scope ${i}: "${bad}" reached the page`);
    }
    assert.ok(!/\bNaN%|undefined%/.test(out), `scope ${i}: broken percentage`);
  }
});

test('percentages are only shown when there is something to divide by', () => {
  const out = buildScope({ players: [] }).renderClubCommandDashboard();
  assert.ok(!/%/.test(out.replace(/width:\s*\d+%/g, '')), 'no percentage may be quoted for an empty squad');
});

test('a whole-roster-archived club is treated as having no players', () => {
  const ctx = buildScope({
    players: [{ id: 'p1', lifecycleStatus: 'archived' }, { id: 'p2', _archived: true }],
    schedule: [{ id: 'tue', type: 'Training', title: 'S', date: 'Tue 19:00' }],
    stubTonightId: 'tue',
  }).overviewAvailabilityContext();
  assert.equal(ctx.kind, 'none');
  assert.equal(ctx.total, 0);
});

test('no placeholder from a design mock is present in the shipped markup', () => {
  const out = fullClub().renderClubCommandDashboard() + fullClub().renderOverviewQuickActions();
  for (const invented of ['Northfield', 'Ashcombe', 'Riverside Field', 'Attack Patterns',
                          '23 available', '3 maybe', '2 unavailable', 'Lorem', 'placeholder']) {
    assert.ok(!out.includes(invented), `mock data "${invented}" reached production`);
  }
});

test('the command centre advertises no plan, tier or upgrade', () => {
  const out = fullClub().renderClubCommandDashboard();
  for (const banned of [/Upgrade to Pro/i, /Trial Remaining/i, /Manage billing/i,
                        /all features unlocked/i, /upgradeFromFeature|settingsUpgradeToPro/]) {
    assert.ok(!banned.test(out), `must not contain ${banned}`);
  }
});

// ── 5. Squad selection state is reported, not invented ────────────────────────

test('squad state reflects the real selection record', () => {
  const fx = { id: 'fx1', opposition: 'Acton Town', date: iso(5) };
  const none = buildScope({ fixtures: [fx] }).renderClubCommandDashboard();
  assert.ok(none.includes('No squad selected'), 'absent selection must say so');

  const draft = buildScope({ fixtures: [fx], squadSelections: [{ id: 's1', fixtureId: 'fx1', status: 'draft', starters: { 'Hooker': 'p1' }, bench: ['p2'] }] })
    .renderClubCommandDashboard();
  assert.ok(draft.includes('Draft squad'), 'draft state missing');

  const pub = buildScope({ fixtures: [fx], squadSelections: [{ id: 's1', fixtureId: 'fx1', status: 'published', starters: { 'Hooker': 'p1' }, bench: ['p2'] }] })
    .renderClubCommandDashboard();
  assert.ok(pub.includes('Squad published'), 'published state missing');
  assert.ok(!pub.includes('Draft squad'), 'published squad must not also read as draft');
});

// ── 6. Quick actions — existing actions only, correctly gated ─────────────────

test('quick actions route to existing handlers only', () => {
  const out = fullClub().renderOverviewQuickActions();
  assert.ok(out.includes('sendAvailabilityNow()'),        'availability request action missing');
  assert.ok(out.includes("setSection('coach','training')"), 'training action missing');
  assert.ok(out.includes('fixtureAddOpen()'),             'add fixture action missing');
  assert.ok(out.includes("setSection('coach','messages')"), 'message action missing');
  // Every handler named here must actually exist in the app.
  for (const fn of ['sendAvailabilityNow', 'fixtureAddOpen', 'fixtureImportOpen', 'setSection']) {
    assert.ok(html.includes('function ' + fn + '('), `quick action calls ${fn}, which does not exist`);
  }
});

test('the season importers keep an entry point', () => {
  // These were previously reachable only from the fixtures card the command
  // centre replaced. The file type is fixed when the modal opens, so both
  // kinds must be offered or Excel import becomes unreachable.
  const out = fullClub().renderOverviewQuickActions();
  assert.ok(out.includes("fixtureImportOpen('csv')"),  'CSV import lost its entry point');
  assert.ok(out.includes("fixtureImportOpen('xlsx')"), 'Excel import lost its entry point');
});

test('quick actions are gated on the same permission as the screen they lead to', () => {
  const cases = [
    ['reports',          'sendAvailabilityNow()'],
    ['publish_training', "setSection('coach','training')"],
    ['manage_fixtures',  'fixtureAddOpen()'],
    ['messaging',        "setSection('coach','messages')"],
  ];
  for (const [perm, handler] of cases) {
    const withPerm = buildScope({ permissions: [perm] }).renderOverviewQuickActions();
    assert.ok(withPerm.includes(handler), `${perm} should offer ${handler}`);

    const without = buildScope({ permissions: cases.map(c => c[0]).filter(p => p !== perm) })
      .renderOverviewQuickActions();
    assert.ok(!without.includes(handler), `${handler} must be withheld without ${perm}`);
  }
});

test('a member with no permissions is offered no actions at all', () => {
  assert.equal(buildScope({ permissions: [] }).renderOverviewQuickActions(), '');
});

// ── 7. Group (team) switching ─────────────────────────────────────────────────

test('switching group changes the fixture the Overview reports', () => {
  const groups = [{ id: 'grp_initial', name: 'Seniors' }, { id: 'grp_u18', name: 'U18' }];
  const fixtures = [
    { id: 'f1', opposition: 'Seniors Opponent', date: iso(4), groupId: 'grp_initial' },
    { id: 'f2', opposition: 'U18 Opponent',     date: iso(4), groupId: 'grp_u18' },
  ];
  const seniors = buildScope({ groups, fixtures, operationalGroupId: 'grp_initial' }).renderClubCommandDashboard();
  assert.ok(seniors.includes('Seniors Opponent'), 'Seniors fixture missing in Seniors context');
  assert.ok(!seniors.includes('U18 Opponent'),    'U18 fixture leaked into Seniors Overview');

  const u18 = buildScope({ groups, fixtures, operationalGroupId: 'grp_u18' }).renderClubCommandDashboard();
  assert.ok(u18.includes('U18 Opponent'),      'U18 fixture missing in U18 context');
  assert.ok(!u18.includes('Seniors Opponent'), 'Seniors fixture leaked into U18 Overview');
});

test('a group with no fixtures of its own shows the empty state, not another group\'s match', () => {
  const out = buildScope({
    groups: [{ id: 'grp_initial', name: 'Seniors' }, { id: 'grp_women', name: "Women's" }],
    fixtures: [{ id: 'f1', opposition: 'Seniors Opponent', date: iso(4), groupId: 'grp_initial' }],
    operationalGroupId: 'grp_women',
  }).renderClubCommandDashboard();
  assert.ok(out.includes('No fixture scheduled'));
  assert.ok(!out.includes('Seniors Opponent'));
});

// ── 8. Layout contract ────────────────────────────────────────────────────────

test('the command centre renders the seven blocks in the intended order', () => {
  const out = fullClub().renderClubCommandDashboard();
  const order = ['Upcoming fixture', 'Training', 'Availability',
                 'Recent activity', 'Squad availability', 'Messages'];
  let cursor = -1;
  for (const label of order) {
    const at = out.indexOf('>' + label + '<');
    assert.ok(at > -1, `card "${label}" is missing`);
    assert.ok(at > cursor, `card "${label}" is out of order`);
    cursor = at;
  }
  assert.equal((out.match(/class="ovw-row"/g) || []).length, 2, 'expected exactly two card rows');
  assert.ok(fullClub().renderOverviewQuickActions().includes('Quick actions'), 'quick actions block missing');
});

test('every card is reachable by keyboard, and links to the screen that owns it', () => {
  const out = fullClub().renderClubCommandDashboard();
  const links = out.match(/class="ovw-card is-link"[^>]*/g) || [];
  assert.ok(links.length >= 5, 'expected the linked cards to be interactive');
  for (const l of links) {
    assert.ok(l.includes('role="button"'), 'a clickable card must be announced as a button');
    assert.ok(l.includes('tabindex="0"'),  'a clickable card must be focusable');
    assert.ok(l.includes('onkeydown'),     'a clickable card must respond to Enter/Space');
    assert.ok(l.includes('aria-label='),   'a clickable card must be labelled');
  }
});

test('the layout cannot scroll sideways on a phone', () => {
  // Every grid track is minmax(0, 1fr): a 1fr track sizes to its content and a
  // long opponent name would widen it, pushing the page sideways.
  const css = html.slice(html.indexOf('OVERVIEW COMMAND CENTRE'), html.indexOf('AVAILABILITY — large session cards'));
  assert.ok(css.includes('.ovw-row { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); }'),
    'card row must use minmax(0,1fr) tracks');
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.ovw-row\s*{\s*grid-template-columns: minmax\(0, 1fr\)/,
    'cards must stack to a single column on a phone');
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*\.ovw-row\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    'cards must fall to two columns on a tablet');
  assert.ok(css.includes('overflow-wrap: anywhere'), 'long unbroken names must wrap inside the card');
  assert.ok(css.includes('min-width: 0'), 'cards must be allowed to shrink below their content width');
  // Quick actions must stay thumb-sized rather than shrinking to fit.
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.ovw-action\s*{\s*min-height: 52px/,
    'quick actions must stay tappable on a phone');
});

test('the command centre reuses the shared status palette', () => {
  const out = fullClub().renderClubCommandDashboard();
  for (const token of ['var(--status-available)', 'var(--status-maybe)',
                       'var(--status-unavailable)', 'var(--status-noreply)']) {
    assert.ok(out.includes(token), `${token} should come from the shared palette`);
  }
  // No new hard-coded availability colours — those would drift from the rest
  // of the app the first time the palette changes.
  assert.ok(!/#10b981|#fbbf24|#f87171/.test(out), 'availability colours must not be hard-coded');
});

// ── 9. Visual refinement — the reference's lessons, pinned ────────────────────

test('availability is read as three figures, not scanned down a list', () => {
  const out = fullClub().renderClubCommandDashboard();
  const stats = out.match(/<div class="ovw-stat">/g) || [];
  assert.equal(stats.length, 3, 'expected Available / Maybe / Unavailable side by side');
  for (const label of ['Available', 'Maybe', 'Unavailable']) {
    assert.match(out, new RegExp('<b[^>]*>\\d+</b><span>' + label + '</span>'),
      `${label} must show its count above its word`);
  }
  // The fourth answer is real but secondary — it belongs in the footer, not
  // as a fourth column competing with the three that need acting on.
  assert.match(out, /still to reply|Everyone has replied|position warning/,
    'no-reply / warning state must still be reported');
});

test('the donut carries the squad total it is drawn from', () => {
  const scope = fullClub();
  const ctx = scope.overviewAvailabilityContext();
  const out = scope.renderClubCommandDashboard();
  assert.match(out, new RegExp('>' + ctx.total + '</text>'), 'donut centre must show the real total');
  assert.ok(out.includes('>Squad</text>'), 'and say what the total counts');
  // The legend beside it lists every answer, so the ring is never the only
  // way to read the numbers.
  assert.ok((out.match(/class="ovw-leg"/g) || []).length >= 3, 'donut needs its legend');
});

test('an empty squad draws no donut and quotes no total', () => {
  const out = buildScope().renderClubCommandDashboard();
  assert.ok(!out.includes('<svg'), 'no ring for a club with no answers');
  assert.ok(!out.includes('</text>'), 'and no figure in the middle of one');
});

test('gold is used once per card at most, and never as decoration', () => {
  const out = fullClub().renderClubCommandDashboard();
  const rules = (out.match(/class="ovw-accent-rule"/g) || []).length;
  assert.ok(rules <= 1, `accent rule used ${rules} times — it marks a subject, it does not decorate`);
  // Card surfaces and borders stay on the neutral tokens.
  assert.ok(!/class="ovw-card[^"]*"[^>]*style="[^"]*--accent/.test(out),
    'cards must not be re-skinned in the brand colour');
});

test('quick actions are one strip, labelled and titled, not a grid of tiles', () => {
  const out = fullClub().renderOverviewQuickActions();
  assert.ok(out.includes('ovw-actions-card'), 'actions belong in a single container');
  assert.equal((out.match(/class="ovw-actions"/g) || []).length, 1, 'exactly one strip');
  const buttons = out.match(/class="ovw-action"/g) || [];
  assert.equal(buttons.length, 6, 'every permitted action is offered');
  // Each keeps an explanation without spending a line on it.
  assert.equal((out.match(/title="/g) || []).length, buttons.length, 'each action explains itself on hover');
  assert.equal((out.match(/ovw-action-icon/g) || []).length, buttons.length, 'each action carries its icon');
  assert.ok(out.includes('aria-hidden="true"'), 'icons are decorative and hidden from screen readers');
});

test('a linked card advertises that it opens something', () => {
  const out = fullClub().renderClubCommandDashboard();
  // Recent activity is the one card that leads nowhere, so it must NOT.
  const cards = out.split('class="ovw-card');
  const activity = cards.find(c => c.includes('>Recent activity<'));
  assert.ok(activity && !activity.slice(0, 400).includes('ovw-open'),
    'a card that opens nothing must not pretend otherwise');
  assert.ok(out.includes('ovw-open'), 'linked cards need an affordance');
});

// ── 9. A squad that has not answered yet ──────────────────────────────────────
// "0 Available · 0 Maybe · 0 Unavailable · 0 of 57 replied · 0%" is
// arithmetically true and reads as a broken placeholder — that is exactly how
// this card was reported from a live club. A real squad with no answers gets a
// sentence, not a row of zeroes.

test('a squad with no answers yet is told so, not shown zeroes', () => {
  const out = buildScope({
    players: Array.from({ length: 57 }, (_, i) => ({ id: 'p' + i, name: 'P ' + i })),
    fixtures: [{ id: 'fx1', opposition: 'Acton Town', date: iso(6) }],
  }).renderClubCommandDashboard();

  assert.ok(out.includes('No responses yet'), 'the zero-reply state must be stated');
  assert.match(out, /none of the 57 players have replied/,
    'the real squad size is still reported — it is a known number');
  assert.ok(!/0 of 57 replied/.test(out), 'must not present the placeholder reading');
  assert.ok(!/>0<\/b><span>Available/.test(out), 'must not draw three zeroes as a reading');
  assert.ok(!out.includes('<svg'), 'no donut may be drawn from nothing');
});

test('one answer is enough to switch from the sentence to the figures', () => {
  const players = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, name: 'P ' + i }));
  const out = buildScope({
    players,
    fixtures: [{ id: 'fx1', opposition: 'Acton Town', date: iso(6) }],
    resolvedAvailability: { p0: { fx1: { response: 'available', respondedAt: '2026-08-27T10:00:00.000Z' } } },
  }).renderClubCommandDashboard();

  assert.ok(!out.includes('No responses yet'), 'there IS a response now');
  assert.ok(out.includes('<svg'), 'the donut is drawn once there is something to draw');
  assert.match(out, /1 of 10 replied/);
  assert.match(out, /<span>Available<\/span>[\s\S]*?<b>1</, 'the one answer is shown as one');
});

test('the availability figures come from the resolved answers, not the device fields', () => {
  // The live defect: answers arrive through the server and the local player
  // records stay blank, so a card reading p[sessionKey(id)] showed nothing.
  const players = Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, name: 'P ' + i }));
  const av = buildScope({
    players,
    schedule: [{ id: 'tue', type: 'Training', title: 'Tuesday Session' }],
    stubTonightId: 'tue',
    resolvedAvailability: {
      p0: { tue: { response: 'available',   respondedAt: '2026-08-27T10:00:00.000Z' } },
      p1: { tue: { response: 'available',   respondedAt: '2026-08-27T10:00:00.000Z' } },
      p2: { tue: { response: 'maybe',       respondedAt: '2026-08-27T10:00:00.000Z' } },
      p3: { tue: { response: 'unavailable', respondedAt: '2026-08-27T10:00:00.000Z' } },
    },
  }).overviewAvailabilityContext();

  assert.deepEqual(
    { available: av.available, maybe: av.maybe, unavailable: av.unavailable, noReply: av.noReply },
    { available: 2, maybe: 1, unavailable: 1, noReply: 2 });
});

test('the card header shows no percentage when there is no percentage to show', () => {
  const out = buildScope({
    players: Array.from({ length: 57 }, (_, i) => ({ id: 'p' + i, name: 'P ' + i })),
    schedule: [{ id: 'tue', type: 'Training', title: 'Tuesday Session' }],
    stubTonightId: 'tue',
  }).renderClubCommandDashboard();

  assert.ok(out.includes('No responses yet'));
  assert.ok(!/>0%</.test(out), '0% beside "No responses yet" reads as a broken card');
});
