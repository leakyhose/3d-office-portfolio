import type { ViewName } from '../../types'
import { INTRO_ZOOM_DURATION } from '../../config/views'

// Plain module-level hooks between the HTML app and the camera code living
// inside the R3F canvas (which may not be mounted yet, or at all).

type NavigateToFn = (viewName: ViewName, dur?: number, isIntro?: boolean) => void
type FreeCamHandlerFn = (entering: boolean) => void
type NavigationCompleteFn = (viewName: ViewName) => void

let _navigateTo: NavigateToFn | null = null
let _freeCamHandler: FreeCamHandlerFn | null = null
let _onNavigationComplete: NavigationCompleteFn | null = null
let _onIntroPreComplete: NavigationCompleteFn | null = null
let _isCameraAnimating: (() => boolean) | null = null

export function setNavigateTo(fn: NavigateToFn) { _navigateTo = fn }
export function clearNavigateTo(fn: NavigateToFn) { if (_navigateTo === fn) _navigateTo = null }

export function setFreeCamHandler(fn: FreeCamHandlerFn) { _freeCamHandler = fn }
export function clearFreeCamHandler(fn: FreeCamHandlerFn) { if (_freeCamHandler === fn) _freeCamHandler = null }

export function setOnNavigationComplete(fn: NavigationCompleteFn) { _onNavigationComplete = fn }
export function clearOnNavigationComplete(fn: NavigationCompleteFn) { if (_onNavigationComplete === fn) _onNavigationComplete = null }

export function setOnIntroPreComplete(fn: NavigationCompleteFn) { _onIntroPreComplete = fn }
export function clearOnIntroPreComplete(fn: NavigationCompleteFn) { if (_onIntroPreComplete === fn) _onIntroPreComplete = null }

export function fireNavigationComplete(viewName: ViewName) {
  if (_onNavigationComplete) _onNavigationComplete(viewName)
}

export function fireIntroPreComplete(viewName: ViewName) {
  if (_onIntroPreComplete) _onIntroPreComplete(viewName)
}

export function navigateToView(viewName: ViewName) {
  if (_navigateTo) _navigateTo(viewName)
}

/** Snap the camera to a view (next frame) without the fly-to animation. */
export function jumpToView(viewName: ViewName) {
  if (_navigateTo) _navigateTo(viewName, 1e-3)
}

/** The intro: fly from the monitor close-up to `viewName` (home unless deep-linked). */
export function triggerIntroZoom(viewName: ViewName = 'home') {
  if (_navigateTo) _navigateTo(viewName, INTRO_ZOOM_DURATION, true)
}

export function enterFreeCam() {
  if (_freeCamHandler) _freeCamHandler(true)
}

export function exitFreeCam() {
  if (_freeCamHandler) _freeCamHandler(false)
}

export function setCameraAnimatingQuery(fn: () => boolean) { _isCameraAnimating = fn }
export function clearCameraAnimatingQuery(fn: () => boolean) { if (_isCameraAnimating === fn) _isCameraAnimating = null }

export function isCameraAnimating(): boolean {
  return _isCameraAnimating ? _isCameraAnimating() : false
}
