import { Canvas } from './Canvas'
import * as THREE from 'three'
import { memo, useEffect, useState } from 'react'
import Scene from './Scene'
import { paperCanvasReady } from '../scene/paper'
import { loadOffice } from '../scene/office'
import { prewarmPrograms } from '../scene/prewarm'
import { INTRO_FOG } from '../config/views'
import { initialDpr } from '../hooks/useQualityTier'
import type { ScreenPhase } from '../types'

// Start fetching the GLB + lightmaps the moment this chunk is evaluated
// (index.html already preloads them, so this usually just picks them up).
const assetsReady = Promise.all([loadOffice(), paperCanvasReady])
performance.mark('stage:chunk-loaded')

interface StageProps {
  visible: boolean
  onReady: () => void
  freeCam: boolean
  screenPhase: ScreenPhase
  hoveredProject: string | null
  introComplete: boolean
}

// Memoized: the app re-renders on every navigation step, the 3D tree only
// needs to when one of these props changes.
export default memo(function Stage({ visible, onReady, ...sceneProps }: StageProps) {
  // The canvas (and its WebGL context) is created right away, in parallel
  // with the downloads; the scene mounts once everything it needs is loaded.
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  // R3F creates the renderer asynchronously, outside React's error handling;
  // re-throw a failure during render so <StageBoundary> switches to flat.
  const [failure, setFailure] = useState<Error | null>(null)
  if (failure) throw failure
  useEffect(() => {
    let alive = true
    // A failed download switches to the flat layout instead of leaving an empty backdrop.
    assetsReady.then(
      () => { if (alive) setAssetsLoaded(true) },
      (e) => { if (alive) setFailure(e instanceof Error ? e : new Error(String(e))) },
    )
    return () => { alive = false }
  }, [])

  return (
    <div className={`stage${visible ? ' visible' : ''}`}>
      <Canvas
        camera={{ fov: 50 }}
        dpr={initialDpr()}
        // Lighting is baked; the old composer rendered without tone mapping,
        // so render flat (NoToneMapping) to keep the same colours.
        flat
        gl={async (defaults) => {
          try {
            return new THREE.WebGLRenderer({ ...defaults, antialias: true, powerPreference: 'high-performance' })
          } catch (e) {
            setFailure(e instanceof Error ? e : new Error(String(e)))
            return new Promise<never>(() => {}) // the boundary unmounts the canvas
          }
        }}
        // Shader error checking forces synchronous getShaderInfoLog/
        // getProgramInfoLog round-trips to the GPU process for every program.
        onCreated={({ gl, camera }) => {
          gl.debug.checkShaderErrors = import.meta.env.DEV
          // Synchronous GL queries block until the GPU process is idle, i.e.
          // behind every shader being compiled. Ask (three caches it) before
          // the prewarm starts so later callers (ExperiencePaper) don't stall.
          gl.capabilities.getMaxAnisotropy()
          prewarmPrograms(gl, camera, new THREE.Fog(...INTRO_FOG))
        }}
      >
        {assetsLoaded && <Scene onReady={onReady} {...sceneProps} />}
      </Canvas>
    </div>
  )
})
