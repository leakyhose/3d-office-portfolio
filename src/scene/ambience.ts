import * as THREE from 'three'
import { sceneTime } from './crtMaterial'
import './output'

// One THREE.Points draw call for all the small life on the desk:
//  - warm dust motes drifting through the light over the desk,
//  - the PC's power LED (steady green) and HDD LED (flickers in bursts).
// Everything moves in the vertex shader from static attributes, so the CPU
// does nothing per frame beyond updating two uniforms.

const KIND_DUST = 0
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
varying vec3 vOutputClip;
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
  vOutputClip = gl_Position.xyw;
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
#include <scene_vignette_pars>
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float m = 1.0 - smoothstep(0.0, 1.0, r);
  gl_FragColor = vec4(vColor * (m * m * vAlpha * sceneVignette()), 1.0);
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
  // dust in the light over the desk and chair
  for (let i = 0; i < 55; i++) {
    const b = 0.35 + rand() * 0.35
    add(
      [-4 + rand() * 10, 4.9 + rand() * 3.5, 1.5 + rand() * 7],
      [rand(), 0.35 + rand() * 0.5, 0.04 + rand() * 0.035, KIND_DUST],
      [b, b * 0.82, b * 0.55],
    )
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
