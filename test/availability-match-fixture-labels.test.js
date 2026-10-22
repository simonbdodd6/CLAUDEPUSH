/**
 * AVAILABILITY — a match names its TEAM (or, failing that, its COMPETITION).
 *
 * In U18 Availability two Saturday fixtures — the Premier side's and the
 * Development side's — both read "Saturday Match". The fixture records knew
 * which team each belonged to (normalizeFixture keeps `sideId`, the canonical
 * club-structure team validated server-side, and `team`, the coach's text),
 * but availabilityEventsForWeek dropped both when it built the event, so the
 * label had nothing to tell the two apart with.
 *
 * Now the builder carries the canonical id and the RESOLVED team name —
 * resolved by fixtureTeamLabel, the one existing helper that turns a side into
 * its display name from the club structure and never invents one — and
 * availabilitySessionLabel appends it for matches:
 *
 *     Saturday Match — U18 Premier
 *     Saturday Match — U18 Premier Development
 *
 * Nothing here names a team. The names come from the structure the club
 * configured, so the label stays right when fixtures, teams or assignments
 * change. A fixture with no team but a competition is named by its
 * competition; a match with neither keeps its plain label.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const s = html.search(new RegExp(`(async\\s+)?function ${name}\\s*\\(`));
  assert.ok(s > 0, `${name} exists`);
  let i = html.indexOf('(', s), p = 0;
  for (; i < html.length; i++) { if (html[i] === '(') p++; else if (html[i] === ')') { p--; if (!p) { i++; break; } } }
  let b = html.indexOf('{', i), d = 0, e = b;
  for (let k = b; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (!d) { e = k; break; } } }
  return html.slice(s, e + 1);
}

const U18 = 'grp_u18', SEN = 'grp_initial';
const STRUCTURE = Object.freeze({
  groups: [{ id: SEN, name: 'Seniors', status: 'active' }, { id: U18, name: 'U18', status: 'active', developmentCategory: 'youth_u18' }],
  teams: [
    { id: 't-sen',  groupId: SEN, name: 'Premier',                 status: 'active' },
    { id: 't-u18a', groupId: U18, name: 'U18 Premier',             status: 'active' },
    { id: 't-u18b', groupId: U18, name: 'U18 Premier Development', status: 'active' },
  ],
});
const SAT = '2026-09-26', WEEK = '2026-09-21';
const fx = (id, extra = {}) => ({ id, groupId: U18, opposition: 'Kituro', date: SAT, kickoffTime: '14:00', status: 'scheduled', ...extra });

/** The real builder + resolver + label, in a sandbox that has the club structure. */
function world({ structure = STRUCTURE, group = U18, fixtures = [], withResolver = true } = {}) {
  return new Function('STRUCTURE', 'FIXTURES', `
    const state = { operationalGroupId: '${group}', fixtures: FIXTURES };
    const _adminData = STRUCTURE ? { structure: STRUCTURE } : null;
    let _mcTeams = null;
    function mcSideRank() { return 0; }
    ${fn('availAddDays')}
    ${fn('availSlotDateInWeek')}
    ${fn('availTrainingEventId')}
    ${fn('normalizeFixture')}
    ${fn('matchCentreSides')}
    ${fn('fixtureTeamLabel')}
    ${fn('availabilityEventsForWeek')}
    ${fn('availabilitySessionLabel')}
    const events = availabilityEventsForWeek('${WEEK}', {
      fixtures: FIXTURES.map(normalizeFixture), slots: [], currentWeekStart: '${WEEK}',
      ${withResolver ? 'teamLabel: fixtureTeamLabel,' : ''}
    });
    return { events, labels: events.map(availabilitySessionLabel), label: availabilitySessionLabel };
  `)(structure, fixtures);
}

// ── 1–3. the two U18 Saturday matches are told apart ────────────────────────

