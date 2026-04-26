import { useEffect, useMemo, useRef, memo } from 'react'
import { useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const CAT_MATERIAL_HINT = 'WhiteFur'

const CAT_SOUNDS = [
  '/cat-sounds/idle1.mp3',
  '/cat-sounds/idle2.mp3',
  '/cat-sounds/idle3.mp3',
  '/cat-sounds/idle4.mp3',
]

export default memo(function CatMeow() {
  const { scene } = useGLTF('/newcat.glb')
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  const catMesh = useMemo(() => {
    let found: THREE.Mesh | null = null
    const allMeshNames: string[] = []
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      allMeshNames.push(`${mesh.name} [mat: ${(mesh.material as THREE.Material)?.name ?? '?'}]`)
      if (found) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const matchesMaterial = mats.some((m) => m && m.name && m.name.includes(CAT_MATERIAL_HINT))
      const matchesName = mesh.name.includes(CAT_MATERIAL_HINT)
      if (matchesMaterial || matchesName) found = mesh
    })
    if (!found) {
      console.warn(`CatMeow: cat mesh not found. Meshes in scene:`, allMeshNames)
    } else {
      console.log(`CatMeow: matched cat mesh "${(found as THREE.Mesh).name}"`)
    }
    return found
  }, [scene])

  const audios = useMemo(() => CAT_SOUNDS.map((src) => {
    const a = new Audio(src)
    a.preload = 'auto'
    return a
  }), [])
  const currentRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!catMesh) return
    const canvas = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()

    const hitsCat = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObject(catMesh, true).length > 0
    }

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || !hitsCat(e)) return
      const prev = currentRef.current
      if (prev) {
        prev.pause()
        prev.currentTime = 0
      }
      const next = audios[Math.floor(Math.random() * audios.length)]
      currentRef.current = next
      next.currentTime = 0
      next.play().catch(() => {})
    }

    const onMove = (e: PointerEvent) => {
      if (hitsCat(e)) {
        canvas.style.cursor = 'pointer'
      } else if (canvas.style.cursor === 'pointer') {
        canvas.style.cursor = ''
      }
    }

    canvas.addEventListener('click', onClick)
    canvas.addEventListener('pointermove', onMove)
    return () => {
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('pointermove', onMove)
      canvas.style.cursor = ''
    }
  }, [catMesh, gl, camera, audios])

  return null
})
