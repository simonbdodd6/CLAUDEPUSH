/**
 * MEDICAL CLEANUP — dead legacy surface removed, one authoritative flow.
 *
 *  · renderMedical's pre-Phase-21 single-page body was provably unreachable
 *    (the tab value domain is closed to dashboard/record/timeline) — removed,
 *    with its orphaned handlers (saveMedicalNote, setRehabProgress,
 *    addTreatmentLog, saveCoachNotes) whose inputs existed only there.
 *  · the "Legacy rehab (existing)" card duplicated the authoritative record
 *    editor AND wrote local-only medicalNotes that every server hydrate
 *    silently overwrote — removed.
 *  · active cases, group isolation and the shared-store write path are
 *    proven against the REAL medical handler.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.med-cleanup.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { default: publishHandler } = await import('../api/publish.js');
const store = await import('../api/_identityStore.js');

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = src.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

const CLUB = 'boitsfort', SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';

// ── 1-3: active-case predicate (the real client filter) ───────────────────
function casesFor(players, records, notes) {
  return new Function(`"use strict";
    function playerIsArchived(p) { return Boolean(p && p.archived); }
    ${fn('normalizeMedicalRecord')}
    ${fn('activeRosterPlayers')}
    ${fn('hasActiveMedicalCase')}
    ${fn('activeMedicalCases')}
    return activeMedicalCases(${JSON.stringify(players)}, ${JSON.stringify(records)}, ${JSON.stringify(notes)});
  `)();
}
const HEALTHY  = { id: 'p1', name: 'Healthy', game: 'available' };
const INJURED  = { id: 'p2', name: 'Hurt', game: 'injured' };
const RECORDED = { id: 'p3', name: 'Recorded', game: 'available' };

test('a healthy player with no active case never appears in Medical active cases', () => {
  assert.deepEqual(casesFor([HEALTHY], {}, {}).map(p => p.id), []);
});
test('players with an active case DO appear (roster flag or recorded injury)', () => {
  const out = casesFor([HEALTHY, INJURED, RECORDED], { p3: { currentInjury: 'Hamstring' } }, {});
  assert.deepEqual(out.map(p => p.id).sort(), ['p2', 'p3']);
});
test('a cleared/resolved case leaves the active list', () => {
  const out = casesFor([RECORDED], { p3: { currentInjury: 'Hamstring', clearanceStatus: 'cleared' } }, {});
  assert.deepEqual(out.map(p => p.id), []);
});

// ── 4-6 + 7 + 10: the real server handler — group isolation + persistence ──
function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:users', JSON.stringify([{ id: 'u-simon', email: 's@c.test', displayName: 'Simon' }]));
  kv.set('app:identity:team_members', JSON.stringify([
    { id: 'm-simon', teamId: CLUB, userId: 'u-simon', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true, accessProfile: 'full' },
    { id: 'm-sen', teamId: CLUB, userId: 'u-sen', role: 'player', status: 'active', playerGroupId: SEN },
    { id: 'm-u18', teamId: CLUB, userId: 'u-u18', role: 'player', status: 'active', playerGroupId: U18 },
    { id: 'm-wom', teamId: CLUB, userId: 'u-wom', role: 'player', status: 'active', playerGroupId: WOM },
  ]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1,
    groups: [
      { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
      { id: U18, name: 'U18', type: 'general', status: 'active' },
      { id: WOM, name: "Women's", type: 'general', status: 'active' },
    ],
    teams: [{ id: 'team_initial', groupId: SEN, name: 'Premier development', status: 'active' }] }));
  kv.set(`app:roster:${CLUB}`, JSON.stringify({ players: [
    { id: 'p-sen', userId: 'u-sen', name: 'Sen Case', position: 'Prop' },
    { id: 'p-u18', userId: 'u-u18', name: 'U18 Case', position: 'Prop' },
    { id: 'p-wom', userId: 'u-wom', name: 'Wom Case', position: 'Prop' },
  ] }));
  // One active case per group, plus a pre-group ORPHAN (legacy-readable).
  kv.set(`app:medical:${CLUB}`, JSON.stringify({ clubId: CLUB, updatedAt: '2026-08-01T00:00:00.000Z',
    cases: [
      { id: 'c-sen', playerId: 'p-sen', playerGroupId: SEN, status: 'active', condition: 'Sen injury' },
      { id: 'c-u18', playerId: 'p-u18', playerGroupId: U18, status: 'active', condition: 'U18 injury' },
      { id: 'c-wom', playerId: 'p-wom', playerGroupId: WOM, status: 'active', condition: 'Wom injury' },
      { id: 'c-orph', playerId: 'p-sen', playerGroupId: '', status: 'resolved', condition: 'Legacy resolved' },
    ] }));
}
async function medical(method, query, body, token) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, end() { return this; } };
  await publishHandler({ method, query: { resource: 'medical', ...query },
    headers: { cookie: `ce_session=${token}` }, body, on() {} }, res);
  return res;
}

test('each group\'s Medical shows ONLY its own cases — all three directions', async () => {
  seed();
  const { token } = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const expect = { [SEN]: 'c-sen', [U18]: 'c-u18', [WOM]: 'c-wom' };
  for (const [gid, own] of Object.entries(expect)) {
    const r = await medical('GET', { group: gid }, null, token);
    assert.equal(r.code, 200);
    const ids = r.body.cases.map(c => c.id);
    assert.ok(ids.includes(own), `${gid} sees its case`);
    for (const other of Object.values(expect)) {
      if (other !== own) assert.ok(!ids.includes(other), `${gid} must not see ${other}`);
    }
  }
});

test('legacy-readable data still loads: the initial-group ask includes the orphan history', async () => {
  seed();
  const { token } = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const r = await medical('GET', { group: SEN }, null, token);
  assert.ok(r.body.cases.some(c => c.id === 'c-orph'),
    'whole-club coverage asking for the INITIAL group keeps orphan history readable');
  const u18 = await medical('GET', { group: U18 }, null, token);
  assert.ok(!u18.body.cases.some(c => c.id === 'c-orph'), 'orphans never surface in non-initial groups');
});

test('editing the authoritative status persists and reloads (real write path)', async () => {
  seed();
  const { token } = await store.createSession({ userId: 'u-simon', teamId: CLUB, role: 'coach' });
  const w = await medical('POST', {}, { action: 'upsert_case', playerId: 'p-u18', userId: 'u-u18',
    condition: 'U18 injury', severity: 'severe', returnTarget: '2026-09-01' }, token);
  assert.equal(w.code, 200, JSON.stringify(w.body));
  const r = await medical('GET', { group: U18 }, null, token);
  const c = r.body.cases.find(x => x.playerId === 'p-u18' && x.status === 'active');
  assert.equal(c?.severity, 'severe', 'edit persisted');
  assert.equal(c?.returnTarget, '2026-09-01', 'return target persisted through reload');
});

// ── 8-9: the dead surface is gone ─────────────────────────────────────────
test('the legacy renderer body and its orphaned handlers are gone from the live flow', () => {
  const renderer = fn('renderMedical');
  assert.match(renderer, /_renderMedicalDashboard\(\)/, 'delegation only — dashboard default');
  assert.equal(/Treatment & rehab tracker|med-overview-grid|addTreatForm/.test(renderer), false,
    'the pre-Phase-21 body is removed');
  for (const gone of ['function saveMedicalNote(', 'function setRehabProgress(',
                      'function addTreatmentLog(', 'function saveCoachNotes(']) {
    assert.equal(src.includes(gone), false, `${gone.slice(9, -1)} removed with its markup`);
  }
  // The live handlers survive.
  for (const kept of ['function saveNewInjury(', 'function toggleAddInjury(',
                      'function clearSharedMedicalCase(', 'function requestMedical(']) {
    assert.ok(src.includes(kept), `${kept.slice(9, -1)} still live`);
  }
});

test('"Legacy rehab" wording no longer exists anywhere in the live UI', () => {
  assert.equal(/Legacy rehab/i.test(src), false);
});
