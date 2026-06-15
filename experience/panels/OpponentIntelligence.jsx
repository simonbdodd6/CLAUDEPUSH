import { Card } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'

// OpponentIntelligence panel (M37) — renders the VisualModel `opponent` slice.
// Presentation only: draws given numbers/labels, computes nothing.
const SEVERITY_VARIANT = { high: 'danger', medium: 'warning', low: 'neutral' }

export default function OpponentIntelligence({ opponent }) {
  const o = opponent ?? {}
  const maturityPct = Math.round((o.maturity ?? 0) * 100)

  return (
    <section id="area-opponent">
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="section-title">Opponent Intelligence</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hud-cyan/10 text-hud-cyan hud-mono">{o.state ?? 'idle'}</span>
            </div>
            <div className="text-lg font-semibold text-hud-ink mt-2">{o.name ?? '—'}</div>
            <p className="text-sm text-ink-2 mt-1 max-w-xl">{o.summary}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-hud-cyan">{maturityPct}%</div>
            <div className="hud-mono text-[9px] text-ink-3">Profile</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <TraitList title="Strengths" traits={o.strengths ?? []} color="#fb7185" />
          <TraitList title="Weaknesses" traits={o.weaknesses ?? []} color="#34d399" />
          <div>
            <div className="section-title mb-2">Threats</div>
            <div className="space-y-1.5">
              {(o.threats ?? []).map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  {t.severity && <Badge variant={SEVERITY_VARIANT[t.severity] ?? 'neutral'} className="text-[10px] capitalize">{t.severity}</Badge>}
                  <span className="text-xs text-ink-2">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title mb-2">Opportunities</div>
            <div className="space-y-1.5">
              {(o.opportunities ?? []).map((op, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-ink-3">
                  <span className="mt-0.5 text-hud-green">›</span>
                  <span>{op.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </section>
  )
}

function TraitList({ title, traits, color }) {
  return (
    <div>
      <div className="section-title mb-2">{title}</div>
      <div className="space-y-2">
        {traits.map(t => (
          <div key={t.key ?? t.label}>
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-xs text-ink-1">{t.label}</span>
              <span className="hud-mono text-[10px] text-ink-3">{t.score}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(0, Math.min(100, t.score ?? 0))}%`, background: color, opacity: 0.35 + (t.confidence ?? 0.5) * 0.65 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
