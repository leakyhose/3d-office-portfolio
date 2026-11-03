import { useState, useCallback, useMemo } from 'react'
import { ScreenMeshContext } from './screenMesh'
import type * as THREE from 'three'
import type { ScreenMeshContextValue } from '../types'

interface ScreenSetup {
  mesh: THREE.Mesh
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  width: number
  height: number
}

export function ScreenMeshProvider({ children }: { children: React.ReactNode }) {
  const [screenSetup, setScreenSetupState] = useState<ScreenSetup | null>(null)
  const [fullScene, setFullSceneState] = useState<THREE.Group | null>(null)

  const setScreenSetup = useCallback((setup: ScreenSetup) => {
    setScreenSetupState(setup)
  }, [])

  const setFullScene = useCallback((scene: THREE.Group) => {
    setFullSceneState(scene)
  }, [])

  const value = useMemo<ScreenMeshContextValue>(
    () => ({
      screenMesh: screenSetup?.mesh ?? null,
      screenCanvas: screenSetup?.canvas ?? null,
      screenTexture: screenSetup?.texture ?? null,
      screenTexSize: screenSetup
        ? { width: screenSetup.width, height: screenSetup.height }
        : null,
      fullScene,
      setScreenSetup,
      setFullScene,
    }),
    [screenSetup, fullScene, setScreenSetup, setFullScene]
  )

  return (
    <ScreenMeshContext.Provider value={value}>
      {children}
    </ScreenMeshContext.Provider>
  )
}
