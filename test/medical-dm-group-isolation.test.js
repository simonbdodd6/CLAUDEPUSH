/**
 * FINAL U18/WOMEN'S ISOLATION — Medical caseload + private-DM semantics.
 *
 *  MEDICAL — the live dashboard path (renderMedical → _renderMedicalDashboard
 *  → medicalDashboardSummary(medicalPlayers(), records, notes)) read the FULL
 *  club roster via state.players, so Seniors cases (flagged on roster fields
 *  like p.game === 'injured' as well as in medicalRecords) rendered under
 *  U18/Women's. medicalPlayers() now follows the OPERATING group in the
 *  coach view, and the canonical group transition (syncTrainingStateToGroup)
 *  drops the hydrated view-model and refetches under the new group.
 *
 *  DM — private direct conversations are ACCOUNT-WIDE by design: they carry
 *  no groupId and merge server-authoritatively by PARTICIPANT. Switching the
 *  operational group scopes DISCOVERY (who you can start a thread with),
 *  never the existing inbox. An existing DM with Seniors staff staying
 *  visible while operating U18/Women's is INTENDED, not a leak.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';

// Production-shaped cast: four real Seniors cases, zero U18/Women's players.
const SENIORS_CASES = [
  { id: 'p-doorn',    userId: 'u-doorn',    name: 'Mathias Doorn',    game: 'injured',   medical: 'Hamstring' },
  { id: 'p-vrolijk',  userId: 'u-vrolijk',  name: 'Boaz Vrolijk',     game: 'injured',   medical: 'Ankle' },
  { id: 'p-rottier',  userId: 'u-rottier',  name: 'Jeroen Rottier',   game: 'available', medical: 'Shoulder watch' },
  { id: 'p-holemans', userId: 'u-holemans', name: 'Mathys Holemans',  game: 'injured',   medical: 'Knee' },
];

function buildMedicalScope(gid) {
  const body = `"use strict";
    const state = {
      activeView: 'coach',
      operationalGroupId: ${JSON.stringify(gid)},
      players: ${JSON.stringify(SENIORS_CASES)},
    };
    // loaded:true — models arrived admin data; pending now fails closed (group-isolation fix).
    const _adminData = { loaded: true, members: ${JSON.stringify(
      SENIORS_CASES.map(c => ({ userId: c.userId, status: 'active', playerGroupId: SEN }))
    )} };
    let _sharedMedical = { loaded: false, cases: [], players: [] };
    function canI(p) { return true; }   // a coach: roster authority (Build 99 reads it explicitly)
    function canonicalVisiblePlayers() { return state.players; }
    ${fn('clubUsesPlayerGroups')}
    ${fn('playerGroupIdOf')}
    ${fn('operationalPlayers')}
    function normalizeMedicalRecord(raw) { return raw || {}; }
    ${fn('medicalRowCarriesCase')}
    ${fn('medicalCanonicalPlayers')}
    ${fn('medicalPlayers')}
    return medicalPlayers();
  `;
  return new Function(body)();
}

// ── MEDICAL 1: the Seniors caseload stays fully visible in Seniors ────────
test('Medical/Seniors: all four production cases remain visible', () => {
  const rows = buildMedicalScope(SEN);
  assert.deepEqual(rows.map(p => p.name), [
    'Mathias Doorn', 'Boaz Vrolijk', 'Jeroen Rottier', 'Mathys Holemans',
  ]);
});

// ── MEDICAL 2-3: the same cases never surface under U18 or Women's ────────
test('Medical/U18: zero cases — no Seniors player reaches the dashboard', () => {
  assert.deepEqual(buildMedicalScope(U18), []);
});
test("Medical/Women's: zero cases — no Seniors player reaches the dashboard", () => {
  assert.deepEqual(buildMedicalScope(WOM), []);
});

// ── MEDICAL 4: pre-structure and player-view behaviour unchanged ──────────
// CONTRACT CHANGE (Build 99): the player view used to read the device roster on
// the belief that "the server already scoped it" — it never did (a player's
// device roster is not server-refreshed). It now lists the server's scoped
// projection only. The legacy coach half is unchanged.
test('Medical: legacy club keeps the full roster; the player view lists only the server projection', () => {
  const legacy = new Function(`"use strict";
    const state = { activeView: 'coach', operationalGroupId: '', players: ${JSON.stringify(SENIORS_CASES)} };
    // loaded:true — models arrived admin data; pending now fails closed (group-isolation fix).
    const _adminData = { loaded: true, members: [] };
    let _sharedMedical = { loaded: false, cases: [], players: [] };
    function canI(p) { return true; }   // a coach: roster authority
    function canonicalVisiblePlayers() { return state.players; }
    ${fn('clubUsesPlayerGroups')}
    ${fn('playerGroupIdOf')}
    ${fn('operationalPlayers')}
    function normalizeMedicalRecord(raw) { return raw || {}; }
    ${fn('medicalRowCarriesCase')}
    ${fn('medicalCanonicalPlayers')}
    ${fn('medicalPlayers')}
    return medicalPlayers();
  `)();
  assert.equal(legacy.length, 4, 'no group in force → full roster (legacy)');

  const playerView = new Function(`"use strict";
    const state = { activeView: 'player', operationalGroupId: ${JSON.stringify(U18)}, players: ${JSON.stringify(SENIORS_CASES)} };
    // What the server returned for this player-physio: their own group only.
    let _sharedMedical = { loaded: true, cases: [], players: [{ id: 'p-u18', userId: 'u-u18', name: 'U18 Only' }],
                           groups: [{ id: ${JSON.stringify(U18)}, name: 'U18' }] };
    function canI(p) { return p === 'medical_access'; }   // a player holding the Medical grant: no roster authority
    function normalizeMedicalRecord(raw) { return raw || {}; }
    ${fn('medicalHasNoGroupAccess')}
    ${fn('medicalRowCarriesCase')}
    ${fn('medicalCanonicalPlayers')}
    ${fn('medicalPlayers')}
    return medicalPlayers();
  `)();
  assert.deepEqual(playerView.map(p => p.name), ['U18 Only'],
    'player view lists the server projection — the Seniors rows on the device are never shown');
});

// ── MEDICAL 5: the group transition drops AND refetches the caseload ──────
test('syncTrainingStateToGroup clears the hydrated view-model and refetches medical', () => {
  const sync = fn('syncTrainingStateToGroup');
  const reset = sync.indexOf('_sharedMedical = { loaded: false');
  assert.ok(reset > 0, 'store reset still present');
  const rest = sync.slice(reset);
  assert.match(rest, /hydrateMedicalFromShared\(\);/,
    'hydrates from the emptied store so the old group\'s records leave state');
  assert.match(rest, /loadMedicalFromServer\(\)\.catch/,
    'refetches under the NEW group (group guard discards stale replies)');
});

// ── MEDICAL 6: the fetch itself still names the operating group ───────────
test('loadMedicalFromServer keeps the &group= parameter and stale-reply guard', () => {
  const load = fn('loadMedicalFromServer');
  assert.match(load, /group=\$\{encodeURIComponent\(gid\)\}/);
  assert.match(load, /nowGid !== gid/);
});

// ── DM 1: private DMs are ACCOUNT-WIDE — participant-based, group-blind ───
test('an existing DM with Seniors staff stays listed while operating U18/Women\'s (INTENDED)', () => {
  const filter = fn('_filterCanonicalConversations');
  assert.ok(!/operationalGroupId/.test(filter),
    'the DM merge filter has NO group dimension — DMs never follow the group');
  const keep = new Function(`"use strict";
    function chatMe() { return { id: 'u-simon' }; }
    let _allowedDmParticipantIds = new Set();
    ${filter}
    return _filterCanonicalConversations(
      [{ id: 'dm:u-julien:u-simon', type: 'DIRECT' }], true);
  `)();
  assert.equal(keep.length, 1, 'the Julien DM survives the canonical filter');
});

// ── DM 2: the semantics are stated in code, not just implied ──────────────
test('the account-wide DM product rule is documented at the merge filter', () => {
  assert.match(src, /PRODUCT RULE — private DMs are ACCOUNT-WIDE/,
    'rule stated where the filtering happens');
  assert.match(src, /threads always remain visible via the server conversation merge/,
    'directory doc keeps the discovery-vs-inbox distinction');
});
