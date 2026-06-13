import { Suspense, useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, DepthOfField, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'

// ═══════════════════════════════════════════════════════════════════
// PIF-7 — THE LIVING MIND
// A true living connectome: named knowledge regions, organised long-range
// fibres, inter-region electrical storms, thought journeys, and a 3D
// knowledge graph of real entities. Built on the existing particle brain.
// ═══════════════════════════════════════════════════════════════════

function inBrain(x, y, z) {
  const ax = x / 1.20, ay = (y + 0.06) / 0.88, az = z / 1.10
  const temporalWiden = Math.max(0, 0.18 * (1 - ay * ay * 1.8))
  const r2 = (ax / (1 + temporalWiden)) ** 2 + ay ** 2 + az ** 2
  const inFissure = Math.abs(x) < 0.06 && y > 0.05 && r2 < 0.92
  if (r2 < 1.0 && !inFissure) return true
  const r2c = (x / 0.55) ** 2 + ((y + 0.48) / 0.32) ** 2 + ((z - 0.75) / 0.45) ** 2
  return r2c < 1.0
}

// ── Named knowledge regions — each with identity, colour, rhythm, behaviour ───
const REGIONS = [
  { name: 'Reasoning',       role: 'Inference Core',        anchor: [ 0.00, 0.28,-0.70], color: [0.12, 0.85, 1.00], breath: 0.30, fire: 1.2 },
  { name: "Coach's Eye",     role: 'Sport Intelligence',    anchor: [-0.72, 0.12,-0.58], color: [0.20, 1.00, 0.55], breath: 0.24, fire: 1.0 },
  { name: 'Travel',          role: 'Journey Intelligence',  anchor: [ 0.72, 0.12,-0.58], color: [0.10, 0.95, 0.85], breath: 0.26, fire: 0.9 },
  { name: 'Website Lead',    role: 'Growth Agent',          anchor: [-0.86, 0.00, 0.10], color: [1.00, 0.28, 0.70], breath: 0.28, fire: 1.1 },
  { name: 'Personal',        role: 'Private Intelligence',  anchor: [ 0.86, 0.00, 0.10], color: [1.00, 0.78, 0.35], breath: 0.22, fire: 0.8 },
  { name: 'Memory',          role: 'Long-Term Store',       anchor: [-0.80,-0.05, 0.60], color: [0.75, 0.32, 1.00], breath: 0.18, fire: 0.7 },
  { name: 'Learning',        role: 'Adaptation',            anchor: [ 0.80,-0.05, 0.60], color: [0.38, 0.55, 1.00], breath: 0.20, fire: 0.9 },
  { name: 'Evidence',        role: 'Provenance',            anchor: [-0.40, 0.56, 0.18], color: [0.20, 1.00, 0.78], breath: 0.34, fire: 1.0 },
  { name: 'Recommendations', role: 'Decision Output',       anchor: [ 0.40, 0.56, 0.18], color: [0.58, 1.00, 0.25], breath: 0.32, fire: 1.1 },
  { name: 'Projects',        role: 'Initiatives',           anchor: [-0.34, 0.10, 0.78], color: [0.48, 0.38, 1.00], breath: 0.21, fire: 0.8 },
  { name: 'People',          role: 'Relationships',         anchor: [ 0.34, 0.10, 0.78], color: [1.00, 0.48, 0.66], breath: 0.23, fire: 0.9 },
  { name: 'Knowledge',       role: 'Unified Graph',         anchor: [ 0.00, 0.02, 0.04], color: [0.82, 0.90, 1.00], breath: 0.16, fire: 1.0 },
  { name: 'Simulations',     role: 'Digital Twin',          anchor: [-0.30,-0.46, 0.70], color: [1.00, 0.56, 0.16], breath: 0.27, fire: 1.0 },
  { name: 'Goals',           role: 'Objectives',            anchor: [ 0.30,-0.46, 0.70], color: [1.00, 0.80, 0.22], breath: 0.25, fire: 0.8 },
]
const NREG = REGIONS.length
const R_REASONING = 0, R_MEMORY = 5, R_LEARNING = 6, R_EVIDENCE = 7, R_RECS = 8, R_PROJECTS = 9, R_PEOPLE = 10, R_KNOWLEDGE = 11, R_SIM = 12, R_GOALS = 13

function classifyRegion(x, y, z) {
  let best = 0, bd = Infinity
  for (let r = 0; r < NREG; r++) {
    const a = REGIONS[r].anchor
    const dx = x - a[0], dy = y - a[1], dz = z - a[2], d = dx*dx + dy*dy + dz*dz
    if (d < bd) { bd = d; best = r }
  }
  return best
}

function buildParticles(n) {
  const pos = [], col = [], sz = [], ph = [], pr = [], reg = []
  const cAcc = REGIONS.map(() => ({ x: 0, y: 0, z: 0, n: 0 }))
  const neuronsByRegion = REGIONS.map(() => [])
  let tries = 0
  while (pos.length / 3 < n && tries++ < n * 30) {
    const x = (Math.random() - 0.5) * 2.7, y = (Math.random() - 0.5) * 2.1, z = (Math.random() - 0.5) * 2.3
    if (!inBrain(x, y, z)) continue
    const idx = pos.length / 3
    pos.push(x, y, z); ph.push(Math.random() * 6.2832); pr.push(0.7 + Math.random() * 1.5); sz.push(1.0 + Math.random() * 2.0)
    const region = classifyRegion(x, y, z); reg.push(region)
    neuronsByRegion[region].push(idx)
    const a = cAcc[region]; a.x += x; a.y += y; a.z += z; a.n++
    const [r, g, b] = REGIONS[region].color, v = 0.10
    col.push(Math.min(1, Math.max(0, r + (Math.random() - 0.5) * v)), Math.min(1, Math.max(0, g + (Math.random() - 0.5) * v)), Math.min(1, Math.max(0, b + (Math.random() - 0.5) * v)))
  }
  const centroids = cAcc.map(a => (a.n ? [a.x / a.n, a.y / a.n, a.z / a.n] : [0, 0, 0]))
  return {
    positions: new Float32Array(pos), colors: new Float32Array(col), sizes: new Float32Array(sz),
    phases: new Float32Array(ph), pulseRates: new Float32Array(pr), regions: new Float32Array(reg),
    counts: cAcc.map(a => a.n), centroids, neuronsByRegion, count: pos.length / 3,
  }
}

// Organised connectome: dense LOCAL networks + structured LONG-RANGE fibre bundles
// between semantically related regions (no spaghetti — bundles follow the region map).
const REGION_LINKS = [
  // Reasoning hub
  [R_REASONING, R_MEMORY], [R_REASONING, R_EVIDENCE], [R_REASONING, R_RECS], [R_REASONING, R_KNOWLEDGE],
  [R_REASONING, R_SIM], [R_REASONING, 1], [R_REASONING, 2], [R_REASONING, 3],
  // semantic highways
  [R_MEMORY, R_LEARNING], [R_EVIDENCE, R_RECS], [R_RECS, R_GOALS], [R_SIM, R_RECS],
  [1, R_PEOPLE], [1, R_PROJECTS], [3, R_PEOPLE], [2, 4], [R_PROJECTS, R_GOALS],
  [R_KNOWLEDGE, R_MEMORY], [R_KNOWLEDGE, R_PEOPLE], [R_LEARNING, R_RECS], [R_PEOPLE, R_PROJECTS],
]

function buildConnectome(P, regions, neuronsByRegion) {
  const n = P.length / 3, cellSize = 0.40, grid = new Map()
  for (let i = 0; i < n; i++) {
    const k = `${Math.floor(P[i*3]/cellSize)},${Math.floor(P[i*3+1]/cellSize)},${Math.floor(P[i*3+2]/cellSize)}`
    if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i)
  }
  const linePos = [], pairs = [], kinds = [], added = new Set(), connCt = new Int32Array(n)
  const MAX_LOCAL_PER = 8
  // LOCAL dense networks
  for (let i = 0; i < n; i++) {
    if (connCt[i] >= MAX_LOCAL_PER) continue
    const x1 = P[i*3], y1 = P[i*3+1], z1 = P[i*3+2]
    const cx = Math.floor(x1/cellSize), cy = Math.floor(y1/cellSize), cz = Math.floor(z1/cellSize), cands = []
    for (let dx=-1;dx<=1;dx++) for (let dy=-1;dy<=1;dy++) for (let dz=-1;dz<=1;dz++){ const c = grid.get(`${cx+dx},${cy+dy},${cz+dz}`); if (c) cands.push(...c) }
    cands.sort((a,b)=>{const d=q=>{const dx=P[q*3]-x1,dy=P[q*3+1]-y1,dz=P[q*3+2]-z1;return dx*dx+dy*dy+dz*dz};return d(a)-d(b)})
    for (const j of cands) {
      if (j <= i || connCt[i] >= MAX_LOCAL_PER || connCt[j] >= MAX_LOCAL_PER) continue
      const key = i*n+j; if (added.has(key)) continue
      const dx=P[j*3]-x1, dy=P[j*3+1]-y1, dz=P[j*3+2]-z1
      if (dx*dx+dy*dy+dz*dz < 0.38*0.38) {
        linePos.push(x1,y1,z1, P[j*3],P[j*3+1],P[j*3+2]); pairs.push([i,j]); kinds.push(0); added.add(key); connCt[i]++; connCt[j]++
      }
    }
  }
  // LONG-RANGE fibre bundles between linked regions
  const fibresByLink = new Map()
  const linkKey = (a,b) => a < b ? `${a}_${b}` : `${b}_${a}`
  for (const [ra, rb] of REGION_LINKS) {
    const A = neuronsByRegion[ra], B = neuronsByRegion[rb]
    if (!A.length || !B.length) continue
    const count = 170 + Math.floor(Math.random()*90)
    const list = []
    for (let k = 0; k < count; k++) {
      const i = A[Math.floor(Math.random()*A.length)], j = B[Math.floor(Math.random()*B.length)]
      if (i === j) continue
      const key = i*n+j; if (added.has(key) || added.has(j*n+i)) continue
      added.add(key)
      linePos.push(P[i*3],P[i*3+1],P[i*3+2], P[j*3],P[j*3+1],P[j*3+2])
      pairs.push([i,j]); kinds.push(1); list.push(pairs.length-1)
    }
    fibresByLink.set(linkKey(ra,rb), list)
  }
  return { positions: new Float32Array(linePos), pairs, kinds, count: linePos.length/6, fibresByLink, linkKey }
}

