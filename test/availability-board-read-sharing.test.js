/**
 * COACH AVAILABILITY — ONE BOARD READ AT BOOT (Build 111)
 *
 * On a cold load the Overview's recent-activity pull issued a board-only read
 * of /api/availability?resolveRoster=1, and the Availability section's live
 * cycle issued the same read 40ms later — refreshLiveAvailability shared a
 * request only with callers wanting no MORE than it, so a heavier caller
 * behind a lighter read always asked again. The network read is identical
 * whatever the caller wants; only the work after it differs. A heavier caller
 * now joins the read in flight and adds just the work the lighter one skipped,
 * each piece once. The one caller that still asks for itself is an explicit
 * "Sync now": the coach asked NOW, and Build 97's ordering keeps an older
 * reply from regressing it.
 *
 * The real function runs over a scripted fetch whose replies the test
 * delivers; everything else is the real code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
const stripComments = s => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/** The board with every reply under the test's control, and every piece of post-read work counted. */
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
    const work = { renders: 0, picker: 0, push: 0, schedules: 0, templates: 0, log: 0, saves: 0 };
    const timers = [];
    const setTimeout = (f, ms) => { timers.push(f); return timers.length; };
    const deferred = [], urls = [];
    function fetch(url) { urls.push(url); return new Promise((resolve, reject) => { deferred.push({ resolve, reject }); }); }
    const chip = { textContent: '', className: '' };
    const document = { getElementById: id => id === 'avail-refresh-ts' ? chip : null };
    const console = { warn() {} };
    function ensureCoachRosterIdentityLinked() { return Promise.resolve(); }
    function operationalGroups() { return [{ id: CFG.group }]; }
    function operationalPlayers() { return state.players; }
    function saveState() { work.saves++; }
    function renderMessageCenter() { work.renders++; }
    function renderCoachOverview() {} function coachSectionActive() { return false; }
    function renderAudiencePicker() { work.picker++; } function renderPushStatusCard() { work.push++; }
    function loadLiveSchedules() { work.schedules++; } function loadLiveTemplates() { work.templates++; } function loadLiveLog() { work.log++; }
    function availabilityFlushPending() { return Promise.resolve(0); }
    function playerAvailRetryNow() {}
    ${fn('sessionKey')} ${fn('sessionReasonKey')} ${fn('normalizeSessionId')} ${fn('liveAvailabilityPlayerKeys')}
    ${fn('availabilityPendingFor')} ${fn('availabilitySessionIdForKey')} ${fn('availabilityDropStaleLocalAnswers')}
    ${fn('currentResolvedAvailability')} ${fn('availabilitySetReadFailed')} ${fn('availabilityLastReadFailed')} ${fn('availabilityReadUnknown')}
    ${fn('resolvedAnswerFor')} ${fn('sessionRows')}
    ${fn('refreshLiveAvailability')} ${fn('availRefreshNow')} ${fn('refreshAvailabilityOnReturn')}
    return {
      refresh: opts => refreshLiveAvailability(opts), liveSync: () => availRefreshNow(), onReturn: () => refreshAvailabilityOnReturn(),
      deliver: (n, resolved) => deferred[n].resolve({ ok: true, json: async () => ({ resolved }) }),
      fail:    n => deferred[n].resolve({ ok: false, status: 500, json: async () => ({}) }),
      drop:    n => deferred[n].reject(new TypeError('Failed to fetch')),
      reads: () => deferred.length, urls: () => urls,
      runTimers: () => { let f; while ((f = timers.shift())) f(); },
      work: () => ({ ...work }),
      latch: () => _liveAvailabilityInFlight,
      row: (name, sid) => { const r = (sessionRows(sid) || []).find(x => x.player.name === name); return r ? r.status : 'ROW-MISSING'; },
      counts: () => ({ readSeq: _availabilityReadSeq, applied: _availabilityAppliedSeq, sync: _availLastSync, failed: _availReadFailed,
                       unknown: availabilityReadUnknown(), map: currentResolvedAvailability() === null ? 'none' : 'map' }),
      state, set: (k, v) => { if (k === 'group') state.operationalGroupId = v; },
    };
  `)({ group, club, players });
}
const SID = 'slot_a-20260929';
const ANS = (u1, u2) => ({ ...(u1 ? { u1: { [SID]: { response: u1, reason: '', respondedAt: '2026-09-25T10:00:00.000Z' } } } : {}),
                          ...(u2 ? { u2: { [SID]: { response: u2, reason: '', respondedAt: '2026-09-25T10:00:00.000Z' } } } : {}) });
const tick = () => new Promise(r => setTimeout(r, 15));

test('A. the boot pair — a board-only read, then the live cycle 40ms behind it — is ONE underlying read', { timeout: 20000 }, async () => {
  const b = board();
  const first = b.refresh({ boardOnly: true });            // ensureRecentActivity, from the hidden Overview
  await tick();
  const cycle = b.refresh({ skipPanelReload: true });      // loadLiveMessaging, the Availability section's live cycle
  await tick();
  assert.equal(b.reads(), 1, 'exactly one network read');
  assert.equal(b.counts().readSeq, 1, 'and one sequence number: the joiner takes none');
  b.deliver(0, ANS('available', 'maybe'));
  const [r1, r2] = await Promise.all([first, cycle]); b.runTimers();
  assert.equal(b.row('P One', SID), 'available'); assert.equal(b.row('P Two', SID), 'maybe');
  assert.equal(b.reads(), 1, 'still one');
});

test('B. both callers receive the same successful result, and the work is done once', { timeout: 20000 }, async () => {
  const b = board();
  const tickRead = b.refresh({ boardOnly: true }); await tick();
  const full = b.refresh(); await tick();                  // an automatic full refresh (return-to-tab) behind the tick
  assert.equal(b.reads(), 1);
  b.deliver(0, ANS('available'));
  const [a, c] = await Promise.all([tickRead, full]); b.runTimers();
  assert.ok(a && a.applied && c && c.applied, 'both saw the read apply');
  assert.equal(a, c, 'one outcome object, shared');
  assert.equal(b.counts().applied, 1); assert.equal(b.counts().map, 'map'); assert.equal(b.counts().unknown, false);
  const w = b.work();
  assert.equal(w.renders, 1, 'the board repainted once (the full refresh asked; the tick alone would have only on change)');
  assert.deepEqual([w.picker, w.push, w.schedules, w.templates, w.log], [1, 1, 1, 1, 1], 'the full refresh\'s panel work, once');
});

test('C. once the shared read has settled, a later refresh makes a NEW read', { timeout: 20000 }, async () => {
  const b = board();
  const r1 = b.refresh({ boardOnly: true }); await tick();
  const r2 = b.refresh(); await tick();
  assert.equal(b.reads(), 1);
  b.deliver(0, ANS('available')); await Promise.all([r1, r2]); b.runTimers();
  assert.equal(b.latch(), null, 'the latch is cleared');
  const r3 = b.refresh({ boardOnly: true }); await tick();
  assert.equal(b.reads(), 2, 'a later poll tick is a fresh request');
  b.deliver(1, ANS('maybe')); await r3;
  assert.equal(b.row('P One', SID), 'maybe');
  assert.equal(b.counts().readSeq, 2); assert.equal(b.counts().applied, 2);
});

test('D. a failed shared read clears the latch, the joiner does nothing, and a retry makes a new read', { timeout: 20000 }, async () => {
  for (const [how, kill] of [['HTTP 500', b => b.fail(0)], ['network drop', b => b.drop(0)]]) {
    // what ONE failed read does on its own (the failure transition repaints the board once, as it always has)
    const solo = board(); const s1 = solo.refresh({ boardOnly: true }); await tick(); kill(solo); await s1; solo.runTimers();
    const b = board();
    const r1 = b.refresh({ boardOnly: true }); await tick();
    const r2 = b.refresh(); await tick();
    assert.equal(b.reads(), 1, how);
    kill(b);
    const [a, c] = await Promise.all([r1, r2]); b.runTimers();
    assert.ok(!a && !c, how + ': neither caller saw an applied read');
    assert.equal(b.counts().failed, true, how + ': the failure is recorded once');
    assert.equal(b.counts().map, 'none', how + ': nothing was stamped');
    assert.equal(b.work().renders, solo.work().renders, how + ': the joiner added no paint of its own to the failure');
    assert.equal(b.work().schedules, 0, how + ': and reloaded nothing');
    assert.equal(b.latch(), null, how + ': the latch is cleared');
    const retry = b.refresh(); await tick();
    assert.equal(b.reads(), 2, how + ': the retry is a new request');
    b.deliver(1, ANS('available')); await retry; b.runTimers();
    assert.equal(b.row('P One', SID), 'available'); assert.equal(b.counts().failed, false);
  }
});

test('E. ordering (Build 97) is untouched: an explicit Sync now asks for itself and stays authoritative over the older tick', { timeout: 20000 }, async () => {
  const b = board();
  const tickRead = b.refresh({ boardOnly: true }); await tick();
  const sync = b.liveSync(); await tick();
  assert.equal(b.reads(), 2, 'Sync now never inherits a tick');
  assert.equal(b.counts().readSeq, 2);
  b.deliver(1, ANS('unavailable')); await sync; await tick();
  assert.equal(b.row('P One', SID), 'unavailable');
  b.deliver(0, ANS('available')); await tickRead; await tick();
  assert.equal(b.row('P One', SID), 'unavailable', 'the older reply did not regress the board');
  assert.equal(b.counts().applied, 2);
});

test('F. the loading state (Build 110) holds while the shared read is pending: nothing is stamped until it lands', { timeout: 20000 }, async () => {
  const b = board();
  const r1 = b.refresh({ boardOnly: true }); await tick();
  const r2 = b.refresh({ skipPanelReload: true }); await tick();
  assert.equal(b.reads(), 1, 'one read out');
  assert.deepEqual([b.counts().map, b.counts().sync, b.counts().unknown, b.work().renders], ['none', null, false, 0], 'pending: no map, no stamp, no failure, no paint');
  b.deliver(0, ANS('available')); await Promise.all([r1, r2]); b.runTimers();
  assert.equal(b.counts().map, 'map'); assert.ok(b.counts().sync);
});

test('a third caller joins the raised latch and the panels are loaded exactly once; a lighter caller joins a heavier read as before', { timeout: 20000 }, async () => {
  const b = board();
  const t = b.refresh({ boardOnly: true }); await tick();
  const full1 = b.refresh(); await tick();
  const full2 = b.refresh(); await tick();                 // joins the latch the first full caller raised
  const cheap = b.refresh({ boardOnly: true }); await tick();
  assert.equal(b.reads(), 1, 'four callers, one read');
  b.deliver(0, ANS('available')); await Promise.all([t, full1, full2, cheap]); b.runTimers();
  const w = b.work();
  assert.equal(w.renders, 1); assert.deepEqual([w.schedules, w.templates, w.log, w.picker, w.push], [1, 1, 1, 1, 1], 'each piece of work once');
});

test('a read for another group is never shared; a tick joining a full read repaints only on change, as before', { timeout: 20000 }, async () => {
  const b = board({ group: 'grp_a' });
  const a = b.refresh({ boardOnly: true }); await tick();
  b.set('group', 'grp_b');
  const other = b.refresh({ boardOnly: true }); await tick();
  assert.equal(b.reads(), 2, 'a different group is a different read');
  b.set('group', 'grp_a'); b.deliver(0, ANS('available')); await a; b.deliver(1, ANS('maybe')); await other;
  const c = board();
  const full = c.refresh(); await tick();
  const t = c.refresh({ boardOnly: true }); await tick();
  assert.equal(c.reads(), 1, 'the cheap caller rides the full read');
  c.deliver(0, {}); await Promise.all([full, t]); c.runTimers();
  assert.equal(c.work().renders, 1, 'the full refresh repaints; the tick added nothing');
});

test('an idle tick still repaints nothing: unchanged data, no paint; changed data, one paint (the Build 68 contract through the shared bookkeeping)', { timeout: 20000 }, async () => {
  const b = board();
  const t1 = b.refresh({ boardOnly: true }); await tick();
  b.deliver(0, ANS('available')); await t1; b.runTimers();
  assert.equal(b.work().renders, 1, 'the first landing changed the board: one paint');
  const t2 = b.refresh({ boardOnly: true }); await tick();
  b.deliver(1, ANS('available')); await t2; b.runTimers();
  assert.equal(b.work().renders, 1, 'the same data again: no paint');
  const t3 = b.refresh({ boardOnly: true }); await tick();
  b.deliver(2, ANS('maybe')); await t3; b.runTimers();
  assert.equal(b.work().renders, 2, 'a change: one paint');
  assert.deepEqual([b.work().picker, b.work().schedules], [0, 0], 'and a tick never touches the panels');
});

test('SOURCE. the join is request-level, each piece of work is claimed before it is scheduled, and the manual path is the only exception', () => {
  const body = stripComments(fn('refreshLiveAvailability'));
  assert.match(body, /if \(_inFlight && _inFlight\.key === _key\) \{\s*if \(_inFlight\.weight >= _weight\) return _inFlight\.promise;\s*if \(!opts\.manual\) \{\s*_inFlight\.weight = _weight;\s*const out = await _inFlight\.promise;\s*if \(out && out\.applied\) _settle\(opts, out\);\s*return out;/, 'a heavier automatic caller joins and settles');
  assert.match(body, /if \(wantPanels\) out\.panels = true;\s*if \(wantLoads\) out\.loads = true;\s*if \(!wantPanels && !wantLoads\) return;\s*setTimeout\(/, 'work is claimed synchronously, before the timer');
  assert.match(body, /const out = \{ applied: true, changed: _resolvedChanged, rendered: false, panels: false, loads: false \};\s*_settle\(opts, out\);\s*return out;/, 'the owner settles through the same bookkeeping');
  assert.doesNotMatch(body, /setTimeout\([^)]*\d{3,}/, 'no added delay');
  assert.match(stripComments(fn('availRefreshNow')), /refreshLiveAvailability\(\{ manual: true \}\)/, 'Sync now is the manual caller');
  assert.doesNotMatch(stripComments(fn('refreshAvailabilityOnReturn')), /manual/, 'returning to the tab is automatic: it joins');
  assert.doesNotMatch(stripComments(fn('loadLiveMessaging')), /manual/, 'the live cycle is automatic: it joins');
});
