// CoachEasier Performance — data-access seam (SC1).
//
// SC1 ships the sample-data provider only. When the engine lands, a
// Redis/API-backed provider replaces `sampleProvider` behind the same
// function surface, so screens never change. Keep this module free of
// DOM, fetch, and localStorage — the real adapter will live in api/.

/** @returns {import('../types/index.js').PerfAthlete[]} */
export function getSampleAthletes() {
  return [
    { id: 'ath-01', completion: 100, name: 'Tom Bradshaw',    position: 'Loosehead Prop',   jersey: 1,  programmeId: 'prog-01', programme: 'Pre-Season Strength', adherence: 92, readiness: 84, trainingStatus: 'full',        lastSession: '2026-08-02' },
    { id: 'ath-02', completion: 85, name: 'Callum Reid',     position: 'Hooker',           jersey: 2,  programmeId: 'prog-01', programme: 'Pre-Season Strength', adherence: 88, readiness: 78, trainingStatus: 'full',        lastSession: '2026-08-02' },
    { id: 'ath-03', completion: 70, name: 'Owen Whitfield',  position: 'Tighthead Prop',   jersey: 3,  programmeId: 'prog-01', programme: 'Pre-Season Strength', adherence: 74, readiness: 66, trainingStatus: 'modified',    lastSession: '2026-07-31' },
    { id: 'ath-04', completion: 100, name: 'Jack Morrison',   position: 'Lock',             jersey: 4,  programmeId: 'prog-01', programme: 'Pre-Season Strength', adherence: 95, readiness: 90, trainingStatus: 'full',        lastSession: '2026-08-03' },
    { id: 'ath-05', completion: 90, name: 'Ethan Kavanagh',  position: 'Lock',             jersey: 5,  programmeId: 'prog-02', programme: 'Return to Play',      adherence: 61, readiness: 52, trainingStatus: 'modified',    lastSession: '2026-08-01' },
    { id: 'ath-06', completion: 95, name: 'Sam Okafor',      position: 'Blindside Flanker',jersey: 6,  programmeId: 'prog-01', programme: 'Pre-Season Strength', adherence: 90, readiness: 88, trainingStatus: 'full',        lastSession: '2026-08-03' },
    { id: 'ath-07', completion: 100, name: 'Luke Devereux',   position: 'Openside Flanker', jersey: 7,  programmeId: 'prog-03', programme: 'Speed & Power Block', adherence: 97, readiness: 93, trainingStatus: 'full',        lastSession: '2026-08-03' },
    { id: 'ath-08', completion: 60, name: 'Danny Hughes',    position: 'Number 8',         jersey: 8,  programmeId: 'prog-01', programme: 'Pre-Season Strength', adherence: 82, readiness: 75, trainingStatus: 'full',        lastSession: '2026-08-02' },
    { id: 'ath-09', completion: 85, name: 'Rhys Llewellyn',  position: 'Scrum-half',       jersey: 9,  programmeId: 'prog-03', programme: 'Speed & Power Block', adherence: 89, readiness: 81, trainingStatus: 'full',        lastSession: '2026-08-02' },
    { id: 'ath-10', completion: 100, name: 'Finn Gallagher',  position: 'Fly-half',         jersey: 10, programmeId: 'prog-03', programme: 'Speed & Power Block', adherence: 93, readiness: 86, trainingStatus: 'full',        lastSession: '2026-08-03' },
    { id: 'ath-11', completion: 75, name: 'Marcus Ashworth', position: 'Winger',           jersey: 11, programmeId: 'prog-03', programme: 'Speed & Power Block', adherence: 70, readiness: 58, trainingStatus: 'unavailable', lastSession: '2026-07-28' },
    { id: 'ath-12', completion: 55, name: 'Josh Tuilagi',    position: 'Inside Centre',    jersey: 12, programmeId: 'prog-01', programme: 'Pre-Season Strength', adherence: 86, readiness: 79, trainingStatus: 'full',        lastSession: '2026-08-02' },
  ];
}

/** @returns {import('../types/index.js').PerfProgramme[]} */
export function getSampleProgrammes() {
  return [
    { id: 'prog-01', name: 'Pre-Season Strength', focus: 'Max Strength',      weeks: 8,  currentWeek: 3, athleteCount: 18, sessionsPerWeek: 3, status: 'active',    startDate: '2026-07-13' },
    { id: 'prog-02', name: 'Return to Play',      focus: 'Rehabilitation',    weeks: 6,  currentWeek: 4, athleteCount: 3,  sessionsPerWeek: 4, status: 'active',    startDate: '2026-07-06' },
    { id: 'prog-03', name: 'Speed & Power Block', focus: 'Power Development', weeks: 6,  currentWeek: 3, athleteCount: 9,  sessionsPerWeek: 2, status: 'active',    startDate: '2026-07-13' },
    { id: 'prog-04', name: 'In-Season Maintenance', focus: 'Strength Maintenance', weeks: 12, currentWeek: 0, athleteCount: 0, sessionsPerWeek: 2, status: 'draft' },
    { id: 'prog-05', name: 'Off-Season Foundation', focus: 'Hypertrophy',     weeks: 10, currentWeek: 10, athleteCount: 22, sessionsPerWeek: 3, status: 'completed', startDate: '2026-04-20' },
  ];
}

