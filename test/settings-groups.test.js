/**
 * SETTINGS — grouped structure (SETTINGS-RESTRUCTURE-1).
 *
 * Settings had grown into fifteen cards in one column with no hierarchy. The
 * cards are now gathered under labelled groups (General · Personal ·
 * Appearance · Notifications · Platform · Support & diagnostics · Account ·
 * Danger zone).
 *
 * This is a MOVE, not a rewrite: each card is the same markup with the same
 * controls, the same permission gate and the same storage key. These tests
 * pin exactly that — the full inventory is still present, once each, with its
 * gate; the groups only add headings; and a group that would stand over
 * nothing (a gated card that renders '') does not render at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const settings = (() => {
  const i = html.indexOf('function renderSettings()');
  const j = html.indexOf('\n    function ', i + 10);
  assert.ok(i > 0 && j > i);
  return html.slice(i, j);
})();

/** The group a card is rendered in, read from the setGroup() calls. */
const GROUPS = (() => {
  const out = {};
  for (const [, title, cards] of settings.matchAll(/setGroup\('([^']+)',\s*\[([^\]]*)\]/g)) {
    out[title] = cards.split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
})();

// ── 1. The inventory: everything that was there is still there ───────────────

// Every control of the pre-restructure Settings screen, by the handler or the
// element id it is reached through. Nothing may leave this list.
const ACTIONS = [
  'settingsUpdateProfile()', 'settingsChangePassword()', 'settingsChangeEmail()', 'settingsLogoutAll()',
  "setSection('coach','admin')", 'settingsRemoveLogo()', 'settingsResetClubColours()',
  'settingsForceSync(this)', 'clearDeviceState()', 'settingsExportClub(this)', 'settingsDeleteClub()',
  'settingsCleanTestData()', 'doFullReset()', 'settingsLoadErrorLog()', 'settingsSignOut()',
  'settingsDeleteAccountOpen()',
];
// Reached through onchange rather than onclick.
// [handler, how many controls use it] — season start AND end both save, as before.
const CHANGE_ACTIONS = [['settingsUploadLogo(this)', 1], ['settingsSaveMatchDay(this.value)', 1], ['settingsSaveSeason()', 2]];
const INPUTS = ['set-displayname', 'set-curpw1', 'set-newpw', 'set-newemail', 'set-curpw2',
                'set-colour1', 'set-colour2', 'set-matchday', 'set-season-start', 'set-season-end'];
const TOGGLES = ['pushEnabled', 'emailEnabled', 'matchReminders', 'trainingReminders'];

test('every setting is still present, exactly once', () => {
  for (const a of ACTIONS) {
    const n = settings.split(`onclick="${a}"`).length - 1;
    assert.equal(n, 1, `${a} appears once (found ${n})`);
  }
  for (const id of INPUTS) {
    const n = settings.split(`id="${id}"`).length - 1;
    assert.equal(n, 1, `#${id} appears once (found ${n})`);
  }
  for (const key of TOGGLES) {
    const n = settings.split(`toggle('${key}'`).length - 1;
    assert.equal(n, 1, `toggle ${key} appears once (found ${n})`);
  }
  for (const [c, want] of CHANGE_ACTIONS) {
    const n = settings.split(`onchange="${c}"`).length - 1;
    assert.equal(n, want, `${c} appears ${want}× (found ${n})`);
  }
  // The cards that come from their own renderers are still called, once each.
  for (const fn of ['renderTrainingScheduleCard', 'renderClubStructureCard', 'renderPlatformAdminCard', 'renderFeatureDiscovery'])
    assert.equal(settings.split(`${fn}()`).length - 1, 1, fn);
});

test('every card is placed in exactly one group', () => {
  const placed = Object.values(GROUPS).flat();
  assert.equal(new Set(placed).size, placed.length, 'no card is in two groups');
  const declared = [...settings.matchAll(/const (card[A-Za-z]+)\s*=/g)].map(m => m[1]);
  assert.deepEqual(declared.slice().sort(), placed.slice().sort(), 'every declared card is grouped, and vice versa');
});

test('the groups are the intended ones, in a sensible order', () => {
  assert.deepEqual(Object.keys(GROUPS), ['General', 'Personal', 'Appearance', 'Notifications',
    'Platform', 'Support & diagnostics', 'Account', 'Danger zone']);
  assert.deepEqual(GROUPS['General'], ['cardClub', 'cardTraining', 'cardStructure']);
  assert.deepEqual(GROUPS['Personal'], ['cardAccount']);
  assert.deepEqual(GROUPS['Appearance'], ['cardAppearance']);
  assert.deepEqual(GROUPS['Notifications'], ['cardNotifications']);
  assert.deepEqual(GROUPS['Account'], ['cardSignOut', 'cardDeleteAccount']);
  assert.deepEqual(GROUPS['Danger zone'], ['cardDanger', 'cardAdvanced']);
});

// ── 2. The grouping mechanism itself ─────────────────────────────────────────

const setGroup = new Function(`
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  ${/const setGroup = [\s\S]*?\n      \};/.exec(settings)[0]}
  return setGroup;`)();

test('a group renders its cards under one heading', () => {
  const out = setGroup('Personal', ['<div class="card">A</div>', '<div class="card">B</div>']);
  assert.match(out, /<section class="set-group">/);
  assert.equal(out.split('set-group-title').length - 1, 1, 'one heading');
  assert.match(out, />Personal</);
  assert.ok(out.includes('A') && out.includes('B'));
});

test('a group whose cards all render nothing does not render', () => {
  assert.equal(setGroup('Platform', ['']), '', 'a gated-away card leaves no heading');
  assert.equal(setGroup('Platform', ['', '   ', undefined, null]), '');
  assert.match(setGroup('Platform', ['', '<div class="card">X</div>']), /set-group-title/, 'one real card is enough');
});

test('a group of present-but-hidden cards hides its heading too', () => {
  assert.match(setGroup('Danger zone', ['<div class="card beta-hidden">X</div>'], { hidden: true }),
    /class="set-group beta-hidden"/, 'the heading hides with the cards it labels');
  assert.doesNotMatch(setGroup('Danger zone', ['<div class="card">X</div>'], { hidden: false }), /beta-hidden/);
});

test('the Danger zone heading hides exactly when its cards are hidden', () => {
  assert.match(settings, /setGroup\('Danger zone', \[cardDanger, cardAdvanced\], \{ hidden: _betaUI && !_diagOn \}\)/);
});

// ── 3. Permissions, values and storage are untouched ─────────────────────────

test('the screen is still coach-only, and the gates are unchanged', () => {
  assert.match(settings, /if \(!isCoach\(\)\) \{ el\.innerHTML = ''; return; \}/);
  assert.equal(settings.split("canI('manage_teams')").length - 1, 1, 'Club Admin link keeps its gate');
  assert.equal(settings.split("canI('reports')").length - 1, 1, 'Production health keeps its gate');
  // The cards keep their OWN diagnostics gates, untouched (4, as before the
  // restructure); _diagOn is derived once on top of them, and is used only to
  // hide the Danger zone heading when both its cards are hidden.
  assert.equal(settings.split('_diagnosticsOn()').length - 1, 5, '4 card gates + the one derived const');
  assert.equal(settings.split('_diagOn').length - 1, 2, 'declared once, used once (the Danger zone heading)');
  // No new permission check was invented.
  const gates = [...settings.matchAll(/canI\('([a-z_]+)'\)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(gates)].sort(), ['manage_teams', 'reports']);
});

test('values, defaults and storage keys are unchanged', () => {
  // Notification prefs: same key set, same "on unless explicitly false" default.
  assert.match(settings, /const prefOn = k => prefs\[k\] !== false;/);
  assert.match(settings, /const prefs = _settingsPrefs \|\| \{\};/);
  // Appearance still reads the device preference, not the account.
  assert.match(settings, /ceAppearancePreference\(\)\s*:\s*'light'/);
  // Club fields still read their existing state keys.
  for (const k of ['state.clubLogo', 'state.clubColours', 'state.seasonStart', 'state.seasonEnd'])
    assert.ok(settings.includes(k), k);
  // The save paths themselves were not touched by this build.
  const toggleFn = html.slice(html.indexOf('async function settingsTogglePref'), html.indexOf('function settingsUploadLogo'));
  assert.match(toggleFn, /action: 'update_preferences'/);
  assert.match(html, /localStorage\.setItem\(CE_APPEARANCE_KEY, pref\)/);
});

test('the layout is presentation-only CSS, and stays inside the viewport', () => {
  assert.match(html, /\.set-wrap \{ display: grid; gap: 22px; max-width: 620px; \}/);
  assert.match(html, /\.set-group \{ display: grid; gap: 12px; \}/);
  assert.match(html, /\.set-group-title \{[^}]*text-transform: uppercase/);
  assert.match(html, /@media \(max-width: 480px\) \{ \.set-wrap \{ gap: 18px; \} \}/);
  // The old single-column wrapper is gone, replaced by the grouped one.
  assert.doesNotMatch(settings, /<div style="display:grid;gap:16px;max-width:620px">/);
});
