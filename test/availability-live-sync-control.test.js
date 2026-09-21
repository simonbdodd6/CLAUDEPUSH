/**
 * AVAILABILITY — the Live Sync control.
 *
 * "Live sync" / "Synced HH:MM" sits in the Sessions card head and is the
 * board's live-data status. It was a <span>: inert text that LOOKS like a
 * control. A tap did nothing, and a press handed the gesture to the phone,
 * which offered its own text-selection menu ("Search Web" / "Look Up") — so
 * the control appeared to leave CoachEasier for a search engine. Nothing in
 * the app ever navigated: there was no href, no handler and no action at all.
 *
 * The intended action already existed — refreshLiveAvailability(), which
 * writes its result into THIS chip (id avail-refresh-ts) and still looks for
 * a button (avail-refresh-btn) that was removed with the legacy Message
 * Centre body. The chip is now that button.
 *
 * The availability read, its group scoping and the data model are untouched:
 * availRefreshNow() only calls the existing refresh, and holds one refresh at
 * a time so a second tap joins the first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const s = html.indexOf(`function ${name}(`);
  assert.ok(s > 0, `${name} exists`);
  let i = html.indexOf('(', s), p = 0;
  for (; i < html.length; i++) { if (html[i] === '(') p++; else if (html[i] === ')') { p--; if (!p) { i++; break; } } }
  let b = html.indexOf('{', i), d = 0, e = b;
  for (let k = b; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (!d) { e = k; break; } } }
  return html.slice(s, e + 1);
}
/** The control's markup, as renderMessageCenterV2 emits it. */
const CONTROL = (() => {
  const i = html.indexOf('id="avail-refresh-ts"');
  assert.ok(i > 0, 'the control is rendered');
  const from = html.lastIndexOf('<', i);
  return html.slice(from, html.indexOf('>', html.indexOf('</button>', i)) + 1);
})();

// ── 1. it is a control, not text ────────────────────────────────────────────

