/**
 * A CHANGED OR RESET PASSWORD ENDS THE SESSIONS THAT TRUSTED THE OLD ONE (Build 134)
 *
 * change_password and reset_password replaced the credential and left every
 * existing session valid for its full 30 days — someone who had the old
 * password (and signed in with it) stayed signed in after the owner changed it.
 * Now:
 *   - change_password / change_email end every OTHER session; the session that
 *     just proved the current password stays (as logout_all already does);
 *   - reset_password ends EVERY session (the person resetting may be locking
 *     out whoever had their old password) and retires the account's other
 *     unused reset links.
 * Sessions are checked through the server's own resolver with the old tokens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, idCall, store, PW } from './build134-fixture.js';

const resolves = async session => {
  const s = await store.resolveSessionFromRequest({ headers: { cookie: `${store.SESSION_COOKIE}=${encodeURIComponent(session.token)}` } }).catch(() => null);
  return Boolean(s?.user?.id);
};
async function twoDevices(email, password = PW) {
  const a = await store.loginUser({ email, password });
  const b = await store.loginUser({ email, password });
  return { a: { session: a.session }, b: { session: b.session } };
}

test('change_password: the other devices are signed out, this one stays, the new password works and the old does not', async () => {
  const w = await world();
  const d = await twoDevices(w.owner.email);
  assert.ok(await resolves(d.a.session) && await resolves(d.b.session) && await resolves(w.owner.session), 'three live sessions');
  const r = await idCall({ action: 'change_password', currentPassword: PW, newPassword: 'NewPassword456' }, d.a);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.sessionsRevoked, 2);
  assert.equal(await resolves(d.a.session), true, 'the device that changed it stays signed in');
  assert.equal(await resolves(d.b.session), false, 'device B is signed out');
  assert.equal(await resolves(w.owner.session), false, 'the original session is signed out');
  await assert.rejects(() => store.loginUser({ email: w.owner.email, password: PW }), 'the old password no longer signs in');
  const fresh = await store.loginUser({ email: w.owner.email, password: 'NewPassword456' });
  assert.equal(await resolves(fresh.session), true, 'a new sign-in works');
});

test('change_password with a wrong current password changes nothing and revokes nothing', async () => {
  const w = await world();
  const d = await twoDevices(w.owner.email);
  const r = await idCall({ action: 'change_password', currentPassword: 'wrong-password', newPassword: 'NewPassword456' }, d.a);
  assert.ok(r.statusCode >= 400);
  assert.equal(await resolves(d.b.session), true);
  await store.loginUser({ email: w.owner.email, password: PW });
});

test('reset_password: EVERY session ends, the account\'s other reset links die, the new password works', async () => {
  const w = await world();
  const d = await twoDevices(w.owner.email);
  const first = await store.createPasswordResetRequest({ email: w.owner.email });
  const second = await store.createPasswordResetRequest({ email: w.owner.email });
  const r = await idCall({ action: 'reset_password', token: second.token, password: 'ResetPassword789' }, null);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  for (const s of [d.a.session, d.b.session, w.owner.session]) assert.equal(await resolves(s), false, 'no session survives a reset');
  const stale = await idCall({ action: 'reset_password', token: first.token, password: 'AttackerChosen1' }, null);
  assert.ok(stale.statusCode >= 400, `the older unused reset link is dead (${stale.statusCode})`);
  const reused = await idCall({ action: 'reset_password', token: second.token, password: 'AttackerChosen2' }, null);
  assert.ok(reused.statusCode >= 400, 'the used link cannot be replayed');
  const fresh = await store.loginUser({ email: w.owner.email, password: 'ResetPassword789' });
  assert.equal(await resolves(fresh.session), true);
});

test('change_email: other sessions end, this one stays; another user\'s sessions are never touched', async () => {
  const w = await world();
  const d = await twoDevices(w.owner.email);
  const other = await store.loginUser({ email: w.ownerB.email, password: PW });
  const r = await idCall({ action: 'change_email', currentPassword: PW, newEmail: 'owner.a.new@b134.test' }, d.a);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(await resolves(d.a.session), true);
  assert.equal(await resolves(d.b.session), false);
  assert.equal(await resolves(other.session), true, 'Club B\'s owner is unaffected');
  assert.equal(await resolves(w.ownerB.session), true);
});

test('logout still ends just this session, and a stale token is never revived by a later change', async () => {
  const w = await world();
  const d = await twoDevices(w.owner.email);
  const out = await idCall({ action: 'logout' }, d.b);
  assert.equal(out.statusCode, 200);
  assert.equal(await resolves(d.b.session), false);
  assert.equal(await resolves(d.a.session), true);
  await idCall({ action: 'change_password', currentPassword: PW, newPassword: 'NewPassword456' }, d.a);
  assert.equal(await resolves(d.b.session), false, 'the logged-out token stays dead');
  const replay = await idCall({ action: 'change_password', currentPassword: 'NewPassword456', newPassword: 'Another789x' }, w.owner);
  assert.equal(replay.statusCode, 401, 'a revoked session cannot act');
});
