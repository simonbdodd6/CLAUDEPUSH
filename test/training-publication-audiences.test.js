/**
 * RC4.10A — training publication audiences.
 *
 * Training publishes to TWO independent audiences. The coach audience carries
 * the complete operational plan (block leaders, key notes, staff notes, setup,
 * cues, progressions). The player audience carries an explicit allow-list of
 * player-safe fields only. Publishing to one never touches the other, and an
 * edit after publication cannot leak into an already published view.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.trainingpub.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.APP_KEY_PREFIX = 'app';

const kv = new Map();
const globToRe = p => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
globalThis.fetch = async (_u, o = {}) => {
  const [c, ...a] = JSON.parse(o.body || '[]');
  let r = null;
  if (c === 'GET')  r = kv.has(a[0]) ? kv.get(a[0]) : null;
  if (c === 'SET') { kv.set(a[0], a[1]); r = 'OK'; }
  if (c === 'DEL') { kv.delete(a[0]); r = 1; }
  if (c === 'SCAN') { const re = globToRe(a[2] || '*'); r = ['0', [...kv.keys()].filter(k => re.test(k))]; }
  if (c === 'EXPIRE' || c === 'LPUSH' || c === 'LTRIM') r = 1;
  return { ok: true, json: async () => ({ result: r }) };
};

const store = await import('../api/_identityStore.js');
const { default: publish } = await import('../api/publish.js');
const { SESSION_COOKIE } = store;

function res() { return { statusCode: 200, body: null, status(c){ this.statusCode = c; return this; }, json(d){ this.body = d; return this; }, setHeader(){}, end(){ return this; } }; }
async function call(method, query, body, cookie) {
  const r = res();
  await publish({ method, query: { resource: 'training', ...(query || {}) }, headers: cookie ? { cookie } : {}, body: body || {} }, r);
  return r;
}
const ck = s => `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`;
const audits = () => { try { return JSON.parse(kv.get('app:identity:audit_log') || '[]'); } catch { return []; } };

let _t = 0;
async function club(label) {
  return store.createClub({ clubName: `${label} RFC`, teamName: 'Seniors', sport: 'rugby', name: `${label} Owner`, email: `o${++_t}@tp.test`, password: 'password123' });
}
async function joinPlayer(teamId, name) {
  const token = 'TK' + String(++_t).padStart(8, '0');
  const email = `u${_t}@tp.test`;
  const invites = JSON.parse(kv.get('ce:invites') || '[]');
  invites.push({ token, email, name, role: 'player', teamId, status: 'pending', expiresAt: new Date(Date.now() + 9e7).toISOString() });
  kv.set('ce:invites', JSON.stringify(invites));
  return store.claimInvite({ token, email, name, password: 'password123' });
}
async function staff(teamId, name, accessProfile) {
  const person = await joinPlayer(teamId, name);
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  const m = members.find(x => x.userId === person.user.id && x.teamId === teamId);
  m.role = 'coach';
  m.staffLevel = accessProfile === 'manager' ? 'manager' : accessProfile === 'coach' ? 'assistant' : 'head';
  m.accessProfile = accessProfile;
  kv.set('app:identity:team_members', JSON.stringify(members));
  return { ...person, session: await store.createSession({ userId: person.user.id, teamId, role: 'coach' }) };
}
async function medicalStaff(teamId, name) {
  const person = await joinPlayer(teamId, name);
  const members = JSON.parse(kv.get('app:identity:team_members') || '[]');
  members.find(x => x.userId === person.user.id && x.teamId === teamId).role = 'medical';
  kv.set('app:identity:team_members', JSON.stringify(members));
  return { ...person, session: await store.createSession({ userId: person.user.id, teamId, role: 'medical' }) };
}

/** A realistic session: 3 blocks, two different leaders, key notes, staff-only
 *  notes and player-facing instructions. */
