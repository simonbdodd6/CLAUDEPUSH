/**
 * Intelligence Dashboard
 *
 * The public face of Coach's Eye Intelligence. Read-only.
 * All data arrives via useIntelligenceDashboard() → /api/intelligence/dashboard.
 * No Core logic is duplicated here — the AI Brain owns every number displayed.
 *
 * Sections:
 *   1. Club Intelligence Score
 *   2. Today's Observations
 *   3. Top Recommendations
 *   4. Squad Health
 *   5. Fixture Readiness
 *   6. Intelligence Timeline
 */

import { useState } from 'react'
import { useIntelligenceDashboard } from '../hooks/useClubData.js'
import {
  priorityColor, priorityBadge, severityDot, statusBadge,
  trendArrow, categoryDot, relTime, engineLabel,
} from '../utils/intelligence.js'
import IntelligencePageHeader from '../components/intelligence/IntelligencePageHeader.jsx'
import IntelligenceSkeleton   from '../components/intelligence/IntelligenceSkeleton.jsx'
import TimelineEventRow       from '../components/intelligence/TimelineEventRow.jsx'
import RecommendationCard     from '../components/intelligence/RecommendationCard.jsx'

// ── Section: Club Intelligence Score ─────────────────────────────────────────

function ScoreRing({ score }) {
  const s = Math.max(0, Math.min(100, score ?? 0))
  const r = 36
  const circ = 2 * Math.PI * r
  const filled = (s / 100) * circ
  const color = s >= 75 ? '#22c55e' : s >= 55 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
      <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-surface-3" />
      <circle
        cx="48" cy="48" r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="48" y="52" textAnchor="middle" fontSize="20" fontWeight="700" fill={color}>{s}</text>
    </svg>
  )
}

