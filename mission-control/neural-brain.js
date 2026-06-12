import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const h = React.createElement;
const PARTICLE_COUNT = 3600;
const CONNECTION_COUNT = 3200;
const SIGNAL_COUNT = 620;
const palette = [
  new THREE.Color('#67e8f9'),
  new THREE.Color('#60a5fa'),
  new THREE.Color('#8b5cf6'),
  new THREE.Color('#c4b5fd'),
  new THREE.Color('#fcd34d'),
];

function mulberry(seed) {
  return function random() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(0.000001, random());
  const v = Math.max(0.000001, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function brainPoint(random, index) {
  const hemisphere = index % 2 ? 1 : -1;
  const cluster = index % 9;
  const theta = random() * Math.PI * 2;
  const radial = Math.pow(random(), 0.42);
  const lobe = Math.sin(theta * 3 + cluster) * 0.12 + Math.sin(theta * 7 + index * 0.01) * 0.045;
  const xBase = hemisphere * (0.34 + radial * (1.06 + lobe));
  const yBase = Math.sin(theta) * radial * (0.82 + random() * 0.16) + gaussian(random) * 0.045;
  const zBase = Math.cos(theta) * radial * (0.58 + random() * 0.25) + gaussian(random) * 0.06;
  const frontalBulge = Math.max(0, 1 - Math.abs(yBase + 0.05)) * 0.2;
  const rearLift = xBase < 0 ? 0.02 : -0.02;
  const fissure = Math.exp(-Math.abs(xBase) * 5.4) * 0.22;
  const cerebellum = random() < 0.11;

  if (cerebellum) {
    return [
      hemisphere * (0.28 + random() * 0.34),
      -0.76 + gaussian(random) * 0.13,
      -0.28 + gaussian(random) * 0.22,
      cluster,
    ];
  }

  return [
    xBase + hemisphere * frontalBulge - hemisphere * fissure * 0.12,
    yBase + rearLift,
    zBase - fissure,
    cluster,
  ];
}

function makeBrainData() {
  const random = mulberry(9051984);
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const seeds = new Float32Array(PARTICLE_COUNT);
  const clusters = new Float32Array(PARTICLE_COUNT);
  const depths = new Float32Array(PARTICLE_COUNT);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const points = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const [x, y, z, cluster] = brainPoint(random, i);
    const scale = 2.15;
    const px = x * scale;
    const py = y * scale * 1.12;
    const pz = z * scale;
    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;
    seeds[i] = random();
    clusters[i] = cluster;
    depths[i] = 0.55 + random() * 0.9;
    const color = palette[cluster % palette.length].clone().lerp(new THREE.Color('#ffffff'), random() * 0.18);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    points.push(new THREE.Vector3(px, py, pz));
  }

  const edgePositions = new Float32Array(CONNECTION_COUNT * 2 * 3);
  const edgeSeeds = new Float32Array(CONNECTION_COUNT * 2);
  const edgeColors = new Float32Array(CONNECTION_COUNT * 2 * 3);
  const edges = [];

  for (let i = 0; i < CONNECTION_COUNT; i++) {
    const a = Math.floor(random() * PARTICLE_COUNT);
    const direction = random() < 0.78 ? (a + Math.floor(1 + random() * 80)) % PARTICLE_COUNT : Math.floor(random() * PARTICLE_COUNT);
    const b = direction === a ? (direction + 19) % PARTICLE_COUNT : direction;
    const pa = points[a];
    const pb = points[b];
    const color = palette[Math.floor(clusters[a]) % palette.length];
    edgePositions.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], i * 6);
    edgeSeeds[i * 2] = random();
    edgeSeeds[i * 2 + 1] = edgeSeeds[i * 2];
    edgeColors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6);
    edges.push([a, b]);
  }

  const signalStarts = new Float32Array(SIGNAL_COUNT * 3);
  const signalEnds = new Float32Array(SIGNAL_COUNT * 3);
  const signalSeeds = new Float32Array(SIGNAL_COUNT);
  const signalColors = new Float32Array(SIGNAL_COUNT * 3);

  for (let i = 0; i < SIGNAL_COUNT; i++) {
    const [a, b] = edges[Math.floor(random() * edges.length)];
    const pa = points[a];
    const pb = points[b];
    const color = palette[Math.floor(clusters[a]) % palette.length].clone().lerp(new THREE.Color('#ffffff'), 0.18);
    signalStarts.set([pa.x, pa.y, pa.z], i * 3);
    signalEnds.set([pb.x, pb.y, pb.z], i * 3);
    signalSeeds[i] = random();
    signalColors.set([color.r, color.g, color.b], i * 3);
  }

  return { positions, seeds, clusters, depths, colors, edgePositions, edgeSeeds, edgeColors, signalStarts, signalEnds, signalSeeds, signalColors };
}

