/**
 * DM thread label resolution.
 *
 * A DM's visible row/header name must ALWAYS be the OTHER participant, resolved from
 * identity — never the conversation's stored `name` (the label the CREATOR gave,
 * which is their own counterpart). The bug: Simon Coach created the DM named
 * "Simon2Coach", and the client spread that stored name onto the row, so Simon2Coach
 * saw *themselves* as the thread title.
 *
 * Drives the REAL extracted client functions from index.html.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('(', start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === '(') pd++; else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  let depth = 0; i = src.indexOf('{', i);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}

function label({ conv, meId, meName, users = [], members = [] }) {
  const fallback = conv._fromRedis ? '' : (conv.name || '');
  const body = `"use strict";
    const state = { users: ${JSON.stringify(users)} };
    function canonicalVisiblePlayers(){ return ${JSON.stringify(members)}; }
    function chatResolvePlayerParticipantId(p){ return p.participantId || p.userId || p.id; }
    ${extractFn('chatDirectParticipantId')}
    ${extractFn('chatResolveDmPartnerName')}
    ${extractFn('chatDmDisplayName')}
    return chatDmDisplayName(${JSON.stringify(conv)}, ${JSON.stringify(meId)}, ${JSON.stringify(meName)}, ${JSON.stringify(members)}, ${JSON.stringify(fallback)});
  `;
  return new Function(body)();
}

const DODD = 'user_1782401624293_t1t436';   // Simon Dodd / Simon Coach
const SIMON2 = 'user_1783167331053_osj171';  // Simon2Coach
const users = [
  { id: DODD, name: 'Simon Dodd', role: 'coach' },
  { id: SIMON2, name: 'Simon2Coach', role: 'coach' },
];
// The DM as created by Simon Coach — its stored name is the WRONG label for Simon2Coach.
const dm = { id: `dm:${DODD}:${SIMON2}`, type: 'DIRECT', participants: [DODD, SIMON2], name: 'Simon2Coach' };

test('Simon2Coach sees the OTHER participant (Simon Dodd), not themselves', () => {
  assert.equal(label({ conv: dm, meId: SIMON2, meName: 'Simon2Coach', users }), 'Simon Dodd');
});

test('Simon Dodd sees the OTHER participant (Simon2Coach)', () => {
  assert.equal(label({ conv: dm, meId: DODD, meName: 'Simon Dodd', users }), 'Simon2Coach');
});

test('stored conversation.name never overrides the resolved partner', () => {
  // Even though conv.name === 'Simon2Coach', Simon2Coach must still see 'Simon Dodd'.
  assert.equal(label({ conv: { ...dm, name: 'Simon2Coach' }, meId: SIMON2, meName: 'Simon2Coach', users }), 'Simon Dodd');
});

test('coach-to-player DM resolves the player name from the roster', () => {
  const player = { id: 'p1', userId: 'user_P', legacyPlayerId: 'inv-P', name: 'Player One' };
  const pdm = { id: `dm:${DODD}:user_P`, type: 'DIRECT', participants: [DODD, 'user_P'], name: 'Player One' };
  assert.equal(label({ conv: pdm, meId: DODD, meName: 'Simon Dodd', users, members: [player] }), 'Player One');
  // And the player sees the coach, not themselves.
  assert.equal(label({ conv: pdm, meId: 'user_P', meName: 'Player One', users, members: [player] }), 'Simon Dodd');
});

test('an unknown partner never falls back to the current user\'s own name', () => {
  const conv = { id: 'dm:user_X:user_Y', type: 'DIRECT', participants: ['user_X', 'user_Y'], name: 'Someone' };
  // meId user_X is unknown; the stored name equals meName → must NOT show self.
  assert.equal(label({ conv, meId: 'user_X', meName: 'Someone', users: [] }), 'Direct message');
});

test('an unknown partner falls back to a non-self stored name', () => {
  const conv = { id: 'dm:user_X:user_Y', type: 'DIRECT', participants: ['user_X', 'user_Y'], name: 'Coach Bob' };
  assert.equal(label({ conv, meId: 'user_X', meName: 'Someone Else', users: [] }), 'Coach Bob');
});

test('a _fromRedis DM with an unknown partner uses a neutral label, not the stored name', () => {
  const conv = { id: 'dm:user_X:user_Y', type: 'DIRECT', participants: ['user_X', 'user_Y'], name: 'Simon2Coach', _fromRedis: true };
  assert.equal(label({ conv, meId: 'user_X', meName: 'X', users: [] }), 'Direct message');
});
