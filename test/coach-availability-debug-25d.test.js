/**
 * Phase 25D — temporary coach Availability diagnostic.
 * window.debugAvailabilityMatch() dumps the roster ↔ API match for the selected
 * session and explains why a row shows No Reply. A "Debug Availability Match"
 * button appears only with ?debugAvailability=1. Read-only; mutates nothing.
 *
 * Tests drive the REAL extracted debugAvailabilityMatch + matcher from index.html.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's'));
  if (!m) throw new Error(`Function ${name} not found`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start + m[0].length - 1;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(start, i + 1);
}

function buildScope(players, responses) {
  const sync = ['liveAvailabilityEntryKeys', 'liveAvailabilityPlayerKeys'].map(extractFn).join('\n');
  const dbg = 'async ' + extractFn('debugAvailabilityMatch');
  const body = `
    "use strict";
    const state = { players: ${JSON.stringify(players)}, schedule: [{ id: 'tue' }, { id: 'thu' }, { id: 'game' }], messageDetail: 'tue' };
    function canonicalVisiblePlayers() { return state.players; }
    const logs = [];
    const console = { log: (...a) => logs.push(a.map(String).join(' ')), warn: () => {}, table: () => {} };
    globalThis.fetch = async () => ({ json: async () => ({ responses: ${JSON.stringify(responses)} }) });
    ${sync}
    ${dbg}
    return { run: debugAvailabilityMatch, logs };
  `;
  return new Function('globalThis', body)(globalThis);
}

const NO_MATCH_ROW = { id: 'p-1781787451169', name: 'Newest Test Player', email: 'a@x.test', userId: '', game: 'no-reply' };
const MATCH_ROW = { id: 'user_1781605236629_8l19k5', userId: 'user_1781605236629_8l19k5', legacyPlayerId: 'inv-E3CdnDE5', name: 'Newest Test Player', email: 'a@x.test' };
const apiRow = { key: 'user_1781605236629_8l19k5', userId: 'user_1781605236629_8l19k5', playerId: 'user_1781605236629_8l19k5', legacyPlayerId: 'inv-E3CdnDE5', label: 'test player new', response: 'maybe' };

test('debugAvailabilityMatch reports NO MATCH with exact reason for an orphan row', async () => {
  const scope = buildScope([NO_MATCH_ROW], [apiRow]);
  const out = await scope.run();
  assert.equal(out.session, 'tue');
  assert.equal(out.matched.length, 0);
  assert.equal(out.unmatched.length, 1);
  assert.equal(out.unmatched[0].name, 'Newest Test Player');
  assert.ok(scope.logs.some(l => /NO MATCH/.test(l)), 'logs the NO MATCH reason');
});

test('debugAvailabilityMatch reports MATCH when the row shares an identifier', async () => {
  const scope = buildScope([MATCH_ROW], [apiRow]);
  const out = await scope.run();
  assert.equal(out.matched.length, 1);
  assert.equal(out.unmatched.length, 0);
  assert.match(out.matched[0].via, /user_1781605236629_8l19k5|inv-e3cdnde5/);
});

test('output rows carry every requested field', async () => {
  const scope = buildScope([NO_MATCH_ROW], [apiRow]);
  const out = await scope.run();
  for (const f of ['name', 'id', 'userId', 'playerId', 'legacyPlayerId', 'email', 'matchKeys', 'allObjectKeys']) {
    assert.ok(f in out.roster[0], 'roster row has ' + f);
  }
  for (const f of ['label', 'key', 'userId', 'playerId', 'legacyPlayerId', 'email', 'matchKeys']) {
    assert.ok(f in out.responses[0], 'api row has ' + f);
  }
});

test('exposed on window and gated debug button is wired to ?debugAvailability=1', () => {
  assert.match(src, /window\.debugAvailabilityMatch\s*=\s*debugAvailabilityMatch/, 'assigned to window');
  assert.match(src, /location\.search\.includes\('debugAvailability=1'\)[\s\S]{0,200}onclick="debugAvailabilityMatch\(\)"[\s\S]{0,80}Debug Availability Match/, 'gated button wired');
});
