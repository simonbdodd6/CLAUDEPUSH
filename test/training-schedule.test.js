/**
 * RC4.10C — training schedule foundation.
 *
 * The club's recurring training nights become a first-class, tenant-scoped
 * record with a Settings editor. This milestone stores and edits the schedule
 * ONLY: it must never generate sessions, never alter availability keying, and
 * never create a new availability session. The fixed tue/thu/game ids and every
 * existing availability response must come through untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.trainingschedule.test';
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
const { default: availability } = await import('../api/availability.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function sched(method, body, cookie) {
  const r = res();
  await publish({ method, query: { resource: 'training-schedule' }, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
async function pub(method, query, body, cookie) {
  const r = res();
  await publish({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
async function avail(method, query, body, cookie) {
  const r = res();
  await availability({ method, query: query || {}, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
const audits = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };

let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Owner`, email: `o${++_t}@ts.test`, password: 'password123' });
}
async function joinPlayer(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const email = `u${_t}@ts.test`;
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ token, email, name, password: 'password123' });
}
async function staff(teamId, name, accessProfile) {
  const p = await joinPlayer(teamId, name);
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  const m = members.find(x => x.userId === p.user.id && x.teamId === teamId);
  m.role = 'coach';
  m.staffLevel = accessProfile === 'manager' ? 'manager' : accessProfile === 'coach' ? 'assistant' : 'head';
  m.accessProfile = accessProfile;
  kv.set('app:identity:team_members', JSON.stringify(members));
  return { ...p, session: await store.createSession({ userId: p.user.id, teamId, role: 'coach' }) };
}
async function medicalStaff(teamId, name) {
  const p = await joinPlayer(teamId, name);
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.find(x => x.userId === p.user.id && x.teamId === teamId).role = 'medical';
  kv.set('app:identity:team_members', JSON.stringify(members));
  return { ...p, session: await store.createSession({ userId: p.user.id, teamId, role: 'medical' }) };
}

/** A club that already has the legacy tue/thu sessions and club.trainingDays. */
async function clubWithLegacyTraining(label) {
  const A = await club(label);
  kv.set(`app:publish:${A.team.id}:sessions`, JSON.stringify([
    { id: 'tue', type: 'Training', title: 'Training — Tuesday', date: 'Tuesday 19:30', location: 'Memorial Ground' },
    { id: 'thu', type: 'Training', title: 'Training — Thursday', date: 'Thursday 20:00', location: 'Back pitch' },
    { id: 'game', type: 'Match', title: 'Match', date: '' },
  ]));
  const clubRec = JSON.parse(kv.get(`app:club:${A.team.id}`) || '{}');
  clubRec.trainingDays = [{ day: 'Tue', time: '19:30' }, { day: 'Thu', time: '20:00' }];
  kv.set(`app:club:${A.team.id}`, JSON.stringify(clubRec));
  return A;
}

// ── Migration ───────────────────────────────────────────────────────────────
test('the two existing training nights migrate safely on first read', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const r = await sched('GET', null, ck(A.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.seeded, true, 'seeded from existing club data');
  assert.equal(r.body.slots.length, 2);
  assert.deepEqual(r.body.slots.map(s => s.day), ['Tue', 'Thu']);
  assert.deepEqual(r.body.slots.map(s => s.startTime), ['19:30', '20:00']);
  assert.deepEqual(r.body.slots.map(s => s.venue), ['Memorial Ground', 'Back pitch']);
  assert.deepEqual(r.body.slots.map(s => s.sessionId), ['tue', 'thu'], 'linked to the legacy sessions');
  assert.equal(r.body.slots.every(s => s.active), true);
});

