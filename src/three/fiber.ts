import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

/*
 * The small part of @react-three/fiber this app used, without the library:
 * no second React reconciler (R3F builds its own when its module loads, ~40 ms
 * of parse/eval at 4x CPU) and no JSX scene graph. Components stay ordinary
 * React components in the DOM tree that render null; they create their three
 * objects in effects (useSceneObject) and hook into the shared render loop
 * with useFrame. Same semantics as R3F (v9) for everything used here:
 *
 *  - one requestAnimationFrame loop (pauses with the tab, like any rAF)
 *  - useFrame callbacks run in ascending priority, then mount order, with
 *    the delta from a performance.now() clock (first frame: 0)
 *  - after them the scene is rendered, unless a callback with priority > 0
 *    is mounted: that one renders by itself
 *  - size / DPR changes resize the renderer (and its canvas style) and set
 *    the camera's aspect
 */

export interface Size { width: number; height: number; top: number; left: number }

export interface RootState {
  gl: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  size: Size
  viewport: { dpr: number }
  clock: { elapsedTime: number }
  setDpr: (dpr: number) => void
  get: () => RootState
}

export type FrameCallback = (state: RootState, delta: number) => void

interface Subscription { ref: RefObject<FrameCallback>; priority: number }

export interface Root {
  getState: () => RootState
  subscribe: (listener: () => void) => () => void
  setSize: (size: Size) => void
  addFrameCallback: (ref: RefObject<FrameCallback>, priority: number) => () => void
  start: () => void
  destroy: () => void
}

export function createRoot(gl: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, size: Size, dpr: number): Root {
  const listeners = new Set<() => void>()
  let subscriptions: Subscription[] = []
  let manualRenderers = 0
  let raf = 0
  let oldTime = -1
  const clock = { elapsedTime: 0 }

  const resize = (s: RootState) => {
    camera.aspect = s.size.width / s.size.height
    camera.updateProjectionMatrix()
    gl.setPixelRatio(s.viewport.dpr)
    gl.setSize(s.size.width, s.size.height, true)
  }

  // Immutable updates, so useThree() selectors see a new object on change.
  const set = (partial: Partial<RootState>) => {
    const prev = state
    state = { ...state, ...partial }
    if (state.size !== prev.size || state.viewport.dpr !== prev.viewport.dpr) resize(state)
    listeners.forEach((l) => l())
  }

  let state: RootState = {
    gl, scene, camera, size, clock,
    viewport: { dpr },
    setDpr: (value) => { if (value !== state.viewport.dpr) set({ viewport: { dpr: value } }) },
    get: () => state,
  }
  resize(state)

  const frame = () => {
    raf = requestAnimationFrame(frame)
    // THREE.Clock semantics (what R3F passes as delta): starts on the first frame.
    const now = performance.now()
    const delta = oldTime < 0 ? 0 : (now - oldTime) / 1000
    oldTime = now
    clock.elapsedTime += delta
    const subs = subscriptions
    for (let i = 0; i < subs.length; i++) subs[i].ref.current(state, delta)
    if (!manualRenderers) gl.render(scene, camera)
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setSize: (next) => {
      const s = state.size
      if (next.width !== s.width || next.height !== s.height || next.top !== s.top || next.left !== s.left) set({ size: next })
    },
    addFrameCallback: (ref, priority) => {
      const sub = { ref, priority }
      if (priority > 0) manualRenderers++
      // New arrays (never mutated in place) so a frame in progress keeps its list.
      subscriptions = [...subscriptions, sub].sort((a, b) => a.priority - b.priority)
      return () => {
        if (priority > 0) manualRenderers--
        subscriptions = subscriptions.filter((s) => s !== sub)
      }
    },
    start: () => { if (!raf) raf = requestAnimationFrame(frame) },
    destroy: () => {
      cancelAnimationFrame(raf)
      listeners.clear()
      subscriptions = []
      gl.renderLists.dispose()
      gl.forceContextLoss()
    },
  }
}

export const RootContext = createContext<Root | null>(null)

function useRoot(): Root {
  const root = useContext(RootContext)
  if (!root) throw new Error('fiber hooks can only be used inside <Canvas>')
  return root
}

const identity = (s: RootState) => s

/** The root state, or a slice of it (re-renders when that slice changes). */
export function useThree(): RootState
export function useThree<T>(selector: (state: RootState) => T): T
export function useThree<T>(selector: (state: RootState) => T = identity as (state: RootState) => T): T {
  const root = useRoot()
  return useSyncExternalStore(root.subscribe, () => selector(root.getState()))
}

/** Runs `callback` every frame; a priority > 0 takes over rendering. */
export function useFrame(callback: FrameCallback, priority = 0): void {
  const root = useRoot()
  const ref = useRef(callback)
  useLayoutEffect(() => { ref.current = callback })
  useLayoutEffect(() => root.addFrameCallback(ref, priority), [root, priority])
}

/** Adds `object` to the scene while mounted (what a JSX element did under R3F). */
export function useSceneObject(object: Object3D | null): void {
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    if (!object) return
    scene.add(object)
    return () => { scene.remove(object) }
  }, [scene, object])
}

/** Sets scene.background / scene.fog while mounted (R3F's `attach`). */
export function useSceneAttach<K extends 'background' | 'fog'>(key: K, value: Scene[K]): void {
  const root = useRoot()
  useLayoutEffect(() => {
    const { scene } = root.getState()
    scene[key] = value
    return () => { scene[key] = null }
  }, [root, key, value])
}
