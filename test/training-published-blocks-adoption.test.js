import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// Extract a top-level `    function name(...) {...}` from index.html.
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

const adoptPublishedBlocks = new Function(extractFn(html, 'adoptPublishedBlocks') + '\nreturn adoptPublishedBlocks;')();

const publishedSessions = () => ([
  { id: 'tue', title: 'Training session 1', published: true, blocks: [{ id: 'b1', time: '19:45', activity: 'Warm up' }] },
  { id: 'thu', title: 'Training session 2', published: true, blocks: [{ id: 'b2', time: '19:45', activity: 'Defence' }] },
  { id: 'game', title: 'Match', published: true, blocks: [] },
]);

test('player adopts every published plan (Training page shows the plan)', () => {
  const tb = adoptPublishedBlocks({ tue: [], thu: [], game: [] }, publishedSessions(), false);
  assert.equal(tb.tue.length, 1, 'session 1 plan adopted');
  assert.equal(tb.thu.length, 1, 'session 2 plan adopted');
});

test('coach with NO local blocks adopts the published plan (root-cause fix)', () => {
  // Reproduces the bug: a coach whose local trainingBlocks is empty (reload /
  // new device / force-sync) previously kept "No session plan yet" because the
  // adoption was gated `if (!isCoach())`. It must now adopt the published plan.
  const tb = adoptPublishedBlocks({ tue: [], thu: [], game: [] }, publishedSessions(), true);
  assert.equal(tb.tue.length, 1, 'published Training session 1 plan now renders for the coach');
  assert.equal(tb.thu.length, 1, 'published Training session 2 plan now renders for the coach');
});

test('coach with richer in-progress local edits is never clobbered', () => {
  const localTue = [{ id: 'l1', activity: 'A' }, { id: 'l2', activity: 'B' }, { id: 'l3', activity: 'C' }];
  const tb = adoptPublishedBlocks({ tue: localTue, thu: [], game: [] }, publishedSessions(), true);
  assert.equal(tb.tue.length, 3, 'coach local edits preserved (not overwritten by the 1-block server plan)');
  assert.equal(tb.tue, localTue, 'same local array kept');
  assert.equal(tb.thu.length, 1, 'empty session still adopts the published plan');
});

test('a published session with no blocks never overwrites existing local blocks', () => {
  const tb = adoptPublishedBlocks({ game: [{ id: 'g1', activity: 'kept' }] }, publishedSessions(), false);
  assert.equal(tb.game.length, 1, 'server sent blocks:[] for game → local kept, not wiped');
});
