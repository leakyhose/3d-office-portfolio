import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import officeUrl from '../assets/office.glb?url'
import lightmapUrl from '../assets/office-lightmap.webp?url'
import floorLightmapUrl from '../assets/floor-lightmap.webp?url'
import roomLightmapUrl from '../assets/room-lightmap.webp?url'

// Lighting is baked offline (Blender/Cycles, see scripts/bake/) into three
// lightmaps (UV set TEXCOORD_1): one atlas for the desk model's meshes, one
// for the room around it (Room_* meshes: walls, window, rug) and one for the
// floor patch inside the room. The encoded value is
// (diffuse irradiance / PI) / LIGHTMAP_SCALE in sRGB, so the runtime factor
// that reproduces Cycles' result with three's lightMap math
// (albedo * texel * intensity / PI) is PI * LIGHTMAP_SCALE.
export const LIGHTMAP_SCALE = 1.5
export const LIGHTMAP_INTENSITY = Math.PI * LIGHTMAP_SCALE

// The floor lightmap covers a FLOOR_BAKE_SIZE square (world units) centred on
// FLOOR_BAKE_CENTER (x, z); outside it the clamped edge texels continue.
// Keep in sync with scripts/bake/bake.py.
export const FLOOR_BAKE_SIZE = 36
export const FLOOR_BAKE_CENTER: [number, number] = [5, 12]

export interface OfficeAssets {
  scene: THREE.Group
  lightmap: THREE.Texture
  roomLightmap: THREE.Texture
  floorLightmap: THREE.Texture
}

export const OFFICE_ASSET_URLS = [officeUrl, lightmapUrl, roomLightmapUrl, floorLightmapUrl]

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

/** Starts (once) and returns the download + parse of everything the 3D scene needs. */
export function loadOffice(): Promise<OfficeAssets> {
  if (promise) return promise
  const gltfLoader = new GLTFLoader()
  gltfLoader.setMeshoptDecoder(MeshoptDecoder)
  promise = Promise.all([
    gltfLoader.loadAsync(officeUrl),
    loadTexture(lightmapUrl),
    loadTexture(roomLightmapUrl),
    loadTexture(floorLightmapUrl),
  ]).then(([gltf, lightmap, roomLightmap, floorLightmap]) => {
    floorLightmap.wrapS = floorLightmap.wrapT = THREE.ClampToEdgeWrapping
    performance.mark('stage:assets-loaded')
    loaded = { scene: gltf.scene, lightmap, roomLightmap, floorLightmap }
    return loaded
  })
  return promise
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