const particleVertex = `
  uniform float uTime;
  uniform float uFire;
  uniform float uLayer;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aCluster;
  attribute float aDepth;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    vec3 p = position;
    float breathe = sin(uTime * 0.86 + aSeed * 31.0) * 0.032 + sin(uTime * 0.27 + aCluster * 2.7) * 0.018;
    float layerWave = sin(uLayer * 1.9 + aCluster + aSeed * 7.0) * 0.08;
    p *= 1.0 + breathe + uFire * 0.045 + layerWave;
    p.x += sin(uTime * 0.42 + p.y * 1.8 + aSeed * 18.0) * 0.035 * aDepth;
    p.y += cos(uTime * 0.34 + p.x * 1.2 + aSeed * 15.0) * 0.025 * aDepth;
    p.z += sin(uTime * 0.31 + p.x * 1.7 + p.y) * 0.045 * aDepth;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    float pulse = 0.5 + 0.5 * sin(uTime * (1.7 + uFire * 3.2) + aSeed * 46.0 + aCluster);
    vColor = aColor;
    vPulse = pulse;
    gl_PointSize = uPixelRatio * (10.0 + pulse * 8.0 + uFire * 12.0) * (1.0 / max(0.45, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragment = `
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float halo = smoothstep(0.5, 0.08, d) * 0.42;
    float alpha = core * (0.72 + vPulse * 0.28) + halo;
    gl_FragColor = vec4(vColor * (1.1 + vPulse * 0.8), alpha);
  }
`;

const lineVertex = `
  uniform float uTime;
  uniform float uFire;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p += normalize(position + vec3(0.001)) * sin(uTime * 0.5 + aSeed * 33.0) * 0.015;
    float pulse = 0.5 + 0.5 * sin(uTime * (1.2 + uFire * 3.0) + aSeed * 42.0);
    vColor = aColor;
    vAlpha = 0.045 + pulse * (0.11 + uFire * 0.2);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const lineFragment = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

const signalVertex = `
  uniform float uTime;
  uniform float uFire;
  uniform float uPixelRatio;
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float speed = 0.13 + uFire * 0.34;
    float t = fract(uTime * speed + aSeed);
    float eased = smoothstep(0.0, 1.0, t);
    vec3 p = mix(aStart, aEnd, eased);
    p += normalize(cross(aStart + vec3(0.11, 0.03, 0.07), aEnd + vec3(0.02))) * sin(t * 3.14159) * 0.035;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    vColor = aColor;
    vAlpha = smoothstep(0.0, 0.18, t) * smoothstep(1.0, 0.76, t);
    gl_PointSize = uPixelRatio * (18.0 + uFire * 20.0) * (1.0 / max(0.45, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const signalFragment = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vColor * 1.8, alpha);
  }
`;

