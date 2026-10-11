/**
 * DUPLICATE-PLAYER REPAIR — PREFLIGHT LIBRARY (Build 136E tooling).
 *
 * Pure functions, no I/O, no network, no credentials: everything here works on
 * an EXPLICITLY SUPPLIED snapshot (a sanitised copy of the identity, roster,
 * availability and publish records taken by a read-only audit) plus the
 * recorded human confirmations, and produces a PROPOSED before/after manifest.
 * It applies nothing. It cannot apply anything — there is no write path in
 * this module or in the CLI that wraps it.
 *
 * The rule throughout is the one the deployment gate already follows:
 * ambiguity produces a REFUSAL, never a guess. Every required confirmation must
 * be an actual recorded answer (person, decision, who confirmed, when); a
 * missing record, an unknown slot, a conflicting answer between the two
 * accounts, a reference to the duplicate that the plan does not know how to
 * re-point, or a snapshot older than the allowed window all BLOCK the pair, and
 * one blocked pair blocks the whole manifest.
 *
 * Mechanics are the ones docs/operations/build-136d-duplicate-player-repair-
 * plan.md traced on the production code ("alias + retire"):
 *   · kept profile  legacyPlayerId := duplicate userId; duplicate profile deleted
 *   · duplicate membership status := 'removed', removedBy 'build-136e-merge',
 *     mergedInto := kept userId  (the Build 136E/136G guards refuse to revive it)
 *   · duplicate sessions for the club dropped; duplicate push subscriptions removed
 *   · roster: kept row aliases the duplicate; duplicate row deleted
 *   · publish sheets: `id:<duplicate>` keys re-pointed to `id:<kept>` — ONLY in
 *     formationKeys / benchKeys; any other reference is unexpected and blocks
 *   · users, availability records, medical, messages: never touched
 *
 * Key names mirror api/_identityStore.js, api/_rosterProjection.js,
 * api/subscribe.js and api/publish.js; name folding mirrors
 * scripts/audit-duplicate-players.mjs, the audit that found the pairs.
 */
import { createHash } from 'node:crypto';
import { knownIdsOf, reducePublishRecord, isReducedPublishRecord, PUBLISH_REDUCED } from './duplicate-repair-shared.mjs';
export { knownIdsOf, reducePublishRecord, isReducedPublishRecord, PUBLISH_REDUCED };

export const SNAPSHOT_SCHEMA = 'coacheasier-duplicate-repair-snapshot/1';
export const CONFIRMATIONS_SCHEMA = 'coacheasier-duplicate-repair-confirmations/1';
export const MANIFEST_SCHEMA = 'coacheasier-duplicate-repair-manifest/1';
/** Confirmations cannot predate the plan that asked for them. */
export const PLAN_DATE = '2026-10-08';
export const DEFAULT_MAX_AGE_HOURS = 6;
/** A staff member with this many answers, the latest inside the window, is a
 *  player on the evidence (the plan's criterion for Louis / Vincent / Victor)
 *  and needs no "do you play?" question. Anyone else with a player-group mark
 *  needs a recorded answer. Both numbers appear in the manifest. */
export const EVIDENCE_MIN_ANSWERS = 10;
export const EVIDENCE_WINDOW_DAYS = 45;
export const MERGE_REMOVED_BY = 'build-136e-merge';
export const PAIR_RELATIONSHIPS = ['same', 'different', 'unknown'];
export const STAFF_DECISIONS = ['clear_plays_for', 'keep_plays_for'];

const s = v => String(v ?? '').trim();
const lower = v => s(v).toLowerCase();
export const fold = v => s(v).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const maskEmail = e => {
  const [u, d] = lower(e).split('@');
  if (!d) return e ? '(invalid)' : '';
  return `${u.slice(0, 1)}***@${d} #${createHash('sha256').update(lower(e)).digest('hex').slice(0, 6)}`;
};
export const parseIso = v => { const t = Date.parse(s(v)); return Number.isFinite(t) ? t : NaN; };

