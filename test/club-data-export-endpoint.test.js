/**
 * CLUB DATA EXPORT — Step 2: GET /api/publish?resource=club-data-export.
 *
 * The real handler, against the in-memory store of build134-fixture: two
 * clubs, every staff shape, and every excluded store seeded with sentinel
 * values exactly where the product keeps them — invite tokens, sessions,
 * password data, medical cases, the roster's medical text and notes, chat,
 * Match Centre drafts and coach sheets, coach-audience training plans,
 * unpublished sessions, push subscriptions, and the OTHER club's records.
 *
 * Pinned: owners and club admins only (a Full-access head coach, a manager,
 * a group-scoped coach, a Director of Rugby and a scoped admin are refused);
 * the club is the session's, whatever the query names; nothing forbidden or
 * foreign appears in the download; storage failures, malformed records and an
 * oversized export send nothing; legacy availability strings are read by the
 * established rule; the export writes only its audit entry and rate counter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { world, publishCall, inviteCall, addMember, publish, ck, kv, lists, read } from './build134-fixture.js';

const { CLUB_DATA_EXPORT_MAX_BYTES, mayExportClubData } = await import('../api/publish.js');

const set = (k, v) => kv.set(k, JSON.stringify(v));
let ipN = 0;
async function exportAs(actor, query = {}, method = 'GET') {
  const r = { statusCode: 200, headers: {}, body: '', status(c) { this.statusCode = c; return this; },
    json(d) { this.body = JSON.stringify(d); return this; }, setHeader(n, v) { this.headers[n] = v; },
    end(b = '') { if (b) this.body = String(b); return this; } };
  await publish({ method, query: { resource: 'club-data-export', ...query },
    headers: { 'x-forwarded-for': `10.77.0.${++ipN % 250}`, ...(actor?.session ? { cookie: ck(actor.session) } : {}) }, body: {} }, r);
  let doc = null; try { doc = JSON.parse(r.body); } catch {}
  return { status: r.statusCode, headers: r.headers, raw: r.body, doc };
}

/** Club A with data in every section and every excluded store; club B alongside. */
async function seeded() {
  const w = await world();
  const A = w.a, B = w.b;
  w.clubAdmin = await addMember(A, { role: 'admin' });
  w.medic = await addMember(A, { role: 'medical' });
  w.snc = await addMember(A, { role: 'snc' });
  w.dor = await addMember(A, { role: 'dor' });
  w.scopedAdmin = await addMember(A, { role: 'admin', accessScope: { clubWide: false, groups: [{ groupId: w.u18, status: 'active' }], teams: [] } });

  // Club settings + a fixture each (the fixture list lives on the club record).
  for (const [c, name] of [[A, 'Alpha RFC'], [B, 'Bravo RFC']]) {
    assert.equal((await publishCall('POST', { resource: 'club' }, { club: { clubName: name } }, c === A ? w.owner : w.ownerB)).statusCode, 200);
  }
  const clubA = read(`app:club:${A}`);
  clubA.fixtures = [{ id: 'fx_a1', opposition: 'Kituro', date: '2026-10-31', status: 'scheduled', groupId: w.seniors, notes: 'Bring both kits' }];
  set(`app:club:${A}`, clubA);
  const clubB = read(`app:club:${B}`);
  clubB.fixtures = [{ id: 'fx_b1', opposition: 'BRAVO_SENTINEL_fixture', date: '2026-10-31', status: 'scheduled' }];
  set(`app:club:${B}`, clubB);

  // Invites through the real handler — the claimable tokens are what must not travel.
  const invA = await inviteCall('POST', { actor: w.owner, body: { sendEmail: false, name: 'Nina New', email: 'nina@alpha.test', role: 'player', playerGroupId: w.seniors } });
  const invB = await inviteCall('POST', { actor: w.ownerB, body: { sendEmail: false, name: 'BRAVO_SENTINEL_invitee', email: 'b@bravo.test', role: 'player' } });
  assert.ok(invA.body?.token && invB.body?.token, `invites created: ${JSON.stringify(invA.body)}`);
  w.tokens = [invA.body.token, invB.body.token];

  // Roster rows: one with medical text and notes; one tied to club B's owner (another club's account).
  set(`app:roster:${A}`, { players: [
    { id: 'p_pat', userId: w.player.user.id, name: 'Pat Player', position: 'Prop', dateOfBirth: '2008-05-01',
      medical: 'SENTINEL_rosterMedical concussion', notes: 'SENTINEL_rosterNotes', legacyPlayerId: 'SENTINEL_legacyId', photo: 'SENTINEL_photo' },
    { id: 'p_other', userId: w.ownerB.user.id, name: 'Other Club Person', position: 'Wing' },
  ] });
  set(`app:roster:${B}`, { players: [{ id: 'p_b', name: 'BRAVO_SENTINEL_rosterRow', position: 'Wing' }] });

  // Training: a player-published session, a coach-only publication, an unpublished one.
  set(`app:publish:${A}:group:${encodeURIComponent(w.seniors)}:training`, {
    sess_pub: { currentRevision: 'r1', player: { publishedAt: '2026-10-20T10:00:00Z', revision: 'r1',
      snapshot: { id: 'sess_pub', title: 'Contact', type: 'Training', date: '2026-10-22', startTime: '19:00', theme: 'Rucks',
        playerNotes: 'SENTINEL_playerNotesNotInSchema', blocks: [{ time: '19:00', activity: 'Warm-up', playerNotes: 'x' }] } },
      coach: { publishedAt: '2026-10-20T10:00:00Z', snapshot: { staffNotes: 'SENTINEL_staffNotes' } } },
    sess_coach_only: { coach: { publishedAt: '2026-10-21T10:00:00Z', snapshot: { title: 'SENTINEL_coachOnlyPlan' } } },
    sess_unpublished: { currentRevision: 'r2' },
  });
  // Attendance + a stored schedule for U18.
  set(`app:publish:${A}:group:${encodeURIComponent(w.seniors)}:attendance`, { sessions: { 'slot_tue-20261020': { date: '2026-10-20', title: 'Tuesday', marks: { [`id:${w.player.user.id}`]: 'present' } } } });
  set(`app:publish:${A}:group:${encodeURIComponent(w.u18)}:training_schedule`, { slots: [{ id: 'slot_wed', day: 'Wed', startTime: '18:30' }] });

  // Squads: a published fixture sheet, a draft and a coach sheet (never exported).
  set(`app:publish:${A}:fixture:fx_a1:squad`, { published: true, publishedAt: '2026-10-29T10:00:00Z', fixtureId: 'fx_a1', opposition: 'Kituro', formationNames: { 1: 'Pat Player' } });
  set(`app:publish:${A}:fixture:fx_a1:draft:${w.headSeniors.user.id}`, { opposition: 'SENTINEL_draft', formationNames: { 1: 'SENTINEL_draftPick' } });
  set(`app:publish:${A}:fixture:fx_a1:coachsheet`, { published: true, opposition: 'SENTINEL_coachSheet' });
  set(`app:publish:${B}:fixture:fx_b1:squad`, { published: true, opposition: 'BRAVO_SENTINEL_squad' });

  // Availability: a modern answer and a LEGACY bare string, in A's Seniors group; B has its own.
  set(`app:availability:${A}:group:${w.seniors}:slot_tue-20261020`, {
    [w.player.user.id]: { userId: w.player.user.id, playerId: w.player.user.id, response: 'available', reason: '', respondedAt: '2026-10-19T08:00:00Z', legacyPlayerId: 'SENTINEL_availLegacy' },
    legacy_key: 'maybe',
  });
  set(`app:availability:${B}:group:grp_initial:slot_tue-20261020`, { x: { userId: 'x', response: 'BRAVO_SENTINEL_answer' } });

  // Templates: A stored one; B stored one.
  set(`app:templates:${A}`, [{ id: 'tpl-a', name: 'Match week', category: 'availability', title: 'Availability', body: 'Please answer' }]);
  set(`app:templates:${B}`, [{ id: 'tpl-b', name: 'BRAVO_SENTINEL_template', title: 't', body: 'b' }]);

  // Excluded stores.
  set(`app:medical:${A}`, { version: 1, clubId: A, cases: [{ id: 'case1', playerId: 'p_pat', notes: 'SENTINEL_medicalCase', clearanceStatus: 'out' }] });
  set(`app:chat:conv:dm:${w.headSeniors.user.id}:${w.player.user.id}@${A}:msgs`, [{ text: 'SENTINEL_privateMessage' }]);
  set(`app:performance:${A}`, { programmes: [{ name: 'SENTINEL_scProgramme' }] });
  set('app:subscriptions', [{ userId: w.player.user.id, subscription: { endpoint: 'https://push.example/SENTINEL_pushEndpoint', keys: { auth: 'SENTINEL_pushAuth' } } }]);
  return w;
}

