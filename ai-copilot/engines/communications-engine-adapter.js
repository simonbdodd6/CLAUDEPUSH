// Communications Engine Adapter — registers the Communications Engine with the AI Copilot
// Priority: 78 (just below workflow at 80, above rugby knowledge at 60)
//
// Handles NL requests:
//   "Build this week's club newsletter"
//   "Prepare weekend communications"
//   "Send old boys a results update"
//   "Create a sponsor thank-you"
//   "Ask for BBQ volunteers"
//   "Generate the weekly communications pack"

import { registerTool } from '../tool-registry.js';

const INTENT_MAP = [
  { patterns: [/communication.*pack/i, /weekly.*pack/i, /club.*pack/i, /this.*week.*comm/i, /prepare.*comm/i, /generate.*pack/i], intent: 'communications_pack' },
  { patterns: [/newsletter/i, /weekly.*update/i, /club.*update/i], intent: 'newsletter' },
  { patterns: [/weekend.*result/i, /results.*summar/i, /match.*result/i, /result.*update/i], intent: 'weekend_results' },
  { patterns: [/training.*remind/i, /remind.*training/i, /session.*remind/i], intent: 'training_reminder' },
  { patterns: [/volunteer/i, /help.*need/i, /steward/i, /bbq.*help/i, /event.*help/i], intent: 'volunteer_request' },
  { patterns: [/sponsor.*thank/i, /thank.*sponsor/i, /sponsor.*update/i, /sponsor.*message/i], intent: 'sponsor_update' },
  { patterns: [/old.*boy/i, /alumni/i, /former.*member/i, /old.*member/i], intent: 'oldboys' },
  { patterns: [/membership.*renew/i, /renew.*remind/i, /member.*expir/i], intent: 'renewal_reminder' },
  { patterns: [/welcome.*member/i, /new.*member/i], intent: 'welcome_member' },
  { patterns: [/match.*report/i, /game.*report/i, /result.*report/i], intent: 'match_report' },
  { patterns: [/match.*preview/i, /upcoming.*match/i, /preview.*match/i], intent: 'match_preview' },
  { patterns: [/social.*media/i, /facebook.*post/i, /instagram.*post/i, /post.*result/i], intent: 'social_media' },
  { patterns: [/cancel.*train/i, /training.*cancel/i, /off.*tonight/i], intent: 'cancelled_training' },
  { patterns: [/fundrais/i, /raise.*fund/i, /fund.*rais/i], intent: 'fundraising' },
  { patterns: [/awards/i, /award.*evening/i, /annual.*award/i], intent: 'awards_evening' },
  { patterns: [/christmas/i, /xmas.*function/i, /christmas.*dinner/i], intent: 'christmas_function' },
  { patterns: [/season.*launch/i, /new.*season/i, /season.*start/i], intent: 'season_launch' },
];

function detectIntent(message) {
  const lower = message.toLowerCase();
  for (const { patterns, intent } of INTENT_MAP) {
    if (patterns.some(p => p.test(lower))) return intent;
  }
  return null;
}

function mightBeCommunications(message) {
  const lower = message.toLowerCase();
  const triggers = [
    'newsletter', 'communication', 'sponsor', 'volunteer', 'old boy', 'alumni',
    'member', 'result', 'training reminder', 'match report', 'social media',
    'weekly pack', 'club update', 'announce', 'invite', 'bbq', 'christmas',
    'awards', 'fundrais', 'season launch', 'send message', 'remind',
  ];
  return triggers.some(t => lower.includes(t));
}

