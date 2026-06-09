import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'
import { SkeletonBlock } from '../ui/Spinner.jsx'

const URGENCY_DOT   = { high: 'dot-danger', medium: 'dot-warning', low: 'dot-neutral' }
const URGENCY_BADGE = { high: 'danger',     medium: 'warning',     low: 'neutral' }

export default function TodayPriorities({ briefing, loading }) {
  if (loading) return (
    <Card className="p-4">
      <SkeletonBlock className="h-4 w-1/3 mb-3" />
      {[1,2,3].map(i => <SkeletonBlock key={i} className="h-10 w-full mb-2" />)}
    </Card>
  )

  const priorities = briefing?.priorities ?? []

  return (
    <Card className="p-4">
      <CardHeader
        title="Today's Priorities"
        action={
          <span className="text-xs text-ink-3">
            {new Date().toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
        }
      />
      {briefing?.summary && (
        <p className="text-xs text-ink-3 mb-3 leading-relaxed">{briefing.summary}</p>
      )}
      {priorities.length === 0
        ? <EmptyState icon="✅" title="All clear" description="No priority items today" />
        : (
          <div className="space-y-2">
            {priorities.map((p, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-3 transition-colors cursor-pointer group">
                <div className={`${URGENCY_DOT[p.urgency] ?? 'dot-neutral'} mt-1.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-1 leading-tight">{p.text}</p>
                  {p.tag && <Badge variant="neutral" className="mt-1 text-[10px]">{p.tag}</Badge>}
                </div>
                <Badge variant={URGENCY_BADGE[p.urgency] ?? 'neutral'} className="flex-shrink-0 text-[10px] capitalize">
                  {p.urgency}
                </Badge>
              </div>
            ))}
          </div>
        )
      }
    </Card>
  )
}
