import { createContext, useContext } from 'react'
import type { ScreenMeshContextValue } from '../types'

export const ScreenMeshContext = createContext<ScreenMeshContextValue>({
  screenMesh: null,
  screenCanvas: null,
  screenTexture: null,
  screenTexSize: null,
  fullScene: null,
  setScreenSetup: () => {},
  setFullScene: () => {},
})

export function useScreenMesh() {
  return useContext(ScreenMeshContext)
}
