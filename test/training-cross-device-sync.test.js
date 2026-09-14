/**
 * TRAINING PLAN CROSS-DEVICE SYNC (TRAINING-SYNC-1).
 *
 * A Weekly Training Plan created/edited on a computer did not reliably appear
 * on a phone:
 *   · adoption was ONE-SHOT — `if (local.length) return` meant a phone that had
 *     ever adopted (or held last week's leftovers) never adopted again;
 *   · the server's publishedRevision was fetched and DISCARDED, so the client
 *     had no way to know a publication was newer than what it held;
 *   · U18 (non-initial groups) kept content under bare `tue`/`thu` keys — keys
 *     that change MEANING every Monday — because their slots carry
 *     sessionId '' and trainingContentKey only matched on sessionId;
 *   · renderTraining loaded publication state BEFORE the slot table existed,
 *     so occurrence checks failed and sat unadopted behind a 20s throttle.
 *
 * Now: `state.trainingAdopted[ck] = {rev, fp}` records what this device last
 * adopted; local blocks that still fingerprint-match that record are safe to
 * replace with a NEWER server revision, while any divergence is unsynced work
 * and is never overwritten. The server's own revision string is the authority
 * — never the device clock. Bare-key content is bridged once to its dated
 * occurrence; U18 bare seeds resolve by WEEKDAY (trainingAttendanceOccurrence's
 * rule); the schedule loads before publication state and releases the
 * publication throttle when it lands.
 *
 * Everything below drives the REAL functions extracted from index.html.
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
const DAY_INDEX = html.match(/const AVAIL_DAY_INDEX = \{[^}]*\};/);
if (!DAY_INDEX) throw new Error('AVAIL_DAY_INDEX not found');

// ONE sandbox holding the real key-resolution + adoption pipeline. `slots` is
// the served training schedule for the operating group; `schedule` the week's
// protocol rows; blocks/adopted the device's local state. Today is pinned —
// a Thursday (2026-09-10), so the current week starts Mon 2026-09-07.
function makeEnv({ slots = [], schedule = [], blocks = {}, adopted = {}, today = '2026-09-10' } = {}) {
  const body =
    '"use strict";\n' +
    'const CFG = arguments[0];\n' +
    'const state = { schedule: CFG.schedule, trainingBlocks: CFG.blocks, trainingAdopted: CFG.adopted };\n' +
    'const _trainingSchedule = { slots: CFG.slots };\n' +
    'function availToday(){ return CFG.today; }\n' +
    DAY_INDEX[0] + '\n' +
    fn('availWeekStart') + '\n' + fn('availAddDays') + '\n' + fn('availSlotDateInWeek') + '\n' +
    fn('trainingDateLabel') + '\n' +
    fn('trainingContentKey') + '\n' + fn('trainingProtocolId') + '\n' +
    fn('trainingPreviousOccurrenceKey') + '\n' +
    fn('trainingBlocksFingerprint') + '\n' + fn('trainingBridgeBareContent') + '\n' +
    fn('trainingAdoptCoachPlans') + '\n' +
    fn('trainingSessionPayload') + '\n' +
    'return { state,\n' +
    '  contentKey: trainingContentKey, protocolId: trainingProtocolId,\n' +
    '  previousKey: trainingPreviousOccurrenceKey, fingerprint: trainingBlocksFingerprint,\n' +
    '  bridge: trainingBridgeBareContent, adopt: trainingAdoptCoachPlans,\n' +
    '  payload: trainingSessionPayload };';
  return new Function(body)({ slots, schedule, blocks, adopted, today });
}

const B = (act, time = '18:00') => [{ id: 'tb' + Math.random(), time, activity: act, keyFocus: 'kf', coach: 'SD' }];

// ---- Fixtures -------------------------------------------------------------
// SENIORS (initial group): slots CARRY sessionId — the pre-existing dated path.
const SEN_SLOTS = [
  { id: 'slot_tue', day: 'Tue', sessionId: 'tue', active: true },
  { id: 'slot_thu', day: 'Thu', sessionId: 'thu', active: true },
];
// U18 (non-initial group): same slot ids, but sessionId '' (pinned inert
// server-side) — the shape that kept U18 on bare keys.
const U18_SLOTS = [
  { id: 'slot_tue', day: 'Tue', sessionId: '', active: true },
  { id: 'slot_thu', day: 'Thu', sessionId: '', active: true },
];
const WEEK_ROWS = [{ id: 'tue', name: 'Tuesday Session' }, { id: 'thu', name: 'Thursday Session' }];
// Current week (today pinned Thu 2026-09-10): Tue=2026-09-08, Thu=2026-09-10.
const CK_TUE = 'slot_tue-20260908', CK_THU = 'slot_thu-20260910';

// ---- Occurrence identity --------------------------------------------------

test('KEYS — Seniors sessionId link and U18 weekday fallback resolve the SAME dated keys (Tue and Thu)', () => {
  const sen = makeEnv({ slots: SEN_SLOTS, schedule: WEEK_ROWS });
  const u18 = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS });
  for (const env of [sen, u18]) {
    assert.equal(env.contentKey('tue'), CK_TUE);
    assert.equal(env.contentKey('thu'), CK_THU);
  }
});

test('KEYS — refusal stays refusal: no slot table, unknown id, ambiguous weekday, inactive slot', () => {
  // No slot table at all → bare id kept.
  assert.equal(makeEnv({ slots: [] }).contentKey('tue'), 'tue');
  // An id that is neither a sessionId nor a legacy seed → itself.
  assert.equal(makeEnv({ slots: U18_SLOTS }).contentKey('extra_session'), 'extra_session');
  // TWO active Tuesday slots → ambiguous → refuse (never guess an identity).
  const two = makeEnv({ slots: [...U18_SLOTS, { id: 'slot_tue2', day: 'Tue', sessionId: '', active: true }] });
  assert.equal(two.contentKey('tue'), 'tue');
  // The only Tuesday slot inactive → no provable occurrence → refuse.
  const inact = makeEnv({ slots: [{ id: 'slot_tue', day: 'Tue', sessionId: '', active: false }, U18_SLOTS[1]] });
  assert.equal(inact.contentKey('tue'), 'tue');
  // Already-dated ids pass through untouched.
  assert.equal(makeEnv({ slots: U18_SLOTS }).contentKey(CK_TUE), CK_TUE);
});

test('KEYS — protocolId is the exact inverse for BOTH groups; only the current week maps back', () => {
  const sen = makeEnv({ slots: SEN_SLOTS, schedule: WEEK_ROWS });
  const u18 = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS });
  for (const env of [sen, u18]) {
    assert.equal(env.protocolId(CK_TUE), 'tue');
    assert.equal(env.protocolId(CK_THU), 'thu');
    // Another week's occurrence answers to itself, not to the seed row.
    assert.equal(env.protocolId('slot_tue-20260901'), 'slot_tue-20260901');
  }
  // U18 maps to the seed ONLY while the schedule row actually exists.
  const noRow = makeEnv({ slots: U18_SLOTS, schedule: [] });
  assert.equal(noRow.protocolId(CK_TUE), CK_TUE);
});

test('KEYS — previous-week key works for U18 bare seeds too (View previous week parity)', () => {
  const sen = makeEnv({ slots: SEN_SLOTS, schedule: WEEK_ROWS });
  const u18 = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS });
  for (const env of [sen, u18]) {
    assert.equal(env.previousKey('tue'), 'slot_tue-20260901');
    assert.equal(env.previousKey(CK_THU), 'slot_thu-20260903');
  }
});

test('KEYS — the publish payload carries the dated occurrenceKey and the blocks that live there', () => {
  const env = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS,
    blocks: { [CK_TUE]: B('Rucking') } });
  const p = env.payload('tue');
  assert.equal(p.occurrenceKey, CK_TUE, 'the payload proves WHICH occurrence it snapshots');
  assert.equal(p.blocks[0].activity, 'Rucking', 'blocks come from the dated key');
});

// ---- CASE A: initial adoption (phone empty) -------------------------------

test('CASE A — empty phone adopts the publication (Seniors and U18, Tue and Thu)', () => {
  for (const slots of [SEN_SLOTS, U18_SLOTS]) {
    const env = makeEnv({ slots, schedule: WEEK_ROWS });
    const changed = env.adopt([
      { id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev1', status: 'published', blocks: B('Warm up') },
      { id: 'thu', occurrenceKey: CK_THU, publishedRevision: 'rev9', status: 'published', blocks: B('Defence') },
    ]);
    assert.equal(changed, true);
    assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Warm up');
    assert.equal(env.state.trainingBlocks[CK_THU][0].activity, 'Defence');
    assert.equal(env.state.trainingAdopted[CK_TUE].rev, 'rev1', 'the adoption RECORDS the server revision');
    assert.equal(env.state.trainingAdopted[CK_THU].rev, 'rev9');
  }
});

// ---- CASE E: repeated publication rev1 → rev2 (THE core production bug) ----

test('CASE E — a phone that adopted rev1 adopts rev2 when the coach republishes (no longer one-shot)', () => {
  const rev1 = B('Warm up v1');
  const env = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS });
  env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev1', status: 'published', blocks: rev1 }]);
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Warm up v1');
  // The coach edits + republishes: same occurrence, NEW revision string.
  const changed = env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev2', status: 'published', blocks: B('Warm up v2') }]);
  assert.equal(changed, true, 'the second publication is adopted');
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Warm up v2');
  assert.equal(env.state.trainingAdopted[CK_TUE].rev, 'rev2');
  // …and a THIRD revision flows too (the record keeps advancing).
  env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev3', status: 'published', blocks: B('Warm up v3') }]);
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Warm up v3');
});

test('CASE E — re-serving the SAME revision adopts nothing (no per-render overwrites, no loops)', () => {
  const env = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS });
  const pub = [{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev1', status: 'published', blocks: B('Warm up') }];
  env.adopt(pub);
  const held = env.state.trainingBlocks[CK_TUE];
  assert.equal(env.adopt(pub), false, 'identical revision → no change reported');
  assert.equal(env.state.trainingBlocks[CK_TUE], held, 'blocks object untouched');
});

// ---- CASE C: local unsynced newer work preserved ---------------------------

test('CASE C — unsynced local edits are NEVER overwritten, even by a newer server revision', () => {
  const env = makeEnv({ slots: SEN_SLOTS, schedule: WEEK_ROWS });
  env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev1', status: 'published', blocks: B('Warm up') }]);
  // The coach on THIS device edits the adopted plan (unsynced work).
  env.state.trainingBlocks[CK_TUE] = B('My local rewrite');
  const changed = env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev2', status: 'published', blocks: B('Server v2') }]);
  assert.equal(changed, false, 'divergent local content blocks adoption');
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'My local rewrite', 'the local work survives');
  assert.equal(env.state.trainingAdopted[CK_TUE].rev, 'rev1', 'the record still names what WAS adopted');
});

test('CASE C — never-adopted local work (no record at all) is also preserved', () => {
  const env = makeEnv({ slots: SEN_SLOTS, schedule: WEEK_ROWS,
    blocks: { [CK_TUE]: B('Authored offline') } });
  const changed = env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev5', status: 'published', blocks: B('Server plan') }]);
  assert.equal(changed, false);
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Authored offline');
});

// ---- CASE D: identical content aligns the record ---------------------------

test("CASE D — the author's own device (identical content) aligns its record so future revisions flow", () => {
  const plan = B('Authored here');
  const env = makeEnv({ slots: SEN_SLOTS, schedule: WEEK_ROWS, blocks: { [CK_TUE]: plan } });
  // The author publishes; the server echoes the same content back as rev1.
  const changed = env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev1', status: 'published',
    blocks: B('Authored here') }]);
  assert.equal(changed, false, 'nothing to adopt — the content is already here');
  assert.equal(env.state.trainingAdopted[CK_TUE].rev, 'rev1', 'but the record is aligned');
  // A colleague then republishes a v2 — the author device NOW adopts it.
  env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev2', status: 'published', blocks: B('Colleague v2') }]);
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Colleague v2');
});

test('CASE D — fingerprints ignore volatile block ids (identical plans match across devices)', () => {
  const env = makeEnv({});
  const a = [{ id: 'tb111', time: '18:00', activity: 'Rucking', keyFocus: 'kf', coach: 'SD' }];
  const b = [{ id: 'tb999', time: '18:00', activity: 'Rucking', keyFocus: 'kf', coach: 'SD' }];
  assert.equal(env.fingerprint(a), env.fingerprint(b), 'ids do not count');
  const c = [{ ...a[0], activity: 'Rucking v2' }];
  assert.notEqual(env.fingerprint(a), env.fingerprint(c), 'content does count');
  // legacy `tag` field counts as keyFocus
  assert.equal(env.fingerprint([{ time: '1', activity: 'x', tag: 'T' }]),
               env.fingerprint([{ time: '1', activity: 'x', keyFocus: 'T' }]));
});

// ---- CASE B + G: U18 stale bare-key phone / bridge -------------------------

test('CASE B — U18 phone with LAST WEEK\'s plan bridged under the bare key adopts this week\'s publication', () => {
  // Pre-fix shape: the phone's only content sits under bare `tue` — last
  // week's plan, untouched since. The bridge copies it to the dated key with
  // {rev:null, fp}; a clean publication (status published = nothing awaiting
  // republish) may then replace the bridged copy.
  const env = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS,
    blocks: { tue: B('Last week leftovers') } });
  assert.equal(env.bridge(), true, 'bare content bridged to the dated key');
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Last week leftovers');
  assert.equal(env.state.trainingAdopted[CK_TUE].rev, null, 'a bridge is NOT a server adoption');
  const changed = env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev1', status: 'published', blocks: B('This week plan') }]);
  assert.equal(changed, true, 'the stale phone finally adopts');
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'This week plan');
  assert.equal(env.state.trainingBlocks.tue[0].activity, 'Last week leftovers', 'the bare key stays as inert history');
});

test('CASE B — a bridged copy is NOT replaced while the publication is stale (unrepublished edits exist somewhere)', () => {
  const env = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS,
    blocks: { tue: B('Genuine work this week') } });
  env.bridge();
  // status 'stale' = someone's edits are NOT in this publication; the bridged
  // local copy could be that someone's work reaching us sideways — keep it.
  const changed = env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev1', status: 'stale', blocks: B('Older snapshot') }]);
  assert.equal(changed, false);
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Genuine work this week');
});

test('CASE B — a bridged copy the user then EDITS becomes unsynced work and is preserved', () => {
  const env = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS,
    blocks: { tue: B('Bridged plan') } });
  env.bridge();
  env.state.trainingBlocks[CK_TUE] = B('Edited after bridge');
  const changed = env.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'rev1', status: 'published', blocks: B('Server plan') }]);
  assert.equal(changed, false);
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Edited after bridge');
});

test('BRIDGE — never overwrites dated content, never runs without a dated resolution, is idempotent', () => {
  // Dated key already holds content → the bridge must not touch it.
  const env = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS,
    blocks: { tue: B('Bare'), [CK_TUE]: B('Dated wins') } });
  assert.equal(env.bridge(), false);
  assert.equal(env.state.trainingBlocks[CK_TUE][0].activity, 'Dated wins');
  // No slot table → contentKey refuses → nothing bridged, nothing lost.
  const bare = makeEnv({ slots: [], schedule: WEEK_ROWS, blocks: { tue: B('Bare only') } });
  assert.equal(bare.bridge(), false);
  assert.equal(bare.state.trainingBlocks.tue[0].activity, 'Bare only');
  // Idempotent: a second run changes nothing.
  const env2 = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS, blocks: { tue: B('Once') } });
  assert.equal(env2.bridge(), true);
  assert.equal(env2.bridge(), false);
});

// ---- CASE G: U18 dated occurrence end-to-end -------------------------------

test('CASE G — U18 computer publish → U18 phone adopt round-trip via the SAME dated key', () => {
  // COMPUTER (U18): plans under the dated key the planner now resolves.
  const computer = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS,
    blocks: { [CK_THU]: B('U18 Thursday plan') } });
  const pub = computer.payload('thu');
  assert.equal(pub.occurrenceKey, CK_THU);
  // PHONE (U18): fresh device, same group → same key → adopts.
  const phone = makeEnv({ slots: U18_SLOTS, schedule: WEEK_ROWS });
  phone.adopt([{ ...pub, publishedRevision: 'rev1', status: 'published' }]);
  assert.equal(phone.state.trainingBlocks[CK_THU][0].activity, 'U18 Thursday plan');
});

test('CASE G — MIGRATION: a pre-fix U18 publication (bare self-referential occurrenceKey) adopts when published this week', () => {
  // Production shape verified read-only: U18 slots are slot_msvgzozt_0 (Tue) /
  // slot_msvh0skf_1 (Thu) with sessionId '', and existing publications carry
  // occurrenceKey 'thu' — the session's own bare id, which proves nothing.
  // Such a record falls to the legacy publishedAt rule.
  const slots = [
    { id: 'slot_msvgzozt_0', day: 'Tue', sessionId: '', active: true },
    { id: 'slot_msvh0skf_1', day: 'Thu', sessionId: '', active: true },
  ];
  const env = makeEnv({ slots, schedule: WEEK_ROWS });
  const changed = env.adopt([{ id: 'thu', occurrenceKey: 'thu', publishedRevision: 'rev1', status: 'published',
    publishedAt: '2026-09-08T18:00:00Z', blocks: B('Pre-fix U18 publication') }]);
  assert.equal(changed, true, 'published THIS week → belongs to this week (publishing only opens in its own week)');
  assert.equal(env.state.trainingBlocks['slot_msvh0skf_1-20260910'][0].activity, 'Pre-fix U18 publication',
    'adopted under the DATED key the planner reads');
  // …but the SAME shape published LAST week is refused.
  const env2 = makeEnv({ slots, schedule: WEEK_ROWS });
  assert.equal(env2.adopt([{ id: 'thu', occurrenceKey: 'thu', publishedRevision: 'rev1', status: 'published',
    publishedAt: '2026-09-03T18:00:00Z', blocks: B('Last week') }]), false, 'a past-week bare-key record stays out');
});

// ---- CASE H + isolation: Seniors regression, group and week isolation ------

test('CASE H — Seniors flow unchanged: sessionId link, adoption, revision flow all work', () => {
  const env = makeEnv({ slots: SEN_SLOTS, schedule: WEEK_ROWS });
  env.adopt([{ id: 'thu', occurrenceKey: CK_THU, publishedRevision: 'rev1', status: 'published', blocks: B('Seniors Thu') }]);
  assert.equal(env.state.trainingBlocks[CK_THU][0].activity, 'Seniors Thu');
  env.adopt([{ id: 'thu', occurrenceKey: CK_THU, publishedRevision: 'rev2', status: 'published', blocks: B('Seniors Thu v2') }]);
  assert.equal(env.state.trainingBlocks[CK_THU][0].activity, 'Seniors Thu v2');
});

test('ISOLATION — a publication for ANOTHER occurrence (or a retired session) is never adopted', () => {
  const env = makeEnv({ slots: SEN_SLOTS, schedule: WEEK_ROWS });
  // occurrenceKey names LAST week's Tuesday → belongs-check refuses.
  assert.equal(env.adopt([{ id: 'tue', occurrenceKey: 'slot_tue-20260901', publishedRevision: 'r', status: 'published', blocks: B('Old week') }]), false);
  // A session id absent from this week's schedule rows → refused.
  assert.equal(env.adopt([{ id: 'retired', occurrenceKey: CK_TUE, publishedRevision: 'r', status: 'published', blocks: B('Ghost') }]), false);
  assert.equal(env.state.trainingBlocks[CK_TUE], undefined);
  // Legacy publication without an occurrenceKey: publishedAt BEFORE this week → refused.
  assert.equal(env.adopt([{ id: 'tue', publishedAt: '2026-09-01T10:00:00Z', publishedRevision: 'r', status: 'published', blocks: B('Legacy old') }]), false);
});

test("ISOLATION — another group's schedule resolves DIFFERENT keys, so its publication cannot land here", () => {
  // The U18 device resolves `tue` via ITS OWN served slot table. A Seniors
  // publication snapshotted for a different slot id carries that occurrence
  // key and fails the belongs-check on the U18 device.
  const u18 = makeEnv({
    slots: [{ id: 'slot_u18tue', day: 'Tue', sessionId: '', active: true }],
    schedule: WEEK_ROWS });
  assert.equal(u18.contentKey('tue'), 'slot_u18tue-20260908');
  const changed = u18.adopt([{ id: 'tue', occurrenceKey: CK_TUE, publishedRevision: 'r', status: 'published', blocks: B('Seniors plan') }]);
  assert.equal(changed, false, "the Seniors occurrence key does not belong to the U18 planner");
  assert.deepEqual(u18.state.trainingBlocks, {}, 'nothing written');
});

// ---- CASE F: boot race + source pins ---------------------------------------

test('CASE F — renderTraining ensures the schedule BEFORE loading publication state', () => {
  const idx = html.indexOf('so a colleague\'s publish shows up without a page reload');
  assert.ok(idx > 0, 'the planner pub-load block exists');
  const region = html.slice(idx, idx + 900);
  const ensureAt = region.indexOf('ensureTrainingSchedule()');
  const loadAt = region.indexOf('loadTrainingPublicationState()');
  assert.ok(ensureAt > 0 && loadAt > ensureAt,
    'ensureTrainingSchedule() runs first, so occurrence keys are resolvable when publications land');
});

test('CASE F — a landing schedule releases the publication throttle (the race self-heals, no manual navigation)', () => {
  const src = fn('loadTrainingSchedule');
  const okPath = src.slice(src.indexOf('_trainingSchedule = data'));
  assert.match(okPath, /_trainingPubLoadedAt = 0/,
    'the success path resets the 20s throttle so the next render refetches + adopts');
});

test('PIN — loadTrainingPublicationState KEEPS publishedRevision (it used to be discarded)', () => {
  const src = fn('loadTrainingPublicationState');
  assert.match(src, /publishedRevision: s\.publishedRevision \|\| null/, 'the server revision reaches _trainingPubState');
  assert.match(src, /trainingBridgeBareContent\(\)/, 'bare content is bridged before adoption');
  const bridgeAt = src.indexOf('trainingBridgeBareContent()');
  const adoptAt = src.indexOf('trainingAdoptCoachPlans(data.sessions');
  assert.ok(bridgeAt > 0 && adoptAt > bridgeAt, 'bridge BEFORE adopt');
});

test('PIN — trainingAdopted is device state: defaulted, captured per group, cleared on club switch', () => {
  assert.match(html, /next\.trainingAdopted\s+=/, 'normalizeState default exists');
  assert.match(fn('captureTrainingState'), /trainingAdopted:\s+structuredClone\(state\.trainingAdopted \|\| \{\}\)/,
    'group capture includes the adoption records');
  assert.match(fn('adoptTrainingState'), /state\.trainingAdopted\s+=\s+fresh\.trainingAdopted \|\| \{\}/,
    'group restore includes the adoption records');
  const clubSwitch = html.indexOf('state.trainingByGroup = {};');
  assert.ok(clubSwitch > 0 && html.slice(clubSwitch - 400, clubSwitch + 400).includes('state.trainingAdopted = {};'),
    'club switch clears adoption records beside trainingByGroup');
});

test('PIN — the server clock is never the authority: adoption compares REVISION STRINGS only', () => {
  const src = fn('trainingAdoptCoachPlans');
  assert.ok(!/Date\.now|new Date/.test(src), 'no device clock in the adoption decision');
  assert.match(src, /srvRev !== String\(ad\.rev\)/, 'revision inequality is the trigger');
});

test('PIN — RC4.10A intact: the sessions-list sync still sends blocks: [] (content travels ONLY via explicit publish)', () => {
  const src = fn('syncSessionsToServer');
  assert.match(src, /blocks: \[\]/, 'schedule metadata sync must not regrow content publishing');
});
