/**
 * /api/invite — duplicate request elimination on the Availability cold load.
 *
 * Measured (fixed 3 s window, 400 ms stub latency): twelve concurrent
 * /api/invite requests at ~2.3 s, eleven of them from loadInviteList().
 * renderPlayers() calls it on EVERY render pass as a background sync, and its
 * two <details ontoggle> re-fire on every rebuild; the boot cascade renders
 * eight to ten times inside ~60 ms. There was no cache and no latch, and the
 * panel was captured at request time, so each reply painted a detached node.
 *
 * Pinned here with the REAL extracted function and a fetch the test releases
 * by hand, so the overlap is genuine:
 *   2 concurrent → 1 request · many → 1 · all painted with the same reply into
 *   the panel CURRENTLY in the page · HTTP failure and network failure clear
 *   the latch · the retry is a new request · force never joins · a different
 *   identity or club never shares, and a reply for a context no longer in
 *   force is dropped · write callers force · no cache is introduced.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`\\n(\\s*)(?:async )?function ${name}\\s*\\(`));
  assert.ok(m, `function ${name} not found`);
  const start = m.index + 1;
  let i = src.indexOf('{', src.indexOf(')', start)), depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

function scope() {
  return new Function(`"use strict";
    const calls = [];
    function fetch(url) { return new Promise((resolve, reject) => { calls.push({ url, resolve, reject }); }); }
    const reply = (i, body, ok = true) => calls[i].resolve({ ok, status: ok ? 200 : 500, json: async () => body });
    const fail  = (i) => calls[i].reject(new Error('network down'));
    const tick  = () => new Promise(r => setTimeout(r, 0));
    let _inviteListInFlight = null;
    let USER = { id: 'user_a' }; function currentUser() { return USER; }
    const state = { stateTeamId: 'team_a' };
    let sessions = 0; async function ensureServerSessionForCurrentUser() { sessions++; return true; }
    let panel = { innerHTML: '<p class="muted" style="font-size:13px">Loading…</p>' };
    const document = { getElementById: id => id === 'invite-list-panel' ? panel : null };
    function esc(s) { return String(s); } function inviteGroupName(id) { return id; }
    ${fn('inviteListContextKey')}
    ${fn('loadInviteList')}
    return { calls, reply, fail, tick, loadInviteList,
      panel: () => panel, rebuildPanel: () => { panel = { innerHTML: '<p class="muted" style="font-size:13px">Loading…</p>' }; },
      latch: () => _inviteListInFlight, setUser: u => { USER = u; }, setTeam: t => { state.stateTeamId = t; }, sessions: () => sessions };
  `)();
}
const INVITES = { invites: [{ token: 't1', name: 'Gaetan', role: 'player', status: 'pending', createdAt: '2026-09-01T10:00:00Z' }] };

test('two concurrent render passes share ONE /api/invite request and paint the same reply', async () => {
  const s = scope();
  const a = s.loadInviteList(); s.rebuildPanel(); const b = s.loadInviteList();
  await s.tick();
  assert.equal(s.calls.length, 1, 'one request'); assert.ok(s.latch(), 'latched while in flight');
  s.reply(0, INVITES); await Promise.all([a, b]); await s.tick();
  assert.match(s.panel().innerHTML, /Gaetan/, 'the panel CURRENTLY in the page is painted (not the one captured at request time)');
  assert.equal(s.latch(), null, 'latch cleared on resolve');
});

test('eleven concurrent callers (the measured cascade) still make one request', async () => {
  const s = scope();
  const ps = Array.from({ length: 11 }, () => { s.rebuildPanel(); return s.loadInviteList(); });
  await s.tick(); assert.equal(s.calls.length, 1); assert.equal(s.sessions(), 1, 'the session check runs once too');
  s.reply(0, { invites: [] }); await Promise.all(ps); await s.tick();
  assert.match(s.panel().innerHTML, /No invites yet/);
});

test('an HTTP failure clears the latch, shows the error, and the retry is a NEW request', async () => {
  const s = scope();
  const p = s.loadInviteList(); await s.tick(); s.reply(0, { error: 'nope' }, false); await p;
  assert.match(s.panel().innerHTML, /Could not load invites/); assert.equal(s.latch(), null);
  const q = s.loadInviteList(); await s.tick(); assert.equal(s.calls.length, 2, 'fresh request after a failure');
  s.reply(1, INVITES); await q; assert.match(s.panel().innerHTML, /Gaetan/);
});

test('a network failure clears the latch, shows the error, and the retry is a NEW request', async () => {
  const s = scope();
  const p = s.loadInviteList(); await s.tick(); s.fail(0); await p;
  assert.match(s.panel().innerHTML, /Could not load invites/); assert.equal(s.latch(), null);
  const q = s.loadInviteList(); await s.tick(); assert.equal(s.calls.length, 2);
  s.reply(1, INVITES); await q;
});

test('after a settled request the next call is a new request — no cache is introduced (unchanged)', async () => {
  const s = scope();
  const p = s.loadInviteList(); await s.tick(); s.reply(0, INVITES); await p;
  const q = s.loadInviteList(); await s.tick();
  assert.equal(s.calls.length, 2, 'the invite list is always re-read (as before)');
  assert.match(s.panel().innerHTML, /Loading…/, 'a fresh read shows Loading… first (as before)');
  s.reply(1, INVITES); await q;
});

test('a forced (post-write) call never joins the in-flight request, and the later answer is what stays painted', async () => {
  const s = scope();
  const a = s.loadInviteList(); await s.tick();
  const f = s.loadInviteList(true); await s.tick();
  assert.equal(s.calls.length, 2, 'force is its own request');
  const latchF = s.latch(); assert.ok(latchF, 'the forced request holds the latch');
  s.reply(0, INVITES); await a; await s.tick();    // the older, pre-write answer lands first
  assert.equal(s.latch(), latchF, 'the stale request settling did NOT un-latch the forced one');
  const joiner = s.loadInviteList(); await s.tick();
  assert.equal(s.calls.length, 2, 'a render pass now joins the forced request, not a third one');
  s.reply(1, { invites: [] }); await Promise.all([f, joiner]); await s.tick();
  assert.match(s.panel().innerHTML, /No invites yet/, 'the post-write answer wins');
  assert.equal(s.latch(), null, 'the forced request cleared its own latch');
});

test('a different identity or club never shares, and a reply for a context no longer in force is dropped', async () => {
  const s = scope();
  const a = s.loadInviteList(); await s.tick();
  s.setTeam('team_b');                              // club switched while the request is out
  const b = s.loadInviteList(); await s.tick();
  assert.equal(s.calls.length, 2, 'another club → its own request');
  s.reply(1, { invites: [] }); await b; await s.tick();
  assert.match(s.panel().innerHTML, /No invites yet/, 'club B painted');
  s.reply(0, INVITES); await a; await s.tick();
  assert.doesNotMatch(s.panel().innerHTML, /Gaetan/, "club A's late reply is never painted over club B");
  s.setUser({ id: 'user_c' });
  const c = s.loadInviteList(); await s.tick();
  assert.equal(s.calls.length, 3, 'another identity → its own request');
  s.reply(2, INVITES); await c;
});

test('render-driven callers share; every write path and the Refresh button force', () => {
  assert.match(fn('renderPlayers'), /if \(isCoach\(\)\) loadInviteList\(\)\.catch/, 'the per-render background sync joins the in-flight request');
  assert.equal((fn('renderPlayers').match(/ontoggle="if\(this\.open\) loadInviteList\(\)"/g) || []).length, 2, 'both <details> toggles join it');
  assert.match(fn('renderPlayers'), /onclick="loadInviteList\(true\)">↺ Refresh/, 'Refresh forces');
  assert.match(fn('revokeInvite'), /loadInviteList\(true\)/, 'revoke forces');
  assert.equal((src.match(/loadInviteList\(true\)/g) || []).length, 3, 'Refresh, create and revoke — exactly the write paths');
});
