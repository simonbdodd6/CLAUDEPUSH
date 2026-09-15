/**
 * MESSAGES-NEW-CONVERSATION-FIX-1 — starting a conversation from New Message.
 *
 * PRODUCTION SYMPTOM (coach, 15 Sep 2026): "New Message" opened, the search
 * found the player, the player's row appeared — and clicking it did nothing.
 * Silently: no conversation, no thread, no error.
 *
 * PROVEN ROOT CAUSE (reproduced on the live site in Chromium and WebKit):
 * src/player-identity.js imported `isStaffRole` from ../api/_permissions.js.
 * vercel.json deliberately redirects EVERY /api/*.js file request to the
 * branded 404 page so serverless source can never be served (the H1 fix), so
 * in production that import resolved to an HTML document. A browser refuses to
 * execute HTML as a module, so the whole chain — chat-state → player-identity
 * → _permissions — failed and `chatLoadStateModule()` rejected on every
 * device. `chatStartCoachDm` awaits it before doing anything, inside an async
 * click handler with no catch, so the rejection vanished into an unhandled
 * promise and the click did nothing at all. The picker itself still worked
 * because it renders synchronously and filters through its inline fallback.
 * The same await sits in `chatResolveCoachDirectChatId`, on the way into
 * selectChat, so opening an EXISTING DM from the contact list died too.
 *
 * SECOND DEFECT, same screen: the picker's search box is a flex item in a
 * column flex dialog and carried no flex-shrink. With a real squad (76
 * players) the results overflow the dialog, every sibling shrinks
 * proportionally, and the 38px field was squeezed to FIVE pixels — present,
 * focusable, and invisible. Measured at 5px/6px before, 42px/45px after.
 *
 * THE FIX: the canonical staff-role list moved to src/staff-roles.js (served
 * as JavaScript; api/_permissions.js re-exports it, so there is still exactly
 * ONE definition and the /api block is untouched); chatLoadStateModule never
 * rejects and retries on a cooldown; the flows degrade instead of aborting;
 * the row handler reports a failure; the dialog's header and field no longer
 * shrink.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const html = readFileSync(ROOT + 'index.html', 'utf8');
const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8'));
const allow = readFileSync(ROOT + '.vercelignore', 'utf8').split('\n').filter(l => l.startsWith('!/')).map(l => l.slice(2).replace(/\/$/, ''));
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

// ═══ 1. THE ROOT CAUSE: every module the browser imports must be SERVABLE ═══
// Uploaded is not enough — vercel.json can redirect an uploaded file to the
// 404 page, which is exactly what broke Messages. This walks the real import
// graph from index.html's dynamic imports and checks each file both ways.

/** Would production serve this repo-relative path as its own bytes? */
function servable(relPath) {
  const p = '/' + relPath;
  for (const r of vercel.redirects || []) {
    const rx = new RegExp('^' + String(r.source)
      .replace(/\/:file\((.*?)\)/, (_, g) => '/' + g)
      .replace(/:[a-zA-Z]+\*/g, '.*') + '$');
    if (rx.test(p)) return { ok: false, why: `redirected by ${r.source} → ${r.destination}` };
  }
  const top = relPath.split('/')[0];
  if (!allow.includes(top)) return { ok: false, why: `'${top}' is not in the .vercelignore allow-list` };
  if (!existsSync(ROOT + relPath)) return { ok: false, why: 'file does not exist' };
  return { ok: true };
}

/** Every static import target of a JS file, resolved to repo-relative paths. */
function importsOf(relPath) {
  const src = readFileSync(ROOT + relPath, 'utf8');
  const dir = dirname(relPath);
  return [...src.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*['"](\.[^'"]+)['"]/g)]
    .map(m => relative(ROOT, resolve(ROOT, dir, m[1])).split('\\').join('/'));
}

