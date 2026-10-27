/**
 * SETTINGS — the club data export card (Step 3 of the secure club export).
 *
 * The export used to be a button in the hidden Danger zone that stitched a
 * file together in the browser from five ordinary reads — carrying live
 * invite tokens, and only the current group's sessions. It is now a card in
 * General that downloads the SERVER's export
 * (GET /api/publish?resource=club-data-export, coacheasier.club-data-export.v1).
 *
 * Pinned here: the card shows for exactly the memberships the server allows
 * (owner / club-wide club admin) — proven by running the page's rule and the
 * server's rule over the same memberships; nothing shows before the session
 * has answered; the download handler saves what the server sends under the
 * server's filename, shows a refusal's message as-is, and never saves on a
 * refusal; and the five-read assembly is gone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { permissionsFor } from '../api/_permissions.js';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.export-card.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
globalThis.fetch = async () => ({ ok: true, json: async () => ({ result: null }) });
const { mayExportClubData } = await import('../api/publish.js');

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

// ── the memberships the rule is judged on (the server's stored shape) ──────
const U18 = { groupId: 'grp_u18', status: 'active' };
const MEMBERS = {
  'owner (isOwner flag)':             { role: 'admin', isOwner: true, accessProfile: 'full' },
  'owner (approvedBy club-creation)': { role: 'coach', staffLevel: 'head', approvedBy: 'club-creation' },
  'owner (owner role)':               { role: 'owner' },
  'club admin (admin role, no stored scope)': { role: 'admin' },
  'club admin (stored club-wide scope)':      { role: 'admin', accessScope: { clubWide: true, groups: [], teams: [] } },
  'scoped admin (stored group scope)':        { role: 'admin', accessScope: { clubWide: false, groups: [U18], teams: [] } },
  'admin with a malformed stored scope':      { role: 'admin', accessScope: 'whole club' },
  'Full-access head coach':           { role: 'coach', staffLevel: 'head', accessProfile: 'full' },
  'Director of Rugby':                { role: 'dor' },
  'manager':                          { role: 'coach', staffLevel: 'manager' },
  'assistant':                        { role: 'coach', staffLevel: 'assistant' },
  'medical':                          { role: 'medical' },
  'S&C':                              { role: 'snc' },
  'player':                           { role: 'player', playerGroupId: 'grp_initial' },
  'removed admin':                    { role: 'admin', status: 'removed' },
  'pending owner':                    { role: 'admin', isOwner: true, status: 'pending' },
};
const active = m => ({ status: 'active', ...m });
const ALLOWED = ['owner (isOwner flag)', 'owner (approvedBy club-creation)', 'owner (owner role)',
  'club admin (admin role, no stored scope)', 'club admin (stored club-wide scope)'];

/** The page's rule, extracted with the two mirrors it is built from. */
const canExportClubData = new Function(`
  ${fn('clubSetupFounder')}
  ${fn('memberScope')}
  ${fn('canExportClubData')}
  return canExportClubData;`)();

test('1. the page allows exactly the memberships the server allows — the same answer for every shape, and for nothing at all', () => {
  for (const [label, member] of Object.entries(MEMBERS)) {
    const m = active(member);
    assert.equal(canExportClubData(m), mayExportClubData(m), `${label}: page and server agree`);
    assert.equal(canExportClubData(m), ALLOWED.includes(label), `${label}: ${ALLOWED.includes(label) ? 'allowed' : 'refused'}`);
  }
  for (const nothing of [null, undefined, {}]) {
    assert.equal(canExportClubData(nothing), false);
    assert.equal(mayExportClubData(nothing), false);
  }
});

// ── the card on the real Settings screen ────────────────────────────────────

function renderWith(membership) {
  const member = membership === null ? null : active(membership);
  const perms = member ? [...permissionsFor(member)] : null;
  const el = { innerHTML: '' };
  new Function('PERMS', 'MEMBER', 'EL', `
    const document = { getElementById: id => id === 'coach-settings' ? EL : null };
    const BETA_SIMPLE_UI = true;
    const state = { activeView: 'coach', activeCoachSection: 'other', clubName: 'Alpha RFC', features: {} };
    let _settingsVersion = 'x', _settingsPrefs = {};
    let _myPermissions = PERMS, _myMembership = MEMBER;
    const _BUILD_INFO = { sha: 'abc', env: 'production', branch: 'b', time: 'n/a' };
    const _serverAuthState = 'authed';
    const CE_DEFAULT_COLOURS = { primary: '#8F6B2A', secondary: '#8E959D' };
    const DAY_LABELS = { Sat: 'Saturday', Sun: 'Sunday' };
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const currentUser = () => ({ id: 'u1', name: 'Sam Staff', email: 's@x.test', role: MEMBER ? (MEMBER.role === 'owner' || MEMBER.role === 'dor' ? 'admin' : MEMBER.role) : 'coach' });
    const sessionSignedOut = () => false;
    const membershipPlays = () => false;
    const trialDaysRemaining = () => 0;
    const lastSyncLabel = () => 'Just now';
    const canUseFeature = () => true;
    const renderUnavailableNotice = () => '';
    const loadSettingsData = () => {};
    const _diagnosticsOn = () => false;
    ${fn('isCoach')}
    ${fn('canI')}
    ${fn('clubSetupFounder')}
    ${fn('memberScope')}
    ${fn('canExportClubData')}
    ${fn('renderSettings')}
    renderSettings();
  `)(perms, member, el);
  return el.innerHTML;
}
const CARD = '>Club data export</h2>';
const BUTTON = 'onclick="settingsExportClub(this)"';

