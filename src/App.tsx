import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import '@fontsource/vt323'
import '@hackernoon/pixel-icon-library/fonts/iconfont.css'
import { VIEWS } from './config/views'
import { navigateToView, jumpToView, triggerIntroZoom, enterFreeCam, setOnNavigationComplete, clearOnNavigationComplete, setOnIntroPreComplete, clearOnIntroPreComplete } from './components/camera/bridge'
import PANELS from './panels'
import useIsMobile, { isMobileViewport } from './hooks/useIsMobile'
import './App.css'
import type { ViewName, PanelId, ViewConfig, ScreenPhase } from './types'

// The 3D stage (three.js, R3F, the GLB) is a separate chunk. On desktop its
// download starts as soon as this module runs, in parallel with React's first
// render of the HTML overlay; mobile never loads it.
const loadStage = () => import('./components/Stage')
const stageChunk = isMobileViewport() ? null : loadStage()
const Stage = lazy(() => stageChunk ?? loadStage())
const CameraInfoPanel = lazy(() => import('./CameraInfo').then(m => ({ default: m.CameraInfoPanel })))

// The canvas fades in over STAGE_FADE_MS once its first frame is ready
// (keep in sync with .stage in App.css), then the screen boots.
const STAGE_FADE_MS = 450
const BOOT_MS = 400
// If the 3D scene isn't ready by then (slow network / slow device), show the
// home panel over the backdrop instead of keeping the visitor waiting; the
// scene then fades in behind it at the current view, without the intro zoom.
const PANEL_FALLBACK_MS = 2500

