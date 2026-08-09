/**
 * RC4.7 — a PLAYER granted Medical access cannot reach the Medical page.
 *
 * These pin each link in the chain, so the root cause is demonstrated rather
 * than asserted. Links 1-4 already hold today; 5-7 are the defect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const { permissionsFor, PERM } = await import('../api/_permissions.js');

const PLAIN  = { id: 'm1', teamId: 'c1', userId: 'u1', role: 'player', status: 'active' };
const MEDIC  = { ...PLAIN, medicalAccess: true };

function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let depth = 0, end = src.indexOf('{', start);
  for (let b = end; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

// ── LINK 1-2: the permission engine is correct ─────────────────────────────
test('a plain player has no medical access, and the grant is additive', () => {
  const plain = permissionsFor(PLAIN);
  assert.equal(plain.has(PERM.MEDICAL_ACCESS), false, 'plain player: no medical');

  const medic = permissionsFor(MEDIC);
  assert.equal(medic.has(PERM.MEDICAL_ACCESS), true, 'granted player: medical');
});

test('the grant confers NO unrelated staff permission', () => {
  const medic = permissionsFor(MEDIC);
  for (const p of [PERM.MANAGE_TEAMS, PERM.ASSIGN_ACCESS, PERM.MANAGE_COACHES,
                   PERM.MANAGE_PLAYERS, PERM.PUBLISH_SQUADS, PERM.DANGER_ZONE]) {
    assert.equal(medic.has(p), false, `must not gain ${p}`);
  }
});

test('removing the grant revokes medical access again', () => {
  assert.equal(permissionsFor({ ...MEDIC, medicalAccess: false }).has(PERM.MEDICAL_ACCESS), false);
  const { medicalAccess, ...cleared } = MEDIC;
  assert.equal(permissionsFor(cleared).has(PERM.MEDICAL_ACCESS), false);
});

// ── LINK 3-4: the client receives and reads the permission correctly ───────
test('the session payload carries server-computed permissions', () => {
  const store = fs.readFileSync(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
  assert.match(store, /permissions: \[\.\.\.permissionsFor\(member\)\]/,
    'permissions are recomputed from storage on every session response');
  assert.match(fn('canI'), /_myPermissions\.includes\(perm\)/, 'client reads the delivered list');
  assert.match(src, /medical: 'medical_access'/, 'SECTION_PERMS maps medical correctly');
});

// ── LINK 5-6: NAV AND ROUTE now gate on the PERMISSION ─────────────────────

/** Evaluate the nav/route gates against a stubbed permission list. */
function gates(perms, role) {
  const map = src.match(/const SECTION_PERM_MAP = (\{[^}]*\});/)[1];
  return new Function(`
    const SECTION_PERM_MAP = ${map};
    const _perms = ${JSON.stringify(perms)};
    function canI(p) { return _perms.includes(p); }
    function isCoach() { return ["coach","admin","medical"].includes(${JSON.stringify(role)}); }
    ${fn('allowedCoachSections')}
    ${fn('hasScopedCoachAccess')}
    return { allowedCoachSections, hasScopedCoachAccess, canI, isCoach };
  `)();
}

const NAV = [['overview', 'Overview'], ['message', 'Availability'], ['training', 'Training'],
             ['matchday', 'Match Centre'], ['messages', 'Messages'], ['players', 'Members'],
             ['medical', 'Medical'], ['settings', 'Settings']];

test('a plain player sees no coach sections at all — Medical included', () => {
  const g = gates([], 'player');
  assert.deepEqual(g.allowedCoachSections(NAV).map(([id]) => id), []);
  assert.equal(g.hasScopedCoachAccess(), false, 'no coach shell entry point');
});

test('a player + Medical sees Medical, and ONLY Medical', () => {
  const g = gates(['medical_access'], 'player');
  assert.deepEqual(g.allowedCoachSections(NAV).map(([id]) => id), ['medical'],
    'the grant must not become a back door into the coach shell');
  // The ungated sections are the ones that would leak under a naive filter.
  for (const leaked of ['overview', 'settings']) {
    assert.equal(g.allowedCoachSections(NAV).some(([id]) => id === leaked), false,
      `${leaked} is ungated and must stay staff-only`);
  }
  assert.equal(g.hasScopedCoachAccess(), true, 'can reach the shell for that one section');
});

test('staff behaviour is unchanged — ungated sections still render', () => {
  const g = gates(['medical_access', 'manage_teams', 'manage_players', 'publish_squads',
                   'publish_training', 'messaging', 'reports'], 'coach');
  assert.deepEqual(g.allowedCoachSections(NAV).map(([id]) => id),
    NAV.map(([id]) => id), 'a coach still sees the full sidebar');
});

