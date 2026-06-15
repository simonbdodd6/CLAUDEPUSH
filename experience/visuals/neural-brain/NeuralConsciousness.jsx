import { Suspense, useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, DepthOfField, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ═══════════════════════════════════════════════════════════════════
// NeuralConsciousness — the canonical Living Neural Brain (Experience Layer, M32)
//
// Ported verbatim from the command-centre dashboard brain. The ONLY seam changes:
//   • accepts a `brainState: VisualBrainState` prop; its `firingRate` (0..1) drives
//     the activity floor + autonomous firing rate (the internal autonomous telemetry
//     is now modulated by the injected state instead of being purely self-generated)
//   • fills its parent container (absolute inset:0) instead of the old fixed offset,
//     so a panel can size it
// All render internals (geometry, shaders, particles, signals, HUD) are unchanged.
// No domain knowledge: the brain understands ONLY VisualBrainState.
// ═══════════════════════════════════════════════════════════════════

function inBrain(x, y, z) {
  const ax = x / 1.20
  const ay = (y + 0.06) / 0.88
  const az = z / 1.10
  const temporalWiden = Math.max(0, 0.18 * (1 - ay * ay * 1.8))
  const r2 = (ax / (1 + temporalWiden)) ** 2 + ay ** 2 + az ** 2
  const inFissure = Math.abs(x) < 0.06 && y > 0.05 && r2 < 0.92
  if (r2 < 1.0 && !inFissure) return true
  const r2c = (x / 0.55) ** 2 + ((y + 0.48) / 0.32) ** 2 + ((z - 0.75) / 0.45) ** 2
  return r2c < 1.0
}

const LOBES = [
  { id: 0, name: 'Executive Core',    role: 'Decision Synthesis',    color: [0.70, 0.85, 1.00] },
  { id: 1, name: 'Frontal Cortex',    role: 'Strategic Reasoning',   color: [0.00, 0.80, 1.00] },
  { id: 2, name: 'Temporal Lobes',    role: 'Pattern & Memory',      color: [0.80, 0.10, 1.00] },
  { id: 3, name: 'Parietal Lobe',     role: 'Spatial Intelligence',  color: [0.10, 1.00, 0.80] },
  { id: 4, name: 'Occipital Lobe',    role: 'Perception',            color: [0.40, 0.10, 1.00] },
  { id: 5, name: 'Cerebellum',        role: 'Coordination',          color: [1.00, 0.60, 0.10] },
]

function classifyLobe(x, y, z) {
  const inCereb = (x / 0.52) ** 2 + ((y + 0.44) / 0.30) ** 2 + ((z - 0.70) / 0.42) ** 2 < 1
  if (inCereb)                 return 5
  if (z < -0.35)               return 1
  if (Math.abs(x) > 0.72)      return 2
  if (y > 0.25)                return 3
  if (z > 0.45)                return 4
  return 0
}

function buildParticles(n) {
  const pos = [], col = [], sz = [], ph = [], pr = [], lob = []
  const cAcc = LOBES.map(() => ({ x: 0, y: 0, z: 0, n: 0 }))
  let tries = 0
  while (pos.length / 3 < n && tries++ < n * 30) {
    const x = (Math.random() - 0.5) * 2.7
    const y = (Math.random() - 0.5) * 2.1
    const z = (Math.random() - 0.5) * 2.3
    if (!inBrain(x, y, z)) continue
    pos.push(x, y, z)
    ph.push(Math.random() * 6.2832)
    pr.push(0.7 + Math.random() * 1.5)
    sz.push(1.0 + Math.random() * 2.0)
    const lobe = classifyLobe(x, y, z)
    lob.push(lobe)
    const a = cAcc[lobe]; a.x += x; a.y += y; a.z += z; a.n++
    const [r, g, b] = LOBES[lobe].color
    const v = 0.12
    col.push(
      Math.min(1, Math.max(0, r + (Math.random() - 0.5) * v)),
      Math.min(1, Math.max(0, g + (Math.random() - 0.5) * v)),
      Math.min(1, Math.max(0, b + (Math.random() - 0.5) * v))
    )
  }
  const centroids = cAcc.map(a => (a.n ? [a.x / a.n, a.y / a.n, a.z / a.n] : [0, 0, 0]))
  return {
    positions: new Float32Array(pos),
    colors: new Float32Array(col),
    sizes: new Float32Array(sz),
    phases: new Float32Array(ph),
    pulseRates: new Float32Array(pr),
    lobes: new Float32Array(lob),
    counts: cAcc.map(a => a.n),
    centroids,
    count: pos.length / 3
  }
}

function buildConnections(positions, maxConn) {
  const n = positions.length / 3
  const cellSize = 0.42
  const grid = new Map()
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(positions[i * 3] / cellSize)},${Math.floor(positions[i * 3 + 1] / cellSize)},${Math.floor(positions[i * 3 + 2] / cellSize)}`
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(i)
  }
  const linePos = [], pairs = [], added = new Set(), connCt = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    if (linePos.length / 6 >= maxConn || connCt[i] >= 6) continue
    const x1 = positions[i * 3], y1 = positions[i * 3 + 1], z1 = positions[i * 3 + 2]
    const cx = Math.floor(x1 / cellSize), cy = Math.floor(y1 / cellSize), cz = Math.floor(z1 / cellSize)
    const cands = []
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const c = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
          if (c) cands.push(...c)
        }
    cands.sort((a, b) => {
      const d = (q) => {
        const dx = positions[q*3]-x1, dy = positions[q*3+1]-y1, dz = positions[q*3+2]-z1
        return dx*dx + dy*dy + dz*dz
      }
      return d(a) - d(b)
    })
    for (const j of cands) {
      if (j <= i || connCt[i] >= 6 || connCt[j] >= 6) continue
      const key = i * n + j
      if (added.has(key)) continue
      const dx = positions[j*3]-x1, dy = positions[j*3+1]-y1, dz = positions[j*3+2]-z1
      if (dx*dx + dy*dy + dz*dz < 0.40 * 0.40) {
        linePos.push(x1, y1, z1, positions[j*3], positions[j*3+1], positions[j*3+2])
        pairs.push([i, j])
        added.add(key)
        connCt[i]++; connCt[j]++
        if (linePos.length / 6 >= maxConn) break
      }
    }
  }
  return { positions: new Float32Array(linePos), pairs, count: linePos.length / 6 }
}

const PARTICLE_COUNT = 3500
const MAX_CONN = 7000
const MAX_SIG = 200

const BD = buildParticles(PARTICLE_COUNT)
const CD = buildConnections(BD.positions, MAX_CONN)
const ADJ = (() => {
  const adj = Array.from({ length: BD.count }, () => [])
  CD.pairs.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a) })
  return adj
})()

const VERT_PARTICLES = /* glsl */`
uniform float uTime;
uniform float uActivity;
uniform float uFocusLobe;
uniform float uFocusMix;
attribute float aSize;
attribute vec3  aColor;
attribute float aPhase;
attribute float aPulseRate;
attribute float aFiring;
attribute float aLobe;
varying vec3  vColor;
varying float vOpacity;
varying float vFiring;
varying float vDim;

void main() {
  float pulse  = sin(uTime * aPulseRate + aPhase) * 0.5 + 0.5;
  float firing = aFiring;
  float isFocus = step(abs(aLobe - uFocusLobe), 0.5);
  float dim   = mix(1.0, mix(0.12, 1.35, isFocus), uFocusMix);
  vDim = mix(1.0, isFocus, uFocusMix);
  float sz = aSize * (0.6 + pulse * 0.7 * uActivity) + firing * 2.5;
  sz *= dim;
  vColor   = aColor;
  vOpacity = (mix(0.20, 0.75, pulse * uActivity) + firing * 0.4) * mix(1.0, mix(0.22, 1.0, isFocus), uFocusMix);
  vFiring  = firing;
  vec4 mvPos     = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize   = sz * (18.0 / -mvPos.z);
  gl_Position    = projectionMatrix * mvPos;
}
`

const FRAG_PARTICLES = /* glsl */`
varying vec3  vColor;
varying float vOpacity;
varying float vFiring;

void main() {
  vec2  uv   = gl_PointCoord - 0.5;
  float dist = length(uv) * 2.0;
  float core = smoothstep(1.0, 0.0,  dist);
  float rim  = smoothstep(1.0, 0.55, dist) * 0.28;
  float alpha = (core + rim) * vOpacity;
  if (alpha < 0.004) discard;
  vec3 col = vColor;
  col += vColor * core * 0.8;
  col += vec3(1.0, 0.96, 0.88) * vFiring * core * 4.0;
  gl_FragColor = vec4(col, alpha);
}
`

const VERT_SIGNAL = /* glsl */`
void main() {
  vec4 mvPos   = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = 8.0 * (18.0 / -mvPos.z);
  gl_Position  = projectionMatrix * mvPos;
}
`

const FRAG_SIGNAL = /* glsl */`
void main() {
  vec2  uv   = gl_PointCoord - 0.5;
  float d    = length(uv) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  float halo = smoothstep(1.0, 0.4, d) * 0.5;
  float a    = core + halo;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(0.5, 0.75, 1.0), vec3(1.0), core);
  col += col * core * 4.0;
  gl_FragColor = vec4(col, a);
}
`

const VERT_CONN = /* glsl */`
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG_CONN = /* glsl */`
void main() {
  gl_FragColor = vec4(0.28, 0.58, 1.0, 0.22);
}
`

