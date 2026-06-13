/**
 * Coach Products — Weekly Brief (M18)
 *
 * Public API for Coach's Eye Core.
 *
 * Core usage:
 *   import { getWeeklyBrief } from 'coach-products/weekly-brief/index.js'
 *   const brief = await getWeeklyBrief({ user, team, date, generatedAt })
 */

export { getWeeklyBrief, getMonday } from './weekly-brief.js'
export { BRIEF_ID, BRIEF_VERSION, URGENCY, LOAD_STATUS, BRIEF_FIELD, PERSONALISATION_FLAG } from './weekly-brief-types.js'
export { personalise, emptyPersonalisation, reRankPriorities, buildSignalsUsed, buildExplanation, MIN_PROFILE_OBSERVATIONS } from './personaliser.js'
