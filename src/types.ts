import type * as THREE from 'three'

export type ViewName = 'home' | 'about' | 'experience' | 'projects' | 'contact'

export type PanelId = 'home' | 'about' | 'experience' | 'projects' | 'contact'

/** What a camera shot is about: GLB objects whose union box gets framed. */
export interface Subject {
  names: string[]
  /** world units added on every side */
  pad?: number
  /** extra world units above (e.g. steam over the mug) */
  padTop?: number
}

export interface ViewConfig {
  position: [number, number, number]
  rotation: [number, number, number]
  /** drag-orbit pivot (object name) */
  pivotObject: string
  subject: Subject
  /** stacked (portrait) layout: viewing direction override (world vector) */
  stackedLook?: [number, number, number]
  left: PanelId | null
  right: PanelId | null
}

export type ViewsMap = Record<ViewName, ViewConfig>

export interface PanelProps {
  visible: boolean
  onNavigate: (viewName: ViewName, e?: React.MouseEvent) => void
  onUntypeComplete: () => void
  /** pointer is over the panel's section nav (see App: buffered screen phase) */
  onNavHoverChange?: (hovering: boolean) => void
  /** render the panel's own section nav (wide layout) */
  showSectionNav?: boolean
  onProjectSelect?: (projectId: string | null) => void
  activeProject?: string | null
}

export interface TextSegment {
  text: string
  className?: string
  /** renders the segment as a link */
  href?: string
  onClick?: (e: React.MouseEvent) => void
}

export interface TypedTextProps {
  text?: string
  segments?: TextSegment[]
  visible: boolean
  /** ms per character while typing */
  speed: number
  /** ms per character while erasing (defaults to `speed`) */
  untypeSpeed?: number
  /** fires each time the text finishes typing in */
  onTyped?: () => void
  /** fires each time the text finishes erasing (panel completion is tracked automatically via UntypeTrackerContext) */
  onUntyped?: () => void
  icon?: string
  iconPosition?: 'before' | 'after'
}

export interface ScreenMeshContextValue {
  screenMesh: THREE.Mesh | null
  screenCanvas: HTMLCanvasElement | null
  screenTexture: THREE.CanvasTexture | null
  screenTexSize: { width: number; height: number } | null
  fullScene: THREE.Group | null
  setScreenSetup: (setup: {
    mesh: THREE.Mesh
    canvas: HTMLCanvasElement
    texture: THREE.CanvasTexture
    width: number
    height: number
  }) => void
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
