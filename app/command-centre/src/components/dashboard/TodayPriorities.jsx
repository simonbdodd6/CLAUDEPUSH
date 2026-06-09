import { Card, CardHeader } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { EmptyState } from '../ui/EmptyState.jsx'

const DEMO_PRIORITIES = [
  { text: 'Training reminder not sent for Senior squad', urgency: 'high', action: 'comms.training_reminder', tag: 'Communications' },
  { text: '3 players awaiting return-to-play clearance', urgency: 'high', action: 'players.return_to_play', tag: 'Players' },
  { text: 'Weekly committee pack not yet generated', urgency: 'medium', action: 'committee.weekly_pack', tag: 'Committee' },
  { text: 'Sponsor renewal due in 18 days', urgency: 'medium', action: 'committee.sponsor_summary', tag: 'Finance' },
  { text: 'U14 match report from Saturday outstanding', urgency: 'low', action: 'comms.match_report', tag: 'Comms' },
]

const URGENCY_DOT = { high: 'dot-danger', medium: 'dot-warning', low: 'dot-neutral' }
const URGENCY_BADGE = { high: 'danger', medium: 'warning', low: 'neutral' }

export default function TodayPriorities({ data }) {
  const priorities = DEMO_PRIORITIES  // In production: derive from data

  return (
    <Card className="p-4">
      <CardHeader
        title="Today's Priorities"
        action={<span className="text-xs text-ink-3">{new Date().toLocaleDateString('en-IE', { weekday:'long', day:'numeric', month:'short' })}</span>}
      />
      {priorities.length === 0
        ? <EmptyState icon="✅" title="All clear" description="No priority items today" />
        : (
          <div className="space-y-2">
            {priorities.map((p, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-3 transition-colors cursor-pointer group">
                <div className={`${URGENCY_DOT[p.urgency]} mt-1.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-1 leading-tight">{p.text}</p>
                  <Badge variant="neutral" className="mt-1 text-[10px]">{p.tag}</Badge>
                </div>
                <Badge variant={URGENCY_BADGE[p.urgency]} className="flex-shrink-0 text-[10px] capitalize">
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
