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
import { VIEWS, START_POSITION } from '../config/views'
import { drawBlankScreen } from '../drawScreenTexture'
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
  const { setScreenSetup, setFullScene } = useScreenMesh()
  useEffect(() => {
    let cancelled = false
    let installedMaterial: THREE.Material | null = null
    let installedTexture: THREE.CanvasTexture | null = null
    let materialMesh: THREE.Mesh | null = null
    let originalMaterial: THREE.Material | THREE.Material[] | null = null
    const run = async () => {
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
      setFullScene(scene)
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

      // Install the dynamic screen material BEFORE warmup so its program (and
      // its shadow-pass MeshDepthMaterial variant) compile during the loading
      // screen. Otherwise onFirstUse blocks the main thread mid-zoom.
      if (screenMesh) {
        const mesh = screenMesh as THREE.Mesh
        mesh.updateWorldMatrix(true, false)
        const meshBox = new THREE.Box3().setFromObject(mesh)
        const meshSize = new THREE.Vector3()
        meshBox.getSize(meshSize)

        const geo = mesh.geometry as THREE.BufferGeometry
        if (!geo.attributes.uv) {
          console.warn('Scene: ComputerScreen has no UVs, generating planar projection')
          const pos = geo.attributes.position
          const uvs = new Float32Array(pos.count * 2)
          const localBox = new THREE.Box3()
          for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
            localBox.expandByPoint(v)
          }
          const localSize = new THREE.Vector3()
          localBox.getSize(localSize)
          const localMin = localBox.min
          for (let i = 0; i < pos.count; i++) {
            uvs[i * 2] = (pos.getX(i) - localMin.x) / (localSize.x || 1)
            uvs[i * 2 + 1] = (pos.getY(i) - localMin.y) / (localSize.y || 1)
          }
          geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
        } else {
          const uvAttr = geo.attributes.uv
          const uvs = uvAttr.array as Float32Array
          let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
          for (let i = 0; i < uvs.length; i += 2) {
            minU = Math.min(minU, uvs[i])
            maxU = Math.max(maxU, uvs[i])
            minV = Math.min(minV, uvs[i + 1])
            maxV = Math.max(maxV, uvs[i + 1])
          }
          const rangeU = maxU - minU
          const rangeV = maxV - minV
          if (minU > 0.05 || maxU < 0.95 || minV > 0.05 || maxV < 0.95) {
            for (let i = 0; i < uvs.length; i += 2) {
              uvs[i] = (uvs[i] - minU) / (rangeU || 1)
              uvs[i + 1] = (uvs[i + 1] - minV) / (rangeV || 1)
            }
            uvAttr.needsUpdate = true
          }
        }

        const texWidth = 1024
        const texHeight = Math.round(texWidth * (meshSize.y / meshSize.x))
        const canvas = drawBlankScreen(texWidth, texHeight)
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        texture.needsUpdate = true

        originalMaterial = mesh.material
        const newMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#000000'),
          emissive: new THREE.Color('#ffffff'),
          emissiveMap: texture,
          emissiveIntensity: 0.95,
          roughness: 1.0,
          metalness: 0.0,
          toneMapped: true,
          envMapIntensity: 0,
        })
        mesh.material = newMat
        mesh.visible = true

        installedMaterial = newMat
        installedTexture = texture
        materialMesh = mesh

        setScreenSetup({ mesh, canvas, texture, width: texWidth, height: texHeight })
      }

      // Compile + render at both intro-zoom endpoints with the loading
      // screen still up. compileAsync awaits KHR_parallel_shader_compile so
      // programs are fully linked, and the real render forces
      // WebGLProgram.onFirstUse to run here instead of stalling mid-zoom.
      // Use a cloned camera so the warmup never mutates the real camera —
      // otherwise R3F frames during the awaits would see the warmup pose
      // and OrbitControls would latch onto it.
      // Disable frustumCulled so meshes culled at both warmup poses but
      // visible mid-zoom still go through setProgram → onFirstUse here.
      const culledState = new Map<THREE.Object3D, boolean>()
      rootScene.traverse((o) => {
        culledState.set(o, o.frustumCulled)
        o.frustumCulled = false
      })
      const warmupCam = (camera as THREE.PerspectiveCamera).clone()
      const warmupTarget = new THREE.WebGLRenderTarget(256, 256)
      gl.setRenderTarget(warmupTarget)
      const poses: [number, number, number][] = [
        START_POSITION,
        VIEWS.home.position,
      ]
      for (const pose of poses) {
        if (cancelled) break
        warmupCam.position.set(...pose)
        warmupCam.lookAt(0, 5, 0)
        warmupCam.updateMatrixWorld(true)
        await gl.compileAsync(rootScene, warmupCam)
        if (cancelled) break
        // Force the shadow pass so MeshDepthMaterial variants compile too.
        gl.shadowMap.needsUpdate = true
        gl.render(rootScene, warmupCam)
      }
      gl.setRenderTarget(null)
      warmupTarget.dispose()

      culledState.forEach((wasOn, o) => { o.frustumCulled = wasOn })

      if (cancelled) return

      // Scene is static: lights and shadow casters don't move. Pin the shadow
      // map after one real-camera pass instead of re-rendering it every frame.
      gl.shadowMap.needsUpdate = true
      gl.shadowMap.autoUpdate = false

      if (onLoaded) onLoaded()
    }
    run()
    return () => {
      cancelled = true
      if (materialMesh && originalMaterial) {
        materialMesh.material = originalMaterial
      }
      if (installedMaterial) installedMaterial.dispose()
      if (installedTexture) installedTexture.dispose()
    }
  }, [scene, onLoaded, setScreenSetup, setFullScene, gl, rootScene, camera])
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
      <PerformanceMonitor
        ms={150}
        iterations={5}
        threshold={0.75}
        bounds={(refresh) => [refresh * 0.85, refresh]}
        onDecline={onPerfDecline}
      />
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
