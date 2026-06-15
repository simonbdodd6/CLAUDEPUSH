import { Card } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'

// MatchReadiness panel (M32) — renders the VisualModel `matchReadiness` slice.
// Presentation only: draws gauges from given numbers, computes nothing.
const SEVERITY_VARIANT = { high: 'danger', medium: 'warning', low: 'neutral' }

export default function MatchReadiness({ matchReadiness }) {
  const m = matchReadiness ?? {}
  const g = m.gauges ?? {}
  const gauges = [
    { key: 'overall',      label: 'Overall',      value: g.overall ?? 0 },
    { key: 'availability', label: 'Availability', value: g.availability ?? 0 },
    { key: 'fitness',      label: 'Fitness',      value: g.fitness ?? 0 },
    { key: 'cohesion',     label: 'Cohesion',     value: g.cohesion ?? 0 },
  ]

  return (
    <section id="area-readiness">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="section-title">Match Readiness</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hud-cyan/10 text-hud-cyan hud-mono">{m.state ?? 'idle'}</span>
          <span className="ml-auto text-xs text-ink-2">{m.verdict}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {gauges.map(gauge => <Gauge key={gauge.key} {...gauge} />)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <div className="section-title mb-2">Risks</div>
            <div className="space-y-1.5">
              {(m.risks ?? []).map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge variant={SEVERITY_VARIANT[r.severity] ?? 'neutral'} className="text-[10px] capitalize">{r.severity}</Badge>
                  <span className="text-xs text-ink-2">{r.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title mb-2">Evidence</div>
            <div className="space-y-1.5">
              {(m.evidence ?? []).map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-ink-3">
                  <span className="mt-0.5 text-hud-cyan">›</span>
                  <span>{e.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </section>
  )
}

function Gauge({ label, value }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100)
  const hue = 200 + (value / 100) * 60
  return (
    <div className="flex flex-col items-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} className="health-ring-track" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r}
          className="health-ring-arc"
          strokeWidth="6"
          stroke={`hsl(${hue} 80% 60%)`}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
        <text x="36" y="40" textAnchor="middle" className="fill-ink-1" style={{ fontSize: 15, fontWeight: 600 }}>{value}</text>
      </svg>
      <span className="hud-mono text-[9px] text-ink-3 mt-1">{label}</span>
    </div>
  )
}
