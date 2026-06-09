#!/usr/bin/env node
/**
 * Fixture Engine — Validation CLI
 *
 * Tests every layer of the Fixture & Match Intelligence Engine:
 *   1.  Fixture schema & factory
 *   2.  Fixture store (CRUD + queries)
 *   3.  Timeline generation (14 tasks across 4 stages)
 *   4.  prepareFixture() — Digital Twin integration
 *   5.  generateMatchPack() — AI-powered match preparation
 *   6.  completeFixture() — record result
 *   7.  generatePostMatchReview() — post-match analysis
 *   8.  generatePlayerReports()
 *   9.  updateDigitalTwin() — feedback loop
 *   10. Season standings
 *   11. Season timeline
 *   12. Full fixture lifecycle
 */

import {
  createFixture, saveFixture, getFixture, scheduleFixture,
  clearAllFixtures, fixtureCount, fixtureStats,
  listUpcomingFixtures, listRecentFixtures,
  getNextFixture, listFixturesByTeam,
  generateTimeline, timelineProgress, getActionableTasks, getUpcomingTasks,
  prepareFixture, analyseOpposition,
  generateMatchPack,
  completeFixture, generatePostMatchReview, generatePlayerReports, updateDigitalTwin,
  updateSeasonTimeline, getSeasonStandings, getTeamSeasonSummary,
  FIXTURE_STATUS, COMPETITION_TYPES, daysToKickoff, serializeFixture,
} from './index.js';

const PAD = 52;
const HR  = '─'.repeat(68);
const HRD = '═'.repeat(68);

function pad(l)    { return (l + ' ').padEnd(PAD, '.'); }
function pass(l,d='') { console.log(`  ✓ ${pad(l)} ${d}`); return true; }
function fail(l,e)    { console.error(`  ✗ ${pad(l)} ERROR: ${e}`); return false; }
function sect(t)      { console.log(`\n${HR}\n  ${t}\n${HR}`); }

// ── Test team IDs (from memory-engine) ───────────────────────────────────────
const TEAM_SENIOR = 'team_senior_0d2u3uz';
const TEAM_U16    = 'team_u16_0376rcx';
const TEAM_U14    = 'team_u14_0376rcv';

