import * as THREE from 'three'

// What's outside the window: a low-res, slightly pixelated night sky (moon,
// a few stars, a distant skyline with lit windows), drawn once at load. The
// moon sits up and to the left, where the bake's cool moonlight comes from.
const W = 150
const H = 160

// Deterministic so the skyline doesn't change between visits.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function drawNightSky(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const rand = mulberry32(1995)

  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#060914')
  sky.addColorStop(0.45, '#0d1630')
  sky.addColorStop(0.72, '#1a2547')
  sky.addColorStop(0.86, '#33304d')
  sky.addColorStop(1, '#3d3348')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)

  // stars
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rand() * W)
    const y = Math.floor(rand() * H * 0.6)
    const a = 0.25 + rand() * 0.55
    g.fillStyle = `rgba(220, 228, 255, ${a.toFixed(2)})`
    g.fillRect(x, y, 1, 1)
  }

  // moon + halo
  const mx = W * 0.3, my = H * 0.24
  const halo = g.createRadialGradient(mx, my, 3, mx, my, 34)
  halo.addColorStop(0, 'rgba(200, 210, 255, 0.22)')
  halo.addColorStop(1, 'rgba(200, 210, 255, 0)')
  g.fillStyle = halo
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#e9e6d6'
  g.beginPath()
  g.arc(mx, my, 6.5, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(160, 165, 180, 0.35)'
  g.fillRect(Math.round(mx) - 3, Math.round(my) - 1, 2, 2)
  g.fillRect(Math.round(mx) + 1, Math.round(my) + 2, 2, 1)

  // skyline: two layers of blocks, the far one hazier
  const layer = (base: number, minH: number, maxH: number, color: string, lit: number) => {
    let x = -2
    while (x < W) {
      const w = 6 + Math.floor(rand() * 12)
      const h = minH + Math.floor(rand() * (maxH - minH))
      const top = H - base - h
      g.fillStyle = color
      g.fillRect(x, top, w, H - top)
      if (rand() < 0.25) g.fillRect(x + Math.floor(w / 2), top - 4, 1, 4) // antenna
      for (let wy = top + 2; wy < H - 2; wy += 3) {
        for (let wx = x + 1; wx < x + w - 1; wx += 2) {
          if (rand() < lit) {
            const warm = rand() < 0.8
            g.fillStyle = warm ? `rgba(255, 196, 110, ${(0.35 + rand() * 0.5).toFixed(2)})` : `rgba(160, 200, 255, ${(0.3 + rand() * 0.4).toFixed(2)})`
            g.fillRect(wx, wy, 1, 1)
          }
        }
      }
      x += w + Math.floor(rand() * 3)
    }
  }
  layer(0, 30, 62, '#141829', 0.08)
  layer(0, 12, 40, '#0a0c16', 0.14)
  return c
}

export function createNightSkyTexture(): THREE.Texture {
  const tex = new THREE.CanvasTexture(drawNightSky())
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false // glTF UV convention
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  return tex
}
