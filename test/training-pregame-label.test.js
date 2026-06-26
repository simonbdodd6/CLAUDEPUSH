import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

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
  throw new Error('function ' + name + ' — no closing brace');
}

const scope = new Function(
  extractFn(html, 'coachTrainingSessionLabel') + '\n' + extractFn(html, 'isPreGameTrainingSession') +
  '\nreturn { coachTrainingSessionLabel, isPreGameTrainingSession };'
)();
const { coachTrainingSessionLabel, isPreGameTrainingSession } = scope;

test('the Match seed reads as "Pre-game / Warm-up" on the coach card', () => {
  assert.equal(coachTrainingSessionLabel({ id: 'game', type: 'Match', title: 'Match' }), 'Pre-game / Warm-up');
  assert.equal(coachTrainingSessionLabel({ id: 'x', type: 'Match', title: 'Anything' }), 'Pre-game / Warm-up');
  assert.equal(coachTrainingSessionLabel({ id: 'game', title: '' }), 'Pre-game / Warm-up');
});

test('training sessions keep their own titles (player data unchanged)', () => {
  assert.equal(coachTrainingSessionLabel({ id: 'tue', type: 'Training', title: 'Training session 1' }), 'Training session 1');
  assert.equal(coachTrainingSessionLabel({ id: 'thu', type: 'Training', title: 'Training session 2' }), 'Training session 2');
  assert.equal(coachTrainingSessionLabel({ id: 'tue' }), 'tue');
  assert.equal(coachTrainingSessionLabel(null), 'Session');
});

test('isPreGameTrainingSession identifies the third (Match) session only', () => {
  assert.equal(isPreGameTrainingSession({ type: 'Match' }), true, 'gates hiding the duplicate run sheet');
  assert.equal(isPreGameTrainingSession({ id: 'game' }), true);
  assert.equal(isPreGameTrainingSession({ id: 'tue', type: 'Training' }), false, 'run sheet kept for session 1');
  assert.equal(isPreGameTrainingSession({ id: 'thu', type: 'Training' }), false, 'run sheet kept for session 2');
  assert.equal(isPreGameTrainingSession(null), false);
});
