import { useEffect, useMemo, useRef, memo } from 'react'
import { useThree } from './three/fiber'
import { getOfficeAssets } from './scene/office'
import * as THREE from 'three'

// The cats' nodes in office.glb (scripts/bake/stage.py CAT, CHAIR_CAT), each a
// group with one mesh per fur colour, so clicks are tested against the group;
// and the sounds each one makes when clicked.
//
// The tortie's are cut from recordings on Wikimedia Commons that need no
// credit: tortie1 from "2015-11-24.νιαούρισμα.Νιάου.noise reduced.flac"
// (Tsester, CC0), tortie2 and tortie3 from "Meow of a pleading cat.oga"
// (Heismark, public domain), tortie-purr from "Purring cat.oga" (Mysid,
// public domain).
const CATS = [
  {
    node: 'Cube010_WhiteFur_0',
    sounds: ['/cat-sounds/idle1.mp3', '/cat-sounds/idle2.mp3', '/cat-sounds/idle3.mp3', '/cat-sounds/idle4.mp3'],
  },
  {
    node: 'ChairCat',
    sounds: ['/cat-sounds/tortie1.mp3', '/cat-sounds/tortie2.mp3', '/cat-sounds/tortie3.mp3', '/cat-sounds/tortie-purr.mp3'],
  },
]

export default memo(function CatMeow() {
  const { scene } = getOfficeAssets()
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  const cats = useMemo(() => CATS.flatMap(({ node, sounds }) => {
    const object = scene.getObjectByName(node)
    if (!object) {
      console.warn(`CatMeow: ${node} not found in the scene`)
      return []
    }
    const audios = sounds.map((src) => {
      // Fetched on first hover over the cat, not on the critical loading path.
      const a = new Audio()
      a.preload = 'none'
      a.dataset.src = src
      return a
    })
    return [{ object, audios }]
  }), [scene])
  const currentRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!cats.length) return
    const canvas = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const objects = cats.map((cat) => cat.object)

    /** The cat under the pointer (the nearer one, if one is behind the other). */
    const catAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObjects(objects, true)[0]
      if (!hit) return null
      return cats.find((cat) => {
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (o === cat.object) return true
        return false
      }) ?? null
    }

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return
      const cat = catAt(e.clientX, e.clientY)
      if (!cat) return
      const prev = currentRef.current
      if (prev) {
        prev.pause()
        prev.currentTime = 0
      }
      const next = cat.audios[Math.floor(Math.random() * cat.audios.length)]
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
      const cat = catAt(lastX, lastY)
      if (cat) {
        canvas.style.cursor = 'pointer'
        for (const a of cat.audios) {
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
  }, [cats, gl, camera])

  return null
})
