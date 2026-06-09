// Core content generation — templates, personalisation, rendering.
// All templates use {{ variable }} syntax.

import { randomUUID } from 'crypto';

export const COMMUNICATION_TYPES = {
  WEEKLY_NEWSLETTER:       'weekly_newsletter',
  WEEKEND_RESULTS:         'weekend_results',
  PLAYER_OF_WEEK:          'player_of_week',
  COACH_MESSAGE:           'coach_message',
  TRAINING_REMINDER:       'training_reminder',
  CANCELLED_TRAINING:      'cancelled_training',
  MATCH_PREVIEW:           'match_preview',
  MATCH_REPORT:            'match_report',
  VOLUNTEER_REQUEST:       'volunteer_request',
  VOLUNTEER_THANKYOU:      'volunteer_thankyou',
  SPONSOR_UPDATE:          'sponsor_update',
  RENEWAL_REMINDER:        'renewal_reminder',
  WELCOME_NEW_MEMBER:      'welcome_new_member',
  FUNDRAISING:             'fundraising',
  OLDBOYS_INVITATION:      'oldboys_invitation',
  SEASON_LAUNCH:           'season_launch',
  AWARDS_EVENING:          'awards_evening',
  CHRISTMAS_FUNCTION:      'christmas_function',
  GENERAL_ANNOUNCEMENT:    'general_announcement',
  LAPSED_MEMBER:           'lapsed_member',
  SPONSOR_ACKNOWLEDGMENT:  'sponsor_acknowledgment',
};

