import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Preloads for the 3D scene's hashed assets (GLB + lightmaps) and the lazy 3D
// chunks, so they download while the overlay JS is still being fetched and
// parsed instead of only after the Stage chunk evaluates. Emitted by an inline
// head script that applies the same check as canRender3D() (src/capabilities.ts):
// visitors who get the flat layout (no WebGL2, Data Saver, very low-end, ?2d)
// don't download the 3D assets at all.
function preloadSceneAssets(): Plugin {
  const patterns = [/office.*\.glb$/, /office-lightmap.*\.webp$/, /floor-lightmap.*\.webp$/]
  return {
    name: 'preload-scene-assets',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return []
        const files = Object.keys(ctx.bundle).filter((f) => patterns.some((re) => re.test(f)))
        const chunks = Object.keys(ctx.bundle).filter((f) => /(^|\/)(Stage|vendor-3d)-[^/]*\.js$/.test(f))
        const links = [
          ...chunks.map((f) => ({ rel: 'modulepreload', href: `/${f}`, crossorigin: '' })),
          // the overlay's JS/CSS/fonts go first on slow connections
          ...files.map((f) => ({ rel: 'preload', href: `/${f}`, as: 'fetch', crossorigin: '', fetchpriority: 'low' })),
        ]
        const script = '(function(){var q=location.search,n=navigator,c=n.connection;' +
          'if(/[?&]2d(&|=|$)/.test(q))return;' +
          "if(!/[?&]3d(&|=|$)/.test(q)&&(typeof WebGL2RenderingContext==='undefined'||(c&&c.saveData)||" +
          '(n.deviceMemory!==undefined&&n.deviceMemory<=1)||(n.hardwareConcurrency!==undefined&&n.hardwareConcurrency<=2)))return;' +
          `${JSON.stringify(links)}.forEach(function(a){var l=document.createElement('link');` +
          'for(var k in a)l.setAttribute(k,a[k]);document.head.appendChild(l)})})()'
        return [{ tag: 'script', children: script, injectTo: 'head' as const }]
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), preloadSceneAssets()],
  build: {
    // GLB/lightmaps must stay separate files (never inlined as data: URIs).
    assetsInlineLimit: (file) => (/\.(glb|webp)$/.test(file) ? false : undefined),
    rolldownOptions: {
      output: {
        // three + R3F only load with the lazy 3D stage, never on the critical
        // path of the HTML overlay (and never on mobile). React gets its own
        // group with higher priority so the 3D group can't swallow it.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20 },
            { name: 'vendor-3d', test: /node_modules[\\/](three|@react-three)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})
