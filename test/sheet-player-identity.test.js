/**
 * PUBLISHED TEAM SHEETS — durable player identity.
 *
 * A team sheet names its players as text. That is a record of what was written,
 * not of who was written: rename a player and the sheet's own history stops
 * resolving to them, so their season appearances become "unresolved" and are
 * correctly — but uselessly — credited to nobody.
 *
 * Publishing now also stores WHO each name meant, resolved once against the
 * roster as it stood at that moment, using the canonical identity
 * (playerMatchKey via mcPersonKey) that substitutions and the season
 * aggregation already use. Two parallel structures mirror the names exactly:
 *
 *     formationNames { '1': 'Original Name' }   formationKeys { '1': 'id:u123' }
 *     benchPlayers   [ 'Sub One' ]              benchKeys     [ 'id:u456' ]
 *
 * The names are untouched — they are the historical display, and every sheet
 * published before this build has only them.
 *
 * TWO RULES DO THE WORK:
 *   · Only a DURABLE key is ever stored. An unresolved name ("nm:…") is left
 *     out rather than frozen, because storing a guess is worse than leaving the
 *     entry to the existing safe name resolution.
 *   · A reader prefers the stored key and falls back to resolving the name.
 *     Legacy sheets therefore behave exactly as they did, and a genuinely
 *     unknown name stays unresolved rather than being attributed to somebody.
 *
 * No historical data is migrated. Nothing is guessed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.sheetid.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = await readFile(join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(source, name) {
  let start = source.indexOf('    function ' + name + '(');
  if (start === -1) start = source.indexOf('    async function ' + name + '(');
  if (start === -1) throw new Error('function ' + name + ' not found in index.html');
  let i = source.indexOf('(', start), paren = 0;
  for (; i < source.length; i++) {
    if (source[i] === '(') paren++;
    else if (source[i] === ')') { paren--; if (!paren) { i++; break; } }
  }
  let brace = source.indexOf('{', i), depth = 0;
  for (let k = brace; k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}') { depth--; if (!depth) return source.slice(start, k + 1); }
  }
  throw new Error('function ' + name + ' — no closing brace');
}
const extractConst = (src, n) => { const i = src.indexOf('    const ' + n + ' '); return src.slice(i, src.indexOf(';', i) + 1); };

/** The real client functions, over a caller-supplied club roster. */
function club(players) {
  return new Function(`
    "use strict";
    const state = { players: ${JSON.stringify(players)} };
    function findPlayerByName(n) { const w = String(n || '').trim().toLowerCase();
      return state.players.find(p => String(p.name || '').trim().toLowerCase() === w) || null; }
    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'sheetPersonKeys')}
    ${extractFn(html, 'seasonPlayerStats')}
    return { state, playerMatchKey, mcPersonKey, sheetPersonKeys, seasonPlayerStats };
  `)();
}

const BEFORE = [{ id: 'p1', name: 'Original Name', userId: 'u123' },
                { id: 'p2', name: 'Other Player',  userId: 'u999' }];
const AFTER  = [{ id: 'p1', name: 'Updated Name',  userId: 'u123' },
                { id: 'p2', name: 'Other Player',  userId: 'u999' }];

/** Publish a sheet the way syncSquadToServer does: names PLUS resolved keys. */
function publish(sc, fixtureId, formationNames, benchPlayers = [], extra = {}) {
  const { formationKeys, benchKeys } = sc.sheetPersonKeys(formationNames, benchPlayers);
  return { fixtureId, matchMinutes: 80, formationNames, benchPlayers,
           formationKeys, benchKeys, substitutions: [], ...extra };
}

// ── 1. Publishing stores the identity ────────────────────────────────────────

test('a published sheet carries the durable identity beside each name', () => {
  const sc = club(BEFORE);
  const sheet = publish(sc, 'fx1', { '1': 'Original Name', '2': 'Other Player' }, ['Original Name']);
  assert.deepEqual(sheet.formationKeys, { '1': 'id:u123', '2': 'id:u999' });
  assert.deepEqual(sheet.benchKeys, ['id:u123']);
  // …and the names are untouched, because they are the historical display.
  assert.deepEqual(sheet.formationNames, { '1': 'Original Name', '2': 'Other Player' });
  assert.deepEqual(sheet.benchPlayers, ['Original Name']);
});

