// Thin adapter over the Data Integration Layer — health, membership alerts, sponsors.
let _di = null;
async function di() {
  if (!_di) { try { _di = await import('../../qa/data-integration/index.js'); } catch { _di = null; } }
  return _di;
}

export async function fetchDataHealth() {
  const d = await di();
  if (!d) return { overall: 'unknown', totalSources: 0, mock: 0, isMock: true };

  try {
    const health = await d.getDataHealth();
    return { ...health, isMock: false };
  } catch { return { overall: 'unknown', totalSources: 0, mock: 0, isMock: true }; }
}

export async function fetchMembershipAlerts() {
  const d = await di();
  if (!d) return { expiringSoon: [], lapsed: [], pending: [], isMock: true };

  try {
    const res = await d.query({ source: 'membership', role: 'manager' }).catch(() => ({ data: [] }));
    const members = res.data ?? [];

    const expiringSoon = members.filter(m => {
      if (!m.validUntil || m.status !== 'active') return false;
      return (new Date(m.validUntil) - Date.now()) / 86400000 <= 30;
    });
    const lapsed  = members.filter(m => m.status === 'lapsed');
    const pending = members.filter(m => m.status === 'pending');

    return { expiringSoon, lapsed, pending, total: members.length, isMock: res.isMock };
  } catch { return { expiringSoon: [], lapsed: [], pending: [], isMock: true }; }
}

export async function fetchSponsorAlerts() {
  const d = await di();
  if (!d) return { sponsors: [], isMock: true };

  try {
    const res = await d.query({ source: 'sponsors', role: 'manager' }).catch(() => ({ data: [] }));
    const sponsors = res.data ?? [];
    return { sponsors, count: sponsors.length, isMock: res.isMock };
  } catch { return { sponsors: [], isMock: true }; }
}

export async function fetchVolunteerStatus() {
  const d = await di();
  if (!d) return { volunteers: [], count: 0, isMock: true };

  try {
    const res = await d.query({ source: 'volunteers', role: 'manager' }).catch(() => ({ data: [] }));
    return { volunteers: res.data ?? [], count: (res.data ?? []).length, isMock: res.isMock };
  } catch { return { volunteers: [], count: 0, isMock: true }; }
}
