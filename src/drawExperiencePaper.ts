import '@fontsource/vt323'
import { EXPERIENCE, type ExperienceEntry } from './config/experience'

// Draws the printed experience sheet that sits on the desk (GLB node
// "EXPERIENCE PAPER"). Layout is authored in a 1000-unit-wide A4 design
// space and scaled to the canvas, so resolution can change freely.

const FONT = 'VT323'
const DESIGN_W = 1000
const DESIGN_H = Math.round(DESIGN_W * (297 / 210)) // A4, matches the paper mesh

const INK = '#141414'
const INK_SOFT = '#4a4a4a'
const INK_FAINT = '#9c9c9c'
const RULE = '#cfcfcf'
const NOW_GREEN = '#4f7a34'

const MARGIN_X = 95
const TILE = 210
const TILE_GAP = 170
const FIRST_TILE_Y = 205
const TEXT_X = MARGIN_X + TILE + 34

const NAME_SIZE = 137.5
const BODY_SIZE = 52.5
const HEADER_SIZE = 37.5

// Hollow pixel arrow (⇩), 9×12 cells.
const ARROW = [
  '..XXXXX..',
  '..X...X..',
  '..X...X..',
  '..X...X..',
  '..X...X..',
  '..X...X..',
  'XXX...XXX',
  'X.......X',
  '.X.....X.',
  '..X...X..',
  '...X.X...',
  '....X....',
]
const ARROW_CELL = 8

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const img = new Image()
  img.decoding = 'async'
  img.src = src
  return img.decode().then(() => img, () => null)
}

async function loadFont(text: string) {
  try {
    await document.fonts.load(`64px ${FONT}`, text)
    if (!document.fonts.check(`64px ${FONT}`, text)) {
      await document.fonts.ready
    }
  } catch {
    // Draw with whatever is available rather than keep stale content.
  }
}

function spacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'left' | 'right') {
  const width = ctx.measureText(text).width + spacing * (text.length - 1)
  let cx = align === 'left' ? x : x - width
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + spacing
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const w = ARROW[0].length * ARROW_CELL
  const h = ARROW.length * ARROW_CELL
  const x0 = Math.round(cx - w / 2)
  const y0 = Math.round(cy - h / 2)
  ctx.fillStyle = INK
  ARROW.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === 'X') ctx.fillRect(x0 + c * ARROW_CELL, y0 + r * ARROW_CELL, ARROW_CELL, ARROW_CELL)
    }
  })
}

function drawEntry(ctx: CanvasRenderingContext2D, entry: ExperienceEntry, logo: HTMLImageElement | null, top: number) {
  // Logo tile
  if (logo) {
    try {
      ctx.drawImage(logo, MARGIN_X, top, TILE, TILE)
    } catch {
      logo = null
    }
  }
  if (!logo) {
    ctx.fillStyle = INK
    ctx.fillRect(MARGIN_X, top, TILE, TILE)
  }

  // Company name: cap tops line up with the tile top.
  const nameBaseline = top + NAME_SIZE * 0.56
  ctx.fillStyle = INK
  ctx.font = `${NAME_SIZE}px ${FONT}`
  ctx.fillText(entry.company, TEXT_X, nameBaseline)
  const afterName = TEXT_X + ctx.measureText(entry.company).width + 28

  ctx.font = `${BODY_SIZE}px ${FONT}`
  if (entry.team) {
    ctx.fillStyle = INK_SOFT
    ctx.fillText(entry.team, afterName, nameBaseline)
  }
  if (entry.current) {
    const label = 'NOW'
    const padX = 14
    const capH = BODY_SIZE * 0.56
    const boxH = Math.round(capH + 2 * 12)
    const boxW = Math.round(ctx.measureText(label).width + 2 * padX)
    // Centre the badge on the name's cap height.
    const boxY = Math.round(nameBaseline - NAME_SIZE * 0.28 - boxH / 2)
    ctx.fillStyle = NOW_GREEN
    ctx.fillRect(afterName, boxY, boxW, boxH)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, afterName + padX, boxY + boxH - 12)
  }

  // Role + dates: dates baseline sits on the tile's bottom edge.
  const datesBaseline = top + TILE
  ctx.fillStyle = INK
  ctx.fillText(entry.role, TEXT_X, datesBaseline - 62)
  ctx.fillStyle = INK_SOFT
  ctx.fillText(entry.dates, TEXT_X, datesBaseline)
}

function drawHeader(ctx: CanvasRenderingContext2D) {
  ctx.font = `${HEADER_SIZE}px ${FONT}`
  ctx.fillStyle = INK_FAINT
  spacedText(ctx, 'EXPERIENCE', MARGIN_X, 112, 6, 'left')
  spacedText(ctx, 'YIMING SU', DESIGN_W - MARGIN_X, 112, 6, 'right')
  ctx.fillStyle = RULE
  ctx.fillRect(MARGIN_X, 130, DESIGN_W - 2 * MARGIN_X, 3)
}

/**
 * Renders the sheet into a canvas `width` px wide (A4 aspect).
 * Resolves to null only if 2D canvas is unavailable.
 */
export async function drawExperiencePaper(width = 1448): Promise<HTMLCanvasElement | null> {
  const allText = EXPERIENCE.map((e) => `${e.company}${e.team ?? ''}${e.role}${e.dates}`).join('') + 'EXPERIENCEYIMING SUNOW'
  const [logos] = await Promise.all([
    Promise.all(EXPERIENCE.map((e) => loadImage(e.logo))),
    loadFont(allText),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round(width * (DESIGN_H / DESIGN_W))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(canvas.width / DESIGN_W, canvas.height / DESIGN_H)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.textBaseline = 'alphabetic'

  drawHeader(ctx)
  EXPERIENCE.forEach((entry, i) => {
    const top = FIRST_TILE_Y + i * (TILE + TILE_GAP)
    drawEntry(ctx, entry, logos[i], top)
    if (i < EXPERIENCE.length - 1) {
      drawArrow(ctx, MARGIN_X + TILE / 2, top + TILE + TILE_GAP / 2)
    }
  })

  return canvas
}
