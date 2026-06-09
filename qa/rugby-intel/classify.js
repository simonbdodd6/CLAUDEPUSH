/**
 * Rugby-specific content classification.
 *
 * Assigns categories, relevance flags, age group, and coaching level
 * using keyword heuristics — zero cost, zero external deps.
 *
 * Runs BEFORE summarize.js so Claude gets pre-classified context.
 */

import { CATEGORIES } from './knowledge-db.js';

// ── Category signal words ────────────────────────────────────────────────────

const SIGNALS = {
  'law-update': [
    'law', 'laws of the game', 'world rugby', 'regulation', 'amendment',
    'ruling', 'directive', 'law change', 'law amendment', 'law clarification',
    'experimental law', 'elv', 'bylaw',
  ],
  'safety': [
    'concussion', 'hhia', 'head injury', 'welfare', 'safety', 'tackle height',
    'low tackle', 'red card', 'yellow card', 'high tackle', 'dangerous play',
    'injury', 'safeguarding', 'return to play', 'rtp', 'protocol',
  ],
  'attack': [
    'attack', 'attacking', 'backline', 'running line', 'overlap', 'offload',
    'skip pass', 'pods', 'wide play', 'midfield', 'inside pass', 'support line',
    'go forward', 'gainline', 'carry', 'ball carrier',
  ],
  'defence': [
    'defence', 'defense', 'defensive', 'blitz', 'drift', 'man-on', 'rush defence',
    'umbrella', 'line speed', 'defensive system', 'pillar', 'guard', 'choke tackle',
    'turnover', 'counter ruck',
  ],
  'kicking': [
    'kick', 'kicking', 'box kick', 'exit', 'bomb', 'up and under', 'grubber',
    'chip kick', 'restart', 'territory', 'aerial', 'contestable kick',
    'place kick', 'goal kick',
  ],
  'set-piece': [
    'scrum', 'scrummage', 'lineout', 'line-out', 'maul', 'set piece', 'hooker',
    'prop', 'tight head', 'loose head', 'throw', 'lifting', 'bind',
    'front row', 'jumper', 'lifting pod',
  ],
  'breakdown': [
    'breakdown', 'ruck', 'jackal', 'cleanout', 'contest', 'poach', 'over the ball',
    'body position', 'gate', 'offside breakdown', 'jackaling',
  ],
  'contact-skills': [
    'tackle', 'tackling', 'contact', 'collision', 'carrying', 'ball carry',
    'hitting', 'body position contact', 'grip', 'seatbelt', 'dominant tackle',
  ],
  'youth': [
    'youth', 'junior', 'mini', 'under 12', 'under 14', 'under 16', 'under 18',
    'under 20', 'u12', 'u14', 'u16', 'u18', 'u20', 'age grade', 'development',
    'age-grade', 'minis', 'tag rugby', 'touch rugby', 'schools',
  ],
  'sc': [
    'strength', 'conditioning', 'fitness', 'gym', 'power', 'speed', 'agility',
    'plyometric', 'aerobic', 'anaerobic', 'pre-season', 'physical preparation',
    'periodisation', 'load management', 'gps', 'athlete',
  ],
  'team-culture': [
    'culture', 'leadership', 'team building', 'mental', 'psychology', 'mindset',
    'cohesion', 'values', 'identity', 'trust', 'character', 'resilience',
    'environment', 'communication', 'captain',
  ],
  'match-analysis': [
    'match analysis', 'game analysis', 'video analysis', 'data analysis',
    'statistics', 'opposition', 'performance review', 'kpi', 'metrics',
    'possession', 'territory', 'phases', 'set piece data',
  ],
  'drill': [
    'drill', 'exercise', 'session plan', 'warm up', 'coaching activity',
    'practice', 'rep', 'repetition', 'grid', 'channel', 'small sided',
    'tag game', 'skill circuit', 'station',
  ],
  'philosophy': [
    'philosophy', 'principles', 'methodology', 'approach', 'framework',
    'system of play', 'game plan', 'coaching philosophy', 'game model',
    'values-based', 'high performance', 'development pathway',
  ],
};

// ── Age group signals ────────────────────────────────────────────────────────

const AGE_SIGNALS = {
  mini: ['mini', 'tag', 'under 7', 'under 8', 'under 9', 'under 10', 'u7', 'u8', 'u9', 'u10'],
  youth: ['junior', 'youth', 'under 12', 'under 14', 'under 16', 'under 18', 'u12', 'u14', 'u16', 'u18', 'age grade', 'schools', 'college'],
  senior: ['senior', 'adult', 'first team', 'club', 'provincial', 'professional', 'under 20', 'u20'],
};

const LEVEL_SIGNALS = {
  beginner: ['beginner', 'introduction', 'beginner coach', 'introductory', 'new to coaching', 'grassroots'],
  intermediate: ['intermediate', 'development', 'club level', 'regional'],
  advanced: ['advanced', 'high performance', 'semi-professional', 'elite coaching'],
  elite: ['elite', 'professional', 'international', 'test match', 'world cup', 'top 14', 'premiership', 'super rugby'],
};

// ── Main classifier ──────────────────────────────────────────────────────────

function matchesSignals(text, signals) {
  const lower = text.toLowerCase();
  return signals.some(s => lower.includes(s.toLowerCase()));
}

/**
 * Classify a piece of rugby content.
 * @param {string} text — normalized text content
 * @param {string} provider — which provider this came from (e.g., 'law-update', 'drill')
 * @returns classification object
 */
export function classify(text, provider = '') {
  const lower = text.toLowerCase();

  // Categories — may match multiple
  const categories = CATEGORIES.filter(cat => matchesSignals(lower, SIGNALS[cat] || []));

  // Provider hints (a drill-provider item is probably a drill even without keyword matches)
  if (!categories.length) {
    if (provider.includes('drill')) categories.push('drill');
    else if (provider.includes('law')) categories.push('law-update');
    else if (provider.includes('article')) categories.push('philosophy');
    else categories.push('philosophy');
  }

  // Relevance flags
  const isLawUpdate = matchesSignals(lower, SIGNALS['law-update']);
  const isSafetyAlert = matchesSignals(lower, SIGNALS['safety']) &&
    /concussion|head injury|tackle height|hhia|dangerous|welfare/.test(lower);
  const isTactical = categories.some(c => ['attack', 'defence', 'kicking', 'set-piece', 'breakdown'].includes(c));
  const isPractical = categories.includes('drill') ||
    /\d+\s*(min|minute|rep|repetition|set)|coach\s+instruction|set\s+up/i.test(lower);

  // Age group
  const ageGroup = [];
  for (const [group, signals] of Object.entries(AGE_SIGNALS)) {
    if (matchesSignals(lower, signals)) ageGroup.push(group);
  }
  if (!ageGroup.length) ageGroup.push('all');

  // Coaching level
  const coachingLevel = [];
  for (const [level, signals] of Object.entries(LEVEL_SIGNALS)) {
    if (matchesSignals(lower, signals)) coachingLevel.push(level);
  }
  if (!coachingLevel.length) coachingLevel.push('all');

  return {
    categories,
    ageGroup,
    coachingLevel,
    isLawUpdate,
    isSafetyAlert,
    isTactical,
    isPractical,
  };
}