// ── who may export ──────────────────────────────────────────────────────────

test('the club owner and a club admin export their club: 200, a JSON attachment, never cached', async () => {
  const w = await seeded();
  for (const actor of [w.owner, w.clubAdmin]) {
    const r = await exportAs(actor);
    assert.equal(r.status, 200, r.raw.slice(0, 300));
    assert.equal(r.doc.schema, 'coacheasier.club-data-export.v1');
    assert.equal(r.doc.clubId, w.a);
    assert.equal(r.doc.exportedBy, actor.user.id);
    assert.equal(r.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.match(r.headers['Content-Disposition'], /^attachment; filename="coacheasier-club-data-alpha-rfc-\d{4}-\d{2}-\d{2}\.json"$/);
    assert.equal(r.headers['Cache-Control'], 'no-store');
  }
});

test('everyone else is refused explicitly (403, no export): Full-access head coach, group head coach, assistant, manager, medical, S&C, Director of Rugby, scoped admin, player', async () => {
  const w = await seeded();
  for (const who of ['admin', 'headSeniors', 'headU18', 'assistant', 'manager', 'medic', 'snc', 'dor', 'scopedAdmin', 'player']) {
    const r = await exportAs(w[who]);
    assert.equal(r.status, 403, `${who}: ${r.raw.slice(0, 200)}`);
    assert.equal(r.doc?.code, 'club_export_not_allowed', who);
    assert.equal(r.doc?.schema, undefined, `${who}: no export body`);
  }
});

test('the decision is the stored membership\'s, not a capability: owner / club-wide admin only', () => {
  assert.equal(mayExportClubData({ status: 'active', role: 'admin' }), true);
  assert.equal(mayExportClubData({ status: 'active', role: 'coach', isOwner: true }), true);
  assert.equal(mayExportClubData({ status: 'active', role: 'coach', approvedBy: 'club-creation' }), true);
  assert.equal(mayExportClubData({ status: 'active', role: 'coach', staffLevel: 'head', accessProfile: 'full' }), false, 'Full access ≠ club admin');
  assert.equal(mayExportClubData({ status: 'active', role: 'dor' }), false);
  assert.equal(mayExportClubData({ status: 'active', role: 'admin', accessScope: { clubWide: false, groups: [{ groupId: 'g', status: 'active' }] } }), false);
  assert.equal(mayExportClubData({ status: 'removed', role: 'admin' }), false);
  assert.equal(mayExportClubData({ status: 'pending', isOwner: true }), false);
  assert.equal(mayExportClubData(null), false);
});

test('no session → 401 and nothing else; a write method → 405', async () => {
  const w = await seeded();
  const anon = await exportAs(null);
  assert.equal(anon.status, 401);
  assert.equal(anon.doc?.schema, undefined);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const r = await exportAs(w.owner, {}, method);
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.Allow, 'GET, OPTIONS');
  }
});

