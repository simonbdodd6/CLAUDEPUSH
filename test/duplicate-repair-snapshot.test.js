/**
 * DUPLICATE-PLAYER REPAIR SNAPSHOT (Build 136E tooling) — read-only, scoped, sanitised.
 *
 * Drives scripts/duplicate-repair-snapshot-lib.mjs with an in-memory fake of
 * the Upstash command surface (GET / SCAN / LRANGE and nothing else) holding
 * SYNTHETIC records for two clubs. No production data, no credentials, no
 * network beyond a loopback stub for the CLI test. What is proven: only read
 * commands are ever issued, the other club never leaks in, sensitive fields
 * never leave, pagination completes and refuses to spin, malformed stores are
 * refused rather than guessed, and the output feeds the preflight unchanged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  takeSnapshot, guardReadOnly, scanAll, referencedIds, summarize, sanitizeRosterRow, sanitizeUser,
  TripwireError, StoreFormatError, READ_ONLY_COMMANDS, SNAPSHOT_SCHEMA,
} from '../scripts/duplicate-repair-snapshot-lib.mjs';
import { validateSnapshot, buildManifest, CONFIRMATIONS_SCHEMA } from '../scripts/duplicate-repair-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Async spawn: the loopback stub lives in THIS process, so a blocking spawnSync would deadlock against it. */
const runCli = (args, env) => new Promise(resolve => {
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
  child.on('close', status => resolve({ status, stdout, stderr }));
});
const NOW = Date.parse('2026-10-12T10:00:00Z');
const A = 'club_a', B = 'club_b';

