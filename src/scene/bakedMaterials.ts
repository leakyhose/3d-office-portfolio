import * as THREE from 'three'
import { LIGHTMAP_INTENSITY } from './office'

const PAPER_RE = /^EXPERIENCE[ _]PAPER$/

/**
 * Swaps the GLB's PBR materials for unlit MeshBasicMaterials driven by the
 * baked lightmap. The whole scene then needs a handful of tiny shader
 * programs instead of ~30 lit/shadowed/post-processed variants, which is what
 * used to stall the main thread for seconds on first load.
 *
 * Exceptions:
 * - ComputerScreen: left alone; Scene installs its own emissive material.
 * - EXPERIENCE PAPER: keeps its MeshStandardMaterial (ExperiencePaper swaps
 *   its `map` at runtime); it just gets the lightmap too. With no lights in
 *   the scene a standard material's output is albedo * lightmap, same as basic.
 */
export function applyBakedLighting(root: THREE.Object3D, lightmap: THREE.Texture) {
  const converted = new Map<THREE.Material, THREE.Material>()
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || mesh.name === 'ComputerScreen') return
    mesh.castShadow = false
    mesh.receiveShadow = false
    const hasLightmapUv = Boolean(mesh.geometry.getAttribute('uv1'))
    const convert = (mat: THREE.Material): THREE.Material => {
      const std = mat as THREE.MeshStandardMaterial
      if (PAPER_RE.test(mesh.name)) {
        if (hasLightmapUv) {
          std.lightMap = lightmap
          std.lightMapIntensity = LIGHTMAP_INTENSITY
          std.envMapIntensity = 0
          std.needsUpdate = true
        }
        return std
      }
      const cached = converted.get(mat)
      if (cached) return cached
      const basic = new THREE.MeshBasicMaterial({
        name: std.name,
        color: std.color,
        map: std.map ?? null,
        transparent: std.transparent,
        opacity: std.opacity,
        alphaTest: std.alphaTest,
        depthWrite: std.depthWrite,
        side: std.side,
        lightMap: hasLightmapUv ? lightmap : null,
        lightMapIntensity: LIGHTMAP_INTENSITY,
      })
      converted.set(mat, basic)
      mat.dispose()
      return basic
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material)
  })
}
