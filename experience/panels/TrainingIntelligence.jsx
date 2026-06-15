import { Card } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'

// TrainingIntelligence panel (M40) — renders the VisualModel `training` slice
// (the session plan the AI Brain designed). Presentation only: lists given
// objectives/phases, computes/schedules/selects nothing.
export default function TrainingIntelligence({ training }) {
  const t = training ?? {}
  const objectives = t.objectives ?? []
  const phases = t.phases ?? []
  const totalPhaseMin = phases.reduce((s, p) => s + (p.durationMin || 0), 0)

  return (
    <section id="area-training">
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="section-title">Training Intelligence</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hud-cyan/10 text-hud-cyan hud-mono">{t.state ?? 'idle'}</span>
            </div>
            <div className="text-lg font-semibold text-hud-ink mt-2">{t.theme || '—'}</div>
            {t.workloadStatus && <Badge variant="accent" className="text-[10px] mt-1 capitalize">{t.workloadStatus}</Badge>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-hud-cyan">{t.durationMin ?? 0}<span className="text-sm">m</span></div>
            <div className="hud-mono text-[9px] text-ink-3">Session</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <div className="section-title mb-2">Objectives</div>
            <div className="space-y-2">
              {objectives.map((o, i) => (
                <div key={i}>
                  <div className="text-xs text-ink-1">{o.label}</div>
                  {o.outcome && <div className="text-[11px] text-ink-3">{o.outcome}</div>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title mb-2">Session phases</div>
            <div className="space-y-1.5">
              {phases.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-ink-2 flex-1">{p.label}</span>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden w-24">
                    <div className="h-full rounded-full bg-hud-cyan/70" style={{ width: `${totalPhaseMin ? Math.round(((p.durationMin || 0) / totalPhaseMin) * 100) : 0}%` }} />
                  </div>
                  <span className="hud-mono text-[10px] text-ink-3 w-8 text-right">{p.durationMin}m</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </section>
  )
}
