import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Injects <link rel="preload"> for the 3D scene's hashed assets (GLB +
// lightmaps) and modulepreloads for the lazy 3D chunks so they download while the JS is still being fetched/parsed,
// instead of only after the Stage chunk evaluates. Mobile never renders 3D,
// so the hints are restricted to desktop-width viewports via `media`.
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
        const modulePreloads = chunks.map((f) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', href: `/${f}`, crossorigin: '', media: '(min-width: 769px)' },
          injectTo: 'head' as const,
        }))
        return [...modulePreloads, ...files.map((f) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: `/${f}`,
            as: 'fetch',
            crossorigin: '',
            media: '(min-width: 769px)',
            // the overlay's JS/CSS/fonts go first on slow connections
            fetchpriority: 'low',
          },
          injectTo: 'head' as const,
        }))]
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
