import { useEffect, useMemo, useRef, memo } from 'react'
import { useThree } from './three/fiber'
import { getOfficeAssets } from './scene/office'
import * as THREE from 'three'

// The cats' nodes in office.glb (scripts/bake/stage.py CAT, CHAIR_CAT): each a
// group with one mesh per fur colour, so clicks are tested against the groups.
const CAT_NODES = ['Cube010_WhiteFur_0', 'ChairCat']

const CAT_SOUNDS = [
  '/cat-sounds/idle1.mp3',
  '/cat-sounds/idle2.mp3',
  '/cat-sounds/idle3.mp3',
  '/cat-sounds/idle4.mp3',
]

export default memo(function CatMeow() {
  const { scene } = getOfficeAssets()
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  const cats = useMemo(() => CAT_NODES.flatMap((name) => {
    const found = scene.getObjectByName(name)
    if (!found) console.warn(`CatMeow: ${name} not found in the scene`)
    return found ? [found] : []
  }), [scene])

  const audios = useMemo(() => CAT_SOUNDS.map((src) => {
    // Fetched on first hover over the cat, not on the critical loading path.
    const a = new Audio()
    a.preload = 'none'
    a.dataset.src = src
    return a
  }), [])
  const currentRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!cats.length) return
    const canvas = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()

    const hitsCat = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObjects(cats, true).length > 0
    }

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || !hitsCat(e.clientX, e.clientY)) return
      const prev = currentRef.current
      if (prev) {
        prev.pause()
        prev.currentTime = 0
      }
      const next = audios[Math.floor(Math.random() * audios.length)]
      if (!next.src && next.dataset.src) next.src = next.dataset.src
      currentRef.current = next
      next.currentTime = 0
      next.play().catch(() => {})
    }

    // Pointermove can fire far more often than frames render (high-polling
    // mice). Coalesce to at most one hover raycast per animation frame.
    let hoverRaf = 0
    let lastX = 0
    let lastY = 0
    const checkHover = () => {
      hoverRaf = 0
      if (hitsCat(lastX, lastY)) {
        canvas.style.cursor = 'pointer'
        for (const a of audios) {
          if (!a.src && a.dataset.src) { a.src = a.dataset.src; a.preload = 'auto' }
        }
      } else if (canvas.style.cursor === 'pointer') {
        canvas.style.cursor = ''
      }
    }
    const onMove = (e: PointerEvent) => {
      lastX = e.clientX
      lastY = e.clientY
      if (!hoverRaf) hoverRaf = requestAnimationFrame(checkHover)
    }

    canvas.addEventListener('click', onClick)
    canvas.addEventListener('pointermove', onMove)
    return () => {
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('pointermove', onMove)
      if (hoverRaf) cancelAnimationFrame(hoverRaf)
      canvas.style.cursor = ''
    }
  }, [cats, gl, camera, audios])

  return null
})
