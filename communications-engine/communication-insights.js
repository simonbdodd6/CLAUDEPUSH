// Communication analytics — engagement, churn risk, audience reachability.

import { getHistoryStats, getRecentHistory, COMM_EVENTS } from './communication-history.js';

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

export function getTopCommunicationTypes(n = 5) {
  const stats = getHistoryStats();
  return Object.entries(stats.byType ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([type, count]) => ({ type, count }));
}

export function getChannelBreakdown() {
  const stats = getHistoryStats();
  return Object.entries(stats.byChannel ?? {})
    .map(([channel, count]) => ({ channel, count }));
}

// Returns recipients who haven't received any communication recently.
export function getUnreachedRecipients(allRecipients, withinDays = 30) {
  const history = getRecentHistory(2000);
  const recentIds = new Set(
    history
      .filter(e => e.event === COMM_EVENTS.SENT && (Date.now() - new Date(e.ts).getTime()) < withinDays * 86400000)
      .map(e => e.recipientId)
  );
  return allRecipients.filter(r => !recentIds.has(r.id));
}

// Reachability: what % of each audience type has a valid contact channel.
export async function getAudienceReachability() {
  const d = await di();
  if (!d) return { isMock: true, channels: {} };

  const players   = await d.queryPlayerData({ role: 'coach' });
  const members   = await d.query({ source: 'membership', role: 'manager' }).catch(() => ({ data: [] }));
  const sponsors  = await d.query({ source: 'sponsors',   role: 'manager' }).catch(() => ({ data: [] }));
  const volunteers = await d.query({ source: 'volunteers', role: 'manager' }).catch(() => ({ data: [] }));

  function reachabilityFor(records, label) {
    const recs = records.data ?? records;
    const total = recs.length;
    const withEmail = recs.filter(r => r.email).length;
    const withPhone = recs.filter(r => r.phone || r.mobile).length;
    return {
      label,
      total,
      withEmail,
      withPhone,
      emailPct: total > 0 ? Math.round((withEmail / total) * 100) : 0,
      phonePct: total > 0 ? Math.round((withPhone / total) * 100) : 0,
    };
  }

  return {
    isMock: players.isMock,
    audiences: [
      reachabilityFor(players,   'players'),
      reachabilityFor(members,   'members'),
      reachabilityFor(sponsors,  'sponsors'),
      reachabilityFor(volunteers, 'volunteers'),
    ],
  };
}

// Members/players who may be disengaged (low attendance + no recent comms).
export async function getChurnRisk() {
  const d = await di();
  if (!d) return { risks: [], isMock: true };

  const members = await d.query({ source: 'membership', role: 'manager' }).catch(() => ({ data: [] }));
  const lapsed  = (members.data ?? []).filter(m => m.status === 'lapsed' || m.status === 'pending');

  const players = await d.queryPlayerData({ role: 'coach' }).catch(() => ({ data: [] }));
  const lowAttendance = (players.data ?? []).filter(p => {
    const rate = p.attendanceRate ?? p.core?.attendanceRate;
    return rate != null && rate < 50;
  });

  return {
    lapsedMembers:     lapsed.length,
    lowAttendancePlayers: lowAttendance.length,
    risks: [
      ...lapsed.slice(0, 5).map(m => ({ id: m.id, name: m.playerName ?? m.name, risk: 'lapsed_membership' })),
      ...lowAttendance.slice(0, 5).map(p => ({ id: p.id, name: p.name ?? p.core?.name, risk: 'low_attendance', rate: p.attendanceRate ?? p.core?.attendanceRate })),
    ],
    isMock: members.isMock,
  };
}

// Summary suitable for Club Intelligence integration.
export async function generateInsightsReport() {
  const stats        = getHistoryStats();
  const topTypes     = getTopCommunicationTypes(5);
  const channels     = getChannelBreakdown();
  const churnRisk    = await getChurnRisk();
  const reachability = await getAudienceReachability();

  const typeTable = topTypes.length > 0
    ? topTypes.map(t => `• ${t.type}: ${t.count} sent`).join('\n')
    : '• No communications sent yet';

  const channelTable = channels.length > 0
    ? channels.map(c => `• ${c.channel}: ${c.count} messages`).join('\n')
    : '• No channel data';

  const reachRows = (reachability.audiences ?? [])
    .map(a => `• ${a.label}: ${a.total} total, ${a.emailPct}% have email, ${a.phonePct}% have phone`)
    .join('\n');

  return `## Communications Insights

### Volume
- Total: ${stats.total}, Sent: ${stats.sent}, Failed: ${stats.failed}, Scheduled: ${stats.scheduled}
- Success rate: ${stats.successRate}%

### Top Communication Types
${typeTable}

### Channel Breakdown
${channelTable}

### Audience Reachability
${reachRows || '• No audience data'}

### Churn Risk
- Lapsed members: ${churnRisk.lapsedMembers}
- Low-attendance players (< 50%): ${churnRisk.lowAttendancePlayers}
${churnRisk.risks.slice(0, 5).map(r => `• ${r.name} — ${r.risk}${r.rate != null ? ` (${r.rate}%)` : ''}`).join('\n')}`;
}
