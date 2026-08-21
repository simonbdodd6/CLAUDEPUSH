// CoachEasier Performance — development context resolution (SC5).
//
// Turns structured athlete + team information into a canonical development
// context with deterministic, conservative conflict handling. Age group is
// an INPUT to programming, never the programme: the engine always combines
// this context with training age, technical confidence, goals, schedule,
// equipment and restrictions.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

import { ageBandFromDOB, isYouthBand } from './athlete-profile.js';
import { normalizeTeamDevelopmentCategory, reason } from '../types/coaching.js';

const YOUTH_U16_BANDS = new Set(['under_16']);
const YOUTH_U18_BANDS = new Set(['16_17']);
const ADULT_BANDS = new Set(['18_20', '21_29', '30_34', '35_plus']);

/**
 * Resolve the canonical development context.
 *
 * Precedence (most reliable, most conservative first):
 *   1. Athlete age band (stated, or derived from DOB when band missing).
 *      A youth-age athlete keeps youth safeguards REGARDLESS of team.
 *   2. Structured team development category — supporting context only,
 *      used when athlete age is unknown, and NEVER inferred from a team
 *      NAME string. Accepts the canonical Core-integration contract
 *      (TEAM_DEVELOPMENT_CATEGORIES: youth_u16 | youth_u18 | adult |
 *      mixed_open | unknown) plus the legacy shorthands
 *      ('u16'|'u18'|'senior'); everything else normalises to 'unknown'.
 *      An 'adult' or 'mixed_open' team category alone can never unlock
 *      adult programming — only real athlete-age evidence can.
 *   3. Nothing reliable → context 'unknown' with conservative safeguards
 *      and a review flag. An athlete is NEVER silently treated as adult.
 *
 * The Core identity system does not yet carry teamDevelopmentCategory —
 * see types/coaching.js for the integration contract. Until it does,
 * callers pass null and this resolver stays conservative.
 *
 * @param {{ageBand?:string|null, dateOfBirth?:string|null, teamCategory?:string|null, now?:Date}} input
 * @returns {{context:string, youth:boolean, safeguardsActive:boolean, source:string,
 *            conflicts:string[], flags:string[], reasons:Array<{code:string,text:string}>}}
 */
export function resolveDevelopmentContext({ ageBand = null, dateOfBirth = null, teamCategory = null, now = new Date(0) } = {}) {
  const flags = [];
  const conflicts = [];
  const reasons = [];

  const band = ageBand && ageBand !== 'unknown' ? ageBand : (dateOfBirth ? ageBandFromDOB(dateOfBirth, now) : null);
  const teamDev = normalizeTeamDevelopmentCategory(teamCategory);

  let context = null;
  let source = null;

  if (band && YOUTH_U16_BANDS.has(band)) { context = 'youth_u16'; source = 'age_band'; }
  else if (band && YOUTH_U18_BANDS.has(band)) { context = 'youth_u18'; source = 'age_band'; }
  else if (band && ADULT_BANDS.has(band)) { context = 'adult'; source = 'age_band'; }

  if (context) {
    reasons.push(reason('ctx_from_ageband', { context }));
    // Conflicts with team category are informational — age wins, always.
    if (context !== 'adult' && teamDev === 'adult') {
      conflicts.push('youth_age_in_senior_team');
      flags.push('development_context_conflict');
      reasons.push(reason('ctx_conflict_youth_in_senior', {}));
    }
    if (context === 'adult' && (teamDev === 'youth_u16' || teamDev === 'youth_u18')) {
      conflicts.push('adult_in_youth_team');
      flags.push('development_context_conflict');
      reasons.push(reason('ctx_conflict_adult_in_youth', {}));
    }
  } else if (teamDev === 'youth_u16' || teamDev === 'youth_u18') {
    context = teamDev;
    source = 'team_category';
    flags.push('missing_development_context');
    reasons.push(reason('ctx_from_team', {}));
  } else {
    // 'adult', 'mixed_open' or 'unknown' team category without athlete-age
    // evidence: conservative. A team label alone never unlocks adult rules.
    context = 'unknown';
    source = 'none';
    flags.push('missing_development_context');
    reasons.push(reason('ctx_unknown', {}));
  }

  const youth = context !== 'adult';
  if (youth && context !== 'unknown') flags.push('youth_safeguards_active');

  return { context, youth, safeguardsActive: youth, source, conflicts, flags, reasons };
}

/** Bands the SC2 profile can carry, exposed for tests. */
export function isYouthContext(context) {
  return context === 'youth_u16' || context === 'youth_u18' || context === 'unknown';
}

export { isYouthBand };
