import type * as THREE from 'three'

/** A click from React or from a native listener (typed text builds its links imperatively). */
export type NavEvent = React.MouseEvent | MouseEvent

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

export interface NarrowFill {
  from: number
  to: number
  keep: number
  anchor: [number, number]
}

export interface ViewConfig {
  position: [number, number, number]
  rotation: [number, number, number]
  /** drag-orbit pivot (object name) */
  pivotObject: string
  subject: Subject
  /** stacked (portrait) layout: viewing direction override (world vector) */
  stackedLook?: [number, number, number]
  /**
   * Wide layout: vertical lens shift (NDC, negative = the frame shows more
   * above). Lets a level camera end a shot at a chosen edge (just below the
   * monitor, above the desk clutter beside it) without tilting; other
   * aspects keep where that edge cuts the subject (see framing.ts).
   */
  wideShift?: number
  /** Wide layout: vertical field of view (degrees), if not framing.ts's WIDE_FOV. */
  wideFov?: number
  /**
   * Wide layout: the aspect the pose is authored for, if not 16:10. Narrower
   * screens dolly back to keep the shot's width as it is at this aspect
   * (see framing.ts), so a composition tuned with a CSS panel sized in vw up
   * to this aspect keeps its proportions down to the stacked layout.
   */
  refAspect?: number
  /**
   * Wide layout, narrower than refAspect: keeping the refAspect width leaves
   * squarer screens with the shot small in the middle. From aspect `from`
   * down to `to` this blends to keeping only `keep` of that width, scaled
   * about `anchor` (an NDC point of the refAspect frame, at the subject's
   * depth) instead of the subject's centre: the shot grows away from the
   * anchor, so a point there (the chair's edge beside a panel, the frame's
   * bottom edge) holds its place. See narrowFillAt.
   */
  narrowFill?: NarrowFill
  /**
   * Wide layout, narrower than 16:10, with a wideShift: the screen height
   * (NDC, -1 bottom edge .. 1 top edge) whose place at the subject's depth
   * the dolly back keeps; the extra height goes above and below it in
   * proportion. Default: the frame edge nearest the optical axis.
   */
  narrowHold?: number
  /**
   * Wide layout, screens wider than 16:10: dolly in so the shot keeps the
   * width it has at 16:10, up to this aspect, instead of showing more at the
   * sides (the subject stays as large as the space beside the panel allows).
   */
  keepWidth?: number
  /**
   * Wide layout, screens wider than 16:10: where the extra width goes
   * (horizontal lens shift). 0 (default) splits it between both sides; -1
   * keeps the right edge where it is at 16:10, so it all shows on the left
   * and the scene behind a right-hand panel stays as framed at 16:10.
   */
  wideAnchor?: number
  /**
   * Wide layout, screens narrower than 16:10 (with a wideShift): the dolly
   * back that keeps the subject's width leaves empty space above it. Spend
   * it raising the subject (more vertical lens shift), back to where its top
   * sits at 16:10 at most, and only as far as the frame's bottom edge can
   * drop without showing any of `clear` (the desk clutter beside it).
   * `slide`: the camera also moves to its left, this far (world units) at
   * 4:3 and in proportion to how far the aspect is below 16:10, with a
   * horizontal lens shift keeping the subject where it was on screen; the
   * parallax tucks what stands behind the subject's right side out of sight.
   */
  narrowRaise?: { clear: Subject; slide: number }
  left: PanelId | null
  right: PanelId | null
}

export type ViewsMap = Record<ViewName, ViewConfig>

export interface PanelProps {
  visible: boolean
  onNavigate: (viewName: ViewName, e?: NavEvent) => void
  onUntypeComplete: () => void
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
  onClick?: (e: NavEvent) => void
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