// ── which club ──────────────────────────────────────────────────────────────

test('the club is the session\'s: naming another club in the query changes nothing', async () => {
  const w = await seeded();
  const r = await exportAs(w.ownerB, { clubId: w.a, teamId: w.a, club: w.a });
  assert.equal(r.status, 200);
  assert.equal(r.doc.clubId, w.b, 'club B\'s owner gets club B');
  assert.equal(r.raw.includes(w.a), false, 'and no trace of club A');
  assert.equal(/Alpha RFC|Pat Player|Nina New|fx_a1/.test(r.raw), false);
});

test('every record in club A\'s export is club A\'s: no club B value anywhere, and B\'s account is withheld from A\'s roster', async () => {
  const w = await seeded();
  const r = await exportAs(w.owner);
  assert.equal(r.raw.includes('BRAVO_SENTINEL'), false, (r.raw.match(/BRAVO_SENTINEL_\w+/g) || []).join(', '));
  assert.equal(r.raw.includes(w.b), false, 'no club B id');
  assert.ok(r.doc.members.every(m => m.userId), 'members present');
  assert.equal(r.doc.people.some(p => p.id === w.ownerB.user.id), false, 'club B\'s owner is not one of A\'s people');
  assert.deepEqual(r.doc.roster.map(x => x.id), ['p_pat'], 'the row tied to another club\'s account is withheld, as the roster read withholds it');
  assert.deepEqual(r.doc.fixtures.map(f => f.id), ['fx_a1']);
  assert.deepEqual(r.doc.templates.map(t => t.id), ['tpl-a']);
});

