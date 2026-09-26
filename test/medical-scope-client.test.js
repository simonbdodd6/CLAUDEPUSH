/**
 * BUILD 99 — MEDICAL SCOPE + PERMISSION MODEL (client).
 *
 * The real functions, extracted from index.html and run in small sandboxes:
 *   · Medical lists ONLY what the server scoped for anyone without roster
 *     authority, and nobody at all when the server reports no group access;
 *   · the empty states tell "no group access" apart from "no players yet";
 *   · the Members editor names a group tick by what it does for THIS member
 *     (coaching only for Full/Coach access), shows the default the server
 *     would apply, offers Limited access as a real choice, and states when
 *     Medical comes with the role;
 *   · a medical reply for a club that was left is never adopted, and the
 *     club / identity resets drop the medical caseload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const re = new RegExp(`\\n\\s*(async\\s+)?function\\s+${name}\\s*\\(`);
  const m = re.exec(html);
  assert.ok(m, `${name} exists`);
  const start = m.index + m[0].indexOf(m[1] ? 'async' : 'function');
  let i = html.indexOf('{', html.indexOf(')', start)), depth = 0;
  for (let k = i; k < html.length; k++) {
    if (html[k] === '{') depth++;
    else if (html[k] === '}') { depth--; if (!depth) return html.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const constLine = name => {
  const m = new RegExp(`\\n\\s*const ${name} = [^\\n]*;`).exec(html);
  assert.ok(m, `${name} constant exists`);
  return m[0].trim();
};

const NO_GROUP_TEXT = "No players available — you don't currently have access to a player group";

// ── Medical: which players, and what the empty state says ───────────────────
function medicalWorld({ shared, canRoster = false, view = 'coach', device = [], operational = null } = {}) {
  return new Function('cfg', `"use strict";
    const state = { activeView: cfg.view, players: cfg.device, medicalRecords: {}, medicalNotes: {} };
    let _sharedMedical = cfg.shared;
    function canI(p) { return p === 'manage_players' ? cfg.canRoster : true; }
    function operationalPlayers() { return cfg.operational || state.players; }
    function normalizeMedicalRecord(raw) { return raw || {}; }
    ${fn('medicalHasNoGroupAccess')}
    ${fn('medicalEmptySelectorText')}
    ${fn('medicalRowCarriesCase')}
    ${fn('medicalCanonicalPlayers')}
    ${fn('medicalPlayers')}
    return { players: () => medicalPlayers().map(p => p.id), none: medicalHasNoGroupAccess, empty: medicalEmptySelectorText };
  `)({ shared, canRoster, view, device, operational });
}
const SENIORS_ON_DEVICE = [{ id: 'p-sen', userId: 'u-sen', name: 'Seniors Player' }];
const U18_FROM_SERVER = [{ id: 'p-u18', name: 'U18 Player' }];

test('the server reporting NO group access empties the list, whatever the device holds', () => {
  for (const canRoster of [false, true]) {
    const w = medicalWorld({ canRoster, device: SENIORS_ON_DEVICE,
      shared: { loaded: true, cases: [], players: [], groups: [] } });
    assert.deepEqual(w.players(), [], `roster authority ${canRoster}: nobody listed`);
    assert.equal(w.none(), true);
    assert.equal(w.empty(), NO_GROUP_TEXT, 'the selector says why');
  }
});

test('without roster authority the list is the server\'s scoped projection — never the device roster', () => {
  for (const view of ['coach', 'player']) {
    const w = medicalWorld({ view, device: SENIORS_ON_DEVICE,
      shared: { loaded: true, cases: [], players: U18_FROM_SERVER, groups: [{ id: 'g-u18' }] } });
    assert.deepEqual(w.players(), ['p-u18'], `${view} view: the server's U18 list only`);
    assert.equal(w.none(), false);
  }
});

test('staff WITH roster authority keep the group-filtered roster (unchanged)', () => {
  const w = medicalWorld({ canRoster: true, device: SENIORS_ON_DEVICE, operational: [{ id: 'p-op', name: 'Op' }],
    shared: { loaded: true, cases: [], players: U18_FROM_SERVER, groups: [{ id: 'g' }] } });
  assert.deepEqual(w.players(), ['p-op']);
});

test('an unknown answer is not "no access": loading, failure and older replies say nothing about groups', () => {
  for (const shared of [{ loaded: false, cases: [], players: [] }, { loaded: false, failed: true, cases: [], players: [] },
                        { loaded: true, cases: [], players: [] }]) {
    const w = medicalWorld({ shared });
    assert.equal(w.none(), false, JSON.stringify(shared));
    assert.equal(w.empty(), 'No players yet — add players first');
  }
  const groupsButEmpty = medicalWorld({ shared: { loaded: true, cases: [], players: [], groups: [{ id: 'g' }] } });
  assert.equal(groupsButEmpty.empty(), 'No players yet — add players first', 'a reachable group with no players is an empty squad');
});

test('the dashboard tells no access, no players and no cases apart', () => {
  const dash = fn('_renderMedicalDashboard');
  assert.match(dash, /const noGroupAccess = typeof medicalHasNoGroupAccess === 'function' && medicalHasNoGroupAccess\(\);/);
  assert.match(dash, /medicalEmptySelectorText\(\)/, 'the selector asks which empty state applies');
  assert.match(dash, /You don't currently have access to a player group, so there is no one to record an injury for/);
  assert.match(dash, /No player group — you don't currently have access to one, so no cases can be shown/);
  assert.match(dash, /No open medical cases\. Players appear here once an injury is recorded\./, 'the no-cases copy remains');
  // Loading and failure are still said before any of this renders.
  assert.match(fn('renderMedical'), /medicalScreenMode\(\)/);
});

// ── Medical: the loader keeps the group list and never adopts a departed club's reply ──
async function runLoader({ clubAtStart, clubAfterFetch, reply }) {
  const w = new Function('cfg', `"use strict";
    const state = { activeView: 'coach', operationalGroupId: 'g1', medicalRecords: {}, medicalNotes: {} };
    let _clubContextId = cfg.clubAtStart;
    let _sharedMedical = { loaded: false, failed: false, cases: [], players: [] };
    let renders = 0;
    function canI() { return true; }
    function render() { renders++; }
    function hydrateMedicalFromShared() {}
    async function fetch() { _clubContextId = cfg.clubAfterFetch; return { ok: true, json: async () => cfg.reply }; }
    ${fn('loadMedicalFromServer')}
    return { run: () => loadMedicalFromServer(), get shared() { return _sharedMedical; }, get renders() { return renders; } };
  `)({ clubAtStart, clubAfterFetch, reply });
  await w.run();
  return w;
}
const REPLY = { cases: [{ id: 'c1' }], players: [{ id: 'p1' }], groups: [{ id: 'g1', name: 'U18' }] };

test('a medical reply for a club that was left is discarded', async () => {
  const w = await runLoader({ clubAtStart: 'club-a', clubAfterFetch: 'club-b', reply: REPLY });
  assert.equal(w.shared.loaded, false, 'club A\'s caseload never lands under club B');
  const mid = await runLoader({ clubAtStart: 'club-a', clubAfterFetch: '', reply: REPLY });
  assert.equal(mid.shared.loaded, false, 'nor during the switch, before club B is proven');
});

test('a boot read (no club proven yet) and a same-club read are adopted, with the group list', async () => {
  const boot = await runLoader({ clubAtStart: '', clubAfterFetch: 'club-a', reply: REPLY });
  assert.equal(boot.shared.loaded, true, 'the cookie\'s club answered — kept');
  const same = await runLoader({ clubAtStart: 'club-a', clubAfterFetch: 'club-a', reply: REPLY });
  assert.deepEqual(same.shared.groups, REPLY.groups, 'the server\'s group list is kept for the empty states');
  const none = await runLoader({ clubAtStart: 'club-a', clubAfterFetch: 'club-a', reply: { cases: [], players: [], groups: [] } });
  assert.deepEqual(none.shared.groups, [], 'an empty group list is recorded as such');
});

// ── Resets: medical never outlives the club or the identity it belongs to ────
test('club and identity transitions drop the medical caseload', () => {
  const team = fn('resetTeamScopedState');
  const med = team.indexOf('state.medicalRecords = {};');
  assert.ok(med > 0 && team.indexOf('state.medicalNotes = {};') > 0, 'the persisted caseload view is club data');
  assert.ok(med < team.indexOf("saveState('Team switched')"), 'cleared BEFORE the save, so device storage drops it too');
  const club = fn('resetClubScopedState');
  assert.match(club, /_sharedMedical = \{ loaded: false, failed: false, cases: \[\], players: \[\] \}/, 'the cache is unloaded');
  assert.match(club, /_medActivePlayerId = null/);
  const ident = fn('resetIdentityScopedState');
  assert.match(ident, /state\.medicalRecords = \{\};\s*\n\s*state\.medicalNotes = \{\};/, 'the next person inherits no caseload');
  assert.match(ident, /_sharedMedical = \{ loaded: false/);
  assert.match(fn('settingsSignOut'), /resetIdentityScopedState\(\);/, 'sign-out runs the identity reset');
});

// ── Members: labels, defaults, Limited access ───────────────────────────────
const MEMBER_HELPERS = `
  ${constLine('ACCESS_PROFILE_LABELS')}
  ${constLine('DEFAULT_PROFILE_BY_LEVEL')}
  ${constLine('ROLE_DEFAULT_ACCESS_PROFILE')}
  ${fn('isStaffMember')}
  ${fn('accessProfileFor')}
  ${fn('memberAccessCoaches')}
  ${fn('memberGroupAccessSummary')}
  ${fn('memberMedicalFromRole')}
  ${fn('memberLimitedAvailable')}
`;
const helpers = new Function(`"use strict"; ${MEMBER_HELPERS}
  return { memberAccessCoaches, memberGroupAccessSummary, memberMedicalFromRole, memberLimitedAvailable };`)();

test('a group tick coaches only for Full or Coach access', () => {
  const { memberAccessCoaches: coaches } = helpers;
  assert.equal(coaches({ role: 'medical' }), false, 'a physio on Limited access');
  assert.equal(coaches({ role: 'medical', accessProfile: 'manager' }), false, 'Manager access is not coaching');
  assert.equal(coaches({ role: 'coach', staffLevel: 'manager' }), false);
  assert.equal(coaches({ role: 'snc' }), false);
  assert.equal(coaches({ role: 'coach', staffLevel: 'assistant' }), true);
  assert.equal(coaches({ role: 'coach', staffLevel: 'head' }), true);
  assert.equal(coaches({ role: 'medical', accessProfile: 'coach' }), true, 'an explicit Coach access coaches');
  assert.equal(coaches({ role: 'medical', isOwner: true }), true);
});

test('what a non-coaching group tick gives is spelled out', () => {
  const { memberGroupAccessSummary: summary } = helpers;
  assert.equal(summary({ role: 'medical' }), 'Medical records, messages and reports for this group. No coaching.');
  assert.equal(summary({ role: 'medical', accessProfile: 'manager' }), 'Their Manager access applies in this group. No coaching.');
  assert.match(summary({ role: 'snc', medicalAccess: true }), /Training plans, messages and reports, plus Medical, for this group\. No coaching\./);
});

test('Medical that comes with the role or level is shown as included; otherwise the flag decides', () => {
  const { memberMedicalFromRole: from } = helpers;
  assert.equal(from({ role: 'medical' }), 'the Medical role');
  assert.equal(from({ role: 'medical', accessProfile: 'manager' }), '', 'explicit Manager: Medical only via the flag');
  assert.equal(from({ role: 'coach', staffLevel: 'head' }), 'Full access');
  assert.equal(from({ role: 'coach', staffLevel: 'assistant' }), 'their role', 'a legacy assistant keeps the role grant');
  assert.equal(from({ role: 'coach', staffLevel: 'assistant', accessProfile: 'coach' }), '', 'explicit Coach access: the flag decides');
  assert.equal(from({ role: 'coach', staffLevel: 'manager' }), '', 'the manager role never carried Medical');
  assert.equal(from({ role: 'snc' }), '');
  assert.equal(from({ role: 'player', medicalAccess: true }), '', 'a player: the flag is the only source');
});

test('Limited access is offered only where the role has no level of its own', () => {
  const { memberLimitedAvailable: limited } = helpers;
  for (const m of [{ role: 'medical' }, { role: 'medical', accessProfile: 'manager' }, { role: 'snc' }, { role: 'analyst' }]) {
    assert.equal(limited(m), true, JSON.stringify(m));
  }
  for (const m of [{ role: 'coach', staffLevel: 'assistant' }, { role: 'coach', staffLevel: 'manager' }, { role: 'admin' },
                   { role: 'player' }, { role: 'medical', isOwner: true }]) {
    assert.equal(limited(m), false, JSON.stringify(m));
  }
});

const STRUCTURE = { groups: [
    { id: 'grp_initial', name: 'Seniors', status: 'active' },
    { id: 'grp-u18', name: 'U18', status: 'active' }],
  teams: [{ id: 't-u18p', groupId: 'grp-u18', name: 'U18 Premier', status: 'active' }] };

test('memberScope shows the default the server would apply — Seniors for coaching staff, nothing for a medic', () => {
  const memberScope = new Function('cfg', `"use strict";
    const _adminData = { structure: cfg.structure };
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    ${fn('memberScope')}
    return memberScope;`)({ structure: STRUCTURE });
  const medic = memberScope({ role: 'medical' });
  assert.equal(medic.derived, true);
  assert.deepEqual(medic.groups, [], 'a medic derives no group');
  assert.deepEqual(memberScope({ role: 'coach', staffLevel: 'assistant' }).groups.map(g => g.groupId), ['grp_initial'],
    'coaching staff: the initial group the server grants, made visible');
  assert.deepEqual(memberScope({ role: 'player' }).groups, [], 'players hold no staff reach');
  const storedEmpty = memberScope({ role: 'coach', accessScope: [] });
  assert.equal(storedEmpty.derived, undefined, 'a stored scope — even empty or malformed — is not the default');
  assert.deepEqual(storedEmpty.groups, []);
  assert.deepEqual(memberScope({ role: 'medical', accessScope: { groups: [{ groupId: 'grp-u18', status: 'removed' }] } }).groups, [],
    'a removed grant is no access');
});

function renderScope(member) {
  return new Function('cfg', `"use strict";
    const _adminData = { structure: cfg.structure, structureAccess: { clubWideStaffIds: [] } };
    const state = { currentUserId: 'u-admin' };
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    function canI() { return true; }
    function esc(s) { return String(s ?? ''); }
    function playerGroupBlock() { return ''; }
    ${MEMBER_HELPERS}
    ${fn('memberScope')}
    ${fn('renderScopeSection')}
    return renderScopeSection(cfg.member, { displayName: 'Corentin' });
  `)({ structure: STRUCTURE, member }).replace(/\s+/g, ' ');
}

test('a physio\'s group tick reads "Access to U18" — never "Can coach U18"', () => {
  const out = renderScope({ id: 'm1', role: 'medical', medicalAccess: true, accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'active' }], teams: [] } });
  assert.match(out, /Access to U18/);
  assert.match(out, /Medical records, messages and reports for this group\. No coaching\./);
  assert.doesNotMatch(out, /Can coach/);
  assert.match(out, /Access to every group/);
  assert.doesNotMatch(out, /Can manage entire club/);
  assert.match(out, /Included with the Medical role/, 'Medical is not a dead checkbox for the Medical role');
});

test('Manager access on a medical member: access, not coaching; the Medical flag stays switchable', () => {
  const out = renderScope({ id: 'm1', role: 'medical', accessProfile: 'manager', medicalAccess: true,
    accessScope: { clubWide: false, groups: [{ groupId: 'grp-u18', status: 'removed' }], teams: [] } });
  assert.match(out, /Access to U18/);
  assert.match(out, /Their Manager access applies in this group\. No coaching\./);
  assert.match(out, /Open and update the Medical page\. Adds nothing else\./, 'the flag decides, so it is a real checkbox');
  assert.match(out, /No group access — Corentin sees no players, in Medical or anywhere else, until you choose a group above\./);
  assert.match(out, /Team only — match day\. Medical needs the whole group\./, 'team boxes say they do not open Medical');
});

test('a legacy medic is flagged as having no group access; a legacy coach sees the Seniors default', () => {
  const medic = renderScope({ id: 'm2', role: 'medical' });
  assert.match(medic, /Currently using the default access for their role\. Choosing above sets it explicitly\./);
  assert.match(medic, /No group access — Corentin sees no players, in Medical or anywhere else, until you choose a group above\./);
  const coach = renderScope({ id: 'm3', role: 'coach', staffLevel: 'assistant' });
  assert.match(coach, /Can coach Seniors/, 'coaching workflows keep their wording');
  assert.match(coach, /<input type="checkbox" checked\s*>?[^<]*<span> <span class="ce-arow-main">Can coach Seniors/, 'the default is ticked');
  assert.match(coach, /Currently using the default access for their role: Seniors\. Choosing above sets it explicitly\./);
  assert.doesNotMatch(coach, /No group access/);
});

function renderAccess(member) {
  return new Function('cfg', `"use strict";
    const _adminData = { members: [], users: [] };
    const state = { currentUserId: 'u-admin' };
    function canI() { return true; }
    function esc(s) { return String(s ?? ''); }
    function renderScopeSection() { return ''; }
    function renderEligibilitySection() { return ''; }
    ${constLine('PLAYER_ACCESS_LABEL')}
    ${constLine('ROLE_ACCESS_LABEL')}
    const ACCESS_PROFILE_SUMMARY = {}; const PLAYER_ACCESS_SUMMARY = ''; const ROLE_ACCESS_SUMMARY = '';
    ${MEMBER_HELPERS}
    ${fn('renderAccessSection')}
    return renderAccessSection(cfg.member, { displayName: 'Corentin' });
  `)({ member }).replace(/\s+/g, ' ');
}

test('the access level selector offers Limited access for a physio, and selects it when no level is set', () => {
  const limited = renderAccess({ id: 'm1', role: 'medical' });
  assert.match(limited, /<option value="limited" selected>Limited access<\/option>/);
  assert.doesNotMatch(limited, /value="full" selected/, 'never defaults to Full access');
  const manager = renderAccess({ id: 'm1', role: 'medical', accessProfile: 'manager' });
  assert.match(manager, /<option value="limited" >Limited access<\/option>/, 'a way back from Manager access');
  assert.match(manager, /<option value="manager" selected>Manager access<\/option>/);
  const coach = renderAccess({ id: 'm2', role: 'coach', staffLevel: 'assistant' });
  assert.doesNotMatch(coach, /Limited access/, 'coaching roles keep their own level');
});

test('choosing Limited access confirms, then asks the server to clear the level', async () => {
  const run = ok => new Function('cfg', `"use strict";
    const calls = [];
    ${constLine('ACCESS_PROFILE_LABELS')}
    async function ceConfirm() { return cfg.ok; }
    async function adminAction(body, msg) { calls.push({ body, msg }); return { ok: true }; }
    function render() {}
    ${fn('adminSetAccessProfile')}
    return adminSetAccessProfile('m-cor', 'limited', 'Corentin', 'manager').then(() => calls);
  `)({ ok });
  const sent = await run(true);
  assert.deepEqual(sent.map(c => c.body), [{ action: 'set_access_profile', memberId: 'm-cor', accessProfile: 'limited' }]);
  assert.match(sent[0].msg, /Corentin now has Limited access/);
  assert.deepEqual(await run(false), [], 'cancelled: nothing sent');
});

test('non-coaching grants are announced as access, not coaching', () => {
  for (const name of ['adminToggleGroupAccess', 'adminToggleTeamAccess']) {
    assert.match(fn(name), /memberAccessCoaches\(member\)\) \? `Can now coach \$\{\w+\}` : `Access to \$\{\w+\} granted`/, name);
  }
  assert.match(fn('adminToggleClubWide'), /Their access level will apply in every group and team\. No other permission is added, and coaching stays separate\./);
});
