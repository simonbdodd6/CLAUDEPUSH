// Committee summary builder — structured weekly digest for club committee.
// Pulls all data sources and compiles into one document for committee review.

let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

let _mem = null;
async function mem() {
  if (!_mem) { try { _mem = await import('../memory-engine/index.js'); } catch { _mem = null; } }
  return _mem;
}

export async function buildCommitteeSummary(drafts = [], options = {}) {
  const {
    clubName  = 'Your Club',
    weekOf    = new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    preparedBy = 'Coach\'s Eye AI',
  } = options;

  const d = await di();

  // ── Results ─────────────────────────────────────────────────────────────────
  let resultsSection = '- No results recorded this week\n';
  if (d) {
    const fixtures = await d.query({ source: 'fixtures', role: 'public' }).catch(() => ({ data: [] }));
    const played = (fixtures.data ?? []).filter(f => f.result || f.homeScore != null);
    if (played.length > 0) {
      resultsSection = played.map(f => {
        const won = f.homeTeam?.includes(clubName) ? f.homeScore > f.awayScore : f.awayScore > f.homeScore;
        return `- ${f.ageGroup ?? f.homeTeam ?? 'Team'}: ${f.homeScore ?? '?'} – ${f.awayScore ?? '?'} ${won ? '✅ Win' : '❌ Loss'} ${f.result ? '' : '(provisional)'}`;
      }).join('\n');
    }
  }

  // ── Upcoming ─────────────────────────────────────────────────────────────────
  let upcomingSection = '- No upcoming fixtures scheduled\n';
  if (d) {
    const fixtures = await d.query({ source: 'fixtures', role: 'public' }).catch(() => ({ data: [] }));
    const upcoming = (fixtures.data ?? []).filter(f => f.status === 'upcoming').slice(0, 5);
    if (upcoming.length > 0) {
      upcomingSection = upcoming.map(f => {
        const date = f.date ? new Date(f.date).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }) : 'TBC';
        return `- ${date}: ${f.homeTeam} vs ${f.awayTeam} — ${f.competition ?? 'Friendly'} @ ${f.venue ?? 'TBC'}`;
      }).join('\n');
    }
  }

  // ── Attendance ───────────────────────────────────────────────────────────────
  let attendanceSection = '- No attendance data available\n';
  if (d) {
    const att = await d.query({ source: 'attendance', role: 'coach' }).catch(() => ({ data: [] }));
    if (att.data?.length > 0) {
      const recent = att.data.slice(-3);
      const avgRate = Math.round(recent.reduce((sum, s) => sum + (s.attendanceRate ?? s.rate ?? 0), 0) / recent.length);
      attendanceSection = `- Last 3 sessions: avg ${avgRate}% attendance (mock data)\n`;
      recent.forEach(s => {
        attendanceSection += `  - ${s.date ?? s.sessionId}: ${s.attendanceCount ?? '?'} players, ${s.attendanceRate ?? s.rate ?? '?'}%\n`;
      });
    }
  }

  // ── Membership ───────────────────────────────────────────────────────────────
  let membershipSection = '- No membership data available\n';
  let membershipAlerts = [];
  if (d) {
    const mem = await d.query({ source: 'membership', role: 'manager' }).catch(() => ({ data: [] }));
    const members = mem.data ?? [];
    const active  = members.filter(m => m.status === 'active').length;
    const pending = members.filter(m => m.status === 'pending').length;
    const lapsed  = members.filter(m => m.status === 'lapsed').length;
    membershipSection = `- Active: ${active}, Pending: ${pending}, Lapsed: ${lapsed} (total: ${members.length})\n`;
    if (pending > 0) membershipAlerts.push(`${pending} pending membership(s) require processing`);
    if (lapsed > 0) membershipAlerts.push(`${lapsed} lapsed member(s) — re-engagement campaign recommended`);

    // Expiring soon
    const expiringSoon = members.filter(m => {
      if (m.status !== 'active' || !m.validUntil) return false;
      return (new Date(m.validUntil) - Date.now()) / 86400000 <= 30;
    });
    if (expiringSoon.length > 0) membershipAlerts.push(`${expiringSoon.length} membership(s) expiring within 30 days`);
  }

  // ── Finances ─────────────────────────────────────────────────────────────────
  let financialSection = '- Finance adapter planned — connect Revolut Business or Google Sheets\n';
  if (d) {
    const bar = await d.query({ source: 'bar-sales', role: 'manager' }).catch(() => ({ data: [] }));
    const barData = bar.data ?? [];
    if (barData.length > 0) {
      const latest = barData[barData.length - 1];
      financialSection = `- Bar sales (latest month): €${latest.totalRevenue?.toLocaleString() ?? '—'} (${latest.month ?? 'recent'})\n`;
      financialSection += `- Finance ledger: not yet connected\n`;
    }
  }

  // ── Volunteers ────────────────────────────────────────────────────────────────
  let volunteerSection = '- No volunteer data\n';
  if (d) {
    const vols = await d.query({ source: 'volunteers', role: 'manager' }).catch(() => ({ data: [] }));
    if ((vols.data ?? []).length > 0) {
      volunteerSection = `- ${vols.data.length} active volunteers on record\n`;
    }
  }

  // ── Pending approvals ────────────────────────────────────────────────────────
  const pendingApprovals = drafts.filter(d => d.requiresHumanApproval && d.status === 'draft');
  const highRiskDrafts   = pendingApprovals.filter(d => d.riskLevel === 'high');

  const approvalSection = pendingApprovals.length > 0
    ? pendingApprovals.map(d =>
        `- **${d.type.replace(/_/g, ' ')}** → ${d.audienceSummary} [${d.riskLevel.toUpperCase()} risk]`
      ).join('\n')
    : '- No items pending approval';

  const alertsSection = [
    ...membershipAlerts,
    ...(highRiskDrafts.length > 0 ? [`${highRiskDrafts.length} high-risk communication draft(s) require committee sign-off`] : []),
  ].map(a => `- ⚠️ ${a}`).join('\n') || '- No alerts this week';

  return `# Committee Weekly Summary — ${weekOf}

*Prepared by: ${preparedBy} | ${clubName}*

---

## 📋 This Week's Results
${resultsSection}
## 📅 Upcoming Fixtures
${upcomingSection}
## 👥 Attendance Summary
${attendanceSection}
## 🏅 Membership Status
${membershipSection}
## 💰 Financial Summary
${financialSection}
## 🙋 Volunteers
${volunteerSection}
## ⚠️ Alerts & Actions Required
${alertsSection}

## 📬 Communications Pending Approval (${pendingApprovals.length} drafts)
${approvalSection}

---

*All communications are in DRAFT status. No communications have been sent.*
*Review each item, check the risk notes and send checklist before approving.*
*Generated by Coach's Eye — ${new Date().toISOString()}*
`;
}
