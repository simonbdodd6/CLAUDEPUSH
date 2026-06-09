/**
 * Autonomous Coaching Assistant — public API
 *
 * The assistant continuously observes all platform data sources and
 * proactively surfaces what needs attention, what can be automated,
 * and what the coach must personally decide.
 */

export { runCheck, runMorningBriefing, runAutomations, dismiss, snooze, resolve, getStatus, getActiveRecommendations } from './assistant-core.js';
export { observe, MOCK_OBSERVATIONS } from './observation-engine.js';
export { detect, rank, detectAndRank, summarise }                from './recommendation-engine.js';
export { generateTimeline, getHighPriorityEvents, getAutomatableEvents } from './ai-timeline.js';
export { classifyRecommendations, getAutomationReport, getDecisionQueue, generateCoachBriefing } from './decision-support.js';
export { loadActiveRecommendations, dismissRecommendation, snoozeRecommendation, resolveRecommendation } from './assistant-state.js';
