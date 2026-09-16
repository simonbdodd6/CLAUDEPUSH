/**
 * REORDER TRAINING BLOCKS (TRAINING-REORDER-1).
 *
 * The planner could add a block at the end and insert one at any position, but
 * an existing block could not be moved: changing the order meant deleting and
 * retyping.
 *
 * A move is a splice out and a splice back into the SAME canonical array,
 * state.trainingBlocks[contentKey] — the one the publish payload, the PDF and
 * the session all read. The block that moves is the same object, never a copy,
 * so its id, its content, its session and anything the coach has typed travel
 * with it untouched. Only its index changes.
 *
 * Deliberately NOT a sort. A coach mid-plan may legitimately have times out of
 * sequence; the planner must never rearrange their work by time, nor rewrite a
 * time to justify a position. A move is exactly one step, so a press is
 * unambiguous, and the ends refuse rather than wrap.
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
const CK = 'slot_tue-20260915';
const OTHER_CK = 'slot_thu-20260917';
const OTHER_GROUP_CK = 'slot_msvh0skf_1-20260917';

/** A planner with a DOM faithful enough to run the real row surgery. */
function planner({ blocks = [] } = {}) {
  const body = `
    "use strict";
    const CFG = arguments[0];
    let state = { trainingBlocks: {
      [CFG.ck]: CFG.blocks.map(b => ({ ...b })),
      [CFG.otherCk]: [{ id: 'o1', time: '19:45', activity: 'Other session', tag: 'General' }],
      [CFG.otherGroupCk]: [{ id: 'g1', time: '17:45', activity: 'U18 block', tag: 'General' }],
    }, schedule: [] };
    let saves = [], toasts = [], synced = [], renders = 0, focused = [];
    function saveState(l){ saves.push(l || ''); }
    function showToast(t){ toasts.push(t); }
    function renderTraining(){ renders++; paint(); }
    function syncPublishedSessionEdit(id){ synced.push(id); }
    function trainingPlannedStartTime(){ return '19:45'; }
    function esc(v){ return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
    function tbAutosize(){}
    function trainingFocusBlock(id){ focused.push(id); }
    const CSS = { escape: v => String(v) };
    const requestAnimationFrame = f => f();
    let _tbSeq = 0;
    // A tbody of ordered rows. Each row is either a block row or the insert
    // affordance that precedes it, and each carries the move buttons the real
    // markup does, so the real refresh can set their disabled state.
    let ROWS = [];
    const mkRow = htmlStr => {
      const bid = (/data-block-id="([^"]*)"/.exec(htmlStr) || [])[1];
      const ins = (/data-insert-before="([^"]*)"/.exec(htmlStr) || [])[1];
      const buttons = bid ? { '.tb-move-up': { disabled: false }, '.tb-move-down': { disabled: false } } : {};
      return { html: htmlStr, blockId: bid, insertBefore: ins, buttons,
        querySelector(sel){ return buttons[sel] || null; },
        insertAdjacentElement(pos, el){
          const mine = ROWS.indexOf(el); if (mine >= 0) ROWS.splice(mine, 1);
          const at = ROWS.indexOf(this); ROWS.splice(pos === 'beforebegin' ? at : at + 1, 0, el); return el; },
        insertAdjacentHTML(pos, h){ const at = ROWS.indexOf(this); ROWS.splice(pos === 'beforebegin' ? at : at + 1, 0, ...splitRows(h)); },
        remove(){ const at = ROWS.indexOf(this); if (at >= 0) ROWS.splice(at, 1); } };
    };
    const splitRows = h => (h.match(/<tr[\\s\\S]*?<\\/tr>/g) || []).map(mkRow);
    const TBODY = { insertAdjacentHTML(pos, h){ ROWS.push(...splitRows(h)); },
                    appendChild(el){ const mine = ROWS.indexOf(el); if (mine >= 0) ROWS.splice(mine, 1); ROWS.push(el); return el; } };
    const document = {
      querySelector(sel){
        const mb = /tr\\[data-block-id="(.*)"\\]/.exec(sel);
        if (mb) return ROWS.find(r => r.blockId === mb[1]) || null;
        const mi = /tr\\.tb-insert\\[data-insert-before="(.*)"\\]/.exec(sel);
        if (mi) return ROWS.find(r => r.insertBefore === mi[1]) || null;
        if (/tbody/.test(sel)) return TBODY;
        return null;
      },
      querySelectorAll(sel){ return /data-block-id/.test(sel) ? ROWS.filter(r => r.blockId) : []; },
    };
    ${fn('trainingInsertRowHTML')}
    ${fn('trainingBlockRowHTML')}
    ${fn('trainingNewBlock')}
    ${fn('trainingRefreshMoveButtons')}
    ${fn('trainingMoveBlock')}
    ${fn('trainingInsertBlockBefore')}
    ${fn('addTimeBlock')}
    ${fn('removeTimeBlock')}
    ${fn('updateTimeBlock')}
    function paint(){ ROWS = [];
      state.trainingBlocks[CFG.ck].forEach(b => TBODY.insertAdjacentHTML('beforeend', trainingInsertRowHTML(CFG.ck, b) + trainingBlockRowHTML(CFG.ck, b)));
      trainingRefreshMoveButtons(); }
    paint();
    return {
      get state(){ return state; },
      move: (id, d) => trainingMoveBlock(CFG.ck, id, d),
      up: id => trainingMoveBlock(CFG.ck, id, -1),
      down: id => trainingMoveBlock(CFG.ck, id, 1),
      insertBefore: id => trainingInsertBlockBefore(CFG.ck, id),
      add: () => addTimeBlock(CFG.ck),
      remove: id => removeTimeBlock(CFG.ck, id),
      update: (id, f, v) => updateTimeBlock(CFG.ck, id, f, v),
      blocks: () => state.trainingBlocks[CFG.ck],
      order: () => state.trainingBlocks[CFG.ck].map(b => b.activity || '(new)'),
      ids: () => state.trainingBlocks[CFG.ck].map(b => b.id),
      times: () => state.trainingBlocks[CFG.ck].map(b => b.time),
      other: () => state.trainingBlocks[CFG.otherCk],
      otherGroup: () => state.trainingBlocks[CFG.otherGroupCk],
      domOrder: () => ROWS.map(r => r.blockId ? 'BLOCK:' + r.blockId : 'INSERT:' + r.insertBefore),
      canMove: () => ROWS.filter(r => r.blockId).map(r => ({ id: r.blockId, up: !r.buttons['.tb-move-up'].disabled, down: !r.buttons['.tb-move-down'].disabled })),
      saves: () => saves, toasts: () => toasts, synced: () => synced, renders: () => renders,
    };
  `;
  return new Function(body)({ blocks, ck: CK, otherCk: OTHER_CK, otherGroupCk: OTHER_GROUP_CK });
}
const PLAN = [
  { id: 'b1', time: '19:45', activity: 'Warm-up',          keyFocus: 'Raise heart rate', coach: 'Ana',  tag: 'General' },
  { id: 'b2', time: '20:00', activity: 'Passing',          keyFocus: 'Hands early',      coach: 'Bo',   tag: 'General' },
  { id: 'b3', time: '20:15', activity: 'Defence',          keyFocus: 'Line speed',       coach: 'Cara', tag: 'General' },
  { id: 'b4', time: '20:35', activity: 'Small-sided game', keyFocus: 'Decisions',        coach: 'Dan',  tag: 'General' },
  { id: 'b5', time: '21:00', activity: 'Game',             keyFocus: 'Apply it',         coach: 'Eve',  tag: 'General' },
];