function NeuralBrain({ telemetry }) {
  const group = useRef();
  const particles = useRef();
  const lines = useRef();
  const signals = useRef();
  const target = useRef({ rx: -0.08, ry: 0, z: 6.3, fire: 0.26, layer: 0 });
  const data = useMemo(makeBrainData, []);
  const { camera, pointer, gl } = useThree();

  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(data.seeds, 1));
    geometry.setAttribute('aCluster', new THREE.BufferAttribute(data.clusters, 1));
    geometry.setAttribute('aDepth', new THREE.BufferAttribute(data.depths, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(data.colors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }, [data]);

  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.edgePositions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(data.edgeSeeds, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(data.edgeColors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }, [data]);

  const signalGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SIGNAL_COUNT * 3), 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(data.signalStarts, 3));
    geometry.setAttribute('aEnd', new THREE.BufferAttribute(data.signalEnds, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(data.signalSeeds, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(data.signalColors, 3));
    geometry.computeBoundingSphere();
    return geometry;
  }, [data]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uFire: { value: 0.2 },
    uLayer: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
  }), []);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    const taskHeat = Math.min(1, (telemetry.current?.notifications || 0) / 12 + (telemetry.current?.messages || 0) / 180);
    target.current.fire += ((telemetry.current?.busy ? 0.78 : 0.2) + taskHeat * 0.34 - target.current.fire) * 0.035;
    const px = telemetry.current?.pointerX ?? pointer.x;
    const py = telemetry.current?.pointerY ?? pointer.y;
    target.current.rx += ((py * 0.18) - target.current.rx) * 0.05;
    target.current.ry += ((px * 0.28) - target.current.ry) * 0.05;
    target.current.z += ((telemetry.current?.deep ? 3.75 : 6.15) - target.current.z) * 0.035;
    target.current.layer += ((telemetry.current?.layer || 0) - target.current.layer) * 0.035;

    if (group.current) {
      group.current.rotation.x = -0.08 + target.current.rx + Math.sin(time * 0.27) * 0.035;
      group.current.rotation.y = target.current.ry + Math.sin(time * 0.19) * 0.12;
      group.current.rotation.z = Math.sin(time * 0.16) * 0.035;
      const breath = 1 + Math.sin(time * 0.72) * 0.018 + target.current.fire * 0.035;
      group.current.scale.setScalar(breath);
    }

    camera.position.z += (target.current.z - camera.position.z) * Math.min(1, delta * 3.4);
    camera.position.x += (px * 0.28 - camera.position.x) * 0.025;
    camera.position.y += (py * 0.12 - camera.position.y) * 0.025;
    camera.lookAt(0, 0, 0);

    const fire = target.current.fire;
    [particles.current, lines.current, signals.current].forEach(object => {
      if (!object?.material?.uniforms) return;
      object.material.uniforms.uTime.value = time;
      object.material.uniforms.uFire.value = fire;
      if (object.material.uniforms.uLayer) object.material.uniforms.uLayer.value = target.current.layer;
    });

    gl.setClearColor('#00020a', 0);
  });

  return h('group', { ref: group },
    h('points', { ref: particles, geometry: particleGeometry },
      h('shaderMaterial', {
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms,
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
      }),
    ),
    h('lineSegments', { ref: lines, geometry: lineGeometry },
      h('shaderMaterial', {
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms,
        vertexShader: lineVertex,
        fragmentShader: lineFragment,
      }),
    ),
    h('points', { ref: signals, geometry: signalGeometry },
      h('shaderMaterial', {
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms,
        vertexShader: signalVertex,
        fragmentShader: signalFragment,
      }),
    ),
    h('mesh', { scale: [5.8, 3.6, 3.1] },
      h('sphereGeometry', { args: [1, 64, 32] }),
      h('meshBasicMaterial', {
        color: '#67e8f9',
        transparent: true,
        opacity: 0.022,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
}

function Atmosphere() {
  const mesh = useRef();
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    mesh.current.rotation.y = clock.elapsedTime * 0.035;
    mesh.current.rotation.x = Math.sin(clock.elapsedTime * 0.09) * 0.12;
  });
  return h('mesh', { ref: mesh, scale: [7.3, 4.7, 4.2] },
    h('sphereGeometry', { args: [1, 96, 48] }),
    h('meshBasicMaterial', {
      color: '#8b5cf6',
      transparent: true,
      opacity: 0.032,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function Scene({ telemetry }) {
  return h(React.Fragment, null,
    h('color', { attach: 'background', args: ['#00020a'] }),
    h('fogExp2', { attach: 'fog', args: ['#07111f', 0.055] }),
    h('ambientLight', { intensity: 0.25 }),
    h('pointLight', { position: [0, 0, 2], intensity: 3.2, color: '#67e8f9', distance: 12 }),
    h('pointLight', { position: [-2.8, 1.8, 2.2], intensity: 1.4, color: '#8b5cf6', distance: 9 }),
    h('pointLight', { position: [2.6, -1.2, 1.5], intensity: 0.8, color: '#fcd34d', distance: 7 }),
    h(Atmosphere),
    h(NeuralBrain, { telemetry }),
  );
}

function NeuralBrainApp() {
  const telemetry = useRef({ messages: 0, notifications: 0, busy: false, deep: false, layer: 0 });
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
    const onMetrics = event => {
      const metrics = event.detail || {};
      telemetry.current.messages = Number(metrics.messagesToday || 0);
      telemetry.current.notifications = Number(metrics.notificationsToday || 0);
      telemetry.current.busy = telemetry.current.notifications > 5 || telemetry.current.messages > 80;
    };
    const onPointer = event => {
      telemetry.current.pointerX = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      telemetry.current.pointerY = -(event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      telemetry.current.busy = true;
      window.clearTimeout(telemetry.current.idleTimer);
      telemetry.current.idleTimer = window.setTimeout(() => { telemetry.current.busy = false; }, 900);
    };
    const onWheel = event => {
      telemetry.current.deep = event.deltaY < 0 ? true : telemetry.current.deep && event.deltaY <= 0;
      window.clearTimeout(telemetry.current.deepTimer);
      telemetry.current.deepTimer = window.setTimeout(() => { telemetry.current.deep = false; }, 1400);
    };
    const onClick = () => {
      telemetry.current.layer = (telemetry.current.layer + 1) % 6;
      telemetry.current.deep = true;
      telemetry.current.busy = true;
    };

    window.addEventListener('mission-control:metrics', onMetrics);
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('mission-control:metrics', onMetrics);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('click', onClick);
    };
  }, []);

  return h('div', { className: mounted ? 'neural-brain mounted' : 'neural-brain' },
    h(Canvas, {
      dpr: [1, 2],
      camera: { fov: 42, position: [0, 0, 6.15], near: 0.1, far: 100 },
      gl: {
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      },
      onCreated: ({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      },
    }, h(Scene, { telemetry })),
  );
}

const root = document.getElementById('neuralBrainRoot');
if (root) createRoot(root).render(h(NeuralBrainApp));
