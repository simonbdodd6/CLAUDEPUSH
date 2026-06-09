// Old boys / alumni, season launch, awards evening, and Christmas function builder.

import { COMMUNICATION_TYPES } from './content-generator.js';
import { AUDIENCE_TYPES } from './audience-selector.js';

export function buildOldBoysInvitation(event, options = {}) {
  const {
    clubName     = 'Your Club',
    rsvpLink     = '#',
    rsvpDeadline = '2 weeks before the event',
  } = options;

  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : event.date ?? 'TBC';

  return {
    type: COMMUNICATION_TYPES.OLDBOYS_INVITATION,
    audienceType: AUDIENCE_TYPES.FORMER_MEMBERS,
    template: COMMUNICATION_TYPES.OLDBOYS_INVITATION,
    vars: {
      club_name:        clubName,
      event_name:       event.name,
      event_date:       eventDate,
      venue:            event.venue ?? 'Clubhouse',
      event_time:       event.time ?? '7:00pm',
      event_description: event.description ?? `Reconnect with former team-mates, share memories, and enjoy an evening with the ${clubName} family.`,
      rsvp_deadline:    rsvpDeadline,
      rsvp_link:        rsvpLink,
    },
    metadata: { eventId: event.id, eventName: event.name, eventDate },
  };
}

export function buildSeasonLaunch(season, options = {}) {
  const {
    clubName     = 'Your Club',
    coachMessage = null,
    keyDates     = [],
    seasonGoals  = [],
    tagline      = null,
  } = options;

  const datesText = keyDates.length > 0
    ? keyDates.map(d => `• ${d.date}: ${d.event}`).join('\n')
    : '• Check the club app for all dates';

  const goalsText = seasonGoals.length > 0
    ? seasonGoals.map(g => `• ${g}`).join('\n')
    : `• Compete at every age group\n• Grow our player base\n• Strengthen the club community`;

  return {
    type: COMMUNICATION_TYPES.SEASON_LAUNCH,
    audienceType: AUDIENCE_TYPES.ALL,
    template: COMMUNICATION_TYPES.SEASON_LAUNCH,
    vars: {
      club_name:       clubName,
      season,
      season_overview: `The ${season} season kicks off with new challenges and new opportunities for every team at ${clubName}.`,
      key_dates:       datesText,
      season_goals:    goalsText,
      coach_message:   coachMessage ?? `We have been preparing hard for this season. I\'m proud of every player and I look forward to seeing what we achieve together.`,
      season_tagline:  tagline ?? `Let\'s make ${season} our best season yet.`,
    },
    metadata: { season },
  };
}

export function buildAwardsEvening(event, nominees, options = {}) {
  const {
    clubName  = 'Your Club',
    rsvpLink  = '#',
    ticketInfo = null,
    dressCode  = '',
  } = options;

  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : event.date ?? 'TBC';

  const awardsPreview = nominees && nominees.length > 0
    ? `Awards on the night include:\n${nominees.map(n => `• ${n.award}: ${n.nominees?.join(', ') ?? 'TBA'}`).join('\n')}`
    : 'Celebrating the best of the season across all age groups.';

  return {
    type: COMMUNICATION_TYPES.AWARDS_EVENING,
    audienceType: AUDIENCE_TYPES.ALL,
    template: COMMUNICATION_TYPES.AWARDS_EVENING,
    vars: {
      club_name:      clubName,
      event_date:     eventDate,
      venue:          event.venue ?? 'Clubhouse',
      event_time:     event.time ?? '7:30pm',
      dress_code:     dressCode ? `👔 Dress code: ${dressCode}` : '',
      awards_preview: awardsPreview,
      ticket_info:    ticketInfo ?? `Tickets €${event.ticketPrice ?? 30} — available at the door or via the club app`,
      rsvp_link:      rsvpLink,
    },
    metadata: { eventId: event.id, eventName: event.name ?? 'Awards Evening', eventDate },
  };
}

export function buildChristmasFunction(event, options = {}) {
  const {
    clubName   = 'Your Club',
    rsvpLink   = '#',
    rsvpDeadline = '10 December',
    ticketInfo  = null,
  } = options;

  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : event.date ?? 'TBC';

  return {
    type: COMMUNICATION_TYPES.CHRISTMAS_FUNCTION,
    audienceType: AUDIENCE_TYPES.ALL,
    template: COMMUNICATION_TYPES.CHRISTMAS_FUNCTION,
    vars: {
      club_name:       clubName,
      event_date:      eventDate,
      venue:           event.venue ?? 'Clubhouse',
      event_time:      event.time ?? '7:00pm',
      function_details: event.description ?? `Join us for dinner, music, and celebrations as we close out another great year at ${clubName}.`,
      ticket_info:     ticketInfo ?? `Tickets €${event.ticketPrice ?? 40} — available via the club app`,
      rsvp_deadline:   rsvpDeadline,
      rsvp_link:       rsvpLink,
    },
    metadata: { eventId: event.id, eventDate },
  };
}
