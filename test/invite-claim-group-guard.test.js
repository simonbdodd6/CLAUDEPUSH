/**
 * PLAYER INVITE CLAIM GUARD — a player invite with NO playerGroupId cannot be
 * claimed once the club has SEVERAL active groups (the claim would mint a
 * member who resolves to no group). One active group keeps legacy behaviour;
 * staff invites are untouched. The rejection happens BEFORE any write: no
 * account, no membership, and the invite is never consumed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.claim-guard.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  if (command === 'SCAN') result = ['0', []];
  return { ok: true, json: async () => ({ result }) };
};

const { claimInvite, DEFAULT_TEAM } = await import('../api/_identityStore.js');
const { resolvePlayerGroup } = await import('../api/_accessScope.js');

const CLUB = DEFAULT_TEAM.id;
const SEN = 'grp_initial', U18 = 'grp_u18', WOM = 'grp_womens';

const THREE_GROUPS = { version: 1,
  groups: [
    { id: SEN, name: 'Seniors', type: 'general', status: 'active' },
    { id: U18, name: 'U18',     type: 'general', status: 'active' },
    { id: WOM, name: "Women's", type: 'general', status: 'active' },
  ],
  teams: [
    { id: 'team_premier', groupId: SEN, name: 'Premier', status: 'active' },
    { id: 'team_u18p',    groupId: U18, name: 'U18 Premier', status: 'active' },
    { id: 'team_womp',    groupId: WOM, name: "Women's Premier", status: 'active' },
  ] };
const ONE_GROUP = { version: 1,
  groups: [{ id: SEN, name: 'Seniors', type: 'general', status: 'active' }],
  teams:  [{ id: 'team_premier', groupId: SEN, name: 'Premier', status: 'active' }] };

function seed(structure) {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Boitsfort' }]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:users', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify(structure));
}
function seedInvite(inv) {
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ status: 'pending', createdAt: new Date().toISOString(), teamId: CLUB, ...inv });
  kv.set('ce:invites', JSON.stringify(invites));
}
const store = name => JSON.parse(kv.get(name) || '[]');
const membersOf = () => store('app:identity:team_members').filter(m => m.teamId === CLUB);
const inviteByToken = t => store('ce:invites').find(i => i.token === t);

// 1. Group-scoped player invite + 3 groups → succeeds.
test('a SCOPED player invite claims normally in a 3-group club', async () => {
  seed(THREE_GROUPS);
  seedInvite({ token: 'ScopedTok0000001', role: 'player', name: 'New U18', playerGroupId: U18 });
  await claimInvite({ token: 'ScopedTok0000001', name: 'New U18', email: 'u18@club.test', password: 'realPassword12' });
  const m = membersOf()[0];
  assert.equal(m.role, 'player');
  assert.equal(m.playerGroupId, U18, 'group stamped from the invite');
  assert.equal(resolvePlayerGroup(m, THREE_GROUPS).groupId, U18);
});

// 2. Unscoped player invite + 1 group → legacy behaviour preserved.
test('an UNSCOPED player invite still claims in a single-group club (legacy)', async () => {
  seed(ONE_GROUP);
  seedInvite({ token: 'LegacyTok0000001', role: 'player', name: 'Legacy Player' });
  await claimInvite({ token: 'LegacyTok0000001', name: 'Legacy Player', email: 'legacy@club.test', password: 'realPassword12' });
  const m = membersOf()[0];
  assert.equal(m.role, 'player');
  assert.equal(String(m.playerGroupId || ''), '', 'legacy claims stay unstamped');
  assert.equal(resolvePlayerGroup(m, ONE_GROUP).groupId, SEN,
    'the single-group rule resolves them to the sole group, exactly as before');
});

// 3-5. Unscoped player invite + 3 groups → rejected, atomically, unconsumed.
test('an UNSCOPED player invite in a MULTI-group club is refused before any write', async () => {
  seed(THREE_GROUPS);
  seedInvite({ token: 'GrouplessTok0001', role: 'player', name: 'Mystery Player' });
  const usersBefore = kv.get('app:identity:users');
  const membersBefore = kv.get('app:identity:team_members');

  await assert.rejects(
    () => claimInvite({ token: 'GrouplessTok0001', name: 'Mystery Player', email: 'mystery@club.test', password: 'realPassword12' }),
    err => {
      assert.equal(err.status, 410);
      assert.match(err.message, /no longer valid for this club/i, 'client-safe message');
      assert.equal(/grp_|team_/.test(err.message), false, 'no internal ids leaked');
      return true;
    });

  assert.equal(kv.get('app:identity:users'), usersBefore, 'no account created or updated');
  assert.equal(kv.get('app:identity:team_members'), membersBefore, 'no membership created or updated');
  const inv = inviteByToken('GrouplessTok0001');
  assert.equal(inv.status, 'pending', 'the invite is NOT consumed');
  assert.equal(inv.acceptedBy, undefined, 'no claimer recorded');
});

test('a rejected REUSABLE group link is not incremented either', async () => {
  seed(THREE_GROUPS);
  seedInvite({ token: 'OpenLinkTok00001', kind: 'group', status: 'open', role: 'player', name: '', acceptedCount: 53 });
  await assert.rejects(
    () => claimInvite({ token: 'OpenLinkTok00001', name: 'Walk Up', email: 'walkup@club.test', password: 'realPassword12' }),
    err => err.status === 410);
  const inv = inviteByToken('OpenLinkTok00001');
  assert.equal(inv.acceptedCount, 53, 'accept count untouched');
  assert.equal(inv.status, 'open', 'link state untouched');
  assert.equal(membersOf().length, 0, 'no membership appeared');
});

// 6. Coach unscoped invite unchanged.
test('an UNSCOPED COACH invite in a multi-group club still claims (staff rules unchanged)', async () => {
  seed(THREE_GROUPS);
  seedInvite({ token: 'CoachTok00000001', role: 'coach', staffLevel: 'assistant', name: 'New Coach' });
  await claimInvite({ token: 'CoachTok00000001', name: 'New Coach', email: 'coach@club.test', password: 'realPassword12' });
  const m = membersOf()[0];
  assert.equal(m.role, 'coach');
  assert.equal(m.accessScope, undefined, 'no scope stamped — legacy null derivation applies (Seniors-only)');
});

// 7. Medical unscoped invite unchanged.
test('an UNSCOPED MEDICAL invite in a multi-group club still claims', async () => {
  seed(THREE_GROUPS);
  seedInvite({ token: 'MedicTok00000001', role: 'medical', name: 'New Medic' });
  await claimInvite({ token: 'MedicTok00000001', name: 'New Medic', email: 'medic@club.test', password: 'realPassword12' });
  assert.equal(membersOf()[0].role, 'medical');
});

// 8. Existing scoped onboarding (group link with playerGroupId) unchanged.
test('a SCOPED reusable player link claims normally — the shipped scoped-links flow', async () => {
  seed(THREE_GROUPS);
  seedInvite({ token: 'ScopedLinkTok001', kind: 'group', status: 'open', role: 'player', name: '',
    scope: { groupId: WOM }, playerGroupId: WOM, acceptedCount: 2 });
  await claimInvite({ token: 'ScopedLinkTok001', name: "New Women's Player", email: 'wom@club.test', password: 'realPassword12' });
  const m = membersOf()[0];
  assert.equal(m.playerGroupId, WOM);
  assert.equal(inviteByToken('ScopedLinkTok001').acceptedCount, 3, 'reusable link counts the accept');
  assert.equal(inviteByToken('ScopedLinkTok001').status, 'open', 'and stays open');
});
