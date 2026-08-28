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

// The planner block markup. The row itself now lives in trainingBlockRowHTML
// (so add-block can append ONE row instead of re-rendering the whole app), so
// the markup under test is that function PLUS the table/add-control region.
const PLANNER = src.slice(src.indexOf('    function trainingBlockRowHTML('),
                          src.indexOf('    function removeTimeBlock(')) +
  src.slice(src.indexOf('<table class="training-gs-table"'),
            src.indexOf('No session plan yet'));

// ─── A. Height: content-sized, comfortable only while editing ──────────────
test('1+2: no block is forced to a giant fixed height; the block being edited gets comfortable room', () => {
  assert.doesNotMatch(PLANNER, /min-height:180px/, 'the 180px floor is gone from every planner textarea');
  // The three fields share one builder now, so count the FIELDS rather than
  // copies of the markup — the guarantee is that each one autosizes.
  assert.match(PLANNER, /<textarea class="tb-auto"/, 'planner fields autosize');
  for (const field of ['activity', 'keyFocus', 'coach']) {
    assert.ok(PLANNER.includes(`ta('${field}',`), `${field} is an autosizing field`);
  }
  const css = src.slice(src.indexOf('.training-gs-table textarea.tb-auto'), src.indexOf('.gs-time-input'));
  assert.match(css, /textarea\.tb-auto \{[^}]*min-height:40px/, 'compact resting height');
  // The :focus floor (40 -> 132) was itself the "page keeps resizing" bug: it
  // grew the page ~92px on every click into a field and shrank it on blur. A
  // block gets its room by GROWING to its content instead.
  assert.doesNotMatch(css, /textarea\.tb-auto:focus \{[^}]*min-height/,
    'a block may never change height just because it gained focus');
  assert.doesNotMatch(css, /transition:min-height/,
    'never animate min-height: autosize neutralises it to measure, and an animating value defeats every measurement');
  // The mobile !important floor must not capture autosizing blocks (it forced
  // every block to 92px on phones — the original complaint).
  const mobile = src.slice(src.indexOf('@media (max-width: 640px)'), src.indexOf('@media (max-width: 600px)'));
  assert.match(mobile, /textarea:not\(\.tb-auto\) \{ min-height: 92px !important/, 'the 92px floor is scoped away from planner blocks');
  assert.match(mobile, /textarea\.tb-auto \{ min-height: 44px/, 'phones get the compact resting height too');
  assert.doesNotMatch(mobile, /textarea\.tb-auto:focus \{ min-height/,
    'and no focus jump on a phone either — it moved the layout under the thumb');
});

test('11: long content always wins — autosize grows the field to its scrollHeight', () => {
  const auto = fn('tbAutosize');
  assert.match(auto, /el\.style\.minHeight = '0px'/, 'measure free of any min-height floor');
  assert.match(auto, /el\.style\.height = '0px'/, 'measure at zero height — `auto` reports a stretched row instead of the text');
  assert.match(auto, /el\.scrollHeight/, 'height follows the real content');
  const run = new Function(`
    "use strict";
    const TB_MIN_HEIGHT = 40;
    ${auto}
    const el = { scrollHeight: 512, style: {} };
    tbAutosize(el);
    const long = el.style.height;
    const small = { scrollHeight: 42, style: {} };
    tbAutosize(small);
    const compact = small.style.height;
    tbAutosize(small, true);   // a stray second argument must change nothing
    return { long, compact, ignoresEditingFlag: small.style.height };
  `)();
  assert.equal(run.long, '512px', 'a long block renders at full content height');
  assert.equal(run.compact, '42px', 'a short finished block is exactly its content');
  assert.equal(run.ignoresEditingFlag, '42px',
    'height depends ONLY on content — no caller can reintroduce a focus-dependent floor');
});

test('6: every block is sized to its own content after a render, inside one frame', () => {
  const sizer = fn('trainingAutosizeBlocks');
  assert.match(sizer, /#coach-training textarea\.tb-auto/, 'all planner blocks re-sized');
  assert.match(sizer, /forEach\(tbAutosize\)/, 'sized purely from content — focus is not consulted');
  assert.match(sizer, /requestAnimationFrame\(size\)/, 'second pass for the stacked mobile row');
  // A pass scheduled long after paint made the whole table visibly jump a
  // moment after every render. That was the flicker the coach reported.
  assert.doesNotMatch(sizer, /setTimeout\(size, 1[0-9]{2}\)/,
    'no late pass may re-lay the table out after the browser has painted');
  assert.match(src, /trainingAutosizeBlocks\(\);\n    \}/, 'called at the end of the planner render');
  // Blur no longer needs to resize anything, so the handler is gone entirely.
  assert.doesNotMatch(PLANNER, /onblur=/, 'no blur handler is needed once height is focus-independent');
});

// ─── B. The add control sits under the last block ──────────────────────────
test('3+13: exactly ONE "+ Add block" control, directly after the blocks (reachable on a phone)', () => {
  const plannerStart = src.indexOf('const twNav = `');
  const planner = src.slice(plannerStart, src.indexOf('// ─── MATCH CENTRE', plannerStart));
  const adds = planner.match(/onclick="addTimeBlock\('\$\{sessId\}'\)/g) || [];
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
  assert.match(PLANNER, /placeholder="\$\{placeholder\}"/, 'guidance is rendered into the placeholder attribute');
  assert.match(PLANNER, /ta\('activity', 'Short title \(e\.g\. Ruck drill\)'/);
  assert.match(PLANNER, /ta\('keyFocus', 'Key coaching points, cues and targets[^']*'/);
  assert.match(PLANNER, /ta\('coach', 'Lead coach, assistants, responsibilities…'/);
  assert.doesNotMatch(fn('addTimeBlock'), /activity: *"New session block"/, 'no starter content is written into the block');
  assert.match(fn('addTimeBlock'), /activity: ""/, 'block content genuinely starts empty');
  // Placeholders live only in the markup attribute, never in the value slot.
  assert.doesNotMatch(PLANNER, />\$\{placeholder\}</, 'no placeholder string is ever rendered as a value');
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
    function saveState(m) { notes.push(m); }
    function showToast() {}
    function renderTraining() { renders.push('renderTraining'); }
    function render() { renders.push('render'); }
    const renders = [];
    let _tbSeq = 0;
    function trainingBlockRowHTML() { return '<tr></tr>'; }
    function syncPublishedSessionEdit() {}
    const document = { querySelector: () => null, querySelectorAll: () => [] };
    const setTimeout = f => f();
    const requestAnimationFrame = f => f();
    const CSS = { escape: v => String(v) };
    function tbAutosize() {}
    ${fn('trainingPlannedStartTime')}
    ${fn('addTimeBlock')}
    return {
      addTimeBlock, trainingPlannedStartTime, notes, renders,
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
  assert.match(PLANNER, /blocks\.map\(b => trainingBlockRowHTML\(sessId, b\)\)/, 'rows come from the stored block list, in order');
  assert.match(PLANNER, /value="\$\{esc\(String\(b\.time \|\| ''\)\)\}"/, 'stored time rendered (escaped)');
  assert.match(PLANNER, /ta\('activity',/, 'stored activity rendered');
  assert.match(PLANNER, /ta\('keyFocus',/, 'stored key focus rendered');
  assert.match(PLANNER, /ta\('coach',/, 'stored lead coach rendered');
  assert.match(PLANNER, /String\(value \|\| ""\)\.replace\(\/<\/g,"&lt;"\)/, 'every stored value is escaped');
  const upd = fn('updateTimeBlock');
  assert.match(upd, /b\[field\] = val; saveState\(\)/, 'edits persist per keystroke — a re-render never loses text');
});

test('the coach lands in the new block, and adding still marks the session edited', () => {
  const add = fn('addTimeBlock');
  assert.match(add, /el\.focus\(/, 'focus moves into the new block');
  // The row is now found by its own id and the first autosizing field inside
  // it focused — the old attribute-substring selector could not survive the
  // row markup moving into trainingBlockRowHTML.
  assert.match(add, /tr\[data-block-id="/, 'the new row is located by its own id');
  assert.match(add, /querySelector\('textarea\.tb-auto'\)/, 'specifically its first field');
  assert.match(add, /scrollIntoView/, 'and the new block is brought into view');
  assert.match(add, /syncPublishedSessionEdit\(sessionId\)/, 'published sessions still flip to "changes not republished"');
  const h = plannerHarness({});
  h.addTimeBlock('sess-1');
  assert.deepEqual(h.notes, ['Time block added'], 'one confirmation, unchanged');
  // notify() rebuilt the ENTIRE application and, because render() replaces
  // innerHTML, took the coach's focused field with it.
  // Assert against CODE, not prose — the comment above the fix names notify()
  // to explain why it was removed.
  const addCode = add.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.doesNotMatch(addCode, /notify\(/, 'adding a block must never trigger a whole-app render');
  assert.doesNotMatch(addCode, /[^a-zA-Z]render\(\)/, 'nor any other whole-app render');
  assert.match(addCode, /insertAdjacentHTML/, 'an existing table gains ONE row');
  assert.match(addCode, /renderTraining\(\)/, 'only the first block rebuilds the card, to clear the empty state');
});

// ─── 21+22: nothing else moved ─────────────────────────────────────────────
test('21+22: training persistence and authorization are untouched by this change', () => {
  assert.match(fn('syncSessionsToServer'), /return res\.ok/, 'the 50a64399 persistence contract still holds');
  assert.match(fn('saveSessionForm'), /device only/, 'truthful save copy intact');
  assert.match(fn('trainingGroupParam'), /state\.activeView === 'player'/, 'group param rules unchanged');
  assert.doesNotMatch(fn('addTimeBlock'), /fetch\(/, 'the planner never bypasses the existing save paths');
});

// ═══════════════════════════════════════════════════════════════════════════
// STABILITY — the planner must not move, flicker or lose text while a coach
// works in it. Every test below pins one measured cause of "it feels vibe
// coded": a full-app render on every block mutation (~44ms, and render()
// replaces innerHTML, so the focused field and the phone keyboard went with
// it), a focus-dependent min-height that resized the page on every click, and
// a third autosize pass scheduled after paint.
// ═══════════════════════════════════════════════════════════════════════════

// A DOM real enough to exercise the add/remove paths honestly: rows are kept
// in an array so we can assert what was appended, and NOT rebuilt wholesale.
function plannerDom(initialRows = []) {
  const rows = initialRows.map(id => ({ id, removed: false }));
  const tbody = {
    insertAdjacentHTML(pos, html) { rows.push({ id: (html.match(/data-block-id="([^"]+)"/) || [])[1], html }); },
  };
  const doc = {
    _rows: rows,
    querySelector(sel) {
      if (sel.includes('tbody')) return rows.length ? tbody : null;
      const m = sel.match(/data-block-id="([^"]+)"/);
      if (m) {
        const row = rows.find(r => r.id === m[1] && !r.removed);
        return row ? { querySelector: () => ({ focus() {}, style: {} }),
                       scrollIntoView() { doc._scrolled = true; },
                       remove() { row.removed = true; } } : null;
      }
      return null;
    },
    querySelectorAll: () => [],
    getElementById: () => null,
    activeElement: null,
  };
  return { doc, rows };
}

function stabilityHarness({ blocks = [], domRows = null } = {}) {
  const { doc, rows } = plannerDom(domRows === null ? blocks.map(b => b.id) : domRows);
  const calls = [];
  const scope = new Function('doc', 'calls', `
    "use strict";
    const state = { trainingBlocks: { s1: ${JSON.stringify(blocks)} }, schedule: [] };
    const _trainingSchedule = null, _trainingScheduleGroupId = '';
    function trainingGroupParam() { return ''; }
    function saveState(m) { calls.push('saveState'); }
    function showToast() {}
    function render() { calls.push('render'); }
    function renderTraining() { calls.push('renderTraining'); }
    function syncPublishedSessionEdit() { calls.push('sync'); }
    function trainingBlockRowHTML(sid, b) { return '<tr data-block-id="' + b.id + '"></tr>'; }
    function tbAutosize() {}
    function esc(v) { return String(v); }
    const document = doc;
    const CSS = { escape: v => String(v) };
    const requestAnimationFrame = f => f();
    let _tbSeq = 0;
    ${fn('trainingPlannedStartTime')}
    ${fn('addTimeBlock')}
    ${fn('removeTimeBlock')}
    return { addTimeBlock, removeTimeBlock, blocks: () => state.trainingBlocks.s1 };
  `)(doc, calls);
  return { ...scope, calls, rows, doc };
}

test('TRAIN-1: New Block creates exactly one block, every time, with a unique id', () => {
  const h = stabilityHarness({ blocks: [{ id: 'b1', time: '19:00', activity: 'Warm-up' }] });
  for (let i = 0; i < 25; i++) h.addTimeBlock('s1');
  assert.equal(h.blocks().length, 26, '25 clicks produced exactly 25 blocks');
  assert.equal(new Set(h.blocks().map(b => b.id)).size, 26,
    'ids are unique — Date.now() alone collided inside a millisecond, and two rows sharing an id means editing one edits the other');
  assert.deepEqual(h.blocks()[0], { id: 'b1', time: '19:00', activity: 'Warm-up' }, 'the existing block is untouched');
});

test('TRAIN-2/3: adding a block appends ONE row and never re-renders the app', () => {
  const h = stabilityHarness({ blocks: [{ id: 'b1', time: '19:00' }] });
  h.addTimeBlock('s1');
  assert.ok(!h.calls.includes('render'),
    'a whole-app render replaces innerHTML and takes the focused field with it');
  assert.ok(!h.calls.includes('renderTraining'), 'an existing table is not rebuilt either');
  assert.equal(h.rows.length, 2, 'exactly one row was appended');
  assert.equal(h.rows[1].id, h.blocks()[1].id, 'and it is the row for the new block');
});

test('TRAIN-4: the FIRST block still rebuilds the card, to clear the empty state', () => {
  const h = stabilityHarness({ blocks: [], domRows: [] });
  h.addTimeBlock('s1');
  assert.equal(h.blocks().length, 1);
  assert.ok(h.calls.includes('renderTraining'),
    'there is no table to append to yet — the empty state must be replaced');
  assert.ok(!h.calls.includes('render'), 'but still not the whole application');
});

test('TRAIN-5: the new block is focused AND scrolled into view', () => {
  const h = stabilityHarness({ blocks: [{ id: 'b1' }] });
  h.addTimeBlock('s1');
  assert.equal(h.doc._scrolled, true,
    'the row was created below the fold while "+ Add block" jumped ~400px down the page — the click looked like it had done nothing');
});

test('TRAIN-6: removing a block drops its row only, keeping the coach in place', () => {
  const h = stabilityHarness({ blocks: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }] });
  h.removeTimeBlock('s1', 'b2');
  assert.deepEqual(h.blocks().map(b => b.id), ['b1', 'b3'], 'the right block went');
  assert.ok(!h.calls.includes('render'), 'no whole-app render');
  assert.ok(!h.calls.includes('renderTraining'), 'and no card rebuild while blocks remain');
  assert.equal(h.rows.find(r => r.id === 'b2').removed, true, 'just that row was removed');
});

test('TRAIN-7: removing the LAST block rebuilds the card so the empty state returns', () => {
  const h = stabilityHarness({ blocks: [{ id: 'only' }] });
  h.removeTimeBlock('s1', 'only');
  assert.equal(h.blocks().length, 0);
  assert.ok(h.calls.includes('renderTraining'), 'the empty state has to come back');
});

test('TRAIN-8: a published session\'s async status refresh never renders over a coach mid-edit', () => {
  const marked = fn('trainingMarkEdited');
  // It fires 700ms after a keystroke and then waits on the network, so it
  // lands while the coach is still typing. render() would replace the planner
  // DOM — the reason a value had to be entered two or three times, and only on
  // published sessions.
  assert.match(marked, /}, 700\);/, 'still debounced');
  assert.match(marked, /getElementById\('coach-training'\)\s*\n?\s*\?\.contains\(document\.activeElement\)/,
    'the render is skipped while focus is inside the planner');
  const guardIdx = marked.indexOf('contains(document.activeElement)');
  const renderIdx = marked.lastIndexOf('render();');
  assert.ok(guardIdx > -1 && guardIdx < renderIdx, 'the guard must come BEFORE the render, not after it');
  assert.match(marked.slice(guardIdx, renderIdx), /return/, 'and it must return, not merely warn');
});

test('TRAIN-9: a block\'s height depends on its text alone — never on focus', () => {
  const run = new Function(`
    "use strict";
    const TB_MIN_HEIGHT = 40;
    ${fn('tbAutosize')}
    const el = { scrollHeight: 60, style: {} };
    tbAutosize(el);            const resting = el.style.height;
    el.scrollHeight = 60;
    tbAutosize(el, true);      const focused = el.style.height;
    tbAutosize(el, false);     const blurred = el.style.height;
    return { resting, focused, blurred };
  `)();
  assert.equal(run.resting, '60px');
  assert.equal(run.focused, '60px', 'focusing a block may not resize it');
  assert.equal(run.blurred, '60px', 'nor may leaving it');
  // The CSS half of the same guarantee.
  const css = src.slice(src.indexOf('.training-gs-table textarea.tb-auto'), src.indexOf('.gs-time-input'));
  assert.doesNotMatch(css, /:focus[^}]*min-height/, 'no focus-dependent floor in CSS either');
});

test('TRAIN-10: measuring restores the CSS floor it borrowed', () => {
  // Autosize zeroes min-height to measure the real text height. If it failed to
  // put it back, the CSS floor would be destroyed on the first keystroke and
  // every block would collapse to its content with no resting height at all.
  const run = new Function(`
    "use strict";
    const TB_MIN_HEIGHT = 40;
    ${fn('tbAutosize')}
    const el = { scrollHeight: 12, style: { minHeight: '40px', height: '' } };
    tbAutosize(el);
    return { minHeight: el.style.minHeight, height: el.style.height };
  `)();
  assert.equal(run.minHeight, '40px', 'the borrowed min-height is restored');
  assert.equal(run.height, '40px', 'and a near-empty block rests at the floor, not at 12px');
});

test('TRAIN-11: per-keystroke edits still persist, and touch only their own block', () => {
  const upd = fn('updateTimeBlock');
  assert.match(upd, /b\[field\] = val; saveState\(\)/, 'every keystroke is committed to state and saved');
  const run = new Function(`
    "use strict";
    const state = { trainingBlocks: { s1: [
      { id: 'b1', time: '19:00', activity: 'Warm-up' },
      { id: 'b2', time: '19:30', activity: 'Handling' }] } };
    let saves = 0;
    function saveState() { saves++; }
    function syncPublishedSessionEdit() {}
    ${upd}
    updateTimeBlock('s1', 'b2', 'time', '19:45');
    updateTimeBlock('s1', 'b2', 'activity', 'Handling under pressure');
    return { blocks: state.trainingBlocks.s1, saves };
  `)();
  assert.deepEqual(run.blocks[0], { id: 'b1', time: '19:00', activity: 'Warm-up' },
    'editing block 2 left block 1 byte-identical');
  assert.deepEqual(run.blocks[1], { id: 'b2', time: '19:45', activity: 'Handling under pressure' });
  assert.equal(run.saves, 2, 'each edit persisted');
});
