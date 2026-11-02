import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import Scene from './Scene'
import { loadOffice } from '../scene/office'
import { initialDpr } from '../hooks/useQualityTier'
import type { ScreenPhase } from '../types'

// Start fetching the GLB + lightmaps the moment this chunk is evaluated
// (index.html already preloads them, so this usually just picks them up).
loadOffice()
performance.mark('stage:chunk-loaded')

interface StageProps {
  visible: boolean
  onReady: () => void
  freeCam: boolean
  screenPhase: ScreenPhase
  hoveredProject: string | null
  introComplete: boolean
}

export default function Stage({ visible, onReady, ...sceneProps }: StageProps) {
  return (
    <div className={`stage${visible ? ' visible' : ''}`}>
      <Canvas
        camera={{ fov: 50 }}
        dpr={initialDpr()}
        // Lighting is baked; the old composer rendered without tone mapping,
        // so render flat (NoToneMapping) to keep the same colours.
        flat
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <Scene onReady={onReady} {...sceneProps} />
        </Suspense>
      </Canvas>
    </div>
  )
}
