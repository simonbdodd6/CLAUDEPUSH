/**
 * TRAINING OCCURRENCE CONTENT IDENTITY — the rollover / group data-integrity fix.
 *
 * Plan content (blocks, notes) used to be keyed by the session's PROTOCOL id.
 * For a recurring slot the current week's protocol id is the bare legacy
 * sessionId (`tue`), so the key's MEANING changed every Monday: last week's
 * plan reappeared as this week's, last week's own view (dated id) found
 * nothing, and a plan written ahead under a dated id vanished the moment its
 * week became current. And because every group seeds the same slots, `tue`
 * was also the same string for Seniors and U18 — group separation hung on one
 * client stamp (trainingStateGroupId) that had no default, no normalisation,
 * and a silent fall-through to Seniors when absent.
 *
 * The fix, pinned here:
 *  - content lives under the DATED occurrence key in every week
 *    (trainingContentKey), the same `slot_<id>-<YYYYMMDD>` form attendance
 *    registers already use — one occurrence, one identity;
 *  - protocol ids (availability answers, publish targets, player views) are
 *    untouched (trainingProtocolId maps back for publish-staleness);
 *  - an unprovable owner of the live training state QUARANTINES instead of
 *    becoming Seniors, and the wholesale sessions sync refuses to write a
 *    list the operating group does not own.
 *
 * Everything below drives the REAL extracted functions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const fn = n => extractFn(html, n);
const strip = s => s.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');

const SLOTS = [
  { id: 'slot_tue', day: 'Tue', startTime: '19:00', venue: 'Club', active: true, sessionId: 'tue' },
  { id: 'slot_thu', day: 'Thu', startTime: '19:30', venue: 'Club', active: true, sessionId: 'thu' },
];

/** The identity helpers with an injectable "today" and slot table. */
function identity(today, slots = SLOTS) {
  return new Function('cfg', `
    "use strict";
    const _trainingSchedule = { slots: cfg.slots };
    const _availTodayOverride = cfg.today;
    function availToday() { return _availTodayOverride; }
    ${html.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')}
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('trainingDateLabel')}
    ${fn('trainingContentKey')}
    ${fn('trainingProtocolId')}
    ${fn('trainingPreviousOccurrenceKey')}
    ${fn('attendanceOccurrenceId')}
    return { trainingContentKey, trainingProtocolId, trainingPreviousOccurrenceKey, attendanceOccurrenceId };
  `)({ today, slots });
}

// Tue 2026-09-01 is in the week of Mon 2026-08-31.
const THIS_TUE = identity('2026-09-01');

// ═══════════════ A + B — WEEK ROLLOVER AND HISTORICAL LOOKUP ═══════════════

test('the current week and every other week give one Tuesday ONE identity', () => {
  assert.equal(THIS_TUE.trainingContentKey('tue'), 'slot_tue-20260901');
  assert.equal(THIS_TUE.trainingContentKey('thu'), 'slot_thu-20260903');
  // Already-dated ids pass through untouched — idempotent.
  assert.equal(THIS_TUE.trainingContentKey('slot_tue-20260825'), 'slot_tue-20260825');
});

test('rollover: the same bare id resolves to a DIFFERENT occurrence next week', () => {
  const nextWeek = identity('2026-09-08');
  assert.equal(THIS_TUE.trainingContentKey('tue'), 'slot_tue-20260901');
  assert.equal(nextWeek.trainingContentKey('tue'), 'slot_tue-20260908');
  // So a plan saved this week stays addressed to ITS date: next Tuesday does
  // not inherit it, and last Tuesday's key still finds it.
  const blocks = { [THIS_TUE.trainingContentKey('tue')]: [{ activity: 'Ruck week 1' }] };
  assert.equal((blocks[nextWeek.trainingContentKey('tue')] || []).length, 0, 'next week starts empty');
  assert.equal(blocks['slot_tue-20260901'][0].activity, 'Ruck week 1', 'the historical key still answers');
});

test('a plan written AHEAD under a dated id is found when its week becomes current', () => {
  // The second face of the incident: planning next week wrote slot_tue-20260908;
  // when that week arrived the planner used to switch to 'tue' and lose it.
  const planned = { 'slot_tue-20260908': [{ activity: 'Lineout session' }] };
  const arrived = identity('2026-09-08');
  assert.equal(planned[arrived.trainingContentKey('tue')][0].activity, 'Lineout session');
});

test('the content key IS the attendance occurrence identity — one occurrence, one name', () => {
  assert.equal(THIS_TUE.trainingContentKey('tue'), THIS_TUE.attendanceOccurrenceId('tue', '2026-09-01'));
  assert.equal(THIS_TUE.trainingContentKey('slot_thu-20260903'),
               THIS_TUE.attendanceOccurrenceId('thu', '2026-09-03'));
});

