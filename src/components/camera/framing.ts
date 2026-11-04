import * as THREE from 'three'
import type { LayoutKind, Region } from '../../layout'
import type { Subject } from '../../types'

/*
 * Camera framing across aspect ratios.
 *
 * Every view is authored as a pose (position + rotation) that looks right at
 * REF_ASPECT with the panels laid out beside the subject. A pose is resolved
 * for the actual viewport without changing its rotation, only by moving the
 * camera along its own axes:
 *
 *  - Wide layout, aspect >= REF_ASPECT: the authored pose as is (the vertical
 *    FOV is fixed, so wider screens just show more at the sides).
 *  - Wide layout, narrower than REF_ASPECT: dolly back around the subject so
 *    the horizontal extent at the subject's depth stays what it was at
 *    REF_ASPECT, keeping the subject at the same normalised screen position.
 *    The panels are sized in vw, so the subject keeps clear of them.
 *    A view with a vertical lens shift (wideShift) was framed against the
 *    frame edge nearest its optical axis (e.g. ending just above the desk
 *    clutter): the dolly keeps where that edge cuts the subject's depth, so
 *    it still clears what it was framed to clear. A narrowRaise view then
 *    spends the room this leaves above the subject raising it (more lens
 *    shift), as far as its clear objects allow, and slides the camera left
 *    (a horizontal lens shift holding the subject in place) so less of what
 *    stands behind the subject's right side shows.
 *  - Wide layout, wider than REF_ASPECT, keepWidth views: the same dolly,
 *    forwards, so the shot keeps its REF_ASPECT width up to the keepWidth
 *    aspect (wider still shows more at the sides).
 *  - Stacked layout (portrait): the panel sits under the scene, so the
 *    subject's bounding box is fitted into the top region of the screen,
 *    centred horizontally.
 */

export const REF_ASPECT = 16 / 10
export const WIDE_FOV = 50
export const STACKED_FOV = 58

export interface Pose {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
  /**
   * Vertical lens shift in NDC (setViewOffset): the image is moved up by this
   * much, so the stacked layout can put the subject in the top part of the
   * screen while the camera still aims straight at it (translating the camera
   * down instead would sink it below the desk top for the low shots).
   */
  shiftY: number
  /** Horizontal lens shift in NDC (the image moves left by this much), see narrowRaise. */
  shiftX: number
}

export interface PoseSpec {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
  /** World-space box the shot is about (see subjectBox). */
  subject: THREE.Box3 | null
  /** Stacked layout: optional viewing direction override (world vector). */
  stackedLook?: readonly [number, number, number]
  /** Wide layout: vertical lens shift (NDC), see ViewConfig.wideShift. */
  wideShift?: number
  /** Wide layout: keep the 16:10 width on wider screens, up to this aspect (ViewConfig.keepWidth). */
  keepWidth?: number
  /** Wide layout, narrower than 16:10: the screen height the dolly holds (ViewConfig.narrowHold). */
  narrowHold?: number
  /** Wide layout: vertical FOV (degrees) if not WIDE_FOV (ViewConfig.wideFov). */
  wideFov?: number
  /** Wide layout, narrower than 16:10: ViewConfig.narrowRaise, with its clear box resolved. */
  narrowRaise?: { clear: THREE.Box3 | null; slide: number }
}

export interface FrameContext {
  aspect: number
  kind: LayoutKind
  /** stacked layout: where on screen (NDC) the subject goes */
  region: Region
  /** viewport width, CSS px */
  width: number
}

const TARGET_DIST = 20
/** narrowRaise: the aspect at which the camera has slid `slide` */
const NARROW_ASPECT = 4 / 3
/** narrowRaise: NDC kept between the frame's bottom edge and the clear objects */
const CLEAR_PAD = 0.03
/**
 * narrowRaise: full raise from the second width (CSS px), none at the first
 * (where the layout turns stacked). Below ~760px the panel type is at its
 * minimum size (--fs-nav: clamp(22px, 2.9vw, ..)), so the nav links reach
 * further left, over the clutter beside the monitor a raise brings in.
 */
