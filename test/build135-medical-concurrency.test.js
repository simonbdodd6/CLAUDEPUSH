/**
 * MEDICAL WRITES ARE SERIALISED PER CLUB (Build 135)
 *
 * A club's caseload is ONE stored value (medical:<clubId>), read and
 * rewritten whole by every open, update and resolve. Two medics saving in the
 * same window each read the same version and the later save erased the
 * earlier: a new case disappeared, a resolved case came back active, a
 * player ended up with two "only" active cases. Each club now has its own
 * medical lock (clubs never wait on each other) and the save is refused
 * outside it. Synthetic conditions only; no medical content is printed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installKv, startKvServer, runWorker, apiModule } from './build135-kv.js';

const URL_ = 'https://redis.medical-b135.test';
process.env.UPSTASH_REDIS_REST_URL = URL_;
process.env.UPSTASH_REDIS_REST_TOKEN = 'medical-b135-token';
process.env.APP_KEY_PREFIX = 'app';
delete process.env.VERCEL; delete process.env.VERCEL_ENV;

const kvStub = installKv({ maxDelayMs: 0 });
const db = kvStub.dbFor(URL_);
const M = await import('../api/_medicalStore.js');

const CLUB_A = 'club_med_a', CLUB_B = 'club_med_b';
const record = club => JSON.parse(db.data.get(`app:medical:${club}`) || '{"cases":[]}');
const reset = () => { db.data.clear(); db.lists.clear(); db.expiry.clear(); kvStub.setDelay(4); };
const medic = { userId: 'user_medic' };

test('CONTROL: an unlocked read-modify-write of the caseload loses cases in this harness', async () => {
  reset();
  const { kvGet, kvSet } = await import('../api/_kv.js');
  let lost = 0;
  for (let run = 0; run < 8; run++) {
    await kvSet('app:medical:control', { cases: [] });
    await Promise.all([0, 1, 2, 3].map(async i => { const r = await kvGet('app:medical:control'); r.cases.push(i); await kvSet('app:medical:control', r); }));
    if ((await kvGet('app:medical:control')).cases.length < 4) lost++;
  }
  assert.ok(lost >= 4, `lost updates in ${lost}/8 unlocked runs`);
});

test('two (and six) concurrent case openings for different players: every case is kept', async () => {
  for (let run = 0; run < 4; run++) {
    reset();
    await Promise.all(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(p => M.upsertCase(CLUB_A, { playerId: p, condition: `synthetic ${p}` }, medic)));
    const players = record(CLUB_A).cases.map(c => c.playerId).sort();
    assert.deepEqual(players, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], `run ${run}: no case lost`);
  }
});

test('two medics opening the SAME player at once: one active case, both updates in its timeline', async () => {
  for (let run = 0; run < 4; run++) {
    reset();
    await Promise.all([
      M.upsertCase(CLUB_A, { playerId: 'p1', condition: 'synthetic a', timelineNote: 'first' }, { userId: 'medic_1' }),
      M.upsertCase(CLUB_A, { playerId: 'p1', severity: 'moderate', timelineNote: 'second' }, { userId: 'medic_2' }),
    ]);
    const cases = record(CLUB_A).cases.filter(c => c.playerId === 'p1' && c.status === 'active');
    assert.equal(cases.length, 1, `run ${run}: exactly one active case (no duplicate)`);
    assert.deepEqual(cases[0].timeline.map(t => t.action).sort(), ['opened', 'updated'], `run ${run}: both writes recorded`);
    assert.equal(cases[0].condition, 'synthetic a'); assert.equal(cases[0].severity, 'moderate');
  }
});

test('a status change (resolve) racing updates elsewhere: the resolution holds — no resurrection — and the updates land', async () => {
  for (let run = 0; run < 4; run++) {
    reset();
    kvStub.setDelay(0);
    const c1 = await M.upsertCase(CLUB_A, { playerId: 'p1', condition: 'synthetic 1' }, medic);
    await M.upsertCase(CLUB_A, { playerId: 'p2', condition: 'synthetic 2' }, medic);
    kvStub.setDelay(4);
    await Promise.all([
      M.resolveCase(CLUB_A, c1.id, medic),
      M.upsertCase(CLUB_A, { playerId: 'p2', rehabProgress: '50' }, medic),
      M.upsertCase(CLUB_A, { playerId: 'p3', condition: 'synthetic 3' }, medic),
    ]);
    const cases = record(CLUB_A).cases;
    assert.equal(cases.find(c => c.id === c1.id).status, 'resolved', `run ${run}: resolved stays resolved`);
    assert.equal(Number(cases.find(c => c.playerId === 'p2').rehabProgress), 50, `run ${run}: update kept`);
    assert.ok(cases.some(c => c.playerId === 'p3'), `run ${run}: new case kept`);
  }
});

test('two clubs at once: each caseload gets exactly its own writes; the clubs never share a lock', async () => {
  reset();
  await Promise.all([
    ...['a1', 'a2', 'a3'].map(p => M.upsertCase(CLUB_A, { playerId: p, condition: 'synthetic' }, medic)),
    ...['b1', 'b2', 'b3'].map(p => M.upsertCase(CLUB_B, { playerId: p, condition: 'synthetic' }, medic)),
  ]);
  assert.deepEqual(record(CLUB_A).cases.map(c => c.playerId).sort(), ['a1', 'a2', 'a3']);
  assert.deepEqual(record(CLUB_B).cases.map(c => c.playerId).sort(), ['b1', 'b2', 'b3']);
  assert.notEqual(M.medicalLockName(CLUB_A), M.medicalLockName(CLUB_B));
  // a busy club A never blocks club B
  db.data.set(`app:lock:${M.medicalLockName(CLUB_A)}`, JSON.stringify('held'));
  const t0 = Date.now();
  await M.upsertCase(CLUB_B, { playerId: 'b4', condition: 'synthetic' }, medic);
  assert.ok(Date.now() - t0 < 1000, 'club B wrote without waiting on club A');
  db.data.delete(`app:lock:${M.medicalLockName(CLUB_A)}`);
});

test('a save outside the lock, or after the lock was lost, is refused and writes nothing', async () => {
  reset();
  await M.upsertCase(CLUB_A, { playerId: 'p1', condition: 'synthetic' }, medic);
  const before = db.data.get(`app:medical:${CLUB_A}`);
  await assert.rejects(M.saveMedicalRecord(CLUB_A, { cases: [] }), e => e.code === 'write_outside_lock');
  await assert.rejects(M.withMedicalLock(CLUB_A, async () => {
    db.data.set(`app:lock:${M.medicalLockName(CLUB_A)}`, JSON.stringify('newer-writer'));
    await M.saveMedicalRecord(CLUB_A, { cases: [] });
  }), e => e.status === 409);
  // club B's lock does not authorise a club A save
  await assert.rejects(M.withMedicalLock(CLUB_B, () => M.saveMedicalRecord(CLUB_A, { cases: [] })), e => e.code === 'write_outside_lock');
  assert.equal(db.data.get(`app:medical:${CLUB_A}`), before, 'caseload untouched');
});

test('busy → 503 and nothing written; a crashed holder\'s lock expires and the write then succeeds', async () => {
  reset();
  const lockKey = `app:lock:${M.medicalLockName(CLUB_A)}`;
  db.data.set(lockKey, JSON.stringify('crashed')); db.expiry.set(lockKey, Date.now() + 1200);
  const t0 = Date.now();
  await M.upsertCase(CLUB_A, { playerId: 'p1', condition: 'synthetic' }, medic);
  assert.ok(Date.now() - t0 >= 1000, 'waited for the expiry');
  assert.equal(record(CLUB_A).cases.length, 1);
  db.data.set(lockKey, JSON.stringify('live-holder'));             // never expires
  await assert.rejects(M.upsertCase(CLUB_A, { playerId: 'p2', condition: 'synthetic' }, medic), e => e.status === 503 && e.code === 'busy');
  assert.equal(record(CLUB_A).cases.length, 1, 'nothing written while busy');
  db.data.delete(lockKey);
});

test('SEPARATE PROCESSES writing one club\'s caseload: every case is kept', async () => {
  const server = await startKvServer({ maxDelayMs: 4 });
  try {
    const env = { UPSTASH_REDIS_REST_URL: server.url, UPSTASH_REDIS_REST_TOKEN: 'worker-token', APP_KEY_PREFIX: 'app' };
    const WORKERS = 3, EACH = 4;
    await Promise.all(Array.from({ length: WORKERS }, (_, w) => runWorker({ ...env, B135_W: String(w), B135_N: String(EACH) }, `
      const M = await import(${JSON.stringify(apiModule('_medicalStore.js'))});
      const w = process.env.B135_W, n = Number(process.env.B135_N);
      await Promise.all(Array.from({ length: n }, (_, i) => M.upsertCase('club_x', { playerId: 'p' + w + '_' + i, condition: 'synthetic' }, { userId: 'medic_' + w })));
    `)));
    const stored = JSON.parse(server.store.data.get('app:medical:club_x') || '{"cases":[]}');
    assert.equal(stored.cases.length, WORKERS * EACH, `${stored.cases.length}/${WORKERS * EACH} cases survived across processes`);
  } finally { await server.close(); }
});