test('the protocol mapping round-trips, and ONLY for the current week', () => {
  assert.equal(THIS_TUE.trainingProtocolId('slot_tue-20260901'), 'tue', 'current week maps back');
  assert.equal(THIS_TUE.trainingProtocolId(THIS_TUE.trainingContentKey('tue')), 'tue', 'round-trip');
  assert.equal(THIS_TUE.trainingProtocolId('slot_tue-20260825'), 'slot_tue-20260825', 'a PAST week is itself');
  assert.equal(THIS_TUE.trainingProtocolId('slot_tue-20260908'), 'slot_tue-20260908', 'a FUTURE week is itself');
  assert.equal(THIS_TUE.trainingProtocolId('tue'), 'tue', 'bare ids pass through');
});

test('the previous occurrence key is derivable — the duplicate source', () => {
  assert.equal(THIS_TUE.trainingPreviousOccurrenceKey('tue'), 'slot_tue-20260825');
  assert.equal(THIS_TUE.trainingPreviousOccurrenceKey('slot_thu-20260903'), 'slot_thu-20260827');
  assert.equal(THIS_TUE.trainingPreviousOccurrenceKey('sess_123'), '', 'ad-hoc sessions have no previous occurrence');
  // CONTRACT SHARPENED (Build K): "previous" is relative to the occurrence
  // ITSELF, not to the clock. Viewing a future week and asking for its
  // previous plan must give THAT week's predecessor — the old code answered
  // with the week before today (slot_tue-20260825 here), the wrong source.
  assert.equal(THIS_TUE.trainingPreviousOccurrenceKey('slot_tue-20260915'), 'slot_tue-20260908',
    'a future occurrence’s previous week is ITS previous week');
  assert.equal(THIS_TUE.trainingPreviousOccurrenceKey('slot_tue-20260825'), 'slot_tue-20260818',
    'a past occurrence’s previous week is its own too');
  assert.equal(THIS_TUE.trainingPreviousOccurrenceKey('slot_x-99999999'), '',
    'a malformed embedded date makes no claim');
});

// ═══════════════ H + I — AD-HOC, LEGACY AND FAIL-CLOSED CASES ══════════════

test('ad-hoc and non-slot identities are deliberately untouched', () => {
  for (const id of ['sess_1756712345', 'contact-skills-abc', 'game', '']) {
    assert.equal(THIS_TUE.trainingContentKey(id), id, JSON.stringify(id));
  }
});

test('no slot table, or a slot that does not run: fail CLOSED to the id itself', () => {
  const bare = identity('2026-09-01', []);
  assert.equal(bare.trainingContentKey('tue'), 'tue', 'no slots: nothing is invented');
  const inactive = identity('2026-09-01', [{ ...SLOTS[0], active: false }]);
  assert.equal(inactive.trainingContentKey('tue'), 'tue', 'inactive slot: no date to prove');
  const ranged = identity('2026-09-01', [{ ...SLOTS[0], effectiveFrom: '2026-10-01' }]);
  assert.equal(ranged.trainingContentKey('tue'), 'tue', 'outside the slot’s effective range');
});

test('the date arithmetic is timezone-independent given the same "today"', () => {
  // Run the same resolution in three timezones in child processes; the key is
  // pure string/UTC arithmetic and must not move.
  for (const tz of ['Pacific/Kiritimati', 'America/Anchorage', 'UTC']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { readFile } from 'node:fs/promises';
      const html = await readFile(${JSON.stringify(join(__dirname, '..', 'index.html'))}, 'utf8');
      ${extractFn.toString()}
      const src = ['availWeekStart','availAddDays','availSlotDateInWeek','trainingContentKey']
        .map(n => extractFn(html, n)).join('\\n');
      const key = new Function(\`
        const _trainingSchedule = { slots: ${JSON.stringify(SLOTS)} };
        function availToday() { return '2026-09-01'; }
        \${html.match(/const AVAIL_DAY_INDEX = \\{[^}]*\\};/)[0]}
        \${src}
        return trainingContentKey('tue');\`)();
      process.stdout.write(key);
    `], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(out, 'slot_tue-20260901', tz);
  }
});

// ═══════════════ C + E — GROUP OWNERSHIP ═══════════════════════════════════