// ── what never leaves ───────────────────────────────────────────────────────

test('no invite token, credential, session, push secret, medical, chat, draft, coach sheet, coach plan or S&C value appears', async () => {
  const w = await seeded();
  const r = await exportAs(w.owner);
  assert.equal(r.status, 200);
  assert.equal(r.raw.includes('SENTINEL_'), false, `leaked: ${(r.raw.match(/SENTINEL_\w+/g) || []).join(', ')}`);
  for (const token of w.tokens) assert.equal(r.raw.includes(token), false, 'no invite token');
  // Every stored secret in the identity store, whatever its field name.
  for (const u of read('app:identity:users')) for (const k of ['passwordHash', 'passwordSalt']) if (u[k]) assert.equal(r.raw.includes(u[k]), false, k);
  for (const s of read('app:identity:sessions')) if (s.tokenHash) assert.equal(r.raw.includes(s.tokenHash), false, 'session hash');
  for (const k of ['"token"', '"tokenHash"', '"passwordHash"', '"passwordSalt"', '"platformRole"', '"lastTeamId"', '"legacyPlayerId"', '"stripeCustomerId"', '"subscription"'])
    assert.equal(r.raw.includes(k), false, k);
  assert.equal(r.raw.includes('?inv='), false);
  assert.deepEqual(r.doc.medical, { included: false, reason: 'Medical records are not part of the club data export.' });
  assert.equal(r.doc.invites.length, 1, 'the invite itself is listed — without its token');
  assert.equal(r.doc.invites[0].email, 'nina@alpha.test');
});

test('training: only player-published sessions travel, with their player-safe fields; coach plans and unpublished sessions do not', async () => {
  const w = await seeded();
  const r = await exportAs(w.owner);
  const sen = r.doc.training.find(g => g.groupId === w.seniors);
  assert.deepEqual(sen.sessions.map(s => s.id), ['sess_pub']);
  assert.equal(sen.sessions[0].focus, 'Rucks', 'the player snapshot\'s theme');
  assert.deepEqual(sen.sessions[0].blocks, [{ time: '19:00', activity: 'Warm-up' }]);
  assert.equal(sen.attendance[0].marks[0].status, 'present');
  assert.deepEqual(sen.schedule, [], 'a schedule that was never stored is not invented from defaults');
  const u18 = r.doc.training.find(g => g.groupId === w.u18);
  assert.deepEqual(u18.schedule.map(s => s.id), ['slot_wed'], 'a stored schedule travels');
});

test('squads: the published fixture sheet only — drafts and coach sheets stay home', async () => {
  const w = await seeded();
  const r = await exportAs(w.owner);
  assert.deepEqual(r.doc.squads.map(q => [q.fixtureId, q.opposition]), [['fx_a1', 'Kituro']]);
  assert.equal(r.doc.counts.squads, 1);
});

test('availability: answers by the established rule — a legacy bare string is the response, with no reason and no time', async () => {
  const w = await seeded();
  const r = await exportAs(w.owner);
  const s = r.doc.availability.find(a => a.groupId === w.seniors && a.sessionId === 'slot_tue-20261020');
  assert.ok(s, JSON.stringify(r.doc.availability));
  const legacy = s.answers.find(a => a.key === 'legacy_key');
  assert.deepEqual(legacy, { key: 'legacy_key', userId: '', playerId: '', response: 'maybe', reason: '', respondedAt: null });
  const modern = s.answers.find(a => a.key === w.player.user.id);
  assert.equal(modern.response, 'available');
  assert.equal(modern.respondedAt, '2026-10-19T08:00:00Z');
});

test('templates: a club that stored none exports none — the built-in defaults are product text, not club data', async () => {
  const w = await seeded();
  kv.delete(`app:templates:${w.a}`);
  const r = await exportAs(w.owner);
  assert.deepEqual(r.doc.templates, []);
});

// ── failure is all or nothing ───────────────────────────────────────────────

