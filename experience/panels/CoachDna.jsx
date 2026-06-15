import { Card } from '../components/ui/Card.jsx'

// CoachDna panel (M32) — renders the VisualModel `coachDna` slice. Presentation only.
export default function CoachDna({ coachDna }) {
  const d = coachDna ?? {}
  const traits = d.traits ?? []
  const maturityPct = Math.round((d.maturity ?? 0) * 100)

  return (
    <section id="area-dna">
      <Card className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="section-title">Coach DNA</span>
              <StateChip state={d.state} />
            </div>
            <p className="text-sm text-ink-2 mt-2 max-w-xl">{d.summary}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-hud-violet">{maturityPct}%</div>
            <div className="hud-mono text-[9px] text-ink-3">Maturity</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {traits.map(t => (
            <div key={t.key}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs text-ink-1">{t.label}</span>
                <span className="hud-mono text-[10px] text-ink-3">{t.score}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${t.score}%`, background: `linear-gradient(90deg, #6366F1, #a78bfa)`, opacity: 0.4 + (t.confidence ?? 0.5) * 0.6 }}
                />
              </div>
              <div className="text-[10px] text-ink-3 mt-0.5">{t.descriptor}</div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  )
}

function StateChip({ state }) {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hud-cyan/10 text-hud-cyan hud-mono">{state ?? 'idle'}</span>
  )
}
