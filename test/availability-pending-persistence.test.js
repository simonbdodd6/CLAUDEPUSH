/**
 * AVAILABILITY PENDING PERSISTENCE (AVAILABILITY-PENDING-1).
 *
 * PRODUCTION DEFECT (forensically confirmed, 15–16 Sep 2026): a player taps
 * Available, the POST fails at the transport layer, and the app says
 * "Availability saved" anyway. The optimistic local write stood (the catch was
 * empty), sessionRows fell back to it, mergeServerAvailabilityIntoRecord
 * refused to overwrite it, and nothing ever retried — so the player's device
 * asserted an answer, complete with a timestamp, that the server had never
 * received, while the coach board correctly showed No reply. 24 such transport
 * failures were logged in two days.
 *
 * THE MODEL, deliberately small and on the existing persisted state:
 *   CONFIRMED  the server answered 2xx
 *   PENDING    state.availabilityPending[sessionId] — chosen here, not sent
 *   NO ANSWER  neither
 *
 * Keyed by the CANONICAL session id the POST needs, one entry per session
 * (latest choice wins, never a queue of stale ones), stamped with the account
 * that chose it. Retried on reconnect, on return to the app and at boot.
 *
 * Every test drives the REAL functions extracted from index.html.
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
const decl = re => { const m = html.match(re); if (!m) throw new Error('declaration not found: ' + re); return m[0]; };

const ME = 'user_me';
const SESSION = 'slot_tue-20260915';       // the canonical current-week occurrence
const KEY = 'avail_' + SESSION;

/**
 * One device. `script` is consumed one entry per POST and the last entry
 * repeats: 'ok' | 'offline' | 'server-error' | 'expired' | 'refused'.
 */