test('a storage outage mid-export → 503 and no export', async () => {
  const w = await seeded();
  const real = globalThis.fetch;
  globalThis.fetch = async (u, o = {}) => {
    const [c, ...a] = JSON.parse(o.body || '[]');
    if (c === 'GET' && a[0] === `app:roster:${w.a}`) throw new TypeError('fetch failed');
    return real(u, o);
  };
  try {
    const r = await exportAs(w.owner);
    assert.equal(r.status, 503, r.raw.slice(0, 200));
    assert.equal(r.doc?.code, 'storage_unavailable');
    assert.equal(r.doc?.schema, undefined);
    assert.equal(r.raw.includes('Pat Player'), false, 'no partial data');
  } finally { globalThis.fetch = real; }
});

/** 500, generic, no export, and nothing in the body that names a record, key or person. */
function assertRefusedGenerically(r, label, w) {
  assert.equal(r.status, 500, `${label}: ${r.raw.slice(0, 200)}`);
  assert.equal(r.doc?.code, 'club_export_data_invalid', label);
  assert.equal(r.doc?.schema, undefined, `${label}: no export`);
  assert.deepEqual(Object.keys(r.doc).sort(), ['code', 'error', 'ok'], `${label}: no path or section in the response`);
  for (const leak of [w.a, w.seniors, w.u18, w.player.user.id, 'app:', 'grp_', 'slot_'])
    assert.equal(r.raw.includes(leak), false, `${label}: the response names ${leak}`);
}

test('a malformed stored record → 500 with a generic message only — no path, key or user id reaches the client', async () => {
  let w = await seeded();
  set(`app:roster:${w.a}`, { players: 'not a list' });
  assertRefusedGenerically(await exportAs(w.owner), 'roster', w);
  // A malformed answer is refused, not guessed at.
  w = await seeded();
  set(`app:availability:${w.a}:group:${w.seniors}:slot_thu-20261022`, { [w.player.user.id]: 42 });
  assertRefusedGenerically(await exportAs(w.owner), 'availability answer', w);
});

// Each record the product's own readers would quietly treat as ABSENT when it
// is present but malformed (kvGet returns the raw string for unparseable JSON).
const CORRUPT = w => ({
  'structure: unparseable': [`app:structure:${w.a}`, 'not json {'],
  'structure: groups not a list': [`app:structure:${w.a}`, JSON.stringify({ version: 1, groups: 'x', teams: [] })],
  'structure: a group without an id': [`app:structure:${w.a}`, JSON.stringify({ version: 1, groups: [{ name: 'No id' }], teams: [] })],
  'invites: the club list': [`app:invites:${w.a}`, 'not json ['],
  'invites: the shared legacy list': ['ce:invites', JSON.stringify({ not: 'a list' })],
  'templates: the club list': [`app:templates:${w.a}`, JSON.stringify({ not: 'a list' })],
  'training: a group store': [`app:publish:${w.a}:group:${encodeURIComponent(w.u18)}:training`, JSON.stringify(['an', 'array'])],
  'training: the initial group\'s legacy store': [`app:publish:${w.a}:training`, 'not json'],
  'attendance: a register': [`app:publish:${w.a}:group:${encodeURIComponent(w.u18)}:attendance`, '"a string"'],
  'attendance: sessions not a record': [`app:publish:${w.a}:group:${encodeURIComponent(w.u18)}:attendance`, JSON.stringify({ sessions: [] })],
  'availability: a group record': [`app:availability:${w.a}:group:${w.u18}:slot_wed-20261021`, 'not json'],
  'availability: a group record that is a list': [`app:availability:${w.a}:group:${w.u18}:slot_wed-20261021`, JSON.stringify([1, 2])],
  'availability: the club-level record the initial group reads': [`app:availability:${w.a}:slot_tue-20261013`, '"available"'],
  // Finding A — the reader would read these as "no fixtures" or invent a fixture.
  'fixtures: not a list': [`app:club:${w.a}`, JSON.stringify({ ...read(`app:club:${w.a}`), fixtures: 'oops' })],
  'fixtures: a non-object entry': [`app:club:${w.a}`, JSON.stringify({ ...read(`app:club:${w.a}`), fixtures: [{ id: 'fx_ok', opposition: 'Kituro', date: '2026-10-31' }, null] })],
  'fixtures: a string entry': [`app:club:${w.a}`, JSON.stringify({ ...read(`app:club:${w.a}`), fixtures: ['fx_as_text'] })],
  // Finding B — a schedule without a slots list reads as "no schedule".
  'schedule: a group record without slots': [`app:publish:${w.a}:group:${encodeURIComponent(w.u18)}:training_schedule`, JSON.stringify({ slots: 'x' })],
  'schedule: a group record that is not a record': [`app:publish:${w.a}:group:${encodeURIComponent(w.u18)}:training_schedule`, 'not json'],
  'schedule: the initial group\'s legacy record': [`app:publish:${w.a}:training_schedule`, JSON.stringify({ updatedAt: 'x' })],
  // Finding C — a non-object entry would become an empty register.
  'attendance: a register entry that is not a record': [`app:publish:${w.a}:group:${encodeURIComponent(w.seniors)}:attendance`,
    JSON.stringify({ sessions: { 'slot_tue-20261020': { date: '2026-10-20', marks: {} }, 'slot_thu-20261022': 'present' } })],
  // Finding D — a stored structure missing groups or teams reads as an empty club.
  'structure: groups missing': [`app:structure:${w.a}`, JSON.stringify({ version: 1, teams: [] })],
  'structure: teams missing': [`app:structure:${w.a}`, JSON.stringify({ version: 1, groups: [{ id: 'grp_initial', name: 'Seniors' }] })],
  'structure: teams not a list': [`app:structure:${w.a}`, JSON.stringify({ version: 1, groups: [{ id: 'grp_initial', name: 'Seniors' }], teams: {} })],
});

