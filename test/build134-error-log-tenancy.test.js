/**
 * A CLUB READS ONLY ITS OWN ERROR RECORDS (Build 134)
 *
 * The error log is one platform-wide list, and GET /api/config?errors=1
 * returned all of it to any club's reports holder — routes, messages and
 * stacks from every other club. Now each report is tagged, at ingest, with the
 * club of the REPORTER'S session (derived on the server, never from the body),
 * and a read returns only the caller's club's entries. Untagged entries
 * (anonymous, or older) and other clubs' are the platform operator's alone.
 * Any club named in the query or the report body is ignored.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, configCall, kv, read } from './build134-fixture.js';

const report = (actor, message, extra = {}) => configCall('POST', { report: '1' }, { kind: 'app_error', message, route: '/', ...extra }, actor);
const readErrors = async (actor, query = {}) => {
  const r = await configCall('GET', { errors: '1', ...query }, null, actor);
  return { status: r.statusCode, messages: (r.body?.errors || []).map(e => e.message), body: r.body };
};

async function seeded() {
  const w = await world();
  await report(w.owner, 'alpha boom');
  await report(w.player, 'alpha player boom');
  await report(w.ownerB, 'bravo boom');
  await report(null, 'anonymous boom');
  await report(w.ownerB, 'bravo forged as alpha', { teamId: w.a, team: w.a, clubId: w.a });
  return w;
}

test('each club\'s reports holders see only their own club\'s errors', async () => {
  const w = await seeded();
  for (const actor of ['owner', 'admin', 'headSeniors', 'assistant']) {
    const r = await readErrors(w[actor]);
    assert.equal(r.status, 200, actor);
    assert.deepEqual(r.messages.sort(), ['alpha boom', 'alpha player boom'].sort(), `${actor}: ${JSON.stringify(r.messages)}`);
    assert.equal(r.body.scope, 'club');
  }
  const b = await readErrors(w.ownerB);
  assert.deepEqual(b.messages.sort(), ['bravo boom', 'bravo forged as alpha'].sort(), 'a report cannot be filed under another club');
});

test('naming another club in the query changes nothing', async () => {
  const w = await seeded();
  for (const query of [{ teamId: w.b }, { team: w.b }, { clubId: w.b }, { teamId: '../*' }, { teamId: '' }]) {
    const r = await readErrors(w.owner, query);
    assert.ok(r.status === 200 || r.status === 403, JSON.stringify(query));
    assert.ok(!r.messages.some(m => /bravo|anonymous/.test(m)), `no other club's or anonymous records via ${JSON.stringify(query)}`);
  }
});

test('a player and an anonymous caller read nothing', async () => {
  const w = await seeded();
  assert.equal((await readErrors(w.player)).status, 403);
  assert.equal((await readErrors(null)).status, 401);
});

test('the platform operator still sees the whole log, untagged entries included', async () => {
  const w = await seeded();
  const users = read('app:identity:users');
  users.find(u => u.id === w.admin.user.id).platformRole = 'platform_admin';
  kv.set('app:identity:users', JSON.stringify(users));
  const r = await readErrors(w.admin);
  assert.equal(r.body.scope, 'platform');
  assert.deepEqual(r.messages.sort(), ['alpha boom', 'alpha player boom', 'bravo boom', 'anonymous boom', 'bravo forged as alpha'].sort());
});

test('reports keep working for everyone — anonymous included — and stored entries carry no credentials', async () => {
  const w = await world();
  const anon = await report(null, 'token=abc123secret password=hunter2 boom');
  assert.equal(anon.statusCode, 202);
  const signedIn = await report(w.owner, 'Bearer eyJhbGciOiJIUzI1NiJ9.x.y failed');
  assert.equal(signedIn.statusCode, 202);
  const raw = JSON.stringify([...kv.entries(), ...(await import('./build134-fixture.js')).lists.entries()]);
  assert.ok(!raw.includes('hunter2') && !raw.includes('abc123secret'), 'credential-looking text is scrubbed before storage');
});
