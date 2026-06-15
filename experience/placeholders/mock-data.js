// ─── DEV-ONLY PLACEHOLDER ────────────────────────────────────────────────────
// Quarantined fallback dataset, lifted from the retired command-centre
// `src/api/client.js` MOCK block. Kept ONLY as a dev-time reference for the shapes
// the future Experience Adapter (M33) will map into a VisualModel. No live data,
// no /api calls, no engine/Core/@brain imports. Importable ONLY by experience/app/.
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK = {
  clubHealth: {
    overallScore: 52,
    trend: 'stable',
    domains: { players: 68, coaches: 75, attendance: 44, injuries: 30, communications: 55, finance: 70, volunteers: 60, sponsors: 80 },
  },
  injuries: [
    { id: '1', name: 'Ciarán Murphy', position: 'Prop',    injury: 'Hamstring Grade 2', status: 'Rehab' },
    { id: '2', name: 'Sean Walsh',    position: 'Flanker', injury: 'Ankle sprain',      status: 'Physio' },
    { id: '3', name: 'Tom Burke',     position: 'Lock',    injury: 'Shoulder',          status: 'Rehabbing' },
  ],
  attendance: [
    { id: '1', name: "James O'Brien",  missedSessions: 8, attendanceRate: 42 },
    { id: '2', name: 'Darragh Kelly',  missedSessions: 6, attendanceRate: 55 },
    { id: '3', name: 'Cillian Walsh',  missedSessions: 5, attendanceRate: 62 },
  ],
  recommendations: [
    { action: 'Run attendance review',   why: 'Squad attendance fell below 50%',         effort: 'low',    priority: 1 },
    { action: 'Draft training reminder', why: '3 sessions planned — squad not notified', effort: 'low',    priority: 2 },
    { action: 'Create sponsor update',   why: 'Main sponsor renewal due in 3 weeks',     effort: 'medium', priority: 3 },
  ],
  seasonPhase: { phase: 'IN_SEASON', label: 'In Season', intensityLevel: 'HIGH', attendanceTarget: 80 },
  platformStatus: { engines: 12, healthy: 11, totalCapabilities: 54 },
}
