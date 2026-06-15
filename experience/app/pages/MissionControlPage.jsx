import { useEffect, useMemo, useRef, useState } from 'react'
import StatusBar from '../../shell/StatusBar.jsx'
import LivingNeuralBrain from '../../panels/LivingNeuralBrain.jsx'
import MemoryNetwork from '../../panels/MemoryNetwork.jsx'
import CoachDna from '../../panels/CoachDna.jsx'
import MatchReadiness from '../../panels/MatchReadiness.jsx'
import Season from '../../panels/Season.jsx'
import { placeholderVisualModel } from '../../placeholders/visual-model.js'
import { placeholderBrainState } from '../../placeholders/brain-state.js'
import { MOCK } from '../../placeholders/mock-data.js'

// MissionControlPage (M32) — the command centre. The ONLY injector of data: it
// builds a synthetic VisualModel + an animated VisualBrainState from the
// dev-only placeholders and passes them to the render layers as props. No live
// data, no /api calls, no business logic — animated placeholders only.
export default function MissionControlPage() {
  // Static synthetic model — stable reference so panels don't needlessly re-seed.
  const model = useMemo(() => placeholderVisualModel(), [])

  // Gently breathing brain state, advanced by an animation loop (throttled).
  const [brain, setBrain] = useState(() => placeholderBrainState(0))
  const startRef = useRef(null)

  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = (ts) => {
      if (startRef.current == null) startRef.current = ts
      const t = (ts - startRef.current) / 1000
      if (ts - last > 140) {            // ~7 fps state updates — the canvas brain runs at full fps internally
        last = ts
        setBrain(placeholderBrainState(t))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div>
      <StatusBar system={model.system} />

      <div className="p-6 space-y-6 max-w-[1280px] mx-auto">
        <LivingNeuralBrain brain={brain} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <MemoryNetwork memory={model.memory} />
          <MatchReadiness matchReadiness={model.matchReadiness} />
        </div>

        <CoachDna coachDna={model.coachDna} />
        <Season season={model.season} />

        <p className="hud-mono text-[9px] text-ink-3 text-center pt-2">
          Experience Layer · all surfaces are animated placeholders · synthetic source:
          {' '}{MOCK.platformStatus.engines} engines · no live data · no API calls
        </p>
      </div>
    </div>
  )
}
