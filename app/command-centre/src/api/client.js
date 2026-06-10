// API client — calls the Coach's Eye API server.
// Falls back to mock data when the server is unavailable.

const BASE = '/api'
const TIMEOUT_MS = 8000

async function request(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(BASE + path, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
    clearTimeout(timer)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    return res.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Request timed out')
    throw err
  }
}

const get  = (path)         => request(path)
const post = (path, data)   => request(path, { method: 'POST', body: JSON.stringify(data) })

// ── Endpoints ──────────────────────────────────────────────────────────────────

export const api = {
  health:         ()                         => get('/health'),
  actions:        ()                         => get('/actions'),
  runAction:      (actionId, params, ctx)    => post('/actions/run', { actionId, params, context: ctx }),
  previewAction:  (actionId, params, ctx)    => post('/actions/preview', { actionId, params, context: ctx }),
  runNL:          (text, role = 'coach')     => post('/nl', { text, role }),
  resolveNL:      (q)                        => get(`/actions/resolve?q=${encodeURIComponent(q)}`),

  clubHealth:     ()                         => get('/club/health'),
  knowledge:      (q)                        => get(`/knowledge/ask?q=${encodeURIComponent(q)}`),
  injuries:       ()                         => get('/alerts/injuries'),
  attendance:     ()                         => get('/alerts/attendance'),
  recommendations: ()                        => get('/recommendations'),
  history:        ()                         => get('/history'),
  platformStatus: ()                         => get('/platform/status'),
  briefing:       (role)                     => get(`/dashboard/briefing?role=${role ?? 'coach'}`),
  approvals:      ()                         => get('/approvals'),
  seasonPhase:    ()                         => get('/season/phase'),
  acceptRec:      (id)                       => post(`/recommendations/${id}/accept`, {}),
  snoozeRec:      (id, hours = 24)           => post(`/recommendations/${id}/snooze`, { hours }),
  dismissRec:     (id)                       => post(`/recommendations/${id}/dismiss`, {}),
  approvalDecide: (id, decision)             => post('/approvals/decide', { id, decision }),
  timeline:           ()      => get('/timeline'),
  learningStatus:     ()      => get('/learning/status'),

  availabilityIntelligence:   () => get('/availability/intelligence'),
  intelligenceDashboard:      () => get('/intelligence/dashboard'),
  intelligenceTimeline:       (params = '') => get('/intelligence/timeline' + (params ? '?' + params : '')),
  intelligenceTimelineStatus: (id, status, notes) => post(`/intelligence/timeline/${id}/status`, { status, notes }),

  fixturesUpcoming: (limit = 8) => get(`/fixtures/upcoming?limit=${limit}`),
  fixtureNext:      ()           => get('/fixtures/next'),
  fixtureGet:       (id)         => get(`/fixtures/${id}`),
  fixturePrepare:   (id)         => post(`/fixtures/${id}/prepare`, {}),
  fixtureGenPack:   (id)         => post(`/fixtures/${id}/pack/generate`, {}),
  fixtureGetPack:   (id)         => get(`/fixtures/${id}/pack`),
}

// ── Mock data (fallback when server not running) ───────────────────────────────

