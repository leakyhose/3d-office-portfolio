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
  mobileOrder?: ('left' | 'right')[]
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
  /** render this segment as a link */
  href?: string
}

/** Which edge a line of typed text grows from / stays flush to. */
export type TypedAnchor = 'left' | 'right' | 'center'

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
  /**
   * Edge the visible text stays flush to while animating. Detected from the
   * computed alignment of the line's container when omitted:
   * - left: types left -> right in place, erases from the right
   * - right: always flush right; each new char enters at the right edge
   *   (line steps left), erases from the left
   * - center: stays centered while growing / shrinking
   */
  anchor?: TypedAnchor
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
