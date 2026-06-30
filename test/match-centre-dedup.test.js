/**
 * Match Centre — duplicate-player + bench-login bug fixes.
 *
 * A single real member must not be selectable in more than one pitch slot or
 * bench slot. Selection de-duplicates by a STABLE person key (linked account id
 * or, for guests, the normalised name) — not by raw display string — so two
 * records of the same person collapse to one. Clicking a bench jersey opens the
 * squad picker, never a login box; the name inputs suppress credential autofill.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

// Param-aware extractor (skips the param list before brace-matching the body).
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

// Build a live scope with the real selection helpers over a mock state.
function buildScope(players) {
  const rugbySlots = JSON.stringify(Array.from({ length: 15 }, (_, i) => [String(i + 1)]));
  return new Function(
    'const rugbySlots = ' + rugbySlots + ';\n' +
    'const state = { players: ' + JSON.stringify(players) + ', formationNames: {}, benchPlayers: Array(8).fill(""), fphotoIds: {} };\n' +
    extractFn(html, 'findPlayerByName') + '\n' +
    extractFn(html, 'mcPersonKey') + '\n' +
    extractFn(html, '_mcRemovePersonElsewhere') + '\n' +
    extractFn(html, '_mcSetTarget') + '\n' +
    'return { state, mcPersonKey, _mcSetTarget };'
  )();
}

const SIMON_DUP = [
  { id: 'p-a', userId: 'acc-simon', name: 'Simon Dodd', position: 'Tighthead' },
  { id: 'p-b', userId: 'acc-simon', name: 'Simon Dodd', position: 'Fullback' }, // linked duplicate
  { id: 'p-old', name: 'Simon B. Dodd', position: 'Lock' },                     // separate stale record
  { id: 'p2', name: 'Ben Stokes', position: 'Lock' },
];

// ── Identity: stable person key, not display string ──────────────────────────
test('duplicate display names collapse to ONE stable person key (ID-based)', () => {
  const { mcPersonKey } = buildScope(SIMON_DUP);
  assert.equal(mcPersonKey('Simon Dodd'), 'id:acc-simon', 'uses the linked account id');
  assert.equal(mcPersonKey('simon dodd'), 'id:acc-simon', 'case-insensitive → same key');
  assert.equal(mcPersonKey('Simon B. Dodd'), 'id:p-old', 'distinct record → distinct key (uses id)');
  assert.notEqual(mcPersonKey('Simon B. Dodd'), mcPersonKey('Simon Dodd'), 'different members stay distinct');
  assert.equal(mcPersonKey(''), '', 'empty is empty');
});

// ── One player cannot appear in two pitch positions ──────────────────────────
test('placing a member already on the pitch MOVES them (no second pitch slot)', () => {
  const s = buildScope(SIMON_DUP);
  s.state.formationNames = { '3': 'Simon Dodd' };
  s._mcSetTarget({ type: 'slot', label: '15' }, 'Simon Dodd');
  assert.equal(s.state.formationNames['15'], 'Simon Dodd', 'now at slot 15');
  assert.equal(s.state.formationNames['3'], '', 'removed from slot 3 — not duplicated');
});

// ── One player cannot appear on both pitch and bench ─────────────────────────
test('placing a pitch member on the bench removes them from the pitch', () => {
  const s = buildScope(SIMON_DUP);
  s.state.formationNames = { '3': 'Simon Dodd' };
  s._mcSetTarget({ type: 'bench', idx: 0 }, 'Simon Dodd');
  assert.equal(s.state.benchPlayers[0], 'Simon Dodd', 'now on the bench');
  assert.equal(s.state.formationNames['3'], '', 'removed from the pitch — one place only');
});

// ── Same person via a DUPLICATE record is still de-duplicated ─────────────────
test('a linked-duplicate record of the same person cannot double up', () => {
  const s = buildScope(SIMON_DUP);
  // p-a and p-b are the same account; both render as "Simon Dodd" → same key.
  s.state.formationNames = { '3': 'Simon Dodd' };
  s._mcSetTarget({ type: 'bench', idx: 1 }, 'Simon Dodd'); // the p-b record
  assert.equal(s.state.formationNames['3'], '', 'the earlier placement is cleared');
  assert.equal(s.state.benchPlayers[1], 'Simon Dodd', 'only one placement remains');
});

// ── Genuinely different members are NOT merged ───────────────────────────────
test('two members with different display names can both be selected', () => {
  const s = buildScope(SIMON_DUP);
  s.state.formationNames = { '3': 'Simon Dodd' };
  s._mcSetTarget({ type: 'slot', label: '15' }, 'Simon B. Dodd');
  assert.equal(s.state.formationNames['3'], 'Simon Dodd', 'Simon Dodd untouched');
  assert.equal(s.state.formationNames['15'], 'Simon B. Dodd', 'Simon B. Dodd placed separately');
});

// ── Structural: pool dedup + ID-based exclusion (no duplicate records offered) ─
test('the Match Centre pool + picker are canonical (deduped) and exclude by person', () => {
  assert.ok(html.includes('canonicalVisiblePlayers().filter(p => (p.lifecycleStatus'), 'render uses the deduped pool');
  assert.ok(html.includes('matchdayPlayers.filter(p => !_seenPersons.has(mcPersonKey(p.name)))'), 'available excludes by person key');
  const picker = extractFn(html, 'mcComputeAvailable');
  assert.ok(picker.includes('canonicalVisiblePlayers()') && picker.includes('mcPersonKey'), 'picker pool deduped + excluded by person');
});

// ── Structural: clicking a bench player opens the picker, NOT a login box ─────
test('clicking a bench player opens the squad picker (never login)', () => {
  assert.ok(html.includes('onclick="mcOpenPicker(event)"'), 'bench/slot jerseys open the picker');
  const open = extractFn(html, 'mcOpenPicker');
  assert.ok(open.includes("getElementById('mc-picker')"), 'it opens the squad picker popup');
  assert.ok(!/welcomeLogin|loginWithForm|loginAs\(|loginIdentityAccount|devLogin/.test(open), 'it never triggers any login flow');
});

// ── Structural: name inputs are READONLY → browser shows no login/email autofill
test('pitch + bench name inputs are readonly (no credential autofill) + open the picker', () => {
  assert.ok(html.includes('readonly data-pslot="${label}" onclick="mcOpenPicker(event)"'), 'slot input readonly + click-to-pick');
  assert.ok(html.includes('readonly data-bench="${i}" onclick="mcOpenPicker(event)"'), 'bench input readonly + click-to-pick');
  // readonly fields are never editable, so the password manager cannot offer
  // saved login/email/password — and there is no oninput typing path to trigger it.
  assert.ok(!/class="slot-name-input j12-name"[^>]*oninput=/.test(html), 'slot name input has no typing handler');
  assert.ok(!/class="slot-name-input mcx2-bjname"[^>]*oninput=/.test(html), 'bench name input has no typing handler');
});

// ── Regression: a moved/removed player must NOT snap back (no index-default) ──
test('regression: NO index-default auto-fill — empty slots stay empty', () => {
  assert.ok(html.includes('const slotName   = slotNames[i] || "";'), 'markup shows the deduped explicit value, not players[i]');
  assert.ok(html.includes('const nm = String(fnames[label] || "").trim() ? fnames[label] : "";'), 'slot display = explicit assignment only');
  assert.ok(!/slotNames = rugbySlots[\s\S]{0,500}selected\[i\]\?\.name/.test(html), 'slotNames derivation has no selected[i] index-default');
});

test('regression: move slot 3 → slot 5 → remove leaves BOTH empty (no snapback)', () => {
  const s = buildScope([{ id: 'p-cy', name: 'Cy Three' }, { id: 'p-ed', name: 'Ed Five' }]);
  s._mcSetTarget({ type: 'slot', label: '3' }, 'Cy Three');
  assert.equal(s.state.formationNames['3'], 'Cy Three');
  s._mcSetTarget({ type: 'slot', label: '5' }, 'Cy Three');   // move 3 → 5
  assert.equal(s.state.formationNames['5'], 'Cy Three', 'now at slot 5');
  assert.equal(s.state.formationNames['3'], '', 'slot 3 cleared on move');
  s._mcSetTarget({ type: 'slot', label: '5' }, '');           // remove from 5
  assert.equal(s.state.formationNames['5'], '', 'slot 5 empty after remove');
  assert.equal(s.state.formationNames['3'], '', 'slot 3 STAYS empty — no snapback');
});

test('regression: move slot 1 → slot 4 → remove leaves BOTH empty (no snapback)', () => {
  const s = buildScope([{ id: 'p-dan', name: 'Dan Four' }]);
  s._mcSetTarget({ type: 'slot', label: '1' }, 'Dan Four');
  s._mcSetTarget({ type: 'slot', label: '4' }, 'Dan Four');   // move 1 → 4
  assert.equal(s.state.formationNames['1'], '', 'slot 1 cleared on move');
  assert.equal(s.state.formationNames['4'], 'Dan Four');
  s._mcSetTarget({ type: 'slot', label: '4' }, '');           // remove
  assert.equal(s.state.formationNames['4'], '', 'slot 4 empty');
  assert.equal(s.state.formationNames['1'], '', 'slot 1 STAYS empty — no snapback');
});

test('regression: pitch → bench moves the player and does not snap back', () => {
  const s = buildScope([{ id: 'p-ann', name: 'Ann One' }]);
  s._mcSetTarget({ type: 'slot', label: '2' }, 'Ann One');
  s._mcSetTarget({ type: 'bench', idx: 0 }, 'Ann One');       // pitch → bench
  assert.equal(s.state.benchPlayers[0], 'Ann One', 'now on the bench');
  assert.equal(s.state.formationNames['2'], '', 'pitch slot empty (no snapback)');
  s._mcSetTarget({ type: 'bench', idx: 0 }, '');              // remove from bench
  assert.equal(s.state.benchPlayers[0], '', 'bench empty after remove');
  assert.equal(s.state.formationNames['2'], '', 'pitch slot still empty');
});

// ── Match Centre can never be the only place a player exists ──────────────────
// The sheet stores NAMES; an orphan name (no roster record) used to be lost when
// dragged off. renderMatchday now reconciles sheet names into the canonical roster.
test('match-sheet names are reconciled into the canonical roster (no MC-only orphans)', () => {
  const fn = extractFn(html, 'mcReconcileSheetToRoster');
  assert.ok(fn.includes('state.formationNames'), 'reads pitch names');
  assert.ok(fn.includes('state.benchPlayers'), 'reads bench names');
  assert.ok(fn.includes("name.includes('@')"), 'skips email / non-player artifacts');
  assert.ok(fn.includes('upsertCanonicalPlayerRecord('), 'promotes an orphan sheet name into the canonical roster');
  assert.ok(fn.includes('if (!isCoach()) return'), 'coach-only');
  assert.ok(html.includes('mcReconcileSheetToRoster();'), 'renderMatchday invokes the safeguard before reading the squad pool');
});
