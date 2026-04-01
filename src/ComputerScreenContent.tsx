import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { drawBlankScreen, drawCloudsScreen, drawBootScreen, drawVideoWindow } from './drawScreenTexture'
import { useScreenMesh } from './components/ScreenMeshContext'
import { getVideo } from './videoManager'
import { PROJECTS } from './config/projects'
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
  const { screenMesh, screenSource } = useScreenMesh()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const prevPhaseRef = useRef(screenPhase)
  const switchAnimRef = useRef<number | null>(null)
  const videoRafRef = useRef<number | null>(null)
  const activeVideoRef = useRef<HTMLVideoElement | null>(null)

  const screenData = useMemo(() => {
    const mesh = screenMesh
    if (!mesh) {
      return null
    }

    mesh.updateWorldMatrix(true, false)

    const box = new THREE.Box3().setFromObject(mesh)
    const size = new THREE.Vector3()
    box.getSize(size)

    const geo = mesh.geometry as THREE.BufferGeometry
    if (!geo.attributes.uv) {
      console.warn('ComputerScreenContent: no UVs found, generating planar projection')
      const pos = geo.attributes.position
      const uvs = new Float32Array(pos.count * 2)
      const localBox = new THREE.Box3()
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
        localBox.expandByPoint(v)
      }
      const localSize = new THREE.Vector3()
      localBox.getSize(localSize)
      const localMin = localBox.min
      for (let i = 0; i < pos.count; i++) {
        uvs[i * 2] = (pos.getX(i) - localMin.x) / (localSize.x || 1)
        uvs[i * 2 + 1] = (pos.getY(i) - localMin.y) / (localSize.y || 1)
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    } else {
      const uvAttr = geo.attributes.uv
      const uvs = uvAttr.array as Float32Array
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
      for (let i = 0; i < uvs.length; i += 2) {
        minU = Math.min(minU, uvs[i])
        maxU = Math.max(maxU, uvs[i])
        minV = Math.min(minV, uvs[i + 1])
        maxV = Math.max(maxV, uvs[i + 1])
      }
      const rangeU = maxU - minU
      const rangeV = maxV - minV
      if (minU > 0.05 || maxU < 0.95 || minV > 0.05 || maxV < 0.95) {
        for (let i = 0; i < uvs.length; i += 2) {
          uvs[i] = (uvs[i] - minU) / (rangeU || 1)
          uvs[i + 1] = (uvs[i + 1] - minV) / (rangeV || 1)
        }
        uvAttr.needsUpdate = true
      }
    }

    const texWidth = 1024
    const texHeight = Math.round(texWidth * (size.y / size.x))
    const canvas = drawBlankScreen(texWidth, texHeight)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true

    canvasRef.current = canvas

    return { mesh, texture, texWidth, texHeight, originalMaterial: mesh.material }
  }, [screenMesh, screenSource])

  useEffect(() => {
    if (screenPhase !== 'booting' || !screenData) return

    const { texWidth, texHeight, texture } = screenData
    const ctx = canvasRef.current!.getContext('2d')!

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
      }
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [screenPhase, screenData])

  useEffect(() => {
    if (!screenData) return
    if (screenPhase === 'off' || screenPhase === 'booting') {
      prevPhaseRef.current = screenPhase
      return
    }

    const prev = prevPhaseRef.current
    prevPhaseRef.current = screenPhase

    const { texWidth, texHeight, texture } = screenData
    const ctx = canvasRef.current!.getContext('2d')!

    if (switchAnimRef.current) {
      cancelAnimationFrame(switchAnimRef.current)
      switchAnimRef.current = null
    }

    const isSwitch = (prev === 'clouds' || prev === 'projects') &&
                     (screenPhase === 'clouds' || screenPhase === 'projects') &&
                     prev !== screenPhase

    if (!isSwitch) {
      const onLogoReady = () => {
        const ctx2 = canvasRef.current!.getContext('2d')!
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
    snapshotCanvas.getContext('2d')!.drawImage(canvasRef.current!, 0, 0)

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
  }, [screenPhase, screenData])

  // Video hover loop
  useEffect(() => {
    if (!screenData || !hoveredProject) return

    const { texWidth, texHeight, texture } = screenData
    const ctx = canvasRef.current!.getContext('2d')!

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
  }, [hoveredProject, screenPhase, screenData])

  useEffect(() => {
    if (!screenData) return
    const { mesh, texture, originalMaterial } = screenData

    mesh.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#000000'),
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: texture,
      emissiveIntensity: 0.95,
      roughness: 1.0,
      metalness: 0.0,
      toneMapped: true,
      envMapIntensity: 0,
    })
    mesh.visible = true

    return () => {
      ;(mesh.material as THREE.Material).dispose()
      texture.dispose()
      mesh.material = originalMaterial
    }
  }, [screenData])

  return null
}
