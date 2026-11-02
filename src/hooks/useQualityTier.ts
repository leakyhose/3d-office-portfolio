import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

// With lighting baked into lightmaps the per-frame cost is a few dozen cheap
// draw calls, so the only quality knob left is the render resolution (DPR).
//
// Initial guess is a local heuristic (no network: detect-gpu used to fetch its
// benchmark tables from unpkg on first visit). After the intro, AdaptiveDpr
// watches real frame times and steps the DPR down if the device can't keep up.
// It never steps down while the camera is mid-flight or during the intro, so
// a resolution change can't land on top of an animation.

// Never go below 1: with the baked scene the GPU fill cost at DPR 1 is tiny, so
// a slow frame there is CPU-bound and a blurrier image wouldn't help.
const MIN_DPR = 1

export function initialDpr(): number {
  if (typeof window === 'undefined') return 1
  const native = window.devicePixelRatio || 1
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency || 4
  const memory = nav.deviceMemory ?? 8
  const weak = cores <= 4 || memory <= 4
  const cap = weak ? 1 : 1.5
  return Math.min(native, cap)
}

interface AdaptiveDprProps {
  enabled: boolean
  isBusy: () => boolean
}

const WINDOW = 90 // frames per verdict
const SLOW_FRACTION = 0.5 // more than half the frames slower than budget -> step down

export function AdaptiveDpr({ enabled, isBusy }: AdaptiveDprProps) {
  const setDpr = useThree((s) => s.setDpr)
  const dpr = useThree((s) => s.viewport.dpr)
  const samples = useRef<number[]>([])
  const budget = useRef(1000 / 60)
  const cooldown = useRef(0)

  // Estimate the display refresh interval once (fast frames while idle).
  useEffect(() => {
    let raf = 0
    let last = 0
    const deltas: number[] = []
    const tick = (t: number) => {
      if (last) deltas.push(t - last)
      last = t
      if (deltas.length < 30) raf = requestAnimationFrame(tick)
      else {
        deltas.sort((a, b) => a - b)
        budget.current = Math.max(1000 / 144, Math.min(1000 / 30, deltas[Math.floor(deltas.length * 0.25)]))
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useFrame((_, delta) => {
    if (!enabled || document.hidden) return
    if (cooldown.current > 0) { cooldown.current--; return }
    if (isBusy()) { samples.current.length = 0; return }
    samples.current.push(delta * 1000)
    if (samples.current.length < WINDOW) return
    const slow = samples.current.filter((ms) => ms > budget.current * 1.35).length
    samples.current.length = 0
    if (slow / WINDOW > SLOW_FRACTION && dpr > MIN_DPR + 0.01) {
      setDpr(Math.max(MIN_DPR, Math.round((dpr - 0.25) * 100) / 100))
      cooldown.current = 60
    }
  })

  return null
}
