import { INTRO_ZOOM_DURATION } from '../../config/views'

let _navigateTo = null
let _computeCloseup = null
let _freeCamHandler = null
let _onNavigationComplete = null

export function setNavigateTo(fn) { _navigateTo = fn }
export function clearNavigateTo(fn) { if (_navigateTo === fn) _navigateTo = null }

export function setComputeCloseup(fn) { _computeCloseup = fn }
export function clearComputeCloseup(fn) { if (_computeCloseup === fn) _computeCloseup = null }

export function setFreeCamHandler(fn) { _freeCamHandler = fn }
export function clearFreeCamHandler(fn) { if (_freeCamHandler === fn) _freeCamHandler = null }

export function setOnNavigationComplete(fn) { _onNavigationComplete = fn }
export function clearOnNavigationComplete(fn) { if (_onNavigationComplete === fn) _onNavigationComplete = null }

export function fireNavigationComplete(viewName) {
  if (_onNavigationComplete) _onNavigationComplete(viewName)
}

export function navigateToView(viewName) {
  if (_navigateTo) _navigateTo(viewName)
}

export function positionAtScreen() {
  if (_computeCloseup) _computeCloseup()
}

export function triggerIntroZoom() {
  if (_navigateTo) _navigateTo('home', INTRO_ZOOM_DURATION, true)
}

export function enterFreeCam() {
  if (_freeCamHandler) _freeCamHandler(true)
}

export function exitFreeCam() {
  if (_freeCamHandler) _freeCamHandler(false)
}
