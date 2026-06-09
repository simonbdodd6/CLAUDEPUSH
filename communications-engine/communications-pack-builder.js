// Weekly Club Communications Pack Builder
// Generates all weekly club communications as DRAFT items ready for human review.
// Connects to Data Integration Layer, Memory Engine, and all builder modules.

import { randomUUID } from 'crypto';

import { selectAudience, AUDIENCE_TYPES, audienceSummary } from './audience-selector.js';
import { createDraft, formatDraftCard, DRAFT_STATUS } from './draft-manager.js';
import { buildWeeklyNewsletter } from './newsletter-builder.js';
import { buildWeekendResults, buildMatchPreview } from './match-report-builder.js';
import { buildTrainingReminder, buildGeneralAnnouncement } from './announcement-builder.js';
import { buildVolunteerRequest } from './volunteer-manager.js';
import { buildSponsorUpdate } from './sponsor-updates.js';
import { buildOldBoysInvitation, buildSeasonLaunch } from './oldboys-manager.js';
import { buildRenewalReminder, buildWelcomeNewMember, buildLapsedMemberReEngagement } from './member-retention.js';
import { buildMatchResultPost, buildWeeklyRoundup, buildPlayerOfWeekPost, buildEventPost, formatSocialPost } from './social-media-builder.js';
import { buildCommitteeSummary } from './committee-summary-builder.js';

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

