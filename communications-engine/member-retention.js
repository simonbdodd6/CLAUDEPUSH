// Membership retention communications — renewals, welcomes, fundraising, re-engagement.

import { COMMUNICATION_TYPES } from './content-generator.js';
import { selectAudience, AUDIENCE_TYPES } from './audience-selector.js';

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

export function buildRenewalReminder(member, options = {}) {
  const {
    clubName     = 'Your Club',
    contactEmail = 'membership@club.ie',
    renewalLink  = '#',
    renewalFee   = null,
  } = options;

  const expiry = member.validUntil ?? member.expiryDate ?? 'soon';
  const daysLeft = expiry !== 'soon'
    ? Math.max(0, Math.round((new Date(expiry) - Date.now()) / 86400000))
    : null;

  const fee = renewalFee ?? (member.membershipType === 'Senior' ? '€120' : member.membershipType === 'U18' ? '€60' : '€50');

  return {
    type: COMMUNICATION_TYPES.RENEWAL_REMINDER,
    audienceType: AUDIENCE_TYPES.MEMBERS,
    template: COMMUNICATION_TYPES.RENEWAL_REMINDER,
    vars: {
      club_name:         clubName,
      first_name:        member.firstName ?? (member.name ?? '').split(' ')[0],
      expiry_date:       expiry,
      days_until_expiry: daysLeft ?? '< 30',
      membership_type:   member.membershipType ?? 'Standard',
      renewal_fee:       fee,
      renewal_link:      renewalLink,
      contact_email:     contactEmail,
    },
    metadata: { memberId: member.id, expiry, daysLeft, membershipType: member.membershipType },
  };
}

export function buildWelcomeNewMember(member, options = {}) {
  const {
    clubName     = 'Your Club',
    contactEmail = 'info@club.ie',
    teamName     = null,
    nextSteps    = null,
  } = options;

  const steps = nextSteps ?? [
    '1. Download the club app for training schedules',
    '2. Attend your first training session',
    '3. Introduce yourself to the coach',
    '4. Follow us on social media',
  ].join('\n');

  return {
    type: COMMUNICATION_TYPES.WELCOME_NEW_MEMBER,
    audienceType: AUDIENCE_TYPES.MEMBERS,
    template: COMMUNICATION_TYPES.WELCOME_NEW_MEMBER,
    vars: {
      club_name:       clubName,
      first_name:      member.firstName ?? (member.name ?? '').split(' ')[0],
      welcome_text:    `${clubName} is a community built on rugby, friendship, and respect. We\'re delighted to have you on board.`,
      membership_type: member.membershipType ?? 'Standard',
      valid_until:     member.validUntil ?? member.expiryDate ?? 'End of season',
      team_name:       teamName ?? member.ageGroup ?? 'Your Team',
      next_steps:      steps,
      contact_email:   contactEmail,
    },
    metadata: { memberId: member.id, membershipType: member.membershipType },
  };
}

export function buildLapsedMemberReEngagement(member, options = {}) {
  const {
    clubName       = 'Your Club',
    rejoinLink     = '#',
    reEngageText   = null,
  } = options;

  const lapsed = member.validUntil ?? member.expiryDate ?? 'last season';

  return {
    type: COMMUNICATION_TYPES.LAPSED_MEMBER,
    audienceType: AUDIENCE_TYPES.FORMER_MEMBERS,
    template: COMMUNICATION_TYPES.LAPSED_MEMBER,
    vars: {
      club_name:         clubName,
      first_name:        member.firstName ?? (member.name ?? '').split(' ')[0],
      lapsed_date:       lapsed,
      reengagement_text: reEngageText ?? `A lot has happened since you were last with us. The club is growing, the teams are competing well, and we\'d love to have you back.`,
      rejoin_link:       rejoinLink,
    },
    metadata: { memberId: member.id, lapsedDate: lapsed },
  };
}

// Find all members expiring within a date window and build reminders for them.
export async function buildBulkRenewalReminders(options = {}) {
  const { withinDays = 30, clubName, contactEmail, renewalLink } = options;

  const d = await di();
  if (!d) return [];

  const res = await d.query({ source: 'membership', role: 'manager' });
  const expiring = (res.data ?? []).filter(m => {
    if (m.status !== 'active') return false;
    if (!m.validUntil) return false;
    const days = (new Date(m.validUntil) - Date.now()) / 86400000;
    return days >= 0 && days <= withinDays;
  });

  return expiring.map(m => buildRenewalReminder(m, { clubName, contactEmail, renewalLink }));
}

// Find all pending/new members and build welcome messages.
export async function buildBulkWelcomeMessages(options = {}) {
  const d = await di();
  if (!d) return [];

  const res = await d.query({ source: 'membership', role: 'manager' });
  const newMembers = (res.data ?? []).filter(m => m.status === 'pending' || m.status === 'new');
  return newMembers.map(m => buildWelcomeNewMember(m, options));
}

export async function getMembershipStats() {
  const d = await di();
  if (!d) return { total: 0, isMock: true };

  const res = await d.query({ source: 'membership', role: 'manager' });
  const members = res.data ?? [];

  const byStatus = {};
  members.forEach(m => { byStatus[m.status] = (byStatus[m.status] ?? 0) + 1; });

  return {
    total:    members.length,
    active:   byStatus.active    ?? 0,
    pending:  byStatus.pending   ?? 0,
    lapsed:   byStatus.lapsed    ?? 0,
    byStatus,
    isMock:   res.isMock,
  };
}