const PARTICLE_COUNT = 3500, MAX_CONN = 16000, MAX_SIG = 260
const BD = buildParticles(PARTICLE_COUNT)
const CD = buildConnectome(BD.positions, BD.regions, BD.neuronsByRegion)
const ADJ = (() => { const adj = Array.from({ length: BD.count }, () => []); CD.pairs.forEach(([a,b]) => { adj[a].push(b); adj[b].push(a) }); return adj })()

const CONN = (() => {
  const count = CD.count
  const cPhase = new Float32Array(count*2), cRate = new Float32Array(count*2), cReg = new Float32Array(count*2), cKind = new Float32Array(count*2), lookup = new Map()
  for (let ci = 0; ci < count; ci++) {
    const [i, j] = CD.pairs[ci], ph = Math.random()*6.2832, rt = 0.3 + Math.random()*0.9, kd = CD.kinds[ci]
    cPhase[ci*2]=ph; cPhase[ci*2+1]=ph; cRate[ci*2]=rt; cRate[ci*2+1]=rt
    cReg[ci*2]=BD.regions[i]; cReg[ci*2+1]=BD.regions[j]
    cKind[ci*2]=kd; cKind[ci*2+1]=kd
    lookup.set(Math.min(i,j)*BD.count+Math.max(i,j), ci)
  }
  return { cPhase, cRate, cReg, cKind, lookup, count }
})()
function connOf(i, j) { return CONN.lookup.get(Math.min(i,j)*BD.count+Math.max(i,j)) }
function endNode(ci, rev) { const [i,j] = CD.pairs[ci]; return rev ? i : j }

const REGION_BREATH = REGIONS.map((r, i) => ({ freq: r.breath, phase: i*1.37, amp: 0.024 + (i%3)*0.006 }))
function computeRegionScales(t, out) { for (let i=0;i<NREG;i++) out[i] = 1 + Math.sin(t*REGION_BREATH[i].freq + REGION_BREATH[i].phase)*REGION_BREATH[i].amp; return out }
const REGION_CENTROIDS = BD.centroids.map(c => new THREE.Vector3(c[0], c[1], c[2]))

// Region adjacency (for storms / continuous communication)
const REGION_ADJ = (() => { const adj = REGIONS.map(()=>[]); for (const [a,b] of REGION_LINKS){ adj[a].push(b); adj[b].push(a) } return adj })()

function buildPathway(seed, length) {
  const neurons = [seed], conns = [], visited = new Set([seed]); let cur = seed
  for (let s=0;s<length;s++) {
    const nbrs = ADJ[cur].filter(nb => !visited.has(nb)); if (!nbrs.length) break
    const next = nbrs[Math.floor(Math.random()*nbrs.length)]; visited.add(next)
    const ci = connOf(cur, next); if (ci !== undefined) conns.push(ci)
    neurons.push(next); cur = next
  }
  return { neurons, conns }
}
function seedInRegion(region) { const list = BD.neuronsByRegion[region]; return list.length ? list[Math.floor(Math.random()*list.length)] : Math.floor(Math.random()*BD.count) }

// ── 3D Knowledge Graph of REAL entities (clustered communities) ───────────────
const KG = (() => {
  const CL = {
    people:  { c: [-1.5, 0.7, 0.1],  col: [1.0, 0.55, 0.75] },
    coach:   { c: [ 1.5, 0.5,-0.4],  col: [0.25, 1.0, 0.55] },
    travel:  { c: [ 0.1,-1.3, 1.0],  col: [0.15, 0.95, 0.9] },
    lead:    { c: [-1.3,-0.7,-0.9],  col: [1.0, 0.30, 0.7] },
    intel:   { c: [ 0.0, 1.35, 0.2], col: [0.55, 0.85, 1.0] },
    work:    { c: [ 1.1,-0.9, 0.7],  col: [1.0, 0.78, 0.3] },
  }
  const defs = [
    ['Simon','people',true], ['Manon','people'], ['Nick','people'],
    ["Coach's Eye",'coach',true], ['Belgium Rugby','coach'], ['Players','coach'], ['Teams','coach'], ['Videos','coach'],
    ['Travel App','travel',true], ['Trips','travel'], ['Documents','travel'], ['Calendar','travel'],
    ['Website Lead Agent','lead',true], ['Customers','lead'], ['Emails','lead'], ['Leads','lead'],
    ['Reasoning','intel',true], ['Evidence','intel'], ['Recommendations','intel'], ['Memory','intel'], ['Learning','intel'], ['Knowledge','intel'],
    ['Projects','work',true], ['Goals','work'], ['Meetings','work'], ['Simulations','work'], ['Approvals','work'],
  ]
  const idxByName = new Map()
  const nodes = defs.map((d, i) => {
    const [name, cl, hub] = d, base = CL[cl].c
    // deterministic offset
    const a = i * 2.39963, r = hub ? 0 : 0.55 + (i % 3) * 0.12
    const pos = [ base[0] + Math.cos(a)*r, base[1] + Math.sin(a*1.3)*r*0.8, base[2] + Math.sin(a)*r ]
    idxByName.set(name, i)
    return { name, cluster: cl, hub: !!hub, pos, color: CL[cl].col }
  })
  const E = (x, y) => [idxByName.get(x), idxByName.get(y)].filter(v => v !== undefined)
  const edgePairs = [
    // people ↔ everything (Simon is the owner)
    ['Simon','Manon'], ['Simon','Nick'], ['Simon',"Coach's Eye"], ['Simon','Travel App'], ['Simon','Website Lead Agent'], ['Simon','Projects'], ['Simon','Reasoning'],
    ['Manon','Travel App'], ['Nick','Belgium Rugby'],
    // coach cluster
    ["Coach's Eye",'Belgium Rugby'], ["Coach's Eye",'Players'], ["Coach's Eye",'Teams'], ["Coach's Eye",'Videos'], ['Players','Teams'], ['Belgium Rugby','Teams'],
    // travel
    ['Travel App','Trips'], ['Travel App','Documents'], ['Trips','Calendar'], ['Trips','Documents'],
    // lead
    ['Website Lead Agent','Customers'], ['Website Lead Agent','Leads'], ['Website Lead Agent','Emails'], ['Leads','Customers'],
    // intelligence backbone
    ['Reasoning','Evidence'], ['Reasoning','Recommendations'], ['Recommendations','Evidence'], ['Reasoning','Memory'], ['Memory','Learning'], ['Knowledge','Memory'], ['Knowledge','Reasoning'],
    // work
    ['Projects','Goals'], ['Projects','Meetings'], ['Recommendations','Approvals'], ['Simulations','Recommendations'], ['Goals','Recommendations'],
    // cross-domain intelligence wiring
    ["Coach's Eye",'Recommendations'], ['Travel App','Recommendations'], ['Website Lead Agent','Recommendations'], ['Players','Evidence'], ['Customers','Evidence'],
  ].map(([a,b]) => E(a,b)).filter(e => e.length === 2)

  const adj = nodes.map(()=>[])
  edgePairs.forEach(([a,b]) => { adj[a].push(b); adj[b].push(a) })
  return { nodes, edgePairs, adj }
})()

