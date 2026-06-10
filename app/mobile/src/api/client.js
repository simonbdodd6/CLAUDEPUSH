/**
 * Mobile API Client
 *
 * Unified fetch layer for all three platform APIs:
 *   /api/*       → Command Centre (port 3001) — actions, AI, health
 *   /twin/*      → Digital Twin (port 3002)  — full club model, risks
 *   /fixtures/*  → Fixture Engine (port 3003) — fixtures, match packs
 *   /season/*    → Fixture Engine (port 3003) — standings, timeline
 *
 * All calls have a 10-second timeout and fall back to MOCK data on failure.
 */

const TIMEOUT = 10_000;

async function fetcher(url, opts = {}) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function post(url, body) {
  return fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

// ── Mock fallback data ────────────────────────────────────────────────────────

export const MOCK = {
  clubHealth: {
    score: 78, grade: 'C', status: 'good', trend: 'stable',
    dimensions: [
      { label: 'Attendance',         score: 72 },
      { label: 'Player Availability',score: 88 },
      { label: 'Membership',         score: 80 },
      { label: 'Coach Activity',     score: 65 },
    ],
  },
  injuries: {
    answer: 'No current injuries recorded.',
    data:   [],
  },
  attendance: {
    answer: 'Attendance data not yet loaded.',
    data:   [],
  },
  recommendations: [
    { action: 'Review attendance for U16 Red — below 70% this week', priority: 'high' },
    { action: 'Confirm volunteer roles for Saturday match', priority: 'high' },
    { action: 'Send weekly newsletter to members', priority: 'medium' },
  ],
  approvals: [],
  briefing: {
    summary: 'Club health 78/100. No critical alerts. Next match: Saturday.',
    sections: [],
  },
  upcomingFixtures: [],
  twinStatus: {
    healthScore: 78,
    playerCount: 45,
    lastUpdated: new Date().toISOString(),
  },
  seasonPhase: {
    phase: 'IN_SEASON',
    meta: { label: 'In Season', description: 'Competitive season underway' },
  },
  availabilityIntel: {
    summary: { averageRate: 68, trend: 'declining', vsTarget: { status: 'below-target', gap: -12 }, atRiskCount: 3, phase: 'IN_SEASON', phaseLabel: 'In Season' },
    phaseTarget: { target: 80, minimum: 70 },
    sessionPrediction: { predicted: 63, warning: 'Predicted below 70% minimum' },
  },
  alerts: [
    { id: 'a1', type: 'VOLUNTEER_GAP',    severity: 'HIGH',     title: 'First Aider needed Saturday', description: 'Volunteer role unfilled for next fixture.', ts: new Date().toISOString() },
    { id: 'a2', type: 'ATTENDANCE_DECLINE',severity: 'MEDIUM',  title: 'U16 attendance below 70%',    description: 'Average attendance has dropped over 3 weeks.', ts: new Date().toISOString() },
  ],
};

async function safe(fn, mockKey) {
  try { return await fn(); } catch { return MOCK[mockKey] ?? null; }
}

// ── Command Centre APIs (/api/*) ──────────────────────────────────────────────

export const api = {
  health:          ()       => safe(() => fetcher('/api/health'),                     null),
  clubHealth:      ()       => safe(() => fetcher('/api/club/health'),                'clubHealth'),
  actions:         ()       => safe(() => fetcher('/api/actions'),                    null),
  runAction:       (id, p, ctx) => fetcher('/api/actions/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId: id, params: p ?? {}, context: ctx ?? { role: 'admin' } }),
  }),
  runNL:           (text, role) => fetcher('/api/nl', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, role: role ?? 'admin' }),
  }),
  resolveNL:       (text)   => safe(() => fetcher(`/api/actions/resolve?q=${encodeURIComponent(text)}`), null),
  injuries:        ()       => safe(() => fetcher('/api/alerts/injuries'),            'injuries'),
  attendance:      ()       => safe(() => fetcher('/api/alerts/attendance'),          'attendance'),
  recommendations: ()       => safe(() => fetcher('/api/recommendations'),            'recommendations'),
  approvals:       ()       => safe(() => fetcher('/api/approvals'),                  'approvals'),
  history:         ()       => safe(() => fetcher('/api/history'),                    null),
  briefing:        (role)   => safe(() => fetcher(`/api/dashboard/briefing?role=${role ?? 'coach'}`), 'briefing'),
  seasonPhase:          ()  => safe(() => fetcher('/api/season/phase'),               'seasonPhase'),
  availabilityIntel:    ()  => safe(() => fetcher('/api/availability/intelligence'),  'availabilityIntel'),
};

// ── Digital Twin APIs (/twin/*) ───────────────────────────────────────────────

export const twin = {
  status:    ()      => safe(() => fetcher('/twin/status'),          'twinStatus'),
  summary:   ()      => safe(() => fetcher('/twin/summary'),         'twinStatus'),
  health:    ()      => safe(() => fetcher('/twin/health'),          'clubHealth'),
  risks:     ()      => safe(() => fetcher('/twin/risks/critical'),  null),
  briefing:  ()      => safe(() => fetcher('/twin/briefing'),        'briefing'),
  ask:       (q)     => safe(() => post('/twin/ask', { question: q }), null),
};

// ── Fixture Engine APIs (/fixtures/*, /season/*) ─────────────────────────────

export const fixtures = {
  upcoming:  (limit) => safe(() => fetcher(`/fixtures/upcoming?limit=${limit ?? 5}`), 'upcomingFixtures'),
  recent:    ()      => safe(() => fetcher('/fixtures/recent'),       null),
  get:       (id)    => safe(() => fetcher(`/fixtures/${id}`),        null),
  prepare:   (id)    => post(`/fixtures/${id}/prepare`, {}),
  timeline:  (id)    => safe(() => fetcher(`/fixtures/${id}/timeline`), null),
  pack:      (id)    => safe(() => fetcher(`/fixtures/${id}/pack`),   null),
  genPack:   (id)    => post(`/fixtures/${id}/pack/generate`, {}),
  complete:  (id, r) => post(`/fixtures/${id}/complete`, r),
  review:    (id, n) => post(`/fixtures/${id}/review`, n),
  standings: ()      => safe(() => fetcher('/season/standings'),     null),
  timeline_: ()      => safe(() => fetcher('/season/timeline'),      null),
};
