/**
 * BUILD X — a completely silent player is 'no-reply', never undefined.
 *
 * sessionRows' fallback branch returned the raw per-session field — undefined
 * for a player with no answer anywhere — so the coach board's exact-match
 * buckets dropped silent players entirely AND counted them as "answered"
 * (status !== 'no-reply'). The canonical states are available / maybe /
 * unavailable / no-reply: absence normalizes to no-reply at the ONE row
 * source, before any counter or bucket sees it. Group filtering stays FIRST
 * (operationalPlayers), normalization last — the boundary never moves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name) {
  // Paren-aware: a default parameter like (player = {}) must not be mistaken
  // for the body brace — walk the parameter list first, then brace-count.
  let start = src.indexOf('    function ' + name + '(');
  if (start === -1) start = src.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const fn = n => extractFn(html, n);

/** The REAL row pipeline over a controlled world. `resolved` is the
 *  server-resolved availability map; `players` the operating group's roster. */
function world({ players = [], resolved = {}, group = 'grp_u18' } = {}) {
  const body =
    '"use strict";\n' +
    'const state = { operationalGroupId: ' + JSON.stringify(group) + ', players: ' + JSON.stringify(players) + ', schedule: [{ id: "thu", title: "Thursday" }] };\n' +
    'function operationalPlayers() { return state.players; }\n' +
    'let _resolvedAvailability = ' + JSON.stringify(resolved) + ';\n' +
    'let _resolvedAvailabilityGroup = ' + JSON.stringify(group) + ';\n' +
    'let _availLastSync = "2026-09-03T10:00:00.000Z";\n' +
    // availabilityNonResponders filters archived players; none of these
    // synthetic rosters archive anyone, so the check is a truthful constant.
    'function playerIsArchived() { return false; }\n' +
    fn('sessionKey') + '\n' +
    fn('sessionReasonKey') + '\n' +
    fn('normalizeSessionId') + '\n' +
    fn('liveAvailabilityPlayerKeys') + '\n' +
    fn('currentResolvedAvailability') + '\n' +
    fn('resolvedAnswerFor') + '\n' +
    fn('sessionRows') + '\n' +
    fn('availabilityNonResponders') + '\n' +
    'return { rows: id => sessionRows(id), nonResponders: s => availabilityNonResponders(s) };\n';
  return new Function(body)();
}

const P = (id, extra = {}) => ({ id, name: 'Player ' + id, userId: id, ...extra });
const ANS = (resp, at = '2026-09-02T10:00:00.000Z') => ({ thu: { response: resp, reason: '', respondedAt: at } });

// ── 1. the core defect ─────────────────────────────────────────────────────
test('1: a player with NO availability record anywhere is no-reply — never undefined', () => {
  const w = world({ players: [P('silent')] });
  const [row] = w.rows('thu');
  assert.equal(row.status, 'no-reply', 'absence normalizes to the canonical no-reply');
});

test("2: an empty-string local field is also no-reply — absence has ONE spelling", () => {
  const w = world({ players: [P('blank', { trainingThursday: '' })] });
  assert.equal(w.rows('thu')[0].status, 'no-reply');
});

// ── 3+4+5. real answers unchanged ──────────────────────────────────────────
test('3+4+5: available / maybe / unavailable pass through untouched, local or resolved', () => {
  const w = world({
    players: [P('a', { trainingThursday: 'available' }), P('m'), P('u', { trainingThursday: 'unavailable' })],
    resolved: { m: ANS('maybe') },
  });
  const by = Object.fromEntries(w.rows('thu').map(r => [r.player.id, r.status]));
  assert.equal(by.a, 'available');
  assert.equal(by.m, 'maybe');
  assert.equal(by.u, 'unavailable');
});

// ── 6. Build R precedence intact ───────────────────────────────────────────
test('6: the server-resolved answer still overrides the local field (Build R precedence)', () => {
  const w = world({
    players: [P('p', { trainingThursday: 'available' })],
    resolved: { p: ANS('unavailable', '2026-09-03T09:00:00.000Z') },
  });
  assert.equal(w.rows('thu')[0].status, 'unavailable', 'server-first resolution unchanged');
});

test('6b: local no-reply never masks a resolved answer; resolved absence still falls back locally', () => {
  const w = world({ players: [P('p')], resolved: { p: ANS('maybe') } });
  assert.equal(w.rows('thu')[0].status, 'maybe');
  const w2 = world({ players: [P('q', { trainingThursday: 'maybe' })], resolved: {} });
  assert.equal(w2.rows('thu')[0].status, 'maybe');
});

// ── 7+8. the coach board's buckets, by the board's own predicates ──────────
test('7+8: the silent player lands in the no-reply bucket and is NOT counted as answered', () => {
  const w = world({
    players: [P('a', { trainingThursday: 'available' }), P('m'), P('u', { trainingThursday: 'unavailable' }), P('silent')],
    resolved: { m: ANS('maybe') },
  });
  const rows = w.rows('thu');
  // The EXACT bucket predicates the board uses:
  const bucket = s => rows.filter(({ status }) => status === s).length;
  assert.equal(bucket('available'), 1);
  assert.equal(bucket('maybe'), 1);
  assert.equal(bucket('unavailable'), 1);
  assert.equal(bucket('no-reply'), 1, 'the completely silent player is IN the no-reply bucket');
  assert.equal(rows.filter(({ status }) => status !== 'no-reply').length, 3,
    'answered = 3, not 4 — silence is not an answer');
  assert.equal(rows.length, 4, 'nobody vanished');
});

test('8b: the chase list counts the completely silent player as a non-responder', () => {
  const w = world({ players: [P('a', { trainingThursday: 'available' }), P('silent')] });
  const chase = w.nonResponders([{ id: 'thu' }]);
  assert.deepEqual(chase.map(p => p.id), ['silent']);
});

// ── 9+10. group boundary unchanged, and FIRST in the pipeline ──────────────
test('9+10: another group\'s silent player is still invisible — the default cannot leak them in', () => {
  // operationalPlayers() is the boundary: a player not in the operating group
  // never reaches sessionRows at all. The normalization happens AFTER it.
  const w = world({ players: [P('mine')] });   // the other group's player simply isn't in the roster
  const rows = w.rows('thu');
  assert.equal(rows.length, 1, 'only the operating group\'s roster is rowed');
  assert.equal(rows[0].player.id, 'mine');
  // and the pipeline order is structural: sessionRows maps operationalPlayers()
  const src = fn('sessionRows');
  assert.ok(src.indexOf('operationalPlayers()') < src.indexOf("'no-reply'"),
    'group filtering precedes the no-reply normalization');
});

test('a MALFORMED resolved entry (empty response) still normalizes to no-reply', () => {
  // resolvedAnswerFor returns the stored entry object whether or not its
  // response is populated — so an empty-response record (a malformed server
  // shape) would flow straight into the row. The canonical-states contract
  // holds on BOTH branches, not just the local fallback.
  const w = world({ players: [P('m')], resolved: { m: { thu: { response: '', reason: '', respondedAt: '2026-09-02T10:00:00.000Z' } } } });
  assert.equal(w.rows('thu')[0].status, 'no-reply', 'the resolved branch defends the contract too');
});

test('undefined can never escape sessionRows for ANY row shape', () => {
  const w = world({
    players: [P('x'), P('y', { trainingThursday: null }), P('z', { trainingThursday: 'available' })],
  });
  for (const r of w.rows('thu')) {
    assert.ok(['available', 'maybe', 'unavailable', 'no-reply', 'injured'].includes(r.status),
      `canonical status only — got ${String(r.status)}`);
  }
});
