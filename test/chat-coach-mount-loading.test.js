/**
 * COACH MESSAGES LOADING LATCH (CHAT-P3-FIX-1).
 *
 * renderChatShell paints #chatFeed "Loading…" whenever a contact is selected;
 * it clears only when chatRenderMessages runs for the OPEN conversation. The
 * first-mount path drove that off the RAW state.selectedChatId, so a null
 * selection (after an identity-scoped reset) or the 'coach' placeholder left
 * the feed latched — the sync render's raw id was rejected by chatRenderMessages'
 * hard guard (which resolves through chatGetConvId), and the async fetch was
 * gated on the raw id + a cold cache.
 *
 * The fix: renderCoachMessages seeds state.selectedChatId = chatGetConvId('coach')
 * (the SAME canonical resolver the render/poll/refresh already use) before the
 * shell paints, but ONLY while Messages is active and the selection is null or
 * 'coach'. Then the existing first-mount path runs correctly — no new request,
 * no new resolver, guard untouched.
 *
 * Drives the REAL renderCoachMessages + REAL chatGetConvId with a
 * chatRenderMessages / chatStartPolling spy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}

// Run the REAL renderCoachMessages on a FIRST MOUNT (no #chatFeed yet), with the
// given selection / operating group / message cache. Returns the resolved
// selection and the spy calls.
function mountCoach({ selectedChatId, operationalGroupId = 'grp_initial', warm = [], messagesActive = true }) {
  const cache = {};
  for (const id of warm) cache[id] = [{ id: 'm1' }];
  const body =
    '"use strict";\n' +
    'const RENDER = arguments[0], POLL = arguments[1];\n' +
    'const CE_INITIAL_GROUP_ID = "grp_initial";\n' +
    'const state = { selectedChatId: ' + JSON.stringify(selectedChatId) + ', operationalGroupId: ' + JSON.stringify(operationalGroupId) + ',' +
    '  activeView: "coach", activeCoachSection: ' + JSON.stringify(messagesActive ? 'messages' : 'overview') + ' };\n' +
    'const _chatConversations = [];\n' +          // no server 'coach' conversation → placeholder resolves to squad
    'const _chatMessages = ' + JSON.stringify(cache) + ';\n' +
    'let _chatShellRendered = null, _chatFeedPaintedFor = null, _chatMobileOpen = false, _chatPollTimer = null;\n' +
    // First mount: 'coach-messages' exists, 'chatFeed' does NOT (feedExists=false).
    'const el = { set innerHTML(v){ this._html = v; }, get innerHTML(){ return this._html; } };\n' +
    'const document = { getElementById: (id) => id === "coach-messages" ? el : null, querySelector: () => null };\n' +
    // Spied choke points.
    'function chatRenderMessages(convId, mode){ const _open = chatGetConvId(mode); if (String(convId) !== String(_open)) return; RENDER(String(convId), mode); }\n' +
    'function chatStartPolling(id){ POLL(String(id)); }\n' +
    // Harmless stubs for the rest of renderCoachMessages.
    'function renderChatShell(){ return "<shell>"; }\n' +
    'function chatRenderContactList(){}\n' +
    'function chatEnsureGroupChannel(){ return Promise.resolve(); }\n' +
    'function chatEnsureStaffDirectory(){}\n' +
    'function chatLoadStateModule(){ return Promise.resolve(); }\n' +
    'function chatScrollToBottom(){}\n' +
    'function chatMarkRead(){}\n' +
    'function chatFetchConversations(){ return Promise.resolve(); }\n' +
    'function chatFetchMessages(){ return Promise.resolve([]); }\n' +
    fn('chatGetConvId') + '\n' +
    fn('renderCoachMessages') + '\n' +
    'renderCoachMessages();\n' +
    'return { finalSel: state.selectedChatId };\n';
  const calls = { render: [], poll: [] };
  const out = new Function(body)((id, mode) => calls.render.push([id, mode]), (id) => calls.poll.push(id));
  return { finalSel: out.finalSel, render: calls.render, poll: calls.poll };
}

test('TEST 1: null selection + initial group → resolves to "squad", renders, polls', () => {
  const r = mountCoach({ selectedChatId: null, operationalGroupId: 'grp_initial' });
  assert.equal(r.finalSel, 'squad', 'null seeded to the initial-group channel');
  assert.ok(r.render.some(([id]) => id === 'squad'), 'chatRenderMessages called for squad (feed clears)');
  assert.ok(r.poll.includes('squad'), 'polling started for squad');
});

test('TEST 2: null selection + non-initial group → resolves to "group:<gid>", renders', () => {
  const r = mountCoach({ selectedChatId: null, operationalGroupId: 'grp_u18' });
  assert.equal(r.finalSel, 'group:grp_u18', 'null seeded to the operating group channel');
  assert.ok(r.render.some(([id]) => id === 'group:grp_u18'), 'chatRenderMessages called for the group channel');
  assert.ok(r.poll.includes('group:grp_u18'));
});

test('TEST 3: "coach" placeholder + warm squad cache → resolves to "squad", renders', () => {
  const r = mountCoach({ selectedChatId: 'coach', operationalGroupId: 'grp_initial', warm: ['squad'] });
  assert.equal(r.finalSel, 'squad', 'placeholder resolved to the real channel');
  assert.ok(r.render.some(([id]) => id === 'squad'), 'feed painted from the warm cache (no latch)');
});

test('TEST 4: existing "squad" → unchanged, rendered exactly once (warm cache)', () => {
  const r = mountCoach({ selectedChatId: 'squad', operationalGroupId: 'grp_initial', warm: ['squad'] });
  assert.equal(r.finalSel, 'squad', 'a real selection is not touched by the seed');
  const squadRenders = r.render.filter(([id]) => id === 'squad');
  assert.equal(squadRenders.length, 1, 'rendered exactly once (sync from cache; async skipped)');
});

test('TEST 6: Messages NOT active → the seed does not mutate the selection', () => {
  const r = mountCoach({ selectedChatId: null, operationalGroupId: 'grp_initial', messagesActive: false });
  assert.equal(r.finalSel, null, 'no seeding when Messages is not the active section');
});

test('TEST 7: already-canonical group channel → unchanged, renders once', () => {
  const r = mountCoach({ selectedChatId: 'group:grp_u18', operationalGroupId: 'grp_u18', warm: ['group:grp_u18'] });
  assert.equal(r.finalSel, 'group:grp_u18', 'a canonical group selection is preserved');
  assert.equal(r.render.filter(([id]) => id === 'group:grp_u18').length, 1);
});

// ── the seed reuses the canonical resolver and only fires for null/'coach' ────

test('the seed keys off chatGetConvId and only for a null/"coach" selection', () => {
  const src = fn('renderCoachMessages');
  assert.match(src, /!state\.selectedChatId \|\| state\.selectedChatId === 'coach'/, 'guarded to null / coach placeholder only');
  assert.match(src, /state\.selectedChatId = chatGetConvId\('coach'\)/, 'resolves through the canonical chatGetConvId — no new resolver');
  assert.match(src, /_messagesActive && \(!state\.selectedChatId/, 'gated on Messages being active');
});
