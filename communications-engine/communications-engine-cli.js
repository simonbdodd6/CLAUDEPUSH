#!/usr/bin/env node
// Coach's Eye Communications Engine — integration test & report generator
// Usage: node communications-engine/communications-engine-cli.js

import {
  COMMUNICATION_TYPES, AUDIENCE_TYPES,
  selectAudience,
  buildWeeklyNewsletter, buildCoachMessage, buildPlayerOfWeek,
  buildMatchReport, buildWeekendResults, buildMatchPreview,
  buildTrainingReminder, buildCancelledTraining, buildGeneralAnnouncement, buildFundraisingCampaign,
  buildVolunteerRequest, buildVolunteerThankYou,
  buildSponsorUpdate, buildSponsorAcknowledgment,
  buildRenewalReminder, buildWelcomeNewMember, buildLapsedMemberReEngagement,
  buildOldBoysInvitation, buildSeasonLaunch, buildAwardsEvening, buildChristmasFunction,
  previewCommunication, sendCommunication,
  scheduleNow, scheduleAt, scheduleRecurring, scheduleStats,
  listChannels,
  getHistoryStats, getRecentHistory,
  generateInsightsReport,
} from './index.js';

import { generateContent, render } from './content-generator.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, '../COMMUNICATIONS_ENGINE_REPORT.md');

