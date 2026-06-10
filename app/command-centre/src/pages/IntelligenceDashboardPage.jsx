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

// ── Colour helpers ────────────────────────────────────────────────────────────

function priorityColor(p) {
  if (p === 'HIGH')   return 'text-red-600 dark:text-red-400'
  if (p === 'MEDIUM') return 'text-amber-600 dark:text-amber-400'
  return 'text-green-600 dark:text-green-400'
}

function priorityBadge(p) {
  if (p === 'HIGH')   return 'bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-400'
  if (p === 'MEDIUM') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return                     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
}

function severityDot(s) {
  if (s === 'high')   return 'bg-red-500'
  if (s === 'medium') return 'bg-amber-400'
  return 'bg-blue-400'
}

function statusBadge(s) {
  if (s === 'new')          return 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300'
  if (s === 'acknowledged') return 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300'
  if (s === 'completed')    return 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400'
  return                           'bg-surface-3  text-ink-3'
}

function trendArrow(t) {
  if (t === 'improving') return { icon: '↑', cls: 'text-green-500' }
  if (t === 'declining') return { icon: '↓', cls: 'text-red-500' }
  return { icon: '→', cls: 'text-amber-400' }
}

function categoryDot(c) {
  const map = {
    'Medical':       'bg-red-400',
    'Selection':     'bg-orange-400',
    'Training':      'bg-amber-400',
    'Logistics':     'bg-blue-400',
    'Player Welfare':'bg-purple-400',
    'Club':          'bg-indigo-400',
    'Performance':   'bg-green-400',
  }
  return map[c] ?? 'bg-surface-3'
}

function relativeTime(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (diff < 2)   return 'just now'
  if (diff < 60)  return `${diff}m ago`
  const h = Math.floor(diff / 60)
  if (h < 24)    return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function engineLabel(e) {
  return e?.replace(/-engine$/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ?? ''
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ h = 'h-28' }) {
  return <div className={`${h} rounded-xl bg-surface-2 animate-pulse`} />
}

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
  if (loading) return <Skeleton h="h-40" />
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
  if (loading) return <Skeleton h="h-48" />
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
  if (loading) return <Skeleton h="h-56" />
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
          {recs.map(r => {
            const expanded = expandedId === r.id
            return (
              <div key={r.id} className="rounded-lg border border-border-subtle overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  className="w-full flex items-start gap-2.5 p-2.5 text-left hover:bg-surface-2 transition-colors"
                  aria-expanded={expanded}
                >
                  <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${priorityBadge(r.priority)}`}>
                    {r.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-ink-1 leading-snug">{r.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-ink-3">{r.category}</span>
                      <span className="text-[10px] text-ink-3">·</span>
                      <span className="text-[10px] text-ink-3">{r.confidence}% confidence</span>
                    </div>
                  </div>
                  <svg viewBox="0 0 12 12" fill="none" className={`w-3 h-3 text-ink-3 shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}>
                    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {expanded && (
                  <div className="px-3 pb-3 space-y-2 bg-surface-2 border-t border-border-subtle">
                    <p className="text-xs text-ink-2 pt-2">{r.description}</p>
                    <div className="rounded bg-surface-1 px-2.5 py-2">
                      <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wide mb-1">Suggested action</p>
                      <p className="text-xs text-ink-1">{r.action}</p>
                    </div>
                    <div className="rounded bg-purple-50 dark:bg-purple-900/20 px-2.5 py-2">
                      <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Why am I seeing this?</p>
                      <p className="text-[11px] text-ink-2 leading-relaxed">{r.explainability}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Section: Squad Health ─────────────────────────────────────────────────────

function SquadHealthCard({ data, loading }) {
  if (loading) return <Skeleton h="h-36" />
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
  if (loading) return <Skeleton h="h-44" />
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
  { label: 'vs Naas RFC',       value: 'fix-naas' },
  { label: 'vs Bective Rangers',value: 'fix-bective' },
  { label: 'vs Terenure',       value: 'fix-terenure' },
  { label: 'vs Clontarf RFC',   value: 'fix-clontarf' },
]

function TimelineCard({ data, loading }) {
  const [fixtureFilter, setFixtureFilter] = useState('')

  if (loading) return <Skeleton h="h-72" />

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
        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
          {events.map(e => (
            <div key={e.id} className="flex items-start gap-2 py-1.5 border-b border-border-subtle last:border-0">
              <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${categoryDot(e.category)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-1 leading-snug truncate">{e.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-ink-3">{e.category}</span>
                  {e.teamName && (
                    <>
                      <span className="text-[10px] text-ink-3">·</span>
                      <span className="text-[10px] text-ink-3">{e.teamName}</span>
                    </>
                  )}
                  <span className="text-[10px] text-ink-3">·</span>
                  <span className="text-[10px] text-ink-3">{relativeTime(e.timestamp)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[10px] font-bold ${priorityColor(e.priority)}`}>{e.priority}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${statusBadge(e.status)}`}>{e.status}</span>
              </div>
            </div>
          ))}
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

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-ink-1">Intelligence Dashboard</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-semibold tracking-wide">
              AI BRAIN
            </span>
            {data?.isMock && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 text-ink-3 font-medium">
                Preview
              </span>
            )}
          </div>
          <p className="text-xs text-ink-3">
            Coach's Eye Intelligence · All data generated by the AI Brain ·
            {data?.generatedAt ? ` Updated ${relativeTime(data.generatedAt)}` : ' Loading…'}
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-2 px-3 py-1.5 rounded-lg border border-border-subtle hover:border-border bg-surface-1 transition-colors disabled:opacity-50"
          aria-label="Refresh dashboard"
        >
          <svg viewBox="0 0 14 14" fill="none" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}>
            <path d="M12 7A5 5 0 1 1 7 2M7 2l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh
        </button>
      </div>

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
            { label: 'Club Score', value: data.clubScore?.overall != null ? `${data.clubScore.overall}/100` : '—', sub: data.clubScore?.trend ?? '', color: (data.clubScore?.overall ?? 0) >= 65 ? 'text-green-500' : 'text-red-500' },
            { label: 'Availability', value: data.squadHealth?.availabilityPct != null ? `${data.squadHealth.availabilityPct}%` : '—', sub: `${data.squadHealth?.injuryCount ?? 0} injured`, color: (data.squadHealth?.availabilityPct ?? 0) >= 80 ? 'text-green-500' : 'text-amber-500' },
            { label: 'Open Alerts', value: data.recommendations?.filter(r => r.priority === 'HIGH').length ?? 0, sub: `${data.recommendations?.length ?? 0} total recs`, color: (data.recommendations?.filter(r => r.priority === 'HIGH').length ?? 0) > 0 ? 'text-red-500' : 'text-green-500' },
            { label: 'Timeline', value: data.timeline?.stats?.actionRate != null ? `${data.timeline.stats.actionRate}%` : '—', sub: `${data.timeline?.total ?? 0} events`, color: 'text-ink-2' },
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
          <ClubScoreCard    data={data} loading={loading} />
          <ObservationsCard data={data} loading={loading} />
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
