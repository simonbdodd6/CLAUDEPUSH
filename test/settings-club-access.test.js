/**
 * SETTINGS — the Club settings card follows the server's gate.
 *
 * Club settings (logo, colours, default match day, season dates) write the
 * club config, which the server accepts only from MANAGE_TEAMS
 * (api/publish.js clubHandler). Every coach-shell user used to be shown the
 * controls: medical staff changed the logo, saw it applied on their own
 * device, and were then refused by the server. The card now renders only for
 * MANAGE_TEAMS — read here from the SERVER'S OWN permission matrix
 * (permissionsFor), so the page and the API cannot drift apart unnoticed.
 *
 * Everything else on the screen is unchanged for those staff. The removed
 * Email notifications toggle and the corrected wording are pinned too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { permissionsFor } from '../api/_permissions.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const s = html.search(new RegExp(`\\n    (async\\s+)?function ${name}\\s*\\(`)) + 1;
  assert.ok(s > 0, `${name} exists`);
  let i = html.indexOf('(', s), p = 0;
  for (; i < html.length; i++) { if (html[i] === '(') p++; else if (html[i] === ')') { p--; if (!p) { i++; break; } } }
  let b = html.indexOf('{', i), d = 0, e = b;
  for (let k = b; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (!d) { e = k; break; } } }
  return html.slice(s, e + 1);
}

/** Render the real Settings screen as a member with this server-side role. */
function renderAs(member, { uiRole, diagnostics = false, permsLoaded = true, features = {} } = {}) {
  const perms = permsLoaded ? [...permissionsFor({ status: 'active', ...member })] : null;
  const el = { innerHTML: '' };
  new Function('PERMS', 'UI_ROLE', 'EL', 'DIAG', 'FEATURES', `
    const document = { getElementById: id => id === 'coach-settings' ? EL : null };
    const BETA_SIMPLE_UI = true;
    const state = { activeView: 'coach', activeCoachSection: 'other', clubName: 'Alpha RFC', features: FEATURES };
    let _settingsVersion = 'x', _settingsPrefs = {};
    let _myPermissions = PERMS, _myMembership = null;
    const _BUILD_INFO = { sha: 'abc', env: 'production', branch: 'b', time: 'n/a' };
    const _serverAuthState = 'authed';
    const CE_DEFAULT_COLOURS = { primary: '#8F6B2A', secondary: '#8E959D' };
    const DAY_LABELS = { Sat: 'Saturday', Sun: 'Sunday' };
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const currentUser = () => ({ id: 'u1', name: 'Sam Staff', email: 's@x.test', role: UI_ROLE });
    const sessionSignedOut = () => false;
    const membershipPlays = () => false;
    const trialDaysRemaining = () => 0;
    const lastSyncLabel = () => 'Just now';
    const canUseFeature = () => true;
    const renderUnavailableNotice = () => '';
    const loadSettingsData = () => {};
    const _diagnosticsOn = () => DIAG;
    ${fn('isCoach')}
    ${fn('canI')}
    ${fn('renderSettings')}
    renderSettings();
  `)(perms, uiRole || member.role, el, diagnostics, features);
  return el.innerHTML;
}

const CLUB_CONTROLS = ['id="set-colour1"', 'id="set-colour2"', 'id="set-matchday"', 'id="set-season-start"',
  'id="set-season-end"', 'settingsUploadLogo(this)', "setSection('coach','admin')", '>Club settings</h2>'];
const has = (out, s) => out.includes(s);

// ── 1. who sees the Club settings card ──────────────────────────────────────

test('medical staff (no MANAGE_TEAMS on the server) get no Club settings card and no club control at all', () => {
  const member = { role: 'medical' };
  assert.equal(permissionsFor({ status: 'active', ...member }).has('manage_teams'), false, 'the server refuses them');
  const out = renderAs(member);
  assert.ok(out.length > 0, 'Settings still renders for them');
  for (const c of CLUB_CONTROLS) assert.equal(has(out, c), false, `no ${c}`);
});

