import * as THREE from 'three'

export function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 4)
}

export function easeInOut(t: number) {
  return t < 0.5
    ? 8 * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 4) / 2
}

const _m = new THREE.Matrix4()
const _up = new THREE.Vector3(0, 1, 0)

/** The orientation `camera.lookAt(target)` gives a camera at `position` (level horizon). */
export function lookQuaternion(position: THREE.Vector3, target: THREE.Vector3, out: THREE.Quaternion) {
  return out.setFromRotationMatrix(_m.lookAt(position, target, _up))
}

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  else if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

const _ea = new THREE.Euler(0, 0, 0, 'YXZ')
const _eb = new THREE.Euler(0, 0, 0, 'YXZ')

/**
 * Orientation part way (t) from `a` to `b`, interpolating heading, pitch and
 * roll separately so a level camera stays level throughout.
 *
 * Flights used to lerp the look-at target and call lookAt, which for a
 * near-vertical view (the experience shot looks almost straight down) leaves
 * the heading stuck until the last few percent of the move and then spins it
 * round: the camera landed and only then rotated. This keeps the turn on the
 * same easing curve as the position.
 */
export function interpolateOrientation(a: THREE.Quaternion, b: THREE.Quaternion, t: number, out: THREE.Quaternion) {
  _ea.setFromQuaternion(a, 'YXZ')
  _eb.setFromQuaternion(b, 'YXZ')
  _ea.set(
    lerpAngle(_ea.x, _eb.x, t),
    lerpAngle(_ea.y, _eb.y, t),
    lerpAngle(_ea.z, _eb.z, t),
    'YXZ',
  )
  return out.setFromEuler(_ea)
}

export function computeTarget(position: readonly [number, number, number], rotation: readonly [number, number, number], dist = 20) {
  const euler = new THREE.Euler(...rotation)
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler)
  return new THREE.Vector3(...position).add(dir.multiplyScalar(dist))
}