test('valid fixtures, schedules (current and legacy), attendance and structure still export, unchanged', async () => {
  const w = await seeded();
  // The initial group's schedule from the LEGACY club-wide record (no group record stored).
  kv.delete(`app:publish:${w.a}:group:${encodeURIComponent(w.seniors)}:training_schedule`);
  set(`app:publish:${w.a}:training_schedule`, { slots: [{ id: 'slot_tue', sessionId: 'tue', day: 'Tue', startTime: '19:00' }] });
  // A corrupt legacy schedule is NOT read when the group's own record exists — so it cannot refuse the export.
  set(`app:publish:${w.a}:group:${encodeURIComponent(w.u18)}:training_schedule`, { slots: [{ id: 'slot_wed', day: 'Wed', startTime: '18:30' }] });
  const r = await exportAs(w.owner);
  assert.equal(r.status, 200, r.raw.slice(0, 200));
  assert.deepEqual(r.doc.fixtures.map(f => [f.id, f.opposition, f.notes]), [['fx_a1', 'Kituro', 'Bring both kits']]);
  assert.deepEqual(r.doc.training.find(g => g.groupId === w.seniors).schedule.map(s => s.id), ['slot_tue'], 'legacy schedule read by precedence');
  assert.deepEqual(r.doc.training.find(g => g.groupId === w.u18).schedule.map(s => s.id), ['slot_wed']);
  assert.equal(r.doc.training.find(g => g.groupId === w.seniors).attendance[0].marks[0].status, 'present');
  assert.deepEqual(r.doc.structure.groups.map(g => g.id).sort(), [w.seniors, w.u18].sort());
});

test('the initial group\'s legacy schedule is checked only when the reader would read it', async () => {
  const w = await seeded();
  set(`app:publish:${w.a}:group:${encodeURIComponent(w.seniors)}:training_schedule`, { slots: [] });   // the group's own record wins
  kv.set(`app:publish:${w.a}:training_schedule`, 'not json');                                          // so this is never read
  const r = await exportAs(w.owner);
  assert.equal(r.status, 200, r.raw.slice(0, 200));
});

test('every present-but-malformed record the readers would silently skip refuses the whole export (generic 500)', async () => {
  const probe = await seeded();
  assert.equal(probe.seniors, 'grp_initial', 'the fixture\'s first group is the initial group (club-level fallbacks apply to it)');
  for (const label of Object.keys(CORRUPT(probe))) {
    const w = await seeded();
    const [k, raw] = CORRUPT(w)[label];
    kv.set(k, raw);
    assertRefusedGenerically(await exportAs(w.owner), label, w);
  }
});

test('a MISSING record keeps the readers\' normal behaviour — nothing stored is not corruption', async () => {
  const w = await seeded();
  for (const k of [`app:structure:${w.b}`, `app:invites:${w.a}`, 'ce:invites', `app:templates:${w.a}`,
    `app:publish:${w.a}:group:${encodeURIComponent(w.seniors)}:attendance`, `app:publish:${w.a}:training`]) kv.delete(k);
  const r = await exportAs(w.owner);
  assert.equal(r.status, 200, r.raw.slice(0, 200));
  assert.deepEqual(r.doc.templates, []);
  assert.deepEqual(r.doc.invites, []);
});