test('2. the card appears for owners and club-wide admins, in General, with the download button', () => {
  for (const label of ALLOWED) {
    const out = renderWith(MEMBERS[label]);
    assert.ok(out.includes(CARD), `${label}: card`);
    assert.ok(out.includes(BUTTON), `${label}: button`);
    assert.ok(out.includes('Download club data (JSON)'), label);
    const general = out.slice(out.indexOf('>General<'), out.indexOf('>Personal<'));
    assert.ok(general.includes(CARD), `${label}: the card is in General`);
    assert.equal(out.split(BUTTON).length - 1, 1, `${label}: one button on the screen`);
  }
});

test('3. everyone else sees neither the card nor the button — and the rest of Settings is unchanged for them', () => {
  for (const [label, member] of Object.entries(MEMBERS)) {
    if (ALLOWED.includes(label) || ['player', 'S&C', 'removed admin', 'pending owner'].includes(label)) continue;
    const out = renderWith(member);
    assert.ok(out.length > 0, `${label}: Settings renders`);
    assert.equal(out.includes(CARD), false, `${label}: no card`);
    assert.equal(out.includes(BUTTON), false, `${label}: no button`);
    assert.ok(out.includes('>Your account</h2>') && out.includes('settingsSignOut()'), `${label}: the rest is there`);
  }
});

test('4. before the session has answered (no membership yet) nothing export-related is shown', () => {
  const out = renderWith(null);
  assert.ok(out.length > 0);
  assert.equal(out.includes(CARD), false);
  assert.equal(out.includes(BUTTON), false);
});