test('migration is idempotent and never rewrites club data', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const clubBefore = kv.get(`app:club:${A.team.id}`);
  const sessionsBefore = kv.get(`app:publish:${A.team.id}:sessions`);

  const first = await sched('GET', null, ck(A.session));
  const second = await sched('GET', null, ck(A.session));
  assert.deepEqual(second.body.slots, first.body.slots, 'repeat reads are stable');
  assert.equal(kv.has(`app:publish:${A.team.id}:training_schedule`), false, 'a read alone writes nothing');

  // Persist, then read again — still the same shape, still seeded once.
  await sched('POST', { action: 'save' }, ck(A.session));
  const third = await sched('GET', null, ck(A.session));
  assert.equal(third.body.seeded, false, 'stored record is used from then on');
  assert.deepEqual(third.body.slots.map(s => s.id), first.body.slots.map(s => s.id));
  assert.equal(kv.get(`app:club:${A.team.id}`), clubBefore, 'club config untouched');
  assert.equal(kv.get(`app:publish:${A.team.id}:sessions`), sessionsBefore, 'sessions untouched');
});

test('a club with no legacy data still gets a sensible default pair', async () => {
  kv.clear(); _t = 0;
  const A = await club('Fresh');
  const r = await sched('GET', null, ck(A.session));
  assert.equal(r.body.slots.length, 2);
  assert.deepEqual(r.body.slots.map(s => s.day), ['Tue', 'Thu']);
  assert.deepEqual(r.body.slots.map(s => s.startTime), ['19:00', '19:00']);
});

// ── Editing ─────────────────────────────────────────────────────────────────
test('a slot can be edited with all the schedule fields', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const before = await sched('GET', null, ck(A.session));
  const tueId = before.body.slots[0].id;

  const r = await sched('POST', { action: 'update', slotId: tueId, slot: {
    day: 'Tue', startTime: '19:15', endTime: '20:45', venue: 'New Astro',
    arrivalTime: '19:00', effectiveFrom: '2026-09-01', effectiveTo: '2027-05-31',
  } }, ck(A.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const slot = r.body.slots.find(s => s.id === tueId);
  assert.equal(slot.startTime, '19:15');
  assert.equal(slot.endTime, '20:45');
  assert.equal(slot.venue, 'New Astro');
  assert.equal(slot.arrivalTime, '19:00');
  assert.equal(slot.effectiveFrom, '2026-09-01');
  assert.equal(slot.effectiveTo, '2027-05-31');
  assert.equal(slot.sessionId, 'tue', 'legacy link preserved');
  assert.ok(r.body.updatedAt && r.body.updatedBy === A.user.id, 'stamped');
});

test('extra slots are stored but never linked to an availability session', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const added = await sched('POST', { action: 'add', slot: {
    day: 'Sat', startTime: '10:00', endTime: '11:30', venue: 'Juniors pitch',
  } }, ck(A.session));
  assert.equal(added.statusCode, 200, JSON.stringify(added.body));
  assert.equal(added.body.slots.length, 3);
  const extra = added.body.slots[2];
  assert.equal(extra.day, 'Sat');
  assert.equal(extra.sessionId, '', 'schedule information only — no availability session');

  // A client cannot smuggle a sessionId in and hijack an availability key.
  const spoof = await sched('POST', { action: 'add', slot: { day: 'Wed', startTime: '18:00', sessionId: 'tue' } }, ck(A.session));
  assert.equal(spoof.body.slots[3].sessionId, '', 'sessionId is server-owned');

  // Published sessions are untouched: still exactly tue/thu/game.
  const sessions = JSON.parse(kv.get(`app:publish:${A.team.id}:sessions`));
  assert.deepEqual(sessions.map(s => s.id), ['tue', 'thu', 'game'], 'no new session ids created');
});

test('slots can be deactivated and reactivated; legacy nights cannot be deleted', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const base = await sched('GET', null, ck(A.session));
  const tueId = base.body.slots[0].id;

  const off = await sched('POST', { action: 'deactivate', slotId: tueId }, ck(A.session));
  assert.equal(off.body.slots.find(s => s.id === tueId).active, false);
  const on = await sched('POST', { action: 'activate', slotId: tueId }, ck(A.session));
  assert.equal(on.body.slots.find(s => s.id === tueId).active, true);

  // Deleting a night that backs availability is refused — deactivate instead.
  const refused = await sched('POST', { action: 'delete', slotId: tueId }, ck(A.session));
  assert.equal(refused.statusCode, 409, JSON.stringify(refused.body));
  assert.match(refused.body.error, /deactivate it instead/i);

  // A schedule-only slot deletes cleanly.
  const added = await sched('POST', { action: 'add', slot: { day: 'Sat', startTime: '10:00' } }, ck(A.session));
  const extraId = added.body.slots[2].id;
  const deleted = await sched('POST', { action: 'delete', slotId: extraId }, ck(A.session));
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.body.slots.length, 2);
});

