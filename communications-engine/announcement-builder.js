// Training reminders, cancellations, fundraising, and general announcements.

import { COMMUNICATION_TYPES } from './content-generator.js';

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

export function buildTrainingReminder(session, options = {}) {
  const {
    clubName  = 'Your Club',
    coachName = 'The Coach',
  } = options;

  const dateStr = session.date
    ? new Date(session.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Tomorrow';

  return {
    type: COMMUNICATION_TYPES.TRAINING_REMINDER,
    audienceType: 'players',
    template: COMMUNICATION_TYPES.TRAINING_REMINDER,
    vars: {
      club_name:     clubName,
      coach_name:    coachName,
      team_name:     session.ageGroup ?? session.teamName ?? 'Your Team',
      day:           dateStr,
      time:          session.time ?? session.startTime ?? '7:00pm',
      venue:         session.venue ?? session.location ?? 'Club Grounds',
      session_focus: session.focus ?? session.theme ?? 'General Training',
      duration:      session.durationMinutes ?? 90,
    },
    metadata: { sessionId: session.id, date: session.date },
  };
}

export function buildCancelledTraining(session, reason, options = {}) {
  const {
    clubName     = 'Your Club',
    coachName    = 'The Coach',
    alternative  = null,
  } = options;

  const dateStr = session.date
    ? new Date(session.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Today';

  return {
    type: COMMUNICATION_TYPES.CANCELLED_TRAINING,
    audienceType: 'players',
    template: COMMUNICATION_TYPES.CANCELLED_TRAINING,
    vars: {
      club_name:        clubName,
      coach_name:       coachName,
      team_name:        session.ageGroup ?? session.teamName ?? 'Your Team',
      day:              dateStr,
      time:             session.time ?? session.startTime ?? '7:00pm',
      reason:           reason,
      alternative_text: alternative ?? 'We will reschedule as soon as possible.',
    },
    metadata: { sessionId: session.id, reason },
  };
}

// Build training reminders for all upcoming sessions automatically.
export async function buildBulkTrainingReminders(options = {}) {
  const { clubName = 'Your Club', coachName = 'The Coach', daysAhead = 1 } = options;

  const d = await di();
  if (!d) return [];

  const res = await d.query({ source: 'sessions', role: 'coach' });
  const sessions = (res.data ?? []).filter(s => {
    if (!s.date) return false;
    const daysDiff = (new Date(s.date) - Date.now()) / 86400000;
    return daysDiff >= 0 && daysDiff <= daysAhead;
  });

  return sessions.map(s => buildTrainingReminder(s, { clubName, coachName }));
}

export function buildFundraisingCampaign(campaign, options = {}) {
  const {
    clubName = 'Your Club',
    target   = 5000,
    raised   = 0,
    link     = '#',
  } = options;

  const pct   = Math.min(100, Math.round((raised / target) * 100));
  const filled = Math.round(pct / 5);
  const progressBar = `[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}] ${pct}%`;

  return {
    type: COMMUNICATION_TYPES.FUNDRAISING,
    audienceType: 'members',
    template: COMMUNICATION_TYPES.FUNDRAISING,
    vars: {
      club_name:       clubName,
      campaign_name:   campaign.name,
      campaign_intro:  campaign.intro ?? `We are fundraising for ${campaign.name}.`,
      campaign_story:  campaign.story ?? campaign.description ?? 'Your support helps us grow.',
      target_amount:   `€${target.toLocaleString()}`,
      current_amount:  `€${raised.toLocaleString()}`,
      progress_bar:    progressBar,
      donate_link:     link,
    },
    metadata: { campaignName: campaign.name, target, raised, progress: pct },
  };
}

export function buildGeneralAnnouncement(title, body, options = {}) {
  const {
    clubName       = 'Your Club',
    audienceType   = 'all',
    callToAction   = '',
    announcementShort = null,
  } = options;

  return {
    type: COMMUNICATION_TYPES.GENERAL_ANNOUNCEMENT,
    audienceType,
    template: COMMUNICATION_TYPES.GENERAL_ANNOUNCEMENT,
    vars: {
      club_name:         clubName,
      subject_line:      title,
      announcement_body: body,
      announcement_short: announcementShort ?? body.slice(0, 100),
      call_to_action:    callToAction,
    },
    metadata: { title },
  };
}
