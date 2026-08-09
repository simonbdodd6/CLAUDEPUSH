/**
 * RC4.7 D1a — the maintenance script and the age-group derivation that now
 * depends on it.
 *
 *  1. scripts/backfill-player-groups.js is a thin wrapper: it must refuse bad
 *     input, default to a dry run that writes NOTHING, apply exactly the
 *     expected assignments under --apply, assign nothing on a second run, and
 *     never print a credential, name, email or id.
 *  2. The profile age group derives from member.playerGroupId — never from
 *     staff access scope.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.backfill-script.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

/**
 * Real storage double. Every write is counted, so "the dry run performs zero
 * writes" is proved against the actual migration helper rather than a stub.
 */
const kv = new Map();
const writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { writes.push(args[0]); kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { writes.push(args[0]); kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

import { parseArgs, formatReport, missingCredentials, run } from '../scripts/backfill-player-groups.js';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scriptSrc = fs.readFileSync(new URL('../scripts/backfill-player-groups.js', import.meta.url), 'utf8');

const ENV = { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'token' };

/** Capture stdout/stderr instead of printing, so assertions can inspect it. */
function capture() {
  const out = [], err = [];
  return { out, err, log: m => out.push(String(m)), error: m => err.push(String(m)),
           get text() { return out.concat(err).join('\n'); } };
}

// ── 1. ARGUMENT SAFETY ─────────────────────────────────────────────────────
test('the script refuses to run without an explicit club id', () => {
  assert.throws(() => parseArgs([]), /--club <clubId> is required/);
  assert.throws(() => parseArgs(['--apply']), /--club <clubId> is required/);
  assert.throws(() => parseArgs(['--club']), /--club requires a club id/);
  assert.throws(() => parseArgs(['--club', '--apply']), /--club requires a club id/,
    'a missing value must never swallow the next flag');
});

test('unknown arguments are a hard error, so a typo cannot become a live run', () => {
  assert.throws(() => parseArgs(['--club', 'c1', '--force']), /unknown argument: --force/);
  assert.throws(() => parseArgs(['--club', 'c1', '--dry-run']), /unknown argument: --dry-run/,
    'dry run is the default, not a flag — an unknown spelling must not silently apply');
  assert.throws(() => parseArgs(['--club', 'c1', 'extra']), /unknown argument: extra/);
});

test('dry run is the default and --apply is the only way to write', () => {
  assert.deepEqual(parseArgs(['--club', 'c1']), { clubId: 'c1', apply: false, dryRun: true });
  assert.deepEqual(parseArgs(['--club=c1']), { clubId: 'c1', apply: false, dryRun: true });
  assert.deepEqual(parseArgs(['--club', 'c1', '--apply']), { clubId: 'c1', apply: true, dryRun: false });
});

test('the script hard-codes neither a club id nor a credential', () => {
  assert.equal(/boitsfort/i.test(scriptSrc), false, 'no club id baked in');
  assert.match(scriptSrc, /import \{ backfillPlayerGroups \} from '\.\.\/api\/_identityStore\.js'/,
    'reuses the tested migration helper rather than reimplementing it');
  // The only mention of the credential names is the presence check.
  const tokenMentions = scriptSrc.match(/UPSTASH_REDIS_REST_TOKEN/g) || [];
  assert.equal(tokenMentions.length, 1, 'the token is named once, for a presence check, and never read');
  assert.equal(/prompt|readline|createInterface/.test(scriptSrc), false, 'never interactive');
});

// ── 2. CREDENTIALS ─────────────────────────────────────────────────────────
test('missing credentials stop the run and are reported by NAME, never by value', async () => {
  assert.deepEqual(missingCredentials({}), ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']);
  assert.deepEqual(missingCredentials(ENV), []);
  assert.deepEqual(missingCredentials({ ...ENV, UPSTASH_REDIS_REST_TOKEN: '   ' }),
    ['UPSTASH_REDIS_REST_TOKEN'], 'blank counts as missing');

  const io = capture();
  let called = false;
  const code = await run(['--club', 'c1'], { ...io, env: {}, backfill: async () => { called = true; } });
  assert.equal(code, 3);
  assert.equal(called, false, 'never reaches storage without credentials');
  assert.match(io.text, /missing storage credentials/);
  assert.equal(io.text.includes('token'), false, 'no secret value printed');
  assert.match(io.text, /vercel env pull/, 'points at the established mechanism');
});

// ── 3. DRY RUN WRITES NOTHING ──────────────────────────────────────────────
test('a dry run reaches the helper with dryRun:true and mutates nothing', async () => {
  const io = capture();
  const seen = [];
  const code = await run(['--club', 'club-x'], {
    ...io, env: ENV,
    backfill: async (clubId, opts) => {
      seen.push({ clubId, ...opts });
      return { clubId, activeGroups: 1, groupId: 'g-sen', groupName: 'Seniors', totalMembers: 12,
               activePlayers: 9, alreadyAssigned: 0, staffSkipped: 3, wouldAssign: 9,
               assigned: 0, applied: false, reason: 'dry run — no changes written' };
    },
  });

  assert.equal(code, 0);
  assert.deepEqual(seen, [{ clubId: 'club-x', dryRun: true, changedBy: 'd1a-backfill-script' }]);
  assert.match(io.text, /DRY RUN \(no writes\)/);
  assert.match(io.text, /wouldAssign     9/);
  assert.match(io.text, /assigned        0/, 'a dry run assigns nothing');
  assert.match(io.text, /applied         false/);
});

// ── 4. APPLY, THEN RE-APPLY ────────────────────────────────────────────────
test('apply assigns exactly the pending players; a second apply assigns none', async () => {
  const first = capture();
  const seen = [];
  await run(['--club', 'club-x', '--apply'], {
    ...first, env: ENV,
    backfill: async (clubId, opts) => {
      seen.push(opts);
      return { clubId, activeGroups: 1, groupId: 'g-sen', groupName: 'Seniors', totalMembers: 12,
               activePlayers: 9, alreadyAssigned: 0, staffSkipped: 3, wouldAssign: 9,
               assigned: 9, applied: true, reason: null };
    },
  });
  assert.deepEqual(seen, [{ dryRun: false, changedBy: 'd1a-backfill-script' }]);
  assert.match(first.text, /APPLY \(writes\)/);
  assert.match(first.text, /assigned        9/);
  assert.match(first.text, /staffSkipped    3/, 'staff were skipped, not assigned');

  const second = capture();
  const code = await run(['--club', 'club-x', '--apply'], {
    ...second, env: ENV,
    backfill: async clubId => ({ clubId, activeGroups: 1, groupId: 'g-sen', groupName: 'Seniors',
      totalMembers: 12, activePlayers: 9, alreadyAssigned: 9, staffSkipped: 3, wouldAssign: 0,
      assigned: 0, applied: true, reason: 'nothing to do — already backfilled' }),
  });
  assert.equal(code, 0);
  assert.match(second.text, /assigned        0/, 'idempotent — a second run assigns nothing');
  assert.match(second.text, /alreadyAssigned 9/);
});

test('a refusal exits non-zero so it cannot be mistaken for a completed run', async () => {
  const io = capture();
  const code = await run(['--club', 'club-x', '--apply'], {
    ...io, env: ENV,
    backfill: async clubId => ({ clubId, activeGroups: 2, groupId: null, groupName: null,
      totalMembers: 12, activePlayers: 9, alreadyAssigned: 0, staffSkipped: 3, wouldAssign: 0,
      assigned: 0, applied: false, reason: '2 active groups — refusing to guess; assign each player explicitly' }),
  });
  assert.equal(code, 1);
  assert.match(io.text, /refusing to guess/);
});

// ── 5. OUTPUT CARRIES NO PERSONAL DATA ─────────────────────────────────────
test('the summary prints aggregate counts only — no names, emails, ids or tokens', () => {
  const report = { clubId: 'club-x', activeGroups: 1, groupId: 'g-sen', groupName: 'Seniors',
    totalMembers: 12, activePlayers: 9, alreadyAssigned: 0, staffSkipped: 3, wouldAssign: 9,
    assigned: 0, applied: false, reason: 'dry run — no changes written',
    // Fields a future helper might add must not leak just because they exist.
    members: [{ id: 'tm1', userId: 'u1', email: 'player@example.com', name: 'Real Person' }] };
  const text = formatReport(report, { dryRun: true });

  for (const leak of ['player@example.com', 'Real Person', 'tm1', '"userId"', 'u1']) {
    assert.equal(text.includes(leak), false, `must not print ${leak}`);
  }
  assert.equal(text.includes('token'), false);
  assert.match(text, /activePlayers   9/, 'aggregate counts are what an operator needs');
});

// ── 6. END TO END: SCRIPT → REAL HELPER → STORAGE ──────────────────────────
const CLUB = 'club-e2e';
const MEMBERS_KEY = 'app:identity:team_members';
const SEED = [
  { id: 'm1', teamId: CLUB, userId: 'u1', role: 'player', status: 'active' },
  { id: 'm2', teamId: CLUB, userId: 'u2', role: 'player', status: 'active' },
  { id: 'm3', teamId: CLUB, userId: 'u3', role: 'player', status: 'active', playerGroupId: 'g-sen' },
  { id: 'm4', teamId: CLUB, userId: 'u4', role: 'coach', status: 'active',
    accessScope: { clubWide: false, groups: [{ groupId: 'g-sen', status: 'active' }], teams: [] } },
  { id: 'm5', teamId: CLUB, userId: 'u5', role: 'player', status: 'removed' },
  { id: 'm6', teamId: 'other-club', userId: 'u6', role: 'player', status: 'active' },
];

function seed() {
  kv.clear();
  writes.length = 0;
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club E2E' }]));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1,
    groups: [{ id: 'g-sen', name: 'Seniors', type: 'general', status: 'active' }],
    teams: [{ id: 't-prem', groupId: 'g-sen', name: 'Premier', status: 'active' }],
  }));
  kv.set(MEMBERS_KEY, JSON.stringify(SEED));
}
const members = () => JSON.parse(kv.get(MEMBERS_KEY));

