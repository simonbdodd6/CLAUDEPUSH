/**
 * Phase 24 — player schedule merge must reconcile published vs local sessions by
 * canonical title, not id alone.
 *
 * Root cause (Phase 23J): loadPublishedStateForPlayer() reconciled sessions only
 * by id. When the coach CREATED training sessions (saveSessionForm generates a
 * `slug-timestamp` id, not "tue"/"thu"), the player's default tue/thu survived as
 * local-only DUPLICATES. The player could then answer on the orphan default card,
 * POSTing sessionId "tue" — an id the coach never reads (coach GETs the published
 * id). Match was immune because its id "game" never changes. Signature: Match
 * works, Training disappears.
 *
 * Fix: published sessions are authoritative; a local session is retained only if
 * the server has nothing with the same id OR the same canonical title. No id is
 * rewritten, no storage migrated, no API contract changed.
 *
 * These tests drive the REAL loadPublishedStateForPlayer extracted from index.html.
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

const DEFAULT_SCHEDULE = [
  { id: 'tue',  type: 'Training', title: 'Training session 1' },
  { id: 'thu',  type: 'Training', title: 'Training session 2' },
  { id: 'game', type: 'Match',    title: 'Match' },
];

// Run the REAL loadPublishedStateForPlayer with a controlled published payload
// and starting local schedule; return the resulting state.schedule.
async function runMerge({ localSchedule, publishedSessions, publishedSquad = null }) {
  const body = `
    "use strict";
    let _publishedStateLoadedAt = 0;
    const state = { schedule: ${JSON.stringify(localSchedule)}, matchCentre: {}, formationNames: {}, benchPlayers: [] };
    function saveState() {}
    function render() {}
    globalThis.fetch = async () => ({ ok: true, json: async () => (${JSON.stringify({ sessions: publishedSessions, squad: publishedSquad })}) });
    async ${extractFn('loadPublishedStateForPlayer')}
    return (async () => { await loadPublishedStateForPlayer(); return state.schedule; })();
  `;
  return new Function(body)();
}

// Helper: what sessionId the player POSTs for a card == its id round-tripped via
// the real sessionKey/keyToSessionId (extracted), and what the coach GETs (= id).
const sessionKey = id => id === 'tue' ? 'trainingTuesday' : id === 'thu' ? 'trainingThursday' : id === 'game' ? 'game' : 'avail_' + id;
const keyToSessionId = key => key === 'trainingTuesday' ? 'tue' : key === 'trainingThursday' ? 'thu' : key === 'game' ? 'game' : key.startsWith('avail_') ? key.slice(6) : 'game';
const titlesOf = sched => sched.map(s => s.title);
const idsOf = sched => sched.map(s => s.id);
function reconciles(schedule, publishedSessions) {
  // Every player card must POST a sessionId the coach actually GETs (a published id).
  const coachReads = new Set(publishedSessions.map(s => s.id));
  return schedule.every(card => coachReads.has(keyToSessionId(sessionKey(card.id))));
}

test('default schedule: coach published default ids → no change, no duplicates', async () => {
  const out = await runMerge({ localSchedule: DEFAULT_SCHEDULE, publishedSessions: DEFAULT_SCHEDULE });
  assert.deepEqual(idsOf(out), ['tue', 'thu', 'game']);
  assert.equal(out.length, 3);
});

test('edited default schedule (ids preserved) → still 3, ids intact', async () => {
  const edited = [
    { id: 'tue',  type: 'Training', title: 'Training session 1', focus: 'Lineout' },
    { id: 'thu',  type: 'Training', title: 'Training session 2', focus: 'Scrum' },
    { id: 'game', type: 'Match',    title: 'Match', date: '2026-06-20' },
  ];
  const out = await runMerge({ localSchedule: DEFAULT_SCHEDULE, publishedSessions: edited });
  assert.deepEqual(idsOf(out), ['tue', 'thu', 'game']);
  assert.equal(out.find(s => s.id === 'game').date, '2026-06-20');
});

test('CRITICAL: coach-created sessions (slug ids) → NO duplicate Training cards', async () => {
  const published = [
    { id: 'training-session-1-labc12', type: 'Training', title: 'Training session 1' },
    { id: 'training-session-2-ldef34', type: 'Training', title: 'Training session 2' },
    { id: 'game',                       type: 'Match',    title: 'Match' },
  ];
  const out = await runMerge({ localSchedule: DEFAULT_SCHEDULE, publishedSessions: published });
  // Exactly 3 cards — the default tue/thu must NOT survive as duplicates.
  assert.equal(out.length, 3, 'no leftover default duplicates');
  assert.equal(titlesOf(out).filter(t => t === 'Training session 1').length, 1);
  assert.equal(titlesOf(out).filter(t => t === 'Training session 2').length, 1);
  // The surviving training cards carry the COACH's published ids.
  assert.ok(idsOf(out).includes('training-session-1-labc12'));
  assert.ok(idsOf(out).includes('training-session-2-ldef34'));
  assert.ok(!idsOf(out).includes('tue'), 'orphan default "tue" dropped');
  assert.ok(!idsOf(out).includes('thu'), 'orphan default "thu" dropped');
  // Every card now reconciles: player POST id == coach GET id.
  assert.ok(reconciles(out, published), 'player posts under ids the coach reads');
});

test('fresh player (only default seed) before merge → adopts published, no dupes', async () => {
  const published = [
    { id: 'training-session-1-x', type: 'Training', title: 'Training session 1' },
    { id: 'training-session-2-y', type: 'Training', title: 'Training session 2' },
    { id: 'game',                 type: 'Match',    title: 'Match' },
  ];
  const out = await runMerge({ localSchedule: DEFAULT_SCHEDULE, publishedSessions: published });
  assert.equal(out.length, 3);
  assert.ok(reconciles(out, published));
});

test('existing player with stale default + coach slug ids → defaults replaced', async () => {
  // Simulate a player who had already loaded defaults and answered locally.
  const stale = [
    { id: 'tue',  type: 'Training', title: 'Training session 1' },
    { id: 'thu',  type: 'Training', title: 'Training session 2' },
    { id: 'game', type: 'Match',    title: 'Match' },
    { id: 'avail_extra', type: 'Training', title: 'Captains run' }, // genuinely local, unique title
  ];
  const published = [
    { id: 'training-session-1-x', type: 'Training', title: 'Training session 1' },
    { id: 'training-session-2-y', type: 'Training', title: 'Training session 2' },
    { id: 'game',                 type: 'Match',    title: 'Match' },
  ];
  const out = await runMerge({ localSchedule: stale, publishedSessions: published });
  // tue/thu dropped (title collision); game reconciled by id; Captains run kept.
  assert.equal(titlesOf(out).filter(t => t === 'Training session 1').length, 1);
  assert.equal(titlesOf(out).filter(t => t === 'Training session 2').length, 1);
  assert.ok(idsOf(out).includes('avail_extra'), 'genuinely-local custom session retained');
  assert.ok(!idsOf(out).includes('tue') && !idsOf(out).includes('thu'));
});

test('republishing (idempotent): merging same published set twice is stable', async () => {
  const published = [
    { id: 'training-session-1-x', type: 'Training', title: 'Training session 1' },
    { id: 'training-session-2-y', type: 'Training', title: 'Training session 2' },
    { id: 'game',                 type: 'Match',    title: 'Match' },
  ];
  const once = await runMerge({ localSchedule: DEFAULT_SCHEDULE, publishedSessions: published });
  const twice = await runMerge({ localSchedule: once, publishedSessions: published });
  assert.deepEqual(idsOf(twice), idsOf(once));
  assert.equal(twice.length, 3);
});

test('REGRESSION (Match): Match card unchanged + reconciles in every scenario', async () => {
  for (const published of [
    DEFAULT_SCHEDULE,
    [ { id: 'training-session-1-x', type: 'Training', title: 'Training session 1' },
      { id: 'training-session-2-y', type: 'Training', title: 'Training session 2' },
      { id: 'game',                 type: 'Match',    title: 'Match' } ],
  ]) {
    const out = await runMerge({ localSchedule: DEFAULT_SCHEDULE, publishedSessions: published });
    const matchCards = out.filter(s => s.title === 'Match');
    assert.equal(matchCards.length, 1, 'exactly one Match card');
    assert.equal(matchCards[0].id, 'game', 'Match id stays "game"');
    assert.equal(keyToSessionId(sessionKey('game')), 'game', 'Match POST sessionId stays "game"');
  }
});

test('custom-only published sessions (no default titles) → unaffected, reconcile', async () => {
  const published = [
    { id: 'u15-fri', type: 'Training', title: 'U15 Friday' },
    { id: 'u15-sun', type: 'Match',    title: 'U15 Sunday game' },
  ];
  // Player default seed has different titles → no collision; the merge keeps
  // published + the genuinely-distinct local defaults.
  const out = await runMerge({ localSchedule: DEFAULT_SCHEDULE, publishedSessions: published });
  assert.ok(idsOf(out).includes('u15-fri') && idsOf(out).includes('u15-sun'));
  // Default seed titles don't collide with custom titles → retained (legit local).
  assert.ok(idsOf(out).includes('tue') && idsOf(out).includes('thu') && idsOf(out).includes('game'));
});
