/**
 * ROSTER FAILURE MUST NOT LOOK LIKE AN EMPTY SQUAD.
 *
 * A 401/403/500 on /api/identity RESOLVES with ok:false (it does not throw), so
 * loadAdminData used to set `_adminData.loaded = true` regardless — painting an
 * HTTP error as an empty club AND defeating the group-scoped fail-closed guard
 * (operationalPlayers keys on _adminData.loaded). The load state must instead be
 * truthful: loaded reflects a real identity success, `failed` records the
 * outcome, and the empty-state UIs distinguish "failed to load" from "genuinely
 * empty".
 *
 * loadAdminData is an async, DOM-mutating function, so this pins the contract at
 * the source: the exact honesty logic and the two empty-state branches that used
 * to render the same copy for failure and emptiness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start)), d = 0;
  for (let b = i; b < src.length; b++) { if (src[b] === '{') d++; else if (src[b] === '}') { d--; if (!d) { i = b; break; } } }
  return src.slice(start, i + 1);
}

test('_adminData carries a `failed` flag', () => {
  assert.match(src, /_adminData\s*=\s*\{[^}]*failed:\s*false/, 'initial _adminData declares failed:false');
});

test('loadAdminData no longer force-marks loaded=true regardless of the fetch outcome', () => {
  const f = fn('loadAdminData');
  assert.ok(!/_adminData\.loaded\s*=\s*true\s*;/.test(f),
    'the unconditional `_adminData.loaded = true` (the bug) is gone');
});

test('loadAdminData sets loaded from a real identity success, and records failed', () => {
  const f = fn('loadAdminData');
  // loaded stays true once truly loaded (stale data survives a transient error),
  // otherwise reflects THIS fetch's identityRes.ok.
  assert.match(f, /_adminData\.loaded\s*=\s*_adminData\.loaded\s*\|\|\s*identityRes\.ok/,
    'loaded reflects a genuine identity success (keeping a prior success)');
  assert.match(f, /_adminData\.failed\s*=\s*!identityRes\.ok/, 'failed records the identity outcome');
  // a network throw is a failure, not an empty roster
  assert.match(f, /catch\s*\([^)]*\)\s*\{[^}]*_adminData\.failed\s*=\s*true/,
    'a thrown fetch marks failed, never silently empty');
});

test('the Members squad empty-state distinguishes failed / loading / genuinely-empty', () => {
  // The "Invite your players" copy must sit behind a successful load; a failed
  // load shows an explicit error, not the invite empty state.
  const anchor = src.indexOf("Couldn't load your squad");
  assert.ok(anchor > 0, 'an explicit squad-load failure message exists (not "no players")');
  const region = src.slice(anchor - 450, anchor + 550);
  assert.match(region, /!_adminData\.loaded/, 'the empty/invite copy is gated on a real load');
  assert.match(region, /_adminData\.failed/, 'a failed load is rendered distinctly from loading');
  assert.match(region, /Loading your squad/, 'loading is a distinct third state, not "no players"');
  // and the genuine-empty invite state remains, as the branch when loaded succeeds
  assert.ok(src.includes('>Invite your players</h2>'), 'the genuine-empty invite state is preserved');
});

test('the Club Admin players card shows a failure state, not "no players", on error', () => {
  const anchor = src.indexOf("Couldn't load members");
  assert.ok(anchor > 0, 'an explicit members-load failure message exists');
  const region = src.slice(anchor - 120, anchor + 320);
  assert.match(region, /_adminData\.failed/, 'the card distinguishes a failed load');
  assert.match(region, /Loading members…/, 'loading is the OTHER branch of the same guard');
});

test('the fail-closed roster guard still keys on _adminData.loaded (unchanged)', () => {
  // The honesty fix RESTORES this guard for the HTTP-error case; it must remain.
  const op = fn('operationalPlayers');
  assert.match(op, /_adminData\.loaded/, 'operationalPlayers still fails closed on an unloaded admin set');
});
