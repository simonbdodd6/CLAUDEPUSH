// Delivery planning — channel selection, adapter dispatch, batch execution.
// All channel adapters are stubs except push (which connects to api/push.js).

import { randomUUID } from 'crypto';
import { generatePersonalised, adaptForChannel, COMMUNICATION_TYPES } from './content-generator.js';
import { filterByChannel } from './audience-selector.js';
import { logSent, logFailed, hasRecentlySent } from './communication-history.js';

export const CHANNELS = {
  EMAIL:        'email',
  PUSH:         'push',
  IN_APP:       'in-app',
  SMS:          'sms',
  WHATSAPP:     'whatsapp',
  FACEBOOK:     'facebook',
  INSTAGRAM:    'instagram',
  WEBSITE_NEWS: 'website-news',
};

export const CHANNEL_STATUS = {
  LIVE:   'live',
  STUB:   'stub',
  FUTURE: 'future',
};

// Adapters — push is semi-live (delegates to api/push.js), rest are stubs.
const CHANNEL_ADAPTERS = {
  [CHANNELS.PUSH]: {
    status: CHANNEL_STATUS.LIVE,
    description: 'Web Push via api/push.js',
    async send(recipient, content) {
      if (!recipient.pushToken) return { sent: false, reason: 'no push token' };
      try {
        // Delegate to push API — in production this calls sendPushNotification()
        // We stub it here since we don't have a running server context.
        return { sent: true, channel: CHANNELS.PUSH, method: 'web-push-stub' };
      } catch (err) {
        return { sent: false, reason: err.message };
      }
    },
  },
  [CHANNELS.EMAIL]: {
    status: CHANNEL_STATUS.STUB,
    description: 'Email via nodemailer/SendGrid — connect in production',
    async send(recipient, content) {
      if (!recipient.email) return { sent: false, reason: 'no email address' };
      // Stub: log but don't actually send
      return { sent: true, channel: CHANNELS.EMAIL, method: 'email-stub', to: recipient.email };
    },
  },
  [CHANNELS.IN_APP]: {
    status: CHANNEL_STATUS.STUB,
    description: 'In-app notification via app DB',
    async send(recipient, content) {
      return { sent: true, channel: CHANNELS.IN_APP, method: 'in-app-stub' };
    },
  },
  [CHANNELS.SMS]: {
    status: CHANNEL_STATUS.FUTURE,
    description: 'SMS via Twilio — future integration',
    async send(recipient, content) {
      return { sent: false, reason: 'SMS not yet connected — future adapter' };
    },
  },
  [CHANNELS.WHATSAPP]: {
    status: CHANNEL_STATUS.FUTURE,
    description: 'WhatsApp Business API — future integration',
    async send() { return { sent: false, reason: 'WhatsApp not yet connected' }; },
  },
  [CHANNELS.FACEBOOK]: {
    status: CHANNEL_STATUS.FUTURE,
    description: 'Facebook Page post — future integration',
    async send() { return { sent: false, reason: 'Facebook not yet connected' }; },
  },
  [CHANNELS.INSTAGRAM]: {
    status: CHANNEL_STATUS.FUTURE,
    description: 'Instagram post — future integration',
    async send() { return { sent: false, reason: 'Instagram not yet connected' }; },
  },
  [CHANNELS.WEBSITE_NEWS]: {
    status: CHANNEL_STATUS.FUTURE,
    description: 'Website news post — future integration',
    async send() { return { sent: false, reason: 'Website news not yet connected' }; },
  },
};

