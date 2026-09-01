/**
 * ONE message centre.
 *
 * renderMessageCenter() carried a SECOND implementation of the coach's message
 * centre — 218 lines sitting after `return renderMessageCenterV2();`, and so
 * unreachable from the moment V2 landed.
 *
 * It was not inert in the way dead code is supposed to be. Two attendance
 * honesty fixes were applied inside it, to a screen no coach could open. Its
 * markup was the ONLY definition of seven element ids that live code still
 * looks up. And a source-shape test in another suite was green about a debug
 * button that had not rendered since V2, because the dead copy still matched.
 *
 * This file exists so a duplicate cannot quietly return: the wrapper delegates
 * and does nothing else, and V2 remains the single implementation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(src, name, indent = '    ') {
  let start = src.indexOf(indent + 'function ' + name + '(');
  if (start === -1) start = src.indexOf(indent + 'async function ' + name + '(');
  if (start === -1) throw new Error(name + ' not found');
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = src.indexOf('{', i), depth = 0;
  for (let k = brace; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(start, k + 1); }
  }
  throw new Error('no closing brace for ' + name);
}
const strip = s => s.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n').replace(/<!--[\s\S]*?-->/g, '');

test('renderMessageCenter delegates, and does nothing else', () => {
  const body = strip(extractFn(html, 'renderMessageCenter'));
  const statements = body.split('\n')
    .map(l => l.trim()).filter(Boolean)
    .filter(l => l !== '}' && !l.startsWith('function renderMessageCenter'));
  assert.deepEqual(statements, ['return renderMessageCenterV2();'],
    'the wrapper is one statement — anything else is a second implementation returning');
});

test('nothing unreachable survives after the delegation', () => {
  // Not a line count: whatever follows a top-level `return` in this function can
  // never run, so there must be nothing after it at all.
  const body = strip(extractFn(html, 'renderMessageCenter'));
  const afterReturn = body.slice(body.indexOf('return renderMessageCenterV2();') + 'return renderMessageCenterV2();'.length);
  assert.equal(afterReturn.replace(/[\s}]/g, ''), '', 'code after the return is unreachable by definition');
});

test('V2 is still the implementation, and still the one the app renders', () => {
  const v2 = extractFn(html, 'renderMessageCenterV2');
  assert.ok(v2.length > 5000, 'V2 is the real screen, not a stub');
  // Its own helpers survived the deletion.
  for (const helper of ['coachSelectedEvent', 'sessionRows', 'sortAvailabilityRows',
                        'availabilityRowMatchesFilter', 'coachAvailEvents',
                        'buildPlayerDetailHtml', 'openPlayerAvailabilityPopup']) {
    assert.equal(html.split('function ' + helper + '(').length - 1, 1, helper + ' must still be defined once');
    assert.ok(v2.includes(helper) || html.includes(helper + '('), helper + ' must still be reachable');
  }
  assert.equal(html.split('function renderMessageCenterV2(').length - 1, 1, 'exactly one V2');
});

test('every live caller of renderMessageCenter still has something to call', () => {
  const script = strip(html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>')));
  const calls = [...script.matchAll(/renderMessageCenter\(\)/g)].length;
  assert.ok(calls >= 4, `the four live call sites must survive (found ${calls})`);
  // The render registry, the live refresh, and the board's filter and sort.
  assert.match(script, /safeRender\(null,\s*\(\) => renderMessageCenter\(\)\)/);
  assert.match(script, /_resolvedChanged\) renderMessageCenter\(\)/);
  assert.match(strip(extractFn(html, 'setAvailabilityBoardFilter')), /renderMessageCenter\(\)/);
  assert.match(strip(extractFn(html, 'setAvailabilityBoardSort')), /renderMessageCenter\(\)/);
});

test('the deleted screen took nothing live with it', () => {
  // Seven element ids existed ONLY in the deleted body. Every live lookup of
  // them is null-guarded and has been dormant since V2 — this pins that they
  // stay guarded, so the file cannot start throwing on an element it no longer
  // renders.
  const script = html;
  const orphans = {
    messageBody:            ['applyTemplate', 'prefillCoachMessage', 'sendInAppMessage'],
    messageAudience:        ['renderAudiencePicker', 'sendInAppMessage'],
    'audience-picker-slot': ['renderAudiencePicker'],
    'live-templates-panel': ['loadLiveTemplates'],
    'live-log-panel':       ['loadLiveLog'],
  };
  for (const [id, fns] of Object.entries(orphans)) {
    assert.ok(!new RegExp(`id="${id}"`).test(strip(script)), `${id} is no longer rendered anywhere`);
    for (const fn of fns) {
      const src = strip(extractFn(html, fn));
      assert.match(src, /if \(!\w+\) return|if \(\w+( && \w+)?\)|\w+ \? \w+\./,
        `${fn} must stay null-safe about ${id}`);
    }
  }
});
