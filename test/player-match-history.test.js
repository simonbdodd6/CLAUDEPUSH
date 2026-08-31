/**
 * PLAYER PROFILE — LAST MATCH PLAYED.
 *
 * The profile's old "Last match played" row was hardcoded to the empty string
 * and could only ever read "No record yet"; it was removed for having no
 * trustworthy source. The source exists now: published team sheets carry durable
 * player keys, the season read is club- and group-scoped and season-bounded, and
 * seasonPlayerStats() already decides who actually PLAYED.
 *
 * So nothing new decides anything. The single aggregation now records WHICH
 * fixtures each appearance came from, using the very same `played` test that
 * produces the appearance count — so the count and the list cannot disagree.
 *
 * PLAYED means: started, or came on through a recorded substitution. Being named
 * on the bench and never entering is not playing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

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

const ROSTER = [
  { id: 'p1', name: 'Original Name', userId: 'u1' },
  { id: 'p2', name: 'Bench Unused',  userId: 'u2' },
  { id: 'p3', name: 'Came On',       userId: 'u3' },
  { id: 'p4', name: 'Sam Jones',     userId: 'u4' },
  { id: 'p5', name: 'Sam Jones',     userId: 'u5' },   // SAME NAME, different person
];

function scope(players = ROSTER) {
  return new Function('players', `
    "use strict";
    const state = { players };
    function findPlayerByName(n) { const w = String(n || '').trim().toLowerCase();
      return state.players.find(p => String(p.name || '').trim().toLowerCase() === w) || null; }
    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'matchDateLabel')}
    ${extractFn(html, 'seasonPlayerStats')}
    return { seasonPlayerStats, playerMatchKey, matchDateLabel };
  `)(players);
}

/** A published sheet exactly as the season read returns one. */
const sheet = (o) => ({
  fixtureId: o.id, date: o.date, opposition: o.opp || 'Kituro',
  matchMinutes: o.minutes || 80,
  formationNames: o.starters || {}, formationKeys: o.starterKeys || {},
  benchPlayers: o.bench || [],      benchKeys: o.benchKeys || [],
  substitutions: o.subs || [],
});

const S = new Set();
const lastOf = (stats, key) => (stats.byPlayer[key] || {}).playedMatches || [];

// ───────────────────────── who counts as having played ──────────────────────

