/**
 * BUILD U — availability data integrity audit: PURE CLASSIFICATION ONLY.
 *
 * Input: already-read availability stores plus the club's identity data.
 * Output: per person-per-session-per-scope diagnoses. No I/O of any kind
 * lives in this module — reading is the runner's job, and NOTHING writes.
 *
 * The resolver is NOT reimplemented: what "the current answer" is comes from
 * the REAL Build R resolveAvailabilityForIdentity, so the audit can never
 * drift from production behaviour.
 */
import { resolveAvailabilityForIdentity } from '../api/_availabilityStore.js';

const norm = v => String(v ?? '').trim();
const low = v => norm(v).toLowerCase();

/** Every identity string a record carries (its storage key included). */
export function recordAliases(key, rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  return [...new Set([key, r.userId, r.playerId, r.legacyPlayerId]
    .map(low).filter(Boolean))];
}

/** Cluster the records of ONE session store into logical persons:
 *  two records are the same person when they share ANY identity alias. */
export function clusterRecords(store) {
  const entries = Object.entries(store || {})
    .map(([key, rec]) => ({ key, rec, aliases: recordAliases(key, rec) }));
  const clusters = [];
  for (const e of entries) {
    const hits = clusters.filter(c => e.aliases.some(a => c.aliasSet.has(a)));
    if (!hits.length) {
      clusters.push({ aliasSet: new Set(e.aliases), entries: [e] });
    } else {
      // merge every cluster this entry bridges
      const [first, ...rest] = hits;
      first.entries.push(e);
      e.aliases.forEach(a => first.aliasSet.add(a));
      for (const r of rest) {
        r.entries.forEach(x => first.entries.push(x));
        r.aliasSet.forEach(a => first.aliasSet.add(a));
        clusters.splice(clusters.indexOf(r), 1);
      }
    }
  }
  return clusters;
}

/** The roster profile (if any) a cluster belongs to, by alias intersection. */
export function matchProfile(cluster, profiles = []) {
  return profiles.find(p =>
    [low(p.userId), low(p.legacyPlayerId)].filter(Boolean)
      .some(a => cluster.aliasSet.has(a))) || null;
}

const VALID_RESPONSES = new Set(['available', 'unavailable', 'maybe']);
const VALID_SESSION = /^[a-z0-9_-]{1,80}$/i;

/**
 * Classify one scope's stores. scope = { clubId, kind: 'group'|'club'|'flat',
 * groupId (kind==='group'), sessionId, store }.
 * identity = { profiles, members } — members carry playerGroupId.
 * Returns diagnosis objects; never touches its inputs.
 */
