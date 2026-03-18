import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import '@fontsource/vt323'
import '@hackernoon/pixel-icon-library/fonts/iconfont.css'
import { VIEWS, INTRO_ZOOM_DURATION } from './config/views'
import { navigateToView, triggerIntroZoom, enterFreeCam, setOnNavigationComplete, clearOnNavigationComplete } from './components/camera/bridge'
import LoadingScreen from './components/LoadingScreen'
import Scene from './components/Scene'
import { CameraInfoPanel } from './CameraInfo'
import PANELS from './panels'
import './App.css'

function App() {
  const [sceneLoaded, setSceneLoaded] = useState(false)
  const [leftPanel, setLeftPanel] = useState(null)
  const [rightPanel, setRightPanel] = useState('home')
  const [leftVisible, setLeftVisible] = useState(false)
  const [rightVisible, setRightVisible] = useState(false)
  const [freeCam, setFreeCam] = useState(false)
  const [currentView, setCurrentView] = useState('home')
  const [showLoading, setShowLoading] = useState(true)
  const [bootPhase, setBootPhase] = useState('off')
  const [landedView, setLandedView] = useState('home')

  const pendingTarget = useRef(null)
  const leftDone = useRef(true)
  const rightDone = useRef(true)
  const swapTimer = useRef(null)

  const savedStateRef = useRef(null)
  const currentViewRef = useRef('home')
  const navigatingRef = useRef(false)
  const isFreeCam = useRef(false)

  const onSceneLoaded = useCallback(() => setSceneLoaded(true), [])

  const swapPanels = useCallback((target) => {
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

  const navigateToSection = useCallback((viewName) => {
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

  const onLoadingComplete = useCallback(() => {
    setShowLoading(false)
    setBootPhase('booting')
    setTimeout(() => {
      setBootPhase('done')
      triggerIntroZoom()
      setTimeout(() => setRightVisible(true), INTRO_ZOOM_DURATION * 600)
    }, 400)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Tab') {
        event.preventDefault()
        if (!isFreeCam.current) {
          enterFreeCamMode()
        } else {
          exitFreeCamMode()
        }
        return
      }
      if (event.key === 'Escape') {
        if (isFreeCam.current) {
          exitFreeCamMode()
        } else {
          navigateToSection('home')
        }
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigateToSection, enterFreeCamMode, exitFreeCamMode])

  useEffect(() => {
    const handler = (viewName) => setLandedView(viewName)
    setOnNavigationComplete(handler)
    return () => clearOnNavigationComplete(handler)
  }, [])

  useEffect(() => {
    return () => {
      if (swapTimer.current) clearTimeout(swapTimer.current)
    }
  }, [])

  const screenPhase = bootPhase !== 'done'
    ? bootPhase
    : (landedView === 'projects' ? 'projects' : 'clouds')

  const LeftComponent = leftPanel ? PANELS[leftPanel] : null
  const RightComponent = rightPanel ? PANELS[rightPanel] : null

  return (
    <div id="app">
      <Canvas
        camera={{ fov: 50 }}
        shadows
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
        <Scene onLoaded={onSceneLoaded} freeCam={freeCam} screenPhase={screenPhase} />
      </Canvas>

      <div id="overlay">
        {freeCam && (
          <>
            <CameraInfoPanel />
            <div className="freecam-hint">FREE CAM &mdash; Press Tab to return</div>
          </>
        )}
        {LeftComponent && (
          <LeftComponent
            visible={leftVisible}
            onNavigate={navigateToSection}
            onUntypeComplete={onLeftUntypeComplete}
          />
        )}
        {RightComponent && (
          <RightComponent
            visible={rightVisible}
            onNavigate={navigateToSection}
            onUntypeComplete={onRightUntypeComplete}
          />
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
// TODO: final polish
