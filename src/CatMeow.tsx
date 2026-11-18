import { useEffect, useMemo, useRef, memo } from 'react'
import { useFrame, useSceneObject, useThree } from './three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import './scene/output'
import { getOfficeAssets } from './scene/office'
import * as THREE from 'three'

// The cats' nodes in office.glb (scripts/bake/stage.py CAT, CHAIR_CAT): each a
// group with one mesh per fur colour, so clicks are tested against the groups.
const CAT_NODES = ['Cube010_WhiteFur_0', 'ChairCat']
// Midway between the tips of each cat's ears, in its node's own space (the desk
// cat's a little forward of that, over the middle of its head).
const EARS_MID: [number, number, number][] = [[0.77, 1.0, 0.162], [0.505, 0.423, -0.615]]

// A meow is marked by three short bars fanned out over the cat's head, like the
// lines drawn round a sound in a comic: they pop in, hold and fade. The fan
// turns about the vertical to face the camera, so it reads from every view.
const BAR_LENGTH = 0.17
const BAR_THICK = 0.04
const FAN_RADIUS = 0.3 // from the fan's centre to where each bar starts
const FAN_ANGLE = (38 * Math.PI) / 180
const FAN_DROP = 0.08 // the fan's centre, this far below the ear tips
const MARK_COLOR = '#efe6d4'
const MARK_IN = 0.12 // seconds: pop in (overshooting), settle, hold, fade
const MARK_SETTLE = 0.1
const MARK_HOLD = 0.5
const MARK_OUT = 0.4
// Lit from the upper right in front, in the fan's own space: enough to tell the
// faces of each bar apart (the scene itself has no lights, it is baked).
const MARK_LIGHT = new THREE.Vector3(0.45, 0.75, 0.5).normalize()

function createMarkGeometry() {
  const bars = [-FAN_ANGLE, 0, FAN_ANGLE].map((angle) => {
    const bar = new THREE.BoxGeometry(BAR_THICK, BAR_LENGTH, BAR_THICK)
    bar.translate(0, FAN_RADIUS + BAR_LENGTH / 2, 0)
    bar.rotateZ(angle)
    return bar
  })
  const geometry = mergeGeometries(bars)
  bars.forEach((bar) => bar.dispose())
  const normal = geometry.attributes.normal
  const colors = new Float32Array(normal.count * 3)
  const n = new THREE.Vector3()
  for (let i = 0; i < normal.count; i++) {
    const shade = 0.6 + 0.4 * Math.max(n.fromBufferAttribute(normal, i).dot(MARK_LIGHT), 0)
    colors.fill(shade, i * 3, i * 3 + 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

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

  // One fan per cat, hidden until that cat meows.
  const marks = useMemo(() => {
    const geometry = createMarkGeometry()
    const group = new THREE.Group()
    const fans = cats.map((cat) => {
      const material = new THREE.MeshBasicMaterial({ color: MARK_COLOR, vertexColors: true, transparent: true, depthWrite: false, dithering: true })
      const fan = new THREE.Mesh(geometry, material)
      cat.updateWorldMatrix(true, false)
      cat.localToWorld(fan.position.set(...EARS_MID[CAT_NODES.indexOf(cat.name)]))
      fan.position.y -= FAN_DROP
      fan.visible = false
      group.add(fan)
      return { fan, material, base: fan.position.y, age: Infinity }
    })
    return { group, geometry, fans }
  }, [cats])
  useEffect(() => () => {
    marks.geometry.dispose()
    marks.fans.forEach((m) => m.material.dispose())
  }, [marks])
  useSceneObject(marks.group)

  useFrame((state, delta) => {
    for (const m of marks.fans) {
      if (!m.fan.visible) continue
      m.age += Math.min(delta, 0.1)
      const out = (m.age - MARK_IN - MARK_SETTLE - MARK_HOLD) / MARK_OUT
      if (out >= 1) {
        m.fan.visible = false
        continue
      }
      let scale = 1
      if (m.age < MARK_IN) scale = 0.4 + 0.7 * (m.age / MARK_IN)
      else if (m.age < MARK_IN + MARK_SETTLE) scale = 1.1 - 0.1 * ((m.age - MARK_IN) / MARK_SETTLE)
      else if (out > 0) scale = 1 + 0.12 * out
      m.fan.scale.setScalar(scale)
      m.material.opacity = out > 0 ? 1 - out : Math.min(m.age / MARK_IN, 1)
      m.fan.position.y = m.base + (out > 0 ? 0.05 * out : 0)
      m.fan.rotation.y = Math.atan2(state.camera.position.x - m.fan.position.x, state.camera.position.z - m.fan.position.z)
    }
  })

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

    /** Which of the cats is under the pointer: its place in `cats`, or -1. */
    const catAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      let hit: THREE.Object3D | null = raycaster.intersectObjects(cats, true)[0]?.object ?? null
      while (hit && !cats.includes(hit)) hit = hit.parent
      return hit ? cats.indexOf(hit) : -1
    }

    const onClick = (e: MouseEvent) => {
      const which = e.button === 0 ? catAt(e.clientX, e.clientY) : -1
      if (which < 0) return
      const mark = marks.fans[which]
      mark.age = 0
      mark.material.opacity = 0
      mark.fan.visible = true
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
      if (catAt(lastX, lastY) >= 0) {
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
  }, [cats, gl, camera, audios, marks])

  return null
})
