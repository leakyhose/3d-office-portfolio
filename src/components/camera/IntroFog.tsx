import { useMemo } from 'react'
import { Fog } from 'three'
import { useSceneAttach } from '../../three/fiber'
import { INTRO_FOG } from '../../config/views'

function IntroFog() {
  useSceneAttach('fog', useMemo(() => new Fog(...INTRO_FOG), []))
  return null
}

export default IntroFog