function ownerWorld(state) {
  return new Function('state', `
    "use strict";
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    const defaultState = { schedule: [], trainingBlocks: {}, tacticsDrawings: {} };
    const mcDetachFixture = () => {}; const hydrateMedicalFromShared = () => {};
    const loadMedicalFromServer = () => Promise.resolve();
    let _trainingSchedule=null,_trainingScheduleAttempted=false,_trainingScheduleGroupId='';
    let _trainingPubState={},_trainingPubLoadedAt=0,_publishedStateLoadedAt=0,_sharedMedical={};
    ${html.match(/const TRAINING_UNOWNED_KEY = '[^']+';/)[0]}
    ${fn('trainingStateOwner')}
    ${fn('captureTrainingState')}
    ${fn('stashTrainingState')}
    ${fn('adoptTrainingState')}
    ${fn('syncTrainingStateToGroup')}
    return { syncTrainingStateToGroup, trainingStateOwner };
  `)(state);
}
const SEN = 'grp_initial', U18 = 'grp_u18';
const liveU18 = (extra = {}) => ({
  operationalGroupId: U18,
  schedule: [{ id: 'tue', title: 'U18 Tuesday' }],
  trainingBlocks: { 'slot_tue-20260901': [{ activity: 'U18 handling' }] },
  trainingByGroup: { [SEN]: { schedule: [{ id: 'tue', title: 'Seniors Tuesday' }],
    trainingBlocks: { 'slot_tue-20260901': [{ activity: 'SENIORS scrum' }] },
    trainingAttendance: {}, sessionNotes: {}, tacticsDrawings: {}, trainingWeekStart: null,
    trainingActiveSession: 'tue', lastWeekTrainingBlocks: null } },
  trainingAttendance: {}, sessionNotes: {}, tacticsDrawings: {}, trainingWeekStart: null,
  trainingActiveSession: 'tue', lastWeekTrainingBlocks: null, ...extra });

test('D: an UNPROVABLE owner quarantines — never relabelled as Seniors', () => {
  const s = liveU18();                       // stamp ABSENT, stashes exist
  const w = ownerWorld(s);
  assert.equal(w.trainingStateOwner(), '_unowned', 'no stamp + partitioned = unknown');
  s.operationalGroupId = SEN;
  w.syncTrainingStateToGroup();
  assert.equal(s.trainingBlocks['slot_tue-20260901'][0].activity, 'SENIORS scrum',
    'Seniors sees SENIORS data — the pre-fix behaviour showed U18’s here');
  assert.equal(s.trainingByGroup._unowned.trainingBlocks['slot_tue-20260901'][0].activity,
    'U18 handling', 'the unowned state is preserved losslessly in quarantine');
  assert.equal(s.trainingByGroup[SEN].trainingBlocks['slot_tue-20260901'][0].activity,
    'SENIORS scrum', 'and the real Seniors stash was never overwritten');
  assert.equal(s.trainingStateGroupId, SEN, 'the adopted state is stamped');
});

test('E: a stamped round-trip keeps both groups intact — including unsaved changes', () => {
  const s = liveU18({ trainingStateGroupId: U18 });
  const w = ownerWorld(s);
  s.trainingBlocks['slot_tue-20260901'].push({ activity: 'U18 unsaved edit' });   // unsaved local change
  s.operationalGroupId = SEN; w.syncTrainingStateToGroup();
  assert.equal(s.trainingBlocks['slot_tue-20260901'][0].activity, 'SENIORS scrum');
  s.operationalGroupId = U18; w.syncTrainingStateToGroup();
  assert.deepEqual(s.trainingBlocks['slot_tue-20260901'].map(b => b.activity),
    ['U18 handling', 'U18 unsaved edit'], 'U18 came back intact, unsaved edit included');
});

test('a NEVER-partitioned device keeps the documented legacy rule (initial group)', () => {
  const s = liveU18({ trainingByGroup: {} });          // pre-split: no stashes at all
  const w = ownerWorld(s);
  assert.equal(w.trainingStateOwner(), 'grp_initial', 'pre-split data is the initial group’s');
});

// ═══════════════ F — THE WHOLESALE SYNC REFUSES A DISOWNED WRITE ═══════════

function syncWorld({ owner, gid, groups }) {
  return new Function('cfg', `
    "use strict";
    const state = { activeView: 'coach', operationalGroupId: cfg.gid,
      trainingStateGroupId: cfg.owner,
      schedule: [{ id: 'tue', title: 'A session' }] };
    const posted = [];
    function isCoach() { return true; }
    function operationalGroups() { return cfg.groups; }
    ${fn('trainingGroupParam')}
    const fetch = async (url, opts) => { posted.push(JSON.parse(opts.body)); return { ok: true }; };
    ${fn('syncSessionsToServer')}
    return syncSessionsToServer().then(ok => ({ ok, posted }));
  `)({ owner, gid, groups });
}
const TWO_GROUPS = [{ id: SEN }, { id: U18 }];

