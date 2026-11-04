import * as THREE from 'three'

/*
 * The last step of every scene shader, for materials with `dithering: true`
 * (all of them; see bakedMaterials.ts, prewarm.ts, Scene.tsx):
 *
 * 1. The vignette. It used to be a CSS radial gradient over the canvas, but
 *    darkening the canvas' 8-bit output by up to 70% in the compositor
 *    re-quantises it: the dark walls and floor in the corners broke into
 *    visible rings, whatever the canvas did. Here it's applied before the
 *    output is quantised, with the same curve (pmndrs' Vignette, offset 0.3,
 *    darkness 0.7, as an sRGB-space factor like the CSS overlay was), and
 *    the compositor no longer blends a full-screen layer over the canvas.
 * 2. Dithering: +-0.5/255 of interleaved-gradient noise before the 8-bit
 *    framebuffer rounds the colour, so the long, dark lamp falloffs on the
 *    walls and floor come out as smooth gradients instead of 1-level bands.
 *
 * Patched into three's own dithering chunks (fragment) and fog chunks
 * (vertex: every built-in material's vertex shader includes them, after
 * gl_Position is set), so it costs one varying and a few ALU ops per pixel,
 * no extra pass. Screen position comes from the clip-space position (not
 * gl_FragCoord), so it needs no viewport uniform and follows the camera's
 * view offset (lens shift), which spans the whole canvas.
 */

// pow(1 - smoothstep(0.2397, 0.8, |uv - 0.5|), 1 / 2.2), fitted on the squared
// distance (within 1.5%, < 0.5 of an output level on the dark walls) to save
// the sqrt, log and exp.
const VIGNETTE_PARS = /* glsl */ `
varying vec3 vOutputClip;
float sceneVignette() {
  vec2 c = vOutputClip.xy / vOutputClip.z * 0.5;
  return 1.0 - 0.822 * smoothstep(0.025, 0.67, dot(c, c));
}
`

THREE.ShaderChunk.fog_pars_vertex = 'varying vec3 vOutputClip;\n' + THREE.ShaderChunk.fog_pars_vertex
THREE.ShaderChunk.fog_vertex = 'vOutputClip = gl_Position.xyw;\n' + THREE.ShaderChunk.fog_vertex
THREE.ShaderChunk.dithering_pars_fragment = /* glsl */ `
#ifdef DITHERING
${VIGNETTE_PARS}
vec3 dithering(vec3 color) {
  // interleaved gradient noise (Jimenez 2014): even, blue-ish, no texture
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return color + (n - 0.5) / 255.0;
}
#endif
`
THREE.ShaderChunk.dithering_fragment = /* glsl */ `
#ifdef DITHERING
gl_FragColor.rgb = dithering(gl_FragColor.rgb * sceneVignette());
#endif
`
/** For custom shaders (ambience): `#include <scene_vignette_pars>`, then `sceneVignette()`; the vertex shader sets vOutputClip = gl_Position.xyw. */
;(THREE.ShaderChunk as Record<string, string>).scene_vignette_pars = VIGNETTE_PARS

/**
 * Fills whatever the scene doesn't cover with the backdrop colour (it was the
 * renderer's clear colour), vignetted and dithered like the rest. Drawn after
 * the opaque meshes, at the far plane: the depth test leaves only the
 * uncovered pixels to shade.
 */
export function createBackdrop(color: THREE.ColorRepresentation) {
  // the shader writes the output (sRGB) colour directly
  const { r, g, b } = new THREE.Color(color).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
  const material = new THREE.ShaderMaterial({
    name: 'backdrop',
    uniforms: { color: { value: new THREE.Vector3(r, g, b) } },
    vertexShader: /* glsl */ `
      varying vec3 vOutputClip;
      void main() {
        gl_Position = vec4(position.xy * 2.0, 1.0, 1.0);
        vOutputClip = gl_Position.xyw;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      #include <dithering_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <dithering_fragment>
      }`,
    depthWrite: false,
    dithering: true,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.name = 'Backdrop'
  mesh.frustumCulled = false
  mesh.renderOrder = 1e9 // last of the opaque meshes
  return mesh
}
