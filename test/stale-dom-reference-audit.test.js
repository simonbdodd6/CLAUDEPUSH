/**
 * STALE DOM REFERENCES — the audit of the seven element ids the deleted V1
 * Message Centre body was the only renderer of.
 *
 * The Live Sync chip was the one that mattered: refreshLiveAvailability looked
 * up `avail-refresh-btn`, a button that no longer existed, so its "Refreshing…"
 * feedback could never fire. That was already fixed by making the chip itself
 * the button (avail-refresh-ts), which left the old lookup provably dead. It
 * has now been removed.
 *
 * The audit's conclusion on the other six is that NONE of them is a broken
 * control, and none should be deleted:
 *
 *   messageBody, avail-debug-btn          — already had no lookup left
 *   messageAudience, audience-picker-slot — read by renderAudiencePicker
 *   live-templates-panel, live-log-panel  — read by loadLiveTemplates/loadLiveLog
 *
 * Those three readers are PARKED for the full build, pinned as such by
 * test/pre-v2-messaging-removed.js. A null lookup is not on its own a reason to
 * delete a feature, and this file exists to stop a later cleanup doing exactly
 * that — it asserts the parked readers SURVIVE, and that they stay cheap.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * Read index.html raw. Stripping comments first looks tempting, but a naive
 * `/*…*\/` sweep over a 2.6MB single-file app matches across unrelated spans
 * and silently deleted a QUARTER of the file when this suite was written —
 * which made a dozen perfectly good ids look stale. The checks below are
 * written so prose cannot satisfy them: they match call syntax
 * (getElementById('x')) and attribute syntax (id="x"), never a bare name.
 */
