import * as THREE from 'three'

export function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 4)
}

export function easeInOut(t: number) {
  return t < 0.5
    ? 8 * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 4) / 2
}

export function computeTarget(position: readonly [number, number, number], rotation: readonly [number, number, number], dist = 20) {
  const euler = new THREE.Euler(...rotation)
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler)
  return new THREE.Vector3(...position).add(dir.multiplyScalar(dist))
}
