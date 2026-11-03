import { Component, type ReactNode } from 'react'

/*
 * Whether to run the 3D scene at all. The baked scene is cheap (a handful of
 * unlit programs, a few dozen draw calls, ~730 KB of assets), so phones and
 * tablets get it too; only devices that can't or shouldn't run it get the
 * flat HTML layout:
 *   - no WebGL2 (three r183 requires it)
 *   - Data Saver on
 *   - very low-end hardware (<= 1 GB RAM or <= 2 cores, where reported)
 * `?2d` / `?3d` in the URL force either mode (handy for testing).
 * If the WebGL context still fails to come up, <StageBoundary> switches to
 * the flat layout at runtime.
 */
export function canRender3D(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.has('2d')) return false
  if (params.has('3d')) return true
  if (typeof WebGL2RenderingContext === 'undefined') return false
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return false
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 1) return false
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) return false
  return true
}

interface BoundaryProps { onError: () => void; children: ReactNode }

/** Catches WebGL/renderer failures inside the 3D stage. */
export class StageBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) {
    console.warn('3D scene unavailable, using the flat layout:', error)
    this.props.onError()
  }
  render() { return this.state.failed ? null : this.props.children }
}
