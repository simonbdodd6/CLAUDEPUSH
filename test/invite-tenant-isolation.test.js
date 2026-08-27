/**
 * INVITATIONS ARE PER CLUB — one busy club can no longer break another's links.
 *
 * Every club's invitations used to share one flat list (`ce:invites`) that was
 * trimmed to a fixed length on every write. So a club creating invitations
 * pushed OTHER clubs' pending invitations off the end, and their perfectly
 * valid links started answering "Invite not found". That is a cross-tenant
 * availability fault: one tenant's ordinary use silently breaking another's.
 *
 * Each club now owns `app:invites:<teamId>` and spends its own cap. The old
 * list is still READ, so links minted before the split keep working, and the
 * migration only ever COPIES out of it — it is never written to, so it stays
 * a verbatim backup until we decide separately that it can be retired.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.inviteiso.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://api.resend.com')) return { ok: true, status: 200, json: async () => ({ id: 'em' }) };
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');
const inviteStore = await import('../api/_inviteStore.js');
const { MAX_INVITES_PER_CLUB } = inviteStore;

const A = 'alpha-rfc', B = 'bravo-rfc';
const clubKey = id => `app:invites:${id}`;
const clubList = id => JSON.parse(kv.get(clubKey(id)) || '[]');
const legacyList = () => JSON.parse(kv.get('ce:invites') || '[]');
const audits = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };

function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([
    { id: A, name: 'Alpha RFC', plan: 'trial', planStatus: 'active' },
    { id: B, name: 'Bravo RFC', plan: 'trial', planStatus: 'active' },
  ]));
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-a', email: 'a@alpha.test', displayName: 'Alpha Coach' },
    { id: 'u-b', email: 'b@bravo.test', displayName: 'Bravo Coach' },
  ]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-a', teamId: A, userId: 'u-a', role: 'coach', staffLevel: 'head', status: 'active',
      isOwner: true, accessProfile: 'full' },
    { id: 'm-b', teamId: B, userId: 'u-b', role: 'coach', staffLevel: 'head', status: 'active',
      isOwner: true, accessProfile: 'full' },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set('ce:invites', JSON.stringify([]));
}

function makeRes() {
  return { code: 0, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end(b) { this.body = this.body ?? b ?? null; return this; } };
}
async function call(handler, { method = 'POST', query = {}, body = null, token = '' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api', query, body, on() {},
    headers: { 'content-type': 'application/json', host: 'test.local',
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const invite = (body, token) => call(inviteHandler, { method: 'POST', body, token });
const validate = token => call(inviteHandler, { method: 'GET', query: { token } });
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const sessionFor = (userId, teamId) => store.createSession({ userId, teamId, role: 'coach' });
const newInvite = (name, token) => invite({ name, role: 'player', sendEmail: false }, token);

// ── A/B: each club's invitations land in its own list ───────────────────────

test('A+B. an invitation is stored in its own club, and nowhere else', async () => {
  seed();
  const a = await sessionFor('u-a', A);
  const b = await sessionFor('u-b', B);
  const ra = await newInvite('Alpha Player', a.token);
  const rb = await newInvite('Bravo Player', b.token);
  assert.equal(ra.body.ok, true, JSON.stringify(ra.body));
  assert.equal(rb.body.ok, true, JSON.stringify(rb.body));

  assert.deepEqual(clubList(A).map(i => i.name), ['Alpha Player']);
  assert.deepEqual(clubList(B).map(i => i.name), ['Bravo Player']);
  // The shared list is not written to at all any more.
  assert.deepEqual(legacyList(), [], 'the global list is never written');
  // Each record still names its own club, exactly as before.
  assert.equal(clubList(A)[0].teamId, A);
  assert.equal(clubList(B)[0].teamId, B);
});

// ── C: THE FAULT. One club's volume cannot evict another's link ─────────────

test('C. filling one club past the cap leaves another club\'s invitation intact', async () => {
  seed();
  const b = await sessionFor('u-b', B);

  // Bravo's single pending invitation — the one that used to disappear when a
  // busier club filled the shared list.
  const bravo = await newInvite('Bravo Player', b.token);
  const bravoToken = bravo.body.token;
  assert.equal((await validate(bravoToken)).code, 200, 'resolves to begin with');

  // Alpha now creates far more invitations than the whole store used to hold.
  // Driven through the store rather than the route because the cap is the
  // store's rule; the route additionally rate-limits a human coach.
  for (let n = 0; n < MAX_INVITES_PER_CLUB + 25; n++) {
    await inviteStore.appendClubInvite(A, {
      token: `alpha-${n}`, name: `Alpha ${n}`, role: 'player', teamId: A,
      status: 'pending', createdAt: new Date().toISOString(),
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
  }

  // Alpha spent its OWN cap and nobody else's.
  assert.equal(clubList(A).length, MAX_INVITES_PER_CLUB, 'the cap is per club');
  assert.equal(clubList(B).length, 1, "Bravo's list is untouched");
  const still = await validate(bravoToken);
  assert.equal(still.code, 200, "the other club's link still resolves");
  assert.equal(still.body.valid, true);

  // Alpha's own newest survive while its own oldest are displaced — the same
  // rule as before, now scoped to the club that caused it.
  const tokens = clubList(A).map(i => i.token);
  assert.equal(tokens.includes(`alpha-${MAX_INVITES_PER_CLUB + 24}`), true, 'its newest kept');
  assert.equal(tokens.includes('alpha-0'), false, 'its own oldest displaced');
  // And Bravo's record is still claimable, which is the whole point.
  const claimed = await identity({ action: 'claim_invite', token: bravoToken,
    email: 'bp@bravo.test', name: 'Bravo Player', password: 'longEnough123' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  assert.equal(claimed.body.teamMember.teamId, B, 'and lands in the right club');
});

// ── D/E/M/N: no club can reach another's invitations ────────────────────────

test('D+E+M. neither club can read, resend or revoke the other\'s invitation', async () => {
  seed();
  const a = await sessionFor('u-a', A);
  const b = await sessionFor('u-b', B);
  const bravo = await newInvite('Bravo Player', b.token);
  const alpha = await newInvite('Alpha Player', a.token);

  // The listing is scoped to the caller's own club.
  const aList = await call(inviteHandler, { method: 'GET', token: a.token });
  assert.equal(aList.code, 200, JSON.stringify(aList.body));
  const aTokens = (aList.body.invites || []).map(i => i.token);
  assert.equal(aTokens.includes(alpha.body.token), true, 'sees its own');
  assert.equal(aTokens.includes(bravo.body.token), false, "never the other club's");

  // Mutating across the boundary is refused, both directions.
  for (const [label, token, target] of [
    ['alpha→bravo', a.token, bravo.body.token],
    ['bravo→alpha', b.token, alpha.body.token],
  ]) {
    const resend = await call(inviteHandler, { method: 'PATCH', body: { token: target, action: 'resend' }, token });
    assert.ok(resend.code === 403 || resend.code === 404, `${label} resend: HTTP ${resend.code}`);
    const revoke = await call(inviteHandler, { method: 'DELETE', body: { token: target }, token });
    assert.ok(revoke.code === 403 || revoke.code === 404, `${label} revoke: HTTP ${revoke.code}`);
  }
  // A forged teamId in the body changes nothing — tenancy comes from the session.
  const forged = await call(inviteHandler, { method: 'DELETE',
    body: { token: bravo.body.token, teamId: B, clubId: B }, token: a.token });
  assert.ok(forged.code === 403 || forged.code === 404, `forged: HTTP ${forged.code}`);
  assert.equal(clubList(B)[0].status, 'pending', "Bravo's invitation is untouched");
});

test('N. an anonymous caller gains nothing from the namespace', async () => {
  seed();
  const b = await sessionFor('u-b', B);
  const bravo = await newInvite('Bravo Player', b.token);
  // Listing and mutating still require a session.
  assert.equal((await call(inviteHandler, { method: 'GET' })).code >= 400, true);
  const anonRevoke = await call(inviteHandler, { method: 'DELETE', body: { token: bravo.body.token } });
  assert.ok(anonRevoke.code >= 400, `anonymous revoke: HTTP ${anonRevoke.code}`);
  // Validating a token still works (it always did) and still discloses no PII.
  const v = await validate(bravo.body.token);
  assert.equal(v.code, 200);
  assert.equal(v.body.name, undefined, 'still no PII to an unauthenticated holder');
  assert.equal(v.body.email, undefined);
  assert.equal(clubList(B)[0].status, 'pending');
});

// ── F/G/H: migrating the pre-namespace records ──────────────────────────────

/** Records exactly as the old global list held them. */
function seedLegacy() {
  seed();
  kv.set('ce:invites', JSON.stringify([
    { token: 'legacy-a', name: 'Legacy Alpha', role: 'player', email: 'la@alpha.test',
      teamId: A, status: 'pending', createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z' },
    { token: 'legacy-b', name: 'Legacy Bravo', role: 'player', email: 'lb@bravo.test',
      teamId: B, status: 'pending', createdAt: '2026-01-02T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z' },
    { token: 'legacy-orphan', name: 'No Club', role: 'player', status: 'pending',
      createdAt: '2026-01-03T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
  ]));
}

test('F. pre-namespace invitations still resolve, and migrate into their clubs', async () => {
  seedLegacy();
  // They work BEFORE any migration — that is what makes migrating optional.
  assert.equal((await validate('legacy-a')).code, 200, 'old link works untouched');

  const platform = { id: 'u-plat', email: 'p@ce.test', displayName: 'Platform',
                     platformRole: 'platform_admin' };
  kv.set('app:identity:users', JSON.stringify([...JSON.parse(kv.get('app:identity:users')), platform]));
  const admin = await store.createSession({ userId: 'u-plat', teamId: A, role: 'coach' });

  const r = await identity({ action: 'migrate_invites' }, admin.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.report.migrated, 2, 'both attributable records moved');
  assert.deepEqual(clubList(A).map(i => i.token), ['legacy-a']);
  assert.deepEqual(clubList(B).map(i => i.token), ['legacy-b']);

  // Records are copied verbatim — every field preserved.
  assert.deepEqual(clubList(A)[0], JSON.parse(kv.get('ce:invites')).find(i => i.token === 'legacy-a'));
  // The legacy list is left exactly as it was: a verbatim backup.
  assert.equal(legacyList().length, 3, 'nothing was deleted from the old list');

  // An invitation naming NO club is never guessed at — it is reported and left.
  assert.deepEqual(r.body.report.skipped, [{ token: 'legacy-orphan', reason: 'missing_team' }]);
  assert.equal((await validate('legacy-orphan')).code, 200, 'and it still resolves');
});

test('G. migrating twice changes nothing the second time', async () => {
  seedLegacy();
  kv.set('app:identity:users', JSON.stringify([...JSON.parse(kv.get('app:identity:users')),
    { id: 'u-plat', email: 'p@ce.test', displayName: 'P', platformRole: 'platform_admin' }]));
  const admin = await store.createSession({ userId: 'u-plat', teamId: A, role: 'coach' });

  // A dry run reports what WOULD move and writes nothing.
  const dry = await identity({ action: 'migrate_invites', dryRun: true }, admin.token);
  assert.equal(dry.body.report.migrated, 2);
  assert.equal(dry.body.report.dryRun, true);
  assert.deepEqual(clubList(A), [], 'a rehearsal writes nothing');

  await identity({ action: 'migrate_invites' }, admin.token);
  const after = JSON.stringify([clubList(A), clubList(B), legacyList()]);

  const again = await identity({ action: 'migrate_invites' }, admin.token);
  assert.equal(again.code, 200);
  assert.equal(again.body.report.migrated, 0, 'nothing left to move');
  assert.equal(again.body.report.alreadyMigrated, 2);
  assert.equal(JSON.stringify([clubList(A), clubList(B), legacyList()]), after, 'byte-identical');

  // A record CLAIMED since the first run is not reverted by a re-run.
  const list = clubList(A);
  list[0] = { ...list[0], status: 'accepted', acceptedBy: 'someone' };
  kv.set(clubKey(A), JSON.stringify(list));
  await identity({ action: 'migrate_invites' }, admin.token);
  assert.equal(clubList(A)[0].status, 'accepted', 'the newer record is never overwritten');
});

test('H+K. a pre-namespace link still claims, and records who claimed it', async () => {
  seedLegacy();
  const claimed = await identity({ action: 'claim_invite', token: 'legacy-b',
    email: 'lb@bravo.test', name: 'Legacy Bravo', password: 'longEnough123' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  // They land in the club the INVITATION named, not one they chose.
  assert.equal(claimed.body.teamMember.teamId, B);
  // The claim is recorded on the record in the home it actually lives in.
  const record = legacyList().find(i => i.token === 'legacy-b');
  assert.equal(record.status, 'accepted');
  assert.equal(record.acceptedBy, claimed.body.user.id, 'acceptedBy still recorded');
  assert.ok(record.acceptedAt);
  // And it cannot be claimed twice.
  const twice = await identity({ action: 'claim_invite', token: 'legacy-b',
    email: 'lb@bravo.test', name: 'Legacy Bravo', password: 'longEnough123' });
  assert.equal(twice.code >= 400, true, `second claim refused (HTTP ${twice.code})`);
});

test('H2. a migrated link claims against its CLUB copy, never the stale one', async () => {
  seedLegacy();
  kv.set('app:identity:users', JSON.stringify([...JSON.parse(kv.get('app:identity:users')),
    { id: 'u-plat', email: 'p@ce.test', displayName: 'P', platformRole: 'platform_admin' }]));
  const admin = await store.createSession({ userId: 'u-plat', teamId: A, role: 'coach' });
  await identity({ action: 'migrate_invites' }, admin.token);

  const claimed = await identity({ action: 'claim_invite', token: 'legacy-a',
    email: 'la@alpha.test', name: 'Legacy Alpha', password: 'longEnough123' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  assert.equal(clubList(A)[0].status, 'accepted', 'the club copy took the claim');
  assert.equal(clubList(A)[0].acceptedBy, claimed.body.user.id);
  // The stale legacy copy still reads pending — and is inert, because the club
  // copy wins on lookup, so it can never be claimed a second time through it.
  assert.equal(legacyList().find(i => i.token === 'legacy-a').status, 'pending');
  const twice = await identity({ action: 'claim_invite', token: 'legacy-a',
    email: 'la@alpha.test', name: 'Legacy Alpha', password: 'longEnough123' });
  assert.equal(twice.code >= 400, true, 'the inert copy cannot be claimed');
});

// ── I/J/L: ordinary invitation behaviour is unchanged ───────────────────────

test('I. resend updates the invitation in its own club', async () => {
  seed();
  const a = await sessionFor('u-a', A);
  const created = await invite({ name: 'Alpha Player', role: 'player',
    email: 'ap@alpha.test', sendEmail: false }, a.token);
  assert.equal(created.body.ok, true, JSON.stringify(created.body));
  const token = created.body.token;
  const r = await call(inviteHandler, { method: 'PATCH',
    body: { token, action: 'resend' }, token: a.token });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const stored = clubList(A).find(i => i.token === token);
  assert.ok(stored.emailDelivery, 'the delivery result landed on the club record');
  assert.equal(legacyList().length, 0, 'and nothing was written to the old list');
});

test('J+L. expiry, revocation, roles and scopes behave exactly as before', async () => {
  seed();
  const a = await sessionFor('u-a', A);
  const created = await newInvite('Alpha Player', a.token);
  const token = created.body.token;

  // Role and club are recorded as they always were.
  const stored = clubList(A).find(i => i.token === token);
  assert.equal(stored.role, 'player');
  assert.equal(stored.teamId, A);
  assert.equal(stored.status, 'pending');

  // Expiry still refuses the link.
  const list = clubList(A);
  list.find(i => i.token === token).expiresAt = '2020-01-01T00:00:00.000Z';
  kv.set(clubKey(A), JSON.stringify(list));
  const expired = await validate(token);
  assert.equal(expired.code, 410);
  assert.equal(expired.body.valid, false);

  // Revocation still soft-deletes, in the club's own list.
  const fresh = await newInvite('Second Player', a.token);
  const revoked = await call(inviteHandler, { method: 'DELETE',
    body: { token: fresh.body.token }, token: a.token });
  assert.equal(revoked.code, 200, JSON.stringify(revoked.body));
  const after = clubList(A).find(i => i.token === fresh.body.token);
  assert.equal(after.status, 'revoked');
  assert.ok(after.revokedAt);
  assert.equal((await validate(fresh.body.token)).code, 410);
});

// ── Malformed and duplicate records ─────────────────────────────────────────

test('O+P. malformed legacy records are preserved, never guessed at', async () => {
  seed();
  kv.set('ce:invites', JSON.stringify([
    { token: 'no-team', name: 'Orphan', role: 'player', status: 'pending' },
    { token: '', name: 'No Token', teamId: A, status: 'pending' },
    { token: 'unknown-club', name: 'Ghost', role: 'player', teamId: 'deleted-rfc', status: 'pending' },
    { token: 'dupe', name: 'First', role: 'player', teamId: A, status: 'pending' },
    { token: 'dupe', name: 'Second', role: 'player', teamId: A, status: 'pending' },
    { token: 'claimed', name: 'Done', role: 'player', teamId: A, status: 'accepted',
      acceptedBy: 'u-old', acceptedAt: '2026-01-01T00:00:00.000Z' },
  ]));
  kv.set('app:identity:users', JSON.stringify([...JSON.parse(kv.get('app:identity:users')),
    { id: 'u-plat', email: 'p@ce.test', displayName: 'P', platformRole: 'platform_admin' }]));
  const admin = await store.createSession({ userId: 'u-plat', teamId: A, role: 'coach' });
  const before = kv.get('ce:invites');

  const r = await identity({ action: 'migrate_invites' }, admin.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const reasons = r.body.report.skipped.map(x => x.reason).sort();
  assert.deepEqual(reasons, ['missing_team', 'missing_token'], 'both unattributable kinds reported');
  // A club named on the record is honoured even if that club is gone — the
  // record says where it belongs, and that is evidence, not a guess.
  assert.deepEqual(clubList('deleted-rfc').map(i => i.token), ['unknown-club']);
  // A duplicated token is carried across once per record, unchanged.
  assert.equal(clubList(A).filter(i => i.token === 'dupe').length, 2, 'records preserved as found');
  // An already-claimed record keeps its claim.
  const claimed = clubList(A).find(i => i.token === 'claimed');
  assert.equal(claimed.status, 'accepted');
  assert.equal(claimed.acceptedBy, 'u-old');
  // The legacy list is byte-identical afterwards.
  assert.equal(kv.get('ce:invites'), before, 'the old list is never modified');
});

test('Q. only a platform admin may migrate, and it grants no club access', async () => {
  seedLegacy();
  const a = await sessionFor('u-a', A);          // a club owner with Full Access
  const refused = await identity({ action: 'migrate_invites' }, a.token);
  assert.equal(refused.code, 403, JSON.stringify(refused.body));
  assert.match(String(refused.body.error), /Platform administrators only/i);
  const forged = await identity({ action: 'migrate_invites',
    platformRole: 'platform_admin', isPlatformAdmin: true }, a.token);
  assert.equal(forged.code, 403);
  assert.equal((await identity({ action: 'migrate_invites' }, '')).code, 403, 'anonymous');
  assert.deepEqual(clubList(A), [], 'no refusal migrated anything');

  // The platform admin who CAN migrate gains no membership from doing so.
  kv.set('app:identity:users', JSON.stringify([...JSON.parse(kv.get('app:identity:users')),
    { id: 'u-plat', email: 'p@ce.test', displayName: 'P', platformRole: 'platform_admin' }]));
  const admin = await store.createSession({ userId: 'u-plat', teamId: A, role: 'coach' });
  await identity({ action: 'migrate_invites' }, admin.token);
  const members = JSON.parse(kv.get('app:identity:team_members'));
  assert.deepEqual(members.filter(m => m.userId === 'u-plat'), [], 'no membership created');
});

// ── THE PLATFORM-ADMIN MIGRATION CARD ───────────────────────────────────────
// The migration already existed as an endpoint; this is the surface that lets
// a platform administrator run it without developer tooling. The card decides
// NOTHING: it asks the existing endpoint to run, with dryRun true or false,
// and renders whatever report comes back. Every judgement about which
// invitation belongs to which club stays on the server.

const html = await (await import('node:fs/promises'))
  .readFile(new URL('../index.html', import.meta.url), 'utf8');
const cardSrc = html.slice(html.indexOf('function renderInviteMigrationCard'),
                           html.indexOf('function renderPlatformClubsCard'));
const runSrc = html.slice(html.indexOf('async function inviteMigrationRun'),
                          html.indexOf('async function inviteMigrationConfirm'));
const confirmSrc = html.slice(html.indexOf('async function inviteMigrationConfirm'),
                              html.indexOf('function inviteSkipReasonLabel'));

test('UI-1. the card is platform-admin gated and offered nowhere else', () => {
  assert.match(cardSrc, /_myPlatformRole !== 'platform_admin'/, 'hidden from everyone else');
  // Rendered from exactly one place — the platform-admin area.
  assert.equal((html.match(/renderInviteMigrationCard\(\)/g) || []).length, 2,
    'defined once, rendered once');
  const composed = html.slice(html.indexOf('${renderPlatformClubsCard()}') - 200,
                              html.indexOf('${renderPlatformAdminsCard()}') + 40);
  assert.match(composed, /renderInviteMigrationCard\(\)/, 'sits with the other platform tools');
});

test('UI-2. the request carries only "run it" — never a club, person or token', () => {
  assert.match(runSrc, /action: 'migrate_invites', dryRun/, 'the one instruction it sends');
  for (const forbidden of ['clubId', 'teamId', 'userId', 'founderUserId', 'token:']) {
    assert.equal(runSrc.includes(forbidden), false,
      `the UI must not send ${forbidden} as a migration instruction`);
  }
  // No client-side privilege check standing in for the server's.
  assert.equal(/isPlatformAdmin\s*\(/.test(runSrc), false, 'no client-side authorization');
});

test('UI-3. the real migration is offered only after a dry run that found work', () => {
  assert.match(cardSrc, /const dryDone = !!report && report\.dryRun === true;/);
  assert.match(cardSrc, /const nothingToDo = dryDone && Number\(report\.migrated \|\| 0\) === 0;/);
  assert.match(cardSrc, /const offerMigrate = dryDone && !nothingToDo && !m\.completed;/);
  assert.match(cardSrc, /\$\{offerMigrate \? `/, 'the button is conditional on that');
  // And it always confirms first.
  assert.match(confirmSrc, /ceConfirm\(/);
  assert.match(confirmSrc, /This will migrate the invitations identified by the dry run/);
  assert.match(confirmSrc, /if \(!ok\) return;/, 'cancel returns before any request');
  const afterGuard = confirmSrc.slice(confirmSrc.indexOf('if (!ok) return;'));
  assert.match(afterGuard, /inviteMigrationRun\(false\)/, 'only a confirmed run writes');
});

test('UI-4. the report is rendered from the server\'s own fields, and nothing invented', () => {
  const reportSrc = html.slice(html.indexOf('function inviteMigrationReportHtml'),
                               html.indexOf('function renderInviteMigrationCard'));
  for (const field of ['report.scanned', 'report.migrated', 'report.alreadyMigrated',
                       'report.skipped', 'report.clubs', 'report.dryRun']) {
    assert.ok(reportSrc.includes(field), `renders ${field}`);
  }
  // A dry run must never read as though it changed something.
  assert.match(reportSrc, /Dry run — no data changed/);
  assert.match(reportSrc, /Would be moved/);
  assert.match(cardSrc, /Nothing needs migrating/, 'an empty dry run says so plainly');
  assert.match(cardSrc, /legacy store is kept/i, 'states the backup guarantee');
  // Only the reasons the server actually returns are translated.
  const reasons = html.slice(html.indexOf('function inviteSkipReasonLabel'),
                             html.indexOf('function inviteMigrationReportHtml'));
  assert.match(reasons, /missing_team/);
  assert.match(reasons, /missing_token/);
  assert.match(reasons, /rather than guessed at/i);
});

test('UI-5. a dry run reports without touching a single stored invitation', async () => {
  seedLegacy();
  kv.set('app:identity:users', JSON.stringify([...JSON.parse(kv.get('app:identity:users')),
    { id: 'u-plat', email: 'p@ce.test', displayName: 'P', platformRole: 'platform_admin' }]));
  const admin = await store.createSession({ userId: 'u-plat', teamId: A, role: 'coach' });
  const before = JSON.stringify([kv.get('ce:invites'), clubList(A), clubList(B)]);

  const r = await identity({ action: 'migrate_invites', dryRun: true }, admin.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const rep = r.body.report;
  assert.equal(rep.dryRun, true);
  assert.equal(rep.scanned, 3, 'every legacy record was examined');
  assert.equal(rep.migrated, 2, 'and two WOULD move');
  assert.deepEqual(rep.skipped, [{ token: 'legacy-orphan', reason: 'missing_team' }]);
  // Nothing at all was written.
  assert.equal(JSON.stringify([kv.get('ce:invites'), clubList(A), clubList(B)]), before,
    'a dry run changes no stored invitation');
  // No audit entry either — nothing happened to record.
  assert.equal(audits().filter(e => e.event === 'invites_migrated').length, 0);
});

test('UI-6. confirming runs the same endpoint for real; the report reflects the writes', async () => {
  seedLegacy();
  kv.set('app:identity:users', JSON.stringify([...JSON.parse(kv.get('app:identity:users')),
    { id: 'u-plat', email: 'p@ce.test', displayName: 'P', platformRole: 'platform_admin' }]));
  const admin = await store.createSession({ userId: 'u-plat', teamId: A, role: 'coach' });
  await identity({ action: 'migrate_invites', dryRun: true }, admin.token);

  const r = await identity({ action: 'migrate_invites', dryRun: false }, admin.token);
  assert.equal(r.code, 200, JSON.stringify(r.body));
  const rep = r.body.report;
  assert.equal(rep.dryRun, false);
  assert.equal(rep.migrated, 2);
  assert.deepEqual(clubList(A).map(i => i.token), ['legacy-a']);
  assert.deepEqual(clubList(B).map(i => i.token), ['legacy-b']);
  // The unattributable record is still skipped, and still works.
  assert.deepEqual(rep.skipped, [{ token: 'legacy-orphan', reason: 'missing_team' }]);
  assert.equal((await validate('legacy-orphan')).code, 200, 'the skipped link still resolves');
  // The legacy store is intact as a backup.
  assert.equal(legacyList().length, 3);
  assert.equal(audits().filter(e => e.event === 'invites_migrated').length, 1, 'audited once');
});

test('UI-7. no ordinary user can run the migration, however they ask', async () => {
  seedLegacy();
  const owner = await sessionFor('u-a', A);        // a club owner with Full Access
  const before = JSON.stringify([kv.get('ce:invites'), clubList(A), clubList(B)]);
  for (const [label, body, token] of [
    ['club owner dry run',  { action: 'migrate_invites', dryRun: true }, owner.token],
    ['club owner migrate',  { action: 'migrate_invites', dryRun: false }, owner.token],
    ['forged role',         { action: 'migrate_invites', dryRun: false,
                              platformRole: 'platform_admin', isPlatformAdmin: true,
                              user: { platformRole: 'platform_admin' } }, owner.token],
    ['anonymous',           { action: 'migrate_invites', dryRun: false }, ''],
  ]) {
    const r = await identity(body, token);
    assert.equal(r.code, 403, `${label}: ${JSON.stringify(r.body)}`);
    assert.match(String(r.body.error), /Platform administrators only/i);
  }
  assert.equal(JSON.stringify([kv.get('ce:invites'), clubList(A), clubList(B)]), before,
    'no refusal moved anything');
});
