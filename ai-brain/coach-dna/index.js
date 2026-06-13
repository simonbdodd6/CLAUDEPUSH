/**
 * AI Brain — Coach DNA Engine (M23)
 *
 * Public barrel. Consumed by the AI namespace (ai-brain/index.js), which bridges
 * the Learning store's observations into these pure/stateful builders and exposes:
 *
 *   AI.getCoachDNA(coachId, opts)
 *   AI.getCoachStyle(coachId, opts)
 *   AI.compareCoachEvolution(coachId, opts)
 *   AI.getSeasonLearning(coachId, opts)
 *
 * The engine consumes ONLY observations + learning records. It never edits Core,
 * never writes the CoachProfile, and treats explicit coach settings as final.
 */

export {
  buildCoachDNA, getCoachDNA, getCoachStyle, buildStyle,
  compareCoachEvolution, getSeasonLearning,
  resetCoachDNA, clearReset, exportCoachDNA, _clear,
} from './dna-engine.js'

export {
  signalsFor, buildCharacteristics, extractManualOverrides,
} from './characteristics.js'

export {
  seasonOf, groupBySeason, seasonsIn, seasonCompare, diffCharacteristics, newlyDiscovered, UNKNOWN_SEASON,
} from './season.js'

export {
  DNA_VERSION, DNA_FLAG, DNA_TIERS,
  CHARACTERISTIC, CHARACTERISTIC_KEYS, CHARACTERISTIC_META,
  MANUAL_PREFERENCE_MAP, LABEL_SCORES, EVENT,
  SATURATION_K, RECENCY_SCALE, MAX_EVIDENCE,
  MIN_OBSERVATIONS_FOR_SIGNAL, DISCOVERY_CONFIDENCE, BAND_HIGH, BAND_LOW, TREND_DELTA,
} from './coach-dna-types.js'
