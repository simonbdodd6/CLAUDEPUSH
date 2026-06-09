// Relevance ranking — scores and sorts Knowledge Engine results.

// Boost weights
const BOOSTS = {
  exactName:      50,
  partialName:    20,
  tag:            15,
  active:         10,
  recentActivity:  8,
  highPriority:   12,
  injuryActive:    8,
  membershipValid: 5,
  mock:           -20,  // penalise mock data
};

export function scoreResult(result, query) {
  let score = result.baseScore ?? 0;
  const lq  = (query ?? '').toLowerCase();
  const name = (result.name ?? result.data?.name ?? result.data?.playerName ?? '').toLowerCase();
  const tags = result.tags ?? [];

  // Name matching
  if (name && lq && name === lq)                            score += BOOSTS.exactName;
  else if (name && lq && name.includes(lq))                 score += BOOSTS.partialName;
  else if (lq && tags.some(t => t.toLowerCase().includes(lq))) score += BOOSTS.tag;

  // Status boosts
  const d = result.data ?? {};
  if (d.active !== false && d.status !== 'inactive')        score += BOOSTS.active;
  if (d.injuries?.some(i => i.status === 'active'))         score += BOOSTS.injuryActive;
  if (d.priority === 'critical' || d.priority === 'high')   score += BOOSTS.highPriority;
  if (result.isMock)                                        score += BOOSTS.mock;

  // Recency boost (data updated in last 7 days)
  const updatedAt = d.updatedAt ?? d.lastActivity ?? d.lastSession ?? null;
  if (updatedAt && (Date.now() - new Date(updatedAt).getTime()) < 7 * 86400000) score += BOOSTS.recentActivity;

  return { ...result, score };
}

export function rankResults(results = [], query = '', options = {}) {
  const { limit = 50, minScore = null } = options;
  const scored = results.map(r => scoreResult(r, query));

  if (minScore !== null) {
    const filtered = scored.filter(r => r.score >= minScore);
    if (filtered.length > 0) {
      return filtered.sort((a, b) => b.score - a.score).slice(0, limit);
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function topResult(results = [], query = '') {
  const ranked = rankResults(results, query, { limit: 1 });
  return ranked[0] ?? null;
}

// Sort helpers for intent-specific ordering
export function sortByAttendanceMissed(players = []) {
  return [...players].sort((a, b) => {
    const da = a.data ?? a, db = b.data ?? b;
    const attA = da.attendance ?? da.core?.attendance ?? {};
    const attB = db.attendance ?? db.core?.attendance ?? {};
    const missedA = (attA.totalSessions ?? 0) - (attA.attended ?? 0);
    const missedB = (attB.totalSessions ?? 0) - (attB.attended ?? 0);
    return missedB - missedA;
  });
}

export function sortByExpiryDate(items = []) {
  return [...items].sort((a, b) => {
    const da = a.data ?? a, db = b.data ?? b;
    const ta = new Date(da.validUntil ?? da.expiresAt ?? da.renewalDue ?? '9999-01-01').getTime();
    const tb = new Date(db.validUntil ?? db.expiresAt ?? db.renewalDue ?? '9999-01-01').getTime();
    return ta - tb;
  });
}

export function sortByLastActive(items = []) {
  return [...items].sort((a, b) => {
    const da = a.data ?? a, db = b.data ?? b;
    const ta = new Date(da.lastActive ?? da.lastHelped ?? da.lastActivity ?? '1970-01-01').getTime();
    const tb = new Date(db.lastActive ?? db.lastHelped ?? db.lastActivity ?? '1970-01-01').getTime();
    return ta - tb;
  });
}
