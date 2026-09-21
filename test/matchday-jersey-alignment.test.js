/**
 * MATCH DAY — jersey/marker alignment.
 *
 * Every pitch marker is absolutely positioned on its slot's percentage
 * coordinate and centred with translate(-50%,-50%). The marker is a grid: the
 * jersey, then the name plate. The plate is DESIGNED wider than the slot (108
 * vs 96; 62 vs 56 on a phone) — and a grid track sizes to its widest item and
 * overflows to the END edge, so the whole marker rendered 6px to the RIGHT of
 * the coordinate it sits on (3px at phone size). Measured on a full XV:
 * slots 6/7 and 11/14 are mirror-image coordinates (19.5 / 80.5), yet rendered
 * 12px apart in their left/right margins.
 *
 * The fix pins the grid track to the slot's own width and centres the wider
 * plate on it, so jersey AND plate sit exactly on the coordinate at every
 * breakpoint. It is a layout rule, not a per-player nudge: the formation
 * coordinates, numbers, names, selection and bench are untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const matchday = (() => {
  const i = html.indexOf('function renderMatchday()');
  const j = html.indexOf('\n    function ', i + 10);
  return html.slice(i, j);
})();

// ── the formation itself is untouched ────────────────────────────────────────

test('the XV coordinates are exactly as before — no player was nudged', () => {
  const src = /const rugbySlots = \[([\s\S]*?)\];/.exec(html)[1];
  const slots = [...src.matchAll(/\["(\d+)",([\d.]+),([\d.]+)\]/g)].map(m => [m[1], +m[2], +m[3]]);
  assert.deepEqual(slots, [
    ['1', 32.5, 19], ['2', 50, 19], ['3', 66.5, 19],
    ['4', 39, 32], ['5', 60, 32],
    ['6', 19.5, 39], ['8', 50, 42], ['7', 80.5, 39],
    ['9', 37.5, 51], ['10', 60.5, 57],
    ['11', 19.5, 78], ['12', 37.5, 68], ['13', 63.5, 70], ['14', 80.5, 78],
    ['15', 50, 84],
  ]);
  assert.equal(slots.length, 15, 'fifteen starting slots');
  assert.equal(new Set(slots.map(s => s[0])).size, 15, 'each jersey number once');
});

test('markers are placed ONLY from those coordinates — no per-player offsets', () => {
  const marker = matchday.slice(matchday.indexOf('${rugbySlots.map(([label, x, y], i) => {'));
  assert.match(marker, /style="left:\$\{x\}%;top:\$\{y\}%"/, 'position comes straight from the slot');
  // Nothing in the marker adds a hand-tuned shift.
  assert.doesNotMatch(marker.slice(0, 2000), /margin-left:\s*-?\d|translateX\(\s*-?\d+px/, 'no per-slot nudges');
});

test('each marker still carries its number, its player and its handlers', () => {
  const marker = matchday.slice(matchday.indexOf('${rugbySlots.map(([label, x, y], i) => {'));
  assert.match(marker, /data-slot="\$\{label\}"/);
  assert.match(marker, /<span class="j12-num">\$\{label\}<\/span>/, 'the jersey shows its own number');
  assert.match(marker, /data-pslot="\$\{label\}" data-name="\$\{inputVal\}"/, 'the player is bound to the slot');
  assert.match(marker, /ondragstart="handlePitchDragStart\(event\)"/);
  assert.match(marker, /ondrop="this\.classList\.remove\('drag-over'\);handleSlotDrop\('\$\{label\}',event\)"/);
  assert.match(marker, /onclick="mcOpenPicker\(event\)"/, 'tap-to-pick intact');
  // The name plate keeps its compact/long handling, so long names never resize the slot.
  assert.match(marker, /mcPlateCompactName\(slotName\)/);
});

test('selection, formation and bench are read exactly as before', () => {
  assert.match(matchday, /const fnames           = state\.formationNames \|\| \{\};/);
  assert.match(matchday, /const slotNames = rugbySlots\.map\(\(\[label\]\) => \{/);
  assert.match(matchday, /handleBenchDrop\(\$\{i\},event\)/, 'the 8 bench slots keep their drop target');
  assert.match(matchday, /\$\{i\+16\}/, 'bench numbering 16–23 unchanged');
});

// ── the layout rule ──────────────────────────────────────────────────────────

test('the marker grid is pinned to the slot width, and the plate centres on it', () => {
  assert.match(html, /\.mc12-pitch \.mc12-slot \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(html, /\.mc12-pitch \.j12-name  \{ justify-self: center; margin-inline: 0; \}/);
});

test('the design itself is unchanged — same slot box, same plate width', () => {
  assert.match(html, /\.mc12-pitch \.mc12-slot \{ width: 96px !important; z-index: 2; \}/);
  assert.match(html, /\.mc12-pitch \.j12-name \{ width: 108px; \}/);
  assert.match(html, /@media \(max-width: 600px\) \{[\s\S]*?\.mc12-pitch \.j12-name \{ width: 62px; \}/);
  assert.match(html, /\.slot-big \{ position:absolute; transform:translate\(-50%,-50%\); width:88px;/,
    'markers are still centred on their coordinate');
});

test('the plate keeps its own auto margins everywhere else (bench, other pitches)', () => {
  assert.match(html, /\.j12-name \{ display: block; width: 96px; margin: 3px auto 0;/,
    'the base rule is untouched — only the mc12 pitch overrides the inline margins');
});
