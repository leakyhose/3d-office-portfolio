import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getPaperCanvas } from '../scene/paper'
import { getOfficeAssets } from '../scene/office'


function findPaperMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (found || !mesh.isMesh) return
    const map = (mesh.material as THREE.MeshStandardMaterial).map
    if (/^EXPERIENCE[ _]PAPER$/.test(mesh.name) || map?.name === 'Paper2_ComputerDesk_0') found = mesh
  })
  return found
}

/**
 * Replaces the paper's baked texture with the runtime-drawn sheet.
 * Mounted with OfficeModel once the GLB and the paper canvas are ready
 * (Stage waits for both); swaps the map in a layout effect so the texture is
 * in place (and uploaded) before the shader warmup.
 */
export default function ExperiencePaper() {
  const canvas = getPaperCanvas()
  const { scene } = getOfficeAssets()
  const gl = useThree((s) => s.gl)

  useLayoutEffect(() => {
    if (!canvas) return
    const mesh = findPaperMesh(scene)
    if (!mesh) {
      console.warn('ExperiencePaper: paper mesh not found')
      return
    }
    const material = mesh.material as THREE.MeshStandardMaterial
    const original = material.map

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.flipY = false // glTF UV convention
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())

    // The baked texture only used part of its image; stretch the canvas over
    // the paper's actual UV rect so the whole canvas lands on the sheet.
    const uv = mesh.geometry.getAttribute('uv')
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i))
      minV = Math.min(minV, uv.getY(i)); maxV = Math.max(maxV, uv.getY(i))
    }
    texture.repeat.set(1 / (maxU - minU), 1 / (maxV - minV))
    texture.offset.set(-minU * texture.repeat.x, -minV * texture.repeat.y)

    material.map = texture
    if (!original) material.needsUpdate = true
    gl.initTexture(texture)

    return () => {
      material.map = original
      texture.dispose()
    }
  }, [canvas, scene, gl])

  return null
}