/** Stable serialisation: object keys sorted at every depth, so equal data hashes equal. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}
export const hashValue = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
/**
 * The precondition a re-read must match. Record STORES are arrays (users,
 * memberships, profiles, sessions, subscriptions) or a record holding one
 * (roster.players); their order carries no meaning, so elements are sorted by
 * their canonical form before hashing — a re-read that returns the same
 * records in another order still matches, any changed record does not.
 * Publish sheets are positional (formationKeys / benchKeys) and hash as they are.
 */
export const HASH_METHOD = 'sha256 of canonical JSON; record arrays (and roster.players) order-insensitive';
/** Publish records are hashed in their REDUCED form: re-read the live record, reduce it with reducePublishRecord(live, knownIdsOf(snapshot)), then hash. */
export const PUBLISH_HASH_METHOD = 'sha256 of canonical JSON of reducePublishRecord(live record, knownIdsOf(snapshot)) — the re-read must be reduced the same way before comparing';
export function hashStore(value) {
  const sortRecords = arr => [...arr].map(canonicalJson).sort();
  if (Array.isArray(value)) return createHash('sha256').update('[' + sortRecords(value).join(',') + ']').digest('hex');
  if (value && typeof value === 'object' && Array.isArray(value.players)) {
    return createHash('sha256').update(canonicalJson({ ...value, players: sortRecords(value.players) })).digest('hex');
  }
  return hashValue(value);
}
export const keyOf = (snapshot, name) => `${s(snapshot.keyPrefix) || 'app'}:${name}`;

// ── snapshot ──────────────────────────────────────────────────────────────
export function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') return ['snapshot is not an object'];
  if (snapshot.schema !== SNAPSHOT_SCHEMA) errors.push(`snapshot.schema must be "${SNAPSHOT_SCHEMA}"`);
  if (!Number.isFinite(parseIso(snapshot.takenAt))) errors.push('snapshot.takenAt is missing or not an ISO date');
  if (!s(snapshot.club)) errors.push('snapshot.club is missing');
  for (const f of ['users', 'team_members', 'player_profiles', 'sessions', 'subscriptions']) {
    if (!Array.isArray(snapshot[f])) errors.push(`snapshot.${f} must be an array`);
  }
  if (!snapshot.roster || !Array.isArray(snapshot.roster.players)) errors.push('snapshot.roster.players must be an array');
  for (const f of ['availability', 'publish', 'medical']) {
    if (!snapshot[f] || typeof snapshot[f] !== 'object' || Array.isArray(snapshot[f])) errors.push(`snapshot.${f} must be an object keyed by store key (may be empty)`);
  }
  if (!Array.isArray(snapshot.messages)) errors.push('snapshot.messages must be an array of DM key names (may be empty)');
  if (snapshot.publish && typeof snapshot.publish === 'object' && !Array.isArray(snapshot.publish)) {
    for (const [key, v] of Object.entries(snapshot.publish)) {
      if (!isReducedPublishRecord(v)) errors.push(`publish record ${key} is not in the reduced form (${PUBLISH_REDUCED}) — take the snapshot with the current tool; raw publish records are never accepted`);
    }
  }
  return errors;
}

export function snapshotAgeMs(snapshot, now) { return now - parseIso(snapshot.takenAt); }