function Particles({ firingRef, activityRef, focusRef, hoverRef }) {
  const pts = useRef()
  const raycaster = useMemo(() => {
    const r = new THREE.Raycaster()
    r.params.Points = { threshold: 0.09 }
    return r
  }, [])

  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position',  new THREE.BufferAttribute(BD.positions.slice(), 3))
    g.setAttribute('aColor',    new THREE.BufferAttribute(BD.colors.slice(),    3))
    g.setAttribute('aSize',     new THREE.BufferAttribute(BD.sizes.slice(),     1))
    g.setAttribute('aPhase',    new THREE.BufferAttribute(BD.phases.slice(),    1))
    g.setAttribute('aPulseRate',new THREE.BufferAttribute(BD.pulseRates.slice(),1))
    g.setAttribute('aLobe',     new THREE.BufferAttribute(BD.lobes.slice(),     1))
    const fa = new Float32Array(BD.count)
    g.setAttribute('aFiring',   new THREE.BufferAttribute(fa, 1))
    const m = new THREE.ShaderMaterial({
      vertexShader:   VERT_PARTICLES,
      fragmentShader: FRAG_PARTICLES,
      uniforms: {
        uTime:      { value: 0 },
        uActivity:  { value: 1.0 },
        uFocusLobe: { value: -1 },
        uFocusMix:  { value: 0 },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })
    return { geo: g, mat: m }
  }, [])

  useEffect(() => { firingRef.current = geo.attributes.aFiring.array }, [geo, firingRef])

  useFrame(({ camera, mouse }, delta) => {
    mat.uniforms.uTime.value     += delta
    mat.uniforms.uActivity.value  = activityRef.current
    const f = focusRef.current
    const targetMix = f.target >= 0 ? 1 : 0
    f.mix += (targetMix - f.mix) * Math.min(1, delta * 4.5)
    if (f.target >= 0) f.lobe = f.target
    mat.uniforms.uFocusLobe.value = f.lobe
    mat.uniforms.uFocusMix.value  = f.mix
    if (pts.current) {
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObject(pts.current)
      if (hits.length > 0) {
        const idx = hits[0].index
        hoverRef.current.index = idx
        hoverRef.current.lobe  = BD.lobes[idx]
        const fa  = geo.attributes.aFiring.array
        fa[idx] = 1.0
        for (const nb of ADJ[idx]) fa[nb] = Math.max(fa[nb], 0.45 + Math.random() * 0.55)
      } else {
        hoverRef.current.index = -1
        hoverRef.current.lobe  = -1
      }
    }
    const fa = geo.attributes.aFiring.array
    let dirty = false
    for (let i = 0; i < fa.length; i++) {
      if (fa[i] > 0.001) { fa[i] *= 0.91; dirty = true } else fa[i] = 0
    }
    if (dirty) geo.attributes.aFiring.needsUpdate = true
  })

  return <points ref={pts} geometry={geo} material={mat} />
}

