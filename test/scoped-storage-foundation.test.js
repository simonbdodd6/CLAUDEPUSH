/**
 * RC4.7 Phase B — group/team-scoped storage foundation.
 *
 * Availability is a GROUP resource; publications split into group blocks
 * (training, schedule) and team blocks (squad). New writes always use scoped
 * keys; legacy club-scoped reads remain available ONLY to the migrated
 * initial group/team, so no other group can reach pre-structure data.
 *
 * Covers Phase B scenarios 23-25.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL  = 'https://redis.scoped-storage.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX          = 'app';

const kv = new Map();
let writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); writes.push(args[0]); result = 'OK'; }
  if (command === 'SCAN') {
    const pattern = args[2];
    const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  return { ok: true, json: async () => ({ result }) };
};

const { groupAvailabilityKey, groupPublishKey, teamPublishKey, teamAvailabilityKey } = await import('../api/_keys.js');
const {
  INITIAL_GROUP_ID, INITIAL_TEAM_ID,
  readGroupBlock, writeGroupBlock, readTeamBlock, writeTeamBlock,
} = await import('../api/_structureStore.js');
const {
  loadGroupAvailability, saveGroupAvailability, loadAllGroupAvailability,
  loadAllAvailability,
} = await import('../api/_availabilityStore.js');

const CLUB = 'boitsfort-rugby-club';

// ── Key formats ─────────────────────────────────────────────────────────────
test('scoped key formats are unambiguous against both legacy shapes', () => {
  assert.equal(groupAvailabilityKey(CLUB, 'grp-u18', 'tue'),
    `app:availability:${CLUB}:group:grp-u18:tue`);
  assert.equal(groupPublishKey(CLUB, 'grp-u18', 'training'),
    `app:publish:${CLUB}:group:grp-u18:training`);
  assert.equal(teamPublishKey(CLUB, 'team-senior-1', 'squad'),
    `app:publish:${CLUB}:team:team-senior-1:squad`);
  // The literal marker segment can never collide with a session id (no ':')
  // or with the RC4.7A club-scoped shape (one segment after the club).
  assert.notEqual(groupAvailabilityKey(CLUB, 'grp-u18', 'tue'), teamAvailabilityKey(CLUB, 'tue'));
});

// ── 23: legacy reads only for the initial group ─────────────────────────────
test('23. Legacy availability is readable ONLY by the migrated initial group', async () => {
  kv.clear(); writes = [];
  // Pre-RC4.7 record on the club-scoped key.
  kv.set(teamAvailabilityKey(CLUB, 'tue'), JSON.stringify({ 'u-1': 'yes', 'u-2': 'no' }));

  const initial = await loadGroupAvailability(CLUB, INITIAL_GROUP_ID, 'tue');
  assert.deepEqual(initial, { 'u-1': 'yes', 'u-2': 'no' }, 'initial group sees legacy data');

  const other = await loadGroupAvailability(CLUB, 'grp-u18', 'tue');
  assert.deepEqual(other, {}, 'any other group gets NOTHING from legacy keys');

  const all = await loadAllGroupAvailability(CLUB, 'grp-u18');
  assert.deepEqual(all, {}, 'bulk read equally isolated');

  const allInitial = await loadAllGroupAvailability(CLUB, INITIAL_GROUP_ID);
  assert.deepEqual(Object.keys(allInitial), ['tue'], 'bulk read fills from legacy for initial group');
  assert.deepEqual(writes, [], 'reads never write');
});

// ── 24: writes always scoped ────────────────────────────────────────────────
test('24. New availability writes land on the group-scoped key', async () => {
  kv.clear(); writes = [];
  await saveGroupAvailability(CLUB, 'grp-u18', 'thu', { 'u-9': 'yes' });
  assert.deepEqual(writes, [groupAvailabilityKey(CLUB, 'grp-u18', 'thu')]);
  assert.equal(kv.has(teamAvailabilityKey(CLUB, 'thu')), false, 'legacy key untouched');

  // Even the INITIAL group writes scoped — fallback is read-only.
  writes = [];
  await saveGroupAvailability(CLUB, INITIAL_GROUP_ID, 'tue', { 'u-1': 'no' });
  assert.deepEqual(writes, [groupAvailabilityKey(CLUB, INITIAL_GROUP_ID, 'tue')]);

  // And the scoped answer now wins over any legacy record.
  kv.set(teamAvailabilityKey(CLUB, 'tue'), JSON.stringify({ 'u-1': 'stale' }));
  const read = await loadGroupAvailability(CLUB, INITIAL_GROUP_ID, 'tue');
  assert.deepEqual(read, { 'u-1': 'no' }, 'scoped beats legacy');
});

test('group-scoped keys never leak into the club-level availability view', async () => {
  kv.clear();
  kv.set(teamAvailabilityKey(CLUB, 'game'), JSON.stringify({ 'u-1': 'yes' }));
  await saveGroupAvailability(CLUB, 'grp-u18', 'tue', { 'u-9': 'yes' });
  const clubView = await loadAllAvailability(CLUB);
  assert.deepEqual(Object.keys(clubView), ['game'],
    'group-scoped records are invisible to the pre-RC4.7 club reader');
});

// ── 25: publication blocks ──────────────────────────────────────────────────
test('25. Publication writes use the group/team-scoped keys', async () => {
  kv.clear(); writes = [];
  await writeGroupBlock(CLUB, 'grp-senior-men', 'training', { blocks: [1] });
  await writeTeamBlock(CLUB, 'team-senior-1', 'squad', { players: ['a'] });
  await writeTeamBlock(CLUB, 'team-senior-2', 'squad', { players: ['b'] });
  assert.deepEqual(writes, [
    groupPublishKey(CLUB, 'grp-senior-men', 'training'),
    teamPublishKey(CLUB, 'team-senior-1', 'squad'),
    teamPublishKey(CLUB, 'team-senior-2', 'squad'),
  ]);
  // The two senior squads are INDEPENDENT records.
  assert.deepEqual(await readTeamBlock(CLUB, 'team-senior-1', 'squad'), { players: ['a'] });
  assert.deepEqual(await readTeamBlock(CLUB, 'team-senior-2', 'squad'), { players: ['b'] });
});

test('publication legacy fallback serves the initial scope only', async () => {
  kv.clear();
  const legacyTraining = { blocks: ['legacy'] };
  const legacySquad = { players: ['legacy'] };
  const legacyReader = value => () => value;

  assert.deepEqual(await readGroupBlock(CLUB, INITIAL_GROUP_ID, 'training', legacyReader(legacyTraining)),
    legacyTraining, 'initial group falls back');
  assert.equal(await readGroupBlock(CLUB, 'grp-u18', 'training', legacyReader(legacyTraining)),
    null, 'other groups NEVER fall back');
  assert.deepEqual(await readTeamBlock(CLUB, INITIAL_TEAM_ID, 'squad', legacyReader(legacySquad)),
    legacySquad, 'initial team falls back');
  assert.equal(await readTeamBlock(CLUB, 'team-senior-2', 'squad', legacyReader(legacySquad)),
    null, 'other teams NEVER fall back');

  // Scoped data beats the fallback once present.
  await writeGroupBlock(CLUB, INITIAL_GROUP_ID, 'training', { blocks: ['scoped'] });
  assert.deepEqual(await readGroupBlock(CLUB, INITIAL_GROUP_ID, 'training', legacyReader(legacyTraining)),
    { blocks: ['scoped'] });
});
