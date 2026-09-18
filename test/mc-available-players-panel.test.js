/**
 * MATCH CENTRE — AVAILABLE PLAYERS PANEL (the persistent .mc7-rail).
 *
 * With a real squad the panel was hard to use:
 *   - the list never scrolled on desktop. The rail sits in the board grid next
 *     to the pitch, and its rows sized that grid row, so 60 players made the
 *     rail (and the page) ~4,500px tall and the list's own overflow never
 *     applied;
 *   - there was no way to see only forwards or only backs;
 *   - a "Sort: Position | Training" toggle sorted by training attendance.
 *
 * The contract pinned here:
 *   - side by side, the rail is size-contained, so it takes the pitch
 *     column's height and the LIST scrolls inside it; header and filters sit
 *     outside the scrolling list. Stacked, the list scrolls inside a
 *     viewport-relative height;
 *   - a Position filter All / Forwards / Backs, classified by the app's ONE
 *     canonical rule (availabilityGroupForPlayer), applied last and view-only;
 *   - a player with no recognised position is in neither group: All only;
 *   - the Training sort button is gone from this panel (and only here); the
 *     list is in rugby order (availabilityPositionOrder);
 *   - every other rail control (search, Selection, Availability) remains.
 *
 * The canonical positions are the app's own option list ("1 — Loosehead prop"
 * … "15 — Fullback", "SUB — Squad player"); the name-only values are the ones
 * the app itself writes (the demo squad: "Scrum-half", "No. 8", …).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = html.indexOf('(', start), paren = 0;
  for (; i < html.length; i++) {
    if (html[i] === '(') paren++;
    else if (html[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = html.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < html.length; b++) {
    if (html[b] === '{') depth++;
    else if (html[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return html.slice(start, end + 1);
}

const group = new Function(`${fn('availabilityGroupForPlayer')}; return availabilityGroupForPlayer;`)();
const order = new Function(`${fn('availabilityGroupForPlayer')}; ${fn('availabilityPositionOrder')}; return availabilityPositionOrder;`)();
const matchday = fn('renderMatchday');

// The app's canonical option list, read from the Members add-player form.
const CANON = JSON.parse(/const posOptions = (\[[^\]]+\]);/.exec(html)[1]);

// The rail's markup: from the panel header to the end of the <aside>.
const rail = (() => {
  const a = matchday.indexOf('<aside class="mcx2-rail mc7-rail"');
  return matchday.slice(a, matchday.indexOf('</aside>', a));
})();

// ── position grouping ────────────────────────────────────────────────────────

test('the canonical option list is the one this test maps', () => {
  assert.deepEqual(CANON, ['1 — Loosehead prop', '2 — Hooker', '3 — Tighthead prop', '4 — Lock', '5 — Lock',
    '6 — Blindside flanker', '7 — Openside flanker', '8 — Number 8', '9 — Scrum half', '10 — Fly half',
    '11 — Left wing', '12 — Inside centre', '13 — Outside centre', '14 — Right wing', '15 — Fullback',
    'SUB — Squad player']);
});

test('canonical positions 1–8 are forwards, 9–15 are backs', () => {
  for (const pos of CANON.slice(0, 8))  assert.equal(group({ position: pos }), 'forwards', pos);
  for (const pos of CANON.slice(8, 15)) assert.equal(group({ position: pos }), 'backs', pos);
});

test('name-only values the app writes are grouped correctly — scrum-half is a back', () => {
  for (const pos of ['Loosehead Prop', 'Tighthead Prop', 'Hooker', 'Lock', 'Flanker', 'No. 8'])
    assert.equal(group({ position: pos }), 'forwards', pos);
  for (const pos of ['Scrum-half', 'Scrum half', 'Fly-half', 'Centre', 'Wing', 'Fullback'])
    assert.equal(group({ position: pos }), 'backs', pos);
});

test('missing or unrecognised positions are neither forwards nor backs', () => {
  for (const pos of ['SUB — Squad player', 'SUB', 'TBC', '', undefined, 'Utility'])
    assert.equal(group({ position: pos }), '', String(pos));
});

test('the list is in rugby order, unknown last', () => {
  const names = ['15 — Fullback', 'TBC', '1 — Loosehead prop', 'Scrum-half', '8 — Number 8', 'Hooker'];
  const sorted = names.slice().sort((a, b) => order({ position: a }) - order({ position: b }));
  assert.deepEqual(sorted, ['1 — Loosehead prop', '8 — Number 8', '15 — Fullback', 'Hooker', 'Scrum-half', 'TBC']);
});

// ── the filter itself: the real lines from renderMatchday ────────────────────

const POS_BLOCK = (() => {
  const a = matchday.indexOf('// POSITION filter');
  const b = matchday.indexOf('// Cross-team LOCKS for the rail.');
  assert.ok(a > 0 && b > a, 'position filter block present, before the cross-team locks');
  return matchday.slice(a, b);
})();
const runFilter = (visible, pos) => new Function('_visibleStats', '_mcRailPos', `
  ${fn('availabilityGroupForPlayer')}
  ${POS_BLOCK}
  return { _railStats, _posCounts, _posUnknown, _railPos };`)(visible, pos);

const P = (id, position) => ({ p: { id, name: `Player ${id}`, position }, match: 'available' });
const POOL = [P('a', '1 — Loosehead prop'), P('b', '9 — Scrum half'), P('c', 'Scrum-half'), P('d', 'Lock'),
              P('e', '15 — Fullback'), P('f', 'SUB — Squad player'), P('g', '')];

test('All shows every visible candidate, including unknown positions', () => {
  const r = runFilter(POOL, 'all');
  assert.deepEqual(r._railStats.map(s => s.p.id), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(r._posCounts, { all: 7, forwards: 2, backs: 3 });
  assert.equal(r._posUnknown, 2);
});

test('Forwards shows only forwards; Backs only backs', () => {
  assert.deepEqual(runFilter(POOL, 'forwards')._railStats.map(s => s.p.id), ['a', 'd']);
  assert.deepEqual(runFilter(POOL, 'backs')._railStats.map(s => s.p.id), ['b', 'c', 'e']);
});

test('an unknown filter value falls back to All', () => {
  const r = runFilter(POOL, 'props');
  assert.equal(r._railPos, 'all');
  assert.equal(r._railStats.length, 7);
});

test('filtering is view-only: the candidate pool and its records are untouched', () => {
  const pool = POOL.map(s => ({ ...s, p: { ...s.p } }));
  const before = JSON.stringify(pool);
  runFilter(pool, 'forwards');
  runFilter(pool, 'backs');
  assert.equal(JSON.stringify(pool), before);
});

test('the position filter runs after, and never inside, eligibility / availability / selection', () => {
  const at = k => matchday.indexOf(k);
  assert.ok(at('const _availFiltered') < at('const _visibleStats'));
  assert.ok(at('const _visibleStats') < at('// POSITION filter'), 'applied last, over the already-filtered view');
  assert.match(rail, /\$\{_railStats\.map\(/, 'rows render from the position-filtered list');
  // Eligibility is still computed exactly as before, upstream of every filter.
  assert.match(matchday, /const available = matchdayPlayers\.filter\(p => !_seenPersons\.has\(mcPersonKey\(p\.name\)\)\);/);
});

test('changing the position filter touches no state, eligibility, XV or bench', () => {
  const body = fn('mcSetRailPos');
  assert.doesNotMatch(body, /state\.|saveState|formationNames|benchPlayers|fetch\(/);
  assert.match(body, /render\(\)/);
  let rendered = 0;
  const api = new Function('render', `let _mcRailPos = 'all'; ${body}; return { set: mcSetRailPos, get: () => _mcRailPos };`)(() => { rendered++; });
  api.set('backs');    assert.equal(api.get(), 'backs');
  api.set('nonsense'); assert.equal(api.get(), 'all');
  assert.equal(rendered, 2);
});

// ── the panel's controls ─────────────────────────────────────────────────────

test('the panel renders its header, search, Selection, Availability and Position controls', () => {
  assert.match(rail, /<strong>Available Players<\/strong>/);
  assert.match(rail, /id="mc-player-filter"[^>]*oninput="mcAvailSearch\(this\.textContent\)"/);
  assert.match(rail, /onclick="mcSetRailSel\('\$\{k\}'\)"/);
  assert.match(rail, /onclick="mcSetAvailFilter\('\$\{k\}'\)"/);
  assert.match(rail, /aria-label="Filter candidates by position"/);
  assert.match(rail, /\[\['all','All'\],\['forwards','Forwards'\],\['backs','Backs'\]\]/);
  assert.match(rail, /onclick="mcSetRailPos\('\$\{k\}'\)"/);
});

test('every control sits OUTSIDE the scrolling list', () => {
  const list = rail.indexOf('<div class="mc7-tbody">');
  assert.ok(list > 0);
  const inside = rail.slice(list);   // the list and everything after it in the panel
  for (const control of ['id="mc-player-filter"', 'mcSetRailSel(', 'mcSetAvailFilter(', 'mcSetRailPos(']) {
    const at = rail.indexOf(control);
    assert.ok(at > 0 && at < list, `${control} is above the list`);
    assert.ok(!inside.includes(control), `${control} never appears inside the scrolling list`);
  }
});

test('the rail lists candidates in rugby order — the real sort line', () => {
  const line = /_availStats\.sort\(\(a, b\) => [\s\S]*?\);/.exec(matchday)[0];
  assert.match(line, /availabilityPositionOrder\(a\.p\) - availabilityPositionOrder\(b\.p\)/);
  const _availStats = [P('z', 'TBC'), P('y', '15 — Fullback'), P('x', 'Hooker'), P('w', '2 — Hooker'), P('v', '2 — Hooker')];
  _availStats[3].p.name = 'Player b'; _availStats[4].p.name = 'Player a';
  new Function('_availStats', `${fn('availabilityGroupForPlayer')} ${fn('availabilityPositionOrder')} ${line}`)(_availStats);
  assert.deepEqual(_availStats.map(s => s.p.id), ['v', 'w', 'y', 'x', 'z'], 'numbered 1–15, then named forwards, unknown last; name breaks ties');
});

test('the Training sort button is gone from this panel — and only from here', () => {
  assert.doesNotMatch(rail, />Training</, 'no Training button in Available Players');
  assert.doesNotMatch(html, /mcSetAvailSort|_mcAvailSort/, 'the sort toggle is gone entirely');
  assert.doesNotMatch(rail, /mc7-sort/);
  // Training elsewhere is untouched: its nav entry and the Overview card.
  assert.match(html, /setSection\('coach','training'\)/);
  assert.match(html, /card\('Training', /);
});

test('the rail no longer reads attendance — its only use was the removed sort', () => {
  assert.doesNotMatch(matchday, /currentAttendance\(|attendanceStats\(|attPct/);
});

test('rows still drag into the XV / bench exactly as before', () => {
  assert.match(rail, /ondragstart="handlePlayerDragStart\(event\)" ondragend="mcDragEnd\(event\)"/);
  assert.match(rail, /data-player-name="\$\{esc\(p\.name\)\}" data-player-id="\$\{esc\(p\.id\)\}"/);
  assert.match(matchday, /ondrop="handleAvailDrop\(event\)"/, 'dropping back onto the panel still unplaces');
});

// ── layout: independent scrolling, no fixed heights, no overflow ─────────────

test('the list is the scroll region; the rail cannot grow the board row on desktop', () => {
  assert.match(html, /\.mc7-tbody \{ flex: 1 1 auto; overflow-y: auto; min-height: 0; overscroll-behavior: contain;/);
  assert.match(html, /\.mc7-tools \{ flex: 1 1 auto; height: auto; display: flex; flex-direction: column; min-height: 0; \}/);
  assert.match(html, /@media \(min-width: 1041px\) \{ \.mc7-rail \{ contain: size; \} \}/);
});

test('stacked, the list height follows the viewport rather than a fixed box', () => {
  assert.match(html, /@media \(max-width: 1040px\) \{ \.mc7-rail \{ height: auto; \} \.mc7-tools \{ flex: none; \} \.mc7-tbody \{ max-height: 60vh; max-height: 60dvh; \} \}/);
});

test('the Position filter wraps like the other rail filters (no sideways overflow)', () => {
  assert.match(html, /\.mc7-filter \{ display: flex; flex-wrap: wrap;/);
  assert.match(rail, /class="mc7-filter mc7-filter-pos"/);
});
