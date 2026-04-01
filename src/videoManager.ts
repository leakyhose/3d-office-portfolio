import { PROJECTS } from './config/projects'

interface VideoEntry {
  video: HTMLVideoElement
  ready: boolean
}

const videoMap = new Map<string, VideoEntry>()

function preloadVideos() {
  for (const project of PROJECTS) {
    if (videoMap.has(project.id)) continue
    const video = document.createElement('video')
    video.src = project.demoVideo
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'
    video.style.display = 'none'
    document.body.appendChild(video)
    const entry: VideoEntry = { video, ready: false }
    video.addEventListener('canplaythrough', () => { entry.ready = true }, { once: true })
    videoMap.set(project.id, entry)
  }
}

export function getVideo(projectId: string): HTMLVideoElement | null {
  return videoMap.get(projectId)?.video ?? null
}

// Preload on module import
preloadVideos()
