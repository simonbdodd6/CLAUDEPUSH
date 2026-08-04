/**
 * RC4.10E — CoachEasier default brand system.
 *
 * A club that has NOT configured its own colours renders in the CoachEasier
 * identity: near-black surfaces, silver/white text, champagne-gold accent and a
 * brushed-silver secondary. A club that HAS configured colours still overrides
 * every accent token, and clearing them returns to the CoachEasier default.
 *
 * Status colours (available / maybe / unavailable) are semantic and must never
 * be re-skinned for branding.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const GOLD = '#8f6b2a';        // brand / primary action
const GOLD_ACCENT = '#a8842c'; // accent lines, active states
const SILVER = '#8e959d';      // brushed metallic secondary

/** Read a CSS custom property's LAST definition (the one the cascade uses). */
function token(name) {
  const matches = [...src.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].map(m => m[1].trim());
  return matches.length ? matches[matches.length - 1].toLowerCase() : null;
}

// ── Default palette ─────────────────────────────────────────────────────────
test('the default accent is champagne gold with a brushed-silver secondary', () => {
  assert.equal(token('--accent'), GOLD_ACCENT, 'accent is champagne gold');
  assert.equal(token('--accent-2'), SILVER, 'secondary is brushed silver');
  assert.equal(token('--accent-rgb'), '168, 132, 44', 'accent triplet matches the gold');
});