test('the identity stored is the SAME one substitutions and statistics use', () => {
  const sc = club(BEFORE);
  const sheet = publish(sc, 'fx1', { '1': 'Original Name' });
  assert.equal(sheet.formationKeys['1'], sc.playerMatchKey(BEFORE[0]));
  assert.equal(sheet.formationKeys['1'], sc.mcPersonKey('Original Name'));
  // No second identity system was introduced.
  const src = extractFn(html, 'sheetPersonKeys');
  assert.match(src, /mcPersonKey\(/, 'it asks the canonical resolver');
  assert.ok(!/userId \|\| .*\.id/.test(src), 'and does not re-derive the rule');
});

test('an unresolvable name is NOT given a frozen key', () => {
  const sc = club(BEFORE);
  const sheet = publish(sc, 'fx1', { '1': 'Original Name', '2': 'Nobody At All' });
  assert.equal(sheet.formationKeys['1'], 'id:u123');
  assert.equal(sheet.formationKeys['2'], undefined,
    'storing "nm:nobody at all" would freeze a guess — absence keeps the safe fallback');
});

test('an empty slot contributes no key', () => {
  const sc = club(BEFORE);
  const sheet = publish(sc, 'fx1', { '1': 'Original Name', '2': '', '3': '   ' }, ['', 'Other Player']);
  assert.deepEqual(Object.keys(sheet.formationKeys), ['1']);
  assert.deepEqual(sheet.benchKeys, ['', 'id:u999'], 'bench keys stay positional');
});

test('a player with no account is stored under their roster row — still durable enough', () => {
  const sc = club([{ id: 'p9', name: 'No Account' }]);
  const sheet = publish(sc, 'fx1', { '1': 'No Account' });
  assert.equal(sheet.formationKeys['1'], 'id:p9');
});

// ── 2. THE RENAME PROOF ──────────────────────────────────────────────────────

test('RENAME: an old sheet still credits the same player after a rename', () => {
  const sheet = publish(club(BEFORE), 'fx1', { '1': 'Original Name', '2': 'Other Player' });
  const sc = club(AFTER);                       // the roster now says "Updated Name"
  const r = sc.seasonPlayerStats([sheet]);
  assert.equal(r.byPlayer['id:u123'].appearances, 1, 'still theirs');
  assert.equal(r.byPlayer['id:u123'].minutes, 80);
  assert.deepEqual(r.unresolved, [], 'and nothing was orphaned');
  assert.equal(sheet.formationNames['1'], 'Original Name',
    'the historical sheet still reads as it was written');
});

test('RENAME: two fixtures either side of a rename aggregate to ONE player', () => {
  const first  = publish(club(BEFORE), 'fx1', { '1': 'Original Name' });   // published before
  const scAfter = club(AFTER);
  const second = publish(scAfter,      'fx2', { '1': 'Updated Name'  });   // published after

  const r = scAfter.seasonPlayerStats([first, second]);
  assert.equal(r.byPlayer['id:u123'].appearances, 2,
    'two appearances for one person — not one appearance plus one stranger');
  assert.equal(r.byPlayer['id:u123'].starts, 2);
  assert.equal(r.byPlayer['id:u123'].minutes, 160);
  assert.deepEqual(Object.keys(r.byPlayer), ['id:u123']);
  assert.deepEqual(r.unresolved, []);
});

test('RENAME: without the stored key the same sheet would have been orphaned', () => {
  // The defect this build fixes, demonstrated. Same sheet, keys removed.
  const withKeys = publish(club(BEFORE), 'fx1', { '1': 'Original Name' });
  const legacy = { ...withKeys, formationKeys: undefined, benchKeys: undefined };
  const sc = club(AFTER);
  assert.equal(sc.seasonPlayerStats([withKeys]).byPlayer['id:u123'].appearances, 1);
  const orphaned = sc.seasonPlayerStats([legacy]);
  assert.equal(orphaned.byPlayer['id:u123'], undefined);
  assert.deepEqual(orphaned.unresolved, ['Original Name'],
    'left unresolved rather than credited to anyone — safe, but lost');
});

// ── 3. Backward compatibility ────────────────────────────────────────────────

test('a sheet published before this build reads exactly as it always did', () => {
  const sc = club(BEFORE);
  const legacy = { fixtureId: 'fx0', matchMinutes: 80,
                   formationNames: { '1': 'Original Name', '2': 'Other Player' },
                   benchPlayers: [], substitutions: [] };
  const r = sc.seasonPlayerStats([legacy]);
  assert.equal(r.byPlayer['id:u123'].appearances, 1);
  assert.equal(r.byPlayer['id:u999'].appearances, 1);
  assert.deepEqual(r.unresolved, []);
});

test('a legacy name that no longer matches stays unresolved, never guessed', () => {
  const sc = club(AFTER);
  const legacy = { fixtureId: 'fx0', matchMinutes: 80,
                   formationNames: { '1': 'Original Name' }, benchPlayers: [], substitutions: [] };
  const r = sc.seasonPlayerStats([legacy]);
  assert.deepEqual(r.unresolved, ['Original Name']);
  assert.equal(r.byPlayer['id:u123'], undefined, 'not attributed to the renamed player');
  assert.equal(r.byPlayer['id:u999'], undefined, 'and not to anybody else');
});

test('a half-migrated sheet mixes safely: stored keys used, the rest resolved', () => {
  const sc = club(AFTER);
  const mixed = { fixtureId: 'fx1', matchMinutes: 80,
                  formationNames: { '1': 'Original Name', '2': 'Other Player' },
                  formationKeys: { '1': 'id:u123' },          // only one entry has a key
                  benchPlayers: [], benchKeys: [], substitutions: [] };
  const r = sc.seasonPlayerStats([mixed]);
  assert.equal(r.byPlayer['id:u123'].appearances, 1, 'from the stored key');
  assert.equal(r.byPlayer['id:u999'].appearances, 1, 'from resolving the name');
  assert.deepEqual(r.unresolved, []);
});

// ── 4. Two people, one name ──────────────────────────────────────────────────

test('same-name players are never merged, and the sheet records which one', () => {
  const two = [{ id: 'p1', name: 'Sam Jones', userId: 'u1' },
               { id: 'p2', name: 'Sam Jones', userId: 'u2' }];
  const sc = club(two);
  assert.notEqual(sc.playerMatchKey(two[0]), sc.playerMatchKey(two[1]));
  const sheet = publish(sc, 'fx1', { '1': 'Sam Jones' });
  // The sheet names one of them; the stored key says WHICH, permanently.
  assert.equal(sheet.formationKeys['1'], 'id:u1');
  const r = sc.seasonPlayerStats([sheet]);
  assert.equal(r.byPlayer['id:u1'].appearances, 1);
  assert.equal(r.byPlayer['id:u2'], undefined, 'the namesake gets nothing they did not earn');
});

test('a namesake joining LATER cannot claim an earlier sheet', () => {
  // Published when only one Sam Jones existed…
  const sheet = publish(club([{ id: 'p1', name: 'Sam Jones', userId: 'u1' }]), 'fx1', { '1': 'Sam Jones' });
  // …then a second Sam Jones joins.
  const sc = club([{ id: 'p1', name: 'Sam Jones', userId: 'u1' },
                   { id: 'p2', name: 'Sam Jones', userId: 'u2' }]);
  const r = sc.seasonPlayerStats([sheet]);
  assert.equal(r.byPlayer['id:u1'].appearances, 1, 'the stored key settles it');
  assert.equal(r.byPlayer['id:u2'], undefined);
});

// ── 5. Substitutions stay one identity ───────────────────────────────────────

test('substitutions and the sheet agree about who a player is, across a rename', () => {
  const scBefore = club(BEFORE);
  const first = publish(scBefore, 'fx1',
    { '1': 'Original Name', '2': 'Other Player' }, ['Sub One'], {
      substitutions: [{ id: 's1', minute: 50, offKey: 'id:u123', onKey: 'id:u999', at: 'z' }],
    });
  // 'Sub One' is not on this roster, so it stays a name — deliberately.
  const scAfter = club(AFTER);
  const second = publish(scAfter, 'fx2', { '1': 'Updated Name' });

  const r = scAfter.seasonPlayerStats([first, second]);
  const me = r.byPlayer['id:u123'];
  assert.equal(me.appearances, 2, 'one person across both matches');
  assert.equal(me.subsOff, 1, 'the substitution still belongs to them');
  assert.equal(me.minutes, 50 + 80, 'off at 50 in the first, full match in the second');
});

test('a bench player who comes on is the same identity in both structures', () => {
  const sc = club([{ id: 'p1', name: 'Starter', userId: 'u1' },
                   { id: 'p2', name: 'Replacement', userId: 'u2' }]);
  const sheet = publish(sc, 'fx1', { '1': 'Starter' }, ['Replacement'], {
    substitutions: [{ id: 's1', minute: 60, offKey: 'id:u1', onKey: 'id:u2', at: 'z' }],
  });
  assert.equal(sheet.benchKeys[0], 'id:u2', 'the bench entry carries the identity too');
  const r = sc.seasonPlayerStats([sheet]);
  assert.equal(r.byPlayer['id:u2'].subsOn, 1);
  assert.equal(r.byPlayer['id:u2'].minutes, 20);
  assert.equal(r.byPlayer['id:u2'].appearances, 1);
});

// ── 6. The write path ────────────────────────────────────────────────────────

test('publishing sends the keys, and still sends the names', () => {
  const src = extractFn(html, 'syncSquadToServer');
  assert.match(src, /sheetPersonKeys\(formationNames, benchPlayers\)/, 'resolved at publish time');
  assert.match(src, /formationKeys, benchKeys/, 'and sent');
  assert.match(src, /data: \{ \.\.\.mc, formationNames, benchPlayers,/, 'names still sent, untouched');
});

test('resolution happens against this device\'s own club roster only', () => {
  const src = extractFn(html, 'sheetPersonKeys');
  assert.ok(!/teamId|clubId|fetch\(/.test(src), 'it reaches no other club and makes no request');
  assert.ok(!/includes\(|startsWith\(.*name|fuzzy|levenshtein/i.test(src.replace(/startsWith\('nm:'\)/g, '')),
    'and never fuzzy-matches a name');
});

// ── 7. Server validation ─────────────────────────────────────────────────────

const kv = new Map();
const globToRe = p => new RegExp(`^${p.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET') result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const re = at >= 0 ? globToRe(String(args[at + 1])) : null;
    result = ['0', [...kv.keys()].filter(k => !re || re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const store = await import('../api/_identityStore.js');
const { default: publishHandler } = await import('../api/publish.js');
const { SESSION_COOKIE, createSession } = store;

const CLUB = 'club-id', OTHER = 'club-rival';
const SEN = 'grp_sen', U18 = 'grp_u18';
const MEMBERS = [
  { id: 'm-coach', teamId: CLUB,  userId: 'u-coach', role: 'coach',  status: 'active', accessProfile: 'full' },
  { id: 'm-u18',   teamId: CLUB,  userId: 'u-u18c',  role: 'coach',  status: 'active', accessProfile: 'coach',
    accessScope: { clubWide: false, groups: [{ groupId: U18, status: 'active' }], teams: [] } },
  { id: 'm-play',  teamId: CLUB,  userId: 'u-play',  role: 'player', status: 'active' },
  { id: 'm-rival', teamId: OTHER, userId: 'u-rival', role: 'coach',  status: 'active', accessProfile: 'full' },
];
function seed() {
  kv.clear();
  kv.set('app:identity:teams', JSON.stringify([{ id: CLUB, name: 'Club' }, { id: OTHER, name: 'Rival' }]));
  kv.set('app:identity:team_members', JSON.stringify(MEMBERS));
  kv.set('app:identity:users', JSON.stringify(MEMBERS.map(m => ({ id: m.userId, email: `${m.userId}@c.test`, displayName: m.userId }))));
  kv.set(`app:structure:${CLUB}`, JSON.stringify({ version: 1, clubId: CLUB,
    groups: [{ id: SEN, name: 'Seniors', status: 'active' },
             { id: U18, name: 'U18', status: 'active' },
             { id: 'grp_old', name: 'Retired', status: 'archived' }], teams: [] }));
  kv.set(`app:club:${CLUB}`, JSON.stringify({ clubName: 'Club',
    seasonStart: '2020-07-01', seasonEnd: '2099-06-30',
    fixtures: [{ id: 'fx_sen', opposition: 'Mons', date: '2026-08-01', groupId: SEN, status: 'scheduled' },
               { id: 'fx_u18', opposition: 'Kituro', date: '2026-08-01', groupId: U18, status: 'scheduled' }] }));
  kv.set(`app:club:${OTHER}`, JSON.stringify({ clubName: 'Rival', fixtures: [] }));
}
const cookies = new Map();
async function login(userId) {
  const m = MEMBERS.find(x => x.userId === userId);
  const s = await createSession({ userId, teamId: m.teamId, role: m.role });
  cookies.set(userId, `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`);
}
function res() {
  const out = { code: 0, body: null };
  return { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; },
           end() { return this; }, setHeader() {}, get result() { return out; } };
}
async function post(userId, body) {
  const r = res();
  await publishHandler({ method: 'POST', query: {}, headers: { cookie: cookies.get(userId) || '' }, body }, r);
  return r.result;
}
async function getSquad(userId, fixture) {
  const r = res();
  await publishHandler({ method: 'GET', query: { type: 'squad', fixture },
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
async function seasonRead(userId, group) {
  const r = res();
  await publishHandler({ method: 'GET', query: { resource: 'season-sheets', group },
    headers: { cookie: cookies.get(userId) || '' } }, r);
  return r.result;
}
const sheetBody = (fixtureId, extra = {}) => ({
  published: true, opposition: 'Mons', fixtureId,
  formationNames: { '1': 'Original Name' }, benchPlayers: ['Sub One'],
  formationKeys: { '1': 'id:u123' }, benchKeys: ['id:u456'], ...extra });

test('SERVER: the identity fields are stored and read back', async () => {
  seed(); await login('u-coach');
  assert.equal((await post('u-coach', { type: 'squad', data: sheetBody('fx_sen') })).code, 200);
  const back = await getSquad('u-coach', 'fx_sen');
  assert.deepEqual(back.body.squad.formationKeys, { '1': 'id:u123' });
  assert.deepEqual(back.body.squad.benchKeys, ['id:u456']);
  assert.deepEqual(back.body.squad.formationNames, { '1': 'Original Name' }, 'names kept');
});

test('SERVER: only the durable key shape is accepted', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: sheetBody('fx_sen', {
    formationKeys: {
      '1': 'id:u123',                       // valid
      '2': 'nm:some name',                  // an unresolved guess — refused
      '3': '',                              // empty
      '4': 'id:' + 'x'.repeat(200),         // over length
      '5': 'id:has space',                  // illegal character
      '6': { nested: 'object' },            // not a string
      '7': 'DROP TABLE players',            // nonsense
    },
    benchKeys: ['id:u456', 'nm:nope', '', 42, null, { a: 1 }],
  }) });
  const squad = (await getSquad('u-coach', 'fx_sen')).body.squad;
  assert.deepEqual(squad.formationKeys, { '1': 'id:u123' }, 'exactly the one valid key survives');
  assert.deepEqual(squad.benchKeys, ['id:u456', '', '', '', '', ''], 'bench stays positional, invalid blanked');
});

test('SERVER: the identity pass did not loosen the allow-list', async () => {
  seed(); await login('u-coach');
  const r = await post('u-coach', { type: 'squad', data: sheetBody('fx_sen', {
    userId: 'hack', teamId: OTHER, _internal: 1, formationIds: ['x'], personKeys: { a: 'b' },
  }) });
  const keys = Object.keys(r.body.squad).sort();
  assert.deepEqual(keys, [
    'announcement', 'arrivalTime', 'benchKeys', 'benchPlayers', 'competition', 'fixtureId',
    'formationKeys', 'formationNames', 'gamePlan', 'kickoffDate', 'kickoffTime', 'kit',
    'matchMinutes', 'opposition', 'published', 'publishedAt', 'sideId', 'substitutions', 'venue',
  ], 'exactly the two new fields were added, and nothing else survives');
  assert.equal(r.body.squad.userId, undefined);
  assert.equal(r.body.squad.personKeys, undefined);
});

test('SERVER: the keys reach the season read', async () => {
  seed(); await login('u-coach');
  await post('u-coach', { type: 'squad', data: sheetBody('fx_sen') });
  const season = await seasonRead('u-coach', SEN);
  assert.equal(season.code, 200);
  assert.deepEqual(season.body.sheets[0].formationKeys, { '1': 'id:u123' });
  assert.deepEqual(season.body.sheets[0].benchKeys, ['id:u456']);
});

test('SERVER: a sheet stored before this build reads back with empty keys, not an error', async () => {
  seed(); await login('u-coach');
  // Written directly, exactly as an older build would have left it.
  kv.set(`app:publish:${CLUB}:fixture:fx_sen:squad`, JSON.stringify({
    published: true, fixtureId: 'fx_sen', formationNames: { '1': 'Original Name' },
    benchPlayers: [], substitutions: [], matchMinutes: 80 }));
  const season = await seasonRead('u-coach', SEN);
  assert.deepEqual(season.body.sheets[0].formationKeys, {});
  assert.deepEqual(season.body.sheets[0].benchKeys, []);
  assert.deepEqual(season.body.sheets[0].formationNames, { '1': 'Original Name' });
});

// ── 8. Isolation is unchanged ────────────────────────────────────────────────

test('SERVER: publishing still enforces tenant, group and fixture checks', async () => {
  seed(); await login('u-coach'); await login('u-u18c'); await login('u-play'); await login('u-rival');

  const rival = await post('u-rival', { type: 'squad', data: sheetBody('fx_sen') });
  assert.ok(rival.code >= 400, 'another club cannot publish to our fixture');

  const player = await post('u-play', { type: 'squad', data: sheetBody('fx_sen') });
  assert.ok(player.code >= 400, 'a player cannot publish at all');

  const forgedFixture = await post('u-coach', { type: 'squad', data: sheetBody('fx_nonexistent') });
  assert.ok(forgedFixture.code >= 400, 'an unknown fixture is refused');
});

test('SERVER: a scoped coach still cannot read another group\'s season', async () => {
  seed(); await login('u-coach'); await login('u-u18c');
  await post('u-coach', { type: 'squad', data: sheetBody('fx_sen') });
  assert.equal((await seasonRead('u-u18c', SEN)).code, 403, 'Seniors refused');
  assert.equal((await seasonRead('u-u18c', U18)).code, 200, 'their own group is fine');
  assert.ok(!JSON.stringify((await seasonRead('u-u18c', U18)).body).includes('id:u123'),
    'and carries none of the Seniors identities');
});

test('SERVER: an archived group is not a valid destination', async () => {
  seed(); await login('u-coach');
  assert.equal((await seasonRead('u-coach', 'grp_old')).code, 400, 'archived groups are refused');
  assert.equal((await seasonRead('u-coach', 'grp_forged')).code, 404, 'and unknown ones too');
});

test('SERVER: it is still the session that names the club', async () => {
  seed(); await login('u-rival');
  const r = await seasonRead('u-rival', SEN);
  assert.ok(r.code >= 400);
  assert.ok(!JSON.stringify(r.body || {}).includes('id:u123'));
});

// ── 9. Nothing protected moved ───────────────────────────────────────────────

test('the season aggregation prefers the stored key and falls back to the name', () => {
  const src = extractFn(html, 'seasonPlayerStats');
  assert.match(src, /String\(stored \|\| ''\)\.trim\(\) \|\| mcPersonKey\(clean\)/,
    'stored identity first, name resolution second');
  assert.match(src, /formationKeys\[slot\]/);
  assert.match(src, /benchKeys\[i\]/);
});

test('the per-match list uses the stored identity too, not just the counts', () => {
  // appearancesCalculated delegates its COUNTS to seasonPlayerStats but builds
  // its own per-match playerIds list. If that list drifted back to resolving
  // names, a renamed player's match breakdown would disagree with their own
  // appearance total inside the same result.
  const sheet = publish(club(BEFORE), 'fx1', { '1': 'Original Name' });
  const sc = new Function(`
    "use strict";
    const state = { players: ${JSON.stringify(AFTER)} };
    function findPlayerByName(n) { const w = String(n || '').trim().toLowerCase();
      return state.players.find(p => String(p.name || '').trim().toLowerCase() === w) || null; }
    ${extractConst(html, 'MATCH_MINUTES_DEFAULT')}
    ${extractFn(html, 'playerMatchKey')}
    ${extractFn(html, 'mcPersonKey')}
    ${extractFn(html, 'matchMinuteValue')}
    ${extractFn(html, 'fixtureHasBeenPlayed')}
    ${extractFn(html, 'appearanceSeasonId')}
    ${extractFn(html, 'seasonPlayerStats')}
    ${extractFn(html, 'appearancesCalculated')}
    return appearancesCalculated;
  `)();
  const fixtures = [{ id: 'fx1', opposition: 'Mons', date: '2020-01-01', status: 'completed' }];
  const out = sc(fixtures, [sheet], '2019-08-01', '2100-05-31');
  assert.equal(out.byPlayer['id:u123'], 1, 'counted under the durable identity');
  assert.deepEqual(out.matches[0].playerIds, ['id:u123'],
    'and listed under it too — the two halves of one result must agree');
  assert.deepEqual(out.unresolved, []);
});

test('SERVER: the number of stored identities is bounded', async () => {
  seed(); await login('u-coach');
  const many = {};
  for (let i = 0; i < 500; i++) many[String(i)] = 'id:u' + i;
  await post('u-coach', { type: 'squad', data: sheetBody('fx_sen', {
    formationKeys: many,
    benchKeys: Array.from({ length: 500 }, (_, i) => 'id:b' + i),
  }) });
  const squad = (await getSquad('u-coach', 'fx_sen')).body.squad;
  assert.ok(Object.keys(squad.formationKeys).length <= 30, 'starters capped, never unbounded');
  assert.ok(squad.benchKeys.length <= 30, 'bench capped too');
});

test('existing behaviour and previous builds are intact', () => {
  for (const name of ['matchMinutesByPerson', 'substitutionAdd', 'mcPersonKey', 'playerMatchKey',
                      'fixtureHasBeenPlayed', 'operationalPlayers', 'playerGroupIdOf',
                      'appearanceAdjustmentsFor', 'overviewRoster', 'setAppearance']) {
    assert.ok(html.includes(`function ${name}(`), `${name} must still exist`);
  }
  // The sheet's names are never replaced by keys anywhere.
  const sync = extractFn(html, 'syncSquadToServer');
  assert.match(sync, /formationNames, benchPlayers,/, 'names still published');
});

test('no migration of historical data exists anywhere in this build', () => {
  for (const name of ['sheetPersonKeys', 'syncSquadToServer', 'seasonPlayerStats']) {
    const src = extractFn(html, name);
    assert.ok(!/backfill|migrat|rewrite|repair/i.test(src), `${name} must not migrate anything`);
  }
});