function makeLabelSprite(text, color, big) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64
  const ctx = cv.getContext('2d')
  ctx.font = `${big ? 700 : 600} ${big ? 30 : 26}px "SF Mono", Consolas, monospace`
  ctx.fillStyle = `rgba(${Math.round(color[0]*255)},${Math.round(color[1]*255)},${Math.round(color[2]*255)},0.97)`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 7
  ctx.fillText(text, 128, 34)
  const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
  const s = new THREE.Sprite(mat); s.scale.set(big ? 0.66 : 0.5, big ? 0.165 : 0.125, 1)
  return s
}

// ═══════════════════════════════════════════════════════════════════
// SHADERS
// ═══════════════════════════════════════════════════════════════════

const VERT_PARTICLES = /* glsl */`
uniform float uTime, uActivity, uFocusReg, uFocusMix, uConfidence, uReveal, uWaveReg, uWavePos, uWaveActive;
uniform vec3  uRegCentroid[${NREG}];
uniform float uRegScale[${NREG}];
attribute float aSize, aPhase, aPulseRate, aFiring, aRegion, aHalo;
attribute vec3  aColor;
varying vec3  vColor;
varying float vOpacity, vFiring, vConfidence, vWave, vHalo;

void main() {
  int ri = int(clamp(aRegion, 0.0, ${NREG - 1}.0) + 0.5);
  vec3 c = uRegCentroid[ri];
  float regScale = uRegScale[ri];
  float pulse = sin(uTime * aPulseRate + aPhase) * 0.5 + 0.5;
  float firing = aFiring;

  float wave = 0.0;
  if (abs(aRegion - uWaveReg) < 0.5) { float d = position.z - uWavePos; wave = exp(-d*d*7.0) * uWaveActive; }
  vWave = wave;

  float isFocus = step(abs(aRegion - uFocusReg), 0.5);
  float dim = mix(1.0, mix(0.14, 1.32, isFocus), uFocusMix);
  float expand = regScale + isFocus * uFocusMix * 0.12 + wave * 0.05;
  vec3 p = (c + (position - c) * expand) * (1.0 + uReveal * 0.55);

  float sz = aSize * (0.6 + pulse * 0.7 * uActivity) + firing * 2.6 + wave * 2.0 + aHalo * 3.0;
  sz *= dim * (1.0 - uReveal * 0.85);

  vColor = aColor;
  vOpacity = (mix(0.20, 0.78, pulse * uActivity) + firing * 0.4 + wave * 0.5 + aHalo * 0.5) * mix(1.0, mix(0.20, 1.0, isFocus), uFocusMix) * (1.0 - uReveal * 0.92);
  vFiring = firing; vConfidence = uConfidence; vHalo = aHalo;

  vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = sz * (18.0 / -mvPos.z);
  gl_Position = projectionMatrix * mvPos;
}
`
const FRAG_PARTICLES = /* glsl */`
varying vec3 vColor;
varying float vOpacity, vFiring, vConfidence, vWave, vHalo;
void main() {
  vec2 uv = gl_PointCoord - 0.5; float dist = length(uv) * 2.0;
  float core = smoothstep(1.0, 0.0, dist), rim = smoothstep(1.0, 0.55, dist) * 0.28;
  float alpha = (core + rim) * vOpacity; if (alpha < 0.004) discard;
  vec3 col = vColor + vColor * core * 0.8;
  vec3 flash = mix(vec3(0.40,0.66,1.0), vec3(1.0,0.92,0.72), vConfidence);
  col += flash * vFiring * core * (2.2 + vConfidence * 3.0);
  col += vec3(0.7,0.9,1.0) * vWave * core * 2.0;
  col += vColor * vHalo * core * 2.2;
  gl_FragColor = vec4(col, alpha);
}
`
const VERT_BOLT = /* glsl */`attribute float aAlpha; varying float vA; void main(){ vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `
const FRAG_BOLT = /* glsl */`varying float vA; void main(){ if(vA<0.01) discard; vec3 col=mix(vec3(0.45,0.72,1.0),vec3(1.0),vA); col+=col*vA*2.5; gl_FragColor=vec4(col,vA);} `

const VERT_CONN = /* glsl */`
uniform float uTime, uReveal, uGrow;
uniform vec3  uRegCentroid[${NREG}];
uniform float uRegScale[${NREG}];
attribute float aCPhase, aCRate, aCReg, aCKind, aCActive;
varying float vAlpha, vActive, vKind;
void main() {
  int ri = int(clamp(aCReg, 0.0, ${NREG - 1}.0) + 0.5);
  vec3 c = uRegCentroid[ri];
  vec3 p = (c + (position - c) * uRegScale[ri]) * (1.0 + uReveal * 0.55);
  float breathe = 0.5 + 0.5 * sin(uTime * aCRate + aCPhase);
  // long-range fibres are fainter at rest but carry the structure
  float baseA = (aCKind > 0.5) ? 0.30 : 0.50;
  // travelling "growth" sweep that strengthens fibres in sequence
  float grow = 0.5 + 0.5 * sin(p.z * 1.6 - uGrow * 3.0);
  vAlpha = (baseA + 0.5 * breathe) * (0.7 + 0.3 * grow) * (1.0 - uReveal * 0.9);
  vActive = aCActive * (1.0 - uReveal * 0.9);
  vKind = aCKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`
const FRAG_CONN = /* glsl */`
varying float vAlpha, vActive, vKind;
void main() {
  float act = clamp(vActive, 0.0, 1.0);
  vec3 cool = (vKind > 0.5) ? vec3(0.30,0.42,0.95) : vec3(0.20,0.50,1.0);
  vec3 col = mix(cool, vec3(0.85,0.95,1.0), act) + vec3(0.85,0.95,1.0) * act * 1.7;
  float a = (vKind > 0.5 ? 0.055 : 0.10) * vAlpha + act * 0.55;
  gl_FragColor = vec4(col, a);
}
`

// ═══════════════════════════════════════════════════════════════════
// PARTICLES
// ═══════════════════════════════════════════════════════════════════

function Particles({ firingRef, haloRef, activityRef, focusRef, hoverRef, cognitionRef, revealRef, waveRef }) {
  const pts = useRef()
  const regScales = useMemo(() => new Array(NREG).fill(1), [])
  const raycaster = useMemo(() => { const r = new THREE.Raycaster(); r.params.Points = { threshold: 0.09 }; return r }, [])

  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position',  new THREE.BufferAttribute(BD.positions.slice(), 3))
    g.setAttribute('aColor',    new THREE.BufferAttribute(BD.colors.slice(), 3))
    g.setAttribute('aSize',     new THREE.BufferAttribute(BD.sizes.slice(), 1))
    g.setAttribute('aPhase',    new THREE.BufferAttribute(BD.phases.slice(), 1))
    g.setAttribute('aPulseRate',new THREE.BufferAttribute(BD.pulseRates.slice(), 1))
    g.setAttribute('aRegion',   new THREE.BufferAttribute(BD.regions.slice(), 1))
    g.setAttribute('aFiring',   new THREE.BufferAttribute(new Float32Array(BD.count), 1))
    g.setAttribute('aHalo',     new THREE.BufferAttribute(new Float32Array(BD.count), 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT_PARTICLES, fragmentShader: FRAG_PARTICLES,
      uniforms: {
        uTime:{value:0}, uActivity:{value:1}, uFocusReg:{value:-1}, uFocusMix:{value:0}, uConfidence:{value:0.7}, uReveal:{value:0},
        uWaveReg:{value:-1}, uWavePos:{value:0}, uWaveActive:{value:0},
        uRegCentroid:{value:REGION_CENTROIDS}, uRegScale:{value:new Array(NREG).fill(1)},
      },
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    })
    return { geo: g, mat: m }
  }, [])

  useEffect(() => { firingRef.current = geo.attributes.aFiring.array; haloRef.current = geo.attributes.aHalo.array }, [geo, firingRef, haloRef])

  useFrame(({ camera, mouse, clock }, delta) => {
    mat.uniforms.uTime.value += delta
    mat.uniforms.uActivity.value = activityRef.current
    mat.uniforms.uConfidence.value = cognitionRef.current.confidence
    mat.uniforms.uReveal.value = revealRef.current.value
    mat.uniforms.uWaveReg.value = waveRef.current.region
    mat.uniforms.uWavePos.value = waveRef.current.pos
    mat.uniforms.uWaveActive.value = waveRef.current.active
    computeRegionScales(clock.getElapsedTime(), regScales)
    mat.uniforms.uRegScale.value = regScales

    const f = focusRef.current
    f.mix += ((f.target >= 0 ? 1 : 0) - f.mix) * Math.min(1, delta * 4.5)
    if (f.target >= 0) f.region = f.target
    mat.uniforms.uFocusReg.value = f.region
    mat.uniforms.uFocusMix.value = f.mix

    if (pts.current && revealRef.current.value < 0.4) {
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObject(pts.current)
      if (hits.length > 0) {
        const idx = hits[0].index
        hoverRef.current.index = idx; hoverRef.current.region = BD.regions[idx]
        const fa = geo.attributes.aFiring.array; fa[idx] = 1.0
        for (const nb of ADJ[idx]) fa[nb] = Math.max(fa[nb], 0.5 + Math.random()*0.5)
      } else { hoverRef.current.index = -1; hoverRef.current.region = -1 }
    }

    const fa = geo.attributes.aFiring.array; let dirty = false
    for (let i=0;i<fa.length;i++){ if(fa[i]>0.001){fa[i]*=0.91;dirty=true} else fa[i]=0 }
    if (dirty) geo.attributes.aFiring.needsUpdate = true

    const ha = geo.attributes.aHalo.array; let hdirty = false
    for (let i=0;i<ha.length;i++){ if(ha[i]>0.001){ha[i]*=0.95;hdirty=true} else if(ha[i]!==0) ha[i]=0 }
    if (hdirty) geo.attributes.aHalo.needsUpdate = true
  })
  return <points ref={pts} geometry={geo} material={mat} />
}

