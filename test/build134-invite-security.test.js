/**
 * AN INVITE TOKEN GOES ONLY TO WHO COULD HAVE MINTED IT (Build 134)
 *
 * GET /api/invite returned every invite of the club, token included, to any
 * caller with manage-players. A token IS the invitation: a team manager could
 * copy the owner's ADMIN invite and claim club-wide full access, and one
 * group's coach could take another group's staff link. Re-send and revoke
 * were gated the same way. Now the list carries a token (and the invite may be
 * re-sent or revoked) only when the caller could have minted that exact
 * invite: staff roles need manage-coaches, unscoped and whole-club invites
 * need whole-club coverage, scoped invites need management of their scope.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { world, inviteCall, idCall } from './build134-fixture.js';

async function mint(w) {
  const make = async (actor, body) => {
    const r = await inviteCall('POST', { actor, body: { sendEmail: false, ...body } });
    assert.ok([200, 201].includes(r.statusCode), `${JSON.stringify(body)} → ${r.statusCode} ${JSON.stringify(r.body)}`);
    return r.body.token;
  };
  return {
    admin:      await make(w.owner, { role: 'admin', name: 'New Admin', email: 'na@b134.test', scope: { level: 'club' } }),
    coachU18:   await make(w.owner, { role: 'coach', staffLevel: 'head', name: 'U18 Coach', email: 'u18c@b134.test', scope: { level: 'group', groupId: w.u18 } }),
    coachSen:   await make(w.owner, { role: 'coach', staffLevel: 'assistant', name: 'Sen Asst', email: 'sena@b134.test', scope: { level: 'group', groupId: w.seniors } }),
    playerSen:  await make(w.owner, { role: 'player', name: 'Sen Player', email: 'senp@b134.test', playerGroupId: w.seniors, scope: { level: 'group', groupId: w.seniors } }),
    playerU18:  await make(w.owner, { role: 'player', name: 'U18 Player', email: 'u18p@b134.test', playerGroupId: w.u18, scope: { level: 'group', groupId: w.u18 } }),
    linkU18:    await make(w.owner, { group: true, role: 'player', playerGroupId: w.u18, scope: { level: 'group', groupId: w.u18 } }),
  };
}
async function mintMore(w) {
  const make = async body => (await inviteCall('POST', { actor: w.owner, body: { sendEmail: false, ...body } })).body.token;
  return {
    coachBoth:     await make({ role: 'coach', staffLevel: 'head', name: 'Both Groups', email: 'both@b134.test', scope: { level: 'groups', groupIds: [w.seniors, w.u18] } }),
    coachUnscoped: await make({ role: 'coach', staffLevel: 'head', name: 'Unscoped', email: 'unscoped@b134.test' }),
  };
}
async function visible(actor) {
  const r = await inviteCall('GET', { actor });
  if (r.statusCode !== 200) return { status: r.statusCode, tokens: [] };
  return { status: 200, tokens: r.body.invites.map(i => i.token).filter(Boolean), count: r.body.invites.length };
}

test('the owner and a club-wide admin see every token of their club', async () => {
  const w = await world(); const t = await mint(w);
  for (const actor of ['owner', 'admin']) {
    const v = await visible(w[actor]);
    assert.deepEqual(v.tokens.sort(), Object.values(t).sort(), actor);
  }
});

test('a manager and an assistant (manage-players, no manage-coaches) never receive a STAFF or ADMIN token', async () => {
  const w = await world(); const t = await mint(w);
  for (const actor of ['manager', 'assistant']) {
    const v = await visible(w[actor]);
    assert.equal(v.status, 200);
    for (const k of ['admin', 'coachU18', 'coachSen']) assert.ok(!v.tokens.includes(t[k]), `${actor} must not hold the ${k} token`);
    for (const k of ['playerSen', 'playerU18', 'linkU18']) assert.ok(v.tokens.includes(t[k]), `${actor} (club-wide players) keeps the ${k} token`);
    assert.equal(v.count, 6, 'every invite is still LISTED — only the token is withheld');
  }
});

test('one group\'s head coach gets only their own group\'s tokens — never the other group\'s, never the admin\'s', async () => {
  const w = await world(); const t = await mint(w);
  const u18 = await visible(w.headU18);
  assert.deepEqual(u18.tokens.sort(), [t.coachU18, t.playerU18, t.linkU18].sort());
  const sen = await visible(w.headSeniors);
  assert.deepEqual(sen.tokens.sort(), [t.coachSen, t.playerSen].sort());
});

test('a staff invite spanning TWO groups needs management of BOTH; an unscoped staff invite is the club administrators\' only', async () => {
  const w = await world(); const t = await mintMore(w);
  assert.ok(t.coachBoth && t.coachUnscoped, 'minted');
  for (const actor of ['headU18', 'headSeniors']) {
    const v = await visible(w[actor]);
    assert.ok(!v.tokens.includes(t.coachBoth), `${actor} manages only one of the two groups`);
    assert.ok(!v.tokens.includes(t.coachUnscoped), `${actor} does not cover the club`);
  }
  const admin = await visible(w.admin);
  assert.ok(admin.tokens.includes(t.coachBoth) && admin.tokens.includes(t.coachUnscoped));
});

test('a player and an anonymous caller get no list at all', async () => {
  const w = await world(); await mint(w);
  assert.equal((await visible(w.player)).status, 403);
  assert.equal((await visible(null)).status, 401);
});

test('re-send and revoke follow the same rule: a manager cannot revoke the admin invite; another club cannot touch any', async () => {
  const w = await world(); const t = await mint(w);
  const revoke = await inviteCall('DELETE', { actor: w.manager, body: { token: t.admin } });
  assert.equal(revoke.statusCode, 403, JSON.stringify(revoke.body));
  const resend = await inviteCall('PATCH', { actor: w.headSeniors, body: { token: t.coachU18, action: 'resend' } });
  assert.equal(resend.statusCode, 403, 'a Seniors coach cannot re-send a U18 staff invite');
  const cross = await inviteCall('DELETE', { actor: w.ownerB, body: { token: t.playerSen } });
  assert.equal(cross.statusCode, 403, 'another club');
  const own = await inviteCall('DELETE', { actor: w.headU18, body: { token: t.playerU18 } });
  assert.equal(own.statusCode, 200, 'a group coach still revokes their own group\'s invite');
  const still = await visible(w.owner);
  assert.ok(still.tokens.includes(t.admin), 'the admin invite was not revoked by the refused call');
});

test('the normal invite claim through a token is unchanged', async () => {
  const w = await world(); const t = await mint(w);
  const claim = await idCall({ action: 'claim_invite', token: t.playerSen, name: 'Sen Player', email: 'senp@b134.test', password: 'password123', position: '2 — Hooker' }, null);
  assert.ok([200, 201].includes(claim.statusCode), `the normal invite flow is unchanged: ${claim.statusCode} ${JSON.stringify(claim.body)}`);
});

test('an expired invite is listed without breaking the list, and its token is refused at claim', async () => {
  const w = await world();
  const r = await inviteCall('POST', { actor: w.owner, body: { sendEmail: false, role: 'player', name: 'Old', email: 'old@b134.test', playerGroupId: w.seniors } });
  const { kv } = await import('./build134-fixture.js');
  for (const [k, v] of kv.entries()) {
    if (typeof v === 'string' && v.includes(r.body.token)) {
      kv.set(k, v.replace(/"expiresAt":"[^"]*"/, '"expiresAt":"2020-01-01T00:00:00.000Z"'));
    }
  }
  const list = await inviteCall('GET', { actor: w.owner });
  assert.equal(list.statusCode, 200);
  const claim = await idCall({ action: 'claim_invite', token: r.body.token, name: 'Old', email: 'old@b134.test', password: 'password123', position: '2 — Hooker' }, null);
  assert.ok(claim.statusCode >= 400, `an expired token does not admit anyone (${claim.statusCode})`);
});
