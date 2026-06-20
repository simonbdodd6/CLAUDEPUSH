/**
 * Coach Availability board — latest server-resolved response wins at RENDER time.
 *
 * The backend (resolveRoster) was proven correct; the stale board was a client
 * render bug — refreshLiveAvailability patched one representation (raw state.players
 * / a session-id alias) while sessionRows rendered another (canonicalVisiblePlayers).
 * Fix: sessionRows overlays the server-resolved map (resolvedAnswerFor) with session
 * id normalization. These tests drive the REAL extracted client functions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const m = src.match(new RegExp(`function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  // Skip the parameter list (handles nested parens and {} default params).
  let i = src.indexOf('(', start), pd = 0;
  for (; i < src.length; i++) { if (src[i] === '(') pd++; else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } } }
  // Match the body braces.
  let depth = 0; i = src.indexOf('{', i);
  for (let b = i; b < src.length; b++) { if (src[b] === '{') depth++; else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } } }
  return src.slice(start, i + 1);
}

// Build sessionRows with the REAL helpers + an injected resolved map + roster.
function makeSessionRows(resolved, players) {
  const body = `"use strict";
    let _resolvedAvailability = ${JSON.stringify(resolved)};
    function canonicalVisiblePlayers(){ return ${JSON.stringify(players)}; }
    ${extractFn('sessionKey')}
    ${extractFn('sessionReasonKey')}
    ${extractFn('normalizeSessionId')}
    ${extractFn('liveAvailabilityPlayerKeys')}
    ${extractFn('resolvedAnswerFor')}
    ${extractFn('sessionRows')}
    return sessionRows;
  `;
  return new Function(body)();
}
const statusOf = (rows, name) => rows.find(r => r.player.name === name)?.status;

const UID = 'user_123';
const LEG = 'inv-AbC';
const PID = 'pid_999';

test('player changes Tuesday repeatedly → board shows the LATEST resolved value', () => {
  for (const latest of ['available', 'maybe', 'available', 'unavailable']) {
    // raw/canonical row holds a STALE local value; resolved holds the latest.
    const sr = makeSessionRows(
      { [UID.toLowerCase()]: { tue: { response: latest, respondedAt: '2026-06-20T10:00:00Z' } } },
      [{ name: 'P', userId: UID, trainingTuesday: 'available' }]
    );
    assert.equal(statusOf(sr('tue'), 'P'), latest, `board reflects latest=${latest}`);
  }
});

test('custom / local session id (trainingTuesday) still reads the canonical tue answer', () => {
  const sr = makeSessionRows(
    { [UID.toLowerCase()]: { tue: { response: 'maybe', respondedAt: '2026-06-20T10:00:00Z' } } },
    [{ name: 'P', userId: UID, trainingTuesday: 'available' }]
  );
  // coach schedule used the local field name as the id:
  assert.equal(statusOf(sr('trainingTuesday'), 'P'), 'maybe', 'alias id resolves to tue');
  // and the reverse: player answered under trainingTuesday, coach renders tue:
  const sr2 = makeSessionRows(
    { [UID.toLowerCase()]: { trainingTuesday: { response: 'unavailable', respondedAt: '2026-06-20T10:00:00Z' } } },
    [{ name: 'P', userId: UID }]
  );
  assert.equal(statusOf(sr2('tue'), 'P'), 'unavailable');
  // match ↔ game alias:
  const sr3 = makeSessionRows(
    { [UID.toLowerCase()]: { match: { response: 'available', respondedAt: '2026-06-20T10:00:00Z' } } },
    [{ name: 'P', userId: UID }]
  );
  assert.equal(statusOf(sr3('game'), 'P'), 'available');
});

test('canonical duplicate / stale row cannot show a stale value', () => {
  const sr = makeSessionRows(
    { [UID.toLowerCase()]: { tue: { response: 'unavailable', respondedAt: '2026-06-20T12:00:00Z' } } },
    // canonical row carries a STALE merged value:
    [{ name: 'P', userId: UID, trainingTuesday: 'available', game: 'available' }]
  );
  assert.equal(statusOf(sr('tue'), 'P'), 'unavailable', 'resolved overrides stale canonical field');
});

test('raw patched but canonical row used for render → still latest', () => {
  // Simulate divergence: the rendered (canonical) row was NOT patched (holds old
  // value), but the resolved map (from the server) has the latest.
  const sr = makeSessionRows(
    { [UID.toLowerCase()]: { tue: { response: 'maybe', respondedAt: '2026-06-20T12:00:00Z' } } },
    [{ name: 'P', userId: UID, trainingTuesday: 'available' /* stale, un-patched canonical */ }]
  );
  assert.equal(statusOf(sr('tue'), 'P'), 'maybe');
});

test('latest wins matched by legacyPlayerId and by playerId, not only userId', () => {
  const byLegacy = makeSessionRows(
    { [LEG.toLowerCase()]: { tue: { response: 'unavailable', respondedAt: '2026-06-20T12:00:00Z' } } },
    [{ name: 'P', legacyPlayerId: LEG, trainingTuesday: 'available' }]
  );
  assert.equal(statusOf(byLegacy('tue'), 'P'), 'unavailable', 'matched via legacyPlayerId');
  const byPid = makeSessionRows(
    { [PID.toLowerCase()]: { tue: { response: 'maybe', respondedAt: '2026-06-20T12:00:00Z' } } },
    [{ name: 'P', playerId: PID }]
  );
  assert.equal(statusOf(byPid('tue'), 'P'), 'maybe', 'matched via playerId');
});

test('newest respondedAt wins across aliased session ids (tue vs trainingTuesday)', () => {
  const sr = makeSessionRows(
    { [UID.toLowerCase()]: {
        tue:             { response: 'available',   respondedAt: '2026-06-20T09:00:00Z' },
        trainingTuesday: { response: 'unavailable', respondedAt: '2026-06-20T18:00:00Z' },
    } },
    [{ name: 'P', userId: UID }]
  );
  assert.equal(statusOf(sr('tue'), 'P'), 'unavailable', 'newest aliased answer wins');
});

test('refresh (resolved map repopulated) reflects the new latest — survives logout/login', () => {
  // After a fresh login + refresh, the resolved map is rebuilt; sessionRows reads it.
  let sr = makeSessionRows({ [UID.toLowerCase()]: { tue: { response: 'maybe', respondedAt: '2026-06-20T10:00:00Z' } } }, [{ name: 'P', userId: UID, trainingTuesday: 'stale' }]);
  assert.equal(statusOf(sr('tue'), 'P'), 'maybe');
  sr = makeSessionRows({ [UID.toLowerCase()]: { tue: { response: 'available', respondedAt: '2026-06-20T20:00:00Z' } } }, [{ name: 'P', userId: UID, trainingTuesday: 'stale' }]);
  assert.equal(statusOf(sr('tue'), 'P'), 'available', 're-fetched resolved wins');
});

test('no regression: with empty resolved map, sessionRows falls back to the local field', () => {
  const sr = makeSessionRows({}, [{ name: 'P', userId: UID, trainingTuesday: 'available', game: 'maybe' }]);
  assert.equal(statusOf(sr('tue'), 'P'), 'available', 'falls back to local trainingTuesday');
  assert.equal(statusOf(sr('game'), 'P'), 'maybe', 'falls back to local game');
});