// ═══════════════════════════════════════════════════════════════════
// CONNECTOME
// ═══════════════════════════════════════════════════════════════════

function Connectome({ connActiveRef, revealRef }) {
  const regScales = useMemo(() => new Array(NREG).fill(1), [])
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(CD.positions, 3))
    g.setAttribute('aCPhase', new THREE.BufferAttribute(CONN.cPhase, 1))
    g.setAttribute('aCRate',  new THREE.BufferAttribute(CONN.cRate, 1))
    g.setAttribute('aCReg',   new THREE.BufferAttribute(CONN.cReg, 1))
    g.setAttribute('aCKind',  new THREE.BufferAttribute(CONN.cKind, 1))
    const activeAttr = new THREE.BufferAttribute(new Float32Array(CONN.count*2), 1); activeAttr.usage = THREE.DynamicDrawUsage
    g.setAttribute('aCActive', activeAttr)
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT_CONN, fragmentShader: FRAG_CONN,
      uniforms: { uTime:{value:0}, uReveal:{value:0}, uGrow:{value:0}, uRegCentroid:{value:REGION_CENTROIDS}, uRegScale:{value:new Array(NREG).fill(1)} },
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, linewidth:1,
    })
    return { geo: g, mat: m }
  }, [])

  useFrame(({ clock }, delta) => {
    mat.uniforms.uTime.value += delta
    mat.uniforms.uGrow.value += delta * 0.25
    mat.uniforms.uReveal.value = revealRef.current.value
    computeRegionScales(clock.getElapsedTime(), regScales)
    mat.uniforms.uRegScale.value = regScales
    const line = connActiveRef.current, attr = geo.attributes.aCActive, arr = attr.array
    let dirty = false
    for (let ci=0;ci<CONN.count;ci++){ const v=line[ci]; if(v>0.001){line[ci]=v*0.945;dirty=true} else if(v!==0) line[ci]=0; const nv=line[ci]; arr[ci*2]=nv; arr[ci*2+1]=nv }
    if (dirty) attr.needsUpdate = true
  })
  return <lineSegments geometry={geo} material={mat} />
}

// ═══════════════════════════════════════════════════════════════════
// ELECTRICAL BOLTS  (trails, branching, ride local + long-range fibres)
// ═══════════════════════════════════════════════════════════════════

function Bolts({ activityRef, cognitionRef, revealRef }) {
  const posBuf = useMemo(() => new Float32Array(MAX_SIG*2*3).fill(9999), [])
  const alphaBuf = useMemo(() => new Float32Array(MAX_SIG*2), [])
  const sigs = useRef([])
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pAttr = new THREE.BufferAttribute(posBuf, 3); pAttr.usage = THREE.DynamicDrawUsage
    const aAttr = new THREE.BufferAttribute(alphaBuf, 1); aAttr.usage = THREE.DynamicDrawUsage
    g.setAttribute('position', pAttr); g.setAttribute('aAlpha', aAttr)
    const m = new THREE.ShaderMaterial({ vertexShader:VERT_BOLT, fragmentShader:FRAG_BOLT, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })
    return { geo: g, mat: m }
  }, [posBuf, alphaBuf])

  const spawn = (ci, opts={}) => {
    if (sigs.current.length >= MAX_SIG || ci === undefined) return
    sigs.current.push({ ci, t:0, rev: opts.rev ?? Math.random()>0.5, spd: opts.spd ?? (0.25+Math.random()*0.7), len:0.06+Math.random()*0.16, bright:0.55+Math.random()*0.45, gen: opts.gen ?? 0 })
  }

  useFrame((_, delta) => {
    const activity = activityRef.current, cog = cognitionRef.current
    if (revealRef.current.value < 0.5 && Math.random() < delta*(5+10*activity) && sigs.current.length < MAX_SIG) {
      const pw = cog.pathway
      if ((cog.mode==='reasoning'||cog.mode==='memory') && pw && pw.conns.length && Math.random()<0.7) spawn(pw.conns[Math.floor(Math.random()*pw.conns.length)])
      else spawn(Math.floor(Math.random()*CD.count))
    }
    const cp = CD.positions; let wi = 0
    sigs.current = sigs.current.filter(s => {
      s.t += delta * s.spd
      if (s.t >= 1) {
        if (s.gen < 2 && Math.random() < 0.45) {
          const nEnd = endNode(s.ci, s.rev), nbrs = ADJ[nEnd], branches = 1 + (Math.random()<0.3?1:0)
          for (let bI=0;bI<branches;bI++){ const nb = nbrs[Math.floor(Math.random()*nbrs.length)]; const ci2 = connOf(nEnd, nb); if (ci2!==undefined) spawn(ci2, { gen:s.gen+1, rev: CD.pairs[ci2][0]!==nEnd, spd: s.spd*(0.85+Math.random()*0.4) }) }
        }
        return false
      }
      if (wi >= MAX_SIG) return false
      const c = s.ci*6; if (c+5 >= cp.length) return false
      const head = s.rev ? 1-s.t : s.t, tT = Math.max(0, s.t - s.len), tail = s.rev ? 1-tT : tT
      const fade = Math.min(1, (1-s.t)*3) * s.bright
      const hp = wi*6, ax=cp[c],ay=cp[c+1],az=cp[c+2],bx=cp[c+3],by=cp[c+4],bz=cp[c+5]
      posBuf[hp]=ax+(bx-ax)*head; posBuf[hp+1]=ay+(by-ay)*head; posBuf[hp+2]=az+(bz-az)*head
      posBuf[hp+3]=ax+(bx-ax)*tail; posBuf[hp+4]=ay+(by-ay)*tail; posBuf[hp+5]=az+(bz-az)*tail
      alphaBuf[wi*2]=fade; alphaBuf[wi*2+1]=0.0; wi++
      return true
    })
    for (let i=wi*2;i<MAX_SIG*2;i++){ posBuf[i*3]=9999; alphaBuf[i]=0 }
    geo.attributes.position.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true
  })
  return <lineSegments geometry={geo} material={mat} />
}

// ═══════════════════════════════════════════════════════════════════
// 3D KNOWLEDGE GRAPH  (press G) — real entities, communities, hover discovery
// ═══════════════════════════════════════════════════════════════════

