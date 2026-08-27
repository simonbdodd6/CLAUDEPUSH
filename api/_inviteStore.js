// api/_inviteStore.js — invitations, one list per club.
//
// THE FAULT THIS FIXES
// Every club's invitations shared a single flat list (`ce:invites`), trimmed
// to a fixed length on every write. A club creating invitations therefore
// pushed OTHER clubs' pending invitations off the end, and their perfectly
// valid links began answering "Invite not found". That is a cross-tenant
// availability fault: one tenant's ordinary use silently breaking another's.
//
// THE MODEL
// Each club owns `app:invites:<teamId>` and its own cap, so one club can only
// ever displace its own oldest invitations — the same rule as before, applied
// where it belongs.
//
// The old global list is still READ, so links minted before the split keep
// working. Nothing ever appends to it or trims it again, so it cannot evict
// anything; the one exception is persistInvite recording a claim or a
// revocation onto a record that still lives there, in place, which is how
// those links keep behaving exactly as they always did. Migration only ever
// copies OUT of it.
//
// PRECEDENCE
// A club's own list always wins over the legacy list for the same token. That
// is what makes migration safe to run while the product is live: once a record
// has been copied into its club, the legacy copy is inert, so a claim can
// never be recorded against one copy while the other still reads as pending.
//
// TENANCY
// Nothing here derives a club from a request. Callers pass the club they were
// already authorised for (a session's teamId), or look an invitation up by
// token and are told which club it belongs to — the invitation's own stored
// teamId, which only the server ever writes.
import { kvGet, kvSet, kvScanKeys } from './_kv.js';
import { key, invitesKey, legacyInvitesKey, invitesKeyPattern } from './_keys.js';

/** Unchanged from the global list — but now spent per club, not shared. */
export const MAX_INVITES_PER_CLUB = 200;

/** Where a record lives, so a mutation is written back to its own home. */
export const INVITE_SOURCE_CLUB = 'club';
export const INVITE_SOURCE_LEGACY = 'legacy';

const asArray = v => (Array.isArray(v) ? v : []);
const tokenOf = i => String(i?.token || '');
/** The club an invitation names. Only the server ever writes this field. */
const teamOf = i => String(i?.teamId || '').trim();

/**
 * The clubs that exist, read straight from the tenant list.
 *
 * A token names no club, so resolving one means asking each club in turn. The
 * club list is the authority on which clubs there are — the same direct read
 * api/_structureStore.js uses — so this introduces no second source of truth
 * and nothing that can drift out of step with reality.
 */
async function knownClubIds() {
  const teams = await kvGet(key('identity:teams'));
  return Array.isArray(teams) ? teams.map(t => String(t?.id || '')).filter(Boolean) : [];
}

async function readClubList(teamId) {
  return asArray(await kvGet(invitesKey(String(teamId || ''))));
}
async function readLegacyList() {
  return asArray(await kvGet(legacyInvitesKey()));
}
async function writeClubList(teamId, list) {
  await kvSet(invitesKey(String(teamId || '')), asArray(list).slice(0, MAX_INVITES_PER_CLUB));
}

/**
 * Every invitation this club can see: its own, plus any pre-namespace record
 * that names it. Deduped by token with the club's own copy winning, so a
 * migrated record is never shown twice or read from the stale copy.
 *
 * Read-only. Writing this back would drag legacy records into the club store
 * as a side effect of an unrelated save; only migrateLegacyInvites() moves
 * records between homes.
 */
export async function listClubInvites(teamId) {
  const id = String(teamId || '');
  if (!id) return [];
  const [own, legacy] = await Promise.all([readClubList(id), readLegacyList()]);
  const seen = new Set(own.map(tokenOf));
  const inherited = legacy.filter(i => teamOf(i) === id && !seen.has(tokenOf(i)));
  return [...own, ...inherited];
}

/** Add one new invitation to its club's list. Never touches the legacy list. */
export async function appendClubInvite(teamId, invite) {
  const id = String(teamId || '');
  if (!id) { const e = new Error('A club is required to store an invitation'); e.status = 400; throw e; }
  const list = await readClubList(id);
  list.unshift(invite);
  await writeClubList(id, list);
  return invite;
}

/**
 * Find an invitation from a token alone — the claim and validation paths,
 * which by their nature arrive with no club.
 *
 * Club lists are searched BEFORE the legacy list, so a migrated record always
 * resolves to its club copy and the legacy copy stays inert.
 *
 * Returns { invite, teamId, source } or null. `teamId` is the invitation's own
 * stored club, never anything the caller supplied.
 */
