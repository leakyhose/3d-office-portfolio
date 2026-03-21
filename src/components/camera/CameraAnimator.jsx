import { useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { VIEWS, ANIM_DURATION } from '../../config/views'
import { setNavigateTo, clearNavigateTo, setFreeCamHandler, clearFreeCamHandler, setComputeCloseup, clearComputeCloseup, fireNavigationComplete } from './bridge'
import { useScreenMesh } from '../ScreenMeshContext'

const REF_ASPECT = 16 / 9
const ANCHOR_VIEWS = new Set(['projects'])

function computeAnchorGoal(viewName, aspect) {
  if (!ANCHOR_VIEWS.has(viewName)) return 0
  return 1 - REF_ASPECT / aspect
}

export function easeOut(t) {
  return 1 - Math.pow(1 - t, 4)
}

export function easeInOut(t) {
  return t < 0.5
    ? 8 * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 4) / 2
}

export function computeTarget(position, rotation, dist = 20) {
  const euler = new THREE.Euler(...rotation)
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler)
  return new THREE.Vector3(...position).add(dir.multiplyScalar(dist))
}

const _box = new THREE.Box3()
const _center = new THREE.Vector3()
function getPivotCenter(root, name) {
  let obj = null
  root.traverse((child) => {
    if (!obj && child.name === name) obj = child
  })
  if (!obj) return null
  _box.setFromObject(obj)
  _box.getCenter(_center)
  return _center.clone()
}

const _searchQuat = new THREE.Quaternion()
const _searchOffset = new THREE.Vector3()