test('medical staff keep every other section: account, appearance, notifications, support, sign out, delete account', () => {
  const out = renderAs({ role: 'medical' });
  for (const s of ['>Your account</h2>', 'id="set-displayname"', 'settingsChangePassword()', 'settingsChangeEmail()',
    'settingsLogoutAll()', '>Notifications</h2>', "toggle", 'CoachEasier Support', 'settingsSignOut()', 'settingsDeleteAccountOpen()'])
    if (s !== 'toggle') assert.ok(has(out, s), `medical still sees ${s}`);
  assert.ok(has(out, "settingsTogglePref('pushEnabled')"), 'notification toggles');
});

test('S&C staff: the server refuses them club config, and the page shows them no club control (no coach Settings at all, as before)', () => {
  const member = { role: 'snc' };
  assert.equal(permissionsFor({ status: 'active', ...member }).has('manage_teams'), false);
  const out = renderAs(member);
  for (const c of CLUB_CONTROLS) assert.equal(has(out, c), false, `no ${c}`);
  assert.equal(out, '', 'unchanged: the coach Settings screen is not rendered for the snc role');
});

test('every role the server lets save club config sees the full card — admin, head coach, group-scoped head coach, manager', () => {
  const roles = {
    admin: { role: 'admin' },
    head: { role: 'coach', staffLevel: 'head' },
    groupScopedHead: { role: 'coach', staffLevel: 'head', accessScope: { clubWide: false, groups: [{ groupId: 'grp_u18', status: 'active' }], teams: [] } },
    manager: { role: 'coach', staffLevel: 'manager' },
  };
  for (const [label, member] of Object.entries(roles)) {
    assert.equal(permissionsFor({ status: 'active', ...member }).has('manage_teams'), true, `${label}: the server accepts them`);
    const out = renderAs(member, { uiRole: member.role });
    for (const c of CLUB_CONTROLS) assert.ok(has(out, c), `${label} sees ${c}`);
  }
});

test('an assistant on the default Coach Access profile is refused club config by the server, so sees no card', () => {
  const member = { role: 'coach', staffLevel: 'assistant' };
  assert.equal(permissionsFor({ status: 'active', ...member }).has('manage_teams'), false);
  const out = renderAs(member, { uiRole: 'coach' });
  for (const c of CLUB_CONTROLS) assert.equal(has(out, c), false, `no ${c}`);
  assert.ok(has(out, '>Your account</h2>') && has(out, 'settingsSignOut()'), 'the rest of Settings is unchanged');
});

test('a coach whose access profile drops MANAGE_TEAMS loses the card with it — the page reads the server\'s answer, not the role name', () => {
  const out = renderAs({ role: 'coach', staffLevel: 'head', accessProfile: 'coach' });
  const serverSays = permissionsFor({ status: 'active', role: 'coach', staffLevel: 'head', accessProfile: 'coach' }).has('manage_teams');
  assert.equal(has(out, 'id="set-colour1"'), serverSays, `card shown ⇔ server grants manage_teams (${serverSays})`);
});

// ── 2. the Email notifications toggle is gone; the others stay ──────────────

test('the Email notifications toggle is removed; Push, Match and Training reminders remain', () => {
  const out = renderAs({ role: 'coach', staffLevel: 'head' });
  assert.equal(has(out, "settingsTogglePref('emailEnabled')"), false, 'no email toggle');
  assert.equal(/Email notifications/.test(out), false, 'no email toggle label');
  assert.equal(/reminder emails/.test(out), false, 'no description of reminder emails that do not exist');
  for (const k of ['pushEnabled', 'matchReminders', 'trainingReminders'])
    assert.ok(has(out, `settingsTogglePref('${k}')`), `${k} still offered`);
  // The account emails are untouched: change email is still offered.
  assert.ok(has(out, 'settingsChangeEmail()'));
});