test('1. the Premier match is labelled with the Premier team, resolved from the structure', () => {
  const w = world({ fixtures: [fx('fx_prem', { sideId: 't-u18a' })] });
  assert.deepEqual(w.labels, ['Saturday Match — U18 Premier']);
  assert.equal(w.events[0].sideId, 't-u18a', 'the canonical side travels on the event');
  assert.equal(w.events[0].team, 'U18 Premier');
});

test('2. the Development match is labelled with the Development team', () => {
  const w = world({ fixtures: [fx('fx_dev', { sideId: 't-u18b', opposition: 'Frameries', kickoffTime: '12:00' })] });
  assert.deepEqual(w.labels, ['Saturday Match — U18 Premier Development']);
});

test('3. two sides on one Saturday can no longer collapse to one label', () => {
  const w = world({ fixtures: [fx('fx_prem', { sideId: 't-u18a' }), fx('fx_dev', { sideId: 't-u18b', opposition: 'Frameries' })] });
  assert.deepEqual(w.labels.sort(), ['Saturday Match — U18 Premier', 'Saturday Match — U18 Premier Development']);
  assert.equal(new Set(w.labels).size, 2, 'distinct teams ⇒ distinct labels');
});

// ── 4. everything that had no team is exactly as it was ─────────────────────

test('4. a match without team context keeps its plain label; training never carries a side', () => {
  const w = world({ fixtures: [fx('fx_plain')] });
  assert.deepEqual(w.labels, ['Saturday Match']);
  assert.equal(w.label({ type: 'training', date: '2026-09-22', team: 'U18 Premier' }), 'Tuesday Training',
    'a team on a training event is ignored — training is group-wide');
  assert.equal(w.label({ type: 'match', date: '2026-09-26' }), 'Saturday Match');
  assert.equal(w.label({ type: 'match', date: '2026-09-26', team: '' }), 'Saturday Match');
  assert.equal(w.label({ type: 'match', date: '2026-09-26', team: '   ' }), 'Saturday Match');
});

// ── 5. missing / legacy team context fails gracefully ───────────────────────

test('5. legacy and partial team data never throws and never invents a name', () => {
  // sideId the structure does not know, free text present → the text is used
  let w = world({ fixtures: [fx('a', { sideId: 't-gone', team: 'U18 Colts' })] });
  assert.match(w.labels[0], /^Saturday Match/);
  assert.ok(w.labels[0] === 'Saturday Match — U18 Colts' || w.labels[0] === 'Saturday Match', w.labels[0]);
  // sideId unknown and no text → plain
  w = world({ fixtures: [fx('b', { sideId: 't-gone' })] });
  assert.deepEqual(w.labels, ['Saturday Match']);
  // no structure loaded at all (a device without admin data) → free text still names the team
  w = world({ structure: null, fixtures: [fx('c', { sideId: 't-u18a', team: 'U18 Premier' })] });
  assert.deepEqual(w.labels, ['Saturday Match — U18 Premier']);
  // no structure and no text → plain, no throw
  w = world({ structure: null, fixtures: [fx('d', { sideId: 't-u18a' })] });
  assert.deepEqual(w.labels, ['Saturday Match']);
  // undated match with a team still names it, without a weekday
  assert.equal(w.label({ type: 'match', team: 'U18 Premier' }), 'Match — U18 Premier');
});

test('5b. the builder is still pure: without a resolver it falls back to the fixture\'s own text', () => {
  const w = world({ withResolver: false, fixtures: [fx('e', { sideId: 't-u18a', team: 'U18 Premier' }), fx('f', { sideId: 't-u18b' })] });
  assert.deepEqual(w.labels, ['Saturday Match — U18 Premier', 'Saturday Match']);
});

// ── 6. the label helper's existing contract is intact ───────────────────────

test('6. the team appears exactly once, and only as a suffix to the existing label', () => {
  const w = world({ fixtures: [fx('g', { sideId: 't-u18a' })] });
  const l = w.labels[0];
  assert.equal(l.split('U18 Premier').length - 1, 1, 'no duplicated team name');
  assert.ok(l.startsWith('Saturday Match'), 'the weekday + kind lead, unchanged');
  assert.equal(l, `Saturday Match — ${w.events[0].team}`);
});

