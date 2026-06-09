import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SkeletonBlock } from '../ui/Spinner.jsx'

const CAT_BADGE = {
  COACHING: 'accent', PLAYERS: 'success', COMMUNICATIONS: 'warning',
  COMMITTEE: 'neutral', CLUB_OPERATIONS: 'neutral', DIRECTOR_OF_RUGBY: 'danger',
}

export default function ActionHistoryFeed({ data, loading }) {
  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      {[1,2,3].map(i => <SkeletonBlock key={i} className="h-10 w-full mb-2" />)}
    </Card>
  )

  const history = data?.history ?? []
  const stats   = data?.stats ?? {}

  return (
    <Card className="p-4">
      <CardHeader
        title="Action History"
        action={stats.total > 0 ? <span className="text-xs text-ink-3">{stats.total} total · {stats.avgDurationMs}ms avg</span> : null}
      />
      {history.length === 0
        ? <EmptyState icon="⚡" title="No actions yet" description="Run your first action from Quick Actions or ⌘K" />
        : (
          <div className="space-y-1.5">
            {history.slice(0, 8).map((h, i) => (
              <div key={i} className="flex items-center gap-2.5 py-2 border-b border-border-subtle last:border-0">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] flex-shrink-0 ${h.success ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                  {h.success ? '✓' : '✕'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink-1 truncate">{h.actionName}</p>
                  {h.summary && <p className="text-[10px] text-ink-3 truncate">{h.summary}</p>}
                </div>
                <Badge variant={CAT_BADGE[h.category] ?? 'neutral'} className="text-[9px] flex-shrink-0">
                  {h.category?.replace('_',' ').slice(0,8)}
                </Badge>
                <span className="text-[10px] text-ink-3 flex-shrink-0">{h.durationMs}ms</span>
              </div>
            ))}
          </div>
        )
      }
    </Card>
  )
}
