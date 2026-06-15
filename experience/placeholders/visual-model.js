// ─── DEV-ONLY PLACEHOLDER ────────────────────────────────────────────────────
// Synthetic VisualModel — every slice state:'placeholder'. No live data, no
// engine/Core/@brain imports, no business logic. Importable ONLY by
// experience/app/. Replaced by the Experience Adapter in M33.
//
// NOTE: the `brain` slice here is a static seed only. The live, animated
// VisualBrainState is supplied separately by the page's animation loop
// (see experience/placeholders/brain-state.js) so this module owns no clock.
//
// @typedef {import('../contracts/visual-model.js').VisualModel} VisualModel
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_NODES = [
  { id: 'core',        label: "Coach's Eye",       cluster: 'core',     activated: true  },
  { id: 'dna',         label: 'Coach DNA',          cluster: 'identity', activated: true  },
  { id: 'readiness',   label: 'Match Readiness',    cluster: 'match',    activated: true  },
  { id: 'opponents',   label: 'Opponent Intel',     cluster: 'match',    activated: false },
  { id: 'season',      label: 'Season Arc',         cluster: 'season',   activated: false },
  { id: 'training',    label: 'Training Designer',  cluster: 'plan',     activated: false },
  { id: 'selection',   label: 'Selection',          cluster: 'plan',     activated: true  },
  { id: 'live',        label: 'Live Match',         cluster: 'match',    activated: false },
  { id: 'memory',      label: 'Memory Engine',      cluster: 'identity', activated: true  },
  { id: 'learning',    label: 'Learning Loop',      cluster: 'identity', activated: false },
  { id: 'players',     label: 'Player Cards',       cluster: 'plan',     activated: false },
  { id: 'club',        label: 'Club Snapshot',      cluster: 'season',   activated: false },
]

const MEMORY_EDGES = [
  { from: 'core', to: 'dna',       weight: 0.9 },
  { from: 'core', to: 'readiness', weight: 0.8 },
  { from: 'core', to: 'memory',    weight: 0.85 },
  { from: 'dna', to: 'learning',   weight: 0.6 },
  { from: 'dna', to: 'selection',  weight: 0.55 },
  { from: 'readiness', to: 'opponents', weight: 0.7 },
  { from: 'readiness', to: 'live',  weight: 0.5 },
  { from: 'readiness', to: 'selection', weight: 0.65 },
  { from: 'season', to: 'club',     weight: 0.5 },
  { from: 'season', to: 'core',     weight: 0.6 },
  { from: 'training', to: 'selection', weight: 0.45 },
  { from: 'memory', to: 'learning', weight: 0.7 },
  { from: 'players', to: 'selection', weight: 0.4 },
]

const TRAITS = [
  { key: 'attacking',   label: 'Attacking Intent',   score: 78, confidence: 0.6, descriptor: 'Plays on the front foot' },
  { key: 'structure',   label: 'Structure',          score: 64, confidence: 0.55, descriptor: 'Balanced shape vs chaos' },
  { key: 'development',  label: 'Player Development', score: 82, confidence: 0.66, descriptor: 'Invests in the long game' },
  { key: 'risk',        label: 'Risk Appetite',      score: 58, confidence: 0.5, descriptor: 'Calculated gambles' },
  { key: 'tempo',       label: 'Tempo',              score: 71, confidence: 0.58, descriptor: 'Prefers a high pace' },
  { key: 'discipline',  label: 'Discipline',         score: 69, confidence: 0.57, descriptor: 'Holds the line' },
  { key: 'adaptability',label: 'Adaptability',       score: 75, confidence: 0.6, descriptor: 'Adjusts mid-match' },
  { key: 'setpiece',    label: 'Set-Piece Focus',    score: 62, confidence: 0.52, descriptor: 'Platform first' },
  { key: 'defence',     label: 'Defensive Identity', score: 67, confidence: 0.55, descriptor: 'Line speed & trust' },
  { key: 'culture',     label: 'Culture',            score: 84, confidence: 0.68, descriptor: 'People before plays' },
]

/**
 * Build the synthetic VisualModel rendered across the command centre.
 * @returns {VisualModel}
 */
export function placeholderVisualModel() {
  return {
    system: {
      state: 'placeholder',
      capabilitiesOnline: 12,
      confidence: 0.61,
      tier: 'professional',
      latencyMs: 0,
    },
    // Static seed; the page supplies the live animated brain state each frame.
    brain: {
      state: 'placeholder',
      firingRate: 0.5,
      globalHue: 206,
      maturity: 0.58,
      regions: [],
      pulses: [],
    },
    matchReadiness: {
      state: 'placeholder',
      confidence: 0.64,
      verdict: 'On track — minor risks to manage',
      gauges: { overall: 73, availability: 81, fitness: 68, cohesion: 70 },
      risks: [
        { label: '2 props unavailable for Saturday', severity: 'high' },
        { label: 'Attendance trending below target', severity: 'medium' },
        { label: 'Heavy rain forecast for final session', severity: 'low' },
      ],
      evidence: [
        { label: 'Squad readiness 73% (10 of 13 available)' },
        { label: 'Set-piece completion 78% last fixture' },
        { label: '1 medical clearance pending' },
      ],
    },
    opponent: {
      state: 'placeholder',
      name: 'Naas RFC',
      summary: 'Strong set-piece and kicking game; vulnerable under the high ball and in transition.',
      maturity: 0.5,
      strengths: [
        { key: 'setPiece', label: 'Set-piece', score: 78, confidence: 0.6 },
        { key: 'kicking', label: 'Kicking game', score: 72, confidence: 0.55 },
        { key: 'discipline', label: 'Discipline', score: 64, confidence: 0.5 },
      ],
      weaknesses: [
        { key: 'highBall', label: 'High ball', score: 38, confidence: 0.55 },
        { key: 'transition', label: 'Transition defence', score: 44, confidence: 0.5 },
        { key: 'bench', label: 'Bench impact', score: 48, confidence: 0.45 },
      ],
      threats: [
        { label: 'Contestable kicks to the back three', severity: 'high' },
        { label: 'Driving maul from the lineout', severity: 'medium' },
      ],
      opportunities: [
        { label: 'Attack the high ball' },
        { label: 'Play width in early phases' },
      ],
    },
    coachDna: {
      state: 'placeholder',
      maturity: 0.62,
      summary: 'An attack-minded, development-first coach who adapts in-match and leads on culture.',
      traits: TRAITS,
    },
    season: {
      state: 'placeholder',
      trajectory: [
        { round: 1, value: 0 }, { round: 2, value: 4 }, { round: 3, value: 5 },
        { round: 4, value: 9 }, { round: 5, value: 9 }, { round: 6, value: 13 },
        { round: 7, value: 17 }, { round: 8, value: 18 }, { round: 9, value: 22 },
        { round: 10, value: 26 },
      ],
      projection: { points: 48, position: 3 },
      probabilities: { title: 22, playoff: 71, relegation: 4 },
    },
    memory: {
      state: 'placeholder',
      nodes: MEMORY_NODES,
      edges: MEMORY_EDGES,
      recentlyActivated: ['dna', 'readiness', 'selection', 'memory'],
    },
  }
}
