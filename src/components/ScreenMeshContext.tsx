import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type * as THREE from 'three'
import type { ScreenMeshContextValue } from '../types'

const ScreenMeshContext = createContext<ScreenMeshContextValue>({
  screenMesh: null,
  screenSource: null,
  fullScene: null,
  setScreenMesh: () => {},
  setFullScene: () => {},
})

export function ScreenMeshProvider({ children }: { children: React.ReactNode }) {
  const [screenMesh, setScreenMeshState] = useState<THREE.Mesh | null>(null)
  const [screenSource, setScreenSource] = useState<string | null>(null)
  const [fullScene, setFullSceneState] = useState<THREE.Group | null>(null)

  const setScreenMesh = useCallback((mesh: THREE.Mesh, source: string) => {
    setScreenMeshState(mesh)
    setScreenSource(source)
  }, [])

  const setFullScene = useCallback((scene: THREE.Group) => {
    setFullSceneState(scene)
  }, [])

  const value = useMemo(
    () => ({ screenMesh, screenSource, fullScene, setScreenMesh, setFullScene }),
    [screenMesh, screenSource, fullScene, setScreenMesh, setFullScene]
  )

  return (
    <ScreenMeshContext.Provider value={value}>
      {children}
    </ScreenMeshContext.Provider>
  )
}

export function useScreenMesh() {
  return useContext(ScreenMeshContext)
}
