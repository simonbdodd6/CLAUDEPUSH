/**
 * MATCH DAY — the In-goal labels must stay anchored to the in-goal zones.
 *
 * The pitch carries a layering rule, `.mcx2-pitch > * { position: relative }`,
 * which demotes EVERY direct child of the pitch. `.mc5-ingoal` declares
 * `position: absolute` at the same specificity (both 0,1,0) but earlier in the
 * file, so the layering rule won and the two labels dropped out of absolute
 * positioning into document flow: they rendered inline, side by side, in the
 * pitch's top-left corner — overlapping the artwork and each other instead of
 * sitting one in each in-goal zone — and their `top: 7%` / `bottom: 7%` became
 * flow offsets rather than anchors on the pitch.
 *
 * Measured before the fix, at 1440/1280/1024/768/390: both labels 73px wide
 * (the text width, not the pitch width), both at y 6–18, at x 0–73 and 77–150.
 * After it: each label spans the full pitch width, one at 7% from the top and
 * one at 7% from the bottom, at every one of those widths.
 *
 * The same V9 demotion hit the jersey markers and was repaired for `.slot-big`
 * alone (the "V13 — restore true position anchoring" comment). This file pins
 * that BOTH children of the pitch that rely on absolute positioning keep it,
 * so the next layering rule cannot quietly take one of them away again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** Index of the last rule that demotes every direct child of the pitch. */
const lastDemotionAt = (() => {
  let last = -1;
  for (const m of html.matchAll(/\.(?:mcx2-pitch|pitch-big|mc12-pitch)\s*>\s*\*\s*\{[^}]*position:\s*relative/g)) {
    last = Math.max(last, m.index);
  }
  for (const m of html.matchAll(/#matchday-pitch\s*>\s*\*\s*\{[^}]*position:\s*relative/g)) {
    last = Math.max(last, m.index);
  }
  return last;
})();

test('the pitch still demotes its direct children — this is the hazard being guarded', () => {
  assert.ok(lastDemotionAt > 0,
    'no `> *  { position: relative }` rule found. If it was removed, this guard can be simplified — ' +
    'but check first that nothing else now relies on the re-assertions below.');
});

test('the In-goal labels are re-asserted as absolutely positioned AFTER that demotion', () => {
  const re = /\.(?:mcx2-pitch|mc12-pitch)\s+\.mc5-ingoal[^{]*\{[^}]*position:\s*absolute\s*!important/g;
  const hits = [...html.matchAll(re)].map(m => m.index);
  assert.ok(hits.length > 0, '.mc5-ingoal must be re-asserted as position:absolute !important');
  assert.ok(hits.some(i => i > lastDemotionAt),
    'the re-assertion must come AFTER the last demotion rule, or the cascade undoes it');
});

test('the jersey markers keep their own re-assertion (the V13 repair is intact)', () => {
  const re = /\.(?:mcx2-pitch|#matchday-pitch)?[^{]*\.slot-big[^{]*\{[^}]*position:\s*absolute\s*!important/g;
  const hits = [...html.matchAll(re)].map(m => m.index);
  assert.ok(hits.some(i => i > lastDemotionAt),
    'slot-big must still be re-asserted after the demotion — this fix must not have displaced it');
});

test('both labels still exist, one per in-goal end', () => {
  assert.ok(html.includes('<span class="mc5-ingoal top">In-goal</span>'), 'top label rendered');
  assert.ok(html.includes('<span class="mc5-ingoal bot">In-goal</span>'), 'bottom label rendered');
  assert.equal(html.split('class="mc5-ingoal').length - 1, 2, 'exactly two labels');
});

test('the labels keep their in-goal anchors and full-width box', () => {
  // The anchors are what put each label in its own zone; the left/right pair is
  // what makes text-align:center centre it on the pitch rather than on its text.
  assert.match(html, /\.mc5-ingoal\s*\{[^}]*position:\s*absolute/, 'base rule still declares absolute');
  assert.match(html, /\.mc5-ingoal\s*\{[^}]*left:\s*0;\s*right:\s*0/, 'base rule still spans the pitch');
  assert.match(html, /\.mc5-ingoal\s*\{[^}]*text-align:\s*center/);
  assert.match(html, /\.mc12-pitch\s+\.mc5-ingoal\.top\s*\{\s*top:\s*7%/, 'top anchor');
  assert.match(html, /\.mc12-pitch\s+\.mc5-ingoal\.bot\s*\{\s*bottom:\s*7%/, 'bottom anchor');
});

test('the fix is viewport-independent: no width-specific rule was added for the labels', () => {
  // A media-query-scoped position rule would mean the label was pinned for one
  // screenshot rather than actually repaired.
  const mediaBlocks = [...html.matchAll(/@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g)].map(m => m[0]);
  const offenders = mediaBlocks.filter(b => /\.mc5-ingoal[^{]*\{[^}]*position\s*:/.test(b));
  assert.deepEqual(offenders.map(b => b.slice(0, 60)), [],
    'no @media block may set position on .mc5-ingoal — the anchor must hold at every width');
});
