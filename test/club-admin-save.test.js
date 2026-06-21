/**
 * Club Admin save UX + stale club-name prevention (client-side).
 *
 * - Club Admin shows a visible "Save Club Settings" button wired to adminSaveClubNow.
 * - adminSaveClubNow reads the inputs, updates state.clubName/teamName/seasonName,
 *   and persists via the existing saveClubConfigToServer path + updates the header.
 * - adoptIdentityPayload resets the header club name to the authenticated team name
 *   on active-team change, so a stale/demo club name cannot override it — while a
 *   same-team re-adopt preserves an already-loaded (renamed) club name.
 *
 * Drives the REAL extracted client functions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('(', start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === '(') pd++; else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  let depth = 0; i = src.indexOf('{', i);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}

// ── (a) Visible save button ──────────────────────────────────────────────────
test('Club Admin renders a visible "Save Club Settings" button wired to adminSaveClubNow', () => {
  assert.match(src, /Save Club Settings/, 'button label present');
  assert.match(src, /onclick="adminSaveClubNow\(\)"/, 'wired to adminSaveClubNow');
  assert.match(src, /id="admin-club-name"/, 'club name input has an id');
  assert.match(src, /id="admin-team-name"/, 'team name input has an id');
  assert.match(src, /id="admin-club-status"/, 'inline saved/failed status element present');
});

// ── (b) Saving updates state via the config path ─────────────────────────────
test('adminSaveClubNow updates state.clubName/teamName/seasonName and calls the save path', async () => {
  const run = new Function(`
    "use strict";
    const state = { clubName: 'old', teamName: 'old', seasonName: '' };
    const inputs = { 'admin-club-name': 'Clean Test Club', 'admin-team-name': 'Senior Men', 'admin-season-name': '2026/27', 'admin-club-status': '' };
    const els = {}; Object.keys(inputs).forEach(k => els[k] = { value: inputs[k], textContent: '', style: {} });
    const document = { getElementById: id => els[id] || null };
    const window = {};
    let savedCalls = 0, navCalls = 0;
    function saveState(){}
    function renderNav(){ navCalls++; }
    function showToast(){}
    async function saveClubConfigToServer(){ savedCalls++; return { clubName: state.clubName, teamName: state.teamName }; }
    ${extractFn('adminSaveClubNow')}
    return (async () => { await adminSaveClubNow(); return { state, savedCalls, navCalls, status: els['admin-club-status'].textContent }; })();
  `);
  const r = await run();
  assert.equal(r.state.clubName, 'Clean Test Club');
  assert.equal(r.state.teamName, 'Senior Men');
  assert.equal(r.state.seasonName, '2026/27');
  assert.equal(r.savedCalls, 1, 'persisted via saveClubConfigToServer');
  assert.ok(r.navCalls >= 1, 'header re-rendered');
  assert.equal(r.status, 'Saved ✓', 'inline success feedback shown');
});

// ── (c) Stale club name cannot override authenticated team on team change ─────
test('stale Trial Club name cannot override authenticated Clean Test Club after login', () => {
  const run = new Function(`
    "use strict";
    let _myPermissions = null, _myMemberships = null, _adoptedTeamId = null, _clubConfigChecked = true;
    const state = { clubName: 'Coachs Eye Trial Club 4', teamName: 'old' };
    ${extractFn('adoptIdentityPayload')}
    adoptIdentityPayload({ memberships: [{ teamId: 'clean-test-club', teamName: 'Clean Test Club', current: true }] });
    return { clubName: state.clubName, adopted: _adoptedTeamId, configChecked: _clubConfigChecked };
  `);
  const r = run();
  assert.equal(r.clubName, 'Clean Test Club', 'authenticated team name replaces stale demo name');
  assert.equal(r.adopted, 'clean-test-club');
  assert.equal(r.configChecked, false, 'new team config re-fetch enabled');
});

test('same-team re-adopt does NOT clobber an already-loaded (renamed) club name', () => {
  const run = new Function(`
    "use strict";
    let _myPermissions = null, _myMemberships = null, _adoptedTeamId = 'clean-test-club', _clubConfigChecked = true;
    const state = { clubName: 'My Renamed Club' };
    ${extractFn('adoptIdentityPayload')}
    adoptIdentityPayload({ memberships: [{ teamId: 'clean-test-club', teamName: 'Clean Test Club', current: true }] });
    return state.clubName;
  `);
  assert.equal(run(), 'My Renamed Club', 'legitimate loaded/renamed name preserved on same-team adopt');
});