// ── accounts ──────────────────────────────────────────────────────────────
function indexSnapshot(snapshot) {
  const club = s(snapshot.club);
  const usersById = new Map(snapshot.users.map(u => [s(u.id), u]));
  const byUser = (list, pick = x => s(x.userId)) => {
    const m = new Map();
    for (const x of list) { const k = pick(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return m;
  };
  return {
    club, usersById,
    membershipsByUser: byUser(snapshot.team_members),
    profilesByUser: byUser(snapshot.player_profiles.filter(p => s(p.teamId) === club)),
    rowsByUser: byUser(snapshot.roster.players),
    sessionsByUser: byUser(snapshot.sessions),
    subsByUser: byUser(snapshot.subscriptions),
  };
}

/** Every durable id an account's answers, selections and rows can carry. */
export function accountIds(acct) {
  const ids = new Set([s(acct.userId)]);
  for (const p of acct.profiles) if (s(p.legacyPlayerId)) ids.add(s(p.legacyPlayerId));
  for (const r of acct.rosterRows) { ids.add(s(r.id)); if (s(r.legacyPlayerId)) ids.add(s(r.legacyPlayerId)); }
  ids.delete('');
  return ids;
}

function entryIds(value) {
  if (!value || typeof value !== 'object') return [];
  return [value.userId, value.playerId, value.legacyPlayerId].map(s).filter(Boolean);
}

/** Answers held by an account across every availability record in the snapshot. */
export function answersFor(snapshot, ids) {
  const out = [];
  for (const [key, entries] of Object.entries(snapshot.availability || {})) {
    if (!entries || typeof entries !== 'object') continue;
    for (const [entryKey, value] of Object.entries(entries)) {
      const mine = ids.has(s(entryKey)) || entryIds(value).some(id => ids.has(id));
      if (!mine) continue;
      out.push({ key, entryKey, response: typeof value === 'string' ? value : s(value?.response), respondedAt: typeof value === 'string' ? null : (value?.respondedAt || null) });
    }
  }
  return out;
}
const latestOf = answers => answers.map(a => a.respondedAt).filter(Boolean).sort().pop() || null;

function describeAccount(idx, snapshot, userId) {
  const uid = s(userId);
  const u = idx.usersById.get(uid) || null;
  const memberships = idx.membershipsByUser.get(uid) || [];
  const acct = {
    userId: uid, accountExists: Boolean(u), email: maskEmail(u?.email), createdAt: u?.createdAt || null, lastLoginAt: u?.lastLoginAt || null,
    memberships: memberships.filter(m => s(m.teamId) === idx.club),
    otherClubMemberships: memberships.filter(m => s(m.teamId) !== idx.club),
    profiles: idx.profilesByUser.get(uid) || [],
    rosterRows: idx.rowsByUser.get(uid) || [],
    sessions: idx.sessionsByUser.get(uid) || [],
    subscriptions: idx.subsByUser.get(uid) || [],
  };
  // Subscriptions can also be keyed by playerId / legacyPlayerId.
  const ids = accountIds(acct);
  acct.subscriptions = snapshot.subscriptions.filter(x => entryIds(x).some(id => ids.has(id)));
  acct.ids = [...ids].sort();
  const answers = answersFor(snapshot, ids);
  acct.answers = { count: answers.length, latest: latestOf(answers) };
  return acct;
}

const nameOf = (idx, m) => s(idx.profilesByUser.get(s(m.userId))?.[0]?.displayName) || s(idx.usersById.get(s(m.userId))?.displayName) || s(idx.rowsByUser.get(s(m.userId))?.[0]?.name);

/** Active memberships in the club sharing a folded name, 2+ distinct accounts. */
export function findPairs(snapshot) {
  const idx = indexSnapshot(snapshot);
  const groups = new Map();
  for (const m of snapshot.team_members) {
    if (s(m.teamId) !== idx.club || s(m.status) !== 'active') continue;
    const key = fold(nameOf(idx, m)); if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(s(m.userId));
  }
  const pairs = [];
  for (const [key, users] of groups) {
    if (users.size < 2) continue;
    const accounts = [...users].sort().map(uid => describeAccount(idx, snapshot, uid));
    pairs.push({ slot: `pair:${key.replace(/ /g, '-')}`, name: key, accounts });
  }
  return pairs.sort((a, b) => a.slot.localeCompare(b.slot));
}

/** Staff (non-player role) whose active membership carries a player-group mark. */
export function findStaffWithPlayMarks(snapshot, { now }) {
  const idx = indexSnapshot(snapshot);
  const out = [];
  for (const m of snapshot.team_members) {
    if (s(m.teamId) !== idx.club || s(m.status) !== 'active') continue;
    if (lower(m.role) === 'player' || !s(m.playerGroupId)) continue;
    const acct = describeAccount(idx, snapshot, m.userId);
    const latest = parseIso(acct.answers.latest);
    const evidencedPlayer = acct.answers.count >= EVIDENCE_MIN_ANSWERS && Number.isFinite(latest) && (now - latest) <= EVIDENCE_WINDOW_DAYS * 86400_000;
    out.push({ slot: `staff:${s(m.userId)}`, userId: s(m.userId), name: nameOf(idx, m), membershipId: s(m.id), role: s(m.role), staffLevel: s(m.staffLevel) || null,
      playerGroupId: s(m.playerGroupId), accessChangedBy: m.accessChangedBy || null, accessChangedAt: m.accessChangedAt || null,
      hasProfile: acct.profiles.length > 0, answers: acct.answers, evidencedPlayer });
  }
  return out.sort((a, b) => a.slot.localeCompare(b.slot));
}

export function requiredConfirmations(snapshot, { now }) {
  const pairs = findPairs(snapshot);
  const staff = findStaffWithPlayMarks(snapshot, { now });
  return { pairs, staff: staff.filter(x => !x.evidencedPlayer), evidencedStaff: staff.filter(x => x.evidencedPlayer) };
}

// ── confirmations ─────────────────────────────────────────────────────────
export function validateConfirmations(required, confirmations, { now }) {
  const errors = [];
  const bySlot = new Map();
  if (!confirmations || typeof confirmations !== 'object') return { errors: ['confirmations is not an object'], bySlot };
  if (confirmations.schema !== CONFIRMATIONS_SCHEMA) errors.push(`confirmations.schema must be "${CONFIRMATIONS_SCHEMA}"`);
  const records = Array.isArray(confirmations.records) ? confirmations.records : [];
  if (!Array.isArray(confirmations.records)) errors.push('confirmations.records must be an array');
  const known = new Map();
  for (const p of required.pairs) known.set(p.slot, { kind: 'pair', pair: p });
  for (const x of required.staff) known.set(x.slot, { kind: 'staff', staff: x });
  for (const x of required.evidencedStaff) known.set(x.slot, { kind: 'staff', staff: x, optional: true });
  const planMs = parseIso(PLAN_DATE);
  const invalid = new Set();   // slots whose record failed validation: never acted on, not reported as "missing" twice
  records.forEach((r, i) => {
    const where = `record ${i + 1} (${s(r?.slot) || 'no slot'})`;
    if (!r || typeof r !== 'object') { errors.push(`${where}: not an object`); return; }
    const slot = s(r.slot);
    const def = known.get(slot);
    if (!def) { errors.push(`${where}: unknown slot — not a pair or staff mark found in this snapshot`); return; }
    if (bySlot.has(slot) || invalid.has(slot)) { errors.push(`${where}: duplicate record for this slot`); return; }
    const errorsBefore = errors.length;
    if (s(r.kind) !== def.kind) errors.push(`${where}: kind must be "${def.kind}"`);
    if (!s(r.person)) errors.push(`${where}: person is required`);
    if (!s(r.confirmedBy)) errors.push(`${where}: confirmedBy (the human who gave the answer) is required`);
    const at = parseIso(r.confirmedAt);
    if (!Number.isFinite(at)) errors.push(`${where}: confirmedAt must be an ISO date`);
    else if (at > now) errors.push(`${where}: confirmedAt is in the future`);
    else if (at < planMs) errors.push(`${where}: confirmedAt predates the repair plan (${PLAN_DATE})`);
    if (def.kind === 'pair') {
      const rel = s(r.relationship);
      if (!PAIR_RELATIONSHIPS.includes(rel)) errors.push(`${where}: relationship must be one of ${PAIR_RELATIONSHIPS.join('/')}`);
      if (rel === 'same') {
        const keep = s(r.keepUserId), dup = s(r.duplicateUserId);
        const ids = def.pair.accounts.map(a => a.userId);
        if (!keep || !dup) errors.push(`${where}: keepUserId and duplicateUserId are required when relationship is "same"`);
        else {
          if (keep === dup) errors.push(`${where}: keepUserId and duplicateUserId are the same account`);
          if (!ids.includes(keep)) errors.push(`${where}: keepUserId is not one of this pair's accounts`);
          if (!ids.includes(dup)) errors.push(`${where}: duplicateUserId is not one of this pair's accounts`);
        }
        if (ids.length !== 2) errors.push(`${where}: this name has ${ids.length} active accounts — a merge is only defined for exactly two`);
      }
    } else if (!STAFF_DECISIONS.includes(s(r.decision))) {
      errors.push(`${where}: decision must be one of ${STAFF_DECISIONS.join('/')}`);
    }
    if (errors.length > errorsBefore) invalid.add(slot); else bySlot.set(slot, r);
  });
  for (const [slot, def] of known) {
    if (!def.optional && !bySlot.has(slot) && !invalid.has(slot)) errors.push(`missing confirmation for ${slot}${def.kind === 'pair' ? ` ("${def.pair.name}")` : ` (${def.staff.name})`}`);
  }
  return { errors, bySlot, invalid };
}

// ── per-pair checks + proposed writes ────────────────────────────────────
function walk(value, path, visit) {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { visit(k, `${path}.${k}`, true); walk(v, `${path}.${k}`, visit); }
  else visit(value, path, false);
}

/** Every place a publish record names the duplicate: re-pointable (formationKeys / benchKeys `id:<dup>`) or unexpected. */
export function publishReferences(snapshot, dupIds, keepUserId) {
  const repoints = [], unexpected = [];
  const keys = Object.keys(snapshot.publish || {}).sort();
  for (const key of keys) {
    for (const id of dupIds) if (key.includes(id)) unexpected.push({ key, path: '(key name)', value: key });
    walk(snapshot.publish[key], '$', (v, path, isKey) => {
      if (typeof v !== 'string') return;
      const hit = [...dupIds].find(id => v === id || v === `id:${id}` || (!isKey && v.includes(id)));
      if (!hit) return;
      const m = path.match(/^\$\.(formationKeys\.[^.\[]+|benchKeys\[\d+\])$/);
      if (!isKey && m && v === `id:${hit}`) repoints.push({ key, path: m[1], before: v, after: `id:${keepUserId}` });
      else if (/^\$\.referencedIds\[\d+\]$/.test(path)) unexpected.push({ key, path: 'outside its sheet positions (reduced record names the id elsewhere)', value: v });
      else unexpected.push({ key, path, value: v.length > 80 ? v.slice(0, 77) + '…' : v });
    });
  }
  return { repoints, unexpected };
}

function conflictsBetween(snapshot, idsA, idsB) {
  const conflicts = [], duplicates = [];
  for (const [key, entries] of Object.entries(snapshot.availability || {})) {
    if (!entries || typeof entries !== 'object') continue;
    const side = ids => Object.entries(entries).filter(([k, v]) => ids.has(s(k)) || entryIds(v).some(id => ids.has(id)))
      .map(([, v]) => ({ response: typeof v === 'string' ? v : s(v?.response), respondedAt: typeof v === 'string' ? '' : s(v?.respondedAt) }))
      .sort((x, y) => y.respondedAt.localeCompare(x.respondedAt))[0];
    const a = side(idsA), b = side(idsB);
    if (!a || !b) continue;
    (a.response === b.response ? duplicates : conflicts).push({ key, keep: a.response, duplicate: b.response });
  }
  return { conflicts, duplicates };
}

export function checkPair(snapshot, pair, record) {
  const blockers = [], warnings = [], writes = [];
  const out = { slot: pair.slot, name: pair.name, relationship: s(record.relationship), confirmedBy: s(record.confirmedBy), confirmedAt: s(record.confirmedAt),
    accounts: pair.accounts.map(a => ({ userId: a.userId, email: a.email, memberships: a.memberships.map(m => `${s(m.id)}:${s(m.role)}/${s(m.status)}`), answers: a.answers })),
    status: 'no_action_by_decision', blockers, warnings, writes, conflicts: [], duplicateAnswers: 0 };
  if (out.relationship !== 'same') return out;           // 'different' / 'unknown': recorded, nothing to merge
  const keep = pair.accounts.find(a => a.userId === s(record.keepUserId));
  const dup = pair.accounts.find(a => a.userId === s(record.duplicateUserId));
  if (!keep || !dup) { blockers.push('keep/duplicate ids do not resolve to this pair'); out.status = 'blocked'; return out; }
  out.keepUserId = keep.userId; out.duplicateUserId = dup.userId;

  for (const [label, a] of [['kept', keep], ['duplicate', dup]]) {
    if (!a.accountExists) blockers.push(`${label} account ${a.userId} has no user record`);
    if (a.memberships.length !== 1) blockers.push(`${label} account has ${a.memberships.length} memberships in this club (expected exactly 1)`);
    else {
      const m = a.memberships[0];
      if (s(m.status) !== 'active') blockers.push(`${label} membership ${s(m.id)} is ${s(m.status)}, not active`);
      if (s(m.mergedInto)) blockers.push(`${label} membership ${s(m.id)} already carries mergedInto`);
      if (lower(m.role) !== 'player') blockers.push(`${label} membership ${s(m.id)} is a ${s(m.role)} role — staff merges are out of scope`);
    }
    if (a.otherClubMemberships.length) blockers.push(`${label} account has ${a.otherClubMemberships.length} membership(s) in another club — out of scope`);
    if (a.profiles.length !== 1) blockers.push(`${label} account has ${a.profiles.length} player profiles in this club (expected exactly 1)`);
    else if (s(a.profiles[0].legacyPlayerId) && s(a.profiles[0].legacyPlayerId) !== a.userId) blockers.push(`${label} profile ${s(a.profiles[0].id)} already aliases ${s(a.profiles[0].legacyPlayerId)}`);
    if (a.rosterRows.length !== 1) blockers.push(`${label} account has ${a.rosterRows.length} roster rows (expected exactly 1)`);
    for (const sess of a.sessions) if (s(sess.teamId) !== s(snapshot.club)) blockers.push(`${label} account holds a session for another club (${s(sess.teamId)})`);
  }
  const dupIds = accountIds(dup), keepIds = accountIds(keep);
  for (const id of dupIds) if (keepIds.has(id)) blockers.push(`accounts already share the id ${id}`);
  // Rows that alias the duplicate but are not its own row.
  for (const r of snapshot.roster.players) if (dupIds.has(s(r.legacyPlayerId)) && s(r.userId) !== dup.userId) blockers.push(`roster row ${s(r.id)} (account ${s(r.userId)}) aliases the duplicate`);

  const { conflicts, duplicates } = conflictsBetween(snapshot, keepIds, dupIds);
  out.conflicts = conflicts; out.duplicateAnswers = duplicates.length;
  for (const c of conflicts) blockers.push(`availability conflict in ${c.key}: kept answered "${c.keep}", duplicate answered "${c.duplicate}"`);

  for (const [key, value] of Object.entries(snapshot.medical || {})) {
    const text = canonicalJson(value);
    for (const id of dupIds) if (text.includes(`"${id}"`)) blockers.push(`medical record ${key} names the duplicate account — out of scope`);
  }
  for (const key of snapshot.messages || []) for (const id of dupIds) if (String(key).includes(id)) blockers.push(`message thread ${key} names the duplicate account — out of scope`);

  const refs = publishReferences(snapshot, dupIds, keep.userId);
  for (const u of refs.unexpected) blockers.push(`unexpected reference to the duplicate in ${u.key} at ${u.path}: ${u.value}`);

  if (blockers.length) { out.status = 'blocked'; return out; }

  // ── proposed writes, in store order, each with the hash the re-read must match ──
  const club = s(snapshot.club);
  const keptProfile = keep.profiles[0], dupProfile = dup.profiles[0];
  writes.push({ store: 'identity:player_profiles', key: keyOf(snapshot, 'identity:player_profiles'), mechanism: 'direct store write under withIdentityLock',
    changes: [
      { target: { profileId: s(keptProfile.id) }, before: { legacyPlayerId: s(keptProfile.legacyPlayerId) || null }, after: { legacyPlayerId: dup.userId } },
      { target: { profileId: s(dupProfile.id) }, before: { exists: true, userId: dup.userId }, after: { exists: false } },
    ], precondition: { method: HASH_METHOD, sha256: hashStore(snapshot.player_profiles) } });
  const dm = dup.memberships[0];
  writes.push({ store: 'identity:team_members', key: keyOf(snapshot, 'identity:team_members'), mechanism: 'direct store write under withIdentityLock',
    changes: [{ target: { membershipId: s(dm.id) }, before: { status: s(dm.status), mergedInto: s(dm.mergedInto) || null },
      after: { status: 'removed', removedAt: '<set at execution>', removedBy: MERGE_REMOVED_BY, mergedInto: keep.userId } }],
    precondition: { method: HASH_METHOD, sha256: hashStore(snapshot.team_members) } });
  const dropSessions = dup.sessions.filter(x => s(x.teamId) === club).map(x => s(x.id)).sort();
  writes.push({ store: 'identity:sessions', key: keyOf(snapshot, 'identity:sessions'), mechanism: 'direct store write under withIdentityLock (what removeTeamMember does)',
    changes: dropSessions.map(id => ({ target: { sessionId: id }, before: { exists: true }, after: { exists: false } })),
    precondition: { method: HASH_METHOD, sha256: hashStore(snapshot.sessions) } });
  const keptRow = keep.rosterRows[0], dupRow = dup.rosterRows[0];
  const fill = {};
  for (const [f, v] of Object.entries(dupRow)) {
    if (['id', 'userId', 'legacyPlayerId', 'name'].includes(f) || f.startsWith('avail_')) continue;
    const kv = s(keptRow[f]);
    if (s(v) && s(v).toUpperCase() !== 'TBC' && (!kv || kv.toUpperCase() === 'TBC')) fill[f] = { before: keptRow[f] ?? null, after: v };
  }
  writes.push({ store: `roster:${club}`, key: keyOf(snapshot, `roster:${club}`), mechanism: 'direct store write — NO lock exists for this key: RE-READ IMMEDIATELY BEFORE WRITING and run when coaches are idle',
    changes: [
      { target: { rowId: s(keptRow.id) }, before: { legacyPlayerId: s(keptRow.legacyPlayerId) || null, ...Object.fromEntries(Object.entries(fill).map(([f, x]) => [f, x.before])) },
        after: { legacyPlayerId: dup.userId, ...Object.fromEntries(Object.entries(fill).map(([f, x]) => [f, x.after])) } },
      { target: { rowId: s(dupRow.id) }, before: { exists: true, userId: dup.userId }, after: { exists: false } },
    ], precondition: { method: HASH_METHOD, sha256: hashStore(snapshot.roster) } });
  const subs = dup.subscriptions.map(x => s(x.subscription?.endpoint).slice(-24)).sort();
  writes.push({ store: 'subscriptions', key: keyOf(snapshot, 'subscriptions'), mechanism: 'direct store write',
    changes: subs.map(tail => ({ target: { endpointTail: tail }, before: { exists: true }, after: { exists: false } })),
    precondition: { method: HASH_METHOD, sha256: hashStore(snapshot.subscriptions) } });
  for (const r of refs.repoints) {
    writes.push({ store: 'publish', key: r.key, mechanism: 'direct store write (sheet key re-point; names untouched)',
      changes: [{ target: { path: r.path }, before: r.before, after: r.after }], precondition: { method: PUBLISH_HASH_METHOD, sha256: hashStore(snapshot.publish[r.key]) } });
  }
  out.status = 'ready';
  return out;
}

export function checkStaff(snapshot, staff, record) {
  const decision = s(record?.decision);
  const out = { slot: staff.slot, name: staff.name, userId: staff.userId, membershipId: staff.membershipId, role: staff.role, playerGroupId: staff.playerGroupId,
    accessChangedBy: staff.accessChangedBy, hasProfile: staff.hasProfile, answers: staff.answers, evidencedPlayer: staff.evidencedPlayer,
    decision: decision || null, confirmedBy: s(record?.confirmedBy) || null, confirmedAt: s(record?.confirmedAt) || null, status: 'no_action', writes: [] };
  if (decision === 'clear_plays_for') {
    out.status = 'ready';
    out.writes.push({ store: 'identity:team_members', key: keyOf(snapshot, 'identity:team_members'), mechanism: 'admin action set_player_group with an empty group (the server path that clears "Plays for")',
      changes: [{ target: { membershipId: staff.membershipId }, before: { playerGroupId: staff.playerGroupId }, after: { playerGroupId: null } }],
      precondition: { method: HASH_METHOD, sha256: hashStore(snapshot.team_members) } });
  } else if (!decision && staff.evidencedPlayer) {
    out.status = 'no_question_evidenced_player';
  }
  return out;
}

// ── the manifest ──────────────────────────────────────────────────────────
export const WRITE_PROTOCOL = [
  'This manifest authorises nothing. It is a proposal computed from a snapshot.',
  'Before ANY write: take a fresh snapshot of every key named below with the same read-only audit, recompute this manifest from it, and require it to be byte-identical (bar generatedAt) to the one reviewed.',
  'Immediately before each store write, under withIdentityLock, re-read the key and compare its sha256 (canonical JSON) with the precondition recorded here; abort the pair on any mismatch.',
  `The roster key has no lock: re-read it immediately before its write and run while coaches are idle.`,
  'A publish record is compared in its REDUCED form (reducePublishRecord with knownIdsOf(snapshot)): the hash guards the sheet positions and references the repair depends on; the write is a read-modify-write of the LIVE record at the one named path, so unrelated edits made meanwhile survive.',
  'One pair at a time; verify the pair read-only before starting the next.',
  'No permanent delete is ever part of this repair; keep the snapshot files (umask 077) until post-release verification.',
];

export function buildManifest(snapshot, confirmations, { now = Date.now(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  const blockers = [], warnings = [];
  const manifest = { schema: MANIFEST_SCHEMA, generatedAt: new Date(now).toISOString(), ok: false, authorizesWrites: false, rereadRequired: true, blockers, warnings,
    snapshot: null, evidenceRule: { minAnswers: EVIDENCE_MIN_ANSWERS, windowDays: EVIDENCE_WINDOW_DAYS }, required: null, pairs: [], staff: [], evidencedStaff: [], writeProtocol: WRITE_PROTOCOL };
  const snapErrors = validateSnapshot(snapshot);
  if (snapErrors.length) { blockers.push(...snapErrors.map(e => `snapshot: ${e}`)); return manifest; }
  const ageMs = snapshotAgeMs(snapshot, now);
  manifest.snapshot = { takenAt: snapshot.takenAt, ageMinutes: Math.round(ageMs / 60000), maxAgeHours, club: s(snapshot.club), keyPrefix: s(snapshot.keyPrefix) || 'app', source: s(snapshot.source) || null };
  if (ageMs < 0) blockers.push('snapshot: takenAt is in the future');
  else if (ageMs > maxAgeHours * 3600_000) blockers.push(`snapshot: stale — taken ${Math.round(ageMs / 60000)} min ago, limit ${maxAgeHours} h; take a fresh read-only snapshot`);

  const required = requiredConfirmations(snapshot, { now });
  manifest.required = { pairs: required.pairs.map(p => p.slot), staff: required.staff.map(x => x.slot), evidencedStaff: required.evidencedStaff.map(x => x.slot) };
  const { errors, bySlot, invalid } = validateConfirmations(required, confirmations, { now });
  blockers.push(...errors.map(e => `confirmations: ${e}`));

  for (const pair of required.pairs) {
    const record = bySlot.get(pair.slot);
    if (!record) { manifest.pairs.push({ slot: pair.slot, name: pair.name, status: 'blocked', blockers: [invalid.has(pair.slot) ? 'the recorded confirmation is invalid (see confirmations blockers)' : 'no recorded confirmation'], writes: [] }); continue; }
    const checked = checkPair(snapshot, pair, record);
    manifest.pairs.push(checked);
    blockers.push(...checked.blockers.map(b => `${pair.slot}: ${b}`));
  }
  for (const staff of [...required.staff, ...required.evidencedStaff]) {
    const record = bySlot.get(staff.slot);
    const checked = checkStaff(snapshot, staff, record);
    (staff.evidencedPlayer && !record ? manifest.evidencedStaff : manifest.staff).push(checked);
  }
  manifest.ok = blockers.length === 0;
  manifest.summary = {
    pairsReady: manifest.pairs.filter(p => p.status === 'ready').length,
    pairsNoActionByDecision: manifest.pairs.filter(p => p.status === 'no_action_by_decision').length,
    pairsBlocked: manifest.pairs.filter(p => p.status === 'blocked').length,
    staffClear: manifest.staff.filter(x => x.status === 'ready').length,
    staffKeep: manifest.staff.filter(x => x.decision === 'keep_plays_for').length,
    evidencedStaffNoQuestion: manifest.evidencedStaff.length,
    writes: manifest.pairs.concat(manifest.staff).reduce((n, x) => n + (x.writes || []).reduce((m, w) => m + (w.changes || []).length, 0), 0),
  };
  return manifest;
}