function Connections() {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(CD.positions, 3))
    const m = new THREE.ShaderMaterial({
      vertexShader:   VERT_CONN,
      fragmentShader: FRAG_CONN,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      linewidth:   1,
    })
    return { geo: g, mat: m }
  }, [])
  return <lineSegments geometry={geo} material={mat} />
}

function Signals({ activityRef }) {
  const posBuffer = useMemo(() => new Float32Array(MAX_SIG * 3).fill(9999), [])
  const sigsRef   = useRef([])
  const geoRef    = useRef()
  const { geo, mat } = useMemo(() => {
    const g   = new THREE.BufferGeometry()
    const buf = new THREE.BufferAttribute(posBuffer, 3)
    buf.usage  = THREE.DynamicDrawUsage
    g.setAttribute('position', buf)
    const m = new THREE.ShaderMaterial({
      vertexShader:   VERT_SIGNAL,
      fragmentShader: FRAG_SIGNAL,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })
    return { geo: g, mat: m }
  }, [posBuffer])

  useEffect(() => { geoRef.current = geo }, [geo])

  useFrame((_, delta) => {
    const activity = activityRef.current
    if (Math.random() < delta * 8 * activity && sigsRef.current.length < MAX_SIG) {
      const ci = Math.floor(Math.random() * CD.count)
      sigsRef.current.push({ ci, t: 0, spd: 0.22 + Math.random() * 0.6, rev: Math.random() > 0.5 })
    }
    let wi = 0
    sigsRef.current = sigsRef.current.filter(s => {
      s.t += delta * s.spd
      if (s.t >= 1 || wi >= MAX_SIG) return false
      const c  = s.ci * 6
      const cp = CD.positions
      if (c + 5 >= cp.length) return false
      const t = s.rev ? 1 - s.t : s.t
      const p = wi * 3
      posBuffer[p]     = cp[c]     + (cp[c + 3] - cp[c])     * t
      posBuffer[p + 1] = cp[c + 1] + (cp[c + 4] - cp[c + 1]) * t
      posBuffer[p + 2] = cp[c + 2] + (cp[c + 5] - cp[c + 2]) * t
      wi++
      return true
    })
    for (let i = wi; i < MAX_SIG; i++) posBuffer[i * 3] = 9999
    if (geoRef.current) geoRef.current.attributes.position.needsUpdate = true
  })

  return <points geometry={geo} material={mat} />
}

