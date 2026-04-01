import { useRef, useMemo, useEffect, memo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const POOL_SIZE = 40
const CUBE_SIZE = 0.08
const MIN_SCALE = 0.5
const MAX_SCALE = 1.4
const RISE_SPEED = 0.4
const DRIFT_RANGE = 0.06
const MIN_LIFETIME = 5
const MAX_LIFETIME = 8
const SPAWN_RATE = 3
const FADE_START = 0.6

interface SteamParticle {
  age: number
  maxAge: number
  alive: boolean
  baseScale: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  rotation: THREE.Euler
  rotationSpeed: THREE.Vector3
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function initParticle(p: SteamParticle, center: THREE.Vector3, radius: number) {
  const angle = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.random()) * radius
  p.position.set(
    center.x + Math.cos(angle) * r,
    center.y,
    center.z + Math.sin(angle) * r
  )
  p.velocity.set(
    rand(-DRIFT_RANGE, DRIFT_RANGE),
    RISE_SPEED * rand(0.8, 1.2),
    rand(-DRIFT_RANGE, DRIFT_RANGE)
  )
  p.rotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  )
  p.rotationSpeed.set(rand(-1.5, 1.5), rand(-1.5, 1.5), rand(-1.5, 1.5))
  p.baseScale = rand(MIN_SCALE, MAX_SCALE)
  p.age = 0
  p.maxAge = rand(MIN_LIFETIME, MAX_LIFETIME)
  p.alive = true
}

export default memo(function CoffeeSteam({ active = true }: { active?: boolean }) {
  const { scene } = useGLTF('/newcat.glb')
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const spawnAcc = useRef(0)
  const tmpMatrix = useRef(new THREE.Matrix4())
  const tmpQuat = useRef(new THREE.Quaternion())
  const tmpEuler = useRef(new THREE.Euler())
  const tmpScale = useRef(new THREE.Vector3())

  const { spawnCenter, spawnRadius, particles, geometry, material } = useMemo(() => {
    let coffeeMesh: THREE.Object3D | undefined = undefined
    scene.traverse((child) => {
      if (!coffeeMesh && child.name === 'Cup') coffeeMesh = child
    })
    if (!coffeeMesh) {
      console.warn('CoffeeSteam: "Cup" object not found')
      return { spawnCenter: null, spawnRadius: 0, particles: [] as SteamParticle[], geometry: null, material: null }
    }

    const box = new THREE.Box3().setFromObject(coffeeMesh)
    const center = new THREE.Vector3()
    box.getCenter(center)
    const size = new THREE.Vector3()
    box.getSize(size)
    center.y = box.max.y
    const radius = Math.max(size.x, size.z) / 2 * 0.3

    console.log('CoffeeSteam: found mesh, world center =', center.toArray(), 'bbox size =', size.toArray(), 'radius =', radius)

    const geo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)
    const mat = new THREE.MeshStandardMaterial({
      color: '#dddddd',
      roughness: 0.85,
      metalness: 0.0,
    })

    const parts: SteamParticle[] = Array.from({ length: POOL_SIZE }, () => ({
      age: 0,
      maxAge: 0,
      alive: false,
      baseScale: 1,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      rotationSpeed: new THREE.Vector3(),
    }))

    return { spawnCenter: center, spawnRadius: radius, particles: parts, geometry: geo, material: mat }
  }, [scene])

  useEffect(() => {
    return () => {
      if (geometry) geometry.dispose()
      if (material) material.dispose()
    }
  }, [geometry, material])

  useFrame((_, rawDelta) => {
    if (!meshRef.current || !spawnCenter) return
    const delta = Math.min(rawDelta, 0.1)
    const mesh = meshRef.current

    if (active) {
      spawnAcc.current += delta * SPAWN_RATE
      while (spawnAcc.current >= 1) {
        spawnAcc.current -= 1
        const dead = particles.find((p) => !p.alive)
        if (dead) initParticle(dead, spawnCenter, spawnRadius)
      }
    }

    for (let i = 0; i < POOL_SIZE; i++) {
      const p = particles[i]
      if (!p.alive) {
        tmpMatrix.current.makeScale(0, 0, 0)
        mesh.setMatrixAt(i, tmpMatrix.current)
        continue
      }

      p.age += delta
      if (p.age >= p.maxAge) {
        p.alive = false
        tmpMatrix.current.makeScale(0, 0, 0)
        mesh.setMatrixAt(i, tmpMatrix.current)
        continue
      }

      p.position.addScaledVector(p.velocity, delta)
      p.rotation.x += p.rotationSpeed.x * delta
      p.rotation.y += p.rotationSpeed.y * delta
      p.rotation.z += p.rotationSpeed.z * delta

      const lifeFrac = p.age / p.maxAge
      let s = p.baseScale
      if (lifeFrac > FADE_START) {
        s *= 1 - (lifeFrac - FADE_START) / (1 - FADE_START)
      }

      tmpEuler.current.set(p.rotation.x, p.rotation.y, p.rotation.z)
      tmpQuat.current.setFromEuler(tmpEuler.current)
      tmpScale.current.set(s, s, s)
      tmpMatrix.current.compose(p.position, tmpQuat.current, tmpScale.current)
      mesh.setMatrixAt(i, tmpMatrix.current)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  if (!spawnCenter) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry!, material!, POOL_SIZE]}
      frustumCulled={false}
    />
  )
})