test('valid LEGACY formats still export: club-level availability, the legacy training store, a legacy invite naming the club', async () => {
  const w = await seeded();
  set(`app:availability:${w.a}:slot_tue-20261013`, { legacy_player: 'available' });
  set(`app:publish:${w.a}:training`, { sess_legacy: { player: { publishedAt: '2026-09-01T10:00:00Z', snapshot: { title: 'Legacy session', date: '2026-09-02' } } } });
  kv.delete(`app:publish:${w.a}:group:${encodeURIComponent(w.seniors)}:training`);   // so the initial group falls back to it
  set('ce:invites', [{ token: 'tok_legacy_SENTINEL_x9', name: 'Lou Legacy', email: 'lou@alpha.test', role: 'player', status: 'pending', teamId: w.a }]);
  const r = await exportAs(w.owner);
  assert.equal(r.status, 200, r.raw.slice(0, 200));
  const legacyAnswers = r.doc.availability.find(a => a.groupId === w.seniors && a.sessionId === 'slot_tue-20261013');
  assert.deepEqual(legacyAnswers.answers, [{ key: 'legacy_player', userId: '', playerId: '', response: 'available', reason: '', respondedAt: null }]);
  assert.deepEqual(r.doc.training.find(g => g.groupId === w.seniors).sessions.map(s => s.title), ['Legacy session']);
  assert.ok(r.doc.invites.some(i => i.email === 'lou@alpha.test'), 'the legacy invite naming this club travels');
  assert.equal(r.raw.includes('tok_legacy'), false, 'without its token');
});

test('ANOTHER club\'s malformed record never blocks this club\'s export', async () => {
  const w = await seeded();
  kv.set(`app:availability:${w.b}:group:grp_initial:slot_x`, 'not json');
  kv.set(`app:availability:${w.b}:slot_y`, 'not json');
  kv.set(`app:structure:${w.b}`, 'not json');
  kv.set(`app:templates:${w.b}`, 'not json');
  const r = await exportAs(w.owner);
  assert.equal(r.status, 200, r.raw.slice(0, 200));
  assert.equal(r.doc.clubId, w.a);
});

test('strict mode is opt-in: the product\'s own availability reader still skips a malformed record, unchanged', async () => {
  const w = await seeded();
  kv.set(`app:availability:${w.a}:group:${w.u18}:slot_wed-20261021`, 'not json');
  const { loadAllGroupAvailability } = await import('../api/_availabilityStore.js');
  const bySession = await loadAllGroupAvailability(w.a, w.u18);
  assert.equal('slot_wed-20261021' in bySession, false, 'default: skipped exactly as before');
  await assert.rejects(() => loadAllGroupAvailability(w.a, w.u18, { strict: true }), e => e.code === 'STORED_RECORD_MALFORMED');
});

test('an export over the size limit → 413, never truncated', async () => {
  const w = await seeded();
  const big = 'x'.repeat(5000);
  set(`app:roster:${w.a}`, { players: Array.from({ length: Math.ceil(CLUB_DATA_EXPORT_MAX_BYTES / 5000) + 10 }, (_, i) => ({ id: `p_${i}`, name: `P ${i}`, address: big })) });
  const r = await exportAs(w.owner);
  assert.equal(r.status, 413);
  assert.equal(r.doc?.code, 'club_export_too_large');
  assert.equal(r.doc?.limit, CLUB_DATA_EXPORT_MAX_BYTES);
  assert.ok(r.raw.length < 1000, 'the refusal carries no data');
});

test('the limit sits below Vercel\'s documented 4.5 MB Function response limit', () => {
  assert.ok(CLUB_DATA_EXPORT_MAX_BYTES < 4.5 * 1024 * 1024 && CLUB_DATA_EXPORT_MAX_BYTES < 4_500_000);
});

// ── side effects ────────────────────────────────────────────────────────────

