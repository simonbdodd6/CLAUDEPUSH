/**
 * INT2 — structured group development category (Core) → SC5 (Performance).
 *
 * The category is a CONTROLLED VOCABULARY on the authoritative group record.
 * It is never derived from a group's display name, 'unknown' is restrictive
 * rather than permissive, and an athlete's own age evidence still outranks it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.devcategory.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';

const kv = new Map();
let writes = [];
globalThis.fetch = async (_url, options = {}) => {
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); writes.push(args[0]); result = 'OK'; }
  if (command === 'SCAN') result = ['0', [...kv.keys()]];
  return { ok: true, json: async () => ({ result }) };
};

const {
  loadClubStructure, persistClubStructure, saveClubStructure, synthesizeInitialStructure,
  createGroup, setGroupDevelopmentCategory, groupById,
  DEVELOPMENT_CATEGORIES, DEFAULT_DEVELOPMENT_CATEGORY, INITIAL_GROUP_ID,
} = await import('../api/_structureStore.js');
const { resolveDevelopmentContext } = await import('../performance/domain/development-context.js');
const { TEAM_DEVELOPMENT_CATEGORIES } = await import('../performance/types/coaching.js');

const CLUB = 'club-dev-cat';
const seedClub = () => kv.set('app:identity:teams', JSON.stringify([
  { id: CLUB, name: 'Test RFC', teamName: 'Seniors', teamCode: 'TEST42' },
]));
const reset = () => { kv.clear(); writes = []; seedClub(); };

// ── Vocabulary ──────────────────────────────────────────────────────────────

test('1. one canonical vocabulary, shared by Core and the Performance engine', () => {
  assert.deepEqual(DEVELOPMENT_CATEGORIES, ['youth_u16', 'youth_u18', 'adult', 'mixed_open', 'unknown']);
  assert.deepEqual([...TEAM_DEVELOPMENT_CATEGORIES].sort(), [...DEVELOPMENT_CATEGORIES].sort(),
    'Core and SC5 must not drift apart');
  assert.equal(DEFAULT_DEVELOPMENT_CATEGORY, 'unknown');
});

// ── Server normalization & migration ────────────────────────────────────────

test('2. a pre-existing group without the field reads back as unknown — no write', async () => {
  reset();
  kv.set(`app:structure:${CLUB}`, JSON.stringify({
    version: 1, clubId: CLUB,
    groups: [{ id: 'grp_legacy', name: 'U18', type: 'general', status: 'active' }],
    teams: [{ id: 'team_legacy', groupId: 'grp_legacy', name: 'U18 A', status: 'active' }],
  }));
  writes = [];
  const structure = await loadClubStructure(CLUB);
  assert.equal(groupById(structure, 'grp_legacy').developmentCategory, 'unknown',
    'read-time normalization is the migration');
  assert.deepEqual(writes, [], 'reads never mutate production data');
});

test('3. a synthesized initial group is classified unknown', async () => {
  reset();
  const structure = await loadClubStructure(CLUB);
  assert.equal(groupById(structure, INITIAL_GROUP_ID).developmentCategory, 'unknown');
  assert.equal(synthesizeInitialStructure(CLUB).groups[0].developmentCategory, 'unknown');
});

test('4. garbage in stored data normalises to unknown, never to a permissive value', async () => {
  reset();
  for (const bad of ['adult ', 'U18', 'senior', 'youth', 42, null, {}, 'ADULT']) {
    kv.set(`app:structure:${CLUB}`, JSON.stringify({
      version: 1, clubId: CLUB,
      groups: [{ id: 'g1', name: 'Squad', developmentCategory: bad, status: 'active' }], teams: [],
    }));
    const structure = await loadClubStructure(CLUB);
    assert.equal(groupById(structure, 'g1').developmentCategory, 'unknown', JSON.stringify(bad));
  }
});

test('5. new groups default to unknown and accept a valid category', async () => {
  reset();
  await persistClubStructure(CLUB);
  const { group } = await createGroup(CLUB, { name: 'Colts' });
  assert.equal(group.developmentCategory, 'unknown');
  const { group: u16 } = await createGroup(CLUB, { name: 'Juniors', developmentCategory: 'youth_u16' });
  assert.equal(u16.developmentCategory, 'youth_u16');
});

test('6. the mutator validates: an unknown code is refused, not silently stored', async () => {
  reset();
  await persistClubStructure(CLUB);
  const { group } = await createGroup(CLUB, { name: 'Senior Men' });
  const { group: updated } = await setGroupDevelopmentCategory(CLUB, group.id, 'adult');
  assert.equal(updated.developmentCategory, 'adult');
  await assert.rejects(() => setGroupDevelopmentCategory(CLUB, group.id, 'u18'), /Unknown development category/);
  await assert.rejects(() => setGroupDevelopmentCategory(CLUB, group.id, 'ADULT'), /Unknown development category/);
  await assert.rejects(() => setGroupDevelopmentCategory(CLUB, 'grp_nope', 'adult'), /Unknown group/);
  const after = await loadClubStructure(CLUB);
  assert.equal(groupById(after, group.id).developmentCategory, 'adult', 'a rejected write changes nothing');
});

test('7. the classification survives a persist round-trip and touches nothing else', async () => {
  reset();
  await persistClubStructure(CLUB);
  const { group } = await createGroup(CLUB, { name: 'U18', developmentCategory: 'youth_u18' });
  const before = await loadClubStructure(CLUB);
  await saveClubStructure(CLUB, before);
  const after = await loadClubStructure(CLUB);
  assert.equal(groupById(after, group.id).developmentCategory, 'youth_u18');
  assert.equal(groupById(after, group.id).name, 'U18');
  assert.equal(groupById(after, group.id).status, 'active');
  assert.equal(after.teams.length, before.teams.length, 'team semantics untouched');
});

// ── Server surface & projection ─────────────────────────────────────────────

test('8. the op is club-administration: same gate, same audit, controlled input', async () => {
  const publish = await readFile(new URL('../api/publish.js', import.meta.url), 'utf8');
  assert.match(publish, /op === 'set_group_development_category'/);
  assert.match(publish, /setGroupDevelopmentCategory\(session\.teamId, b\.groupId, b\.developmentCategory\)/);
  const post = publish.slice(publish.indexOf("const op = String(req.body?.op"));
  assert.match(post.slice(0, 2000), /Unknown structure operation/,
    'the op list stays a closed set — anything else is refused');
  assert.match(publish, /requireClubManage\(req, PERM\.MANAGE_TEAMS\)/);
  assert.match(publish, /auditLog\('club_structure_changed'[\s\S]{0,320}developmentCategory/);
});

test('9. the session projection carries the classification, not athlete data', async () => {
  const store = await readFile(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
  assert.match(store, /groups: groups\.map\(g => \(\{ id: g\.id, name: g\.name, developmentCategory: g\.developmentCategory \|\| 'unknown' \}\)\)/);
});

// ── SC5 scenarios A-E ───────────────────────────────────────────────────────

const ctx = (ageBand, teamCategory) => resolveDevelopmentContext({ ageBand, teamCategory, now: new Date('2026-08-21') });

test('A. athlete evidence U18 + group adult → U18 safeguards remain active', () => {
  const r = ctx('16_17', 'adult');
  assert.equal(r.context, 'youth_u18');
  assert.equal(r.safeguardsActive, true);
  assert.equal(r.source, 'age_band', 'athlete evidence wins');
  assert.ok(r.conflicts.includes('youth_age_in_senior_team'), 'the mismatch is surfaced, not silently resolved');
});

test('B. athlete evidence adult + group accidentally youth_u18 → not turned into a youth athlete', () => {
  const r = ctx('21_29', 'youth_u18');
  assert.equal(r.context, 'adult');
  assert.equal(r.safeguardsActive, false);
  assert.equal(r.source, 'age_band');
  assert.ok(r.conflicts.includes('adult_in_youth_team'), 'flagged for a human, not obeyed');
});

test('C. no athlete evidence + group youth_u16 → youth context applies conservatively', () => {
  const r = ctx(null, 'youth_u16');
  assert.equal(r.context, 'youth_u16');
  assert.equal(r.safeguardsActive, true);
  assert.equal(r.source, 'team_category');
  assert.ok(r.flags.includes('missing_development_context'), 'still asks for real evidence');
});

test('D. no athlete evidence + group unknown → adult programming stays locked', () => {
  const r = ctx(null, 'unknown');
  assert.equal(r.context, 'unknown');
  assert.equal(r.safeguardsActive, true, 'unknown is restrictive, never permissive');
  assert.notEqual(r.context, 'adult');
  // and an adult/mixed group label alone must not unlock it either
  for (const cat of ['adult', 'mixed_open']) {
    const s = ctx(null, cat);
    assert.equal(s.context, 'unknown', cat + ' alone cannot unlock adult programming');
    assert.equal(s.safeguardsActive, true);
  }
});

test('E. a group NAMED "U18" but classified unknown is ignored programmatically', async () => {
  reset();
  await persistClubStructure(CLUB);
  const { group } = await createGroup(CLUB, { name: 'U18' });          // name says U18
  assert.equal(group.developmentCategory, 'unknown');                   // classification does not
  const r = ctx(null, group.developmentCategory);
  assert.equal(r.context, 'unknown', 'the display name carries no programmatic weight');
  assert.equal(r.source, 'none');
  // Nothing in either layer parses names for age.
  const storeSrc = await readFile(new URL('../api/_structureStore.js', import.meta.url), 'utf8');
  assert.ok(!/name.*match\(.*[Uu]1[68]|includes\('U1[68]'\)/.test(storeSrc), 'no name parsing on the server');
  const sc5 = await readFile(new URL('../performance/domain/development-context.js', import.meta.url), 'utf8');
  assert.ok(!/includes\('U1[68]'\)|\/u1[68]\//i.test(sc5), 'no name parsing in the engine');
});

// ── Client seam ─────────────────────────────────────────────────────────────

test('10. the client reads the stored classification, never the group name', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const fn = html.slice(html.indexOf('function perfTeamDevelopmentCategory'));
  const body = fn.slice(0, fn.indexOf('\n    }') + 6);
  assert.match(body, /g\?\.developmentCategory \|\| 'unknown'/);
  assert.ok(!/\.name/.test(body), 'the group NAME is never consulted');
  assert.match(html, /teamCategory: perfTeamDevelopmentCategory\(\)/, 'fed into the SC5 resolver');
  assert.match(html, /resolveDevelopmentContext\(\{/);
});

test('11. friendly labels in the admin UI, canonical codes on the wire', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /unknown:\s*'Not set'/);
  assert.match(html, /youth_u16:\s*'Youth under 16'/);
  assert.match(html, /youth_u18:\s*'Youth under 18'/);
  assert.match(html, /adult:\s*'Adult \/ Senior'/);
  assert.match(html, /mixed_open:\s*'Mixed \/ Open'/);
  assert.match(html, /structureOp\('set_group_development_category',\s*\n?\s*\{ groupId, developmentCategory: value \}/,
    'the canonical code is what reaches the server');
});