test('END TO END — a dry run through the real helper writes nothing at all', async () => {
  seed();
  const before = kv.get(MEMBERS_KEY);
  const io = capture();

  const code = await run(['--club', CLUB], { ...io, env: process.env });

  assert.equal(code, 0);
  assert.deepEqual(writes, [], 'ZERO storage writes were issued');
  assert.equal(kv.get(MEMBERS_KEY), before, 'membership storage is byte-identical');
  assert.match(io.text, /DRY RUN \(no writes\)/);
  assert.match(io.text, /wouldAssign     2/, 'two legacy players would be assigned');
  assert.match(io.text, /alreadyAssigned 1/);
  assert.match(io.text, /staffSkipped    1/);
});

test('END TO END — apply assigns exactly the pending players and nothing else', async () => {
  seed();
  const code = await run(['--club', CLUB, '--apply'], { ...capture(), env: process.env });
  assert.equal(code, 0);
  assert.deepEqual(writes, [MEMBERS_KEY], 'exactly one key written — no profiles, roster or structure');

  const after = members();
  const byId = id => after.find(m => m.id === id);
  assert.equal(byId('m1').playerGroupId, 'g-sen', 'legacy player assigned');
  assert.equal(byId('m2').playerGroupId, 'g-sen');
  assert.equal(byId('m3').playerGroupId, 'g-sen', 'explicit value unchanged');
  assert.equal(byId('m4').playerGroupId, undefined, 'staff untouched');
  assert.deepEqual(byId('m4').accessScope, SEED[3].accessScope, 'staff access scope untouched');
  assert.equal(byId('m5').playerGroupId, undefined, 'removed member untouched');
  assert.equal(byId('m6').playerGroupId, undefined, 'another club untouched');
  assert.equal(byId('m1').accessChangedBy, 'd1a-backfill-script', 'attributed to the migration');
});

