/**
 * PLAYER HOME — GROUP ISOLATION.
 *
 * Production regression: a U18 player whose portal header correctly read
 * "PLAYER PORTAL — U18 TEAM" was shown the SENIORS fixture ("NEXT FIXTURE
 * vs Mons"), and Coming Up listed every group's fixtures.
 *
 * Root cause: renderPlayerHome passed the RAW whole-club `state.fixtures`
 * into playerPortalNextFixture and playerPortalUpcomingEvents. Those helpers
 * are pure and group-blind by design — the caller owns the boundary — and the
 * scoped resolver (playerContextFixtures) existed but was not used here. That
 * resolver also failed OPEN: with no resolved player group it returned the
 * whole club.
 *
 * Contract pinned here: every fixture-derived Player Home card reads
 * playerContextFixtures(); the player's group comes from the server-resolved
 * membership context; an unresolved group in a GROUPED club shows nothing
 * group-specific (never Seniors); a genuinely pre-group club is unaffected;
 * and an identity switch cannot inherit the previous person's group.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const m = src.match(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  if (!m) throw new Error(`function ${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { i = b; break; } }
  }
  return src.slice(start, i + 1);
}

const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', U16 = 'grp_402a580b', WOM = 'grp_1b0fb56b';
const FIXTURES = [
  { id: 'fx_sen', opposition: 'Mons',              date: '2026-09-01', groupId: '' },   // legacy = initial/Seniors
  { id: 'fx_u18', opposition: 'U18 Opponent',      date: '2026-09-02', groupId: U18 },
  { id: 'fx_u16', opposition: 'U16 Opponent',      date: '2026-09-03', groupId: U16 },
  { id: 'fx_wom', opposition: "Women's Opponent",  date: '2026-09-04', groupId: WOM },
];
const SCHEDULE = [{ id: 's1', type: 'Training', title: 'Team training', date: '2026-08-30' }];

/** Drive the REAL Player Home data resolution for one player context. */
function home({ playerGroup, fixtures = FIXTURES, operationalGroupId = null, coachGroup = null }) {
  const op = playerGroup === undefined ? 'null'
    : JSON.stringify({ player: { groups: playerGroup ? [{ id: playerGroup }] : [] },
                       staff: { groups: coachGroup ? [{ id: coachGroup }] : [] } });
  return new Function(`
    "use strict";
    const CE_INITIAL_GROUP_ID = ${JSON.stringify(SEN)};
    const state = { fixtures: ${JSON.stringify(fixtures)}, schedule: ${JSON.stringify(SCHEDULE)},
      operationalGroupId: ${JSON.stringify(operationalGroupId)} };
    const _myOperational = ${op};
    ${fn('fixtureBelongsToGroup')}
    ${fn('playerContextFixtures')}
    ${fn('playerPortalNextFixture')}
    ${fn('playerPortalNextTraining')}
    ${fn('playerPortalUpcomingEvents')}
    const my = playerContextFixtures();
    const nextFx = playerPortalNextFixture(my, '2026-08-22');
    return {
      nextFixture: nextFx ? nextFx.opposition : null,
      comingUp: playerPortalUpcomingEvents(my, state.schedule, '2026-08-22', 5)
        .filter(e => e.type === 'fixture').map(e => e.title),
      nextTraining: (playerPortalNextTraining(state.schedule, '2026-08-22') || {}).title || null,
      pool: my.map(f => f.opposition),
    };
  `)();
}

// ─── 1–6: the four-group matrix ────────────────────────────────────────────
test('1+2+3+4+5+6: every group sees ONLY its own fixture in Next fixture and Coming Up', () => {
  const matrix = [
    [SEN, 'Mons'], [U18, 'U18 Opponent'], [U16, 'U16 Opponent'], [WOM, "Women's Opponent"],
  ];
  for (const [group, expected] of matrix) {
    const h = home({ playerGroup: group });
    assert.equal(h.nextFixture, expected, `${group} Next fixture`);
    assert.deepEqual(h.comingUp, [`vs ${expected}`], `${group} Coming Up`);
    assert.deepEqual(h.pool, [expected], `${group} fixture pool`);
  }
  // The reported symptom, stated directly.
  assert.notEqual(home({ playerGroup: U18 }).nextFixture, 'Mons',
    'a U18 player is never shown the Seniors fixture');
});

test('legacy unscoped fixtures belong to the initial group — Seniors keeps "vs Mons"', () => {
  assert.equal(home({ playerGroup: SEN }).nextFixture, 'Mons');
  for (const g of [U18, U16, WOM]) {
    assert.equal(home({ playerGroup: g }).comingUp.includes('vs Mons'), false, `${g} never inherits the legacy fixture`);
  }
});

// ─── 11+12+13: fail closed ─────────────────────────────────────────────────
test('11+12+13: an unresolved player group in a GROUPED club shows nothing group-specific', () => {
  for (const [label, ctx] of [
    ['missing group', { playerGroup: '' }],
    ['context not loaded', { playerGroup: undefined }],
    ['invalid group id', { playerGroup: 'grp_does_not_exist' }],
  ]) {
    const h = home(ctx);
    assert.deepEqual(h.comingUp, [], `${label}: Coming Up empty`);
    assert.equal(h.nextFixture, null, `${label}: no Next fixture`);
    assert.equal(h.pool.includes('Mons'), false, `${label}: never falls back to Seniors`);
  }
});