function KnowledgeGraph({ revealRef, graphHoverRef }) {
  const groupRef = useRef(), edgeGeo = useRef()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const { meshes, labels, edgePos, edgeMat, edgeBase } = useMemo(() => {
    const meshes = [], labels = []
    KG.nodes.forEach(nd => {
      const geo = new THREE.SphereGeometry(nd.hub ? 0.11 : 0.065, 18, 18)
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...nd.color), transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false })
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...nd.pos); mesh.userData.kgIndex = KG.nodes.indexOf(nd)
      meshes.push(mesh)
      const lab = makeLabelSprite(nd.name, nd.color, nd.hub); lab.position.set(nd.pos[0], nd.pos[1] + (nd.hub?0.22:0.15), nd.pos[2]); lab.material.opacity = 0
      labels.push(lab)
    })
    const edgePos = new Float32Array(KG.edgePairs.length*2*3)
    const edgeBase = new Float32Array(KG.edgePairs.length)
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x77bbff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false })
    return { meshes, labels, edgePos, edgeMat, edgeBase }
  }, [])

  useFrame(({ clock, camera, mouse }) => {
    const rv = revealRef.current.value
    if (groupRef.current) groupRef.current.visible = rv > 0.01
    if (rv <= 0.01) { graphHoverRef.current = -1; return }
    const t = clock.getElapsedTime()

    // hover discovery (only when mostly revealed)
    let hover = -1
    if (rv > 0.7 && groupRef.current) {
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(meshes, false)
      if (hits.length) hover = hits[0].object.userData.kgIndex
    }
    graphHoverRef.current = hover
    const lit = new Set()
    if (hover >= 0) { lit.add(hover); for (const nb of KG.adj[hover]) lit.add(nb) }

    meshes.forEach((mesh, i) => {
      const delay = (i / KG.nodes.length) * 0.4
      const p = THREE.MathUtils.clamp((rv - delay) / 0.35, 0, 1)
      const community = Math.sin(t * 0.4 + i * 0.7) * 0.05    // communities breathe / drift
      const hl = hover < 0 ? 1 : (lit.has(i) ? 1.5 : 0.25)
      mesh.scale.setScalar((0.2 + p * 0.85) * hl + community * p)
      mesh.material.opacity = p * (hover < 0 ? 0.95 : (lit.has(i) ? 1.0 : 0.3))
      labels[i].material.opacity = THREE.MathUtils.clamp((rv - delay - 0.15)/0.3, 0, 1) * (hover < 0 ? 0.9 : (lit.has(i) ? 1.0 : 0.15))
    })
    if (edgeGeo.current) {
      const arr = edgeGeo.current.attributes.position.array
      KG.edgePairs.forEach(([a,b], ei) => {
        const pa = KG.nodes[a].pos, pb = KG.nodes[b].pos
        const delay = 0.25 + (ei / KG.edgePairs.length) * 0.5
        const grow = THREE.MathUtils.clamp((rv - delay)/0.3, 0, 1)
        const breathe = 1 + Math.sin(t * 0.8 + ei) * 0.012
        const o = ei*6
        arr[o]=pa[0]*breathe; arr[o+1]=pa[1]*breathe; arr[o+2]=pa[2]*breathe
        arr[o+3]=(pa[0]+(pb[0]-pa[0])*grow)*breathe; arr[o+4]=(pa[1]+(pb[1]-pa[1])*grow)*breathe; arr[o+5]=(pa[2]+(pb[2]-pa[2])*grow)*breathe
        edgeBase[ei] = (hover < 0) ? 0.5 : ((lit.has(a) && lit.has(b)) ? 0.95 : 0.1)
      })
      edgeGeo.current.attributes.position.needsUpdate = true
      const avg = edgeBase.reduce((s,v)=>s+v,0) / Math.max(1, edgeBase.length)
      edgeMat.opacity = THREE.MathUtils.clamp((rv - 0.3)/0.4, 0, 1) * (0.25 + avg * 0.35)
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      {meshes.map((m,i) => <primitive key={`n${i}`} object={m} />)}
      {labels.map((l,i) => <primitive key={`l${i}`} object={l} />)}
      <lineSegments material={edgeMat}>
        <bufferGeometry ref={edgeGeo}>
          <bufferAttribute attach="attributes-position" array={edgePos} count={KG.edgePairs.length*2} itemSize={3} />
        </bufferGeometry>
      </lineSegments>
    </group>
  )
}

function Dust() {
  const ref = useRef()
  const { geo, mat } = useMemo(() => {
    const n=160, pos=new Float32Array(n*3)
    for(let i=0;i<n;i++){pos[i*3]=(Math.random()-0.5)*6.5;pos[i*3+1]=(Math.random()-0.5)*4.8;pos[i*3+2]=(Math.random()-0.5)*5.5}
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3))
    const m=new THREE.PointsMaterial({size:0.013,color:0x6688cc,transparent:true,opacity:0.28,blending:THREE.AdditiveBlending,depthWrite:false})
    return {geo:g,mat:m}
  }, [])
  useFrame(({clock}) => { if(ref.current){const t=clock.getElapsedTime(); ref.current.rotation.y=t*0.012; ref.current.position.y=Math.sin(t*0.1)*0.1} })
  return <points ref={ref} geometry={geo} material={mat} />
}
function Nebula() {
  const { geo, mat } = useMemo(() => {
    const n=800, pos=new Float32Array(n*3)
    for(let i=0;i<n;i++){pos[i*3]=(Math.random()-0.5)*16;pos[i*3+1]=(Math.random()-0.5)*10;pos[i*3+2]=(Math.random()-0.5)*12-5}
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3))
    const m=new THREE.PointsMaterial({size:0.026,transparent:true,opacity:0.36,color:0x1a2a55,blending:THREE.AdditiveBlending,depthWrite:false})
    return {geo:g,mat:m}
  }, [])
  return <points geometry={geo} material={mat} />
}

// ═══════════════════════════════════════════════════════════════════
// BRAIN GROUP — cognition, storms, journeys, presentation, cinematic camera
// ═══════════════════════════════════════════════════════════════════

