/**
 * RC4.4B1 — Production email delivery paths.
 *
 * Exercises sendTransactionalEmail across the four states — missing recipient,
 * unconfigured (no RESEND_API_KEY), provider-accepted, provider-rejected — asserting
 * the return/throw contract AND that the new server-side observability never logs the
 * API key, the recipient, or the payload body.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { sendTransactionalEmail } = await import('../api/_email.js');

const ORIG_KEY = process.env.RESEND_API_KEY;
const ORIG_FETCH = globalThis.fetch;
function restore() {
  if (ORIG_KEY === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = ORIG_KEY;
  globalThis.fetch = ORIG_FETCH;
}
function captureWarn(fn) {
  const lines = [];
  const orig = console.warn;
  console.warn = (...a) => lines.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  return fn().finally(() => { console.warn = orig; }).then(() => lines);
}

test('missing recipient → skipped (no key read, no network)', async () => {
  const r = await sendTransactionalEmail({ subject: 's', html: 'h', text: 't' });
  assert.deepEqual(r, { ok: true, sent: false, skipped: true, reason: 'missing_recipient' });
});

test('unconfigured (no RESEND_API_KEY) → skipped, no throw, warns without leaking recipient', async () => {
  delete process.env.RESEND_API_KEY;
  globalThis.fetch = async () => { throw new Error('network must not be called when unconfigured'); };
  try {
    let result;
    const warns = await captureWarn(async () => { result = await sendTransactionalEmail({ to: 'diver@example.com', subject: 's', html: 'h', text: 't' }); });
    assert.deepEqual(result, { ok: true, sent: false, skipped: true, reason: 'email_not_configured' });
    assert.ok(warns.some(w => /RESEND_API_KEY/.test(w)), 'server-side warning names the missing var');
    assert.ok(!warns.some(w => /diver@example\.com/.test(w)), 'recipient email never logged');
  } finally { restore(); }
});

test('configured + provider accepts → sent:true with id', async () => {
  process.env.RESEND_API_KEY = 'test-key-should-never-be-logged';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 'em_abc123' }) });
  try {
    const r = await sendTransactionalEmail({ to: 'diver@example.com', subject: 's', html: 'h', text: 't' });
    assert.equal(r.ok, true);
    assert.equal(r.sent, true);
    assert.equal(r.provider, 'resend');
    assert.equal(r.id, 'em_abc123');
  } finally { restore(); }
});

test('configured + provider rejects → throws 502, never logs the API key', async () => {
  process.env.RESEND_API_KEY = 'test-key-should-never-be-logged';
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'The coachseye.app domain is not verified' }) });
  try {
    const warns = await captureWarn(async () => {
      await assert.rejects(
        sendTransactionalEmail({ to: 'diver@example.com', subject: 's', html: 'h', text: 't' }),
        (e) => e.status === 502 && /not verified/.test(e.message),
      );
    });
    assert.ok(!warns.some(w => /test-key-should-never-be-logged/.test(w)), 'API key never appears in logs');
    assert.ok(!warns.some(w => /diver@example\.com/.test(w)), 'recipient never appears in logs');
    assert.ok(warns.some(w => /provider rejected/i.test(w)), 'rejection is logged (status only)');
  } finally { restore(); }
});
