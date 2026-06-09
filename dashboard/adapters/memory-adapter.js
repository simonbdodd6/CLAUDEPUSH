// Thin adapter over the Memory Engine — reads player/team/injury data for the dashboard.
let _m = null;
async function mem() {
  if (!_m) { try { _m = await import('../../memory-engine/index.js'); } catch { _m = null; } }
  return _m;
}
let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

export async function fetchPlayerSnapshot() {
  const m = await mem();
  if (!m) return { players: [], teams: [], isMock: true };

  const players = m.getAllPlayers?.() ?? [];
  const teams   = m.getAllTeams?.()   ?? [];
  const d       = await di();

  let injuries = [];
  if (d) {
    const res = await d.query({ source: 'injuries', role: 'manager' }).catch(() => ({ data: [] }));
    injuries = (res.data ?? []).filter(i => i.status === 'active');
  } else {
    injuries = players.flatMap(p => p.injuries?.filter(i => i.status === 'active').map(i => ({ ...i, playerName: p.core?.name ?? p.name })) ?? []);
  }

  const activeCount   = players.filter(p => p.core?.active !== false).length;
  const injuredCount  = injuries.length;
  const availableCount = activeCount - injuredCount;

  return { players, teams, injuries, activeCount, injuredCount, availableCount, isMock: false };
}

export async function fetchAttendanceSummary() {
  const d = await di();
  if (!d) return { avgRate: null, recentSessions: [], isMock: true };

  const res = await d.query({ source: 'attendance', role: 'coach' }).catch(() => ({ data: [] }));
  const sessions = res.data ?? [];
  const recent   = sessions.slice(-5);
  const avgRate  = recent.length > 0
    ? Math.round(recent.reduce((s, r) => s + (r.attendanceRate ?? r.rate ?? 0), 0) / recent.length)
    : null;

  return { avgRate, recentSessions: recent, totalSessions: sessions.length, isMock: res.isMock };
}

export async function fetchUpcomingFixtures() {
  const d = await di();
  if (!d) return { upcoming: [], isMock: true };

  const res = await d.query({ source: 'fixtures', role: 'public' }).catch(() => ({ data: [] }));
  const upcoming = (res.data ?? []).filter(f => f.status === 'upcoming' || (!f.result && new Date(f.date) > Date.now())).slice(0, 5);
  return { upcoming, isMock: res.isMock };
}

export async function fetchUpcomingSessions() {
  const d = await di();
  if (!d) return { sessions: [], isMock: true };

  const res = await d.query({ source: 'sessions', role: 'coach' }).catch(() => ({ data: [] }));
  const tomorrow = Date.now() + 48 * 3600000;
  const sessions = (res.data ?? []).filter(s => s.date && new Date(s.date) <= tomorrow && new Date(s.date) >= Date.now());
  return { sessions, allSessions: res.data ?? [], isMock: res.isMock };
}