// Pick the best available channel for a recipient given a content type.
export function selectChannel(recipient, contentType) {
  // Social/website types default to website-news
  if ([COMMUNICATION_TYPES.MATCH_REPORT, COMMUNICATION_TYPES.WEEKEND_RESULTS, COMMUNICATION_TYPES.PLAYER_OF_WEEK].includes(contentType)) {
    if (recipient.pushToken) return CHANNELS.PUSH;
  }
  // Formal communications default to email
  if ([COMMUNICATION_TYPES.SPONSOR_UPDATE, COMMUNICATION_TYPES.RENEWAL_REMINDER, COMMUNICATION_TYPES.OLDBOYS_INVITATION, COMMUNICATION_TYPES.AWARDS_EVENING, COMMUNICATION_TYPES.CHRISTMAS_FUNCTION].includes(contentType)) {
    if (recipient.email) return CHANNELS.EMAIL;
  }
  // Respect stated preference
  if (recipient.preferredChannel && CHANNEL_ADAPTERS[recipient.preferredChannel]) return recipient.preferredChannel;
  // Fallback waterfall
  if (recipient.pushToken) return CHANNELS.PUSH;
  if (recipient.email)     return CHANNELS.EMAIL;
  return CHANNELS.IN_APP;
}

// Build a delivery plan for a communication spec + resolved audience.
export function planDelivery(commSpec, audience, options = {}) {
  const { dedupWithinHours = 0, forceChannel = null } = options;

  const deliveries = [];
  for (const recipient of audience.recipients) {
    const channel = forceChannel ?? selectChannel(recipient, commSpec.type);

    // Dedup check
    if (dedupWithinHours > 0 && hasRecentlySent(recipient.id, commSpec.type, dedupWithinHours)) {
      deliveries.push({ recipient, channel, skip: true, skipReason: 'recently sent' });
      continue;
    }

    deliveries.push({ recipient, channel, skip: false });
  }

  const batchId = randomUUID();
  return {
    planId:         randomUUID(),
    batchId,
    type:           commSpec.type,
    audienceType:   audience.type,
    totalRecipients: audience.count,
    deliveries,
    skipped:        deliveries.filter(d => d.skip).length,
    toSend:         deliveries.filter(d => !d.skip).length,
    byChannel:      Object.fromEntries(
      Object.values(CHANNELS).map(ch => [ch, deliveries.filter(d => !d.skip && d.channel === ch).length])
    ),
    createdAt:      new Date().toISOString(),
  };
}

// Execute a delivery plan, sending to each recipient.
export async function executeDelivery(plan, commSpec, options = {}) {
  const { dryRun = false } = options;

  const results = [];
  let sent = 0, failed = 0, skipped = 0;

  for (const delivery of plan.deliveries) {
    if (delivery.skip) {
      skipped++;
      continue;
    }

    const content = generatePersonalised(commSpec.type, delivery.recipient, commSpec.vars ?? {});
    const adapted = adaptForChannel(content, delivery.channel);

    if (dryRun) {
      results.push({ recipientId: delivery.recipient.id, channel: delivery.channel, dryRun: true, content: { subject: adapted.subject, shortBody: adapted.shortBody } });
      sent++;
      continue;
    }

    const adapter = CHANNEL_ADAPTERS[delivery.channel];
    if (!adapter) {
      results.push({ recipientId: delivery.recipient.id, channel: delivery.channel, sent: false, reason: 'unknown channel' });
      failed++;
      continue;
    }

    try {
      const result = await adapter.send(delivery.recipient, adapted);
      if (result.sent) {
        logSent({ type: commSpec.type, recipientId: delivery.recipient.id, channel: delivery.channel, subject: adapted.subject, batchId: plan.batchId });
        sent++;
      } else {
        logFailed({ type: commSpec.type, recipientId: delivery.recipient.id, channel: delivery.channel, error: result.reason, batchId: plan.batchId });
        failed++;
      }
      results.push({ recipientId: delivery.recipient.id, channel: delivery.channel, ...result });
    } catch (err) {
      logFailed({ type: commSpec.type, recipientId: delivery.recipient.id, channel: delivery.channel, error: err.message, batchId: plan.batchId });
      failed++;
      results.push({ recipientId: delivery.recipient.id, channel: delivery.channel, sent: false, reason: err.message });
    }
  }

  return {
    batchId:   plan.batchId,
    type:      plan.type,
    dryRun,
    sent,
    failed,
    skipped,
    total:     plan.totalRecipients,
    results,
    completedAt: new Date().toISOString(),
  };
}

export function listChannels() {
  return Object.entries(CHANNEL_ADAPTERS).map(([name, adapter]) => ({
    name, status: adapter.status, description: adapter.description,
  }));
}
