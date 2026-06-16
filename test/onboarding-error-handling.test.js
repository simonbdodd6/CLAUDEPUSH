import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const pattern = new RegExp(`function ${name}\\s*\\(([^)]*?)\\)\\s*\\{`, 's');
  const m = src.match(pattern);
  if (!m) throw new Error(`Function ${name} not found in source`);
  const start = src.indexOf(m[0]);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
    i++;
  }
  return src.slice(start, i + 1);
}

function buildScope() {
  const fnSrcs = ['clubWizErrorMessage'].map(extractFn).join('\n');
  const body = `
    "use strict";
    ${fnSrcs}
    return { clubWizErrorMessage };
  `;
  return new Function(body)();
}

// ── clubWizErrorMessage ──────────────────────────────────────────────────────

test('clubWizErrorMessage: 401 returns session-expired message', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(401, 'Unauthorized');
  assert.equal(msg, 'Your session has expired. Please refresh and try again.');
});

test('clubWizErrorMessage: 409 returns conflict message', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(409, 'Team already exists');
  assert.equal(msg, 'This club or team already exists. Please choose a different name.');
});

test('clubWizErrorMessage: 429 returns rate-limit message', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(429, 'Too many requests');
  assert.equal(msg, 'Too many attempts. Please wait a few minutes before trying again.');
});

test('clubWizErrorMessage: 500 uses server message when present', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(500, 'Database connection failed');
  assert.equal(msg, 'Database connection failed');
});

test('clubWizErrorMessage: 503 falls back to generic when no server message', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(503, '');
  assert.equal(msg, "We couldn't create your club. Please try again.");
});

test('clubWizErrorMessage: undefined server message falls back to generic', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(500, undefined);
  assert.equal(msg, "We couldn't create your club. Please try again.");
});

test('clubWizErrorMessage: 0 (network failure) falls back to generic', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(0, '');
  assert.equal(msg, "We couldn't create your club. Please try again.");
});

test('clubWizErrorMessage: 401 ignores server message — always uses deterministic string', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(401, 'Some random server error text');
  assert.equal(msg, 'Your session has expired. Please refresh and try again.');
});

test('clubWizErrorMessage: 409 ignores server message — always uses deterministic string', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(409, 'Some random conflict text');
  assert.equal(msg, 'This club or team already exists. Please choose a different name.');
});

test('clubWizErrorMessage: 429 ignores server message — always uses deterministic string', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(429, 'Rate limit exceeded for IP');
  assert.equal(msg, 'Too many attempts. Please wait a few minutes before trying again.');
});

test('clubWizErrorMessage: 200 with empty serverMsg falls back to generic', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(200, '');
  assert.equal(msg, "We couldn't create your club. Please try again.");
});

test('clubWizErrorMessage: 400 with server message returns server message', () => {
  const { clubWizErrorMessage } = buildScope();
  const msg = clubWizErrorMessage(400, 'Email address is invalid');
  assert.equal(msg, 'Email address is invalid');
});

// ── Determinism: same inputs always produce the same output ──────────────────

test('clubWizErrorMessage: output is deterministic for all status codes', () => {
  const { clubWizErrorMessage } = buildScope();
  const codes = [0, 400, 401, 403, 404, 409, 429, 500, 503];
  codes.forEach(code => {
    const a = clubWizErrorMessage(code, 'msg');
    const b = clubWizErrorMessage(code, 'msg');
    assert.equal(a, b, `status ${code} must be deterministic`);
  });
});

// ── Simon Test Player untouched ───────────────────────────────────────────────

test('Simon Test Player identity is not referenced in clubWizErrorMessage', () => {
  const fnSrc = extractFn('clubWizErrorMessage');
  assert.ok(!fnSrc.includes('simon'), 'clubWizErrorMessage must not reference simon test player');
  assert.ok(!fnSrc.includes('coach-demo'), 'clubWizErrorMessage must not reference coach-demo');
  assert.ok(!fnSrc.includes('simonbdodd'), 'clubWizErrorMessage must not reference simon email');
});

// ── No state mutation ─────────────────────────────────────────────────────────

test('clubWizErrorMessage: does not read or write any external state', () => {
  // The function should work without any global state
  const body = `
    "use strict";
    ${extractFn('clubWizErrorMessage')}
    // Call with all status codes — should not throw even without state
    const results = [401, 409, 429, 500, 0].map(s => clubWizErrorMessage(s, 'err'));
    return results;
  `;
  const results = new Function(body)();
  assert.equal(results.length, 5);
  assert.ok(results.every(r => typeof r === 'string' && r.length > 0));
});

// ── Source-level checks ───────────────────────────────────────────────────────

test('clubWizFinish has _cwFinishing guard for duplicate-submit prevention', () => {
  assert.ok(src.includes('_cwFinishing'), 'duplicate-submit guard must exist in source');
  assert.ok(src.includes('if (_cwFinishing) return'), 'early return on duplicate submit must exist');
});

test('clubWizFinish uses clubWizErrorMessage for status-aware errors', () => {
  const fnSrc = extractFn('clubWizFinish');
  assert.ok(fnSrc.includes('clubWizErrorMessage'), 'clubWizFinish must call clubWizErrorMessage');
  assert.ok(fnSrc.includes('res.status'), 'clubWizFinish must pass res.status to error mapper');
});

test('clubWizFinish has finally block that clears _cwFinishing', () => {
  const fnSrc = extractFn('clubWizFinish');
  assert.ok(fnSrc.includes('finally'), 'clubWizFinish must have a finally block');
  assert.ok(fnSrc.includes('_cwFinishing = false'), 'finally block must reset _cwFinishing');
});

test('clubWizFinish re-queries button by id in catch (handles stale reference)', () => {
  const fnSrc = extractFn('clubWizFinish');
  // The catch block should re-query so a re-rendered wizard still gets the button re-enabled
  const catchIdx  = fnSrc.indexOf('catch(e)');
  const catchBlock = fnSrc.slice(catchIdx);
  assert.ok(catchBlock.includes("getElementById('cw-finish-btn')"), 'catch must re-query button by id');
});

test('auth banner suppressed when club wizard is open', () => {
  assert.ok(
    src.includes("!document.getElementById('club-wizard')"),
    'renderAuthBanner must hide banner when club-wizard modal is in the DOM'
  );
});

test('no new API files: clubWizErrorMessage is a client-side pure function only', () => {
  // The function must exist in the HTML source, not in an API file
  const apiFiles = fs.readdirSync(new URL('../api', import.meta.url)).filter(f => f.endsWith('.js'));
  apiFiles.forEach(f => {
    const apiSrc = fs.readFileSync(new URL(`../api/${f}`, import.meta.url), 'utf8');
    // API files should not define clubWizErrorMessage (it's client-side only)
    assert.ok(!apiSrc.includes('clubWizErrorMessage'), `API file ${f} should not define clubWizErrorMessage`);
  });
});
