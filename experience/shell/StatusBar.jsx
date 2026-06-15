// StatusBar (Experience Layer, M32) — renders the VisualModel `system` slice.
// Presentation only: consumes a prop, computes nothing, fetches nothing.

const STATE_DOT = {
  live:        'bg-hud-green',
  placeholder: 'bg-hud-cyan',
  locked:      'bg-ink-3',
  idle:        'bg-ink-3',
}

export default function StatusBar({ system }) {
  const s = system ?? {}
  const dot = STATE_DOT[s.state] ?? 'bg-ink-3'
  const confidencePct = Math.round((s.confidence ?? 0) * 100)

  return (
    <div className="flex items-center gap-5 px-6 py-2 border-b border-border-subtle bg-surface-1/60 backdrop-blur-md hud-mono text-[10px] text-hud-muted">
      <span className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot} hud-pulse`} />
        <span className="text-hud-ink">{(s.state ?? 'idle').toUpperCase()}</span>
      </span>
      <Stat label="Capabilities" value={s.capabilitiesOnline ?? 0} />
      <Stat label="Confidence" value={`${confidencePct}%`} />
      <Stat label="Tier" value={(s.tier ?? '—').toUpperCase()} />
      <Stat label="Latency" value={`${s.latencyMs ?? 0}ms`} />
      <span className="ml-auto text-ink-3">Experience Layer · animated placeholder</span>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-ink-3">{label}</span>
      <span className="text-hud-ink tracking-normal">{value}</span>
    </span>
  )
}