// Safe oy range that keeps polar angle within bounds
function computeOyLimits(offset, right, minPolar, maxPolar) {
  const len = offset.length()
  if (len < 1e-6) return { min: -Math.PI, max: Math.PI }

  const STEP = 0.005
  const BOUND = Math.PI

  function polarAt(oy) {
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

function CameraAnimator({ controlsRef, freeCam }) {
  const { camera, scene, gl } = useThree()
  const { screenMesh: ctxScreenMesh, fullScene } = useScreenMesh()
  const animating = useRef(false)
  const introAnim = useRef(false)
  const startPos = useRef(new THREE.Vector3())
  const startTarget = useRef(new THREE.Vector3())
  const goalPos = useRef(new THREE.Vector3())
  const goalTarget = useRef(new THREE.Vector3())
  const elapsed = useRef(0)
  const duration = useRef(ANIM_DURATION)

  const currentViewName = useRef('home')
  const pivotPoint = useRef(new THREE.Vector3())
  const restPos = useRef(new THREE.Vector3())
  const restTarget = useRef(new THREE.Vector3())
  const restRight = useRef(new THREE.Vector3())
  const restQuat = useRef(new THREE.Quaternion())
  const dragOffset = useRef({ x: 0, y: 0 })
  const anchorOx = useRef(0)
  const startAnchorOx = useRef(0)
  const goalAnchorOx = useRef(0)
  const dragging = useRef(false)
  const panning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const ready = useRef(false)

  const freeCamRef = useRef(false)
  useEffect(() => { freeCamRef.current = freeCam }, [freeCam])

  const rangeRef = useRef(0.45)
  const ROTATE_SPEED = 0.003
  const BASE_RANGE = 0.45

  const MIN_POLAR = 0.15
  const MAX_POLAR = Math.PI - 0.15
  const oyLimits = useRef({ min: -Infinity, max: Infinity })

  const navigateTo = useCallback((viewName, dur, isIntro) => {
    const view = VIEWS[viewName]
    if (!view || !controlsRef.current) return
    startPos.current.copy(camera.position)
    startTarget.current.copy(controlsRef.current.target)
    goalPos.current.set(...view.position)
    goalTarget.current.copy(computeTarget(view.position, view.rotation))

    currentViewName.current = viewName
    elapsed.current = 0
    duration.current = dur || ANIM_DURATION

    startAnchorOx.current = anchorOx.current
    const aspect = gl.domElement.clientWidth / gl.domElement.clientHeight
    goalAnchorOx.current = computeAnchorGoal(viewName, aspect)

    animating.current = true
    introAnim.current = Boolean(isIntro)
    ready.current = false
    dragOffset.current = { x: 0, y: 0 }
  }, [controlsRef, camera, scene, gl])

  useEffect(() => {
    setNavigateTo(navigateTo)
    return () => clearNavigateTo(navigateTo)
  }, [navigateTo])

  const computeScreenCloseup = useCallback(() => {
    if (!controlsRef.current || !ctxScreenMesh) return

    ctxScreenMesh.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(ctxScreenMesh)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    const normal = new THREE.Vector3(0, 0, 1).transformDirection(ctxScreenMesh.matrixWorld).normalize()

    const homePos = new THREE.Vector3(...VIEWS.home.position)
    if (homePos.clone().sub(center).dot(normal) < 0) normal.negate()

    const fovRad = THREE.MathUtils.degToRad(camera.fov)
    const dist = (size.y / 2) / Math.tan(fovRad / 2) * 0.6

    const closeupPos = center.clone().add(normal.clone().multiplyScalar(dist))
    camera.position.copy(closeupPos)
    camera.lookAt(center)
    controlsRef.current.target.copy(center)
    controlsRef.current.update()
  }, [ctxScreenMesh, camera, controlsRef])

  useEffect(() => {
    setComputeCloseup(computeScreenCloseup)
    return () => clearComputeCloseup(computeScreenCloseup)
  }, [computeScreenCloseup])

  const handleFreeCam = useCallback((entering) => {
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

      const _restOff = new THREE.Vector3().subVectors(restPos.current, pivotPoint.current)
      oyLimits.current = computeOyLimits(_restOff, restRight.current, MIN_POLAR, MAX_POLAR)

      ready.current = true
    }
  }, [fullScene, controlsRef, camera])

  useEffect(() => {
    setFreeCamHandler(handleFreeCam)
    return () => clearFreeCamHandler(handleFreeCam)
  }, [handleFreeCam])

  const lastFrameTime = useRef(0)
  useFrame((_, delta) => {
    if (!animating.current || !controlsRef.current) return
    if (introAnim.current) {
      const now = performance.now()
      if (lastFrameTime.current > 0) {
        const frameDuration = now - lastFrameTime.current
        if (frameDuration > 20) {
          const progress = Math.min(elapsed.current / duration.current, 1)
          console.warn(`[ZOOM STUTTER] frame took ${frameDuration.toFixed(1)}ms at progress=${(progress * 100).toFixed(1)}%`)
        }
      }
      lastFrameTime.current = now
    } else {
      lastFrameTime.current = 0
    }
    elapsed.current += delta
    const t = Math.min(elapsed.current / duration.current, 1)
    const eased = introAnim.current ? easeInOut(t) : easeOut(t)
    camera.position.lerpVectors(startPos.current, goalPos.current, eased)
    controlsRef.current.target.lerpVectors(startTarget.current, goalTarget.current, eased)
    anchorOx.current = startAnchorOx.current + (goalAnchorOx.current - startAnchorOx.current) * eased
    controlsRef.current.update()
    if (t >= 1) {
      animating.current = false
      introAnim.current = false
      anchorOx.current = goalAnchorOx.current

      restPos.current.copy(camera.position)
      restTarget.current.copy(controlsRef.current.target)
      restRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize()
      restQuat.current.copy(camera.quaternion)

      const view = VIEWS[currentViewName.current]
      const pivot = view?.pivotObject && fullScene && getPivotCenter(fullScene, view.pivotObject)
      if (pivot) {
        pivotPoint.current.copy(pivot)
      } else {
        pivotPoint.current.copy(controlsRef.current.target)
      }

      rangeRef.current = BASE_RANGE

      dragOffset.current = { x: 0, y: 0 }

      const _restOff = new THREE.Vector3().subVectors(restPos.current, pivotPoint.current)
      oyLimits.current = computeOyLimits(_restOff, restRight.current, MIN_POLAR, MAX_POLAR)

      ready.current = true

      fireNavigationComplete(currentViewName.current)
    }
  })

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (e) => {
      if (e.button !== 0 || animating.current || !ready.current) return
      if (e.shiftKey && freeCamRef.current) {
        panning.current = true
      } else {
        dragging.current = true
      }
      lastPointer.current = { x: e.clientX, y: e.clientY }
    }

    const onPointerMove = (e) => {
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

    const onWheel = (e) => {
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
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [gl, camera])

  const _axis = new THREE.Vector3()
  const _quat = new THREE.Quaternion()
  const _quatV = new THREE.Quaternion()
  const _quatCombined = new THREE.Quaternion()
  const _offset = new THREE.Vector3()
  useFrame(() => {
    if (animating.current || !ready.current) return

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
    if (!animating.current && ready.current) {
      const aspect = state.size.width / state.size.height
      const goal = computeAnchorGoal(currentViewName.current, aspect)
      if (Math.abs(anchorOx.current - goal) > 1e-5) {
        anchorOx.current = THREE.MathUtils.damp(anchorOx.current, goal, 3, delta)
        if (Math.abs(anchorOx.current - goal) < 1e-5) anchorOx.current = goal
      }
    }

    const els = camera.projectionMatrix.elements
    if (els[8] === anchorOx.current) return
    els[8] = anchorOx.current
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  }, 2)

  return null
}

export default CameraAnimator