test('END TO END — a second apply assigns nothing (idempotent)', async () => {
  seed();
  await run(['--club', CLUB, '--apply'], { ...capture(), env: process.env });
  const afterFirst = kv.get(MEMBERS_KEY);

  writes.length = 0;
  const io = capture();
  const code = await run(['--club', CLUB, '--apply'], { ...io, env: process.env });

  assert.equal(code, 0);
  assert.match(io.text, /assigned        0/, 'a second run assigns nobody');
  assert.match(io.text, /already backfilled/);
  assert.deepEqual(writes, [], 'and writes nothing at all the second time');
  assert.equal(kv.get(MEMBERS_KEY), afterFirst, 'storage byte-identical after the second run');
});

test('END TO END — a club with no structure refuses safely and writes nothing', async () => {
  seed();
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, groups: [], teams: [] }));
  writes.length = 0;
  const io = capture();

  const code = await run(['--club', CLUB, '--apply'], { ...io, env: process.env });

  assert.equal(code, 1, 'a refusal is not a success');
  assert.deepEqual(writes, [], 'nothing written');
  assert.match(io.text, /no active group/);
});

// ── 7. AGE GROUP COMES FROM playerGroupId ──────────────────────────────────
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let depth = 0, end = src.indexOf('{', start);
  for (let b = end; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}
function ageGroupWith(adminData) {
  const body = ['memberForPlayer', 'derivedAgeGroup'].map(fn).join('\n');
  return new Function(`const _adminData = arguments[0];\n${body}\nreturn derivedAgeGroup;`)(adminData);
}

