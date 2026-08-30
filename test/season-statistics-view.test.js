/**
 * SEASON PLAYER STATISTICS — the coach-facing view.
 *
 * The aggregation itself (who appeared, how many minutes, which fixture counts
 * as played) is proven in season-player-stats.test.js and is NOT re-proven
 * here. This suite is about the screen: which players it lists, which group it
 * belongs to, what it says before the data has landed, and whether the figure a
 * coach reads in the table is the same figure they read on the player's profile
 * one tap later.
 *
 * TWO DEFECTS ARE PINNED HERE, both of which made the view unsafe to build on:
 *
 *   1. _seasonSheets holds whichever group was last read, and every consumer
 *      refetched only when it was null. Switching Seniors → U18 therefore left
 *      Seniors' figures on screen under U18, permanently. currentSeasonSheets()
 *      makes a group mismatch read as unknown.
 *
 *   2. The player profile carried a second "Season statistics" card whose
 *      Matches / Starts / Bench / Minutes were a hardcoded literal of zeros. It
 *      sat directly under the real Appearances card, and the season table drills
 *      into that page — the two would have contradicted each other on sight.
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
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
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
  throw new Error('function ' + name + ' — no closing brace');
}
const extractConst = (src, n) => { const i = src.indexOf('    const ' + n + ' '); return src.slice(i, src.indexOf(';', i) + 1); };

// ── The club ────────────────────────────────────────────────────────────────
const SEN = 'grp_seniors';
const U18 = 'grp_u18';

const PLAYERS = [
  { id: 'p1', name: 'Starter Finish', userId: 'u1', position: 'Lock'      },
  { id: 'p2', name: 'Starter Off',    userId: 'u2', position: 'Fly half'  },
  { id: 'p3', name: 'Bench Unused',   userId: 'u3', position: 'Prop'      },
  { id: 'p4', name: 'Bench On',       userId: 'u4', position: 'Wing'      },
  { id: 'p5', name: 'Never Selected', userId: 'u5', position: 'Hooker'    },
  { id: 'p6', name: 'Youth Starter',  userId: 'u6', position: 'Centre'    },
  { id: 'p7', name: 'Left In March',  userId: 'u7', position: 'Flanker', lifecycleStatus: 'archived' },
  { id: 'p8', name: 'Archived Idle',  userId: 'u8', position: 'Prop',    lifecycleStatus: 'archived' },
];

const MEMBERS = [
  { userId: 'u1', status: 'active', playerGroupId: SEN },
  { userId: 'u2', status: 'active', playerGroupId: SEN },
  { userId: 'u3', status: 'active', playerGroupId: SEN },
  { userId: 'u4', status: 'active', playerGroupId: SEN },
  { userId: 'u5', status: 'active', playerGroupId: SEN },
  { userId: 'u6', status: 'active', playerGroupId: U18 },
  { userId: 'u7', status: 'active', playerGroupId: SEN },
  { userId: 'u8', status: 'active', playerGroupId: SEN },
];

/** A Seniors match: two starters, two on the bench, one replacement comes on at 60'. */
const SENIORS_SHEET = {
  fixtureId: 'fx_sen_1',
  formationNames: { '1': 'Starter Finish', '2': 'Starter Off', '3': 'Left In March' },
  benchPlayers: ['Bench Unused', 'Bench On'],
  formationKeys: { '1': 'id:u1', '2': 'id:u2', '3': 'id:u7' },
  benchKeys: ['id:u3', 'id:u4'],
  substitutions: [{ minute: 60, offKey: 'id:u2', onKey: 'id:u4', at: '2026-03-01T15:00:00Z' }],
  matchMinutes: 80,
};

const U18_SHEET = {
  fixtureId: 'fx_u18_1',
  formationNames: { '1': 'Youth Starter' },
  benchPlayers: [],
  formationKeys: { '1': 'id:u6' },
  benchKeys: [],
  substitutions: [],
  matchMinutes: 70,
};

const SEASON_BY_GROUP = {
  [SEN]: { ok: true, sheets: [SENIORS_SHEET], playedFixtures: 2, fixturesWithoutSheet: 1 },
  [U18]: { ok: true, sheets: [U18_SHEET],     playedFixtures: 1, fixturesWithoutSheet: 0 },
};

/**
 * The harness runs the REAL functions out of index.html. Only three things are
 * stood in for, each of them orthogonal to what is under test:
 *
 *   · canonicalVisiblePlayers — roster de-duplication, proven elsewhere and
 *     identity-preserving for distinct rows. A source assertion below pins that
 *     operationalPlayers still asks it, so the stub cannot hide a change.
 *   · fetch                   — answers the season resource per group, exactly
 *     as the server does, so the group plumbing is genuinely exercised.
 *   · document                — a minimal shim for the live search filter.
 */