function ClubScoreCard({ data, loading }) {
  if (loading) return <IntelligenceSkeleton h="h-40" />
  const score = data?.clubScore
  if (!score) return null

  const { overall, trend, confidence, components, delta } = score
  const tr = trendArrow(trend)
  const dims = Object.entries(components ?? {}).sort(([,a],[,b]) => a - b)

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-ink-1 text-sm">Club Intelligence Score</h2>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-medium">AI Brain</span>
      </div>
      <p className="text-xs text-ink-3 mb-4">Composite health score across all club dimensions</p>

      <div className="flex items-center gap-5">
        <ScoreRing score={overall} />
        <div className="flex-1 space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${tr.cls}`}>{tr.icon}</span>
            <span className="text-xs text-ink-2 capitalize">{trend}</span>
            {delta != null && (
              <span className={`text-xs font-medium ${delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {delta >= 0 ? '+' : ''}{delta} pts
              </span>
            )}
          </div>
          <div className="text-xs text-ink-3">Confidence: <span className="text-ink-2 font-medium">{confidence}%</span></div>
          {dims.slice(0, 3).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <div className="w-20 text-[10px] text-ink-3 capitalize truncate">{key}</div>
              <div className="flex-1 h-1.5 bg-surface-3 rounded-full">
                <div
                  className={`h-full rounded-full ${val >= 70 ? 'bg-green-400' : val >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${val}%` }}
                />
              </div>
              <div className="text-[10px] text-ink-3 w-7 text-right">{val}</div>
            </div>
          ))}
        </div>
      </div>

      {data?.isMock && (
        <div className="mt-3 text-[10px] text-ink-3 border-t border-border-subtle pt-2">
          Preview mode — mock data · Live data requires Club Intelligence engine
        </div>
      )}
    </section>
  )
}

// ── Section: Today's Observations ────────────────────────────────────────────

function ObservationsCard({ data, loading }) {
  if (loading) return <IntelligenceSkeleton h="h-48" />
  const obs = data?.observations ?? []

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-ink-1 text-sm">Today's Observations</h2>
        <span className="text-[10px] text-ink-3">{obs.length} signals</span>
      </div>

      {obs.length === 0 ? (
        <p className="text-xs text-ink-3 py-4 text-center">No observations — all systems nominal</p>
      ) : (
        <div className="space-y-2">
          {obs.map(o => (
            <div key={o.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface-2">
              <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${severityDot(o.severity)}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-ink-1">{o.title}</div>
                <div className="text-[11px] text-ink-3 mt-0.5">{o.description}</div>
              </div>
              <div className="text-[10px] text-ink-3 shrink-0 whitespace-nowrap">{engineLabel(o.engine)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Section: Top Recommendations ─────────────────────────────────────────────

function RecommendationsCard({ data, loading }) {
  const [expandedId, setExpandedId] = useState(null)
  if (loading) return <IntelligenceSkeleton h="h-56" />
  const recs = data?.recommendations ?? []

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-ink-1 text-sm">Top Recommendations</h2>
        <span className="text-[10px] text-ink-3">{recs.length} active</span>
      </div>

      {recs.length === 0 ? (
        <p className="text-xs text-ink-3 py-4 text-center">No recommendations at this time</p>
      ) : (
        <div className="space-y-2">
          {recs.map(r => (
            <RecommendationCard
              key={r.id}
              rec={r}
              expanded={expandedId === r.id}
              onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ── Section: Squad Health ─────────────────────────────────────────────────────

function SquadHealthCard({ data, loading }) {
  if (loading) return <IntelligenceSkeleton h="h-36" />
  const sq = data?.squadHealth
  if (!sq) return null

  const { availabilityPct, injuryCount, uncertainCount, atRisk, availableCount, unavailableCount } = sq
  const color = availabilityPct == null ? 'text-ink-3' : availabilityPct >= 80 ? 'text-green-500' : availabilityPct >= 65 ? 'text-amber-500' : 'text-red-500'

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-ink-1 text-sm mb-3">Squad Health</h2>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className={`text-2xl font-bold ${color}`}>
            {availabilityPct != null ? `${availabilityPct}%` : '—'}
          </div>
          <div className="text-[10px] text-ink-3 mt-0.5">Available</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${injuryCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
            {injuryCount}
          </div>
          <div className="text-[10px] text-ink-3 mt-0.5">Injuries</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${uncertainCount > 0 ? 'text-amber-500' : 'text-ink-3'}`}>
            {uncertainCount}
          </div>
          <div className="text-[10px] text-ink-3 mt-0.5">Uncertain</div>
        </div>
      </div>

      {availabilityPct != null && (
        <div className="h-1.5 bg-surface-3 rounded-full mb-4">
          <div
            className={`h-full rounded-full transition-all duration-700 ${availabilityPct >= 80 ? 'bg-green-400' : availabilityPct >= 65 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${availabilityPct}%` }}
          />
        </div>
      )}

      {atRisk?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">At-risk players</p>
          <div className="space-y-1">
            {atRisk.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <span className="text-ink-1">{p.name}</span>
                {p.attendanceRate != null && (
                  <span className="text-[10px] text-red-500 font-medium">{p.attendanceRate}% attendance</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {availableCount != null && (
        <div className="mt-3 text-[10px] text-ink-3">
          {availableCount} confirmed · {unavailableCount ?? 0} unavailable
        </div>
      )}
    </section>
  )
}

// ── Section: Fixture Readiness ────────────────────────────────────────────────

function FixtureReadinessCard({ data, loading }) {
  if (loading) return <IntelligenceSkeleton h="h-44" />
  const fr = data?.fixtureReadiness
  if (!fr) return (
    <section className="card p-5">
      <h2 className="font-semibold text-ink-1 text-sm mb-3">Fixture Readiness</h2>
      <p className="text-xs text-ink-3">No upcoming fixture found</p>
    </section>
  )

  const { nextFixture, readinessPct, selectionConfidence, trainingConfidence, medicalAlertCount } = fr

  function Gauge({ label, value }) {
    if (value == null) return null
    const color = value >= 80 ? 'bg-green-400' : value >= 65 ? 'bg-amber-400' : 'bg-red-400'
    const textColor = value >= 80 ? 'text-green-500' : value >= 65 ? 'text-amber-500' : 'text-red-500'
    return (
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-ink-2">{label}</span>
          <span className={`font-semibold ${textColor}`}>{value}%</span>
        </div>
        <div className="h-1.5 bg-surface-3 rounded-full">
          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${value}%` }} />
        </div>
      </div>
    )
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-ink-1 text-sm mb-1">Fixture Readiness</h2>
      {nextFixture && (
        <p className="text-xs text-ink-3 mb-3">
          vs {nextFixture.opponent}
          {nextFixture.competition && ` · ${nextFixture.competition}`}
          {nextFixture.daysToKickoff != null && ` · ${nextFixture.daysToKickoff}d`}
        </p>
      )}

      <div className="space-y-3">
        <Gauge label="Overall readiness"       value={readinessPct} />
        <Gauge label="Selection confidence"    value={selectionConfidence} />
        <Gauge label="Training confidence"     value={trainingConfidence} />
      </div>

      {medicalAlertCount > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
          <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 shrink-0">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M6 3.5V6.5M6 8.5v.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          {medicalAlertCount} high-severity medical alert{medicalAlertCount > 1 ? 's' : ''}
        </div>
      )}

      {nextFixture?.prepStage && (
        <div className="mt-2 text-[10px] text-ink-3">
          Prep stage: <span className="capitalize font-medium text-ink-2">{nextFixture.prepStage.toLowerCase()}</span>
        </div>
      )}
    </section>
  )
}

// ── Section: Intelligence Timeline ────────────────────────────────────────────

const FIXTURE_FILTER_OPTIONS = [
  { label: 'All fixtures', value: '' },
  { label: 'vs Naas RFC',        value: 'fix-naas' },
  { label: 'vs Bective Rangers', value: 'fix-bective' },
  { label: 'vs Terenure',        value: 'fix-terenure' },
  { label: 'vs Clontarf RFC',    value: 'fix-clontarf' },
]

function TimelineCard({ data, loading }) {
  const [fixtureFilter, setFixtureFilter] = useState('')

  if (loading) return <IntelligenceSkeleton h="h-72" />

  const raw    = data?.timeline?.events ?? []
  const stats  = data?.timeline?.stats ?? {}
  const total  = data?.timeline?.total ?? 0
  const events = fixtureFilter ? raw.filter(e => e.fixtureId === fixtureFilter) : raw

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div>
          <h2 className="font-semibold text-ink-1 text-sm">Intelligence Timeline</h2>
          <p className="text-[10px] text-ink-3 mt-0.5">AI memory — {total} events recorded</p>
        </div>
        <select
          value={fixtureFilter}
          onChange={e => setFixtureFilter(e.target.value)}
          className="text-[10px] bg-surface-2 border border-border-subtle rounded-lg px-2 py-1 text-ink-2 focus:outline-none focus:border-accent shrink-0"
          aria-label="Filter by fixture"
        >
          {FIXTURE_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {stats.byStatus && (
        <div className="flex gap-3 mb-3 text-[10px]">
          <span className="text-blue-500 font-medium">{stats.byStatus.new ?? 0} new</span>
          <span className="text-amber-500">{stats.byStatus.acknowledged ?? 0} ack</span>
          <span className="text-green-500">{stats.byStatus.completed ?? 0} done</span>
          <span className="text-ink-3">{stats.actionRate ?? 0}% action rate</span>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-xs text-ink-3 py-4 text-center">
          {fixtureFilter ? 'No events for this fixture' : 'No timeline events yet'}
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-0 pr-1 scrollbar-thin">
          {events.map(e => <TimelineEventRow key={e.id} event={e} compact />)}
        </div>
      )}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntelligenceDashboardPage() {
  const { data, loading, error, reload } = useIntelligenceDashboard()

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">

      <IntelligencePageHeader
        title="Intelligence Dashboard"
        subtitle="Coach's Eye Intelligence · All data generated by the AI Brain"
        generatedAt={data?.generatedAt}
        isMock={data?.isMock}
        loading={loading}
        onRefresh={reload}
      />

      {/* Error banner */}
      {error && !data && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400">
          Intelligence service unavailable — showing preview data. ({error})
        </div>
      )}

      {/* KPI strip */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Club Score',  value: data.clubScore?.overall != null ? `${data.clubScore.overall}/100` : '—', sub: data.clubScore?.trend ?? '', color: (data.clubScore?.overall ?? 0) >= 65 ? 'text-green-500' : 'text-red-500' },
            { label: 'Availability', value: data.squadHealth?.availabilityPct != null ? `${data.squadHealth.availabilityPct}%` : '—', sub: `${data.squadHealth?.injuryCount ?? 0} injured`, color: (data.squadHealth?.availabilityPct ?? 0) >= 80 ? 'text-green-500' : 'text-amber-500' },
            { label: 'Open Alerts', value: data.recommendations?.filter(r => r.priority === 'HIGH').length ?? 0, sub: `${data.recommendations?.length ?? 0} total recs`, color: (data.recommendations?.filter(r => r.priority === 'HIGH').length ?? 0) > 0 ? 'text-red-500' : 'text-green-500' },
            { label: 'Timeline',    value: data.timeline?.stats?.actionRate != null ? `${data.timeline.stats.actionRate}%` : '—', sub: `${data.timeline?.total ?? 0} events`, color: 'text-ink-2' },
          ].map(k => (
            <div key={k.label} className="card px-4 py-3">
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] font-medium text-ink-2 mt-0.5">{k.label}</div>
              <div className="text-[10px] text-ink-3 capitalize">{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Left column */}
        <div className="space-y-5">
          <ClubScoreCard       data={data} loading={loading} />
          <ObservationsCard    data={data} loading={loading} />
          <RecommendationsCard data={data} loading={loading} />
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <SquadHealthCard      data={data} loading={loading} />
          <FixtureReadinessCard data={data} loading={loading} />
          <TimelineCard         data={data} loading={loading} />
        </div>

      </div>

      {/* Footer attribution */}
      <div className="text-[10px] text-ink-3 text-center pb-2">
        Coach's Eye Intelligence · Read-only · Feature flag: <code className="font-mono">aiDashboard</code>
      </div>
    </div>
  )
}
