import * as THREE from 'three'
import './output'

// The scene has no realtime lights any more (lighting is baked), so the steam
// cubes use an unlit material with a cheap fixed-direction lambert term
// (same key-light direction as the bake) to keep their faceted look; a high
// ambient floor keeps the shadowed faces light, like backlit vapour.
const KEY_DIR = new THREE.Vector3(8, 14, 15).normalize() // scripts/bake/stage.py KEY_DIR
export function createSteamMaterial() {
  const mat = new THREE.MeshBasicMaterial({ color: '#e6e1d8', dithering: true })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.keyDir = { value: KEY_DIR }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSteamNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSteamNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 keyDir;\nvarying vec3 vSteamNormal;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.3 + 0.6 * max(dot(normalize(vSteamNormal), keyDir), 0.0) + 0.12 * (normalize(vSteamNormal).y * 0.5 + 0.5);')
  }
  mat.customProgramCacheKey = () => 'steam-lambert'
  return mat
}
