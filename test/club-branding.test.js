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
  extractFn(html, '_hexToRgba') + '\n' + extractFn(html, '_hexScale') + '\n' + extractFn(html, 'clubBrandVars') +
  '\nreturn { _hexToRgba, _hexScale, clubBrandVars };'
)();
const { _hexToRgba, _hexScale, clubBrandVars } = scope;

test('_hexToRgba converts #rrggbb to rgba at the given alpha', () => {
  assert.equal(_hexToRgba('#10b981', 0.13), 'rgba(16, 185, 129, 0.13)');
  assert.equal(_hexToRgba('0ea5e9', 0.34), 'rgba(14, 165, 233, 0.34)');
  assert.equal(_hexToRgba('not-a-colour', 0.5), null);
});

test('_hexScale darkens a colour toward black (readable outgoing bubble)', () => {
  assert.equal(_hexScale('#ffffff', 0.5), 'rgb(128, 128, 128)');  // exactly-representable factor
  assert.equal(_hexScale('#000000', 0.42), 'rgb(0, 0, 0)');
  assert.equal(_hexScale('nope', 0.42), null);
  // darkening keeps every channel <= the original
  const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(_hexScale('#e11d48', 0.42));
  assert.ok(+m[1] <= 0xe1 && +m[2] <= 0x1d && +m[3] <= 0x48);
});

test('club colours map to the brand + accent CSS variables', () => {
  const vars = clubBrandVars({ primary: '#ff5500', secondary: '#0044ff' });
  assert.equal(vars['--brand'], '#ff5500', 'primary drives --brand (buttons / active nav)');
  assert.equal(vars['--brand-2'], '#0044ff', 'secondary drives --brand-2');
  assert.equal(vars['--brand-soft'], 'rgba(255, 85, 0, 0.13)');
  assert.equal(vars['--brand-line'], 'rgba(255, 85, 0, 0.34)');
  assert.ok(vars['--glow-brand'].includes('rgba(255, 85, 0'));
  // The brand gradient (club badge + view-switch) blends secondary → primary.
  assert.equal(vars['--brand-grad'], 'linear-gradient(135deg, #0044ff 0%, #ff5500 100%)');
  // Active-tab / selected highlights (session cards, filter pills, chat contacts,
  // tab underlines) re-skin to the club primary via --accent.
  assert.equal(vars['--accent'], '#ff5500', 'primary drives --accent (active tabs / highlights)');
  assert.equal(vars['--accent-soft'], 'rgba(255, 85, 0, 0.12)');
  assert.equal(vars['--accent-line'], 'rgba(255, 85, 0, 0.34)');
  // Soft page glow + a more present logged-in background wash + readable bubble.
  assert.equal(vars['--page-glow'], 'rgba(255, 85, 0, 0.18)');
  assert.equal(vars['--page-wash'], 'rgba(255, 85, 0, 0.2)', 'logged-in workspace shows more of the club primary');
  assert.match(vars['--bubble-mine'], /^rgb\(\d+, \d+, \d+\)$/, 'darkened primary, readable with light text');
  // Brand + accent + page vars only — status colours (--green/--red/--amber) are untouched.
  assert.deepEqual(Object.keys(vars).sort(),
    ['--accent', '--accent-line', '--accent-soft', '--brand', '--brand-2', '--brand-grad', '--brand-line', '--brand-soft', '--bubble-mine', '--glow-brand', '--page-glow', '--page-wash']);
});

test('secondary falls back to primary when absent', () => {
  assert.equal(clubBrandVars({ primary: '#10b981' })['--brand-2'], '#10b981');
});

test('no / invalid colours → empty map so the default Coach\'s Eye theme restores', () => {
  assert.deepEqual(clubBrandVars(null), {});
  assert.deepEqual(clubBrandVars({}), {});
  assert.deepEqual(clubBrandVars({ primary: 'green' }), {}, 'non-hex primary is ignored');
  assert.deepEqual(clubBrandVars({ secondary: '#0ea5e9' }), {}, 'secondary alone does not re-skin');
});
