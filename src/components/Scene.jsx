import { useEffect, useRef, Suspense, memo } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, ContactShadows, Environment } from '@react-three/drei'
import { EffectComposer, N8AO, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import CameraSetup from './camera/CameraSetup'
import CameraAnimator from './camera/CameraAnimator'
import IntroFog from './camera/IntroFog'
import { CameraTracker } from '../CameraInfo'
import CoffeeSteam from '../CoffeeSteam'
import ComputerScreenContent from '../ComputerScreenContent'
import { ScreenMeshProvider, useScreenMesh } from './ScreenMeshContext'
import { VIEWS } from '../config/views'

const T0 = performance.now()
const log = (msg) => console.log(`[${(performance.now() - T0).toFixed(0)}ms] ${msg}`)

log('Scene module loaded — starting preload')
useGLTF.preload('/newcat.glb')

const OfficeModel = memo(function OfficeModel({ onLoaded }) {
  log('useGLTF called')
  const { scene } = useGLTF('/newcat.glb')
  const gl = useThree((s) => s.gl)
  const rootScene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const { setScreenMesh, setFullScene } = useScreenMesh()
  log('useGLTF returned')
  useEffect(() => {
    let screenMesh = null
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (child.name === 'ComputerScreen') screenMesh = child
      }
    })
    if (screenMesh) setScreenMesh(screenMesh, 'full')
    setFullScene(scene)
    gl.compile(rootScene, camera)
    // Pre-upload textures to avoid VRAM stalls on first render
    rootScene.traverse((obj) => {
      if (!obj.isMesh) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of mats) {
        if (!mat) continue
        for (const key of Object.keys(mat)) {
          if (mat[key]?.isTexture) gl.initTexture(mat[key])
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

    log('OfficeModel ready')
    if (onLoaded) onLoaded()
  }, [scene, onLoaded, setScreenMesh, setFullScene, gl, rootScene, camera])
  return <primitive object={scene} />
})

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial color="#3d352e" roughness={1} metalness={0} />
    </mesh>
  )
}

function Scene({ onLoaded, freeCam, screenPhase }) {
  const controlsRef = useRef()
  return (
    <ScreenMeshProvider>
      <color attach="background" args={['#3d352e']} />
      <IntroFog />
      <hemisphereLight args={['#f5e6d3', '#2a2218', 0.5]} />
      <directionalLight
        color="#fff5e0" intensity={2.2} position={[14.2, 13.3, 12.3]}
        castShadow shadow-mapSize-width={4096} shadow-mapSize-height={4096}
        shadow-camera-far={200} shadow-camera-left={-60} shadow-camera-right={60}
        shadow-camera-top={60} shadow-camera-bottom={-60}
        shadow-normalBias={0.05} shadow-bias={-0.002}
      />
      <directionalLight color="#ffe8cc" intensity={0.2} position={[30, 20, -10]} />
      <Suspense fallback={null}>
        <OfficeModel onLoaded={onLoaded} />
        <Environment preset="apartment" background={false} environmentIntensity={0.3} />
      </Suspense>
      <CoffeeSteam />
      <ComputerScreenContent screenPhase={screenPhase} />
      <Floor />
      <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={100} blur={2.5} far={50} color="#2a2218" />
      <EffectComposer>
        <N8AO aoRadius={2} intensity={3} distanceFalloff={2} color="#2a2218" />
        <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.4} intensity={0.4} mipmapBlur />
      </EffectComposer>
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
