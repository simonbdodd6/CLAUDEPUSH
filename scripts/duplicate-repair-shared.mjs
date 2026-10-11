/**
 * DUPLICATE-PLAYER REPAIR — SHARED DEFINITIONS (Build 136E tooling).
 *
 * The two things the snapshot taker and the preflight must agree on byte for
 * byte live here, so they cannot drift:
 *
 *   knownIdsOf()          which ids are "the club's people" — the set a
 *                         reference scan looks for;
 *   reducePublishRecord() the projection of a publish record the repair
 *                         reasons about: its sheet positions (formationKeys /
 *                         benchKeys, kept positionally) and the known ids it
 *                         names anywhere else. Coaching and transport notes,
 *                         attendance details, logos and every other field
 *                         never leave the store. A re-read before a write is
 *                         reduced with THIS function and hashed; the hash
 *                         therefore guards exactly what the repair depends on,
 *                         while the write itself is a read-modify-write of the
 *                         live record at one named path.
 *
 * Pure: no I/O, no network, no environment.
 */
export const PUBLISH_REDUCED = 'coacheasier-duplicate-repair-publish-reduced/1';

export const s = v => String(v ?? '').trim();

/** Which of the KNOWN ids a value names, as a JSON string value or key (`"<id>"`) or as a sheet key (`"id:<id>"`). */
export function referencedIds(value, knownIds) {
  const text = JSON.stringify(value === undefined ? null : value) || '';
  return [...new Set([...knownIds].map(s).filter(id => id && (text.includes(`"${id}"`) || text.includes(`"id:${id}"`))))].sort();
}

/** The club's people: users with a membership or a roster row in the club, plus every legacy / row id those carry. */
export function knownIdsOf({ club, team_members = [], player_profiles = [], roster = {} }) {
  const clubId = s(club);
  const ids = new Set();
  for (const m of team_members) if (m && s(m.teamId) === clubId && s(m.userId)) ids.add(s(m.userId));
  for (const row of roster?.players || []) { if (s(row?.userId)) ids.add(s(row.userId)); if (s(row?.id)) ids.add(s(row.id)); if (s(row?.legacyPlayerId)) ids.add(s(row.legacyPlayerId)); }
  for (const p of player_profiles) if (p && s(p.teamId) === clubId && s(p.legacyPlayerId)) ids.add(s(p.legacyPlayerId));
  ids.delete('');
  return ids;
}

/** The repair-relevant projection of a publish record. Deterministic for equal inputs. */
export function reducePublishRecord(value, knownIds) {
  const out = { reduced: PUBLISH_REDUCED };
  const isRecord = value && typeof value === 'object' && !Array.isArray(value);
  if (isRecord && value.formationKeys && typeof value.formationKeys === 'object' && !Array.isArray(value.formationKeys)) {
    out.formationKeys = Object.fromEntries(Object.entries(value.formationKeys).filter(([, v]) => typeof v === 'string').sort(([a], [b]) => a.localeCompare(b)));
  }
  if (isRecord && Array.isArray(value.benchKeys)) out.benchKeys = value.benchKeys.map(v => (typeof v === 'string' ? v : s(v)));
  const rest = isRecord ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'formationKeys' && k !== 'benchKeys')) : value;
  out.referencedIds = referencedIds(rest, knownIds);
  return out;
}

export const isReducedPublishRecord = v => Boolean(v) && typeof v === 'object' && v.reduced === PUBLISH_REDUCED && Array.isArray(v.referencedIds);
