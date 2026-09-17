/**
 * COACH-PLAYER-DUAL-ROLE-404-FIX-1 — the production 404 behind "Player".
 *
 * The Player switch is pure application STATE (setView/setSection on the one
 * page at "/"); it never navigates. The only in-app navigation to a route
 * that does not exist in the Core deployment was a leftover global keyboard
 * shortcut: any plain "m" keypress outside a text field set
 * window.location.href = '/mission-control' — a directory the deploy
 * allow-list (.vercelignore) excludes, so production answered with the app's
 * own 404 page. Reproduced on the live site. That handler is gone.
 *
 * These tests pin the PRODUCTION ROUTING SHAPE: every navigation target the
 * bundle can produce must resolve to something the deployment actually
 * serves (a file in the allow-list, or a vercel.json rewrite), and the
 * dual-role Player destination must be a valid state on "/".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', ROOT), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('vercel.json', ROOT), 'utf8'));
const allow = readFileSync(new URL('.vercelignore', ROOT), 'utf8').split('\n').filter(l => l.startsWith('!/')).map(l => l.slice(2).replace(/\/$/, ''));
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

/** Does the deployment serve this path? A file in the allow-list, a rewrite source, or a dynamic /api function. */
function deploymentServes(path) {
  const p = String(path).split(/[?#]/)[0];
  if (p === '/' || p === '/index.html') return true;
  if ((vercel.rewrites || []).some(r => r.source === p)) return true;
  if (p.startsWith('/api/')) return true;                                  // serverless functions
  const top = p.split('/')[1];
  if (!allow.includes(top)) return false;
  return existsSync(new URL('.' + p, ROOT));
}

// ── The production routing shape ───────────────────────────────────────────
test('R1. every static href in the bundle resolves to a path the deployment serves', () => {
  const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map(m => m[1]);
  assert.ok(hrefs.length >= 5, 'the bundle links to its own routes');
  for (const h of hrefs) assert.ok(deploymentServes(h), `${h} must be served in production`);
});

test('R2. every location/history navigation in the bundle targets "/" or a served path — never a route missing from the deployment', () => {
  const targets = [
    ...[...html.matchAll(/location\.(?:href|assign|replace)\s*(?:=|\()\s*'([^']*)'/g)].map(m => m[1]),
    ...[...html.matchAll(/history\.(?:pushState|replaceState)\([^,]*,\s*[^,]*,\s*'([^']*)'\)/g)].map(m => m[1]),
  ];
  assert.ok(targets.length >= 5, 'navigations found: ' + targets.length);
  for (const t of targets) assert.ok(deploymentServes(t), `${t} must be served in production`);
  assert.ok(!html.includes("'/mission-control'"), 'the /mission-control shortcut is gone');
});

test('R3. no global keyboard shortcut navigates the page (the "m" → /mission-control trap)', () => {
  const tail = html.slice(html.lastIndexOf('initAppearance();'));
  assert.doesNotMatch(tail, /addEventListener\('keydown'[\s\S]{0,400}location\.href/, 'no keydown handler assigns location');
  const keydowns = [...html.matchAll(/addEventListener\('keydown',\s*([^)]{0,80})/g)].map(m => m[1]);
  for (const k of keydowns) assert.doesNotMatch(k, /location/, 'keydown handlers never navigate');
  assert.doesNotMatch(html, /toLowerCase\(\) === 'm'\)\s*\{\s*window\.location/, 'the shortcut body is gone');
});

test('R4. /mission-control is not part of the Core deployment (so any navigation to it IS a 404)', () => {
  assert.equal(allow.includes('mission-control'), false);
  assert.equal(deploymentServes('/mission-control'), false);
});

// ── The dual-role Player destination is application STATE on "/" ───────────
function shell() {
  const body = '"use strict";\nconst CFG = arguments[0];\n' +
    'let nav = []; const window = { location: { get href(){ return "/"; }, set href(v){ nav.push("href=" + v); }, replace: v => nav.push("replace=" + v), assign: v => nav.push("assign=" + v) }, history: { pushState: (a,b,u) => nav.push("push=" + u), replaceState: (a,b,u) => nav.push("replace=" + u) } };\n' +
    'const location = window.location, history = window.history;\n' +
    'let state = { users: [CFG.user], currentUserId: CFG.user.id, activeView: "coach", activeCoachSection: "overview", activePlayerSection: "home", players: [], operationalGroupId: null, trainingStateGroupId: null, trainingByGroup: {}, schedule: [], trainingBlocks: {}, selectedPlayerId: "", selectedPlayerOwnerId: "", features: {}, messages: [] };\n' +
    'let _myMembership = CFG.member, _myOperational = CFG.operational, _myPermissions = ["publish_training"];\n' +
    'let saves = 0, renders = 0, toasts = []; function saveState(){ saves++; } function render(){ renders++; } function showToast(t){ toasts.push(t); }\n' +
    'function mcDetachFixture(){} function hydrateMedicalFromShared(){} function loadMedicalFromServer(){ return Promise.resolve(); } function canUseFeature(){ return false; } function canI(p){ return _myPermissions.includes(p); }\n' +
    'let _trainingSchedule = null, _trainingScheduleAttempted = false, _trainingScheduleGroupId = "", _trainingPubState = {}, _trainingPubLoadedAt = 0, _publishedStateLoadedAt = 0, _fxAvailBoardId = null, _sharedMedical = {}, _trainingWeekNavIn = "";\n' +
    'const CE_INITIAL_GROUP_ID = "grp_initial"; const TRAINING_UNOWNED_KEY = "_unowned"; const defaultState = { schedule: [], trainingBlocks: {}, tacticsDrawings: {} };\n' +
    'const playerSections = [["home","Home"],["messages","Messages"],["availability","Availability"],["training","Training"]]; const coachSections = [["overview","Overview"],["training","Training"],["settings","Settings"]]; const SECTION_PERM_MAP = {}; const SECTION_FEATURE_MAP = {}; const BETA_HIDE_COMMERCIAL = true; function _isLocalDemoHost(){ return false; }\n' +
    'function canonicalAccountForUserId(id){ return state.users.find(u => u.id === id) || null; }\n' +
    'function identityEmailKey(v){ return String(v || "").trim().toLowerCase(); } function canonicalVisiblePlayers(){ return state.players; } function resolveRosterMessagingId(p){ return p.userId || p.id; } function canonicalIdentityNameKey(v){ return String(v||"").toLowerCase().replace(/[^a-z]/g,""); }\n' +
    ['sessionSignedOut','membershipPlays','isCoach','currentUser','isPermanentPlayerUserId','canonicalPlayerIdForUser','ensureCanonicalPlayerRecord','hydrateSessionPlayerRecord','ensureOwnPlayerRecord','ownPlayerRecordForUser','staffPreviewPlayerId','getPlayer',
     'operationalCapacity','operationalGroups','resolveOperationalGroup','captureTrainingState','trainingStateOwner','stashTrainingState','adoptTrainingState','syncTrainingStateToGroup','playerSectionsFor','playerSectionAllowed','allowedCoachSections','setView','setSection'].map(fn).join('\n') + '\n' +
    'const EMPTY_PLAYER = { id: "", name: "\\u2014" };\n' +
    'ensureOwnPlayerRecord();\n' +
    // showSection's state coercion (the part that decides what "/" renders), verbatim minus the DOM
    'function resolveDestination(){ if (state.activeView !== "coach" && state.activeView !== "player") state.activeView = isCoach() ? "coach" : "player"; if (state.activeView === "coach" && !isCoach()) state.activeView = "player";\n' +
    '  if (state.activeView === "player" && !playerSectionsFor().some(([id]) => id === state.activePlayerSection)) state.activePlayerSection = "home";\n' +
    '  if (state.activeView === "coach" && !coachSections.some(([id]) => id === state.activeCoachSection)) state.activeCoachSection = "overview";\n' +
    '  return state.activeView === "coach" ? "coach-" + state.activeCoachSection : "player-" + state.activePlayerSection; }\n' +
    'return { get state(){ return state; }, setView, setSection, dest: resolveDestination, nav: () => nav, me: () => getPlayer(), url: () => window.location.href, toasts: () => toasts };';
  return new Function(body)(arguments[0]);
}
const SENIORS = 'grp_initial', U18 = 'grp_u18';
const OPERATIONAL = { player: { groups: [{ id: SENIORS, name: 'Seniors' }], defaultGroupId: SENIORS, mustChoose: false }, staff: { groups: [{ id: U18, name: 'U18' }], defaultGroupId: U18, mustChoose: false } };
const dual = { user: { id: 'user_dual', role: 'coach', name: 'Dual Member', email: 'd@x.test' },
  member: { id: 'm1', teamId: 'club', userId: 'user_dual', role: 'coach', staffLevel: 'assistant', status: 'active', playerGroupId: SENIORS, accessScope: { clubWide: false, groups: [{ groupId: U18, role: null, status: 'active' }], teams: [] } }, operational: OPERATIONAL };
const coachOnly = { user: { id: 'user_c', role: 'coach', name: 'Coach Only', email: 'c@x.test' }, member: { id: 'm2', teamId: 'club', userId: 'user_c', role: 'coach', staffLevel: 'head', status: 'active', playerGroupId: '' }, operational: { player: { groups: [], defaultGroupId: null, mustChoose: false }, staff: OPERATIONAL.staff } };
const playerOnly = { user: { id: 'user_p', role: 'player', name: 'Player Only', email: 'p@x.test' }, member: { id: 'm3', teamId: 'club', userId: 'user_p', role: 'player', status: 'active', playerGroupId: SENIORS }, operational: { player: OPERATIONAL.player, staff: { groups: [], defaultGroupId: null, mustChoose: false } } };

test('D1. dual-role Coach → Player is a state change on "/" — no navigation, no 404 destination', () => {
  const c = shell(dual);
  c.setView('player');
  assert.deepEqual(c.nav(), [], 'no location/history write');
  assert.equal(c.url(), '/');
  assert.equal(c.dest(), 'player-home', 'a valid application state');
  assert.equal(c.state.operationalGroupId, SENIORS); assert.equal(c.me().id, 'user_dual');
});
test('D2. Player → Coach and repeated switching never navigate and always resolve valid states', () => {
  const c = shell(dual);
  for (let i = 0; i < 5; i++) {
    c.setView('player'); assert.equal(c.dest(), 'player-home'); assert.equal(c.state.operationalGroupId, SENIORS);
    c.setView('coach');  assert.equal(c.dest(), 'coach-overview'); assert.equal(c.state.operationalGroupId, U18);
  }
  assert.deepEqual(c.nav(), []);
});
test('D3. sections inside the portal are state too (setSection), and a stale/unknown section self-heals on "/"', () => {
  const c = shell(dual);
  c.setSection('player', 'availability'); assert.equal(c.dest(), 'player-availability');
  c.setSection('player', 'medical');      assert.match(c.toasts().at(-1), /do not have access/, 'ungranted section refused, no navigation');
  c.state.activePlayerSection = 'ghost';  assert.equal(c.dest(), 'player-home', 'unknown persisted section falls back inside the same capacity');
  assert.deepEqual(c.nav(), []);
});
test('D4. refresh in Player mode: "/" is the only entry, and a restored player state resolves (coach landing is also valid)', () => {
  const c = shell(dual);
  c.setView('player');
  const restored = shell(dual); restored.state.activeView = 'player'; restored.state.activePlayerSection = 'training';
  assert.equal(restored.dest(), 'player-training', 'a persisted player state is honoured on reload');
  assert.deepEqual(restored.nav(), []);
});
test('D5. coach-only and player-only users are unchanged: no navigation, valid states, refusals stay toasts', () => {
  const co = shell(coachOnly); co.setView('player'); assert.equal(co.dest(), 'player-home'); assert.equal(co.me().id, ''); co.setView('coach'); assert.equal(co.dest(), 'coach-overview'); assert.deepEqual(co.nav(), []);
  const po = shell(playerOnly); po.setView('coach'); assert.match(po.toasts().at(-1), /Player accounts cannot open coach tools/); assert.equal(po.dest(), 'player-home'); assert.equal(po.me().id, 'user_p'); assert.deepEqual(po.nav(), []);
});
