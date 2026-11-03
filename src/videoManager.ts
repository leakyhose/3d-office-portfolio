import { PROJECTS } from './config/projects'

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
    // Don't fetch anything yet — the videos total several MB and would
    // compete with the GLB/HDR downloads on the critical loading path.
    // warmVideos() flips them to full preload once the intro is done.
    video.preload = 'none'
    video.style.display = 'none'
    document.body.appendChild(video)
    const entry: VideoEntry = { video, ready: false }
    video.addEventListener('canplaythrough', () => { entry.ready = true }, { once: true })
    videoMap.set(project.id, entry)
  }
}

let warmed = false

/**
 * Start buffering the demo videos, one per idle period (each load() sets up a
 * media player: ~15 ms of main-thread work), and never while `busy()`.
 */
export function warmVideos(busy: () => boolean = () => false) {
  if (warmed) return
  warmed = true
  const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300))
  const queue = [...videoMap.values()]
  const next = () => {
    if (busy()) {
      ric(next, { timeout: 2000 })
      return
    }
    const entry = queue.shift()
    if (!entry) return
    entry.video.preload = 'auto'
    entry.video.load()
    ric(next, { timeout: 2000 })
  }
  ric(next, { timeout: 2000 })
}

export function getVideo(projectId: string): HTMLVideoElement | null {
  return videoMap.get(projectId)?.video ?? null
}

// Create elements on module import; actual downloads start via warmVideos()
createVideos()
