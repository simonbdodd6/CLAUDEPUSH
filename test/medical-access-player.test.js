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
    ${src.match(/const playerSections = \[[\s\S]*?\n    \];/)[0]}
    function canI(p) { return _perms.includes(p); }
    function isCoach() { return ["coach","admin","medical"].includes(${JSON.stringify(role)}); }
    ${fn('allowedCoachSections')}
    ${fn('playerSectionsFor')}
    return { allowedCoachSections, playerSectionsFor, canI, isCoach };
  `)();
}

const NAV = [['overview', 'Overview'], ['message', 'Availability'], ['training', 'Training'],
             ['matchday', 'Match Centre'], ['messages', 'Messages'], ['players', 'Members'],
             ['medical', 'Medical'], ['settings', 'Settings']];

test('a plain player sees no coach sections at all — Medical included', () => {
  const g = gates([], 'player');
  assert.deepEqual(g.allowedCoachSections(NAV).map(([id]) => id), []);
  assert.deepEqual(g.playerSectionsFor().map(([id]) => id),
    ['home','messages','availability','week'], 'the normal player portal, unchanged');
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
  assert.deepEqual(g.playerSectionsFor().map(([id]) => id),
    ['home','messages','availability','week','medical'],
    'Medical joins the PLAYER nav — no coach shell involved');
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
  assert.equal(revoked.playerSectionsFor().some(([id]) => id === 'medical'), false,
    'Medical leaves the player nav again');
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

// ── THE PRODUCTION REPRODUCTION ───────────────────────────────────────────
// The earlier fix put Medical in #coachNav. A real player logs in with
// activeView 'player', renders #playerNav, and showSection() forces any
// non-isCoach() identity back to the player view on every render — so the
// coach shell was structurally unreachable and Medical was invisible.
// This drives the REAL renderNav() and asserts on #playerNav itself.

function renderPlayerNav(perms) {
  const store = {};
  const makeEl = () => ({ innerHTML: '', classList: { toggle() {}, add() {}, remove() {} },
    style: {}, setAttribute() {}, disabled: false, title: '', textContent: '' });
  const mockDoc = {
    getElementById(id) { if (!store[id]) store[id] = makeEl(); return store[id]; },
    querySelector() { return null; }, querySelectorAll() { return []; }, title: '',
  };
  const state = {
    users: [{ id: 'p1', role: 'player', name: 'Test Medical' }], currentUserId: 'p1',
    players: [], schedule: [], activeView: 'player', activeCoachSection: 'overview',
    activePlayerSection: 'home', clubName: 'Boitsfort',
  };
  const body = `"use strict";
    const document = mockDoc;
    const state = ${JSON.stringify(state)};
    const _perms = ${JSON.stringify(perms)};
    let _myMemberships = []; let _chatNavUnread = 0; let authTab = 'closed';
    const window = { _devLoginEnabled: false };
    function currentUser() { return state.users.find(u => u.id === state.currentUserId); }
    function isCoach() { const r = currentUser()?.role; return r === "coach" || r === "admin" || r === "medical"; }
    function canI(p) { return _perms.includes(p); }
    function icon() { return ''; } function esc(s) { return String(s||''); }
    function sessionKey(id) { return 's_' + id; }
    function canonicalSwitchAccounts() { return []; }
    function renderPushSidebar() {} function updateNavBadge() {}
    ${src.match(/const coachSections = \[[\s\S]*?\n    \];/)[0]}
    ${src.match(/const BETA_NAV_IDS = \[[^\]]*\];/)[0]}
    ${src.match(/const playerSections = \[[\s\S]*?\n    \];/)[0]}
    ${src.match(/const SECTION_PERM_MAP = \{[^}]*\};/)[0]}
    const BETA_SIMPLE_NAV = true; const SECTION_ICONS = {};
    ${fn('allowedCoachSections')}
    ${fn('playerSectionsFor')}
    ${fn('renderNav')}
    renderNav();
    return { playerNav: document.getElementById('playerNav').innerHTML,
             coachNav: document.getElementById('coachNav').innerHTML,
             isCoach: isCoach() };
  `;
  return new Function('mockDoc', body)(mockDoc);
}

test('PRODUCTION REPRO — a plain player sees the 4 portal items, no Medical', () => {
  const { playerNav, isCoach } = renderPlayerNav([]);
  assert.equal(isCoach, false, 'canonical role stays Player');
  for (const id of ['home', 'messages', 'availability', 'week']) {
    assert.ok(playerNav.includes(`setSection('player','${id}')`), `portal keeps ${id}`);
  }
  assert.equal(playerNav.includes(`setSection('player','medical')`), false, 'no Medical');
});

test('PRODUCTION REPRO — player + Medical gets Medical in the PLAYER nav', () => {
  const { playerNav, isCoach } = renderPlayerNav(['medical_access']);
  assert.equal(isCoach, false, 'still a Player — not promoted to staff');
  assert.ok(playerNav.includes(`setSection('player','medical')`),
    'Medical appears in the player portal itself');
  assert.ok(playerNav.includes('Medical'), 'and is labelled');
  // The four normal items survive.
  for (const id of ['home', 'messages', 'availability', 'week']) {
    assert.ok(playerNav.includes(`setSection('player','${id}')`), `portal keeps ${id}`);
  }
});

test('PRODUCTION REPRO — no coach/admin surface leaks into the player portal', () => {
  const { playerNav } = renderPlayerNav(['medical_access']);
  for (const id of ['overview', 'players', 'matchday', 'settings', 'admin', 'club', 'training', 'message']) {
    assert.equal(playerNav.includes(`setSection('coach','${id}')`), false,
      `${id} must never appear in the player portal`);
  }
  assert.equal(/Members|Match Centre|Settings|Overview/.test(playerNav), false,
    'no coach section labels');
});

test('PRODUCTION REPRO — revoking Medical removes it from the player nav', () => {
  assert.equal(renderPlayerNav([]).playerNav.includes(`setSection('player','medical')`), false);
});

test('the player Medical route and panel exist and are permission-gated', () => {
  assert.match(src, /<section id="player-medical"\s+class="section"><\/section>/,
    'the player-side panel exists, so showSection() can activate it');
  assert.match(src, /safeRender\('player-medical',\s*\(\) => \{ if \(state\.activeView === 'player' && canI\('medical_access'\)\) renderMedical\(\); \}\)/,
    'rendered inside the player view, gated on the permission and on the active shell');
  const setSection = fn('setSection');
  assert.match(setSection, /view === "player" && !playerSectionsFor\(\)\.some/,
    'direct player-route navigation is gated too');
  assert.match(fn('showSection'), /state\.activePlayerSection = "home"/,
    'a revoked grant falls back to Home rather than rendering a closed section');
});

// ── BLANK PAGE: one renderer, mounted on the ACTIVE shell ─────────────────
// The route opened and the heading shell rendered, but every Medical renderer
// wrote into #coach-medical — hidden for a player — leaving #player-medical
// empty. Medical is one feature with two authorised shells, not two forks.
test('the Medical renderers mount on the active shell, not a hard-wired one', () => {
  const mount = fn('medicalMountEl');
  assert.match(mount, /state\.activeView === 'player' \? 'player-medical' : 'coach-medical'/,
    'mount follows the active view');
  assert.equal(/document\.getElementById\('coach-medical'\)/.test(src), false,
    'no renderer is hard-wired to the coach container any more');
  assert.equal(/document\.getElementById\("coach-medical"\)\.innerHTML/.test(src), false);
  // Every Medical renderer resolves its container through the shared helper.
  for (const r of ['_renderMedicalDashboard', '_renderMedicalRecord', '_renderMedicalTimeline']) {
    assert.match(fn(r), /medicalMountEl\(\)/, `${r} mounts on the active shell`);
  }
});

test('Medical is not forked — the same renderer serves both shells', () => {
  const count = (src.match(/function renderMedical\(/g) || []).length;
  assert.equal(count, 1, 'exactly one Medical renderer exists');
  assert.match(src, /safeRender\('player-medical',\s*\(\) => \{ if \(state\.activeView === 'player' && canI\('medical_access'\)\) renderMedical\(\); \}\)/,
    'player shell calls the shared renderer');
  assert.match(src, /safeRender\('coach-medical',\s*\(\) => \{ if \(state\.activeView === 'coach'\) renderMedical\(\); \}\)/,
    'coach shell calls the same one; only the active view renders');
});

test('a player with Medical sees the caseload via the scoped projection', () => {
  const players = fn('medicalPlayers');
  assert.match(players, /state\.players.*length.*return state\.players/s, 'staff keep the full roster');
  assert.match(players, /_sharedMedical\.players/, 'a player falls back to the medical-scoped projection');
  // The roster is coach-only, which is exactly why the fallback is needed.
  assert.match(fn('loadRosterFromServer'), /if \(!isCoach\(\)\) return;/);
  // The projection carries no contact data — asserted server-side too.
  const store = fs.readFileSync(new URL('../api/_medicalStore.js', import.meta.url), 'utf8');
  assert.match(store, /PROJECTED_PLAYER_FIELDS = \['id', 'name', 'position', 'playerGroupId', 'groupName'\]/);
});

// ── ADD INJURY: open state must survive a re-render ───────────────────────
// The panel's open state lived only as a CSS class on markup that
// renderMedical() rebuilds, so any later render() destroyed it and the button
// appeared to do nothing.
test('the Add Injury panel state lives in app state, not in the DOM', () => {
  assert.match(src, /let _medAddInjuryOpen = false;/, 'open state is held in app state');
  const toggle = fn('toggleAddInjury');
  assert.match(toggle, /_medAddInjuryOpen = \(open === undefined\)/, 'toggles the flag');
  assert.match(toggle, /renderMedical\(\)/, 'renders FROM the flag rather than poking the DOM');
  assert.equal(/classList\.toggle\("beta-hidden"\)/.test(toggle), false,
    'no longer a bare class toggle that a re-render can undo');
  // The markup is emitted from the flag, so a rebuild preserves it.
  assert.match(src, /addInjuryForm" class="' \+ \(_medAddInjuryOpen \? '' : 'beta-hidden'\)/);
  assert.match(fn('saveNewInjury'), /_medAddInjuryOpen = false;/, 'saving closes it, and the close sticks');
});

// ── EVERY medical write reaches the SHARED store ──────────────────────────
test('the record editor, training status and rehab all write to the shared store', () => {
  for (const w of ['saveMedRecord', 'setPlayerTrainingStatus', 'setRehabProgress',
                   'saveMedicalNote', 'saveNewInjury', 'clearSharedMedicalCase']) {
    assert.match(fn(w), /saveSharedMedicalCase\(/, `${w} writes to the shared store`);
  }
  // ...and none of them persists medical data into the private coach draft.
  for (const w of ['saveMedRecord', 'setRehabProgress', 'saveMedicalNote', 'saveNewInjury']) {
    assert.equal(/saveState\(/.test(fn(w)), false, `${w} must not write the private draft`);
  }
  assert.match(fn('saveMedRecord'), /MED_FIELD_MAP\[field\]/, 'legacy field names map onto the shared model');
});

test('clearing a case is reachable from the UI', () => {
  assert.match(src, /onclick="clearSharedMedicalCase\(/, 'a Clear case control is rendered');
  assert.match(fn('clearSharedMedicalCase'), /action: 'resolve_case'/);
});

// ── Contact data stays out of the Medical-scoped shell ────────────────────
test('the Emergency contact card is roster-only and cannot throw', () => {
  // It used to render blank for a Medical-scoped user and its inline onchange
  // dereferenced an absent roster row, throwing an uncaught TypeError.
  assert.equal(/state\.players\.find\(pl=>pl\.id===\\'/.test(src), false,
    'no inline handler dereferences the roster directly');
  assert.match(src, /medicalRosterRow\(playerId\)\s*\?\s*'<div class="card">' \+\s*'<div style="[^"]*">Emergency contact<\/div>'/,
    'the card renders only when a real roster row exists');
  const saver = fn('medicalSaveRosterField');
  assert.match(saver, /if \(!row\) return showToast/, 'no roster row → honest refusal, not a crash');
});
