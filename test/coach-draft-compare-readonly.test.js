/**
 * Coach Draft Compare (Phase 2) — the read-only viewer MUST be a pure function
 * of the squad it is given. Opening another coach's draft can never mutate the
 * viewing coach's own draft (state.formationNames / benchPlayers / matchCentre).
 *
 * Two guards:
 *  1. Static — mcReadOnlySquadHTML references no `state.` at all (stateless).
 *  2. Behavioural — executed with a live sentinel `state`, it renders the passed
 *     squad and leaves `state` byte-for-byte unchanged.
 */
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
  while (source[i] !== '(') i++;
  let pd = 0;
  for (; i < source.length; i++) { if (source[i] === '(') pd++; else if (source[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  while (source[i] !== '{') i++;
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error('function ' + name + ' — no closing brace');
}

const readOnly = extractFn(html, 'mcReadOnlySquadHTML');

test('the read-only viewer render path references no state at all (pure)', () => {
  assert.ok(!/\bstate\b/.test(readOnly),
    'mcReadOnlySquadHTML must not read or write `state` — it renders only its squad argument');
});

test('viewer functions never ASSIGN to the viewer\'s own draft state', () => {
  for (const fn of ['mcViewCoachDraft', '_mcOpenCompareViewer', 'mcReadOnlySquadHTML']) {
    const body = extractFn(html, fn);
    for (const bad of ['state.formationNames =', 'state.benchPlayers =', 'state.matchCentre =',
                       'state.formationNames=', 'state.benchPlayers=', 'state.matchCentre=']) {
      assert.ok(!body.includes(bad), `${fn} must not assign ${bad}`);
    }
  }
});

test('executing the viewer renders the passed squad and leaves `state` untouched', () => {
  // Live sentinel state = the VIEWING coach's own draft.
  const state = { formationNames: { '1': 'MY_OWN_PROP' }, benchPlayers: ['MY_OWN_SUB'], matchCentre: { opposition: 'MyOpp' } };
  const before = JSON.stringify(state);

  const rugbySlots = [['1'], ['2'], ['9'], ['10'], ['15']];
  const RUGBY_POS = { '1': 'Loosehead', '2': 'Hooker', '9': 'Scrum-half', '10': 'Fly-half', '15': 'Fullback' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const run = new Function('state', 'rugbySlots', 'RUGBY_POS', 'esc',
    extractFn(html, 'mcReadOnlySquadHTML') + '\nreturn mcReadOnlySquadHTML;')(state, rugbySlots, RUGBY_POS, esc);

  // Another coach's draft — deliberately different from `state`.
  const otherSquad = { opposition: 'ThemFC', formationNames: { '1': 'THEIR_PROP', '10': 'THEIR_FLY' }, benchPlayers: ['THEIR_SUB'] };
  const out = run('Rival Coach · Coach', 'Updated 3 min ago · Read-only', otherSquad);

  // Renders the OTHER coach's players…
  assert.ok(out.includes('THEIR_PROP'), 'shows the viewed draft starter');
  assert.ok(out.includes('THEIR_FLY'), 'shows the viewed draft fly-half');
  assert.ok(out.includes('THEIR_SUB'), 'shows the viewed draft bench');
  assert.ok(out.includes('Back to my draft'), 'offers the back-to-my-draft control');
  assert.ok(/Read-only/i.test(out), 'shows the read-only badge/label');
  // …and does NOT leak the viewer's own draft into the sheet.
  assert.ok(!out.includes('MY_OWN_PROP'), 'the viewer sheet does not contain the viewing coach\'s own players');

  // The viewing coach's own draft is byte-for-byte unchanged.
  assert.equal(JSON.stringify(state), before, 'viewing another coach\'s draft did not mutate my own draft');
});
