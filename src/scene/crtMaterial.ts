import * as THREE from 'three'

/** Shared clock for the scene's animated shaders (CRT + ambience). */
export const sceneTime = { value: 0 }

/**
 * The monitor's picture tube: an unlit MeshBasicMaterial (keeps fog and
 * colour management) whose map lookup is replaced by a tiny CRT model:
 * - slight barrel curvature with rounded tube corners,
 * - phosphor bloom: a blurred mip of the same texture added on top,
 * - edge falloff and a faint refresh band rolling down the tube,
 * - glass: dark grey-green where no phosphor is lit, a soft highlight and a
 *   view-dependent sheen (Fresnel) so the tube reads as curved glass.
 * The canvas content is untouched, so text/video stays legible.
 */
export function createCrtMaterial(map: THREE.Texture | null) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.95, 0.95), map })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCrtTime = sceneTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCrtN;\nvarying vec3 vCrtV;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCrtN = normalize(normalMatrix * normal);\nvCrtV = -mvPosition.xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCrtTime;\nvarying vec3 vCrtN;\nvarying vec3 vCrtV;')
      .replace('#include <map_fragment>', /* glsl */ `
#ifdef USE_MAP
  vec2 crtC = vMapUv * 2.0 - 1.0;
  float crtR2 = dot(crtC, crtC);
  vec2 crtW = crtC * (1.0 + 0.028 * crtR2);
  vec2 crtUv = crtW * 0.5 + 0.5;
  vec2 crtQ = abs(crtW) - vec2(0.9);
  float crtInside = 1.0 - smoothstep(-0.012, 0.004, length(max(crtQ, 0.0)) - 0.1);
  vec3 crtCol = texture2D(map, crtUv).rgb;
  crtCol += texture2D(map, crtUv, 3.0).rgb * 0.16;
  crtCol *= 1.0 - 0.3 * pow(crtR2 * 0.5, 1.5);
  float crtRoll = fract(uCrtTime * 0.07) * 1.6 - 0.3;
  crtCol *= 1.0 + 0.035 * exp(-pow((1.0 - crtUv.y) - crtRoll, 2.0) * 90.0);
  crtCol = mix(vec3(0.018, 0.022, 0.02), crtCol, crtInside);
  vec3 crtN = normalize(vCrtN);
  vec3 crtV = normalize(vCrtV);
  float crtFres = pow(1.0 - abs(dot(crtN, crtV)), 4.0);
  float crtHl = smoothstep(0.6, 0.0, length((vMapUv - vec2(0.76, 0.8)) * vec2(1.0, 1.7)));
  crtCol += vec3(1.0, 0.93, 0.82) * (0.03 * crtHl + 0.1 * crtFres);
  diffuseColor.rgb *= crtCol;
#endif
`)
  }
  mat.customProgramCacheKey = () => 'crt-tube'
  return mat
}
