import { useEffect, useLayoutEffect, useMemo, useRef, memo } from 'react'
import { useFrame, useSceneAttach, useSceneObject, useThree } from '../three/fiber'
import * as THREE from 'three'
import CameraSetup from './camera/CameraSetup'
import CameraAnimator from './camera/CameraAnimator'
import IntroFog from './camera/IntroFog'
import { CameraRig } from './camera/rig'
import { isCameraAnimating } from './camera/bridge'
import { CameraTracker } from '../CameraInfo'
import CoffeeSteam from '../CoffeeSteam'
import CatMeow from '../CatMeow'
import ComputerScreenContent from '../ComputerScreenContent'
import ExperiencePaper from './ExperiencePaper'
import { ScreenMeshProvider } from './ScreenMeshContext'
import { useScreenMesh } from './screenMesh'
import { AdaptiveDpr } from '../hooks/useQualityTier'
import { getOfficeAssets, FLOOR_BAKE_SIZE, FLOOR_BAKE_CENTER, LIGHTMAP_INTENSITY } from '../scene/office'
import { applyBakedLighting } from '../scene/bakedMaterials'
import { releasePrewarm } from '../scene/prewarm'
import { createCrtMaterial, sceneTime } from '../scene/crtMaterial'
import { createAmbienceGeometry, createAmbienceMaterial, setAmbienceScale } from '../scene/ambience'
import { drawBlankScreen } from '../drawScreenTexture'
import { warmVideos } from '../videoManager'
import type { ScreenPhase } from '../types'

const BACKGROUND = '#1e1a15'
const prepared = new WeakSet<THREE.Object3D>()

const OfficeModel = memo(function OfficeModel() {
  const { scene, lightmap, roomLightmap } = getOfficeAssets()
  const { setScreenSetup, setFullScene } = useScreenMesh()

  // Swap in the baked-lighting materials before the scene is first rendered.
  if (!prepared.has(scene)) {
    prepared.add(scene)
    applyBakedLighting(scene, lightmap, roomLightmap)
  }

  useLayoutEffect(() => {
    const screenMesh = scene.getObjectByName('ComputerScreen') as THREE.Mesh | undefined
    setFullScene(scene)
    if (!screenMesh) return

    screenMesh.updateWorldMatrix(true, false)
    const meshSize = new THREE.Box3().setFromObject(screenMesh).getSize(new THREE.Vector3())

    // Stretch the screen's UVs over the whole texture.
    const uvAttr = screenMesh.geometry.getAttribute('uv') as THREE.BufferAttribute
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (let i = 0; i < uvAttr.count; i++) {
      minU = Math.min(minU, uvAttr.getX(i)); maxU = Math.max(maxU, uvAttr.getX(i))
      minV = Math.min(minV, uvAttr.getY(i)); maxV = Math.max(maxV, uvAttr.getY(i))
    }
    if (minU > 0.05 || maxU < 0.95 || minV > 0.05 || maxV < 0.95) {
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, (uvAttr.getX(i) - minU) / ((maxU - minU) || 1), (uvAttr.getY(i) - minV) / ((maxV - minV) || 1))
      }
      uvAttr.needsUpdate = true
    }

    const texWidth = 1024
    const texHeight = Math.round(texWidth * (meshSize.y / meshSize.x))
    const canvas = drawBlankScreen(texWidth, texHeight)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping

    const originalMaterial = screenMesh.material
    // Unlit picture tube (see crtMaterial.ts).
    const material = createCrtMaterial(texture)
    screenMesh.material = material
    setScreenSetup({ mesh: screenMesh, canvas, texture, width: texWidth, height: texHeight })

    return () => {
      screenMesh.material = originalMaterial
      material.dispose()
      texture.dispose()
    }
  }, [scene, setScreenSetup, setFullScene])

  useSceneObject(scene)
  return null
})

function Background() {
  useSceneAttach('background', useMemo(() => new THREE.Color(BACKGROUND), []))
  return null
}

function Floor() {
  const { floorLightmap } = getOfficeAssets()
  const mesh = useMemo(() => {
    const geo = new THREE.PlaneGeometry(600, 600)
    geo.rotateX(-Math.PI / 2)
    // Lightmap UVs: the baked FLOOR_BAKE_SIZE patch maps to [0,1]; the
    // clamped edge texels continue as plain lit floor beyond it.
    const pos = geo.getAttribute('position')
    const uv1 = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uv1[i * 2] = (pos.getX(i) - FLOOR_BAKE_CENTER[0]) / FLOOR_BAKE_SIZE + 0.5
      uv1[i * 2 + 1] = (pos.getZ(i) - FLOOR_BAKE_CENTER[1]) / FLOOR_BAKE_SIZE + 0.5
    }
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2))
    const material = new THREE.MeshBasicMaterial({ color: BACKGROUND, lightMap: floorLightmap, lightMapIntensity: LIGHTMAP_INTENSITY })
    const m = new THREE.Mesh(geo, material)
    m.position.set(0, -0.01, 0)
    return m
  }, [floorLightmap])
  useEffect(() => () => {
    mesh.geometry.dispose()
    mesh.material.dispose()
  }, [mesh])
  useSceneObject(mesh)
  return null
}