function scope(opts = {}) {
  const perms = opts.perms || ['publish_squads', 'manage_players', 'manage_teams'];
  const calls = [];
  const env = new Function('CALLS', 'SEASON', 'PLAYERS', 'MEMBERS', `
    "use strict";
    const state = {
      players: ${JSON.stringify(opts.players || PLAYERS)},
      users: [],
      operationalGroupId: ${JSON.stringify(opts.group === undefined ? SEN : opts.group)},
    };
    const _adminData = { members: MEMBERS, loaded: ${opts.adminLoaded === false ? 'false' : 'true'}, structureAccess: null };
    const _myOperational = { staff: { groups: [
      { id: ${JSON.stringify(SEN)}, name: 'Seniors' }, { id: ${JSON.stringify(U18)}, name: 'U18' }] } };
    const _PERMS = ${JSON.stringify(perms)};
    let _seasonSheets = null, _seasonSheetsGroup = null, _seasonSheetsLoading = false;
    let _membersView = 'squad', _seasonSort = 'minutes', _seasonSortDir = 'desc', _seasonQuery = '';
    let _renders = 0, _ensured = 0;
    let _toast = '';
    let _rendered = '';
    let _failNext = ${opts.failFetch ? 'true' : 'false'};

    function canI(p) { return _PERMS.includes(p); }
    function operationalCapacity() { return 'staff'; }
    function ensureAdminData() { _ensured++; }
    function showToast(m) { _toast = m; return undefined; }
    function render() { _renders++; }
    function canonicalVisiblePlayers() { return state.players; }
    function playerOpenDetail(id) { CALLS.push(['playerOpenDetail', id]); }
    async function fetch(url) {
      CALLS.push(['fetch', url]);
      if (_failNext) return { ok: false, status: 500, json: async () => ({}) };
      const g = (String(url).match(/[?&]group=([^&]*)/) || [])[1] || '';
      const body = SEASON[decodeURIComponent(g)] || { ok: true, sheets: [], playedFixtures: 0, fixturesWithoutSheet: 0 };
      return { ok: true, status: 200, json: async () => body };
    }

    // ── a DOM just large enough for the live search filter ──────────────────
    let _emptyEl = null, _rows = [];
    const document = {
      querySelectorAll(sel) { return _rows; },
      getElementById(id) { return id === 'season-search-empty' ? _emptyEl : null; },
    };
    function mountRows(markup) {
      _rows = [...markup.matchAll(/<tr class="season-row"[^>]*?data-name="([^"]*)"[^>]*?data-pos="([^"]*)"/g)]
        .map(m => ({ _n: m[1], _p: m[2], style: {}, getAttribute(a) { return a === 'data-name' ? this._n : this._p; } }));
      _emptyEl = { style: { display: 'none' } };
      return _rows;
    }

    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractConst(html, '_AVATAR_COLORS')}
    ${extractFn(html, 'esc')}
    ${extractFn(html, 'playerAvatarColor')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'findPlayerByName')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'fixtureHasBeenPlayed')}
    ${extractFn(html, 'seasonPlayerStats')}
    ${extractFn(html, 'seasonTableRows')}
    ${extractFn(html, 'seasonSortRows')}
    ${extractFn(html, 'seasonRowMatches')}
    ${extractFn(html, 'loadSeasonSheets')}
    ${extractFn(html, 'currentSeasonSheets')}
    ${extractFn(html, 'clubUsesPlayerGroups')}
    ${extractFn(html, 'playerGroupIdOf')}
    ${extractFn(html, 'operationalPlayers')}
    ${extractFn(html, 'operationalGroups')}
    ${extractFn(html, 'operationalGroupName')}
    ${extractFn(html, 'membersViewTabs')}
    ${extractFn(html, 'setMembersView')}
    ${extractFn(html, 'seasonStatsSort')}
    ${extractFn(html, 'seasonApplySearch')}
    ${extractFn(html, 'seasonSearchInput')}
    ${extractFn(html, 'seasonStatsHtml')}
    // renderPlayers is the whole Members screen; the season branch is exercised
    // through seasonStatsHtml, and the branch itself is pinned by source below.
    function renderPlayers() { _rendered = seasonStatsHtml(); mountRows(_rendered); seasonApplySearch(); }

    return {
      state, seasonTableRows, seasonSortRows, seasonRowMatches, seasonPlayerStats,
      operationalPlayers, currentSeasonSheets, loadSeasonSheets, seasonStatsHtml,
      membersViewTabs, setMembersView, seasonStatsSort, seasonSearchInput, seasonApplySearch,
      renderPlayers, playerMatchKey,
      setGroup: g => { state.operationalGroupId = g; },
      failFetch: v => { _failNext = v; },
      rows: () => _rows,
      emptyEl: () => _emptyEl,
      peek: () => ({ sheets: _seasonSheets, group: _seasonSheetsGroup, renders: _renders,
                     ensured: _ensured, toast: _toast, view: _membersView,
                     sort: _seasonSort, dir: _seasonSortDir, query: _seasonQuery }),
    };
  `)(calls, SEASON_BY_GROUP, opts.players || PLAYERS, opts.members || MEMBERS);
  env.calls = calls;
  return env;
}

