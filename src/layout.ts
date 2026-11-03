import { useSyncExternalStore } from 'react'
import type { ViewName } from './types'

/*
 * Screen layout, shared by the HTML overlay (CSS classes) and the camera
 * framing, so both always agree.
 *
 *  - wide:    landscape. Panels sit beside the subject, over the full-screen scene.
 *  - stacked: portrait / narrow. The scene fills the top part of the screen and
 *             the panel sits under it; navigation moves to a bottom bar.
 */
export type LayoutKind = 'wide' | 'stacked'

/** NDC rect (x: -1 left .. 1 right, y: -1 bottom .. 1 top). */
export interface Region { left: number; right: number; bottom: number; top: number }

export function layoutKindFor(width: number, height: number): LayoutKind {
  return width / height < 1.1 || width < 600 ? 'stacked' : 'wide'
}

/**
 * Stacked layout: fraction of the screen height given to the 3D scene, per
 * view. Views whose subject *is* the content (the experience sheet) get more;
 * text-heavy panels get less.
 */
const STACKED_SCENE: Record<ViewName, number> = {
  home: 0.46,
  about: 0.4,
  experience: 0.54,
  projects: 0.38,
  contact: 0.46,
}

/** Views where the 3D subject is the content; on wider portrait screens
 *  (tablets) the text needs fewer lines, so these get a bit more scene. */
const SUBJECT_LED = new Set<ViewName>(['home', 'experience', 'contact'])

export function stackedSceneFraction(view: ViewName, width: number, height: number): number {
  const base = STACKED_SCENE[view]
  if (!SUBJECT_LED.has(view)) return base
  const extra = Math.min(0.08, Math.max(0, (width / height - 0.5) * 0.3))
  return base + extra
}

/** Where the subject may be placed (NDC), given the scene's share of the height. */
export function stackedRegion(sceneFraction: number, height: number): Region {
  const topPad = Math.min(0.12, 2 * 20 / height) // ~20px clear of the top edge
  // The panel's top fades in over the scene; keep the subject above the fade.
  const bottom = 1 - 2 * sceneFraction + 2 * 16 / height
  return { left: -0.9, right: 0.9, bottom, top: 1 - topPad }
}

/** Region used before any panel is up (intro boot on the monitor). */
export const FULL_REGION: Region = { left: -0.92, right: 0.92, bottom: -0.86, top: 0.86 }

export interface ScreenLayout {
  kind: LayoutKind
  width: number
  height: number
}

// ── window-size store (one resize listener for the whole app) ──
let snapshot: ScreenLayout = read()
const listeners = new Set<() => void>()

function read(): ScreenLayout {
  if (typeof window === 'undefined') return { kind: 'wide', width: 1440, height: 900 }
  const width = window.innerWidth
  const height = window.innerHeight
  return { kind: layoutKindFor(width, height), width, height }
}

function onResize() {
  const next = read()
  if (next.width === snapshot.width && next.height === snapshot.height) return
  snapshot = next
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  if (!listeners.size) window.addEventListener('resize', onResize)
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
    if (!listeners.size) window.removeEventListener('resize', onResize)
  }
}

export function getScreenLayout(): ScreenLayout {
  return snapshot
}

export function useScreenLayout(): ScreenLayout {
  return useSyncExternalStore(subscribe, getScreenLayout, getScreenLayout)
}

export function useLayoutKind(): LayoutKind {
  return useSyncExternalStore(subscribe, () => snapshot.kind, () => snapshot.kind)
}

// ── input capabilities ──
const hoverMql = typeof window !== 'undefined' ? window.matchMedia('(hover: hover) and (pointer: fine)') : null

/** A mouse/trackpad is the primary pointer (hover previews, free cam, key hints). */
export function useCanHover(): boolean {
  return useSyncExternalStore(
    (cb) => { hoverMql?.addEventListener('change', cb); return () => hoverMql?.removeEventListener('change', cb) },
    () => hoverMql?.matches ?? true,
    () => true,
  )
}

export const reducedMotionQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
