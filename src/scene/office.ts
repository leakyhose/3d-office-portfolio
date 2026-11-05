import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import officeUrl from '../assets/office.glb?url'
import lightmapUrl from '../assets/office-lightmap.webp?url'
import floorLightmapUrl from '../assets/floor-lightmap.avif?url'
import floorLightmapFallbackUrl from '../assets/floor-lightmap.webp?url'

// Lighting is baked offline (Blender/Cycles, see scripts/bake/) into two
// lightmaps (UV set TEXCOORD_1): one atlas for the desk model's meshes and
// one for the floor patch under it. The encoded value is
// (diffuse irradiance / PI) / LIGHTMAP_SCALE in sRGB, so the runtime factor
// that reproduces Cycles' result with three's lightMap math
// (albedo * texel * intensity / PI) is PI * LIGHTMAP_SCALE.
export const LIGHTMAP_SCALE = 1.5
export const LIGHTMAP_INTENSITY = Math.PI * LIGHTMAP_SCALE

// The floor lightmap covers a FLOOR_BAKE_SIZE square (world units) centred on
// FLOOR_BAKE_CENTER (x, z), around every shadow the key casts; outside it the
// clamped edge texels continue as evenly lit floor to the horizon.
// Keep in sync with scripts/bake/bake.py.
export const FLOOR_BAKE_SIZE = 32
export const FLOOR_BAKE_CENTER: [number, number] = [-2, 3]

export interface OfficeAssets {
  scene: THREE.Group
  lightmap: THREE.Texture
  floorLightmap: THREE.Texture
}

export const OFFICE_ASSET_URLS = [officeUrl, lightmapUrl, floorLightmapUrl]

// The floor lightmap is 4:4:4 AVIF: lossy WebP turned the soft shadows'
// gradients into blocks and rings (see scripts/bake/bake.sh). Browsers that
// can't decode AVIF (Safari before 16, or on macOS before Ventura) fall back
// to a WebP copy (only the AVIF is preloaded). The desk atlas stays WebP: its
// AVIF decodes ~70% slower, and it is the last download the first frame waits
// for.
function loadLightmap(url: string, fallbackUrl: string): Promise<THREE.Texture> {
  return loadTexture(url).catch(() => loadTexture(fallbackUrl))
}

async function loadTexture(url: string): Promise<THREE.Texture> {
  // Not THREE.ImageBitmapLoader: it reads the body with res.blob(), and when
  // that fetch picks up the index.html preload while it's still downloading
  // (i.e. on any slow connection), Chrome fails the read with "Failed to
  // fetch" as the preload completes, so the 3D scene never loaded on slow
  // 4G. Reading it as an ArrayBuffer doesn't hit that.
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const blob = new Blob([await res.arrayBuffer()], { type: res.headers.get('content-type') ?? '' })
  // createImageBitmap decodes off the main thread. glTF-style orientation
  // (no flip) matches how the lightmaps were written.
  return createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).then((bitmap) => {
    const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement)
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    tex.channel = 1
    // No mipmaps: the atlas packs hundreds of tiny islands a few texels apart,
    // and averaging them at distance bleeds neighbouring islands' lighting into
    // each other. Lighting is low-frequency, so plain bilinear doesn't alias.
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return tex
  })
}

let promise: Promise<OfficeAssets> | null = null
let loaded: OfficeAssets | null = null
let lightmaps: Promise<THREE.Texture>[] = []

/** Starts (once) and returns the download + parse of everything the 3D scene needs. */
export function loadOffice(): Promise<OfficeAssets> {
  if (promise) return promise
  const gltfLoader = new GLTFLoader()
  gltfLoader.setMeshoptDecoder(MeshoptDecoder)
  lightmaps = [
    loadTexture(lightmapUrl),
    loadLightmap(floorLightmapUrl, floorLightmapFallbackUrl),
  ]
  promise = Promise.all([gltfLoader.loadAsync(officeUrl), ...lightmaps]).then(([gltf, lightmap, floorLightmap]) => {
    performance.mark('stage:assets-loaded')
    loaded = { scene: gltf.scene, lightmap, floorLightmap }
    return loaded
  })
  return promise
}

/**
 * Uploads each lightmap to the GPU as soon as it has decoded, instead of in
 * the scene's first render. The 2048² atlas alone is a 16 MB upload (~15 ms,
 * ~60 ms on a slow phone) that otherwise lands in the long task that mounts
 * the scene; this way it usually runs while the rest is still downloading.
 * (Lightmaps clamp at the edges: three's default wrap mode.)
 */
export function uploadLightmapsEarly(renderer: THREE.WebGLRenderer) {
  for (const p of lightmaps) p.then((tex) => renderer.initTexture(tex), () => {})
}

/**
 * The loaded assets, for components that only mount after loadOffice()
 * resolved (Stage waits for it). Deliberately not React `use()`: suspending
 * here would add React's Suspense reveal throttling (~300 ms per boundary)
 * to the time-to-first-frame.
 */
export function getOfficeAssets(): OfficeAssets {
  if (!loaded) throw new Error('getOfficeAssets() called before loadOffice() resolved')
  return loaded
}
