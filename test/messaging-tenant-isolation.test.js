/**
 * MESSAGING TENANT ISOLATION — schedules and templates.
 *
 * Scheduled messages and message templates lived in ONE flat list shared by
 * every club — the same cross-tenant shape the invitation store was already
 * rescued from. Delivery was club-isolated (cron fails closed on teamId),
 * but ADMINISTRATION was not: any MESSAGING holder of any club — including a
 * freshly self-provisioned trial club — could list every club's schedules,
 * retime/deactivate/delete them, and rewrite or delete the TEMPLATE BODIES
 * another club's reminders send. That is cross-tenant sabotage and message
 * content injection.
 *
 * The contract these tests pin:
 *   - a club administers ONLY its own schedules; a foreign id reads as
 *     "not found", never as someone else's record
 *   - a legacy schedule with no teamId belongs to the DEFAULT team (the
 *     documented owner of pre-tagging data) and heals on its next save
 *   - templates are per-club: each club starts from the defaults, edits its
 *     own copy, and can never see or touch another club's; the DEFAULT team
 *     keeps its existing (possibly edited) legacy list
 *   - cron resolves a schedule's template from the SCHEDULE's club, so no
 *     other club's edit can ever reach another club's players.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.mti.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (command === 'SET') { kv.set(a[0], a[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(a[0]); result = 1; }
  if (command === 'SCAN') { const re = globToRe(a[2] || '*'); result = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  if (command === 'LRANGE') result = [];
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: schedulesHandler } = await import('../api/schedules.js');
const templatesModule = await import('../api/templates.js');
const { default: templatesHandler, templatesForClub } = templatesModule;
const { SESSION_COOKIE, createSession, DEFAULT_TEAM } = store;

const CLUB_A = 'club-alpha', CLUB_B = 'club-beta';

const MEMBERS = [
  { id: 'm-a', teamId: CLUB_A, userId: 'u-a', role: 'coach', staffLevel: 'head', status: 'active' },
  { id: 'm-b', teamId: CLUB_B, userId: 'u-b', role: 'coach', staffLevel: 'head', status: 'active' },
  { id: 'm-d', teamId: DEFAULT_TEAM.id, userId: 'u-d', role: 'coach', staffLevel: 'head', status: 'active' },
];

const cookies = new Map();
async function login(userId, teamId) {
  const s = await createSession({ userId, teamId, role: 'coach' });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
async function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: CLUB_A, name: 'Alpha' }, { id: CLUB_B, name: 'Beta' }, { id: DEFAULT_TEAM.id, name: 'Default' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  for (const m of MEMBERS) await login(m.userId, m.teamId);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
const call = async (handler, userId, method, body = null, query = {}) => {
  const r = res();
  await handler({ method, query, body, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
};

const SCHED_B = { id: 'sch-beta-1', templateId: 'tpl-availability', name: 'Beta Friday chase',
  days: ['friday'], time: '18:00', audience: 'all', active: true, coachName: 'Beta Coach' };

async function seedSchedules() {
  kv.set('app:schedules', JSON.stringify([
    { ...SCHED_B, teamId: CLUB_B, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'sch-legacy-1', templateId: 'tpl-availability', name: 'Legacy pre-tagging',
      days: ['monday'], time: '09:00', audience: 'all', active: true, coachName: 'Old Coach',
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' },
  ]));
}
const kvSchedules = () => JSON.parse(kv.get('app:schedules') || '[]');
const schedById = id => kvSchedules().find(s => s.id === id);

// ── SCHEDULES ────────────────────────────────────────────────────────────────

test('SCHEDULES — a club lists only its own; another club\'s never appear', async () => {
  await seed(); await seedSchedules();
  const a = await call(schedulesHandler, 'u-a', 'GET');
  assert.equal(a.code, 200);
  assert.deepEqual(a.body.schedules.map(s => s.id), [], 'club A has none, and sees none of B\'s');

  const b = await call(schedulesHandler, 'u-b', 'GET');
  assert.deepEqual(b.body.schedules.map(s => s.id), ['sch-beta-1'], 'club B sees exactly its own');
});

test('SCHEDULES — a foreign schedule cannot be retimed, deactivated or renamed', async () => {
  await seed(); await seedSchedules();
  const r = await call(schedulesHandler, 'u-a', 'PUT', { id: 'sch-beta-1', active: false, time: '03:00' });
  assert.equal(r.code, 404, JSON.stringify(r.body));
  assert.equal(schedById('sch-beta-1').active, true, 'B\'s schedule still active');
  assert.equal(schedById('sch-beta-1').time, '18:00', 'and untouched');
});

test('SCHEDULES — a foreign schedule cannot be deleted', async () => {
  await seed(); await seedSchedules();
  await call(schedulesHandler, 'u-a', 'DELETE', { id: 'sch-beta-1' });
  assert.ok(schedById('sch-beta-1'), 'B\'s schedule survives A\'s delete');
});

test('SCHEDULES — a POST naming a foreign id cannot overwrite it; a new one is stamped with the caller\'s club', async () => {
  await seed(); await seedSchedules();
  const overwrite = await call(schedulesHandler, 'u-a', 'POST',
    { ...SCHED_B, name: 'Hijacked', time: '03:00' });
  assert.equal(overwrite.code, 404, JSON.stringify(overwrite.body));
  assert.equal(schedById('sch-beta-1').name, 'Beta Friday chase', 'B untouched');

  const create = await call(schedulesHandler, 'u-a', 'POST',
    { id: 'sch-alpha-1', templateId: 'tpl-availability', name: 'Alpha chase', days: ['tuesday'], time: '19:00' });
  assert.equal(create.code, 200, JSON.stringify(create.body));
  assert.equal(schedById('sch-alpha-1').teamId, CLUB_A, 'stamped with the creator\'s club');
});

test('SCHEDULES — a legacy no-teamId record belongs to the DEFAULT team and heals on its save', async () => {
  await seed(); await seedSchedules();
  const a = await call(schedulesHandler, 'u-a', 'GET');
  assert.ok(!a.body.schedules.some(s => s.id === 'sch-legacy-1'), 'invisible to other clubs');

  const d = await call(schedulesHandler, 'u-d', 'GET');
  assert.ok(d.body.schedules.some(s => s.id === 'sch-legacy-1'), 'the default club can still reach it');

  const heal = await call(schedulesHandler, 'u-d', 'PUT', { id: 'sch-legacy-1', name: 'Legacy re-saved' });
  assert.equal(heal.code, 200, JSON.stringify(heal.body));
  assert.equal(schedById('sch-legacy-1').teamId, DEFAULT_TEAM.id, 're-save attaches the club, as the cron report promises');
});

// ── TEMPLATES ────────────────────────────────────────────────────────────────

test('TEMPLATES — each club starts from the defaults and edits its OWN copy', async () => {
  await seed();
  const a1 = await call(templatesHandler, 'u-a', 'GET');
  assert.equal(a1.code, 200);
  assert.ok(a1.body.templates.some(t => t.id === 'tpl-availability'), 'defaults offered');

  const bEdit = await call(templatesHandler, 'u-b', 'POST',
    { id: 'tpl-availability', name: 'Weekly Availability', title: 'Beta title', body: 'BETA-BODY-SENTINEL {{first_name}}' });
  assert.equal(bEdit.code, 200, JSON.stringify(bEdit.body));

  const a2 = await call(templatesHandler, 'u-a', 'GET');
  const aTpl = a2.body.templates.find(t => t.id === 'tpl-availability');
  assert.ok(!String(aTpl.body).includes('BETA-BODY-SENTINEL'), 'B\'s edit never reaches A\'s list');
});

test('TEMPLATES — a club cannot rewrite or delete another club\'s template', async () => {
  await seed();
  await call(templatesHandler, 'u-b', 'POST',
    { id: 'tpl-custom-b', name: 'Beta custom', title: 'B', body: 'BETA-CUSTOM-SENTINEL' });

  await call(templatesHandler, 'u-a', 'POST',
    { id: 'tpl-custom-b', name: 'Injected', title: 'X', body: 'ATTACKER-BODY' });
  await call(templatesHandler, 'u-a', 'DELETE', { id: 'tpl-custom-b' });

  const b = await call(templatesHandler, 'u-b', 'GET');
  const tpl = b.body.templates.find(t => t.id === 'tpl-custom-b');
  assert.ok(tpl, 'B\'s template survives A\'s delete');
  assert.equal(tpl.body, 'BETA-CUSTOM-SENTINEL', 'and A\'s rewrite never landed in B\'s list');
});

test('TEMPLATES — the DEFAULT team keeps its existing legacy list, and its first save adopts it per-club', async () => {
  await seed();
  kv.set('app:templates', JSON.stringify([
    { id: 'tpl-availability', name: 'Weekly Availability', category: 'availability',
      title: 'Edited long ago', body: 'LEGACY-EDITED-SENTINEL' }]));

  const d1 = await call(templatesHandler, 'u-d', 'GET');
  assert.equal(d1.body.templates[0].body, 'LEGACY-EDITED-SENTINEL', 'existing edits preserved');

  const a = await call(templatesHandler, 'u-a', 'GET');
  assert.ok(!JSON.stringify(a.body).includes('LEGACY-EDITED-SENTINEL'),
    'another club never inherits the default club\'s edited list');

  await call(templatesHandler, 'u-d', 'POST',
    { id: 'tpl-extra', name: 'Extra', title: 'T', body: 'NEW' });
  const d2 = await call(templatesHandler, 'u-d', 'GET');
  assert.ok(d2.body.templates.some(t => t.body === 'LEGACY-EDITED-SENTINEL'), 'adoption kept the legacy entries');
  assert.ok(d2.body.templates.some(t => t.id === 'tpl-extra'), 'and added the new one');
});

test('TEMPLATES — cron resolves a schedule\'s template from the SCHEDULE\'s club (content injection killed)', async () => {
  await seed();
  assert.equal(typeof templatesForClub, 'function', 'templates.js exports the per-club resolver cron uses');
  await call(templatesHandler, 'u-b', 'POST',
    { id: 'tpl-availability', name: 'Weekly Availability', title: 'B', body: 'BETA-DELIVERY-SENTINEL' });
  await call(templatesHandler, 'u-a', 'POST',
    { id: 'tpl-availability', name: 'Weekly Availability', title: 'A', body: 'ALPHA-DELIVERY-SENTINEL' });

  const forB = await templatesForClub(CLUB_B);
  assert.equal(forB.find(t => t.id === 'tpl-availability').body, 'BETA-DELIVERY-SENTINEL',
    'club B\'s reminders carry club B\'s body, whatever club A wrote');
});
