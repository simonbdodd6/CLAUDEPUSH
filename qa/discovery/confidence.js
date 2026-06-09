/**
 * Confidence scoring for discovered rugby clubs.
 *
 * Confidence (0.0–1.0) measures how reliable a discovery record is —
 * not how good a sales lead it is (that's the fit score in score-leads.js).
 *
 * Thresholds:
 *   READY     ≥ 0.70  — high confidence, push to lead DB immediately
 *   REVIEW    ≥ 0.45  — needs a second look before outreach
 *   LOW       < 0.45  — likely garbage or too sparse to act on
 */

export const CONFIDENCE_READY = 0.70;
export const CONFIDENCE_REVIEW = 0.45;

// Base confidence contributed by each provider type
const SOURCE_BASE = {
  'manual': 0.85,
  'csv': 0.75,
  'rugby-directory': 0.70,
  'unknown': 0.55,
};

function sourceBase(source = '') {
  const prefix = source.split(':')[0].toLowerCase();
  return SOURCE_BASE[prefix] ?? SOURCE_BASE.unknown;
}

/**
 * Calculate confidence for a normalized discovery record.
 *
 * @param {object} record  - normalized DiscoveryRecord
 * @param {number} corroborations - how many providers independently found this club
 * @returns {{ score: number, factors: string[] }}
 */
export function calculateConfidence(record, corroborations = 1) {
  const factors = [];
  let score = sourceBase(record.source);
  factors.push(`base:${record.source.split(':')[0]} (${score.toFixed(2)})`);

  // Field completeness boosts
  if (record.email) {
    score += 0.10;
    factors.push('+0.10 email present');
  }
  if (record.website) {
    score += 0.05;
    factors.push('+0.05 website present');
  }
  if (record.facebook || record.instagram) {
    score += 0.03;
    factors.push('+0.03 social media present');
  }
  if (record.city) {
    score += 0.02;
    factors.push('+0.02 city known');
  }
  if (record.league) {
    score += 0.02;
    factors.push('+0.02 league known');
  }

  // Corroboration: same club found by multiple independent providers
  if (corroborations >= 3) {
    score += 0.10;
    factors.push(`+0.10 found by ${corroborations} providers`);
  } else if (corroborations === 2) {
    score += 0.05;
    factors.push('+0.05 found by 2 providers');
  }

  // Penalties
  if (!record.email && !record.website && !record.facebook && !record.instagram) {
    score -= 0.20;
    factors.push('-0.20 no contact info');
  }
  if (record.country === 'Unknown') {
    score -= 0.15;
    factors.push('-0.15 unknown country');
  }
  const nameWords = (record.clubName || '').split(' ');
  if (nameWords.length <= 1) {
    score -= 0.15;
    factors.push('-0.15 very short name');
  }

  const final = Math.round(Math.min(1.0, Math.max(0.0, score)) * 100) / 100;

  return {
    score: final,
    factors,
    tier: final >= CONFIDENCE_READY ? 'ready' : final >= CONFIDENCE_REVIEW ? 'review' : 'low',
  };
}

export function confidenceLabel(score) {
  if (score >= CONFIDENCE_READY) return '✅ Ready';
  if (score >= CONFIDENCE_REVIEW) return '⚠️ Review';
  return '❌ Low';
}
