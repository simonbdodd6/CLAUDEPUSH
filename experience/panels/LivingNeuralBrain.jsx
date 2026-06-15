import NeuralConsciousness from '../visuals/neural-brain/NeuralConsciousness.jsx'

// LivingNeuralBrain panel (M32) — frames the canonical brain and feeds it the
// injected VisualBrainState. Presentation only: it forwards a prop, computes nothing.
export default function LivingNeuralBrain({ brain }) {
  const regions = brain?.regions ?? []
  return (
    <section id="area-brain" className="relative rounded-lg border border-border-subtle overflow-hidden bg-hud-bg hud-glow-cyan">
      <div className="relative h-[440px]">
        <NeuralConsciousness brainState={brain} />
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-border-subtle bg-surface-1/70 backdrop-blur-md">
        <span className="hud-mono text-[10px] text-hud-cyan flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-hud-green hud-pulse" />
          Living Neural Brain
        </span>
        <div className="flex items-center gap-3 overflow-x-auto">
          {regions.map(r => (
            <span key={r.id} className="hud-mono text-[9px] whitespace-nowrap" style={{ color: `hsl(${r.hue} 80% 70% / ${r.awake ? 0.95 : 0.4})` }}>
              {r.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
