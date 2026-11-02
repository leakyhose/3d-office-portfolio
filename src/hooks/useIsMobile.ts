import { useSyncExternalStore } from 'react'

const query = '(max-width: 768px)'
const mql = typeof window !== 'undefined' ? window.matchMedia(query) : null

function subscribe(cb: () => void) {
  mql!.addEventListener('change', cb)
  return () => mql!.removeEventListener('change', cb)
}

function getSnapshot() {
  return mql!.matches
}

function getServerSnapshot() {
  return false
}

/** Non-hook check for module-level decisions (e.g. whether to fetch the 3D chunk). */
export function isMobileViewport(): boolean {
  return mql ? mql.matches : false
}

export default function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