const code = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fn(name) {
  const s = code.search(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  assert.ok(s > 0, `${name} exists`);
  let i = code.indexOf('(', s), p = 0;
  for (; i < code.length; i++) { if (code[i] === '(') p++; else if (code[i] === ')') { p--; if (!p) { i++; break; } } }
  let b = code.indexOf('{', i), d = 0, e = b;
  for (let k = b; k < code.length; k++) { if (code[k] === '{') d++; else if (code[k] === '}') { d--; if (!d) { e = k; break; } } }
  return code.slice(s, e + 1);
}
const looksUp = id =>
  code.includes(`getElementById('${id}')`) ||
  code.includes(`getElementById("${id}")`) ||
  new RegExp(`querySelector(?:All)?\\(\\s*['"]#${id}['"]`).test(code);
const renders = id => new RegExp(`id\\s*=\\s*\\\\?["']${id}\\\\?["']`).test(code);

// ── 1. the one that was genuinely dead ──────────────────────────────────────

test('avail-refresh-btn is gone: no markup, no lookup', () => {
  assert.equal(renders('avail-refresh-btn'), false);
  assert.equal(looksUp('avail-refresh-btn'), false);
});

test('refreshLiveAvailability keeps the chip and carries no dead button', () => {
  const src = fn('refreshLiveAvailability');
  assert.match(src, /getElementById\('avail-refresh-ts'\)/, 'the real control is still read');
  // Matched as code, not prose: the note inside names the dead id on purpose.
  assert.equal(/const btn\b/.test(src), false, 'the dead button binding is gone');
  assert.equal(/\bbtn\s*[.&]/.test(src), false, 'nothing still drives that button');
  assert.equal(/getElementById\(['"]avail-refresh-btn['"]\)/.test(src), false, 'and it is not looked up');
  // The chip's own states are untouched by this cleanup.
  assert.match(src, /ts\.textContent = `Synced \$\{/);
  assert.match(src, /ts\.textContent = 'Sync failed/);
  // The availability read is unchanged: still group-scoped, still fail-closed.
  // Removing dead UI code must never touch tenant scoping.
  assert.match(src, /if \(!state\.operationalGroupId && operationalGroups\(\)\.length > 1\) return;/);
  assert.match(src, /'\/api\/availability\?resolveRoster=1' \+ _availGroupQ/);
});

test('the Live Sync control itself still works (unchanged by this cleanup)', () => {
  assert.match(code, /<button type="button" id="avail-refresh-ts"/);
  assert.match(code, /onclick="availRefreshNow\(\)"/);
  assert.match(fn('availRefreshNow'), /refreshLiveAvailability\(\)/);
});

test('the two already-clean ids stay clean', () => {
  for (const id of ['messageBody', 'avail-debug-btn']) {
    assert.equal(renders(id), false, `${id} must not be rendered`);
    assert.equal(looksUp(id), false, `${id} must not be looked up`);
  }
});

// ── 2. the four that are parked — these must SURVIVE ────────────────────────

test('the parked readers are not deleted by a later cleanup', () => {
  for (const name of ['renderAudiencePicker', 'loadLiveTemplates', 'loadLiveLog']) {
    assert.ok(new RegExp(`(async\\s+)?function ${name}\\s*\\(`).test(code),
      `${name} is parked for the full build — a null lookup is not a licence to delete it`);
  }
  for (const id of ['messageAudience', 'audience-picker-slot',
                    'live-templates-panel', 'live-log-panel']) {
    assert.equal(looksUp(id), true, `${id} is still read by its parked owner`);
    assert.equal(renders(id), false, `${id} is still hidden from the Beta UI`);
  }
});

test('a dormant cycle costs no request: each parked loader returns before fetching', () => {
  for (const name of ['loadLiveTemplates', 'loadLiveLog']) {
    const src = fn(name);
    const guard = src.search(/if \(!panel\) return;/);
    const call  = src.search(/fetch\(/);
    assert.ok(guard > -1, `${name} stays null-safe`);
    assert.ok(call > -1 && guard < call, `${name} must return before fetching`);
  }
  // The picker paints from local state and issues no request at all.
  const picker = fn('renderAudiencePicker');
  assert.match(picker, /if \(!slot\) return;/, 'renderAudiencePicker stays null-safe');
  assert.equal(/fetch\(/.test(picker), false, 'and never reaches the network');
});

// ── 3. the guard that stops this class of defect returning ──────────────────

/**
 * Every id index.html looks up must be one it can actually produce — statically,
 * or dynamically through a template/helper. Anything else is a lookup that can
 * only ever return null.
 *
 * KNOWN_DORMANT is the audited allow-list. It is not an excuse list: each entry
 * is a lookup proven to be deliberate legacy. A NEW id appearing here should be
 * challenged, not waved through. Shrinking this list is always welcome.
 */
const KNOWN_DORMANT = new Set([
  // parked for the full build
  'messageAudience', 'audience-picker-slot', 'live-templates-panel', 'live-log-panel',
  'live-responses-panel', 'push-status-card',
  'active-schedules-panel',                   // loadActiveSchedules has no caller
  'blockDate', 'blockReason',                 // addBlockedDate has no caller
  'loginIdentity', 'loginPin',                // demo PIN login; real login is identityLogin*
  'btn-manage-billing',                       // removed with the Upgrade-to-Pro CTAs (e32f539c)
  'resetBtn',                                 // defensive: hide-if-present guard
  'tactics-canvas',                           // Tactics Board is a separate product
]);

test('no NEW stale DOM reference: every looked-up id can be produced', () => {
  const lookups = new Set();
  for (const m of code.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) lookups.add(m[1]);
  assert.ok(lookups.size > 100, 'sanity: the scan actually found the lookups');

  // id="wa-day-${key}" produces wa-day-reminder; clubInput('new-team-name') produces it too.
  const interpolated = id => {
    for (const m of code.matchAll(/id\s*=\s*\\?["']([A-Za-z0-9_-]*)\$\{/g)) {
      if (m[1] && id.startsWith(m[1])) return true;
    }
    return new RegExp(`\\(\\s*['"]${id}['"]\\s*,`).test(code);   // helper(id, …)
  };
  const producible = id => renders(id) ||
    new RegExp(`\\.id\\s*=\\s*['"]${id}['"]`).test(code) ||
    new RegExp(`setAttribute\\(\\s*['"]id['"]\\s*,\\s*['"]${id}['"]`).test(code) ||
    interpolated(id);

  const stale = [...lookups].filter(id => !producible(id) && !KNOWN_DORMANT.has(id));
  assert.deepEqual(stale, [],
    `these ids are looked up but nothing can render them:\n  ${stale.join('\n  ')}\n` +
    'Either the control was lost (restore it) or the reference is dead (remove it). ' +
    'Do not simply add it to KNOWN_DORMANT.');
});

test('the allow-list stays honest: every entry is still actually looked up', () => {
  for (const id of KNOWN_DORMANT) {
    assert.equal(looksUp(id), true,
      `${id} is no longer looked up anywhere — drop it from KNOWN_DORMANT`);
  }
});
