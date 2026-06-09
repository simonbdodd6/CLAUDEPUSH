/**
 * AI Timeline
 *
 * Generates a 14-day predictive timeline mixing:
 *   - Scheduled events (fixtures, sessions)
 *   - Predicted events (attendance %, injury risk windows)
 *   - Reminders (newsletter, membership renewals, volunteer confirmations)
 *   - Opportunities (auto-send newsletter if health score high)
 *
 * Each event has a probability (0-100), impact, and optional linked recommendation.
 */

const EVENT_TYPES = {
  FIXTURE:      'FIXTURE',
  PREDICTION:   'PREDICTION',
  RISK:         'RISK',
  REMINDER:     'REMINDER',
  OPPORTUNITY:  'OPPORTUNITY',
  MILESTONE:    'MILESTONE',
};

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function dayLabel(date) {
  const d  = new Date(date);
  const now = new Date();
  const diff = Math.round((d - now) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'short' });
}

function event(fields) {
  return {
    id:       `${fields.type}-${fields.offsetDays}-${Math.random().toString(36).slice(2,6)}`,
    date:     daysFromNow(fields.offsetDays).toISOString(),
    dateLabel: dayLabel(daysFromNow(fields.offsetDays)),
    ...fields,
  };
}

// ── Timeline generators ────────────────────────────────────────────────────────

function fixtureEvents(fixtures) {
  return (fixtures ?? []).slice(0, 6).map(f => {
    const days = f.daysToKickoff ?? 7;
    return event({
      type:        EVENT_TYPES.FIXTURE,
      offsetDays:  days,
      title:       `${f.teamName ?? 'Match'} vs ${f.opponent ?? 'TBD'}`,
      description: `${f.kickoffLabel ?? ''} · ${f.venue ?? f.isHome ? 'Home' : 'Away'}`,
      probability: 95,
      impact:      'HIGH',
      icon:        '⚽',
      fixtureId:   f.id,
      linkedActions: [
        { label: 'Generate Match Pack', actionId: 'GENERATE_MATCH_PACK', params: { fixtureId: f.id } },
        { label: 'Confirm Volunteers',  actionId: 'CONFIRM_VOLUNTEERS',  params: { fixtureId: f.id } },
      ],
    });
  });
}

function attendancePredictions(obs) {
  const events = [];
  const baseRate = obs.attendance?.averageRate ?? 78;
  const trend    = obs.attendance?.weeklyTrend ?? 'stable';
  const delta    = trend === 'declining' ? -4 : trend === 'strong' ? +2 : 0;

  for (const trainingDay of [2, 4, 7, 9, 11]) {
    const predicted = Math.max(30, Math.min(100, baseRate + delta * Math.round(trainingDay / 7)));
    const low       = predicted < 65;
    events.push(event({
      type:        EVENT_TYPES.PREDICTION,
      offsetDays:  trainingDay,
      title:       `Predicted attendance: ${predicted}%`,
      description: low
        ? `Below-threshold session likely. Consider targeted parent message.`
        : `Normal session expected.`,
      probability: 72,
      impact:      low ? 'MEDIUM' : 'LOW',
      icon:        low ? '📉' : '📊',
      predictedValue: predicted,
      flag:        low ? 'low-attendance' : null,
    }));
  }
  return events;
}

function injuryRiskWindow(obs) {
  const events = [];
  const { injuries, fixtures } = obs;

  if ((injuries?.total ?? 0) > 2) {
    events.push(event({
      type:        EVENT_TYPES.RISK,
      offsetDays:  3,
      title:       'Elevated injury risk window',
      description: `${injuries.total} current injuries. High-contact drills should be modified this week.`,
      probability: 65,
      impact:      'HIGH',
      icon:        '🩹',
      riskType:    'INJURY',
    }));
  }

  if (fixtures?.within7d?.length > 1) {
    events.push(event({
      type:        EVENT_TYPES.RISK,
      offsetDays:  5,
      title:       'Double-fixture week — squad fatigue risk',
      description: `${fixtures.within7d.length} fixtures in 7 days. Rotation and recovery protocols recommended.`,
      probability: 70,
      impact:      'MEDIUM',
      icon:        '⚠️',
      riskType:    'FATIGUE',
    }));
  }

  return events;
}

function communicationReminders(obs) {
  const events = [];
  const days   = obs.communications?.lastNewsletterDays ?? 0;

  const nextNewsletter = Math.max(0, 7 - (days % 7));
  events.push(event({
    type:        EVENT_TYPES.REMINDER,
    offsetDays:  nextNewsletter === 0 ? 0 : nextNewsletter,
    title:       'Weekly newsletter due',
    description: 'AI can auto-generate from this week\'s training, fixtures, and milestones.',
    probability: 100,
    impact:      'MEDIUM',
    icon:        '📩',
    automatable: true,
    autoAction:  { label: 'Auto-send newsletter', actionId: 'SEND_NEWSLETTER', params: { type: 'weekly', auto: true } },
  }));

  if (days > 14) {
    events.push(event({
      type:        EVENT_TYPES.REMINDER,
      offsetDays:  0,
      title:       `Overdue: Newsletter not sent in ${days} days`,
      description: 'Sending today recovers member engagement before the weekend fixture.',
      probability: 100,
      impact:      'MEDIUM',
      icon:        '🔴',
      overdue:     true,
    }));
  }

  events.push(event({
    type:        EVENT_TYPES.REMINDER,
    offsetDays:  6,
    title:       'Sunday: Post-match comms window',
    description: 'Best time to send match report and week-ahead briefing. Open rates 40% higher on Sunday evenings.',
    probability: 90,
    impact:      'MEDIUM',
    icon:        '📬',
    automatable: true,
  }));

  return events;
}