export function auditScope(scope, identity = {}) {
  const { store, sessionId } = scope;
  const out = [];
  const profiles = identity.profiles || [];
  const members = identity.members || [];
  const sessionOk = VALID_SESSION.test(String(sessionId || ''));

  for (const cluster of clusterRecords(store)) {
    const recs = cluster.entries.map(({ key, rec }) => {
      const r = rec && typeof rec === 'object' ? rec : { response: typeof rec === 'string' ? rec : undefined };
      return {
        key,
        response: norm(r.response),
        reason: norm(r.reason),
        respondedAt: norm(r.respondedAt),
        stamped: Boolean(norm(r.respondedAt)),
        malformedValue: !(rec && typeof rec === 'object') || !VALID_RESPONSES.has(norm(r.response)),
      };
    });
    const profile = matchProfile(cluster, profiles);
    const member = profile
      ? members.find(m => low(m.userId) === low(profile.userId)) || null : null;

    const classes = [];
    const why = [];

    if (!sessionOk) { classes.push('MALFORMED_SESSION'); why.push(`session id "${sessionId}" fails the server's own validity rule`); }
    if (recs.some(r => r.malformedValue)) { classes.push('MALFORMED_RECORD'); why.push('a stored value is not a valid availability record'); }
    if (!profile) { classes.push('ORPHAN_IDENTITY'); why.push('no current roster profile matches any alias (removed account or pre-identity record)'); }

    const answers = [...new Set(recs.filter(r => !r.malformedValue).map(r => r.response))];
    if (recs.length > 1) {
      classes.push('DUPLICATE_ALIASES');
      why.push(`${recs.length} records for one person (keys: ${recs.map(r => r.key).join(', ')})`);
      if (answers.length > 1) {
        classes.push('CONTRADICTORY');
        why.push(`stored answers disagree: ${answers.join(' vs ')} — the pre-Build-R resolver could have shown either`);
      } else if (answers.length === 1) {
        classes.push('DUPLICATE_SAME_ANSWER');
        why.push('duplicates agree — resolution-safe, but the store is still dirty');
      }
      const stampedRecs = recs.filter(r => r.stamped);
      if (stampedRecs.length && stampedRecs.length < recs.length) {
        classes.push('UNSTAMPED_SHADOW');
        why.push('an unstamped record coexists with a stamped one (stamped wins under Build R)');
      }
      if (stampedRecs.length > 1 && answers.length > 1) {
        classes.push('STALE_SHADOW');
        why.push('an older stamped answer sits beneath a newer one');
      }
    }

    // GROUP placement: only checkable for group-scoped stores with a known member.
    if (scope.kind === 'group' && member) {
      const plays = norm(member.playerGroupId);
      if (plays && plays !== norm(scope.groupId)) {
        classes.push('GROUP_MISMATCH');
        why.push(`record lives in group ${scope.groupId} but the member now plays in ${plays} (may be historical — member moved groups)`);
      }
    }

    // What Build R actually resolves for this cluster, via the REAL resolver.
    const idForResolver = {
      userId: profile?.userId || recs.map(r => cluster.entries.find(e => e.key === r.key)?.rec?.userId).find(Boolean) || '',
      playerId: recs.map(r => cluster.entries.find(e => e.key === r.key)?.rec?.playerId).find(Boolean) || '',
      legacyPlayerId: profile?.legacyPlayerId || recs.map(r => cluster.entries.find(e => e.key === r.key)?.rec?.legacyPlayerId).find(Boolean) || '',
    };
    const resolved = resolveAvailabilityForIdentity({ [sessionId]: store }, idForResolver)[sessionId] || null;

    // Severity: what could actually bite.
    const severity =
      classes.includes('CONTRADICTORY') || classes.includes('GROUP_MISMATCH') || classes.includes('MALFORMED_RECORD') ? 'suspicious'
      : classes.includes('DUPLICATE_ALIASES') || classes.includes('ORPHAN_IDENTITY') ? 'benign-legacy'
      : 'clean';

    out.push({
      clubId: scope.clubId, kind: scope.kind, groupId: scope.groupId || null, sessionId,
      personKey: profile?.userId || [...cluster.aliasSet][0],
      aliases: [...cluster.aliasSet],
      records: recs,
      answers,
      classes,
      severity,
      resolverAnswer: resolved ? { response: resolved.response, respondedAt: resolved.respondedAt || null } : null,
      resolverAgreesWithNewest: (() => {
        const stamped = recs.filter(r => r.stamped && !r.malformedValue)
          .sort((a, b) => (a.respondedAt < b.respondedAt ? 1 : -1));
        if (!resolved) return null;
        if (!stamped.length) return null;
        return resolved.response === stamped[0].response;
      })(),
      why,
    });
  }
  return out;
}

/** Whole-audit driver over many scopes; also proves itself read-only by
 *  fingerprinting the inputs before and after. */
export function auditAvailability(scopes = [], identity = {}) {
  const before = JSON.stringify(scopes.map(s => s.store));
  const combos = scopes.flatMap(s => auditScope(s, identity));
  const after = JSON.stringify(scopes.map(s => s.store));
  if (before !== after) throw new Error('AUDIT MUTATED ITS INPUT — refusing to report');
  const count = sev => combos.filter(c => c.severity === sev).length;
  return {
    combos,
    summary: {
      combos: combos.length,
      records: scopes.reduce((n, s) => n + Object.keys(s.store || {}).length, 0),
      scopes: scopes.length,
      clean: count('clean'),
      benignLegacy: count('benign-legacy'),
      suspicious: count('suspicious'),
      contradictory: combos.filter(c => c.classes.includes('CONTRADICTORY')).length,
      duplicateAliases: combos.filter(c => c.classes.includes('DUPLICATE_ALIASES')).length,
      groupMismatches: combos.filter(c => c.classes.includes('GROUP_MISMATCH')).length,
      unstamped: combos.filter(c => c.classes.includes('UNSTAMPED_SHADOW')).length,
      staleShadows: combos.filter(c => c.classes.includes('STALE_SHADOW')).length,
      orphans: combos.filter(c => c.classes.includes('ORPHAN_IDENTITY')).length,
      malformed: combos.filter(c => c.classes.includes('MALFORMED_RECORD') || c.classes.includes('MALFORMED_SESSION')).length,
    },
  };
}
