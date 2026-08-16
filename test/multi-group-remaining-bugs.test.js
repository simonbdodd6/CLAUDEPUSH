/**
 * REMAINING MULTI-GROUP BUGS — Overview setup card, commercial UI removal,
 * Match Centre fixture leak, Messages history/discovery isolation.
 *
 *  · the club-setup checklist renders in the INITIAL group only
 *  · every Pro/trial/subscription surface is hidden behind
 *    BETA_HIDE_COMMERCIAL (UI only — plan/billing logic untouched)
 *  · the Match Centre working fixture resolves within the OPERATING group;
 *    out-of-group → no current fixture, nothing written, recoverable
 *  · Messages under a non-initial group opens on the group's own channel,
 *    never the Seniors-era squad pane; staff DISCOVERY follows operational
 *    scope while existing DM threads and club-wide channels are preserved
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const SEN = 'grp_initial', U18 = 'grp_2b0aa7f9', WOM = 'grp_1b0fb56b';

// ── OVERVIEW 1-3: setup checklist is initial-group only ───────────────────
test('the club-setup checklist shows in Seniors and never in U18/Women\'s', () => {
  const i = src.indexOf('const showOnboarding =');
  assert.ok(i > 0);
  const expr = src.slice(i, src.indexOf(';', i));
  assert.match(expr, /operationalGroupId === CE_INITIAL_GROUP_ID/,
    'gated on the initial group');
  const evalGate = (gid, dismissed, done, total) => new Function(`
    const state = { onboardingDismissed: arguments[1], operationalGroupId: arguments[0] };
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    const obDone = arguments[2], obSteps = { length: arguments[3] };
    return ${expr.replace('const showOnboarding =', '')};
  `)(gid, dismissed, done, total);
  assert.equal(evalGate(SEN, false, 4, 5), true, 'Seniors keeps the checklist');
  assert.equal(evalGate(null, false, 4, 5), true, 'no group context (legacy) keeps it');
  assert.equal(evalGate(U18, false, 4, 5), false, 'U18 never shows it');
  assert.equal(evalGate(WOM, false, 4, 5), false, "Women's never shows it");
  assert.equal(evalGate(SEN, false, 5, 5), false, 'completed checklist stays hidden');
});

// ── COMMERCIAL 4-7: no visible Pro/trial/subscription UI in the beta ──────
test('BETA_HIDE_COMMERCIAL is ON and every commercial surface is behind it', () => {
  assert.match(src, /const BETA_HIDE_COMMERCIAL = true;/, 'flag is on for the Core Beta');
  assert.match(fn('renderUpgradePrompt'), /if \(BETA_HIDE_COMMERCIAL\) return '';/,
    'every upgrade nudge (AI Intelligence, video, analytics, push) renders nothing');
  // The command dashboard's Subscription + Trial cards render via one gated const.
  const cards = src.indexOf("const _commercialCards = BETA_HIDE_COMMERCIAL ? '' : `");
  assert.ok(cards > 0, 'Subscription/Trial cards gated');
  const cardsEnd = src.indexOf('`;', cards);
  const block = src.slice(cards, cardsEnd);
  for (const needle of ['Subscription', 'Trial Remaining', 'Upgrade to Pro', 'Upgrade before trial']) {
    assert.ok(block.includes(needle), `${needle} lives inside the gated block`);
  }
  // The Settings plan/trial card is gated the same way.
  assert.match(src, /\$\{BETA_HIDE_COMMERCIAL \? '' : _planStatusCard\}/, 'Settings plan card gated');
  const plan = src.indexOf('const _planStatusCard = `');
  const planBlock = src.slice(plan, src.indexOf('`;', plan));
  assert.ok(planBlock.includes('Upgrade to Pro') || planBlock.includes('planBadge'),
    'the Upgrade button lives inside the gated settings card');
  // Video library copy loses its upsell tail in beta.
  assert.match(src, /BETA_HIDE_COMMERCIAL \? 'Save up to 10 training clips\.' :/,
    'video library copy is neutral in beta');
  // The feature-discovery page was already hidden in the beta shell.
  assert.match(src, /\$\{_betaUI \? "" : renderFeatureDiscovery\(\)\}/);
});

// ── MATCH CENTRE 8-17: the working fixture follows the operating group ────
const FIXTURES = [{ id: 'fx_mons', opposition: 'Mons', date: '2026-08-22', status: 'scheduled' }];
function mcHarness(gid, matchCentre) {
  return new Function(`
    const state = { operationalGroupId: arguments[0], fixtures: arguments[1], matchCentre: arguments[2] };
    function operationalGroups() { return [{ id: '${SEN}' }, { id: '${U18}' }, { id: '${WOM}' }]; }
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    ${fn('fixtureBelongsToGroup')}
    ${fn('contextFixtures')}
    ${fn('contextMatchCentre')}
    ${fn('matchCentreSelectedFixture')}
    ${fn('matchCentreFixtureId')}
    return { fx: matchCentreSelectedFixture(), fxId: matchCentreFixtureId(),
             mc: contextMatchCentre(), raw: state.matchCentre };
  `)(gid, FIXTURES, matchCentre);
}
const MONS_MC = { opposition: 'Mons', kickoffDate: '2026-08-22', kickoffTime: '15:00', venue: 'Foresterie', fixtureId: 'fx_mons', _autoFixtureId: 'fx_mons' };

test('MC 8: the Seniors fixture renders in Seniors exactly as before', () => {
  const r = mcHarness(SEN, { ...MONS_MC });
  assert.equal(r.fx?.opposition, 'Mons');
  assert.equal(r.mc.opposition, 'Mons');
});

test('MC 9-11: switching to U18 leaves NO Mons — no linked fixture, no header data', () => {
  const r = mcHarness(U18, { ...MONS_MC });
  assert.equal(r.fx, null, 'a Seniors fixture never resolves as U18 context');
  assert.equal(r.fxId, '', 'no linked fixture id in U18');
  assert.deepEqual(r.mc, {}, 'no opponent/date/venue/countdown data renders');
});

test('MC 13: Women\'s likewise renders no Seniors fixture', () => {
  const r = mcHarness(WOM, { ...MONS_MC });
  assert.equal(r.fx, null);
  assert.deepEqual(r.mc, {});
});

test('MC 16-17: nothing is written by the switch; Seniors context is recovered intact', () => {
  const working = { ...MONS_MC };
  const u18 = mcHarness(U18, working);
  assert.deepEqual(u18.raw, MONS_MC, 'the underlying working state is untouched out of group');
  const back = mcHarness(SEN, working);
  assert.equal(back.fx?.opposition, 'Mons', 'switching back recovers the valid Seniors fixture');
  assert.equal(back.mc.kickoffDate, '2026-08-22');
});

test('MC 12/14/15: renderers read only group-scoped context (sides stay server-scoped)', () => {
  const day = fn('renderMatchday');
  assert.match(day, /contextMatchCentre\(\)/, 'the planner reads the group-scoped match');
  for (const sub of ['_renderMatchOverview', '_renderMatchTimeline', '_renderMatchScoreboard', '_renderMatchBench']) {
    assert.match(fn(sub), /contextMatchCentre\(\)/, `${sub} too`);
  }
  assert.match(fn('matchCentreSelectedFixture'), /contextFixtures\(\)/,
    'the fixture chokepoint resolves inside the operating group — a U18 side can never pair with a Seniors fixture client-side (the server coherence rule already refuses it)');
  assert.match(fn('autopilotFillMatchFromFixture'), /contextFixtures\(\)/,
    'autopilot cannot re-adopt an out-of-group fixture after switching');
});

// ── MESSAGES 18-28 ────────────────────────────────────────────────────────
test('MSG 19/20: a non-initial group defaults to ITS channel, never the squad pane', () => {
  const body = fn('chatGetConvId');
  assert.match(body, /group:\$\{state\.operationalGroupId\}/, 'group-aware default');
  const resolve = (gid, selected) => new Function(`
    const state = { operationalGroupId: arguments[0], selectedChatId: arguments[1] };
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    const _chatConversations = [];
    ${fn('chatGetConvId')}
    return chatGetConvId('coach');
  `)(gid, selected);
  assert.equal(resolve(U18, null), `group:${U18}`, 'U18 with no selection → U18 channel');
  assert.equal(resolve(WOM, null), `group:${WOM}`);
  assert.equal(resolve(SEN, null), 'squad', 'Seniors keeps the existing squad default');
  assert.equal(resolve(U18, 'dm:a:b'), 'dm:a:b', 'an explicit selection always wins');
});

test('MSG 19/20: entering Messages re-points a persisted squad selection in U18/Women\'s', () => {
  const body = fn('renderCoachMessages');
  assert.match(body, /operationalGroupId !== CE_INITIAL_GROUP_ID/, 'non-initial groups only');
  assert.match(body, /selectedChatId === 'squad' \|\| !state\.selectedChatId/,
    'squad (or nothing) re-points to the group channel BEFORE anything paints');
  assert.match(body, /chatEnsureGroupChannel\(state\.selectedChatId\)/,
    'the group channel is created lazily even without a click');
  const sw = fn('setOperationalGroup');
  assert.match(sw, /selectedChatId === 'squad' && groupId !== CE_INITIAL_GROUP_ID/,
    'switching groups with squad open re-points too');
});

test('MSG 22-24: staff DISCOVERY follows operational scope; club-wide staff stay everywhere', () => {
  const cand = fn('chatStaffDmCandidates');
  assert.match(cand, /clubWideStaffIds/, 'club-wide staff always offered');
  assert.match(cand, /groupStaffIds/, 'scoped staff only in their groups');
  const run = (gid, acc) => new Function(`
    const state = { operationalGroupId: arguments[0], users: [
      { id: 'u-christian', role: 'coach', name: 'Christian Cornet' },
      { id: 'u-florian', role: 'coach', name: 'Florian Wintjens' },
      { id: 'u-xavier', role: 'coach', name: 'Xavier Bossert' },
      { id: 'u-laurine', role: 'medical', name: 'Laurine Blanc' },
      { id: 'u-sergio', role: 'medical', name: 'Sergio Domingues' },
    ] };
    const _adminData = { structureAccess: arguments[1] };
    ${fn('chatStaffDmCandidates')}
    return chatStaffDmCandidates('u-simon').map(x => x.name);
  `)(gid, acc);
  const acc = { clubWideStaffIds: ['u-simon', 'u-christian'],
    groupStaffIds: { [SEN]: ['u-florian', 'u-xavier', 'u-laurine', 'u-sergio'], [U18]: [], [WOM]: [] } };
  assert.deepEqual(run(U18, acc), ['Christian Cornet'],
    'U18 discovery: Christian only — never the Seniors-only assistants/medics');
  assert.deepEqual(run(WOM, acc), ['Christian Cornet'], "Women's likewise");
  assert.deepEqual(run(SEN, acc).sort(),
    ['Christian Cornet', 'Florian Wintjens', 'Laurine Blanc', 'Sergio Domingues', 'Xavier Bossert'],
    'Seniors keeps its full staff');
  assert.equal(run(U18, null).length, 5, 'no access data yet → full list (legacy fallback)');
});

test('MSG 25/26: private DMs and club-wide channels are preserved', () => {
  // Existing conversations always merge in from the server list, whatever the
  // discovery filter says — an old DM with Florian stays in Simon's inbox.
  const contacts = fn('chatBuildContacts');
  assert.match(contacts, /_chatConversations\.forEach\(sc => \{/,
    'server conversations (incl. old DMs) merge into the list regardless of scope');
  // The club-wide channels keep their rows and semantics untouched.
  assert.match(contacts, /id: 'squad'/, 'squad row remains');
  assert.match(contacts, /id: 'announce'/, 'announcements remain');
  assert.match(contacts, /id: 'coaching'/, 'coaching channel remains');
});

test('MSG 27/28: stale paints and local fallbacks stay impossible (shipped guards intact)', () => {
  const render = fn('chatRenderMessages');
  assert.match(render, /String\(convId \|\| ''\) !== String\(_open \|\| ''\)\) return/,
    'only the OPEN conversation may paint the feed');
  assert.match(fn('chatGetLocalMsgs'), /return false/,
    'the legacy local inbox can never back a group channel');
  const select = fn('selectChat');
  assert.ok(select.indexOf('chatRenderMessages(chatId, mode)') < select.indexOf('await chatFetchMessages(chatId)'),
    'a newly-selected thread paints before any fetch');
});
