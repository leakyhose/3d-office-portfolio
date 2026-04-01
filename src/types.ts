import type * as THREE from 'three'

export type ViewName = 'home' | 'about' | 'experience' | 'projects' | 'contact'

export type PanelId =
  | 'home'
  | 'about'
  | 'contact-left'
  | 'contact-right'
  | 'experience'
  | 'projects-nav'
  | 'projects'

export interface ViewConfig {
  position: [number, number, number]
  rotation: [number, number, number]
  pivotObject: string
  left: PanelId | null
  right: PanelId | null
  extraDelay: number
}

export type ViewsMap = Record<ViewName, ViewConfig>

export interface PanelProps {
  visible: boolean
  onNavigate: (viewName: ViewName) => void
  onUntypeComplete: () => void
  onHoverChange?: (hovering: boolean) => void
  onProjectHover?: (projectId: string | null) => void
  activeProject?: string | null
}

export interface TextSegment {
  text: string
  className?: string
  onClick?: () => void
}

export interface TypedTextProps {
  text?: string
  segments?: TextSegment[]
  visible: boolean
  speed: number
  untypeSpeed?: number
  onTyped?: () => void
  onUntyped?: () => void
  reserveSpace?: boolean
  untypeFrom?: 'end' | 'start'
  icon?: string
}

export interface ScreenMeshContextValue {
  screenMesh: THREE.Mesh | null
  screenSource: string | null
  fullScene: THREE.Group | null
  setScreenMesh: (mesh: THREE.Mesh, source: string) => void
  setFullScene: (scene: THREE.Group) => void
}

export type ScreenPhase = 'off' | 'booting' | 'done' | 'clouds' | 'projects'

export interface CameraInfoState {
  px?: number
  py?: number
  pz?: number
  rx?: number
  ry?: number
  rz?: number
  fov?: number
}