// ── Permissions ─────────────────────────────────────────────────────────────
test('Full, Coach and Manager access may edit; players and medical may not', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const full = await staff(A.team.id, 'Full', 'full');
  const coach = await staff(A.team.id, 'Coach', 'coach');
  const manager = await staff(A.team.id, 'Manager', 'manager');
  const medic = await medicalStaff(A.team.id, 'Physio');
  const player = await joinPlayer(A.team.id, 'Player');

  for (const [label, actor] of [['full', full], ['coach', coach], ['manager', manager]]) {
    const r = await sched('POST', { action: 'add', slot: { day: 'Wed', startTime: '18:30' } }, ck(actor.session));
    assert.equal(r.statusCode, 200, `${label} may edit: ${JSON.stringify(r.body)}`);
  }
  for (const [label, actor] of [['medical', medic], ['player', player]]) {
    const r = await sched('POST', { action: 'add', slot: { day: 'Fri', startTime: '18:00' } }, ck(actor.session));
    assert.equal(r.statusCode, 403, `${label} may NOT edit (got ${r.statusCode})`);
  }
  // …but every active member may READ the schedule.
  const readByPlayer = await sched('GET', null, ck(player.session));
  assert.equal(readByPlayer.statusCode, 200);
  assert.equal(readByPlayer.body.canEdit, false, 'the UI is told the player cannot edit');
  assert.equal((await sched('GET', null, ck(full.session))).body.canEdit, true);
});

test('unauthenticated callers cannot read or write the schedule', async () => {
  kv.clear(); _t = 0;
  await clubWithLegacyTraining('Alpha');
  assert.equal((await sched('GET', null, null)).statusCode, 401);
  assert.equal((await sched('POST', { action: 'add', slot: { day: 'Wed', startTime: '18:00' } }, null)).statusCode, 401);
});

test('cross-club access is denied in both directions', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const B = await clubWithLegacyTraining('Bravo');
  await sched('POST', { action: 'add', slot: { day: 'Sat', startTime: '10:00', venue: 'Alpha Only' } }, ck(A.session));

  const bView = await sched('GET', null, ck(B.session));
  assert.equal(bView.body.slots.length, 2, "club B sees only its own two nights");
  assert.equal(JSON.stringify(bView.body).includes('Alpha Only'), false);

  // Naming another club's team is rejected outright.
  const spoof = await sched('POST', { action: 'add', teamId: B.team.id, slot: { day: 'Sun', startTime: '11:00' } }, ck(A.session));
  assert.equal(spoof.statusCode, 403, JSON.stringify(spoof.body));
  assert.equal((await sched('GET', null, ck(B.session))).body.slots.length, 2, 'club B unchanged');
});