/** Synthetic store: two clubs, one duplicate pair in A, one person in both clubs, one club-B-only person. */
function store() {
  const j = v => JSON.stringify(v);
  return {
    'app:identity:users': j([
      { id: 'u_a1', email: 'a1@example.test', displayName: 'Alex Example', passwordHash: 'HASH-NEVER-LEAKS', passwordSalt: 'SALT', phone: '+32 000', createdAt: '2026-08-16T10:00:00Z', lastLoginAt: '2026-10-04T10:00:00Z' },
      { id: 'u_a2', email: 'a2@example.test', displayName: 'Alex Example', passwordHash: 'HASH-NEVER-LEAKS', createdAt: '2026-09-23T10:00:00Z' },
      { id: 'u_both', email: 'both@example.test', displayName: 'Robin Both', passwordHash: 'HASH-NEVER-LEAKS' },
      { id: 'u_b_only', email: 'bonly@example.test', displayName: 'Bea Bonly', passwordHash: 'HASH-NEVER-LEAKS' },
      { noId: true, email: 'broken@example.test' },
    ]),
    'app:identity:team_members': j([
      { id: 'tm_a1', teamId: A, userId: 'u_a1', role: 'player', status: 'active', playerGroupId: 'grp_a', approvedBy: 'invite' },
      { id: 'tm_a2', teamId: A, userId: 'u_a2', role: 'player', status: 'active', playerGroupId: 'grp_a', approvedBy: 'invite' },
      { id: 'tm_both_a', teamId: A, userId: 'u_both', role: 'player', status: 'active', playerGroupId: 'grp_a' },
      { id: 'tm_both_b', teamId: B, userId: 'u_both', role: 'coach', staffLevel: 'head', status: 'active' },
      { id: 'tm_b_only', teamId: B, userId: 'u_b_only', role: 'player', status: 'active' },
      { id: 'tm_broken', role: 'player', status: 'active' },
    ]),
    'app:identity:player_profiles': j([
      { id: 'pp_a1', teamId: A, userId: 'u_a1', displayName: 'Alex Example', legacyPlayerId: 'u_a1', dateOfBirth: '2008-01-01' },
      { id: 'pp_a2', teamId: A, userId: 'u_a2', displayName: 'Alex Example', legacyPlayerId: 'u_a2' },
      { id: 'pp_both_a', teamId: A, userId: 'u_both', displayName: 'Robin Both', legacyPlayerId: 'u_both' },
      { id: 'pp_b_only', teamId: B, userId: 'u_b_only', displayName: 'Bea Bonly', legacyPlayerId: 'u_b_only' },
    ]),
    'app:identity:sessions': j([
      { id: 'sess_a2', userId: 'u_a2', teamId: A, tokenHash: 'TOKEN-NEVER-LEAKS', lastSeenAt: '2026-10-06T10:00:00Z' },
      { id: 'sess_both_b', userId: 'u_both', teamId: B, tokenHash: 'TOKEN-NEVER-LEAKS', lastSeenAt: '2026-10-06T10:00:00Z' },
      { id: 'sess_b_only', userId: 'u_b_only', teamId: B, tokenHash: 'TOKEN-NEVER-LEAKS' },
    ]),
    'app:subscriptions': j([
      { userId: 'u_a2', playerId: 'u_a2', legacyPlayerId: 'u_a2', label: 'phone', subscription: { endpoint: 'https://push.example/a2', keys: { p256dh: 'KEY-NEVER-LEAKS', auth: 'AUTH-NEVER-LEAKS' } } },
      { userId: 'u_b_only', playerId: 'u_b_only', subscription: { endpoint: 'https://push.example/b', keys: { auth: 'AUTH-NEVER-LEAKS' } } },
    ]),
    [`app:roster:${A}`]: j({ players: [
      { id: 'u_a1', userId: 'u_a1', legacyPlayerId: 'u_a1', name: 'Alex Example', position: 'TBC', phone: '+32 111', dateOfBirth: '2008-01-01', notes: 'private', avail_fx_1: 'available' },
      { id: 'u_a2', userId: 'u_a2', legacyPlayerId: 'u_a2', name: 'Alex Example', position: '4 — Lock', email: 'a2@example.test' },
      { id: 'u_both', userId: 'u_both', legacyPlayerId: 'u_both', name: 'Robin Both', position: 'Prop' },
    ] }),
    [`app:roster:${B}`]: j({ players: [{ id: 'u_b_only', userId: 'u_b_only', name: 'Bea Bonly' }] }),
    [`app:availability:${A}:fx_1`]: j({ u_a1: { name: 'Alex Example', userId: 'u_a1', playerId: 'u_a1', legacyPlayerId: 'u_a1', response: 'available', reason: 'injury detail', respondedAt: '2026-10-07T10:00:00Z' },
                                         u_a2: { userId: 'u_a2', response: 'available', respondedAt: '2026-10-08T10:00:00Z' }, legacy_entry: 'available' }),
    [`app:availability:${A}:group:grp_a:fx_2`]: j({ u_a2: { userId: 'u_a2', response: 'unavailable', respondedAt: '2026-10-10T10:00:00Z' } }),
    [`app:availability:${B}:fx_9`]: j({ u_b_only: { userId: 'u_b_only', response: 'maybe' } }),
    [`app:availability_lock:${A}::fx_1`]: j({ owner: 'x' }),
    [`app:publish:${A}:fixture:fx_1:squad`]: j({ formationKeys: { 13: 'id:u_a2' }, benchKeys: ['id:u_a1'], updatedBy: 'user_admin' }),
    [`app:publish:${A}`]: j({ club: { id: A, name: 'Club A' } }),
    [`app:publish:${B}:fixture:fx_9:squad`]: j({ formationKeys: { 1: 'id:u_b_only' } }),
    [`app:medical:${A}`]: j({ cases: [{ id: 'case_1', playerId: 'u_a1', diagnosis: 'hamstring strain — CONFIDENTIAL', notes: 'see physio' }] }),
    'app:chat:conv:dm:u_a1:u_both:msgs': j([{ text: 'hi' }]),
    'app:chat:conv:dm:u_b_only:u_x:msgs': j([{ text: 'hi' }]),
  };
}