function Nebula() {
  const { geo, mat } = useMemo(() => {
    const n   = 700
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 16
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 5
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const m = new THREE.PointsMaterial({
      size: 0.028, transparent: true, opacity: 0.38,
      color: 0x1a2a55,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
    return { geo: g, mat: m }
  }, [])
  return <points geometry={geo} material={mat} />
}

function BrainGroup({ firingRef, activityRef, focusRef, hoverRef, driveRef, setFocusLobe }) {
  const groupRef = useRef()
  const spring   = useRef({ rx: 0, ry: 0, vx: 0, vy: 0 })
  const mouse    = useRef({ x: 0, y: 0 })
  const zoomRef  = useRef(4.2)
  const SCALE    = 1.9

  const ignite = (center, spread, count) => {
    const fa = firingRef.current
    if (!fa) return
    const n = BD.count
    for (let k = 0; k < count; k++) {
      const idx = Math.max(0, Math.min(n - 1, center + Math.floor((Math.random() - 0.5) * spread)))
      fa[idx] = 0.5 + Math.random() * 0.5
    }
  }

  useEffect(() => {
    const onMove  = e => {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5) * 2
      mouse.current.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    const onWheel = e => {
      zoomRef.current = Math.max(1.6, Math.min(7.5, zoomRef.current + e.deltaY * 0.005))
      if (focusRef.current.target >= 0 && zoomRef.current > 5.2) {
        focusRef.current.target = -1
        setFocusLobe(-1)
      }
    }
    const onClick = () => {
      activityRef.current = Math.min(4.0, activityRef.current + 1.6)
      const hovIdx  = hoverRef.current.index
      const hovLobe = hoverRef.current.lobe
      if (hovIdx >= 0 && hovLobe >= 0) {
        const f = focusRef.current
        if (f.target === hovLobe) {
          f.target = -1
          setFocusLobe(-1)
        } else {
          f.target = hovLobe
          setFocusLobe(hovLobe)
          zoomRef.current = 2.7
          ignite(hovIdx, 220, 90)
        }
        ignite(hovIdx, 60, 40)
      } else {
        if (focusRef.current.target >= 0) {
          focusRef.current.target = -1
          setFocusLobe(-1)
          zoomRef.current = 4.2
        }
        ignite(Math.floor(Math.random() * BD.count), 300, 150)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('wheel',     onWheel, { passive: true })
    window.addEventListener('click',     onClick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('wheel',     onWheel)
      window.removeEventListener('click',     onClick)
    }
  }, [activityRef, firingRef, focusRef, hoverRef, setFocusLobe])

  useFrame(({ clock, camera }, delta) => {
    const s  = spring.current
    const m  = mouse.current
    const dx = m.x  - s.rx
    const dy = -m.y - s.ry
    s.vx = (s.vx + dx * 0.048) * 0.876
    s.vy = (s.vy + dy * 0.038) * 0.876
    s.rx += s.vx
    s.ry += s.vy
    const fmix = focusRef.current.mix
    const lobe = focusRef.current.lobe
    if (groupRef.current) {
      const t  = clock.getElapsedTime()
      const g  = groupRef.current
      const freeY = t * 0.042 + s.rx * 0.38
      const freeX = s.ry * 0.20
      let focY = freeY, focX = freeX, offY = 0
      if (lobe >= 0) {
        const [cx, cy, cz] = BD.centroids[lobe]
        focY = -Math.atan2(cx, cz) + s.rx * 0.18
        focX = Math.atan2(cy, Math.hypot(cx, cz)) * 0.6 + s.ry * 0.12
        offY = -cy * SCALE * 0.9
      }
      g.rotation.y = freeY + (focY - freeY) * fmix
      g.rotation.x = freeX + (focX - freeX) * fmix
      g.position.y += (offY * fmix - g.position.y) * Math.min(1, delta * 4)
      g.scale.setScalar(SCALE + Math.sin(t * 0.36) * 0.025)
    }
    camera.position.z += (zoomRef.current - camera.position.z) * 0.062

    // ── Injected VisualBrainState.firingRate drives the activity floor + burst rate
    const drive = Math.max(0, Math.min(1, driveRef.current))
    const floor = (focusRef.current.target >= 0 ? 1.6 : 1.0) + drive * 1.4
    activityRef.current = Math.max(floor, activityRef.current - delta * 0.65)
    if (Math.random() < delta * (0.14 + drive * 0.5)) {
      activityRef.current = Math.min(2.8 + drive, activityRef.current + Math.random() * 1.0)
      ignite(Math.floor(Math.random() * BD.count), 90, 5 + Math.floor(Math.random() * 30))
    }
  })

  return (
    <group ref={groupRef}>
      <Particles firingRef={firingRef} activityRef={activityRef} focusRef={focusRef} hoverRef={hoverRef} />
      <Connections />
      <Signals    activityRef={activityRef} />
    </group>
  )
}

function Scene({ firingRef, activityRef, focusRef, hoverRef, driveRef, setFocusLobe }) {
  return (
    <>
      <color attach="background" args={['#020812']} />
      <fog attach="fog" args={['#020812', 11, 24]} />
      <ambientLight intensity={0.06} />
      <pointLight position={[0,  3, -2]} intensity={3.5} color="#2277ff" />
      <pointLight position={[2, -1,  0]} intensity={1.8} color="#7722ff" />
      <pointLight position={[-2, 0,  1]} intensity={1.2} color="#00aaff" />
      <pointLight position={[0, -2,  2]} intensity={1.0} color="#ff44aa" />
      <Nebula />
      <BrainGroup
        firingRef={firingRef}
        activityRef={activityRef}
        focusRef={focusRef}
        hoverRef={hoverRef}
        driveRef={driveRef}
        setFocusLobe={setFocusLobe}
      />
      <EffectComposer>
        <Bloom intensity={2.2} luminanceThreshold={0.45} luminanceSmoothing={0.88} />
        <DepthOfField focusDistance={0.0} focalLength={0.5} bokehScale={3.0} height={480} />
        <Vignette eskil={false} offset={0.18} darkness={1.4} />
      </EffectComposer>
    </>
  )
}

function rgbStr(c, a) {
  return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`
}

function HUD({ focusLobe }) {
  const mono = { fontFamily: '"SF Mono", Consolas, "Courier New", monospace' }
  const focused = focusLobe >= 0
  const lobe = focused ? LOBES[focusLobe] : null
  const accent = lobe ? rgbStr(lobe.color, 0.9) : 'rgba(90, 170, 255, 0.85)'

  return (
    <>
      <div style={{
        ...mono, position: 'absolute', bottom: 28, left: 28,
        color: 'rgba(70, 150, 255, 0.65)', fontSize: 10, letterSpacing: '0.14em',
        lineHeight: 1.9, pointerEvents: 'none', textTransform: 'uppercase',
      }}>
        <div>Neural Nodes&nbsp;&nbsp;&nbsp;&nbsp;{BD.count.toLocaleString()}</div>
        <div>Synaptic Bonds&nbsp;&nbsp;{CD.count.toLocaleString()}</div>
        <div>Signal Carriers&nbsp;{MAX_SIG}</div>
        <div style={{ marginTop: 8, color: 'rgba(60, 255, 160, 0.65)' }}>◈&nbsp;Consciousness Active</div>
      </div>

      <div style={{
        ...mono, position: 'absolute', top: 20, right: 24,
        color: 'rgba(70, 150, 255, 0.45)', fontSize: 9, letterSpacing: '0.20em',
        textAlign: 'right', pointerEvents: 'none', textTransform: 'uppercase',
      }}>
        <div style={{ color: 'rgba(90, 170, 255, 0.85)', fontSize: 11, marginBottom: 7, letterSpacing: '0.22em' }}>
          Coach&apos;s Eye
        </div>
        <div>AI Consciousness</div>
        <div style={{ marginTop: 5, color: 'rgba(90, 255, 160, 0.55)' }}>v2.0 · Placeholder</div>
      </div>

      <div style={{
        ...mono, position: 'absolute', bottom: 28, right: 28,
        color: 'rgba(70, 150, 255, 0.28)', fontSize: 8, letterSpacing: '0.14em',
        textAlign: 'right', pointerEvents: 'none', textTransform: 'uppercase', lineHeight: 2.1,
      }}>
        <div>Drag&nbsp;Cursor&nbsp;&nbsp;→&nbsp;Rotate</div>
        <div>Scroll&nbsp;&nbsp;→&nbsp;Zoom</div>
        <div>Hover&nbsp;&nbsp;→&nbsp;Fire Neurons</div>
        <div>Click&nbsp;Node&nbsp;&nbsp;→&nbsp;Enter Layer</div>
      </div>

      <div style={{
        position: 'absolute', top: 20, left: 20,
        display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(60, 255, 140, 0.8)', boxShadow: '0 0 8px rgba(60, 255, 140, 0.6)',
          animation: 'pulse-hud 2s ease-in-out infinite',
        }} />
        <span style={{ ...mono, fontSize: 9, color: 'rgba(60, 255, 140, 0.55)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Live
        </span>
      </div>

      <div style={{
        ...mono, position: 'absolute', left: '50%', bottom: 56,
        transform: `translateX(-50%) translateY(${focused ? 0 : 18}px)`,
        opacity: focused ? 1 : 0,
        transition: 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.2,0.8,0.2,1)',
        pointerEvents: 'none', textAlign: 'center', padding: '14px 30px', borderRadius: 14,
        background: 'rgba(4, 10, 22, 0.55)', backdropFilter: 'blur(14px)',
        border: `1px solid ${lobe ? rgbStr(lobe.color, 0.35) : 'transparent'}`,
        boxShadow: lobe ? `0 0 40px ${rgbStr(lobe.color, 0.18)}` : 'none',
      }}>
        <div style={{ fontSize: 8, letterSpacing: '0.34em', color: 'rgba(160,200,255,0.5)', textTransform: 'uppercase', marginBottom: 7 }}>
          ◇ Intelligence Layer Engaged
        </div>
        <div style={{ fontSize: 19, letterSpacing: '0.16em', color: accent, textTransform: 'uppercase', fontWeight: 600 }}>
          {lobe?.name ?? ''}
        </div>
        <div style={{ fontSize: 10, letterSpacing: '0.24em', color: 'rgba(180,210,255,0.6)', textTransform: 'uppercase', marginTop: 6 }}>
          {lobe?.role ?? ''}
          {lobe && <span style={{ color: rgbStr(lobe.color, 0.7) }}>&nbsp;·&nbsp;{BD.counts[lobe.id].toLocaleString()} nodes</span>}
        </div>
        <div style={{ fontSize: 8, letterSpacing: '0.28em', color: 'rgba(140,180,255,0.35)', textTransform: 'uppercase', marginTop: 10 }}>
          Click node again · or scroll out · to surface
        </div>
      </div>

      <style>{`
        @keyframes pulse-hud { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.7); } }
        @keyframes boot-fade { 0% { opacity: 0; letter-spacing: 0.6em; } 18% { opacity: 1; } 78% { opacity: 1; letter-spacing: 0.32em; } 100% { opacity: 0; letter-spacing: 0.32em; } }
      `}</style>
    </>
  )
}

function BootTitle() {
  const mono = { fontFamily: '"SF Mono", Consolas, "Courier New", monospace' }
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 3600)
    return () => clearTimeout(t)
  }, [])
  if (gone) return null
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        ...mono, fontSize: 13, letterSpacing: '0.32em',
        color: 'rgba(150, 195, 255, 0.92)', textTransform: 'uppercase',
        animation: 'boot-fade 3.6s ease forwards',
      }}>
        Awakening Consciousness
      </div>
    </div>
  )
}

export default function NeuralConsciousness({ brainState }) {
  const firingRef   = useRef(null)
  const activityRef = useRef(1.0)
  const focusRef    = useRef({ target: -1, lobe: -1, mix: 0 })
  const hoverRef    = useRef({ index: -1, lobe: -1 })
  const driveRef    = useRef(0.5)   // external VisualBrainState.firingRate (0..1)
  const [focusLobe, setFocusLobe] = useState(-1)

  // Seam: feed the injected firing rate into the animation without re-rendering.
  useEffect(() => {
    const fr = brainState?.firingRate
    if (typeof fr === 'number') driveRef.current = Math.max(0, Math.min(1, fr))
  }, [brainState?.firingRate])

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#020812', cursor: 'crosshair', overflow: 'hidden',
    }}>
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 60, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        dpr={[1, 2]}
        frameloop="always"
      >
        <Suspense fallback={null}>
          <Scene
            firingRef={firingRef}
            activityRef={activityRef}
            focusRef={focusRef}
            hoverRef={hoverRef}
            driveRef={driveRef}
            setFocusLobe={setFocusLobe}
          />
        </Suspense>
      </Canvas>
      <HUD focusLobe={focusLobe} />
      <BootTitle />
    </div>
  )
}