function sampleSession(overrides = {}) {
  return {
    id: 'sess-1',
    title: 'Tuesday Skills',
    theme: 'Breakdown speed',
    type: 'Training',
    date: '2026-03-10',
    startTime: '19:00',
    endTime: '20:30',
    location: 'Main pitch',
    coachName: 'Head Coach',
    arrivalInstructions: 'Arrive 18:40, boots on by 18:55.',
    preparation: 'Hydrate and do your own mobility first.',
    playerEquipment: 'Gum shield, both jerseys',
    playerNotes: 'Bring a water bottle.',
    staffNotes: 'SECRET-SESSION-STAFF: rotate Jones out early, contract talks pending.',
    blocks: [
      { id: 'b1', time: '19:00', durationMins: 15, activity: 'Warm-up',
        coach: 'Alice Assistant', keyFocus: 'KEYNOTE-WARMUP: raise heart rate progressively',
        organisation: '2 grids of 10x10', equipment: 'cones x12', groups: 'Forwards / backs split',
        cues: 'CUE-A: short steps', progressions: 'add ball', regressions: 'walk it',
        staffNotes: 'SECRET-BLOCK-STAFF: watch Jones hamstring',
        playerNotes: 'Jog two laps first.', playerEquipment: 'Trainers' },
      { id: 'b2', time: '19:15', durationMins: 30, activity: 'Breakdown technique',
        coach: 'Bob Forwards', keyFocus: 'KEYNOTE-BREAKDOWN: body height under the ball',
        organisation: 'Channel 15m', equipment: 'shields x4', groups: 'Pods of 3',
        cues: 'CUE-B: leg drive', progressions: 'live contest', regressions: 'static',
        staffNotes: 'SECRET-BLOCK-2: assess Smith for selection',
        playerNotes: 'Wear your scrum cap.', playerEquipment: 'Scrum cap' },
      { id: 'b3', time: '19:45', durationMins: 45, activity: 'Game scenario',
        coach: 'Head Coach', keyFocus: 'KEYNOTE-GAME: decision speed',
        organisation: 'Full pitch', equipment: 'bibs', groups: 'Team A v B',
        cues: 'CUE-C: talk early', progressions: 'add fatigue', regressions: 'unopposed',
        staffNotes: 'SECRET-BLOCK-3: trial new 10',
        playerNotes: 'Full contact — mouthguards in.', playerEquipment: 'Gum shield' },
    ],
    ...overrides,
  };
}

const STAFF_MARKERS = ['SECRET-SESSION-STAFF', 'SECRET-BLOCK-STAFF', 'SECRET-BLOCK-2', 'SECRET-BLOCK-3',
  'KEYNOTE-WARMUP', 'KEYNOTE-BREAKDOWN', 'KEYNOTE-GAME', 'CUE-A', 'CUE-B', 'CUE-C',
  'Alice Assistant', 'Bob Forwards'];

async function base() {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const player = await joinPlayer(A.team.id, 'Jamie Player');
  return { A, player };
}

// ── Coach publication completeness ──────────────────────────────────────────
test('coach publication includes key notes and the leader of every block', async () => {
  const { A } = await base();
  const pub = await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  assert.equal(pub.statusCode, 200, JSON.stringify(pub.body));

  const read = await call('GET', { audience: 'coach' }, null, ck(A.session));
  const s = read.body.sessions.find(x => x.id === 'sess-1');
  assert.ok(s, 'coach sees the published session');

  // Every block keeps its leader AND its key notes.
  assert.equal(s.blocks.length, 3);
  assert.deepEqual(s.blocks.map(b => b.coach), ['Alice Assistant', 'Bob Forwards', 'Head Coach']);
  assert.deepEqual(s.blocks.map(b => b.keyFocus), [
    'KEYNOTE-WARMUP: raise heart rate progressively',
    'KEYNOTE-BREAKDOWN: body height under the ball',
    'KEYNOTE-GAME: decision speed',
  ]);
});

