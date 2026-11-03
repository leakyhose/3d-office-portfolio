import * as THREE from 'three'
import { sceneTime } from './crtMaterial'

// One THREE.Points draw call for all the small life in the room:
//  - warm dust motes drifting through the lamp light over the desk,
//  - cool motes in the moonlight falling through the window,
//  - the PC's power LED (steady green) and HDD LED (flickers in bursts).
// Everything moves in the vertex shader from static attributes, so the CPU
// does nothing per frame beyond updating two uniforms.

const KIND_DUST = 0
const KIND_MOON = 1
const KIND_LED = 2
const KIND_HDD = 3

// Next to the power buttons on the PC case's front panel (three coords).
export const POWER_LED: [number, number, number] = [-0.485, 4.955, 2.52]
export const HDD_LED: [number, number, number] = [-0.485, 4.885, 2.52]

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec4 aSeed; // phase, speed, world size, kind
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  float kind = aSeed.w;
  float a = 1.0;
  if (kind < 1.5) {
    float t = uTime * aSeed.y + aSeed.x * 6.2831;
    p += vec3(sin(t * 0.7) * 0.35 + sin(t * 1.9) * 0.07,
              sin(t * 0.5) * 0.22 + cos(t * 1.3) * 0.05,
              cos(t * 0.6) * 0.35 + sin(t * 1.7) * 0.07);
    float life = fract(aSeed.x * 7.13 + uTime * 0.012 * aSeed.y);
    p.y += life * 1.4;
    a = smoothstep(0.0, 0.2, life) * smoothstep(1.0, 0.8, life);
    a *= 0.45 + 0.55 * abs(sin(t * 1.6 + aSeed.x * 31.0)); // glints as it tumbles
  } else if (kind > 2.5) {
    float f = sin(uTime * 19.0 + sin(uTime * 2.3) * 5.0) * sin(uTime * 0.9 + aSeed.x);
    a = 0.12 + 0.88 * step(0.35, f);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 0.01);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSeed.z * uScale / dist, 9.0);
  // motes right in front of the lens would be big blurry blobs
  if (kind < 1.5) a *= smoothstep(1.0, 3.0, dist);
  vColor = aColor;
  vAlpha = a;
}
`

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float m = 1.0 - smoothstep(0.0, 1.0, r);
  gl_FragColor = vec4(vColor * (m * m * vAlpha), 1.0);
}
`

export function createAmbienceMaterial() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: sceneTime, uScale: { value: 500 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  mat.name = 'ambience'
  return mat
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createAmbienceGeometry() {
  const rand = mulberry32(42)
  const pos: number[] = []
  const seed: number[] = []
  const col: number[] = []
  const add = (p: [number, number, number], s: [number, number, number, number], c: [number, number, number]) => {
    pos.push(...p); seed.push(...s); col.push(...c)
  }
  // lamp-lit dust over the desk and chair
  // (kept low and in front of the wall, where the lamp actually lights them)
  for (let i = 0; i < 55; i++) {
    const b = 0.35 + rand() * 0.35
    add(
      [-4 + rand() * 10, 4.9 + rand() * 3.5, 1.5 + rand() * 7],
      [rand(), 0.35 + rand() * 0.5, 0.04 + rand() * 0.035, KIND_DUST],
      [b, b * 0.82, b * 0.55],
    )
  }
  // moonbeam motes: along the light falling through the window onto the desk
  const dir = new THREE.Vector3(2, -4.7, 3).normalize()
  // (only its lower part, where it crosses the desk next to the cat)
  for (let i = 0; i < 20; i++) {
    const start = new THREE.Vector3(-8.2 + rand() * 4.4, 6.8 + rand() * 5.2, -0.9)
    const p = start.addScaledVector(dir, 2.5 + rand() * 2.5)
    if (p.y < 5) p.y = 5 + rand()
    const b = 0.35 + rand() * 0.3
    add([p.x, p.y, p.z], [rand(), 0.25 + rand() * 0.35, 0.035 + rand() * 0.025, KIND_MOON], [b * 0.7, b * 0.82, b])
  }
  add(POWER_LED, [0, 0, 0.08, KIND_LED], [0.45, 1.0, 0.5])
  add(HDD_LED, [rand(), 0, 0.075, KIND_HDD], [1.0, 0.65, 0.2])

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4))
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
  return geo
}

/** Point size scale: world size -> drawing-buffer pixels. */
export function setAmbienceScale(material: THREE.ShaderMaterial, pixelsPerUnit: number) {
  material.uniforms.uScale.value = pixelsPerUnit
}
