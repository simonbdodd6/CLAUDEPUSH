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
  while (i < source.length && source[i] !== '{') i++;
  let depth = 0;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error('function ' + name + ' — no closing brace');
}

// Pull the fix helper plus its real dependency chain out of index.html.
const DEPS = ['identityNameKey', 'identityCompactKey', 'canonicalIdentityNameKey', 'isPermanentPlayerUserId',
  'canonicalPlayerIdForUser', 'ensureCanonicalPlayerRecord', 'hydrateSessionPlayerRecord'];
const hydrateSessionPlayerRecord = new Function(
  DEPS.map(n => extractFn(html, n)).join('\n') + '\nreturn hydrateSessionPlayerRecord;'
)();

test('fresh PLAYER client with empty roster gets a resolvable player record', () => {
  // Reproduces the standalone-PWA case: server session restored a player user,
  // but state.players is empty (roster API is coach-only). The helper must
  // synthesise the record so getPlayer() can resolve.
  const state = { players: [], selectedPlayerId: '' };
  const user = { role: 'player', id: 'user_alex', name: 'Alex Hooper', email: 'alex@example.com' };
  const created = hydrateSessionPlayerRecord(state, user);
  assert.equal(created, true, 'a new roster record was created for the fresh client');
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].id, 'user_alex', 'record id is the canonical player id');
  assert.equal(state.players[0].name, 'Alex Hooper');
  assert.equal(state.selectedPlayerId, 'user_alex', 'selectedPlayerId points at the player');
  assert.equal(user.playerId, 'user_alex');
});

test('existing roster record is not duplicated and reports no re-hydrate needed', () => {
  const state = { players: [{ id: 'user_alex', name: 'Alex Hooper' }], selectedPlayerId: 'user_alex' };
  const user = { role: 'player', id: 'user_alex', name: 'Alex Hooper' };
  const created = hydrateSessionPlayerRecord(state, user);
  assert.equal(created, false, 'Safari case: record already present, no re-hydrate');
  assert.equal(state.players.length, 1, 'no duplicate created');
});

test('an invite-id player (non-permanent user id) resolves via playerId', () => {
  const state = { players: [], selectedPlayerId: '' };
  const user = { role: 'player', id: 'sess-123', playerId: 'inv-abc', name: 'Bo Field' };
  const created = hydrateSessionPlayerRecord(state, user);
  assert.equal(created, true);
  assert.equal(state.players[0].id, 'inv-abc');
});

test('a coach session is a no-op (coaches load the roster via the coach API)', () => {
  const state = { players: [], selectedPlayerId: '' };
  const created = hydrateSessionPlayerRecord(state, { role: 'coach', id: 'user_coach', name: 'Coach' });
  assert.equal(created, false);
  assert.equal(state.players.length, 0, 'no player record synthesised for a coach');
});