test('a starter has played', () => {
  const s = scope();
  const st = s.seasonPlayerStats([sheet({ id: 'f1', date: '2026-08-10',
    starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' } })]);
  const m = lastOf(st, 'id:u1');
  assert.equal(m.length, 1);
  assert.deepEqual({ fixtureId: m[0].fixtureId, date: m[0].date, role: m[0].role },
    { fixtureId: 'f1', date: '2026-08-10', role: 'starter' });
  assert.equal(st.byPlayer['id:u1'].appearances, 1, 'and the count agrees');
});

test('an UNUSED substitute has not played', () => {
  const s = scope();
  const st = s.seasonPlayerStats([sheet({ id: 'f1', date: '2026-08-10',
    starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' },
    bench: ['Bench Unused'], benchKeys: ['id:u2'] })]);
  assert.deepEqual(lastOf(st, 'id:u2'), [], 'named on the bench is not playing');
  assert.equal(st.byPlayer['id:u2'].appearances, 0);
  assert.equal(st.byPlayer['id:u2'].benchAppearances, 1, 'they WERE on the bench');
});

test('the card says when an appearance came off the bench', () => {
  const i = html.indexOf('<!-- LAST MATCH');
  const card = html.slice(i, html.indexOf('<details>', i));
  assert.match(card, /last\.role === 'bench' \? ' · came off the bench' : ''/,
    'a substitute appearance must not read as a start');
});

test('a substitute who enters HAS played, and is marked as such', () => {
  const s = scope();
  const st = s.seasonPlayerStats([sheet({ id: 'f1', date: '2026-08-10',
    starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' },
    bench: ['Came On'], benchKeys: ['id:u3'],
    subs: [{ minute: 60, offKey: 'id:u1', onKey: 'id:u3', at: 'a' }] })]);
  const m = lastOf(st, 'id:u3');
  assert.equal(m.length, 1);
  assert.equal(m[0].role, 'bench', 'so the card can say "came off the bench"');
  assert.equal(st.byPlayer['id:u3'].appearances, 1);
  // and the player they replaced still played
  assert.equal(lastOf(st, 'id:u1').length, 1);
});

test('the list and the appearance count can never disagree', () => {
  const s = scope();
  const st = s.seasonPlayerStats([
    sheet({ id: 'f1', date: '2026-08-01', starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' },
            bench: ['Bench Unused', 'Came On'], benchKeys: ['id:u2', 'id:u3'],
            subs: [{ minute: 50, offKey: 'id:u1', onKey: 'id:u3', at: 'a' }] }),
    sheet({ id: 'f2', date: '2026-08-08', starters: { '1': 'Bench Unused' }, starterKeys: { '1': 'id:u2' } }),
  ]);
  for (const key of ['id:u1', 'id:u2', 'id:u3']) {
    assert.equal(lastOf(st, key).length, st.byPlayer[key].appearances,
      key + ': one entry per counted appearance');
  }
});

// ───────────────────────── which one is "last" ──────────────────────────────

test('the most recent match is first, whatever order the sheets arrive in', () => {
  const s = scope();
  const mk = order => s.seasonPlayerStats(order.map(d =>
    sheet({ id: 'fx' + d, date: d, opp: 'Team ' + d,
            starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' } })));
  const dates = ['2026-08-01', '2026-08-22', '2026-08-15'];
  const fwd = lastOf(mk(dates), 'id:u1').map(m => m.date);
  const rev = lastOf(mk([...dates].reverse()), 'id:u1').map(m => m.date);
  assert.deepEqual(fwd, ['2026-08-22', '2026-08-15', '2026-08-01']);
  assert.deepEqual(fwd, rev, 'sheet order must not decide which match is last');
});

test('two fixtures on the SAME DAY tie-break deterministically', () => {
  const s = scope();
  const mk = ids => s.seasonPlayerStats(ids.map(id =>
    sheet({ id, date: '2026-08-15', starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' } })));
  const a = lastOf(mk(['fxA', 'fxB']), 'id:u1').map(m => m.fixtureId);
  const b = lastOf(mk(['fxB', 'fxA']), 'id:u1').map(m => m.fixtureId);
  assert.deepEqual(a, b, 'a fixture carries a date, not a time — the tie must not float');
  assert.deepEqual(a, ['fxA', 'fxB']);
});

test('one fixture published as two side sheets counts once', () => {
  const s = scope();
  const st = s.seasonPlayerStats([
    sheet({ id: 'f1', date: '2026-08-10', starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' } }),
    sheet({ id: 'f1', date: '2026-08-10', starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' } }),
  ]);
  assert.equal(lastOf(st, 'id:u1').length, 1);
});

// ───────────────────────── identity ─────────────────────────────────────────

test('a rename keeps both matches on one player', () => {
  // Published under the old name, then renamed, then published under the new.
  const renamed = [{ id: 'p1', name: 'Updated Name', userId: 'u1' }, ...ROSTER.slice(1)];
  const st = scope(renamed).seasonPlayerStats([
    sheet({ id: 'f1', date: '2026-08-01', starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' } }),
    sheet({ id: 'f2', date: '2026-08-08', starters: { '1': 'Updated Name' },  starterKeys: { '1': 'id:u1' } }),
  ]);
  const m = lastOf(st, 'id:u1');
  assert.equal(m.length, 2, 'the rename does not split the history');
  assert.equal(m[0].fixtureId, 'f2', 'and the newest is still first');
  assert.equal(st.unresolved.length, 0);
});

test('two players sharing a display name never share a match history', () => {
  const st = scope().seasonPlayerStats([
    sheet({ id: 'f1', date: '2026-08-01', starters: { '1': 'Sam Jones' }, starterKeys: { '1': 'id:u4' } }),
    sheet({ id: 'f2', date: '2026-08-08', starters: { '1': 'Sam Jones' }, starterKeys: { '1': 'id:u5' } }),
  ]);
  assert.deepEqual(lastOf(st, 'id:u4').map(m => m.fixtureId), ['f1']);
  assert.deepEqual(lastOf(st, 'id:u5').map(m => m.fixtureId), ['f2']);
});

test('a legacy sheet with no keys still resolves by name — safely', () => {
  const st = scope().seasonPlayerStats([
    sheet({ id: 'f1', date: '2026-08-01', starters: { '1': 'Original Name' } }),   // no keys
  ]);
  assert.deepEqual(lastOf(st, 'id:u1').map(m => m.fixtureId), ['f1']);
});

test('an unresolvable legacy name is credited to NOBODY', () => {
  const st = scope().seasonPlayerStats([
    sheet({ id: 'f1', date: '2026-08-01', starters: { '1': 'Ghost Player' } }),
  ]);
  assert.deepEqual(st.unresolved, ['Ghost Player']);
  for (const p of ROSTER) assert.deepEqual(lastOf(st, 'id:' + p.userId), [], p.name + ' gains nothing');
  // the unresolved name keeps its own bucket rather than joining a real player
  assert.ok(Object.keys(st.byPlayer).some(k => k.startsWith('nm:')));
});

// ───────────────────────── dates ────────────────────────────────────────────

test('a fixture date renders on the right day in every timezone', () => {
  const { matchDateLabel } = scope();
  assert.equal(matchDateLabel('2026-08-24'), '24 Aug');
  assert.equal(matchDateLabel('2026-01-01'), '1 Jan');
  assert.equal(matchDateLabel('2026-12-31'), '31 Dec');
});

test('WEST of UTC, a match does not slip to the previous day', () => {
  // The bug the midday parse exists to prevent, and it is invisible from a
  // machine east of UTC: new Date('2026-08-24') is UTC MIDNIGHT, which in Los
  // Angeles is 17:00 on the 23rd — so a Saturday match would read "23 Aug" for
  // every coach in the Americas. Run in a child process because a timezone can
  // only be chosen before the runtime starts.
  const src = extractFn(html, 'matchDateLabel');
  const out = execFileSync(process.execPath, ['-e',
    `${src}\nprocess.stdout.write([matchDateLabel('2026-08-24'), matchDateLabel('2026-01-01')].join('|'));`],
    { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' });
  assert.equal(out, '24 Aug|1 Jan', 'the stored day is the day shown, wherever the club is');
});

test('a missing or malformed date yields no label, never a wrong one', () => {
  const { matchDateLabel } = scope();
  for (const bad of ['', null, undefined, 'soon', '2026-13-45', '24/08/2026']) {
    assert.equal(matchDateLabel(bad), '', JSON.stringify(bad));
  }
});

test('a sheet with no date still records the appearance', () => {
  const st = scope().seasonPlayerStats([
    sheet({ id: 'f1', date: '', starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' } })]);
  assert.equal(lastOf(st, 'id:u1').length, 1, 'the match happened even if the date is missing');
  assert.equal(lastOf(st, 'id:u1')[0].date, '');
});

// ───────────────────────── one system, not two ──────────────────────────────

test('the profile and Season Statistics give one player one answer', () => {
  // Both surfaces read seasonPlayerStats over the same sheets: Season stats via
  // seasonTableRows (a JOIN, no arithmetic of its own), the profile straight
  // from byPlayer. They agree by construction, and this pins it.
  const rows = new Function('players', `
    "use strict";
    const state = { players };
    function findPlayerByName(n) { const w = String(n || '').trim().toLowerCase();
      return state.players.find(p => String(p.name || '').trim().toLowerCase() === w) || null; }
    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'seasonPlayerStats')}
    ${extractFn(html, 'seasonTableRows')}
    return { seasonPlayerStats, seasonTableRows, playerMatchKey };
  `)(ROSTER);

  const sheets = [
    sheet({ id: 'f1', date: '2026-08-01', starters: { '1': 'Original Name' }, starterKeys: { '1': 'id:u1' },
            bench: ['Bench Unused', 'Came On'], benchKeys: ['id:u2', 'id:u3'],
            subs: [{ minute: 55, offKey: 'id:u1', onKey: 'id:u3', at: 'a' }] }),
    sheet({ id: 'f2', date: '2026-08-08', starters: { '1': 'Came On' }, starterKeys: { '1': 'id:u3' } }),
  ];
  const stats = rows.seasonPlayerStats(sheets);
  const table = rows.seasonTableRows(ROSTER, stats);

  for (const p of ROSTER) {
    const key = rows.playerMatchKey(p);
    const tableRow = table.rows.find(r => r.key === key);
    const profile = stats.byPlayer[key];
    if (!tableRow) continue;
    assert.equal(tableRow.appearances, profile ? profile.appearances : 0, p.name + ': appearances agree');
    // and the match list is exactly as long as the number both surfaces show
    assert.equal((profile && profile.playedMatches || []).length, tableRow.appearances,
      p.name + ': the last-match list matches the count on BOTH screens');
  }
  // the unused substitute: on the bench everywhere, played nowhere
  const benchKey = rows.playerMatchKey(ROSTER[1]);
  assert.equal(table.rows.find(r => r.key === benchKey).benchAppearances, 1);
  assert.equal(table.rows.find(r => r.key === benchKey).appearances, 0);
});

test('the card inherits the group-scoped, stale-aware season source', () => {
  // Group isolation and the stale-read rule are NOT re-implemented here: the
  // card reads currentSeasonSheets(), which returns null when the loaded season
  // belongs to another group, and calcAvailable turns that into "Loading…"
  // rather than "No match appearances yet".
  const i = html.indexOf('<!-- APPEARANCES CARD');
  const head = html.slice(i, html.indexOf('<!-- LAST MATCH', i));
  assert.match(head, /const season = currentSeasonSheets\(\);/);
  assert.match(head, /const calcAvailable = !!season && !season\.denied;/);
  const guard = extractFn(html, 'currentSeasonSheets');
  assert.match(guard, /_seasonSheetsGroup !== gid/, 'a group mismatch means unknown');
  assert.match(guard, /return null/);
});

test('nothing else decides who played — the aggregation is the only judge', () => {
  const fn = extractFn(html, 'seasonPlayerStats');
  assert.equal(html.split('function seasonPlayerStats(').length - 1, 1);
  // The list is pushed under the SAME `played` flag the appearance count uses.
  assert.match(fn, /if \(person\.role === 'bench' && played\) row\.appearances \+= 1;/);
  assert.match(fn, /if \(played\) row\.playedMatches\.push\(\{/);
});

test('the profile card reads that aggregation and adds no arithmetic', () => {
  const i = html.indexOf('<!-- LAST MATCH');
  const card = html.slice(i, html.indexOf('<details>', i));
  const code = card.replace(/^\s*(\/\/|\*|<!--).*$/gm, '');
  assert.match(code, /mine\.playedMatches\[0\]/, 'the newest, straight from the aggregation');
  assert.ok(!/\.filter\(|\.reduce\(|\.sort\(/.test(code), 'no second opinion about which match is last');
  assert.match(code, /calcAvailable/, 'and it inherits the card’s loaded/denied distinction');
});

test('the card distinguishes loading, denied and genuinely-none', () => {
  const i = html.indexOf('<!-- LAST MATCH');
  const card = html.slice(i, html.indexOf('<details>', i));
  assert.match(card, /Loading…/);
  assert.match(card, /needs squad-publishing access/);
  assert.match(card, /No match appearances yet/);
  // "no appearances" must sit behind calcAvailable, never in front of it
  assert.ok(card.indexOf('calcAvailable') < card.indexOf('No match appearances yet'));
});

test('a FAILED season read is told apart from one still in flight', () => {
  // Both leave currentSeasonSheets() null, so before this the card said
  // "Loading…" for ever against a permanently failing read — never wrong about
  // appearances, but implying progress that was not happening.
  const load = extractFn(html, 'loadSeasonSheets');
  assert.match(load, /_seasonSheets = null; _seasonSheetsFailed = gid; return;/, 'an error is recorded');
  assert.match(load, /catch \{ _seasonSheets = null; _seasonSheetsFailed = gid; \}/, 'so is a throw');
  assert.match(load, /_seasonSheetsFailed = null;/, 'and a success clears it');
  // unknown-is-not-empty is untouched: a failure still yields null, never [].
  assert.ok(!/_seasonSheets = \{ sheets: \[\] \}/.test(load));

  const failed = extractFn(html, 'seasonSheetsFailed');
  assert.match(failed, /_seasonSheetsFailed === \(state\.operationalGroupId \|\| ''\)/, 'scoped to this group');
  // It must NOT be gated on the loading flag: reading the card starts another
  // attempt, so a retry is in flight on essentially every render. Asserted
  // against the STRIPPED source — the comment explaining this necessarily
  // names the flag it is telling you not to use.
  const failedCode = failed.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/_seasonSheetsLoading/.test(failedCode),
    'gating on the in-flight retry hid the failure permanently');
});

test('the card orders its states so a failure can never read as "none"', () => {
  const i = html.indexOf('<!-- LAST MATCH');
  const card = html.slice(i, html.indexOf('<details>', i));
  const denied = card.indexOf('needs squad-publishing access');
  const failed = card.indexOf('Could not be loaded');
  const loading = card.indexOf("'Loading…'");
  const none = card.indexOf('No match appearances yet');
  assert.ok(denied > -1 && failed > -1 && loading > -1 && none > -1, 'all four states present');
  assert.ok(Math.max(denied, failed, loading) < none,
    'every not-known state is decided before "no appearances" is ever reachable');
  assert.match(card, /this is not a record of no appearances/, 'and the failure says what it is NOT');
});

test('the card introduces no colour of its own', () => {
  const i = html.indexOf('<!-- LAST MATCH');
  const card = html.slice(i, html.indexOf('<details>', i)).replace(/^\s*(\/\/|\*|<!--).*$/gm, '');
  assert.deepEqual([...card.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]), []);
});
