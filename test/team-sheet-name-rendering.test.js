/**
 * BUILD AH — TEAM SHEET NAMES ARE NEVER CLIPPED.
 *
 * Two defects, one root. The name plates on the selection pitch and the bench
 * were <input> elements: an input renders exactly one line and hard-clips
 * anything wider than its fixed box, so a long name lost its surname — on
 * screen, and again in the exported graphic (which is a screenshot of the
 * same DOM). Separately, the export captured only #matchday-pitch, and the
 * bench row lives OUTSIDE it: the downloaded team sheet had no replacements
 * on it at all.
 *
 * The plates are SPANS now (same classes, same picker behaviour, no autofill
 * surface at all) with wrap-to-two-lines styling, and the export captures the
 * pitch WRAP — pitch plus bench — on a solid backdrop.
 *
 * The deep behavioural proof (measured clipping/overlap at three viewports,
 * and pixel inspection of the actual exported PNG) runs in the browser
 * harness; these tests pin the mechanics that make it true and the state
 * plumbing the span swap moved.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX = process.env.CE_INDEX_HTML || join(__dirname, '..', 'index.html');
const html = await readFile(INDEX, 'utf8');

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
const strip = s => s.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

// ─────────────── the plates can wrap — inputs cannot ────────────────────────

test('both name plates are spans, not inputs', () => {
  assert.match(html, /<span class="slot-name-input j12-name/, 'starter plate is a span');
  assert.match(html, /<span class="slot-name-input mcx2-bjname/, 'bench plate is a span');
  assert.ok(!/<input[^>]*j12-name/.test(html), 'no input remains on the pitch plates');
  assert.ok(!/<input[^>]*mcx2-bjname/.test(html), 'no input remains on the bench plates');
});

test('the plate text is the ESCAPED player name — special characters render, not break', () => {
  assert.match(html, /class="pn-full">\$\{esc\(slotName\)\}<\/span>/, 'slot full name goes through esc()');
  assert.match(html, /class="pn-compact">\$\{esc\(compactName\)\}<\/span>/,
    'and so does the compact form');
  assert.match(html, /class="pn-full">\$\{esc\(bn\)\}<\/span>/, 'bench full name goes through esc()');
  assert.match(html, /class="pn-compact">\$\{esc\(mcPlateCompactName\(bn\)\)\}<\/span>/);
});

test('the compact form is initial + FULL surname — surnames are never cut', () => {
  const compact = new Function(`"use strict";
    ${extractFn(html, 'mcPlateCompactName')} return mcPlateCompactName;`)();
  assert.equal(compact('Adrian Trabada da Silva'), 'A. Trabada da Silva',
    'first-name initial, every surname word intact');
  assert.equal(compact('Christopher Oyelaran-Whitmore'), 'C. Oyelaran-Whitmore');
  assert.equal(compact('Bo Li'), 'Bo Li', 'short names stay exactly as written');
  assert.equal(compact('Tom Brown'), 'Tom Brown', 'normal names are untouched');
  assert.equal(compact('Mononym'), 'Mononym', 'a single word cannot be abbreviated');
  assert.equal(compact(''), '', 'empty stays empty');
});

test('VERY long names (>24 chars) render their compact form at EVERY width', () => {
  // Two 108px desktop lines hold ~24 characters; beyond that the full form
  // cannot avoid a clipped third line, so the plate carries pn-xl and the
  // compact rendition takes over everywhere — surnames always complete.
  assert.match(html, /\$\{slotName\.length > 24 \? ' pn-xl' : ''\}/, 'starter plates classify by full length');
  assert.match(html, /\$\{bn\.length > 24 \? ' pn-xl' : ''\}/, 'bench plates too');
  assert.match(html, /\.pn-xl \.pn-full \{ display: none; \}/, 'xl hides the full form');
  assert.match(html, /\.pn-xl \.pn-compact \{ display: inline; \}/, 'and shows the compact one');
});

test('the compact form appears ONLY on narrow plates, via CSS — desktop shows full names', () => {
  assert.match(html, /\.pn-compact \{ display: none; \}/, 'compact hidden by default');
  const mobile = html.indexOf('.j12-name .pn-full, .mcx2-bjname .pn-full { display: none; }');
  assert.ok(mobile > -1, 'mobile hides the full form');
  const mediaStart = html.lastIndexOf('@media (max-width: 600px)', mobile);
  assert.ok(mobile - mediaStart < 600 && mediaStart > -1, 'inside the mobile media query');
  assert.match(html, /\.j12-name \.pn-compact, \.mcx2-bjname \.pn-compact \{ display: inline; \}/);
  // the tooltip always carries the COMPLETE name, whatever the plate shows
  const slotPlate = html.indexOf('<span class="slot-name-input j12-name');
  assert.match(html.slice(slotPlate, slotPlate + 200), /title="\$\{inputVal\}"/,
    'full name in the slot tooltip');
});

test('the wrap CSS is in force for BOTH plate classes and wins the cascade', () => {
  // The rule must appear AFTER the V19 presentation block (the last previous
  // writer of these classes), or a later nowrap would re-clip the names.
  const rule = html.indexOf('.j12-name, .mcx2-bjname {\n      white-space: normal !important;');
  assert.ok(rule > -1, 'the shared wrap rule exists');
  const v19 = html.indexOf('MATCH CENTRE V19');
  assert.ok(rule > v19, 'declared after V19, so it wins the cascade');
  const block = html.slice(rule, rule + 600);
  assert.match(block, /overflow-wrap: anywhere/, 'even unbroken surnames can wrap');
  assert.match(block, /-webkit-line-clamp: 2/, 'bounded at two lines — controlled, not unbounded growth');
  assert.match(block, /min-height: calc/, 'single-line plates keep a uniform height');
  assert.ok(!/font-size/.test(block), 'the fix does NOT shrink the typography');
});

test('the picker behaviour survives the swap — click and keyboard', () => {
  // anchor on the PLATE (tabindex marks it) — the jersey div carries the same
  // data attribute but is not the element under test
  for (const plate of ['tabindex="0" data-pslot="${label}"', 'tabindex="0" data-bench="${i}"']) {
    const i = html.indexOf(plate);
    assert.ok(i > -1, plate + ' exists');
    const around = html.slice(i - 200, i + 300);
    assert.match(around, /onclick="mcOpenPicker\(event\)"/, plate + ' clicks open the picker');
    assert.match(around, /onkeydown=.if\(event\.key==='Enter'\|\|event\.key===' '\)/, plate + ' works from the keyboard');
    assert.match(around, /role="button"/, plate + ' is announced as a button');
  }
});

// ─────────────── the selection state stays canonical ────────────────────────

test('mcComputeAvailable builds the placed set from STATE, never from DOM values', () => {
  const src = strip(extractFn(html, 'mcComputeAvailable'));
  assert.match(src, /state\.formationNames/, 'starters from canonical state');
  assert.match(src, /state\.benchPlayers/, 'bench from canonical state');
  assert.ok(!/\.value\b/.test(src), 'no DOM input values — there are no inputs');
  assert.match(src, /operationalPlayers\(\)/, 'the pool rule is unchanged');
  assert.match(src, /mcPersonKey/, 'exclusion is still by person');
});

test('mcComputeAvailable behaves: a placed player leaves the pool, from state alone', () => {
  const w = new Function('cfg', `
    "use strict";
    const state = { formationNames: cfg.formation, benchPlayers: cfg.bench };
    function operationalPlayers() { return cfg.roster; }
    function isRosterPlayerRecord() { return true; }
    function findPlayerByName(n) { return cfg.roster.find(p => p.name === n) || null; }
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'mcComputeAvailable')}
    return mcComputeAvailable();
  `)({
    formation: { '10': 'Adrian Trabada da Silva' },
    bench: ['Jean-Baptiste Vandenbroucke', ''],
    roster: [
      { id: 'p1', name: 'Adrian Trabada da Silva', userId: 'u1' },
      { id: 'p2', name: 'Jean-Baptiste Vandenbroucke', userId: 'u2' },
      { id: 'p3', name: 'Bo Li', userId: 'u3' },
    ],
  });
  assert.deepEqual(w.map(p => p.name), ['Bo Li'],
    'the fly-half and the bench player are excluded with no DOM in existence');
});

test('_mcCurrentName answers from state — the picker prefill cannot regress', () => {
  const w = new Function('cfg', `
    "use strict";
    const state = { formationNames: { '9': 'Scrum Half Longname' }, benchPlayers: ['Bench One'] };
    ${extractFn(html, '_mcCurrentName')}
    return { slot: _mcCurrentName({ type: 'slot', label: '9' }),
             bench: _mcCurrentName({ type: 'bench', idx: 0 }),
             empty: _mcCurrentName({ type: 'slot', label: '2' }) };
  `)({});
  assert.equal(w.slot, 'Scrum Half Longname');
  assert.equal(w.bench, 'Bench One');
  assert.equal(w.empty, '');
  assert.ok(!/document\.querySelector/.test(strip(extractFn(html, '_mcCurrentName'))),
    'no DOM read remains');
});

// ─────────────── the export carries the bench and the full names ────────────

test('the export captures the pitch WRAP — bench included — on a solid backdrop', () => {
  const src = strip(extractFn(html, 'exportFormation'));
  assert.match(src, /querySelector\(".mcx2-pitch-wrap"\)/, 'the wrap (pitch + bench) is the capture target');
  assert.match(src, /getElementById\("matchday-pitch"\)/, 'with the pitch as a safe fallback');
  assert.match(src, /backgroundColor:"#0b0d12"/, 'no transparent hole between pitch and bench');
  // the bench row genuinely lives inside that wrap in the markup
  const wrapStart = html.indexOf('<section class="mcx2-pitch-wrap"');
  const wrapEnd = html.indexOf('</section>', wrapStart);
  const wrap = html.slice(wrapStart, wrapEnd);
  assert.match(wrap, /id="matchday-pitch"/, 'the wrap contains the pitch');
  assert.match(wrap, /mc7-benchrow/, 'and the bench row');
  assert.match(wrap, /mcx2-bjname/, 'with the bench name plates');
});

test('the export filename behaviour is untouched', () => {
  const src = strip(extractFn(html, 'exportFormation'));
  assert.match(src, /matchCentreSelectedFixture\(\)/);
  assert.match(src, /_fx\.date/, 'the fixture\'s own date still names the file');
  assert.match(src, /html2canvas\(pitch, \{ scale:2/, 'still the high-resolution capture');
});

// ─────────────── nothing else moved ─────────────────────────────────────────

test('the swap changed presentation and reads only — no data or selection model change', () => {
  for (const fn of ['_mcSetTarget', '_mcRemovePersonElsewhere', 'publishSquad']) {
    assert.doesNotThrow(() => extractFn(html, fn), fn + ' still exists');
  }
  assert.match(strip(extractFn(html, '_mcSetTarget')), /state\.formationNames\[t\.label\] = name/,
    'selection writes are byte-identical in shape');
  // and the emptiness placeholders still render
  assert.match(html, /: 'Add player'\}<\/span>/, 'empty starter plate still invites');
  assert.match(html, /: '—'\}<\/span>/, 'empty bench plate still shows the dash');
});