const SMALL_W = [600, 760] as const

const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _u = new THREE.Vector3()
const _v = new THREE.Vector3()
const _f = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()

const _m = new THREE.Matrix4()
const _o = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)

function basis(rotation: readonly [number, number, number], look?: readonly [number, number, number]) {
  if (look) _q.setFromRotationMatrix(_m.lookAt(_o.set(0, 0, 0), _d.set(look[0], look[1], look[2]), _up))
  else _q.setFromEuler(_e.set(rotation[0], rotation[1], rotation[2]))
  _u.set(1, 0, 0).applyQuaternion(_q)
  _v.set(0, 1, 0).applyQuaternion(_q)
  _f.set(0, 0, -1).applyQuaternion(_q)
}

function poseFrom(position: THREE.Vector3, fov: number, shiftY = 0, shiftX = 0): Pose {
  return { position, target: position.clone().addScaledVector(_f, TARGET_DIST), fov, shiftY, shiftX }
}

const _p = new THREE.Vector3()

/** Highest NDC y, before lens shift, of a box's corners seen from `from` (current basis; tan = tan(fov / 2)). */
function boxTopNdc(box: THREE.Box3, from: THREE.Vector3, tan: number): number {
  let best = -Infinity
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    _p.set(x, y, z).sub(from)
    const depth = _p.dot(_f)
    if (depth <= 0.01) continue
    const ny = _p.dot(_v) / (depth * tan)
    best = Math.max(best, ny)
  }
  return best
}

/** Union of the world boxes of the subject's objects, padded (null if none found). */
export function subjectBox(root: THREE.Object3D | null, subject: Subject): THREE.Box3 | null {
  if (!root) return null
  const box = new THREE.Box3()
  for (const name of subject.names) {
    const obj = root.getObjectByName(name)
    if (obj) box.expandByObject(obj)
  }
  if (box.isEmpty()) return null
  box.expandByScalar(subject.pad ?? 0)
  box.max.y += subject.padTop ?? 0
  return box
}

export function resolvePose(spec: PoseSpec, ctx: FrameContext): Pose {
  const { aspect, kind, region } = ctx
  const authored = new THREE.Vector3(...spec.position)

  if (kind === 'stacked' && spec.subject) {
    basis(spec.rotation, spec.stackedLook)
    // Fit around the optical axis, then lens-shift the image to the region.
    const shiftY = (region.top + region.bottom) / 2
    const centred = { ...region, top: region.top - shiftY, bottom: region.bottom - shiftY }
    return poseFrom(fitBox(spec.subject, aspect, STACKED_FOV, centred), STACKED_FOV, shiftY)
  }

  basis(spec.rotation)
  const fov = spec.wideFov ?? WIDE_FOV
  const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2)
  const shift = spec.wideShift ?? 0
  const keep = spec.keepWidth ?? 0
  if ((aspect >= REF_ASPECT && !keep) || !spec.subject) return poseFrom(authored, fov, shift)

  // Subject centre in camera space (right, up, depth).
  spec.subject.getCenter(_c)
  _d.subVectors(_c, authored)
  const ys = _d.dot(_v)
  const zs = _d.dot(_f)
  if (zs <= 0.01) return poseFrom(authored, fov, shift)
  // NDC x = x / (z tan A), NDC y = y / (z tan). Pushing the subject to depth
  // zs * k with k = REF / A keeps its NDC x (and its width on screen) as at
  // REF_ASPECT with the same x; scaling y by k keeps its NDC y too.
  const k = REF_ASPECT / (keep ? Math.min(aspect, keep) : aspect)
  const pos = authored.clone().addScaledVector(_f, -(zs * k - zs))
  // Scale the shot about a height that stays put on screen: the subject's
  // centre, or for a lens-shifted shot the frame edge nearest the axis (the
  // bottom edge when shifted down, the top when shifted up), where it cuts
  // the subject's depth (or the height narrowHold names).
  const hold = aspect < REF_ASPECT ? spec.narrowHold ?? Math.sign(shift) : Math.sign(shift)
  const ya = shift ? (hold - shift) * zs * tan : ys
  pos.addScaledVector(_v, -(ya * k - ya))
  const raise = spec.narrowRaise
  if (aspect >= REF_ASPECT || !raise) return poseFrom(pos, fov, shift)

  // Slide left, `slide` at 4:3 and in proportion below 16:10 (more on
  // squarer screens); the lens shift keeps the subject's centre put.
  const slide = raise.slide * (REF_ASPECT - aspect) / (REF_ASPECT - NARROW_ASPECT)
  pos.addScaledVector(_u, -slide)
  const shiftX = slide / (zs * k * tan * aspect)
  // Raise: back to the subject's top at 16:10 at most, and not so far that
  // the frame's bottom edge (NDC -1 - shift before the shift) reaches the
  // clear objects. Narrow windows raise less (see SMALL_W).
  let lift = boxTopNdc(spec.subject, authored, tan) - boxTopNdc(spec.subject, pos, tan)
  if (raise.clear) lift = Math.min(lift, -1 - boxTopNdc(raise.clear, pos, tan) - CLEAR_PAD - shift)
  lift *= THREE.MathUtils.clamp((ctx.width - SMALL_W[0]) / (SMALL_W[1] - SMALL_W[0]), 0, 1)
  return poseFrom(pos, fov, shift + Math.max(0, lift), shiftX)
}

