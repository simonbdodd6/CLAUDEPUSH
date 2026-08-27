/**
 * PRODUCTION READINESS R1 — route recovery, support visibility, legal-page
 * infrastructure, robots.txt.
 *
 * From the readiness audit:
 *  · an unknown COACH section fell through showSection's universal
 *    player-home fallback, so a coach with stale state landed in the PLAYER
 *    app (the view dimension already self-healed; the section did not);
 *  · support existed only inside coach Settings — invisible signed-out and
 *    to every player;
 *  · /privacy and /terms 404'd, with no legal copy anywhere in the product;
 *  · /robots.txt 404'd, leaving the app shell open to indexing.
 *
 * The legal pages ship as DRAFT-labelled shells: no company entity,
 * jurisdiction, retention period or compliance promise is invented, and the
 * signup wizard LINKS the policies without claiming or recording acceptance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const privacy = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
const terms = await readFile(new URL('../terms.html', import.meta.url), 'utf8');
const robots = await readFile(new URL('../robots.txt', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

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

// ─── 1–6: route recovery through the REAL showSection ──────────────────────
function harness({ role = 'coach', view = 'coach', coachSection = 'overview', playerSection = 'home' } = {}) {
  return new Function(`
    "use strict";
    const els = {};
    const el = id => els[id] || (els[id] = { id, classes: new Set(),
      classList: { add: c => els[id].classes.add(c), remove: c => els[id].classes.delete(c) }, textContent: '' });
    ['coach-overview','coach-fixtures','coach-medical','coach-settings','player-home','player-medical','player-availability']
      .forEach(id => { el(id); els[id].isSection = true; });
    const document = {
      querySelectorAll: sel => sel === '.section' ? Object.values(els).filter(e => e.isSection) : [],
      getElementById: id => els[id] || el(id),
    };
    const state = { activeView: ${JSON.stringify(view)}, activeCoachSection: ${JSON.stringify(coachSection)},
      activePlayerSection: ${JSON.stringify(playerSection)}, operationalGroupId: 'g' };
    function isCoach() { return ${JSON.stringify(role)} === 'coach'; }
    function playerSectionsFor() { return [['home','Home'],['availability','Availability'],['medical','Medical']]; }
    const coachSections = [['overview','Overview'],['fixtures','Fixtures'],['medical','Medical'],['settings','Settings']];
    function pageTitle() { return 'T'; }
    function renderOperationalGroupSwitcher() {}
    function getPlayer() { return { name: 'P' }; }
    ${fn('showSection')}
    showSection();
    return { state, active: Object.values(els).filter(e => e.isSection && e.classes.has('active')).map(e => e.id) };
  `)();
}

test('1+2: an invalid COACH section recovers to coach Overview — never the player home screen', () => {
  for (const bad of ['does-not-exist', '', 'fixtures ', 'PLAYERS', 'old-renamed-tab']) {
    const h = harness({ coachSection: bad });
    assert.equal(h.state.activeCoachSection, 'overview', `"${bad}" recovers inside the coach app`);
    assert.deepEqual(h.active, ['coach-overview'], `"${bad}" shows coach Overview`);
    assert.equal(h.active.includes('player-home'), false, `"${bad}" never lands in the player app`);
  }
});

test('3: an invalid PLAYER section recovers to player Home', () => {
  const h = harness({ role: 'player', view: 'player', playerSection: 'nonsense' });
  assert.equal(h.state.activePlayerSection, 'home');
  assert.deepEqual(h.active, ['player-home']);
});

test('4+5: valid sections are left completely alone', () => {
  const coach = harness({ coachSection: 'fixtures' });
  assert.equal(coach.state.activeCoachSection, 'fixtures');
  assert.deepEqual(coach.active, ['coach-fixtures']);
  const player = harness({ role: 'player', view: 'player', playerSection: 'availability' });
  assert.equal(player.state.activePlayerSection, 'availability');
  assert.deepEqual(player.active, ['player-availability']);
});

test('6: stale state with BOTH an invalid view and an invalid section fully self-heals', () => {
  const h = harness({ view: 'totally-bogus', coachSection: 'also-bogus' });
  assert.equal(h.state.activeView, 'coach');
  assert.equal(h.state.activeCoachSection, 'overview');
  assert.deepEqual(h.active, ['coach-overview']);
});

test('the last-resort fallback is account-appropriate, not universally player-home', () => {
  const show = fn('showSection');
  assert.match(show, /const fallbackId = state\.activeView === "coach" \? "coach-overview" : "player-home"/,
    'a coach can no longer fall through to a player screen');
  assert.doesNotMatch(show, /getElementById\(id\) \|\| document\.getElementById\("player-home"\)/,
    'the old universal player-home fallback is gone');
});

// ─── 7–9: support visibility ───────────────────────────────────────────────
test('7+9: the signed-out screen shows the canonical support address', () => {
  const welcome = fn('renderWelcome');
  assert.match(welcome, /support@coacheasier\.com/, 'support reachable before sign-in');
  assert.match(welcome, /Need help\?/);
});

test('8+9: players get a support affordance under their own navigation', () => {
  const nav = fn('renderNav');
  assert.match(nav, /player-help-link/, 'a player help line is rendered');
  assert.match(nav, /support@coacheasier\.com/, 'same canonical address');
  assert.match(nav, /state\.activeView === 'player'/, 'shown in the player view');
  assert.match(nav, /playerHelp\.remove\(\)/, 'and removed again in the coach view');
});

test('the existing coach Settings support card is untouched and now also links the policies', () => {
  const anchor = src.indexOf('>CoachEasier Support</h2>');   // the card markup, not the CSS comment
  const settingsSupport = src.slice(anchor, anchor + 1400);
  assert.match(settingsSupport, /mailto:support@coacheasier\.com/, 'original support button intact');
  assert.match(settingsSupport, /href="\/privacy"[\s\S]*href="\/terms"/, 'policies linked from Settings');
});

// ─── 10–14: legal routes + content honesty ─────────────────────────────────
test('10+11: /privacy and /terms are real routes served as static pages', () => {
  const sources = vercel.rewrites.map(r => r.source);
  assert.ok(sources.includes('/privacy') && sources.includes('/terms'), 'both routes exist');
  const priv = vercel.rewrites.find(r => r.source === '/privacy');
  const term = vercel.rewrites.find(r => r.source === '/terms');
  assert.equal(priv.destination, '/privacy.html');
  assert.equal(term.destination, '/terms.html');
  // The existing API rewrites must survive untouched.
  assert.ok(sources.includes('/api/roster') && sources.includes('/api/reminder'), 'existing rewrites intact');
});

test('12+13: both pages stand alone — no account, no app bootstrap, no app data', () => {
  for (const [name, page] of [['privacy', privacy], ['terms', terms]]) {
    assert.match(page, /^<!doctype html>/i, `${name} is a complete document`);
    assert.doesNotMatch(page, /coach-eye-real-workflow-mvp-state|\/api\/identity|localStorage/,
      `${name} never touches app state or the API`);
    assert.doesNotMatch(page, /<script/i, `${name} ships no script at all`);
    assert.match(page, /CoachEasier/, `${name} carries branding`);
    assert.match(page, /support@coacheasier\.com/, `${name} shows support contact`);
    assert.match(page, /href="\/"/, `${name} offers a way back to the app`);
    assert.match(page, /name="viewport"/, `${name} is mobile-ready`);
    assert.match(page, /noindex/, `${name} stays out of search results while in draft`);
  }
});

test('18: the pages state clearly that they are DRAFT — no finalized legal claim is made', () => {
  for (const [name, page] of [['privacy', privacy], ['terms', terms]]) {
    assert.match(page, /DRAFT — pending final legal review/, `${name} is labelled draft`);
    // R3 expanded the shells into substantive drafts; the disclaimer moved
    // with them (…"not yet a published privacy policy" / "not yet a binding
    // set of terms" … "Nothing here is a binding agreement yet").
    assert.match(page, /not yet a (published privacy policy|binding set of terms)/, `${name} disclaims finality`);
    assert.match(page, /Nothing here is a\s+binding agreement yet/, `${name} disclaims agreement status`);
    assert.match(page, /Last updated: <strong>not yet published<\/strong>/, `${name} claims no publication date`);
  }
});

test('no legal FACTS are invented — entity, address, jurisdiction, retention, compliance promises', () => {
  const both = privacy + terms;
  // Nothing that would assert a company identity or legal venue.
  // Case-SENSITIVE entity suffixes only: "limited"/"sa" appear in ordinary prose.
  assert.doesNotMatch(both, /\b(Ltd\.?|LLC|GmbH|SPRL|SRL|BVBA|Inc\.)\b/, 'no legal entity invented');
  assert.doesNotMatch(both, /governed by the laws of|jurisdiction of the courts|registered office|company number|\bVAT\b/i,
    'no jurisdiction or registration invented');
  assert.doesNotMatch(both, /\b(GDPR|UK GDPR|CCPA|HIPAA)[- ]compliant\b/i, 'no compliance promise invented');
  assert.doesNotMatch(both, /we (retain|keep|delete) .{0,30}\b(for|after) \d+ (days|months|years)/i, 'no retention period invented');
  assert.doesNotMatch(both, /guardian consent (is|has been) obtained/i, 'no guardian-consent claim invented');
  // What it DOES say about today is verifiable product fact.
  assert.match(privacy, /no advertising, analytics or tracking/i, 'states the true zero-tracking position');
});

// ─── 14–17: links, and the acceptance rule ─────────────────────────────────
test('14+15+16: privacy and terms are linked from the signed-out screen, the wizard and Settings', () => {
  assert.match(fn('renderWelcome'), /href="\/privacy"[\s\S]*href="\/terms"/, 'signed-out');
  const wizard = src.slice(src.indexOf('id="cw-finish-btn"'), src.indexOf('id="cw-finish-btn"') + 900);
  assert.match(wizard, /href="\/privacy"/, 'wizard privacy link');
  assert.match(wizard, /href="\/terms"/, 'wizard terms link');
  assert.match(fn('renderNav'), /href="\/privacy"/, 'player view');
});

test('17: NO acceptance is claimed or recorded while the policies are draft', () => {
  // Assert on RENDERED copy: developer comments explain the rule and would
  // otherwise match the very phrases they forbid.
  const raw = src.slice(src.indexOf('id="cw-finish-btn"') - 200, src.indexOf('id="cw-finish-btn"') + 1200);
  const wizard = raw.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(wizard, /you agree to|By (creating|signing)/i, 'no false agreement claim');
  assert.doesNotMatch(wizard, /type="checkbox"/, 'no acceptance control yet');
  // …and nothing is written into the signup payload.
  const finish = fn('clubWizFinish');
  assert.doesNotMatch(finish, /acceptedTerms|termsAccepted|acceptedPrivacy|consent/i, 'no consent field is recorded');
});

// ─── 19+20: robots.txt ─────────────────────────────────────────────────────
test('19+20: robots.txt keeps the authenticated app out of search results', () => {
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Disallow: \/$/m, 'the app shell is not indexed');
  assert.doesNotMatch(robots, /^Sitemap:/m, 'no sitemap claimed while none exists');
  assert.match(robots, /WHEN A PUBLIC LANDING\/MARKETING SITE EXISTS/,
    'documents exactly how to open it up later without guesswork');
});

// ─── 21: the app itself is untouched ───────────────────────────────────────
test('21: the SPA is unchanged — same single entry point, no new routing architecture', () => {
  assert.equal(vercel.outputDirectory, '.', 'static serving unchanged');
  assert.equal(vercel.rewrites.length, 4, 'exactly the two new page routes plus the two existing API rewrites');
  assert.ok(!vercel.routes, 'no new routing mechanism introduced');
  // H2 added `redirects`, but only as a deny rule: each one refuses to serve a
  // server-side file and sends the request to the branded 404 page. That is not
  // a route into the app, so the invariant this test guards — one entry point,
  // no new navigable pages — still holds. Assert it directly rather than by the
  // absence of the key, which no longer means what it did when this was written.
  for (const r of vercel.redirects || []) {
    assert.equal(r.destination, '/404.html',
      `redirect ${r.source} adds a reachable route instead of denying one`);
  }
  // Public signup stays closed: nothing here touches the flag or its gate.
  assert.doesNotMatch(privacy + terms + robots, /PUBLIC_CLUB_SIGNUP/);
});

// ─── 22: mobile-safe pages ─────────────────────────────────────────────────
test('22: the legal pages are built for a phone — fluid width, no fixed wide layout', () => {
  for (const [name, page] of [['privacy', privacy], ['terms', terms]]) {
    assert.match(page, /max-width: 720px/, `${name} caps its column`);
    assert.match(page, /@media \(max-width:420px\)/, `${name} tightens padding on small screens`);
    assert.doesNotMatch(page, /(?<!max-)(?<!min-)width:\s*\d{3,}px/, `${name} has no fixed pixel width that could overflow`);
    assert.match(page, /min-height:44px/, `${name} back control meets tap-target size`);
  }
});
