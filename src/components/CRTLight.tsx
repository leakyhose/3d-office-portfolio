import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useScreenMesh } from './ScreenMeshContext'

export default function CRTLight() {
  const { screenMesh } = useScreenMesh()
  const spotRef = useRef<THREE.SpotLight>(null)

  useEffect(() => {
    if (!screenMesh || !spotRef.current) return

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

    spotRef.current.position.copy(position)
    spotRef.current.target.position.copy(target)
    spotRef.current.target.updateMatrixWorld()
  }, [screenMesh])

  // Always render the spotLight so its program (and the NUM_SPOT_LIGHTS=1
  // variant of every lit MeshStandardMaterial) is compiled during warmup.
  // Placeholder position is overwritten via ref once screenMesh is known.
  return (
    <spotLight
      ref={spotRef}
      color="#a0c0ff"
      intensity={2.5}
      position={[0, 8, 5]}
      distance={12}
      angle={Math.PI / 4}
      penumbra={0.6}
      decay={2}
    />
  )
}