const _corners = Array.from({ length: 8 }, () => new THREE.Vector3())

/**
 * Camera position (rotation given by the current basis) at which `box`
 * projects centred in, and as large as possible within, `region`.
 */
function fitBox(box: THREE.Box3, aspect: number, fovDeg: number, region: Region): THREE.Vector3 {
  const t = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)
  box.getCenter(_c)
  // Corner offsets from the centre, in camera axes.
  const pts: [number, number, number][] = []
  let i = 0
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    _corners[i].set(x, y, z).sub(_c)
    pts.push([_corners[i].dot(_u), _corners[i].dot(_v), _corners[i].dot(_f)])
    i++
  }
  const cx = (region.left + region.right) / 2
  const cy = (region.bottom + region.top) / 2

  // For a centre depth Z and centre NDC (nx, ny), project every corner;
  // returns the projected rect.
  const project = (Z: number, X: number, Y: number) => {
    let l = Infinity, r = -Infinity, b = Infinity, tp = -Infinity
    for (const [px, py, pz] of pts) {
      const z = Math.max(Z + pz, 1e-3)
      const nx = (X + px) / (z * t * aspect)
      const ny = (Y + py) / (z * t)
      l = Math.min(l, nx); r = Math.max(r, nx); b = Math.min(b, ny); tp = Math.max(tp, ny)
    }
    return { l, r, b, tp }
  }
  // Lateral centre offsets (X, Y) that centre the projected rect at (cx, cy) for depth Z.
  const centre = (Z: number) => {
    let X = cx * Z * t * aspect
    let Y = cy * Z * t
    for (let k = 0; k < 4; k++) {
      const p = project(Z, X, Y)
      X += (cx - (p.l + p.r) / 2) * Z * t * aspect
      Y += (cy - (p.b + p.tp) / 2) * Z * t
    }
    return { X, Y }
  }
  const fits = (Z: number) => {
    const { X, Y } = centre(Z)
    const p = project(Z, X, Y)
    return p.l >= region.left && p.r <= region.right && p.b >= region.bottom && p.tp <= region.top
  }
  const size = box.getSize(new THREE.Vector3()).length()
  let lo = size * 0.2, hi = size * 40
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) hi = mid
    else lo = mid
  }
  const { X, Y } = centre(hi)
  // Camera = centre - (X u + Y v + Z f)
  return _c.clone().addScaledVector(_u, -X).addScaledVector(_v, -Y).addScaledVector(_f, -hi)
}
