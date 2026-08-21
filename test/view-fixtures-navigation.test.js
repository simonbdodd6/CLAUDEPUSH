/**
 * "View fixtures" navigation — the Match Week Availability card must open the
 * coach Fixtures page, never corrupt the view.
 *
 * Bug pinned here: the card's button called setSection('fixtures') — ONE
 * argument, so 'fixtures' was taken as the VIEW. state.activeView became an
 * invalid value (and was persisted), showSection() fell into the player
 * branch and activated player-<lastPlayerSection> (Medical for anyone who had
 * toured player Medical) with no renderer painting it — a blank, stuck page.
 *
 * Contract:
 *  1. the button targets setSection('coach','fixtures'); no one-arg
 *     setSection() call ships anywhere in the bundle;
 *  2. the click activates coach-fixtures and never invokes Medical rendering;
 *  3. the operational group is untouched (same-view navigation never
 *     re-resolves it);
 *  4. a corrupted persisted view self-heals: showSection() coerces an unknown
 *     activeView to the account's real capacity.
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

// ─── 1. Static: stable named target, no one-arg setSection anywhere ─────────
test('the Match Week card button targets setSection(\'coach\',\'fixtures\')', () => {
  // The card is built in a JS string, so the onclick quotes are escaped (\').
  const btn = src.match(/onclick="setSection\([^"]*\)">View fixtures</);
  assert.ok(btn, 'the View fixtures button exists');
  assert.match(btn[0], /setSection\(\\'coach\\',\\'fixtures\\'\)/, 'named view + section, not a bare section');
});

test('no one-argument setSection() call ships anywhere in the bundle', () => {
  // Every legitimate call names the view first ('coach' / 'player'). A bare
  // setSection('<something>') treats the section as a view — the exact bug.
  const calls = [...src.matchAll(/setSection\((\\?['"])([^'"\\]+)\1\s*[,)]/g)];
  const bad = calls.filter(c => !['coach', 'player'].includes(c[2]));
  assert.deepEqual(bad.map(c => c[0]), [], 'every setSection call starts with a real view');
});

// ─── Shared harness: the REAL setSection + showSection over a stub DOM ──────
function harness({ role = 'coach', view = 'coach', coachSection = 'overview', playerSection = 'medical' } = {}) {
  return new Function(`
    "use strict";
    const calls = { renders: 0, saves: 0, medical: 0, groupResolves: 0, toasts: [] };
    const els = {};
    const el = id => els[id] || (els[id] = {
      id, classes: new Set(),
      classList: { add(c) { els[id].classes.add(c); }, remove(c) { els[id].classes.delete(c); } },
      textContent: '',
    });
    ['coach-overview', 'coach-fixtures', 'coach-medical', 'player-home', 'player-medical', 'player-fixtures']
      .forEach(id => { el(id); els[id].isSection = true; });
    const document = {
      querySelectorAll: sel => sel === '.section' ? Object.values(els).filter(e => e.isSection) : [],
      getElementById: id => els[id] || el(id),
    };
    const state = {
      activeView: ${JSON.stringify(view)},
      activeCoachSection: ${JSON.stringify(coachSection)},
      activePlayerSection: ${JSON.stringify(playerSection)},
      operationalGroupId: 'grp_2b0aa7f9',
      messages: [], clubName: 'B',
    };
    function isCoach() { return ${JSON.stringify(role)} === 'coach'; }
    function resolveOperationalGroup() { calls.groupResolves++; }
    function allowedCoachSections(list) { return list; }
    // The real registry showSection validates the coach section against
    // (R1 route recovery): an unknown coach section falls back inside the
    // COACH capacity now, never to player-home.
    const coachSections = [['overview','Overview'],['fixtures','Fixtures'],['medical','Medical']];
    function playerSectionsFor() { return [['home','Home'],['medical','Medical'],['availability','Availability']]; }
    function showToast(t) { calls.toasts.push(t); }
    function saveState() { calls.saves++; }
    function pageTitle() { return 'T'; }
    function renderOperationalGroupSwitcher() {}
    function getPlayer() { return { name: 'P' }; }
    function renderMedical() { calls.medical++; }
    ${fn('showSection')}
    function render() { calls.renders++; showSection(); }
    ${fn('setSection')}
    return {
      setSection, showSection, state, calls,
      active: () => Object.values(els).filter(e => e.isSection && e.classes.has('active')).map(e => e.id),
    };
  `)();
}

// ─── 2. The click opens Fixtures; Medical is never rendered ─────────────────
test('setSection(\'coach\',\'fixtures\') activates coach-fixtures and never touches Medical', () => {
  const h = harness();
  h.setSection('coach', 'fixtures');
  assert.equal(h.state.activeView, 'coach');
  assert.equal(h.state.activeCoachSection, 'fixtures');
  assert.deepEqual(h.active(), ['coach-fixtures'], 'exactly the Fixtures page is visible');
  assert.equal(h.calls.medical, 0, 'renderMedical never invoked by the navigation');
  assert.equal(h.calls.renders, 1, 'one render');
});

// ─── 3. Operational group untouched ─────────────────────────────────────────
test('same-view navigation never re-resolves or changes the operational group', () => {
  const h = harness();
  h.setSection('coach', 'fixtures');
  assert.equal(h.state.operationalGroupId, 'grp_2b0aa7f9', 'group unchanged');
  assert.equal(h.calls.groupResolves, 0, 'no group re-resolution on a coach→coach section change');
});

// ─── 4. Corrupted persisted view self-heals ─────────────────────────────────
test('a persisted invalid activeView self-heals to the account\'s capacity', () => {
  // Coach stuck with the pre-fix corruption: activeView 'fixtures',
  // last-toured player section Medical — the exact stranded state.
  const coach = harness({ view: 'fixtures' });
  coach.showSection();
  assert.equal(coach.state.activeView, 'coach', 'coach account coerces to coach view');
  assert.deepEqual(coach.active(), ['coach-overview'], 'their coach section shows, not player Medical');

  const player = harness({ role: 'player', view: 'fixtures', playerSection: 'home' });
  player.showSection();
  assert.equal(player.state.activeView, 'player', 'player account coerces to player view');
  assert.deepEqual(player.active(), ['player-home']);
});

// ─── The old bug shape can never strand again ───────────────────────────────
test('even a stray one-arg call cannot leave an invalid view visible after render', () => {
  const h = harness();
  h.setSection('fixtures');            // the historical bad call
  assert.equal(h.state.activeView, 'coach', 'showSection healed the view within the same render');
  assert.notDeepEqual(h.active(), ['player-medical'], 'no stranded player Medical page');
});
