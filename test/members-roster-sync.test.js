/**
 * Members roster sync — added/invited players must not vanish.
 *
 * Bug: a coach-added player lives only in local state until a debounced (2s)
 * roster sync pushes it to the server. loadRosterFromServer() adopts the server
 * roster wholesale; if a roster fetch (from boot/login) resolves during that
 * window it overwrote state.players and the new player appeared for ~1s then
 * vanished — while the counts (same source) flickered with it.
 *
 * Fix: a `_rosterSyncPending` flag. While a local roster edit is awaiting its
 * push, loadRosterFromServer refuses to adopt the (stale) server copy and lets
 * the pending sync win. Boot adoption (no pending edit) is unaffected.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
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

test('a pending-roster-edit flag exists', () => {
  assert.ok(html.includes('let _rosterSyncPending = false;'), '_rosterSyncPending declared');
});

test('queueRosterSync marks a pending edit and clears it once the push starts', () => {
  const fn = extractFn(html, 'queueRosterSync');
  assert.ok(fn.includes('_rosterSyncPending = true;'), 'sets pending when scheduling a push');
  assert.ok(fn.includes('_rosterSyncPending = false;'), 'clears pending when the push begins');
  // pending is only set after the no-change early-return, so unchanged saves never set it
  assert.ok(fn.indexOf('if (fp === _rosterLastSyncedFp) return;') < fn.indexOf('_rosterSyncPending = true;'),
    'unchanged roster (fp === last synced) does NOT set pending');
});

test('loadRosterFromServer guards against clobbering an unsynced local edit', () => {
  const fn = extractFn(html, 'loadRosterFromServer');
  const guard = fn.indexOf('if (_rosterSyncPending)');
  const parsed = fn.indexOf('await res.json()');
  const adopt = fn.indexOf('state.players = serverPlayers');
  assert.ok(guard !== -1, 'has the pending-edit race guard');
  assert.ok(parsed !== -1 && guard > parsed, 'guard runs AFTER the network round-trip (catches edits made in-flight)');
  assert.ok(adopt !== -1 && guard < adopt, 'guard runs BEFORE adopting the server roster');
  assert.ok(/_rosterSyncPending\)\s*\{\s*queueRosterSync\(\);\s*return;/.test(fn), 'on pending: keep local + ensure the push, then bail');
});

test('Members list and counts read from ONE source of truth (deduped roster)', () => {
  // The visible list (filtered) and every count derive from `members`, which is
  // canonicalVisiblePlayers() — so they can never disagree within a render.
  assert.ok(html.includes('const allMembers = canonicalVisiblePlayers();'), 'roster from canonicalVisiblePlayers');
  assert.ok(html.includes('const filtered   = members.filter('), 'visible list derives from members');
  assert.ok(html.includes('available: members.filter(p => p.game === "available").length'), 'Available count from members');
  assert.ok(html.includes('consent: members.filter(p=>!p.mediaConsent).length'), 'Consent-pending count from members');
});

test('coach-added players carry pending/consent/unregistered status', () => {
  const fn = extractFn(html, 'addPlayer');
  assert.ok(fn.includes("registrationStatus: 'unregistered'"), 'added player is unregistered');
  assert.ok(fn.includes('mediaConsent: false'), 'added player is consent-pending');
  assert.ok(fn.includes('upsertCanonicalPlayerRecord(player)'), 'persisted via the canonical roster upsert (deduped)');
});
