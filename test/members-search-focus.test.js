/**
 * MEMBERS SEARCH — stability across a background repaint (bug: the search box
 * disappeared / needed several taps / cleared itself while typing).
 *
 * renderPlayers() rebuilds the whole #coach-players subtree via innerHTML, and
 * the background loads it starts (admin data, identity requests) re-enter
 * renderPlayers() when they resolve — tearing down the search input the coach
 * had just focused and wiping their query. The fix snapshots the search control
 * before the rebuild (membersSearchSnapshot) and restores value + caret + focus
 * after (membersSearchRestore), then re-applies the row filter.
 *
 * These pin the real extracted client behaviour against a hand-rolled fake DOM
 * (no jsdom dependency), and — critically for the recent group-isolation
 * hardening — prove the search only ever shows/hides the rows already rendered,
 * so it can never widen the visible member set.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's'));
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start;
  while (i < src.length) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } i++; }
  return src.slice(start, i + 1);
}

// One sandbox with a SWAPPABLE `document`, so each test drives a fresh DOM.
function buildScope() {
  const fns = ['membersFilterRows', 'membersSearchSnapshot', 'membersSearchRestore'].map(extractFn).join('\n');
  const body = `
    "use strict";
    let document;
    ${fns}
    return {
      setDoc: d => { document = d; },
      membersFilterRows, membersSearchSnapshot, membersSearchRestore,
    };
  `;
  return new Function(body)();
}
const scope = buildScope();

// Fake DOM: the exact surface the three functions touch.
function makeDom(rowsData) {
  const empty = { style: { display: 'none' } };
  const rows = rowsData.map((d, i) => ({
    _attrs: { 'data-name': String(d.name || '').toLowerCase(), 'data-pos': String(d.pos || '').toLowerCase(), 'data-order': String(d.order ?? i) },
    getAttribute(k) { return this._attrs[k]; },
    style: { display: '' },
    _label: d.name,
  }));
  const order = [...rows];
  const tbody = { appendChild(r) { const i = order.indexOf(r); if (i >= 0) order.splice(i, 1); order.push(r); } };
  const doc = {
    activeElement: null,
    input: null,
    querySelector(sel) {
      if (sel.includes('members-search-input')) return doc.input;
      if (sel.includes('tbody')) return tbody;
      return null;
    },
    querySelectorAll(sel) { return sel.includes('member-row') ? rows : []; },
    getElementById(id) { return id === 'members-search-empty' ? empty : null; },
  };
  const input = {
    value: '', selectionStart: 0, selectionEnd: 0,
    focus() { doc.activeElement = input; },
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
  };
  doc.input = input;
  return { doc, input, rows, empty, order };
}
const visibleNames = dom => dom.order.filter(r => r.style.display !== 'none').map(r => r._label);
const ROWS = [
  { name: 'John Smith', pos: 'Fly-half', order: 0 },
  { name: 'Sarah Jones', pos: 'Prop', order: 1 },
  { name: 'Peter Smythe', pos: 'Lock', order: 2 },
];

// ── FILTER CORRECTNESS ──────────────────────────────────────────────────────

test('typing a name filters to the matching rows and hides the rest', () => {
  const dom = makeDom(ROWS); scope.setDoc(dom.doc);
  scope.membersFilterRows('smith');
  assert.deepEqual(visibleNames(dom), ['John Smith'], 'only the name match remains visible');
  assert.equal(dom.rows.find(r => r._label === 'Sarah Jones').style.display, 'none');
});

test('search matches by position too', () => {
  const dom = makeDom(ROWS); scope.setDoc(dom.doc);
  scope.membersFilterRows('prop');
  assert.deepEqual(visibleNames(dom), ['Sarah Jones']);
});

test('clearing the search restores the full authorized list', () => {
  const dom = makeDom(ROWS); scope.setDoc(dom.doc);
  scope.membersFilterRows('smith');
  scope.membersFilterRows('');
  assert.equal(dom.rows.every(r => r.style.display !== 'none'), true, 'every row visible again');
  assert.equal(dom.rows.length, ROWS.length, 'no rows were added or removed');
});

test('the "no matches" empty state toggles on a zero-result query and off otherwise', () => {
  const dom = makeDom(ROWS); scope.setDoc(dom.doc);
  scope.membersFilterRows('zzzznomatch');
  assert.equal(dom.empty.style.display, 'block');
  scope.membersFilterRows('smith');
  assert.equal(dom.empty.style.display, 'none');
});

test('SECURITY: the filter only shows/hides existing rows — it never adds a member', () => {
  const dom = makeDom(ROWS); scope.setDoc(dom.doc);
  for (const q of ['', 'smith', 'x', 'prop lock', 'JOHN']) scope.membersFilterRows(q);
  assert.equal(dom.rows.length, ROWS.length, 'row set is exactly what was rendered — never widened');
  assert.ok(dom.rows.every(r => 'display' in r.style), 'the filter operates purely by display toggling');
});

// ── SNAPSHOT / RESTORE (the fix) ────────────────────────────────────────────

test('snapshot returns null when the search is untouched (nothing to preserve)', () => {
  const dom = makeDom(ROWS); scope.setDoc(dom.doc);
  assert.equal(scope.membersSearchSnapshot(), null);
});

test('a focused, half-typed search survives a full rebuild (value + focus + caret + filter)', () => {
  // BEFORE the repaint: the coach has focused the box and typed "smi".
  const before = makeDom(ROWS); scope.setDoc(before.doc);
  before.input.value = 'smi'; before.input.setSelectionRange(3, 3); before.input.focus();
  const snap = scope.membersSearchSnapshot();
  assert.deepEqual(snap, { value: 'smi', start: 3, end: 3, focused: true });

  // THE REPAINT: renderPlayers replaced the subtree — a brand-new empty input
  // and freshly rendered rows, nothing focused.
  const after = makeDom(ROWS); scope.setDoc(after.doc);
  scope.membersSearchRestore(snap);

  assert.equal(after.input.value, 'smi', 'query survived the rebuild');
  assert.equal(after.doc.activeElement, after.input, 'focus was restored to the search box');
  assert.equal(after.input.selectionStart, 3, 'caret position restored');
  assert.deepEqual(visibleNames(after), ['John Smith'], 'the filter was re-applied to the fresh rows');
});

test('a typed-but-blurred search keeps its query across a rebuild WITHOUT stealing focus', () => {
  const before = makeDom(ROWS); scope.setDoc(before.doc);
  before.input.value = 'jones';                 // typed, then tapped away (not focused)
  const snap = scope.membersSearchSnapshot();
  assert.deepEqual(snap, { value: 'jones', start: 0, end: 0, focused: false });

  const after = makeDom(ROWS); scope.setDoc(after.doc);
  scope.membersSearchRestore(snap);
  assert.equal(after.input.value, 'jones', 'query preserved');
  assert.deepEqual(visibleNames(after), ['Sarah Jones'], 'filter re-applied');
  assert.equal(after.doc.activeElement, null, 'focus NOT forced onto a box the coach had left');
});

test('restoring a null snapshot is a no-op (a fresh open shows the full list)', () => {
  const after = makeDom(ROWS); scope.setDoc(after.doc);
  scope.membersSearchRestore(null);
  assert.equal(after.input.value, '');
  assert.deepEqual(visibleNames(after), ['John Smith', 'Sarah Jones', 'Peter Smythe']);
  assert.equal(after.doc.activeElement, null);
});
