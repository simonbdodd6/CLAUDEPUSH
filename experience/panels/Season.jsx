import { Card } from '../components/ui/Card.jsx'

// Season panel (M32) — renders the VisualModel `season` slice. Presentation only:
// the trajectory is drawn straight from given points; nothing is projected here.
export default function Season({ season }) {
  const s = season ?? {}
  const traj = s.trajectory ?? []
  const proj = s.projection ?? {}
  const prob = s.probabilities ?? {}

  return (
    <section id="area-season">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="section-title">Season</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-hud-cyan/10 text-hud-cyan hud-mono">{s.state ?? 'idle'}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="hud-mono text-[9px] text-ink-3 mb-2">Points trajectory</div>
            <Trajectory points={traj} />
          </div>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Stat label="Proj. points" value={proj.points ?? '—'} accent="text-hud-green" />
              <Stat label="Proj. position" value={proj.position != null ? `#${proj.position}` : '—'} accent="text-hud-cyan" />
            </div>
            <div className="space-y-2">
              <ProbBar label="Title" value={prob.title ?? 0} color="#34d399" />
              <ProbBar label="Playoff" value={prob.playoff ?? 0} color="#38bdf8" />
              <ProbBar label="Relegation" value={prob.relegation ?? 0} color="#fb7185" />
            </div>
          </div>
        </div>
      </Card>
    </section>
  )
}

function Trajectory({ points }) {
  if (!points.length) return <div className="h-28 flex items-center text-xs text-ink-3">No data</div>
  const W = 420, H = 110, pad = 6
  const xs = points.map(p => p.round)
  const ys = points.map(p => p.value)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const maxY = Math.max(1, ...ys)
  const sx = v => pad + (v - minX) / Math.max(1, maxX - minX) * (W - pad * 2)
  const sy = v => H - pad - (v / maxY) * (H - pad * 2)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.round).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ')
  const area = `${d} L${sx(maxX).toFixed(1)},${H - pad} L${sx(minX).toFixed(1)},${H - pad} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28">
      <defs>
        <linearGradient id="seasonFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#seasonFill)" />
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={sx(p.round)} cy={sy(p.value)} r="2.2" fill="#e0f2fe" />)}
    </svg>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div className={`text-2xl font-semibold ${accent}`}>{value}</div>
      <div className="hud-mono text-[9px] text-ink-3">{label}</div>
    </div>
  )
}

function ProbBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-ink-2">{label}</span>
        <span className="hud-mono text-ink-3">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}