test('no saved planner detail is silently omitted from the coach plan', async () => {
  const { A } = await base();
  await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  const s = (await call('GET', { audience: 'coach' }, null, ck(A.session))).body.sessions[0];

  for (const f of ['title', 'theme', 'date', 'startTime', 'endTime', 'location', 'coachName', 'staffNotes']) {
    assert.ok(String(s[f] || '').length, `session field "${f}" survives publication`);
  }
  for (const f of ['time', 'activity', 'durationMins', 'coach', 'keyFocus', 'organisation',
                   'equipment', 'groups', 'cues', 'progressions', 'regressions', 'staffNotes']) {
    assert.ok(s.blocks.every(b => b[f] !== undefined && b[f] !== null && b[f] !== ''),
      `block field "${f}" survives publication`);
  }
  // Block ORDER is preserved.
  assert.deepEqual(s.blocks.map(b => b.activity), ['Warm-up', 'Breakdown technique', 'Game scenario']);
});

// ── Player publication safety ───────────────────────────────────────────────
test('player publication excludes every staff-only field', async () => {
  const { A, player } = await base();
  await call('POST', { audience: 'player' }, { session: sampleSession() }, ck(A.session));
  const read = await call('GET', { audience: 'player' }, null, ck(player.session));
  assert.equal(read.statusCode, 200);
  const serialized = JSON.stringify(read.body);
  for (const marker of STAFF_MARKERS) {
    assert.equal(serialized.includes(marker), false, `player payload must not contain "${marker}"`);
  }
  const s = read.body.sessions[0];
  for (const f of ['staffNotes', 'coachName', 'focus']) {
    assert.equal(s[f], undefined, `session.${f} is not sent to players`);
  }
  for (const f of ['coach', 'keyFocus', 'organisation', 'equipment', 'groups', 'cues', 'progressions', 'regressions', 'staffNotes']) {
    assert.ok(s.blocks.every(b => b[f] === undefined), `block.${f} is not sent to players`);
  }
});

test('player publication still carries the player-safe essentials', async () => {
  const { A, player } = await base();
  await call('POST', { audience: 'player' }, { session: sampleSession() }, ck(A.session));
  const s = (await call('GET', { audience: 'player' }, null, ck(player.session))).body.sessions[0];
  assert.equal(s.title, 'Tuesday Skills');
  assert.equal(s.location, 'Main pitch');
  assert.equal(s.arrivalInstructions, 'Arrive 18:40, boots on by 18:55.');
  assert.equal(s.preparation, 'Hydrate and do your own mobility first.');
  assert.equal(s.playerEquipment, 'Gum shield, both jerseys');
  assert.deepEqual(s.blocks.map(b => b.activity), ['Warm-up', 'Breakdown technique', 'Game scenario']);
  assert.deepEqual(s.blocks.map(b => b.time), ['19:00', '19:15', '19:45']);
  assert.equal(s.blocks[2].playerNotes, 'Full contact — mouthguards in.');
});

test('a player cannot read the coach plan by direct API', async () => {
  const { A, player } = await base();
  await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  const denied = await call('GET', { audience: 'coach' }, null, ck(player.session));
  assert.equal(denied.statusCode, 403, JSON.stringify(denied.body));
  assert.equal(JSON.stringify(denied.body).includes('KEYNOTE'), false);
});

// ── Independence of the two audiences ───────────────────────────────────────
test('publishing to coaches does not publish to players', async () => {
  const { A, player } = await base();
  const pub = await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  assert.equal(pub.body.coach.status, 'published');
  assert.equal(pub.body.player.status, 'draft');
  const asPlayer = await call('GET', { audience: 'player' }, null, ck(player.session));
  assert.equal(asPlayer.body.count, 0, 'player sees nothing yet');
});

test('publishing to players does not modify the coach publication', async () => {
  const { A } = await base();
  await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  const coachBefore = (await call('GET', { audience: 'coach' }, null, ck(A.session))).body.sessions[0];

  await call('POST', { audience: 'player' }, { session: sampleSession() }, ck(A.session));
  const coachAfter = (await call('GET', { audience: 'coach' }, null, ck(A.session))).body.sessions[0];

  assert.equal(coachAfter.publishedAt, coachBefore.publishedAt, 'coach timestamp untouched');
  assert.equal(coachAfter.publishedRevision, coachBefore.publishedRevision);
  assert.deepEqual(coachAfter.blocks.map(b => b.keyFocus), coachBefore.blocks.map(b => b.keyFocus));
});

