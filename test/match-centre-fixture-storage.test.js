/**
 * Match Centre — FIXTURE-SCOPED STORAGE (Pass A).
 *
 * A club held ONE published squad and ONE draft per coach. Selecting a side for
 * Amstelveense therefore overwrote the side already prepared for Mons: the work
 * was not hidden, it was destroyed. Storage now carries the fixture in the key.
 *
 * Which squad players see is an EXPLICIT pointer written by the act of
 * publishing — never inferred from fixture dates. A pointer that no longer
 * names a live fixture yields nothing rather than some other fixture's squad.
 *
 * Nothing is migrated. A pre-Pass-A record on the club-wide key still answers,
 * but only for the one fixture it names.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.mc-storage.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
const writes = [];
/** Honours MATCH, unlike the older mocks — the wipe and resume paths rely on it. */
const globToRe = pattern =>
  new RegExp(`^${pattern.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const re = at >= 0 ? globToRe(String(args[at + 1])) : null;
    result = ['0', [...kv.keys()].filter(k => !re || re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-mc', OTHER = 'club-other';
const MONS = 'fx_aug22', AMSTEL = 'fx_aug29', FOREIGN = 'fx_other';

const MEMBERS = [
  { id: 'm-coach',  teamId: CLUB,  userId: 'u-coach',  role: 'coach',  status: 'active', accessProfile: 'full' },
  { id: 'm-coach2', teamId: CLUB,  userId: 'u-coach2', role: 'coach',  status: 'active', accessProfile: 'full' },
  { id: 'm-player', teamId: CLUB,  userId: 'u-player', role: 'player', status: 'active' },
  { id: 'm-other',  teamId: OTHER, userId: 'u-other',  role: 'coach',  status: 'active', accessProfile: 'full' },
  // The danger zone is owner-only, so the wipe needs a real owner to exercise it.
  { id: 'm-owner',  teamId: CLUB,  userId: 'u-owner',  role: 'admin',  status: 'active', isOwner: true },
];

function seed() {
  kv.clear(); writes.length = 0;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club' }, { id: OTHER, name: 'Other' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(
    MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Boitsfort', fixtures: [
    { id: MONS,   opposition: 'Mons',         date: '2026-08-22', status: 'scheduled' },
    { id: AMSTEL, opposition: 'Amstelveense', date: '2026-08-29', status: 'scheduled' },
  ] }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ clubName: 'Other', fixtures: [
    { id: FOREIGN, opposition: 'Elsewhere', date: '2026-08-22', status: 'scheduled' },
  ] }));
}

const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function post(userId, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(userId) || '' }, body }, r);
  return r.result;
}
async function get(userId, type, fixture) {
  const r = res();
  const query = fixture === undefined ? { type } : { type, fixture };
  await publishHandler({ method: 'GET', query, headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
async function del(userId, type, fixtureId) {
  const r = res();
  await publishHandler({ method: 'DELETE', query: { type },
    headers: { cookie: cookies.get(userId) || '' }, body: fixtureId ? { fixtureId } : {} }, r);
  return r.result;
}

const squad = extra => ({ published: true, opposition: 'Mons', kickoffDate: '2026-08-22', ...extra });
const named = (fixtureId, opposition) => squad({ fixtureId, opposition, published: true });
const keysMatching = re => [...kv.keys()].filter(k => re.test(k));
/** The player-facing mode: 'fixture' | 'legacy' | 'none', or null when unset. */
const pointerMode = () => {
  const raw = kv.get(`app:publish:${CLUB}:squad:current`);
  return raw ? (JSON.parse(raw)?.mode ?? null) : null;
};

// ── 1. THE ORIGINAL DEFECT: ONE FIXTURE NO LONGER OVERWRITES ANOTHER ───────
test('preparing a second fixture does not destroy the first squad', async () => {
  seed(); await login('u-coach');
  assert.equal((await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') })).code, 200);
  assert.equal((await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') })).code, 200);

  const mons = await get('u-coach', 'squad', MONS);
  assert.equal(mons.body.squad.opposition, 'Mons', 'the Mons squad survived publishing Amstelveense');
  const amstel = await get('u-coach', 'squad', AMSTEL);
  assert.equal(amstel.body.squad.opposition, 'Amstelveense');
});

test('two fixtures occupy two distinct keys', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });
  const squadKeys = keysMatching(/:fixture:.*:squad$/);
  assert.equal(squadKeys.length, 2, 'one key per fixture');
  assert.ok(squadKeys.includes(`app:publish:${CLUB}:fixture:${MONS}:squad`));
  assert.ok(squadKeys.includes(`app:publish:${CLUB}:fixture:${AMSTEL}:squad`));
});

test('drafts for different fixtures are independent', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'draft', data: named(AMSTEL, 'Amstelveense') });

  assert.equal((await get('u-coach', 'draft', MONS)).body.draft.opposition, 'Mons');
  assert.equal((await get('u-coach', 'draft', AMSTEL)).body.draft.opposition, 'Amstelveense');
});

// ── 2. DRAFTS STAY PRIVATE PER COACH, PER FIXTURE ──────────────────────────
test('one coach\'s fixture draft is invisible to another coach', async () => {
  seed(); await login('u-coach'); await login('u-coach2');
  await post('u-coach',  { type: 'draft', data: named(MONS, 'Coach One XV') });
  await post('u-coach2', { type: 'draft', data: named(MONS, 'Coach Two XV') });

  assert.equal((await get('u-coach',  'draft', MONS)).body.draft.opposition, 'Coach One XV');
  assert.equal((await get('u-coach2', 'draft', MONS)).body.draft.opposition, 'Coach Two XV',
    'the second coach did not overwrite the first');
});

test('the no-fixture draft scan cannot surface another coach\'s draft', async () => {
  seed(); await login('u-coach'); await login('u-coach2');
  await post('u-coach2', { type: 'draft', data: named(MONS, 'Coach Two XV') });
  const mine = await get('u-coach', 'draft');
  assert.equal(mine.body.draft, null, 'no draft of my own means none is returned');
});

test('the coach-facing drafts list still sees fixture-scoped drafts', async () => {
  seed(); await login('u-coach'); await login('u-coach2');
  await post('u-coach',  { type: 'draft', data: named(MONS, 'Coach One XV') });
  await post('u-coach2', { type: 'draft', data: named(AMSTEL, 'Coach Two XV') });

  const r = await get('u-coach', 'drafts');
  assert.equal(r.code, 200);
  assert.equal(r.body.drafts.length, 2, 'the list did not empty when storage moved');
  const byUser = Object.fromEntries(r.body.drafts.map(d => [d.userId, d]));
  assert.equal(byUser['u-coach'].fixtureId, MONS, 'and each entry says which fixture');
  assert.equal(byUser['u-coach2'].fixtureId, AMSTEL);
});

test('the drafts list shows one entry per fixture a coach is working on', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'draft', data: named(AMSTEL, 'Amstelveense') });

  const r = await get('u-coach', 'drafts');
  assert.deepEqual(r.body.drafts.map(d => d.fixtureId).sort(), [MONS, AMSTEL].sort());
});

// ── 3. THE PLAYER-FACING POINTER IS EXPLICIT, NEVER INFERRED ───────────────
test('publishing sets the pointer, and players see that fixture', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });

  const pointer = JSON.parse(kv.get(`app:publish:${CLUB}:squad:current`));
  assert.equal(pointer.fixtureId, MONS);
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Mons');
});

test('the LAST publish wins for players — not the earliest fixture date', async () => {
  seed(); await login('u-coach'); await login('u-player');
  // Publish the LATER fixture second; a date-based rule would show Mons.
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Mons');

  // Re-publishing the later fixture moves the pointer back — the coach decides.
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Amstelveense');
  assert.equal((await get('u-coach', 'squad', MONS)).body.squad.opposition, 'Mons',
    'and Mons is still stored, merely not on show');
});

test('a pointer to a deleted fixture shows players nothing, not another squad', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });

  // Mons disappears from the club while the pointer still names it.
  const club = JSON.parse(kv.get(`app:club:${CLUB}`));
  club.fixtures = club.fixtures.filter(f => f.id !== MONS);
  kv.set(`app:club:${CLUB}`, JSON.stringify(club));

  const seen = await get('u-player', 'squad');
  assert.equal(seen.code, 200, 'degrades rather than erroring at the player');
  assert.equal(seen.body.squad, null, 'and never falls through to Amstelveense');
});

// ── 4. UNPUBLISH AND DELETE TOUCH ONE FIXTURE ONLY ─────────────────────────
test('unpublishing one fixture leaves the other intact', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });

  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });
  assert.equal((await get('u-coach', 'squad', MONS)).body.squad, null, 'Mons withdrawn');
  assert.equal((await get('u-coach', 'squad', AMSTEL)).body.squad.opposition, 'Amstelveense',
    'Amstelveense untouched');
});

test('unpublishing the fixture players are seeing moves them to NONE', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });

  // 'none' is recorded explicitly rather than the record being removed: an
  // absent record means "nothing has happened yet" and would fall back to the
  // legacy squad, which is exactly how a withdrawn side used to reappear.
  assert.equal(pointerMode(), 'none');
  assert.equal((await get('u-player', 'squad')).body.squad, null, 'players see nothing, not a stale side');
});

test('unpublishing a fixture players are NOT seeing leaves the pointer alone', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });   // pointer → Amstel
  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });

  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Amstelveense',
    'players keep seeing the fixture that is actually on show');
});

test('unpublishing cannot be undone by the legacy fallback', async () => {
  // The production shape at the moment Pass A ships: a pre-Pass-A squad on the
  // club-wide key that already names its fixture. Withdrawing it must actually
  // withdraw it — not clear the scoped record and let the legacy one answer.
  seed(); await login('u-coach'); await login('u-player');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(MONS, 'Legacy Mons')));
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Legacy Mons');

  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });
  assert.equal((await get('u-player', 'squad')).body.squad, null,
    'the withdrawn squad does not come back through the legacy key');
});

test('deleting a fixture squad also clears a legacy record naming it', async () => {
  seed(); await login('u-coach'); await login('u-player');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(MONS, 'Legacy Mons')));
  assert.equal((await del('u-coach', 'squad', MONS)).code, 200);
  assert.equal((await get('u-player', 'squad')).body.squad, null);
});

test('withdrawing one fixture never disturbs a legacy squad naming another', async () => {
  seed(); await login('u-coach'); await login('u-player');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(AMSTEL, 'Legacy Amstelveense')));
  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Legacy Amstelveense',
    'a different fixture\'s record is left exactly alone');
});

test('DELETE removes one fixture squad and clears the pointer only if it named it', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });   // pointer → Amstel

  assert.equal((await del('u-coach', 'squad', MONS)).code, 200);
  assert.equal((await get('u-coach', 'squad', MONS)).body.squad, null);
  assert.equal(pointerMode(), 'fixture', 'players were not seeing Mons, so nothing moved');
  assert.equal(JSON.parse(kv.get(`app:publish:${CLUB}:squad:current`)).fixtureId, AMSTEL);

  assert.equal((await del('u-coach', 'squad', AMSTEL)).code, 200);
  assert.equal(pointerMode(), 'none', 'deleting what players saw leaves them with nothing');
});

// ── 5. THE ID IS NEVER TAKEN ON TRUST ──────────────────────────────────────
test('a forged or cross-club fixture id is refused on every path', async () => {
  seed(); await login('u-coach');
  for (const bad of ['fx_forged', FOREIGN]) {
    assert.equal((await post('u-coach', { type: 'squad', data: named(bad, 'X') })).code, 404, `publish ${bad}`);
    assert.equal((await post('u-coach', { type: 'draft', data: named(bad, 'X') })).code, 404, `draft ${bad}`);
    assert.equal((await get('u-coach', 'squad', bad)).code, 404, `read squad ${bad}`);
    assert.equal((await get('u-coach', 'draft', bad)).code, 404, `read draft ${bad}`);
    assert.equal((await del('u-coach', 'squad', bad)).code, 404, `delete ${bad}`);
  }
  assert.deepEqual(keysMatching(/:fixture:/), [], 'no refusal ever created a key');
});

test('a foreign club cannot read or write into this club\'s fixture keyspace', async () => {
  seed(); await login('u-coach'); await login('u-other');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });

  assert.equal((await post('u-other', { type: 'squad', data: named(MONS, 'Stolen') })).code, 404,
    'our fixture id is unknown to their club');
  assert.equal((await get('u-other', 'squad', MONS)).code, 404);
  assert.equal((await get('u-coach', 'squad', MONS)).body.squad.opposition, 'Mons', 'ours is unchanged');
  assert.deepEqual(keysMatching(new RegExp(`^app:publish:${OTHER}:fixture:`)), [],
    'nothing was written into the other club at all');
});

test('a fixture id containing key syntax cannot escape its segment', async () => {
  seed(); await login('u-coach');
  // A club may legitimately name a fixture anything; the id must stay one segment.
  const NASTY = 'a:squad';
  const club = JSON.parse(kv.get(`app:club:${CLUB}`));
  club.fixtures.push({ id: NASTY, opposition: 'Odd', date: '2026-09-05', status: 'scheduled' });
  kv.set(`app:club:${CLUB}`, JSON.stringify(club));

  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  assert.equal((await post('u-coach', { type: 'squad', data: named(NASTY, 'Odd') })).code, 200);

  assert.equal((await get('u-coach', 'squad', MONS)).body.squad.opposition, 'Mons',
    'the odd id did not collide with another record');
  assert.equal((await get('u-coach', 'squad', NASTY)).body.squad.opposition, 'Odd');
  assert.ok(kv.has(`app:publish:${CLUB}:fixture:a%3Asquad:squad`), 'stored percent-encoded, one segment');
});

// ── 6. LEGACY RECORDS STILL ANSWER — FOR THEIR OWN FIXTURE ONLY ────────────
test('a pre-Pass-A squad is served to players while no pointer exists', async () => {
  seed(); await login('u-player');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(MONS, 'Legacy Mons')));
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Legacy Mons');
});

test('a pre-Pass-A squad answers an explicit ask for the fixture it names', async () => {
  seed(); await login('u-coach');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(MONS, 'Legacy Mons')));
  assert.equal((await get('u-coach', 'squad', MONS)).body.squad.opposition, 'Legacy Mons');
  assert.equal((await get('u-coach', 'squad', AMSTEL)).body.squad, null,
    'but it is NOT offered for a fixture it does not name');
});

test('an anonymous legacy draft is never adopted by a fixture', async () => {
  seed(); await login('u-coach');
  kv.set(`app:publish:${CLUB}:draft:u-coach`, JSON.stringify(squad({ opposition: 'Anonymous' })));
  assert.equal((await get('u-coach', 'draft', MONS)).body.draft, null,
    'it belongs to no fixture, so it answers for none');
  assert.equal((await get('u-coach', 'draft')).body.draft.opposition, 'Anonymous',
    'though it is still the coach\'s draft when no fixture is named');
});

test('a legacy draft naming a fixture answers for that fixture', async () => {
  seed(); await login('u-coach');
  kv.set(`app:publish:${CLUB}:draft:u-coach`, JSON.stringify(named(MONS, 'Legacy Draft')));
  assert.equal((await get('u-coach', 'draft', MONS)).body.draft.opposition, 'Legacy Draft');
  assert.equal((await get('u-coach', 'draft', AMSTEL)).body.draft, null);
});

test('the first scoped publish takes over from the legacy squad for players', async () => {
  seed(); await login('u-coach'); await login('u-player');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(MONS, 'Legacy Mons')));
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Amstelveense',
    'the pointer now decides');
});

test('an unlinked publish keeps working exactly as it did', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: squad({ opposition: 'No Fixture' }) });
  assert.ok(kv.has(`app:publish:${CLUB}:squad`), 'still the club-wide key');
  assert.deepEqual(keysMatching(/:fixture:/), [], 'and no fixture key invented for it');
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'No Fixture');
});

// ── 7. THE COACH'S OWN DRAFT STILL RESUMES WITHOUT A FIXTURE ───────────────
test('a fixture-linked draft is still returned when no fixture is named', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: named(MONS, 'Mons') });
  assert.equal((await get('u-coach', 'draft')).body.draft.opposition, 'Mons',
    'the pre-Pass-A client keeps working');
});

test('resuming picks the most recently edited draft', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: named(MONS, 'Mons') });
  await new Promise(r => setTimeout(r, 5));
  await post('u-coach', { type: 'draft', data: named(AMSTEL, 'Amstelveense') });
  assert.equal((await get('u-coach', 'draft')).body.draft.opposition, 'Amstelveense');
});

// ── 8. FIXTURE DELETION AND CLUB WIPE ACCOUNT FOR THE NEW KEYS ─────────────
/** The bulk-import route, which refuses to overwrite a fixture that has real work against it. */
async function importUpdate(userId, fixture) {
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'fixtures' },
    headers: { cookie: cookies.get(userId) || '' },
    body: { action: 'import', confirmed: true, fixtures: [{ decision: 'update', fixture }] } }, r);
  return r.result;
}

test('a fixture holding a scoped squad is protected from being overwritten', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });

  const r = await importUpdate('u-coach', { opposition: 'Amstelveense', date: '2026-08-29', venue: 'Moved' });
  assert.equal(r.code, 200);
  assert.equal(r.body.summary.blocked, 1, 'the import was refused');
  assert.equal(r.body.summary.updated, 0);
  assert.match(r.body.details[0].reason, /squad selection/,
    'and the scoped squad is what protected it');
});

test('the pointer alone also protects its fixture', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  // Remove the scoped record but leave the pointer, the state a partial failure
  // would produce: the fixture is still referenced and must stay protected.
  kv.delete(`app:publish:${CLUB}:fixture:${MONS}:squad`);

  const r = await importUpdate('u-coach', { opposition: 'Mons', date: '2026-08-22', venue: 'Moved' });
  assert.equal(r.body.summary.blocked, 1);
  assert.match(r.body.details[0].reason, /squad selection/);
});

test('a fixture with no squad work is still freely updatable', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });

  const r = await importUpdate('u-coach', { opposition: 'Amstelveense', date: '2026-08-29', venue: 'Moved' });
  assert.equal(r.body.summary.blocked, 0, 'Amstelveense has no squad, so nothing blocks it');
  assert.equal(r.body.summary.updated, 1);
});

/** The Danger Zone wipe, which must not leave orphaned records behind. */
async function wipeClub(userId, confirmName) {
  const r = res();
  await publishHandler({ method: 'POST', query: { resource: 'club' },
    headers: { cookie: cookies.get(userId) || '' },
    body: { action: 'delete_club_data', confirmName } }, r);
  return r.result;
}

test('deleting the club clears every fixture-scoped record and the pointer', async () => {
  seed(); await login('u-coach'); await login('u-owner');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });
  await post('u-coach', { type: 'draft', data: named(MONS, 'Draft') });
  assert.equal(keysMatching(/:fixture:/).length, 3, 'two squads and a draft exist before the wipe');

  const r = await wipeClub('u-owner', 'Boitsfort');
  assert.equal(r.code, 200, 'the wipe really ran');
  assert.ok(r.body.deleted.includes('fixture-scoped:3'), 'and reported what it removed');
  assert.deepEqual(keysMatching(/:fixture:/), [], 'no orphaned fixture records survive');
  assert.equal(JSON.parse(kv.get(`app:publish:${CLUB}:squad:current`) ?? 'null'), null, 'pointer gone');
});

test('a wipe refused for the wrong club name deletes nothing', async () => {
  seed(); await login('u-coach'); await login('u-owner');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });

  const r = await wipeClub('u-owner', 'Wrong Name');
  assert.equal(r.code, 400);
  assert.equal(keysMatching(/:fixture:/).length, 1, 'the squad is untouched');
});

// ═══════════════════════════════════════════════════════════════════════════
// PASS A.1 — PLAYER-FACING STATE IS A MODE, NOT A GUESS
//
// Pass A resolved the player-facing squad from a bare fixture id, so an absent
// record was ambiguous: it meant BOTH "nothing has happened yet" (fall back to
// the legacy squad) and "the coach withdrew the squad" (show nothing). That
// ambiguity let an unlinked publish be ignored and a withdrawn side reappear.
// The record now carries an explicit mode: fixture | legacy | none.
// ═══════════════════════════════════════════════════════════════════════════

// ── UNLINKED PUBLISH TAKES OVER THE PLAYER-FACING SLOT ─────────────────────
test('an unlinked publish reaches players even when a fixture pointer exists', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Mons');

  // The client sends this whenever the picker is unset — on a fresh browser or
  // a second coach's device, which is the normal case, not an edge case.
  const r = await post('u-coach', { type: 'squad', data: squad({ opposition: 'Friendly XV' }) });
  assert.equal(r.code, 200);
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Friendly XV',
    'a 200 from publish must mean players actually see it');
  assert.equal(pointerMode(), 'legacy');
});

test('an unlinked publish is given no fixture identity and copies nothing', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: squad({ opposition: 'Friendly XV' }) });

  assert.equal(JSON.parse(kv.get(`app:publish:${CLUB}:squad`)).fixtureId, '', 'no fixture invented');
  assert.equal(JSON.parse(kv.get(`app:publish:${CLUB}:fixture:${MONS}:squad`)).opposition, 'Mons',
    'and the Mons squad is left exactly where it was');
  assert.equal(keysMatching(/:fixture:.*:squad$/).length, 1, 'nothing was copied into a fixture');
});

test('withdrawing an unlinked squad leaves players with nothing', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: squad({ opposition: 'Friendly XV' }) });

  await post('u-coach', { type: 'squad', data: { published: false } });
  assert.equal((await get('u-player', 'squad')).body.squad, null);
  assert.equal(pointerMode(), 'none');
  assert.equal(JSON.parse(kv.get(`app:publish:${CLUB}:fixture:${MONS}:squad`)).opposition, 'Mons',
    'Mons is still STORED — it simply is not promoted');
});

test('an unlinked DELETE leaves players with nothing', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: squad({ opposition: 'Friendly XV' }) });

  assert.equal((await del('u-coach', 'squad')).code, 200);
  assert.equal((await get('u-player', 'squad')).body.squad, null, 'and Mons does not slide back in');
});

// ── THE THREE MODES, STATED DIRECTLY ───────────────────────────────────────
test('no record at all means the pre-Pass-A squad still answers', async () => {
  seed(); await login('u-player');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(MONS, 'Legacy Mons')));
  assert.equal(pointerMode(), null, 'deploy day: nothing has been published or withdrawn yet');
  assert.equal((await get('u-player', 'squad')).body.squad.opposition, 'Legacy Mons');
});

test('mode none beats a legacy squad that is still sitting in storage', async () => {
  seed(); await login('u-coach'); await login('u-player');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(AMSTEL, 'Legacy Amstelveense')));
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });

  assert.equal(pointerMode(), 'none');
  assert.equal((await get('u-player', 'squad')).body.squad, null,
    'withdrawing Mons must not drop players onto the older Amstelveense record');
});

test('a stale pointer yields nothing and does not fall through to legacy', async () => {
  seed(); await login('u-coach'); await login('u-player');
  kv.set(`app:publish:${CLUB}:squad`, JSON.stringify(named(AMSTEL, 'Legacy Amstelveense')));
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });

  const club = JSON.parse(kv.get(`app:club:${CLUB}`));
  club.fixtures = club.fixtures.filter(f => f.id !== MONS);
  kv.set(`app:club:${CLUB}`, JSON.stringify(club));

  const seen = await get('u-player', 'squad');
  assert.equal(seen.code, 200, 'degrades rather than erroring');
  assert.equal(seen.body.squad, null, 'no scoped squad, and no legacy fallback either');
});

// ── FULL STATE MACHINE ─────────────────────────────────────────────────────
// PUBLISH chooses what players see. WITHDRAW clears it. Nothing is ever
// promoted on its own.
test('the whole publish/withdraw lifecycle never promotes a squad by itself', async () => {
  seed(); await login('u-coach'); await login('u-player');
  const seen = async () => (await get('u-player', 'squad')).body.squad?.opposition ?? null;

  assert.equal(await seen(), null, 'START: nothing published');

  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  assert.equal(await seen(), 'Mons');

  await post('u-coach', { type: 'squad', data: squad({ opposition: 'Friendly XV' }) });
  assert.equal(await seen(), 'Friendly XV', 'unlinked publish overrides the old Mons pointer');

  await post('u-coach', { type: 'squad', data: { published: false } });
  assert.equal(await seen(), null, 'Mons does NOT silently reappear');

  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  assert.equal(await seen(), 'Mons');

  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });
  assert.equal(await seen(), 'Amstelveense');
  assert.equal((await get('u-coach', 'squad', MONS)).body.squad.opposition, 'Mons', 'Mons remains stored');

  await post('u-coach', { type: 'squad', data: { fixtureId: AMSTEL, published: false } });
  assert.equal(await seen(), null, 'Mons does NOT automatically reappear');

  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  assert.equal(await seen(), 'Mons', 'only an explicit publish brings it back');
});

// ── WITHDRAWAL REALLY DELETES ──────────────────────────────────────────────
test('a withdrawn scoped squad key is absent, not a null tombstone', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  assert.equal(kv.has(`app:publish:${CLUB}:fixture:${MONS}:squad`), true, 'before: present');

  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });
  assert.equal(kv.has(`app:publish:${CLUB}:fixture:${MONS}:squad`), false,
    'after: gone — a null value would still look like stored squad work');
});

test('a withdrawn fixture can be corrected by import again', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });

  const r = await importUpdate('u-coach', { opposition: 'Mons', date: '2026-08-22', venue: 'New Pitch' });
  assert.equal(r.body.summary.updated, 1, 'no squad exists, so nothing should block the correction');
  assert.equal(r.body.summary.blocked, 0);
});

// ── THE SCOPED SCAN, ISOLATED ──────────────────────────────────────────────
// Deliberately removes every OTHER signal, so only the scoped-key scan in
// downstreamContext can produce the block. If that scan is deleted, this fails.
test('a scoped squad alone protects its fixture — no pointer, no legacy record', async () => {
  seed(); await login('u-coach');
  kv.set(`app:publish:${CLUB}:fixture:${AMSTEL}:squad`,
    JSON.stringify(named(AMSTEL, 'Amstelveense')));
  assert.equal(pointerMode(), null, 'no pointer to do the work');
  assert.equal(kv.has(`app:publish:${CLUB}:squad`), false, 'no legacy record either');

  const r = await importUpdate('u-coach', { opposition: 'Amstelveense', date: '2026-08-29', venue: 'Moved' });
  assert.equal(r.body.summary.blocked, 1, 'only the scoped scan can have produced this');
  assert.match(r.body.details[0].reason, /squad selection/);
});

// ── PLAYERS CANNOT BROWSE FIXTURES ─────────────────────────────────────────
test('a player supplying ?fixture= still gets only the on-show squad', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });

  const r = await get('u-player', 'squad', MONS);
  assert.equal(r.code, 200);
  assert.equal(r.body.squad.opposition, 'Amstelveense',
    'the named fixture is ignored for players — no browsing of sides not on show');
});

test('a player cannot probe which fixtures hold squads', async () => {
  seed(); await login('u-coach'); await login('u-player');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: { fixtureId: MONS, published: false } });

  // Nothing is on show. A real fixture and a forged one must be indistinguishable.
  const real   = await get('u-player', 'squad', MONS);
  const forged = await get('u-player', 'squad', 'fx_forged');
  assert.equal(real.code, 200);
  assert.equal(forged.code, 200, 'no 404 to distinguish a real fixture from an invented one');
  assert.equal(real.body.squad, null);
  assert.equal(forged.body.squad, null);
});

test('a coach keeps explicit per-fixture reads', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });
  await post('u-coach', { type: 'squad', data: named(AMSTEL, 'Amstelveense') });
  assert.equal((await get('u-coach', 'squad', MONS)).body.squad.opposition, 'Mons');
  assert.equal((await get('u-coach', 'squad', 'fx_forged')).code, 404, 'and validation still applies');
});

// ── CLUB WIPE COVERS BOTH GENERATIONS ──────────────────────────────────────
test('the wipe removes legacy per-coach drafts as well as scoped storage', async () => {
  seed(); await login('u-coach'); await login('u-owner');
  kv.set(`app:publish:${CLUB}:draft:u-coach`, JSON.stringify(squad({ opposition: 'Unlinked draft' })));
  await post('u-coach', { type: 'draft', data: named(MONS, 'Scoped draft') });
  await post('u-coach', { type: 'squad', data: named(MONS, 'Mons') });

  const r = await wipeClub('u-owner', 'Boitsfort');
  assert.equal(r.code, 200);
  assert.ok(r.body.deleted.includes('legacy-drafts:1'), 'and it says so');
  assert.equal(kv.has(`app:publish:${CLUB}:draft:u-coach`), false,
    'the pre-Pass-A draft no longer survives a club wipe');
  assert.deepEqual(keysMatching(/:fixture:/), []);
  assert.equal(kv.has(`app:publish:${CLUB}:squad:current`), false, 'pointer gone');
});

test('the drafts list is ordered deterministically, newest first', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: named(MONS, 'Mons') });
  await new Promise(r => setTimeout(r, 5));
  await post('u-coach', { type: 'draft', data: named(AMSTEL, 'Amstelveense') });

  const rows = (await get('u-coach', 'drafts')).body.drafts;
  assert.equal(rows[0].fixtureId, AMSTEL, 'most recently edited first');
  assert.equal(rows[1].fixtureId, MONS);
});

test('each drafts row is internally consistent — no row mixes two fixtures', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'draft', data: named(MONS, 'Mons XV') });
  await new Promise(r => setTimeout(r, 5));
  await post('u-coach', { type: 'draft', data: named(AMSTEL, 'Amstelveense XV') });

  for (const row of (await get('u-coach', 'drafts')).body.drafts) {
    assert.equal(row.squad.fixtureId, row.fixtureId,
      'the squad in a row belongs to the fixture that row names');
    const expected = row.fixtureId === MONS ? 'Mons XV' : 'Amstelveense XV';
    assert.equal(row.squad.opposition, expected, 'and its content matches too');
  }
});
