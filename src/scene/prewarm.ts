import * as THREE from 'three'
import { createSteamMaterial } from '../CoffeeSteam'

/**
 * Starts compiling the scene's shader programs as soon as the WebGL context
 * exists, while the GLB/lightmaps are still downloading. Program cache keys
 * only depend on material features (map / lightMap / transparency / side /
 * fog / instancing / attributes), not on the actual textures or geometry, so
 * stand-ins with the same features produce the very programs the real scene
 * uses; the real compileAsync later finds them already linked. If a key ever
 * drifts, nothing breaks: that program just compiles in the normal warmup.
 */
export function prewarmPrograms(gl: THREE.WebGLRenderer, camera: THREE.Camera, fog: THREE.Fog | null) {
  const scene = new THREE.Scene()
  scene.fog = fog

  const tex = () => {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    t.colorSpace = THREE.SRGBColorSpace
    t.flipY = false
    t.needsUpdate = true
    return t
  }
  const lightMap = tex()
  lightMap.channel = 1

  // Geometry with the same attribute set as the GLB meshes (position, normal, uv, uv1).
  const glbLike = new THREE.PlaneGeometry()
  glbLike.setAttribute('uv1', glbLike.getAttribute('uv').clone())

  const materials: THREE.Material[] = [
    // GLB materials with a base colour texture / plain colour, + transparent decal
    new THREE.MeshBasicMaterial({ map: tex(), lightMap, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ lightMap, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ map: tex(), lightMap, side: THREE.DoubleSide, transparent: true }),
    // experience paper (keeps MeshStandardMaterial)
    new THREE.MeshStandardMaterial({ map: tex(), lightMap, side: THREE.DoubleSide }),
    // computer screen (canvas texture, no lightmap)
    new THREE.MeshBasicMaterial({ map: tex() }),
  ]
  const meshes: THREE.Object3D[] = materials.map((m) => new THREE.Mesh(glbLike, m))
  // floor (PlaneGeometry + uv1, front side)
  const floorGeo = new THREE.PlaneGeometry()
  floorGeo.setAttribute('uv1', floorGeo.getAttribute('uv').clone())
  meshes.push(new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ lightMap })))
  // coffee steam
  meshes.push(new THREE.InstancedMesh(new THREE.BoxGeometry(), createSteamMaterial(), 1))
  scene.add(...meshes)

  gl.compileAsync(scene, camera).catch(() => {})

  // Keep the stand-in materials alive until the real scene holds references
  // to the same programs: three frees a program when its last user is disposed.
  release = () => {
    for (const m of meshes) ((m as THREE.Mesh).material as THREE.Material).dispose()
    glbLike.dispose(); floorGeo.dispose()
    release = null
  }
}

let release: (() => void) | null = null

/** Call once the real scene has been compiled and drawn. */
export function releasePrewarm() {
  release?.()
}