function App() {
  const isMobile = useIsMobile()
  const [stageVisible, setStageVisible] = useState(false)
  const [leftPanel, setLeftPanel] = useState<PanelId | null>(null)
  const [rightPanel, setRightPanel] = useState<PanelId | null>('home')
  const [leftVisible, setLeftVisible] = useState(false)
  const [rightVisible, setRightVisible] = useState(false)
  const [freeCam, setFreeCam] = useState(false)
  const [freeCamIdle, setFreeCamIdle] = useState(false)
  const [currentView, setCurrentView] = useState<ViewName>('home')
  const [bootPhase, setBootPhase] = useState<'off' | 'booting' | 'done'>('off')
  const [landedView, setLandedView] = useState<ViewName>('home')
  const [hoveredProject, setHoveredProject] = useState<string | null>(null)

  const pendingTarget = useRef<ViewConfig | null>(null)
  const leftDone = useRef(true)
  const rightDone = useRef(true)
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navHovered = useRef(false)
  const bufferedLandedView = useRef<ViewName | null>(null)

  const savedStateRef = useRef<{
    leftPanel: PanelId | null
    rightPanel: PanelId | null
    leftVisible: boolean
    rightVisible: boolean
    viewName: ViewName
  } | null>(null)
  const currentViewRef = useRef<ViewName>('home')
  const navigatingRef = useRef(false)
  const isFreeCam = useRef(false)
  const introZoomRef = useRef(false)
  const introCompleteRef = useRef(false)
  const stageReadyRef = useRef(false)
  const panelFallbackRef = useRef(false)
  const introTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const swapPanels = useCallback((target: ViewConfig) => {
    if (swapTimer.current) clearTimeout(swapTimer.current)
    const extraDelay = target.extraDelay ?? 0

    const doSwap = () => {
      setLeftPanel(target.left)
      setRightPanel(target.right)
      setLeftVisible(Boolean(target.left))
      setRightVisible(Boolean(target.right))
      swapTimer.current = null
      navigatingRef.current = false
    }

    if (extraDelay > 0) {
      swapTimer.current = setTimeout(doSwap, extraDelay)
    } else {
      doSwap()
    }
  }, [])

  const trySwap = useCallback(() => {
    if (leftDone.current && rightDone.current && pendingTarget.current) {
      const target = pendingTarget.current
      pendingTarget.current = null
      swapPanels(target)
    }
  }, [swapPanels])

  const onLeftUntypeComplete = useCallback(() => {
    leftDone.current = true
    trySwap()
  }, [trySwap])

  const onRightUntypeComplete = useCallback(() => {
    rightDone.current = true
    trySwap()
  }, [trySwap])

  const navigateToSection = useCallback((viewName: ViewName) => {
    if (swapTimer.current) {
      clearTimeout(swapTimer.current)
      swapTimer.current = null
    }
    pendingTarget.current = VIEWS[viewName]
    currentViewRef.current = viewName
    setCurrentView(viewName)
    navigatingRef.current = true

    navigateToView(viewName)
    setLeftVisible(false)
    setRightVisible(false)

    // A panel that is already hidden has either finished erasing (flag is
    // already true) or will report when it does; resetting it would wait for
    // a report that never comes (e.g. Esc pressed again after one side is done).
    leftDone.current = !leftPanel || (!leftVisible && leftDone.current)
    rightDone.current = !rightPanel || (!rightVisible && rightDone.current)
    trySwap()
  }, [leftPanel, rightPanel, leftVisible, rightVisible, trySwap])

  const enterFreeCamMode = useCallback(() => {
    if (navigatingRef.current || isFreeCam.current || !stageReadyRef.current) return
    savedStateRef.current = {
      leftPanel, rightPanel, leftVisible, rightVisible,
      viewName: currentViewRef.current,
    }
    setLeftVisible(false)
    setRightVisible(false)
    enterFreeCam()
    isFreeCam.current = true
    setFreeCam(true)
  }, [leftPanel, rightPanel, leftVisible, rightVisible])

  const exitFreeCamMode = useCallback(() => {
    if (!isFreeCam.current || !savedStateRef.current) return
    const saved = savedStateRef.current
    savedStateRef.current = null
    isFreeCam.current = false
    setFreeCam(false)
    setLeftPanel(saved.leftPanel)
    setRightPanel(saved.rightPanel)
    setLeftVisible(saved.leftVisible)
    setRightVisible(saved.rightVisible)
    navigateToView(saved.viewName)
  }, [])

  const [introComplete, setIntroComplete] = useState(false)
  const [keyHintArmed, setKeyHintArmed] = useState(false)
  const [keyHintDismissed, setKeyHintDismissed] = useState(false)
  const showKeyHints = keyHintArmed && !keyHintDismissed && !freeCam && !isMobile

  useEffect(() => {
    if (!introComplete || isMobile) return
    const t = setTimeout(() => setKeyHintArmed(true), 800)
    return () => clearTimeout(t)
  }, [introComplete, isMobile])

  // In free cam, fade the HUD (coords + hint) after 2s of inactivity so only
  // the 3D scene shows. Any pointer/wheel/key/touch interaction brings it back.
  useEffect(() => {
    if (!freeCam) {
      setFreeCamIdle(false)
      return
    }
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

  // Mobile: no 3D, panels straight away. Desktop: give the 3D scene a moment
  // to arrive before falling back to showing the panels on their own.
  useEffect(() => {
    performance.mark('app:mounted')
    if (isMobile) {
      // (if the window later grows to desktop size, the scene fades in behind
      // the already visible panels instead of replaying the intro)
      panelFallbackRef.current = true
      setRightVisible(true)
      setIntroComplete(true)
      return
    }
    if (stageReadyRef.current) return
    const t = setTimeout(() => {
      if (stageReadyRef.current) return
      performance.mark('app:panel-fallback')
      panelFallbackRef.current = true
      setRightVisible(true)
    }, PANEL_FALLBACK_MS)
    return () => clearTimeout(t)
  }, [isMobile])

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
      jumpToView(currentViewRef.current)
      setBootPhase('done')
      setIntroComplete(true)
      introCompleteRef.current = true
      return
    }
    introTimers.current.push(setTimeout(() => {
      performance.mark('intro:boot-start')
      setBootPhase('booting')
      introTimers.current.push(setTimeout(() => {
        performance.mark('intro:zoom-trigger')
        introZoomRef.current = true
        triggerIntroZoom()
      }, BOOT_MS))
    }, STAGE_FADE_MS))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      setKeyHintDismissed(true)
      if (event.key === 'Tab' && !isMobile) {
        event.preventDefault()
        if (!isFreeCam.current) {
          enterFreeCamMode()
        } else {
          exitFreeCamMode()
        }
        return
      }
      if (event.key === 'Escape') {
        if (!isMobile && isFreeCam.current) {
          exitFreeCamMode()
        } else {
          navigateToSection('home')
        }
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobile, navigateToSection, enterFreeCamMode, exitFreeCamMode])

  const onNavHoverChange = useCallback((hovering: boolean) => {
    navHovered.current = hovering
    if (!hovering && bufferedLandedView.current !== null) {
      setLandedView(bufferedLandedView.current)
      bufferedLandedView.current = null
    }
  }, [])

  useEffect(() => {
    const preHandler = () => {
      if (!introZoomRef.current) return
      performance.mark('intro:right-visible')
      setBootPhase('done')
      setRightVisible(true)
    }
    setOnIntroPreComplete(preHandler)
    return () => clearOnIntroPreComplete(preHandler)
  }, [])

  useEffect(() => {
    const handler = (viewName: ViewName) => {
      if (introZoomRef.current) {
        introZoomRef.current = false
        // Fallback: if pre-complete didn't fire (e.g., intro ran in one
        // catastrophically slow frame), make sure the panel is shown.
        setBootPhase('done')
        setRightVisible(true)
        performance.mark('intro:intro-complete')
        try { performance.measure('intro:boot-duration', 'intro:boot-start', 'intro:boot-anim-done') } catch {}
        try { performance.measure('intro:zoom-duration', 'intro:zoom-trigger', 'intro:anim-done') } catch {}
        try { performance.measure('intro:reveal-lead', 'intro:right-visible', 'intro:anim-done') } catch {}
        setIntroComplete(true)
        introCompleteRef.current = true
      }
      if (navHovered.current) {
        bufferedLandedView.current = viewName
      } else {
        setLandedView(viewName)
      }
    }
    setOnNavigationComplete(handler)
    return () => clearOnNavigationComplete(handler)
  }, [])

  useEffect(() => {
    return () => {
      if (swapTimer.current) clearTimeout(swapTimer.current)
    }
  }, [])

  const screenPhase: ScreenPhase = bootPhase !== 'done'
    ? bootPhase
    : (landedView === 'projects' || hoveredProject ? 'projects' : 'clouds')

  const LeftComponent = leftPanel ? PANELS[leftPanel] : null
  const RightComponent = rightPanel ? PANELS[rightPanel] : null

  void currentView

  const panelProps = {
    left: {
      visible: leftVisible,
      onNavigate: navigateToSection,
      onUntypeComplete: onLeftUntypeComplete,
      onHoverChange: onNavHoverChange,
    },
    right: {
      visible: rightVisible,
      onNavigate: navigateToSection,
      onUntypeComplete: onRightUntypeComplete,
      onProjectHover: setHoveredProject,
      activeProject: hoveredProject,
    },
  } as const

  return (
    <div id="app">
      {!isMobile && (
        <>
          <Suspense fallback={null}>
            <Stage
              visible={stageVisible}
              onReady={onStageReady}
              freeCam={freeCam}
              screenPhase={screenPhase}
              hoveredProject={hoveredProject}
              introComplete={introComplete}
            />
          </Suspense>
          <div className="vignette" />
        </>
      )}

      <div id={isMobile ? 'mobile-app' : 'overlay'}>
        {!isMobile && freeCam && (
          <Suspense fallback={null}>
            <div className={`freecam-ui${freeCamIdle ? ' idle' : ''}`}>
              <CameraInfoPanel />
              <div className="freecam-hint">FREE CAM &mdash; Press Tab to return</div>
            </div>
          </Suspense>
        )}
        {LeftComponent && (
          <LeftComponent {...panelProps.left} />
        )}
        {RightComponent && (
          <RightComponent {...panelProps.right} />
        )}
        {!isMobile && (
          <div className={`key-hints${showKeyHints ? ' visible' : ''}`}>
            <span><span className="key-hints-key">Tab</span>Free cam</span>
            <span><span className="key-hints-key">Esc</span>Home</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