const TWO_GROUPS = {
  groups: [
    { id: 'g-sen', name: 'Seniors', status: 'active' },
    { id: 'g-u18', name: 'U18', status: 'active' },
    { id: 'g-vet', name: 'Veterans', status: 'archived' },
  ],
  teams: [{ id: 't-prem', groupId: 'g-sen', name: 'Premier', status: 'active' }],
};
const ONE_GROUP = {
  groups: [{ id: 'g-sen', name: 'Seniors', status: 'active' }],
  teams: [{ id: 't-prem', groupId: 'g-sen', name: 'Premier', status: 'active' }],
};

test('the age group is the explicit player group, resolved to its name', () => {
  const seniors = ageGroupWith({ structure: TWO_GROUPS,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active', playerGroupId: 'g-sen' }] });
  assert.equal(seniors({ userId: 'u1' }), 'Seniors');

  const u18 = ageGroupWith({ structure: TWO_GROUPS,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active', playerGroupId: 'g-u18' }] });
  assert.equal(u18({ userId: 'u1' }), 'U18');
});

test('staff access never becomes a playing age group', () => {
  // A Seniors coach — club structure knows them, but they do not play.
  const coach = ageGroupWith({ structure: TWO_GROUPS,
    members: [{ id: 'tm1', userId: 'u1', role: 'coach', status: 'active',
      accessScope: { clubWide: false, groups: [{ groupId: 'g-sen', status: 'active' }], teams: [] } }] });
  assert.equal(coach({ userId: 'u1' }), '', 'Seniors staff access is not a Seniors age group');

  // Club-wide admin is the strongest access there is, and still not a group.
  const owner = ageGroupWith({ structure: TWO_GROUPS,
    members: [{ id: 'tm1', userId: 'u1', role: 'admin', status: 'active', isOwner: true,
      accessScope: { clubWide: true, groups: [], teams: [] } }] });
  assert.equal(owner({ userId: 'u1' }), '', 'club-wide access is not every age group');

  // Even in a single-group club, a staff-only member derives nothing.
  const soleGroupCoach = ageGroupWith({ structure: ONE_GROUP,
    members: [{ id: 'tm1', userId: 'u1', role: 'coach', status: 'active' }] });
  assert.equal(soleGroupCoach({ userId: 'u1' }), '', 'only genuine players get the legacy fallback');
});

test('a U18 player who coaches Seniors reads U18, never Seniors', () => {
  const dual = ageGroupWith({ structure: TWO_GROUPS,
    members: [{ id: 'tm1', userId: 'u1', role: 'coach', status: 'active', playerGroupId: 'g-u18',
      accessScope: { clubWide: false, groups: [{ groupId: 'g-sen', status: 'active' }], teams: [] } }] });
  assert.equal(dual({ userId: 'u1' }), 'U18', 'where they play wins over where they coach');
});

test('legacy players keep the single-group answer; ambiguity stays blank', () => {
  const legacy = ageGroupWith({ structure: ONE_GROUP,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active' }] });
  assert.equal(legacy({ userId: 'u1' }), 'Seniors', 'pre-backfill players still read correctly');

  // The moment a second group exists the answer is unknowable — refuse to guess.
  const ambiguous = ageGroupWith({ structure: TWO_GROUPS,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active' }] });
  assert.equal(ambiguous({ userId: 'u1' }), '', 'needs assignment, not a guess');
});

test('an unknown or archived player group resolves to blank, never a stale name', () => {
  const archived = ageGroupWith({ structure: TWO_GROUPS,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active', playerGroupId: 'g-vet' }] });
  assert.equal(archived({ userId: 'u1' }), '', 'archived group is not a valid age group');

  const unknown = ageGroupWith({ structure: TWO_GROUPS,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active', playerGroupId: 'g-nope' }] });
  assert.equal(unknown({ userId: 'u1' }), '');

  // An explicit group must not silently fall back to the single-group answer.
  const staleInOneGroupClub = ageGroupWith({ structure: ONE_GROUP,
    members: [{ id: 'tm1', userId: 'u1', role: 'player', status: 'active', playerGroupId: 'g-gone' }] });
  assert.equal(staleInOneGroupClub({ userId: 'u1' }), '', 'a stale explicit value is not repaired by guessing');
});

test('the derivation reads playerGroupId and not accessScope', () => {
  const body = fn('derivedAgeGroup');
  assert.match(body, /member\.playerGroupId/, 'authoritative source');
  assert.equal(/memberScope\(/.test(body), false, 'staff access scope is not consulted at all');
  assert.equal(/accessScope/.test(body), false);
});