// Base templates — subject + body (plain text) + shortBody (push/SMS)
export const TEMPLATES = {
  [COMMUNICATION_TYPES.WEEKLY_NEWSLETTER]: {
    subject:   '{{ club_name }} Weekly Update — {{ date }}',
    body:      `Hi {{ first_name }},\n\nHere\'s your {{ club_name }} weekly update for {{ date }}.\n\n{{ headline }}\n\n📋 RESULTS\n{{ results_section }}\n\n📅 UPCOMING\n{{ upcoming_section }}\n\n⭐ PLAYER SPOTLIGHT\n{{ spotlight_section }}\n\n📢 CLUB NEWS\n{{ news_section }}\n\nSee you on the pitch!\n{{ coach_name }}\n{{ club_name }}`,
    shortBody: '{{ club_name }} weekly update is here! {{ headline }}',
  },
  [COMMUNICATION_TYPES.WEEKEND_RESULTS]: {
    subject:   '{{ club_name }} Weekend Results — {{ date }}',
    body:      `Hi {{ first_name }},\n\nWeekend round-up from {{ club_name }}.\n\n{{ results_section }}\n\n{{ closing_note }}\n\n{{ club_name }}`,
    shortBody: 'Weekend results: {{ results_summary }}',
  },
  [COMMUNICATION_TYPES.PLAYER_OF_WEEK]: {
    subject:   'Player of the Week — {{ player_name }} 🌟',
    body:      `Hi {{ first_name }},\n\nWe\'re delighted to announce {{ player_name }} as our Player of the Week!\n\n{{ achievement_text }}\n\nWell done {{ player_first_name }} — keep up the great work!\n\n{{ coach_name }}\n{{ club_name }}`,
    shortBody: '⭐ Player of the Week: {{ player_name }}! {{ achievement_short }}',
  },
  [COMMUNICATION_TYPES.COACH_MESSAGE]: {
    subject:   'Message from {{ coach_name }} — {{ team_name }}',
    body:      `Hi {{ first_name }},\n\n{{ message_body }}\n\n{{ coach_name }}\n{{ team_name }} Coach\n{{ club_name }}`,
    shortBody: '{{ coach_name }}: {{ message_short }}',
  },
  [COMMUNICATION_TYPES.TRAINING_REMINDER]: {
    subject:   '⏰ Training Tomorrow — {{ team_name }}, {{ day }} {{ time }}',
    body:      `Hi {{ first_name }},\n\nReminder: {{ team_name }} training is {{ day }} at {{ time }}, {{ venue }}.\n\nFocus: {{ session_focus }}\nDuration: {{ duration }} mins\n\nPlease confirm attendance in the app.\n\n{{ coach_name }}\n{{ club_name }}`,
    shortBody: '⏰ Training reminder: {{ team_name }}, {{ day }} {{ time }} at {{ venue }}',
  },
  [COMMUNICATION_TYPES.CANCELLED_TRAINING]: {
    subject:   '❌ Training Cancelled — {{ team_name }}, {{ day }}',
    body:      `Hi {{ first_name }},\n\n{{ team_name }} training scheduled for {{ day }} at {{ time }} has been cancelled.\n\nReason: {{ reason }}\n\n{{ alternative_text }}\n\nApologies for the short notice.\n\n{{ coach_name }}\n{{ club_name }}`,
    shortBody: '❌ {{ team_name }} training {{ day }} is cancelled. {{ reason }}',
  },
  [COMMUNICATION_TYPES.MATCH_PREVIEW]: {
    subject:   '🏉 Match Preview — {{ team_name }} vs {{ opposition }} {{ date }}',
    body:      `Hi {{ first_name }},\n\n{{ team_name }} face {{ opposition }} this {{ day }}.\n\n📍 Venue: {{ venue }}\n🕐 Kick-off: {{ kickoff_time }}\n🏆 Competition: {{ competition }}\n\n{{ preview_text }}\n\nCome out and support the lads!\n\n{{ coach_name }}\n{{ club_name }}`,
    shortBody: '🏉 {{ team_name }} vs {{ opposition }}, {{ day }} {{ kickoff_time }} at {{ venue }}',
  },
  [COMMUNICATION_TYPES.MATCH_REPORT]: {
    subject:   '📝 Match Report — {{ team_name }} {{ result_line }}',
    body:      `Hi {{ first_name }},\n\n{{ result_line }}\n\n{{ match_summary }}\n\n{{ scorers_section }}\n\n⭐ Player of the Match: {{ potm }}\n\n{{ closing_note }}\n\n{{ coach_name }}\n{{ club_name }}`,
    shortBody: '📝 {{ team_name }} {{ result_line }}. {{ potm }} was outstanding.',
  },
  [COMMUNICATION_TYPES.VOLUNTEER_REQUEST]: {
    subject:   '🙋 Volunteer Request — {{ event_name }}, {{ event_date }}',
    body:      `Hi {{ first_name }},\n\nWe need volunteers for {{ event_name }} on {{ event_date }}.\n\nRoles needed:\n{{ roles_list }}\n\nCan you help? Please reply by {{ deadline }}.\n\nEvery bit of help makes a difference — thank you!\n\n{{ organiser_name }}\n{{ club_name }}`,
    shortBody: '🙋 Can you volunteer for {{ event_name }} on {{ event_date }}? Reply to confirm.',
  },
  [COMMUNICATION_TYPES.VOLUNTEER_THANKYOU]: {
    subject:   '🙏 Thank You — {{ event_name }}',
    body:      `Hi {{ first_name }},\n\nThank you so much for volunteering at {{ event_name }}.\n\n{{ thank_you_text }}\n\nYour contribution means everything to {{ club_name }}.\n\n{{ organiser_name }}\n{{ club_name }}`,
    shortBody: '🙏 Thank you for volunteering at {{ event_name }}, {{ first_name }}!',
  },
  [COMMUNICATION_TYPES.SPONSOR_UPDATE]: {
    subject:   '{{ club_name }} Sponsor Update — {{ period }}',
    body:      `Dear {{ first_name }},\n\nThank you for your continued support of {{ club_name }} as our {{ tier }} sponsor.\n\nHere\'s your update for {{ period }}:\n\n{{ update_content }}\n\n{{ club_stats }}\n\nWe are deeply grateful for your partnership.\n\nKind regards,\n{{ contact_name }}\n{{ club_name }}`,
    shortBody: '{{ club_name }} sponsor update: {{ period }}. Thank you, {{ first_name }}!',
  },
  [COMMUNICATION_TYPES.SPONSOR_ACKNOWLEDGMENT]: {
    subject:   'Thank You — {{ sponsor_name }} Partnership',
    body:      `Dear {{ first_name }},\n\nWe would like to sincerely thank {{ sponsor_name }} for {{ sponsorship_description }}.\n\n{{ acknowledgment_text }}\n\nWe look forward to continuing our partnership.\n\nKind regards,\n{{ contact_name }}\n{{ club_name }}`,
    shortBody: 'Thank you to {{ sponsor_name }} for their continued support of {{ club_name }}!',
  },
  [COMMUNICATION_TYPES.RENEWAL_REMINDER]: {
    subject:   '⚠️ Membership Renewal Due — {{ days_until_expiry }} days remaining',
    body:      `Hi {{ first_name }},\n\nYour {{ club_name }} membership expires on {{ expiry_date }} ({{ days_until_expiry }} days).\n\nMembership type: {{ membership_type }}\nRenewal fee: {{ renewal_fee }}\n\nRenew now to stay connected: {{ renewal_link }}\n\nQuestions? Contact {{ contact_email }}.\n\n{{ club_name }} Membership Team`,
    shortBody: '⚠️ Your {{ club_name }} membership expires in {{ days_until_expiry }} days. Renew now!',
  },
  [COMMUNICATION_TYPES.WELCOME_NEW_MEMBER]: {
    subject:   'Welcome to {{ club_name }}, {{ first_name }}! 🏉',
    body:      `Hi {{ first_name }},\n\nWelcome to {{ club_name }}! We\'re thrilled to have you.\n\n{{ welcome_text }}\n\nYour membership details:\nType: {{ membership_type }}\nValid until: {{ valid_until }}\nTeam: {{ team_name }}\n\nNext steps:\n{{ next_steps }}\n\nAny questions, please reach out to {{ contact_email }}.\n\nSee you on the pitch!\n{{ club_name }}`,
    shortBody: 'Welcome to {{ club_name }}, {{ first_name }}! 🏉 Your membership is confirmed.',
  },
  [COMMUNICATION_TYPES.FUNDRAISING]: {
    subject:   '🙌 {{ club_name }} Fundraising Campaign — {{ campaign_name }}',
    body:      `Hi {{ first_name }},\n\n{{ campaign_intro }}\n\nTarget: {{ target_amount }}\nRaised so far: {{ current_amount }}\n{{ progress_bar }}\n\n{{ campaign_story }}\n\nEvery contribution counts: {{ donate_link }}\n\nThank you for your support.\n\n{{ club_name }}`,
    shortBody: '🙌 {{ campaign_name }}: {{ current_amount }} raised toward {{ target_amount }}. Help us reach the goal!',
  },
  [COMMUNICATION_TYPES.OLDBOYS_INVITATION]: {
    subject:   '{{ club_name }} — You\'re Invited: {{ event_name }}',
    body:      `Dear {{ first_name }},\n\nAs a former member of {{ club_name }}, we would love to welcome you back for {{ event_name }}.\n\n📅 Date: {{ event_date }}\n📍 Venue: {{ venue }}\n🕐 Time: {{ event_time }}\n\n{{ event_description }}\n\nPlease RSVP by {{ rsvp_deadline }}: {{ rsvp_link }}\n\nWe hope to see you there.\n\n{{ club_name }}`,
    shortBody: '{{ club_name }} invites you to {{ event_name }} on {{ event_date }}. RSVP now!',
  },
  [COMMUNICATION_TYPES.SEASON_LAUNCH]: {
    subject:   '🏉 {{ season }} Season Launch — {{ club_name }}',
    body:      `Hi {{ first_name }},\n\nThe {{ season }} season is here!\n\n{{ season_overview }}\n\n📅 Key dates:\n{{ key_dates }}\n\n🏆 This season\'s goals:\n{{ season_goals }}\n\n{{ coach_message }}\n\nLet\'s make it our best season yet!\n\n{{ club_name }}`,
    shortBody: '🏉 {{ season }} season is here! {{ season_tagline }}',
  },
  [COMMUNICATION_TYPES.AWARDS_EVENING]: {
    subject:   '🏆 {{ club_name }} Awards Evening — {{ event_date }}',
    body:      `Dear {{ first_name }},\n\nYou\'re cordially invited to the {{ club_name }} Annual Awards Evening.\n\n📅 Date: {{ event_date }}\n📍 Venue: {{ venue }}\n🕐 Time: {{ event_time }}\n{{ dress_code }}\n\n{{ awards_preview }}\n\nTickets: {{ ticket_info }}\nRSVP: {{ rsvp_link }}\n\nWe look forward to celebrating another fantastic year together.\n\n{{ club_name }}`,
    shortBody: '🏆 {{ club_name }} Awards Evening, {{ event_date }} at {{ venue }}. Join us!',
  },
  [COMMUNICATION_TYPES.CHRISTMAS_FUNCTION]: {
    subject:   '🎄 {{ club_name }} Christmas Function — {{ event_date }}',
    body:      `Hi {{ first_name }},\n\nJoin us for the {{ club_name }} Christmas Function!\n\n📅 Date: {{ event_date }}\n📍 Venue: {{ venue }}\n🕐 Time: {{ event_time }}\n\n{{ function_details }}\n\nTickets: {{ ticket_info }}\nRSVP by {{ rsvp_deadline }}: {{ rsvp_link }}\n\nWe hope to see you there for a great night!\n\n{{ club_name }}`,
    shortBody: '🎄 {{ club_name }} Christmas Function, {{ event_date }}. Book now!',
  },
  [COMMUNICATION_TYPES.GENERAL_ANNOUNCEMENT]: {
    subject:   '📢 {{ subject_line }} — {{ club_name }}',
    body:      `Hi {{ first_name }},\n\n{{ announcement_body }}\n\n{{ call_to_action }}\n\n{{ club_name }}`,
    shortBody: '📢 {{ subject_line }}: {{ announcement_short }}',
  },
  [COMMUNICATION_TYPES.LAPSED_MEMBER]: {
    subject:   'We miss you at {{ club_name }}, {{ first_name }}',
    body:      `Hi {{ first_name }},\n\nWe noticed your {{ club_name }} membership lapsed on {{ lapsed_date }}.\n\nWe\'d love to welcome you back!\n\n{{ reengagement_text }}\n\nRejoin today: {{ rejoin_link }}\n\nIf you have any questions or would like to chat, reply to this message.\n\n{{ club_name }}`,
    shortBody: 'We miss you, {{ first_name }}! Your {{ club_name }} membership has lapsed. Rejoin today.',
  },
};

// Render a template string with variable substitution.
export function render(template, vars = {}) {
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, key) => {
    const val = vars[key];
    return val != null ? String(val) : `[${key}]`;
  });
}

// Render full subject + body + shortBody for a given type.
export function generateContent(type, vars = {}) {
  const tpl = TEMPLATES[type];
  if (!tpl) throw new Error(`Unknown communication type: ${type}`);

  return {
    id:        randomUUID(),
    type,
    subject:   render(tpl.subject,   vars),
    body:      render(tpl.body,      vars),
    shortBody: render(tpl.shortBody, vars),
    vars,
    generatedAt: new Date().toISOString(),
  };
}

// Merge recipient-specific vars into a base vars object.
export function personaliseVars(recipient, baseVars = {}) {
  return {
    first_name: recipient.firstName ?? recipient.name ?? 'Member',
    ...baseVars,
  };
}

// Generate content personalised for a specific recipient.
export function generatePersonalised(type, recipient, baseVars = {}) {
  return generateContent(type, personaliseVars(recipient, baseVars));
}

// Infer channel-appropriate content from a full ContentResult.
export function adaptForChannel(content, channel) {
  if (channel === 'push' || channel === 'sms') {
    return { ...content, body: content.shortBody };
  }
  return content;
}
