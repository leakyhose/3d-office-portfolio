import { Canvas } from '@react-three/fiber'
import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import '@fontsource/vt323'
import '@hackernoon/pixel-icon-library/fonts/iconfont.css'
import { VIEWS } from './config/views'
import { navigateToView, triggerIntroZoom, enterFreeCam, setOnNavigationComplete, clearOnNavigationComplete, setOnIntroPreComplete, clearOnIntroPreComplete } from './components/camera/bridge'
import LoadingScreen from './components/LoadingScreen'
import PANELS from './panels'
import { QualityContext, detectQualityLevel, getPreset, downgradeLevel, type QualitySettings } from './hooks/useQualityTier'
import useIsMobile from './hooks/useIsMobile'
import './App.css'
import type { ViewName, PanelId, ViewConfig, ScreenPhase } from './types'

const Scene = lazy(() => import('./components/Scene'))
const CameraInfoPanel = lazy(() => import('./CameraInfo').then(m => ({ default: m.CameraInfoPanel })))

function App() {
  const isMobile = useIsMobile()
  const [sceneLoaded, setSceneLoaded] = useState(false)
  const [leftPanel, setLeftPanel] = useState<PanelId | null>(null)
  const [rightPanel, setRightPanel] = useState<PanelId | null>('home')
  const [leftVisible, setLeftVisible] = useState(false)
  const [rightVisible, setRightVisible] = useState(false)
  const [freeCam, setFreeCam] = useState(false)
  const [freeCamIdle, setFreeCamIdle] = useState(false)
  const [currentView, setCurrentView] = useState<ViewName>('home')
  const [showLoading, setShowLoading] = useState(true)
  const [bootPhase, setBootPhase] = useState<'off' | 'booting' | 'done'>('off')
  const [landedView, setLandedView] = useState<ViewName>('home')
  const [hoveredProject, setHoveredProject] = useState<string | null>(null)
  const [quality, setQuality] = useState<QualitySettings>(getPreset('high'))

  // Detect GPU tier on mount and set quality accordingly
  useEffect(() => {
    if (isMobile) return
    detectQualityLevel().then((level) => {
      setQuality(getPreset(level))
    })
  }, [isMobile])

  // On mobile, no scene to load — mark ready immediately
  useEffect(() => {
    if (isMobile) setSceneLoaded(true)
  }, [isMobile])

  const handlePerfDecline = useCallback(() => {
    if (!introCompleteRef.current) return
    setQuality((prev) => {
      const next = downgradeLevel(prev.level)
      if (next === prev.level) return prev
      return getPreset(next)
    })
  }, [])

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

  const onSceneLoaded = useCallback(() => setSceneLoaded(true), [])

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

    leftDone.current = !leftPanel
    rightDone.current = !rightPanel
    trySwap()
  }, [leftPanel, rightPanel, trySwap])

  const enterFreeCamMode = useCallback(() => {
    if (navigatingRef.current || isFreeCam.current) return
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

  const onLoadingComplete = useCallback(() => {
    performance.mark('intro:loading-complete')
    setShowLoading(false)
    if (isMobile) {
      setRightVisible(true)
      setIntroComplete(true)
      return
    }
    performance.mark('intro:boot-start')
    setBootPhase('booting')
    setTimeout(() => {
      performance.mark('intro:zoom-trigger')
      introZoomRef.current = true
      triggerIntroZoom()
    }, 400)
  }, [isMobile])

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

  // During the intro zoom, render at DPR=1 to cut fragment cost ~4x while
  // keeping N8AO/Bloom/shadow-map settings identical to the final look — so
  // nothing visually flips at intro end except the resolution uplift.
  const effectiveQuality: QualitySettings = introComplete
    ? quality
    : { ...quality, dpr: [1, 1] }

  return (
    <div id="app">
      {!isMobile && (
        <QualityContext.Provider value={effectiveQuality}>
          <Canvas
            camera={{ fov: 50 }}
            shadows
            dpr={effectiveQuality.dpr}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            // The EffectComposer in Scene renders into its own multisampled
            // buffers, so MSAA on the default framebuffer would be paid twice.
            gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.7 }}
          >
            <Suspense fallback={null}>
              <Scene onLoaded={onSceneLoaded} freeCam={freeCam} screenPhase={screenPhase} hoveredProject={hoveredProject} introComplete={introComplete} onPerfDecline={handlePerfDecline} />
            </Suspense>
          </Canvas>
        </QualityContext.Provider>
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
      {showLoading && (
        <LoadingScreen
          loaded={sceneLoaded}
          onComplete={onLoadingComplete}
        />
      )}
    </div>
  )
}

export default App