/** @returns {import('../types/index.js').PerfWorkout} today's headline session */
export function getSampleTodayWorkout() {
  return {
    id: 'wo-0803',
    title: 'Lower Body Strength — Week 3, Day 1',
    programmeId: 'prog-01',
    scheduled: '2026-08-03T17:30:00',
    blocks: 4,
    estimatedMinutes: 65,
    status: 'scheduled',
    assignedCount: 18,
    completedCount: 5,
  };
}

/** @returns {import('../types/index.js').PerfExercise[]} */
export function getSampleExercises() {
  return [
    { id: 'ex-01', name: 'Back Squat',            category: 'strength',     equipment: 'Barbell',     favourite: true },
    { id: 'ex-02', name: 'Trap Bar Deadlift',     category: 'strength',     equipment: 'Trap Bar',    favourite: true },
    { id: 'ex-03', name: 'Bench Press',           category: 'strength',     equipment: 'Barbell',     favourite: true },
    { id: 'ex-04', name: 'Weighted Chin-up',      category: 'strength',     equipment: 'Bodyweight',  favourite: false },
    { id: 'ex-05', name: 'Power Clean',           category: 'power',        equipment: 'Barbell',     favourite: true },
    { id: 'ex-06', name: 'Box Jump',              category: 'power',        equipment: 'Plyo Box',    favourite: false },
    { id: 'ex-07', name: 'Med Ball Rotational Throw', category: 'power',    equipment: 'Medicine Ball', favourite: false },
    { id: 'ex-08', name: 'Flying 10s',            category: 'speed',        equipment: 'Track',       favourite: false },
    { id: 'ex-09', name: 'Resisted Sled Sprint',  category: 'speed',        equipment: 'Sled',        favourite: true },
    { id: 'ex-10', name: 'Bike Erg Intervals',    category: 'conditioning', equipment: 'Bike Erg',    favourite: false },
    { id: 'ex-11', name: 'Bronco Test',           category: 'conditioning', equipment: 'Pitch',       favourite: false },
    { id: 'ex-12', name: '90/90 Hip Switch',      category: 'mobility',     equipment: 'Bodyweight',  favourite: false },
    { id: 'ex-13', name: 'Copenhagen Plank',      category: 'prehab',       equipment: 'Bench',       favourite: false },
    { id: 'ex-14', name: 'Nordic Hamstring Curl', category: 'prehab',       equipment: 'Partner',     favourite: true },
    { id: 'ex-15', name: 'Pallof Press',          category: 'core',         equipment: 'Cable',       favourite: false },
    { id: 'ex-16', name: 'Dead Bug',              category: 'core',         equipment: 'Bodyweight',  favourite: false },
  ];
}

/** @returns {import('../types/index.js').PerfMetricSummary[]} */
export function getSampleMetricSummaries() {
  return [
    { id: 'strength',     label: 'Strength',     headline: '142 kg',   detail: 'Squad avg back squat 1RM',        trend: 4.2,  spark: [128, 131, 133, 135, 138, 140, 142] },
    { id: 'power',        label: 'Power',        headline: '48.5 cm',  detail: 'Squad avg countermovement jump',  trend: 2.8,  spark: [45.1, 45.8, 46.2, 47.0, 47.6, 48.1, 48.5] },
    { id: 'speed',        label: 'Speed',        headline: '1.72 s',   detail: 'Squad avg 10 m sprint',           trend: -1.7, spark: [1.78, 1.77, 1.76, 1.75, 1.74, 1.73, 1.72] },
    { id: 'conditioning', label: 'Conditioning', headline: '4:52',     detail: 'Squad avg Bronco time',           trend: -2.4, spark: [312, 308, 305, 301, 298, 295, 292] },
    { id: 'adherence',    label: 'Adherence',    headline: '86%',      detail: 'Sessions completed, last 4 weeks', trend: 3.1, spark: [79, 81, 80, 83, 84, 85, 86] },
    { id: 'bodyweight',   label: 'Bodyweight',   headline: '96.4 kg',  detail: 'Squad avg, forwards + backs',     trend: 0.6,  spark: [95.8, 95.9, 96.0, 96.1, 96.2, 96.3, 96.4] },
    { id: 'readiness',    label: 'Readiness',    headline: '78',       detail: 'Squad avg wellness score today',  trend: -3.2, spark: [84, 83, 81, 82, 80, 79, 78] },
  ];
}

/** @returns {import('../types/index.js').PerfActivityEvent[]} */
export function getSampleActivity() {
  return [
    { id: 'act-01', when: '2026-08-03T09:12:00', athlete: 'Luke Devereux',  summary: 'Completed Upper Body Power — Week 3, Day 1', kind: 'workout' },
    { id: 'act-02', when: '2026-08-03T08:47:00', athlete: 'Jack Morrison',  summary: 'New PB — Trap Bar Deadlift 210 kg',           kind: 'pb' },
    { id: 'act-03', when: '2026-08-03T07:30:00', athlete: 'Squad',          summary: '14 of 18 readiness check-ins submitted',      kind: 'readiness' },
    { id: 'act-04', when: '2026-08-02T18:05:00', athlete: 'Finn Gallagher', summary: 'Completed Speed Session — Flying 10s',        kind: 'workout' },
    { id: 'act-05', when: '2026-08-02T17:40:00', athlete: 'Ethan Kavanagh', summary: 'Return to Play — advanced to Phase 3',        kind: 'programme' },
    { id: 'act-06', when: '2026-08-01T19:22:00', athlete: 'Marcus Ashworth',summary: 'Flagged low readiness — hamstring tightness', kind: 'note' },
  ];
}