// ── 1–4. the four directions ───────────────────────────────────────────────
test('1. move the FIRST block down', () => {
  const p = planner({ blocks: PLAN });
  assert.equal(p.down('b1'), true);
  assert.deepEqual(p.order(), ['Passing', 'Warm-up', 'Defence', 'Small-sided game', 'Game']);
});

test('2. move the LAST block up', () => {
  const p = planner({ blocks: PLAN });
  assert.equal(p.up('b5'), true);
  assert.deepEqual(p.order(), ['Warm-up', 'Passing', 'Defence', 'Game', 'Small-sided game']);
});

test('3. move a MIDDLE block up — the worked example', () => {
  const p = planner({ blocks: PLAN });
  assert.equal(p.up('b3'), true);                     // Defence above Passing
  assert.deepEqual(p.order(), ['Warm-up', 'Defence', 'Passing', 'Small-sided game', 'Game']);
});

test('4. move a MIDDLE block down', () => {
  const p = planner({ blocks: PLAN });
  assert.equal(p.down('b2'), true);
  assert.deepEqual(p.order(), ['Warm-up', 'Defence', 'Passing', 'Small-sided game', 'Game']);
});

// ── 5. repetition and boundaries ───────────────────────────────────────────
test('5. repeated moves walk a block one step at a time, and stop at the end', () => {
  const p = planner({ blocks: PLAN });
  assert.equal(p.up('b5'), true); assert.equal(p.up('b5'), true);
  assert.equal(p.up('b5'), true); assert.equal(p.up('b5'), true);
  assert.deepEqual(p.order(), ['Game', 'Warm-up', 'Passing', 'Defence', 'Small-sided game']);
  assert.equal(p.up('b5'), false, 'the first block cannot rise further');
  assert.deepEqual(p.order(), ['Game', 'Warm-up', 'Passing', 'Defence', 'Small-sided game'], 'and nothing moved');
});

