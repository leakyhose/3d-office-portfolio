export function drawBlankScreen(width = 1024, height = 768): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  return canvas
}

// Preload assets
const logoImg = new Image()
const logoReady = new Promise<void>(resolve => {
  logoImg.onload = () => resolve()
  logoImg.onerror = () => resolve()
})
logoImg.src = '/windows_logo.svg'

const win95LogoImg = new Image()
const win95LogoReady = new Promise<void>(resolve => {
  win95LogoImg.onload = () => resolve()
  win95LogoImg.onerror = () => resolve()
})
win95LogoImg.src = '/windows_95_logo_and_text.png'

const cloudsImg = new Image()
const cloudsReady = new Promise<void>(resolve => {
  cloudsImg.onload = () => resolve()
  cloudsImg.onerror = () => resolve()
})
cloudsImg.src = '/clouds_background.png'

interface DesktopIcon {
  img: HTMLImageElement
  ready: Promise<void>
  label: string
}

const desktopIcons: DesktopIcon[] = [
  { label: 'My Computer', img: new Image(), ready: null! },
  { label: 'Network\nNeighborhood', img: new Image(), ready: null! },
  { label: 'Documents', img: new Image(), ready: null! },
  { label: 'Recycle Bin', img: new Image(), ready: null! },
]

const iconFiles = [
  'My Computer.ico',
  'Network Neighborhood.ico',
  'Documents Folder.ico',
  'Empty Recycle Bin.ico',
]

for (let i = 0; i < desktopIcons.length; i++) {
  const icon = desktopIcons[i]
  icon.ready = new Promise<void>(resolve => {
    icon.img.onload = () => resolve()
    icon.img.onerror = () => resolve()
  })
  icon.img.src = `/windows-95-desktop/${iconFiles[i]}`
}

const allIconsReady = Promise.all(desktopIcons.map(ic => ic.ready))

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

  const now = new Date()
  let h = now.getHours()
  const m = now.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  const clockStr = `${h}:${m} ${ampm}`
  const clockFontSize = Math.round(innerH * 0.6)
  ctx.font = `${clockFontSize}px "VT323", monospace`
  ctx.fillStyle = '#000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(clockStr, trayX + trayW / 2, barY + barH / 2)

  if (withStartLogo && logoImg.naturalWidth) {
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

    if (icon.img.naturalWidth) {
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

export function drawCloudsScreen(width = 1024, height = 768, onUpdate?: () => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#008080'
  ctx.fillRect(0, 0, width, height)

  Promise.all([cloudsReady, win95LogoReady]).then(() => {
    if (cloudsImg.naturalWidth) {
      ctx.drawImage(cloudsImg, 0, 0, width, height)
    }

    if (win95LogoImg.naturalWidth) {
      const logoAspect = win95LogoImg.naturalWidth / win95LogoImg.naturalHeight
      const logoH = Math.round(height * 0.55)
      const logoW = Math.round(logoH * logoAspect)
      const logoX = (width - logoW) / 2
      const logoY = (height - logoH) / 2
      ctx.drawImage(win95LogoImg, logoX, logoY, logoW, logoH)
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
    onUpdate?.()
  })

  return canvas
}

export function drawBootScreen(width = 1024, height = 768, onUpdate?: () => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#008080'
  ctx.fillRect(0, 0, width, height)

  drawTaskbar(ctx, width, height)

  Promise.all([logoReady, allIconsReady]).then(() => {
    drawTaskbar(ctx, width, height, true)
    drawDesktopIcons(ctx, width, height)
    pixelateCanvas(ctx, width, height, 820)
    applyCRTEffects(ctx, width, height)
    onUpdate?.()
  })

  return canvas
}

export function drawTerminalScreen(width = 1024, height = 768, onUpdate?: () => void) {
  const canvas = drawBootScreen(width, height, onUpdate)
  return { canvas }
}

// Pre-rendered boot screen background cache (drawn once, reused every video frame)
let _bgCache: { canvas: HTMLCanvasElement; w: number; h: number } | null = null

function getBootBg(width: number, height: number): HTMLCanvasElement {
  if (_bgCache && _bgCache.w === width && _bgCache.h === height) return _bgCache.canvas

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Draw the full desktop: teal bg, taskbar, icons — same as drawBootScreen but synchronous snapshot
  ctx.fillStyle = '#008080'
  ctx.fillRect(0, 0, width, height)
  drawTaskbar(ctx, width, height, logoImg.naturalWidth ? true : false)
  if (desktopIcons.every(ic => ic.img.naturalWidth)) {
    drawDesktopIcons(ctx, width, height)
  }
  pixelateCanvas(ctx, width, height, 820)
  // Apply only the border + scanlines, NOT the vignette — vignette goes on top of everything at the end
  const borderW = Math.round(width * 0.03)
  const borderH = Math.round(height * 0.03)
  const snapshot = ctx.getImageData(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  const tmp = document.createElement('canvas')
  tmp.width = width
  tmp.height = height
  tmp.getContext('2d')!.putImageData(snapshot, 0, 0)
  ctx.drawImage(tmp, borderW, borderH, width - borderW * 2, height - borderH * 2)

  _bgCache = { canvas, w: width, h: height }
  return canvas
}

// Invalidate cache when assets finish loading so icons appear
Promise.all([logoReady, allIconsReady]).then(() => { _bgCache = null })

export function drawVideoWindow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  video: HTMLVideoElement,
  windowTitle: string
) {
  // Draw cached boot screen background (icons, taskbar, pixelated, with CRT border)
  const bg = getBootBg(width, height)
  ctx.drawImage(bg, 0, 0)

  // Window bounds — sized to match video aspect ratio, centered in desktop area (inside CRT border)
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
  if (video.videoWidth && video.videoHeight) {
    const videoAspect = video.videoWidth / video.videoHeight
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

  // Window frame (raised)
  drawRaised(ctx, winX, winY, winW, winH)

  // Title bar
  const tbPad = 3
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

  // Content area (sunken)
  const contentPad = 4
  const contentX = winX + contentPad
  const contentY = winY + tbPad + titleBarH + contentPad
  const contentW = winW - contentPad * 2
  const contentH = winH - tbPad - titleBarH - contentPad * 2 - 4
  drawSunken(ctx, contentX, contentY, contentW, contentH, '#000')

  // Draw video frame
  if (video.videoWidth && video.videoHeight) {
    ctx.drawImage(video, contentX + 2, contentY + 2, contentW - 4, contentH - 4)
  }

  // Pre-rendered scanline overlay (slightly lighter than CRT version)
  ctx.globalAlpha = 0.75
  ctx.drawImage(getScanlineOverlay(width, height), 0, 0)
  ctx.globalAlpha = 1

  // Pre-rendered vignette overlay
  ctx.drawImage(getVignetteOverlay(width, height), 0, 0)
}
