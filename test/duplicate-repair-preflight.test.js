/**
 * DUPLICATE-PLAYER REPAIR PREFLIGHT (Build 136E tooling) — the refusal logic.
 *
 * Exercises scripts/duplicate-repair-lib.mjs and its CLI with a SYNTHETIC
 * snapshot: no production data, no names of real people, no network, no
 * credentials. The rule under test throughout is that a missing or ambiguous
 * answer, a conflicting record or an unknown reference produces a REFUSAL,
 * never a guess — and that nothing here can write.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildManifest, findPairs, findStaffWithPlayMarks, requiredConfirmations, validateConfirmations, validateSnapshot,
  hashValue, hashStore, canonicalJson, fold, maskEmail, publishReferences,
  SNAPSHOT_SCHEMA, CONFIRMATIONS_SCHEMA, MANIFEST_SCHEMA, MERGE_REMOVED_BY, PLAN_DATE, EVIDENCE_MIN_ANSWERS,
} from '../scripts/duplicate-repair-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.parse('2026-10-12T10:00:00Z');
const iso = ms => new Date(ms).toISOString();
const CLUB = 'club_t', GRP = 'grp_1';

function snapshot() {
  const avail = {
    [`app:availability:${CLUB}:fx_1`]: {
      u_keep: { userId: 'u_keep', playerId: 'u_keep', legacyPlayerId: 'u_keep', response: 'available', respondedAt: iso(NOW - 5 * 86400_000) },
      u_dup:  { userId: 'u_dup',  playerId: 'u_dup',  legacyPlayerId: 'u_dup',  response: 'available', respondedAt: iso(NOW - 4 * 86400_000) },   // same answer: a duplicate, not a conflict
      u_other: { userId: 'u_other', response: 'maybe', respondedAt: iso(NOW - 5 * 86400_000) },
    },
    [`app:availability:${CLUB}:fx_2`]: { u_dup: { userId: 'u_dup', response: 'unavailable', respondedAt: iso(NOW - 2 * 86400_000) } },
  };
  for (let i = 0; i < 12; i++) avail[`app:availability:${CLUB}:slot_c${i}`] = { u_coach: { userId: 'u_coach', response: 'available', respondedAt: iso(NOW - (i + 1) * 86400_000) } };
  return {
    schema: SNAPSHOT_SCHEMA, takenAt: iso(NOW - 10 * 60_000), club: CLUB, keyPrefix: 'app', source: 'test fixture',
    users: [
      { id: 'u_keep', email: 'alex@example.test', displayName: 'Alex Example', createdAt: '2026-08-16T10:00:00Z', lastLoginAt: '2026-10-04T10:00:00Z' },
      { id: 'u_dup', email: 'alex2@example.test', displayName: 'Alex Example', createdAt: '2026-09-23T10:00:00Z', lastLoginAt: null },
      { id: 'u_other', email: 'bobby@example.test', displayName: 'Bobby Other', createdAt: '2026-08-01T10:00:00Z' },
      { id: 'u_staff', email: 'casey@example.test', displayName: 'Casey Staff', createdAt: '2026-08-01T10:00:00Z' },
      { id: 'u_coach', email: 'dana@example.test', displayName: 'Dana Coach', createdAt: '2026-08-01T10:00:00Z' },
    ],
    team_members: [
      { id: 'tm_keep', teamId: CLUB, userId: 'u_keep', role: 'player', status: 'active', playerGroupId: GRP, approvedBy: 'invite' },
      { id: 'tm_dup', teamId: CLUB, userId: 'u_dup', role: 'player', status: 'active', playerGroupId: GRP, approvedBy: 'invite' },
      { id: 'tm_other', teamId: CLUB, userId: 'u_other', role: 'player', status: 'active', playerGroupId: GRP },
      { id: 'tm_staff', teamId: CLUB, userId: 'u_staff', role: 'admin', staffLevel: 'assistant', status: 'active', playerGroupId: GRP, accessChangedBy: 'invite', accessChangedAt: '2026-09-01T10:00:00Z' },
      { id: 'tm_coach', teamId: CLUB, userId: 'u_coach', role: 'coach', staffLevel: 'assistant', status: 'active', playerGroupId: GRP, accessChangedBy: 'user_admin' },
    ],
    player_profiles: [
      { id: 'pp_keep', teamId: CLUB, userId: 'u_keep', displayName: 'Alex Example', legacyPlayerId: 'u_keep' },
      { id: 'pp_dup', teamId: CLUB, userId: 'u_dup', displayName: 'Alex Example', legacyPlayerId: 'u_dup' },
      { id: 'pp_other', teamId: CLUB, userId: 'u_other', displayName: 'Bobby Other', legacyPlayerId: 'u_other' },
      { id: 'pp_coach', teamId: CLUB, userId: 'u_coach', displayName: 'Dana Coach', legacyPlayerId: 'u_coach' },
    ],
    sessions: [
      { id: 'sess_dup1', userId: 'u_dup', teamId: CLUB, lastSeenAt: '2026-10-06T10:00:00Z' },
      { id: 'sess_keep1', userId: 'u_keep', teamId: CLUB, lastSeenAt: '2026-10-04T10:00:00Z' },
    ],
    roster: { players: [
      { id: 'u_keep', userId: 'u_keep', legacyPlayerId: 'u_keep', name: 'Alex Example', position: 'TBC', avail_fx_1: 'available' },
      { id: 'u_dup', userId: 'u_dup', legacyPlayerId: 'u_dup', name: 'Alex Example', position: '4 — Lock', avail_fx_1: 'available' },
      { id: 'u_other', userId: 'u_other', legacyPlayerId: 'u_other', name: 'Bobby Other', position: 'Prop' },
      { id: 'u_coach', userId: 'u_coach', legacyPlayerId: 'u_coach', name: 'Dana Coach', position: 'Wing' },
    ] },
    subscriptions: [
      { userId: 'u_dup', playerId: 'u_dup', legacyPlayerId: 'u_dup', label: 'phone', subscription: { endpoint: 'https://push.example/endpoint/dup-device-0001' } },
      { userId: 'u_keep', playerId: 'u_keep', legacyPlayerId: 'u_keep', label: 'phone', subscription: { endpoint: 'https://push.example/endpoint/keep-device-0001' } },
    ],
    availability: avail,
    publish: {
      [`app:publish:${CLUB}:fixture:fx_1:squad`]: { formationKeys: { 2: 'id:u_other', 13: 'id:u_dup' }, benchKeys: ['id:u_keep'], updatedBy: 'user_admin' },
      [`app:publish:${CLUB}:fixture:fx_2:coachsheet`]: { benchKeys: ['id:u_other', 'id:u_dup'] },
    },
    medical: {},
    messages: [],
  };
}
const pairRecord = (over = {}) => ({ slot: 'pair:alex-example', kind: 'pair', person: 'Alex Example', relationship: 'same', keepUserId: 'u_keep', duplicateUserId: 'u_dup',
  confirmedBy: 'Head coach (test)', confirmedAt: iso(NOW - 3600_000), channel: 'in person', ...over });
const staffRecord = (over = {}) => ({ slot: 'staff:u_staff', kind: 'staff', person: 'Casey Staff', decision: 'clear_plays_for', confirmedBy: 'Head coach (test)', confirmedAt: iso(NOW - 3600_000), ...over });
const confirmations = (records = [pairRecord(), staffRecord()]) => ({ schema: CONFIRMATIONS_SCHEMA, records });
const run = (snap = snapshot(), conf = confirmations(), opts = {}) => buildManifest(snap, conf, { now: NOW, ...opts });
const blockersOf = m => m.blockers.join('\n');

// ── the happy path: a complete, consistent snapshot with every answer recorded ──
test('a complete snapshot with all answers recorded yields a ready manifest, and nothing in it is a write', () => {
  const snap = snapshot();
  const m = run(snap);
  assert.equal(m.ok, true, blockersOf(m));
  assert.equal(m.schema, MANIFEST_SCHEMA);
  assert.equal(m.authorizesWrites, false); assert.equal(m.rereadRequired, true);
  assert.deepEqual(m.required, { pairs: ['pair:alex-example'], staff: ['staff:u_staff'], evidencedStaff: ['staff:u_coach'] });
  const p = m.pairs[0];
  assert.equal(p.status, 'ready'); assert.equal(p.keepUserId, 'u_keep'); assert.equal(p.duplicateUserId, 'u_dup');
  assert.equal(p.duplicateAnswers, 1, 'the identical fx_1 answer is a duplicate, not a conflict'); assert.deepEqual(p.conflicts, []);
  const by = Object.fromEntries(p.writes.map(w => [w.store, w]));
  assert.deepEqual(by['identity:player_profiles'].changes, [
    { target: { profileId: 'pp_keep' }, before: { legacyPlayerId: 'u_keep' }, after: { legacyPlayerId: 'u_dup' } },
    { target: { profileId: 'pp_dup' }, before: { exists: true, userId: 'u_dup' }, after: { exists: false } }]);
  assert.deepEqual(by['identity:team_members'].changes[0].after, { status: 'removed', removedAt: '<set at execution>', removedBy: MERGE_REMOVED_BY, mergedInto: 'u_keep' });
  assert.deepEqual(by['identity:sessions'].changes.map(c => c.target.sessionId), ['sess_dup1']);
  assert.deepEqual(by[`roster:${CLUB}`].changes[0], { target: { rowId: 'u_keep' }, before: { legacyPlayerId: 'u_keep', position: 'TBC' }, after: { legacyPlayerId: 'u_dup', position: '4 — Lock' } });
  assert.deepEqual(by[`roster:${CLUB}`].changes[1].after, { exists: false });
  assert.match(by[`roster:${CLUB}`].mechanism, /RE-READ IMMEDIATELY BEFORE WRITING/);
  assert.deepEqual(by.subscriptions.changes.map(c => c.target.endpointTail), ['endpoint/dup-device-0001'.slice(-24)]);
  const repoints = p.writes.filter(w => w.store === 'publish');
  assert.deepEqual(repoints.map(w => [w.key.split(':').slice(-2).join(':'), w.changes[0].target.path, w.changes[0].before, w.changes[0].after]),
    [['fx_1:squad', 'formationKeys.13', 'id:u_dup', 'id:u_keep'], ['fx_2:coachsheet', 'benchKeys[1]', 'id:u_dup', 'id:u_keep']]);
  // every write names the hash a re-read must match
  assert.equal(by['identity:player_profiles'].precondition.sha256, hashStore(snap.player_profiles));
  assert.equal(by['identity:team_members'].precondition.sha256, hashStore(snap.team_members));
  assert.equal(by[`roster:${CLUB}`].precondition.sha256, hashStore(snap.roster));
  assert.notEqual(hashStore(snap.team_members), hashStore(snap.team_members.map(m => ({ ...m, status: 'removed' }))), 'any changed record changes the hash');
  assert.equal(hashStore(snap.team_members), hashStore([...snap.team_members].reverse()), 'record order does not');
  assert.notEqual(hashStore({ benchKeys: ['id:a', 'id:b'] }), hashStore({ benchKeys: ['id:b', 'id:a'] }), 'but a sheet record is positional and keeps its order');
  for (const w of p.writes) assert.match(w.precondition.sha256, /^[0-9a-f]{64}$/);
  // users / availability / medical / messages never appear
  assert.ok(p.writes.every(w => !/users|availability|medical|chat/.test(w.store)));
  // staff: the invite-stamped admin is cleared through the admin action; the evidenced player-coach needs no question
  assert.equal(m.staff.length, 1); assert.equal(m.staff[0].status, 'ready');
  assert.match(m.staff[0].writes[0].mechanism, /set_player_group/);
  assert.deepEqual(m.staff[0].writes[0].changes[0], { target: { membershipId: 'tm_staff' }, before: { playerGroupId: GRP }, after: { playerGroupId: null } });
  assert.equal(m.evidencedStaff.length, 1); assert.equal(m.evidencedStaff[0].status, 'no_question_evidenced_player'); assert.equal(m.evidencedStaff[0].userId, 'u_coach');
  assert.deepEqual(m.summary, { pairsReady: 1, pairsNoActionByDecision: 0, pairsBlocked: 0, staffClear: 1, staffKeep: 0, evidencedStaffNoQuestion: 1, writes: 10 });
  assert.ok(m.writeProtocol.some(l => /re-read/i.test(l)));
});

test('the manifest is deterministic: same inputs twice, and inputs in any order, give byte-identical output', () => {
  const a = JSON.stringify(run()), b = JSON.stringify(run());
  assert.equal(a, b);
  const shuffled = snapshot();
  shuffled.users.reverse(); shuffled.team_members.reverse(); shuffled.player_profiles.reverse(); shuffled.roster.players.reverse(); shuffled.subscriptions.reverse(); shuffled.sessions.reverse();
  shuffled.publish = Object.fromEntries(Object.entries(shuffled.publish).reverse());
  shuffled.availability = Object.fromEntries(Object.entries(shuffled.availability).reverse());
  const c = JSON.stringify(run(shuffled, confirmations([staffRecord(), pairRecord()])));
  assert.equal(c, a);
  assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
  assert.equal(hashValue({ b: 1, a: 2 }), hashValue({ a: 2, b: 1 }));
});

// ── confirmations: missing, incomplete, ambiguous ──
test('a pair with no recorded answer blocks — the proposal is never inferred from names, emails or matching answers', () => {
  const m = run(snapshot(), confirmations([staffRecord()]));
  assert.equal(m.ok, false);
  assert.match(blockersOf(m), /missing confirmation for pair:alex-example \("alex example"\)/);
  assert.equal(m.pairs[0].status, 'blocked'); assert.deepEqual(m.pairs[0].writes, []);
});
test('a staff mark with no recorded answer blocks', () => {
  const m = run(snapshot(), confirmations([pairRecord()]));
  assert.equal(m.ok, false); assert.match(blockersOf(m), /missing confirmation for staff:u_staff \(Casey Staff\)/);
});
test('incomplete confirmation data blocks: no confirming human, no date, a future date, a date before the plan, no person', () => {
  for (const [over, re] of [
    [{ confirmedBy: '' }, /confirmedBy .* is required/], [{ confirmedAt: undefined }, /confirmedAt must be an ISO date/], [{ confirmedAt: 'yesterday' }, /ISO date/],
    [{ confirmedAt: iso(NOW + 60_000) }, /in the future/], [{ confirmedAt: '2026-10-01T00:00:00Z' }, new RegExp(`predates the repair plan \\(${PLAN_DATE}\\)`)], [{ person: '' }, /person is required/],
  ]) {
    const m = run(snapshot(), confirmations([pairRecord(over), staffRecord()]));
    assert.equal(m.ok, false, JSON.stringify(over)); assert.match(blockersOf(m), re);
    assert.deepEqual(m.pairs[0].writes, [], 'a blocked manifest proposes nothing for the pair');
  }
});
test('ambiguous identity decisions block: same id twice, an id outside the pair, missing ids, an unknown relationship or decision', () => {
  for (const [over, re] of [
    [{ duplicateUserId: 'u_keep' }, /the same account/], [{ keepUserId: 'u_other' }, /keepUserId is not one of this pair/], [{ duplicateUserId: 'u_nobody' }, /duplicateUserId is not one of this pair/],
    [{ keepUserId: '' }, /required when relationship is "same"/], [{ relationship: 'probably' }, /relationship must be one of same\/different\/unknown/],
  ]) {
    const m = run(snapshot(), confirmations([pairRecord(over), staffRecord()]));
    assert.equal(m.ok, false, JSON.stringify(over)); assert.match(blockersOf(m), re);
  }
  const m = run(snapshot(), confirmations([pairRecord(), staffRecord({ decision: 'maybe' })]));
  assert.equal(m.ok, false); assert.match(blockersOf(m), /decision must be one of clear_plays_for\/keep_plays_for/);
});
test('a record for an unknown slot, a second record for one slot, or the wrong kind blocks (fail closed on surprises too)', () => {
  let m = run(snapshot(), confirmations([pairRecord(), staffRecord(), staffRecord({ slot: 'staff:u_other', person: 'Bobby Other' })]));
  assert.equal(m.ok, false); assert.match(blockersOf(m), /unknown slot/);
  m = run(snapshot(), confirmations([pairRecord(), pairRecord(), staffRecord()]));
  assert.equal(m.ok, false); assert.match(blockersOf(m), /duplicate record for this slot/);
  m = run(snapshot(), confirmations([pairRecord({ kind: 'staff' }), staffRecord()]));
  assert.equal(m.ok, false); assert.match(blockersOf(m), /kind must be "pair"/);
  m = run(snapshot(), { schema: 'something-else', records: [pairRecord(), staffRecord()] });
  assert.equal(m.ok, false); assert.match(blockersOf(m), /confirmations.schema/);
});
test('"different" and "unknown" are recorded answers that leave the pair untouched — no writes, not a blocker', () => {
  for (const rel of ['different', 'unknown']) {
    const m = run(snapshot(), confirmations([pairRecord({ relationship: rel, keepUserId: undefined, duplicateUserId: undefined }), staffRecord()]));
    assert.equal(m.ok, true, blockersOf(m));
    assert.equal(m.pairs[0].status, 'no_action_by_decision'); assert.deepEqual(m.pairs[0].writes, []);
    assert.equal(m.summary.pairsNoActionByDecision, 1); assert.equal(m.summary.pairsReady, 0);
  }
});

// ── the records themselves ──
test('an availability conflict (different answers for one record) blocks the pair and is never resolved by "newest wins"', () => {
  const snap = snapshot();
  snap.availability[`app:availability:${CLUB}:fx_1`].u_dup.response = 'unavailable';
  snap.availability[`app:availability:${CLUB}:fx_1`].u_dup.respondedAt = iso(NOW - 60_000);   // newer than the kept answer — still a conflict
  const m = run(snap);
  assert.equal(m.ok, false); assert.match(blockersOf(m), /availability conflict in app:availability:club_t:fx_1: kept answered "available", duplicate answered "unavailable"/);
  assert.equal(m.pairs[0].status, 'blocked'); assert.deepEqual(m.pairs[0].writes, []);
  assert.equal(m.pairs[0].conflicts.length, 1);
});
test('a stale or future-dated snapshot blocks', () => {
  let snap = snapshot(); snap.takenAt = iso(NOW - 7 * 3600_000);
  let m = run(snap); assert.equal(m.ok, false); assert.match(blockersOf(m), /stale — taken 420 min ago, limit 6 h/);
  m = run(snap, confirmations(), { maxAgeHours: 8 }); assert.equal(m.ok, true, 'the window is explicit');
  snap = snapshot(); snap.takenAt = iso(NOW + 60_000);
  m = run(snap); assert.equal(m.ok, false); assert.match(blockersOf(m), /takenAt is in the future/);
});
test('a malformed or incomplete snapshot blocks before anything is inspected', () => {
  assert.deepEqual(validateSnapshot(snapshot()), []);
  for (const mutate of [s => { delete s.medical; }, s => { delete s.messages; }, s => { s.schema = 'x'; }, s => { delete s.takenAt; }, s => { s.club = ''; }, s => { s.roster = {}; }, s => { s.team_members = {}; }]) {
    const snap = snapshot(); mutate(snap);
    const m = run(snap);
    assert.equal(m.ok, false); assert.ok(m.blockers.every(b => b.startsWith('snapshot: ')), blockersOf(m));
    assert.deepEqual(m.pairs, [], 'nothing is proposed from a snapshot that cannot be trusted');
  }
});
test('a reference to the duplicate the plan does not know how to re-point blocks: other publish paths, key names, medical, messages', () => {
  let snap = snapshot(); snap.publish[`app:publish:${CLUB}:squad:current:${GRP}`] = { players: [{ id: 'u_dup', name: 'Alex Example' }] };
  let m = run(snap); assert.equal(m.ok, false); assert.match(blockersOf(m), /unexpected reference to the duplicate in app:publish:club_t:squad:current:grp_1 at \$\.players\[0\]\.id: u_dup/);
  snap = snapshot(); snap.publish[`app:publish:${CLUB}:fixture:fx_1:draft:u_dup`] = { formationKeys: {} };
  m = run(snap); assert.equal(m.ok, false); assert.match(blockersOf(m), /at \(key name\)/);
  snap = snapshot(); snap.publish[`app:publish:${CLUB}:fixture:fx_1:squad`].updatedBy = 'u_dup';
  m = run(snap); assert.equal(m.ok, false); assert.match(blockersOf(m), /\$\.updatedBy: u_dup/);
  snap = snapshot(); snap.medical[`app:medical:${CLUB}`] = { cases: [{ playerId: 'u_dup' }] };
  m = run(snap); assert.equal(m.ok, false); assert.match(blockersOf(m), /medical record .* names the duplicate/);
  snap = snapshot(); snap.messages = ['app:chat:conv:dm:u_dup:u_other:msgs'];
  m = run(snap); assert.equal(m.ok, false); assert.match(blockersOf(m), /message thread .* names the duplicate/);
  // the two sheet positions ARE re-pointable, and only those
  const refs = publishReferences(snapshot(), new Set(['u_dup']), 'u_keep');
  assert.equal(refs.unexpected.length, 0); assert.equal(refs.repoints.length, 2);
});
test('membership and profile anomalies block: not active, already merged, another club, a staff role, a third account, an existing alias, a stray row', () => {
  const cases = [
    // a duplicate whose membership is already removed is no longer an active pair: the recorded answer then names a slot the data does not have
    [s => { s.team_members[1].status = 'removed'; }, /unknown slot — not a pair or staff mark found in this snapshot/],
    [s => { s.team_members.push({ id: 'tm_dup_old', teamId: CLUB, userId: 'u_dup', role: 'player', status: 'removed' }); }, /duplicate account has 2 memberships in this club \(expected exactly 1\)/],
    [s => { s.team_members[1].mergedInto = 'u_someone'; }, /already carries mergedInto/],
    [s => { s.team_members.push({ id: 'tm_x', teamId: 'club_other', userId: 'u_keep', role: 'player', status: 'active' }); }, /kept account has 1 membership\(s\) in another club/],
    [s => { s.team_members[1].role = 'coach'; }, /is a coach role — staff merges are out of scope/],
    [s => { s.users.push({ id: 'u_third', email: 'a3@example.test', displayName: 'Alex Example' }); s.team_members.push({ id: 'tm_third', teamId: CLUB, userId: 'u_third', role: 'player', status: 'active' }); }, /has 3 active accounts — a merge is only defined for exactly two/],
    [s => { s.player_profiles[0].legacyPlayerId = 'inv-legacy-xyz'; }, /kept profile pp_keep already aliases inv-legacy-xyz/],
    [s => { s.roster.players.push({ id: 'row_x', userId: 'u_other', legacyPlayerId: 'u_dup', name: 'Bobby Other' }); }, /roster row row_x \(account u_other\) aliases the duplicate/],
    [s => { s.sessions.push({ id: 'sess_x', userId: 'u_dup', teamId: 'club_other' }); }, /holds a session for another club/],
    [s => { s.player_profiles.splice(1, 1); }, /duplicate account has 0 player profiles/],
    [s => { s.roster.players.splice(0, 1); }, /kept account has 0 roster rows/],
    [s => { s.users.splice(1, 1); }, /duplicate account u_dup has no user record/],
  ];
  for (const [mutate, re] of cases) {
    const snap = snapshot(); mutate(snap);
    const m = run(snap);
    assert.equal(m.ok, false, re.source); assert.match(blockersOf(m), re);
    assert.ok(m.pairs.every(p => p.writes.length === 0), 'blocked pairs propose nothing');
  }
});

// ── who must answer is derived from data, not from a list of names ──
test('required confirmations come from the snapshot: every 2+-account name, every staff mark without play evidence', () => {
  const snap = snapshot();
  const req = requiredConfirmations(snap, { now: NOW });
  assert.deepEqual(req.pairs.map(p => p.slot), ['pair:alex-example']);
  assert.deepEqual(req.pairs[0].accounts.map(a => a.userId), ['u_dup', 'u_keep'], 'accounts are listed in a stable order');
  assert.deepEqual(req.staff.map(x => x.slot), ['staff:u_staff']);
  assert.deepEqual(req.evidencedStaff.map(x => [x.slot, x.answers.count]), [['staff:u_coach', 12]]);
  // the same 12 answers, but the latest 60 days ago → no longer evidence, a question is required
  const old = snapshot();
  for (const k of Object.keys(old.availability)) if (k.includes('slot_c')) old.availability[k].u_coach.respondedAt = iso(NOW - 60 * 86400_000);
  assert.deepEqual(requiredConfirmations(old, { now: NOW }).staff.map(x => x.slot), ['staff:u_coach', 'staff:u_staff']);
  assert.equal(run(old).ok, false, 'and the manifest blocks until that answer is recorded');
  // fewer than the threshold → a question is required
  const few = snapshot();
  for (let i = EVIDENCE_MIN_ANSWERS - 1; i < 12; i++) delete few.availability[`app:availability:${CLUB}:slot_c${i}`];
  assert.ok(requiredConfirmations(few, { now: NOW }).staff.some(x => x.slot === 'staff:u_coach'));
  // a recorded answer for an evidenced person is honoured
  const m = run(snapshot(), confirmations([pairRecord(), staffRecord(), staffRecord({ slot: 'staff:u_coach', person: 'Dana Coach' })]));
  assert.equal(m.ok, true, blockersOf(m)); assert.equal(m.staff.length, 2); assert.equal(m.evidencedStaff.length, 0);
  assert.equal(m.staff.find(x => x.slot === 'staff:u_coach').status, 'ready');
  // a staff member without a mark is nobody's business here
  assert.ok(!findStaffWithPlayMarks(snapshot(), { now: NOW }).some(x => x.userId === 'u_other'));
  // a 'keep' answer proposes nothing
  const keep = run(snapshot(), confirmations([pairRecord(), staffRecord({ decision: 'keep_plays_for' })]));
  assert.equal(keep.ok, true); assert.deepEqual(keep.staff[0].writes, []); assert.equal(keep.summary.staffKeep, 1);
});
test('name folding matches the audit that found the pairs; emails are masked in output', () => {
  assert.equal(fold('  Gaétan  VAN-AKEN '), 'gaetan van aken');
  assert.equal(findPairs(snapshot())[0].slot, 'pair:alex-example');
  const snap = snapshot(); snap.player_profiles[1].displayName = 'ALEX   Éxample';
  assert.equal(findPairs(snap).length, 1, 'accents, case and spacing fold');
  assert.match(maskEmail('Alex@Example.test'), /^a\*\*\*@example\.test #[0-9a-f]{6}$/);
  const m = run();
  assert.ok(JSON.stringify(m).includes('a***@example.test'));
  assert.ok(!JSON.stringify(m).includes('alex@example.test'), 'no raw email reaches the manifest');
});
test('validateConfirmations reports every problem at once, so the human fixes the file in one pass', () => {
  const req = requiredConfirmations(snapshot(), { now: NOW });
  const { errors } = validateConfirmations(req, confirmations([pairRecord({ confirmedBy: '', keepUserId: 'u_dup' })]), { now: NOW });
  assert.ok(errors.length >= 3, errors.join('\n'));
  assert.ok(errors.some(e => /confirmedBy/.test(e)) && errors.some(e => /the same account/.test(e)) && errors.some(e => /missing confirmation for staff:u_staff/.test(e)));
});

// ── the CLI, and the proof that nothing here can reach production ──
test('CLI: exit 0 with a clean manifest, exit 1 when blocked (manifest still printed), exit 2 on usage; --out is mode 600', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-preflight-'));
  try {
    const snapPath = path.join(dir, 'snapshot.json'), confPath = path.join(dir, 'confirmations.json'), outPath = path.join(dir, 'manifest.json');
    fs.writeFileSync(snapPath, JSON.stringify(snapshot())); fs.writeFileSync(confPath, JSON.stringify(confirmations()));
    const cli = path.join(ROOT, 'scripts', 'duplicate-repair-preflight.mjs');
    const nowIso = iso(NOW);
    let r = spawnSync(process.execPath, [cli, '--snapshot', snapPath, '--confirmations', confPath, '--now', nowIso, '--out', outPath], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const printed = JSON.parse(r.stdout); assert.equal(printed.ok, true); assert.equal(printed.generatedAt, nowIso);
    assert.match(r.stderr, /PREFLIGHT OK .* NOTHING WAS WRITTEN. A fresh re-read is mandatory/);
    assert.equal(fs.statSync(outPath).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(fs.readFileSync(outPath, 'utf8')), printed);
    fs.writeFileSync(confPath, JSON.stringify(confirmations([staffRecord()])));
    r = spawnSync(process.execPath, [cli, '--snapshot', snapPath, '--confirmations', confPath, '--now', nowIso], { encoding: 'utf8' });
    assert.equal(r.status, 1); assert.equal(JSON.parse(r.stdout).ok, false); assert.match(r.stderr, /PREFLIGHT BLOCKED — 1 blocker\(s\):\n  ✗ confirmations: missing confirmation for pair:alex-example/);
    r = spawnSync(process.execPath, [cli, '--snapshot', snapPath], { encoding: 'utf8' });
    assert.equal(r.status, 2); assert.match(r.stderr, /usage:/);
    r = spawnSync(process.execPath, [cli, '--snapshot', path.join(dir, 'missing.json'), '--confirmations', confPath], { encoding: 'utf8' });
    assert.equal(r.status, 2); assert.match(r.stderr, /cannot read snapshot/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('SOURCE: the library and the CLI have no network, no credentials, no store client and no environment reads', () => {
  for (const f of ['scripts/duplicate-repair-lib.mjs', 'scripts/duplicate-repair-preflight.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const forbidden of ['UPSTASH', 'fetch(', '_kv', 'https://', 'http://', 'process.env', 'REDIS', 'child_process']) {
      assert.ok(!src.includes(forbidden), `${f} must not contain ${forbidden}`);
    }
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
    assert.ok(imports.every(i => i.startsWith('node:') || i === './duplicate-repair-lib.mjs'), `${f} imports only node built-ins and the library: ${imports.join(', ')}`);
  }
});
