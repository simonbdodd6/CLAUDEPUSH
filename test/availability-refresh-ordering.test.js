/**
 * LIVE BOARD READS APPLY IN ORDER — an older reply never overwrites a newer one.
 *
 * P3 from the U18 availability audit (R2), reproduced against the real
 * handlers: refreshLiveAvailability applied replies in ARRIVAL order. A poll
 * tick that left before a player's change, delivered after the Live Sync that
 * showed the change, painted the old answer back until the next tick.
 *
 * Every read now takes a sequence number when it leaves; a reply applies only
 * when no NEWER read has already applied, and only for the context (club in
 * force + group) it was asked for. A stale reply is ignored COMPLETELY: no
 * map, no stamp, no roster patch, no chip, no failure flag, no render. A read
 * that fails applies nothing and does not become "the newest applied", so an
 * older valid result arriving after a failed newer read still applies — the
 * failure semantics the board already had. Coalesced callers share one read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
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

// ── The board, with every reply under the test's control ──────────────────
// fetch() returns a deferred per call; the test delivers them in any order
// with deliver(n, payload) / fail(n). Everything else is the real code.
function board({ group = 'grp_a', club = 'club-a', players = [{ id: 'p1', userId: 'u1', name: 'P One' }, { id: 'p2', userId: 'u2', name: 'P Two' }] } = {}) {
  return new Function(`"use strict";
    const CFG = arguments[0];
    const state = { activeView: 'coach', activeCoachSection: 'message', operationalGroupId: CFG.group, currentUserId: 'coach_me',
                    players: CFG.players, users: [], availabilityPending: {} };
    let _clubContextId = CFG.club;
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null, _availLastSync = null, _availReadFailed = false;
    let _liveAvailabilityInFlight = null, _availRefreshInFlight = null;
    let _availabilityReadSeq = 0, _availabilityAppliedSeq = 0;
    let _availFlushInFlight = false;
    let renders = 0, saves = 0, flushes = 0, retries = 0;
    const deferred = [], urls = [];
    function fetch(url) { urls.push(url); return new Promise((resolve, reject) => { deferred.push({ resolve, reject }); }); }
    const chip = { textContent: '', className: '' };
    const document = { getElementById: id => id === 'avail-refresh-ts' ? chip : null };
    const console = { warn() {} };
    function ensureCoachRosterIdentityLinked() { return Promise.resolve(); }
    function operationalGroups() { return [{ id: CFG.group }]; }
    function operationalPlayers() { return state.players; }
    function saveState() { saves++; }
    function renderMessageCenter() { renders++; }
    function renderCoachOverview() {} function coachSectionActive() { return false; }
    function renderAudiencePicker() {} function renderPushStatusCard() {} function loadLiveSchedules() {} function loadLiveTemplates() {} function loadLiveLog() {}
    function availabilityFlushPending() { flushes++; return Promise.resolve(0); }
    function playerAvailRetryNow() { retries++; }
    ${fn('sessionKey')} ${fn('sessionReasonKey')} ${fn('normalizeSessionId')} ${fn('liveAvailabilityPlayerKeys')}
    ${fn('availabilityPendingFor')} ${fn('availabilitySessionIdForKey')} ${fn('availabilityDropStaleLocalAnswers')}
    ${fn('currentResolvedAvailability')} ${fn('availabilitySetReadFailed')} ${fn('availabilityLastReadFailed')}
    ${fn('resolvedAnswerFor')} ${fn('sessionRows')}
    ${fn('refreshLiveAvailability')} ${fn('availRefreshNow')} ${fn('refreshAvailabilityOnReturn')}
    return {
      refresh: opts => refreshLiveAvailability(opts), liveSync: () => availRefreshNow(), onReturn: () => refreshAvailabilityOnReturn(),
      // Build 111: an automatic caller now JOINS the read in flight, so two reads for one group are only
      // out together when (a) the second is an explicit "Sync now" (manual), or (b) the latch has moved on
      // to another group's read and back (A → B → A). detach() stands for (b).
      manual: () => refreshLiveAvailability({ manual: true }), detach: () => { _liveAvailabilityInFlight = null; },
      deliver: (n, resolved) => deferred[n].resolve({ ok: true, json: async () => ({ resolved }) }),
      fail:    n => deferred[n].resolve({ ok: false, status: 500, json: async () => ({}) }),
      reads: () => deferred.length, urls: () => urls,
      row: (name, sid) => { const r = (sessionRows(sid) || []).find(x => x.player.name === name); return r ? r.status : 'ROW-MISSING'; },
      snapshot: () => JSON.stringify({ map: _resolvedAvailability, group: _resolvedAvailabilityGroup, sync: _availLastSync, failed: _availReadFailed,
                                       players: state.players, renders, saves, chip: { ...chip }, applied: _availabilityAppliedSeq }),
      state, set: (k, v) => { if (k === 'group') state.operationalGroupId = v; if (k === 'club') _clubContextId = v; },
      counts: () => ({ renders, saves, flushes, retries, readSeq: _availabilityReadSeq, applied: _availabilityAppliedSeq, sync: _availLastSync, failed: _availReadFailed, group: _resolvedAvailabilityGroup, chip: chip.textContent }),
    };
  `)({ group, club, players });
}
const SID = 'slot_a-20260929';
const ANS = (u1, u2) => ({ ...(u1 ? { u1: { [SID]: { response: u1, reason: '', respondedAt: '2026-09-25T10:00:00.000Z' } } } : {}),
                          ...(u2 ? { u2: { [SID]: { response: u2, reason: '', respondedAt: '2026-09-25T10:00:00.000Z' } } } : {}) });
const tick = () => new Promise(r => setTimeout(r, 15));

test('A. basic out-of-order: R1 leaves, R2 leaves, R2 lands first — R1 landing later is ignored', async () => {
  const b = board();
  const r1 = b.refresh({ boardOnly: true });          // a poll tick
  await tick();
  const r2 = b.manual();                              // an explicit Sync now: asks for itself (Build 111 keeps this)
  await tick();
  assert.equal(b.reads(), 2, 'two reads left');
  b.deliver(1, ANS('unavailable')); await r2; await tick();
  assert.equal(b.row('P One', SID), 'unavailable', 'R2 applied');
  b.deliver(0, ANS('available')); await r1; await tick();
  assert.equal(b.row('P One', SID), 'unavailable', 'R1 (older) did not overwrite R2');
  assert.equal(b.counts().applied, 2);
});

test('B. normal order: R1 lands, then R2 lands — R2 becomes authoritative', async () => {
  const b = board();
  const r1 = b.refresh({ boardOnly: true }); await tick();
  const r2 = b.manual(); await tick();
  b.deliver(0, ANS('available')); await r1; await tick();
  assert.equal(b.row('P One', SID), 'available');
  b.deliver(1, ANS('maybe')); await r2; await tick();
  assert.equal(b.row('P One', SID), 'maybe');
  assert.equal(b.counts().applied, 2);
});

test('C. three reads delivered R2, R1, R3 — R3 is the final authority (R1 never applies)', async () => {
  const b = board();
  const r1 = b.refresh({ boardOnly: true }); await tick();
  b.detach(); const r2 = b.refresh({ skipPanelReload: true }); await tick();   // the latch moved on (A → B → A): its own read
  b.detach(); const r3 = b.refresh(); await tick();                            // and again
  assert.equal(b.reads(), 3);
  b.deliver(1, ANS('maybe')); await r2; await tick();
  assert.equal(b.row('P One', SID), 'maybe');
  const afterR2 = b.snapshot();
  b.deliver(0, ANS('available')); await r1; await tick();
  assert.equal(b.snapshot(), afterR2, 'R1 changed nothing');
  b.deliver(2, ANS('unavailable')); await r3; await tick();
  assert.equal(b.row('P One', SID), 'unavailable');
  assert.equal(b.counts().applied, 3);
});

test('D. oldest last: delivered R3, R2, R1 — R3 only', async () => {
  const b = board();
  const r1 = b.refresh({ boardOnly: true }); await tick();
  b.detach(); const r2 = b.refresh({ skipPanelReload: true }); await tick();
  b.detach(); const r3 = b.refresh(); await tick();
  b.deliver(2, ANS('unavailable')); await r3; await tick();
  const afterR3 = b.snapshot();
  b.deliver(1, ANS('maybe')); await r2; await tick();
  b.deliver(0, ANS('available')); await r1; await tick();
  assert.equal(b.snapshot(), afterR3, 'neither older reply changed anything');
  assert.equal(b.row('P One', SID), 'unavailable');
});

test('E. a stale reply has ZERO side effects: map, stamp, sync time, failure flag, roster fields, chip, render, save', async () => {
  const b = board({ players: [{ id: 'p1', userId: 'u1', name: 'P One', [`avail_${SID}`]: 'available' }] });
  const r1 = b.refresh({ boardOnly: true }); await tick();
  const r2 = b.manual(); await tick();
  b.deliver(1, ANS('unavailable')); await r2; await tick();
  const after = b.snapshot();
  assert.equal(b.state.players[0][`avail_${SID}`], 'unavailable', 'R2 patched the roster field');
  b.deliver(0, ANS('available')); await r1; await tick();
  assert.equal(b.snapshot(), after, 'R1 touched nothing at all');
  assert.equal(b.state.players[0][`avail_${SID}`], 'unavailable');
  // a stale FAILED reply is equally inert: no failure flag, no chip
  const r3 = b.refresh({ boardOnly: true }); await tick();
  const r4 = b.manual(); await tick();
  b.deliver(3, ANS('maybe')); await r4; await tick();
  const after4 = b.snapshot();
  b.fail(2); await r3; await tick();
  assert.equal(b.snapshot(), after4, 'a stale failure neither flags nor repaints');
  assert.equal(b.counts().failed, false);
});

test('F. Live Sync vs poll: the tick leaves first, Live Sync lands first — Live Sync stays authoritative', async () => {
  const b = board();
  const tickRead = b.refresh({ boardOnly: true }); await tick();
  const sync = b.liveSync(); await tick();
  assert.equal(b.reads(), 2, 'Live Sync (full) is not joined to a board-only tick');
  b.deliver(1, ANS('unavailable')); await sync; await tick();
  assert.equal(b.row('P One', SID), 'unavailable');
  assert.match(b.counts().chip, /^Synced/);
  b.deliver(0, ANS('available')); await tickRead; await tick();
  assert.equal(b.row('P One', SID), 'unavailable', 'the late tick did not regress the board');
});

test('G. visibility/focus: returning to the tab joins the read already out (Build 111); an older reply landing later is still ignored', async () => {
  const b = board();
  const older = b.refresh({ boardOnly: true }); await tick();
  b.onReturn(); await tick();
  assert.equal(b.reads(), 1, 'returning to the tab joined the tick already out — one read');
  assert.equal(b.counts().flushes, 1, 'and the pending flush ran, as before');
  b.deliver(0, ANS('maybe')); await older; await tick(); await tick();
  assert.equal(b.row('P One', SID), 'maybe', 'both received the one reply');
  assert.equal(b.counts().renders, 1, 'the return-to-tab refresh repainted once');
  // ordering: an older read still out when the latch has moved on (A → B → A) is still ignored once a newer one applied
  const stale = b.refresh({ boardOnly: true }); await tick();
  b.detach(); b.onReturn(); await tick();
  assert.equal(b.reads(), 3);
  b.deliver(2, ANS('unavailable')); await tick(); await tick();
  assert.equal(b.row('P One', SID), 'unavailable');
  b.deliver(1, ANS('available')); await stale; await tick();
  assert.equal(b.row('P One', SID), 'unavailable', 'the older reply did not regress the board');
});

test('H. context change: a reply for group A (or club A) cannot touch the board once group B (or club B) is in force', async () => {
  const b = board({ group: 'grp_a' });
  const readA = b.refresh({ boardOnly: true }); await tick();
  b.set('group', 'grp_b');
  // A's reply arriving BEFORE any read for B: the context guard alone must stop it.
  b.deliver(0, ANS('available')); await readA; await tick();
  assert.equal(b.counts().group, null, 'nothing stamped for B out of A\'s reply');
  assert.equal(b.counts().applied, 0);
  const readB = b.refresh(); await tick();
  b.deliver(1, ANS('maybe')); await readB; await tick();
  assert.equal(b.counts().group, 'grp_b'); assert.equal(b.row('P One', SID), 'maybe');
  // A club switch mid-flight: the reply for club A is not club B's
  const c = board({ club: 'club-a' });
  const readClubA = c.refresh({ boardOnly: true }); await tick();
  c.set('club', 'club-b');
  c.deliver(0, ANS('available')); await readClubA; await tick();
  assert.equal(c.counts().applied, 0); assert.equal(c.counts().sync, null);
  // …but a context merely becoming KNOWN during boot is not a switch
  const boot = board({ club: '' });
  const first = boot.refresh(); await tick();
  boot.set('club', 'club-a');
  boot.deliver(0, ANS('available')); await first; await tick();
  assert.equal(boot.row('P One', SID), 'available', 'the boot read applied once the club was proven');
});

test('I. a FAILED newer read applies nothing and does not outrank an older valid result (existing failure semantics)', async () => {
  // Current contract, unchanged: a failed read flags the failure and keeps whatever is held; a
  // later successful read clears the flag. A failed read is not "the newest applied", so an
  // older read landing after it still applies — it is the only authoritative data there is.
  const b = board();
  const r1 = b.refresh({ boardOnly: true }); await tick();
  const r2 = b.manual(); await tick();
  b.fail(1); await r2; await tick();
  assert.equal(b.counts().failed, true, 'R2 failed: flagged');
  assert.equal(b.counts().applied, 0, 'and applied nothing');
  b.deliver(0, ANS('available')); await r1; await tick();
  assert.equal(b.row('P One', SID), 'available', 'R1, older but valid, applied');
  assert.equal(b.counts().failed, false, 'and cleared the failure, as a successful read always did');
  assert.equal(b.counts().applied, 1);
  // and once R1 has applied, an even older read (R0 shape) cannot regress it
  const r3 = b.refresh({ boardOnly: true }); await tick();
  const r4 = b.manual(); await tick();
  b.deliver(3, ANS('maybe')); await r4; await tick();
  b.fail(2); await r3; await tick();
  assert.equal(b.row('P One', SID), 'maybe'); assert.equal(b.counts().failed, false, 'a stale failure is inert');
});

test('J. coalesced reads share one request and one sequence; an automatic heavier caller joins too; only Sync now asks for itself', async () => {
  const b = board();
  const t1 = b.refresh({ boardOnly: true }); await tick();
  const t2 = b.refresh({ boardOnly: true }); await tick();
  assert.equal(b.reads(), 1, 'the second tick joined the first — no extra read');
  assert.equal(b.counts().readSeq, 1);
  const full = b.refresh(); await tick();
  assert.equal(b.reads(), 1, 'an automatic full refresh rides the board-only tick (Build 111)');
  b.deliver(0, ANS('available')); await Promise.all([t1, t2, full]); await tick();
  assert.equal(b.row('P One', SID), 'available');
  assert.equal(b.counts().readSeq, 1); assert.equal(b.counts().applied, 1);
  const t3 = b.refresh({ boardOnly: true }); await tick();
  const sync = b.manual(); await tick();
  assert.equal(b.reads(), 3, 'an explicit Sync now still asks for itself');
  b.deliver(1, ANS('maybe')); await t3; b.deliver(2, ANS('unavailable')); await sync; await tick();
  assert.equal(b.row('P One', SID), 'unavailable');
  assert.equal(b.counts().readSeq, 3); assert.equal(b.counts().applied, 3);
});

test('SOURCE. the guard sits before the failure branch and every mutation; the bump after it; the sequence taken as the read leaves', () => {
  const body = fn('refreshLiveAvailability');
  const at = s => { const i = body.indexOf(s); assert.ok(i >= 0, 'missing: ' + s); return i; };
  assert.ok(at("++_availabilityReadSeq") < at("await fetch('/api/availability?resolveRoster=1'"), 'sequence taken before the request leaves');
  assert.ok(at('if (readSeq <= _appliedSeq) return;') < at('if (!reply) {'), 'order guard before the failure branch');
  assert.ok(at('if (_ctxLeft()) return;') < at('if (!reply) {'), 'context guard before the failure branch');
  assert.ok(at('if (!reply) {') < at('_availabilityAppliedSeq = readSeq'), 'the bump happens only on the success path');
  assert.ok(at('_availabilityAppliedSeq = readSeq') < at('_resolvedAvailability = resolved;'), 'and before the map is replaced');
  assert.match(body, /_ctxAtStart\.club && c\.club !== _ctxAtStart\.club/, 'club: a change between two known values');
  assert.match(body, /_ctxAtStart\.group && c\.group !== _ctxAtStart\.group/, 'group: likewise');
  assert.match(fn('availRefreshNow'), /\.then\(\(\) => refreshLiveAvailability\(\{ manual: true \}\)\)/, 'Live Sync asks for itself (Build 111)');
});

// ═══════════════════════════════════════════════════════════════════════════
// THE REAL APP — R2 adversarially: hold an older reply, land a newer one, release the old
// ═══════════════════════════════════════════════════════════════════════════
process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.refresh-ordering.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
process.env.PUBLIC_CLUB_SIGNUP       = 'true';
delete process.env.VERCEL; delete process.env.NODE_ENV;
const kv = new Map(), lists = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [cmd, ...a] = JSON.parse(options.body || '[]');
  let result = null;
  if (cmd === 'GET') result = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (cmd === 'SET') { if (a.includes('NX') && kv.has(a[0])) result = null; else { kv.set(a[0], a[1]); result = 'OK'; } }
  if (cmd === 'DEL') { result = kv.delete(a[0]) ? 1 : 0; }
  if (cmd === 'SCAN' || cmd === 'KEYS') {
    const glob = cmd === 'SCAN' ? String(a[a.indexOf('MATCH') + 1] ?? '*') : String(a[0] ?? '*');
    const re = new RegExp('^' + glob.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const matching = [...kv.keys()].filter(k => re.test(k));
    result = cmd === 'SCAN' ? ['0', matching] : matching;
  }
  if (cmd === 'LPUSH') { const l = lists.get(a[0]) || []; l.unshift(a[1]); lists.set(a[0], l); result = l.length; }
  if (cmd === 'LRANGE') result = (lists.get(a[0]) || []).slice(Number(a[1]), Number(a[2]) + 1);
  if (cmd === 'LTRIM' || cmd === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};
const S  = await import('../api/_identityStore.js');
const ST = await import('../api/_structureStore.js');
const AV = await import('../api/_availabilityStore.js');
const handlers = {};
for (const name of ['identity', 'invite', 'config', 'publish', 'availability', 'chat', 'push', 'schedules', 'templates', 'subscribe']) {
  handlers[name] = (await import(`../api/${name}.js`)).default;
}
let chromium = null, devices = null;
try { ({ chromium, devices } = await import('playwright')); } catch { /* not installed */ }
const PW = 'password123';
let seq = 0; const kkey = () => String(seq++).padStart(2, '0').repeat(10);
const NET = { rules: [] };   // { method, path, query, holdResponse: Promise, times }
const mime = f => f.endsWith('.html') ? 'text/html' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).split('/')[0];
    let raw = ''; for await (const c of req) raw += c;
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    let holdResp = null;
    for (const rule of NET.rules) {
      if (rule.times <= 0 || (rule.method && rule.method !== req.method) || (rule.path && !url.pathname.includes(rule.path)) || (rule.query && !url.search.includes(rule.query))) continue;
      rule.times--; holdResp = rule.holdResponse || null;
    }
    const vreq = { method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' }, query: Object.fromEntries(url.searchParams), body, url: req.url, on() {} };
    const vres = { statusCode: 200,
      status(c) { this.statusCode = c; return this; }, setHeader(k, v) { res.setHeader(k, v); }, getHeader(k) { return res.getHeader(k); },
      writeHead(c, h) { res.writeHead(c, h); return this; }, write(d) { res.write(d); },
      // The reply is COMPUTED now and delivered when the hold releases — genuinely old data landing late.
      json(d) { const send = () => { res.statusCode = this.statusCode; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); }; if (holdResp) holdResp.then(send); else send(); },
      end(d) { res.statusCode = this.statusCode; res.end(d); }, send(d) { this.end(typeof d === 'string' ? d : JSON.stringify(d)); } };
    const h = handlers[name];
    if (!h) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    try { await h(vreq, vres); } catch { res.statusCode = 500; res.end('{}'); }
    return;
  }
  const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  try { res.setHeader('content-type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end(); }
});
const waitFor = async (fnc, ms, every = 60) => { const t0 = Date.now(); for (;;) { const v = await fnc(); if (v) return { ok: true, ms: Date.now() - t0, v }; if (Date.now() - t0 > ms) return { ok: false, ms: Date.now() - t0, v }; await new Promise(r => setTimeout(r, every)); } };