test('1. Live Sync renders as a real button with an in-app action', () => {
  assert.match(CONTROL, /^<button type="button"/, 'a button element');
  assert.match(CONTROL, /id="avail-refresh-ts"/, 'still the status chip the refresh writes to');
  assert.match(CONTROL, /class="msg-chip msg-chip-btn /, 'and still looks like the chip');
  assert.match(CONTROL, /onclick="availRefreshNow\(\)"/, 'with an explicit application handler');
  assert.match(CONTROL, /aria-label="Refresh live availability now"/);
  assert.match(CONTROL, /Live sync/, 'the label is unchanged');
  assert.match(CONTROL, /Synced/, 'as is the synced state');
});

test('3. nothing about it can navigate anywhere', () => {
  assert.doesNotMatch(CONTROL, /<a\b|href=|target=|window\.location|window\.open/, 'no link, no navigation');
  const handler = fn('availRefreshNow');
  assert.doesNotMatch(handler, /href|window\.location|window\.open|assign\(|replace\(/, 'the handler navigates nowhere');
  // The whole Availability board offers no external link in this area.
  const head = html.slice(html.indexOf('<h2>Sessions</h2>'), html.indexOf('id="avail-refresh-ts"'));
  assert.doesNotMatch(head, /href=/);
});

test('the span it replaced is gone', () => {
  assert.doesNotMatch(html, /<span id="avail-refresh-ts"/, 'no inert text version remains');
  assert.equal(html.split('id="avail-refresh-ts"').length - 1, 1, 'exactly one control');
});

// ── 2. the action ───────────────────────────────────────────────────────────

/** Run the real handler with the refresh stubbed. */
function runHandler({ slow = false } = {}) {
  const calls = [];
  const el = { textContent: 'Live sync', className: 'msg-chip no-reply' };
  const api = new Function('calls', 'el', 'slow', `
    const document = { getElementById: id => id === 'avail-refresh-ts' ? el : null };
    let resolveIt;
    function refreshLiveAvailability(opts) {
      calls.push(opts === undefined ? 'no-opts' : JSON.stringify(opts));
      return slow ? new Promise(r => { resolveIt = r; }) : Promise.resolve();
    }
    ${fn('availRefreshNow').replace('function availRefreshNow', 'let _availRefreshInFlight = null; function availRefreshNow')}
    return { tap: () => availRefreshNow(), finish: () => resolveIt && resolveIt(), el,
             inFlight: () => _availRefreshInFlight !== null };`)(calls, el, slow);
  return { ...api, calls };
}

test('2+4+5. a click runs the availability refresh (the same action on any width)', async () => {
  const h = runHandler();
  await h.tap();
  await Promise.resolve();
  assert.deepEqual(h.calls, ['no-opts'], 'the existing refresh, with its own defaults');
  // The markup carries no width-dependent behaviour: one handler, one path.
  assert.equal(CONTROL.includes('ontouchstart'), false, 'no separate touch path');
  assert.doesNotMatch(fn('availRefreshNow'), /innerWidth|matchMedia|isMobile|userAgent/, 'no device branch');
});

test('6. a second tap while one refresh is in flight does not start another', async () => {
  const h = runHandler({ slow: true });
  const first = h.tap();
  h.tap(); h.tap();
  // the refresh is started on the next microtask (so a synchronous throw inside
  // it can never strand the latch) — let that turn run before counting
  await Promise.resolve();
  assert.deepEqual(h.calls, ['no-opts'], 'one refresh only');
  assert.equal(h.inFlight(), true);
  h.finish(); await first;
  assert.equal(h.inFlight(), false, 'and the latch clears afterwards');
  h.tap(); await Promise.resolve();
  assert.equal(h.calls.length, 2, 'a later tap refreshes again');
});

test('the control says what it is doing, and the refresh owns the result', () => {
  const h = runHandler({ slow: true });
  h.tap();
  assert.equal(h.el.textContent, 'Syncing…', 'immediate feedback');
  assert.match(h.el.className, /msg-chip msg-chip-btn/, 'still the chip');
  // Success/failure text stays where it always was — inside refreshLiveAvailability.
  const refresh = fn('refreshLiveAvailability');
  assert.match(refresh, /ts\.textContent = `Synced \$\{/);
  assert.match(refresh, /ts\.textContent = 'Sync failed/);
});

// ── 3. nothing else moved ───────────────────────────────────────────────────

test('7+8. the availability read, its group scope and the data model are untouched', () => {
  const handler = fn('availRefreshNow');
  assert.doesNotMatch(handler, /fetch\(|_resolvedAvailability|state\.|saveState|api\//,
    'the handler reads nothing, writes nothing and calls no endpoint itself');
  const refresh = fn('refreshLiveAvailability');
  // The one read, still group-scoped and still fail-closed, exactly as before.
  assert.match(refresh, /if \(!state\.operationalGroupId && operationalGroups\(\)\.length > 1\) return;/);
  assert.match(refresh, /'\/api\/availability\?resolveRoster=1' \+ _availGroupQ/);
  assert.match(refresh, /_availGroupQ = state\.operationalGroupId/);
  assert.match(refresh, /A FAILED READ IS A FAILED READ/, 'failure still stamps nothing');
});

test('the chip keeps its appearance, and becomes a finger-sized target on touch', () => {
  assert.match(html, /button\.msg-chip \{ font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; background: transparent; \}/);
  assert.match(html, /button\.msg-chip:focus-visible \{ outline: 2px solid var\(--accent\); outline-offset: 2px; \}/);
  assert.match(html, /@media \(pointer: coarse\) \{[\s\S]{0,200}button\.msg-chip \{ min-height: 34px;/);
  // The status chips elsewhere are untouched: they are still 22px spans.
  assert.match(html, /\.msg-chip \{\s*display: inline-flex;[\s\S]*?min-height: 22px;/);
});

test('no other availability control was changed', () => {
  // The week navigation, the chase action and the session cards are as they were.
  assert.match(html, /onclick="coachAvailShiftWeek\(-1\)"/);
  assert.match(html, /onclick="coachAvailShiftWeek\(1\)"/);
  assert.match(html, /onclick="chaseAllNonResponders\(\)"/);
  assert.match(html, /const sessionDisplayTitle = session => availabilitySessionLabel\(session\);/,
    'the session/date labels are untouched');
});
