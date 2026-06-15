import { Card } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { EmptyState } from '../components/ui/EmptyState.jsx'

// ExecutiveRecommendations panel (M38) — renders the VisualModel
// `executiveRecommendations` slice (recommendations PRODUCED by the AI Brain).
// Presentation only: lists given items, computes/ranks/generates nothing.
const PRIORITY_VARIANT = { high: 'danger', medium: 'warning', low: 'neutral' }

export default function ExecutiveRecommendations({ executiveRecommendations }) {
  const r = executiveRecommendations ?? {}
  const items = r.items ?? []

  return (
    <section id="area-recommendations">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="section-title">Executive Recommendations</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hud-cyan/10 text-hud-cyan hud-mono">{r.state ?? 'idle'}</span>
          <span className="ml-auto hud-mono text-[10px] text-ink-3">{items.length} active</span>
        </div>

        {items.length === 0 ? (
          <EmptyState icon="✓" title="No active recommendations" description="The AI Brain has nothing flagged right now." />
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={item.id ?? i} className="flex items-start gap-3 p-3 rounded-lg bg-surface-1 border border-border-subtle">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.priority && <Badge variant={PRIORITY_VARIANT[item.priority] ?? 'neutral'} className="text-[10px] capitalize">{item.priority}</Badge>}
                    {item.category && <Badge variant="accent" className="text-[10px]">{item.category}</Badge>}
                    <span className="text-sm text-ink-1 font-medium">{item.title}</span>
                  </div>
                  {item.detail && <p className="text-xs text-ink-3 mt-1">{item.detail}</p>}
                </div>
                {item.confidence > 0 && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-hud-cyan">{item.confidence}%</div>
                    <div className="hud-mono text-[8px] text-ink-3">confidence</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}
