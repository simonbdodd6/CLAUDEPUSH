# Coach's Eye Communications Engine — Architecture & Report

*Generated: Tuesday 9 June 2026*

---

## Mission

The Communications Engine is the execution layer responsible for communicating with every stakeholder in a sports club. It is not an AI engine — it is the plumbing that delivers the right message, to the right person, through the right channel, at the right time.

Every other AI engine (Copilot, Orchestrator, Club Intelligence, Workflow Engine) can use this layer to send its output to club members.

---

## Architecture

```
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
```

### Communication Flow

```
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
```

---

## Supported Audiences (10)

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

## Supported Communication Types (19)

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
| **push** | live | Web Push via api/push.js |
| **email** | stub | Email via nodemailer/SendGrid — connect in production |
| **in-app** | stub | In-app notification via app DB |
| **sms** | future | SMS via Twilio — future integration |
| **whatsapp** | future | WhatsApp Business API — future integration |
| **facebook** | future | Facebook Page post — future integration |
| **instagram** | future | Instagram post — future integration |
| **website-news** | future | Website news post — future integration |

**Summary:** 1 live, 2 stub (connect to activate), 5 future integrations

---

## Audience Test Results

| Audience | Recipients | Mock? |
|----------|-----------|-------|
| Players | 1 | Yes |
| Members | 4 | Yes |
| Volunteers | 4 | Yes |
| Sponsors | 4 | Yes |

---

## Personalisation Variables

Every communication is personalised using:

| Variable | Source |
|----------|--------|
| `{{ first_name }}` | Recipient record |
| `{{ team_name }}` | Assigned team from Memory Engine |
| `{{ age_group }}` | Player age group from Data Integration |
| `{{ membership_type }}` | Membership adapter |
| `{{ days_until_expiry }}` | Computed from membership.validUntil |
| `{{ sponsor_name }}`, `{{ tier }}` | Sponsors adapter |
| `{{ event_name }}`, `{{ event_date }}` | Events adapter |
| `{{ coach_name }}`, `{{ club_name }}` | Passed at build time |
| `{{ results_section }}` | Fixtures adapter (auto-built) |
| `{{ upcoming_section }}` | Fixtures adapter (auto-built) |

---

## Memory Engine Integration

The Communications Engine reads from the Memory Engine to:
- Resolve player push tokens for targeted push notifications
- Access current injury status (exclude injured players from session reminders)
- Access programme status for player-specific communications
- Avoid sending duplicate messages (dedup via `hasRecentlySent()`)

Write-back: every sent communication is logged to `memory-engine/data/communication-history.jsonl`

---

## Workflow Engine Integration

Use `scheduleCommunication(spec, sendAt)` to queue any communication via the Workflow Engine:

```js
import { scheduleCommunication, buildTrainingReminder } from './communications-engine/index.js';

const spec = buildTrainingReminder(session, { clubName: 'Kildare Valley RFC' });
scheduleCommunication(spec, new Date('2025-12-02T18:00:00'));
```

Recurring communications (e.g. weekly newsletter) use `scheduleRecurring()`:

```js
scheduleRecurring(newsletterSpec, { frequency: 'weekly', dayOfWeek: 1, timeHour: 8 });
// → Sends every Monday at 8am
```

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
| Total | 3 |
| Pending | 3 |
| Recurring | 1 |
| Sent | 0 |
| Cancelled | 0 |

---

## Communications Insights

### Volume
- Total: 3, Sent: 0, Failed: 0, Scheduled: 3
- Success rate: 0%

### Top Communication Types
• weekly_newsletter: 2 sent
• training_reminder: 1 sent

### Channel Breakdown
• null: 3 messages

### Audience Reachability
• No audience data

### Churn Risk
- Lapsed members: undefined
- Low-attendance players (< 50%): undefined


---

## Usage Examples

```js
import { sendCommunication, scheduleCommunication, previewCommunication,
         buildTrainingReminder, buildMatchReport, COMMUNICATION_TYPES } from './communications-engine/index.js';

// Send a training reminder to all players (dry-run)
const spec = buildTrainingReminder(session, { clubName: 'Kildare Valley RFC', coachName: 'Brian O'Sullivan' });
const result = await sendCommunication(spec, { dryRun: true });
console.log(result.result.sent); // → 4 (dry run)

// Preview before sending
const preview = await previewCommunication(spec);
console.log(preview.preview[0].content.subject);

// Schedule a match report for Sunday evening
const report = buildMatchReport(fixture, { potm: 'Ciarán Murphy' });
scheduleCommunication(report, new Date('2025-11-09T18:00:00'));
```

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
