// CoachEasier Performance — rugby position demand model (SC5).
//
// Weighted DEFAULT demand profiles per position. Position is a prior, not
// a verdict: athlete goals (and, later, measured deficits) adjust these
// weights, and the adjustment is deliberately strong enough that an
// individual need outranks the positional stereotype (see
// adjustDemandsForAthlete). All weights are PROVISIONAL and require
// qualified S&C review before production.
//
// Pure module: no DOM, no fetch, no clock, no randomness.

import { PROVISIONAL } from '../types/coaching.js';

export const DEMAND_QUALITIES = [
  'max_strength', 'relative_strength', 'hypertrophy', 'power',
  'acceleration', 'max_velocity', 'repeat_sprint', 'aerobic', 'anaerobic',
  'contact_prep', 'neck_capacity', 'trunk_capacity', 'mobility', 'robustness',
];

export const POSITION_DEMANDS_STATUS = PROVISIONAL;

// Weights 0–5. Shared builders keep related positions consistent.
const w = (o) => ({
  max_strength: 3, relative_strength: 3, hypertrophy: 2, power: 3,
  acceleration: 3, max_velocity: 2, repeat_sprint: 3, aerobic: 3, anaerobic: 3,
  contact_prep: 3, neck_capacity: 3, trunk_capacity: 3, mobility: 2, robustness: 3,
  ...o,
});

export const POSITION_DEMANDS = {
  loosehead_prop:    w({ max_strength: 5, hypertrophy: 4, neck_capacity: 5, contact_prep: 5, max_velocity: 1, aerobic: 3, mobility: 3 }),
  tighthead_prop:    w({ max_strength: 5, hypertrophy: 4, neck_capacity: 5, contact_prep: 5, max_velocity: 1, aerobic: 3, mobility: 3 }),
  hooker:            w({ max_strength: 4, hypertrophy: 3, neck_capacity: 5, contact_prep: 5, acceleration: 3, repeat_sprint: 4 }),
  lock:              w({ max_strength: 4, hypertrophy: 4, power: 4, neck_capacity: 4, contact_prep: 4, aerobic: 4, trunk_capacity: 4 }),
  blindside_flanker: w({ max_strength: 4, power: 4, contact_prep: 5, repeat_sprint: 4, aerobic: 4, robustness: 4 }),
  openside_flanker:  w({ relative_strength: 4, power: 4, contact_prep: 5, repeat_sprint: 5, aerobic: 5, acceleration: 4 }),
  number_8:          w({ max_strength: 4, power: 5, contact_prep: 5, acceleration: 4, repeat_sprint: 4, trunk_capacity: 4 }),
  scrum_half:        w({ relative_strength: 4, acceleration: 5, repeat_sprint: 5, aerobic: 5, max_velocity: 3, contact_prep: 2, neck_capacity: 2, hypertrophy: 1 }),
  fly_half:          w({ relative_strength: 3, acceleration: 4, max_velocity: 3, aerobic: 4, power: 3, contact_prep: 2, neck_capacity: 2, hypertrophy: 1 }),
  inside_centre:     w({ max_strength: 4, power: 4, acceleration: 4, contact_prep: 4, max_velocity: 3, repeat_sprint: 4 }),
  outside_centre:    w({ power: 4, acceleration: 5, max_velocity: 4, contact_prep: 3, repeat_sprint: 4 }),
  wing:              w({ acceleration: 5, max_velocity: 5, power: 4, repeat_sprint: 4, contact_prep: 2, neck_capacity: 2, hypertrophy: 2, max_strength: 2, relative_strength: 4 }),
  full_back:         w({ acceleration: 4, max_velocity: 5, power: 4, aerobic: 4, repeat_sprint: 4, contact_prep: 2, neck_capacity: 2 }),
  // Utility athletes take a balanced profile.
  utility_forward:   w({ contact_prep: 4, neck_capacity: 4 }),
  utility_back:      w({ acceleration: 4, max_velocity: 4 }),
};

/** Default demand profile for a position; balanced profile when unknown. */
export function getPositionDemands(positionId) {
  return { ...(POSITION_DEMANDS[positionId] || w({})) };
}

// Goal → demand-quality mapping used to tilt positional priors toward the
// athlete's own goals. A primary goal adds +3 (importance 5) down to +1,
// which is enough to outrank any default gap of ≤2 — the prop who wants
// acceleration genuinely gets acceleration emphasis.
export const GOAL_QUALITY_MAP = {
  max_strength:         ['max_strength'],
  power:                ['power'],
  body_mass_gain:       ['hypertrophy', 'max_strength'],
  body_fat_reduction:   ['aerobic', 'anaerobic'],
  acceleration:         ['acceleration', 'power'],
  max_speed:            ['max_velocity', 'acceleration'],
  conditioning:         ['aerobic', 'repeat_sprint', 'anaerobic'],
  preseason_prep:       ['max_strength', 'power', 'repeat_sprint'],
  inseason_maintenance: ['max_strength', 'power'],
  return_to_training:   ['robustness', 'mobility', 'aerobic'],
  position_development: [], // resolved by the position prior itself
};

/**
 * Blend positional defaults with the athlete's own goals.
 * Deterministic: primary goal (highest importance, ties by list order)
 * gets +3, second +2, third +1; every boosted quality also floors at 4 so
 * an individual need always surfaces above a low positional default.
 * @param {object} demands   base position weights
 * @param {Array<{type:string, importance?:number}>} goals
 * @returns {{demands:object, boosted:string[]}}
 */
export function adjustDemandsForAthlete(demands, goals = []) {
  const out = { ...demands };
  const boosted = [];
  const ordered = [...goals].sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 3);
  ordered.forEach((goal, i) => {
    const bump = 3 - i;
    for (const q of GOAL_QUALITY_MAP[goal.type] || []) {
      out[q] = Math.min(5, Math.max((out[q] || 0) + bump, 4));
      if (!boosted.includes(q)) boosted.push(q);
    }
  });
  return { demands: out, boosted };
}

/** Top-N qualities by weight, deterministic tie-break by quality name. */
export function topQualities(demands, n = 5) {
  return Object.entries(demands)
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([q]) => q);
}
