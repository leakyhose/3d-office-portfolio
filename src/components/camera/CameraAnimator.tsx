import { useThree, useFrame } from '../../three/fiber'
import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { VIEWS, ANIM_DURATION, START_POSITION, START_ROTATION, START_SUBJECT } from '../../config/views'
import { setNavigateTo, clearNavigateTo, setFreeCamHandler, clearFreeCamHandler, fireNavigationComplete, fireIntroPreComplete, setCameraAnimatingQuery, clearCameraAnimatingQuery } from './bridge'
import { useScreenMesh } from '../screenMesh'
import { easeInOut, easeOut, lookQuaternion, interpolateOrientation } from './motion'
import { resolvePose, subjectBox, REF_ASPECT, type Pose } from './framing'
import { layoutKindFor, stackedRegion, stackedSceneFraction, FULL_REGION, reducedMotionQuery, type LayoutKind } from '../../layout'
import type { ViewName, Subject } from '../../types'
import type { CameraRig } from './rig'

/** 'start' = the intro pose in front of the booting monitor. */
type Shot = ViewName | 'start'

// The projects shot slides the image sideways on screens wider than 16:9
// (lens shift via setViewOffset) so the monitor stays clear of the panel.
// Below 16:10 the framing dolly takes over, so the shift is held there.
// With keepWidth, framing.ts holds the 16:10 framing on wider screens instead.
// A view's wideAnchor picks the side the extra width goes to (lens shift too).
const ANCHOR_ASPECT = 16 / 9
function computeAnchorGoal(shot: Shot, aspect: number, kind: LayoutKind) {
  if (shot === 'start' || kind !== 'wide') return 0
  // wideAnchor: lens shift by a share of the width beyond 16:10 (see ViewConfig)
  const anchor = VIEWS[shot].wideAnchor
  if (anchor) return anchor * (1 - REF_ASPECT / Math.max(aspect, REF_ASPECT))
  if (shot !== 'projects' || VIEWS.projects.keepWidth) return 0
  return 1 - ANCHOR_ASPECT / Math.max(aspect, REF_ASPECT)
}

function applyFov(camera: THREE.Camera, fov: number) {
  const pcam = camera as THREE.PerspectiveCamera
  if (Math.abs(pcam.fov - fov) > 1e-4) {
    pcam.fov = fov
    pcam.updateProjectionMatrix()
  }
}

const _box = new THREE.Box3()
const _center = new THREE.Vector3()
function getPivotCenter(root: THREE.Object3D, name: string) {
  const obj = root.getObjectByName(name)
  if (!obj) return null
  _box.setFromObject(obj)
  _box.getCenter(_center)
  return _center.clone()
}

const _searchQuat = new THREE.Quaternion()
const _searchOffset = new THREE.Vector3()

// Safe oy range that keeps polar angle within bounds
function computeOyLimits(offset: THREE.Vector3, right: THREE.Vector3, minPolar: number, maxPolar: number) {
  const len = offset.length()
  if (len < 1e-6) return { min: -Math.PI, max: Math.PI }

  const STEP = 0.005
  const BOUND = Math.PI

  function polarAt(oy: number) {
    _searchQuat.setFromAxisAngle(right, -oy)
    _searchOffset.copy(offset).applyQuaternion(_searchQuat)
    return Math.acos(THREE.MathUtils.clamp(_searchOffset.y / len, -1, 1))
  }

  let oyMax = BOUND
  for (let oy = 0; oy <= BOUND; oy += STEP) {
    const p = polarAt(oy)
    if (p <= minPolar || p >= maxPolar) {
      oyMax = Math.max(0, oy - STEP)
      break
    }
  }

  let oyMin = -BOUND
  for (let oy = 0; oy >= -BOUND; oy -= STEP) {
    const p = polarAt(oy)
    if (p <= minPolar || p >= maxPolar) {
      oyMin = Math.min(0, oy + STEP)
      break
    }
  }

  return { min: oyMin, max: oyMax }
}

const INTRO_PRE_COMPLETE_T = 0.65
const ROTATE_SPEED = 0.003
const BASE_RANGE = 0.45
const MIN_POLAR = 0.15
const MAX_POLAR = Math.PI - 0.15

interface CameraAnimatorProps {
  controlsRef: React.RefObject<CameraRig | null>
  freeCam: boolean
}