test('the export writes nothing but its audit entry and its rate counter; the audit records counts, not data', async () => {
  const w = await seeded();
  const before = new Map(kv);
  const r = await exportAs(w.owner);
  assert.equal(r.status, 200);
  const changed = [...new Set([...kv.keys(), ...before.keys()])].filter(k => kv.get(k) !== before.get(k));
  assert.ok(changed.every(k => k === 'app:identity:audit_log' || k.startsWith('app:rate:') || k.startsWith('app:lock:')), `unexpected writes: ${changed.join(', ')}`);
  const entry = read('app:identity:audit_log').find(e => e.event === 'club_data_export');
  assert.ok(entry, 'audited');
  assert.equal(entry.teamId, w.a);
  assert.equal(entry.userId, w.owner.user.id);
  assert.deepEqual(entry.counts, r.doc.counts);
  assert.equal(JSON.stringify(entry).includes('Pat Player'), false, 'no club data in the audit log');
});

test('a BUSY audit log → 503 audit_unavailable and no export; other audit callers keep their drop-with-a-note behaviour', { timeout: 60000 }, async () => {
  const w = await seeded();
  kv.set('app:lock:audit_log', JSON.stringify('held-by-another-request'));       // the audit lock stays held
  const r = await exportAs(w.owner);
  assert.equal(r.status, 503, r.raw.slice(0, 200));
  assert.equal(r.doc?.code, 'audit_unavailable');
  assert.equal(r.doc?.schema, undefined, 'no export');
  assert.equal(r.headers['Content-Disposition'], undefined, 'no download');
  assert.equal(r.raw.includes('Pat Player'), false, 'no export bytes');
  assert.equal(read('app:identity:audit_log').some(e => e.event === 'club_data_export'), false);
  // Every other caller: unchanged — the entry is dropped with a note, nothing throws.
  const { auditLog } = await import('../api/_security.js');
  const entry = await auditLog('some_other_event', { teamId: w.a });
  assert.equal(entry.event, 'some_other_event', 'returned as before');
  await assert.rejects(() => auditLog('required_event', {}, { required: true }), e => e.code === 'busy');
  kv.delete('app:lock:audit_log');
});

test('a storage outage in the rate limiter → 503 storage_unavailable, not "rate limited"', async () => {
  const w = await seeded();
  const real = globalThis.fetch;
  globalThis.fetch = async (u, o = {}) => {
    const [c, ...a] = JSON.parse(o.body || '[]');
    if (String(a[0] || '').startsWith('app:rate:club_data_export:')) throw new TypeError('fetch failed');
    return real(u, o);
  };
  try {
    const r = await exportAs(w.owner);
    assert.equal(r.status, 503, r.raw.slice(0, 200));
    assert.equal(r.doc?.code, 'storage_unavailable');
    assert.equal(r.doc?.schema, undefined);
  } finally { globalThis.fetch = real; }
});

test('a sixth export within the hour is rate-limited (429)', async () => {
  const w = await seeded();
  for (let i = 0; i < 5; i++) assert.equal((await exportAs(w.owner)).status, 200, `export ${i + 1}`);
  const r = await exportAs(w.owner);
  assert.equal(r.status, 429);
  assert.equal(r.doc?.code, 'club_export_rate_limited');
  assert.match(r.doc?.error, /^You have exported this club's data 5 times in the last hour\. Try again in \d+ minutes?\.$/);
  assert.equal(/email|spelling/i.test(r.doc?.error), false, 'not the sign-in limiter\'s wording');
  assert.ok(Number(r.headers['Retry-After']) > 0, 'Retry-After kept');
  assert.equal(r.doc?.schema, undefined);
});

test('the shared limiter\'s own message is unchanged for its other callers', async () => {
  const { enforceRateLimit } = await import('../api/_security.js');
  for (let i = 0; i < 2; i++) await enforceRateLimit('some_other_scope', 'id', { limit: 2, windowMs: 60000 });
  await assert.rejects(() => enforceRateLimit('some_other_scope', 'id', { limit: 2, windowMs: 60000 }),
    e => e.status === 429 && /double-check the exact email spelling/.test(e.message));
});

// ── deployment guards ───────────────────────────────────────────────────────

test('no new serverless function, and the excluded AI CEO export is neither imported nor touched', () => {
  const fns = fs.readdirSync(new URL('../api/', import.meta.url)).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  assert.equal(fns.length, 12);
  for (const f of ['../api/publish.js', '../api/_clubDataExportSource.js', '../api/_clubDataExport.js']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.equal(/from '\.\/_clubExport(Source)?\.js'/.test(src), false, `${f} does not import the excluded export`);
  }
});