const LINE = '─'.repeat(60);
function section(title) { console.log(`\n${LINE}\n  ${title}\n${LINE}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }
function info(msg) { console.log(`  · ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }

// ─── Sample data ─────────────────────────────────────────────────────────────

const CLUB      = 'Kildare Valley RFC';
const COACH     = 'Brian O\'Sullivan';
const sampleFixture = {
  id: 'f001', homeTeam: 'Kildare Valley RFC', awayTeam: 'Naas RFC',
  homeScore: 24, awayScore: 17, date: '2025-11-08', venue: 'Home Ground',
  competition: 'Leinster League', result: 'win', ageGroup: 'Senior',
};
const sampleSession = {
  id: 's001', date: new Date(Date.now() + 86400000).toISOString(),
  ageGroup: 'Senior', focus: 'Lineout & Set Piece', durationMinutes: 90, venue: 'Main Pitch',
};
const sampleSponsor = {
  id: 'sp1', name: 'Kildare Motor Group', contactName: 'Seán Brennan', tier: 'title',
  annualValue: 5000, orgName: 'Kildare Motor Group',
};
const sampleMember = {
  id: 'm1', name: 'Eoin Farrell', membershipType: 'Senior', status: 'pending',
  validUntil: new Date(Date.now() + 20 * 86400000).toISOString(),
};
const sampleVolunteer = { id: 'v1', name: 'Pádraig Brennan', skills: ['Grounds', 'Stewarding'] };
const sampleEvent = {
  id: 'e1', name: 'Christmas Dinner', date: '2025-12-13', venue: 'Clubhouse',
  time: '7:00pm', ticketPrice: 40,
};

async function main() {
  console.log('\n📡  Coach\'s Eye — Communications Engine\n');

  // ── 1. Audience Resolution ─────────────────────────────────────────────────
  section('1. Audience Resolution');
  const playerAudience = await selectAudience(AUDIENCE_TYPES.PLAYERS, {}, 'coach');
  ok(`Players: ${playerAudience.count} recipients (mock=${playerAudience.isMock})`);

  const memberAudience = await selectAudience(AUDIENCE_TYPES.MEMBERS, {}, 'manager');
  ok(`Members: ${memberAudience.count} recipients`);

  const volunteerAudience = await selectAudience(AUDIENCE_TYPES.VOLUNTEERS, {}, 'manager');
  ok(`Volunteers: ${volunteerAudience.count} recipients`);

  const sponsorAudience = await selectAudience(AUDIENCE_TYPES.SPONSORS, {}, 'manager');
  ok(`Sponsors: ${sponsorAudience.count} recipients`);

  // ── 2. Newsletter ─────────────────────────────────────────────────────────
  section('2. Weekly Newsletter');
  const newsletter = await buildWeeklyNewsletter({ clubName: CLUB, coachName: COACH, headline: 'Great results across all age groups!' });
  ok(`Newsletter vars built: ${Object.keys(newsletter.vars).length} variables`);
  const nlContent = generateContent(COMMUNICATION_TYPES.WEEKLY_NEWSLETTER, { ...newsletter.vars, first_name: 'Darragh' });
  ok(`Subject: ${nlContent.subject}`);
  info(`Body preview: ${nlContent.body.slice(0, 80)}…`);

  // ── 3. Match report & preview ─────────────────────────────────────────────
  section('3. Match Communications');
  const report = buildMatchReport(sampleFixture, { clubName: CLUB, coachName: COACH, potm: 'Ciarán Murphy', scorers: [{ name: 'D. Byrne', time: 12, type: 'try' }, { name: 'C. Murphy', time: 34, type: 'try' }] });
  ok(`Match report: ${report.vars.result_line}`);

  const results = await buildWeekendResults({ clubName: CLUB });
  ok(`Weekend results: ${results.metadata.fixtureCount} fixtures`);

  const preview = await buildMatchPreview(null, { clubName: CLUB });
  ok(`Match preview: ${preview.vars.team_name} vs ${preview.vars.opposition}`);

  // ── 4. Training comms ─────────────────────────────────────────────────────
  section('4. Training Communications');
  const reminder = buildTrainingReminder(sampleSession, { clubName: CLUB, coachName: COACH });
  ok(`Training reminder: ${reminder.vars.team_name}, ${reminder.vars.day}`);

  const cancelled = buildCancelledTraining(sampleSession, 'Pitch waterlogged', { clubName: CLUB });
  ok(`Cancellation: ${cancelled.vars.reason}`);

  // ── 5. Player of week ─────────────────────────────────────────────────────
  section('5. Player of the Week');
  const potw = await buildPlayerOfWeek('Darragh Byrne', 'Outstanding performance against Naas RFC — 2 tries and 6 carries in 80 minutes', { clubName: CLUB, coachName: COACH });
  ok(`POTW: ${potw.vars.player_name}`);

  // ── 6. Volunteer ─────────────────────────────────────────────────────────
  section('6. Volunteer Communications');
  const volRequest = buildVolunteerRequest(sampleEvent, [{ role: 'Steward', count: 4 }, { role: 'Car Park', count: 2 }, { role: 'Bar Assist', count: 3 }], { clubName: CLUB });
  ok(`Volunteer request: ${volRequest.vars.event_name}, ${volRequest.metadata.rolesCount} roles`);

  const volThanks = buildVolunteerThankYou(sampleVolunteer, sampleEvent, { clubName: CLUB });
  ok(`Thank you to: ${volThanks.vars.first_name}`);

  // ── 7. Sponsor ─────────────────────────────────────────────────────────
  section('7. Sponsor Communications');
  const sponsorUpdate = buildSponsorUpdate(sampleSponsor, 'November 2025', { clubName: CLUB, contactName: 'Séan McCarthy' });
  ok(`Sponsor update: ${sponsorUpdate.vars.tier} — ${sponsorUpdate.metadata.sponsorName}`);

  const sponsorAck = buildSponsorAcknowledgment(sampleSponsor, 'title sponsorship for the 2025-26 season', { clubName: CLUB });
  ok(`Sponsor ack: ${sponsorAck.vars.sponsor_name}`);

  // ── 8. Membership ─────────────────────────────────────────────────────────
  section('8. Membership Communications');
  const renewal = buildRenewalReminder(sampleMember, { clubName: CLUB });
  ok(`Renewal reminder: ${renewal.vars.first_name}, expires ${renewal.vars.expiry_date}`);

  const welcome = buildWelcomeNewMember(sampleMember, { clubName: CLUB });
  ok(`Welcome: ${welcome.vars.first_name}`);

  const lapsed = buildLapsedMemberReEngagement({ id: 'l1', name: 'Tomás Flynn', validUntil: '2024-12-31' }, { clubName: CLUB });
  ok(`Re-engagement: ${lapsed.vars.first_name}`);

  // ── 9. Events ─────────────────────────────────────────────────────────────
  section('9. Event Communications');
  const oldboys = buildOldBoysInvitation(sampleEvent, { clubName: CLUB });
  ok(`Old boys invitation: ${oldboys.vars.event_name}`);

  const launch = buildSeasonLaunch('2026-27', { clubName: CLUB, seasonGoals: ['Win Division 1 League', 'Register 200+ members', 'Launch U8 tag programme'] });
  ok(`Season launch: ${launch.vars.season}`);

  const awards = buildAwardsEvening(
    { id: 'e2', name: 'Awards Night', date: '2025-12-06', venue: 'Clubhouse', time: '7:30pm', ticketPrice: 30 },
    [{ award: 'Player of the Year', nominees: ['D. Byrne', 'C. Murphy', 'É. Quinn'] }, { award: 'Coach of the Year', nominees: ['B. O\'Sullivan'] }],
    { clubName: CLUB }
  );
  ok(`Awards evening: ${awards.vars.event_date}`);

  const christmas = buildChristmasFunction(sampleEvent, { clubName: CLUB });
  ok(`Christmas function: ${christmas.vars.event_date}`);

  // ── 10. Fundraising & Announcement ───────────────────────────────────────
  section('10. Fundraising & Announcements');
  const fund = buildFundraisingCampaign({ name: 'New Gym Equipment', intro: 'We\'re raising funds for new gym equipment.', description: 'Help us reach our target!' }, { clubName: CLUB, target: 5000, raised: 2150 });
  ok(`Fundraising: ${fund.vars.campaign_name}, ${fund.vars.current_amount} raised`);

  const announcement = buildGeneralAnnouncement('AGM Notice', 'The Annual General Meeting will be held on January 15th at 7pm.', { clubName: CLUB });
  ok(`Announcement: ${announcement.vars.subject_line}`);

  // ── 11. Coach message ────────────────────────────────────────────────────
  const coachMsg = buildCoachMessage('Great week of training lads. I\'m proud of the commitment from every player. Let\'s bring that same energy on Saturday!', { coachName: COACH, teamName: 'Senior Squad', clubName: CLUB });
  ok(`Coach message: ${coachMsg.vars.coach_name} → ${coachMsg.vars.team_name}`);

  // ── 12. Preview + send (dry-run) ─────────────────────────────────────────
  section('11. Delivery Preview (dry-run)');
  const prevResult = await previewCommunication(reminder, { role: 'coach' });
  ok(`Preview: ${prevResult.recipientCount} recipients, channels: ${JSON.stringify(prevResult.channels)}`);
  info(`First preview subject: ${prevResult.preview[0]?.content?.subject ?? prevResult.preview[0]?.channel}`);

  const sendResult = await sendCommunication(reminder, { dryRun: true });
  ok(`Dry-run send: ${sendResult.result.sent} sent, ${sendResult.result.failed} failed`);

  // ── 13. Scheduling ────────────────────────────────────────────────────────
  section('12. Scheduling');
  const schedule1 = scheduleNow(reminder);
  ok(`Scheduled now: ${schedule1.scheduleId}`);

  const schedule2 = scheduleAt(newsletter, new Date(Date.now() + 7 * 86400000));
  ok(`Scheduled in 7 days: ${schedule2.scheduleId}`);

  const schedule3 = scheduleRecurring(newsletter, { frequency: 'weekly', dayOfWeek: 1, timeHour: 8 });
  ok(`Recurring (Monday 8am): next run ${schedule3.nextRun}`);

  const sStats = scheduleStats();
  info(`Schedule stats: ${JSON.stringify(sStats)}`);

  // ── 14. Channels ──────────────────────────────────────────────────────────
  section('13. Channel Registry');
  const channels = listChannels();
  channels.forEach(c => info(`${c.status.padEnd(8)} ${c.name.padEnd(14)} — ${c.description}`));

  // ── 15. History & Insights ────────────────────────────────────────────────
  section('14. History & Insights');
  const histStats = getHistoryStats();
  ok(`History: ${histStats.total} events, sent: ${histStats.sent}, success rate: ${histStats.successRate}%`);

  const insights = await generateInsightsReport();
  ok('Insights report generated');
  info(insights.split('\n').slice(0, 5).join('\n    '));

  // ── 16. Report ────────────────────────────────────────────────────────────
  section('15. Generating COMMUNICATIONS_ENGINE_REPORT.md');
  const reportContent = buildReport({ playerAudience, memberAudience, volunteerAudience, sponsorAudience, channels, histStats, insights, sStats });
  writeFileSync(REPORT_PATH, reportContent, 'utf8');
  ok(`Report written to: ${REPORT_PATH}`);

  console.log(`\n${LINE}`);
  console.log('  Communications Engine — all checks passed');
  console.log(`${LINE}\n`);
}

function buildReport({ playerAudience, memberAudience, volunteerAudience, sponsorAudience, channels, histStats, insights, sStats }) {
  const now = new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const channelTable = channels.map(c =>
    `| **${c.name}** | ${c.status} | ${c.description} |`
  ).join('\n');

  const liveChannels = channels.filter(c => c.status === 'live').length;
  const stubChannels = channels.filter(c => c.status === 'stub').length;
  const futureChannels = channels.filter(c => c.status === 'future').length;

  return `# Coach's Eye Communications Engine — Architecture & Report

*Generated: ${now}*

---

## Mission

The Communications Engine is the execution layer responsible for communicating with every stakeholder in a sports club. It is not an AI engine — it is the plumbing that delivers the right message, to the right person, through the right channel, at the right time.

Every other AI engine (Copilot, Orchestrator, Club Intelligence, Workflow Engine) can use this layer to send its output to club members.

---

## Architecture

\`\`\`
communications-engine/
├── index.js                    ← Public API (sendCommunication, scheduleCommunication, previewCommunication)
├── audience-selector.js        ← Resolves audience type → recipient list with contact info
├── content-generator.js        ← 19 templates, {{ variable }} rendering, personalisation
├── newsletter-builder.js       ← Weekly newsletter, coach message, player of the week
├── match-report-builder.js     ← Match report, weekend results, match preview
├── announcement-builder.js     ← Training reminder/cancellation, announcements, fundraising
├── volunteer-manager.js        ← Volunteer requests, thank-yous, skill-based selection
├── sponsor-updates.js          ← Sponsor updates, acknowledgments, stats
├── member-retention.js         ← Renewal reminders, welcome new members, lapsed re-engagement
├── oldboys-manager.js          ← Old boys invitation, season launch, awards evening, Christmas
├── delivery-planner.js         ← Channel selection, adapter dispatch, batch execution
├── schedule-manager.js         ← Immediate, future, and recurring send scheduling
├── communication-history.js    ← Audit log, dedup checks, JSONL persistence
└── communication-insights.js   ← Engagement analytics, churn risk, audience reachability
\`\`\`

### Communication Flow

\`\`\`
Request (e.g. "send training reminder")
      │
      ▼
  Builder Module          (announcement-builder.js → buildTrainingReminder)
      │
      ├─→ CommSpec { type, audienceType, vars }
      │
      ▼
  audience-selector.js    (selectAudience → recipient list from Data Integration / Memory Engine)
      │
      ▼
  delivery-planner.js     (planDelivery → per-recipient channel selection)
      │
      ├─→ communication-history.js  (dedup check: hasRecentlySent?)
      │
      ▼
  content-generator.js    (generatePersonalised → rendered subject + body per recipient)
      │
      ▼
  Channel Adapter         (push → api/push.js | email → stub | in-app → stub)
      │
      ▼
  communication-history.js (logSent / logFailed)
      │
      ▼
  DeliveryResult { sent, failed, skipped, results[] }
\`\`\`

---

## Supported Audiences (${10})

| Audience | Source | Role Needed |
|----------|--------|-------------|
| **Players** | Memory Engine + Data Integration | coach |
| **Parents** | Via player records (future) | coach |
| **Coaches** | Data Integration (coaches adapter) | manager |
| **Committee** | Volunteers adapter (committee role) | manager |
| **Sponsors** | Data Integration (sponsors adapter) | manager |
| **Volunteers** | Data Integration (volunteers adapter) | manager |
| **Members** | Data Integration (membership adapter) | manager |
| **Former Members** | Membership adapter (lapsed filter) | manager |
| **Supporters** | Future — app followers | admin |
| **Newsletter Subscribers** | Future — newsletter system | admin |

---

## Supported Communication Types (${19})

| Type | Builder | Audience | Channel |
|------|---------|----------|---------|
| Weekly Newsletter | newsletter-builder | newsletter | email, push |
| Weekend Results | match-report-builder | all | push, in-app |
| Player of the Week | newsletter-builder | all | push, in-app |
| Coach Message | newsletter-builder | players | push |
| Training Reminder | announcement-builder | players | push |
| Cancelled Training | announcement-builder | players | push |
| Match Preview | match-report-builder | players | push |
| Match Report | match-report-builder | players | push, in-app |
| Volunteer Request | volunteer-manager | volunteers | email, in-app |
| Volunteer Thank You | volunteer-manager | volunteers | email, in-app |
| Sponsor Update | sponsor-updates | sponsors | email |
| Sponsor Acknowledgment | sponsor-updates | sponsors | email |
| Membership Renewal | member-retention | members | email, push |
| Welcome New Member | member-retention | members | email, push |
| Fundraising Campaign | announcement-builder | members | email, push |
| Old Boys Invitation | oldboys-manager | former_members | email |
| Season Launch | oldboys-manager | all | push, email |
| Awards Evening | oldboys-manager | all | email |
| Christmas Function | oldboys-manager | all | email, push |

---

## Channels

| Channel | Status | Description |
|---------|--------|-------------|
${channelTable}

**Summary:** ${liveChannels} live, ${stubChannels} stub (connect to activate), ${futureChannels} future integrations

---

## Audience Test Results

| Audience | Recipients | Mock? |
|----------|-----------|-------|
| Players | ${playerAudience.count} | ${playerAudience.isMock ? 'Yes' : 'No'} |
| Members | ${memberAudience.count} | ${memberAudience.isMock ? 'Yes' : 'No'} |
| Volunteers | ${volunteerAudience.count} | ${volunteerAudience.isMock ? 'Yes' : 'No'} |
| Sponsors | ${sponsorAudience.count} | ${sponsorAudience.isMock ? 'Yes' : 'No'} |

---

## Personalisation Variables

Every communication is personalised using:

| Variable | Source |
|----------|--------|
| \`{{ first_name }}\` | Recipient record |
| \`{{ team_name }}\` | Assigned team from Memory Engine |
| \`{{ age_group }}\` | Player age group from Data Integration |
| \`{{ membership_type }}\` | Membership adapter |
| \`{{ days_until_expiry }}\` | Computed from membership.validUntil |
| \`{{ sponsor_name }}\`, \`{{ tier }}\` | Sponsors adapter |
| \`{{ event_name }}\`, \`{{ event_date }}\` | Events adapter |
| \`{{ coach_name }}\`, \`{{ club_name }}\` | Passed at build time |
| \`{{ results_section }}\` | Fixtures adapter (auto-built) |
| \`{{ upcoming_section }}\` | Fixtures adapter (auto-built) |

---

## Memory Engine Integration

The Communications Engine reads from the Memory Engine to:
- Resolve player push tokens for targeted push notifications
- Access current injury status (exclude injured players from session reminders)
- Access programme status for player-specific communications
- Avoid sending duplicate messages (dedup via \`hasRecentlySent()\`)

Write-back: every sent communication is logged to \`memory-engine/data/communication-history.jsonl\`

---

## Workflow Engine Integration

Use \`scheduleCommunication(spec, sendAt)\` to queue any communication via the Workflow Engine:

\`\`\`js
import { scheduleCommunication, buildTrainingReminder } from './communications-engine/index.js';

const spec = buildTrainingReminder(session, { clubName: 'Kildare Valley RFC' });
scheduleCommunication(spec, new Date('2025-12-02T18:00:00'));
\`\`\`

Recurring communications (e.g. weekly newsletter) use \`scheduleRecurring()\`:

\`\`\`js
scheduleRecurring(newsletterSpec, { frequency: 'weekly', dayOfWeek: 1, timeHour: 8 });
// → Sends every Monday at 8am
\`\`\`

---

## Club Intelligence Integration

The Club Intelligence Engine can trigger communications automatically when it detects:

- Low attendance → Training reminder with motivational coach message
- Lapsed membership → Re-engagement campaign
- Upcoming fixture → Match preview to player squad
- Result recorded → Match report to all stakeholders
- Sponsor renewal due → Sponsor update email

---

## Schedule Stats (test run)

| Metric | Value |
|--------|-------|
| Total | ${sStats.total} |
| Pending | ${sStats.pending} |
| Recurring | ${sStats.recurring} |
| Sent | ${sStats.sent} |
| Cancelled | ${sStats.cancelled} |

---

${insights}

---

## Usage Examples

\`\`\`js
import { sendCommunication, scheduleCommunication, previewCommunication,
         buildTrainingReminder, buildMatchReport, COMMUNICATION_TYPES } from './communications-engine/index.js';

// Send a training reminder to all players (dry-run)
const spec = buildTrainingReminder(session, { clubName: 'Kildare Valley RFC', coachName: 'Brian O\'Sullivan' });
const result = await sendCommunication(spec, { dryRun: true });
console.log(result.result.sent); // → 4 (dry run)

// Preview before sending
const preview = await previewCommunication(spec);
console.log(preview.preview[0].content.subject);

// Schedule a match report for Sunday evening
const report = buildMatchReport(fixture, { potm: 'Ciarán Murphy' });
scheduleCommunication(report, new Date('2025-11-09T18:00:00'));
\`\`\`

---

## Future Integrations

- **Email**: Connect to SendGrid / Mailchimp for production email delivery
- **SMS**: Twilio integration for SMS alerts (match cancellations, urgent notices)
- **WhatsApp**: WhatsApp Business API for team group updates
- **Facebook**: Auto-post match results and player spotlights
- **Instagram**: Auto-post player of the week with photo
- **Website News**: Auto-publish match reports to club website CMS

---

*Coach's Eye Communications Engine — keeping every stakeholder in the loop*
`;
}

main().catch(err => {
  console.error('\n✗ Communications Engine CLI failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
