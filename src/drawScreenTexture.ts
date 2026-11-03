export function drawBlankScreen(width = 1024, height = 768): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  return canvas
}

/*
 * The screens' images are requested on first use, not when this module loads
 * (with the 3D chunk): the clouds when the scene mounts, i.e. once the GLB and
 * lightmaps are in, so they never share bandwidth with what gates the first 3D
 * frame (the monitor is black until the boot, ~0.5 s after it); the desktop's
 * once the screen has booted.
 */

/** null if it failed to load (the screen is drawn without it). */
type Picture = ImageBitmap | HTMLImageElement | null

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const img = new Image()
  return new Promise((resolve) => {
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Fetch + createImageBitmap: decoded off the main thread. Drawn from an <img>,
 * the 640x480 clouds and 1280x825 logo were decoded synchronously by the
 * clouds screen's pixelate pass (~15 ms of it at 4x CPU throttle).
 */
async function loadBitmap(src: string): Promise<Picture> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    // arrayBuffer, not blob(): see loadTexture() in scene/office.ts
    const blob = new Blob([await res.arrayBuffer()], { type: res.headers.get('content-type') ?? '' })
    return await createImageBitmap(blob)
  } catch {
    // no createImageBitmap, or it can't decode the format
    const img = await loadImage(src)
    await img?.decode().catch(() => {})
    return img
  }
}

let cloudsAssets: Promise<[clouds: Picture, logo: Picture]> | null = null
const loadCloudsAssets = () =>
  (cloudsAssets ??= Promise.all([loadBitmap('/clouds_background.webp'), loadBitmap('/windows_95_logo_and_text.webp')]))

// Desktop pictures (tiny .ico/.svg files, kept as <img> since createImageBitmap
// can't decode an SVG blob). Set once loaded; drawn only if they loaded.
let logoImg: HTMLImageElement | null = null

interface DesktopIcon {
  img: HTMLImageElement | null
  label: string
  file: string
}

const desktopIcons: DesktopIcon[] = [
  { label: 'My Computer', img: null, file: 'My Computer.ico' },
  { label: 'Network\nNeighborhood', img: null, file: 'Network Neighborhood.ico' },
  { label: 'Documents', img: null, file: 'Documents Folder.ico' },
  { label: 'Recycle Bin', img: null, file: 'Empty Recycle Bin.ico' },
]

let desktopAssets: Promise<void> | null = null
function loadDesktopAssets(): Promise<void> {
  desktopAssets ??= Promise.all([
    loadImage('/windows_logo.svg').then((img) => { logoImg = img }),
    ...desktopIcons.map((icon) => loadImage(`/windows-95-desktop/${icon.file}`).then((img) => { icon.img = img })),
  ]).then(() => {
    // the video windows' background is the desktop: redraw it with the icons
    _bgCache = null
    videoChromes.clear()
  })
  return desktopAssets
}

function drawRaised(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg = '#C0C0C0') {
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y, w, 2)
  ctx.fillRect(x, y, 2, h)
  ctx.fillStyle = '#808080'
  ctx.fillRect(x, y + h - 2, w, 2)
  ctx.fillRect(x + w - 2, y, 2, h)
}

function drawSunken(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, _bg = '#C0C0C0') {
  ctx.fillStyle = _bg
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#808080'
  ctx.fillRect(x, y, w, 2)
  ctx.fillRect(x, y, 2, h)
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y + h - 2, w, 2)
  ctx.fillRect(x + w - 2, y, 2, h)
}