/** Load the season for the group in force and return the rendered table. */
async function renderFor(s) {
  s.currentSeasonSheets();                 // kicks the read off
  await new Promise(r => setImmediate(r)); // let the stubbed fetch settle
  return s.seasonStatsHtml();
}

const textOf = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
/** The figures on one player's row, in column order: apps, starts, bench, subs, minutes, time. */
function rowFigures(markup, name) {
  const i = markup.indexOf(`data-name="${name.toLowerCase()}"`);
  assert.notEqual(i, -1, `${name} is not on the table`);
  const end = markup.indexOf('</tr>', i);
  const cells = [...markup.slice(i, end).matchAll(/data-label="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)];
  return Object.fromEntries(cells.map(m => [m[1], textOf(m[2])]));
}

// ═══ 1 · THE JOIN ═══════════════════════════════════════════════════════════

test('the table joins on the canonical identity, never on the name', () => {
  const s = scope();
  const stats = s.seasonPlayerStats([SENIORS_SHEET]);
  const { rows } = s.seasonTableRows(s.operationalPlayers(), stats);
  const finish = rows.find(r => r.name === 'Starter Finish');
  assert.equal(finish.key, 'id:u1', 'the row carries the durable key');
  assert.equal(finish.appearances, 1);

  // Rename the player. The sheet still names the old text; the key is unchanged.
  const renamed = scope({ players: PLAYERS.map(p => p.id === 'p1' ? { ...p, name: 'Totally New Name' } : p) });
  const stats2 = renamed.seasonPlayerStats([SENIORS_SHEET]);
  const row2 = renamed.seasonTableRows(renamed.operationalPlayers(), stats2)
    .rows.find(r => r.name === 'Totally New Name');
  assert.equal(row2.appearances, 1, 'a rename does not orphan the row');
  assert.equal(row2.minutes, 80);
});

test('the join never re-counts: it only reads what the aggregation returned', () => {
  const src = extractFn(html, 'seasonTableRows');
  assert.ok(!/substitutions|matchMinutes|fixtureId/.test(src),
    'it never looks at a match — seasonPlayerStats is the one aggregation');
  assert.ok(!/\+=|Math\.(min|max|round)/.test(src), 'and it does no arithmetic of its own');
  assert.match(src, /playerMatchKey\(p\)/, 'it joins on the canonical identity');
  assert.match(src, /\.\.\.\(mine \|\| \{\}\)/, 'the figures are copied straight out of the aggregation');
});

test('a starter: one appearance, one start, the whole match', async () => {
  const f = rowFigures(await renderFor(scope()), 'starter finish');
  assert.equal(f.Apps, '1'); assert.equal(f.Starts, '1');
  assert.equal(f.Bench, '0'); assert.equal(f.Minutes, '80′');
});

test('a bench player who never came on: bench 1, apps 0, minutes 0', async () => {
  const f = rowFigures(await renderFor(scope()), 'bench unused');
  assert.equal(f.Bench, '1'); assert.equal(f.Apps, '0');
  assert.equal(f.Starts, '0'); assert.equal(f.Minutes, '0′');
});

test('a replacement who came on: apps 1, bench 1, minutes from that minute to full time', async () => {
  const f = rowFigures(await renderFor(scope()), 'bench on');
  assert.equal(f.Apps, '1'); assert.equal(f.Bench, '1'); assert.equal(f.Starts, '0');
  assert.equal(f.Minutes, '20′', '60th minute of an 80-minute match');
  assert.equal(f.Subs, '1↑ 0↓');
});

test('a starter taken off is credited to that minute, and the substitution is kept', async () => {
  const f = rowFigures(await renderFor(scope()), 'starter off');
  assert.equal(f.Minutes, '60′');
  assert.equal(f.Subs, '0↑ 1↓', 'substitutions on and off are retained, not thrown away');
  assert.equal(f.Time, '75%', '60 of 80');
});

test('a 70-minute match is measured against 70, not 80', async () => {
  const s = scope({ group: U18 });
  const f = rowFigures(await renderFor(s), 'youth starter');
  assert.equal(f.Minutes, '70′');
  assert.equal(f.Time, '100%', 'a full 70-minute match is 100%, not 87%');
});

test('a squad player never named on a sheet is an honest zero, once the data has landed', async () => {
  const markup = await renderFor(scope());
  const f = rowFigures(markup, 'never selected');
  assert.deepEqual(f, { Apps: '0', Starts: '0', Bench: '0', Subs: '0↑ 0↓', Minutes: '0′', Time: '0%' });
});

test('an archived player who PLAYED is kept; an archived player who did not is not listed', async () => {
  const markup = await renderFor(scope());
  assert.ok(markup.includes('data-name="left in march"'), 'they played three-quarters of a season, they are not erased');
  assert.ok(!markup.includes('data-name="archived idle"'), 'an archived player with no season is not squad noise');
  assert.match(markup.slice(markup.indexOf('data-name="left in march"')), /^[\s\S]{0,900}Archived/, 'and they are labelled');
});

// ═══ 2 · GROUP SCOPE AND ISOLATION ══════════════════════════════════════════

test('the table lists the operating group only', async () => {
  const markup = await renderFor(scope());
  assert.ok(markup.includes('data-name="starter finish"'), 'Seniors are listed');
  assert.ok(!markup.includes('data-name="youth starter"'), 'the U18 player is not');
});

test('no Seniors figure reaches U18, and none of U18 reaches Seniors', async () => {
  const sen = await renderFor(scope({ group: SEN }));
  const u18 = await renderFor(scope({ group: U18 }));
  ['starter finish', 'starter off', 'bench on', 'never selected'].forEach(n =>
    assert.ok(!u18.includes(`data-name="${n}"`), `${n} must not appear under U18`));
  assert.ok(!sen.includes('data-name="youth starter"'), 'and the U18 player must not appear under Seniors');
  assert.ok(u18.includes('data-name="youth starter"'), 'U18 sees its own');
});

test('the season read is asked for the group in force', async () => {
  const s = scope({ group: U18 });
  await renderFor(s);
  const urls = s.calls.filter(c => c[0] === 'fetch').map(c => c[1]);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /resource=season-sheets/);
  assert.match(urls[0], new RegExp('group=' + U18), 'the group travels with the read');
});

test('switching group swaps the whole table, and switching back restores it', async () => {
  const s = scope({ group: SEN });
  const first = await renderFor(s);
  assert.ok(first.includes('data-name="starter finish"'));

  s.setGroup(U18);
  const second = await renderFor(s);
  assert.ok(second.includes('data-name="youth starter"'), 'U18 arrived');
  assert.ok(!second.includes('data-name="starter finish"'), 'and Seniors left');

  s.setGroup(SEN);
  const third = await renderFor(s);
  assert.ok(third.includes('data-name="starter finish"'), 'Seniors came back');
  assert.ok(!third.includes('data-name="youth starter"'));
});

test('DEFECT: the moment the group changes, the old season reads as unknown — not as the new group\'s', async () => {
  const s = scope({ group: SEN });
  await renderFor(s);
  assert.equal(s.peek().group, SEN);

  s.setGroup(U18);
  // Synchronously, before any read can land: it must NOT hand back Seniors.
  assert.equal(s.currentSeasonSheets(), null, 'a mismatched cache is unknown, never reused');
  const during = s.seasonStatsHtml();
  assert.ok(!during.includes('data-name="starter finish"'), 'no Seniors row is painted under U18');
  assert.match(textOf(during), /Loading this season/, 'it says it does not know yet');
});

test('an in-flight read for the outgoing group cannot stamp itself onto the incoming one', async () => {
  const s = scope({ group: SEN });
  s.currentSeasonSheets();          // Seniors read starts
  s.setGroup(U18);                  // switch while it is still in flight
  await new Promise(r => setImmediate(r));
  // The Seniors read has now landed and stamped itself SEN.
  assert.equal(s.peek().group, SEN);
  assert.equal(s.currentSeasonSheets(), null, 'still unknown for U18');
  await new Promise(r => setImmediate(r));
  const markup = s.seasonStatsHtml();
  assert.ok(markup.includes('data-name="youth starter"'), 'and it self-heals to the right group');
  assert.ok(!markup.includes('data-name="starter finish"'));
});

test('operationalPlayers is still the one player population', () => {
  const src = extractFn(html, 'seasonStatsHtml');
  assert.match(src, /operationalPlayers\(\)/, 'the table reads the same roster Members and Match Centre do');
  assert.ok(!/state\.players/.test(src), 'never the club-wide roster');
  assert.match(extractFn(html, 'operationalPlayers'), /canonicalVisiblePlayers\(\)/);
});

// ═══ 3 · LOADING, EMPTY, ERROR — never a fabricated zero ════════════════════

test('before the read lands it says loading, and prints no zero', () => {
  const s = scope();
  const markup = s.seasonStatsHtml();
  assert.match(textOf(markup), /Loading this season/);
  assert.ok(!/data-label="Apps"/.test(markup), 'no table, so no zeros');
  assert.ok(!/>0</.test(markup), 'and nothing that reads as a calculated zero');
});

test('a failed read is unknown, not an empty season', async () => {
  const s = scope({ failFetch: true });
  await renderFor(s);
  const markup = s.seasonStatsHtml();
  assert.equal(s.peek().sheets, null, 'a 500 leaves the season unknown');
  assert.match(textOf(markup), /Loading this season/);
  assert.ok(!/data-label="Apps"/.test(markup), 'a server failure never becomes 0 appearances');
});

test('a thrown read is unknown too', async () => {
  const src = extractFn(html, 'loadSeasonSheets');
  assert.match(src, /catch \{ _seasonSheets = null; \}/);
  assert.match(src, /if \(!res\.ok\) \{ _seasonSheets = null; return; \}/);
});

test('while the membership list is still loading, the roster is unknown — not empty', async () => {
  const s = scope({ adminLoaded: false });
  await renderFor(s);
  const markup = s.seasonStatsHtml();
  assert.match(textOf(markup), /Loading the squad/);
  assert.ok(!/data-label="Apps"/.test(markup), 'operationalPlayers fails closed; the screen must not read that as nobody');
  assert.ok(s.peek().ensured > 0, 'and it asks for the data it is waiting on');
});

test('a season with no published sheets says so, and says how many matches were played', async () => {
  const s = scope({ group: 'grp_empty' });
  const markup = await renderFor(s);
  const t = textOf(markup);
  assert.match(t, /No completed team-sheet data yet/);
  assert.ok(!/data-label="Apps"/.test(markup), 'no invented rows of zeros');
});

test('a group with players but no season data still refuses to print zeros', () => {
  const s = scope();
  const markup = s.seasonStatsHtml();      // read has not landed
  assert.ok(!markup.includes('Never Selected'), 'a real squad member is not shown at 0 before the data exists');
});

// ═══ 4 · COVERAGE — missing sheets are visible ══════════════════════════════

test('played matches with no published team sheet are reported, not hidden', async () => {
  const t = textOf(await renderFor(scope()));
  assert.match(t, /2 matches played/);
  assert.match(t, /1 team sheet counted/);
  assert.match(t, /1 played match has no published team sheet/);
  assert.match(t, /those minutes are not counted here/);
});

test('a fully covered season raises no missing-sheet warning', async () => {
  const t = textOf(await renderFor(scope({ group: U18 })));
  assert.match(t, /1 match played/);
  assert.ok(!/no published team sheet/.test(t));
});

test('a name on a sheet that matches no player record is reported, never credited to anyone', async () => {
  const ghost = { ...SENIORS_SHEET, formationNames: { ...SENIORS_SHEET.formationNames, '4': 'Nobody At All' },
                  formationKeys: { ...SENIORS_SHEET.formationKeys } };
  const s = scope();
  const stats = s.seasonPlayerStats([ghost]);
  assert.deepEqual(stats.unresolved, ['Nobody At All']);
  const { rows, offSquad } = s.seasonTableRows(s.operationalPlayers(), stats);
  assert.ok(!rows.some(r => r.name === 'Nobody At All'), 'it is not invented as a squad member');
  assert.equal(offSquad, 0, 'and it is not double-reported as a departed player');
});

test('a player who has left the squad is counted as missing coverage, not silently dropped', () => {
  const s = scope({ members: MEMBERS.filter(m => m.userId !== 'u2') });
  const stats = s.seasonPlayerStats([SENIORS_SHEET]);
  const { rows, offSquad } = s.seasonTableRows(
    s.operationalPlayers().filter(p => p.id !== 'p2'), stats);
  assert.ok(!rows.some(r => r.name === 'Starter Off'));
  assert.equal(offSquad, 1, 'the coach is told the table is not the whole story');
});

// ═══ 5 · SORTING ════════════════════════════════════════════════════════════

const NUMS = [
  { name: 'Alpha',  appearances: 1, starts: 0, benchAppearances: 1, minutes: 10, playingTimePct: 12 },
  { name: 'Bravo',  appearances: 3, starts: 3, benchAppearances: 0, minutes: 240, playingTimePct: 100 },
  { name: 'Charlie', appearances: 3, starts: 1, benchAppearances: 2, minutes: 90, playingTimePct: 37 },
  { name: 'Delta',  appearances: 0, starts: 0, benchAppearances: 0, minutes: 0,  playingTimePct: 0 },
];
const order = (s, k, d) => s.seasonSortRows(NUMS, k, d).map(r => r.name);

test('minutes descending is the default order', async () => {
  const s = scope();
  assert.deepEqual(order(s, 'minutes', 'desc'), ['Bravo', 'Charlie', 'Alpha', 'Delta']);
  const markup = await renderFor(s);
  const seq = [...markup.matchAll(/data-name="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(seq, ['left in march', 'starter finish', 'starter off', 'bench on', 'bench unused', 'never selected'],
    '80, 80, 60, 20, 0, 0 — highest minutes first, and the two on 80 break by name');
});

test('appearances and starts sort, and ties fall back to the name so the order is stable', s => {
  const sc = scope();
  assert.deepEqual(order(sc, 'appearances', 'desc'), ['Bravo', 'Charlie', 'Alpha', 'Delta']);
  assert.deepEqual(order(sc, 'starts', 'desc'), ['Bravo', 'Charlie', 'Alpha', 'Delta']);
  assert.deepEqual(order(sc, 'bench', 'desc'), ['Charlie', 'Alpha', 'Bravo', 'Delta'],
    'Bravo and Delta both have 0 bench, and B sorts before D');
  assert.deepEqual(order(sc, 'pct', 'desc'), ['Bravo', 'Charlie', 'Alpha', 'Delta']);
  assert.deepEqual(order(sc, 'name', 'asc'), ['Alpha', 'Bravo', 'Charlie', 'Delta']);
});

test('ascending really is ascending', () => {
  const s = scope();
  assert.deepEqual(order(s, 'minutes', 'asc'), ['Delta', 'Alpha', 'Charlie', 'Bravo']);
  assert.deepEqual(order(s, 'name', 'desc'), ['Delta', 'Charlie', 'Bravo', 'Alpha']);
});

test('sorting does not mutate the rows it was given', () => {
  const s = scope();
  const before = NUMS.map(r => r.name);
  s.seasonSortRows(NUMS, 'minutes', 'desc');
  assert.deepEqual(NUMS.map(r => r.name), before);
});

test('changing the sort re-renders in the new order, and an unknown key falls back to minutes', async () => {
  const s = scope();
  await renderFor(s);
  s.seasonStatsSort('starts');
  assert.equal(s.peek().sort, 'starts');
  assert.equal(s.peek().dir, 'desc');
  s.seasonStatsSort('name');
  assert.equal(s.peek().dir, 'asc', 'names read A→Z');
  s.seasonStatsSort(';drop table');
  assert.equal(s.peek().sort, 'minutes', 'anything unrecognised falls back, never injected');
});

// ═══ 6 · SEARCH ═════════════════════════════════════════════════════════════

test('search matches on name and on position, with every term required', () => {
  const s = scope();
  assert.equal(s.seasonRowMatches('Starter Finish', 'Lock', 'star'), true);
  assert.equal(s.seasonRowMatches('Starter Finish', 'Lock', 'lock'), true, 'position too');
  assert.equal(s.seasonRowMatches('Starter Finish', 'Lock', 'STARTER'), true, 'case-insensitive');
  assert.equal(s.seasonRowMatches('Starter Finish', 'Lock', 'starter lock'), true, 'both terms');
  assert.equal(s.seasonRowMatches('Starter Finish', 'Lock', 'starter prop'), false, 'AND, not OR');
  assert.equal(s.seasonRowMatches('Starter Finish', 'Lock', ''), true, 'empty shows everyone');
  assert.equal(s.seasonRowMatches('Starter Finish', 'Lock', '   '), true);
});

test('typing hides the rows that do not match and shows the empty message when none do', async () => {
  const s = scope();
  await renderFor(s);
  s.renderPlayers();

  s.seasonSearchInput('bench');
  const visible = s.rows().filter(r => r.style.display !== 'none').map(r => r._n);
  assert.deepEqual(visible.sort(), ['bench on', 'bench unused']);
  assert.equal(s.emptyEl().style.display, 'none');

  s.seasonSearchInput('nobody here');
  assert.equal(s.rows().every(r => r.style.display === 'none'), true);
  assert.equal(s.emptyEl().style.display, '', 'the "no players match" message appears');

  s.seasonSearchInput('');
  assert.equal(s.rows().every(r => r.style.display === ''), true, 'clearing restores everyone');
});

test('searching filters in place — it never re-renders the list under the caret', () => {
  const src = extractFn(html, 'seasonSearchInput');
  assert.ok(!/render/i.test(src), 'a re-render here would lose the caret mid-word');
  assert.match(src, /seasonApplySearch\(\)/);
});

test('a search survives a re-render caused by the season read landing', async () => {
  const s = scope();
  await renderFor(s);
  s.renderPlayers();
  s.seasonSearchInput('bench');
  s.renderPlayers();                       // as loadSeasonSheets' render() would
  const visible = s.rows().filter(r => r.style.display !== 'none').map(r => r._n);
  assert.deepEqual(visible.sort(), ['bench on', 'bench unused'], 'still filtered');
  assert.match(s.seasonStatsHtml(), /value="bench"/, 'and the box still shows what was typed');
});

test('the search field is a flex item that cannot be squeezed by a long list', () => {
  const src = extractFn(html, 'seasonStatsHtml');
  assert.match(src, /class="members-search-bar" style="flex:1 1 220px;min-width:0"/,
    'its own basis plus min-width:0 — it wraps to a new line before it would shrink');
  assert.match(html, /\.season-toolbar \{ display: flex; gap: 8px; align-items: center; flex-wrap: wrap; \}/);
  assert.match(html, /\.members-search-input \{ width: 100%; box-sizing: border-box;/,
    'and it still fills whatever width it is given');
});

// ═══ 7 · DRILL-DOWN ═════════════════════════════════════════════════════════

test('tapping a player opens the EXISTING member profile route', async () => {
  const markup = await renderFor(scope());
  assert.match(markup, /onclick="playerOpenDetail\('p1'\)"/, 'the same handler the Members list uses');
  assert.ok(!/setSection\(/.test(markup), 'no second player page, no new route');
  assert.match(markup, /role="button" tabindex="0"/, 'and it is reachable by keyboard');
});

test('the row carries the roster id the profile is keyed by', async () => {
  const markup = await renderFor(scope());
  PLAYERS.filter(p => p.id !== 'p6' && p.id !== 'p8').forEach(p =>
    assert.ok(markup.includes(`playerOpenDetail('${p.id}')`), `${p.name} opens their own profile`));
});

test('the profile reads the very same aggregation, so the two can never disagree', () => {
  const card = html.slice(html.indexOf('<!-- APPEARANCES CARD'), html.indexOf('<!-- APPEARANCES CARD') + 3000);
  assert.match(card, /currentSeasonSheets\(\)/, 'same group-aware source as the table');
  assert.match(card, /seasonPlayerStats\(season\.sheets\)/, 'same aggregation');
  assert.match(card, /playerMatchKey\(p\)/, 'same identity');
  assert.match(extractFn(html, 'seasonStatsHtml'), /seasonPlayerStats\(season\.sheets\)/);
});

test('the table figure and the profile figure are the same number', () => {
  const s = scope();
  const stats = s.seasonPlayerStats([SENIORS_SHEET]);
  const row = s.seasonTableRows(s.operationalPlayers(), stats).rows.find(r => r.name === 'Bench On');
  const profile = stats.byPlayer[s.playerMatchKey(PLAYERS.find(p => p.id === 'p4'))];
  ['appearances', 'starts', 'benchAppearances', 'minutes', 'subsOn', 'subsOff', 'playingTimePct']
    .forEach(k => assert.equal(row[k], profile[k], `${k} agrees`));
});

// ═══ 8 · THE FABRICATED PROFILE CARD ════════════════════════════════════════

test('DEFECT: the profile no longer prints a second season card of hardcoded zeros', () => {
  assert.ok(!/stats: \{ matches: 0, starts: 0, bench: 0, minutes: 0/.test(html),
    'the literal that produced them is gone');
  assert.ok(!/\$\{statCard\(m\.stats\./.test(html), 'and so is every reading of it');
  assert.ok(!/Match statistics tracking is coming soon/.test(html));
  assert.ok(!/m\.stats/.test(html), 'nothing else was left pointing at it');
});

test('the real Appearances card is untouched and still shows the tracked figures', () => {
  const card = html.slice(html.indexOf('<!-- APPEARANCES CARD'), html.indexOf('<!-- APPEARANCES CARD') + 3500);
  ['Starts', 'Bench', 'Minutes', 'Playing time', 'Recorded total'].forEach(l =>
    assert.ok(card.includes(`'${l}'`), `${l} still on the profile`));
  assert.match(card, /Appearances/);
});

// ═══ 9 · PERMISSION AND ENTITLEMENT ═════════════════════════════════════════

test('without squad-publishing access there is no tab, no route and no data', async () => {
  const s = scope({ perms: ['manage_players'] });
  assert.equal(s.membersViewTabs('squad'), '', 'the tab is not offered');
  s.setMembersView('season');
  assert.equal(s.peek().view, 'squad', 'and the route refuses it — hiding the entry is not the gate');
  assert.match(s.peek().toast, /squad-publishing access/);

  s.currentSeasonSheets();
  await new Promise(r => setImmediate(r));
  assert.equal(s.calls.filter(c => c[0] === 'fetch').length, 0, 'and the client never asks the server');
  assert.match(textOf(s.seasonStatsHtml()), /need squad-publishing access/);
});

test('a denied read settles instead of retrying for ever', async () => {
  const s = scope({ perms: ['manage_players'] });
  for (let i = 0; i < 3; i++) { s.currentSeasonSheets(); await new Promise(r => setImmediate(r)); }
  assert.equal(s.peek().group, SEN, 'the denial is stamped with the group, so it is answered once');
  assert.equal(s.peek().sheets.denied, true);
});

test('the season branch of Members is itself gated', () => {
  const rp = extractFn(html, 'renderPlayers');
  assert.match(rp, /_membersView === 'season' && canI\('publish_squads'\)/,
    'a revoked permission closes the view, not only the tab');
  assert.match(extractFn(html, 'setMembersView'), /canI\('publish_squads'\)/);
  assert.match(extractFn(html, 'membersViewTabs'), /canI\('publish_squads'\)/);
});

test('the server gate on the season resource is unchanged', async () => {
  const api = await readFile(join(__dirname, '..', 'api', 'publish.js'), 'utf8');
  const h = api.slice(api.indexOf('async function seasonSheetsHandler'), api.indexOf('// ── Appearance adjustments'));
  assert.match(h, /requireTenantPermission\(req, PERM\.PUBLISH_SQUADS\)/);
  assert.match(h, /assertOperationalGroup\(session, structure, requested, \{ as: 'staff' \}\)/);
  assert.match(h, /req\.method !== 'GET'/, 'still read-only');
  assert.match(h, /loadClubStructure\(session\.teamId\)/, 'the club still comes from the session');
});

// ═══ 10 · NAVIGATION, APPEARANCE, MOBILE ════════════════════════════════════

test('no new top-level navigation entry was created', () => {
  const nav = extractConst(html, 'BETA_NAV_IDS');
  assert.equal(nav, `    const BETA_NAV_IDS = ["overview", "message", "training", "tactics", "performance", "matchday", "messages", "players", "medical", "settings"];`);
  const sections = html.slice(html.indexOf('const coachSections = ['), html.indexOf('const BETA_SIMPLE_NAV'));
  assert.ok(!/season/i.test(sections), 'season statistics is a view of Members, not a section');
  assert.ok(!/season/i.test(extractConst(html, 'SECTION_PERM_MAP')));
});

test('the view toggle reuses the segmented control the member detail already uses', () => {
  const src = extractFn(html, 'membersViewTabs');
  assert.match(src, /border-radius:9px/);
  assert.match(src, /var\(--panel-2\)/);
  assert.ok(!/#[0-9a-f]{6}/i.test(src), 'no hardcoded colour — tokens only, so both appearances work');
});

test('the table introduces no colour of its own — tokens only', () => {
  const src = extractFn(html, 'seasonStatsHtml');
  const hexes = [...src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
  assert.deepEqual([...new Set(hexes)], ['#fff'], 'only the white on an avatar initial; everything else is a token');
});

test('playing time is rendered as plainly as the profile renders it', () => {
  const src = extractFn(html, 'seasonStatsHtml');
  assert.match(src, /data-label="Time"[^>]*font-weight:700">\$\{r\.playingTimePct\}%/,
    'no colour ramp: a squad player on 30% is not failing at anything');
  // The profile's coloured percentages are the ATTENDANCE ones. Playing time is
  // deliberately not among them, and the table must not disagree.
  const card = html.slice(html.indexOf('<!-- APPEARANCES CARD'), html.indexOf('<!-- APPEARANCES CARD') + 3000);
  assert.match(card, /mine\.playingTimePct \+ '%' : '—', 'Playing time', 'var\(--fg\)'/,
    'the profile renders playing time plain too');
});

test('the light appearance layer is not bypassed', () => {
  // Season rows are .player-db-table rows, so they inherit the existing light
  // overrides rather than needing a new ones.
  assert.match(html, /html:not\(\[data-theme="dark"\]\) \.player-db-table tbody td/);
  const src = extractFn(html, 'seasonStatsHtml');
  assert.match(src, /class="player-db-table"/, 'the table is the existing component');
  assert.match(src, /class="card"/);
});

test('mobile: the table collapses to the Members scan-list pattern and cannot overflow', () => {
  assert.match(html, /\.season-row \{[\s\S]*?display: flex !important;/, 'rows become cards ≤768px');
  assert.match(html, /\.srow-mmeta \{ display: none; \}/, 'the meta line is mobile-only');
  assert.match(html, /\.season-row \.srow-mmeta \{ display: block !important;/);
  // The 660px table only ever scrolls inside its own container, never the page.
  const src = extractFn(html, 'seasonStatsHtml');
  const i = src.indexOf('min-width:660px');
  assert.notEqual(i, -1);
  assert.match(src.slice(Math.max(0, i - 260), i), /overflow-x:auto/,
    'the wide table is wrapped in its own scroller');
  assert.match(html, /\.cs-table, \.training-gs-table, \.player-db-table, table\[style\*="min-width"\] \{ min-width: 0 !important; \}/,
    'and the min-width is dropped outright on small screens');
});

test('the mobile card keeps the information the columns carried', async () => {
  const markup = await renderFor(scope());
  assert.match(markup, /class="srow-mmeta">1 app · 1 start · 0 bench</, 'apps/starts/bench move into the meta line');
  assert.match(markup, /data-label="Minutes"/);
  assert.match(markup, /data-label="Time"/);
  assert.match(html, /\.season-row td\[data-label="Minutes"\],\s*\n\s*\.season-row td\[data-label="Time"\] \{ display: block !important;/,
    'and minutes + playing time stay visible on the phone');
});

// ═══ 11 · NOTHING ELSE MOVED ════════════════════════════════════════════════

test('the aggregation, the identity and the server read are untouched', () => {
  for (const name of ['seasonPlayerStats', 'appearancesCalculated', 'playerMatchKey', 'mcPersonKey',
                      'operationalPlayers', 'playerGroupIdOf', 'fixtureHasBeenPlayed',
                      'sheetPersonKeys', 'matchMinutesByPerson', 'membersFilterRows']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
  const stats = extractFn(html, 'seasonPlayerStats');
  assert.ok(!/state\.players|fetch\(/.test(stats), 'the aggregation is still pure');
  assert.match(extractFn(html, 'loadSeasonSheets'), /resource=season-sheets/);
});

test('the Members squad list still works exactly as it did', () => {
  const rp = extractFn(html, 'renderPlayers');
  assert.match(rp, /const allMembers = operationalPlayers\(\);/);
  assert.match(rp, /membersFilterRows\(this\.value\)/);
  assert.match(rp, /class="member-row"/);
  assert.match(rp, /renderUnassignedPlayersCard\(\)/);
  assert.match(rp, /\$\{membersViewTabs\('squad'\)\}/, 'and it now offers the season view');
});
