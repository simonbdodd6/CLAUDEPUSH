import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// Extract a top-level `    function name(...) {...}` from index.html (brace-balanced).
function extractFn(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = start;
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — could not find closing brace');
}

// Build an isolated runtime with the REAL edit functions extracted from index.html.
// setTimeout is shadowed to run the debounced sync synchronously so the test is
// deterministic; syncSessionsToServer is spied to count server pushes.
function buildHarness({ coach = true } = {}) {
  const names = ['syncPublishedSessionEdit', 'addTimeBlock', 'removeTimeBlock', 'updateTimeBlock', 'autopilotDuplicateSession'];
  const fns = names.map(n => extractFn(html, n)).join('\n\n');
  const body = `
    let _publishedEditSyncTimer = null;
    const _spy = { sync: 0 };
    const state = {
      schedule: [
        { id: 'tue', title: 'Training session 1', published: true },
        { id: 'thu', title: 'Training session 2', published: false },
      ],
      trainingBlocks: {
        tue: [{ id: 'b1', time: '19:45', activity: 'Warm up' }],
        thu: [{ id: 'b2', time: '19:45', activity: 'Drill' }],
      },
      lastWeekTrainingBlocks: { tue: [{ id: 'lw1', time: '19:45', activity: 'Last week plan' }] },
    };
    function isCoach() { return ${coach}; }
    function saveState() {}
    function render() {}
    function notify() {}
    function showToast() {}
    function autopilotReceipt() {}
    async function syncSessionsToServer() { _spy.sync++; }
    const setTimeout = (fn) => { fn(); return 1; };   // run debounced sync synchronously
    const clearTimeout = () => {};
    ${fns}
    return { state, spy: _spy, addTimeBlock, removeTimeBlock, updateTimeBlock, autopilotDuplicateSession };
  `;
  return new Function(body)();
}

test('add block on a PUBLISHED session re-syncs the published plan', () => {
  const h = buildHarness();
  h.addTimeBlock('tue');
  assert.equal(h.state.trainingBlocks.tue.length, 2, 'block added locally');
  assert.equal(h.spy.sync, 1, 'published session pushed to server without re-publishing');
});

test('edit block on a PUBLISHED session re-syncs', () => {
  const h = buildHarness();
  h.updateTimeBlock('tue', 'b1', 'activity', 'Updated activity');
  assert.equal(h.state.trainingBlocks.tue[0].activity, 'Updated activity');
  assert.equal(h.spy.sync, 1);
});

test('delete block on a PUBLISHED session re-syncs', () => {
  const h = buildHarness();
  h.removeTimeBlock('tue', 'b1');
  assert.equal(h.state.trainingBlocks.tue.length, 0, 'block removed locally');
  assert.equal(h.spy.sync, 1);
});

test('duplicate last week into a PUBLISHED session re-syncs', () => {
  const h = buildHarness();
  h.autopilotDuplicateSession('tue');
  assert.equal(h.spy.sync, 1);
});

test('UNPUBLISHED (draft) session edits never push — draft behaviour preserved', () => {
  const h = buildHarness();          // 'thu' is a draft (published: false)
  h.addTimeBlock('thu');
  h.updateTimeBlock('thu', 'b2', 'activity', 'x');
  h.removeTimeBlock('thu', 'b2');
  assert.equal(h.spy.sync, 0, 'a draft session is only pushed on Publish, never on edit');
});

test('a non-coach editing never triggers a server push', () => {
  const h = buildHarness({ coach: false });
  h.addTimeBlock('tue');
  h.updateTimeBlock('tue', 'b1', 'activity', 'y');
  assert.equal(h.spy.sync, 0);
});
