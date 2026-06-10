import { useSeasonPhase, useTimeline, useLearningStatus } from '../hooks/useClubData.js'
import { Card, CardHeader } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { SkeletonBlock } from '../components/ui/Spinner.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'

const IMPACT_VARIANT = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'neutral' }
const TYPE_ICON = {
  FIXTURE:     '⚽',
  PREDICTION:  '📊',
  RISK:        '⚠️',
  REMINDER:    '📩',
  OPPORTUNITY: '⭐',
  MILESTONE:   '🏆',
}

const STAGE_LABELS = {
  COLD_START: 'Learning',
  EARLY:      'Early',
  GROWING:    'Growing',
  MATURE:     'Mature',
  EXPERT:     'Expert',
}

function PhaseCard({ phase, loading }) {
  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      <SkeletonBlock className="h-3 w-2/3 mb-2" />
      <SkeletonBlock className="h-3 w-1/2" />
    </Card>
  )

  const meta         = phase?.meta ?? {}
  const presc        = phase?.prescription ?? {}
  const attTarget    = presc.attendanceExpectation?.target
  const intensity    = presc.intensityLevel
  const focus        = presc.trainingFocus

  const intensityVariant = { HIGH: 'danger', MEDIUM: 'warning', BUILD: 'warning', LOW: 'success', RECOVERY: 'success' }

  return (
    <Card className="p-4">
      <CardHeader title="Season Phase" action={
        phase?.phase
          ? <Badge variant="accent" className="text-[10px]">{meta.label ?? phase.phase}</Badge>
          : null
      } />

      {!phase?.phase ? (
        <EmptyState icon="📅" title="Phase unavailable" description="Season Intelligence not connected" />
      ) : (
        <div className="space-y-3">
          {meta.description && (
            <p className="text-xs text-ink-3 leading-relaxed">{meta.description}</p>
          )}
          <div className="space-y-2">
            {attTarget != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-3">Attendance target</span>
                <span className="font-semibold text-ink-1">{attTarget}%</span>
              </div>
            )}
            {intensity && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-3">Training intensity</span>
                <Badge variant={intensityVariant[intensity] ?? 'neutral'} className="text-[10px]">{intensity}</Badge>
              </div>
            )}
            {focus && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-3">Focus</span>
                <span className="font-medium text-ink-2 text-right max-w-[60%]">{focus}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function CISCard({ status, loading }) {
  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      <SkeletonBlock className="h-16 w-full mb-2" />
      <SkeletonBlock className="h-3 w-2/3" />
    </Card>
  )

  const cis      = status?.cis ?? {}
  const accuracy = status?.accuracy?.overall ?? {}

  const gradeVariant = { A: 'success', B: 'success', C: 'warning', D: 'danger', F: 'danger', 'N/A': 'neutral' }
  const scoreColor = (s) => s >= 70 ? '#22C55E' : s >= 50 ? '#EAB308' : '#EF4444'

  return (
    <Card className="p-4">
      <CardHeader title="Club Intelligence" action={
        cis.grade
          ? <Badge variant={gradeVariant[cis.grade] ?? 'neutral'}>Grade {cis.grade}</Badge>
          : null
      } />

      {cis.score == null || cis.score === 0 ? (
        <EmptyState icon="✦" title="Building intelligence" description="Platform learns with each coaching decision" />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-black" style={{ color: scoreColor(cis.score) }}>{cis.score}</div>
            <div className="flex-1">
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${cis.score}%`, background: scoreColor(cis.score) }} />
              </div>
              <p className="text-[10px] text-ink-3 mt-1">{STAGE_LABELS[cis.stage] ?? cis.stage} · out of 100</p>
            </div>
          </div>

          {accuracy.f1 > 0 && (
            <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-surface-1">
              <span className="text-ink-3">Prediction accuracy</span>
              <span className="font-semibold text-success">{Math.round(accuracy.f1 * 100)}% F1</span>
            </div>
          )}

          {cis.topStrengths?.length > 0 && (
            <div>
              <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1.5">Top strengths</p>
              <div className="flex flex-wrap gap-1">
                {cis.topStrengths.slice(0, 3).map((s, i) => (
                  <Badge key={i} variant="success" className="text-[10px]">{s}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function TimelineCard({ timeline, loading }) {
  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      {[1,2,3].map(i => <SkeletonBlock key={i} className="h-12 w-full mb-2" />)}
    </Card>
  )

  const byDay = timeline?.byDay ?? []

  return (
    <Card className="p-4">
      <CardHeader
        title="14-Day AI Timeline"
        action={
          timeline?.automatableCount > 0
            ? <Badge variant="accent" className="text-[10px]">{timeline.automatableCount} automatable</Badge>
            : null
        }
      />
      {byDay.length === 0 ? (
        <EmptyState icon="📅" title="No upcoming events" description="Assistant is analysing your schedule" />
      ) : (
        <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
          {byDay.slice(0, 10).map(day => (
            <div key={day.date}>
              <div className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5 sticky top-0 bg-surface-2 py-0.5 rounded px-1">
                {day.label}
              </div>
              <div className="space-y-1.5 pl-1">
                {day.events.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-surface-3 transition-colors">
                    <span className="text-base flex-shrink-0 mt-0.5">{ev.icon ?? TYPE_ICON[ev.type] ?? '●'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-ink-1">{ev.title}</span>
                        {ev.impact && ev.impact !== 'LOW' && (
                          <Badge variant={IMPACT_VARIANT[ev.impact] ?? 'neutral'} className="text-[10px]">{ev.impact}</Badge>
                        )}
                        {ev.automatable && (
                          <Badge variant="accent" className="text-[10px]">Auto</Badge>
                        )}
                      </div>
                      {ev.description && (
                        <p className="text-[11px] text-ink-3 mt-0.5 leading-relaxed">{ev.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function SeasonPage() {
  const phase    = useSeasonPhase()
  const timeline = useTimeline()
  const status   = useLearningStatus()

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-1">Season Intelligence</h1>
        <p className="text-sm text-ink-3 mt-0.5">Phase-aware planning · 14-day AI outlook · Club intelligence</p>
      </div>

      {/* Row 1: Phase + CIS side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <PhaseCard  phase={phase.data}   loading={phase.loading} />
        <CISCard    status={status.data} loading={status.loading} />
      </div>

      {/* Row 2: Full-width timeline */}
      <TimelineCard timeline={timeline.data} loading={timeline.loading} />
    </div>
  )
}