test('5b. one press is exactly one position, whatever it is handed', () => {
  const p = planner({ blocks: PLAN });
  p.move('b1', 99); assert.deepEqual(p.ids(), ['b2', 'b1', 'b3', 'b4', 'b5'], 'a large delta is still one step');
  p.move('b1', -99); assert.deepEqual(p.ids(), ['b1', 'b2', 'b3', 'b4', 'b5'], 'and back');
  assert.match(fn('trainingMoveBlock'), /const to = from \+ \(Number\(delta\) < 0 \? -1 : 1\)/, 'normalised to one step at the source');
});

test('16. a single-block session cannot move in either direction', () => {
  const p = planner({ blocks: [PLAN[0]] });
  assert.equal(p.up('b1'), false);
  assert.equal(p.down('b1'), false);
  assert.deepEqual(p.ids(), ['b1']);
  assert.deepEqual(p.canMove(), [{ id: 'b1', up: false, down: false }], 'both controls are unavailable');
});

test('15. an empty session, and an unknown block, are safe no-ops', () => {
  const p = planner({ blocks: [] });
  assert.equal(p.up('anything'), false);
  assert.equal(p.down('anything'), false);
  assert.deepEqual(p.blocks(), []);
  const q = planner({ blocks: PLAN });
  assert.equal(q.up('not-a-block'), false, 'a stale row moves nothing');
  assert.deepEqual(q.ids(), ['b1', 'b2', 'b3', 'b4', 'b5']);
});

// ── 6–7. identity and content are carried, never rebuilt ───────────────────
test('6+7. ids, content and object identity survive a move', () => {
  const p = planner({ blocks: PLAN });
  const before = p.blocks().map(b => ({ ...b }));
  const refBefore = p.blocks()[2];
  p.up('b3');
  assert.deepEqual(p.ids(), ['b1', 'b3', 'b2', 'b4', 'b5'], 'ids unchanged, order changed');
  assert.equal(p.blocks()[1], refBefore, 'the SAME object moved — not a copy');
  for (const original of before) {
    const now = p.blocks().find(b => b.id === original.id);
    assert.deepEqual(now, original, `${original.activity} is byte-for-byte unchanged`);
  }
});

