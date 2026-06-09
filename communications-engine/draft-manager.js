// Human approval safety layer — every outgoing communication starts as a draft.
// Nothing sends without explicit human review.

import { randomUUID } from 'crypto';
import { audienceSummary, filterByChannel } from './audience-selector.js';
import { selectChannel } from './delivery-planner.js';
import { generatePersonalised, adaptForChannel } from './content-generator.js';

export const DRAFT_STATUS = {
  DRAFT:     'draft',
  APPROVED:  'approved',
  REJECTED:  'rejected',
  SENT:      'sent',
  SCHEDULED: 'scheduled',
};

export const RISK_LEVEL = {
  LOW:    'low',    // internal squad reminders, coach messages
  MEDIUM: 'medium', // squad-wide sends, volunteer requests
  HIGH:   'high',   // external stakeholders, mass sends, financial content
};

const SENSITIVITY_RISK = {
  public:       RISK_LEVEL.LOW,
  internal:     RISK_LEVEL.LOW,
  restricted:   RISK_LEVEL.MEDIUM,
  confidential: RISK_LEVEL.HIGH,
};

const EXTERNAL_AUDIENCES = new Set(['sponsors', 'former_members', 'newsletter_subscribers', 'supporters']);
const LARGE_AUDIENCE_THRESHOLD = 20;

function assessRiskLevel(commSpec, audience) {
  if (EXTERNAL_AUDIENCES.has(audience.type)) return RISK_LEVEL.HIGH;
  if ((audience.count ?? 0) >= LARGE_AUDIENCE_THRESHOLD) return RISK_LEVEL.HIGH;
  if (['sponsors', 'committee'].includes(audience.type)) return RISK_LEVEL.HIGH;
  if (['volunteer_request', 'renewal_reminder', 'fundraising', 'awards_evening', 'christmas_function', 'season_launch', 'oldboys_invitation'].includes(commSpec.type)) return RISK_LEVEL.MEDIUM;
  return RISK_LEVEL.LOW;
}

function buildRiskNotes(commSpec, audience) {
  const notes = [];
  if (audience.isMock) notes.push('Data is mock — verify recipient list before sending in production');
  if (EXTERNAL_AUDIENCES.has(audience.type)) notes.push('External stakeholders — review content carefully for tone and accuracy');
  if ((audience.count ?? 0) >= LARGE_AUDIENCE_THRESHOLD) notes.push(`Large audience (${audience.count} recipients) — consider segmenting before send`);
  if (['renewal_reminder', 'fundraising'].includes(commSpec.type)) notes.push('Contains financial information — verify all amounts and links');
  if (commSpec.type === 'sponsor_update') notes.push('Sponsor communication — ensure club stats are accurate and up to date');
  if (['christmas_function', 'awards_evening', 'season_launch'].includes(commSpec.type)) notes.push('Event communication — confirm venue, date, and time with committee before sending');
  if (!notes.length) notes.push('Low-risk communication — standard review recommended');
  return notes;
}

function buildSendChecklist(commSpec, audience) {
  const base = [
    '[ ] Review recipient list for accuracy',
    '[ ] Check for spelling and grammar errors',
    '[ ] Verify club name, date, and contact details',
    '[ ] Confirm communication has been approved by appropriate party',
  ];

  const extra = [];
  if (audience.isMock) extra.push('[ ] ⚠️  Replace mock data with real recipient data before sending');
  if (EXTERNAL_AUDIENCES.has(audience.type)) extra.push('[ ] Get committee approval before sending to external stakeholders');
  if (['renewal_reminder', 'fundraising'].includes(commSpec.type)) extra.push('[ ] Verify all payment links and financial figures are correct');
  if (['awards_evening', 'christmas_function', 'season_launch'].includes(commSpec.type)) extra.push('[ ] Confirm event details with organiser (venue, time, tickets)');
  if (commSpec.type === 'volunteer_request') extra.push('[ ] Confirm roles and responsibilities with event organiser');
  if (commSpec.type === 'match_report') extra.push('[ ] Confirm score, scorers, and POTM with match secretary');

  extra.push('[ ] Set correct scheduled send time');
  extra.push('[ ] Verify no duplicate communications sent recently');

  return [...base, ...extra];
}

// Wrap a commSpec + audience into a human-approvable draft.
export function createDraft(commSpec, audience, options = {}) {
  const { scheduledFor = null, preferredChannel = null } = options;

  // Generate a sample content preview using first recipient (or base vars)
  const sampleRecipient = audience.recipients?.[0] ?? { firstName: 'Member', id: 'preview', preferredChannel: 'email' };
  const channel = preferredChannel ?? sampleRecipient.preferredChannel ?? 'in-app';
  const content = generatePersonalised(commSpec.type, sampleRecipient, commSpec.vars ?? {});

  const riskLevel = assessRiskLevel(commSpec, audience);

  return {
    draftId:              randomUUID(),
    type:                 commSpec.type,
    status:               DRAFT_STATUS.DRAFT,
    requiresHumanApproval: true,
    approvedBy:           null,
    approvedAt:           null,

    // Audience
    audienceType:    audience.type,
    audienceSummary: audienceSummary(audience),
    recipientCount:  audience.count,
    isMock:          audience.isMock,

    // Content preview
    content: {
      subject:   content.subject,
      body:      content.body,
      shortBody: content.shortBody,
    },
    channel,
    vars:    commSpec.vars ?? {},

    // Risk
    riskLevel,
    riskNotes:     buildRiskNotes(commSpec, audience),
    sendChecklist: buildSendChecklist(commSpec, audience),

    // Scheduling
    scheduledFor,

    createdAt: new Date().toISOString(),
  };
}

export function approveDraft(draft, approver) {
  return { ...draft, status: DRAFT_STATUS.APPROVED, approvedBy: approver, approvedAt: new Date().toISOString() };
}

export function rejectDraft(draft, reason) {
  return { ...draft, status: DRAFT_STATUS.REJECTED, rejectionReason: reason, rejectedAt: new Date().toISOString() };
}

// Render a draft as a human-readable markdown card.
export function formatDraftCard(draft) {
  const riskIcon = draft.riskLevel === RISK_LEVEL.HIGH ? '🔴' : draft.riskLevel === RISK_LEVEL.MEDIUM ? '🟡' : '🟢';
  const mockBadge = draft.isMock ? ' ⚠️ MOCK DATA' : '';

  return `### ${draft.type.replace(/_/g, ' ').toUpperCase()} — ${draft.status.toUpperCase()}${mockBadge}

**Draft ID:** \`${draft.draftId}\`
**Audience:** ${draft.audienceSummary}
**Channel:** ${draft.channel}
**Risk:** ${riskIcon} ${draft.riskLevel.toUpperCase()}
**Scheduled:** ${draft.scheduledFor ?? 'Not scheduled'}
**Requires Approval:** ${draft.requiresHumanApproval ? 'Yes' : 'No'}

**Subject:** ${draft.content.subject}

**Preview:**
${draft.content.body.split('\n').slice(0, 8).join('\n')}${draft.content.body.split('\n').length > 8 ? '\n…' : ''}

**Risk Notes:**
${draft.riskNotes.map(n => `- ${n}`).join('\n')}

**Send Checklist:**
${draft.sendChecklist.join('\n')}

---`;
}
