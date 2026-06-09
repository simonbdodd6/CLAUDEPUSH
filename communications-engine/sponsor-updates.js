// Sponsor communication builder — updates, acknowledgments, and proposals.

import { COMMUNICATION_TYPES } from './content-generator.js';
import { selectAudience, AUDIENCE_TYPES } from './audience-selector.js';

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

export function buildSponsorUpdate(sponsor, period, options = {}) {
  const {
    clubName      = 'Your Club',
    contactName   = 'Club Secretary',
    updateContent = null,
    clubStats     = null,
  } = options;

  const name         = sponsor.contactName ?? sponsor.name ?? 'Sponsor';
  const tier         = sponsor.tier ?? sponsor.level ?? 'valued';
  const orgName      = sponsor.orgName ?? sponsor.name ?? 'Your Organisation';

  const defaultUpdate = [
    `• ${clubName} currently has ${clubStats?.playerCount ?? 'X'} registered players`,
    `• ${clubStats?.trainingSessionsThisMonth ?? 'X'} training sessions held this month`,
    `• ${clubStats?.matchesPlayed ?? 'X'} competitive matches played`,
    `• Your logo has featured in all club communications`,
    `• Thank you for making this possible, ${orgName}!`,
  ].join('\n');

  const defaultStats = clubStats
    ? `📊 Club Statistics:\n• Players: ${clubStats.playerCount ?? '—'}\n• Sessions: ${clubStats.sessions ?? '—'}\n• Members: ${clubStats.members ?? '—'}`
    : '📊 Full stats available on request.';

  return {
    type: COMMUNICATION_TYPES.SPONSOR_UPDATE,
    audienceType: AUDIENCE_TYPES.SPONSORS,
    template: COMMUNICATION_TYPES.SPONSOR_UPDATE,
    vars: {
      club_name:      clubName,
      contact_name:   contactName,
      first_name:     name.split(' ')[0],
      tier,
      period,
      update_content: updateContent ?? defaultUpdate,
      club_stats:     defaultStats,
    },
    metadata: { sponsorId: sponsor.id, sponsorName: orgName, tier },
  };
}

export function buildSponsorAcknowledgment(sponsor, description, options = {}) {
  const {
    clubName    = 'Your Club',
    contactName = 'Club Chairman',
    customText  = null,
  } = options;

  const orgName    = sponsor.orgName ?? sponsor.name;
  const firstName  = (sponsor.contactName ?? sponsor.name ?? '').split(' ')[0];

  return {
    type: COMMUNICATION_TYPES.SPONSOR_ACKNOWLEDGMENT,
    audienceType: AUDIENCE_TYPES.SPONSORS,
    template: COMMUNICATION_TYPES.SPONSOR_ACKNOWLEDGMENT,
    vars: {
      club_name:               clubName,
      contact_name:            contactName,
      first_name:              firstName,
      sponsor_name:            orgName,
      sponsorship_description: description,
      acknowledgment_text:     customText ?? `Your support enables ${clubName} to provide top-quality rugby at all age levels. We are proud to have ${orgName} as our partner.`,
    },
    metadata: { sponsorId: sponsor.id, sponsorName: orgName },
  };
}

// Build updates for all registered sponsors.
export async function buildAllSponsorUpdates(period, options = {}) {
  const d = await di();
  if (!d) return [];

  const res = await d.query({ source: 'sponsors', role: 'manager' });
  return (res.data ?? []).map(s => buildSponsorUpdate(s, period, options));
}

// Get sponsor summary for enriching update content.
export async function getSponsorStats() {
  const d = await di();
  if (!d) return { total: 0, totalValue: 0, isMock: true };

  const res = await d.query({ source: 'sponsors', role: 'manager' });
  const sponsors = res.data ?? [];
  const totalValue = sponsors.reduce((sum, s) => sum + (s.annualValue ?? s.amount ?? 0), 0);

  const byTier = {};
  sponsors.forEach(s => {
    const t = s.tier ?? 'unknown';
    byTier[t] = (byTier[t] ?? 0) + 1;
  });

  return {
    total: sponsors.length,
    totalValue,
    byTier,
    isMock: res.isMock,
  };
}
