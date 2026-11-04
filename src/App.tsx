import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import '@fontsource/vt323'
import './iconfont.css'
import { VIEWS } from './config/views'
import { navigateToView, jumpToView, triggerIntroZoom, enterFreeCam, setOnNavigationComplete, clearOnNavigationComplete, setOnIntroPreComplete, clearOnIntroPreComplete } from './components/camera/bridge'
import PANELS from './panels'
import { invalidateTypedLayout } from './components/typedLayout'
import { SECTIONS, hrefFor, navClick } from './panels/sections'
import { canRender3D, StageBoundary } from './capabilities'
import { useScreenLayout, useCanHover, stackedSceneFraction } from './layout'
import './App.css'
import type { NavEvent, ViewName, PanelId, ScreenPhase } from './types'

// The 3D stage (three.js, R3F, the GLB) is a separate chunk. Its download
// starts as soon as this module runs, in parallel with React's first render
// of the HTML overlay. Devices that get the flat layout never load it.
// Not React.lazy: a Suspense boundary adds ~300 ms reveal throttling.
type StageComponent = typeof import('./components/Stage').default
const SUPPORTS_3D = canRender3D()
let stageChunk: Promise<StageComponent> | null = null
const loadStage = () => (stageChunk ??= import('./components/Stage').then((m) => m.default))
if (SUPPORTS_3D) loadStage()
const CameraInfoPanel = lazy(() => import('./CameraInfo').then(m => ({ default: m.CameraInfoPanel })))

// The canvas fades in over STAGE_FADE_MS once its first frame is ready
// (keep in sync with .stage in App.css), then the screen boots.
const STAGE_FADE_MS = 450
const BOOT_MS = 400
// If the 3D scene isn't ready by then (slow network / slow device), show the
// panel over the backdrop instead of keeping the visitor waiting; the scene
// then fades in behind it at the current view, without the intro zoom.
const PANEL_FALLBACK_MS = 2500
// Per-section icon colours (see --icon-* in App.css); off = monochrome icons.
const COLORED_ICONS = true

function viewFromHash(): ViewName | null {
  const v = window.location.hash.slice(1)
  return v in VIEWS ? (v as ViewName) : null
}

/*
 * Navigation state is rendered from React state and mirrored in a ref that
 * every handler (including the window keydown/popstate listeners) reads and
 * writes synchronously through updateNav, so a burst of events in one tick
 * always builds on the latest state. A view change: erase the visible panels
 * (camera starts flying at once), then, when every mounted panel reports it
 * has finished erasing, swap in the target view's panels and type them in.
 */
interface NavState {
  view: ViewName
  left: PanelId | null
  right: PanelId | null
  leftVisible: boolean
  rightVisible: boolean
}

