import { useEffect, useRef } from 'react'
import { drawCloudsScreen, drawBootScreen, drawVideoWindow } from './drawScreenTexture'
import { useScreenMesh } from './components/ScreenMeshContext'
import { getVideo } from './videoManager'
import { PROJECTS } from './config/projects'
import { isCameraAnimating } from './components/camera/bridge'
import type { ScreenPhase } from './types'

const BOOT_DURATION = 400

const CRT_SWITCH_DURATION = 180

function makeNoiseCanvas(w: number, h: number, grainSize: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')!
  const imgData = g.createImageData(w, h)
  const d = imgData.data
  for (let y = 0; y < h; y += grainSize) {
    for (let x = 0; x < w; x += grainSize) {
      if (Math.random() > 0.3) continue
      const brt = Math.floor(Math.random() * 255)
      for (let dy = 0; dy < grainSize && y + dy < h; dy++) {
        for (let dx = 0; dx < grainSize && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4
          d[i] = d[i + 1] = d[i + 2] = brt
          d[i + 3] = 255
        }
      }
    }
  }
  g.putImageData(imgData, 0, 0)
  return c
}

interface ComputerScreenContentProps {
  screenPhase?: ScreenPhase
  hoveredProject?: string | null
}

export default function ComputerScreenContent({ screenPhase = 'clouds', hoveredProject = null }: ComputerScreenContentProps) {
  const { screenCanvas, screenTexture, screenTexSize } = useScreenMesh()
  const prevPhaseRef = useRef(screenPhase)
  const switchAnimRef = useRef<number | null>(null)
  const videoRafRef = useRef<number | null>(null)
  const activeVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (screenPhase !== 'booting' || !screenCanvas || !screenTexture || !screenTexSize) return
    performance.mark('intro:boot-effect-mount')

    const { width: texWidth, height: texHeight } = screenTexSize
    const ctx = screenCanvas.getContext('2d')!
    const texture = screenTexture

    let cloudsReady = false
    const cloudsCanvas = drawCloudsScreen(texWidth, texHeight, () => {
      cloudsReady = true
    })

    const noiseW = 256
    const noiseH = Math.round(noiseW * (texHeight / texWidth))
    const noiseFrames = Array.from({ length: 2 }, () => makeNoiseCanvas(noiseW, noiseH, 2))

    const scanlineCanvas = document.createElement('canvas')
    scanlineCanvas.width = texWidth; scanlineCanvas.height = texHeight
    const slCtx = scanlineCanvas.getContext('2d')!
    slCtx.fillStyle = 'rgba(0, 0, 0, 0.12)'
    for (let sy = 0; sy < texHeight; sy += 2) slCtx.fillRect(0, sy, texWidth, 1)

    const glowH = 35
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = texWidth; glowCanvas.height = glowH * 2
    const glCtx = glowCanvas.getContext('2d')!
    const grad = glCtx.createLinearGradient(0, 0, 0, glowH * 2)
    grad.addColorStop(0, 'rgba(150, 180, 255, 0)')
    grad.addColorStop(0.4, 'rgba(150, 180, 255, 0.15)')
    grad.addColorStop(0.5, 'rgba(200, 220, 255, 0.3)')
    grad.addColorStop(0.6, 'rgba(150, 180, 255, 0.15)')
    grad.addColorStop(1, 'rgba(150, 180, 255, 0)')
    glCtx.fillStyle = grad
    glCtx.fillRect(0, 0, texWidth, glowH * 2)

    const startTime = performance.now()
    let rafId: number
    let lastDrawTime = 0

    function animate() {
      const now = performance.now()
      const elapsed = now - startTime
      const t = Math.min(elapsed / BOOT_DURATION, 1)

      if (now - lastDrawTime < 33 && t < 1) {
        rafId = requestAnimationFrame(animate)
        return
      }
      lastDrawTime = now

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, texWidth, texHeight)

      if (t < 0.15) {
        const warmT = t / 0.15
        const frameIdx = Math.floor(elapsed / 50) % 2
        ctx.imageSmoothingEnabled = false
        ctx.globalAlpha = warmT * 0.35
        ctx.drawImage(noiseFrames[frameIdx], 0, 0, texWidth, texHeight)
        ctx.globalAlpha = 1
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(scanlineCanvas, 0, 0)

      } else if (t < 0.35) {
        const lineT = (t - 0.15) / 0.20
        const lineHeight = Math.max(1, lineT * 4)
        const brightness = 0.4 + lineT * 0.6
        ctx.fillStyle = `rgba(200, 220, 255, ${brightness})`
        ctx.fillRect(0, texHeight / 2 - lineHeight / 2, texWidth, lineHeight)

        ctx.globalAlpha = 0.5 + lineT * 0.5
        ctx.drawImage(glowCanvas, 0, texHeight / 2 - glowH)
        ctx.globalAlpha = 1

        ctx.drawImage(scanlineCanvas, 0, 0)

      } else if (t < 0.80) {
        const expandT = (t - 0.35) / 0.45
        const eased = 1 - Math.pow(1 - expandT, 3)
        const visibleH = Math.max(1, Math.round(eased * texHeight))
        const y = Math.round((texHeight - visibleH) / 2)

        if (cloudsReady) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, y, texWidth, visibleH)
          ctx.clip()
          ctx.drawImage(cloudsCanvas, 0, 0, texWidth, texHeight)
          ctx.restore()
        } else {
          ctx.fillStyle = '#008080'
          ctx.fillRect(0, y, texWidth, visibleH)
        }

        const rollBandH = 12
        const rollAlpha = 0.3 * (1 - expandT)
        ctx.fillStyle = `rgba(200, 220, 255, ${rollAlpha})`
        ctx.fillRect(0, y - rollBandH / 2, texWidth, rollBandH)
        ctx.fillRect(0, y + visibleH - rollBandH / 2, texWidth, rollBandH)

        if (expandT < 0.4) {
          const lineAlpha = (1 - expandT / 0.4) * 0.8
          ctx.fillStyle = `rgba(200, 220, 255, ${lineAlpha})`
          ctx.fillRect(0, texHeight / 2 - 1, texWidth, 2)
        }

        if (expandT < 0.6) {
          const fringeAlpha = 0.2 * (1 - expandT / 0.6)
          ctx.fillStyle = `rgba(255, 80, 80, ${fringeAlpha})`
          ctx.fillRect(0, y - 2, texWidth, 1)
          ctx.fillStyle = `rgba(80, 80, 255, ${fringeAlpha})`
          ctx.fillRect(0, y + visibleH + 1, texWidth, 1)
        }

      } else {
        const settleT = (t - 0.80) / 0.20

        if (cloudsReady) {
          ctx.drawImage(cloudsCanvas, 0, 0, texWidth, texHeight)
        } else {
          ctx.fillStyle = '#008080'
          ctx.fillRect(0, 0, texWidth, texHeight)
        }

        const overShootAlpha = 0.08 * (1 - settleT)
        ctx.fillStyle = `rgba(200, 220, 255, ${overShootAlpha})`
        ctx.fillRect(0, 0, texWidth, texHeight)
      }

      texture.needsUpdate = true

      if (t < 1) {
        rafId = requestAnimationFrame(animate)
      } else {
        performance.mark('intro:boot-anim-done')
      }
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [screenPhase, screenCanvas, screenTexture, screenTexSize])

  useEffect(() => {
    if (!screenCanvas || !screenTexture || !screenTexSize) return
    if (screenPhase === 'off' || screenPhase === 'booting') {
      prevPhaseRef.current = screenPhase
      return
    }

    const prev = prevPhaseRef.current
    prevPhaseRef.current = screenPhase

    const { width: texWidth, height: texHeight } = screenTexSize
    const ctx = screenCanvas.getContext('2d')!
    const canvas = screenCanvas
    const texture = screenTexture

    if (switchAnimRef.current) {
      cancelAnimationFrame(switchAnimRef.current)
      switchAnimRef.current = null
    }

    const isSwitch = (prev === 'clouds' || prev === 'projects') &&
                     (screenPhase === 'clouds' || screenPhase === 'projects') &&
                     prev !== screenPhase

    if (!isSwitch) {
      const onLogoReady = () => {
        const ctx2 = canvas.getContext('2d')!
        ctx2.clearRect(0, 0, texWidth, texHeight)
        ctx2.drawImage(newCanvas, 0, 0)
        texture.needsUpdate = true
      }
      const newCanvas = screenPhase === 'projects'
        ? drawBootScreen(texWidth, texHeight, onLogoReady)
        : drawCloudsScreen(texWidth, texHeight, onLogoReady)
      ctx.clearRect(0, 0, texWidth, texHeight)
      ctx.drawImage(newCanvas, 0, 0)
      texture.needsUpdate = true
      return
    }

    let destReady = false
    const onDestReady = () => { destReady = true }
    const destCanvas = screenPhase === 'projects'
      ? drawBootScreen(texWidth, texHeight, onDestReady)
      : drawCloudsScreen(texWidth, texHeight, onDestReady)

    const snapshotCanvas = document.createElement('canvas')
    snapshotCanvas.width = texWidth
    snapshotCanvas.height = texHeight
    snapshotCanvas.getContext('2d')!.drawImage(canvas, 0, 0)

    const startTime = performance.now()
    let lastDrawTime = 0

    function animate() {
      const now = performance.now()
      const elapsed = now - startTime
      const t = Math.min(elapsed / CRT_SWITCH_DURATION, 1)

      if (now - lastDrawTime < 33 && t < 1) {
        switchAnimRef.current = requestAnimationFrame(animate)
        return
      }
      lastDrawTime = now

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, texWidth, texHeight)

      if (t < 0.35) {
        // Collapse old screen to center line
        const collapseT = t / 0.35
        const collapseEased = collapseT * collapseT
        const visibleH = Math.max(1, Math.round((1 - collapseEased) * texHeight))
        const y = Math.round((texHeight - visibleH) / 2)

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, y, texWidth, visibleH)
        ctx.clip()
        ctx.drawImage(snapshotCanvas, 0, 0)
        ctx.restore()

        const lineH = Math.max(1, 3 - collapseEased * 2)
        const brightness = 0.3 + collapseEased * 0.7
        ctx.fillStyle = `rgba(200, 220, 255, ${brightness})`
        ctx.fillRect(0, texHeight / 2 - lineH / 2, texWidth, lineH)

      } else if (t < 0.65) {
        // Expand new screen from center line
        const expandT = (t - 0.35) / 0.30
        const eased = 1 - Math.pow(1 - expandT, 3)
        const visibleH = Math.max(1, Math.round(eased * texHeight))
        const y = Math.round((texHeight - visibleH) / 2)

        if (destReady) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, y, texWidth, visibleH)
          ctx.clip()
          ctx.drawImage(destCanvas, 0, 0)
          ctx.restore()
        }

        const rollBandH = 10
        const rollAlpha = 0.25 * (1 - expandT)
        ctx.fillStyle = `rgba(200, 220, 255, ${rollAlpha})`
        ctx.fillRect(0, y - rollBandH / 2, texWidth, rollBandH)
        ctx.fillRect(0, y + visibleH - rollBandH / 2, texWidth, rollBandH)

        if (expandT < 0.3) {
          const lineAlpha = (1 - expandT / 0.3) * 0.7
          ctx.fillStyle = `rgba(200, 220, 255, ${lineAlpha})`
          ctx.fillRect(0, texHeight / 2 - 1, texWidth, 2)
        }

      } else {
        // Settle with subtle overshoot
        const settleT = (t - 0.65) / 0.35

        if (destReady) {
          ctx.drawImage(destCanvas, 0, 0)
        }

        const overShootAlpha = 0.05 * (1 - settleT)
        ctx.fillStyle = `rgba(200, 220, 255, ${overShootAlpha})`
        ctx.fillRect(0, 0, texWidth, texHeight)
      }

      texture.needsUpdate = true

      if (t < 1) {
        switchAnimRef.current = requestAnimationFrame(animate)
      } else {
        switchAnimRef.current = null
        ctx.clearRect(0, 0, texWidth, texHeight)
        if (destReady) {
          ctx.drawImage(destCanvas, 0, 0)
        }
        texture.needsUpdate = true
      }
    }

    switchAnimRef.current = requestAnimationFrame(animate)

    return () => {
      if (switchAnimRef.current) {
        cancelAnimationFrame(switchAnimRef.current)
        switchAnimRef.current = null
      }
    }
  }, [screenPhase, screenCanvas, screenTexture, screenTexSize])

  // Video hover loop
  useEffect(() => {
    if (!screenCanvas || !screenTexture || !screenTexSize || !hoveredProject) return

    const { width: texWidth, height: texHeight } = screenTexSize
    const ctx = screenCanvas.getContext('2d')!
    const texture = screenTexture

    // Clean up previous video loop
    if (videoRafRef.current) {
      cancelAnimationFrame(videoRafRef.current)
      videoRafRef.current = null
    }
    if (activeVideoRef.current) {
      activeVideoRef.current.pause()
      activeVideoRef.current = null
    }

    // Start video playback
    const video = getVideo(hoveredProject)
    if (!video) return

    activeVideoRef.current = video
    video.currentTime = 0
    video.play().catch(() => {})

    const project = PROJECTS.find(p => p.id === hoveredProject)
    const title = project ? `${project.name}.exe` : 'Video'

    let lastDrawTime = 0

    function drawFrame() {
      const now = performance.now()
      // Wait for any CRT switch animation to finish
      if (switchAnimRef.current) {
        videoRafRef.current = requestAnimationFrame(drawFrame)
        return
      }
      // Skip the texImage2D upload while the camera is lerping — keeps the
      // R3F frame budget free for the navigation animation. Loop resumes
      // immediately once the camera settles.
      if (isCameraAnimating()) {
        videoRafRef.current = requestAnimationFrame(drawFrame)
        return
      }
      if (now - lastDrawTime >= 33) {
        lastDrawTime = now
        drawVideoWindow(ctx, texWidth, texHeight, video!, title)
        texture.needsUpdate = true
      }
      videoRafRef.current = requestAnimationFrame(drawFrame)
    }

    videoRafRef.current = requestAnimationFrame(drawFrame)

    return () => {
      if (videoRafRef.current) {
        cancelAnimationFrame(videoRafRef.current)
        videoRafRef.current = null
      }
      if (activeVideoRef.current) {
        activeVideoRef.current.pause()
        activeVideoRef.current = null
      }
    }
  }, [hoveredProject, screenPhase, screenCanvas, screenTexture, screenTexSize])

  return null
}