test('the default brand (primary action) is champagne gold', () => {
  assert.equal(token('--brand'), GOLD, 'brand is champagne gold');
  assert.match(token('--brand-2'), /^#7a5b22$/, 'hover is a deeper gold, not a lighter wash');
});

test('dark surfaces stay near-black and light surfaces stay silver/white', () => {
  const page = token('--page');
  assert.match(page, /^#f[0-9a-f]{5}$/, `light canvas is near-white (got ${page})`);
  // The dark design layers keep their near-black canvases.
  assert.ok(/--page:\s*#0[0-9a-f]{5}/.test(src), 'a near-black page surface is defined');
  assert.ok(/#0A0D12/i.test(src), 'the brand ink tile stays near-black');
});

test('the old purple/blue fallback identity is gone', () => {
  for (const dead of ['6366f1', '818cf8', '6e74f0', '8d92fb', '7c82f7', '5b62ec',
                      '99,102,241', '99, 102, 241', '110,116,240', '110, 116, 240']) {
    assert.equal(src.includes(dead), false, `stale indigo value ${dead} still present`);
  }
});

test('no neon gold — the accent is a restrained champagne', () => {
  // Reject the saturated "neon" golds (#FFD700 / #FFC800 style) anywhere in tokens.
  for (const neon of ['#ffd700', '#ffdf00', '#ffc800', '#f5c518']) {
    assert.equal(src.toLowerCase().includes(neon), false, `neon gold ${neon} must not be used`);
  }
  // And the chosen gold is genuinely mid-dark, not a bright yellow.
  const [r, g, b] = [0x8f, 0x6b, 0x2a];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  assert.ok(luminance < 0.5, `brand gold luminance ${luminance.toFixed(2)} should be restrained`);
});

// ── Status semantics ────────────────────────────────────────────────────────
test('status colours keep their semantic meanings and are not re-skinned gold', () => {
  assert.equal(token('--status-available'), '#10b981', 'available stays green');
  assert.equal(token('--status-maybe'), '#fbbf24', 'maybe stays amber');
  assert.equal(token('--status-unavailable'), '#f87171', 'unavailable stays red');
  assert.equal(token('--green'), '#10b981');
  assert.equal(token('--amber'), '#f59e0b');
  assert.equal(token('--red'), '#ef4444');
  // None of them may have been aliased to the brand tokens.
  for (const t of ['--status-available', '--status-maybe', '--status-unavailable']) {
    assert.doesNotMatch(token(t), /var\(--(accent|brand)/, `${t} must not follow the brand accent`);
  }
});

// ── Club override ───────────────────────────────────────────────────────────
/** Run the real clubBrandVars() from index.html. */
function loadClubBrandVars() {
  const start = src.indexOf('function clubBrandVars(');
  let i = src.indexOf('{', start), depth = 0, end = i;
  for (let b = i; b < src.length; b++) {
    if (src[b] === '{') depth++;
    else if (src[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  const helpers = ['_hexToRgba', '_hexToRgbTriplet', '_hexScale'].map(name => {
    const s2 = src.indexOf(`function ${name}(`);
    let j = src.indexOf('{', s2), d = 0, e = j;
    for (let b = j; b < src.length; b++) {
      if (src[b] === '{') d++;
      else if (src[b] === '}') { d--; if (d === 0) { e = b; break; } }
    }
    return src.slice(s2, e + 1);
  }).join('\n');
  return new Function(`"use strict";${helpers}\n${src.slice(start, end + 1)}\nreturn clubBrandVars;`)();
}
const clubBrandVars = loadClubBrandVars();

test('a club with configured colours overrides every accent token', () => {
  const vars = clubBrandVars({ primary: '#C1121F', secondary: '#111111' });
  assert.equal(vars['--accent'], '#C1121F', 'club primary becomes the accent');
  assert.equal(vars['--brand'], '#C1121F');
  assert.equal(vars['--accent-2'], '#111111');
  assert.equal(vars['--accent-rgb'], '193, 18, 31', 'tints follow the club colour');
  assert.ok(vars['--accent-soft'].includes('193, 18, 31'));
  assert.equal(vars['--accent-ink'], '#ffffff', 'readable ink chosen for a dark club colour');
});

test('a light club colour still gets readable ink drawn on it', () => {
  const vars = clubBrandVars({ primary: '#FFE24A', secondary: '#FFFFFF' });
  assert.equal(vars['--accent-ink'], '#0b141a', 'near-black ink on a light club colour');
});

test('clearing club colours returns to the CoachEasier defaults', () => {
  // No primary → NO overrides are produced, so the stylesheet defaults apply.
  assert.deepEqual(clubBrandVars(null), {});
  assert.deepEqual(clubBrandVars({}), {});
  assert.deepEqual(clubBrandVars({ primary: '' }), {});
  assert.deepEqual(clubBrandVars({ primary: 'not-a-colour' }), {});
  // …and applyClubBranding removes the inline property when a var is absent,
  // rather than leaving the previous club's value behind.
  const apply = src.slice(src.indexOf('function applyClubBranding()'), src.indexOf('async function settingsSaveClubBranding'));
  assert.match(apply, /else root\.style\.removeProperty\(v\)/, 'stale overrides are removed, not kept');
});

test('switching clubs cannot leak colours between tenants', () => {
  const apply = src.slice(src.indexOf('function applyClubBranding()'), src.indexOf('async function settingsSaveClubBranding'));
  // Every branded property is re-evaluated on each call; none is conditionally skipped.
  assert.match(apply, /\['--brand', '--brand-2'[\s\S]*?\]\.forEach/, 'all brand vars are reapplied together');
  // Club switching resets team-scoped state before re-applying branding.
  const sw = src.slice(src.indexOf('async function switchTeamTo'), src.indexOf('async function switchTeamTo') + 1800);
  assert.match(sw, /resetTeamScopedState\(\)/, 'team-scoped state is cleared on switch');
});

test('a club\'s stored colours are never overwritten by the defaults', () => {
  // The defaults are only ever used as `|| CE_DEFAULT_COLOURS.x` fallbacks.
  assert.match(src, /const CE_DEFAULT_COLOURS = \{ primary: '#8F6B2A', secondary: '#8E959D' \}/);
  assert.doesNotMatch(src, /state\.clubColours\s*=\s*CE_DEFAULT_COLOURS/, 'defaults are never written as club colours');
});

// ── Product presence ────────────────────────────────────────────────────────
test('login shows the CoachEasier name, mark and tagline', () => {
  const welcome = src.slice(src.indexOf("el.className = 'ce-welcome'"), src.indexOf('function welcomeLogin'));
  assert.match(welcome, /coacheasier-mark-on-light\.svg/, 'CoachEasier mark on the light welcome card');
  assert.match(welcome, /<h1>CoachEasier<\/h1>|>CoachEasier</, 'product name');
  assert.match(welcome, /IT&rsquo;S IN <span>OUR<\/span> GAME\./, 'tagline');
});

test('the signed-in app carries a restrained "Powered by CoachEasier" lockup', () => {
  assert.match(src, /class="ce-powered"><img src="\/brand\/svg\/coacheasier-mark-on-light\.svg"/, 'compact mark beside the credit');
  assert.match(src, /Powered by <span>CoachEasier<\/span>/, 'platform credit');
  // Exactly one such credit — not repeated on every card.
  assert.equal((src.match(/Powered by <span>CoachEasier<\/span>/g) || []).length, 1);
  assert.match(src, /\.ce-powered-mark \{[^}]*width: 13px/, 'the mark is small, not an advertisement');
});

test('the club logo remains the primary identity in the sidebar', () => {
  const apply = src.slice(src.indexOf('function applyClubBranding()'), src.indexOf('async function settingsSaveClubBranding'));
  // A club logo replaces the CoachEasier tile entirely; the CE mark is the fallback.
  assert.match(apply, /state\.clubLogo\s*\?\s*`background-image:url\(\$\{state\.clubLogo\}\)/, 'club logo wins on the badge');
  assert.match(apply, /markImg\.style\.display = state\.clubLogo \? 'none' : ''/, 'CE mark hides when a club logo exists');
});

test('Settings carries a CoachEasier product section with support and attribution', () => {
  const settings = src.slice(src.indexOf('function renderSettings()'), src.indexOf('function renderClubAdmin'));
  assert.match(settings, /CoachEasier Support<\/h2>/, 'product section heading');
  assert.match(settings, /coacheasier-mark-on-light\.svg/, 'product mark');
  assert.match(settings, /support@coacheasier\.com/, 'support address');
  assert.match(settings, /runs on <strong>CoachEasier<\/strong>/, 'concise platform attribution');
  assert.match(settings, /name, badge and colours stay yours/, 'states that club identity is retained');
});

test('Settings offers a reset back to the CoachEasier colours', () => {
  const settings = src.slice(src.indexOf('function renderSettings()'), src.indexOf('function renderClubAdmin'));
  assert.match(settings, /Reset to CoachEasier colours/, 'reset action present when a club has custom colours');
  assert.match(settings, /Using the CoachEasier colours/, 'states the default when none are set');
  const fn = src.slice(src.indexOf('async function settingsResetClubColours'), src.indexOf('// Pure: the CSS custom properties'));
  assert.match(fn, /state\.clubColours = null/, 'clears the stored colours');
  assert.match(fn, /applyClubBranding\(\)/, 'reapplies branding immediately');
});

// ── Old brand cleanup ───────────────────────────────────────────────────────
test('no stale Coach\'s Eye / CE Sports branding renders in the product', () => {
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const manifest = fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');
  for (const [name, text] of [['index.html', src], ['sw.js', sw], ['manifest.json', manifest]]) {
    for (const stale of [/coach['’]s eye/i, /coaches eye/i, /ce sports/i]) {
      assert.doesNotMatch(text, stale, `${name} still contains stale branding ${stale}`);
    }
  }
});

test('email templates use CoachEasier naming and the brand gold', () => {
  const email = fs.readFileSync(new URL('../api/_email.js', import.meta.url), 'utf8');
  assert.match(email, /CoachEasier <noreply@coacheasier\.com>/, 'sender identity');
  assert.equal((email.match(/background:#8F6B2A/g) || []).length, 3, 'all three CTAs use the brand gold');
  assert.equal(email.includes('background:#10b981'), false, 'no green CTA remains');
  for (const stale of [/coach['’]s eye/i, /ce sports/i]) {
    assert.doesNotMatch(email, stale, 'no stale brand in email copy');
  }
});

// ── Logo assets ─────────────────────────────────────────────────────────────
test('the brand marks are transparent, square and free of a baked-in backdrop', () => {
  for (const file of ['coacheasier-mark.svg', 'coacheasier-mark-on-light.svg']) {
    const svg = fs.readFileSync(new URL(`../brand/svg/${file}`, import.meta.url), 'utf8');
    assert.match(svg, /viewBox="0 0 1024 1024"/, `${file} keeps a square aspect ratio`);
    // The only full-bleed rect belongs to a <mask>, never a visible backdrop.
    const beforeRect = svg.slice(0, svg.indexOf('<rect'));
    assert.match(beforeRect, /<mask/, `${file}'s full-bleed rect is inside a mask, not a background`);
    assert.doesNotMatch(svg, /<rect[^>]*fill="#0{3,6}"[^>]*\/>\s*<(?!\/mask)/i, `${file} has no black backdrop`);
  }
});
