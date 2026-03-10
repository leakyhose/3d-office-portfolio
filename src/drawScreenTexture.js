export function drawBlankScreen(width = 1024, height = 768) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  return canvas
}

// Preload assets
const logoImg = new Image()
const logoReady = new Promise(resolve => {
  logoImg.onload = () => resolve()
  logoImg.onerror = () => resolve()
})
logoImg.src = '/windows_logo.svg'

const win95LogoImg = new Image()
const win95LogoReady = new Promise(resolve => {
  win95LogoImg.onload = () => resolve()
  win95LogoImg.onerror = () => resolve()
})
win95LogoImg.src = '/windows_95_logo_and_text.png'

const cloudsImg = new Image()
const cloudsReady = new Promise(resolve => {
  cloudsImg.onload = () => resolve()
  cloudsImg.onerror = () => resolve()
})
cloudsImg.src = '/clouds_background.png'

function drawRaised(ctx, x, y, w, h, bg = '#C0C0C0') {
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y, w, 2)
  ctx.fillRect(x, y, 2, h)
  ctx.fillStyle = '#808080'
  ctx.fillRect(x, y + h - 2, w, 2)
  ctx.fillRect(x + w - 2, y, 2, h)
}

function drawSunken(ctx, x, y, w, h, bg = '#C0C0C0') {
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#808080'
  ctx.fillRect(x, y, w, 2)
  ctx.fillRect(x, y, 2, h)
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y + h - 2, w, 2)
  ctx.fillRect(x + w - 2, y, 2, h)
}

function drawTaskbar(ctx, width, height) {
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
}

function pixelateCanvas(ctx, width, height) {
  const lowW = 384
  const lowH = Math.round(lowW * (height / width))

  const tiny = document.createElement('canvas')
  tiny.width = lowW
  tiny.height = lowH
  const tctx = tiny.getContext('2d')
  tctx.drawImage(ctx.canvas, 0, 0, lowW, lowH)

  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tiny, 0, 0, width, height)
  ctx.imageSmoothingEnabled = true
}

function applyCRTEffects(ctx, width, height) {
  const borderW = Math.round(width * 0.03)
  const borderH = Math.round(height * 0.03)
  const snapshot = ctx.getImageData(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  const tmp = document.createElement('canvas')
  tmp.width = width
  tmp.height = height
  tmp.getContext('2d').putImageData(snapshot, 0, 0)
  ctx.drawImage(tmp, borderW, borderH, width - borderW * 2, height - borderH * 2)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
  for (let y = 0; y < height; y += 2) {
    ctx.fillRect(0, y, width, 1)
  }

  const cx = width / 2
  const cy = height / 2
  const outerR = Math.sqrt(cx * cx + cy * cy)
  const grad = ctx.createRadialGradient(cx, cy, outerR * 0.35, cx, cy, outerR)
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.35)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
}

export function drawCloudsScreen(width = 1024, height = 768, onUpdate) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

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

export function drawBootScreen(width = 1024, height = 768, onUpdate) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#008080'
  ctx.fillRect(0, 0, width, height)

  drawTaskbar(ctx, width, height)

  const drawLogo = () => {
    const barH = Math.round(height * 0.08)
    const availableH = height - barH
    const logoH = Math.round(availableH * 0.3)
    const aspect = logoImg.naturalWidth / logoImg.naturalHeight
    const logoW = Math.round(logoH * aspect)
    const logoX = (width - logoW) / 2
    const logoY = (availableH - logoH) / 2
    ctx.drawImage(logoImg, logoX, logoY, logoW, logoH)

    const labelSize = Math.round(logoH * 0.18)
    ctx.font = `${labelSize}px "VT323", monospace`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 2
    ctx.shadowOffsetY = 2
    ctx.fillText('ysu.dev', width / 2, logoY + logoH + Math.round(logoH * 0.08))
    ctx.shadowColor = 'transparent'
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

    const pad = Math.round(barH * 0.12)
    const innerH = barH - pad * 2
    const btnLogoSize = Math.round(innerH * 0.7)
    const btnLogoX = pad + Math.round((innerH - btnLogoSize) / 2) + 4
    const btnLogoY = (height - barH) + pad + Math.round((innerH - btnLogoSize) / 2)
    ctx.drawImage(logoImg, btnLogoX, btnLogoY, btnLogoSize, btnLogoSize)
  }

  logoReady.then(() => {
    drawLogo()
    pixelateCanvas(ctx, width, height)
    applyCRTEffects(ctx, width, height)
    onUpdate?.()
  })

  return canvas
}

export function drawTerminalScreen(width = 1024, height = 768, onUpdate) {
  const canvas = drawBootScreen(width, height, onUpdate)
  return { canvas }
}
