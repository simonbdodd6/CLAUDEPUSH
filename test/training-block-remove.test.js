/**
 * Training planner — block removal must work for BOTH sessions.
 *
 * Bug: removeTimeBlock/updateTimeBlock compared ids with strict !== / ===, but the
 * rendered onclick passes the id as a STRING (`'${b.id}'`). A block whose stored id
 * is a NUMBER (legacy / server-shaped data — as Training Session 2 had) never matched
 * `123 !== "123"`, so it could not be removed or edited. Session 1 happened to hold
 * string "tb…" ids, so it worked. Fix: compare ids as strings.
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
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function buildScope(trainingBlocks) {
  const state = { trainingBlocks, schedule: [] };
  const noop = () => {};
  const factory = new Function(
    'state', 'saveState', 'showToast', 'render', 'syncPublishedSessionEdit',
    extractFn('removeTimeBlock') + '\n' + extractFn('updateTimeBlock') + '\n' +
    'return { removeTimeBlock, updateTimeBlock };'
  );
  return { ...factory(state, noop, noop, noop, noop), state };
}

test('Session 2: a NUMERIC-id block is removed (the reported bug)', () => {
  const { removeTimeBlock, state } = buildScope({ tue: [], thu: [{ id: 123, activity: 'S2' }] });
  removeTimeBlock('thu', '123');                       // onclick passes a string
  assert.equal(state.trainingBlocks.thu.length, 0, 'numeric-id block removed');
});

test('Session 1: a string-id block still removes (unchanged behaviour)', () => {
  const { removeTimeBlock, state } = buildScope({ tue: [{ id: 'tb1', activity: 'S1' }], thu: [] });
  removeTimeBlock('tue', 'tb1');
  assert.equal(state.trainingBlocks.tue.length, 0);
});

test('removing a Session 2 block does not remove the Session 1 block (and vice versa)', () => {
  const a = buildScope({ tue: [{ id: 'x', activity: 'S1' }], thu: [{ id: 'x', activity: 'S2' }] });
  a.removeTimeBlock('thu', 'x');
  assert.equal(a.state.trainingBlocks.tue.length, 1, 'session 1 kept');
  assert.equal(a.state.trainingBlocks.thu.length, 0, 'session 2 removed');

  const b = buildScope({ tue: [{ id: 5, activity: 'S1' }], thu: [{ id: 6, activity: 'S2' }] });
  b.removeTimeBlock('tue', '5');
  assert.equal(b.state.trainingBlocks.tue.length, 0, 'session 1 removed');
  assert.equal(b.state.trainingBlocks.thu.length, 1, 'session 2 kept');
});

test('updateTimeBlock also matches numeric ids (same root cause)', () => {
  const { updateTimeBlock, state } = buildScope({ thu: [{ id: 99, activity: 'old' }] });
  updateTimeBlock('thu', '99', 'activity', 'new');
  assert.equal(state.trainingBlocks.thu[0].activity, 'new');
});