export const MOCK = {
  clubHealth: {
    health: {
      overallScore: 52, trend: 'stable', isMock: true,
      domains: { players: 68, coaches: 75, attendance: 44, injuries: 30, communications: 55, finance: 70, volunteers: 60, sponsors: 80 },
    },
    insights: [
      { title: 'Attendance below target', description: '44% attendance rate this month — squad target is 75%', priority: 1 },
      { title: '3 players in extended injury', description: 'Ciarán Murphy, Sean Walsh, Tom Burke are in rehab', priority: 2 },
      { title: 'Newsletter overdue', description: 'Last newsletter sent 3 weeks ago', priority: 3 },
    ],
  },
  injuries: {
    injuries: [
      { id: '1', name: 'Ciarán Murphy', position: 'Prop', injury: 'Hamstring Grade 2', status: 'Rehab', returnDate: '2026-06-28' },
      { id: '2', name: 'Sean Walsh', position: 'Flanker', injury: 'Ankle sprain', status: 'Physio', returnDate: '2026-06-15' },
      { id: '3', name: 'Tom Burke', position: 'Lock', injury: 'Shoulder', status: 'Rehabbing', returnDate: '2026-07-05' },
    ],
    count: 3,
    summary: '3 players currently injured',
  },
  attendance: {
    absentees: [
      { id: '1', name: 'James O\'Brien', missedSessions: 8, attendanceRate: 42 },
      { id: '2', name: 'Darragh Kelly', missedSessions: 6, attendanceRate: 55 },
      { id: '3', name: 'Cillian Walsh', missedSessions: 5, attendanceRate: 62 },
    ],
    summary: '3 players below 65% attendance this season',
    count: 3,
  },
  recommendations: {
    recommendations: [
      { action: 'Run attendance review', why: 'Squad attendance fell below 50% last 2 weeks', effort: 'low', priority: 1 },
      { action: 'Draft training reminder', why: '3 sessions planned this week — squad not notified', effort: 'low', priority: 2 },
      { action: 'Create sponsor update', why: 'Main sponsor renewal due in 3 weeks', effort: 'medium', priority: 3 },
      { action: 'Review U14 programme', why: 'No structured programme for U14 this season', effort: 'medium', priority: 4 },
      { action: 'Prepare match report', why: 'Saturday\'s match result not yet reported', effort: 'low', priority: 5 },
    ],
  },
  history: {
    history: [],
    stats: { total: 0, successes: 0, failures: 0, avgDurationMs: 0 },
  },
  approvals: { items: [], count: 0 },
  platformStatus: { engines: 10, stats: { totalEngines: 10, healthy: 9, totalCapabilities: 54 } },
  briefing: {
    headline: 'Attention required on 3 fronts today',
    summary: '3 recommendations need your attention. 1 can be automated.',
    severity: 'HIGH',
    priorities: [
      { text: 'Training reminder not sent for Senior squad', urgency: 'high', tag: 'Communications' },
      { text: '3 players awaiting return-to-play clearance', urgency: 'high', tag: 'Players' },
      { text: 'Sponsor renewal due in 18 days', urgency: 'medium', tag: 'Finance' },
    ],
    stats: { recommendations: 3, auto: 1, approve: 1, human: 1, minutesSaved: 45 },
    lines: [],
  },
  seasonPhase: {
    phase: 'IN_SEASON',
    meta: { label: 'In Season', description: 'Competitive season in progress' },
    prescription: { attendanceExpectation: { target: 80 }, intensityLevel: 'HIGH' },
  },
  timeline: {
    totalEvents: 8, automatableCount: 3,
    byDay: [
      { date: new Date().toISOString().slice(0,10), label: 'Today', events: [
        { id: 't1', type: 'REMINDER', title: 'Weekly newsletter due', description: 'AI can auto-generate from this week\'s training and fixtures.', probability: 100, impact: 'MEDIUM', icon: '📩', automatable: true },
      ]},
      { date: '', label: 'Tomorrow', events: [
        { id: 't2', type: 'PREDICTION', title: 'Predicted attendance: 73%', description: 'Below-threshold session likely.', probability: 72, impact: 'MEDIUM', icon: '📉' },
      ]},
    ],
  },
  fixtures: { fixtures: [] },
  availabilityIntelligence: {
    summary: { averageRate: 68, trend: 'declining', vsTarget: { current: 68, target: 80, gap: -12, status: 'below-target' }, atRiskCount: 3, decliningTeamCount: 2, phase: 'IN_SEASON', phaseLabel: 'In Season', confidence: 45 },
    phaseTarget: { target: 80, minimum: 70, note: 'League results matter. Build attendance culture now.', label: 'In Season' },
    atRisk: [
      { id: 'p1', name: 'James O\'Brien',  attendanceRate: 42, retentionRisk: 'high',   risk: 'high',   reason: 'Critical attendance — below 50%' },
      { id: 'p2', name: 'Darragh Kelly',   attendanceRate: 55, retentionRisk: 'medium', risk: 'medium', reason: 'Attendance below session minimum' },
      { id: 'p3', name: 'Cillian Walsh',   attendanceRate: 62, retentionRisk: 'low',    risk: 'medium', reason: 'Attendance below session minimum' },
    ],
    decliningTeams: [
      { id: 't1', name: 'U16 Red',  rate: 62, trend: -8 },
      { id: 't2', name: 'U14 Blue', rate: 71, trend: -5 },
    ],
    sessionPrediction: { label: 'Next Training Session', predicted: 63, basis: 'Current declining trend', confidence: 45, warning: 'Predicted below 70% minimum' },
    recommendations: [
      { id: 'r1', action: 'Send attendance reminder to squad', why: 'Average attendance dropped 8% over last 3 sessions', effort: 'low', priority: 1 },
      { id: 'r2', action: 'Schedule 1:1 check-ins with at-risk players', why: '3 players below 65% attendance threshold', effort: 'medium', priority: 2 },
    ],
    narrative: 'Squad attendance has been declining over recent sessions and is currently below the in-season target. Consider a targeted reminder this week and follow up individually with players below 65%.',
    generatedAt: new Date().toISOString(),
  },
  intelligenceDashboard: {
    clubScore:       { overall: 58, trend: 'declining', confidence: 68, delta: -5, components: { engagement: 52, attendance: 68, governance: 71, finance: 61 } },
    observations: [
      { id: 'mo1', engine: 'attendance-engine', severity: 'high',   title: 'Senior A attendance 63%', description: 'Below target for 3 consecutive sessions.', timestamp: new Date().toISOString() },
      { id: 'mo2', engine: 'digital-twin',      severity: 'high',   title: '3 active injuries',       description: 'Prop, Lock and Centre positions affected.',   timestamp: new Date().toISOString() },
      { id: 'mo3', engine: 'fixture-engine',    severity: 'medium', title: '2 props unavailable',     description: '5 days to kickoff — selection action needed.', timestamp: new Date().toISOString() },
      { id: 'mo4', engine: 'weather-service',   severity: 'low',    title: 'Heavy rain forecast',     description: 'Thursday/Friday training windows affected.',    timestamp: new Date().toISOString() },
      { id: 'mo5', engine: 'governance-engine', severity: 'medium', title: '2 approvals pending',     description: '0 overdue. Review this week.',                  timestamp: new Date().toISOString() },
    ],
    recommendations: [
      { id: 'r1', category: 'Medical',    priority: 'HIGH',   confidence: 90, title: '1 high-severity medical alert', description: 'Ross Dunne — concussion protocol active.', action: 'Contact medical officer today.', explainability: 'Any HIGH severity medical alert triggers this because contact clearance is a safeguarding requirement.', source: 'mock' },
      { id: 'r2', category: 'Selection',  priority: 'HIGH',   confidence: 85, title: '2 Prop players unavailable', description: 'Jack O\'Sullivan and Conor Lynch unavailable.', action: 'Review squad depth at Prop.', explainability: 'Two players unavailable in the same position within match week.', source: 'mock' },
      { id: 'r3', category: 'Training',   priority: 'MEDIUM', confidence: 72, title: 'Attendance dropped 18%', description: 'Club-wide average at 71%.', action: 'Send attendance communication.', explainability: 'Attendance engine tracking a sustained decline below 80%.', source: 'mock' },
      { id: 'r4', category: 'Performance',priority: 'MEDIUM', confidence: 80, title: 'Competitive season prescription', description: 'Focus: game shape, set-piece refinement.', action: 'Run one pattern and one defensive session.', explainability: 'Season intelligence maps current date to competitive phase prescription.', source: 'mock' },
      { id: 'r5', category: 'Club',       priority: 'MEDIUM', confidence: 68, title: 'Club health 58/100', description: 'Engagement 52/100 is the weakest dimension.', action: 'Review the Club Intelligence dashboard.', explainability: 'Club Intelligence score below 65/100 triggers this early warning.', source: 'mock' },
    ],
    squadHealth:      { availabilityPct: 73, injuryCount: 3, uncertainCount: 1, atRisk: [{ id: 'p1', name: 'Séan Hennessy', attendanceRate: 48 }], availableCount: 10, unavailableCount: 3 },
    fixtureReadiness: { nextFixture: { opponent: 'Naas RFC', competition: 'League', daysToKickoff: 5, prepStage: 'BUILD' }, readinessPct: 73, selectionConfidence: 72, trainingConfidence: 63, medicalAlertCount: 1 },
    timeline: {
      events: [
        { id: 'te1', timestamp: new Date(Date.now() - 0).toISOString(),          category: 'Logistics',      priority: 'MEDIUM', status: 'new',          title: 'Heavy rain forecast — reduce kicking volume',   teamName: 'Senior A',   seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te2', timestamp: new Date(Date.now() - 86400000).toISOString(),   category: 'Performance',    priority: 'MEDIUM', status: 'new',          title: 'Competitive season: game shape recommended',    teamName: 'Senior A',   seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te3', timestamp: new Date(Date.now() - 2*86400000).toISOString(), category: 'Club',           priority: 'MEDIUM', status: 'new',          title: 'Club health score 58/100',                      teamName: null,         seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te4', timestamp: new Date(Date.now() - 3*86400000).toISOString(), category: 'Player Welfare', priority: 'MEDIUM', status: 'new',          title: '1 player flagged at welfare risk',               teamName: 'Senior B',   seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te5', timestamp: new Date(Date.now() - 4*86400000).toISOString(), category: 'Training',       priority: 'MEDIUM', status: 'new',          title: 'Attendance dropped 18% this month',             teamName: 'Senior A',   seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te6', timestamp: new Date(Date.now() - 5*86400000).toISOString(), category: 'Medical',        priority: 'HIGH',   status: 'new',          title: '1 high-severity medical alert',                 teamName: 'Senior A',   seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te7', timestamp: new Date(Date.now() - 6*86400000).toISOString(), category: 'Selection',      priority: 'HIGH',   status: 'new',          title: '2 Prop players unavailable — 5d to kickoff',    teamName: 'Senior A',   seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te8', timestamp: new Date(Date.now() - 14*86400000).toISOString(),category: 'Performance',    priority: 'LOW',    status: 'acknowledged', title: 'Three consecutive wins — protect freshness',    teamName: 'Senior A',   seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te9', timestamp: new Date(Date.now() - 17*86400000).toISOString(),category: 'Training',       priority: 'MEDIUM', status: 'completed',    title: 'Match week: reduce training load',               teamName: 'Senior A',   seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
        { id: 'te10',timestamp: new Date(Date.now() - 19*86400000).toISOString(),category: 'Club',           priority: 'HIGH',   status: 'acknowledged', title: 'Club health score 56/100 — below threshold',    teamName: null,         seasonPhase: 'COMPETITIVE', engine: 'recommendation-engine' },
      ],
      total: 26,
      stats: { total: 26, byPriority: { HIGH: 9, MEDIUM: 16, LOW: 1 }, byStatus: { new: 7, acknowledged: 7, completed: 11, ignored: 1 }, actionRate: 69 },
    },
    generatedAt: new Date().toISOString(),
    isMock: true,
  },
  intelligenceTimeline: { events: [], total: 0, stats: {} },
  learningStatus: {
    cis: { score: 69, grade: 'B', stage: 'GROWING', topStrengths: ['Attendance tracking', 'Injury alerts'], improvementAreas: ['Training recommendations'] },
    accuracy: { overall: { f1: 0.95, precision: 0.96, recall: 0.94, grade: 'A' } },
  },
}

// Wrapper that falls back to mock on error
export async function safeFetch(fn, mockKey) {
  try {
    return await fn()
  } catch {
    return MOCK[mockKey] ?? null
  }
}
