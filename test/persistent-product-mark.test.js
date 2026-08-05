/**
 * RC4.10F — persistent CoachEasier product mark.
 *
 * The mark is defined ONCE (ceProductMarkHtml) and appears exactly once on every
 * signed-in screen: via the shared header on most, and via each screen's own
 * local header row on the three that suppress the shared header (Availability,
 * Match Centre, Messages).
 *
 * The club badge, club name and club colours stay primary — a club's custom
 * palette must never recolour the platform signature.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const header = src.slice(src.indexOf('<header class="topbar">'), src.indexOf('<section id="coach-overview"'));

/** Slice a top-level function body out of index.html. */
function fn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = src.indexOf('{', start), depth = 0, end = i;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return src.slice(start, end + 1);
}

// ── One definition, reused ──────────────────────────────────────────────────
test('the lockup markup is defined once and reused, not copy-pasted', () => {
  const helper = fn('ceProductMarkHtml');
  assert.match(helper, /class="ce-topmark ce-topmark-local"/, 'helper emits the lockup');
  assert.match(helper, /coacheasier-mark-on-light\.svg/, 'approved CE asset');
  assert.match(helper, /aria-label="CoachEasier — platform information"/, 'accessible label');
  // Exactly one literal lockup (the shared header) plus three helper injections.
  assert.equal((src.match(/class="ce-topmark"/g) || []).length, 1, 'one literal lockup: the shared header');
  assert.equal((src.match(/\$\{ceProductMarkHtml\(\)\}/g) || []).length, 3, 'three screen injections');
});

test('the shared header still carries the lockup for every ordinary screen', () => {
  assert.ok(header.includes('class="ce-topmark"'), 'lockup lives in the shared topbar');
  assert.equal((src.match(/<header class="topbar">/g) || []).length, 1, 'a single shared header');
  for (const id of ['coach-overview', 'coach-training', 'coach-players', 'coach-medical',
                    'coach-settings', 'player-home', 'player-availability']) {
    assert.ok(src.indexOf(`<section id="${id}"`) > src.indexOf('<header class="topbar">'),
      `${id} sits under the shared header`);
  }
});

// ── The three header-less screens ───────────────────────────────────────────
test('Availability places the mark in its own title row, clear of the week nav', () => {
  const head = src.slice(src.indexOf('<header class="avail-head">'), src.indexOf('class="avail-weeknav"'));
  assert.match(head, /class="avail-head-row"/, 'dedicated title row');
  assert.match(head, /<h2>Availability<\/h2>/, 'heading untouched');
  assert.match(head, /\$\{ceProductMarkHtml\(\)\}/, 'mark injected');
  // The week navigator still follows the title row, unmoved.
  assert.ok(src.indexOf('class="avail-weeknav"') > src.indexOf('class="avail-head-row"'),
    'week navigator remains after the title row');
  assert.match(src, /\.avail-head-row \{[^}]*justify-content: space-between/, 'mark sits opposite the heading');
});

