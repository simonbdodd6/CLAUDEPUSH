/**
 * PRODUCTION READINESS R2 — share metadata, security headers, accessible
 * names, branded 404.
 *
 * Continues the audit backlog after R1. Deliberately NOT in scope: analytics
 * of any kind (the product's zero-tracking posture is asserted here), and
 * sitemap.xml (nothing public to index yet).
 *
 * The CSP is an INTERIM policy: the product is one inline-heavy file with
 * inline event handlers, so script-src needs 'unsafe-inline' today. What it
 * does buy is a strict allow-list of WHERE code, styles, images, fonts and
 * connections may come from — every third-party host the app does not use is
 * blocked, along with framing, plugins, base-tag hijacking and off-site form
 * posts. Removing 'unsafe-inline' would require extracting the app's scripts
 * and handlers, which is a refactor, not a header change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const notFound = await readFile(new URL('../404.html', import.meta.url), 'utf8');
const robots = await readFile(new URL('../robots.txt', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

const head = src.slice(0, src.indexOf('</head>'));
const globalHeaders = vercel.headers.find(h => h.source === '/(.*)').headers;
const header = key => (globalHeaders.find(h => h.key === key) || {}).value;
const csp = header('Content-Security-Policy') || '';
const directive = name => {
  const m = csp.match(new RegExp(`(?:^|;\\s*)${name} ([^;]+)`));
  return m ? m[1].trim().split(/\s+/) : null;
};

// ─── 1–8: metadata ─────────────────────────────────────────────────────────
test('1+2: a truthful meta description ships, and the title is unchanged', () => {
  const desc = head.match(/<meta name="description" content="([^"]+)">/);
  assert.ok(desc, 'meta description present');
  assert.ok(desc[1].length > 60 && desc[1].length < 200, `sensible length (${desc[1].length})`);
  // Every claim must map to a feature that exists.
  for (const claim of ['squad selection', 'availability', 'training', 'fixtures']) {
    assert.match(desc[1].toLowerCase(), new RegExp(claim.split(' ')[0]), `mentions ${claim}`);
  }
  assert.match(head, /<title>CoachEasier<\/title>/, 'title untouched');
  assert.match(head, /<link rel="canonical" href="https:\/\/www\.coacheasier\.com\/">/, 'canonical points at production root');
});

test('3+4+5+6: Open Graph is complete and points at a real production asset', () => {
  const og = k => (head.match(new RegExp(`<meta property="og:${k}" content="([^"]+)">`)) || [])[1];
  assert.ok(og('title') && og('title').includes('CoachEasier'));
  assert.ok(og('description') && og('description').length > 40);
  assert.equal(og('type'), 'website');
  assert.equal(og('url'), 'https://www.coacheasier.com/');
  assert.equal(og('image'), 'https://www.coacheasier.com/brand/png/coacheasier-logo-master-1600.png',
    'absolute, stable URL for an existing brand asset');
  assert.ok(og('site_name') && og('image:alt'), 'site name + image alt present');
});

test('7: Twitter/X card metadata mirrors Open Graph', () => {
  const tw = k => (head.match(new RegExp(`<meta name="twitter:${k}" content="([^"]+)">`)) || [])[1];
  assert.equal(tw('card'), 'summary_large_image');
  assert.ok(tw('title') && tw('description') && tw('image'));
  assert.match(tw('image'), /^https:\/\/www\.coacheasier\.com\//, 'absolute image URL');
});

test('8: global metadata carries no club/customer data', () => {
  const metas = head.match(/<meta[^>]*>/g) || [];
  const joined = metas.join(' ');
  assert.doesNotMatch(joined, /boitsfort|\$\{|state\./i, 'nothing club-specific or templated in the head');
});

// ─── 9–17: headers ─────────────────────────────────────────────────────────
test('9+10+11+12: the R1 security headers are preserved exactly', () => {
  assert.equal(header('Strict-Transport-Security'), 'max-age=63072000; includeSubDomains');
  assert.equal(header('X-Frame-Options'), 'DENY');
  assert.equal(header('X-Content-Type-Options'), 'nosniff');
  assert.equal(header('Referrer-Policy'), 'strict-origin-when-cross-origin');
});

test('13+14: a CSP ships and allows every resource category the app really uses', () => {
  assert.ok(csp, 'CSP present');
  assert.deepEqual(directive('default-src'), ["'self'"]);
  // Scripts: the app's own inline code plus the two CDNs it genuinely loads
  // (html2canvas for shareable images, SheetJS for the fixture importer).
  const script = directive('script-src');
  assert.ok(script.includes("'self'") && script.includes("'unsafe-inline'"));
  assert.ok(script.includes('https://cdnjs.cloudflare.com'), 'html2canvas host allowed');
  assert.ok(script.includes('https://cdn.sheetjs.com'), 'SheetJS host allowed');
  // Styles + fonts: the inline stylesheet @imports Google Fonts.
  assert.ok(directive('style-src').includes('https://fonts.googleapis.com'));
  assert.ok(directive('font-src').includes('https://fonts.gstatic.com'));
  // Images: brand assets, generated data:/blob: URLs (photos, CSV/QR export)
  // and the QR service the invite screen renders.
  const img = directive('img-src');
  ['data:', 'blob:', 'https://api.qrserver.com'].forEach(v => assert.ok(img.includes(v), `img-src ${v}`));
  // Everything else the app does is same-origin.
  assert.deepEqual(directive('connect-src'), ["'self'"], 'all fetches are same-origin');
  assert.deepEqual(directive('worker-src'), ["'self'"], 'the service worker keeps working');
  assert.ok(directive('media-src').includes('blob:'));
});

test('15: the CSP has no wildcards and locks the passive attack surface', () => {
  assert.doesNotMatch(csp, /\*/, 'no wildcard sources at all');
  assert.doesNotMatch(csp, /unsafe-eval/, "no 'unsafe-eval' — the app needs none");
  assert.deepEqual(directive('object-src'), ["'none'"]);
  assert.deepEqual(directive('frame-src'), ["'none'"]);
  assert.deepEqual(directive('frame-ancestors'), ["'none'"], 'clickjacking blocked at CSP level too');
  assert.deepEqual(directive('base-uri'), ["'self'"], 'base-tag hijacking blocked');
  assert.deepEqual(directive('form-action'), ["'self'"], 'no off-site form posts');
});