function clockLabel(): string {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes().toString().padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`
}

function drawTaskbar(ctx: CanvasRenderingContext2D, width: number, height: number, withStartLogo = false) {
  const barH = Math.round(height * 0.08)
  const barY = height - barH
  drawRaised(ctx, 0, barY, width, barH)

  const pad = Math.round(barH * 0.12)
  const innerH = barH - pad * 2

  const startW = Math.round(barH * 2.4)
  drawRaised(ctx, pad, barY + pad, startW, innerH)

  const fontSize = Math.round(innerH * 0.7)
  ctx.font = `bold ${fontSize}px "VT323", monospace`
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const textX = pad + Math.round(innerH * 1.1)
  ctx.fillText('Start', textX, barY + barH / 2)

  const trayW = Math.round(barH * 2.8)
  const trayX = width - pad - trayW
  drawSunken(ctx, trayX, barY + pad, trayW, innerH)

  const clockStr = clockLabel()
  const clockFontSize = Math.round(innerH * 0.6)
  ctx.font = `${clockFontSize}px "VT323", monospace`
  ctx.fillStyle = '#000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(clockStr, trayX + trayW / 2, barY + barH / 2)

  if (withStartLogo && logoImg) {
    const btnLogoSize = Math.round(innerH * 0.7)
    const btnLogoX = pad + Math.round((innerH - btnLogoSize) / 2) + 4
    const btnLogoY = barY + pad + Math.round((innerH - btnLogoSize) / 2)
    ctx.drawImage(logoImg, btnLogoX, btnLogoY, btnLogoSize, btnLogoSize)
  }
}

function drawDesktopIcons(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const iconSize = 56
  const leftMargin = 48
  const topMargin = 40
  const verticalSpacing = 110
  const labelFontSize = 20
  const labelGap = 6

  void width; void height

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = `${labelFontSize}px "VT323", monospace`

  for (let i = 0; i < desktopIcons.length; i++) {
    const icon = desktopIcons[i]
    const centerX = leftMargin + iconSize / 2
    const iconY = topMargin + i * verticalSpacing

    if (icon.img) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(icon.img, centerX - iconSize / 2, iconY, iconSize, iconSize)
      ctx.imageSmoothingEnabled = true
    }

    const labelY = iconY + iconSize + labelGap
    const lines = icon.label.split('\n')

    for (let li = 0; li < lines.length; li++) {
      const lineY = labelY + li * (labelFontSize + 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillText(lines[li], centerX + 1, lineY + 1)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(lines[li], centerX, lineY)
    }
  }

  ctx.restore()
}

// Cached temp canvases to avoid allocating on every call
let _pixelateTiny: HTMLCanvasElement | null = null
let _crtTmp: HTMLCanvasElement | null = null
let _scanlineCache: { canvas: HTMLCanvasElement; w: number; h: number } | null = null
let _vignetteCache: { canvas: HTMLCanvasElement; w: number; h: number } | null = null

function getPixelateTiny(w: number, h: number) {
  if (!_pixelateTiny) _pixelateTiny = document.createElement('canvas')
  _pixelateTiny.width = w
  _pixelateTiny.height = h
  return _pixelateTiny
}

function getCrtTmp(w: number, h: number) {
  if (!_crtTmp) _crtTmp = document.createElement('canvas')
  if (_crtTmp.width !== w || _crtTmp.height !== h) {
    _crtTmp.width = w
    _crtTmp.height = h
  }
  return _crtTmp
}

function getScanlineOverlay(w: number, h: number) {
  if (_scanlineCache && _scanlineCache.w === w && _scanlineCache.h === h) return _scanlineCache.canvas
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
  for (let y = 0; y < h; y += 2) {
    ctx.fillRect(0, y, w, 1)
  }
  _scanlineCache = { canvas, w, h }
  return canvas
}

function getVignetteOverlay(w: number, h: number) {
  if (_vignetteCache && _vignetteCache.w === w && _vignetteCache.h === h) return _vignetteCache.canvas
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const cx = w / 2
  const cy = h / 2
  const outerR = Math.sqrt(cx * cx + cy * cy)
  const grad = ctx.createRadialGradient(cx, cy, outerR * 0.35, cx, cy, outerR)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  _vignetteCache = { canvas, w, h }
  return canvas
}

function pixelateCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, resolution = 384) {
  const lowW = resolution
  const lowH = Math.round(lowW * (height / width))

  const tiny = getPixelateTiny(lowW, lowH)
  const tctx = tiny.getContext('2d')!
  tctx.drawImage(ctx.canvas, 0, 0, lowW, lowH)

  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tiny, 0, 0, width, height)
  ctx.imageSmoothingEnabled = true
}

function applyCRTEffects(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const borderW = Math.round(width * 0.03)
  const borderH = Math.round(height * 0.03)

  // Use cached tmp canvas instead of getImageData/putImageData
  const tmp = getCrtTmp(width, height)
  tmp.getContext('2d')!.drawImage(ctx.canvas, 0, 0)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(tmp, borderW, borderH, width - borderW * 2, height - borderH * 2)

  // Pre-rendered scanline overlay instead of per-row fillRect loop
  ctx.drawImage(getScanlineOverlay(width, height), 0, 0)

  // Pre-rendered vignette overlay instead of creating gradient each time
  ctx.drawImage(getVignetteOverlay(width, height), 0, 0)
}

function paintClouds(ctx: CanvasRenderingContext2D, width: number, height: number, [clouds, logo]: [Picture, Picture]) {
  if (clouds) {
    ctx.drawImage(clouds, 0, 0, width, height)
  }

  if (logo) {
    const logoAspect = logo.width / logo.height
    const logoH = Math.round(height * 0.55)
    const logoW = Math.round(logoH * logoAspect)
    const logoX = (width - logoW) / 2
    const logoY = (height - logoH) / 2
    ctx.drawImage(logo, logoX, logoY, logoW, logoH)
  }

  const labelSize = Math.round(height * 0.035)
  ctx.font = `${labelSize}px "VT323", monospace`
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 1
  ctx.fillText('ysu.dev', width - Math.round(width * 0.03), Math.round(height * 0.03))
  ctx.shadowColor = 'transparent'
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0

  pixelateCanvas(ctx, width, height)
  applyCRTEffects(ctx, width, height)
}

function paintDesktop(ctx: CanvasRenderingContext2D, width: number, height: number) {
  drawTaskbar(ctx, width, height, true)
  drawDesktopIcons(ctx, width, height)
  pixelateCanvas(ctx, width, height, 820)
  applyCRTEffects(ctx, width, height)
}

export type ScreenKind = 'clouds' | 'desktop'

export interface ScreenImage {
  canvas: HTMLCanvasElement
  /** fully drawn (its images had loaded) */
  ready: boolean
  whenReady: Promise<HTMLCanvasElement>
  /** taskbar clock it shows (desktop) */
  clock: string
  /**
   * Finish it now if it's only waiting for idle time (its images are in).
   * Returns `ready`.
   */
  flush(): boolean
}

const ric = (cb: () => void) =>
  window.requestIdleCallback ? window.requestIdleCallback(cb, { timeout: 300 }) : window.setTimeout(cb, 50)

/*
 * The finished clouds / desktop screens, each drawn once and reused by every
 * switch. The pixelate + CRT pass is ~10 ms of canvas work at 4x CPU
 * throttle, so once a screen's images are in it's drawn in idle time, not in
 * whatever task they arrived in (for the clouds: the scene's mount, right
 * before the first 3D frame); flush() draws it on the spot when it's needed
 * now. The desktop is redrawn in the background when its taskbar clock is out
 * of date (refreshScreen).
 */
const screens = new Map<string, ScreenImage>()

function drawScreen(kind: ScreenKind, width: number, height: number): ScreenImage {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  // stand-in until it's drawn
  ctx.fillStyle = '#008080'
  ctx.fillRect(0, 0, width, height)
  if (kind === 'desktop') drawTaskbar(ctx, width, height)

  let resolve!: (c: HTMLCanvasElement) => void
  let paint: (() => void) | null = null
  const image: ScreenImage = {
    canvas,
    ready: false,
    whenReady: new Promise<HTMLCanvasElement>((r) => { resolve = r }),
    clock: kind === 'desktop' ? clockLabel() : '',
    flush() {
      if (paint) {
        const p = paint
        paint = null
        p()
        image.ready = true
        resolve(canvas)
      }
      return image.ready
    },
  }
  if (kind === 'desktop') {
    loadDesktopAssets().then(() => {
      paint = () => paintDesktop(ctx, width, height)
      ric(image.flush)
    })
  } else {
    loadCloudsAssets().then((pictures) => {
      paint = () => paintClouds(ctx, width, height, pictures)
      ric(image.flush)
    })
  }
  return image
}

export function getScreen(kind: ScreenKind, width: number, height: number): ScreenImage {
  const key = `${kind}|${width}x${height}`
  let image = screens.get(key)
  if (!image) {
    image = drawScreen(kind, width, height)
    screens.set(key, image)
  }
  return image
}

export function isScreenStale(image: ScreenImage): boolean {
  return image.clock !== '' && image.clock !== clockLabel()
}

/**
 * Redraw a screen (call it in idle time: it's drawn as soon as its images are
 * in); the cached one is replaced once the new one is finished.
 */
export function refreshScreen(kind: ScreenKind, width: number, height: number): Promise<HTMLCanvasElement> {
  const key = `${kind}|${width}x${height}`
  const image = drawScreen(kind, width, height)
  const assets = kind === 'desktop' ? loadDesktopAssets() : loadCloudsAssets()
  // drawScreen's own then() (which sets up the paint) runs first
  assets.then(() => image.flush())
  return image.whenReady.then((canvas) => {
    screens.set(key, image)
    return canvas
  })
}

// Pre-rendered boot screen background cache (drawn once, reused every video frame)
let _bgCache: { canvas: HTMLCanvasElement; w: number; h: number } | null = null

function getBootBg(width: number, height: number): HTMLCanvasElement {
  if (_bgCache && _bgCache.w === width && _bgCache.h === height) return _bgCache.canvas

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Draw the full desktop: teal bg, taskbar, icons — same as drawDesktopScreen but synchronous snapshot
  ctx.fillStyle = '#008080'
  ctx.fillRect(0, 0, width, height)
  drawTaskbar(ctx, width, height, Boolean(logoImg))
  if (desktopIcons.every(ic => ic.img)) {
    drawDesktopIcons(ctx, width, height)
  }
  pixelateCanvas(ctx, width, height, 820)
  // Apply only the border + scanlines, NOT the vignette — vignette goes on top of everything at the end
  const borderW = Math.round(width * 0.03)
  const borderH = Math.round(height * 0.03)
  // drawImage copy, not getImageData: a readback would pin the canvas to the CPU
  const tmp = getCrtTmp(width, height)
  tmp.getContext('2d')!.drawImage(canvas, 0, 0)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(tmp, borderW, borderH, width - borderW * 2, height - borderH * 2)

  _bgCache = { canvas, w: width, h: height }
  return canvas
}

// Cached static composite for the video window: boot background + window
// chrome + scanlines + vignette, with the video content rectangle left
// transparent. Drawn once per (w, h, title, videoAspect) and blitted over the
// raw video frame each draw — collapses ~12 ops + fillText + strokes into a
// single drawImage per frame. One per project, so hovering from one project to
// another never rebuilds it, and prepareVideoWindow() builds them ahead of time.
interface VideoChromeCache {
  composite: HTMLCanvasElement
  contentX: number
  contentY: number
  contentW: number
  contentH: number
}
const videoChromes = new Map<string, VideoChromeCache>()

function buildVideoChrome(
  width: number,
  height: number,
  windowTitle: string,
  videoAspect: number
): VideoChromeCache {
  const borderW = Math.round(width * 0.03)
  const borderH = Math.round(height * 0.03)
  const taskbarH = Math.round(height * 0.08)
  const margin = Math.round(width * 0.02)

  const areaX = borderW + margin
  const areaY = borderH + margin
  const areaW = width - borderW * 2 - margin * 2
  const areaH = height - borderH * 2 - taskbarH - margin * 2

  const titleBarH = Math.max(18, Math.round(areaH * 0.055))
  const chrome = titleBarH + 14

  let winW: number, winH: number
  if (videoAspect > 0) {
    const contentW = areaW - 8
    const contentH = contentW / videoAspect
    if (contentH + chrome <= areaH) {
      winW = areaW
      winH = Math.round(contentH + chrome)
    } else {
      const fitContentH = areaH - chrome
      const fitContentW = fitContentH * videoAspect
      winW = Math.round(fitContentW + 8)
      winH = areaH
    }
  } else {
    winW = areaW
    winH = areaH
  }

  const winX = Math.round(areaX + (areaW - winW) / 2)
  const winY = Math.round(areaY + (areaH - winH) / 2)

  const contentPad = 4
  const tbPad = 3
  const contentX = winX + contentPad
  const contentY = winY + tbPad + titleBarH + contentPad
  const contentW = winW - contentPad * 2
  const contentH = winH - tbPad - titleBarH - contentPad * 2 - 4

  const composite = document.createElement('canvas')
  composite.width = width
  composite.height = height
  const ctx = composite.getContext('2d')!

  // Boot background (cached itself)
  ctx.drawImage(getBootBg(width, height), 0, 0)

  // Window frame (raised)
  drawRaised(ctx, winX, winY, winW, winH)

  // Title bar
  ctx.fillStyle = '#000080'
  ctx.fillRect(winX + tbPad, winY + tbPad, winW - tbPad * 2, titleBarH)

  const titleFontSize = Math.round(titleBarH * 0.75)
  ctx.font = `bold ${titleFontSize}px "VT323", monospace`
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(windowTitle, winX + tbPad + 8, winY + tbPad + titleBarH / 2)

  // Close button
  const closeBtnSize = titleBarH - 6
  const closeBtnX = winX + winW - tbPad - closeBtnSize - 4
  const closeBtnY = winY + tbPad + 3
  drawRaised(ctx, closeBtnX, closeBtnY, closeBtnSize, closeBtnSize)
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 2
  ctx.beginPath()
  const xPad = 4
  ctx.moveTo(closeBtnX + xPad, closeBtnY + xPad)
  ctx.lineTo(closeBtnX + closeBtnSize - xPad, closeBtnY + closeBtnSize - xPad)
  ctx.moveTo(closeBtnX + closeBtnSize - xPad, closeBtnY + xPad)
  ctx.lineTo(closeBtnX + xPad, closeBtnY + closeBtnSize - xPad)
  ctx.stroke()

  // Sunken content frame
  drawSunken(ctx, contentX, contentY, contentW, contentH, '#000')

  // Punch a transparent hole where the video pixels go, so when the composite
  // is blitted over the video the video shows through (with scanlines/vignette
  // landing on top via the next two draws).
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  ctx.fillRect(contentX + 2, contentY + 2, contentW - 4, contentH - 4)
  ctx.restore()

  // Scanlines + vignette layered on top so they dim the video too.
  ctx.globalAlpha = 0.75
  ctx.drawImage(getScanlineOverlay(width, height), 0, 0)
  ctx.globalAlpha = 1
  ctx.drawImage(getVignetteOverlay(width, height), 0, 0)

  return {
    composite,
    contentX,
    contentY,
    contentW,
    contentH,
  }
}

function videoChrome(width: number, height: number, windowTitle: string, videoAspect: number) {
  // Without the video's size (not loaded yet) the window is a stopgap: not kept.
  if (!videoAspect) return buildVideoChrome(width, height, windowTitle, videoAspect)
  const key = `${width}x${height}|${windowTitle}|${videoAspect.toFixed(4)}`
  let cache = videoChromes.get(key)
  if (!cache) {
    cache = buildVideoChrome(width, height, windowTitle, videoAspect)
    videoChromes.set(key, cache)
  }
  return cache
}

/** The video's aspect ratio: its own once its metadata is in, else `expected`. */
function aspectOf(video: HTMLVideoElement, expected: number) {
  return video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : expected
}

/**
 * Build a video window's chrome ahead of its first frame (the first build
 * pixelates the desktop background and rasterizes the title: ~10 ms on a fast
 * machine). `expectedAspect`: the video's, if its metadata isn't loaded yet.
 */
export function prepareVideoWindow(width: number, height: number, video: HTMLVideoElement, windowTitle: string, expectedAspect = 0) {
  const aspect = aspectOf(video, expectedAspect)
  if (aspect) videoChrome(width, height, windowTitle, aspect)
}

/**
 * The video in its window on the desktop. Before the video has a frame to
 * show (not loaded yet: it starts loading when played), the window is drawn
 * with an empty (black) picture, at `expectedAspect` if the video's own size
 * isn't known yet either.
 */
export function drawVideoWindow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  video: HTMLVideoElement,
  windowTitle: string,
  expectedAspect = 0
) {
  const videoAspect = aspectOf(video, expectedAspect)
  const cache = videoChrome(width, height, windowTitle, videoAspect)

  // Black backdrop for the area outside the chrome (composite has transparent
  // pixels there too since the boot background fully covers but we still want
  // a clean slate).
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Video first, in the same content rect the composite punched out (draws
  // nothing until the video has a frame).
  if (videoAspect > 0) {
    ctx.drawImage(
      video,
      cache.contentX + 2,
      cache.contentY + 2,
      cache.contentW - 4,
      cache.contentH - 4
    )
  }

  // Single blit of the entire chrome (background + window frame + scanlines + vignette).
  ctx.drawImage(cache.composite, 0, 0)
}
