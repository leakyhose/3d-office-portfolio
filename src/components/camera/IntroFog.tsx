export const INTRO_FOG: [string, number, number] = ['#1e1a15', 20, 65]

function IntroFog() {
  return <fog attach="fog" args={INTRO_FOG} />
}

export default IntroFog
