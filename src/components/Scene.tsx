import { useEffect, useRef, Suspense, memo } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, ContactShadows, Environment, PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, N8AO, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import CameraSetup from './camera/CameraSetup'
import CameraAnimator from './camera/CameraAnimator'
import IntroFog from './camera/IntroFog'
import { CameraTracker } from '../CameraInfo'
import CoffeeSteam from '../CoffeeSteam'
import ComputerScreenContent from '../ComputerScreenContent'
import CRTLight from './CRTLight'
import { ScreenMeshProvider, useScreenMesh } from './ScreenMeshContext'
import { useQuality } from '../hooks/useQualityTier'
import { VIEWS } from '../config/views'
import type { ScreenPhase } from '../types'
import type { QualitySettings } from '../hooks/useQualityTier'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

useGLTF.preload('/newcat.glb')

interface OfficeModelProps {
  onLoaded?: () => void
}

const OfficeModel = memo(function OfficeModel({ onLoaded }: OfficeModelProps) {
  const { scene } = useGLTF('/newcat.glb')
  const gl = useThree((s) => s.gl)
  const rootScene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const { setScreenMesh, setFullScene } = useScreenMesh()
  useEffect(() => {
    let screenMesh: THREE.Mesh | null = null
    const _size = new THREE.Vector3()
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        // Only large meshes cast shadows — small objects (pens, keys) are too small to matter
        const box = new THREE.Box3().setFromObject(mesh)
        box.getSize(_size)
        const maxDim = Math.max(_size.x, _size.y, _size.z)
        mesh.castShadow = maxDim > 0.5
        mesh.receiveShadow = true
        if (mesh.name === 'ComputerScreen') screenMesh = mesh
      }
    })
    if (screenMesh) setScreenMesh(screenMesh, 'full')
    setFullScene(scene)
    gl.compile(rootScene, camera)
    // Pre-upload textures to avoid VRAM stalls on first render
    rootScene.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return
      const meshObj = obj as THREE.Mesh
      const mats = Array.isArray(meshObj.material) ? meshObj.material : [meshObj.material]
      for (const mat of mats) {
        if (!mat) continue
        for (const key of Object.keys(mat)) {
          const val = (mat as unknown as Record<string, unknown>)[key]
          if (val && typeof val === 'object' && (val as THREE.Texture).isTexture) {
            gl.initTexture(val as THREE.Texture)
          }
        }
      }
    })
    // Warm-up render from home position while loading screen is still up
    const savedPos = camera.position.clone()
    const savedQuat = camera.quaternion.clone()
    camera.position.set(...VIEWS.home.position)
    camera.lookAt(0, 5, 0)
    camera.updateMatrixWorld(true)
    const warmupTarget = new THREE.WebGLRenderTarget(256, 256)
    gl.setRenderTarget(warmupTarget)
    gl.render(rootScene, camera)
    gl.setRenderTarget(null)
    warmupTarget.dispose()
    camera.position.copy(savedPos)
    camera.quaternion.copy(savedQuat)
    camera.updateMatrixWorld(true)

    // Scene is static: lights and shadow casters don't move. Pin the shadow
    // map after one real-camera pass instead of re-rendering it every frame.
    gl.shadowMap.needsUpdate = true
    gl.shadowMap.autoUpdate = false

    if (onLoaded) onLoaded()
  }, [scene, onLoaded, setScreenMesh, setFullScene, gl, rootScene, camera])
  return <primitive object={scene} />
})

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial color="#1e1a15" roughness={1} metalness={0} />
    </mesh>
  )
}

function Effects({ quality }: { quality: QualitySettings }) {
  if (quality.enableN8AO) {
    return (
      <EffectComposer>
        <N8AO aoRadius={1.5} intensity={3} distanceFalloff={1} color="#2a2218" halfRes={quality.n8aoHalfRes} quality={quality.n8aoQuality} />
        {quality.enableBloom ? <Bloom luminanceThreshold={0.6} luminanceSmoothing={0.3} intensity={0.7} mipmapBlur /> : <></>}
        <Vignette offset={0.3} darkness={0.7} />
      </EffectComposer>
    )
  }
  if (quality.enableBloom) {
    return (
      <EffectComposer>
        <Bloom luminanceThreshold={0.6} luminanceSmoothing={0.3} intensity={0.7} mipmapBlur />
        <Vignette offset={0.3} darkness={0.7} />
      </EffectComposer>
    )
  }
  return (
    <EffectComposer>
      <Vignette offset={0.3} darkness={0.7} />
    </EffectComposer>
  )
}

interface SceneProps {
  onLoaded: () => void
  freeCam: boolean
  screenPhase: ScreenPhase
  hoveredProject: string | null
  introComplete: boolean
  onPerfDecline?: () => void
}

function Scene({ onLoaded, freeCam, screenPhase, hoveredProject, introComplete, onPerfDecline }: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const quality = useQuality()
  const shadowSize = quality.shadowMapSize
  return (
    <ScreenMeshProvider>
      <PerformanceMonitor onDecline={onPerfDecline} />
      <color attach="background" args={['#1e1a15']} />
      <IntroFog />
      <hemisphereLight args={['#c4a878', '#0f0d0a', 0.2]} />
      <directionalLight
        color="#ffe0a0" intensity={2.8} position={[14.2, 13.3, 12.3]}
        castShadow shadow-mapSize-width={shadowSize} shadow-mapSize-height={shadowSize}
        shadow-camera-far={80} shadow-camera-left={-15} shadow-camera-right={15}
        shadow-camera-top={15} shadow-camera-bottom={-15}
        shadow-normalBias={0.05} shadow-bias={-0.002}
      />
      <directionalLight color="#ffe8cc" intensity={0.03} position={[30, 20, -10]} />
      <Suspense fallback={null}>
        <OfficeModel onLoaded={onLoaded} />
        <Environment preset="apartment" background={false} environmentIntensity={0.08} />
      </Suspense>
      <CoffeeSteam active={introComplete} />
      <ComputerScreenContent screenPhase={screenPhase} hoveredProject={hoveredProject} />
      <CRTLight />
      <Floor />
      <ContactShadows position={[0, 0, 0]} opacity={0.8} scale={100} blur={2.5} far={50} color="#1e1a15" frames={1} />
      <Effects quality={quality} />
      <OrbitControls
        ref={controlsRef}
        enableZoom={false}
        enablePan={false}
        enableRotate={false}
      />
      <CameraSetup controlsRef={controlsRef} />
      <CameraAnimator controlsRef={controlsRef} freeCam={freeCam} />
      <CameraTracker />
    </ScreenMeshProvider>
  )
}

export default Scene
