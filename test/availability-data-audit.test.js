/**
 * BUILD U — the availability data-integrity audit (classification logic).
 *
 * Synthetic worlds only; the production run is a separate read-only script.
 * The audit imports the REAL Build R resolver, so "what production would
 * answer" can never drift from what the audit claims.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.audit.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';
// The lib transitively imports the availability store; kv must never be hit.
globalThis.fetch = async () => { throw new Error('the audit classification must not touch the network'); };

const { auditAvailability, auditScope, clusterRecords, recordAliases } =
  await import('../scripts/availability-audit-lib.mjs');

const UID = 'user_colin_77', INV = 'inv-colin9';
const PROFILES = [
  { userId: UID, teamId: 'club-x', displayName: 'Colin', legacyPlayerId: INV },
  { userId: 'user_two', teamId: 'club-x', displayName: 'Ben', legacyPlayerId: '' },
];
const MEMBERS = [
  { userId: UID, teamId: 'club-x', status: 'active', playerGroupId: 'grp_initial' },
  { userId: 'user_two', teamId: 'club-x', status: 'active', playerGroupId: 'grp_u18' },
];
const IDY = { profiles: PROFILES, members: MEMBERS };
const scope = (store, over = {}) => ({ clubId: 'club-x', kind: 'group', groupId: 'grp_initial', sessionId: 'thu', store, ...over });

const rec = (over = {}) => ({ response: 'available', userId: UID, playerId: UID, legacyPlayerId: INV,
  respondedAt: '2026-09-02T10:00:00.000Z', label: 'Colin', ...over });

// ── 1. clean ───────────────────────────────────────────────────────────────
test('1: a single clean record is CLEAN — never misclassified', () => {
  const [c] = auditScope(scope({ [UID]: rec() }), IDY);
  assert.equal(c.severity, 'clean');
  assert.deepEqual(c.classes, []);
  assert.equal(c.resolverAnswer.response, 'available');
});

// ── 2. duplicates, same answer ─────────────────────────────────────────────
test('2: user + invite duplicates with the SAME answer are benign-legacy, not suspicious', () => {
  const store = { [INV]: rec({ userId: '', playerId: INV, respondedAt: '2026-08-01T09:00:00.000Z' }), [UID]: rec() };
  const [c] = auditScope(scope(store), IDY);
  assert.equal(c.severity, 'benign-legacy');
  assert.ok(c.classes.includes('DUPLICATE_ALIASES'));
  assert.ok(c.classes.includes('DUPLICATE_SAME_ANSWER'));
  assert.ok(!c.classes.includes('CONTRADICTORY'));
});

// ── 3. contradictory ───────────────────────────────────────────────────────
test('3: contradictory duplicates (the Colin pattern) are SUSPICIOUS with an explanation', () => {
  const store = {
    [INV]: rec({ response: 'unavailable', reason: 'injury', userId: '', playerId: INV, respondedAt: '2026-08-20T10:00:00.000Z' }),
    [UID]: rec(),
  };
  const [c] = auditScope(scope(store), IDY);
  assert.equal(c.severity, 'suspicious');
  assert.ok(c.classes.includes('CONTRADICTORY'));
  assert.deepEqual(c.answers.sort(), ['available', 'unavailable']);
  assert.ok(c.why.some(w => /disagree/.test(w)));
});

// ── 4. newest stamped wins in the resolver report ─────────────────────────
test('4: the resolver report shows Build R picking the NEWEST stamped answer', () => {
  const store = {
    [INV]: rec({ response: 'unavailable', userId: '', playerId: INV, respondedAt: '2026-08-20T10:00:00.000Z' }),
    [UID]: rec({ respondedAt: '2026-09-02T10:00:00.000Z' }),
  };
  const [c] = auditScope(scope(store), IDY);
  assert.equal(c.resolverAnswer.response, 'available', 'Build R resolves the newest');
  assert.equal(c.resolverAgreesWithNewest, true, 'and the audit confirms the agreement');
  assert.ok(c.classes.includes('STALE_SHADOW'), 'the shadowed older answer is still flagged');
});

// ── 5. stamped vs unstamped ────────────────────────────────────────────────
test('5: an unstamped record beside a stamped one is flagged, resolver picks the stamped', () => {
  const store = {
    [INV]: rec({ response: 'unavailable', userId: '', playerId: INV, respondedAt: '' }),
    [UID]: rec(),
  };
  const [c] = auditScope(scope(store), IDY);
  assert.ok(c.classes.includes('UNSTAMPED_SHADOW'));
  assert.equal(c.resolverAnswer.response, 'available');
});

// ── 6. many aliases, one person ────────────────────────────────────────────
test('6: three aliases bridge into ONE logical person', () => {
  const store = {
    [UID]: rec(),
    [INV]: rec({ userId: '', playerId: INV, response: 'maybe', respondedAt: '' }),
    'some-old-key': rec({ userId: '', playerId: '', legacyPlayerId: INV, response: 'unavailable', respondedAt: '' }),
  };
  const combos = auditScope(scope(store), IDY);
  assert.equal(combos.length, 1, 'one cluster, not three people');
  assert.equal(combos[0].records.length, 3);
});

// ── 7. similar-looking but different people stay separate ─────────────────
test('7: two different players with distinct identities are NEVER merged', () => {
  const store = {
    [UID]: rec(),
    'user_two': rec({ userId: 'user_two', playerId: 'user_two', legacyPlayerId: '', response: 'unavailable', label: 'Ben' }),
  };
  const combos = auditScope(scope(store), IDY);
  assert.equal(combos.length, 2, 'two people, two combos');
  assert.ok(combos.every(c => !c.classes.includes('CONTRADICTORY')), 'no false contradiction across people');
});

// ── 8. same player, different sessions are independent ────────────────────
test('8: the same player across two sessions yields two independent clean combos', () => {
  const r = auditAvailability([
    scope({ [UID]: rec() }, { sessionId: 'tue' }),
    scope({ [UID]: rec({ response: 'unavailable' }) }, { sessionId: 'thu' }),
  ], IDY);
  assert.equal(r.summary.combos, 2);
  assert.equal(r.summary.clean, 2);
});

// ── 9+10. group placement ─────────────────────────────────────────────────
test('9+10: a record in a group the member does not play in is flagged GROUP_MISMATCH', () => {
  const store = { 'user_two': rec({ userId: 'user_two', playerId: 'user_two', legacyPlayerId: '' }) };
  const [c] = auditScope(scope(store, { groupId: 'grp_initial' }), IDY);  // Ben plays U18
  assert.ok(c.classes.includes('GROUP_MISMATCH'));
  assert.equal(c.severity, 'suspicious');
  assert.ok(c.why.some(w => /may be historical/.test(w)), 'honestly hedged — moves happen');
  const [ok] = auditScope(scope(store, { groupId: 'grp_u18' }), IDY);
  assert.ok(!ok.classes.includes('GROUP_MISMATCH'), 'right group: no flag');
});

// ── 11. legacy scopes ─────────────────────────────────────────────────────
test('11: flat/club legacy records are NOT group-checked (no groupId to check against)', () => {
  const [c] = auditScope(scope({ [UID]: rec() }, { kind: 'flat', groupId: null }), IDY);
  assert.ok(!c.classes.includes('GROUP_MISMATCH'));
  assert.equal(c.severity, 'clean');
});

// ── 12. resolver agreement is computed by the REAL resolver ───────────────
test('12: the audit consumes the real resolver — an identity with no answers resolves to null', () => {
  const [c] = auditScope(scope({ 'ghost-key': { response: 'available' } }), IDY);
  assert.ok(c.classes.includes('ORPHAN_IDENTITY'), 'no roster profile matches');
  assert.equal(c.severity, 'benign-legacy');
});

// ── READ-ONLY PROOFS ──────────────────────────────────────────────────────
test('READ-ONLY: the audit never mutates its input stores (deep-equal before/after)', () => {
  const store = {
    [INV]: rec({ response: 'unavailable', userId: '', playerId: INV }),
    [UID]: rec(),
  };
  const frozen = JSON.parse(JSON.stringify(store));
  auditAvailability([scope(store)], IDY);
  assert.deepEqual(store, frozen, 'byte-identical after the audit');
});

test('READ-ONLY: classification issues NO network calls at all', async () => {
  let calls = 0;
  const prev = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error('no'); };
  try {
    auditAvailability([scope({ [UID]: rec() })], IDY);
  } finally { globalThis.fetch = prev; }
  assert.equal(calls, 0, 'zero fetches — reading is the runner\'s job, writing is nobody\'s');
});

test('READ-ONLY: the audit self-destructs rather than report if its input changed', () => {
  const normal = [{ clubId: 'x', kind: 'flat', groupId: null, sessionId: 'thu', store: { a: rec() } }];
  assert.ok(auditAvailability(normal, IDY).summary, 'normal input reports normally');
  // A store that CHANGES while being audited (a getter mutating on read) must
  // abort the report — the fingerprint tripwire is load-bearing, not decor.
  let reads = 0;
  const boobyTrapped = [{ clubId: 'x', kind: 'flat', groupId: null, sessionId: 'thu',
    store: new Proxy({ a: rec() }, {
      get(t, k) { if (k === 'a') { reads++; if (reads > 1) t.a = { ...t.a, response: 'unavailable' }; } return t[k]; },
      ownKeys(t) { return Reflect.ownKeys(t); },
    }) }];
  assert.throws(() => auditAvailability(boobyTrapped, IDY), /MUTATED ITS INPUT/,
    'a changed input is refused, never reported as truth');
});

// ── the summary counts add up ─────────────────────────────────────────────
test('summary arithmetic: clean + benign + suspicious = combos', () => {
  const r = auditAvailability([
    scope({ [UID]: rec() }, { sessionId: 'tue' }),
    scope({ [INV]: rec({ response: 'unavailable', userId: '', playerId: INV, respondedAt: '2026-08-01T00:00:00Z' }), [UID]: rec() }, { sessionId: 'thu' }),
    scope({ 'ghost': { response: 'available' } }, { sessionId: 'game' }),
  ], IDY);
  assert.equal(r.summary.clean + r.summary.benignLegacy + r.summary.suspicious, r.summary.combos);
  assert.equal(r.summary.contradictory, 1);
  assert.equal(r.summary.records, 4);
});
