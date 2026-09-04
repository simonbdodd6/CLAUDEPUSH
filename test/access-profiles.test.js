/**
 * RC4.9C — access-profile model.
 *
 * An access profile (full / coach / manager) is what a person may DO. It is
 * separate from their descriptive club role or job title, and it lives on the
 * team_member record, so it is inherently per-team: "assigned teams" are the
 * teams where a person holds an ACTIVE membership.
 *
 * Permanent player deletion is gated ONLY on PERM.PLAYER_DELETE — never on a
 * job title — which all three profiles grant for their assigned teams.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.accessprofiles.test';
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

const perms = await import('../api/_permissions.js');
const store = await import('../api/_identityStore.js');
const { default: identity } = await import('../api/identity.js');
const { SESSION_COOKIE } = store;
const { PERM } = perms;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function call(body, cookie) {
  const r = res();
  await identity({ method: 'POST', query: {}, headers: cookie ? { cookie } : {}, body }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
const members = () => JSON.parse(kv.get('app:identity:team_members') || '[]');
const memberOf = (userId, teamId) => members().find(m => m.userId === userId && (!teamId || m.teamId === teamId));
const saveMembers = list => kv.set('app:identity:team_members', JSON.stringify(list));
const audits = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };

let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Owner`, email: `o${++_t}@ap.test`, password: 'password123' });
}
async function joinPlayer(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const email = `u${_t}@ap.test`;
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return { ...(await store.claimInvite({ token, email, name, password: 'password123' })), email };
}
/** Promote a member to staff with an explicit access profile, and return a session. */
async function staffWithProfile(teamId, name, profile) {
  const person = await joinPlayer(teamId, name);
  const list = members();
  const m = list.find(x => x.userId === person.user.id && x.teamId === teamId);
  m.role = 'coach';
  m.staffLevel = profile === 'manager' ? 'manager' : profile === 'coach' ? 'assistant' : 'head';
  m.accessProfile = profile;
  saveMembers(list);
  const session = await store.createSession({ userId: person.user.id, teamId, role: 'coach' });
  return { ...person, session, memberId: m.id };
}

// ── 1. Profile → permission mapping (pure) ──────────────────────────────────
test('profiles grant the documented permissions and nothing more', () => {
  const A = s => ({ status: 'active', role: 'coach', ...s });
  const full = perms.permissionsFor(A({ accessProfile: 'full' }));
  const coach = perms.permissionsFor(A({ accessProfile: 'coach' }));
  const manager = perms.permissionsFor(A({ accessProfile: 'manager' }));

  for (const [label, set] of [['full', full], ['coach', coach], ['manager', manager]]) {
    assert.equal(set.has(PERM.PLAYER_DELETE), true, `${label} may delete players`);
  }
  assert.equal(full.has(PERM.ASSIGN_ACCESS), true, 'full may assign access');
  assert.equal(coach.has(PERM.ASSIGN_ACCESS), false, 'coach may NOT assign access');
  assert.equal(manager.has(PERM.ASSIGN_ACCESS), false, 'manager may NOT assign access');
  assert.equal(coach.has(PERM.MANAGE_TEAMS), false, 'coach has no club-wide settings');
  assert.equal(manager.has(PERM.MANAGE_TEAMS), true, 'manager runs fixtures/logistics');
  assert.equal(coach.has(PERM.MEDICAL_ACCESS), false, 'medical is separately authorised');
  assert.equal(manager.has(PERM.MEDICAL_ACCESS), false, 'manager never sees medical');
  assert.equal(coach.has(PERM.PUBLISH_SQUADS), true, 'coach runs selections/Match Centre');
  assert.equal(manager.has(PERM.PUBLISH_SQUADS), false, 'manager does not publish squads');
  assert.equal(perms.permissionsFor(A({ accessProfile: 'coach', medicalAccess: true })).has(PERM.MEDICAL_ACCESS), true,
    'medical can be granted separately on top of a profile');
});

test('profiles are independent of job title, and inactive members hold nothing', () => {
  // A "Team Manager" job title holding Full Access outranks a "Head Coach" on Coach Access.
  const managerWithFull = perms.permissionsFor({ status: 'active', role: 'coach', staffLevel: 'manager', accessProfile: 'full' });
  const headWithCoach   = perms.permissionsFor({ status: 'active', role: 'coach', staffLevel: 'head', accessProfile: 'coach' });
  assert.equal(managerWithFull.has(PERM.ASSIGN_ACCESS), true);
  assert.equal(headWithCoach.has(PERM.ASSIGN_ACCESS), false);
  assert.equal(perms.permissionsFor({ status: 'archived', role: 'coach', accessProfile: 'full' }).size, 0);
});