test('19+20. times are never rewritten and the plan is never sorted by time', () => {
  // deliberately out of chronological order, as a coach mid-plan may leave it
  const messy = [
    { id: 'm1', time: '20:30', activity: 'Late first', tag: 'General' },
    { id: 'm2', time: '19:00', activity: 'Early second', tag: 'General' },
    { id: 'm3', time: '',      activity: 'Untimed third', tag: 'General' },
  ];
  const p = planner({ blocks: messy });
  assert.deepEqual(p.order(), ['Late first', 'Early second', 'Untimed third'], 'loaded as written');
  p.down('m1');
  assert.deepEqual(p.order(), ['Early second', 'Late first', 'Untimed third'], 'moved exactly as asked');
  assert.deepEqual(p.times(), ['19:00', '20:30', ''], 'every time is exactly what the coach typed');
  const src = fn('trainingMoveBlock');
  assert.doesNotMatch(src, /\.sort\(/, 'no sort');
  assert.doesNotMatch(src, /\.time\s*=/, 'no time is written');
  assert.doesNotMatch(src, /localeCompare|parseBlockTime/, 'time is never even consulted');
});

// ── 8. the canonical array is the only thing that changes ──────────────────
test('8. the move is a splice on the canonical array and nothing else', () => {
  const src = fn('trainingMoveBlock');
  assert.match(src, /state\.trainingBlocks\?\.\[sessionId\]/, 'the canonical array');
  assert.match(src, /const \[moved\] = blocks\.splice\(from, 1\);/);
  assert.match(src, /blocks\.splice\(to, 0, moved\);/);
  assert.doesNotMatch(src, /position|orderIndex|sortKey|\bindex:/i, 'no second ordering field');
  assert.doesNotMatch(src, /fetch\(/, 'and no bypass of the existing save/publish paths');
  assert.match(src, /findIndex\(b => b && String\(b\.id\) === String\(blockId\)\)/, 'addressed by id, not by row index');
});

// ── 9–11. persistence, and interaction with insert and delete ──────────────
test('9+10. a move persists through the existing save path and survives a reload', () => {
  const p = planner({ blocks: PLAN });
  p.up('b3');
  assert.ok(p.saves().includes('Block moved'), 'saveState was called: ' + JSON.stringify(p.saves()));
  assert.ok(p.toasts().includes('Moved up'));
  const persisted = JSON.parse(JSON.stringify(p.state.trainingBlocks));
  const reopened = planner({ blocks: persisted[CK] });
  assert.deepEqual(reopened.order(), ['Warm-up', 'Defence', 'Passing', 'Small-sided game', 'Game']);
  assert.deepEqual(reopened.ids(), ['b1', 'b3', 'b2', 'b4', 'b5'], 'same blocks, same ids, same order');
});

test('11. insert then move, and move an inserted block', () => {
  const p = planner({ blocks: PLAN });
  p.insertBefore('b4');                                  // new block before Small-sided game
  const newId = p.ids()[3];
  p.update(newId, 'activity', 'Kicking');
  assert.deepEqual(p.order(), ['Warm-up', 'Passing', 'Defence', 'Kicking', 'Small-sided game', 'Game']);
  p.up(newId); p.up(newId);
  assert.deepEqual(p.order(), ['Warm-up', 'Kicking', 'Passing', 'Defence', 'Small-sided game', 'Game'],
    'an inserted block moves like any other');
  p.down('b1');
  assert.deepEqual(p.order(), ['Kicking', 'Warm-up', 'Passing', 'Defence', 'Small-sided game', 'Game']);
});

test('12. delete after moving, and move after deleting', () => {
  const p = planner({ blocks: PLAN });
  p.up('b4');
  assert.deepEqual(p.ids(), ['b1', 'b2', 'b4', 'b3', 'b5']);
  p.remove('b4');
  assert.deepEqual(p.ids(), ['b1', 'b2', 'b3', 'b5'], 'the moved block is the one removed');
  p.down('b3');
  assert.deepEqual(p.ids(), ['b1', 'b2', 'b5', 'b3'], 'moving still works afterwards');
});

test('8b. editing a block then moving it keeps the edit', () => {
  const p = planner({ blocks: PLAN });
  p.update('b3', 'keyFocus', 'Rush the 10');
  p.update('b3', 'coach', 'Fionn');
  p.up('b3');
  const moved = p.blocks()[1];
  assert.equal(moved.id, 'b3');
  assert.equal(moved.keyFocus, 'Rush the 10');
  assert.equal(moved.coach, 'Fionn');
});

// ── 13–14. publication and PDF read the same array ─────────────────────────
test('13. publishing after a move sends the reordered sequence, and refreshes the revision', () => {
  const p = planner({ blocks: PLAN });
  p.up('b3');
  const payload = new Function(`
    "use strict";
    const CFG = arguments[0];
    const state = { schedule: [{ id: 'tue', title: 'TUESDAY' }], trainingBlocks: CFG.blocks };
    function trainingContentKey(){ return CFG.ck; }
    ${fn('trainingSessionPayload')}
    return trainingSessionPayload('tue');
  `)({ blocks: p.state.trainingBlocks, ck: CK });
  assert.deepEqual(payload.blocks.map(b => b.activity),
    ['Warm-up', 'Defence', 'Passing', 'Small-sided game', 'Game'], 'players receive the new order');
  assert.equal(payload.occurrenceKey, CK, 'still the same occurrence');
  assert.deepEqual(p.synced(), [CK], 'and the published revision was refreshed by the move alone');
  assert.match(fn('trainingMoveBlock'), /syncPublishedSessionEdit\(sessionId\)/, 'directly, not by way of a later keystroke');
});

test('14. the PDF prints the reordered sequence', () => {
  const p = planner({ blocks: PLAN });
  p.up('b3');
  const page = Buffer.from(buildSessionPdf({ sessionTitle: 'TUESDAY', blocks: p.blocks().map(b => ({
    time: b.time || '', activity: b.activity || '', keyFocus: b.keyFocus || '', coach: b.coach || '' })) })).toString('latin1');
  const at = t => page.indexOf('(' + t + ')');
  assert.ok(at('Warm-up') < at('Defence'), 'Defence follows Warm-up');
  assert.ok(at('Defence') < at('Passing'), 'and now precedes Passing');
  assert.ok(at('Passing') < at('Small-sided game') && at('Small-sided game') < at('Game'));
  assert.ok(at('20:15') < at('20:00'), 'the times moved with their blocks — the PDF did not re-sort them');
});

// ── 17–18, 20. no duplication, no loss, no collateral ──────────────────────
test('17+18. moving never duplicates or loses a block', () => {
  const p = planner({ blocks: PLAN });
  for (const [id, d] of [['b1', 1], ['b5', -1], ['b3', -1], ['b2', 1], ['b4', -1], ['b1', -1], ['b5', 1]]) p.move(id, d);
  const ids = p.ids();
  assert.equal(ids.length, 5, 'still five blocks');
  assert.equal(new Set(ids).size, 5, 'all distinct');
  assert.deepEqual([...ids].sort(), ['b1', 'b2', 'b3', 'b4', 'b5'], 'the same five, whatever order they ended in');
  assert.equal(p.order().filter(Boolean).length, 5, 'and none lost its content');
});

test('20. no other session, week or group is touched', () => {
  const p = planner({ blocks: PLAN });
  const otherBefore = JSON.parse(JSON.stringify(p.other()));
  const groupBefore = JSON.parse(JSON.stringify(p.otherGroup()));
  p.up('b3'); p.down('b1'); p.up('b5');
  assert.deepEqual(p.other(), otherBefore, "the same week's other occurrence is untouched");
  assert.deepEqual(p.otherGroup(), groupBefore, "another group's occurrence is untouched");
  assert.deepEqual(Object.keys(p.state.trainingBlocks).sort(), [CK, OTHER_GROUP_CK, OTHER_CK].sort(), 'no new keys');
});

// ── DOM: the row pair moves with the block ─────────────────────────────────
test('D1. the block row and its insert affordance move together, and the DOM order IS the array order', () => {
  const p = planner({ blocks: PLAN });
  const invariant = () => {
    const rows = p.domOrder();
    assert.equal(rows.length % 2, 0, 'rows come in pairs: ' + rows.join(','));
    for (let i = 0; i < rows.length; i += 2) {
      assert.ok(rows[i].startsWith('INSERT:') && rows[i + 1].startsWith('BLOCK:'), 'pair order: ' + rows.join(','));
      assert.equal(rows[i].slice(7), rows[i + 1].slice(6), 'the affordance names the block it precedes');
    }
    assert.deepEqual(rows.filter(r => r.startsWith('BLOCK:')).map(r => r.slice(6)), p.ids(), 'DOM order equals array order');
  };
  invariant();
  p.up('b3');    invariant();
  p.down('b1');  invariant();
  p.up('b5');    invariant();    // to the very end
  p.insertBefore(p.ids()[1]); invariant();
  p.add();       invariant();
  p.remove('b2'); invariant();
  assert.equal(p.renders(), 0, 'and none of it rebuilt the card');
});

test('D2. the controls at each end are disabled, and follow the blocks as they move', () => {
  const p = planner({ blocks: PLAN });
  const ends = () => ({ first: p.canMove()[0], last: p.canMove()[p.canMove().length - 1] });
  assert.deepEqual(ends().first, { id: 'b1', up: false, down: true }, 'the first cannot rise');
  assert.deepEqual(ends().last,  { id: 'b5', up: true, down: false }, 'the last cannot fall');
  assert.equal(p.canMove().slice(1, -1).every(r => r.up && r.down), true, 'everything between can do both');
  p.up('b5');    // b5 is no longer last
  assert.deepEqual(ends().last, { id: 'b4', up: true, down: false }, 'the new last block takes it on');
  assert.equal(p.canMove().find(r => r.id === 'b5').down, true, 'and the moved one regains its down control');
  p.up('b1');    // refused — b1 is already first
  assert.deepEqual(ends().first, { id: 'b1', up: false, down: true }, 'unchanged');
});

test('D3. the state is derived from live position, so it cannot go stale behind any change', () => {
  const src = fn('trainingRefreshMoveButtons');
  assert.match(src, /querySelectorAll\('#coach-training tr\[data-block-id\]'\)/, 'read from the rows on screen');
  assert.match(src, /up\.disabled   = \(i === 0\)/);
  assert.match(src, /down\.disabled = \(i === rows\.length - 1\)/);
  for (const caller of ['trainingMoveBlock', 'trainingInsertBlockBefore', 'addTimeBlock', 'removeTimeBlock']) {
    assert.match(fn(caller), /trainingRefreshMoveButtons\(\)/, `${caller} refreshes them`);
  }
  assert.match(fn('renderTraining'), /trainingRefreshMoveButtons\(\);\n      trainingAutosizeBlocks\(\);/, 'and so does the render');
});

// ── UX contract ────────────────────────────────────────────────────────────
test('U1. one mechanism that works with a mouse, a finger and a keyboard', () => {
  const row = fn('trainingBlockRowHTML');
  assert.match(row, /class="tb-move tb-move-up"[\s\S]{0,200}trainingMoveBlock\('\$\{sessId\}','\$\{esc\(String\(b\.id\)\)\}',-1\)/, 'move up');
  assert.match(row, /class="tb-move tb-move-down"[\s\S]{0,200}trainingMoveBlock\('\$\{sessId\}','\$\{esc\(String\(b\.id\)\)\}',1\)/, 'move down');
  assert.match(row, /aria-label="Move \$\{esc\(String\(b\.activity \|\| ''\)\.trim\(\) \|\| 'this block'\)\} up"/, 'each names its block');
  assert.match(row, /title="Move up"/); assert.match(row, /title="Move down"/);
  // real buttons, so keyboard and screen readers get it for free
  assert.match(row, /<button class="tb-move tb-move-up" type="button"/);
  // the fields stay plain editable fields: nothing is draggable, nothing traps a gesture
  assert.doesNotMatch(row, /draggable=/, 'the row is not a drag surface');
  assert.doesNotMatch(row, /touch-action/, 'and no gesture handling competes with text selection');
});

test('U2. proper targets on both desktop and touch', () => {
  assert.match(html, /\.tb-move \{[\s\S]{0,260}min-height:36px/, 'a 36px control on the desktop row');
  assert.match(html, /\.tb-move:disabled \{ opacity:\.32; cursor:default; \}/, 'the ends read as unavailable, not missing');
  assert.match(html, /\.tb-move:focus-visible \{ outline:/, 'keyboard focus is visible');
  const mobile = html.slice(html.indexOf('@media (max-width: 640px)'));
  assert.match(mobile, /\.tb-move \{ width: 44px; min-height: 44px;/, 'a real 44px touch target on phones');
  assert.match(mobile, /\.training-gs-table td\[data-label=""\] \.btn\.tb-remove \{ min-height: 44px;/, 'and remove matches it');
  assert.match(html, /\.tb-row-actions \{ display:flex;/, 'the three controls sit on one line');
});