test('the route guard consults the same map as the nav', () => {
  const setSection = fn('setSection');
  assert.match(setSection, /allowedCoachSections\(\[\[section\]\]\)\.length/,
    'a hidden section is also unreachable — both gates read one definition');
  assert.equal(/view === "coach" && !isCoach\(\)\)\s*return/.test(setSection), false,
    'no longer a bare role test');

  // Directly: the guard admits medical for a player+Medical, refuses it otherwise.
  assert.equal(gates(['medical_access'], 'player').allowedCoachSections([['medical']]).length, 1);
  assert.equal(gates([], 'player').allowedCoachSections([['medical']]).length, 0);
  assert.equal(gates(['medical_access'], 'player').allowedCoachSections([['settings']]).length, 0,
    'and still refuses a section they do not hold');
});

test('removing the grant closes nav and route together', () => {
  const revoked = gates([], 'player');
  assert.deepEqual(revoked.allowedCoachSections(NAV).map(([id]) => id), []);
  assert.equal(revoked.allowedCoachSections([['medical']]).length, 0, 'route blocked again');
  assert.equal(revoked.hasScopedCoachAccess(), false, 'view switch hidden again');
});

// ── LINK 7: the shared store replaces the staff-gated roster path ──────────
test('the medical resource is gated on MEDICAL_ACCESS, not a staff permission', () => {
  const publish = fs.readFileSync(new URL('../api/publish.js', import.meta.url), 'utf8');
  const start = publish.indexOf('async function medicalHandler');
  assert.ok(start > 0, 'the medical sub-resource exists');
  const body = publish.slice(start, start + 600);
  assert.match(body, /requireTenantPermission\(req, PERM\.MEDICAL_ACCESS\)/);
  assert.equal(/PERM\.MANAGE_PLAYERS|PERM\.PUBLISH_SQUADS/.test(body), false,
    'staff permissions are never accepted as substitutes');
  assert.match(publish, /resource \|\| ''\) === 'medical'\) return medicalHandler/,
    'routed as a sub-resource — no new serverless function');
  // The two remain mutually exclusive by design.
  assert.equal(permissionsFor(MEDIC).has(PERM.MANAGE_PLAYERS), false);
});

// ── CLIENT WIRING: the page reads and writes the SHARED store ──────────────
test('the Medical page loads its caseload from the shared endpoint', () => {
  const load = fn('loadMedicalFromServer');
  assert.match(load, /canI\('medical_access'\)/, 'gated on the permission');
  assert.match(load, /fetch\('\/api\/publish\?resource=medical'\)/, 'reads the shared store');
  assert.match(load, /hydrateMedicalFromShared\(\)/, 'projects server state into the view model');
  // Loaded on every page boot, so a normal refresh is enough.
  assert.ok(src.split('loadMedicalFromServer().catch').length - 1 >= 4,
    'wired into boot, login and team switch');
});

test('resolved cases leave the active caseload; history is kept', () => {
  const hydrate = fn('hydrateMedicalFromShared');
  assert.match(hydrate, /if \(c\.status !== 'active'\) continue/,
    'only active cases become the visible caseload');
  assert.match(fn('sharedMedicalHistory'), /_sharedMedical\.cases\.filter/,
    'full history stays queryable from the shared record');
});

test('every medical write goes to the shared endpoint, not a private draft', () => {
  const save = fn('saveSharedMedicalCase');
  assert.match(save, /method: 'POST'/);
  assert.match(save, /\/api\/publish\?resource=medical/);
  assert.match(save, /await loadMedicalFromServer\(\)/, 'refetches so both users converge');

  for (const writer of ['saveNewInjury', 'saveMedicalNote', 'clearSharedMedicalCase']) {
    const body = fn(writer);
    assert.match(body, /saveSharedMedicalCase\(/, `${writer} uses the authoritative path`);
    assert.equal(/saveState\(/.test(body), false,
      `${writer} must not persist medical data into the private coach draft`);
  }
  assert.match(fn('clearSharedMedicalCase'), /action: 'resolve_case'/);
});

test('the view model is derived from the server, never merged with the draft', () => {
  const hydrate = fn('hydrateMedicalFromShared');
  // A rebuild from scratch — stale draft entries cannot survive it.
  assert.match(hydrate, /state\.medicalRecords = records/);
  assert.match(hydrate, /state\.medicalNotes = notes/);
  assert.equal(/\.\.\.state\.medicalRecords|Object\.assign\(state\.medicalRecords/.test(hydrate), false,
    'no silent merge of legacy draft data on page load');
});