// ── Revisions and stale state ───────────────────────────────────────────────
test('an edit marks published audiences stale without leaking into them', async () => {
  const { A, player } = await base();
  await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  await call('POST', { audience: 'player' }, { session: sampleSession() }, ck(A.session));

  // Edit a KEY COACHING NOTE — the draft moves on.
  const edited = sampleSession();
  edited.blocks[1].keyFocus = 'KEYNOTE-EDITED: much lower body height';
  const bumped = await call('PUT', {}, { session: edited }, ck(A.session));
  assert.equal(bumped.statusCode, 200);
  assert.equal(bumped.body.coach.status, 'stale', 'coach audience reports changes not republished');
  assert.equal(bumped.body.player.status, 'stale');

  // The unpublished edit must NOT be visible to either audience yet.
  const coachView = (await call('GET', { audience: 'coach' }, null, ck(A.session))).body.sessions[0];
  assert.equal(coachView.blocks[1].keyFocus, 'KEYNOTE-BREAKDOWN: body height under the ball',
    'last published version is preserved until republished');
  assert.equal(coachView.status, 'stale');
  const playerView = (await call('GET', { audience: 'player' }, null, ck(player.session))).body.sessions[0];
  assert.equal(JSON.stringify(playerView).includes('KEYNOTE-EDITED'), false);
});

test('republishing updates only the selected audience', async () => {
  const { A, player } = await base();
  await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  await call('POST', { audience: 'player' }, { session: sampleSession() }, ck(A.session));
  const playerBefore = (await call('GET', { audience: 'player' }, null, ck(player.session))).body.sessions[0];

  const edited = sampleSession();
  edited.blocks[1].keyFocus = 'KEYNOTE-EDITED: much lower body height';
  const re = await call('POST', { audience: 'coach' }, { session: edited }, ck(A.session));
  assert.equal(re.body.coach.status, 'published', 'coach is current again');
  assert.equal(re.body.player.status, 'stale', 'player still awaiting republication');

  const coachView = (await call('GET', { audience: 'coach' }, null, ck(A.session))).body.sessions[0];
  assert.equal(coachView.blocks[1].keyFocus, 'KEYNOTE-EDITED: much lower body height');

  const playerAfter = (await call('GET', { audience: 'player' }, null, ck(player.session))).body.sessions[0];
  assert.equal(playerAfter.publishedAt, playerBefore.publishedAt, 'player publication untouched');
  assert.equal(JSON.stringify(playerAfter).includes('KEYNOTE'), false, 'and still carries no staff content');
});

test('duplicate publish actions are safe and idempotent in effect', async () => {
  const { A } = await base();
  const s = sampleSession();
  const results = await Promise.all([
    call('POST', { audience: 'coach' }, { session: s }, ck(A.session)),
    call('POST', { audience: 'coach' }, { session: s }, ck(A.session)),
    call('POST', { audience: 'coach' }, { session: s }, ck(A.session)),
  ]);
  results.forEach(r => assert.equal(r.statusCode, 200));
  const read = await call('GET', { audience: 'coach' }, null, ck(A.session));
  assert.equal(read.body.count, 1, 'still exactly one published session, not three');
  assert.equal(read.body.sessions[0].status, 'published');
});

