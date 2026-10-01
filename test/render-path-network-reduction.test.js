/**
 * Render-path network reduction.
 *
 * The render-path audit measured a cold Availability load: 45 requests, 33 of
 * them started by section renderers re-running on each of ~11 render() passes,
 * almost none for anything on screen. Three contained changes are pinned here.
 *
 *  1. refreshLiveAvailability shares one in-flight read. Three callers can ask
 *     at once (live cycle, Overview recent-activity, Members dots) and it was
 *     the one critical-path endpoint with no guard.
 *  2. A section renderer's background syncs wait for that section to be the
 *     one on screen.
 *  3. Autopilot's schedule-creating POST is an ENTRY action, not a render side
 *     effect.
 *
 * The latch tests drive the REAL extracted function with a fetch the test
 * releases by hand, so the overlap is genuine.
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

// ── 1. refreshLiveAvailability in-flight sharing ────────────────────────────
function refreshScope({ group = 'g1' } = {}) {
  return new Function(`"use strict";
    const calls = [];
    function fetch(url) { return new Promise((resolve, reject) => { calls.push({ url, resolve, reject }); }); }
    const reply = (i, body) => calls[i].resolve({ ok: true, json: async () => body });
    const httpFail = (i) => calls[i].resolve({ ok: false, status: 500, json: async () => ({}) });
    const fail = (i) => calls[i].reject(new Error('offline'));
    // NB: setTimeout is shadowed below (the deferred panel block), so the tick
    // that lets the awaits inside the refresh run must use microtasks only.
    const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    const panels = { schedules: 0, picker: 0 };
    let _liveAvailabilityInFlight = null;
    let _resolvedAvailability = {}, _resolvedAvailabilityGroup = null, _availLastSync = null;
    const state = { operationalGroupId: ${JSON.stringify(group)}, players: [{ name: 'P', userId: 'uid' }] };
    const chip = { textContent: '', className: '' };
    const document = { getElementById: () => chip };
    function operationalGroups() { return [{ id: 'g1' }]; }
    let linked = 0; async function ensureCoachRosterIdentityLinked() { linked++; }
    function saveState() {}
    let boardRenders = 0; function renderMessageCenter() { boardRenders++; }
    function renderAudiencePicker() { panels.picker++; }
    function renderPushStatusCard() {}
    function loadLiveSchedules() { panels.schedules++; }
    function loadLiveTemplates() {} function loadLiveLog() {}
    const timers = []; function setTimeout(fn) { timers.push(fn); return 1; }
    ${fn('sessionKey')}
    ${fn('liveAvailabilityPlayerKeys')}
    ${fn('refreshLiveAvailability')}
    return { calls, reply, httpFail, fail, tick, panels, chip, refreshLiveAvailability,
      runTimers: () => { timers.splice(0).forEach(f => f()); },
      latch: () => _liveAvailabilityInFlight, linked: () => linked, boardRenders: () => boardRenders,
      resolved: () => _resolvedAvailability, setGroup: g => { state.operationalGroupId = g; } };
  `)();
}
const RESOLVED = { resolved: { uid: { tue: { response: 'available', respondedAt: 't1' } } } };

test('availability: two concurrent callers share ONE board read and both get the same result', async () => {
  const s = refreshScope();
  const a = s.refreshLiveAvailability({ boardOnly: true });
  const b = s.refreshLiveAvailability({ boardOnly: true });
  await s.tick();
  assert.equal(s.calls.length, 1, 'one /api/availability read for two callers');
  assert.equal(s.linked(), 1, 'and one identity link, not two');
  assert.ok(s.latch(), 'latched while in flight');
  s.reply(0, RESOLVED); await Promise.all([a, b]); await s.tick();
  assert.match(JSON.stringify(s.resolved()), /"tue"/, 'the resolved map is applied once');
  assert.equal(s.latch(), null, 'latch cleared on resolve');
});

test('availability: the three cold-load callers collapse to one read', async () => {
  const s = refreshScope();
  const ps = [s.refreshLiveAvailability({ skipPanelReload: true }),   // the live cycle
              s.refreshLiveAvailability({ boardOnly: true }),         // Overview recent activity
              s.refreshLiveAvailability({ boardOnly: true })];        // Members dots
  await s.tick();
  assert.equal(s.calls.length, 1, 'one read for all three entry points');
  s.reply(0, RESOLVED); await Promise.all(ps);
});

test('availability: a cheap caller joins an expensive request; an automatic heavier one joins too; only an explicit Sync now asks for itself', async () => {
  // A board-only tick may ride on a full refresh: it gets more than it asked.
  const full = refreshScope();
  const f = full.refreshLiveAvailability();                       // full: reloads panels
  await full.tick();
  const cheap = full.refreshLiveAvailability({ boardOnly: true });
  await full.tick();
  assert.equal(full.calls.length, 1, 'the board-only tick joins the full refresh');
  full.reply(0, RESOLVED); await Promise.all([f, cheap]); full.runTimers();
  assert.equal(full.panels.schedules, 1, 'the full refresh still reloaded the panels');

  // An AUTOMATIC full refresh behind a poll tick rides the tick's read and still does its own work (Build 111).
  const auto = refreshScope();
  const t = auto.refreshLiveAvailability({ boardOnly: true });
  await auto.tick();
  const ret = auto.refreshLiveAvailability();
  await auto.tick();
  assert.equal(auto.calls.length, 1, 'the automatic full refresh joins the tick — one request');
  auto.reply(0, RESOLVED); await Promise.all([t, ret]); auto.runTimers();
  assert.equal(auto.panels.schedules, 1, 'and it still reloads the panels once');

  // But an explicit "Sync now" must never inherit a poll tick's reply.
  const poll = refreshScope();
  const p = poll.refreshLiveAvailability({ boardOnly: true });
  await poll.tick();
  const manual = poll.refreshLiveAvailability({ manual: true });
  await poll.tick();
  assert.equal(poll.calls.length, 2, 'the manual refresh starts its own request');
  poll.reply(0, RESOLVED); poll.reply(1, RESOLVED); await Promise.all([p, manual]); poll.runTimers();
  assert.equal(poll.panels.schedules, 1, 'and it reloads the panels, as it always did');
  assert.equal(poll.latch(), null);
});

test('availability: an HTTP failure and a network failure both clear the latch; the retry is a new read', async () => {
  const s = refreshScope();
  let p = s.refreshLiveAvailability(); await s.tick();
  s.httpFail(0); await p;
  assert.equal(s.latch(), null, 'a failed read clears the latch');
  assert.match(s.chip.textContent, /fail/i, 'and still says so on the chip (unchanged)');
  p = s.refreshLiveAvailability(); await s.tick();
  assert.equal(s.calls.length, 2, 'the retry is a fresh read');
  s.fail(1); await p;
  assert.equal(s.latch(), null, 'a thrown fetch clears it too');
  p = s.refreshLiveAvailability(); await s.tick();
  assert.equal(s.calls.length, 3);
  s.reply(2, RESOLVED); await p;
  assert.match(JSON.stringify(s.resolved()), /"tue"/, 'and a later success still applies');
});

test('availability: a read for ANOTHER group is never shared', async () => {
  const s = refreshScope();
  const a = s.refreshLiveAvailability({ boardOnly: true }); await s.tick();
  s.setGroup('g2');
  const b = s.refreshLiveAvailability({ boardOnly: true }); await s.tick();
  assert.equal(s.calls.length, 2, 'the group in force gets its own read');
  assert.match(s.calls[1].url, /group=g2/);
  s.reply(0, RESOLVED); s.reply(1, { resolved: {} });
  await Promise.all([a, b]);
  assert.equal(s.latch(), null);
});

test('availability: sequential refreshes still read every time (polling is unchanged)', async () => {
  const s = refreshScope();
  let p = s.refreshLiveAvailability({ boardOnly: true }); await s.tick(); s.reply(0, RESOLVED); await p;
  p = s.refreshLiveAvailability({ boardOnly: true }); await s.tick();
  assert.equal(s.calls.length, 2, 'no result caching — each tick is a real read');
  s.reply(1, RESOLVED); await p;
});

// ── 2. hidden-section background syncs ──────────────────────────────────────
function sectionActive(section, { view = 'coach', active = 'message' } = {}) {
  return new Function(`"use strict";
    const state = { activeView: ${JSON.stringify(view)}, activeCoachSection: ${JSON.stringify(active)} };
    ${fn('coachSectionActive')}
    return coachSectionActive(${JSON.stringify(section)});
  `)();
}

test('sections: coachSectionActive is true only for the coach section on screen', () => {
  assert.equal(sectionActive('players', { active: 'players' }), true);
  assert.equal(sectionActive('players', { active: 'message' }), false, 'hidden while Availability is open');
  assert.equal(sectionActive('players', { view: 'player', active: 'players' }), false,
    'the player shell never counts as a coach section being on screen');
});

test('sections: Members background syncs wait for Members to be on screen', () => {
  const rp = fn('renderPlayers');
  assert.match(rp, /const _membersOnScreen = coachSectionActive\('players'\)/, 'one gate for the page');
  for (const call of [/if \(isCoach\(\) && _membersOnScreen\) loadInviteList\(\)/,
                      /if \(isCoach\(\) && _membersOnScreen\) setTimeout\(\(\) => loadIdentityRequests\(\)/,
                      /if \(isCoach\(\) && _membersOnScreen && typeof ensureAdminData === 'function'\) ensureAdminData\(\)/,
                      /if \(_membersOnScreen\) ensureMembersAvailability\(\)/]) {
    assert.match(rp, call, `gated: ${call}`);
  }
  // …and none of them is left ungated.
  assert.doesNotMatch(rp, /\n\s*if \(isCoach\(\)\) loadInviteList/);
  assert.doesNotMatch(rp, /\n\s*ensureMembersAvailability\(\);/);
});

test('sections: Match Day and Training per-render reads wait for their section', () => {
  assert.match(fn('renderMatchday'), /if \(isCoach\(\) && coachSectionActive\('matchday'\)\) loadCoachDraftsList\(\)/);
  assert.match(fn('renderMatchday'), /if \(isCoach\(\) && coachSectionActive\('matchday'\)\) loadCoachPublication\(\)/);
  const rt = fn('renderTraining');
  assert.match(rt, /canI\('publish_training'\) && coachSectionActive\('training'\)/, 'publication state is planner-only');
  // The schedule itself is NOT gated: the availability board reads it too.
  assert.match(rt, /ensureTrainingSchedule\(\);/, 'the shared training schedule still loads');
  const ensureAt = rt.indexOf('ensureTrainingSchedule()');
  const loadAt = rt.indexOf('loadTrainingPublicationState()');
  assert.ok(ensureAt > 0 && loadAt > ensureAt, 'and still before the publication state (CASE F)');
});

test('sections: the Overview\'s per-render autopilot work waits for the Overview', () => {
  assert.match(fn('renderCoachOverview'),
    /if \(autopilotOn\(\) && isCoach\(\) && coachSectionActive\('overview'\)\) \{\s*\n\s*autopilotFillMatchFromFixture\(\);\s*\n\s*loadAutopilotLog\(\);\s*\n\s*\}/,
    'fill + log gated, and the POST no longer sits among them');
});

// ── 3. autopilot provisioning is an entry action ────────────────────────────
test('autopilot: no schedule-creating POST can come from a render', () => {
  assert.doesNotMatch(fn('renderCoachOverview'), /ensureAutopilotSchedule/,
    'the Overview renderer no longer provisions');
  // No RENDERER may provision — that is the whole point of the change.
  const renderers = [...src.matchAll(/\n    (?:async )?function (render[A-Za-z]*)\s*\(/g)].map(m => m[1]);
  for (const r of renderers) {
    assert.doesNotMatch(fn(r), /ensureAutopilotSchedule/, `${r}() must not provision`);
  }
  assert.match(fn('coachSectionEntered'), /ensureAutopilotSchedule\(\)\.catch/, 'the section-entry hook does');
  // The other two call sites are the pre-existing non-render ones: a brand-new
  // club, and the once-per-session club-config load. Startup therefore still
  // provisions without any render, which is why no boot hook was added.
  assert.match(fn('clubWizFinish'), /ensureAutopilotSchedule\(\)\.catch/, 'a new club still provisions');
  assert.match(fn('loadClubConfigFromServer'), /if \(isCoach\(\)\) ensureAutopilotSchedule\(\)\.catch/,
    'and so does a returning coach, once per session');
});

test('autopilot: entering Overview ensures the schedule; entering anything else does not', () => {
  const run = (section, { isCoachFn = true } = {}) => new Function(`"use strict";
    const calls = [];
    function ensureAutopilotSchedule() { calls.push('ensure'); return Promise.resolve(); }
    ${fn('coachSectionEntered')}
    coachSectionEntered(${JSON.stringify(section)});
    return calls;
  `)();
  assert.deepEqual(run('overview'), ['ensure'], 'Overview entry provisions');
  assert.deepEqual(run('message'), [], 'Availability entry does not');
  assert.deepEqual(run('players'), [], 'Members entry does not');
  assert.deepEqual(run(null), [], 'the player shell does not');
});

test('autopilot: navigation is an entry, and the guard still makes it once-only', () => {
  assert.match(fn('setSection'), /coachSectionEntered\(view === 'coach' \? section : null\);/,
    'navigating into a coach section is an entry');
  // Idempotency is unchanged: the guard and the existing-schedule check remain.
  const ensure = fn('ensureAutopilotSchedule');
  assert.match(ensure, /if \(!autopilotOn\(\) \|\| !isCoach\(\) \|\| _autopilotEnsured\) return;/, 'same guard');
  assert.match(ensure, /_autopilotEnsured = true;/);
  assert.match(ensure, /if \(schedules\.some\(s => s\.id === 'autopilot-availability'\)\) return;/,
    'and it still refuses to create a second schedule');
});
