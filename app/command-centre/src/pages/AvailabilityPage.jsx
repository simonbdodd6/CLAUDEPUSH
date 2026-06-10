import { useAvailabilityIntelligence } from '../hooks/useClubData.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(risk) {
  if (risk === 'high')   return 'text-red-600 dark:text-red-400'
  if (risk === 'medium') return 'text-amber-600 dark:text-amber-400'
  return 'text-green-600 dark:text-green-400'
}

function riskBadge(risk) {
  if (risk === 'high')   return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  if (risk === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
}

function statusColor(status) {
  if (status === 'critical')     return 'text-red-600 dark:text-red-400'
  if (status === 'below-target') return 'text-amber-600 dark:text-amber-400'
  if (status === 'on-target')    return 'text-green-600 dark:text-green-400'
  return 'text-ink-3'
}

function trendIcon(trend) {
  if (trend === 'declining') return '↘'
  if (trend === 'strong')    return '↗'
  return '→'
}

function trendColor(trend) {
  if (trend === 'declining') return 'text-red-500'
  if (trend === 'strong')    return 'text-green-500'
  return 'text-amber-500'
}

function GaugeBar({ value, target, minimum }) {
  if (value == null) return null
  const clamped = Math.max(0, Math.min(100, value))
  const color = value >= target ? 'bg-green-500' : value >= minimum ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="relative h-2.5 rounded-full bg-surface-3 overflow-visible mt-2">
      {/* minimum line */}
      <div
        className="absolute top-[-2px] h-[18px] w-0.5 bg-amber-400/60 z-10"
        style={{ left: `${minimum}%` }}
        title={`Minimum: ${minimum}%`}
      />
      {/* target line */}
      <div
        className="absolute top-[-2px] h-[18px] w-0.5 bg-green-500/60 z-10"
        style={{ left: `${target}%` }}
        title={`Target: ${target}%`}
      />
      {/* filled bar */}
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ── Section: Summary header ───────────────────────────────────────────────────

function SummaryCard({ summary, phaseTarget, narrative, loading }) {
  if (loading) return <div className="card p-5 animate-pulse h-32 bg-surface-2 rounded-xl" />

  const { averageRate, trend, vsTarget, phase, phaseLabel, confidence } = summary ?? {}
  const status = vsTarget?.status ?? 'unknown'

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-ink-1">Availability Intelligence</h2>
          <p className="text-xs text-ink-3 mt-0.5">
            {phaseLabel ?? phase ?? 'Season'} · AI-assisted attendance analysis
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl font-black tabular-nums ${statusColor(status)}`}>
            {averageRate != null ? `${averageRate}%` : '—'}
          </div>
          <div className={`text-xs font-semibold mt-0.5 ${trendColor(trend)}`}>
            {trendIcon(trend)} {trend === 'declining' ? 'Declining' : trend === 'strong' ? 'Strong' : 'Stable'}
          </div>
        </div>
      </div>

      {phaseTarget && averageRate != null && (
        <>
          <GaugeBar value={averageRate} target={phaseTarget.target} minimum={phaseTarget.minimum} />
          <div className="flex items-center justify-between text-[11px] text-ink-3 mt-1.5">
            <span>Min {phaseTarget.minimum}%</span>
            <span className={statusColor(status)}>
              {vsTarget?.gap != null
                ? vsTarget.gap >= 0
                  ? `+${vsTarget.gap}% above target`
                  : `${vsTarget.gap}% below target`
                : 'No data'}
            </span>
            <span>Target {phaseTarget.target}%</span>
          </div>
        </>
      )}

      {phaseTarget?.note && (
        <p className="text-[11px] text-ink-3 mt-2 italic border-t border-border-subtle pt-2">
          {phaseTarget.note}
        </p>
      )}

      {narrative && (
        <p className="text-sm text-ink-2 mt-3 leading-relaxed border-t border-border-subtle pt-3">
          {narrative}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="text-[10px] text-ink-3">AI confidence: {confidence ?? 0}%</span>
      </div>
    </div>
  )
}

// ── Section: Next session prediction ─────────────────────────────────────────

function PredictionCard({ prediction, loading }) {
  if (loading) return <div className="card p-4 animate-pulse h-24 bg-surface-2 rounded-xl" />
  if (!prediction) return null

  const { label, predicted, basis, confidence, warning } = prediction

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider">Session Prediction</p>
        <span className="text-[10px] text-ink-3">{confidence ?? 0}% confidence</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black tabular-nums text-ink-1">
          {predicted != null ? `${predicted}%` : '—'}
        </span>
        <span className="text-xs text-ink-3">{label}</span>
      </div>
      <p className="text-xs text-ink-3 mt-1">{basis}</p>
      {warning && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium">⚠ {warning}</p>
      )}
    </div>
  )
}

// ── Section: Declining teams ──────────────────────────────────────────────────

function DecliningTeamsCard({ teams, loading }) {
  if (loading) return null
  if (!teams?.length) return null

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-3">Teams Requiring Attention</p>
      <div className="flex flex-col gap-2">
        {teams.map(t => (
          <div key={t.id} className="flex items-center justify-between">
            <span className="text-sm text-ink-1">{t.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-ink-1 tabular-nums">{t.rate ?? '—'}%</span>
              <span className="text-xs font-semibold text-red-500 tabular-nums">
                {t.trend != null ? `${t.trend > 0 ? '+' : ''}${t.trend}%` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Section: At-risk players ──────────────────────────────────────────────────

function AtRiskTable({ players, loading }) {
  if (loading) return <div className="card p-4 animate-pulse h-40 bg-surface-2 rounded-xl" />

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider">At-Risk Players</p>
        <span className="text-[10px] text-ink-3">
          {players?.length ? `${players.length} below threshold` : 'All players on track'}
        </span>
      </div>
      {!players?.length ? (
        <div className="px-4 py-6 text-center text-sm text-ink-3">
          No players flagged as at-risk — attendance is healthy across the squad.
        </div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {players.map(p => (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-1 truncate">{p.name}</p>
                <p className="text-xs text-ink-3 truncate">{p.reason}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-bold tabular-nums ${riskColor(p.risk)}`}>
                  {p.attendanceRate}%
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${riskBadge(p.risk)}`}>
                  {p.risk?.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section: Recommendations ─────────────────────────────────────────────────

function RecsCard({ recs, loading }) {
  if (loading) return <div className="card p-4 animate-pulse h-28 bg-surface-2 rounded-xl" />
  if (!recs?.length) return null

  const effortColor = e => e === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : e === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-border-subtle">
        <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider">AI Recommendations</p>
      </div>
      <div className="divide-y divide-border-subtle">
        {recs.map(r => (
          <div key={r.id ?? r.action} className="px-4 py-3 flex items-start gap-3">
            <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${effortColor(r.effort)}`}>
              {r.effort?.toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-1 leading-snug">{r.action}</p>
              {r.why && <p className="text-xs text-ink-3 mt-0.5 leading-relaxed">{r.why}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const { data, loading, error } = useAvailabilityIntelligence()

  const intel = data ?? {}
  const { summary, phaseTarget, atRisk, decliningTeams, sessionPrediction, recommendations, narrative } = intel

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-1">Availability</h1>
        <p className="text-sm text-ink-3 mt-1">
          AI-assisted attendance analysis · Predictions and at-risk alerts
        </p>
      </div>

      {error && !data && (
        <div className="card p-4 mb-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
          <p className="text-sm text-red-700 dark:text-red-400">
            Intelligence engine unavailable — showing cached data. {error}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <SummaryCard
          summary={summary}
          phaseTarget={phaseTarget}
          narrative={narrative}
          loading={loading}
        />

        <div className="grid grid-cols-2 gap-4">
          <PredictionCard prediction={sessionPrediction} loading={loading} />
          <div className="card p-4">
            <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-2">At-Risk Players</p>
            <div className="text-2xl font-black text-ink-1 tabular-nums">
              {loading ? '…' : (summary?.atRiskCount ?? 0)}
            </div>
            <p className="text-xs text-ink-3 mt-1">
              {loading ? '' : summary?.atRiskCount
                ? `${summary.atRiskCount} player${summary.atRiskCount > 1 ? 's' : ''} below threshold`
                : 'All players on track'}
            </p>
          </div>
        </div>

        <DecliningTeamsCard teams={decliningTeams} loading={loading} />
        <AtRiskTable players={atRisk} loading={loading} />
        <RecsCard recs={recommendations} loading={loading} />
      </div>
    </div>
  )
}