// ── Permissions and tenant isolation ────────────────────────────────────────
test('access profiles: Full and Coach may publish, Manager/medical/player may not', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const full = await staff(A.team.id, 'Full Person', 'full');
  const coach = await staff(A.team.id, 'Coach Person', 'coach');
  const manager = await staff(A.team.id, 'Manager Person', 'manager');
  const medic = await medicalStaff(A.team.id, 'Physio Person');
  const player = await joinPlayer(A.team.id, 'Jamie Player');

  for (const [label, actor] of [['full', full], ['coach', coach]]) {
    for (const audience of ['coach', 'player']) {
      const r = await call('POST', { audience }, { session: sampleSession() }, ck(actor.session));
      assert.equal(r.statusCode, 200, `${label} may publish to ${audience}: ${JSON.stringify(r.body)}`);
    }
  }
  for (const [label, actor] of [['manager', manager], ['medical', medic], ['player', player]]) {
    for (const audience of ['coach', 'player']) {
      const r = await call('POST', { audience }, { session: sampleSession() }, ck(actor.session));
      assert.equal(r.statusCode, 403, `${label} may NOT publish to ${audience} (got ${r.statusCode})`);
    }
  }
});

test('unauthenticated callers cannot publish or read', async () => {
  await base();
  assert.equal((await call('POST', { audience: 'coach' }, { session: sampleSession() }, null)).statusCode, 401);
  assert.equal((await call('GET', { audience: 'coach' }, null, null)).statusCode, 401);
  assert.equal((await call('GET', { audience: 'player' }, null, null)).statusCode, 401);
});

test('cross-club access is denied in both directions', async () => {
  kv.clear(); _t = 0;
  const A = await club('Alpha');
  const B = await club('Bravo');
  const bPlayer = await joinPlayer(B.team.id, 'Bravo Player');
  await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  await call('POST', { audience: 'player' }, { session: sampleSession() }, ck(A.session));

  const bCoachView = await call('GET', { audience: 'coach' }, null, ck(B.session));
  assert.equal(bCoachView.body.count, 0, "club B sees none of club A's staff plan");
  const bPlayerView = await call('GET', { audience: 'player' }, null, ck(bPlayer.session));
  assert.equal(bPlayerView.body.count, 0, "club B players see none of club A's sessions");

  // Club B publishing does not touch club A's store.
  await call('POST', { audience: 'coach' }, { session: sampleSession({ title: 'Bravo Session' }) }, ck(B.session));
  const aView = (await call('GET', { audience: 'coach' }, null, ck(A.session))).body.sessions;
  assert.equal(aView.length, 1);
  assert.equal(aView[0].title, 'Tuesday Skills', 'club A unchanged');
});

// ── Audit ───────────────────────────────────────────────────────────────────
test('each publication writes an audit entry naming the audience', async () => {
  const { A } = await base();
  await call('POST', { audience: 'coach' }, { session: sampleSession() }, ck(A.session));
  await call('POST', { audience: 'player' }, { session: sampleSession() }, ck(A.session));
  const entries = audits().filter(e => e.event === 'training_published');
  assert.equal(entries.length, 2);
  const byAudience = Object.fromEntries(entries.map(e => [e.audience, e]));
  for (const audience of ['coach', 'player']) {
    assert.ok(byAudience[audience], `${audience} publication audited`);
    assert.equal(byAudience[audience].sessionId, 'sess-1');
    assert.equal(byAudience[audience].teamId, A.team.id);
    assert.equal(byAudience[audience].publishedBy, A.user.id);
    assert.ok(byAudience[audience].revision, 'revision recorded');
  }
  // Audit records must not carry the staff-only content itself.
  assert.equal(JSON.stringify(entries).includes('SECRET-'), false);
});

// ── Notification payload safety (client source contract) ────────────────────
test('notification payloads carry no staff-only content', () => {
  const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const raw = src.slice(src.indexOf('async function trainingPublishTo'), src.indexOf('async function notifyCoachingGroup'));
  assert.ok(raw.length > 100, 'publish handler found');
  // Strip comments: the assertion is about what the CODE reads, not the prose.
  const fn = raw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  for (const banned of ['keyFocus', 'staffNotes', 'cues', 'organisation', 'progressions', 'regressions', 'block.coach']) {
    assert.equal(fn.includes(banned), false, `notification path must not reference ${banned}`);
  }
  assert.match(fn, /full staff plan/i, 'coach notification states the staff plan is available');
});
