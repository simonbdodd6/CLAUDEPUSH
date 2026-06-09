// Today's Agenda — chronological view of everything happening today and tomorrow.

import { fetchUpcomingSessions, fetchUpcomingFixtures, fetchAttendanceSummary } from '../adapters/memory-adapter.js';
import { fetchPendingWorkflows } from '../adapters/workflow-adapter.js';
import { getPending } from '../approval-centre/approval-queue.js';

const CATEGORY_ICONS = {
  training:   '🏉',
  fixture:    '🏆',
  approval:   '📬',
  workflow:   '⚙️',
  reminder:   '🔔',
  media:      '📸',
  meeting:    '🤝',
};

function toAgendaItem(item) {
  const icon = CATEGORY_ICONS[item.category] ?? '•';
  return { icon, ...item };
}

function sortByTime(a, b) {
  const ta = a.time ? a.time.localeCompare(b.time ?? '99:99') : 1;
  return ta;
}

export async function buildTodayAgenda(role = 'coach', options = {}) {
  const { clubName = "Coach's Eye Club" } = options;

  const [sessions, fixtures, workflows, attendance] = await Promise.all([
    fetchUpcomingSessions(),
    fetchUpcomingFixtures(),
    fetchPendingWorkflows(),
    fetchAttendanceSummary(),
  ]);

  const pendingApprovals = getPending();

  const today    = [];
  const tomorrow = [];
  const upcoming = [];

  const now       = Date.now();
  const eodToday  = new Date(); eodToday.setHours(23, 59, 59, 999);
  const eodTomorrow = new Date(eodToday); eodTomorrow.setDate(eodTomorrow.getDate() + 1);

  function classify(dateMs) {
    if (dateMs <= eodToday.getTime())    return 'today';
    if (dateMs <= eodTomorrow.getTime()) return 'tomorrow';
    return 'upcoming';
  }

  // Training sessions
  (sessions.allSessions ?? sessions.sessions ?? []).forEach(s => {
    if (!s.date) return;
    const ts  = new Date(s.date).getTime();
    const bucket = classify(ts);
    const item = toAgendaItem({
      id:       `session-${s.id}`,
      category: 'training',
      time:     s.date ? new Date(s.date).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }) : null,
      title:    `${s.ageGroup ?? 'Squad'} Training`,
      detail:   `${s.focus ?? 'General'} · ${s.durationMinutes ?? 90} mins · ${s.venue ?? 'Club Grounds'}`,
      data:     s,
    });
    if (bucket === 'today')         today.push(item);
    else if (bucket === 'tomorrow') tomorrow.push(item);
    else                            upcoming.push(item);
  });

  // Fixtures
  fixtures.upcoming.forEach(f => {
    if (!f.date) return;
    const ts = new Date(f.date).getTime();
    const bucket = classify(ts);
    const item = toAgendaItem({
      id:       `fixture-${f.id}`,
      category: 'fixture',
      time:     f.date ? new Date(f.date).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }) : null,
      title:    `${f.homeTeam ?? '—'} vs ${f.awayTeam ?? '—'}`,
      detail:   `${f.competition ?? 'Fixture'} · ${f.venue ?? 'TBC'}`,
      data:     f,
    });
    if (bucket === 'today')         today.push(item);
    else if (bucket === 'tomorrow') tomorrow.push(item);
    else                            upcoming.push(item);
  });

  // Pending approvals — show under "today" since they need action now
  pendingApprovals.slice(0, 5).forEach(a => {
    today.push(toAgendaItem({
      id:       `approval-${a.approvalId}`,
      category: 'approval',
      time:     null,
      title:    `Review: ${a.title ?? a.type}`,
      detail:   `${a.riskLevel ?? 'low'} risk · ${a.generatedBy ?? 'system'}`,
      data:     a,
    }));
  });

  // Pending workflows
  workflows.pending.slice(0, 3).forEach(w => {
    today.push(toAgendaItem({
      id:       `workflow-${w.queueId}`,
      category: 'workflow',
      time:     null,
      title:    `Queued: ${w.name ?? 'Workflow'}`,
      detail:   `Ready to execute`,
      data:     w,
    }));
  });

  today.sort(sortByTime);
  tomorrow.sort(sortByTime);

  return {
    clubName,
    date:      new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    today:     today.filter(i => i.category !== 'approval' && i.category !== 'workflow'),
    todayActions: today.filter(i => i.category === 'approval' || i.category === 'workflow'),
    tomorrow,
    upcoming:  upcoming.slice(0, 5),
    totals: {
      today:    today.length,
      tomorrow: tomorrow.length,
      upcoming: upcoming.length,
    },
    attendance: {
      avgRate:  attendance.avgRate,
      sessions: attendance.totalSessions,
    },
    isMock: sessions.isMock || fixtures.isMock,
  };
}

export function formatTodayAgenda(agenda) {
  let out = `## Today's Agenda — ${agenda.date}\n\n`;

  // Events
  if (agenda.today.length > 0) {
    out += `### Scheduled Today\n`;
    agenda.today.forEach(item => {
      const time = item.time ? `\`${item.time}\` ` : '';
      out += `- ${time}${item.icon} **${item.title}** — ${item.detail}\n`;
    });
    out += '\n';
  } else {
    out += `### Scheduled Today\n_Nothing scheduled for today_\n\n`;
  }

  // Action items
  if (agenda.todayActions.length > 0) {
    out += `### Actions Needed Today\n`;
    agenda.todayActions.forEach(item => {
      out += `- ${item.icon} **${item.title}** — ${item.detail}\n`;
    });
    out += '\n';
  }

  // Tomorrow
  if (agenda.tomorrow.length > 0) {
    out += `### Tomorrow\n`;
    agenda.tomorrow.forEach(item => {
      const time = item.time ? `\`${item.time}\` ` : '';
      out += `- ${time}${item.icon} **${item.title}** — ${item.detail}\n`;
    });
    out += '\n';
  }

  // Upcoming
  if (agenda.upcoming.length > 0) {
    out += `### Coming Up\n`;
    agenda.upcoming.forEach(item => {
      out += `- ${item.icon} **${item.title}** — ${item.detail}\n`;
    });
    out += '\n';
  }

  if (agenda.attendance.avgRate !== null) {
    out += `_Average attendance: ${agenda.attendance.avgRate}% over ${agenda.attendance.sessions} sessions_\n`;
  }

  return out;
}