test('5. the button is gone from the Danger zone, and the card is gated on the page\'s rule behind a typeof guard', () => {
  const settings = fn('renderSettings');
  const danger = /const cardDanger\s*=\s*`[\s\S]*?`;/.exec(settings)[0];
  assert.equal(danger.includes('settingsExportClub'), false, 'no export button in the Danger zone');
  assert.equal(settings.split(BUTTON).length - 1, 1, 'exactly one export button in Settings');
  assert.match(settings, /const canExport = typeof canExportClubData === 'function' && typeof _myMembership !== 'undefined'\s*&& canExportClubData\(_myMembership\);/);
  assert.match(settings, /const cardExport\s*=\s*canExport \? `/);
  assert.match(settings, /setGroup\('General', \[cardClub, cardTraining, cardStructure, cardExport\]\)/);
  // Isolated harnesses that extract renderSettings WITHOUT the rule (the other
  // Settings suites) must still render — with no card, not a ReferenceError.
  const el = { innerHTML: '' };
  new Function('EL', `
    const document = { getElementById: () => EL };
    const BETA_SIMPLE_UI = true; const state = { activeView: 'coach', activeCoachSection: 'other', features: {} };
    let _settingsVersion = 'x', _settingsPrefs = {}, _myPermissions = ['manage_teams'];
    const _BUILD_INFO = {}, _serverAuthState = 'authed', CE_DEFAULT_COLOURS = {}, DAY_LABELS = {};
    const esc = s => String(s ?? ''); const currentUser = () => ({ role: 'coach' });
    const sessionSignedOut = () => false, membershipPlays = () => false, trialDaysRemaining = () => 0, lastSyncLabel = () => '';
    const canUseFeature = () => true, renderUnavailableNotice = () => '', loadSettingsData = () => {};
    ${fn('isCoach')} ${fn('canI')} ${fn('renderSettings')}
    renderSettings();`)(el);
  assert.ok(el.innerHTML.length > 0 && !el.innerHTML.includes(CARD));
});

// ── the download handler ────────────────────────────────────────────────────

/** Run the real settingsExportClub against a scripted fetch; report what it did. */
async function download(response) {
  const log = { anchors: [], toasts: [], labels: [], revoked: [] };
  const btn = { disabled: false, textContent: 'Download club data (JSON)' };
  const run = new Function('RESPONSE', 'LOG', 'BTN', `
    const fetch = async (url, opts) => { LOG.url = url; LOG.opts = opts; if (RESPONSE instanceof Error) throw RESPONSE; return RESPONSE; };
    const document = { createElement: () => { const a = { click() { LOG.anchors.push({ href: a.href, download: a.download }); } }; return a; } };
    const URL = { createObjectURL: b => 'blob:' + (b && b.size), revokeObjectURL: u => LOG.revoked.push(u) };
    const setTimeout = (f) => f();
    const showToast = m => LOG.toasts.push(m);
    const labelsSeen = [];
    const btnProxy = new Proxy(BTN, { set(t, k, v) { if (k === 'textContent') LOG.labels.push(v); t[k] = v; return true; } });
    ${fn('settingsExportClub')}
    return settingsExportClub(btnProxy);`);
  await run(response, log, btn);
  return { ...log, btn };
}
const jsonResponse = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: k => headers[k] ?? headers[k.toLowerCase()] ?? null },
  json: async () => body,
  blob: async () => ({ size: JSON.stringify(body).length }),
});

test('6. a successful export is saved under the server\'s filename; the button is disabled meanwhile and restored after', async () => {
  const r = await download(jsonResponse(200, { schema: 'coacheasier.club-data-export.v1', clubId: 'alpha' },
    { 'Content-Disposition': 'attachment; filename="coacheasier-club-data-alpha-rfc-2026-10-27.json"' }));
  assert.equal(r.url, '/api/publish?resource=club-data-export');
  assert.equal(r.opts?.cache, 'no-store');
  assert.deepEqual(r.anchors.map(a => a.download), ['coacheasier-club-data-alpha-rfc-2026-10-27.json']);
  assert.deepEqual(r.toasts, ['Club data downloaded ✓']);
  assert.deepEqual(r.labels, ['Preparing export…', 'Download club data (JSON)'], 'disabled label while working, original label after');
  assert.equal(r.btn.disabled, false);
  assert.equal(r.revoked.length, 1, 'the object URL is released');
});

test('7. a refusal shows the server\'s own message and saves nothing — not allowed, rate-limited, too large, storage down, invalid data', async () => {
  const refusals = [
    [403, { ok: false, code: 'club_export_not_allowed', error: 'Only the club owner or a club administrator can export club data.' }],
    [429, { ok: false, code: 'club_export_rate_limited', error: "You have exported this club's data 5 times in the last hour. Try again in 42 minutes." }],
    [413, { ok: false, code: 'club_export_too_large', error: "This club's data is too large to export in one file. Nothing was exported." }],
    [503, { ok: false, code: 'storage_unavailable', error: 'Storage temporarily unavailable — nothing was exported. Try again shortly.' }],
    [500, { ok: false, code: 'club_export_data_invalid', error: 'Some of this club\'s stored data could not be exported safely, so nothing was exported.' }],
  ];
  for (const [status, body] of refusals) {
    const r = await download(jsonResponse(status, body));
    assert.deepEqual(r.anchors, [], `${status}: nothing saved`);
    assert.deepEqual(r.toasts, [body.error], `${status}: the server's message, as-is`);
    assert.equal(r.btn.disabled, false, `${status}: button restored`);
  }
});

test('8. a refusal without a readable body, and a network failure, still save nothing and say so', async () => {
  const bare = { ok: false, status: 502, headers: { get: () => null }, json: async () => { throw new Error('not json'); } };
  let r = await download(bare);
  assert.deepEqual(r.anchors, []);
  assert.deepEqual(r.toasts, ['The export was refused (HTTP 502). Nothing was downloaded.']);
  r = await download(new TypeError('Failed to fetch'));
  assert.deepEqual(r.anchors, []);
  assert.deepEqual(r.toasts, ['Could not download the club data — check your connection and try again.']);
  assert.equal(r.btn.disabled, false);
});

test('9. the five-read browser assembly is gone: one request, to the export endpoint, and no local state in the file', () => {
  const src = fn('settingsExportClub').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((src.match(/fetch\(/g) || []).length, 1, 'one fetch');
  for (const gone of ["'/api/identity'", "'/api/invite'", "'/api/roster'", 'type=all', 'resource=club\'', 'localState', 'team_members',
    'player_profiles', 'JSON.stringify(payload', 'trainingGroupParam'])
    assert.equal(src.includes(gone), false, `${gone} is gone`);
  assert.ok(src.includes("'/api/publish?resource=club-data-export'"));
});