test('nothing in the label path is hard-coded to today\'s teams (code, not comments)', () => {
  const code = s => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const src of [fn('availabilitySessionLabel'), fn('availabilityEventsForWeek')].map(code)) {
    for (const literal of ['Premier Team', 'Development Team', 'U18 Premier', 'Premier Development', 't-u18']) {
      assert.equal(src.includes(literal), false, `${literal} must not be hard-coded`);
    }
  }
});

test('every caller with fixtures threads the one existing resolver; the training-only caller passes none', () => {
  for (const caller of ['coachAvailEvents', 'availEventsForViewedWeek', 'availabilityWeekSessions', 'availabilityChaseContext']) {
    assert.match(fn(caller), /teamLabel:\s*typeof fixtureTeamLabel === 'function' \? fixtureTeamLabel : null/,
      `${caller} resolves teams through fixtureTeamLabel (typeof-guarded for extracted sandboxes)`);
  }
  assert.doesNotMatch(fn('trainingWeekOccurrences'), /teamLabel/, 'trainingWeekOccurrences passes no fixtures and needs no resolver');
  // The resolver is the EXISTING helper: it must resolve a structure side and
  // must return '' rather than inventing a name for an unknown one.
  const w = world({ fixtures: [] });
  assert.equal(typeof w.label, 'function');
  const probe = new Function('STRUCTURE', `
    const state = { operationalGroupId: '${U18}' }; const _adminData = { structure: STRUCTURE }; let _mcTeams = null;
    function mcSideRank() { return 0; }
    ${fn('matchCentreSides')} ${fn('fixtureTeamLabel')}
    return [fixtureTeamLabel({ sideId: 't-u18b', groupId: '${U18}' }), fixtureTeamLabel({ sideId: 't-nope', groupId: '${U18}' })];
  `)(STRUCTURE);
  assert.deepEqual(probe, ['U18 Premier Development', '']);
});

// ── 7. competition, other groups, and what the label never touches ─────────

test('7. a fixture with no team but a competition is named by the competition', () => {
  const w = world({ fixtures: [fx('c1', { competition: 'Belgian U18 Cup' })] });
  assert.deepEqual(w.labels, ['Saturday Match — Belgian U18 Cup']);
  assert.equal(w.events[0].competition, 'Belgian U18 Cup');
  assert.equal(w.label({ type: 'match', competition: 'League' }), 'Match — League', 'undated: no invented weekday');
  assert.equal(w.label({ type: 'match', date: SAT, competition: '  ' }), 'Saturday Match', 'blank competition ⇒ plain');
  assert.equal(w.label({ type: 'training', date: '2026-09-22', competition: 'League' }), 'Tuesday Training',
    'training never carries a competition');
});

test('7b. the team wins over the competition — one detail, never both', () => {
  const w = world({ fixtures: [fx('c2', { sideId: 't-u18a', competition: 'Belgian U18 Cup' })] });
  assert.deepEqual(w.labels, ['Saturday Match — U18 Premier']);
});

test('7c. not a U18 special case: a Seniors fixture names its own side from the same structure', () => {
  const w = world({ group: SEN, fixtures: [fx('s1', { groupId: SEN, sideId: 't-sen' })] });
  assert.deepEqual(w.labels, ['Saturday Match — Premier']);
});

test('7d. ids, dates and types are unchanged — answers keyed on them are unaffected', () => {
  const w = world({ fixtures: [fx('fx_prem', { sideId: 't-u18a', competition: 'Cup' })] });
  const e = w.events[0];
  assert.equal(e.id, 'fx_prem');
  assert.equal(e.type, 'match');
  assert.equal(e.date, SAT);
  assert.equal(e.title, 'Match', 'the stored title is untouched; only the label names the team');
});

test('7e. the legacy generic match (no fixtures at all) keeps its plain label', () => {
  const w = world({ fixtures: [] });
  assert.equal(w.events.length, 1);
  assert.equal(w.events[0].id, 'game');
  assert.deepEqual(w.labels, ['Match']);
});
