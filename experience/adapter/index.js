// Experience Adapter (M33) — public surface.
// The app bootstrap is the only composer: it injects the façade (or null), the
// runtime port (or null) and the placeholder fallback model, and receives a
// VisualModel / VisualBrainState to hand the render layer as props.
export { createExperienceAdapter } from './experience-adapter.js'
export { CAP_MATCH_READINESS, CAP_COACH_DNA, CAP_SEASON_INTELLIGENCE } from './facade-contract.js'
export { mapMatchReadiness } from './mappers/match-readiness.js'
export { mapCoachDna } from './mappers/coach-dna.js'
export { mapSeason } from './mappers/season.js'
