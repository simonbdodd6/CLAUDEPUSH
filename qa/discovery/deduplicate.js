/**
 * Deduplication engine for the Discovery Agent.
 *
 * Strategy (in order of preference):
 *   1. Exact match key  — same normalised name + country (O(1) per record)
 *   2. Domain match     — same website domain (different spellings of same club)
 *   3. Fuzzy name match — Jaro-Winkler ≥ FUZZY_THRESHOLD within same country bucket
 *
 * Bucketing: records are grouped by country before fuzzy comparison, giving
 * roughly O(n) time when clubs are spread across many countries rather than O(n²).
 *
 * When duplicates are merged the earliest-seen record is canonical and later
 * records contribute their unique fields (e.g., one has email, other has website).
 */

const FUZZY_THRESHOLD = 0.92;

// ── Jaro-Winkler similarity ───────────────────────────────────────────────────

function jaro(s1, s2) {
  if (s1 === s2) return 1.0;
  const len1 = s1.length, len2 = s2.length;
  if (!len1 || !len2) return 0.0;

  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const m1 = new Array(len1).fill(false);
  const m2 = new Array(len2).fill(false);
  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, len2);
    for (let j = lo; j < hi; j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true;
      matches++;
      break;
    }
  }

  if (!matches) return 0.0;

  let t = 0, k = 0;
  for (let i = 0; i < len1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }

  return (matches / len1 + matches / len2 + (matches - t / 2) / matches) / 3;
}

function jaroWinkler(s1, s2) {
  const j = jaro(s1, s2);
  let prefix = 0;
  const limit = Math.min(4, s1.length, s2.length);
  for (let i = 0; i < limit; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

// ── Merge strategy ────────────────────────────────────────────────────────────

function mergeRecords(canonical, duplicate) {
  // Fill missing fields from duplicate; keep canonical's provenance primary
  const merged = { ...canonical };
  for (const field of ['email', 'website', 'websiteDomain', 'facebook', 'instagram', 'city', 'league', 'level']) {
    if (!merged[field] && duplicate[field]) merged[field] = duplicate[field];
  }
  // Accumulate provenance
  merged.providers = [...new Set([...(canonical.providers || []), ...(duplicate.providers || [])])];
  merged.rawData = [...(canonical.rawData || []), ...(duplicate.rawData || [])];
  return merged;
}

// ── Main deduplication ────────────────────────────────────────────────────────

/**
 * Deduplicate an array of normalized DiscoveryRecords.
 *
 * @param {object[]} records
 * @returns {{ unique: object[], duplicates: object[], stats: object }}
 */
export function deduplicate(records) {
  const unique = [];
  const duplicates = [];

  // Index structures
  const byMatchKey = new Map();   // matchKey → index in unique[]
  const byDomain = new Map();     // websiteDomain → index in unique[]
  const byCountry = new Map();    // country → array of { idx, nameKey }

  for (const rec of records) {
    let existingIdx = null;
    let reason = null;

    // 1. Exact match key
    if (byMatchKey.has(rec._matchKey)) {
      existingIdx = byMatchKey.get(rec._matchKey);
      reason = 'exact-key';
    }

    // 2. Domain match
    if (existingIdx === null && rec.websiteDomain) {
      if (byDomain.has(rec.websiteDomain)) {
        existingIdx = byDomain.get(rec.websiteDomain);
        reason = 'domain-match';
      }
    }

    // 3. Fuzzy name match within country bucket
    if (existingIdx === null && rec._matchKey) {
      const bucket = byCountry.get(rec.country) || [];
      const namePart = rec._matchKey.split('::')[0];
      for (const { idx, nameKey } of bucket) {
        if (jaroWinkler(namePart, nameKey) >= FUZZY_THRESHOLD) {
          existingIdx = idx;
          reason = 'fuzzy-name';
          break;
        }
      }
    }

    if (existingIdx !== null) {
      // Merge into canonical
      unique[existingIdx] = mergeRecords(unique[existingIdx], rec);
      duplicates.push({ ...rec, isDuplicate: true, duplicateOf: unique[existingIdx]._matchKey, duplicateReason: reason });
    } else {
      const idx = unique.length;
      unique.push({ ...rec, isDuplicate: false });

      // Register in indexes
      byMatchKey.set(rec._matchKey, idx);
      if (rec.websiteDomain) byDomain.set(rec.websiteDomain, idx);
      const namePart = rec._matchKey.split('::')[0];
      if (!byCountry.has(rec.country)) byCountry.set(rec.country, []);
      byCountry.get(rec.country).push({ idx, nameKey: namePart });
    }
  }

  return {
    unique,
    duplicates,
    stats: {
      input: records.length,
      unique: unique.length,
      duplicates: duplicates.length,
      duplicateRate: records.length > 0 ? Math.round(duplicates.length / records.length * 100) / 100 : 0,
    },
  };
}