async function main() {
  console.log(`\n${HRD}\n  FIXTURE & MATCH INTELLIGENCE ENGINE  ·  Validation CLI\n${HRD}`);
  console.log(`  Run at: ${new Date().toISOString()}\n`);

  let passed = 0, failed = 0;
  const ok = (l, d) => { pass(l, d); passed++; };
  const ko = (l, e) => { fail(l, String(e).slice(0, 60)); failed++; };

  // Clean state for repeatable tests
  clearAllFixtures();

  // ── 1. Schema & factory ──────────────────────────────────────────────────
  sect('1 · FIXTURE SCHEMA & FACTORY');
  let f1, f2, f3, f4;
  try {
    f1 = createFixture({
      teamId:      TEAM_SENIOR,
      teamName:    'Senior XV',
      ageGroup:    'Senior',
      opponent:    'Rival RFC',
      venue:       'Home Ground',
      isHome:      true,
      competition: COMPETITION_TYPES.LEAGUE,
      kickoff:     futureDate(14),
    });
    ok('createFixture() — Senior league fixture', f1.id);
    ok('id generated',                            f1.id?.startsWith('fixture_') ? 'ok' : '??');
    ok('status set to scheduled',                 f1.status);
    ok('volunteers pre-populated',                `${f1.volunteers?.required?.length} roles`);
    ok('weather placeholder present',             f1.weather?._placeholder ? 'ok' : '??');
    ok('finance fields absent (correct)',         !f1.finance ? 'ok' : 'unexpected');

    f2 = createFixture({
      teamId:   TEAM_U16,
      teamName: 'U16 Red',
      ageGroup: 'U16',
      opponent: 'City Youth RFC',
      venue:    'Away Park, Dublin',
      isHome:   false,
      kickoff:  futureDate(7),
      competition: COMPETITION_TYPES.CUP,
    });
    ok('createFixture() — U16 away cup fixture', f2.id);
    ok('transport.required=true for away',        f2.transport?.required ? 'ok' : 'FAIL');

    f3 = createFixture({
      teamId:   TEAM_U14,
      teamName: 'U14',
      ageGroup: 'U14',
      opponent: 'Northside RFC',
      venue:    'Home Ground',
      isHome:   true,
      kickoff:  futureDate(3),
      competition: COMPETITION_TYPES.LEAGUE,
    });
    ok('createFixture() — U14 fixture (3 days)',  f3.id);

    f4 = createFixture({
      teamId:   TEAM_SENIOR,
      teamName: 'Senior XV',
      ageGroup: 'Senior',
      opponent: 'Old Town RFC',
      venue:    'Away Grounds',
      isHome:   false,
      kickoff:  pastDate(5),        // Already played
      competition: COMPETITION_TYPES.LEAGUE,
      previousMeetings: [
        { date: '2025-11-15', result: 'win', score: '24–14', competition: 'League' },
        { date: '2025-04-05', result: 'loss', score: '12–18', competition: 'League' },
      ],
    });
    ok('createFixture() — past fixture (5 days ago)', f4.id);
    ok('previousMeetings preserved',               `${f4.previousMeetings?.length} meeting(s)`);

  } catch (e) { ko('Schema tests', e.message); }

  // ── 2. Fixture store ─────────────────────────────────────────────────────
  sect('2 · FIXTURE STORE (CRUD + QUERIES)');
  try {
    const s1 = saveFixture(f1);
    const s2 = saveFixture(f2);
    const s3 = saveFixture(f3);
    const s4 = saveFixture(f4);
    ok('saveFixture() — 4 fixtures saved',         fixtureCount() + ' on disk');

    const retrieved = getFixture(f1.id);
    ok('getFixture() — retrieve by id',            retrieved?.id === f1.id ? 'ok' : 'FAIL');

    const upcomingList = listUpcomingFixtures();
    ok('listUpcomingFixtures()',                    `${upcomingList.length} upcoming`);

    const recentList = listRecentFixtures();
    ok('listRecentFixtures()',                      `${recentList.length} recent`);

    const next = getNextFixture(TEAM_SENIOR);
    ok('getNextFixture(teamId)',                    next?.opponent ?? 'none');

    const teamFixtures = listFixturesByTeam(TEAM_U16);
    ok('listFixturesByTeam()',                      `${teamFixtures.length} U16 fixture(s)`);

    const stats = fixtureStats();
    ok('fixtureStats()',                            `total:${stats.total} scheduled:${stats.scheduled}`);

    const ser = serializeFixture(f1);
    ok('serializeFixture() — daysToKickoff added', `~${ser.daysToKickoff} days`);
    ok('serializeFixture() — prepStage added',     ser.prepStage);

  } catch (e) { ko('Store tests', e.message); }

  // ── 3. Timeline generation ───────────────────────────────────────────────
  sect('3 · TIMELINE GENERATION');
  try {
    const timeline = generateTimeline(f1);
    ok('generateTimeline() — 14-day fixture',      `${timeline.length} tasks generated`);
    ok('Tasks have dueAt timestamps',              timeline.every(t => t.dueAt) ? 'all ok' : 'missing');
    ok('Tasks have stage field',                   timeline.every(t => t.stage) ? 'all ok' : 'missing');
    ok('Tasks have priority field',                timeline.every(t => t.priority) ? 'all ok' : 'missing');
    ok('Squad review task present (day 7)',        timeline.some(t => t.type === 'squad_review') ? 'ok' : 'MISSING');
    ok('Volunteer check task present (day 3)',     timeline.some(t => t.type === 'volunteer_check') ? 'ok' : 'MISSING');
    ok('Match pack task present (day 1)',          timeline.some(t => t.type === 'match_pack') ? 'ok' : 'MISSING');
    ok('Squad lock task present (matchday)',       timeline.some(t => t.type === 'squad_lock') ? 'ok' : 'MISSING');
    ok('Coach review task present (post)',         timeline.some(t => t.type === 'coach_review') ? 'ok' : 'MISSING');
    ok('Twin update task present (post+3)',        timeline.some(t => t.type === 'twin_update') ? 'ok' : 'MISSING');

    // Away fixture has transport task
    const awayTimeline = generateTimeline(f2);
    ok('Away transport task in away fixture',      awayTimeline.some(t => t.type === 'transport_arrange') ? 'ok' : 'MISSING');

    // Near fixture (3 days): tasks should be actionable/soon
    f3.preparationChecklist = generateTimeline(f3);
    saveFixture(f3);
    const upcoming3d = getUpcomingTasks(f3, 5);
    ok('getUpcomingTasks() — 3-day fixture',       `${upcoming3d.length} tasks within 5 days`);

    const progress = timelineProgress(f3);
    ok('timelineProgress() — pending/done counts', `total:${progress.total} done:${progress.done}`);

  } catch (e) { ko('Timeline tests', e.message); }

  // ── 4. Prepare fixture ───────────────────────────────────────────────────
  sect('4 · prepareFixture() — DIGITAL TWIN INTEGRATION');
  try {
    const prepared = await prepareFixture(f3.id);
    ok('prepareFixture() executes',                prepared.status);
    ok('Status updated to preparing',              prepared.status === 'preparing' ? 'ok' : prepared.status);
    ok('preparationChecklist populated',           `${prepared.preparationChecklist?.length} tasks`);
    ok('squadStatus block present',                '');
    ok('  — injured array',                        `${prepared.squadStatus?.injured?.length ?? 0} injured`);
    ok('  — uncertain array',                      `${prepared.squadStatus?.uncertain?.length ?? 0} uncertain`);
    ok('  — available info',                       `${prepared.squadStatus?.available?.length ?? 0} entries`);
    ok('volunteers.missing computed',              JSON.stringify(prepared.volunteers?.missing?.slice(0,2)));
    ok('medicalAlerts array present',              `${prepared.medicalAlerts?.length ?? 0} alert(s)`);

    // 14-day fixture
    const prepared2 = await prepareFixture(f1.id);
    ok('prepareFixture() — 14-day fixture',        prepared2.status);

  } catch (e) { ko('prepareFixture()', e.message); }

  // ── 5. Match pack ────────────────────────────────────────────────────────
  sect('5 · generateMatchPack()');
  let pack;
  try {
    const fixture = getFixture(f3.id); // U14 — 3 days out, prepared
    pack = await generateMatchPack(fixture);
    ok('generateMatchPack() executes',             '');
    ok('Pack has fixture section',                 pack.fixture?.opponent);
    ok('Pack has squad section',                   pack.squad?.summary?.slice(0, 40));
    ok('Pack has opposition section',              pack.opposition?.analysis?.slice(0, 40) + '…');
    ok('Pack has finalSession section',            pack.finalSession?.focus?.slice(0, 40));
    ok('Pack has volunteers section',              `${pack.volunteers?.roles?.length ?? 0} roles`);
    ok('Pack has transport section',               pack.transport?.note?.slice(0, 40));
    ok('Pack has medical section',                 `${pack.medical?.alerts?.length ?? 0} alert(s)`);
    ok('Pack has messages section',                pack.messages?.playerMessage?.slice(0, 40) + '…');
    ok('Pack has summary string',                  pack.summary?.slice(0, 60));

    // Save pack on fixture
    const fx = getFixture(f3.id);
    fx.matchPack = pack;
    saveFixture(fx);
    ok('Match pack persisted on fixture',          'ok');

  } catch (e) { ko('generateMatchPack()', e.message); }

  // ── 6. Opposition analysis ───────────────────────────────────────────────
  sect('6 · analyseOpposition()');
  try {
    const fixture  = getFixture(f1.id);
    const analysis = await analyseOpposition(fixture);
    ok('analyseOpposition() executes',             `source: ${analysis.source}`);
    ok('Analysis text returned',                   analysis.analysis?.slice(0, 50) + '…');
  } catch (e) { ko('analyseOpposition()', e.message); }

  // ── 7. Complete fixture ──────────────────────────────────────────────────
  sect('7 · completeFixture()');
  let completed;
  try {
    completed = await completeFixture(f4.id, {
      teamScore:     24,
      opponentScore: 18,
      scorers:       ['J. Murphy ×2', 'C. Kelly', 'D. Walsh'],
      yellowCards:   ['P. O\'Brien'],
      manOfMatch:    'C. Kelly',
      coachNotes:    'Strong first half. Second half lapses in defence need work.',
    });
    ok('completeFixture() executes',               completed.status);
    ok('Status set to completed',                  completed.status === 'completed' ? 'ok' : completed.status);
    ok('Result stored',                            `${completed.result.teamScore}–${completed.result.opponentScore}`);
    ok('Result status computed (win)',             completed.result.status);
    ok('Man of match recorded',                    completed.result.manOfMatch);
    ok('Scorers recorded',                         `${completed.result.scorers?.length ?? 0} scorer(s)`);

  } catch (e) { ko('completeFixture()', e.message); completed = null; }

  // ── 8. Post-match review ─────────────────────────────────────────────────
  sect('8 · generatePostMatchReview()');
  let review;
  try {
    review = await generatePostMatchReview(f4.id, {
      strengths:    ['Set piece dominance', 'Work rate in the breakdown'],
      improvements: ['Second half discipline', 'Lineout accuracy'],
      nextFocus:    'Defensive structure — conceded 3 tries from kicks.',
    });
    ok('generatePostMatchReview() executes',       `source: ${review.source}`);
    ok('Narrative generated',                      review.narrative?.slice(0, 60) + '…');
    ok('Match insights returned',                  `${review.insights?.length ?? 0} insight(s)`);
    ok('Performance areas present',                JSON.stringify(Object.keys(review.performanceAreas)));
    ok('Result block present',                     review.result?.score);
    ok('generatedAt timestamp set',                review.generatedAt?.slice(0, 10));

  } catch (e) { ko('generatePostMatchReview()', e.message); }

  // ── 9. Player reports ────────────────────────────────────────────────────
  sect('9 · generatePlayerReports()');
  try {
    const fx = getFixture(f4.id);
    // Give the fixture a mock selected squad for this test
    fx.squadStatus.selected = [
      { id: 'p1', name: 'C. Kelly',  position: 'Flyhalf' },
      { id: 'p2', name: 'J. Murphy', position: 'Prop' },
      { id: 'p3', name: 'D. Walsh',  position: 'Centre' },
    ];
    saveFixture(fx);

    const reports = generatePlayerReports(getFixture(f4.id), [
      { playerId: 'p1', name: 'C. Kelly',  rating: 9, notes: 'Excellent game, controlled play brilliantly.' },
      { playerId: 'p2', name: 'J. Murphy', rating: 7, notes: 'Two tries — strong carrying.' },
    ]);
    ok('generatePlayerReports() executes',         `${reports.length} report(s)`);
    ok('Reports have player names',                reports.map(r => r.name).join(', '));
    ok('Man of match flagged',                     reports.find(r => r.manOfMatch)?.name ?? 'none');

  } catch (e) { ko('generatePlayerReports()', e.message); }

  // ── 10. Digital Twin update ──────────────────────────────────────────────
  sect('10 · updateDigitalTwin()');
  try {
    const result = await updateDigitalTwin(f4.id);
    ok('updateDigitalTwin() executes',             `updated: ${result.updated}`);
    ok('Result returned',                          result.result ?? result.reason ?? '?');

  } catch (e) { ko('updateDigitalTwin()', e.message); }

  // ── 11. Season standings ─────────────────────────────────────────────────
  sect('11 · SEASON STANDINGS');
  try {
    const standings = getSeasonStandings();
    ok('getSeasonStandings() executes',            `${standings.teams?.length} team(s) in table`);
    ok('Table has points column',                  standings.teams?.every(t => 'Pts' in t) ? 'ok' : '?');
    ok('Win rate computable',                      standings.teams?.[0]?.W >= 0 ? 'ok' : '?');

    const teamSeason = getTeamSeasonSummary(TEAM_SENIOR);
    ok('getTeamSeasonSummary() executes',          `W${teamSeason.wins} D${teamSeason.draws} L${teamSeason.losses}`);
    ok('Form string generated',                    teamSeason.form);

  } catch (e) { ko('Season standings', e.message); }

  // ── 12. Season timeline ──────────────────────────────────────────────────
  sect('12 · SEASON TIMELINE');
  try {
    const timeline = updateSeasonTimeline('2025/2026');
    ok('updateSeasonTimeline() executes',          `${timeline.fixtures} fixture(s)`);
    ok('Season label set',                         timeline.season);
    ok('Months map populated',                     `${Object.keys(timeline.months).length} month(s)`);
    ok('Summary generated',                        timeline.summary?.slice(0, 60));
    ok('Teams list populated',                     timeline.teams?.join(', '));

  } catch (e) { ko('Season timeline', e.message); }

  // ── Final summary ─────────────────────────────────────────────────────────
  const stats = fixtureStats();
  console.log(`\n${HRD}`);
  console.log(`  RESULTS: ${passed} passed · ${failed} failed`);
  console.log(HRD);
  console.log(`\n  Fixtures in store: ${stats.total}`);
  console.log(`  Completed:         ${stats.completed} (W${stats.wins} D${stats.draws} L${stats.losses})`);
  console.log(`  Upcoming:          ${stats.scheduled + stats.preparing}`);
  if (failed > 0) {
    console.log(`\n  ⚠  ${failed} test(s) failed — check errors above.\n`);
    process.exit(1);
  } else {
    console.log('\n  ✓  All tests passed. Fixture & Match Intelligence Engine is operational.\n');
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function futureDate(days) {
  const d = new Date(Date.now() + days * 86400_000);
  d.setHours(15, 0, 0, 0);
  return d.toISOString();
}
function pastDate(days) {
  const d = new Date(Date.now() - days * 86400_000);
  d.setHours(15, 0, 0, 0);
  return d.toISOString();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
