import { useEffect, useMemo, useRef, useState } from 'react'
import StatusBar from '../../shell/StatusBar.jsx'
import LivingNeuralBrain from '../../panels/LivingNeuralBrain.jsx'
import MemoryNetwork from '../../panels/MemoryNetwork.jsx'
import CoachDna from '../../panels/CoachDna.jsx'
import MatchReadiness from '../../panels/MatchReadiness.jsx'
import Season from '../../panels/Season.jsx'
import { createExperienceAdapter } from '../../adapter/index.js'
import { resolveInjectedBrain } from '../brain-provider.js'
import { placeholderVisualModel } from '../../placeholders/visual-model.js'
import { placeholderBrainState } from '../../placeholders/brain-state.js'
import { MOCK } from '../../placeholders/mock-data.js'

// MissionControlPage (M33) — the command centre + the adapter composition root.
// The page is the ONLY data injector: it builds the placeholder fallback, composes
// the Experience Adapter, and feeds the resulting VisualModel / VisualBrainState to
// the render layers as props. No live data, no /api calls, no business logic here.
//
// M34 activation: the adapter consumes the AI Brain ONLY through an injected
// `@brain/product-coaches-eye` façade (+ host runtime port). The browser app never
// imports @brain (so it stays standalone); instead it reads an optional, externally
// injected provider (experience/app/brain-provider.js). A host shell sets that
// provider — built by experience-host/createLiveExperienceProvider — to activate
// live Match Readiness. When it is absent (the default standalone build) the adapter
// preserves the placeholder fallback for every panel.
const EXPERIENCE_CONTEXT = {
  tier: 'professional',
  payload: { user: { tier: 'professional', coachId: 'c1' }, team: { teamId: 'team-1' } },
}

export default function MissionControlPage() {
  // Complete synthetic fallback — stable reference so panels don't needlessly re-seed.
  const fallback = useMemo(() => placeholderVisualModel(), [])

  // The adapter, fed by the optional injected brain provider. No provider (the
  // default standalone build) → facade/runtime null → every panel stays placeholder.
  const adapter = useMemo(() => {
    const brain = resolveInjectedBrain()
    return createExperienceAdapter({
      facade: brain?.facade ?? null,
      runtime: brain?.runtime ?? null,
      fallbackModel: fallback,
    })
  }, [fallback])

  // VisualModel flows THROUGH the adapter (placeholder-resolved in M33).
  const [model, setModel] = useState(fallback)
  useEffect(() => {
    let live = true
    Promise.resolve(adapter.getVisualModel(EXPERIENCE_CONTEXT)).then(m => {
      if (live && m) setModel(m)
    })
    return () => { live = false }
  }, [adapter])

  // Gently breathing brain state, routed through the adapter's activity seam.
  const [brain, setBrain] = useState(() => placeholderBrainState(0))
  const startRef = useRef(null)
  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = (ts) => {
      if (startRef.current == null) startRef.current = ts
      const t = (ts - startRef.current) / 1000
      if (ts - last > 140) {
        last = ts
        setBrain(adapter.getBrainState(t, placeholderBrainState(t)))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [adapter])

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
          Experience Layer · adapter-fed · all surfaces are placeholders until the façade
          {' '}is injected · synthetic source: {MOCK.platformStatus.engines} engines · no live data
        </p>
      </div>
    </div>
  )
}
