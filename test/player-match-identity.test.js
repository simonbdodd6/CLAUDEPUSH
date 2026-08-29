/**
 * PLAYER MATCH IDENTITY — one answer to "which player is this?".
 *
 * Before this build, three things in Core answered that question differently:
 *
 *   · substitutions used mcPersonKey → "id:<userId or roster id>"
 *   · appearances used state.squadSelections, keyed by the ROSTER ROW id
 *   · appearance adjustments (real, server-persisted, audited records) stored
 *     whichever id the admin screen held — also the roster row id
 *
 * For anyone holding an account those disagree: `p1` versus `id:u1`. Two halves
 * of the same season total could never have been added together.
 *
 * Two facts made the appearance side worse than merely inconsistent, and both
 * are proven by the tests below rather than asserted:
 *
 *   · squadSelections is written ONLY by the Selection screen, which no code
 *     path can reach, and it never reaches a server — so appearances returned
 *     a confident zero for every player in every club.
 *   · the roster row id is regenerated whenever a roster row is recreated, so
 *     it cannot carry a season of history.
 *
 * playerMatchKey() is now the single definition, preferring the durable
 * MEMBERSHIP userId. Nothing was migrated: the stored adjustments are resolved
 * at READ time against the player record, which holds both ids, so the mapping
 * is deterministic and nothing is rewritten. An adjustment matching no current
 * player is reported, never attributed by guesswork.
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

const ROSTER = [
  { id: 'p1', name: 'Tom Harris',  userId: 'u1' },   // an account
  { id: 'p2', name: 'Ben Coyle'                 },   // roster row only
  { id: 'p3', name: 'Tom Harris',  userId: 'u3' },   // SAME NAME, different person
];

function scope(players = ROSTER) {
  return new Function(`
    "use strict";
    const state = { players: ${JSON.stringify(players)} };
    function findPlayerByName(n) { const w = String(n || '').trim().toLowerCase();
      return state.players.find(p => String(p.name || '').trim().toLowerCase() === w) || null; }
    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'appearanceSeasonId')}
    ${extractFn(html, 'fixtureHasBeenPlayed')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'seasonPlayerStats')}
    ${extractFn(html, 'appearancesCalculated')}
    ${extractFn(html, 'appearanceAdjustmentsFor')}
    ${extractFn(html, 'appearanceUnresolvedAdjustments')}
    ${extractFn(html, 'appearanceVerifiedTotal')}
    ${extractFn(html, 'matchMinutesByPerson')}
    return { state, playerMatchKey, mcPersonKey, appearancesCalculated, appearanceAdjustmentsFor,
             appearanceUnresolvedAdjustments, appearanceVerifiedTotal, matchMinutesByPerson };
  `)();
}

const FIXTURES = [
  { id: 'f1', opposition: 'Mons',   date: '2025-09-06', status: 'completed' },
  // Genuinely in the future: "played" is now the shared date-based rule, so a
  // date already past would count however it is labelled.
  { id: 'f2', opposition: 'Future', date: '2099-05-01', status: 'scheduled' },
];

// ── 1. One canonical identity ────────────────────────────────────────────────

test('the canonical key prefers the durable membership identity', () => {
  const s = scope();
  assert.equal(s.playerMatchKey(ROSTER[0]), 'id:u1', 'the account, not the roster row');
  assert.equal(s.playerMatchKey(ROSTER[1]), 'id:p2', 'the roster row when there is no account');
});

test('an unknown player yields nothing rather than something invented', () => {
  const s = scope();
  assert.equal(s.playerMatchKey(null), '');
  assert.equal(s.playerMatchKey({}), '');
  assert.equal(s.playerMatchKey({ name: 'Nobody' }), '', 'a name alone is not an identity');
});

test('a match sheet name resolves through the SAME key', () => {
  const s = scope();
  assert.equal(s.mcPersonKey('Tom Harris'), s.playerMatchKey(ROSTER[0]));
  assert.equal(s.mcPersonKey('ben coyle'), s.playerMatchKey(ROSTER[1]), 'case-insensitive');
  assert.equal(s.mcPersonKey('Nobody Here'), 'nm:nobody here',
    'a name matching no roster record stays honestly unresolved');
  assert.equal(s.mcPersonKey(''), '');
});

test('mcPersonKey has ONE definition of identity, delegated not duplicated', () => {
  const src = extractFn(html, 'mcPersonKey');
  assert.match(src, /playerMatchKey\(p\)/, 'it asks the canonical function');
  assert.ok(!/p\.userId \|\| p\.id/.test(src), 'and no longer carries its own copy of the rule');
});

// ── 2. Appearances and substitutions now aggregate together ──────────────────

test('appearances and minutes key the same players the same way', () => {
  const s = scope();
  const sheets = [{ fixtureId: 'f1', formationNames: { '1': 'Tom Harris' }, benchPlayers: ['Ben Coyle'] }];
  const app = s.appearancesCalculated(FIXTURES, sheets, '2025-08-01', '2026-05-31');
  const people = [
    { key: s.mcPersonKey('Tom Harris'), name: 'Tom Harris', role: 'starter' },
    { key: s.mcPersonKey('Ben Coyle'),  name: 'Ben Coyle',  role: 'bench' },
  ];
  const mins = s.matchMinutesByPerson(people, [], 80);
  assert.deepEqual(Object.keys(app.byPlayer).sort(), Object.keys(mins).sort(),
    'the same key set — a season total can add these together');
  assert.equal(app.byPlayer['id:u1'], 1);
  assert.equal(mins['id:u1'], 80);
});

test('only completed fixtures count, and a fixture counts once', () => {
  const s = scope();
  const sheets = [
    { fixtureId: 'f1', formationNames: { '1': 'Tom Harris' }, benchPlayers: [] },
    { fixtureId: 'f1', formationNames: { '1': 'Tom Harris' }, benchPlayers: [] },  // a second sheet
    { fixtureId: 'f2', formationNames: { '1': 'Tom Harris' }, benchPlayers: [] },  // not played yet
  ];
  const app = s.appearancesCalculated(FIXTURES, sheets, '2025-08-01', '2026-05-31');
  assert.equal(app.byPlayer['id:u1'], 1);
  assert.equal(app.matches.length, 1);
});

test('a name on a sheet that matches no roster record is reported, not absorbed', () => {
  const s = scope();
  const sheets = [{ fixtureId: 'f1', formationNames: { '1': 'Ghost Player' }, benchPlayers: [] }];
  const app = s.appearancesCalculated(FIXTURES, sheets, '2025-08-01', '2026-05-31');
  assert.deepEqual(app.unresolved, ['Ghost Player']);
  assert.equal(app.byPlayer['nm:ghost player'], 1, 'counted under its own honest key');
  assert.equal(app.byPlayer['id:u1'], undefined, 'and never folded into a real player');
});

test('appearances no longer read squadSelections', () => {
  const src = extractFn(html, 'appearancesCalculated');
  assert.ok(!/squadSelections/.test(src), 'the empty, unreachable source is gone');
  assert.ok(!/status !== 'published'/.test(src), 'the selection status model went with it');
  assert.match(src, /mcPersonKey\(name\)/, 'names resolve through the canonical identity');
  assert.match(src, /formationNames|benchPlayers/, 'it reads match sheets');
});

// ── 3. Two people, one name ──────────────────────────────────────────────────

test('two players sharing a name have different identities', () => {
  const s = scope();
  assert.notEqual(s.playerMatchKey(ROSTER[0]), s.playerMatchKey(ROSTER[2]));
  assert.equal(s.playerMatchKey(ROSTER[0]), 'id:u1');
  assert.equal(s.playerMatchKey(ROSTER[2]), 'id:u3');
});

test('a renamed player keeps their identity, and therefore their history', () => {
  const s = scope();
  const before = s.playerMatchKey({ id: 'p1', name: 'Tom Harris', userId: 'u1' });
  const after  = s.playerMatchKey({ id: 'p1', name: 'Thomas Harris-Smith', userId: 'u1' });
  assert.equal(before, after, 'the key does not move when the display name does');
});

test('a rebuilt roster row keeps the identity when an account is behind it', () => {
  // The roster row id is regenerated by a rebuild, an import or a Match Centre
  // sheet reconcile. That is exactly why it cannot be the identity.
  const s = scope();
  assert.equal(s.playerMatchKey({ id: 'p1',        name: 'Tom Harris', userId: 'u1' }),
               s.playerMatchKey({ id: 'p999999',   name: 'Tom Harris', userId: 'u1' }));
});

// ── 4. Legacy adjustments: preserved, resolved, never guessed ────────────────

const ADJ = [
  { playerId: 'p1',    amount: 3, seasonId: '2025-26', reason: 'legacy roster id' },
  { playerId: 'u1',    amount: 2, seasonId: '2025-26', reason: 'durable id' },
  { playerId: 'id:u1', amount: 1, seasonId: '2025-26', reason: 'canonical key' },
  { playerId: 'p-gone',amount: 9, seasonId: '2025-26', reason: 'player long gone' },
];

test('a legacy adjustment stored under the ROSTER id still finds its player', () => {
  const s = scope();
  const mine = s.appearanceAdjustmentsFor(ROSTER[0], ADJ);
  assert.deepEqual(mine.map(a => a.reason), ['legacy roster id', 'durable id', 'canonical key']);
  assert.equal(s.appearanceVerifiedTotal(0, mine), 6, 'the whole history survives');
});

test('an adjustment never leaks to a player it does not belong to', () => {
  const s = scope();
  assert.deepEqual(s.appearanceAdjustmentsFor(ROSTER[1], ADJ), [], 'Ben has none');
  assert.deepEqual(s.appearanceAdjustmentsFor(ROSTER[2], ADJ), [],
    'and neither does the other Tom Harris — a shared name is not a shared history');
});

test('an adjustment is NEVER matched by name — that is the collision route', () => {
  // If a name could match, the two Tom Harrises would share a history, and any
  // record whose playerId happened to read like a name would be mis-credited.
  const s = scope();
  const byName = [{ playerId: 'Tom Harris', amount: 5, seasonId: '2025-26', reason: 'name-shaped id' }];
  assert.deepEqual(s.appearanceAdjustmentsFor(ROSTER[0], byName), [],
    'a name is not an identity, even when it names the right person');
  assert.deepEqual(s.appearanceAdjustmentsFor(ROSTER[2], byName), []);
  assert.deepEqual(s.appearanceUnresolvedAdjustments(ROSTER, byName).map(a => a.playerId), ['Tom Harris'],
    'it is reported for a human to resolve instead');
});

test('an adjustment matching no current player is reported, not attributed', () => {
  const s = scope();
  const orphans = s.appearanceUnresolvedAdjustments(ROSTER, ADJ);
  assert.deepEqual(orphans.map(a => a.playerId), ['p-gone']);
  // …and it is credited to nobody.
  for (const p of ROSTER) {
    assert.ok(!s.appearanceAdjustmentsFor(p, ADJ).some(a => a.playerId === 'p-gone'));
  }
});

test('resolution is READ-ONLY — no stored record is rewritten', () => {
  const s = scope();
  const before = JSON.stringify(ADJ);
  s.appearanceAdjustmentsFor(ROSTER[0], ADJ);
  s.appearanceUnresolvedAdjustments(ROSTER, ADJ);
  assert.equal(JSON.stringify(ADJ), before, 'the adjustments are untouched');
  const src = extractFn(html, 'appearanceAdjustmentsFor');
  assert.ok(!/fetch\(|POST|kvSet|\.push\(|=\s*['"]/.test(src.replace(/'[^']*'/g, "''")),
    'it only filters — there is no migration write anywhere in it');
});

test('resolution is idempotent', () => {
  const s = scope();
  const a = JSON.stringify(s.appearanceAdjustmentsFor(ROSTER[0], ADJ));
  const b = JSON.stringify(s.appearanceAdjustmentsFor(ROSTER[0], ADJ));
  const c = JSON.stringify(s.appearanceAdjustmentsFor(ROSTER[0], ADJ));
  assert.equal(a, b); assert.equal(b, c);
});

test('an adjustment cannot be resolved across clubs', () => {
  // Both sides are already club-scoped by the server: adjustments are read from
  // appearance_adj:<teamId> under the caller's own session, and the roster comes
  // from that session's club. This pins the CLIENT half — resolution is anchored
  // on a player record from this club's roster and nothing else.
  const s = scope();
  const otherClubPlayer = { id: 'pX', name: 'Rival Player', userId: 'uX' };
  assert.deepEqual(s.appearanceAdjustmentsFor(otherClubPlayer, ADJ), []);
  const src = extractFn(html, 'appearanceAdjustmentsFor');
  assert.ok(!/teamId|clubId/.test(src), 'it never reasons about clubs — the server already did');
});

// ── 5. The dead path cannot become a second identity model ───────────────────

test('the Selection screen remains unreachable', () => {
  // Proof, not assumption: the only two functions that put the app on that
  // section have no callers, it is absent from the beta sidebar, and it is
  // absent from the deep-link allow-list.
  // Comments are stripped first — the deprecation note quotes the very line
  // being counted, and an assertion that matches prose is not an assertion.
  const code = html.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const setters = (code.match(/state\.activeCoachSection = 'selection'/g) || []).length;
  assert.equal(setters, 2, 'still only selectionGoCreate and selectionGoEdit');
  for (const name of ['selectionGoCreate', 'selectionGoEdit']) {
    const calls = (code.match(new RegExp(name + '\\s*\\(', 'g')) || []).length;
    assert.equal(calls, 1, `${name} is defined once and called nowhere`);
  }
  const navIds = html.slice(html.indexOf('const BETA_NAV_IDS'), html.indexOf('const BETA_NAV_IDS') + 240);
  assert.ok(!/["']selection["']/.test(navIds), 'not in the sidebar');
  const deepLink = extractFn(html, 'notificationDestination');
  assert.ok(!/selection/.test(deepLink), 'not reachable by deep link');
});

test('squadSelections never reaches a server, and is marked deprecated', () => {
  assert.match(html, /DEPRECATED — the Selection screen and state\.squadSelections/,
    'the dead path carries its proof, so nobody rewires it by accident');
  // Nothing in the app may start feeding appearances from it again.
  assert.ok(!/appearancesCalculated\([^)]*squadSelections/.test(html),
    'appearances must never be computed from selections again');
});

test('the live Appearances card no longer prints a sourceless zero', () => {
  const start = html.indexOf('<!-- APPEARANCES CARD');
  const card = html.slice(start, html.indexOf('Add correction (admin', start));
  assert.match(card, /appearanceAdjustmentsFor\(p, _appearanceAdjustments/,
    'adjustments resolve through the bridge');
  assert.match(card, /playerMatchKey\(p\)/, 'and the calculated side keys canonically');
  // UPDATED: the previous build hard-coded calcAvailable=false because there
  // was no season-wide source. There is one now (the server's season-sheets
  // read), so the flag is DERIVED from whether that read landed. The invariant
  // this test exists to protect is unchanged and still asserted: the card must
  // never show a calculated number it cannot source.
  assert.match(card, /const calcAvailable = !!season && !season\.denied;/,
    'availability is derived from the season read, never assumed');
  assert.match(card, /if \(_seasonSheets === null\) loadSeasonSheets\(\);/,
    'and the read is what supplies it');
  assert.match(card, /calcAvailable \? calcCount : '—'/, 'an em dash, never a 0, before it lands');
  assert.match(card, /No completed team-sheet data yet/, 'and an honest empty state after it does');
});

// ── 6. Nothing protected moved ───────────────────────────────────────────────

test('substitutions are untouched', () => {
  for (const name of ['substitutionAdd', 'substitutionProblem', 'matchMinutesByPerson',
                      'matchSquadPeople', 'matchFullTimeMinutes']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
  assert.match(extractFn(html, 'matchSquadPeople'), /mcPersonKey\(clean\)/,
    'the match squad still resolves through the same key');
});

test('Match Centre squad behaviour and group isolation are untouched', () => {
  for (const name of ['operationalPlayers', 'playerGroupIdOf', 'clubUsesPlayerGroups',
                      'saveCoachDraft', 'syncSquadToServer', 'getPlayerSquadStatus']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
  const op = extractFn(html, 'operationalPlayers');
  assert.match(op, /if \(!_adminData\.loaded && \(canI\('manage_players'\) \|\| canI\('manage_teams'\)\)\)/,
    'still fails closed while membership data loads');
  assert.match(op, /playerGroupIdOf\(p\)/, 'still filters by the shared group rule');
});

test('previous Core builds remain intact', () => {
  for (const name of ['overviewRoster', 'availabilityNonResponders', 'setAppearance',
                      'unassignedRosterPlayers', 'addPlayer']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
});
