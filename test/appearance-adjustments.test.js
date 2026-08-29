/**
 * RC4.8A — Appearance admin corrections.
 *
 * Source of truth stays completed Match Centre selections (calculated client-
 * side). Admin corrections are separate audited adjustment records via
 * /api/publish?resource=appearance-adjustments. These tests prove:
 *
 *  Server (real publish handler, two independent clubs, mocked Upstash):
 *   1. A club admin creates an adjustment; record carries playerId, teamId,
 *      seasonId, amount, reason, createdBy, createdAt (+ optional source).
 *   2. Reason and a sane whole-number amount are mandatory; there is no way
 *      to write a total directly (a "total" payload is rejected).
 *   3. A player cannot create adjustments (403).
 *   4. Tenant isolation: club B never sees or affects club A's adjustments.
 *   5. GET filters by playerId / seasonId.
 *
 *  Client pure layer (extracted from index.html):
 *   6. appearancesCalculated counts published selections on completed fixtures
 *      only — drafts and scheduled fixtures never count; starters + bench count
 *      once per fixture.
 *   7. appearanceVerifiedTotal = calculated + adjustments (floored at 0) — the
 *      calculated number itself is untouched.
 *   8. Audit trail markup keeps calculated and adjustments separate, and the
 *      correction form is admin-gated.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.appearance.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function call(method, query, body, cookie) {
  const r = res();
  await publish({ method, query: { resource: 'appearance-adjustments', ...(query || {}) }, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
let _t = 0;
async function makeClub(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Coach`, email: `c${++_t}@app.test`, password: 'password123' });
}
async function reg(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email: `p${_t}@app.test`, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ token, email: `p${_t}@app.test`, name, password: 'password123' });
}

// ── Server ───────────────────────────────────────────────────────────────────

test('admin creates an audited adjustment with the full record shape', async () => {
  kv.clear(); _t = 0;
  const A = await makeClub('Alpha');
  const created = await call('POST', {}, {
    playerId: 'player-1', seasonId: '2024-25', amount: 12,
    reason: 'Pre-CoachEasier appearances imported from club records', source: 'Club spreadsheet 2024-25',
  }, ck(A.session));
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  const a = created.body.adjustment;
  assert.equal(a.playerId, 'player-1');
  assert.equal(a.teamId, A.team.id);
  assert.equal(a.seasonId, '2024-25');
  assert.equal(a.amount, 12);
  assert.equal(a.reason, 'Pre-CoachEasier appearances imported from club records');
  assert.equal(a.source, 'Club spreadsheet 2024-25');
  assert.equal(a.createdBy, A.user.id);
  assert.ok(a.createdAt && !Number.isNaN(Date.parse(a.createdAt)), 'createdAt is a timestamp');
  assert.ok(a.id, 'record has an id');
});

test('validation: reason mandatory, amount whole/non-zero/bounded, no direct total overwrite', async () => {
  kv.clear(); _t = 0;
  const A = await makeClub('Alpha');
  const c = ck(A.session);
  assert.equal((await call('POST', {}, { playerId: 'p1', seasonId: '2024-25', amount: 5 }, c)).statusCode, 400, 'missing reason rejected');
  assert.equal((await call('POST', {}, { playerId: 'p1', seasonId: '2024-25', amount: 0, reason: 'x' }, c)).statusCode, 400, 'zero rejected');
  assert.equal((await call('POST', {}, { playerId: 'p1', seasonId: '2024-25', amount: 2.5, reason: 'x' }, c)).statusCode, 400, 'fraction rejected');
  assert.equal((await call('POST', {}, { playerId: 'p1', seasonId: '2024-25', amount: 999, reason: 'x' }, c)).statusCode, 400, 'oversized rejected');
  assert.equal((await call('POST', {}, { playerId: 'p1', seasonId: '', amount: 3, reason: 'x' }, c)).statusCode, 400, 'missing season rejected');
  // Attempting to write a total directly is not a supported shape — rejected.
  assert.equal((await call('POST', {}, { playerId: 'p1', seasonId: '2024-25', total: 40, reason: 'set total' }, c)).statusCode, 400, 'no direct total overwrite');
});

test('players cannot create adjustments', async () => {
  kv.clear(); _t = 0;
  const A = await makeClub('Alpha');
  const player = await reg(A.team.id, 'Alpha Player');
  const denied = await call('POST', {}, { playerId: 'p1', seasonId: '2024-25', amount: 1, reason: 'nope' }, ck(player.session));
  assert.equal(denied.statusCode, 403);
});

test('tenant isolation: club B cannot see or write club A adjustments', async () => {
  kv.clear(); _t = 0;
  const A = await makeClub('Alpha');
  const B = await makeClub('Bravo');
  await call('POST', {}, { playerId: 'shared-player-id', seasonId: '2024-25', amount: 7, reason: 'Alpha import' }, ck(A.session));

  const seenByB = await call('GET', {}, null, ck(B.session));
  assert.equal(seenByB.body.adjustments.length, 0, 'club B sees none of club A');

  await call('POST', {}, { playerId: 'shared-player-id', seasonId: '2024-25', amount: 3, reason: 'Bravo import' }, ck(B.session));
  const seenByA = await call('GET', {}, null, ck(A.session));
  assert.equal(seenByA.body.adjustments.length, 1, 'club A still has exactly its own record');
  assert.equal(seenByA.body.adjustments[0].amount, 7);
  assert.equal(seenByA.body.adjustments[0].teamId, A.team.id);
  // Storage really is separate keys.
  assert.ok(kv.has(`app:appearance_adj:${A.team.id}`));
  assert.ok(kv.has(`app:appearance_adj:${B.team.id}`));
});

test('GET filters by playerId and seasonId', async () => {
  kv.clear(); _t = 0;
  const A = await makeClub('Alpha');
  const c = ck(A.session);
  await call('POST', {}, { playerId: 'p1', seasonId: '2023-24', amount: 4, reason: 'r1' }, c);
  await call('POST', {}, { playerId: 'p1', seasonId: '2024-25', amount: 2, reason: 'r2' }, c);
  await call('POST', {}, { playerId: 'p2', seasonId: '2024-25', amount: 1, reason: 'r3' }, c);
  assert.equal((await call('GET', { playerId: 'p1' }, null, c)).body.count, 2);
  assert.equal((await call('GET', { seasonId: '2024-25' }, null, c)).body.count, 2);
  assert.equal((await call('GET', { playerId: 'p1', seasonId: '2024-25' }, null, c)).body.count, 1);
});

// ── Client pure layer ────────────────────────────────────────────────────────

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = src.indexOf('{', start);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}
// UPDATED for the identity reconciliation. appearancesCalculated used to take
// state.squadSelections and key by the ROSTER ROW id. Both were wrong for a
// season total: squadSelections is written only by an unreachable screen and
// never reaches a server (so it was empty for every player in every club), and
// the roster row id disagrees with the key substitutions use for anyone holding
// an account. It now takes MATCH SHEETS and keys by the canonical identity, so
// appearances and minutes can be added together.
//
// The invariants that still apply are unchanged and still asserted below: only
// COMPLETED fixtures count, one sheet counts per fixture, and season derivation
// is untouched. "Draft never counts" moved to the caller — a sheet handed to
// this function is by definition the published record for that fixture.
const { appearanceSeasonId, appearancesCalculated, appearanceVerifiedTotal, playerMatchKey, mcPersonKey } =
  new Function(`"use strict";
  const state = { players: [
    { id: 'p1', name: 'One Player',   userId: 'u1' },
    { id: 'p2', name: 'Two Player',   userId: 'u2' },
    { id: 'p3', name: 'Three Player' },
  ] };
  function findPlayerByName(n) { const w = String(n || '').trim().toLowerCase();
    return state.players.find(p => String(p.name || '').trim().toLowerCase() === w) || null; }
  ${(() => { const i = src.indexOf('    const MATCH_MINUTES_DEFAULT '); return src.slice(i, src.indexOf(';', i) + 1); })()}
  ${extractFn('playerMatchKey')}
  ${extractFn('mcPersonKey')}
  ${extractFn('appearanceSeasonId')}
  ${extractFn('fixtureHasBeenPlayed')}
  ${extractFn('matchMinuteValue')}
  ${extractFn('seasonPlayerStats')}
  ${extractFn('appearancesCalculated')}
  ${extractFn('appearanceVerifiedTotal')}
  return { appearanceSeasonId, appearancesCalculated, appearanceVerifiedTotal, playerMatchKey, mcPersonKey };
`)();

test('calculated appearances: completed fixtures only, once per fixture, canonical identity', () => {
  const fixtures = [
    { id: 'f1', opposition: 'Old Boys', date: '2025-09-06', status: 'completed' },
    { id: 'f2', opposition: 'Harbour',  date: '2025-09-13', status: 'completed' },
    // Genuinely in the future. "Played" is now the shared date-based rule
    // (fixtureHasBeenPlayed), because nothing ever writes 'completed' to the
    // server — so a past date counts however the record is labelled.
    { id: 'f3', opposition: 'Future',   date: '2099-09-20', status: 'scheduled' },
  ];
  const sheets = [
    { fixtureId: 'f1', formationNames: { '10': 'One Player', '9': 'Two Player' }, benchPlayers: ['Three Player', '', ''] },
    { fixtureId: 'f1', formationNames: { '10': 'One Player' }, benchPlayers: [] },   // second sheet for f1 → never double-counts
    { fixtureId: 'f3', formationNames: { '10': 'One Player' }, benchPlayers: [] },   // fixture not completed → never counts
  ];
  const { byPlayer, matches } = appearancesCalculated(fixtures, sheets, '2025-08-01', '2026-05-31');
  // Keyed by the DURABLE identity where there is one, the roster id otherwise.
  //
  // 'Three Player' is on the BENCH and no substitution brought them on, so they
  // have a bench appearance but NOT an appearance — being named is not playing.
  // That is the season model's rule and it is stricter than the old count,
  // which credited anyone written on the sheet.
  assert.deepEqual(byPlayer, { 'id:u1': 1, 'id:u2': 1, 'id:p3': 0 });
  assert.equal(matches.length, 1, 'one completed fixture, counted once');
  assert.equal(matches[0].seasonId, '2025-26');
  assert.deepEqual(matches[0].playerIds.sort(), ['id:p3', 'id:u1', 'id:u2']);
});

test('verified total combines calculated + adjustments without touching calculated', () => {
  const adjs = [{ amount: 12 }, { amount: -2 }];
  assert.equal(appearanceVerifiedTotal(5, adjs), 15);
  assert.equal(appearanceVerifiedTotal(5, []), 5);
  assert.equal(appearanceVerifiedTotal(1, [{ amount: -10 }]), 0, 'floored at zero');
  assert.equal(appearanceVerifiedTotal(5, [{ amount: 1.5 }]), 5, 'non-integer adjustment amounts ignored');
});

test('season id derivation: inside window uses season years, outside falls back to calendar year', () => {
  assert.equal(appearanceSeasonId('2025-10-04', '2025-08-01', '2026-05-31'), '2025-26');
  assert.equal(appearanceSeasonId('2024-03-01', '2025-08-01', '2026-05-31'), '2024');
  assert.equal(appearanceSeasonId('', '', ''), 'unknown');
});

test('audit trail separates calculated from adjustments; correction form is admin-gated', () => {
  // "selections" named the retired state.squadSelections model; appearances now
  // come from published Match Centre TEAM SHEETS. The label follows the model —
  // the separation this test guards is unchanged.
  assert.match(src, /Calculated — completed Match Centre team sheets/, 'calculated section labelled');
  assert.match(src, /Historical adjustments \(/, 'adjustments section labelled');
  assert.match(src, /canI\('manage_teams'\) \? `\s*\n?\s*<details/, 'correction form behind manage_teams');
  assert.match(src, /never overwritten/i, 'no-overwrite principle stated in UI copy');
});
