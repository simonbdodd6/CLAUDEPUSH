/**
 * EXISTING COACH ≠ FIRST-TIME USER.
 *
 * An existing user added to an established club as a coach was shown the
 * first-run "Set up your club" checklist: create your club, invite your first
 * player, send your first message. The reported production case (an existing
 * Boitsfort user made assistant coach) was attributed to a missing
 * accessProfile on the membership.
 *
 * The audit says otherwise, and these tests pin BOTH halves:
 *
 *  1. accessProfile is NOT the cause. A missing one is DERIVED from the
 *     canonical role (api/_permissions.js accessProfileOf), so an assistant
 *     coach without one holds the full coach permission set — in fact one MORE
 *     permission than an explicit profile (medical_access is preserved for
 *     legacy members), which is exactly why stamping a profile onto such a
 *     membership would quietly REMOVE access.
 *
 *  2. The checklist was the cause. It was gated on nothing but empty
 *     device-local state, so anyone joining an established club looked new.
 *     It is now first-run work for the club's FOUNDER, read from the trusted
 *     session membership of the club in force.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { accessProfileOf, permissionsFor, canonicalRole, hasExplicitAccessProfile, isClubOwner }
  from '../api/_permissions.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fn(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} exists`);
  let i = html.indexOf('(', start), paren = 0;
  for (; i < html.length; i++) {
    if (html[i] === '(') paren++;
    else if (html[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let body = html.indexOf('{', i), depth = 0, end = body;
  for (let b = body; b < html.length; b++) {
    if (html[b] === '{') depth++;
    else if (html[b] === '}') { depth--; if (depth === 0) { end = b; break; } }
  }
  return html.slice(start, end + 1);
}

// The REAL client gate, with the state it reads injected.
function checklist({ membership, state = {}, steps = null }) {
  const run = new Function('_myMembership', 'state', 'stepsOverride', `
    const CE_INITIAL_GROUP_ID = 'grp_initial';
    ${fn('clubSetupFounder')}
    ${fn('getOnboardingSteps')}
    ${fn('showClubSetupChecklist')}
    const steps = stepsOverride || getOnboardingSteps();
    return { shown: showClubSetupChecklist(steps), founder: clubSetupFounder(), steps };`);
  return run(membership, { players: [], schedule: [], messages: [], availabilityRequests: [], ...state }, steps);
}

const FOUNDER   = { teamId: 'boitsfort', userId: 'u-owner', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true };
const ASSISTANT = { teamId: 'boitsfort', userId: 'u-nick',  role: 'coach', staffLevel: 'assistant', status: 'active' };
const ESTABLISHED = { clubName: 'Boitsfort RFC', players: [{ id: 'p1' }], schedule: [{ id: 's1', published: true }] };

// ── 1. accessProfile: not the cause, and not to be stamped ──────────────────

test('A. an existing coach with NO accessProfile is a full coach', () => {
  assert.equal(hasExplicitAccessProfile(ASSISTANT), false);
  assert.equal(canonicalRole(ASSISTANT), 'assistant');
  assert.equal(accessProfileOf(ASSISTANT), 'coach', 'derived from the role');
  const perms = permissionsFor(ASSISTANT);
  for (const p of ['messaging', 'manage_players', 'publish_training', 'publish_squads', 'reports'])
    assert.ok(perms.has(p), `assistant coach keeps ${p}`);
  assert.ok(!perms.has('assign_access'), 'and gains nothing extra');
});

test('B. an explicit accessProfile grants no MORE than the derived one', () => {
  const derived  = permissionsFor(ASSISTANT);
  const explicit = permissionsFor({ ...ASSISTANT, accessProfile: 'coach' });
  const gained = [...explicit].filter(p => !derived.has(p));
  const lost   = [...derived].filter(p => !explicit.has(p));
  assert.deepEqual(gained, [], 'stamping a profile unlocks nothing');
  assert.deepEqual(lost, ['medical_access'],
    'it can only REMOVE the legacy medical grant — so never stamp one to "fix" onboarding');
});

test('D. a coach who also plays, and E. a player, are unchanged', () => {
  const dual = { ...ASSISTANT, playerGroupId: 'grp_initial' };
  assert.equal(accessProfileOf(dual), 'coach');
  assert.ok(permissionsFor(dual).has('manage_players'));
  const player = { teamId: 'boitsfort', userId: 'u-p', role: 'player', status: 'active' };
  assert.equal(accessProfileOf(player), null, 'players have no access profile — and need none');
  assert.equal(permissionsFor(player).size, 0);
});

test('an inactive or foreign membership grants nothing', () => {
  assert.equal(permissionsFor({ ...ASSISTANT, status: 'removed' }).size, 0);
  assert.equal(permissionsFor({ ...ASSISTANT, status: 'pending' }).size, 0);
});

// ── 2. the checklist is first-run work, for the founder ─────────────────────

test('1. an existing coach joining an ESTABLISHED club sees no first-run checklist', () => {
  const r = checklist({ membership: ASSISTANT, state: ESTABLISHED });
  assert.equal(r.founder, false);
  assert.equal(r.shown, false, 'the reported defect');
  // …and not even when the device holds nothing at all (a fresh browser).
  assert.equal(checklist({ membership: ASSISTANT, state: {} }).shown, false);
});

test('2. an existing coach WITH an accessProfile behaves identically', () => {
  const withProfile = { ...ASSISTANT, accessProfile: 'coach' };
  assert.equal(checklist({ membership: withProfile, state: ESTABLISHED }).shown, false);
  assert.equal(checklist({ membership: withProfile, state: {} }).shown, false);
});

test('3. the founder of a NEW club still gets the checklist', () => {
  const r = checklist({ membership: FOUNDER, state: {} });
  assert.equal(r.founder, true);
  assert.equal(r.shown, true, 'genuine first-run work is untouched');
  // Owners recorded the other two ways the server recognises (isClubOwner).
  assert.equal(checklist({ membership: { ...ASSISTANT, role: 'owner' }, state: {} }).shown, true);
  assert.equal(checklist({ membership: { ...ASSISTANT, approvedBy: 'club-creation' }, state: {} }).shown, true);
});

test('the client founder rule mirrors the server isClubOwner', () => {
  for (const m of [FOUNDER, { ...ASSISTANT, role: 'owner' }, { ...ASSISTANT, approvedBy: 'club-creation' }]) {
    assert.equal(isClubOwner(m), true);
    assert.equal(checklist({ membership: m, state: {} }).founder, true);
  }
  assert.equal(isClubOwner(ASSISTANT), false);
  assert.equal(checklist({ membership: ASSISTANT, state: {} }).founder, false);
});

test('the founder’s checklist still finishes and still hides when dismissed', () => {
  const done = [{ key: 'a', done: true }, { key: 'b', done: true }];
  assert.equal(checklist({ membership: FOUNDER, state: {}, steps: done }).shown, false, 'complete → gone');
  assert.equal(checklist({ membership: FOUNDER, state: { onboardingDismissed: true } }).shown, false);
});

test('5+6. session restore / refresh: unknown membership shows nothing, then resolves', () => {
  // Before the server answers (first paint, offline, or after a signed-out reset)
  // _myMembership is null — the card stays away rather than flashing at a joiner.
  assert.equal(checklist({ membership: null, state: {} }).shown, false);
  assert.equal(checklist({ membership: undefined, state: ESTABLISHED }).shown, false);
  // …and appears for a founder as soon as the session lands.
  assert.equal(checklist({ membership: FOUNDER, state: {} }).shown, true);
});

test('4+7. another club’s membership cannot bring the checklist into this one', () => {
  // The gate reads ONLY the membership the server returned for the club in
  // force. A founder elsewhere is just a coach here.
  const founderOfAnotherClub = { teamId: 'other-club', userId: 'u-nick', role: 'coach', staffLevel: 'head', status: 'active', isOwner: true };
  const hereAsAssistant = { ...ASSISTANT };
  assert.equal(checklist({ membership: hereAsAssistant, state: {} }).shown, false);
  // (the foreign record is never consulted — it is not what _myMembership holds)
  assert.equal(checklist({ membership: founderOfAnotherClub, state: {} }).shown, true,
    'the same person setting up their OWN club still gets it there');
});

test('8. a non-initial group never shows club setup', () => {
  assert.equal(checklist({ membership: FOUNDER, state: { operationalGroupId: 'grp_u18' } }).shown, false);
  assert.equal(checklist({ membership: FOUNDER, state: { operationalGroupId: 'grp_initial' } }).shown, true);
});

// ── 3. the coach experience itself is untouched ─────────────────────────────

test('9. an existing coach still lands in the coach shell with coach navigation', () => {
  const landing = new Function('member', `
    function membershipPlays(m) { return Boolean(m && m.playerGroupId); }
    ${fn('landingViewFor')}
    return landingViewFor(member.role, member);`);
  assert.equal(landing(ASSISTANT), 'coach');
  assert.equal(landing({ ...ASSISTANT, accessProfile: 'coach' }), 'coach');
  assert.equal(landing(FOUNDER), 'coach');
  assert.equal(landing({ role: 'player', status: 'active' }), 'player');
  // The gate is presentation only: it reads state and the membership, and writes nothing.
  const gate = fn('showClubSetupChecklist') + fn('clubSetupFounder');
  assert.doesNotMatch(gate, /saveState|fetch\(|state\.\w+\s*=/, 'no writes, no requests');
});