const FOV_SCALE = 1 / (2 * Math.tan(THREE.MathUtils.degToRad(50) / 2))

/** Dust motes + PC LEDs (one Points draw call) and the shared shader clock. */
function Ambience() {
  const geometry = useMemo(() => createAmbienceGeometry(), [])
  const material = useMemo(() => createAmbienceMaterial(), [])
  const points = useMemo(() => {
    const p = new THREE.Points(geometry, material)
    p.frustumCulled = false
    return p
  }, [geometry, material])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useSceneObject(points)
  useFrame(({ clock, size, viewport }) => {
    sceneTime.value = clock.elapsedTime
    // world size -> pixels: drawing-buffer height / (2 tan(fov / 2))
    setAmbienceScale(material, size.height * viewport.dpr * FOV_SCALE)
  })
  return null
}

/**
 * Compiles every shader program in parallel (KHR_parallel_shader_compile via
 * compileAsync, off the main thread) and draws one frame — with frustum
 * culling off so every object goes through WebGLProgram.onFirstUse — while the
 * canvas is still invisible. Only then is the scene reported ready. Before
 * that, RenderLoop draws nothing, so a half-compiled program can never block
 * the main thread in the middle of an animation.
 */
function Warmup({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const { screenTexture } = useScreenMesh()

  useEffect(() => {
    if (!screenTexture) return
    let cancelled = false
    const run = async () => {
      performance.mark('stage:compile-start')
      await gl.compileAsync(scene, camera)
      if (cancelled) return
      performance.mark('stage:compiled')
      const culled: THREE.Object3D[] = []
      scene.traverse((o) => {
        if (o.frustumCulled) { culled.push(o); o.frustumCulled = false }
      })
      gl.render(scene, camera)
      for (const o of culled) o.frustumCulled = true
      performance.mark('stage:first-frame')
      releasePrewarm()
      if (import.meta.env.DEV) console.debug(`[stage] ${gl.info.programs?.length} shader programs`)
      // QA hook (?qa): lets the screenshot/perf harness read renderer.info.
      if (location.search.includes('qa')) (window as unknown as { __three: unknown }).__three = { gl, scene, camera }
      onReady()
    }
    run()
    return () => { cancelled = true }
  }, [gl, scene, camera, screenTexture, onReady])

  return null
}

function RenderLoop({ readyRef }: { readyRef: React.RefObject<boolean> }) {
  // Priority > 0 takes rendering over from R3F; runs after all camera updates.
  useFrame(({ gl, scene, camera }) => {
    if (readyRef.current) gl.render(scene, camera)
  }, 10)
  return null
}

interface SceneProps {
  onReady: () => void
  freeCam: boolean
  screenPhase: ScreenPhase
  hoveredProject: string | null
  introComplete: boolean
}

function Scene({ onReady, freeCam, screenPhase, hoveredProject, introComplete }: SceneProps) {
  const camera = useThree((s) => s.camera)
  const rig = useMemo(() => new CameraRig(camera), [camera])
  // Ref-shaped handle for the camera components (follows the rig).
  const controlsRef = useMemo<React.RefObject<CameraRig>>(() => ({ current: rig }), [rig])
  const readyRef = useRef(false)

  const handleReady = useMemo(() => () => {
    readyRef.current = true
    onReady()
  }, [onReady])

  // Same per-frame look-at the drei OrbitControls used to do (priority -1).
  useFrame(() => rig.update(), -1)
  // QA hook (?qa): lets screenshot scripts place the camera.
  useEffect(() => {
    if (location.search.includes('qa')) (window as unknown as { __rig: CameraRig }).__rig = rig
  }, [rig])

  // Demo videos stay cold during the critical loading path; start buffering
  // them once the intro is done and bandwidth is free.
  useEffect(() => {
    if (!introComplete) return
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 500))
    const cic = window.cancelIdleCallback ?? window.clearTimeout
    const id = ric(() => warmVideos(isCameraAnimating))
    return () => cic(id)
  }, [introComplete])

  return (
    <ScreenMeshProvider>
      <Background />
      <IntroFog />
      {/* Stage only mounts Scene once the GLB, lightmaps and paper canvas
          are loaded, so nothing here suspends. */}
      <OfficeModel />
      <ExperiencePaper />
      <Floor />
      <Ambience />
      <CoffeeSteam active={introComplete} />
      <CatMeow />
      <Warmup onReady={handleReady} />
      <ComputerScreenContent screenPhase={screenPhase} hoveredProject={hoveredProject} />
      <CameraSetup controlsRef={controlsRef} />
      <CameraAnimator controlsRef={controlsRef} freeCam={freeCam} />
      <AdaptiveDpr enabled={introComplete} isBusy={isCameraAnimating} />
      <RenderLoop readyRef={readyRef} />
      {freeCam && <CameraTracker />}
    </ScreenMeshProvider>
  )
}

export default Scene
