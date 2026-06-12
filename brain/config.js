// brain/config.js
//
// Feature flag + subscription tier gate — the ONLY place the Brain checks
// whether a feature is enabled for a club. Implements Architecture Principle P7
// (feature flags, not code branches) and P8 (cost awareness).
//
// Boundary rules:
//   • This module imports nothing from Core, Intelligence engines, or the Brain
//     product modules. It is a pure value / lookup module.
//   • Core will eventually write IntelligenceConfig objects into the Brain's
//     config store. For now, callers pass the config object directly.
//   • The Brain ALWAYS returns a valid response — this module provides the
//     graceful degradation envelope when AI is disabled.

export const BRAIN_VERSION = '1.0.0';

// ── Subscription tiers ─────────────────────────────────────────────────────────
// Mirrors the tier definitions in AI_BRAIN_ARCHITECTURE.md §4 "Feature flag schema".

export const TIER = {
  STARTER:      'starter',      // Free / basic — no AI features
  PROFESSIONAL: 'professional', // Paid — core AI features
  ELITE:        'elite',        // Paid premium — all AI features
};

// Features available per tier.
const TIER_FEATURES = {
  [TIER.STARTER]: {
    weeklyBrief:          false,
    matchIntelligence:    false,
    playerPredictions:    false,
    coachDNA:             false,
    autonomousAssistant:  false,
    benchmarking:         false,
  },
  [TIER.PROFESSIONAL]: {
    weeklyBrief:          true,
    matchIntelligence:    false,
    playerPredictions:    false,
    coachDNA:             false,
    autonomousAssistant:  false,
    benchmarking:         false,
  },
  [TIER.ELITE]: {
    weeklyBrief:          true,
    matchIntelligence:    true,
    playerPredictions:    true,
    coachDNA:             true,
    autonomousAssistant:  true,
    benchmarking:         true,
  },
};

// ── Config shape ───────────────────────────────────────────────────────────────

/**
 * Build a default IntelligenceConfig for a club.
 * Core passes this when calling Brain APIs.
 *
 * @param {string} clubId
 * @param {string} [tier] — one of TIER values
 * @returns {IntelligenceConfig}
 */
export function defaultConfig(clubId = '', tier = TIER.PROFESSIONAL) {
  const resolvedTier = Object.values(TIER).includes(tier) ? tier : TIER.PROFESSIONAL;
  return {
    clubId,
    intelligence: {
      enabled: resolvedTier !== TIER.STARTER,
      tier: resolvedTier,
      features: { ...TIER_FEATURES[resolvedTier] },
      budgetLimits: {
        dailyTokens:   resolvedTier === TIER.ELITE ? 100_000 : 50_000,
        monthlyTokens: resolvedTier === TIER.ELITE ? 2_000_000 : 1_000_000,
      },
    },
  };
}

/**
 * Demo config — used when no config is supplied by the caller.
 * All professional features on so the brief renders in development / demo mode.
 */
export function demoConfig() {
  return defaultConfig('demo', TIER.PROFESSIONAL);
}

// ── Feature gate ───────────────────────────────────────────────────────────────

/**
 * Returns true if the given feature is enabled for this club's config.
 * Safe: returns false on any invalid input.
 *
 * @param {object} config — IntelligenceConfig (from defaultConfig or passed by Core)
 * @param {string} feature — key in intelligence.features
 */
export function isFeatureEnabled(config, feature) {
  if (!config?.intelligence?.enabled) return false;
  return Boolean(config?.intelligence?.features?.[feature]);
}

/**
 * Returns true if the entire AI Brain is enabled for this club.
 */
export function isIntelligenceEnabled(config) {
  return Boolean(config?.intelligence?.enabled);
}

/**
 * Return the subscription tier string, or TIER.STARTER as a safe default.
 */
export function getTier(config) {
  const t = config?.intelligence?.tier;
  return Object.values(TIER).includes(t) ? t : TIER.STARTER;
}

// ── Graceful degradation ───────────────────────────────────────────────────────

/**
 * Standard degraded response envelope — returned by any Brain feature when the
 * feature flag is off, the subscription tier is too low, or the Brain throws.
 * Core can render a meaningful fallback from this without special-casing.
 *
 * @param {string} feature — the feature name that was gated
 * @param {string} reason  — 'disabled' | 'tier' | 'error'
 * @param {string} tier    — the club's actual tier
 */
export function degradedEnvelope(feature, reason = 'disabled', tier = TIER.STARTER) {
  return {
    available:   false,
    feature,
    reason,
    tier,
    requiredTier: TIER.PROFESSIONAL,
    generatedAt:  new Date().toISOString(),
    data:         null,
  };
}