test('Match Centre places the mark clear of the AVAILABLE / MEDICAL chips', () => {
  const head = src.slice(src.indexOf('<header class="mc10-head">'), src.indexOf('${_matchTabBar()}'));
  assert.match(head, /\$\{ceProductMarkHtml\(\)\}/, 'mark injected');
  // The status chips are untouched and still precede the mark in the markup.
  assert.match(head, /mc10-chip-lbl">Available/, 'AVAILABLE chip intact');
  assert.match(head, /mc10-chip-lbl">Medical/, 'MEDICAL chip intact');
  assert.ok(head.indexOf('${ceProductMarkHtml()}') > head.indexOf('mc10-chip-lbl">Medical'),
    'mark comes after the chips, never overlapping them');
  assert.match(src, /\.mc10-head > \.ce-topmark \{ order: 3; margin-left: auto/, 'pushed to the far right');
});

test('Messages places the mark ahead of the conversation controls', () => {
  // Search forward from the markup — 'chat-search-bar' also names a CSS rule
  // far earlier in the file, which would invert the slice.
  const headStart = src.indexOf('<div class="chat-list-head">');
  const head = src.slice(headStart, src.indexOf('chat-search-bar', headStart));
  assert.match(head, /\$\{ceProductMarkHtml\(\)\}/, 'mark injected');
  assert.match(head, /chat-new-msg-btn/, 'the New-message control is retained');
  assert.ok(head.indexOf('${ceProductMarkHtml()}') < head.indexOf('chat-new-msg-btn'),
    'mark precedes the conversation control rather than displacing it');
  // The composer is a separate element further down the thread — untouched here.
  assert.doesNotMatch(head, /chat-composer|chat-input/, 'the mobile composer is not in this header');
});

// ── Identity rules ──────────────────────────────────────────────────────────
test('club colours can never recolour the product mark', () => {
  const css = src.slice(src.indexOf('.ce-topmark {'), src.indexOf('/* Availability — title row'));
  assert.doesNotMatch(css, /var\(--accent/, 'never uses the club accent');
  assert.doesNotMatch(css, /var\(--brand/, 'never uses the club brand');
  assert.match(css, /143,107,42/, 'fixed CoachEasier champagne');
  assert.match(css, /color: #6E5320/, 'fixed champagne ink');
  // A single treatment across every screen — no per-screen colour override.
  assert.doesNotMatch(src, /\.mc10-head > \.ce-topmark \{[^}]*color:/, 'Match Centre uses the shared ink');
  const apply = src.slice(src.indexOf('function applyClubBranding()'), src.indexOf('async function settingsSaveClubBranding'));
  assert.doesNotMatch(apply, /ce-topmark/, 'club branding never targets the mark');
});

test('club badge, club name and the sidebar attribution all remain', () => {
  const brand = src.slice(src.indexOf('<div class="brand">'), src.indexOf('<div class="view-switch"'));
  assert.match(brand, /class="brand-mark"/, 'club badge slot');
  assert.match(brand, /id="sidebarClubName"/, 'club name');
  assert.equal((src.match(/Powered by <span>CoachEasier<\/span>/g) || []).length, 1,
    'exactly one sidebar attribution, still present');
  const apply = src.slice(src.indexOf('function applyClubBranding()'), src.indexOf('async function settingsSaveClubBranding'));
  assert.match(apply, /state\.clubLogo\s*\?\s*`background-image:url/, 'an uploaded club logo still wins');
});

test('the mark is accessible, self-contained and leaks no build information', () => {
  const handler = fn('ceOpenProductInfo');
  assert.match(handler, /event\.preventDefault\(\)/, 'never follows the href');
  assert.match(handler, /setSection\('coach', 'settings'\)/, 'coaches land on Settings');
  assert.match(handler, /setSection\('player', 'account'\)/, 'players land on Account');
  assert.doesNotMatch(handler, /window\.location|window\.open/, 'never leaves the app');
  for (const banned of ['_BUILD_INFO', 'diagnostics', 'hostname', 'location.host']) {
    assert.equal(handler.includes(banned), false, `must not reference ${banned}`);
  }
  assert.doesNotMatch(header, /_BUILD_INFO|environment/i, 'header lockup carries no build information');
  const css = src.slice(src.indexOf('.ce-topmark {'), src.indexOf('/* Availability — title row'));
  assert.match(css, /focus-visible/, 'keyboard focus is visible');
});

test('mobile drops the wordmark and keeps the mark right-aligned', () => {
  const mq = src.slice(src.indexOf('@media (max-width: 560px) {\n      .ce-topmark'));
  assert.match(mq.slice(0, 400), /\.ce-topmark-word \{ display: none/, 'wordmark hidden on small screens');
  assert.match(mq.slice(0, 500), /\.topbar > \.button-row \{ justify-content: flex-end/, 'stays top-right when the header stacks');
  const css = src.slice(src.indexOf('.ce-topmark {'), src.indexOf('/* Availability — title row'));
  assert.match(css, /white-space: nowrap/, 'never wraps into a title');
  assert.match(css, /flex-shrink: 0/, 'never squashed by a title');
});
