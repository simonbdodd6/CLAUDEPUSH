/**
 * R3 — LEGAL CONTENT READINESS.
 *
 * The /privacy and /terms shells now carry substantive drafts. Every factual
 * statement in them must be backed by how CoachEasier actually behaves, and
 * every fact that is NOT yet established must stay visibly unresolved.
 *
 * These tests are the honesty harness: they check the documents against the
 * real product (session/invite/verification expiries, the medical permission,
 * the absence of tracking, the absence of live payments) and they fail if the
 * drafts start claiming things the product cannot support — a compliance
 * badge, a jurisdiction, a retention timetable, or that anyone is being
 * charged. They also hold the line that no legal acceptance is captured while
 * the documents remain drafts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const privacy = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
const terms = await readFile(new URL('../terms.html', import.meta.url), 'utf8');
const src = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const store = await readFile(new URL('../api/_identityStore.js', import.meta.url), 'utf8');
const invite = await readFile(new URL('../api/invite.js', import.meta.url), 'utf8');
const permissions = await readFile(new URL('../api/_permissions.js', import.meta.url), 'utf8');
const identity = await readFile(new URL('../api/identity.js', import.meta.url), 'utf8');
const security = await readFile(new URL('../api/_security.js', import.meta.url), 'utf8');
const both = privacy + terms;
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const privacyText = text(privacy), termsText = text(terms), bothText = privacyText + ' ' + termsText;

// ─── 1–6: the pages still behave as pages ──────────────────────────────────
test('1+2+3+4+5+6: both pages stay standalone, script-free, mobile-safe and reachable', () => {
  for (const [name, page] of [['privacy', privacy], ['terms', terms]]) {
    assert.match(page, /^<!doctype html>/i, `${name} is a complete document`);
    assert.doesNotMatch(page, /<script/i, `${name} runs no script`);
    assert.doesNotMatch(page, /localStorage|\/api\/|coach-eye-real-workflow/, `${name} needs no account and touches no app data`);
    assert.match(page, /name="viewport"/, `${name} is mobile-ready`);
    assert.match(page, /max-width: 720px/, `${name} caps its column`);
    assert.match(page, /mailto:support@coacheasier\.com/, `${name} shows support contact`);
    assert.match(page, /href="\/"/, `${name} links back to the app`);
    assert.match(page, /noindex/, `${name} stays unindexed while in draft`);
  }
});

// ─── 7+8+9: the sections that matter most exist ────────────────────────────
test('7: youth participants get their own section in both documents', () => {
  assert.match(privacyText, /Youth participants/i);
  assert.match(termsText, /Youth participants/i);
  assert.match(privacyText, /under 18/, 'the privacy page names the age boundary plainly');
  assert.match(privacyText, /does not market to children/i, 'and states what CoachEasier does not do');
});

test('8: injury/medical information is covered honestly in both documents', () => {
  assert.match(privacyText, /Injury and medical information/i);
  assert.match(termsText, /Injury and medical information/i);
  // The product facts: medical access is a permission, scoped by group.
  assert.match(permissions, /MEDICAL_ACCESS/, 'a medical permission really exists');
  assert.match(privacyText, /only to club users who hold medical access/i, 'access description matches the product');
  // The disclaimers that must never be dropped.
  for (const page of [privacyText, termsText]) {
    assert.match(page, /not.{0,40}a medical device/i, 'not a medical device');
    assert.match(page, /healthcare provider/i, 'not a healthcare provider');
  }
  assert.match(privacyText, /does not diagnose/i, 'no diagnosis claim');
});

test('9: service providers are listed, and only ones actually used', () => {
  assert.match(privacyText, /Vercel/, 'hosting');
  assert.match(privacyText, /Upstash/, 'storage');
  assert.match(privacyText, /Resend/, 'transactional email');
  assert.match(privacyText, /push service/i, 'browser push');
  assert.match(privacyText, /api\.qrserver\.com/, 'the QR service that receives invitation links is disclosed');
  // …and the disclosure matches the code that calls it.
  assert.match(src, /api\.qrserver\.com/, 'the app really calls that service');
  // Nothing invented: no vendor we do not use.
  for (const absent of ['Google Analytics', 'Mixpanel', 'Segment', 'Hotjar', 'PostHog', 'Cloudflare Workers', 'AWS', 'Mailchimp']) {
    assert.equal(bothText.includes(absent), false, `${absent} is not used and must not be listed`);
  }
});

// ─── 10–13: claims the drafts must NOT make ────────────────────────────────
test('10: no compliance badge is claimed', () => {
  assert.doesNotMatch(bothText, /\b(GDPR|UK GDPR|CCPA|HIPAA|ISO ?27001|SOC ?2)[- ]?(compliant|certified)\b/i);
  assert.doesNotMatch(bothText, /fully compliant|guarantees? (your )?(privacy|security)/i);
});

test('11: no jurisdiction, entity or address is invented', () => {
  assert.match(termsText, /\[LEGAL ENTITY TO BE CONFIRMED\]/, 'the operator is explicitly unresolved');
  assert.match(termsText, /\[REGISTERED ADDRESS TO BE CONFIRMED\]/);
  assert.match(privacyText, /\[LEGAL ENTITY TO BE CONFIRMED\]/);
  assert.match(termsText, /governing law and the courts.{0,60}have not yet been settled/i, 'governing law openly unresolved');
  assert.doesNotMatch(bothText, /governed by the laws of|courts of (England|Ireland|Belgium|Scotland)/i);
  assert.doesNotMatch(bothText, /\b(Ltd\.?|LLC|GmbH|SPRL|BVBA|Inc\.)\b/);
});

test('12: no retention timetable is invented, and the expiries stated ARE the real ones', () => {
  assert.doesNotMatch(bothText, /we (retain|keep|delete).{0,40}\b(for|after) \d+ (days|months|years)/i,
    'no invented retention period');
  assert.match(privacyText, /\[TO BE CONFIRMED: a published retention schedule/i, 'retention openly unresolved');
  // The concrete lifetimes the page DOES state must match the code.
  assert.match(store, /SESSION_TTL_MS = 1000 \* 60 \* 60 \* 24 \* 30/, 'sessions really are 30 days');
  assert.match(privacyText, /sessions expire after 30 days/i);
  assert.match(invite, /INVITE_TTL_MS = 1000 \* 60 \* 60 \* 24 \* 14/, 'invites really are 14 days');
  assert.match(privacyText, /invitations expire after 14 days/i);
  assert.match(store, /EMAIL_VERIFICATION_TTL_MS = 1000 \* 60 \* 60 \* 24\b/, 'verification really is 24 hours');
  assert.match(privacyText, /verification links expire after 24 hours/i);
});

test('13: the drafts do not claim anyone is being charged', () => {
  assert.match(termsText, /No subscription is charged today/i);
  assert.match(privacyText, /No payments are processed today/i);
  assert.doesNotMatch(bothText, /your subscription will be billed|we will charge your card|Upgrade to Pro/i);
  // …which matches the product: no client-side payment integration exists.
  assert.doesNotMatch(src, /js\.stripe\.com/, 'no Stripe.js in the client');
});

test('the zero-tracking statement matches the product exactly', () => {
  assert.match(privacyText, /no advertising, analytics or tracking software of any kind/i);
  for (const vendor of ['googletagmanager', 'google-analytics', 'gtag(', 'connect.facebook.net', 'hotjar', 'posthog', 'mixpanel']) {
    assert.equal(src.includes(vendor), false, `${vendor} would make the statement false`);
  }
  assert.match(privacyText, /one cookie, which keeps\s*you signed in/i, 'the single-cookie claim');
  assert.match(store, /sessionCookie/, 'that cookie really is the session cookie');
});

test('security wording promises effort, not guarantees — and describes real measures', () => {
  assert.match(privacyText, /No online service can promise perfect security, and we do not\s*make that promise/i);
  // Each measure named is one the product actually implements.
  assert.match(privacyText, /salted hashes/i);      assert.match(store, /hashPassword|scryptSync/);
  assert.match(privacyText, /hashed tokens/i);      assert.match(store, /tokenHash/);
  assert.match(privacyText, /rate-limited/i);       assert.match(security, /export async function enforceRateLimit/);
  assert.match(privacyText, /stored separately/i);   assert.match(store, /teamId/);
});

// ─── 14: unresolved facts stay visible ─────────────────────────────────────
test('14: every material unknown is visibly marked, and the DRAFT banner remains', () => {
  for (const [name, page, min] of [['privacy', privacy, 5], ['terms', terms, 5]]) {
    assert.match(page, /DRAFT — pending final legal review/, `${name} keeps the draft banner`);
    assert.match(page, /Last updated: <strong>not yet published<\/strong>/, `${name} publishes no date`);
    const marks = (page.match(/\[TO BE CONFIRMED|\[LEGAL ENTITY TO BE CONFIRMED\]|\[REGISTERED ADDRESS TO BE CONFIRMED\]/g) || []).length;
    assert.ok(marks >= min, `${name} marks its unknowns (${marks})`);
  }
  // The specific unknowns the audit called out are each present.
  for (const topic of [/role.{0,40}under applicable data-protection law/i, /consent and guardian arrangements/i,
                       /lawful basis/i, /retention schedule/i, /list of service providers/i,
                       /limitation-of-liability/i]) {
    assert.match(bothText, topic, `unresolved topic marked: ${topic}`);
  }
});

// ─── 15+16: no consent captured, signup still closed ───────────────────────
test('15: the signup wizard still links the policies without recording acceptance', () => {
  const wizard = src.slice(src.indexOf('id="cw-finish-btn"') - 200, src.indexOf('id="cw-finish-btn"') + 1200)
    .replace(/<!--[\s\S]*?-->/g, '');
  assert.match(wizard, /href="\/privacy"/);
  assert.match(wizard, /href="\/terms"/);
  assert.doesNotMatch(wizard, /type="checkbox"/, 'no acceptance control while the documents are drafts');
  assert.doesNotMatch(wizard, /you agree to|By (creating|signing)/i, 'no false agreement claim');
  assert.doesNotMatch(src, /acceptedTermsVersion|acceptedPrivacyVersion|termsAcceptedAt/i,
    'nothing records consent to a draft');
});

test('16: public signup remains closed by this change', () => {
  assert.doesNotMatch(both, /PUBLIC_CLUB_SIGNUP/);
  assert.match(identity, /PUBLIC_CLUB_SIGNUP !== 'true'/, 'the server gate still exists');
  assert.match(identity, /Club creation is not open yet/, 'and still refuses with the closed-beta copy');
});

// ─── 17: R1/R2 surfaces untouched ──────────────────────────────────────────
test('17: R1 route/support wiring and R2 metadata are unaffected', () => {
  assert.match(src, /<meta name="description" content="CoachEasier is team management/, 'R2 description intact');
  assert.match(src, /<meta property="og:image" content="https:\/\/www\.coacheasier\.com\/brand/, 'R2 OG intact');
  assert.match(src, /href="\/privacy"/, 'links still in the app');
  assert.match(src, /const fallbackId = state\.activeView === "coach"/, 'R1 route recovery intact');
});