test('browser: an older board reply released after a newer one never regresses the board — Live Sync, polling, return-to-tab and a group switch intact', async (t) => {
  if (!chromium) return t.skip('playwright not installed');
  let browser;
  try { browser = await chromium.launch(); } catch { return t.skip('no browser available'); }
  const ctxs = [];
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const BASE = `http://127.0.0.1:${server.address().port}`;
    const club = await S.createClub({ clubName: 'Order RFC', teamName: 'First XV', sport: 'Rugby', name: 'Olga Coach', email: 'coach@order.test', password: PW, idempotencyKey: kkey() });
    const { group: U18 } = await ST.createGroup(club.team.id, { name: 'U18', developmentCategory: 'youth_u18' });
    const teamCode = (await S.loadStoredTeams()).find(x => x.id === club.team.id).teamCode;
    const p1 = await S.createJoinRequest({ teamCode, firstName: 'Ugo', lastName: 'Uno', email: 'ugo@order.test', password: PW });
    await S.approveJoinRequest(p1.teamMember.id, club.user.id, club.team.id);
    const members = await S.loadTeamMembers();
    for (const m of members) if (m.teamId === club.team.id && m.userId === p1.user.id) m.playerGroupId = U18.id;
    await S.saveTeamMembers(members);
    const login = async (page, email) => {
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#ce-welcome', { timeout: 20000 });
      await page.click('#ce-welcome button:has-text("Log in")');
      await page.waitForSelector('#identityLoginEmail', { state: 'visible', timeout: 10000 });
      await page.fill('#identityLoginEmail', email); await page.fill('#identityLoginPassword', PW); await page.click('#identityLoginBtn');
      await page.waitForFunction(() => typeof state !== 'undefined' && !!state.stateTeamId && !!state.currentUserId, null, { timeout: 20000 });
    };
    const coachCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); ctxs.push(coachCtx);
    const coach = await coachCtx.newPage(); const errors = []; coach.on('pageerror', e => errors.push('coach: ' + e.message));
    await login(coach, 'coach@order.test');
    assert.equal(await coach.evaluate(async gid => (await fetch('/api/publish?resource=training-schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', group: gid, slot: { day: 'Tue', startTime: '19:00', venue: 'U18 pitch', active: true } }) })).status, U18.id), 200);
    await coach.evaluate(gid => { setOperationalGroup(gid); setSection('coach', 'message'); }, U18.id);
    await coach.waitForFunction(gid => state.activeCoachSection === 'message' && state.operationalGroupId === gid, U18.id, { timeout: 20000 });
    // The coach's U18 training schedule loads asynchronously after the group
    // switch (the switch drops the previous group's schedule). Wait for the
    // training occurrence itself instead of reading the week once — under a
    // loaded full suite the schedule could land after that single read.
    await coach.waitForFunction(() => coachAvailEvents().some(e => e.type === 'training'), null, { timeout: 20000 });
    const EV = await coach.evaluate(() => coachAvailEvents().find(e => e.type === 'training')?.id);
    assert.ok(EV);
    const playerCtx = await browser.newContext({ ...devices['Pixel 5'], serviceWorkers: 'block' }); ctxs.push(playerCtx);
    const player = await playerCtx.newPage(); player.on('pageerror', e => errors.push('player: ' + e.message));
    await login(player, 'ugo@order.test');
    await player.evaluate(() => setSection('player', 'availability'));
    await waitFor(() => player.evaluate(() => typeof _playerAvailKnown !== 'undefined' && _playerAvailKnown && !!(_trainingSchedule && _trainingSchedule.slots)), 15000);
    const row = () => coach.evaluate(id => { const r = (sessionRows(id) || []).find(x => x.player?.name === 'Ugo Uno'); return r ? r.status : 'ROW-MISSING'; }, EV);
    const settled = () => waitFor(() => player.evaluate(id => !(state.availabilityPending && state.availabilityPending[id]), EV), 10000);
    const tap = (status, reason = '') => player.evaluate(([id, st, rs]) => { setPlayerAvailability(sessionKey(id), st, rs); return true; }, [EV, status, reason]);
    const serverHas = async () => Object.values(await AV.loadGroupAvailability(club.team.id, U18.id, EV)).find(v => v && v.userId === p1.user.id)?.response || 'none';

    // 1. a first answer, seen by the board
    await tap('maybe'); await settled();
    assert.ok((await waitFor(async () => (await row()) === 'maybe', 15000)).ok, 'board shows maybe');
    // 2–3. an OLDER read (a poll tick) whose reply is computed NOW and held
    let release; const hold = new Promise(r => { release = r; });
    NET.rules.push({ method: 'GET', path: '/api/availability', query: 'resolveRoster', holdResponse: hold, times: 1 });
    const older = coach.evaluate(() => refreshLiveAvailability({ boardOnly: true }));     // its reply says 'maybe' and is held
    await new Promise(r => setTimeout(r, 150));
    await tap('unavailable', 'work'); await settled();
    assert.equal(await serverHas(), 'unavailable');
    // 4. the NEWER read: Live Sync (full weight, not joined to the held tick) applies the change
    await coach.evaluate(() => availRefreshNow());
    assert.equal(await row(), 'unavailable', 'Live Sync applied the newer state');
    const syncBefore = await coach.evaluate(() => _availLastSync);
    // 5–6. release the older reply: the board must not regress, nothing must move
    release(); await older; await new Promise(r => setTimeout(r, 250));
    assert.equal(await row(), 'unavailable', 'the older reply did not regress the board (the audit\'s R2)');
    assert.equal(await coach.evaluate(() => _availLastSync), syncBefore, 'a stale reply does not even stamp a sync time');
    assert.equal(await coach.evaluate(() => (document.getElementById('avail-refresh-ts')?.textContent || '')).then(s => /^Synced/.test(s)), true);
    // return to the tab: a fresh full read, still correct
    await coach.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await waitFor(() => coach.evaluate(s => _availLastSync !== s, syncBefore), 10000);
    assert.equal(await row(), 'unavailable');
    // normal polling keeps working: a further change arrives by itself
    await tap('available'); await settled();
    assert.ok((await waitFor(async () => (await row()) === 'available', 15000)).ok, 'the 5 s poll still updates the board');
    // a group switch while a U18 reply is held: Seniors' board never receives it
    let release2; const hold2 = new Promise(r => { release2 = r; });
    NET.rules.push({ method: 'GET', path: '/api/availability', query: 'group=' + encodeURIComponent(U18.id), holdResponse: hold2, times: 1 });
    const heldU18 = coach.evaluate(() => refreshLiveAvailability({ boardOnly: true }));
    await new Promise(r => setTimeout(r, 150));
    await coach.evaluate(() => { setOperationalGroup('grp_initial'); setSection('coach', 'message'); });
    await waitFor(() => coach.evaluate(() => _resolvedAvailabilityGroup === 'grp_initial'), 15000);
    release2(); await heldU18; await new Promise(r => setTimeout(r, 250));
    assert.equal(await coach.evaluate(() => _resolvedAvailabilityGroup), 'grp_initial', 'the late U18 reply did not re-stamp the Seniors board');
    assert.equal(await coach.evaluate(id => Object.keys(_resolvedAvailability).includes(id.toLowerCase()), p1.user.id), false, 'and carried no U18 answer into it');
    await coach.evaluate(gid => { setOperationalGroup(gid); setSection('coach', 'message'); }, U18.id);
    assert.ok((await waitFor(async () => (await row()) === 'available', 15000)).ok, 'switching back reads U18 fresh');
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    for (const ctx of ctxs) { try { await ctx.close(); } catch {} }
    await browser.close(); await new Promise(r => server.close(r));
  }
});