function App() {
  const screen = useScreenLayout()
  const canHover = useCanHover()
  const [stageFailed, setStageFailed] = useState(false)
  const has3D = SUPPORTS_3D && !stageFailed
  const mode = has3D ? screen.kind : 'flat'
  // Text alignment follows the layout mode (TypedText caches it).
  useLayoutEffect(() => { invalidateTypedLayout() }, [mode])

  const [Stage, setStage] = useState<StageComponent | null>(null)
  const [stageVisible, setStageVisible] = useState(false)

  const [initialView] = useState<ViewName>(() => viewFromHash() ?? 'home')
  const [navState, setNavState] = useState<NavState>(() => ({
    view: initialView,
    left: VIEWS[initialView].left,
    right: VIEWS[initialView].right,
    // flat layout from the start: panels straight away
    leftVisible: !SUPPORTS_3D && Boolean(VIEWS[initialView].left),
    rightVisible: !SUPPORTS_3D && Boolean(VIEWS[initialView].right),
  }))
  const nav = useRef(navState)
  const updateNav = useCallback((patch: Partial<NavState>) => {
    nav.current = { ...nav.current, ...patch }
    setNavState(nav.current)
  }, [])
  const pending = useRef<ViewName | null>(null)
  const leftDone = useRef(true)
  const rightDone = useRef(true)
  const focusPanelOnSwap = useRef(false)

  const [freeCam, setFreeCam] = useState(false)
  const [freeCamIdle, setFreeCamIdle] = useState(false)
  const [bootPhase, setBootPhase] = useState<'off' | 'booting' | 'done'>(SUPPORTS_3D ? 'off' : 'done')
  const [landedView, setLandedView] = useState<ViewName>(initialView)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [introComplete, setIntroComplete] = useState(!SUPPORTS_3D)
  const [interactive, setInteractive] = useState(!SUPPORTS_3D)

  const isFreeCam = useRef(false)
  const interactiveRef = useRef(!SUPPORTS_3D)
  const introZoomRef = useRef(false)
  const stageReadyRef = useRef(false)
  const panelFallbackRef = useRef(!SUPPORTS_3D)
  const introTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const lastInput = useRef<'pointer' | 'key'>('key')

  const showPanels = useCallback(() => {
    const s = nav.current
    updateNav({ leftVisible: Boolean(s.left), rightVisible: Boolean(s.right) })
    if (!interactiveRef.current) {
      interactiveRef.current = true
      setInteractive(true)
    }
  }, [updateNav])

  const trySwap = useCallback(() => {
    const target = pending.current
    if (!target || !leftDone.current || !rightDone.current) return
    pending.current = null
    updateNav({ left: VIEWS[target].left, right: VIEWS[target].right })
    showPanels()
  }, [showPanels, updateNav])

  const onLeftUntypeComplete = useCallback(() => { leftDone.current = true; trySwap() }, [trySwap])
  const onRightUntypeComplete = useCallback(() => { rightDone.current = true; trySwap() }, [trySwap])

  const finishIntro = useCallback(() => {
    introZoomRef.current = false
    setBootPhase('done')
    setIntroComplete(true)
  }, [])

  /** Drop free cam state (no camera move, no panels). */
  const leaveFreeCam = useCallback(() => {
    if (!isFreeCam.current) return false
    isFreeCam.current = false
    setFreeCam(false)
    return true
  }, [])

  const exitFreeCamMode = useCallback(() => {
    if (!leaveFreeCam()) return
    showPanels()
    navigateToView(nav.current.view)
  }, [leaveFreeCam, showPanels])

  const navigate = useCallback((view: ViewName, opts: { history?: boolean; event?: NavEvent } = {}) => {
    if (!interactiveRef.current) return
    if (isFreeCam.current) exitFreeCamMode()
    // Clicked during the tail of the intro zoom: settle the intro state now.
    if (introZoomRef.current) finishIntro()
    const s = nav.current
    if (view === s.view) return

    if (opts.history !== false) {
      const url = view === 'home' ? window.location.pathname + window.location.search : hrefFor(view)
      window.history.pushState(null, '', url)
    }
    // Mouse clicks shouldn't leave focus on a link that's about to be erased.
    if (opts.event && opts.event.detail > 0) (opts.event.currentTarget as HTMLElement | null)?.blur?.()
    focusPanelOnSwap.current = Boolean(opts.event && opts.event.detail === 0)

    updateNav({ view })
    if (view !== 'projects') setSelectedProject(null)
    navigateToView(view)

    const target = VIEWS[view]
    if (target.left === s.left && target.right === s.right) {
      // Going back to the panels still on screen (e.g. A -> B -> A before the
      // swap): just type them back in.
      pending.current = null
      showPanels()
      return
    }
    pending.current = view
    // A panel that is already hidden has either finished erasing (flag
    // already true) or will report when it does.
    leftDone.current = !s.left || (!s.leftVisible && leftDone.current)
    rightDone.current = !s.right || (!s.rightVisible && rightDone.current)
    updateNav({ leftVisible: false, rightVisible: false })
    trySwap()
  }, [exitFreeCamMode, finishIntro, showPanels, trySwap, updateNav])

  const onNavigate = useCallback((view: ViewName, e?: NavEvent) => navigate(view, { event: e }), [navigate])

  // Keyboard navigation: move focus into the newly typed panel.
  useLayoutEffect(() => {
    if (!focusPanelOnSwap.current || pending.current) return
    const panel = document.querySelector<HTMLElement>('#overlay .panel')
    if (panel) {
      focusPanelOnSwap.current = false
      panel.focus({ preventScroll: true })
    }
  })

  const enterFreeCamMode = useCallback(() => {
    if (!interactiveRef.current || introZoomRef.current || pending.current || isFreeCam.current || !stageReadyRef.current) return
    isFreeCam.current = true
    setFreeCam(true)
    updateNav({ leftVisible: false, rightVisible: false })
    enterFreeCam()
  }, [updateNav])

  // ── Key hints (desktop) ──
  const [keyHintArmed, setKeyHintArmed] = useState(false)
  const [keyHintDismissed, setKeyHintDismissed] = useState(false)
  const keyboardScene = has3D && canHover
  const showKeyHints = keyHintArmed && !keyHintDismissed && !freeCam && keyboardScene && mode === 'wide'
  const keyboardSceneRef = useRef(keyboardScene)
  useEffect(() => { keyboardSceneRef.current = keyboardScene }, [keyboardScene])

  useEffect(() => {
    if (!introComplete || !keyboardScene) return
    const t = setTimeout(() => setKeyHintArmed(true), 800)
    return () => clearTimeout(t)
  }, [introComplete, keyboardScene])

  // In free cam, fade the HUD after 2s of inactivity so only the scene shows.
  useEffect(() => {
    if (!freeCam) return
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      setFreeCamIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setFreeCamIdle(true), 2000)
    }
    const events: string[] = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart', 'touchmove']
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach((ev) => window.removeEventListener(ev, reset))
    }
  }, [freeCam])

  // The 3D stage failed at runtime (chunk or WebGL context): flat layout.
  const failStage = useCallback(() => {
    setStageFailed(true)
    panelFallbackRef.current = true
    introTimers.current.forEach(clearTimeout)
    introZoomRef.current = false
    leaveFreeCam()
    showPanels()
    finishIntro()
  }, [leaveFreeCam, showPanels, finishIntro])

  useEffect(() => {
    if (!has3D || Stage) return
    let alive = true
    loadStage().then((C) => { if (alive) setStage(() => C) }, () => { if (alive) failStage() })
    return () => { alive = false }
  }, [has3D, Stage, failStage])

  // If the 3D scene is slow to come up, show the panels over the backdrop.
  useEffect(() => {
    performance.mark('app:mounted')
    if (!has3D || stageReadyRef.current) return
    const t = setTimeout(() => {
      if (stageReadyRef.current) return
      performance.mark('app:panel-fallback')
      panelFallbackRef.current = true
      showPanels()
    }, PANEL_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [has3D, showPanels])

  useEffect(() => () => introTimers.current.forEach(clearTimeout), [])

  // First 3D frame is compiled and drawn (still invisible): fade it in.
  const onStageReady = useCallback(() => {
    if (stageReadyRef.current) return
    stageReadyRef.current = true
    performance.mark('intro:loading-complete')
    setStageVisible(true)
    if (panelFallbackRef.current) {
      // Panels are already up: place the camera at the current view and show
      // the booted desktop on the monitor, no intro zoom.
      jumpToView(nav.current.view)
      finishIntro()
      return
    }
    introTimers.current.push(setTimeout(() => {
      performance.mark('intro:boot-start')
      setBootPhase('booting')
      introTimers.current.push(setTimeout(() => {
        performance.mark('intro:zoom-trigger')
        introZoomRef.current = true
        triggerIntroZoom(nav.current.view)
      }, BOOT_MS))
    }, STAGE_FADE_MS))
  }, [finishIntro])

  // Window-level keys and history; handlers only read refs, so they're never stale.
  useEffect(() => {
    const onPointer = () => { lastInput.current = 'pointer' }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Tab') {
        if (isFreeCam.current) {
          event.preventDefault()
          setKeyHintDismissed(true)
          lastInput.current = 'key'
          exitFreeCamMode()
          return
        }
        // Tab is the free-cam key for mouse users; keyboard users keep normal
        // focus navigation (free cam needs a mouse anyway).
        if (keyboardSceneRef.current && lastInput.current === 'pointer' && !event.shiftKey) {
          event.preventDefault()
          setKeyHintDismissed(true)
          enterFreeCamMode()
          return
        }
        lastInput.current = 'key'
        return
      }
      if (event.key === 'Escape') {
        setKeyHintDismissed(true)
        if (isFreeCam.current) exitFreeCamMode()
        else navigate('home')
      }
    }
    const onPopState = () => navigate(viewFromHash() ?? 'home', { history: false })
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerdown', onPointer, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('popstate', onPopState)
    }
  }, [navigate, enterFreeCamMode, exitFreeCamMode])

  useEffect(() => {
    const preHandler = () => {
      if (!introZoomRef.current) return
      performance.mark('intro:right-visible')
      // Only the panels here: flipping bootPhase re-renders the whole 3D tree
      // mid-flight. The navigation-complete handler sets it once landed.
      showPanels()
    }
    setOnIntroPreComplete(preHandler)
    return () => clearOnIntroPreComplete(preHandler)
  }, [showPanels])

  useEffect(() => {
    const handler = (viewName: ViewName) => {
      if (introZoomRef.current) {
        // Fallback: if pre-complete didn't fire (e.g. the intro ran in one
        // very slow frame), make sure the panels are shown.
        if (!interactiveRef.current) showPanels()
        finishIntro()
        performance.mark('intro:intro-complete')
        try { performance.measure('intro:boot-duration', 'intro:boot-start', 'intro:boot-anim-done') } catch { /* mark missing */ }
        try { performance.measure('intro:zoom-duration', 'intro:zoom-trigger', 'intro:anim-done') } catch { /* mark missing */ }
        try { performance.measure('intro:reveal-lead', 'intro:right-visible', 'intro:anim-done') } catch { /* mark missing */ }
      }
      setLandedView(viewName)
    }
    setOnNavigationComplete(handler)
    return () => clearOnNavigationComplete(handler)
  }, [showPanels, finishIntro])

  // The monitor follows the camera, not the panels: it switches to the desktop
  // (and plays a selected project's demo) only once the camera has landed on
  // Projects. A project gets selected mid-flight whenever the cursor rests
  // where the list types in; switching there would put the screen's redraws,
  // a texture upload per frame and a 3D re-render on top of the flight.
  const onProjects = landedView === 'projects'
  const screenPhase: ScreenPhase = bootPhase !== 'done' ? bootPhase : (onProjects ? 'projects' : 'clouds')
  const monitorProject = onProjects ? selectedProject : null

  const s = navState
  const LeftComponent = s.left ? PANELS[s.left] : null
  const RightComponent = s.right ? PANELS[s.right] : null
  const panelProps = {
    // the wide layout has a section nav in each panel; the others a tab bar
    showSectionNav: mode === 'wide',
    onNavigate,
    onProjectSelect: setSelectedProject,
    activeProject: selectedProject,
  }
  // The view whose panels are (about to be) on screen drives the stacked layout split.
  const sceneFraction = mode === 'stacked' ? stackedSceneFraction(s.view, screen.width, screen.height) : 0

  const appClass = [
    `layout-${mode}`,
    `view-${s.view}`,
    freeCam ? 'is-freecam' : '',
    canHover ? 'can-hover' : 'is-touch',
    keyboardScene && mode === 'wide' ? 'has-key-hints' : '',
    COLORED_ICONS ? 'icons-color' : '',
  ].filter(Boolean).join(' ')

  return (
    <div id="app" className={appClass}>
      {has3D && (
        <StageBoundary onError={failStage}>
          {Stage && (
            <Stage
              visible={stageVisible}
              onReady={onStageReady}
              freeCam={freeCam}
              screenPhase={screenPhase}
              hoveredProject={monitorProject}
              introComplete={introComplete}
            />
          )}
        </StageBoundary>
      )}

      <div id="overlay">
        {freeCam && (
          <Suspense fallback={null}>
            <div className={`freecam-ui${freeCamIdle ? ' idle' : ''}`}>
              <CameraInfoPanel />
            </div>
          </Suspense>
        )}
        {/* --scene-frac is set here, not on #app, and isn't inherited (App.css):
            a view change then restyles the sheet alone, not every element. */}
        <div className="panel-sheet" style={{ '--scene-frac': sceneFraction } as React.CSSProperties}>
          {LeftComponent && (
            <LeftComponent {...panelProps} visible={s.leftVisible} onUntypeComplete={onLeftUntypeComplete} />
          )}
          {RightComponent && (
            <RightComponent {...panelProps} visible={s.rightVisible} onUntypeComplete={onRightUntypeComplete} />
          )}
        </div>
        {/* Home's own menu is the navigation there; elsewhere the tab bar is. */}
        {mode !== 'wide' && interactive && !freeCam && s.view !== 'home' && (
          <nav className="tabbar" aria-label="Sections">
            {SECTIONS.map((sec) => (
              <a
                key={sec.view}
                href={hrefFor(sec.view)}
                className="tab"
                aria-current={sec.view === s.view ? 'page' : undefined}
                onClick={(e) => navClick(sec.view, onNavigate)(e)}
              >
                <i className={`hn hn-${sec.icon}`} aria-hidden="true" />
                <span>{sec.label}</span>
              </a>
            ))}
          </nav>
        )}
        {keyboardScene && mode === 'wide' && (
          <div className={`key-hints${showKeyHints ? ' visible' : ''}`} aria-hidden="true">
            <span><kbd>Tab</kbd>free cam</span>
            <span><kbd>Esc</kbd>home</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
