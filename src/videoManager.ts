import { PROJECTS } from './config/projects'
import { isCameraAnimating } from './components/camera/bridge'

interface VideoEntry {
  video: HTMLVideoElement
  ready: boolean
}

const videoMap = new Map<string, VideoEntry>()

function createVideos() {
  for (const project of PROJECTS) {
    if (videoMap.has(project.id)) continue
    const video = document.createElement('video')
    video.src = project.demoVideo
    video.muted = true
    video.loop = true
    video.playsInline = true
    // Don't fetch anything yet — the videos total ~1.7 MB and would
    // compete with the GLB/lightmap downloads on the critical loading path.
    // warmVideos() flips them to full preload once the intro is done (on a
    // fast connection); otherwise a video loads when it's first played.
    video.preload = 'none'
    video.style.display = 'none'
    document.body.appendChild(video)
    const entry: VideoEntry = { video, ready: false }
    video.addEventListener('canplaythrough', () => { entry.ready = true }, { once: true })
    videoMap.set(project.id, entry)
  }
}

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

/**
 * Whether to download the demos (~1.7 MB) ahead of a hover, which is what
 * makes hover playback instant. Not with Data Saver on or on a 2g/3g-class
 * connection (Chrome's "Slow 4G" preset rates as 3g): there a video only
 * loads when its project is hovered.
 */
export function canPrefetchVideos(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
  if (!connection) return true
  if (connection.saveData) return false
  return !['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? '')
}

const ric = (cb: () => void) =>
  window.requestIdleCallback ? window.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 300)

const PRELOAD_RANK: Record<string, number> = { none: 0, metadata: 1, auto: 2 }

/**
 * Raise each video's preload to `level`, one per idle period (each load()
 * sets up a media player: ~15 ms of main-thread work), never while `busy()`.
 */
function preloadAll(level: 'metadata' | 'auto', busy: () => boolean) {
  const queue = [...videoMap.values()]
  const next = () => {
    if (busy()) {
      ric(next)
      return
    }
    const entry = queue.shift()
    if (!entry) return
    if (PRELOAD_RANK[entry.video.preload] < PRELOAD_RANK[level]) {
      entry.video.preload = level
      entry.video.load()
    }
    ric(next)
  }
  ric(next)
}

let sceneDone = false
let warmed = false

/**
 * Start buffering the demo videos, if the connection allows it (see
 * canPrefetchVideos). Call once the 3D scene's first frame is done and the
 * intro is over.
 */
export function warmVideos(busy: () => boolean = () => false) {
  sceneDone = true
  if (warmed || !canPrefetchVideos()) return
  warmed = true
  preloadAll('auto', busy)
}

/*
 * Where the demos aren't prefetched (but Data Saver is off), pointing at or
 * focusing a link to Projects (once the scene is up) fetches just enough of
 * each video for its first frame, so hovering a project there shows a
 * picture sooner.
 */
function onProjectsIntent(e: Event) {
  if (!sceneDone || warmed || !(e.target instanceof Element) || !e.target.closest('a[href="#projects"]')) return
  document.removeEventListener('pointerover', onProjectsIntent)
  document.removeEventListener('focusin', onProjectsIntent)
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
  if (!connection?.saveData) preloadAll('metadata', isCameraAnimating)
}

export function getVideo(projectId: string): HTMLVideoElement | null {
  return videoMap.get(projectId)?.video ?? null
}

// Create elements on module import; actual downloads start via warmVideos()
createVideos()
document.addEventListener('pointerover', onProjectsIntent, { passive: true })
document.addEventListener('focusin', onProjectsIntent)
