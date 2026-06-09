import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SkeletonBlock } from '../ui/Spinner.jsx'

export function InjuryAlerts({ data, loading }) {
  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      {[1,2,3].map(i => <SkeletonBlock key={i} className="h-10 w-full mb-2" />)}
    </Card>
  )

  const injuries = data?.injuries ?? []

  return (
    <Card className="p-4">
      <CardHeader
        title="Injury Alerts"
        action={<Badge variant={injuries.length > 0 ? 'danger' : 'success'}>{injuries.length}</Badge>}
      />
      {injuries.length === 0
        ? <EmptyState icon="🩺" title="All clear" description="No active injuries on record" />
        : (
          <div className="space-y-2">
            {injuries.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-1 border border-border-subtle hover:border-border transition-colors">
                <div className="w-8 h-8 rounded-full bg-danger/15 flex items-center justify-center text-danger text-xs font-bold flex-shrink-0">
                  {p.name?.[0] ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-1 truncate">{p.name}</div>
                  <div className="text-xs text-ink-3 truncate">{p.injury} · {p.position}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="badge-danger badge text-[10px]">{p.status}</div>
                  {p.returnDate && <div className="text-[10px] text-ink-3 mt-0.5">Back {p.returnDate}</div>}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </Card>
  )
}

export function AttendanceAlerts({ data, loading }) {
  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      {[1,2].map(i => <SkeletonBlock key={i} className="h-10 w-full mb-2" />)}
    </Card>
  )

  const absentees = data?.absentees ?? []

  return (
    <Card className="p-4">
      <CardHeader
        title="Attendance Alerts"
        action={<Badge variant={absentees.length > 0 ? 'warning' : 'success'}>{absentees.length}</Badge>}
      />
      {absentees.length === 0
        ? <EmptyState icon="📅" title="All good" description="No attendance concerns this season" />
        : (
          <div className="space-y-2">
            {absentees.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-1 border border-border-subtle hover:border-border transition-colors">
                <div className="w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center text-warning text-xs font-bold flex-shrink-0">
                  {p.name?.[0] ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-1 truncate">{p.name}</div>
                  <div className="text-xs text-ink-3">{p.missedSessions} sessions missed</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-sm font-semibold ${p.attendanceRate < 50 ? 'text-danger' : 'text-warning'}`}>
                    {p.attendanceRate}%
                  </div>
                  <div className="text-[10px] text-ink-3">attendance</div>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </Card>
  )
}
