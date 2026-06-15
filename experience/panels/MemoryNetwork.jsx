import { useEffect, useRef } from 'react'
import { createGraphRenderer } from '../visuals/memory-network/graph-renderer.js'

// MemoryNetwork panel (M32) — mounts the salvaged 2D graph renderer and drives it
// from the VisualModel `memory` slice. Presentation only: no fetch, no compute.
export default function MemoryNetwork({ memory }) {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const r = createGraphRenderer(canvasRef.current, memory ?? { nodes: [], edges: [] })
    rendererRef.current = r
    r.start()
    return () => r.destroy()
  }, [])

  // Re-seed when the slice changes (placeholder is static in M32, but keep it correct).
  useEffect(() => {
    if (memory) rendererRef.current?.setGraph(memory)
  }, [memory])

  const activated = memory?.recentlyActivated ?? []

  return (
    <section id="area-memory" className="relative rounded-lg border border-border-subtle overflow-hidden bg-hud-bg">
      <div className="relative h-[420px] hud-nebula">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
        <div className="absolute top-3 left-4 hud-mono text-[10px] text-hud-cyan flex items-center gap-2 pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-hud-green hud-pulse" />
          Memory Network
        </div>
        <div className="absolute bottom-3 right-4 hud-mono text-[9px] text-hud-muted text-right pointer-events-none">
          <div>{memory?.nodes?.length ?? 0} nodes · {memory?.edges?.length ?? 0} links</div>
          <div className="text-ink-3">drag · scroll · hover</div>
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 border-t border-border-subtle bg-surface-1/70">
        <span className="hud-mono text-[9px] text-ink-3">Recently active</span>
        {activated.map(id => (
          <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-hud-cyan/10 text-hud-cyan">{id}</span>
        ))}
      </div>
    </section>
  )
}
