import { useThree } from '../../three/fiber'
import { useEffect } from 'react'
import { START_POSITION, START_ROTATION } from '../../config/views'
import { computeTarget } from './motion'
import type { CameraRig } from './rig'

interface CameraSetupProps {
  controlsRef: React.RefObject<CameraRig | null>
}

function CameraSetup({ controlsRef }: CameraSetupProps) {
  const { camera } = useThree()
  useEffect(() => {
    if (!controlsRef.current) return
    camera.position.set(...START_POSITION)
    const target = computeTarget(START_POSITION, START_ROTATION)
    controlsRef.current.target.copy(target)
    controlsRef.current.update()
  }, [camera, controlsRef])
  return null
}

export default CameraSetup
