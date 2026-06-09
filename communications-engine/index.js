// Coach's Eye Communications Engine — public API
// One import to access every communications capability.

export { AUDIENCE_TYPES, selectAudience, deduplicateAudience, filterByChannel, audienceSummary } from './audience-selector.js';

export { COMMUNICATION_TYPES, TEMPLATES, generateContent, generatePersonalised, personaliseVars, adaptForChannel, render } from './content-generator.js';

export { buildWeeklyNewsletter, buildCoachMessage, buildPlayerOfWeek, formatNewsletterMarkdown } from './newsletter-builder.js';

export { buildMatchReport, buildWeekendResults, buildMatchPreview } from './match-report-builder.js';

export { buildTrainingReminder, buildCancelledTraining, buildFundraisingCampaign, buildGeneralAnnouncement, buildBulkTrainingReminders } from './announcement-builder.js';

export { buildVolunteerRequest, buildVolunteerThankYou, selectVolunteers, getVolunteerStats, buildBulkVolunteerRequests } from './volunteer-manager.js';

export { buildSponsorUpdate, buildSponsorAcknowledgment, buildAllSponsorUpdates, getSponsorStats } from './sponsor-updates.js';

export { buildRenewalReminder, buildWelcomeNewMember, buildLapsedMemberReEngagement, buildBulkRenewalReminders, buildBulkWelcomeMessages, getMembershipStats } from './member-retention.js';

export { buildOldBoysInvitation, buildSeasonLaunch, buildAwardsEvening, buildChristmasFunction } from './oldboys-manager.js';

export { CHANNELS, CHANNEL_STATUS, planDelivery, executeDelivery, selectChannel, listChannels } from './delivery-planner.js';

export { scheduleNow, scheduleAt, scheduleRecurring, cancelScheduled, getScheduled, getDueSchedules, markScheduleSent, scheduleStats } from './schedule-manager.js';

export { logCommunication, logSent, logFailed, logScheduled, logCancelled, getRecipientHistory, getRecentHistory, getHistoryStats, hasRecentlySent, COMM_EVENTS } from './communication-history.js';

export { getTopCommunicationTypes, getChannelBreakdown, getAudienceReachability, getChurnRisk, generateInsightsReport } from './communication-insights.js';

// ─── High-level convenience API ───────────────────────────────────────────────

import { selectAudience }   from './audience-selector.js';
import { planDelivery, executeDelivery } from './delivery-planner.js';
import { scheduleNow, scheduleAt }       from './schedule-manager.js';

/**
 * Send a communication spec immediately to its audience.
 *
 * commSpec: { type, audienceType, vars, audienceCriteria? }
 * options:  { role, dryRun, dedupWithinHours, forceChannel }
 */
export async function sendCommunication(commSpec, options = {}) {
  const { role = 'coach', dryRun = false, dedupWithinHours = 0, forceChannel = null } = options;

  const audience = await selectAudience(commSpec.audienceType, commSpec.audienceCriteria ?? {}, role);
  const plan     = planDelivery(commSpec, audience, { dedupWithinHours, forceChannel });
  const result   = await executeDelivery(plan, commSpec, { dryRun });

  return { audience, plan, result };
}

/**
 * Schedule a communication for future delivery.
 *
 * commSpec: { type, audienceType, vars }
 * sendAt:   Date | ISO string
 */
export function scheduleCommunication(commSpec, sendAt) {
  if (!sendAt) return scheduleNow(commSpec);
  return scheduleAt(commSpec, sendAt);
}

/**
 * Preview a communication without sending — returns rendered content for the
 * first 3 recipients.
 */
export async function previewCommunication(commSpec, options = {}) {
  const { role = 'coach' } = options;
  const audience = await selectAudience(commSpec.audienceType, commSpec.audienceCriteria ?? {}, role);
  const plan     = planDelivery(commSpec, audience, { dedupWithinHours: 0 });
  const result   = await executeDelivery(plan, commSpec, { dryRun: true });

  return {
    type:         commSpec.type,
    audienceType: commSpec.audienceType,
    recipientCount: audience.count,
    preview:      result.results.slice(0, 3),
    channels:     plan.byChannel,
    isMock:       audience.isMock,
  };
}

/**
 * Get communication history for a specific recipient.
 */
export { getRecipientHistory as getCommunicationHistory } from './communication-history.js';

/**
 * Get combined insights report.
 */
export { generateInsightsReport as getCommunicationInsights } from './communication-insights.js';