function device({ script = ['ok'], pending = {}, resolved = {}, currentUserId = ME } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    const ME = CFG.me, SESSION = CFG.session;
    const PLAYER = { id: ME, userId: ME, name: 'Me', lifecycleStatus: 'active', history: [] };
    const OTHER  = { id: 'user_other', userId: 'user_other', name: 'Other', lifecycleStatus: 'active', history: [] };
    let state = { players: [PLAYER, OTHER], users: [], currentUserId: CFG.currentUserId,
                  messages: [], masterFeed: [], availabilityPending: CFG.pending };
    let _resolvedAvailability = CFG.resolved;
    let _availReasonOpenByKey = {};
    let _availAuthPromptedAt = 0;
    let toasts = [], saves = [], renders = 0, posts = [], step = 0, authPrompts = 0;
    function showToast(t){ toasts.push(t); }
    function saveState(l){ saves.push(l || ''); }
    function render(){ renders++; }
    function getPlayer(){ return PLAYER; }
    function operationalPlayers(){ return state.players; }
    function playerIsArchived(){ return false; }
    function findLiveAvailabilityRecords(players, p){ return (players||[]).filter(x => x !== p && x.id === p.id); }
    function sessionKey(id){ return 'avail_' + id; }
    function sessionReasonKey(id){ return 'avail_' + id + 'Reason'; }
    function keyToSessionId(k){ return String(k).replace(/^avail_/, ''); }
    function normalizeSessionId(id){ return String(id); }
    function liveAvailabilityPlayerKeys(p){ return [String(p.userId || p.id)]; }
    function sessionTitle(){ return 'Tuesday training'; }
    function statusLabel(s){ return s; }
    function availDayLabel(){ return '15 Sep'; }
    function addMasterFeed(){}
    function upsertAvailabilityResponseMessage(){}
    function checkServerSession(){ authPrompts++; return Promise.resolve(); }
    function setAuthTab(){}
    const REASON_LABELS = { injury:'Injury', work:'Work', holiday:'Holiday', family:'Family', other:'Other' };
    ${decl(/const AVAIL_PENDING_MAX = \d+;[^\n]*/)}
    ${decl(/const AVAIL_RESPONSES = \[[^\]]*\];/)}
    async function fetch(url, opts){
      const b = JSON.parse(opts.body); posts.push(b);
      const mode = CFG.script[Math.min(step, CFG.script.length - 1)]; step++;
      if (mode === 'offline') throw new TypeError('Load failed');
      if (mode === 'server-error') return { ok:false, status:503, json: async()=>({}) };
      if (mode === 'expired')     return { ok:false, status:401, json: async()=>({}) };
      if (mode === 'refused')     return { ok:false, status:400, json: async()=>({}) };
      return { ok:true, status:200, json: async()=>({ ok:true }) };
    }
    ${fn('normalizeAvailabilityPending')}
    ${fn('availabilityMarkPending')}
    ${fn('availabilityClearPending')}
    ${fn('availabilityPendingFor')}
    ${fn('availabilityApplyToRecord')}
    ${fn('captureAvailabilityFields')}
    ${fn('resolvedAnswerFor')}
    ${fn('sessionRows')}
    ${fn('availabilityCardModel')}
    ${fn('saveAvailabilityResponseToServer')}
    ${fn('availabilityFlushPending')}
    ${decl(/let _availFlushInFlight = false;/)}
    ${fn('setPlayerAvailability')}
    return {
      get state(){ return state; }, PLAYER, OTHER,
      tap: setPlayerAvailability, save: saveAvailabilityResponseToServer, flush: availabilityFlushPending,
      rows: sessionRows, card: s => availabilityCardModel(PLAYER, s),
      pendingStore: () => state.availabilityPending,
      pendingFor: availabilityPendingFor, normalize: normalizeAvailabilityPending,
      toasts: () => toasts, posts: () => posts, saves: () => saves, renders: () => renders,
      localField: () => PLAYER[sessionKey(SESSION)],
      setResolved: r => { _resolvedAvailability = r; },
    };
  `;
  return new Function(body)({ script, pending, resolved, me: ME, session: SESSION, currentUserId });
}
const SESSION_OBJ = { id: SESSION, title: 'Training', date: '2026-09-15' };

// ── 1. SUCCESS ─────────────────────────────────────────────────────────────
test('1. a successful submission is awaited, confirmed, and leaves nothing pending', async () => {
  const d = device({ script: ['ok'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.posts().length, 1, 'exactly one POST');
  const { intentAt, intentSeq, ...sent } = d.posts()[0];
  assert.deepEqual(sent, { response: 'available', reason: '', sessionId: SESSION }, 'canonical session id');
  // The intent stamp: the moment the answer was chosen, ordered within the millisecond.
  assert.match(String(intentAt), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'the POST carries the intent instant');
  assert.equal(intentSeq, 0);
  assert.deepEqual(d.pendingStore(), {}, 'nothing left pending');
  assert.ok(d.toasts().includes('Availability saved'), 'the normal success feedback: ' + JSON.stringify(d.toasts()));
  assert.equal(d.localField(), 'available');
  assert.equal(d.card(SESSION_OBJ).pending, false, 'the card does not claim pending');
  // and the coach, reading the server, sees it
  d.setResolved({ [ME]: { [SESSION]: { response: 'available', respondedAt: '2026-09-15T08:00:00Z' } } });
  const row = d.rows(SESSION).find(r => r.player.id === ME);
  assert.equal(row.status, 'available');
  assert.equal(row.confirmed, true);
  assert.equal(row.pending, false);
});

test('1b. the POST is genuinely awaited — success is never announced before the server answers', async () => {
  const src = fn('setPlayerAvailability');
  assert.match(src, /^\s*async function setPlayerAvailability/, 'the handler is async');
  assert.match(src, /const outcome = await _savePromise/, 'and it waits for the result');
  const toastAt = src.indexOf('"Availability saved"');
  const awaitAt = src.indexOf('await _savePromise');
  assert.ok(awaitAt > 0 && toastAt > awaitAt, 'the success toast is emitted only after the await');
});

// ── 2. NETWORK FAILURE ─────────────────────────────────────────────────────
test('2. a transport failure is never reported as saved, and the answer is held as pending', async () => {
  const d = device({ script: ['offline'] });
  await d.tap(KEY, 'available', '');
  assert.equal(d.toasts().some(t => /Availability saved/.test(t)), false, 'it must NOT say saved');
  assert.ok(d.toasts().some(t => /Not sent yet/i.test(t)), 'it says so plainly: ' + JSON.stringify(d.toasts()));
  const entry = d.pendingStore()[SESSION];
  assert.ok(entry, 'the answer is held');
  assert.equal(entry.response, 'available');
  assert.equal(entry.owner, ME, 'stamped with the account that chose it');
  assert.equal(d.localField(), 'available', "the player's own choice is still on screen");
  assert.equal(d.card(SESSION_OBJ).pending, true, 'and the card marks it as not sent');
});

test('2b. the server holds nothing, so the coach board still reads No reply', async () => {
  const d = device({ script: ['offline'] });
  await d.tap(KEY, 'available', '');
  const mine = d.rows(SESSION).find(r => r.player.id === ME);
  assert.equal(mine.confirmed, false, 'a pending answer is NEVER confirmed');
  assert.equal(mine.pending, true);
  // the coach's own device: same session, but the pending entry is not theirs
  const coach = device({ script: ['ok'], currentUserId: 'user_coach', pending: d.pendingStore() });
  const asCoach = coach.rows(SESSION).find(r => r.player.id === ME);
  assert.equal(asCoach.status, 'no-reply', 'the coach sees no reply');
  assert.equal(asCoach.confirmed, false);
  assert.equal(asCoach.pending, false, "another account's unsent answer is invisible here");
});

test('2c. a 5xx is treated as retryable, a 4xx refusal is not', async () => {
  const srv = device({ script: ['server-error'] });
  await srv.tap(KEY, 'available', '');
  assert.ok(srv.pendingStore()[SESSION], '503 stays pending');
  assert.ok(srv.toasts().some(t => /Not sent yet/i.test(t)));
  const bad = device({ script: ['refused'] });
  await bad.tap(KEY, 'available', '');
  assert.equal(bad.pendingStore()[SESSION], undefined, 'a 400 will never succeed on retry, so it is not held');
  assert.equal(bad.toasts().some(t => /Availability saved/.test(t)), false);
  assert.ok(bad.toasts().some(t => /Couldn't save/.test(t)));
});

// ── 3. RELOAD ──────────────────────────────────────────────────────────────
test('3. a pending answer survives a reload AS PENDING — reloading never confirms it', async () => {
  const first = device({ script: ['offline'] });
  await first.tap(KEY, 'available', '');
  const persisted = JSON.parse(JSON.stringify(first.pendingStore()));    // what localStorage would hold
  // reload: fresh app, normalizeState restores the store, the server still has nothing
  const reloaded = device({ script: ['offline'], pending: persisted });
  reloaded.PLAYER[KEY] = 'available';                                    // the persisted optimistic field
  const restored = reloaded.normalize(persisted);
  assert.deepEqual(Object.keys(restored), [SESSION], 'the pending entry is restored');
  assert.equal(restored[SESSION].response, 'available');
  const card = reloaded.card(SESSION_OBJ);
  assert.equal(card.status, 'available', "the player still sees their own choice");
  assert.equal(card.pending, true, 'still marked not sent — a reload confirms nothing');
  const row = reloaded.rows(SESSION).find(r => r.player.id === ME);
  assert.equal(row.confirmed, false, 'and it is still not a confirmed answer');
});

// ── 4/5. RETRY ─────────────────────────────────────────────────────────────
test('4. a successful retry sends the held answer, promotes it, and clears the pending state', async () => {
  const d = device({ script: ['offline', 'ok'] });
  await d.tap(KEY, 'available', '');
  assert.ok(d.pendingStore()[SESSION], 'held after the failure');
  const sent = await d.flush();
  assert.equal(sent, 1);
  const { intentAt: retryAt, intentSeq: retrySeq, ...retried } = d.posts()[1];
  assert.deepEqual(retried, { response: 'available', reason: '', sessionId: SESSION }, 'retried against the exact canonical session');
  // The retry is the SAME intent, not a re-stamped copy: a re-stamp could outrank an answer the player has since given elsewhere.
  assert.equal(retryAt, d.posts()[0].intentAt, 'the retry carries the original intent instant');
  assert.equal(retrySeq, d.posts()[0].intentSeq);
  assert.deepEqual(d.pendingStore(), {}, 'pending cleared only by the 2xx');
  assert.ok(d.toasts().some(t => /now been sent/i.test(t)));
  assert.equal(d.card(SESSION_OBJ).pending, false);
});

test('5. a failed retry keeps the answer pending and claims nothing', async () => {
  const d = device({ script: ['offline', 'offline'] });
  await d.tap(KEY, 'available', '');
  const sent = await d.flush();
  assert.equal(sent, 0);
  assert.ok(d.pendingStore()[SESSION], 'still held');
  assert.equal(d.toasts().some(t => /now been sent|Availability saved/i.test(t)), false, 'no false success');
});

test('5b. the retry is bounded — it stops at the first answer still unreachable', async () => {
  const d = device({ script: ['offline'] });
  await d.tap(KEY, 'available', '');
  await d.tap('avail_slot_thu-20260917', 'maybe', '');
  assert.equal(Object.keys(d.pendingStore()).length, 2);
  const before = d.posts().length;
  await d.flush();
  assert.equal(d.posts().length - before, 1, 'one attempt, then it stops — no retry storm');
});

// ── 6/7. WHEN THE RETRY RUNS ───────────────────────────────────────────────
test('6. reconnecting retries: the online event is wired to the flush', () => {
  assert.match(html, /window\.addEventListener\('online',\s*\(\)\s*=>\s*\{\s*availabilityFlushPending\(\)/,
    'the browser\'s connectivity signal drives the retry');
  assert.match(fn('refreshAvailabilityOnReturn'), /availabilityFlushPending\(\)/,
    'returning to the app retries too');
  assert.doesNotMatch(fn('availabilityFlushPending'), /setInterval|setTimeout/, 'no polling, no timers');
});

test('7. opening the app retries once, and only once', () => {
  const boot = html.slice(html.indexOf("window.addEventListener('focus', refreshAvailabilityOnReturn);"));
  assert.match(boot.slice(0, 400), /availabilityFlushPending\(\)\.catch\(\(\) => \{\}\);/, 'flushed at boot');
  assert.match(fn('availabilityFlushPending'), /if \(_availFlushInFlight\) return 0;/, 'never runs twice at once');
});

// ── 8. SESSION EXPIRY — unchanged ──────────────────────────────────────────
test('8. 401/403 still reverts the optimistic write, tells the player, and does NOT queue a retry', async () => {
  const d = device({ script: ['expired'] });
  d.PLAYER[KEY] = 'unavailable';
  d.PLAYER[KEY + 'Reason'] = 'injury';
  await d.tap(KEY, 'available', '');
  assert.equal(d.localField(), 'unavailable', 'the prior answer is restored');
  assert.equal(d.PLAYER[KEY + 'Reason'], 'injury');
  assert.ok(d.toasts().some(t => /not saved/i.test(t)), 'the player is told honestly');
  assert.equal(d.toasts().some(t => /Availability saved|Not sent yet/i.test(t)), false, 'and not told anything else');
  assert.deepEqual(d.pendingStore(), {}, 'a refused write is not retryable, so it is not held');
});

// ── 9. LATEST CHOICE ───────────────────────────────────────────────────────
test('9. changing the answer while offline replaces the held one — a retry can never resurrect the stale choice', async () => {
  const d = device({ script: ['offline', 'offline', 'ok'] });
  await d.tap(KEY, 'available', '');
  await d.tap(KEY, 'maybe', 'work');
  assert.equal(Object.keys(d.pendingStore()).length, 1, 'one entry per session, never a queue');
  assert.equal(d.pendingStore()[SESSION].response, 'maybe', 'the latest choice');
  await d.flush();
  const last = d.posts()[d.posts().length - 1];
  assert.equal(last.response, 'maybe', 'the retry sends the latest choice');
  assert.equal(last.reason, 'work');
  assert.equal(d.posts().some(p => p === last ? false : false), false);
  assert.deepEqual(d.pendingStore(), {});
});

// ── 10. LEGACY IDS ─────────────────────────────────────────────────────────
test('10. the cutover stands: a bare legacy id is never promoted into a current-week answer', async () => {
  // Pending is keyed by the id the player actually answered. A bare id stays a
  // bare id — it is never rewritten to this week's dated occurrence.
  const d = device({ script: ['offline'] });
  await d.tap('avail_tue', 'available', '');
  assert.ok(d.pendingStore().tue, 'held under its own id');
  assert.equal(d.pendingStore()[SESSION], undefined, 'and NOT under the dated current-week occurrence');
  // the current week's row is unaffected by the bare answer
  const row = d.rows(SESSION).find(r => r.player.id === ME);
  assert.equal(row.status, 'no-reply');
  assert.equal(row.pending, false);
  // and the week accessor still refuses bare ids
  assert.match(fn('availabilityWeekSessions'), /availabilityEventsForWeek/, 'the week is still the dated generator');
  assert.match(fn('availabilityNonResponders'), /Deliberately NO legacy bare ids/, 'the cutover comment and rule stand');
});

// ── 11. ISOLATION ──────────────────────────────────────────────────────────
test('11. a pending answer cannot leak to another player, account or club', async () => {
  const d = device({ script: ['offline'] });
  await d.tap(KEY, 'available', '');
  const store = d.pendingStore();
  // another player's row, same device
  assert.equal(d.pendingFor(SESSION, d.OTHER), null, "never read onto another player's row");
  const otherRow = d.rows(SESSION).find(r => r.player.id === 'user_other');
  assert.equal(otherRow.pending, false);
  assert.equal(otherRow.status, 'no-reply');
  // a different account signing in on this device
  const next = device({ script: ['ok'], currentUserId: 'user_someone_else', pending: store });
  assert.equal(next.pendingFor(SESSION, next.PLAYER), null, 'not inherited by the next account');
  assert.equal(await next.flush(), 0, 'and never sent under their name');
  // the identity reset drops it outright
  assert.match(fn('resetIdentityScopedState'), /state\.availabilityPending = \{\};/, 'cleared when the identity changes');
});

test('11b. an unattributable or malformed entry is dropped on load, and the store is bounded', () => {
  const d = device({});
  const dirty = {
    [SESSION]:            { response: 'available', owner: ME },
    'bad session id!':    { response: 'available', owner: ME },
    'slot_thu-20260917':  { response: 'attending', owner: ME },   // not a real response
    'slot_tue-20260922':  { response: 'maybe' },                  // no owner: cannot be retried safely
  };
  assert.deepEqual(Object.keys(d.normalize(dirty)), [SESSION]);
  assert.deepEqual(d.normalize(null), {});
  assert.deepEqual(d.normalize([1, 2]), {});
  const many = {}; for (let i = 0; i < 80; i++) many['slot_x-2026010' + i] = { response: 'available', owner: ME };
  assert.ok(Object.keys(d.normalize(many)).length <= 40, 'bounded on load');
});

// ── 12. COACH TRUTH ────────────────────────────────────────────────────────
test('12. no surface can present an unsent answer as confirmed', async () => {
  const d = device({ script: ['offline'] });
  await d.tap(KEY, 'available', '');
  const rows = d.rows(SESSION);
  assert.equal(rows.every(r => r.confirmed === Boolean(r.confirmed)), true);
  assert.equal(rows.find(r => r.player.id === ME).confirmed, false, 'the only truthful answer');
  // the server-confirmed branch is the ONLY one that sets confirmed
  const src = fn('sessionRows');
  assert.match(src, /confirmed:      true/, 'confirmed comes from the server-resolved branch');
  assert.match(src, /confirmed:      false/, 'the local-field fallback is never confirmed');
  assert.match(src, /pending:        Boolean\(availabilityPendingFor\(id, p\)\)/);
});

test('12b. the player is shown, in words, that the coach cannot see a pending answer', () => {
  const card = fn('availabilityCardV2');
  assert.match(card, /Not sent yet — your coach cannot see this answer/, 'the card says exactly that');
  assert.match(card, /avail-pending-note/);
  assert.match(html, /\.avail-pending-note \{/, 'and it is styled to be noticed');
  assert.match(card, /\$\{pending \? ' · not sent' : ''\}/, 'the status chip agrees with it');
});