const BROWSER_ENTRIES = [...html.matchAll(/import\('(\.\/[^']+)'\)/g)].map(m => m[1].replace(/^\.\//, ''));

test('1. ROOT CAUSE — every module the browser dynamically imports is served as JavaScript, transitively', () => {
  assert.ok(BROWSER_ENTRIES.includes('src/chat-state.js'), 'the chat state module is a browser entry point');
  const seen = new Set(); const problems = [];
  const walk = (p, chain) => {
    if (seen.has(p)) return; seen.add(p);
    const s = servable(p);
    if (!s.ok) problems.push(`${chain.join(' → ')} → ${p}: ${s.why}`);
    if (!existsSync(ROOT + p)) return;
    for (const dep of importsOf(p)) walk(dep, [...chain, p]);
  };
  for (const e of BROWSER_ENTRIES) walk(e, ['index.html']);
  assert.deepEqual(problems, [], 'unservable modules in the browser import graph:\n' + problems.join('\n'));
  assert.ok(seen.size >= BROWSER_ENTRIES.length, 'the graph was actually walked');
});

test('2. the exact production regression is pinned: no browser module may import from /api', () => {
  const offenders = [];
  for (const dir of ['src', 'performance', 'season-intelligence']) {
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      const fs = readFileSync;
      let entries = [];
      try { entries = require('node:fs').readdirSync(ROOT + cur, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const p = cur + '/' + e.name;
        if (e.isDirectory()) { stack.push(p); continue; }
        if (!e.name.endsWith('.js')) continue;
        if (/from\s*['"][^'"]*\/api\//.test(fs(ROOT + p, 'utf8'))) offenders.push(p);
      }
    }
  }
  assert.deepEqual(offenders, [], 'these browser modules import serverless source, which production refuses to serve');
});

test('3. the /api source block is INTACT — the fix did not weaken it', () => {
  const r = (vercel.redirects || []).find(x => String(x.source).includes('api'));
  assert.ok(r, 'the /api/*.js redirect still exists');
  assert.equal(r.destination, '/404.html');
  assert.equal(servable('api/_permissions.js').ok, false, 'serverless source is still unservable');
  assert.match(servable('api/_permissions.js').why, /redirected/);
});

test('4. ONE canonical staff-role list — src/staff-roles.js, re-exported by api/_permissions.js', async () => {
  const src = readFileSync(ROOT + 'src/staff-roles.js', 'utf8');
  assert.match(src, /export const STAFF_ROLES/);
  assert.match(src, /export function isStaffRole/);
  const perms = readFileSync(ROOT + 'api/_permissions.js', 'utf8');
  assert.match(perms, /export \{ STAFF_ROLES, isStaffRole \} from '\.\.\/src\/staff-roles\.js'/, 're-export, not a copy');
  assert.doesNotMatch(perms, /export const STAFF_ROLES = Object\.freeze/, 'no second definition');
  assert.match(readFileSync(ROOT + 'src/player-identity.js', 'utf8'), /from '\.\/staff-roles\.js'/);
  const [a, b] = await Promise.all([import('../api/_permissions.js'), import('../src/staff-roles.js')]);
  assert.deepEqual([...a.STAFF_ROLES], [...b.STAFF_ROLES], 'server and browser agree');
  assert.equal(a.isStaffRole('coach'), true); assert.equal(a.isStaffRole('snc'), true); assert.equal(a.isStaffRole('player'), false);
});

test('5. the chat-state module actually loads and exposes what Messages awaits', async () => {
  const mod = await import('../src/chat-state.js');
  for (const name of ['mergeMessages', 'createCoachDmConversationRequestForPlayerId', 'filterCoachDmPlayers', 'dedupeRosterPlayers', 'resolveMessagingParticipantId']) {
    assert.equal(typeof mod[name], 'function', `${name} is exported`);
  }
});

// ═══ 2. THE CLICK PATH — real functions, real DOM events ═══════════════════
const SENIORS = 'grp_initial', U18 = 'grp_u18', COACH = 'user_coach';
const P = (i, gid, name) => ({ id: `user_p${i}`, userId: `user_p${i}`, name, position: 'Centre', email: `p${i}@x.test`, playerGroupId: gid });
const ROSTER = [P(1, SENIORS, 'Aaron Fletcher'), P(2, SENIORS, 'Bruno Kessler'), P(3, SENIORS, 'Cara Norris'), P(9, U18, 'Zed Youngblood')];
const MEMBERS = [{ userId: COACH, role: 'coach', status: 'active', playerGroupId: '' },
  ...ROSTER.map(p => ({ userId: p.userId, role: 'player', status: 'active', playerGroupId: p.playerGroupId }))];

/** The picker + DM-start pipeline with the REAL functions and a tiny DOM. */
async function env({ moduleAvailable = true, conversations = [], gid = SENIORS, postOk = true } = {}) {
  const mod = moduleAvailable ? await import('../src/chat-state.js') : null;
  const body = `
    "use strict";
    const CFG = arguments[0], MOD = arguments[1];
    let state = { users: CFG.users, currentUserId: CFG.coach, players: CFG.roster, activeView: 'coach',
                  operationalGroupId: CFG.gid, selectedChatId: 'squad', selectedPlayerId: '', activeCoachSection: 'messages' };
    let _adminData = { members: CFG.members, loaded: true, structureAccess: null };
    let _chatConversations = CFG.conversations, _chatMessages = {}, _chatOnline = {}, _chatLastPoll = {}, _chatHistoryLoadedAt = {};
    let _chatNewDmOpen = false, _chatNewDmQuery = '', _chatMobileOpen = false, _chatStateModule = MOD, _chatStatePromise = null;
    let _chatStateFailedAt = 0; const CHAT_STATE_RETRY_MS = 60000;
    let posts = [], toasts = [], selected = [], renders = 0, saves = 0;
    const STAFF_ROLES = ['coach','admin','medical','snc','analyst'];
    function isStaffRole(r){ return STAFF_ROLES.includes(String(r||'').toLowerCase()); }
    function isCoach(){ return true; }
    function chatMe(){ const u = state.users.find(x => x.id === state.currentUserId); return { id: u.id, name: u.name, role: u.role }; }
    function currentUser(){ return state.users.find(x => x.id === state.currentUserId); }
    function canonicalVisiblePlayers(){ return state.players; }
    function showToast(t){ toasts.push(t); }
    function saveState(){ saves++; }  function render(){ renders++; }
    function esc(v){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function chatAvatarEl(){ return '<span class="av"></span>'; }
    function chatRenderContactList(){}  function chatRenderMessages(){}  function chatScrollToBottom(){}
    function chatStartPolling(){}  function chatMarkRead(){}  function chatBuildContacts(){ return []; }
    function chatFocusComposerSoon(){}  function chatEnsureGroupChannel(){ return Promise.resolve(); }
    function chatEnsureStaffDirectory(){ return Promise.resolve(); }
    function playerAllowedConversationIds(){ return new Set(); }  function playerCoachDmId(){ return ''; }
    function chatNeedsHistory(){ return false; }
    function chatFetchMessages(){ return Promise.resolve([]); }
    function chatFetchConversations(){ return Promise.resolve(); }
    function operationalGroups(){ return [{ id: CFG.gid, name: 'Group' }]; }
    function chatStaffDmCandidates(meId){ return (state.users||[]).filter(u => isStaffRole(u.role) && u.name && String(u.id) !== String(meId))
      .map(u => ({ id: String(u.id), name: u.name, position: 'Coach', email: u.email || '', photo: '', _staff: true })); }
    function fetch(url, opts){ const b = JSON.parse((opts && opts.body) || '{}'); posts.push(b);
      return Promise.resolve({ ok: CFG.postOk, json: async () => (CFG.postOk ? { ok: true } : { ok: false, error: 'refused' }) }); }
    // A minimal DOM: only what the picker touches.
    function mkEl(id){ const el = { id, _html: '', dataset: {}, listeners: {}, children: [],
      set innerHTML(v){ this._html = v; this.children = parseRows(v); }, get innerHTML(){ return this._html; },
      querySelectorAll(sel){ return sel.includes('data-chat-new-dm-player') ? this.children : []; },
      focus(){ } }; return el; }
    function parseRows(htmlStr){ const out = []; const rx = /data-chat-new-dm-player="([^"]*)"/g; let m;
      while ((m = rx.exec(htmlStr))) { const id = m[1]; out.push({ dataset: { chatNewDmPlayer: id },
        _fns: [], addEventListener(ev, f){ if (ev === 'click') this._fns.push(f); },
        click(){ this._fns.forEach(f => f()); } }); } return out; }
    const _els = { chatNewDmPicker: mkEl('chatNewDmPicker'), chatNewDmResults: mkEl('chatNewDmResults') };
    const document = { getElementById: id => _els[id] || null, querySelector: () => null, querySelectorAll: () => [] };
    ${fn('chatLoadStateModule')}
    ${fn('chatMergeMessages')}
    ${fn('chatResolvePlayerParticipantId')}
    ${fn('chatResolveDirectParticipantId')}
    ${fn('chatResolveCoachDirectChatId')}
    ${fn('dmConvId')}
    ${fn('chatDirectoryPlayers')}
    ${fn('chatCoachDmPickerPlayers')}
    ${fn('chatNewDmPickerResultsHtml')}
    ${fn('chatNewDmPickerHtml')}
    ${fn('chatBindNewDmRows')}
    ${fn('chatRenderNewDmPicker')}
    ${fn('chatRenderNewDmResults')}
    ${fn('chatOpenNewDmPicker')}
    ${fn('chatCloseNewDmPicker')}
    ${fn('chatSetNewDmQuery')}
    ${fn('chatStartStaffDm')}
    ${fn('chatStartDmWith')}
    ${fn('chatStartCoachDm')}
    async function selectChat(id){ selected.push(id); state.selectedChatId = await chatResolveCoachDirectChatId(id); selected[selected.length-1] = state.selectedChatId; }
    return { get state(){ return state; }, open: chatOpenNewDmPicker, close: chatCloseNewDmPicker,
      setQuery: chatSetNewDmQuery, rows: () => (_els.chatNewDmResults.innerHTML !== '' ? _els.chatNewDmResults : _els.chatNewDmPicker).children,
      pickerHtml: () => _els.chatNewDmPicker.innerHTML, candidates: chatCoachDmPickerPlayers,
      start: chatStartDmWith, posts: () => posts, toasts: () => toasts, selected: () => selected,
      isOpen: () => _chatNewDmOpen, convs: () => _chatConversations, moduleLoaded: () => !!_chatStateModule };
  `;
  const users = [{ id: COACH, role: 'coach', name: 'Coach H', email: 'c@x.test' },
    { id: 'user_other_coach', role: 'coach', name: 'Other Coach', email: 'oc@x.test' },
    ...ROSTER.map(p => ({ id: p.userId, role: 'player', name: p.name, email: p.email }))];
  return new Function(body)({ users, coach: COACH, roster: ROSTER, members: MEMBERS, conversations, gid, postOk }, mod);
}

test('6. New Message opens a usable picker and search returns the player', async () => {
  const e = await env();
  e.open();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(e.isOpen(), true);
  assert.match(e.pickerHtml(), /Search players\.\.\./, 'the placeholder names what to search');
  assert.match(e.pickerHtml(), /role="searchbox"/);
  e.setQuery('Bruno');
  const rows = e.rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.chatNewDmPlayer, 'user_p2');
});

test('7. clicking the search result OPENS the conversation — the production bug', async () => {
  const e = await env();
  e.open(); await new Promise(r => setTimeout(r, 0));
  e.setQuery('Bruno');
  e.rows()[0].click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(e.state.selectedChatId, `dm:${COACH}:user_p2`, 'the DM is selected');
  assert.equal(e.isOpen(), false, 'the picker closes');
  assert.deepEqual(e.posts().map(p => p.action), ['create_conv']);
  assert.equal(e.posts()[0].id, `dm:${COACH}:user_p2`);
  assert.deepEqual(e.posts()[0].participants.slice().sort(), [COACH, 'user_p2'].sort(), 'canonical identities, both sides');
  assert.equal(e.toasts().length, 0, 'no error');
});

test('8. it STILL works when the state module is unavailable — no silent dead click', async () => {
  const e = await env({ moduleAvailable: false });
  e.open(); await new Promise(r => setTimeout(r, 0));
  e.setQuery('Bruno');
  assert.equal(e.rows().length, 1, 'the inline fallback still filters');
  e.rows()[0].click();
  await new Promise(r => setTimeout(r, 30));
  assert.equal(e.state.selectedChatId, `dm:${COACH}:user_p2`, 'the conversation still opens');
  assert.deepEqual(e.posts().map(p => p.action), ['create_conv'], 'and is still created');
});

test('9. an EXISTING conversation is opened, never duplicated', async () => {
  const existing = [{ id: `dm:${COACH}:user_p2`, name: 'Bruno Kessler', type: 'DIRECT', participants: [COACH, 'user_p2'] }];
  const e = await env({ conversations: existing });
  e.open(); await new Promise(r => setTimeout(r, 0));
  e.setQuery('Bruno'); e.rows()[0].click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(e.state.selectedChatId, `dm:${COACH}:user_p2`);
  assert.deepEqual(e.posts(), [], 'no create_conv for a conversation that already exists');
});

test('10. repeated opening never creates a duplicate', async () => {
  const e = await env();
  for (let i = 0; i < 4; i++) {
    e.open(); await new Promise(r => setTimeout(r, 0));
    e.setQuery('Bruno'); e.rows()[0].click();
    await new Promise(r => setTimeout(r, 10));
    e.convs().push(...(e.posts().length && !e.convs().some(c => c.id === e.posts()[0].id) ? [{ id: e.posts()[0].id, type: 'DIRECT' }] : []));
  }
  assert.equal(e.posts().filter(p => p.action === 'create_conv').length, 1, 'created once, then reused');
});

test('11. recipient identity is canonical — never the display name or a list position', async () => {
  const e = await env();
  e.open(); await new Promise(r => setTimeout(r, 0));
  const ids = e.candidates().map(c => c.id);
  assert.ok(ids.every(id => /^user_/.test(id)), 'ids only: ' + ids.join(','));
  e.setQuery('Bruno'); e.rows()[0].click();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(!/Bruno/.test(e.state.selectedChatId), 'the conversation id carries identities, not names');
  assert.equal(e.posts()[0].participants.includes('user_p2'), true);
});

test('12. GROUP ISOLATION — the picker offers the operating group only, and another group is not selectable', async () => {
  const e = await env({ gid: SENIORS });
  e.open(); await new Promise(r => setTimeout(r, 0));
  const names = e.candidates().map(c => c.name);
  assert.ok(names.includes('Bruno Kessler'), 'Seniors player offered');
  assert.equal(names.includes('Zed Youngblood'), false, 'the U18 player is NOT offered to a Seniors coach');
  e.setQuery('Zed');
  assert.equal(e.rows().length, 0, 'and cannot be found by searching either');
});

test('13. a coach may also start a STAFF DM, through the same one creation path', async () => {
  const e = await env();
  e.open(); await new Promise(r => setTimeout(r, 0));
  e.setQuery('Other Coach');
  assert.equal(e.rows().length, 1);
  e.rows()[0].click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(e.state.selectedChatId, `dm:${COACH}:user_other_coach`);
  assert.equal(e.posts()[0].type, 'DIRECT');
});

test('14. an unknown / unauthorised target is refused, not guessed', async () => {
  const e = await env();
  await e.start('user_not_in_this_club');
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(e.posts(), [], 'nothing created');
  assert.match(e.toasts().join(' '), /Member not found/);
  assert.equal(e.state.selectedChatId, 'squad', 'the open conversation is untouched');
});

test('15. a refused create is reported — the coach is never left guessing', async () => {
  const e = await env({ postOk: false });
  e.open(); await new Promise(r => setTimeout(r, 0));
  e.setQuery('Bruno'); e.rows()[0].click();
  await new Promise(r => setTimeout(r, 20));
  assert.match(e.toasts().join(' '), /Could not open direct message/);
});

// ═══ 3. SOURCE CONTRACTS ══════════════════════════════════════════════════
test('16. chatLoadStateModule never rejects, caches success, and retries a failure on a cooldown', () => {
  const src = fn('chatLoadStateModule');
  assert.match(src, /\.catch\(/, 'the import is caught');
  assert.match(src, /_chatStatePromise = null/, 'a failure is not latched forever');
  assert.match(src, /_chatStateFailedAt = Date\.now\(\)/);
  assert.match(src, /CHAT_STATE_RETRY_MS/, 'and a retry storm is prevented');
  assert.match(src, /return null/, 'callers get null, never a rejection');
});

test('17. the row handler catches — a failure shows a message instead of nothing, and binding is idempotent', () => {
  const src = fn('chatBindNewDmRows');
  assert.match(src, /\.catch\(/, 'the async start is caught');
  assert.match(src, /showToast/, 'and reported');
  assert.match(src, /chatNewDmBound/, 'rows are never double-bound');
  // every render of the rows re-binds
  assert.match(fn('chatRenderNewDmResults'), /chatBindNewDmRows/);
  assert.match(fn('chatRenderNewDmPicker'), /chatBindNewDmRows/);
});

test('18. chatStartCoachDm can still create the conversation without the module', () => {
  const src = fn('chatStartCoachDm');
  assert.match(src, /const mod = await chatLoadStateModule\(\)/);
  assert.match(src, /mod\?\.createCoachDmConversationRequestForPlayerId/, 'optional, not destructured');
  assert.match(src, /action: 'create_conv', id: immediateConvId/, 'a faithful fallback request');
  assert.doesNotMatch(src, /const \{ createCoachDmConversationRequestForPlayerId \} = await/, 'the throwing destructure is gone');
});

test('19. SEARCH FIELD — the dialog header and field cannot shrink; only the results list does', () => {
  assert.match(html, /\.chat-newdm-head \{ flex: 0 0 auto; \}/);
  assert.match(html, /\.chat-newdm-search-wrap \{ flex: 0 0 auto;/);
  assert.match(html, /\.chat-newdm-results \{ flex: 1 1 auto; min-height: 0; \}/);
  const css = html.slice(html.indexOf('.chat-newdm-search {'), html.indexOf('.chat-newdm-search:focus'));
  for (const rule of [/min-height: 40px/, /border: 1px solid var\(--line\)/, /background: var\(--panel-2\)/, /color: var\(--ink\)/, /font-size: 14px/, /padding: 10px 12px 10px 34px/, /cursor: text/]) {
    assert.match(css, rule, `search field needs ${rule}`);
  }
  assert.match(html, /\.chat-newdm-search:focus \{ border-color:[^}]*box-shadow:/, 'an obvious focus state');
  assert.match(html, /\.chat-newdm-search \{ min-height: 44px; font-size: 16px; \}/, 'a real touch target, and iOS must not zoom');
  assert.match(fn('chatNewDmPickerHtml'), /data-placeholder="Search players\.\.\."/);
  assert.doesNotMatch(fn('chatNewDmPickerHtml'), /height:38px;line-height:36px/, 'the shrinkable inline box is gone');
});

test('20. the message merge degrades instead of throwing mid-fetch', () => {
  const src = fn('chatMergeMessages');
  assert.match(src, /mod\?\.mergeMessages/);
  assert.match(src, /new Set/, 'de-duplicates by id in the degraded path');
  for (const caller of ['chatFetchMessages', 'chatSendMessage']) {
    assert.doesNotMatch(fn(caller), /const \{ mergeMessages \} = await chatLoadStateModule\(\)/, `${caller} no longer destructures a possibly-null module`);
  }
});

test('21. PRESERVED — the b13978e9 history contract is untouched by this build', () => {
  const fetchSrc = fn('chatFetchMessages');
  assert.match(fetchSrc, /_chatHistoryLoadedAt\[convId\] = Date\.now\(\)/, 'the explicit success marker still exists');
  assert.match(fn('chatNeedsHistory'), /_chatHistoryLoadedAt/, 'retry still keys off the marker, not cache truthiness');
  assert.match(fetchSrc, /if \(!existing\.length\) \{ _chatMessages\[convId\] = fetched; \}/, 'the guarded empty merge stands');
  assert.match(fn('chatStartPolling'), /if \(!_chatLastPoll\[convId\] && _chatHistoryLoadedAt\[convId\]\)/, 'the cursor is still established only by a proven load');
});

test('22. PRESERVED — unread, previews and group/tenant scoping are untouched', () => {
  assert.match(fn('chatUnreadTotal'), /unread/);
  assert.match(fn('chatRowPreviewUnread'), /serverUnread/);
  assert.match(fn('chatDirectoryPlayers'), /state\.operationalGroupId/, 'the picker pool is still group-scoped');
  assert.match(fn('chatStaffDmCandidates'), /groupStaffIds/, 'staff discovery is still group-scoped');
  assert.match(fn('chatStartDmWith'), /if \(!staff\) return showToast\('Member not found'\)/, 'a player still may not compose to a player');
});
