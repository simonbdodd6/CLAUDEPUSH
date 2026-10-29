/**
 * THE INVITATION EMAIL CANNOT BE SCRIPTED BY A CLUB NAME (Nick onboarding loop 2).
 *
 * api/_email.js inviteEmail() interpolates the resolved club name into the HTML
 * body. Club names are admin-supplied text — trimmed and bounded (80 chars) but
 * never checked for markup — at provisioning (provisionClub), at self-service
 * creation (createClub) and in the Settings save (publish.js clubHandler). The
 * claim screen already escapes the name (index.html showInviteModal, esc());
 * the HTML email did not. The subject and the plain-text body are not HTML and
 * must keep the name verbatim; the "your club" fallback must survive; the
 * precedence (config record → tenant record → legacy default → '') is
 * untouched and is pinned by test/invite-club-name.test.js.
 *
 * Unit pins on inviteEmail() (1–8), then the real handlers end to end (9–10):
 * the name arrives through inviteClubName exactly as production resolves it,
 * and the provider receives an escaped HTML body and a verbatim text body.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.UPSTASH_REDIS_REST_URL   = 'https://redis.invite-email-html-escaping.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX           = 'app';
delete process.env.PUBLIC_CLUB_SIGNUP;

const kv = new Map();
/** Every email handed to the provider, as the provider would receive it. */
const sentEmails = [];
globalThis.fetch = async (url, options = {}) => {
  if (String(url).startsWith('https://api.resend.com')) {
    try { sentEmails.push(JSON.parse(options.body || '{}')); } catch { sentEmails.push({}); }
    return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
  }
  const [command, ...args] = JSON.parse(options.body || '[]');
  let result = null;
  if (command === 'GET')  result = kv.has(args[0]) ? kv.get(args[0]) : null;
  if (command === 'SET') { kv.set(args[0], args[1]); result = 'OK'; }
  if (command === 'DEL') { kv.delete(args[0]); result = 1; }
  if (command === 'INCR') { const n = Number(kv.get(args[0]) || 0) + 1; kv.set(args[0], String(n)); result = n; }
  if (command === 'SCAN') {
    const at = args.indexOf('MATCH');
    const pat = at >= 0 ? String(args[at + 1]) : '*';
    const re = new RegExp(`^${pat.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    result = ['0', [...kv.keys()].filter(k => re.test(k))];
  }
  if (command === 'LRANGE') result = [];
  if (command === 'LPUSH' || command === 'LTRIM' || command === 'EXPIRE') result = 1;
  return { ok: true, json: async () => ({ result }) };
};

const { inviteEmail } = await import('../api/_email.js');
const { default: identityHandler } = await import('../api/identity.js');
const { default: inviteHandler } = await import('../api/invite.js');
const store = await import('../api/_identityStore.js');

const CLAIM_URL = 'https://www.coacheasier.com/?inv=tok_test';
/** The five characters HTML gives meaning to, in one name. */
const META = `Tom & Jerry's "Rugby" <Club>`;
const META_ESCAPED = 'Tom &amp; Jerry&#39;s &quot;Rugby&quot; &lt;Club&gt;';

/** The element names the template itself uses — nothing else may appear. */
const TEMPLATE_TAGS = ['div', 'h2', 'p', 'a'];
const tagNames = html => [...String(html).matchAll(/<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/g)].map(m => m[1].toLowerCase());
const foreignTags = html => [...new Set(tagNames(html))].filter(t => !TEMPLATE_TAGS.includes(t));
const h2Inner = html => { const m = String(html).match(/<h2>([\s\S]*?)<\/h2>/); return m ? m[1] : null; };

// ── Unit: inviteEmail() ──────────────────────────────────────────────────────

test('1. the HTML body escapes a club name that is a <script> element', () => {
  const m = inviteEmail({ name: 'Pat', teamName: '<script>alert(1)</script> RFC', url: CLAIM_URL });
  assert.ok(m.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; RFC'), 'the name is text, entity-escaped');
  assert.doesNotMatch(m.html, /<script/i, 'no script element anywhere in the HTML body');
  assert.equal(h2Inner(m.html), "You're invited to join &lt;script&gt;alert(1)&lt;/script&gt; RFC");
});

test('2. the HTML body escapes every HTML metacharacter in the club name (& < > " \')', () => {
  const m = inviteEmail({ name: 'Pat', teamName: META, url: CLAIM_URL });
  assert.ok(m.html.includes(META_ESCAPED), `escaped form present in: ${h2Inner(m.html)}`);
  assert.equal(m.html.includes('<Club>'), false, 'the raw angle-bracketed word never reaches the HTML');
});

test('3. a club name cannot close the heading or add an element', () => {
  const m = inviteEmail({ name: 'Pat', teamName: 'Newbridge</h2><img src=x onerror=alert(1)> RFC', url: CLAIM_URL });
  assert.deepEqual(foreignTags(m.html), [], `only the template's own elements, saw: ${tagNames(m.html).join(' ')}`);
  assert.equal(tagNames(m.html).filter(t => t === 'h2').length, 2, 'one heading, opened once and closed once');
  assert.doesNotMatch(m.html, /<img/i);
  assert.ok(m.html.includes('Newbridge&lt;/h2&gt;&lt;img src=x onerror=alert(1)&gt; RFC'));
});

test('4. a club name cannot inject a second link', () => {
  const m = inviteEmail({ name: 'Pat', teamName: '<a href="https://evil.test">Claim here</a> RFC', url: CLAIM_URL });
  const hrefs = [...m.html.matchAll(/href="([^"]*)"/g)].map(x => x[1]);
  assert.deepEqual(hrefs, [CLAIM_URL], 'the claim link is the only link');
  assert.equal(tagNames(m.html).filter(t => t === 'a').length, 2, 'one anchor, opened once and closed once');
  assert.equal(m.html.includes('evil.test">'), false);
});

test('5. the subject and the plain-text body carry the club name verbatim — they are not HTML', () => {
  const m = inviteEmail({ name: 'Pat', teamName: META, url: CLAIM_URL });
  assert.equal(m.subject, `You're invited to join ${META} on CoachEasier`);
  assert.ok(m.text.includes(`You've been invited to join ${META} on CoachEasier.`));
  assert.equal(/&(amp|lt|gt|quot|#39);/.test(m.subject + m.text), false, 'no HTML entities leak into plain text');
});

test('6. an ordinary club name renders exactly as before', () => {
  for (const name of ['Boitsfort RFC', 'Stade Français Rugby', 'Newbridge RFC U18 — Girls']) {
    const m = inviteEmail({ name: 'Pat', teamName: name, url: CLAIM_URL });
    assert.equal(h2Inner(m.html), `You're invited to join ${name}`);
    assert.equal(m.subject, `You're invited to join ${name} on CoachEasier`);
    assert.ok(m.text.includes(`join ${name} on CoachEasier`));
  }
});

test('7. an empty, blank or missing club name still says "your club" in subject, text and HTML', () => {
  for (const teamName of ['', '   ', undefined, null]) {
    const m = inviteEmail({ name: 'Pat', teamName, url: CLAIM_URL });
    assert.equal(m.subject, "You're invited to join your club on CoachEasier");
    assert.ok(m.text.includes('join your club on CoachEasier'));
    assert.equal(h2Inner(m.html), "You're invited to join your club");
  }
});

test('8. the invitee name — the other text the template interpolates — is escaped in HTML and verbatim in text', () => {
  const m = inviteEmail({ name: "<b>Pat</b> O'Neill", teamName: 'Newbridge RFC', url: CLAIM_URL });
  assert.ok(m.html.includes('<p>Hi &lt;b&gt;Pat&lt;/b&gt; O&#39;Neill,</p>'), m.html);
  assert.ok(m.text.includes("Hi <b>Pat</b> O'Neill,"));
  assert.deepEqual(foreignTags(m.html), []);
});

// ── End to end: the real handlers, the real name resolution ─────────────────

function makeRes() {
  return { code: 0, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(n, v) { this.headers[n] = v; },
    end(b) { this.body = this.body ?? b ?? null; return this; } };
}
async function call(handler, { method = 'GET', query = {}, body = null, token = '' } = {}) {
  const res = makeRes();
  await handler({ method, url: '/api', query, body, on() {},
    headers: { 'content-type': 'application/json', host: 'test.local',
               cookie: token ? `ce_session=${token}` : '' } }, res);
  return res;
}
const identity = (body, token) => call(identityHandler, { method: 'POST', body, token });
const inviteCreate = (body, token) => call(inviteHandler, { method: 'POST', body, token });
const inviteValidate = token => call(inviteHandler, { method: 'GET', query: { token } });
const tokenOf = res => String(res.headers['Set-Cookie'] || '').split(';')[0].split('=')[1];
const lastEmail = () => sentEmails[sentEmails.length - 1];

/** An EMPTY world plus the single platform administrator production has. */
function emptyWorld() {
  kv.clear();
  sentEmails.length = 0;
  kv.set('app:identity:users', JSON.stringify([
    { id: 'u-platform', email: 'platform@coacheasier.com', displayName: 'Platform Admin', platformRole: 'platform_admin' },
  ]));
  kv.set('app:identity:teams', JSON.stringify([]));
  kv.set('app:identity:team_members', JSON.stringify([]));
  kv.set('app:identity:player_profiles', JSON.stringify([]));
}
async function provision(clubName, adminEmail) {
  const platform = await store.createSession({ userId: 'u-platform', teamId: 'none', role: 'coach' });
  const r = await identity({ action: 'provision_club', clubName, adminEmail, adminName: 'Frankie Founder' }, platform.token);
  assert.equal(r.code, 201, JSON.stringify(r.body));
  return { clubId: r.body.team.id, founderToken: decodeURIComponent(String(r.body.inviteUrl).split('inv=')[1]) };
}
async function claimFounder(club, adminEmail) {
  const claimed = await identity({ action: 'claim_invite', token: club.founderToken, email: adminEmail,
    name: 'Frankie Founder', password: 'longEnough123' });
  assert.equal(claimed.code, 201, JSON.stringify(claimed.body));
  return tokenOf(claimed);
}
const withMailer = async fn => { process.env.RESEND_API_KEY = 'test-key'; try { return await fn(); } finally { delete process.env.RESEND_API_KEY; } };

test('9. end to end: a club-config name holding markup reaches the provider escaped in HTML, verbatim in text, and raw (as data) on the claim screen', async () => {
  emptyWorld();
  const club = await provision('Newbridge RFC', 'founder@newbridge.test');
  const session = await claimFounder(club, 'founder@newbridge.test');
  const hostile = 'Newbridge</h2><img src=x onerror=alert(1)> RFC';
  // What the Settings save (publish.js clubHandler) stores: trimmed, bounded, unchecked.
  kv.set(`app:club:${club.clubId}`, JSON.stringify({ clubName: hostile }));
  const r = await withMailer(() => inviteCreate({ name: 'Pat Player', role: 'player',
    email: 'pat@newbridge.test', sendEmail: true }, session));
  assert.equal(r.code, 201, JSON.stringify(r.body));
  assert.equal(r.body.emailDelivery.sent, true);
  const email = lastEmail();
  assert.doesNotMatch(String(email.html), /<img/i, 'no element arrives from the club name');
  assert.ok(String(email.html).includes('Newbridge&lt;/h2&gt;&lt;img src=x onerror=alert(1)&gt; RFC'));
  assert.deepEqual(foreignTags(email.html), []);
  assert.equal(email.subject, `You're invited to join ${hostile} on CoachEasier`);
  assert.ok(String(email.text).includes(`join ${hostile} on CoachEasier`));
  // The claim screen receives the stored name as JSON data; index.html renders it through esc().
  assert.equal((await inviteValidate(r.body.token)).body.teamName, hostile);
});

test('10. end to end: a provisioned club named with metacharacters is escaped through the tenant-record path too', async () => {
  emptyWorld();
  const club = await provision(META, 'founder@tomjerry.test');
  const session = await claimFounder(club, 'founder@tomjerry.test');
  assert.equal(kv.has(`app:club:${club.clubId}`), false, 'precondition: the tenant record is the only name');
  const r = await withMailer(() => inviteCreate({ name: 'Pat Player', role: 'player',
    email: 'pat@tomjerry.test', sendEmail: true }, session));
  assert.equal(r.code, 201, JSON.stringify(r.body));
  const email = lastEmail();
  assert.ok(String(email.html).includes(META_ESCAPED), h2Inner(email.html));
  assert.equal(String(email.html).includes('<Club>'), false);
  assert.equal(email.subject, `You're invited to join ${META} on CoachEasier`);
});