export async function buildWeeklyPack(options = {}) {
  const {
    clubName   = 'Your Club',
    coachName  = 'The Management',
    contactName = 'Club Secretary',
    rsvpLink   = '#',
    renewalLink = '#',
    donateLink  = '#',
    season     = '2025-26',
  } = options;

  const packId    = randomUUID();
  const weekOf    = new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const drafts    = [];
  const warnings  = [];

  const dataLayer = await di();

  // ── 1. Weekly Newsletter ─────────────────────────────────────────────────────
  const newsletterSpec = await buildWeeklyNewsletter({ clubName, coachName, headline: `A strong week for ${clubName} — great performances across all teams.` });
  const newsletterAudience = await selectAudience(AUDIENCE_TYPES.NEWSLETTER, {}, 'coach');
  const newsletterAudienceFallback = newsletterAudience.count === 0
    ? await selectAudience(AUDIENCE_TYPES.PLAYERS, {}, 'coach')
    : newsletterAudience;
  drafts.push(createDraft(newsletterSpec, newsletterAudienceFallback));

  // ── 2. Weekend Results ───────────────────────────────────────────────────────
  const resultsSpec = await buildWeekendResults({ clubName, coachName });
  const allAudience = await selectAudience(AUDIENCE_TYPES.PLAYERS, {}, 'coach');
  drafts.push(createDraft(resultsSpec, allAudience));

  // ── 3. Training Reminders ────────────────────────────────────────────────────
  let sessions = [];
  if (dataLayer) {
    const res = await dataLayer.query({ source: 'sessions', role: 'coach' }).catch(() => ({ data: [] }));
    sessions = (res.data ?? []).slice(0, 3); // next few sessions
  }
  // Fallback sample sessions if no data
  if (sessions.length === 0) {
    sessions = [
      { id: 's-senior', ageGroup: 'Senior', date: new Date(Date.now() + 86400000).toISOString(), focus: 'Lineout & Set Piece', durationMinutes: 90, venue: 'Main Pitch' },
      { id: 's-u18',   ageGroup: 'U18',   date: new Date(Date.now() + 2 * 86400000).toISOString(), focus: 'Skills & Fitness', durationMinutes: 75, venue: 'Training Pitch' },
    ];
    warnings.push('Training reminders based on sample sessions — connect real session data');
  }

  for (const session of sessions.slice(0, 3)) {
    const spec      = buildTrainingReminder(session, { clubName, coachName });
    const ageGroup  = session.ageGroup ?? 'Senior';
    const audience  = await selectAudience(AUDIENCE_TYPES.PLAYERS, { ageGroup }, 'coach');
    const aud       = audience.count > 0 ? audience : allAudience;
    drafts.push(createDraft(spec, aud));
  }

  // ── 4. Volunteer Request ─────────────────────────────────────────────────────
  let upcomingEvent = null;
  if (dataLayer) {
    const res = await dataLayer.query({ source: 'events', role: 'public' }).catch(() => ({ data: [] }));
    upcomingEvent = (res.data ?? []).find(e => e.status === 'upcoming' || new Date(e.date) > Date.now());
  }
  if (!upcomingEvent) {
    upcomingEvent = { id: 'e-club', name: 'Club BBQ', date: new Date(Date.now() + 7 * 86400000).toISOString(), venue: 'Clubhouse' };
    warnings.push('Volunteer request uses sample event data');
  }
  const volunteerSpec = buildVolunteerRequest(
    upcomingEvent,
    [{ role: 'Steward', count: 3, description: 'Manage car park and gate' }, { role: 'Bar Help', count: 2 }, { role: 'Set-up Crew', count: 4 }],
    { clubName, organiserName: contactName }
  );
  const volunteerAudience = await selectAudience(AUDIENCE_TYPES.VOLUNTEERS, {}, 'manager');
  const volAud = volunteerAudience.count > 0 ? volunteerAudience : allAudience;
  drafts.push(createDraft(volunteerSpec, volAud));

  // ── 5. Sponsor Thank-You/Update ───────────────────────────────────────────────
  let sponsors = [];
  if (dataLayer) {
    const res = await dataLayer.query({ source: 'sponsors', role: 'manager' }).catch(() => ({ data: [] }));
    sponsors = (res.data ?? []).slice(0, 2); // top 2 sponsors
  }
  if (sponsors.length === 0) {
    sponsors = [{ id: 'sp1', name: 'Kildare Motor Group', contactName: 'Seán Brennan', tier: 'title', orgName: 'Kildare Motor Group' }];
    warnings.push('Sponsor updates based on sample sponsor data');
  }
  for (const sponsor of sponsors) {
    const spec = buildSponsorUpdate(sponsor, weekOf, {
      clubName,
      contactName,
      updateContent: `• ${clubName} fielded teams across all age groups this week\n• Strong season performance continuing\n• Your support continues to make a real difference`,
    });
    const sponsorAudience = await selectAudience(AUDIENCE_TYPES.SPONSORS, {}, 'manager');
    const spAud = sponsorAudience.count > 0 ? sponsorAudience : { type: 'sponsors', count: 1, recipients: [{ id: sponsor.id, name: sponsor.contactName, preferredChannel: 'email', _isMock: true }], isMock: true, audienceSummary: () => '1 sponsor' };
    drafts.push(createDraft(spec, spAud));
  }

  // ── 6. Old Boys / Member Update ───────────────────────────────────────────────
  // Renewal reminders for near-expiry members
  let nearExpiry = [];
  if (dataLayer) {
    const res = await dataLayer.query({ source: 'membership', role: 'manager' }).catch(() => ({ data: [] }));
    nearExpiry = (res.data ?? []).filter(m => {
      if (!m.validUntil || m.status !== 'active') return false;
      return (new Date(m.validUntil) - Date.now()) / 86400000 <= 30;
    }).slice(0, 3);
  }
  if (nearExpiry.length > 0) {
    for (const member of nearExpiry.slice(0, 2)) {
      const spec = buildRenewalReminder(member, { clubName, renewalLink });
      const memberAudience = { type: AUDIENCE_TYPES.MEMBERS, count: 1, recipients: [{ id: member.id, name: member.playerName, preferredChannel: member.email ? 'email' : 'in-app', _isMock: member._isMock ?? true }], isMock: member._isMock ?? true };
      memberAudience.audienceSummary = () => `1 member — ${member.playerName ?? member.name}`;
      drafts.push(createDraft(spec, memberAudience));
    }
  } else {
    // Lapsed member re-engagement as fallback
    const lapsedSpec = buildGeneralAnnouncement(
      'Member Update',
      `Dear ${clubName} family,\n\nWe wanted to reach out with a quick update on the season so far and to remind you that membership renewals for ${season} are now open.\n\nWe'd love to see you back on the pitch or in the stands!`,
      { clubName, audienceType: AUDIENCE_TYPES.MEMBERS }
    );
    const memberAudience = await selectAudience(AUDIENCE_TYPES.MEMBERS, {}, 'manager');
    const memAud = memberAudience.count > 0 ? memberAudience : allAudience;
    drafts.push(createDraft(lapsedSpec, memAud));
    warnings.push('No near-expiry members found — using general member update instead');
  }

  // ── 7. Social Media Drafts ────────────────────────────────────────────────────
  let socialDrafts = [];

  // Weekend results post
  let pastFixtures = [];
  if (dataLayer) {
    const res = await dataLayer.query({ source: 'fixtures', role: 'public' }).catch(() => ({ data: [] }));
    pastFixtures = (res.data ?? []).filter(f => f.result || f.homeScore != null);
  }
  if (pastFixtures.length === 0) {
    pastFixtures = [{ homeTeam: clubName, awayTeam: 'Naas RFC', homeScore: 24, awayScore: 17, ageGroup: 'Senior', result: 'win' }];
  }
  socialDrafts.push(buildWeeklyRoundup(pastFixtures, { clubName }));

  // Match result post for most recent game
  if (pastFixtures.length > 0) {
    const latest = pastFixtures[pastFixtures.length - 1];
    socialDrafts.push(buildMatchResultPost(latest, { clubName, potm: 'Outstanding Player' }));
  }

  // Upcoming event post if available
  if (upcomingEvent) {
    socialDrafts.push(buildEventPost(upcomingEvent, { clubName }));
  }

  // ── 8. Committee Summary ──────────────────────────────────────────────────────
  const committeeSummary = await buildCommitteeSummary(drafts, { clubName, weekOf });

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const byAudience = {};
  drafts.forEach(d => { byAudience[d.audienceType] = (byAudience[d.audienceType] ?? 0) + 1; });

  const byChannel = {};
  drafts.forEach(d => { byChannel[d.channel] = (byChannel[d.channel] ?? 0) + 1; });

  const byRisk = {};
  drafts.forEach(d => { byRisk[d.riskLevel] = (byRisk[d.riskLevel] ?? 0) + 1; });

  return {
    packId,
    weekOf,
    clubName,
    generatedAt: new Date().toISOString(),
    status:      'draft',
    requiresHumanApproval: true,

    drafts,
    socialDrafts,
    committeeSummary,

    stats: {
      totalDrafts:      drafts.length,
      totalSocialPosts: socialDrafts.length,
      byAudience,
      byChannel,
      byRisk,
      requiresApproval: drafts.filter(d => d.requiresHumanApproval).length,
    },

    isMock:   drafts.some(d => d.isMock),
    warnings,
  };
}