function CameraAnimator({ controlsRef, freeCam }: CameraAnimatorProps) {
  const { camera, gl } = useThree()
  const size = useThree((s) => s.size)
  const getState = useThree((s) => s.get)
  // Canvas size from R3F's store (kept current by its ResizeObserver); reading
  // clientWidth here would force a synchronous layout in the nav click handler.
  const viewSize = useCallback(() => {
    const { width, height } = getState().size
    return width && height ? { w: width, h: height } : { w: window.innerWidth, h: window.innerHeight }
  }, [getState])
  const { fullScene } = useScreenMesh()
  const animating = useRef(false)
  const introAnim = useRef(false)
  const startPos = useRef(new THREE.Vector3())
  const goalPos = useRef(new THREE.Vector3())
  const goalTarget = useRef(new THREE.Vector3())
  const startFov = useRef(50)
  const goalFov = useRef(50)
  // Orientation is interpolated directly (not via the look-at target; see
  // interpolateOrientation), along with the target's distance.
  const startQuat = useRef(new THREE.Quaternion())
  const goalQuat = useRef(new THREE.Quaternion())
  const startDist = useRef(20)
  const goalDist = useRef(20)
  const elapsed = useRef(0)
  const duration = useRef(ANIM_DURATION)

  const currentShot = useRef<Shot>('start')
  const layoutKind = useRef<LayoutKind | null>(null)
  const pivotPoint = useRef(new THREE.Vector3())
  const restPos = useRef(new THREE.Vector3())
  const restTarget = useRef(new THREE.Vector3())
  const restRight = useRef(new THREE.Vector3())
  const restQuat = useRef(new THREE.Quaternion())
  const dragOffset = useRef({ x: 0, y: 0 })
  const anchorOx = useRef(0)
  const startAnchorOx = useRef(0)
  const goalAnchorOx = useRef(0)
  // vertical lens shift (stacked layout), NDC
  const shiftY = useRef(0)
  const startShiftY = useRef(0)
  const goalShiftY = useRef(0)
  // horizontal lens shift from the pose (narrowRaise), NDC, on top of anchorOx
  const shiftX = useRef(0)
  const startShiftX = useRef(0)
  const goalShiftX = useRef(0)
  const dragging = useRef(false)
  const panning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const ready = useRef(false)

  const freeCamRef = useRef(false)
  useEffect(() => { freeCamRef.current = freeCam }, [freeCam])

  const introPreCompleteFired = useRef(false)
  const introFirstFrame = useRef(false)
  const rangeRef = useRef(BASE_RANGE)
  const oyLimits = useRef({ min: -Infinity, max: Infinity })

  // World boxes of the shots' subjects (the scene is static).
  const boxCache = useRef(new Map<Subject, THREE.Box3 | null>())
  const boxFor = useCallback((subject: Subject) => {
    if (!fullScene) return null
    if (!boxCache.current.has(subject)) boxCache.current.set(subject, subjectBox(fullScene, subject))
    return boxCache.current.get(subject)!
  }, [fullScene])
  useEffect(() => { boxCache.current.clear() }, [fullScene])

  /** Where the camera goes for a shot at the current canvas size. */
  const poseFor = useCallback((shot: Shot): Pose => {
    const { w, h } = viewSize()
    const kind = layoutKindFor(w, h)
    const aspect = w / h
    if (shot === 'start') {
      return resolvePose(
        { position: START_POSITION, rotation: START_ROTATION, subject: boxFor(START_SUBJECT) },
        { aspect, kind, region: FULL_REGION, width: w },
      )
    }
    const view = VIEWS[shot]
    return resolvePose(
      {
        position: view.position, rotation: view.rotation, stackedLook: view.stackedLook, wideShift: view.wideShift, keepWidth: view.keepWidth, subject: boxFor(view.subject),
        narrowRaise: view.narrowRaise && { clear: boxFor(view.narrowRaise.clear), slide: view.narrowRaise.slide },
      },
      { aspect, kind, region: stackedRegion(stackedSceneFraction(shot, w, h), h), width: w },
    )
  }, [viewSize, boxFor])

  const setFov = useCallback((fov: number) => applyFov(camera, fov), [camera])

  /** Settle at the current shot: remember the rest pose for drag-orbit. */
  const captureRest = useCallback(() => {
    const rig = controlsRef.current
    if (!rig) return
    restPos.current.copy(camera.position)
    restTarget.current.copy(rig.target)
    restRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize()
    restQuat.current.copy(camera.quaternion)

    const shot = currentShot.current
    const view = shot === 'start' ? null : VIEWS[shot]
    const pivot = view && fullScene && getPivotCenter(fullScene, view.pivotObject)
    pivotPoint.current.copy(pivot || rig.target)

    rangeRef.current = BASE_RANGE
    dragOffset.current = { x: 0, y: 0 }
    const restOff = new THREE.Vector3().subVectors(restPos.current, pivotPoint.current)
    oyLimits.current = computeOyLimits(restOff, restRight.current, MIN_POLAR, MAX_POLAR)
  }, [camera, controlsRef, fullScene])

  /** Flight goal from a pose (also used to retarget mid-flight). */
  const setGoal = useCallback((pose: Pose) => {
    goalPos.current.copy(pose.position)
    goalTarget.current.copy(pose.target)
    lookQuaternion(pose.position, pose.target, goalQuat.current)
    goalDist.current = pose.position.distanceTo(pose.target)
    goalFov.current = pose.fov
    goalShiftY.current = pose.shiftY
    goalShiftX.current = pose.shiftX
  }, [])

  const navigateTo = useCallback((viewName: ViewName, dur?: number, isIntro?: boolean) => {
    const view = VIEWS[viewName]
    if (!view || !controlsRef.current) return
    const pose = poseFor(viewName)
    startPos.current.copy(camera.position)
    startQuat.current.copy(camera.quaternion)
    startDist.current = Math.max(camera.position.distanceTo(controlsRef.current.target), 1e-3)
    startFov.current = (camera as THREE.PerspectiveCamera).fov
    startShiftY.current = shiftY.current
    startShiftX.current = shiftX.current
    setGoal(pose)

    currentShot.current = viewName
    elapsed.current = 0
    // Reduced motion: cut instead of flying.
    duration.current = reducedMotionQuery?.matches ? 1e-3 : (dur || ANIM_DURATION)

    startAnchorOx.current = anchorOx.current
    const { w, h } = viewSize()
    goalAnchorOx.current = computeAnchorGoal(viewName, w / h, layoutKindFor(w, h))

    animating.current = true
    introAnim.current = Boolean(isIntro)
    introPreCompleteFired.current = false
    introFirstFrame.current = Boolean(isIntro)
    ready.current = false
    dragOffset.current = { x: 0, y: 0 }
    if (isIntro) performance.mark('intro:anim-start')
  }, [controlsRef, camera, viewSize, poseFor, setGoal])

  useEffect(() => {
    setNavigateTo(navigateTo)
    return () => clearNavigateTo(navigateTo)
  }, [navigateTo])

  // Re-frame whenever the canvas size (or the scene) changes: before the
  // intro, hold the start pose; mid-flight, retarget the flight; at rest,
  // snap to the new framing (or fly there if the layout switched between
  // wide and stacked). Free cam keeps whatever the visitor set up.
  useEffect(() => {
    const rig = controlsRef.current
    if (!rig || freeCamRef.current) return
    const kind = layoutKindFor(size.width, size.height)
    const kindChanged = layoutKind.current !== null && layoutKind.current !== kind
    layoutKind.current = kind
    const shot = currentShot.current
    const pose = poseFor(shot)
    if (animating.current) {
      setGoal(pose)
      return
    }
    if (shot !== 'start' && kindChanged && ready.current) {
      navigateTo(shot, 0.8)
      return
    }
    camera.position.copy(pose.position)
    rig.target.copy(pose.target)
    setFov(pose.fov)
    shiftY.current = goalShiftY.current = pose.shiftY
    shiftX.current = goalShiftX.current = pose.shiftX
    rig.update()
    if (shot !== 'start' && ready.current) captureRest()
  }, [size.width, size.height, poseFor, navigateTo, captureRest, camera, controlsRef, setFov, setGoal])

  const handleFreeCam = useCallback((entering: boolean) => {
    if (entering) {
      animating.current = false
      restPos.current.copy(camera.position)
      if (controlsRef.current) {
        restTarget.current.copy(controlsRef.current.target)
      }
      restQuat.current.copy(camera.quaternion)
      restRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize()

      const pivot = fullScene && getPivotCenter(fullScene, 'ComputerScreen')
      if (pivot) pivotPoint.current.copy(pivot)

      rangeRef.current = 100
      dragOffset.current = { x: 0, y: 0 }

      const restOff = new THREE.Vector3().subVectors(restPos.current, pivotPoint.current)
      oyLimits.current = computeOyLimits(restOff, restRight.current, MIN_POLAR, MAX_POLAR)

      ready.current = true
    }
  }, [fullScene, controlsRef, camera])

  useEffect(() => {
    setFreeCamHandler(handleFreeCam)
    return () => clearFreeCamHandler(handleFreeCam)
  }, [handleFreeCam])

  useEffect(() => {
    const query = () => animating.current
    setCameraAnimatingQuery(query)
    return () => clearCameraAnimatingQuery(query)
  }, [])

  useFrame((_, delta) => {
    if (!animating.current || !controlsRef.current) return
    if (introFirstFrame.current) {
      introFirstFrame.current = false
      performance.mark('intro:anim-first-frame')
    }
    elapsed.current += delta
    const t = Math.min(elapsed.current / duration.current, 1)
    const eased = introAnim.current ? easeInOut(t) : easeOut(t)
    // Position, orientation, FOV and lens shift all follow the same curve, so
    // the camera stops moving and turning together.
    camera.position.lerpVectors(startPos.current, goalPos.current, eased)
    interpolateOrientation(startQuat.current, goalQuat.current, eased, camera.quaternion)
    const dist = startDist.current + (goalDist.current - startDist.current) * eased
    controlsRef.current.target.set(0, 0, -dist).applyQuaternion(camera.quaternion).add(camera.position)
    setFov(startFov.current + (goalFov.current - startFov.current) * eased)
    const anchorEased = goalAnchorOx.current === 0 ? easeOut(t) : easeInOut(t)
    anchorOx.current = startAnchorOx.current + (goalAnchorOx.current - startAnchorOx.current) * anchorEased
    shiftY.current = startShiftY.current + (goalShiftY.current - startShiftY.current) * eased
    shiftX.current = startShiftX.current + (goalShiftX.current - startShiftX.current) * eased
    if (introAnim.current && !introPreCompleteFired.current && t >= INTRO_PRE_COMPLETE_T) {
      introPreCompleteFired.current = true
      performance.mark('intro:pre-complete')
      if (currentShot.current !== 'start') fireIntroPreComplete(currentShot.current)
    }
    if (t >= 1) {
      camera.position.copy(goalPos.current)
      controlsRef.current.target.copy(goalTarget.current)
      controlsRef.current.update()
      const wasIntro = introAnim.current
      animating.current = false
      introAnim.current = false
      anchorOx.current = goalAnchorOx.current
      shiftY.current = goalShiftY.current
      shiftX.current = goalShiftX.current
      captureRest()
      ready.current = true

      if (wasIntro) performance.mark('intro:anim-done')
      const shot = currentShot.current
      if (shot !== 'start') fireNavigationComplete(shot)
    }
  })

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || animating.current || !ready.current) return
      if (e.shiftKey && freeCamRef.current) {
        panning.current = true
      } else {
        dragging.current = true
      }
      lastPointer.current = { x: e.clientX, y: e.clientY }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (panning.current) {
        const dx = e.clientX - lastPointer.current.x
        const dy = e.clientY - lastPointer.current.y
        lastPointer.current = { x: e.clientX, y: e.clientY }
        const panSpeed = 0.02
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
        const panOffset = right.multiplyScalar(-dx * panSpeed).add(up.multiplyScalar(dy * panSpeed))
        restPos.current.add(panOffset)
        restTarget.current.add(panOffset)
        pivotPoint.current.add(panOffset)
        return
      }
      if (!dragging.current) return
      const dx = e.clientX - lastPointer.current.x
      const dy = e.clientY - lastPointer.current.y
      lastPointer.current = { x: e.clientX, y: e.clientY }

      const range = rangeRef.current
      const ox = dragOffset.current.x
      const oy = dragOffset.current.y

      const ratioX = Math.abs(ox) / range
      const ratioY = Math.abs(oy) / range
      const resistX = 1 - Math.pow(Math.min(ratioX, 1), 3)
      const resistY = 1 - Math.pow(Math.min(ratioY, 1), 3)

      dragOffset.current.x += dx * ROTATE_SPEED * resistX
      dragOffset.current.y += dy * ROTATE_SPEED * resistY

      dragOffset.current.y = THREE.MathUtils.clamp(
        dragOffset.current.y, oyLimits.current.min, oyLimits.current.max
      )
    }

    const onPointerUp = () => {
      dragging.current = false
      panning.current = false
    }

    const onWheel = (e: WheelEvent) => {
      if (!freeCamRef.current || animating.current || !ready.current) return
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
      const pivot = pivotPoint.current
      const offset = new THREE.Vector3().subVectors(restPos.current, pivot)
      const dist = offset.length()
      if (dist < 0.001) return
      const newDist = Math.max(0.5, Math.min(100, dist * factor))
      const move = offset.normalize().multiplyScalar(newDist - dist)
      restPos.current.add(move)
      restTarget.current.add(move)
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [gl, camera])

  const _axis = useRef(new THREE.Vector3()).current
  const _quat = useRef(new THREE.Quaternion()).current
  const _quatV = useRef(new THREE.Quaternion()).current
  const _quatCombined = useRef(new THREE.Quaternion()).current
  const _offset = useRef(new THREE.Vector3()).current
  useFrame(() => {
    if (animating.current || !ready.current) return

    // Fast path: skip all math when idle with no drag offset
    if (!dragging.current && !freeCamRef.current &&
        Math.abs(dragOffset.current.x) < 0.0001 && Math.abs(dragOffset.current.y) < 0.0001) {
      dragOffset.current.x = 0
      dragOffset.current.y = 0
      return
    }

    const ox = dragOffset.current.x
    dragOffset.current.y = THREE.MathUtils.clamp(
      dragOffset.current.y, oyLimits.current.min, oyLimits.current.max
    )
    const oy = dragOffset.current.y

    if (!dragging.current && !freeCamRef.current) {
      const pullStrength = 0.012
      dragOffset.current.x *= (1 - pullStrength)
      dragOffset.current.y *= (1 - pullStrength)
      if (Math.abs(dragOffset.current.x) < 0.0001) dragOffset.current.x = 0
      if (Math.abs(dragOffset.current.y) < 0.0001) dragOffset.current.y = 0
    }

    if (Math.abs(ox) < 0.0001 && Math.abs(oy) < 0.0001) {
      camera.position.copy(restPos.current)
      camera.quaternion.copy(restQuat.current)
      if (controlsRef.current) {
        controlsRef.current.target.copy(restTarget.current)
      }
      return
    }

    const pivot = pivotPoint.current
    const right = restRight.current

    _quat.setFromAxisAngle(_axis.set(0, 1, 0), -ox)
    _quatV.setFromAxisAngle(right, -oy)
    _quatCombined.copy(_quat).multiply(_quatV)

    _offset.copy(restPos.current).sub(pivot)
    _offset.applyQuaternion(_quatCombined)
    camera.position.copy(pivot).add(_offset)

    camera.quaternion.copy(restQuat.current).premultiply(_quatCombined)

    _offset.copy(restTarget.current).sub(pivot)
    _offset.applyQuaternion(_quatCombined)
    if (controlsRef.current) {
      controlsRef.current.target.copy(pivot).add(_offset)
    }
  }, 1)

  useFrame((state, delta) => {
    const { width, height } = state.size
    if (!animating.current && ready.current) {
      const goal = computeAnchorGoal(currentShot.current, width / height, layoutKindFor(width, height))
      if (Math.abs(anchorOx.current - goal) > 1e-5) {
        anchorOx.current = THREE.MathUtils.damp(anchorOx.current, goal, 3, delta)
        if (Math.abs(anchorOx.current - goal) < 1e-5) anchorOx.current = goal
      }
    }

    const pcam = camera as THREE.PerspectiveCamera
    const anchor = anchorOx.current + shiftX.current
    const shift = shiftY.current

    if (Math.abs(anchor) < 1e-6 && Math.abs(shift) < 1e-6) {
      if (pcam.view?.enabled) pcam.clearViewOffset()
      return
    }

    // Lens shift: render a window of the full image moved by the offsets.
    const offsetX = (anchor / 2) * width
    const offsetY = (shift / 2) * height
    const v = pcam.view
    if (!v?.enabled || v.offsetX !== offsetX || v.offsetY !== offsetY || v.fullWidth !== width || v.fullHeight !== height) {
      pcam.setViewOffset(width, height, offsetX, offsetY, width, height)
    }
  }, 2)

  return null
}

export default CameraAnimator
