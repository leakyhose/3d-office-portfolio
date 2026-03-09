import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const ScreenMeshContext = createContext({
  screenMesh: null,
  screenSource: null,
  fullScene: null,
  setScreenMesh: () => {},
  setFullScene: () => {},
})

export function ScreenMeshProvider({ children }) {
  const [screenMesh, setScreenMeshState] = useState(null)
  const [screenSource, setScreenSource] = useState(null)
  const [fullScene, setFullSceneState] = useState(null)

  const setScreenMesh = useCallback((mesh, source) => {
    setScreenMeshState(mesh)
    setScreenSource(source)
  }, [])

  const setFullScene = useCallback((scene) => {
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