/** Upstash-like command surface over the store: GET, SCAN (glob MATCH, paginated), LRANGE. Records every command. */
function fakeRedis(data, { pageSize = 100, neverTerminate = false } = {}) {
  const commands = [];
  const glob = pat => new RegExp('^' + pat.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  const fn = async (...command) => {
    commands.push(command.map(String));
    const cmd = String(command[0]).toUpperCase();
    if (cmd === 'GET') return data[command[1]] ?? null;
    if (cmd === 'SCAN') {
      const keys = Object.keys(data).filter(k => glob(command[3]).test(k)).sort();
      const start = Number(command[1]);
      const page = keys.slice(start, start + pageSize);
      const next = neverTerminate ? String(start + pageSize) : (start + pageSize >= keys.length ? '0' : String(start + pageSize));
      return [next, page];
    }
    if (cmd === 'LRANGE') return [];
    throw new Error(`fake received a non-read command: ${cmd}`);
  };
  fn.commands = commands;
  return fn;
}
const snap = (data = store(), opts = {}) => { const r = fakeRedis(data, opts.fake); return takeSnapshot({ redis: r, club: A, now: NOW, ...opts }).then(sn => ({ sn, r })); };

test('the snapshot is scoped to the club, sanitised, schema-valid, and feeds the preflight unchanged', async () => {
  const { sn, r } = await snap();
  assert.equal(sn.schema, SNAPSHOT_SCHEMA); assert.equal(sn.club, A); assert.equal(sn.takenAt, new Date(NOW).toISOString()); assert.equal(sn.keyPrefix, 'app');
  assert.deepEqual(validateSnapshot(sn), []);
  // scope: club A's people only — but their OTHER-club memberships and sessions are kept so the preflight can refuse a cross-club merge
  assert.deepEqual(sn.users.map(u => u.id), ['u_a1', 'u_a2', 'u_both']);
  assert.deepEqual(sn.team_members.map(m => m.id), ['tm_a1', 'tm_a2', 'tm_both_a', 'tm_both_b']);
  assert.deepEqual(sn.player_profiles.map(p => p.id), ['pp_a1', 'pp_a2', 'pp_both_a']);
  assert.deepEqual(sn.sessions.map(x => x.id), ['sess_a2', 'sess_both_b']);
  assert.deepEqual(sn.roster.players.map(x => x.id), ['u_a1', 'u_a2', 'u_both']);
  assert.deepEqual(sn.subscriptions.map(x => x.subscription.endpoint), ['https://push.example/a2']);
  assert.deepEqual(Object.keys(sn.availability), [`app:availability:${A}:fx_1`, `app:availability:${A}:group:grp_a:fx_2`], 'club-scoped and group-scoped records, never the lock key, never club B');
  assert.deepEqual(Object.keys(sn.publish), [`app:publish:${A}`, `app:publish:${A}:fixture:fx_1:squad`]);
  assert.deepEqual(sn.messages, ['app:chat:conv:dm:u_a1:u_both:msgs'], 'only threads naming a club-A person, as names only');
  // sanitised: nothing secret or personal beyond the whitelist
  const text = JSON.stringify(sn);
  for (const leak of ['HASH-NEVER-LEAKS', 'SALT', 'TOKEN-NEVER-LEAKS', 'KEY-NEVER-LEAKS', 'AUTH-NEVER-LEAKS', '+32', '2008-01-01', 'private', 'injury detail', 'CONFIDENTIAL', 'see physio', 'bonly@example.test']) {
    assert.ok(!text.includes(leak), `must not contain ${leak}`);
  }
  assert.deepEqual(sn.users[0], { id: 'u_a1', email: 'a1@example.test', displayName: 'Alex Example', createdAt: '2026-08-16T10:00:00Z', lastLoginAt: '2026-10-04T10:00:00Z' });
  assert.deepEqual(sn.roster.players[0], { id: 'u_a1', userId: 'u_a1', legacyPlayerId: 'u_a1', name: 'Alex Example', position: 'TBC', avail_fx_1: 'available' });
  assert.deepEqual(sn.availability[`app:availability:${A}:fx_1`].u_a1, { userId: 'u_a1', playerId: 'u_a1', legacyPlayerId: 'u_a1', response: 'available', respondedAt: '2026-10-07T10:00:00Z' });
  assert.equal(sn.availability[`app:availability:${A}:fx_1`].legacy_entry, 'available', 'legacy string entries survive as strings');
  // medical: reduced to the ids it references — enough for the preflight's reference scan, nothing clinical
  assert.deepEqual(sn.medical, { [`app:medical:${A}`]: { redacted: true, referencedIds: ['u_a1'] } }, 'only the club ids the record names — never its words');
  // the broken records were dropped and said so
  assert.deepEqual(sn.notes, ['dropped a membership without userId/teamId', 'dropped a user record without id']);
  // only read commands were ever issued, and no club-B key was ever fetched
  assert.ok(r.commands.every(c => READ_ONLY_COMMANDS.includes(c[0].toUpperCase())), 'only GET/SCAN/LRANGE');
  assert.ok(r.commands.filter(c => c[0] === 'GET').every(c => !c[1].includes(B)), 'no GET of a club-B key');
  // and it feeds the preflight as-is: the duplicate pair in A is found, the cross-club person is not a pair
  const m = buildManifest(sn, { schema: CONFIRMATIONS_SCHEMA, records: [{ slot: 'pair:alex-example', kind: 'pair', person: 'Alex Example', relationship: 'same', keepUserId: 'u_a1', duplicateUserId: 'u_a2', confirmedBy: 'Head coach (test)', confirmedAt: '2026-10-12T09:00:00Z' }] }, { now: NOW });
  assert.equal(m.ok, true, m.blockers.join('\n'));   // the medical record names the KEPT account, which is no obstacle
  assert.deepEqual(m.required.pairs, ['pair:alex-example']);
});

test('a snapshot from the store can reach a clean preflight manifest end to end', async () => {
  const data = store();
  delete data[`app:medical:${A}`];                                   // no medical reference → nothing to block
  const { sn } = await snap(data);
  const m = buildManifest(sn, { schema: CONFIRMATIONS_SCHEMA, records: [{ slot: 'pair:alex-example', kind: 'pair', person: 'Alex Example', relationship: 'same', keepUserId: 'u_a1', duplicateUserId: 'u_a2', confirmedBy: 'Head coach (test)', confirmedAt: '2026-10-12T09:00:00Z' }] }, { now: NOW });
  assert.equal(m.ok, true, m.blockers.join('\n'));
  assert.equal(m.pairs[0].status, 'ready');
  assert.deepEqual(m.pairs[0].writes.filter(w => w.store === 'publish').map(w => w.changes[0].target.path), ['formationKeys.13']);
  assert.equal(summarize(sn).availabilityRecords, 2);
});

test('the medical reference check still works on the redacted record (the kept account is named, the duplicate is not)', async () => {
  const data = store();
  data[`app:medical:${A}`] = JSON.stringify({ cases: [{ id: 'case_2', playerId: 'u_a2', diagnosis: 'CONFIDENTIAL' }] });
  const { sn } = await snap(data);
  assert.deepEqual(sn.medical[`app:medical:${A}`].referencedIds, ['u_a2']);
  const m = buildManifest(sn, { schema: CONFIRMATIONS_SCHEMA, records: [{ slot: 'pair:alex-example', kind: 'pair', person: 'Alex Example', relationship: 'same', keepUserId: 'u_a1', duplicateUserId: 'u_a2', confirmedBy: 'Head coach (test)', confirmedAt: '2026-10-12T09:00:00Z' }] }, { now: NOW });
  assert.equal(m.ok, false); assert.match(m.blockers.join('\n'), /medical record .* names the duplicate account/);
});

test('cross-club contamination: a club-B-only person never appears, in any store, under any key', async () => {
  const { sn } = await snap();
  const text = JSON.stringify(sn);
  assert.ok(!text.includes('u_b_only')); assert.ok(!text.includes('tm_b_only')); assert.ok(!text.includes('pp_b_only')); assert.ok(!text.includes('sess_b_only'));
  assert.ok(!text.includes('fx_9')); assert.ok(!text.includes(`roster:${B}`));
  // the person in both clubs: club-B membership and session are present (so the preflight refuses), club-B profile is not needed and absent
  assert.ok(sn.team_members.some(m => m.id === 'tm_both_b' && m.teamId === B));
  assert.ok(sn.sessions.some(x => x.id === 'sess_both_b' && x.teamId === B));
  assert.ok(!sn.player_profiles.some(p => p.teamId === B));
});

test('pagination: SCAN pages are followed to the end, keys are de-duplicated, and a cursor that never returns 0 is refused', async () => {
  const data = store();
  for (let i = 0; i < 7; i++) data[`app:availability:${A}:slot_${i}`] = JSON.stringify({ u_a1: { userId: 'u_a1', response: 'maybe' } });
  const { sn, r } = await snap(data, { fake: { pageSize: 2 } });
  assert.equal(Object.keys(sn.availability).length, 9, 'two original records + seven paged ones');
  const scans = r.commands.filter(c => c[0] === 'SCAN' && c[3] === `app:availability:${A}:*`);
  assert.ok(scans.length >= 5, `paged in ${scans.length} SCAN calls`); assert.equal(scans[0][1], '0'); assert.deepEqual(scans[0].slice(2), ['MATCH', `app:availability:${A}:*`, 'COUNT', '500']);
  const spinning = fakeRedis(store(), { pageSize: 1, neverTerminate: true });
  await assert.rejects(scanAll(spinning, 'app:publish:*', { maxPages: 5 }), /SCAN did not terminate within 5 pages/);
  await assert.rejects(takeSnapshot({ redis: spinning, club: A, now: NOW, maxScanPages: 3 }), StoreFormatError);
  const dupKeys = async (...c) => (c[0] === 'SCAN' ? ['0', ['app:publish:club_a:x', 'app:publish:club_a:x']] : null);
  assert.deepEqual(await scanAll(dupKeys, 'app:publish:club_a:*'), ['app:publish:club_a:x']);
});

test('malformed stores are refused, not guessed: non-JSON, wrong shape, a SCAN reply that is not [cursor, keys]', async () => {
  for (const [key, value, re] of [
    ['app:identity:users', 'not json {', /store app:identity:users: value is not JSON/],
    ['app:identity:team_members', JSON.stringify({ not: 'an array' }), /expected an array/],
    [`app:roster:${A}`, JSON.stringify([1, 2]), /expected \{ players: \[\] \}/],
    [`app:roster:${A}`, JSON.stringify({ players: 'x' }), /expected \{ players: \[\] \}/],
    [`app:availability:${A}:fx_1`, JSON.stringify(['a', 'b']), /availability record is not an object of entries/],
    [`app:availability:${A}:fx_1`, '{broken', /value is not JSON/],
  ]) {
    const data = store(); data[key] = value;
    await assert.rejects(snap(data), re);
  }
  // a missing users or memberships store is a refusal; missing roster / profiles / sessions / subscriptions are empty, not errors
  let data = store(); delete data['app:identity:users'];
  await assert.rejects(snap(data), /store app:identity:users: missing/);
  data = store(); delete data[`app:roster:${A}`]; delete data['app:identity:player_profiles']; delete data['app:identity:sessions']; delete data['app:subscriptions']; delete data[`app:medical:${A}`];
  const { sn } = await snap(data);
  assert.deepEqual(sn.roster.players, []); assert.deepEqual(sn.player_profiles, []); assert.deepEqual(sn.sessions, []); assert.deepEqual(sn.subscriptions, []); assert.deepEqual(sn.medical, {});
  assert.deepEqual(validateSnapshot(sn), [], 'still a valid (if sparse) snapshot');
  const badScan = async (...c) => (c[0] === 'SCAN' ? { cursor: 0 } : (c[1].includes('identity:') ? JSON.stringify([]) : null));
  await assert.rejects(takeSnapshot({ redis: badScan, club: A, now: NOW }), /SCAN reply is not \[cursor, keys\]/);
  await assert.rejects(takeSnapshot({ redis: fakeRedis(store()), club: '', now: NOW }), /club is required/);
});

test('read-only enforcement: the guard refuses every non-read command before it reaches the client', async () => {
  const seen = [];
  const guarded = guardReadOnly(async (...c) => { seen.push(c[0]); return null; });
  for (const cmd of ['SET', 'DEL', 'HSET', 'LPUSH', 'EXPIRE', 'FLUSHDB', 'set', 'Del', '']) {
    await assert.rejects(guarded(cmd, 'k', 'v'), TripwireError, cmd);
  }
  assert.deepEqual(seen, [], 'nothing reached the client');
  await guarded('GET', 'k'); await guarded('scan', '0', 'MATCH', 'x', 'COUNT', '1'); await guarded('LRANGE', 'k', '0', '-1');
  assert.deepEqual(seen, ['GET', 'scan', 'LRANGE']);
  const { r } = await snap();
  assert.ok(r.commands.length > 10);
  assert.deepEqual([...new Set(r.commands.map(c => c[0].toUpperCase()))].sort(), ['GET', 'SCAN']);
});

test('sanitisers are whitelists: unknown and sensitive fields never pass', () => {
  assert.deepEqual(sanitizeUser({ id: 'u', email: 'e@x.test', passwordHash: 'h', phone: 'p', anything: 1 }), { id: 'u', email: 'e@x.test' });
  assert.deepEqual(sanitizeRosterRow({ id: 'r', userId: 'u', name: 'N', position: 'P', dateOfBirth: 'd', notes: 'n', avail_x: 'available', avail_empty: '' }), { id: 'r', userId: 'u', name: 'N', position: 'P', avail_x: 'available' });
  const known = new Set(['user_1787227461353_tgqbch', 'inv-YxnjxnQa', 'u_absent']);
  assert.deepEqual(referencedIds({ cases: [{ playerId: 'user_1787227461353_tgqbch', text: 'saw user_1787227461353_tgqbch in prose', 'inv-YxnjxnQa': { note: 'CONFIDENTIAL' } }] }, known),
    ['inv-YxnjxnQa', 'user_1787227461353_tgqbch'], 'known ids as JSON values or keys; prose mentions and absent ids do not count');
  assert.deepEqual(referencedIds({ diagnosis: 'hamstring strain', grade: 'grade-2' }, known), [], 'no word is ever mistaken for an id');
});

test('CLI: credentials from the environment only, loopback stub, mode-600 output, refusal to overwrite, read-only transport', async () => {
  const data = store();
  const srv = http.createServer(async (req, res) => {
    let body = ''; for await (const ch of req) body += ch;
    const command = JSON.parse(body);
    const cmd = String(command[0]).toUpperCase();
    const send = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer test-token') return send({ error: 'unauthorized' });
    if (cmd === 'GET') return send({ result: data[command[1]] ?? null });
    if (cmd === 'SCAN') { const re = new RegExp('^' + command[3].split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); return send({ result: ['0', Object.keys(data).filter(k => re.test(k))] }); }
    return send({ error: `write refused by stub: ${cmd}` });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-snapshot-'));
  const cli = path.join(ROOT, 'scripts', 'duplicate-repair-snapshot.mjs');
  const env = { ...process.env, UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${srv.address().port}`, UPSTASH_REDIS_REST_TOKEN: 'test-token' };
  delete env.APP_KEY_PREFIX;
  try {
    const out = path.join(dir, 'snapshot.json');
    let r = await runCli([cli, '--club', A, '--out', out], env);
    assert.equal(r.status, 0, r.stderr);
    const summary = JSON.parse(r.stdout);
    assert.equal(summary.club, A); assert.equal(summary.users, 3); assert.equal(summary.availabilityRecords, 2); assert.equal(summary.mode, '600');
    assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    const written = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(validateSnapshot(written), []); assert.ok(!JSON.stringify(written).includes('HASH-NEVER-LEAKS'));
    assert.match(r.stderr, /read-only: no command other than GET\/SCAN\/LRANGE was sent/);
    // never overwrites
    r = await runCli([cli, '--club', A, '--out', out], env);
    assert.equal(r.status, 2); assert.match(r.stderr, /refusing to overwrite/);
    // no credentials → usage refusal, no .env.local fallback
    const noEnv = { ...env }; delete noEnv.UPSTASH_REDIS_REST_URL; delete noEnv.UPSTASH_REDIS_REST_TOKEN;
    r = await runCli([cli, '--club', A, '--out', path.join(dir, 'x.json')], noEnv);
    assert.equal(r.status, 2); assert.match(r.stderr, /not set — refusing to guess/); assert.ok(!fs.existsSync(path.join(dir, 'x.json')));
    // a store error → exit 1, nothing written
    r = await runCli([cli, '--club', A, '--out', path.join(dir, 'y.json')], { ...env, UPSTASH_REDIS_REST_TOKEN: 'wrong' });
    assert.equal(r.status, 1); assert.match(r.stderr, /snapshot failed — redis GET: unauthorized/); assert.ok(!fs.existsSync(path.join(dir, 'y.json')));
    r = await runCli([cli, '--club', A], env);
    assert.equal(r.status, 2); assert.match(r.stderr, /usage:/);
  } finally { srv.closeAllConnections?.(); await new Promise(r => srv.close(() => r())); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('SOURCE: the snapshot CLI and library read no .env file, issue no write command and import only node built-ins and the library', () => {
  for (const f of ['scripts/duplicate-repair-snapshot-lib.mjs', 'scripts/duplicate-repair-snapshot.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const forbidden of ['readFileSync', 'dotenv', "'SET'", "'DEL'", "'HSET'", "'LPUSH'", "'EXPIRE'", 'child_process', 'spawn']) assert.ok(!src.includes(forbidden), `${f} must not contain ${forbidden}`);
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
    assert.ok(imports.every(i => i.startsWith('node:') || i === './duplicate-repair-snapshot-lib.mjs'), `${f}: ${imports.join(', ')}`);
  }
  const lib = fs.readFileSync(path.join(ROOT, 'scripts/duplicate-repair-snapshot-lib.mjs'), 'utf8');
  assert.ok(!lib.includes('process.env') && !lib.includes('fetch('), 'the library has no environment or transport access at all');
});