// Render the full weekly pack as a markdown document.
export function formatWeeklyPack(pack) {
  const now = new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const riskSummary = Object.entries(pack.stats.byRisk).map(([r, n]) => `${n} ${r}`).join(', ');

  let out = `# ${pack.clubName} — Weekly Communications Pack
*Week of ${pack.weekOf} | Generated: ${now}*

> ⚠️ **ALL COMMUNICATIONS ARE IN DRAFT STATUS**
> Nothing has been sent. Every item requires human review and approval before delivery.
> Pack ID: \`${pack.packId}\`

---

## Summary

| Metric | Value |
|--------|-------|
| Total drafts | ${pack.stats.totalDrafts} |
| Social media posts | ${pack.stats.totalSocialPosts} |
| Require approval | ${pack.stats.requiresApproval} |
| Risk breakdown | ${riskSummary} |
| Mock data | ${pack.isMock ? '⚠️ Yes — replace with real data before sending' : '✅ No'} |

`;

  if (pack.warnings.length > 0) {
    out += `## ⚠️ Warnings\n${pack.warnings.map(w => `- ${w}`).join('\n')}\n\n---\n\n`;
  }

  out += `## 📬 Communication Drafts (${pack.stats.totalDrafts})\n\n`;
  pack.drafts.forEach((d, i) => {
    out += `### ${i + 1}. ${d.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n`;
    out += formatDraftCard(d) + '\n';
  });

  out += `## 📱 Social Media Drafts (${pack.socialDrafts.length})\n\n`;
  pack.socialDrafts.forEach(s => {
    out += formatSocialPost(s) + '\n';
  });

  out += `---\n\n## 🏛️ Committee Summary\n\n${pack.committeeSummary}\n`;

  return out;
}