test('legacy members without a profile keep working (derived defaults)', () => {
  assert.equal(perms.accessProfileOf({ role: 'coach', staffLevel: 'head' }), 'full');
  assert.equal(perms.accessProfileOf({ role: 'coach', staffLevel: 'assistant' }), 'coach');
  assert.equal(perms.accessProfileOf({ role: 'coach', staffLevel: 'manager' }), 'manager');
  assert.equal(perms.accessProfileOf({ role: 'admin' }), 'full');
  assert.equal(perms.accessProfileOf({ role: 'player' }), null);
  // A legacy assistant does not silently lose the medical access they had.
  assert.equal(perms.permissionsFor({ status: 'active', role: 'coach', staffLevel: 'assistant' }).has(PERM.MEDICAL_ACCESS), true);
});

// ── 2. Assignment authority ─────────────────────────────────────────────────
test('owner can assign all three profiles, and every change is audited', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const person = await joinPlayer(A.team.id, 'Staffer');
  const list = members();
  const m = list.find(x => x.userId === person.user.id);
  m.role = 'coach'; m.staffLevel = 'assistant';
  saveMembers(list);

  for (const profile of ['manager', 'coach', 'full']) {
    const r = await call({ action: 'set_access_profile', memberId: m.id, accessProfile: profile, confirmFullAccess: true }, ck(A.session));
    assert.equal(r.statusCode, 200, `${profile}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.newProfile, profile);
    assert.equal(memberOf(person.user.id).accessProfile, profile);
  }
  const entries = audits().filter(e => e.event === 'access_profile_changed');
  assert.equal(entries.length, 3, 'one audit record per change');
  const last = entries[0];
  assert.equal(last.affectedUserId, person.user.id);
  assert.equal(last.previousProfile, 'coach');
  assert.equal(last.newProfile, 'full');
  assert.deepEqual(last.assignedTeams, [A.team.id]);
  assert.equal(last.changedBy, A.user.id);
  assert.equal(last.teamId, A.team.id);
  assert.equal(last.clubId, A.team.id);
  assert.ok(last.changedAt, 'changedAt recorded');
});

test('an authorised Full Access admin (not the owner) can assign profiles', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const admin = await staffWithProfile(A.team.id, 'Full Admin', 'full');
  const target = await staffWithProfile(A.team.id, 'Target Coach', 'coach');
  const r = await call({ action: 'set_access_profile', memberId: target.memberId, accessProfile: 'manager' }, ck(admin.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(memberOf(target.user.id).accessProfile, 'manager');
});

test('granting Full Access requires explicit confirmation', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const target = await staffWithProfile(A.team.id, 'Target', 'coach');
  const noConfirm = await call({ action: 'set_access_profile', memberId: target.memberId, accessProfile: 'full' }, ck(A.session));
  assert.equal(noConfirm.statusCode, 400, 'unconfirmed Full Access grant rejected');
  assert.equal(memberOf(target.user.id).accessProfile, 'coach', 'unchanged');
  const confirmed = await call({ action: 'set_access_profile', memberId: target.memberId, accessProfile: 'full', confirmFullAccess: true }, ck(A.session));
  assert.equal(confirmed.statusCode, 200);
});

test('Coach Access cannot grant itself Full Access, and Manager Access cannot change permissions', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const coach = await staffWithProfile(A.team.id, 'Coach Person', 'coach');
  const manager = await staffWithProfile(A.team.id, 'Manager Person', 'manager');

  const selfElevate = await call({ action: 'set_access_profile', memberId: coach.memberId, accessProfile: 'full', confirmFullAccess: true }, ck(coach.session));
  assert.equal(selfElevate.statusCode, 403, JSON.stringify(selfElevate.body));
  assert.equal(memberOf(coach.user.id).accessProfile, 'coach', 'still coach access');

  const managerChange = await call({ action: 'set_access_profile', memberId: coach.memberId, accessProfile: 'manager' }, ck(manager.session));
  assert.equal(managerChange.statusCode, 403, JSON.stringify(managerChange.body));

  // …and neither can quietly promote a colleague.
  const promoteOther = await call({ action: 'set_access_profile', memberId: manager.memberId, accessProfile: 'full', confirmFullAccess: true }, ck(coach.session));
  assert.equal(promoteOther.statusCode, 403);
});

test('the last full-access administrator cannot be downgraded, and the owner cannot be reduced', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');                       // founder = owner, full access
  const ownerMember = memberOf(A.user.id);
  const selfDown = await call({ action: 'set_access_profile', memberId: ownerMember.id, accessProfile: 'coach' }, ck(A.session));
  assert.notEqual(selfDown.statusCode, 200, 'owner cannot be reduced');
  assert.equal(memberOf(A.user.id).accessProfile, 'full');

  // With a second full-access admin, that admin still cannot be downgraded below one.
  const admin2 = await staffWithProfile(A.team.id, 'Second Admin', 'full');
  const ok = await call({ action: 'set_access_profile', memberId: admin2.memberId, accessProfile: 'coach' }, ck(A.session));
  assert.equal(ok.statusCode, 200, 'a non-final admin may be downgraded');
});

test('a group-scoped head coach cannot assign access profiles', async () => {
  // The dangerous configuration: a LEGACY head coach (no explicit
  // accessProfile → derives 'full' → holds ASSIGN_ACCESS) whose stored
  // accessScope names ONE group. Profile and scope are independent, so
  // without a club-wide gate this member could mint a club-wide Full
  // Access accomplice — the escalation _tenant.js documents as forbidden:
  // access administration is club-level, exactly like set_member_access.
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const scoped = await joinPlayer(A.team.id, 'Scoped Head');
  const list = members();
  const m = list.find(x => x.userId === scoped.user.id);
  m.role = 'coach'; m.staffLevel = 'head';
  m.accessScope = { clubWide: false, groups: [{ groupId: 'grp_initial' }], teams: [] };
  saveMembers(list);
  const session = await store.createSession({ userId: scoped.user.id, teamId: A.team.id, role: 'coach' });

  const target = await joinPlayer(A.team.id, 'Target Person');
  const targetMember = memberOf(target.user.id);

  const r = await call({ action: 'set_access_profile', memberId: targetMember.id, accessProfile: 'full', confirmFullAccess: true }, ck(session));
  assert.equal(r.statusCode, 403, JSON.stringify(r.body));
  assert.match(r.body.error, /club-wide/i);
  assert.equal(memberOf(target.user.id).accessProfile, undefined, 'target profile untouched');

  // The same member with a CLUB-WIDE stored scope is a legitimate admin
  // and keeps the capability — the gate tests scope, not the profile model.
  const widened = members();
  widened.find(x => x.userId === scoped.user.id).accessScope =
    { clubWide: true, groups: [], teams: [] };
  saveMembers(widened);
  const ok = await call({ action: 'set_access_profile', memberId: targetMember.id, accessProfile: 'manager' }, ck(session));
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
});

// ── 3. Player deletion is gated on the PERMISSION, per assigned team ────────
async function deletablePlayer(teamId, name) {
  const p = await joinPlayer(teamId, name);
  return { ...p, memberId: memberOf(p.user.id, teamId).id };
}

test('Coach Access can permanently delete a player in an assigned team', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const coach = await staffWithProfile(A.team.id, 'Coach Person', 'coach');
  const victim = await deletablePlayer(A.team.id, 'Jamie Dodd');
  const r = await call({ action: 'delete_member_permanently', memberId: victim.memberId, confirm: 'DELETE' }, ck(coach.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(memberOf(victim.user.id, A.team.id).status, 'deleted');
});

test('Manager Access can permanently delete a player in an assigned team', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const manager = await staffWithProfile(A.team.id, 'Manager Person', 'manager');
  const victim = await deletablePlayer(A.team.id, 'Jamie Dodd');
  const r = await call({ action: 'delete_member_permanently', memberId: victim.memberId, confirm: 'DELETE' }, ck(manager.session));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
});

test('a player still cannot delete anyone', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const player = await joinPlayer(A.team.id, 'Ordinary Player');
  const victim = await deletablePlayer(A.team.id, 'Jamie Dodd');
  const r = await call({ action: 'delete_member_permanently', memberId: victim.memberId, confirm: 'DELETE' }, ck(player.session));
  assert.equal(r.statusCode, 403);
  assert.equal(memberOf(victim.user.id, A.team.id).status, 'active');
});

test('no profile can delete across clubs or in an unassigned team', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');
  const coachA = await staffWithProfile(A.team.id, 'Coach A', 'coach');
  const managerA = await staffWithProfile(A.team.id, 'Manager A', 'manager');
  const victimB = await deletablePlayer(B.team.id, 'Bravo Player');

  for (const [label, actor] of [['coach', coachA], ['manager', managerA]]) {
    const r = await call({ action: 'delete_member_permanently', memberId: victimB.memberId, confirm: 'DELETE' }, ck(actor.session));
    assert.ok(r.statusCode === 403 || r.statusCode === 404, `${label} blocked cross-club (HTTP ${r.statusCode})`);
  }
  // Explicit cross-tenant teamId is rejected too.
  const spoof = await call({ action: 'delete_member_permanently', memberId: victimB.memberId, confirm: 'DELETE', teamId: B.team.id }, ck(coachA.session));
  assert.ok(spoof.statusCode === 403 || spoof.statusCode === 404);
  assert.equal(memberOf(victimB.user.id, B.team.id).status, 'active', 'club B player untouched');
});

test('existing safeguards still hold under the profile model', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const coach = await staffWithProfile(A.team.id, 'Coach Person', 'coach');
  const victim = await deletablePlayer(A.team.id, 'Jamie Dodd');

  // typed confirmation
  assert.equal((await call({ action: 'delete_member_permanently', memberId: victim.memberId }, ck(coach.session))).statusCode, 400);
  assert.equal((await call({ action: 'delete_member_permanently', memberId: victim.memberId, confirm: 'nope' }, ck(coach.session))).statusCode, 400);
  // cannot delete self
  const self = await call({ action: 'delete_member_permanently', memberId: coach.memberId, confirm: 'DELETE' }, ck(coach.session));
  assert.equal(self.statusCode, 400);
  // owner is protected even from a Full Access admin
  const admin2 = await staffWithProfile(A.team.id, 'Second Admin', 'full');
  const killOwner = await call({ action: 'delete_member_permanently', memberId: memberOf(A.user.id).id, confirm: 'DELETE' }, ck(admin2.session));
  assert.notEqual(killOwner.statusCode, 200, 'club owner cannot be deleted');
  assert.match(String(killOwner.body?.error || ''), /owner/i);
});

test('a profile change takes effect immediately for an already-active session', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const person = await staffWithProfile(A.team.id, 'Shifting Staff', 'coach');
  const victim = await deletablePlayer(A.team.id, 'Jamie Dodd');

  // Their EXISTING session currently allows deletion…
  const before = await store.resolveSessionFromRequest({ headers: { cookie: ck(person.session) } });
  assert.equal(perms.permissionsFor(before.teamMember).has(PERM.PLAYER_DELETE), true);

  // …the owner downgrades them to a profile with no delete right. Simulated by
  // assigning 'manager' then stripping the permission is not needed: instead we
  // demote the membership to a plain player, the strongest form of the check.
  const list = members();
  const m = list.find(x => x.userId === person.user.id);
  m.role = 'player'; delete m.staffLevel; delete m.accessProfile;
  saveMembers(list);

  // The SAME session token now resolves with no delete permission — permissions
  // are recomputed from the membership on every request, never cached in the session.
  const after = await store.resolveSessionFromRequest({ headers: { cookie: ck(person.session) } });
  assert.equal(perms.permissionsFor(after.teamMember).has(PERM.PLAYER_DELETE), false);
  const r = await call({ action: 'delete_member_permanently', memberId: victim.memberId, confirm: 'DELETE' }, ck(person.session));
  assert.equal(r.statusCode, 403, 'downgrade applies to the live session immediately');
});

// ── 4. UI matches the API ───────────────────────────────────────────────────
test('Members UI exposes the Access section and matches the API gates', () => {
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(src, /function renderAccessSection\(/, 'Access section exists');
  assert.match(src, /Assigned teams:/, 'shows assigned teams');
  assert.match(src, /Last changed by /, 'shows who last changed it');
  assert.match(src, /canI\('assign_access'\)/, 'selector is gated on assign_access, matching the API');
  const fn = src.slice(src.indexOf('async function adminSetAccessProfile'), src.indexOf('async function adminSetStaffLevel'));
  assert.match(fn, /Grant Full Access to /, 'Full Access confirmation prompt');
  assert.match(fn, /confirmFullAccess: true/, 'sends the explicit confirmation flag');
  // The permanent-delete control must no longer be gated on job-title permissions.
  assert.match(src, /canI\('player_delete'\)/, 'delete button gated on the PLAYER_DELETE permission');
  assert.doesNotMatch(src, /canI\('manage_coaches'\) && canI\('danger_zone'\)/, 'old role-shaped gate removed');
});