function BrainGroup(props) {
  const { firingRef, haloRef, activityRef, focusRef, hoverRef, connActiveRef, cognitionRef, revealRef, waveRef, journeyRef, demoRef, stormRef, dofTarget, setFocusRegion } = props
  const groupRef = useRef()
  const spring = useRef({ rx:0, ry:0, vx:0, vy:0 })
  const mouse = useRef({ x:0, y:0 })
  const zoomRef = useRef(4.2), zoomTargetRef = useRef(4.2)
  const SCALE = 1.9

  const ignite = (center, spread, count) => { const fa = firingRef.current; if (!fa) return; const n = BD.count; for (let k=0;k<count;k++){ const idx = Math.max(0, Math.min(n-1, center + Math.floor((Math.random()-0.5)*spread))); fa[idx] = 0.5 + Math.random()*0.5 } }
  const igniteRegion = (region, count) => { const fa = firingRef.current, ha = haloRef.current; const list = BD.neuronsByRegion[region]; if (!list.length) return; for (let k=0;k<count;k++){ const idx = list[Math.floor(Math.random()*list.length)]; if (fa) fa[idx] = 0.6+Math.random()*0.4; if (ha) ha[idx] = Math.max(ha[idx], 0.5) } }
  const lightFibre = (ra, rb, amt) => { const list = CD.fibresByLink.get(CD.linkKey(ra,rb)); if (!list) return; const ca = connActiveRef.current; for (const ci of list) ca[ci] = Math.min(1, ca[ci] + amt) }
  const startWave = (region) => { const w = waveRef.current; w.region = region; w.pos = -1.3; w.active = 1; w.running = true }
  const startJourney = () => { journeyRef.current = { active:true, stage:0, t:0, total:0, _s:-1 }; cognitionRef.current._js = -1 }

  // ── Storm: a large pulse travels across multiple regions ──────────────────────
  const startStorm = () => {
    const start = Math.floor(Math.random()*NREG)
    const order = [], seen = new Set([start]), q = [{ r:start, d:0 }]
    while (q.length) { const { r, d } = q.shift(); order.push({ r, d }); for (const nb of REGION_ADJ[r]) if (!seen.has(nb)) { seen.add(nb); q.push({ r:nb, d:d+0.35+Math.random()*0.2, from:r }) } }
    // attach 'from' for fibre lighting
    const withFrom = []; const seen2 = new Set([start]); const q2 = [{ r:start, d:0, from:-1 }]
    while (q2.length) { const cur = q2.shift(); withFrom.push(cur); for (const nb of REGION_ADJ[cur.r]) if (!seen2.has(nb)) { seen2.add(nb); q2.push({ r:nb, d:cur.d+0.32+Math.random()*0.18, from:cur.r }) } }
    stormRef.current = { active:true, t:0, queue: withFrom, idx:0 }
  }
  const driveStorm = (delta) => {
    const st = stormRef.current; if (!st.active) return
    st.t += delta
    while (st.idx < st.queue.length && st.t >= st.queue[st.idx].d) {
      const { r, from } = st.queue[st.idx]
      igniteRegion(r, 26); startWave(r)
      if (from >= 0) lightFibre(from, r, 0.9)
      activityRef.current = Math.min(3.0, activityRef.current + 0.25)
      st.idx++
    }
    if (st.idx >= st.queue.length && st.t > st.queue[st.queue.length-1].d + 1.2) st.active = false
  }

  // ── Continuous inter-region communication (subconscious chatter) ──────────────
  const communicate = (delta) => { if (Math.random() < delta * 1.6) { const e = REGION_LINKS[Math.floor(Math.random()*REGION_LINKS.length)]; lightFibre(e[0], e[1], 0.5); if (Math.random()<0.5) igniteRegion(e[1], 3) } }

  const transition = (cog) => {
    if (cog.mode==='reasoning'||cog.mode==='memory') { cog.mode='idle'; cog.timer=2.5+Math.random()*3; cog.confTarget=0.64+Math.random()*0.1; cog.activeRegion=-1; cog.pathway=null; cog.activeCentroid=null }
    else if (Math.random()<0.6) { const reg = R_REASONING; cog.mode='reasoning'; cog.timer=4+Math.random()*3; cog.activeRegion=reg; cog.pathway=buildPathway(seedInRegion(reg),18); cog.step=0; cog.confTarget=0.50+Math.random()*0.45; cog.activeCentroid=BD.centroids[reg] }
    else { const reg = R_MEMORY; cog.mode='memory'; cog.timer=3.5+Math.random()*2; cog.activeRegion=reg; cog.pathway=buildPathway(seedInRegion(reg),12); cog.step=0; cog.confTarget=0.70+Math.random()*0.25; cog.activeCentroid=BD.centroids[reg] }
  }
  const drivePathway = (cog, delta, rate) => {
    const fa = firingRef.current, pw = cog.pathway
    if (pw && pw.neurons.length) { cog.step += delta*rate; const head = Math.floor(cog.step)%pw.neurons.length
      for (let w=0;w<3;w++){ const ni = pw.neurons[(head+w)%pw.neurons.length]; if (fa){ fa[ni]=1.0; for (const nb of ADJ[ni]) fa[nb]=Math.max(fa[nb],0.35) } }
      const ca = connActiveRef.current; for (const ci of pw.conns) ca[ci]=Math.min(1, ca[ci]+delta*3) }
  }
  const drive = (cog, delta) => {
    if (cog.mode==='idle') { activityRef.current += (1.2-activityRef.current)*Math.min(1,delta*1.5); if (Math.random()<delta*0.3){ activityRef.current=Math.min(2.4,activityRef.current+Math.random()*0.8); ignite(Math.floor(Math.random()*BD.count),90,5+Math.floor(Math.random()*22)) } }
    else { const base = cog.mode==='reasoning'?0.55:0.65; activityRef.current += (base-activityRef.current)*Math.min(1,delta*2); drivePathway(cog,delta,cog.mode==='reasoning'?7:4.5) }
  }

  // ── Thought Journey: full 12-stage cognition through the nervous system ───────
  const JOURNEY = [
    { name:'Question',       reg:R_REASONING, dur:1.6, conf:0.40 },
    { name:'Memory Search',  reg:R_MEMORY,    dur:1.9, conf:0.45 },
    { name:'People',         reg:R_PEOPLE,    dur:1.6, conf:0.50 },
    { name:'Projects',       reg:R_PROJECTS,  dur:1.6, conf:0.54 },
    { name:'Evidence',       reg:R_EVIDENCE,  dur:1.9, conf:0.60 },
    { name:'Reasoning',      reg:R_REASONING, dur:2.4, conf:0.68 },
    { name:'Simulation',     reg:R_SIM,       dur:2.0, conf:0.74 },
    { name:'Confidence',     reg:R_KNOWLEDGE, dur:1.8, conf:0.88 },
    { name:'Recommendation', reg:R_RECS,      dur:2.0, conf:0.90 },
    { name:'Approval',       reg:R_GOALS,     dur:1.7, conf:0.92 },
    { name:'Learning',       reg:R_LEARNING,  dur:1.7, conf:0.93 },
    { name:'Memory Updated', reg:R_MEMORY,    dur:1.8, conf:0.95 },
  ]
  const driveJourney = (delta) => {
    const j = journeyRef.current, cog = cognitionRef.current
    if (j._s !== j.stage) {  // entering a new stage
      j._s = j.stage
      const st = JOURNEY[j.stage]; if (!st) { j.active = false; return }
      cog.activeRegion = st.reg; cog.activeCentroid = BD.centroids[st.reg]; cog.confTarget = st.conf
      cog.pathway = buildPathway(seedInRegion(st.reg), 16); cog.step = 0
      igniteRegion(st.reg, 22); startWave(st.reg)
      if (j.stage > 0) lightFibre(JOURNEY[j.stage-1].reg, st.reg, 1.0)
    }
    const st = JOURNEY[j.stage]
    drivePathway(cog, delta, 7)
    activityRef.current += (0.6 - activityRef.current) * Math.min(1, delta*2)
    j.t += delta; j.total += delta
    if (j.t >= st.dur) { j.t = 0; j.stage++; if (j.stage >= JOURNEY.length) j.active = false }
  }

  const pres = useRef({ phase:-1, timer:0 })
  const PRES = [ { a:'journey', d:24 }, { a:'storm', d:6 }, { a:'graph', d:14 }, { a:'idle', d:6 }, { a:'storm', d:6 } ]
  const drivePresentation = (delta) => {
    const p = pres.current; p.timer -= delta
    if (p.timer <= 0) { p.phase = (p.phase+1)%PRES.length; const step = PRES[p.phase]; p.timer = step.d
      if (step.a==='journey') startJourney(); else if (step.a==='graph') revealRef.current.target=1; else if (step.a==='storm'){ revealRef.current.target=0; startStorm() } else revealRef.current.target=0 }
  }

  useEffect(() => {
    const touch = () => { demoRef.current.lastInteract = performance.now()/1000; demoRef.current.presentation = false }
    const onMove = e => { mouse.current.x=(e.clientX/window.innerWidth-0.5)*2; mouse.current.y=(e.clientY/window.innerHeight-0.5)*2; touch() }
    const onWheel = e => { zoomTargetRef.current=Math.max(1.6,Math.min(7.5,zoomTargetRef.current+e.deltaY*0.005)); if(focusRef.current.target>=0&&zoomTargetRef.current>5.2){focusRef.current.target=-1;setFocusRegion(-1)} touch() }
    const onClick = () => { touch(); if (revealRef.current.target>0.5) return
      activityRef.current=Math.min(4,activityRef.current+1.6)
      const hi=hoverRef.current.index, hr=hoverRef.current.region
      if (hi>=0 && hr>=0) { const f=focusRef.current; if (f.target===hr){f.target=-1;setFocusRegion(-1)} else {f.target=hr;setFocusRegion(hr);zoomTargetRef.current=2.8;ignite(hi,220,90);igniteRegion(hr,30)} ignite(hi,60,40) }
      else if (focusRef.current.target>=0){focusRef.current.target=-1;setFocusRegion(-1);zoomTargetRef.current=4.2}
      else ignite(Math.floor(Math.random()*BD.count),300,150)
    }
    window.addEventListener('mousemove',onMove); window.addEventListener('wheel',onWheel,{passive:true}); window.addEventListener('click',onClick)
    return () => { window.removeEventListener('mousemove',onMove); window.removeEventListener('wheel',onWheel); window.removeEventListener('click',onClick) }
  }, [activityRef, firingRef, focusRef, hoverRef, revealRef, demoRef, setFocusRegion])

  useFrame(({ clock, camera }, delta) => {
    const s = spring.current, m = mouse.current
    const dx = m.x-s.rx, dy = -m.y-s.ry
    s.vx=(s.vx+dx*0.048)*0.876; s.vy=(s.vy+dy*0.038)*0.876; s.rx+=s.vx; s.ry+=s.vy

    const rev = revealRef.current; rev.value += (rev.target-rev.value)*Math.min(1,delta*2.2)
    const w = waveRef.current
    if (w.running){ w.pos += delta*0.9; if (w.pos>1.4){ w.running=false; w.active=0; w.region=-1; w.timer=5+Math.random()*7 } }
    else { w.timer -= delta; if (w.timer<=0 && !journeyRef.current.active) startWave(Math.floor(Math.random()*NREG)) }

    const cog = cognitionRef.current
    const idle = performance.now()/1000 - demoRef.current.lastInteract
    if (idle > 20) { if (!demoRef.current.presentation){ demoRef.current.presentation=true; pres.current.timer=0; pres.current.phase=-1 } drivePresentation(delta) }

    // storms + continuous chatter (always-on subconscious activity)
    communicate(delta)
    if (!stormRef.current.active) { stormRef.current.timer = (stormRef.current.timer ?? 8) - delta; if (stormRef.current.timer <= 0 && !journeyRef.current.active) { startStorm(); stormRef.current.timer = 7 + Math.random()*6 } }
    driveStorm(delta)

    if (journeyRef.current.active) driveJourney(delta)
    else if (focusRef.current.target < 0) { cog.timer -= delta; if (cog.timer<=0) transition(cog); drive(cog, delta) }
    else { cog.mode='focus'; cog.activeRegion=focusRef.current.region; cog.activeCentroid=BD.centroids[focusRef.current.region]; cog.confTarget=0.82; activityRef.current=Math.max(1.6,activityRef.current-delta*0.6) }
    cog.confidence += (cog.confTarget - cog.confidence)*Math.min(1,delta*1.2)

    const fmix = focusRef.current.mix, region = focusRef.current.region
    if (groupRef.current) {
      const t = clock.getElapsedTime(), g = groupRef.current
      const presSpin = demoRef.current.presentation ? 0.05 : 0
      // cinematic micro-drift always present
      const drift = Math.sin(t*0.07)*0.05 + Math.sin(t*0.031)*0.03
      const freeY = t*(0.04+presSpin) + s.rx*0.38 + drift, freeX = s.ry*0.20 + Math.sin(t*0.05)*0.03
      let focY=freeY, focX=freeX, offY=0
      if (region>=0){ const [cx,cy,cz]=BD.centroids[region]; focY=-Math.atan2(cx,cz)+s.rx*0.18; focX=Math.atan2(cy,Math.hypot(cx,cz))*0.6+s.ry*0.12; offY=-cy*SCALE*0.9 }
      g.rotation.y = freeY+(focY-freeY)*fmix
      g.rotation.x = freeX+(focX-freeX)*fmix
      g.position.y += (offY*fmix - g.position.y)*Math.min(1,delta*4)
      g.scale.setScalar(SCALE)
    }

    // cinematic zoom: gentle breathing + occasional slow zoom toward active region
    const t = clock.getElapsedTime()
    const zoomBreath = Math.sin(t*0.06)*0.18
    zoomRef.current += (zoomTargetRef.current + zoomBreath - zoomRef.current)*0.04
    camera.position.z += (zoomRef.current - camera.position.z)*0.06

    let tx=0, ty=0
    const ac = cog.activeCentroid
    if (ac && focusRef.current.target<0 && rev.value<0.5) {
      const ry = groupRef.current ? groupRef.current.rotation.y : 0
      const worldX = ac[0]*Math.cos(ry)+ac[2]*Math.sin(ry)
      tx = THREE.MathUtils.clamp(worldX*0.16,-0.30,0.30); ty = THREE.MathUtils.clamp(ac[1]*0.12,-0.20,0.20)
    }
    // always-present cinematic sway
    tx += Math.sin(t*0.043)*0.04; ty += Math.cos(t*0.037)*0.03
    camera.position.x += (tx - camera.position.x)*Math.min(1,delta*0.6)
    camera.position.y += (ty - camera.position.y)*Math.min(1,delta*0.6)
    camera.lookAt(0,0,0)

    if (dofTarget) {
      let dx2=0, dy2=0, dz=0
      if (ac && focusRef.current.target<0){ const ry=groupRef.current?groupRef.current.rotation.y:0; dx2=(ac[0]*Math.cos(ry)+ac[2]*Math.sin(ry))*SCALE; dy2=ac[1]*SCALE; dz=(-ac[0]*Math.sin(ry)+ac[2]*Math.cos(ry))*SCALE }
      dofTarget.x += (dx2-dofTarget.x)*Math.min(1,delta*0.8); dofTarget.y += (dy2-dofTarget.y)*Math.min(1,delta*0.8); dofTarget.z += (dz-dofTarget.z)*Math.min(1,delta*0.8)
    }
  })

  return (
    <group ref={groupRef}>
      <Particles firingRef={firingRef} haloRef={haloRef} activityRef={activityRef} focusRef={focusRef} hoverRef={hoverRef} cognitionRef={cognitionRef} revealRef={revealRef} waveRef={waveRef} />
      <Connectome connActiveRef={connActiveRef} revealRef={revealRef} />
      <Bolts activityRef={activityRef} cognitionRef={cognitionRef} revealRef={revealRef} />
      <KnowledgeGraph revealRef={revealRef} graphHoverRef={props.graphHoverRef} />
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════
// SCENE
// ═══════════════════════════════════════════════════════════════════

function Scene(props) {
  const bloomRef = useRef()
  const bgColor = useMemo(() => new THREE.Color('#020812'), [])
  const dofTarget = useMemo(() => new THREE.Vector3(0,0,0), [])
  useFrame(({ clock, scene }) => {
    const t = clock.getElapsedTime()
    const h = 0.62 + Math.sin(t*0.013)*0.025
    bgColor.setHSL(h, 0.66, 0.034)
    if (scene.background) scene.background.copy(bgColor)
    if (scene.fog) scene.fog.color.copy(bgColor)
    if (bloomRef.current) bloomRef.current.intensity = 2.0 + Math.sin(t*0.16)*0.28 + props.activityRef.current*0.14
  })
  return (
    <>
      <color attach="background" args={['#020812']} />
      <fog attach="fog" args={['#020812', 12, 26]} />
      <ambientLight intensity={0.06} />
      <pointLight position={[0,3,-2]} intensity={3.5} color="#2277ff" />
      <pointLight position={[2,-1,0]} intensity={1.8} color="#7722ff" />
      <pointLight position={[-2,0,1]} intensity={1.2} color="#00aaff" />
      <pointLight position={[0,-2,2]} intensity={1.0} color="#ff44aa" />
      <Nebula /><Dust />
      <BrainGroup {...props} dofTarget={dofTarget} />
      <EffectComposer>
        <Bloom ref={bloomRef} intensity={2.0} luminanceThreshold={0.42} luminanceSmoothing={0.88} />
        <DepthOfField target={dofTarget} focalLength={0.52} bokehScale={3.4} height={480} />
        <Vignette eskil={false} offset={0.18} darkness={1.42} />
      </EffectComposer>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// HUD
// ═══════════════════════════════════════════════════════════════════

function rgbStr(c, a) { return `rgba(${Math.round(c[0]*255)}, ${Math.round(c[1]*255)}, ${Math.round(c[2]*255)}, ${a})` }
const MODE_META = { idle:{l:'Idle',c:'rgba(90,170,255,0.7)'}, reasoning:{l:'Reasoning',c:'rgba(60,220,255,0.85)'}, memory:{l:'Recall',c:'rgba(200,90,255,0.85)'}, focus:{l:'Inspecting',c:'rgba(120,255,180,0.85)'} }
const JOURNEY_NAMES = ['Question','Memory Search','People','Projects','Evidence','Reasoning','Simulation','Confidence','Recommendation','Approval','Learning','Memory Updated']

function HUDLive({ cognitionRef, journeyRef }) {
  const [s, setS] = useState({ mode:'idle', confidence:0.7, journey:null })
  useEffect(() => { const t=setInterval(()=>{ const c=cognitionRef.current,j=journeyRef.current; setS({mode:c.mode,confidence:c.confidence,journey:j.active?j.stage:null}) },180); return ()=>clearInterval(t) }, [cognitionRef, journeyRef])
  const meta = MODE_META[s.mode] ?? MODE_META.idle
  return (<>
    <div style={{ marginTop:8, color: meta.c }}>◈&nbsp;Cognitive State&nbsp;&nbsp;{(s.journey!=null?'JOURNEY':meta.l).toUpperCase()}</div>
    <div style={{ color:'rgba(60,255,160,0.7)' }}>Confidence&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{Math.round(s.confidence*100)}%</div>
  </>)
}
function JourneyBanner({ journeyRef }) {
  const [stage, setStage] = useState(null)
  useEffect(() => { const t=setInterval(()=>{ const j=journeyRef.current; setStage(j.active?j.stage:null) },120); return ()=>clearInterval(t) }, [journeyRef])
  const mono = { fontFamily:'"SF Mono", Consolas, monospace' }
  return (
    <div style={{ ...mono, position:'absolute', top:70, left:'50%', transform:`translateX(-50%) translateY(${stage!=null?0:-12}px)`, opacity: stage!=null?1:0, transition:'opacity 0.5s ease, transform 0.5s ease', pointerEvents:'none', textAlign:'center' }}>
      <div style={{ fontSize:8, letterSpacing:'0.4em', color:'rgba(140,190,255,0.55)', textTransform:'uppercase' }}>Thought Journey</div>
      <div style={{ fontSize:15, letterSpacing:'0.18em', color:'rgba(120,220,255,0.95)', textTransform:'uppercase', marginTop:6 }}>{stage!=null?`${stage+1} / 12 · ${JOURNEY_NAMES[stage]}`:''}</div>
    </div>
  )
}
function GraphLegend({ revealRef, graphHoverRef }) {
  const [st, setSt] = useState({ show:false, hover:-1 })
  useEffect(() => { const t=setInterval(()=>setSt({ show:revealRef.current.target>0.5, hover:graphHoverRef.current }),150); return ()=>clearInterval(t) }, [revealRef, graphHoverRef])
  const mono = { fontFamily:'"SF Mono", Consolas, monospace' }
  const hoverName = st.hover>=0 ? KG.nodes[st.hover].name : null
  return (
    <div style={{ ...mono, position:'absolute', top:'50%', right:30, transform:`translateY(-50%) translateX(${st.show?0:14}px)`, opacity: st.show?1:0, transition:'opacity 0.6s ease, transform 0.6s ease', pointerEvents:'none', fontSize:9, letterSpacing:'0.12em', lineHeight:1.85, textTransform:'uppercase', maxHeight:'80vh' }}>
      <div style={{ color:'rgba(150,200,255,0.65)', marginBottom:8, letterSpacing:'0.26em' }}>◇ Executive Knowledge Graph</div>
      {hoverName && <div style={{ color:'rgba(120,255,200,0.95)', marginBottom:8 }}>▸ {hoverName} &nbsp;<span style={{color:'rgba(150,200,255,0.5)'}}>+ {KG.adj[st.hover].length} links</span></div>}
      {['people','coach','travel','lead','intel','work'].map(cl => {
        const node = KG.nodes.find(n => n.cluster===cl)
        const names = KG.nodes.filter(n=>n.cluster===cl).map(n=>n.name)
        return <div key={cl} style={{ color: rgbStr(node.color, 0.85), display:'flex', gap:7, alignItems:'flex-start', marginBottom:4 }}>
          <span style={{ width:6, height:6, marginTop:4, borderRadius:'50%', background: rgbStr(node.color,0.95), boxShadow:`0 0 6px ${rgbStr(node.color,0.7)}`, flexShrink:0 }} />
          <span style={{ fontSize:8, opacity:0.85 }}>{names.join(' · ')}</span>
        </div>
      })}
    </div>
  )
}

function HUD({ focusRegion, cognitionRef, journeyRef, revealRef, graphHoverRef, demo }) {
  const mono = { fontFamily:'"SF Mono", Consolas, "Courier New", monospace' }
  const focused = focusRegion >= 0, reg = focused ? REGIONS[focusRegion] : null
  const accent = reg ? rgbStr(reg.color, 0.9) : 'rgba(90,170,255,0.85)'
  const dim = demo ? 0.32 : 1
  return (
    <>
      <div style={{ ...mono, position:'absolute', bottom:28, left:28, color:'rgba(70,150,255,0.65)', fontSize:10, letterSpacing:'0.14em', lineHeight:1.9, pointerEvents:'none', textTransform:'uppercase' }}>
        <div style={{ opacity:dim }}>Neural Nodes&nbsp;&nbsp;&nbsp;&nbsp;{BD.count.toLocaleString()}</div>
        <div style={{ opacity:dim }}>Neural Fibres&nbsp;&nbsp;&nbsp;{CD.count.toLocaleString()}</div>
        <div style={{ opacity:dim }}>Knowledge Regions&nbsp;{NREG}</div>
        <HUDLive cognitionRef={cognitionRef} journeyRef={journeyRef} />
      </div>
      <div style={{ ...mono, position:'absolute', top:20, right:24, color:'rgba(70,150,255,0.45)', fontSize:9, letterSpacing:'0.20em', textAlign:'right', pointerEvents:'none', textTransform:'uppercase', opacity:dim }}>
        <div style={{ color:'rgba(90,170,255,0.85)', fontSize:11, marginBottom:7, letterSpacing:'0.22em' }}>The Living Mind</div>
        <div>Executive Intelligence</div>
        <div style={{ marginTop:5, color:'rgba(90,255,160,0.55)' }}>PIF-7 · Live</div>
      </div>
      <div style={{ ...mono, position:'absolute', bottom:28, right:28, color:'rgba(70,150,255,0.28)', fontSize:8, letterSpacing:'0.14em', textAlign:'right', pointerEvents:'none', textTransform:'uppercase', lineHeight:2.1, opacity:dim }}>
        <div>D&nbsp;&nbsp;→&nbsp;Presentation</div>
        <div>G&nbsp;&nbsp;→&nbsp;Knowledge Graph</div>
        <div>Space&nbsp;&nbsp;→&nbsp;Thought Journey</div>
        <div>Hover&nbsp;/&nbsp;Click&nbsp;&nbsp;→&nbsp;Explore</div>
      </div>
      <div style={{ position:'absolute', top:20, left:20, display:'flex', alignItems:'center', gap:8, pointerEvents:'none' }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:'rgba(60,255,140,0.8)', boxShadow:'0 0 8px rgba(60,255,140,0.6)', animation:'pulse-hud 2s ease-in-out infinite' }} />
        <span style={{ ...mono, fontSize:9, color:'rgba(60,255,140,0.55)', letterSpacing:'0.18em', textTransform:'uppercase' }}>{demo?'Presentation':'Live'}</span>
      </div>
      <JourneyBanner journeyRef={journeyRef} />
      <GraphLegend revealRef={revealRef} graphHoverRef={graphHoverRef} />
      <div style={{ ...mono, position:'absolute', left:'50%', bottom:56, transform:`translateX(-50%) translateY(${focused?0:18}px)`, opacity: focused?1:0, transition:'opacity 0.5s ease, transform 0.5s cubic-bezier(0.2,0.8,0.2,1)', pointerEvents:'none', textAlign:'center', padding:'14px 30px', borderRadius:14, background:'rgba(4,10,22,0.55)', backdropFilter:'blur(14px)', border:`1px solid ${reg?rgbStr(reg.color,0.35):'transparent'}`, boxShadow: reg?`0 0 40px ${rgbStr(reg.color,0.18)}`:'none' }}>
        <div style={{ fontSize:8, letterSpacing:'0.34em', color:'rgba(160,200,255,0.5)', textTransform:'uppercase', marginBottom:7 }}>◇ Knowledge Region Engaged</div>
        <div style={{ fontSize:19, letterSpacing:'0.16em', color:accent, textTransform:'uppercase', fontWeight:600 }}>{reg?.name ?? ''}</div>
        <div style={{ fontSize:10, letterSpacing:'0.24em', color:'rgba(180,210,255,0.6)', textTransform:'uppercase', marginTop:6 }}>{reg?.role ?? ''}{reg && <span style={{ color: rgbStr(reg.color,0.7) }}>&nbsp;·&nbsp;{BD.counts[focusRegion].toLocaleString()} nodes</span>}</div>
      </div>
      <style>{`@keyframes pulse-hud{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.7)}}@keyframes boot-fade{0%{opacity:0;letter-spacing:0.6em}18%{opacity:1}78%{opacity:1;letter-spacing:0.32em}100%{opacity:0;letter-spacing:0.32em}}`}</style>
    </>
  )
}

function BootTitle() {
  const mono = { fontFamily:'"SF Mono", Consolas, monospace' }
  const [gone, setGone] = useState(false)
  useEffect(() => { const t=setTimeout(()=>setGone(true),3600); return ()=>clearTimeout(t) }, [])
  if (gone) return null
  return (<div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
    <div style={{ ...mono, fontSize:13, letterSpacing:'0.32em', color:'rgba(150,195,255,0.92)', textTransform:'uppercase', animation:'boot-fade 3.6s ease forwards' }}>The Living Mind</div>
  </div>)
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

export default function NeuralConsciousness() {
  const firingRef = useRef(null), haloRef = useRef(null)
  const activityRef = useRef(1.0)
  const focusRef = useRef({ target:-1, region:-1, mix:0 })
  const hoverRef = useRef({ index:-1, region:-1 })
  const graphHoverRef = useRef(-1)
  const connActiveRef = useRef(new Float32Array(CONN.count))
  const cognitionRef = useRef({ mode:'idle', timer:2.5, confidence:0.7, confTarget:0.7, activeRegion:-1, activeCentroid:null, pathway:null, step:0, _js:0 })
  const revealRef = useRef({ target:0, value:0 })
  const waveRef = useRef({ region:-1, pos:0, active:0, running:false, timer:5 })
  const journeyRef = useRef({ active:false, stage:0, t:0, total:0, _s:-1 })
  const stormRef = useRef({ active:false, t:0, queue:[], idx:0, timer:8 })
  const demoRef = useRef({ demo:false, presentation:false, lastInteract: performance.now()/1000 })

  const [focusRegion, setFocusRegion] = useState(-1)
  const [demo, setDemo] = useState(false)
  const [presenting, setPresenting] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase()
      demoRef.current.lastInteract = performance.now()/1000; demoRef.current.presentation = false
      if (k==='d'){ setDemo(d=>{ const nd=!d; demoRef.current.demo=nd; return nd }) }
      else if (k==='g'){ revealRef.current.target = revealRef.current.target>0.5 ? 0 : 1 }
      else if (k===' '){ e.preventDefault(); journeyRef.current={active:true,stage:0,t:0,total:0,_s:-1}; cognitionRef.current._js=-1 }
    }
    window.addEventListener('keydown', onKey)
    const t = setInterval(() => { const p=demoRef.current.presentation; setPresenting(p); if (p){ demoRef.current.demo=true; setDemo(true) } }, 300)
    return () => { window.removeEventListener('keydown', onKey); clearInterval(t) }
  }, [])

  const active = demo || presenting
  return (
    <div style={{ position:'fixed', top: active?0:56, left: active?0:220, right:0, bottom:0, background:'#020812', cursor:'crosshair', zIndex: active?60:10, overflow:'hidden', transition:'top 0.9s cubic-bezier(0.4,0,0.2,1), left 0.9s cubic-bezier(0.4,0,0.2,1)' }}>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:1, background:'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.6) 100%)', opacity: active?1:0, transition:'opacity 0.9s ease' }} />
      <Canvas camera={{ position:[0,0,4.2], fov:60, near:0.1, far:100 }} gl={{ antialias:true, alpha:false, powerPreference:'high-performance', stencil:false }} dpr={[1, 1.75]} frameloop="always">
        <Suspense fallback={null}>
          <Scene firingRef={firingRef} haloRef={haloRef} activityRef={activityRef} focusRef={focusRef} hoverRef={hoverRef} graphHoverRef={graphHoverRef}
            connActiveRef={connActiveRef} cognitionRef={cognitionRef} revealRef={revealRef} waveRef={waveRef} journeyRef={journeyRef} stormRef={stormRef} demoRef={demoRef} setFocusRegion={setFocusRegion} />
        </Suspense>
      </Canvas>
      <HUD focusRegion={focusRegion} cognitionRef={cognitionRef} journeyRef={journeyRef} revealRef={revealRef} graphHoverRef={graphHoverRef} demo={active} />
      <BootTitle />
    </div>
  )
}
