/**
 * TRAINING PLANNER UX + GROUP-SPECIFIC START TIME.
 *
 * Four real complaints, four root causes pinned here:
 *
 *  A. Blocks stayed giant: all three planner textareas carried an inline
 *     min-height:180px, so a finished one-line block was still a 180px empty
 *     rectangle and long plans became a scrolling chore.
 *  B. "+ Add block" lived in the header ABOVE the table — on a phone you had
 *     to scroll the whole plan back up to add the next block.
 *  C. A new block was created with activity:"New session block" — real
 *     content the coach had to delete before typing.
 *  D. The first block's time was HARD-CODED "19:45" — the Seniors evening —
 *     so planning a U18 session inherited it regardless of U18's own
 *     configured training time.
 *
 * Contract: blocks size to their content (comfortable only while focused),
 * ONE add control sits directly under the last block, new blocks are empty
 * with guidance as placeholders, and the opening time is resolved from the
 * PLANNED GROUP's own schedule — never a default, never another group's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

// The planner block markup (the three textareas + the add control).
const PLANNER = src.slice(src.indexOf('<table class="training-gs-table"'),
                          src.indexOf('No session plan yet'));

// ─── A. Height: content-sized, comfortable only while editing ──────────────
test('1+2: no block is forced to a giant fixed height; the block being edited gets comfortable room', () => {
  assert.doesNotMatch(PLANNER, /min-height:180px/, 'the 180px floor is gone from every planner textarea');
  assert.equal((PLANNER.match(/class="tb-auto"/g) || []).length, 3, 'all three fields autosize');
  const css = src.slice(src.indexOf('.training-gs-table textarea.tb-auto'), src.indexOf('.gs-time-input'));
  assert.match(css, /textarea\.tb-auto \{[^}]*min-height:40px/, 'compact resting height');
  assert.match(css, /textarea\.tb-auto:focus \{[^}]*min-height:132px/, 'comfortable while editing (min-height wins over the content height)');
  assert.doesNotMatch(css, /transition:min-height/,
    'never animate min-height: autosize neutralises it to measure, and an animating value defeats every measurement');
  // The mobile !important floor must not capture autosizing blocks (it forced
  // every block to 92px on phones — the original complaint).
  const mobile = src.slice(src.indexOf('@media (max-width: 640px)'), src.indexOf('@media (max-width: 600px)'));
  assert.match(mobile, /textarea:not\(\.tb-auto\) \{ min-height: 92px !important/, 'the 92px floor is scoped away from planner blocks');
  assert.match(mobile, /textarea\.tb-auto \{ min-height: 44px/, 'phones get the compact resting height too');
});

test('11: long content always wins — autosize grows the field to its scrollHeight', () => {
  const auto = fn('tbAutosize');
  assert.match(auto, /el\.style\.minHeight = '0px'/, 'measure free of any min-height floor');
  assert.match(auto, /el\.style\.height = '0px'/, 'measure at zero height — `auto` reports a stretched row instead of the text');
  assert.match(auto, /el\.scrollHeight/, 'height follows the real content');
  const run = new Function(`
    "use strict";
    ${auto}
    const el = { scrollHeight: 512, style: {} };
    tbAutosize(el);
    const long = el.style.height;
    const small = { scrollHeight: 42, style: {} };
    tbAutosize(small);
    const compact = small.style.height;
    tbAutosize(small, true);
    return { long, compact, editing: small.style.height };
  `)();
  assert.equal(run.long, '512px', 'a long block renders at full content height');
  assert.equal(run.compact, '42px', 'a short finished block is exactly its content');
  assert.equal(run.editing, '132px', 'the block being edited keeps comfortable room');
});

test('6: leaving a block compacts it — every block is re-sized to its own content after each render', () => {
  assert.match(fn('trainingAutosizeBlocks'), /#coach-training textarea\.tb-auto/, 'all planner blocks re-sized');
  assert.match(fn('trainingAutosizeBlocks'), /forEach\(el => tbAutosize\(el, document\.activeElement === el\)\)/,
    'only the block actually being edited keeps the comfortable floor');
  assert.match(PLANNER, /onblur="tbBlur\(this\)"/, 'blur recompacts');
  assert.match(fn('tbBlur'), /setTimeout\(\(\) => tbAutosize\(el\), 0\)/,
    'deferred a tick so the measurement happens after focus styling is dropped');
  assert.match(src, /trainingAutosizeBlocks\(\);\n    \}/, 'called at the end of the planner render');
});

// ─── B. The add control sits under the last block ──────────────────────────
test('3+13: exactly ONE "+ Add block" control, directly after the blocks (reachable on a phone)', () => {
  const plannerStart = src.indexOf('const twNav = `');
  const planner = src.slice(plannerStart, src.indexOf('// ─── MATCH CENTRE', plannerStart));
  const adds = planner.match(/onclick="addTimeBlock\('\$\{sessId\}'\)"/g) || [];
  assert.equal(adds.length, 2, 'one after the blocks table + one in the empty state (never two at once)');
  const tableEnd = planner.indexOf('</table></div>');
  const addAfterTable = planner.indexOf('addTimeBlock', tableEnd);
  assert.ok(addAfterTable > tableEnd && addAfterTable - tableEnd < 600,
    'the control renders immediately below the last block, not up in the header');
  const header = planner.slice(0, planner.indexOf('<table class="training-gs-table"'));
  assert.doesNotMatch(header, /addTimeBlock/, 'no distant header button remains');
});

// ─── C. New blocks are EMPTY; guidance is placeholder-only ─────────────────
test('4+5+7: adding creates exactly one EMPTY block and never disturbs existing content', () => {
  const h = plannerHarness({ blocks: [{ id: 'b1', time: '18:00', activity: 'Ruck drill', keyFocus: 'body height' }] });
  h.addTimeBlock('sess-1');
  assert.equal(h.blocks().length, 2, 'exactly one new block');
  assert.deepEqual(h.blocks()[0], { id: 'b1', time: '18:00', activity: 'Ruck drill', keyFocus: 'body height' },
    'the previous block is byte-identical — nothing lost');
  assert.equal(h.blocks()[1].activity, '', 'the new block starts EMPTY (was "New session block")');
  assert.equal(h.blocks()[1].keyFocus, undefined, 'no phantom text in any field');
});

test('8+9: guidance is placeholder text on the inputs and can never become saved content', () => {
  assert.match(PLANNER, /placeholder="Short title \(e\.g\. Ruck drill\)"/);
  assert.match(PLANNER, /placeholder="Key coaching points, cues and targets[^"]*"/);
  assert.match(PLANNER, /placeholder="Lead coach, assistants, responsibilities…"/);
  assert.doesNotMatch(fn('addTimeBlock'), /activity: *"New session block"/, 'no starter content is written into the block');
  assert.match(fn('addTimeBlock'), /activity: ""/, 'block content genuinely starts empty');
  // Placeholders live only in the markup attribute, never in the value slot.
  assert.doesNotMatch(PLANNER, />\$\{[^}]*placeholder/, 'no placeholder string is ever rendered as a value');
});

// ─── Harness over the REAL addTimeBlock + time resolver ────────────────────
function plannerHarness({ blocks = [], schedule = [], slots = null, scheduleGroup = 'grp_x', groupParam = 'grp_x' } = {}) {
  return new Function(`
    "use strict";
    const state = { trainingBlocks: { 'sess-1': ${JSON.stringify(blocks)} }, schedule: ${JSON.stringify(schedule)} };
    const notes = [];
    const _trainingSchedule = ${slots === null ? 'null' : JSON.stringify({ slots })};
    const _trainingScheduleGroupId = ${JSON.stringify(scheduleGroup)};
    function trainingGroupParam() { return ${JSON.stringify(groupParam)}; }
    function notify(m) { notes.push(m); }
    function syncPublishedSessionEdit() {}
    const document = { querySelector: () => null, querySelectorAll: () => [] };
    const setTimeout = f => f();
    function tbAutosize() {}
    ${fn('trainingPlannedStartTime')}
    ${fn('addTimeBlock')}
    return {
      addTimeBlock, trainingPlannedStartTime, notes,
      blocks: () => state.trainingBlocks['sess-1'],
    };
  `)();
}

// ─── D. Group-specific start time ──────────────────────────────────────────
const SEN_SLOTS = [{ id: 'slot_sen', day: 'Tue', startTime: '19:45', active: true }];
const U18_SLOTS = [{ id: 'slot_u18', day: 'Wed', startTime: '17:45', active: true }];
const U16_SLOTS = [{ id: 'slot_u16', day: 'Mon', startTime: '17:00', active: true }];
const WOM_SLOTS = [{ id: 'slot_wom', day: 'Thu', startTime: '20:15', active: true }];

test('14+15+16+17+18: every group opens at ITS OWN configured start time — never 19:45 by default', () => {
  const cases = [
    ['grp_initial', SEN_SLOTS, '19:45'],
    ['grp_u18', U18_SLOTS, '17:45'],
    ['grp_u16', U16_SLOTS, '17:00'],
    ['grp_wom', WOM_SLOTS, '20:15'],
  ];
  for (const [gid, slots, expected] of cases) {
    const h = plannerHarness({ slots, scheduleGroup: gid, groupParam: gid });
    h.addTimeBlock('sess-1');
    assert.equal(h.blocks()[0].time, expected, `${gid} opens at its own time`);
  }
  assert.doesNotMatch(fn('addTimeBlock'), /"19:45"/, 'the hard-coded Seniors evening is gone');
});

test('15/16 (the reported bug): a Seniors-cached schedule can never answer for U18, and vice versa', () => {
  // Coach was in Seniors; the U18 planner asks before U18's schedule arrives.
  const stale = plannerHarness({ slots: SEN_SLOTS, scheduleGroup: 'grp_initial', groupParam: 'grp_u18' });
  stale.addTimeBlock('sess-1');
  assert.equal(stale.blocks()[0].time, '', 'refuses the previous group\'s 19:45 — honest empty, never inherited');
  // Once U18's own schedule is in force, it answers.
  const fresh = plannerHarness({ slots: U18_SLOTS, scheduleGroup: 'grp_u18', groupParam: 'grp_u18' });
  fresh.addTimeBlock('sess-1');
  assert.equal(fresh.blocks()[0].time, '17:45');
  // And back the other way.
  const back = plannerHarness({ slots: SEN_SLOTS, scheduleGroup: 'grp_initial', groupParam: 'grp_initial' });
  back.addTimeBlock('sess-1');
  assert.equal(back.blocks()[0].time, '19:45');
});

test('19: a group with no configured schedule gets an honest empty time, not another group\'s', () => {
  const none = plannerHarness({ slots: [], scheduleGroup: 'grp_new', groupParam: 'grp_new' });
  none.addTimeBlock('sess-1');
  assert.equal(none.blocks()[0].time, '', 'empty — the coach types it');
  const unloaded = plannerHarness({ slots: null, scheduleGroup: '', groupParam: 'grp_new' });
  unloaded.addTimeBlock('sess-1');
  assert.equal(unloaded.blocks()[0].time, '', 'nothing invented while the schedule is still loading');
});

test('the session\'s OWN start time wins (dated occurrences carry their slot\'s time)', () => {
  const h = plannerHarness({
    schedule: [{ id: 'sess-1', title: 'U18 Wednesday', startTime: '17:45' }],
    slots: SEN_SLOTS, scheduleGroup: 'grp_initial', groupParam: 'grp_initial',
  });
  h.addTimeBlock('sess-1');
  assert.equal(h.blocks()[0].time, '17:45', 'the planned session\'s own time beats any schedule default');
});

test('20: subsequent blocks step 30 minutes from the previous one, from whatever the group opened at', () => {
  const h = plannerHarness({ slots: U18_SLOTS, scheduleGroup: 'grp_u18', groupParam: 'grp_u18' });
  h.addTimeBlock('sess-1');
  h.addTimeBlock('sess-1');
  h.addTimeBlock('sess-1');
  assert.deepEqual(h.blocks().map(b => b.time), ['17:45', '18:15', '18:45']);
});

test('a blank first time never corrupts later blocks', () => {
  const h = plannerHarness({ slots: [], scheduleGroup: 'grp_new', groupParam: 'grp_new' });
  h.addTimeBlock('sess-1');
  h.addTimeBlock('sess-1');
  assert.deepEqual(h.blocks().map(b => b.time), ['', ''], 'no NaN:NaN times');
});

// ─── Persistence / ordering / focus ────────────────────────────────────────
test('10+12: existing populated blocks render their stored content, in order, unchanged', () => {
  assert.match(PLANNER, /\$\{blocks\.map\(b=>`/, 'rows come from the stored block list, in order');
  assert.match(PLANNER, /value="\$\{b\.time\}"/, 'stored time rendered');
  assert.match(PLANNER, /\$\{b\.activity\.replace/, 'stored activity rendered (escaped)');
  assert.match(PLANNER, /\$\{\(b\.keyFocus\|\|""\)\.replace/, 'stored key focus rendered');
  assert.match(PLANNER, /\$\{\(b\.coach\|\|""\)\.replace/, 'stored lead coach rendered');
  const upd = fn('updateTimeBlock');
  assert.match(upd, /b\[field\] = val; saveState\(\)/, 'edits persist per keystroke — a re-render never loses text');
});

test('the coach lands in the new block, and adding still marks the session edited', () => {
  const add = fn('addTimeBlock');
  assert.match(add, /el\.focus\(/, 'focus moves into the new block');
  assert.match(add, /'activity'/, 'specifically its first field');
  assert.match(add, /syncPublishedSessionEdit\(sessionId\)/, 'published sessions still flip to "changes not republished"');
  const h = plannerHarness({});
  h.addTimeBlock('sess-1');
  assert.deepEqual(h.notes, ['Time block added'], 'one confirmation, unchanged');
});

// ─── 21+22: nothing else moved ─────────────────────────────────────────────
test('21+22: training persistence and authorization are untouched by this change', () => {
  assert.match(fn('syncSessionsToServer'), /return res\.ok/, 'the 50a64399 persistence contract still holds');
  assert.match(fn('saveSessionForm'), /device only/, 'truthful save copy intact');
  assert.match(fn('trainingGroupParam'), /state\.activeView === 'player'/, 'group param rules unchanged');
  assert.doesNotMatch(fn('addTimeBlock'), /fetch\(/, 'the planner never bypasses the existing save paths');
});