test('F: the sessions sync refuses a list the operating group does not own', async () => {
  const mismatch = await syncWorld({ owner: U18, gid: SEN, groups: TWO_GROUPS });
  assert.equal(mismatch.ok, false, 'refused — this is the write that overwrote Seniors');
  assert.equal(mismatch.posted.length, 0, 'nothing left the device');

  const unowned = await syncWorld({ owner: null, gid: SEN, groups: TWO_GROUPS });
  assert.equal(unowned.ok, false, 'an unproven owner is refused too');
  assert.equal(unowned.posted.length, 0);

  const owned = await syncWorld({ owner: SEN, gid: SEN, groups: TWO_GROUPS });
  assert.equal(owned.ok, true, 'the owned write flows');
  assert.equal(owned.posted[0].group, SEN);
});

test('a single-group club is unaffected by the ownership guard', async () => {
  const r = await syncWorld({ owner: null, gid: SEN, groups: [{ id: SEN }] });
  assert.equal(r.ok, true, 'legacy single-group devices keep saving');
});

// ═══════════════ G — AVAILABILITY AND ATTENDANCE ARE UNTOUCHED ═════════════

test('G: availability event ids are byte-for-byte unchanged — answers keep working', () => {
  const W = new Function(`
    "use strict";
    ${html.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/)[0]}
    ${fn('availWeekStart')} ${fn('availAddDays')} ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')} ${fn('availabilityEventsForWeek')}
    return availabilityEventsForWeek;`)();
  const ids = W('2026-08-31', { slots: SLOTS, fixtures: [], currentWeekStart: '2026-08-31' })
    .filter(e => e.type === 'training').map(e => e.id);
  assert.deepEqual(ids, ['tue', 'thu'],
    'the CURRENT week still answers to the legacy ids — trainingTuesday answers resolve');
  const sk = new Function(`${fn('sessionKey')} return sessionKey;`)();
  assert.equal(sk('tue'), 'trainingTuesday', 'the availability field mapping is untouched');
});

test('G: the attendance panel and register identity are untouched', () => {
  assert.match(strip(fn('renderTraining')), /attendancePanelHtml\(sessId, sessObj && sessObj\.date\)/,
    'attendance still keys off the protocol id + date, which lifts to the same occurrence');
  assert.equal(html.split('function attendanceOccurrenceId(').length - 1, 1,
    'exactly the one client implementation — none added by this fix');
});

// ═══════════════ THE PLANNER WIRING ════════════════════════════════════════

test('every content read/write in the planner goes through the dated key', () => {
  const rt = strip(fn('renderTraining'));
  assert.match(rt, /const ck\s+= trainingContentKey\(sessId\);/);
  assert.match(rt, /\(state\.trainingBlocks\|\|\{\}\)\[ck\]/, 'the open session reads its occurrence');
  assert.match(rt, /trainingContentKey\(s\.id\)/, 'per-card block counts too');
  assert.ok(!/\(state\.trainingBlocks\|\|\{\}\)\[sessId\]/.test(rt), 'no protocol-id content read remains');
  assert.match(strip(fn('trainingSessionPayload')), /trainingContentKey\(sessionId\)/, 'publish payload');
  assert.match(strip(fn('sendTrainingSheet')), /trainingContentKey\(sessId\)/, 'coach sheet');
  assert.match(strip(fn('autopilotDuplicateSession')), /trainingContentKey\(sessionId\)/, 'duplicate target');
  assert.match(strip(fn('startNewWeek')), /trainingContentKey\(s\.id\)/, 'explicit weekly reset clears the occurrence');
});

test('the owner stamp exists from birth and is normalised on every load', () => {
  // The original hazard: trainingStateGroupId had NO default and NO
  // normalisation, so it could be absent forever and the owner fell through
  // to Seniors. Both halves are pinned: defaultState declares it, and
  // normalizeState coerces junk to null (unknown) — never to a group.
  const code = strip(html);
  assert.match(code, /trainingStateGroupId: null,/, 'declared in defaultState');
  assert.match(strip(fn('normalizeState')),
    /next\.trainingStateGroupId = \(typeof input\.trainingStateGroupId === 'string' && input\.trainingStateGroupId\)\s*\? input\.trainingStateGroupId : null;/,
    'normalised explicitly — malformed values become UNKNOWN, never a group');
});

test('publish staleness still resolves the schedule row from a dated edit', () => {
  assert.match(strip(fn('trainingMarkEdited')), /sessionId = trainingProtocolId\(sessionId\);/);
  assert.match(strip(fn('syncPublishedSessionEdit')), /trainingProtocolId\(sessionId\)/);
});