// ── Integrity: availability, sessions and publications are untouched ────────
test('editing the schedule leaves session ids, availability and publications intact', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const player = await joinPlayer(A.team.id, 'Jamie Player');

  // A real availability response against the legacy 'tue' session.
  const answered = await avail('POST', {}, { sessionId: 'tue', response: 'available' }, ck(player.session));
  assert.equal(answered.statusCode, 200);
  const availBefore = kv.get(`app:availability:${A.team.id}:group:grp_initial:tue`);   // D1b Pass 3: group-scoped

  // A published coach + player training snapshot.
  await pub('POST', { resource: 'training', audience: 'coach' },
    { session: { id: 'tue', title: 'Tuesday Skills', blocks: [{ id: 'b1', activity: 'Warm-up', keyFocus: 'KEYNOTE', coach: 'Alice' }] } }, ck(A.session));
  await pub('POST', { resource: 'training', audience: 'player' },
    { session: { id: 'tue', title: 'Tuesday Skills', blocks: [{ id: 'b1', activity: 'Warm-up' }] } }, ck(A.session));
  const pubBefore = kv.get(`app:publish:${A.team.id}:training`);

  // Now edit the schedule heavily: retime, revenue, add two extra nights.
  const base = await sched('GET', null, ck(A.session));
  await sched('POST', { action: 'update', slotId: base.body.slots[0].id,
    slot: { day: 'Tue', startTime: '19:45', venue: 'Moved venue' } }, ck(A.session));
  await sched('POST', { action: 'add', slot: { day: 'Sat', startTime: '10:00' } }, ck(A.session));
  await sched('POST', { action: 'deactivate', slotId: base.body.slots[1].id }, ck(A.session));

  // Session ids unchanged, and no extra availability rows appeared.
  const sessions = JSON.parse(kv.get(`app:publish:${A.team.id}:sessions`));
  assert.deepEqual(sessions.map(s => s.id), ['tue', 'thu', 'game'], 'session ids unchanged');
  const availKeys = [...kv.keys()].filter(k => k.startsWith(`app:availability:${A.team.id}:`));
  assert.deepEqual(availKeys, [`app:availability:${A.team.id}:group:grp_initial:tue`], 'no new availability sessions');
  assert.equal(kv.get(`app:availability:${A.team.id}:group:grp_initial:tue`), availBefore, 'availability responses untouched');

  // The player's answer still reads back.
  const board = await avail('GET', { sessionId: 'tue' }, null, ck(A.session));
  assert.equal(board.body.count, 1);
  assert.equal(board.body.responses[0].response, 'available');

  // Published coach/player snapshots are byte-identical.
  assert.equal(kv.get(`app:publish:${A.team.id}:training`), pubBefore, 'training publications unchanged');
  const coachView = await pub('GET', { resource: 'training', audience: 'coach' }, null, ck(A.session));
  assert.equal(coachView.body.sessions[0].blocks[0].keyFocus, 'KEYNOTE');
});

// ── Audit ───────────────────────────────────────────────────────────────────
test('create, edit, deactivate and delete are each audited', async () => {
  kv.clear(); _t = 0;
  const A = await clubWithLegacyTraining('Alpha');
  const base = await sched('GET', null, ck(A.session));
  const added = await sched('POST', { action: 'add', slot: { day: 'Sat', startTime: '10:00' } }, ck(A.session));
  const extraId = added.body.slots[2].id;
  await sched('POST', { action: 'update', slotId: extraId, slot: { venue: 'Juniors pitch' } }, ck(A.session));
  await sched('POST', { action: 'deactivate', slotId: extraId }, ck(A.session));
  await sched('POST', { action: 'delete', slotId: extraId }, ck(A.session));

  const events = audits().map(e => e.event);
  for (const expected of ['training_schedule_slot_added', 'training_schedule_slot_updated',
                          'training_schedule_slot_deactivated', 'training_schedule_slot_deleted']) {
    assert.ok(events.includes(expected), `${expected} audited (saw ${events.join(', ')})`);
  }
  const one = audits().find(e => e.event === 'training_schedule_slot_added');
  assert.equal(one.teamId, A.team.id);
  assert.equal(one.by, A.user.id);
});

// ── Client surface ──────────────────────────────────────────────────────────
test('the schedule editor is reachable from Settings, not Club Admin', () => {
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(src, /function renderTrainingScheduleCard\(/, 'Settings training-schedule card exists');
  // Rendered from renderSettings, which IS in the beta navigation.
  const settings = src.slice(src.indexOf('function renderSettings()'), src.indexOf('function renderClubAdmin'));
  assert.match(settings, /renderTrainingScheduleCard\(\)/, 'card is rendered inside Settings');
  assert.match(src, /const BETA_NAV_IDS = \[[^\]]*"settings"/, 'Settings is in the beta sidebar');
  // Editing is gated on the same permission the API enforces.
  const card = src.slice(src.indexOf('function renderTrainingScheduleCard'), src.indexOf('function renderSettings()'));
  assert.match(card, /canI\('manage_fixtures'\)/, 'edit controls gated on manage_fixtures');
  assert.match(card, /Training schedule/, 'section heading');
  assert.match(card, /schedule information only/i, 'helper copy explains extra slots are not yet connected');
});