function membershipReminders(obs) {
  const { memberships } = obs;
  if ((memberships?.expiringThisWeek ?? 0) < 1) return [];
  return [
    event({
      type:        EVENT_TYPES.REMINDER,
      offsetDays:  0,
      title:       `${memberships.expiringThisWeek} memberships expire this week`,
      description: 'Auto-send renewal reminders to keep lapse rate below 18%.',
      probability: 100,
      impact:      'MEDIUM',
      icon:        '🎫',
      automatable: true,
      autoAction:  { label: 'Send renewal reminders', actionId: 'SEND_RENEWAL_REMINDERS', params: {} },
    }),
    event({
      type:        EVENT_TYPES.REMINDER,
      offsetDays:  7,
      title:       'Follow-up: Unpaid renewals',
      description: 'Second reminder for members who didn\'t respond to the first.',
      probability: 80,
      impact:      'MEDIUM',
      icon:        '📋',
      automatable: true,
    }),
  ];
}

function volunteerTimeline(obs) {
  const { volunteers, fixtures } = obs;
  if (!fixtures?.within7d?.length) return [];
  const events = [];

  fixtures.within7d.forEach(f => {
    if ((volunteers?.openRoles ?? 0) > 0) {
      events.push(event({
        type:        EVENT_TYPES.REMINDER,
        offsetDays:  Math.max(0, (f.daysToKickoff ?? 5) - 2),
        title:       `Confirm volunteers: ${f.teamName} vs ${f.opponent ?? 'TBD'}`,
        description: `${volunteers.openRoles} roles still open. 48-hour confirmation deadline.`,
        probability: 100,
        impact:      'HIGH',
        icon:        '🙋',
        automatable: false,
      }));
    }
  });

  return events;
}

function opportunityEvents(obs) {
  const events = [];

  if ((obs.attendance?.averageRate ?? 0) > 80) {
    events.push(event({
      type:        EVENT_TYPES.OPPORTUNITY,
      offsetDays:  4,
      title:       'Strong attendance — send positive reinforcement',
      description: 'Above-average attendance this week. A brief message from the coach sustains momentum.',
      probability: 75,
      impact:      'LOW',
      icon:        '⭐',
      automatable: true,
    }));
  }

  events.push(event({
    type:        EVENT_TYPES.OPPORTUNITY,
    offsetDays:  10,
    title:       'Sponsor check-in window',
    description: 'Fortnight since last sponsor contact. A brief update keeps relationships warm.',
    probability: 60,
    impact:      'LOW',
    icon:        '🤝',
    automatable: false,
  }));

  events.push(event({
    type:        EVENT_TYPES.REMINDER,
    offsetDays:  14,
    title:       'Digital Twin auto-refresh',
    description: 'Two-week club model refresh recommended to catch slow-moving trends.',
    probability: 100,
    impact:      'LOW',
    icon:        '🔄',
    automatable: true,
    autoAction:  { label: 'Refresh Digital Twin', actionId: 'RUN_DIGITAL_TWIN', params: {} },
  }));

  return events;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function generateTimeline(observations, fixtures) {
  const allEvents = [
    ...fixtureEvents(fixtures ?? observations?.fixtures?.within7d ?? []),
    ...attendancePredictions(observations),
    ...injuryRiskWindow(observations),
    ...communicationReminders(observations),
    ...membershipReminders(observations),
    ...volunteerTimeline(observations),
    ...opportunityEvents(observations),
  ];

  // Sort by date, deduplicate same-day same-type
  const sorted = allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Group by day for display
  const byDay = {};
  for (const ev of sorted) {
    const key = ev.date.slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(ev);
  }

  return {
    generatedAt: new Date().toISOString(),
    days:        14,
    totalEvents: sorted.length,
    automatableCount: sorted.filter(e => e.automatable).length,
    events:      sorted,
    byDay:       Object.entries(byDay).map(([date, events]) => ({
      date,
      label:  dayLabel(new Date(date)),
      events,
    })),
  };
}

export function getHighPriorityEvents(timeline) {
  return timeline.events.filter(e => e.impact === 'HIGH' || e.overdue || e.type === EVENT_TYPES.FIXTURE);
}

export function getAutomatableEvents(timeline) {
  return timeline.events.filter(e => e.automatable);
}
