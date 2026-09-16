/**
 * INSERT TRAINING BLOCKS (TRAINING-INSERT-BLOCK-1).
 *
 * The planner could only ever ADD a block at the end, so a coach who realised
 * an activity belonged between two existing blocks had to append it and then
 * rebuild the order by hand.
 *
 * The plan's order IS the order of state.trainingBlocks[contentKey] — the
 * array the publish payload, the PDF and the session all read — so inserting
 * is a splice into that one array and nothing else. There is no second
 * ordering field, no sort, and no re-keying: every other block keeps its id,
 * its content and its position relative to its neighbours.
 *
 * Insertion is addressed by the id of the block to go in FRONT of, never by a
 * row index: an index captured in markup goes stale as soon as anything above
 * it changes, and the training model already addresses blocks by id
 * everywhere else.
 *
 * Every test drives the REAL functions extracted from index.html.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSessionPdf } from '../src/session-pdf.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = html.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = html.indexOf(m[0]);
  let i = html.indexOf('{', html.indexOf(')', start)), d = 0;
  for (let b = i; b < html.length; b++) { if (html[b] === '{') d++; else if (html[b] === '}') { d--; if (!d) { i = b; break; } } }
  return html.slice(start, i + 1);
}
const CK = 'slot_tue-20260915';        // the canonical dated occurrence key
const OTHER_CK = 'slot_thu-20260917';  // a different occurrence in the same week
const OTHER_GROUP_CK = 'slot_msvh0skf_1-20260917';

/** A planner holding one session's blocks, with a tiny DOM that records surgery. */
function planner({ blocks = [], startTime = '19:45' } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    let state = { trainingBlocks: {
      [CFG.ck]: CFG.blocks.map(b => ({ ...b })),
      [CFG.otherCk]: [{ id: 'o1', time: '19:45', activity: 'Other session block', tag: 'General' }],
      [CFG.otherGroupCk]: [{ id: 'g1', time: '17:45', activity: 'U18 block', tag: 'General' }],
    }, schedule: [] };
    let saves = [], toasts = [], synced = [], renders = 0, focused = [];
    function saveState(l){ saves.push(l || ''); }
    function showToast(t){ toasts.push(t); }
    function renderTraining(){ renders++; }
    function syncPublishedSessionEdit(id){ synced.push(id); }
    function trainingPlannedStartTime(){ return CFG.startTime; }
    function esc(v){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function tbAutosize(){}
    function trainingFocusBlock(id){ focused.push(id); }
    const CSS = { escape: v => String(v) };
    const requestAnimationFrame = f => f();
    let _tbSeq = 0;
    // A DOM that mirrors the real one: the tbody is an ordered list of rows,
    // each either a block row or the insert affordance that precedes it.
    let ROWS = [];
    const mkRow = htmlStr => {
      const bid = (/data-block-id="([^"]*)"/.exec(htmlStr) || [])[1];
      const ins = (/data-insert-before="([^"]*)"/.exec(htmlStr) || [])[1];
      return { html: htmlStr, blockId: bid, insertBefore: ins,
        insertAdjacentHTML(pos, h){ const at = ROWS.indexOf(this); ROWS.splice(pos === 'beforebegin' ? at : at + 1, 0, ...splitRows(h)); },
        remove(){ const at = ROWS.indexOf(this); if (at >= 0) ROWS.splice(at, 1); } };
    };
    const splitRows = h => (h.match(/<tr[\\s\\S]*?<\\/tr>/g) || []).map(mkRow);
    const document = { querySelector(sel){
      const mb = /tr\\[data-block-id="(.*)"\\]/.exec(sel);
      if (mb) return ROWS.find(r => r.blockId === mb[1]) || null;
      const mi = /tr\\.tb-insert\\[data-insert-before="(.*)"\\]/.exec(sel);
      if (mi) return ROWS.find(r => r.insertBefore === mi[1]) || null;
      if (/tbody/.test(sel)) return { insertAdjacentHTML(pos, h){ ROWS.push(...splitRows(h)); } };
      return null;
    }, querySelectorAll: () => [] };
    ${fn('trainingInsertRowHTML')}
    ${fn('trainingBlockRowHTML')}
    ${fn('trainingNewBlock')}
    ${fn('trainingInsertBlockBefore')}
    ${fn('addTimeBlock')}
    ${fn('removeTimeBlock')}
    ${fn('updateTimeBlock')}
    function paint(){ ROWS = []; const el = document.querySelector('tbody');
      state.trainingBlocks[CFG.ck].forEach(b => el.insertAdjacentHTML('beforeend', trainingInsertRowHTML(CFG.ck, b) + trainingBlockRowHTML(CFG.ck, b))); }
    paint();
    return {
      get state(){ return state; },
      insertBefore: id => trainingInsertBlockBefore(CFG.ck, id),
      add: () => addTimeBlock(CFG.ck),
      remove: id => removeTimeBlock(CFG.ck, id),
      update: (id, f, v) => updateTimeBlock(CFG.ck, id, f, v),
      blocks: () => state.trainingBlocks[CFG.ck],
      order: () => state.trainingBlocks[CFG.ck].map(b => b.activity || '(new)'),
      ids: () => state.trainingBlocks[CFG.ck].map(b => b.id),
      other: () => state.trainingBlocks[CFG.otherCk],
      otherGroup: () => state.trainingBlocks[CFG.otherGroupCk],
      domOrder: () => ROWS.map(r => r.blockId ? 'BLOCK:' + r.blockId : 'INSERT:' + r.insertBefore),
      saves: () => saves, toasts: () => toasts, synced: () => synced, renders: () => renders, focused: () => focused,
      repaint: paint,
    };
  `;
  return new Function(body)({ blocks, startTime, ck: CK, otherCk: OTHER_CK, otherGroupCk: OTHER_GROUP_CK });
}
const PLAN = [
  { id: 'b1', time: '19:45', activity: 'Warm-up',         keyFocus: 'Raise heart rate', coach: 'Ana',  tag: 'General' },
  { id: 'b2', time: '20:00', activity: 'Passing',         keyFocus: 'Hands early',      coach: 'Bo',   tag: 'General' },
  { id: 'b3', time: '20:20', activity: 'Small-sided game',keyFocus: 'Decisions',        coach: 'Cara', tag: 'General' },
  { id: 'b4', time: '20:45', activity: 'Game',            keyFocus: 'Apply it',         coach: 'Dan',  tag: 'General' },
];

// ── 1–4. every position is reachable ───────────────────────────────────────
test('1. insert BEFORE the first block', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b1');
  assert.deepEqual(p.order(), ['(new)', 'Warm-up', 'Passing', 'Small-sided game', 'Game']);
  assert.equal(p.blocks().length, 5);
});

test('2. insert BETWEEN two blocks — the worked example', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b3');                       // between Passing and Small-sided game
  assert.deepEqual(p.order(), ['Warm-up', 'Passing', '(new)', 'Small-sided game', 'Game']);
});

test('3. insert BEFORE the last block', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b4');
  assert.deepEqual(p.order(), ['Warm-up', 'Passing', 'Small-sided game', '(new)', 'Game']);
});

test('4. AFTER the last block is the existing Add block, unchanged', () => {
  const p = planner({ blocks: PLAN });
  p.add();
  assert.deepEqual(p.order(), ['Warm-up', 'Passing', 'Small-sided game', 'Game', '(new)']);
  assert.equal(p.blocks()[4].time, '21:15', 'still 30 minutes after the block before it');
});

// ── 5–7. the rest of the plan is untouched ─────────────────────────────────
test('5. multiple insertions each land where they were asked for', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b1'); p.update(p.ids()[0], 'activity', 'First');
  p.insertBefore('b3'); p.update(p.ids()[3], 'activity', 'Middle');
  p.insertBefore('b4'); p.update(p.ids()[5], 'activity', 'Late');
  assert.deepEqual(p.order(), ['First', 'Warm-up', 'Passing', 'Middle', 'Small-sided game', 'Late', 'Game']);
  assert.equal(new Set(p.ids()).size, 7, 'seven distinct blocks');
});

test('6. existing blocks keep their content, their ids and their relative order', () => {
  const p = planner({ blocks: PLAN });
  const before = JSON.parse(JSON.stringify(p.blocks()));
  p.insertBefore('b3');
  const after = p.blocks().filter(b => before.some(x => x.id === b.id));
  assert.deepEqual(after, before, 'byte-for-byte unchanged, in the same relative order');
});

test('7. the inserted block is a genuinely empty new block from the shared factory', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b3');
  const nb = p.blocks()[2];
  assert.equal(nb.activity, '', 'no starter content');
  assert.equal(nb.keyFocus, undefined); assert.equal(nb.coach, undefined);
  assert.equal(nb.tag, 'General');
  assert.match(String(nb.id), /^tb\d+-/, 'a fresh collision-safe id');
  assert.equal(nb.time, '20:30', 'opens 30 minutes after the block it follows — the one shared rule');
  const first = planner({ blocks: PLAN, startTime: '18:30' });
  first.insertBefore('b1');
  assert.equal(first.blocks()[0].time, '18:30', 'with nothing before it, the planned group start time');
});

// ── 8–9. it behaves like any other block afterwards ────────────────────────
test('8. the inserted block can be edited and deleted, leaving the plan as it was', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b3');
  const id = p.ids()[2];
  p.update(id, 'activity', 'Kicking'); p.update(id, 'coach', 'Eve');
  assert.equal(p.blocks()[2].activity, 'Kicking');
  assert.equal(p.blocks()[2].coach, 'Eve');
  p.remove(id);
  assert.deepEqual(p.order(), ['Warm-up', 'Passing', 'Small-sided game', 'Game']);
  assert.deepEqual(p.ids(), ['b1', 'b2', 'b3', 'b4'], 'the original plan is back exactly');
});

test('9. reordering by delete-and-reinsert still works after an insertion', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b2'); p.update(p.ids()[1], 'activity', 'Inserted');
  p.remove('b4');                                  // take the last one out
  p.insertBefore('b1');  p.update(p.ids()[0], 'activity', 'Moved to front');
  assert.deepEqual(p.order(), ['Moved to front', 'Warm-up', 'Inserted', 'Passing', 'Small-sided game']);
});

// ── 10. persistence through the canonical path ─────────────────────────────
test('10. insertion persists through the SAME save path as adding, and survives a reload', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b3'); p.update(p.ids()[2], 'activity', 'Kicking');
  assert.ok(p.saves().includes('Time block inserted'), 'saveState was called: ' + JSON.stringify(p.saves()));
  assert.ok(p.toasts().includes('Block inserted'));
  // reload: normalizeState round-trips state through JSON, order is array order
  const persisted = JSON.parse(JSON.stringify(p.state.trainingBlocks));
  const reopened = planner({ blocks: persisted[CK] });
  assert.deepEqual(reopened.order(), ['Warm-up', 'Passing', 'Kicking', 'Small-sided game', 'Game']);
  assert.deepEqual(reopened.ids(), p.ids(), 'same blocks, same ids, same order');
});

test('10b. the planner never invents a second store — only trainingBlocks is written', () => {
  const src = fn('trainingInsertBlockBefore');
  assert.match(src, /state\.trainingBlocks\[sessionId\]/, 'the canonical array');
  assert.match(src, /blocks\.splice\(at, 0, block\)/, 'a splice into it, nothing else');
  assert.doesNotMatch(src, /order|position|index:|sortBy/i, 'no second ordering field');
  assert.doesNotMatch(src, /fetch\(/, 'and no bypass of the existing save/publish paths');
});

// ── 11–12. publication and PDF read the same array ─────────────────────────
test('11. publishing after an insertion sends the blocks in the resulting order', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b3'); p.update(p.ids()[2], 'activity', 'Kicking');
  // trainingSessionPayload is what publish sends: the session plus the blocks
  // that live at its content key — the same array, in order.
  const payload = new Function(`
    "use strict";
    const CFG = arguments[0];
    const state = { schedule: [{ id: 'tue', title: 'TUESDAY' }], trainingBlocks: CFG.blocks };
    function trainingContentKey(){ return CFG.ck; }
    ${fn('trainingSessionPayload')}
    return trainingSessionPayload('tue');
  `)({ blocks: p.state.trainingBlocks, ck: CK });
  assert.deepEqual(payload.blocks.map(b => b.activity),
    ['Warm-up', 'Passing', 'Kicking', 'Small-sided game', 'Game'], 'players receive the resulting order');
  assert.equal(payload.occurrenceKey, CK, 'and it is still the same occurrence');
  assert.ok(p.synced().includes(CK), 'the published revision was refreshed, as for any other edit');
});

test('11b. inserting ALONE refreshes the published revision — a published plan can never go out stale', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b3');                       // no edit afterwards: the insert must do it
  assert.deepEqual(p.synced(), [CK], 'exactly one revision refresh, for this occurrence');
  assert.match(fn('trainingInsertBlockBefore'), /syncPublishedSessionEdit\(sessionId\)/,
    'the insert path calls it directly, not by way of a later keystroke');
});

test('12. the PDF prints the inserted block in its inserted position', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b3'); p.update(p.ids()[2], 'activity', 'Kicking');
  const bytes = buildSessionPdf({ sessionTitle: 'TUESDAY', blocks: p.blocks().map(b => ({
    time: b.time || '', activity: b.activity || '', keyFocus: b.keyFocus || '', coach: b.coach || '' })) });
  const page = Buffer.from(bytes).toString('latin1');
  const at = t => page.indexOf('(' + t + ')');
  assert.ok(at('Passing') < at('Kicking'), 'after Passing');
  assert.ok(at('Kicking') < at('Small-sided game'), 'and before Small-sided game');
  assert.ok(at('Warm-up') < at('Passing') && at('Small-sided game') < at('Game'), 'everything else in order');
});

// ── 13–15. edges and isolation ─────────────────────────────────────────────
test('13. an empty session has nothing to insert before, so Add block is the way in', () => {
  const p = planner({ blocks: [] });
  p.insertBefore('nothing-here');                   // e.g. a stale row
  assert.equal(p.blocks().length, 1, 'it appended rather than guessing a position');
  assert.equal(p.blocks()[0].time, '19:45', 'and opened at the planned start time');
});

test('14. inserting never duplicates a block', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b2'); p.insertBefore('b2'); p.insertBefore('b4');
  const ids = p.ids();
  assert.equal(new Set(ids).size, ids.length, 'every id is distinct');
  assert.equal(ids.filter(i => i === 'b2').length, 1, 'the anchor block exists exactly once');
  assert.equal(p.order().filter(a => a === 'Passing').length, 1, 'and its content was not copied');
});

test('15. no other session, week or group is touched', () => {
  const p = planner({ blocks: PLAN });
  const otherBefore = JSON.parse(JSON.stringify(p.other()));
  const groupBefore = JSON.parse(JSON.stringify(p.otherGroup()));
  p.insertBefore('b3'); p.insertBefore('b1'); p.add();
  assert.deepEqual(p.other(), otherBefore, "the same week's other occurrence is untouched");
  assert.deepEqual(p.otherGroup(), groupBefore, "another group's occurrence is untouched");
  assert.deepEqual(Object.keys(p.state.trainingBlocks).sort(), [CK, OTHER_GROUP_CK, OTHER_CK].sort(), 'no new keys');
  assert.match(fn('trainingInsertBlockBefore'), /trainingInsertBlockBefore\(sessionId, beforeBlockId\)/,
    'it only ever writes the session it was given — no week or occurrence is re-derived');
});

// ── DOM: the affordance invariant ──────────────────────────────────────────
test('16. every block row is preceded by its own insert affordance, before and after every operation', () => {
  const p = planner({ blocks: PLAN });
  const invariant = () => {
    const rows = p.domOrder();
    assert.equal(rows.length % 2, 0, 'rows come in pairs: ' + rows.join(','));
    for (let i = 0; i < rows.length; i += 2) {
      const ins = rows[i].replace('INSERT:', ''), blk = rows[i + 1].replace('BLOCK:', '');
      assert.ok(rows[i].startsWith('INSERT:') && rows[i + 1].startsWith('BLOCK:'), 'pair order: ' + rows.join(','));
      assert.equal(ins, blk, 'the affordance names the block it precedes');
    }
    assert.deepEqual(rows.filter(r => r.startsWith('BLOCK:')).map(r => r.slice(6)), p.ids(), 'the DOM order IS the array order');
  };
  invariant();
  p.insertBefore('b3'); invariant();
  p.add();              invariant();
  p.insertBefore('b1'); invariant();
  p.remove('b2');       invariant();
});

test('16b. inserting does not rebuild the card, so a coach editing elsewhere keeps their place', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b3');
  assert.equal(p.renders(), 0, 'no renderTraining while the anchor row is present');
  assert.deepEqual(p.focused(), [p.ids()[2]], 'the coach is put into the new block');
});

// ── SOURCE + UX contracts ──────────────────────────────────────────────────
test('17. the affordance is addressed by block id, never by a row index', () => {
  const row = fn('trainingInsertRowHTML');
  assert.match(row, /data-insert-before="\$\{esc\(String\(b\.id\)\)\}"/, 'the row names the block it precedes');
  assert.match(row, /trainingInsertBlockBefore\('\$\{sessId\}','\$\{esc\(String\(b\.id\)\)\}'\)/, 'and so does the handler');
  assert.doesNotMatch(row, /\bindex\b|\bidx\b|\bi\)\s*;/, 'no positional index in the markup');
  assert.match(fn('trainingInsertBlockBefore'), /findIndex\(b => b && String\(b\.id\) === String\(beforeBlockId\)\)/,
    'the position is resolved from the id at the moment of the click');
});

test('18. a usable control on both desktop and touch', () => {
  const row = fn('trainingInsertRowHTML');
  assert.match(row, /aria-label="Insert a new block before/, 'it says what it does');
  assert.match(row, /title="Insert a block here"/);
  assert.match(row, /Insert block here/, 'and carries a visible label');
  assert.match(html, /\.tb-insert-btn \{/, 'styled');
  assert.match(html, /\.training-gs-table tr\.tb-insert:hover \.tb-insert-label[\s\S]{0,120}opacity:1/, 'the label appears on hover');
  assert.match(html, /\.tb-insert-btn:focus-visible \{ outline:/, 'and is keyboard reachable');
  const mobile = html.slice(html.indexOf('@media (max-width: 640px)'));
  assert.match(mobile, /\.tb-insert-btn \{ min-height: 44px;/, 'a real 44px touch target on phones');
  assert.match(mobile, /\.tb-insert-label \{ opacity: 1; \}/, 'with its label always shown — there is no hover on touch');
  assert.match(mobile, /\.training-gs-table tr\.tb-insert \{[\s\S]{0,120}border: 0;/, 'and it is not dressed as a block card');
});

test('19. appending and inserting share ONE new-block rule', () => {
  assert.match(fn('addTimeBlock'), /trainingNewBlock\(sessionId, blocks\[blocks\.length - 1\]\)/);
  assert.match(fn('trainingInsertBlockBefore'), /trainingNewBlock\(sessionId, blocks\[at - 1\]\)/);
  const factory = fn('trainingNewBlock');
  assert.match(factory, /trainingPlannedStartTime\(sessionId\)/, 'the group\'s own opening time');
  assert.match(factory, /_tbSeq\+\+/, 'and the collision-safe id');
});

test('20. removing a block takes its affordance with it', () => {
  assert.match(fn('removeTimeBlock'), /tr\.tb-insert\[data-insert-before="/, 'the affordance is found');
  assert.match(fn('removeTimeBlock'), /affordance\?\.remove\(\); row\.remove\(\);/, 'and removed with the row');
});