test('a genuinely pre-group club is unaffected — no grouped fixtures means the old full list', () => {
  const legacyOnly = [{ id: 'a', opposition: 'Mons', date: '2026-09-01', groupId: '' },
                      { id: 'b', opposition: 'Kituro', date: '2026-09-08' }];
  const h = home({ playerGroup: '', fixtures: legacyOnly });
  assert.deepEqual(h.pool, ['Mons', 'Kituro'], 'legacy clubs keep working');
});

// ─── 16+17: authority ──────────────────────────────────────────────────────
test('16: the active COACH group cannot influence Player Home', () => {
  const h = home({ playerGroup: U18, operationalGroupId: SEN, coachGroup: SEN });
  assert.equal(h.nextFixture, 'U18 Opponent', 'the player group decides, not the coach context');
  assert.deepEqual(h.comingUp, ['vs U18 Opponent']);
});

test('17: identity comes from the server-resolved membership context, never a label or name', () => {
  const resolver = fn('playerContextFixtures');
  assert.match(resolver, /_myOperational\?\.player\?\.groups\?\.\[0\]\?\.id/,
    'group read from the server-resolved player context');
  // `f.opposition` appears only as a completeness filter (a fixture with no
  // opponent is not a fixture); the GROUP itself is never inferred from a
  // name, label, team title or roster position.
  assert.doesNotMatch(resolver, /teamName|clubName|players\[0\]|\.name\b/, 'the group is never inferred from a label or name');
  assert.match(resolver, /filter\(f => f\.opposition\)/, 'opposition is used only to drop incomplete fixtures');
  assert.match(resolver, /clubIsGrouped \? \[\] : rows/, 'fails closed in a grouped club');
});

test('Player Home reads the SCOPED list for every fixture-derived card', () => {
  const render = fn('renderPlayerHome');
  assert.match(render, /const myFixtures\s+= playerContextFixtures\(\);/, 'one scoped source');
  assert.match(render, /playerPortalNextFixture\(myFixtures, today\)/, 'Next fixture scoped');
  assert.match(render, /playerPortalUpcomingEvents\(myFixtures, state\.schedule, today, 5\)/, 'Coming Up scoped');
  assert.doesNotMatch(render, /playerPortal\w+\(state\.fixtures/, 'the raw whole-club array is never passed again');
});

// ─── 7+8+9+10: the other cards ─────────────────────────────────────────────
test('7: Next training is group-resolved by the SERVER, not filtered client-side', () => {
  // state.schedule for a player is the session list the server returns for
  // THEIR membership group (trainingViewGroup → resolvePlayerGroup), so the
  // client must not invent a second filter. Pinned so it stays that way.
  assert.match(fn('trainingGroupParam'), /state\.activeView === 'player'/,
    'player requests never name a group — the server derives it');
  const h = home({ playerGroup: U18 });
  assert.equal(h.nextTraining, 'Team training', 'the served schedule renders unchanged');
});

test('8+9+10: availability, squad status and announcements read per-player/published sources only', () => {
  // Availability answers are read off the player's OWN record by session key.
  assert.match(fn('playerPortalAvailabilityStatus'), /player\[key\]/, 'availability is the player\'s own answer');
  assert.doesNotMatch(fn('playerPortalAvailabilityStatus'), /state\.fixtures|groupId/, 'no cross-group source');
  // Squad status reads PUBLISHED selections for this player's name only.
  assert.match(fn('playerPortalSquadStatus'), /status === 'published'/, 'only published squads');
  // Announcements come from the player-visible announcement list.
  assert.match(fn('renderPlayerHome'), /playerPortalRecentAnnouncement\(state\.announcements\)/, 'unchanged source');
});

// ─── 14+15: identity switch ────────────────────────────────────────────────
test('14+15: an identity switch cannot inherit the previous person\'s group', () => {
  const reset = fn('resetIdentityScopedState');
  assert.match(reset, /_myOperational = null;/, 'the operational context is cleared');
  assert.match(reset, /state\.operationalGroupId = null;/, 'and the derived group with it');
  // With the context cleared, the very next render fails closed rather than
  // showing the outgoing identity's group.
  const during = home({ playerGroup: undefined });
  assert.deepEqual(during.comingUp, [], 'nothing group-specific during the switch window');
  assert.equal(during.nextFixture, null);
});

// ─── 18+19+20: nothing else moved ──────────────────────────────────────────
test('18: the coach fixture context is untouched', () => {
  const coach = fn('contextFixtures');
  assert.match(coach, /state\.operationalGroupId/, 'coach still resolves by operating group');
  assert.match(coach, /if \(!gid \|\| !operationalGroups\(\)\.length\) return state\.fixtures \|\| \[\];/,
    'coach behaviour byte-identical');
});

test('19+20: Performance/SC8 entitlement and commercial flags are untouched', () => {
  assert.match(src, /minimumPlan: 'pro',\s*\n\s*category: 'player_development'/, 'Performance still Pro-gated');
  assert.match(src, /const BETA_HIDE_COMMERCIAL = true;/, 'commercial hiding unchanged');
  assert.match(src, /if \(!canUseFeature\('performance'\)\)/, 'the mandatory render gate remains');
});