test("the interim 'unsafe-inline' is scoped to what the single-file app needs", () => {
  // Honest boundary: inline SCRIPT and STYLE are permitted because the product
  // is one file with inline handlers. Nothing else relaxes.
  assert.ok(directive('script-src').includes("'unsafe-inline'"));
  assert.ok(directive('style-src').includes("'unsafe-inline'"));
  assert.doesNotMatch(csp, /connect-src[^;]*unsafe/, 'connections stay strict');
  // The app really does depend on inline handlers, so this is not removable
  // by a header change alone.
  assert.ok((src.match(/onclick="/g) || []).length > 100, 'inline handlers are pervasive — removal is a refactor');
});

test('16+17: Permissions-Policy denies capabilities the app verifiably does not use', () => {
  const pp = header('Permissions-Policy');
  assert.ok(pp, 'Permissions-Policy present');
  for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'midi',
                         'magnetometer', 'gyroscope', 'accelerometer', 'autoplay', 'fullscreen']) {
    assert.match(pp, new RegExp(`${feature}=\\(\\)`), `${feature} denied`);
    assert.doesNotMatch(src, new RegExp(`navigator\\.${feature}|requestFullscreen|getUserMedia`, 'i'),
      `${feature} genuinely unused`);
  }
  // Clipboard IS used (copy invite links) — it must NOT be denied.
  assert.doesNotMatch(pp, /clipboard/, 'clipboard left alone because the app copies invite links');
  assert.match(src, /navigator\.clipboard/, 'clipboard really is used');
});

// ─── 18–22: accessibility ──────────────────────────────────────────────────
test('18: every control the audit flagged now has an accessible name', () => {
  // CONTRACT CHANGE (Build T): the audit's headline five — the Club Admin
  // inline fixture row (adm-fx-*) — were REMOVED entirely, replaced by the
  // canonical add/import buttons. A control that no longer exists needs no
  // label; the audit's intent (no unnamed control) is re-pinned against the
  // replacements, whose visible text IS their accessible name.
  assert.ok(!/id="adm-fx-/.test(src), 'the flagged inline row is gone, not unlabelled');
  const adminStart = src.indexOf('function renderClubAdmin');
  const adminSlice = src.slice(adminStart, adminStart + 30000);
  for (const btn of ['fixtureAddOpen()', "fixtureImportOpen('csv')", "fixtureImportOpen('xlsx')"]) {
    const at = adminSlice.indexOf(btn);
    assert.ok(at > -1, btn + ' replacement exists');
    const tag = adminSlice.slice(adminSlice.lastIndexOf('<button', at), adminSlice.indexOf('</button>', at));
    assert.match(tag, />\s*[^<\s]/, btn + ' has visible text (its accessible name)');
  }
  // …plus the club identity fields, session title, staff level, access level,
  // the weekly-automation day/time pickers and the fixture-import mapping.
  for (const needle of [
    'aria-label="Club name"', 'aria-label="Team name"', 'aria-label="Season name"',
    'aria-label="Session title"', 'aria-label="Staff level"',
    'aria-label="Staff level for ${', 'aria-label="Access level for ${',
    'aria-label="${esc(label)} — day"', 'aria-label="${esc(label)} — time"',
    'aria-label="Map spreadsheet column ', 'aria-label="What to do with this possible duplicate fixture"',
  ]) {
    assert.ok(src.includes(needle), `missing accessible name: ${needle}`);
  }
});

test('19+20+21: labels are additive — ids, handlers and values are untouched', () => {
  // CONTRACT CHANGE (Build T): the adm-fx-* row and its handler are gone —
  // those pins moved with them. The surviving R2 subjects stay pinned.
  assert.ok(!src.includes("adminAddFixture"), 'the legacy handler was removed with its row');
  const access = src.match(/<select aria-label="Access level for[^>]*>/)[0];
  assert.doesNotMatch(access, /value=/, 'no value injected');
  assert.match(src, /onchange="adminSetAccessProfile\('\$\{esc\(member\.id\)\}',this\.value/, 'its handler is intact');
});

test('22: labelling changed no layout — every addition is an attribute, not markup', () => {
  // A new visible <label> element would reflow the admin grids; aria-label
  // cannot. Assert we added no new label elements around these controls.
  const adminStart = src.indexOf('function renderClubAdmin');
  const adminSlice = src.slice(adminStart, adminStart + 20000);
  const labelsBefore = (adminSlice.match(/<label/g) || []).length;
  assert.ok(labelsBefore >= 0);
  assert.doesNotMatch(src, /<label[^>]*>\s*<input id="adm-fx-(date|time)"/, 'no wrapper label added around the date/time inputs');
});

// ─── 23–28: branded 404 + route integrity ──────────────────────────────────
test('23: the branded 404 is a plain static page — no routing change at all', () => {
  assert.match(notFound, /^<!doctype html>/i);
  assert.match(notFound, /Page not found/);
  assert.match(notFound, /CoachEasier/);
  assert.match(notFound, /href="\/"/, 'return link');
  assert.match(notFound, /mailto:support@coacheasier\.com/, 'support link');
  assert.doesNotMatch(notFound, /<script/i, 'no script');
  assert.doesNotMatch(notFound, /DRAFT/, 'it is not a legal page');
  assert.match(notFound, /name="viewport"/, 'mobile-ready');
});

test('24–28: no rewrite was added for the 404 — existing routes are untouched', () => {
  // Vercel serves /404.html for unmatched paths by convention; adding a
  // catch-all rewrite would have swallowed /api/*, which is exactly the risk
  // the audit flagged.
  const sources = vercel.rewrites.map(r => r.source);
  assert.deepEqual(sources.sort(), ['/api/reminder', '/api/roster', '/privacy', '/terms'].sort(),
    'still exactly the four known rewrites — no catch-all');
  assert.ok(!sources.some(s => s.includes('(.*)') || s === '/:path*'), 'no catch-all route added');
  assert.equal(vercel.outputDirectory, '.');
});

// ─── 29+30: posture unchanged ──────────────────────────────────────────────
test('29: public signup is untouched by R2', () => {
  const all = src + notFound + robots + JSON.stringify(vercel);
  assert.doesNotMatch(all, /PUBLIC_CLUB_SIGNUP\s*[:=]\s*['"]?true/, 'the flag is never set here');
});

test('30: zero analytics or tracking was introduced, and none existed', () => {
  const all = src + notFound + JSON.stringify(vercel);
  for (const vendor of ['googletagmanager', 'google-analytics', 'gtag(', 'connect.facebook.net',
                        'hotjar', 'posthog', '@vercel/analytics', 'mixpanel', 'plausible', 'Sentry.init']) {
    assert.equal(all.includes(vendor), false, `${vendor} must not be present`);
  }
  // …and the CSP would block them anyway, which is the point.
  assert.equal(directive('connect-src').length, 1, 'no third-party beacon destination is permitted');
});

test('no sitemap was added and robots.txt still blocks the app (R1 behaviour preserved)', () => {
  assert.match(robots, /^Disallow: \/$/m);
  assert.doesNotMatch(robots, /^Sitemap:/m);
});