registerTool({
  name:        'communications-engine',
  version:     '2.0.0',
  description: 'Generates and schedules club communications as human-approved drafts — newsletters, match reports, volunteer requests, sponsor updates, old boys, social media',
  capabilities: [
    'newsletter',
    'match_report',
    'training_reminder',
    'volunteer_request',
    'sponsor_update',
    'member_update',
    'communications_pack',
    'social_media',
    'oldboys',
    'renewal_reminder',
    'welcome_member',
    'match_preview',
    'cancelled_training',
    'fundraising',
    'awards_evening',
    'christmas_function',
    'season_launch',
  ],
  requiredContext: [],
  priority: 78,

  async execute(intent, context) {
    const message = context?.message ?? intent?.message ?? '';

    if (!mightBeCommunications(message)) {
      return { success: false, data: null, summary: 'Not a communications request', evidence: [] };
    }

    const commIntent = detectIntent(message);

    let ce, packBuilder;
    try {
      ce = await import('../../communications-engine/index.js');
      packBuilder = await import('../../communications-engine/communications-pack-builder.js');
    } catch (err) {
      return { success: false, data: null, summary: 'Communications Engine unavailable', evidence: [], error: err.message };
    }

    const clubName  = context.clubName  ?? context.club?.name ?? 'Your Club';
    const coachName = context.coachName ?? context.coach?.name ?? 'The Management';
    const opts      = { clubName, coachName };

    try {
      // ── Full pack ─────────────────────────────────────────────────────────────
      if (commIntent === 'communications_pack' || !commIntent) {
        const pack = await packBuilder.buildWeeklyPack(opts);
        const md   = packBuilder.formatWeeklyPack(pack);

        return {
          success: true,
          data: {
            packId:       pack.packId,
            weekOf:       pack.weekOf,
            totalDrafts:  pack.stats.totalDrafts,
            socialPosts:  pack.stats.totalSocialPosts,
            byRisk:       pack.stats.byRisk,
            warnings:     pack.warnings,
            status:       'draft',
            requiresHumanApproval: true,
            markdownPack: md,
          },
          summary: `Weekly communications pack ready: ${pack.stats.totalDrafts} drafts + ${pack.stats.totalSocialPosts} social posts — ALL IN DRAFT, human approval required`,
          evidence: [
            `${pack.stats.totalDrafts} communication drafts generated`,
            `${pack.stats.totalSocialPosts} social media post drafts`,
            `Risk breakdown: ${Object.entries(pack.stats.byRisk).map(([r,n]) => `${n} ${r}`).join(', ')}`,
            pack.isMock ? '⚠️ Mock data — verify recipients before sending' : '✅ Live data',
            ...pack.warnings,
          ],
        };
      }

      // ── Individual communication types ────────────────────────────────────────
      let spec, audienceType;

      switch (commIntent) {
        case 'newsletter':
          spec         = await ce.buildWeeklyNewsletter(opts);
          audienceType = ce.AUDIENCE_TYPES.NEWSLETTER;
          break;
        case 'weekend_results':
          spec         = await ce.buildWeekendResults(opts);
          audienceType = ce.AUDIENCE_TYPES.ALL;
          break;
        case 'match_report':
          spec = ce.buildMatchReport({ homeTeam: clubName, awayTeam: 'Opposition', homeScore: null, awayScore: null }, opts);
          audienceType = ce.AUDIENCE_TYPES.PLAYERS;
          break;
        case 'match_preview':
          spec         = await ce.buildMatchPreview(null, opts);
          audienceType = ce.AUDIENCE_TYPES.PLAYERS;
          break;
        case 'training_reminder': {
          const session = { id: 'next', date: new Date(Date.now() + 86400000).toISOString(), ageGroup: 'Senior', focus: 'General Training', durationMinutes: 90, venue: 'Main Pitch' };
          spec          = ce.buildTrainingReminder(session, opts);
          audienceType  = ce.AUDIENCE_TYPES.PLAYERS;
          break;
        }
        case 'cancelled_training': {
          const session = { id: 'next', date: new Date(Date.now() + 86400000).toISOString(), ageGroup: 'Senior', venue: 'Main Pitch' };
          spec          = ce.buildCancelledTraining(session, 'Pitch waterlogged', opts);
          audienceType  = ce.AUDIENCE_TYPES.PLAYERS;
          break;
        }
        case 'volunteer_request': {
          const event = { id: 'e-next', name: 'Club Event', date: new Date(Date.now() + 7 * 86400000).toISOString(), venue: 'Clubhouse' };
          spec         = ce.buildVolunteerRequest(event, ['Steward', 'Bar Help', 'Set-up'], { ...opts, organiserName: coachName });
          audienceType = ce.AUDIENCE_TYPES.VOLUNTEERS;
          break;
        }
        case 'sponsor_update': {
          const sponsor = { id: 'sp-1', name: 'Club Sponsor', contactName: 'Contact', tier: 'gold', orgName: 'Club Sponsor' };
          spec          = ce.buildSponsorUpdate(sponsor, 'This Week', opts);
          audienceType  = ce.AUDIENCE_TYPES.SPONSORS;
          break;
        }
        case 'oldboys': {
          const event = { id: 'e-ob', name: 'Annual Old Boys Reunion', date: new Date(Date.now() + 30 * 86400000).toISOString(), venue: 'Clubhouse', time: '7pm' };
          spec         = ce.buildOldBoysInvitation(event, { ...opts });
          audienceType = ce.AUDIENCE_TYPES.FORMER_MEMBERS;
          break;
        }
        case 'renewal_reminder': {
          const member = { id: 'm-1', name: 'Member', firstName: 'Member', membershipType: 'Senior', validUntil: new Date(Date.now() + 25 * 86400000).toISOString() };
          spec          = ce.buildRenewalReminder(member, opts);
          audienceType  = ce.AUDIENCE_TYPES.MEMBERS;
          break;
        }
        case 'welcome_member': {
          const member = { id: 'm-new', name: 'New Member', firstName: 'New', membershipType: 'Senior', status: 'new', validUntil: new Date(Date.now() + 365 * 86400000).toISOString() };
          spec          = ce.buildWelcomeNewMember(member, opts);
          audienceType  = ce.AUDIENCE_TYPES.MEMBERS;
          break;
        }
        case 'fundraising':
          spec         = ce.buildFundraisingCampaign({ name: 'Club Equipment Fund', intro: 'Help us reach our target!', description: 'Every donation helps.' }, { ...opts, target: 5000, raised: 0 });
          audienceType = ce.AUDIENCE_TYPES.MEMBERS;
          break;
        case 'awards_evening':
          spec         = ce.buildAwardsEvening({ id: 'e-awards', name: 'Awards Evening', date: new Date(Date.now() + 60 * 86400000).toISOString(), venue: 'Clubhouse', time: '7:30pm' }, [], opts);
          audienceType = ce.AUDIENCE_TYPES.ALL;
          break;
        case 'christmas_function':
          spec         = ce.buildChristmasFunction({ id: 'e-xmas', name: 'Christmas Function', date: new Date(Date.now() + 90 * 86400000).toISOString(), venue: 'Clubhouse', time: '7pm' }, opts);
          audienceType = ce.AUDIENCE_TYPES.ALL;
          break;
        case 'season_launch':
          spec         = ce.buildSeasonLaunch('2026-27', opts);
          audienceType = ce.AUDIENCE_TYPES.ALL;
          break;
        case 'social_media': {
          const { buildMatchResultPost, buildWeeklyRoundup } = await import('../../communications-engine/social-media-builder.js');
          const post = buildWeeklyRoundup([], { clubName });
          return {
            success: true,
            data:    { type: 'social_media', posts: post.posts, status: 'draft', requiresHumanApproval: true },
            summary: 'Social media draft posts generated — DRAFT status, requires human review before posting',
            evidence: ['Facebook draft ready', 'Instagram draft ready', 'X (Twitter) draft ready'],
          };
        }
        default:
          return { success: false, data: null, summary: `Unrecognised communication intent: ${commIntent}`, evidence: [] };
      }

      const preview = await ce.previewCommunication({ ...spec, audienceType }, { role: 'coach' });

      return {
        success: true,
        data:    {
          type:        spec.type,
          audienceType,
          status:      'draft',
          requiresHumanApproval: true,
          preview:     preview.preview.slice(0, 2),
          recipientCount: preview.recipientCount,
          channels:    preview.channels,
          isMock:      preview.isMock,
        },
        summary: `${spec.type.replace(/_/g, ' ')} draft generated for ${preview.recipientCount} ${audienceType} recipients — DRAFT, human approval required`,
        evidence: [
          `Type: ${spec.type}`,
          `Audience: ${preview.recipientCount} ${audienceType}`,
          `Channel mix: ${Object.entries(preview.channels).filter(([,v]) => v > 0).map(([k,v]) => `${v} via ${k}`).join(', ') || 'in-app'}`,
          preview.isMock ? '⚠️ Mock recipient data' : '✅ Live recipient data',
        ],
      };
    } catch (err) {
      return { success: false, data: null, summary: `Communications Engine error: ${err.message}`, evidence: [], error: err.message };
    }
  },
});