// ── 3. wording ──────────────────────────────────────────────────────────────

test('wording: "Your account", no Club Admin training-schedule contradiction, no per-type player controls implied', () => {
  const out = renderAs({ role: 'coach', staffLevel: 'head' });
  assert.ok(has(out, '>Your account</h2>'));
  assert.equal(has(out, 'Coach account'), false);
  assert.equal(/training schedule are edited in Club Admin/i.test(out), false, 'the schedule card is right here in Settings');
  assert.ok(has(out, 'The club name and season name are edited in Club Admin.'));
  assert.equal(/players manage their own/i.test(out), false);
  assert.ok(has(out, 'Players turn notifications on or off on their own device.'));
  assert.ok(has(out, 'The weekly availability reminder covers both, so it stops only when both are off.'));
});

// ── 4. no comment text leaks onto the page ──────────────────────────────────

// Four HTML comments in renderSettings were duplicated (bc7ad994): each closed,
// then repeated part of itself and closed again, so the repeated half rendered
// as visible text ("…enforces for the read (PERM.REPORTS)… -->") under Support,
// Production health and Delete account.
test('no HTML-comment text is rendered as visible text, for any role, with or without diagnostics', () => {
  const members = [{ role: 'coach', staffLevel: 'head' }, { role: 'medical' }, { role: 'admin' }];
  for (const member of members) for (const diagnostics of [false, true]) {
    const out = renderAs(member, { uiRole: member.role, diagnostics });
    const visible = out.replace(/<!--[\s\S]*?-->/g, '');
    const label = `${member.role}${diagnostics ? ' + diagnostics' : ''}`;
    assert.equal(visible.includes('-->'), false, `${label}: no stray comment terminator`);
    for (const fragment of ['enforces for the read (PERM.REPORTS)', 'A quiet, honest card', 'never normal UI in any environment',
      'no longer part of normal production use', 'an error log nobody can find'])
      assert.equal(visible.includes(fragment), false, `${label}: "${fragment}" is not rendered`);
  }
});

test('the source has no comment that closes and then repeats itself', () => {
  const settings = fn('renderSettings');
  assert.equal(/-->[ \t]+\S/.test(settings), false, 'nothing follows a comment terminator on the same line');
});

// ── 5. before the session's permissions arrive ──────────────────────────────

// canI() answers isCoach() until the permission list lands, and isCoach() is
// true for non-playing medical staff — so the card used to show them for as
// long as the session took (measured in a browser with the session held).
test('before permissions are known, NOBODY is shown the Club settings card — medical staff included', () => {
  for (const member of [{ role: 'medical' }, { role: 'coach', staffLevel: 'head' }, { role: 'admin' }]) {
    const out = renderAs(member, { uiRole: member.role, permsLoaded: false });
    assert.ok(out.length > 0, `${member.role}: Settings itself still renders while loading`);
    for (const c of CLUB_CONTROLS) assert.equal(has(out, c), false, `${member.role} (loading): no ${c}`);
    assert.ok(has(out, '>Your account</h2>') && has(out, 'settingsSignOut()'), `${member.role}: the rest of Settings is there`);
  }
});

test('once permissions arrive the card follows them; the legacy permissions mode keeps its role check', () => {
  assert.ok(has(renderAs({ role: 'coach', staffLevel: 'head' }, { uiRole: 'coach' }), 'id="set-colour1"'), 'head coach, loaded: card');
  assert.equal(has(renderAs({ role: 'medical' }), 'id="set-colour1"'), false, 'medical, loaded: no card');
  const legacy = renderAs({ role: 'coach', staffLevel: 'head' }, { uiRole: 'coach', permsLoaded: false, features: { permissionsV2: false } });
  assert.ok(has(legacy, 'id="set-colour1"'), 'permissionsV2 off: unchanged isCoach() behaviour');
});