export async function findInviteByToken(token) {
  const wanted = String(token || '');
  if (!wanted) return null;
  // Every existing club, then any club list a scan turns up that the tenant
  // list did not (an orphan whose club was removed), then the legacy list.
  const clubs = await knownClubIds();
  for (const id of clubs) {
    const invite = (await readClubList(id)).find(i => tokenOf(i) === wanted);
    if (invite) return { invite, teamId: teamOf(invite) || id, source: INVITE_SOURCE_CLUB };
  }
  const seen = new Set(clubs.map(id => invitesKey(id)));
  for (const k of await kvScanKeys(invitesKeyPattern())) {
    if (seen.has(k)) continue;
    const invite = asArray(await kvGet(k)).find(i => tokenOf(i) === wanted);
    if (invite) return { invite, teamId: teamOf(invite) || keyTeamId(k), source: INVITE_SOURCE_CLUB };
  }
  const legacy = await readLegacyList();
  const invite = legacy.find(i => tokenOf(i) === wanted);
  if (invite) return { invite, teamId: teamOf(invite), source: INVITE_SOURCE_LEGACY };
  return null;
}

/** The club id embedded in a club invitation key, for a record missing its own. */
function keyTeamId(storeKey) {
  const marker = ':invites:';
  const at = String(storeKey || '').indexOf(marker);
  return at < 0 ? '' : String(storeKey).slice(at + marker.length);
}

/**
 * Persist a change to ONE invitation, in the home it was found in.
 *
 * A record still living in the legacy list is updated there rather than being
 * quietly moved: migration is the only thing that relocates records, so a
 * claim or a revocation never changes where a record lives while other
 * requests are reading it.
 */
export async function persistInvite({ invite, teamId, source } = {}) {
  const wanted = tokenOf(invite);
  if (!wanted) { const e = new Error('An invitation token is required'); e.status = 400; throw e; }
  if (source === INVITE_SOURCE_LEGACY) {
    const legacy = await readLegacyList();
    const at = legacy.findIndex(i => tokenOf(i) === wanted);
    if (at < 0) return false;
    legacy[at] = invite;
    await kvSet(legacyInvitesKey(), legacy);
    return true;
  }
  const id = String(teamId || teamOf(invite));
  if (!id) return false;
  const list = await readClubList(id);
  const at = list.findIndex(i => tokenOf(i) === wanted);
  if (at < 0) return false;
  list[at] = invite;
  await writeClubList(id, list);
  return true;
}

/**
 * Every invitation the platform holds, across all clubs plus the legacy list.
 *
 * For the few operations whose scope is genuinely the whole platform — the
 * provisioned-founder evidence lookup, and the migration itself. It is NOT a
 * club-facing read: no route hands this to a club's own request.
 */
export async function loadAllInvites() {
  const clubs = await knownClubIds();
  const scanned = (await kvScanKeys(invitesKeyPattern()))
    .filter(k => !clubs.some(id => invitesKey(id) === k));
  const lists = await Promise.all([...clubs.map(invitesKey), ...scanned].map(k => kvGet(k)));
  const own = lists.flatMap(asArray);
  const seen = new Set(own.map(tokenOf));
  const legacy = (await readLegacyList()).filter(i => !seen.has(tokenOf(i)));
  return [...own, ...legacy];
}

/**
 * Copy pre-namespace invitations into the clubs they name.
 *
 * Safe to run repeatedly: a token already present in its club's list is
 * counted as already migrated and left exactly as it is, so a re-run can never
 * overwrite a record that has since been claimed or revoked in its new home.
 *
 * The legacy list is NEVER modified — not even for records that moved. It
 * stays as a verbatim backup until we decide separately that it can be
 * retired, and because club lists win on read, the copies left behind are
 * inert.
 *
 * A record is moved only on evidence it already carries: its own stored
 * teamId. One that names no club is not guessed at — it is left where it is,
 * reported, and keeps working through the legacy read path.
 */
export async function migrateLegacyInvites({ dryRun = false } = {}) {
  const legacy = await readLegacyList();
  const report = {
    scanned: legacy.length, migrated: 0, alreadyMigrated: 0,
    skipped: [], clubs: {}, dryRun: Boolean(dryRun),
  };
  const byClub = new Map();
  for (const invite of legacy) {
    const id = teamOf(invite);
    if (!tokenOf(invite)) { report.skipped.push({ token: null, reason: 'missing_token' }); continue; }
    if (!id) { report.skipped.push({ token: tokenOf(invite), reason: 'missing_team' }); continue; }
    if (!byClub.has(id)) byClub.set(id, []);
    byClub.get(id).push(invite);
  }
  for (const [id, records] of byClub) {
    const existing = await readClubList(id);
    const present = new Set(existing.map(tokenOf));
    const fresh = records.filter(i => !present.has(tokenOf(i)));
    report.alreadyMigrated += records.length - fresh.length;
    if (!fresh.length) { report.clubs[id] = { migrated: 0, alreadyMigrated: records.length }; continue; }
    // The club's OWN records stay in front: they are the newer home, and the
    // per-club cap must never discard them in favour of an older copy.
    if (!dryRun) await writeClubList(id, [...existing, ...fresh]);
    report.migrated += fresh.length;
    report.clubs[id] = { migrated: fresh.length, alreadyMigrated: records.length - fresh.length };
  }
  return report;
}
