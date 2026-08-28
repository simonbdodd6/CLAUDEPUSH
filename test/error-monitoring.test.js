/**
 * H3 — production error monitoring.
 *
 * Two guarantees matter more than the rest and are tested hardest:
 *   1. Routine refusals (401/403/404/…) are NOT incidents. Monitoring that
 *      cries wolf gets ignored, and then it is worse than none.
 *   2. No credential can ever reach the error log. H1 (f8859e47) removed live
 *      invitation tokens from server logs; an error reporter that attaches
 *      "the page the user was on" would put them straight back, because an
 *      invite link IS `/?inv=<token>`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeErrorReport, isReportableStatus, safeUrl, scrubText, scrubStack,
  ERROR_KINDS, EXPECTED_STATUSES, MAX_ENTRIES,
} from '../api/_errorLog.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const REAL_TOKEN = 'Xk9fQ2mPz7Lw4Rt8Yn3Bv6Hd1Gs5Jc0A';   // shaped like randomBytes(24).base64url

// ─── Noise control ──────────────────────────────────────────────────────────

test('MON-1: routine refusals are never treated as incidents', () => {
  for (const status of EXPECTED_STATUSES) {
    assert.equal(isReportableStatus(status), false, `${status} must not be an incident`);
    assert.equal(
      normalizeErrorReport({ kind: 'api_failure', message: `API ${status}`, status }),
      null, `${status} must not be recorded`);
  }
  // The ones that ARE our fault.
  for (const status of [500, 502, 503, 504, 599]) {
    assert.equal(isReportableStatus(status), true, `${status} is a real failure`);
    assert.ok(normalizeErrorReport({ kind: 'api_failure', message: `API ${status}`, status }),
      `${status} must be recorded`);
  }
  assert.equal(isReportableStatus(undefined), false);
  assert.equal(isReportableStatus('nonsense'), false);
});

test('MON-2: only known kinds are accepted, and a message is required', () => {
  assert.equal(normalizeErrorReport({ kind: 'marketing', message: 'buy this' }), null);
  assert.equal(normalizeErrorReport({ kind: 'uncaught', message: '' }), null);
  assert.equal(normalizeErrorReport(null), null);
  assert.equal(normalizeErrorReport('a string'), null);
  for (const kind of ERROR_KINDS.filter(k => k !== 'api_failure')) {
    assert.ok(normalizeErrorReport({ kind, message: 'x is not a function' }), `${kind} accepted`);
  }
});

// ─── The credential guarantee ───────────────────────────────────────────────

test('MON-3: a URL keeps origin and path only — never a query or fragment', () => {
  assert.equal(safeUrl(`https://www.coacheasier.com/?inv=${REAL_TOKEN}`), 'https://www.coacheasier.com/');
  assert.equal(safeUrl(`/?inv=${REAL_TOKEN}`), '/');
  assert.equal(safeUrl('https://x.test/a/b?token=abc#frag'), 'https://x.test/a/b');
  assert.equal(safeUrl('/api/identity?action=reset_password&token=abc'), '/api/identity');
  // The guarantee is structural: a parameter invented tomorrow is redacted by
  // today's rule, because EVERY query string is dropped.
  assert.equal(safeUrl('/x?future_secret=abc'), '/x');
  assert.equal(safeUrl(''), '');
});

test('MON-4: an invitation token cannot survive a full report, by any route', () => {
  const entry = normalizeErrorReport({
    kind: 'uncaught',
    message: `Failed to claim invite at https://www.coacheasier.com/?inv=${REAL_TOKEN}`,
    route: `/?inv=${REAL_TOKEN}`,
    source: `https://www.coacheasier.com/index.html?inv=${REAL_TOKEN}`,
    stack: `at claim (https://www.coacheasier.com/?inv=${REAL_TOKEN}:12:3)`,
    agent: 'Mozilla/5.0',
  }, { version: 'abc1234' });
  const serialised = JSON.stringify(entry);
  assert.ok(!serialised.includes(REAL_TOKEN), 'the token must not appear anywhere in the record');
  assert.ok(!serialised.includes('inv='), 'nor the parameter that carries it');
  // And the record is still useful.
  assert.match(entry.message, /Failed to claim invite/);
  assert.equal(entry.route, '/');
  assert.equal(entry.version, 'abc1234');
});

test('MON-5: credential-shaped key/value pairs are scrubbed from free text', () => {
  for (const k of ['inv', 'invite', 'token', 'reset', 'password', 'session', 'bearer', 'secret', 'auth', 'key', 'code']) {
    const out = scrubText(`request failed ${k}=${REAL_TOKEN} after retry`);
    assert.ok(!out.includes(REAL_TOKEN), `${k}= must be scrubbed (got: ${out})`);
    assert.ok(out.includes('[redacted]'), `${k}= must be marked redacted`);
  }
  assert.ok(!scrubText(`token: ${REAL_TOKEN}`).includes(REAL_TOKEN), 'colon form too');
  // Ordinary text is left alone — a scrubber that eats the message is useless.
  assert.equal(scrubText('Cannot read properties of undefined (reading \'time\')'),
    'Cannot read properties of undefined (reading \'time\')');
});

test('MON-6: stacks are trimmed and their frame URLs stripped', () => {
  const stack = [
    'TypeError: x is not a function',
    `    at a (https://www.coacheasier.com/?inv=${REAL_TOKEN}:10:5)`,
    '    at b (https://www.coacheasier.com/index.html:20:5)',
    '    at c (https://www.coacheasier.com/index.html:30:5)',
    '    at d (https://www.coacheasier.com/index.html:40:5)',
    '    at e (https://www.coacheasier.com/index.html:50:5)',
    '    at f (https://www.coacheasier.com/index.html:60:5)',
  ].join('\n');
  const out = scrubStack(stack);
  assert.ok(!out.includes(REAL_TOKEN), 'no token survives a stack frame');
  assert.ok(out.includes('TypeError: x is not a function'), 'the useful first line is kept');
  assert.ok(out.length <= 500, 'bounded');
  assert.ok((out.match(/ at /g) || []).length <= 5, 'only the top frames are kept');
});

test('MON-7: no field can be used as unbounded storage', () => {
  const big = 'A'.repeat(50000);
  const entry = normalizeErrorReport({
    kind: 'uncaught', message: big, route: big, source: big, stack: big, agent: big,
    ref: '../../etc/passwd; DROP TABLE',
  });
  assert.ok(entry.message.length <= 300);
  assert.ok(entry.route.length <= 120);
  assert.ok(entry.source.length <= 200);
  assert.ok(entry.stack.length <= 500);
  assert.ok(entry.agent.length <= 120);
  assert.match(entry.ref, /^[A-Za-z0-9_-]*$/, 'correlation ref is sanitised to a safe charset');
  assert.ok(JSON.stringify(entry).length < 1500, 'one record stays small');
  assert.equal(MAX_ENTRIES, 200, 'and the list itself is capped');
});

test('MON-8: a report carries no identity', () => {
  const entry = normalizeErrorReport({
    kind: 'uncaught', message: 'boom',
    userId: 'user_123', email: 'coach@club.test', name: 'Cara Coach', password: 'hunter2',
  });
  const serialised = JSON.stringify(entry);
  for (const leak of ['user_123', 'coach@club.test', 'Cara Coach', 'hunter2']) {
    assert.ok(!serialised.includes(leak), `${leak} must not be stored`);
  }
  assert.deepEqual(Object.keys(entry).filter(k => /user|email|name|password/i.test(k)), [],
    'no identity-shaped field exists on the record at all');
});

// ─── Server wiring ──────────────────────────────────────────────────────────

test('MON-9: ingest and read are wired into an EXISTING function', async () => {
  const config = await readFile(new URL('../api/config.js', import.meta.url), 'utf8');
  assert.match(config, /req\.query\?\.report === '1'/, 'ingest sub-route');
  assert.match(config, /req\.query\?\.errors === '1'/, 'read sub-route');
  // Reading recorded failures is staff-only, same gate as the activity log.
  const readBlock = config.slice(config.indexOf("req.query?.errors === '1'"));
  assert.match(readBlock.slice(0, 500), /requireTenantPermission\(req, PERM\.REPORTS\)/,
    'the error log is permission-gated');
  // Bounded storage on every write.
  assert.match(config, /kvLtrim\(ERROR_LOG_KEY\(\), MAX_ENTRIES\)/, 'list trimmed on write');
  assert.match(config, /enforceRateLimit\('error_report'/, 'ingest is rate-limited');
  // Ingest never reveals anything.
  const ingest = config.slice(config.indexOf("req.query?.report === '1'"), config.indexOf("if (req.method !== 'GET')"));
  assert.ok(!/res\.status\((4|5)\d\d\)/.test(ingest), 'ingest always answers 202 — never a probe oracle');
  // Vercel Hobby ceiling: this must not have added a function.
  const { readdirSync } = await import('node:fs');
  const fns = readdirSync(new URL('../api', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.ok(fns.length <= 12, `api/ has ${fns.length} functions; the Hobby ceiling is 12`);
  assert.ok(!fns.includes('errors.js'), 'error handling was folded in, not added as a route');
});

test('MON-10: the deployment that produced an error is recorded with it', () => {
  const entry = normalizeErrorReport({ kind: 'uncaught', message: 'boom' }, { version: 'fee7819' });
  assert.equal(entry.version, 'fee7819', 'an error can be tied to the release that caused it');
  assert.ok(entry.at, 'and to when it happened');
});

// ─── Client wiring ──────────────────────────────────────────────────────────

test('MON-11: the client captures the failures that were previously invisible', () => {
  assert.match(html, /addEventListener\('error'/, 'uncaught errors captured');
  assert.match(html, /addEventListener\('unhandledrejection'/, 'unhandled rejections captured');
  assert.match(html, /response\.status >= 500/, 'our own API 5xx captured');
  // The reporter must never send a query string or fragment.
  // The whole reporting layer: route helper + the sender.
  const reporter = html.slice(html.indexOf('function errorSafeRoute'),
                              html.indexOf("window.addEventListener('error'"));
  assert.match(reporter, /location\.pathname/, 'route is the bare path');
  assert.ok(!/location\.href|location\.search|location\.hash/.test(reporter),
    'the reporter must never read the full URL, the query string or the hash');
  assert.match(reporter, /split\(\/\[\?#\]\/\)\[0\]/, 'source is stripped of query/fragment client-side too');
});

test('MON-12: monitoring cannot break the app or loop on itself', () => {
  const wrapper = html.slice(html.indexOf('function monitorApiFailures'),
                             html.indexOf('// ─── PUSH NOTIFICATIONS'));
  assert.match(wrapper, /realFetch\.apply\(this, arguments\)/, 'fetch is a transparent pass-through');
  assert.match(wrapper, /throw error;/, "the caller's error path is preserved");
  assert.match(wrapper, /report=1.*return promise/s, 'the reporter never reports itself');
  const reporter = html.slice(html.indexOf('function errorSafeRoute'),
                              html.indexOf("window.addEventListener('error'"));
  assert.match(reporter, /catch \{ \/\* never let the reporter raise/, 'reporting failures are swallowed');
  assert.match(reporter, /_errorsReported >= ERROR_REPORT_LIMIT/, 'per-load cap stops a flood');
  assert.match(reporter, /_errorSeen\.has\(fingerprint\)/, 'repeats are collapsed');
});

test('MON-13: the rollback procedure is documented and actionable', async () => {
  const doc = await readFile(new URL('../DEPLOY.md', import.meta.url), 'utf8');
  assert.match(doc, /## Rollback procedure/);
  for (const step of ['vercel ls --prod', 'vercel rollback', 'vercel rollback status',
                      'vercel inspect', '/api/config', 'KNOWN_ISSUES.md']) {
    assert.ok(doc.includes(step), `procedure must cover: ${step}`);
  }
  // The verification the procedure demands must be the real production contract.
  for (const flag of ['devLogin', 'storageConfigured', 'pushConfigured', 'emailConfigured']) {
    assert.ok(doc.includes(flag), `rollback verification must check ${flag}`);
  }
  assert.match(doc, /Rolling back does not revert the code/, 'says what rollback does NOT do');
  assert.match(doc, /## Is production broken\?/, 'and how to notice in the first place');
});
