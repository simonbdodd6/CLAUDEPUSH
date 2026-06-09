/**
 * Season Phases
 *
 * Irish Rugby Union calendar (IRFU / AIL):
 *   Pre-season         July–August         wks 1–8
 *   Early season       September–October   wks 9–16
 *   Mid-season         November–December   wks 17–22
 *   Rep windows        January             wks 23–26
 *   Playoff prep       February–March      wks 27–32
 *   Finals             April–May           wks 33–38
 *   Off-season         June                wks 39–52
 *
 * Season year = year the season starts (e.g. 2025 for the 2025/26 season).
 */

export const PHASE = {
  PRE_SEASON:   'PRE_SEASON',
  EARLY_SEASON: 'EARLY_SEASON',
  MID_SEASON:   'MID_SEASON',
  REP_WINDOWS:  'REP_WINDOWS',
  PLAYOFF_PREP: 'PLAYOFF_PREP',
  FINALS:       'FINALS',
  OFF_SEASON:   'OFF_SEASON',
};

const PHASE_META = {
  [PHASE.PRE_SEASON]: {
    label:       'Pre-Season',
    description: 'Building fitness base, squad assessment, and set-piece fundamentals.',
    icon:        '🏗️',
    startMonth:  7,   // July
    endMonth:    8,   // August
    priority:    'Fitness · Cohesion · Assessment',
  },
  [PHASE.EARLY_SEASON]: {
    label:       'Early Season',
    description: 'Competitive rhythm, system embedding, and first league table positions.',
    icon:        '⚡',
    startMonth:  9,   // September
    endMonth:    10,  // October
    priority:    'Results · Systems · Rhythm',
  },
  [PHASE.MID_SEASON]: {
    label:       'Mid-Season',
    description: 'Performance peak, tactical depth, key league results.',
    icon:        '🔥',
    startMonth:  11,  // November
    endMonth:    12,  // December
    priority:    'Performance · Depth · Load management',
  },
  [PHASE.REP_WINDOWS]: {
    label:       'Representative Windows',
    description: 'Squad depth tested. Representative players unavailable. Manage expectations.',
    icon:        '🏉',
    startMonth:  1,   // January
    endMonth:    1,
    priority:    'Depth · Management · Development players',
  },
  [PHASE.PLAYOFF_PREP]: {
    label:       'Playoff Preparation',
    description: 'Sharpen execution, reduce injury risk, peak for knockout rounds.',
    icon:        '🎯',
    startMonth:  2,   // February
    endMonth:    3,   // March
    priority:    'Precision · Fitness peak · Injury prevention',
  },
  [PHASE.FINALS]: {
    label:       'Finals',
    description: 'Season climax. Full intensity. Careful load management.',
    icon:        '🏆',
    startMonth:  4,   // April
    endMonth:    5,   // May
    priority:    'Peak performance · Recovery · Execution',
  },
  [PHASE.OFF_SEASON]: {
    label:       'Off-Season',
    description: 'Rest, recovery, and early planning for next season.',
    icon:        '🌱',
    startMonth:  6,   // June
    endMonth:    6,
    priority:    'Recovery · Reflection · Recruitment',
  },
};

export function getPhaseByMonth(month) {
  for (const [key, meta] of Object.entries(PHASE_META)) {
    if (month >= meta.startMonth && month <= meta.endMonth) return key;
  }
  return PHASE.OFF_SEASON;
}

export function detectCurrentPhase(date = new Date()) {
  const month = date.getMonth() + 1; // 1-12
  return getPhaseByMonth(month);
}

export function getPhaseMeta(phase) {
  return PHASE_META[phase] ?? PHASE_META[PHASE.OFF_SEASON];
}

export function getSeasonYear(date = new Date()) {
  const month = date.getMonth() + 1;
  return month >= 7 ? date.getFullYear() : date.getFullYear() - 1;
}

export function getSeasonLabel(date = new Date()) {
  const yr = getSeasonYear(date);
  return `${yr}/${String(yr + 1).slice(2)}`;
}

export function getSeasonWeek(date = new Date()) {
  const yr    = getSeasonYear(date);
  const start = new Date(yr, 6, 1); // 1 July of season start year
  const ms    = date - start;
  return Math.max(1, Math.ceil(ms / (7 * 86400000)));
}

export function getPhaseProgress(date = new Date()) {
  const phase = detectCurrentPhase(date);
  const meta  = PHASE_META[phase];
  const month = date.getMonth() + 1;
  const day   = date.getDate();
  const phaseMonths = meta.endMonth - meta.startMonth + 1;
  const elapsed     = (month - meta.startMonth) + (day / 31);
  return Math.round(Math.min(100, (elapsed / phaseMonths) * 100));
}

export function getUpcomingPhases(date = new Date(), count = 3) {
  const phases = Object.keys(PHASE_META);
  const current = detectCurrentPhase(date);
  const idx     = phases.indexOf(current);
  const upcoming = [];
  for (let i = 1; i <= count; i++) {
    upcoming.push(phases[(idx + i) % phases.length]);
  }
  return upcoming.map(p => ({ phase: p, ...PHASE_META[p] }));
}

export function getAllPhases() {
  return Object.entries(PHASE_META).map(([phase, meta]) => ({ phase, ...meta }));
}

export function daysUntilNextPhase(date = new Date()) {
  const phase = detectCurrentPhase(date);
  const meta  = PHASE_META[phase];
  const endDate = new Date(date.getFullYear(), meta.endMonth, 0); // last day of end month
  return Math.max(0, Math.ceil((endDate - date) / 86400000));
}
