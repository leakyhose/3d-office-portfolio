import { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useScreenMesh } from './ScreenMeshContext'

export default function CRTLight() {
  const { screenMesh } = useScreenMesh()
  const spotRef = useRef<THREE.SpotLight>(null)
  const [lightState, setLightState] = useState<{
    position: THREE.Vector3
    target: THREE.Vector3
  } | null>(null)

  useEffect(() => {
    if (!screenMesh) return

    screenMesh.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(screenMesh)
    const center = box.getCenter(new THREE.Vector3())

    const normal = new THREE.Vector3(0, 0, 1)
      .transformDirection(screenMesh.matrixWorld)
      .normalize()

    // Ensure normal points toward the viewer (same check as CameraAnimator)
    const homeApprox = new THREE.Vector3(-5.9, 10.47, 14.15)
    if (homeApprox.clone().sub(center).dot(normal) < 0) normal.negate()

    const position = center.clone().add(normal.clone().multiplyScalar(0.3))
    const target = center
      .clone()
      .add(normal.clone().multiplyScalar(1.5))
      .add(new THREE.Vector3(0, -2, 0))

    setLightState({ position, target })
  }, [screenMesh])

  useEffect(() => {
    if (!spotRef.current || !lightState) return
    spotRef.current.target.position.copy(lightState.target)
    spotRef.current.target.updateMatrixWorld()
  }, [lightState])

  if (!lightState) return null

  return (
    <spotLight
      ref={spotRef}
      color="#a0c0ff"
      intensity={2.5}
      position={lightState.position}
      distance={12}
      angle={Math.PI / 4}
      penumbra={0.6}
      decay={2}
      castShadow
      shadow-mapSize-width={512}
      shadow-mapSize-height={512}
    />
  )
}
