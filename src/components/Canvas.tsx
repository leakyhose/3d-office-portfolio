import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, type WebGLRenderer, type WebGLRendererParameters } from 'three'
import { createRoot, RootContext, type Root, type RootState, type Size } from '../three/fiber'

interface CanvasProps {
  /** Creates the renderer; gets R3F's defaults (canvas, antialias, alpha, high-performance). */
  gl: (defaults: WebGLRendererParameters & { canvas: HTMLCanvasElement }) => WebGLRenderer
  camera?: { fov?: number }
  /** Initial pixel ratio (AdaptiveDpr changes it later through setDpr). */
  dpr: number
  /** Called once the renderer exists, before anything is rendered. */
  onCreated?: (state: RootState) => void
  children?: ReactNode
}

function measure(el: HTMLElement): Size {
  const r = el.getBoundingClientRect()
  return { width: r.width, height: r.height, top: r.top, left: r.left }
}

/**
 * The 3D canvas: creates the renderer, default scene and camera the way R3F's
 * <Canvas> did (sRGB output, `flat` tone mapping, PerspectiveCamera at z = 5
 * looking at the origin), keeps them sized to the container and runs the
 * render loop (see three/fiber.ts). The children are plain React components;
 * they mount once the renderer exists and onCreated has run.
 *
 * A renderer that can't be created (no WebGL context) is re-thrown during
 * render, into the nearest error boundary (<StageBoundary> -> flat layout).
 */
export function Canvas({ children, ...config }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const configRef = useRef(config)
  const [root, setRoot] = useState<Root | null>(null)
  const [error, setError] = useState<Error | null>(null)
  if (error) throw error

  useLayoutEffect(() => {
    const container = containerRef.current!
    const canvas = canvasRef.current!
    let r: Root | null = null
    let step = 0 // pending creation step
    let resizeTimer = 0
    let pending: Size | null = null
    const valid = (s: Size) => s.width > 0 && s.height > 0 // 0 = not laid out yet (skipped, like R3F's Canvas)
    const fail = (e: unknown) => setError(e instanceof Error ? e : new Error(String(e)))

    // Set-up runs in two tasks of its own, as it did under R3F: creating the
    // WebGL context, then onCreated (the shader prewarm) + mounting the
    // children. Both are tens of ms on a slow CPU; in one task (or in the
    // Stage mount's) they would make one long task instead of two shorter ones.
    const create = () => {
      step = 0
      const size = pending ?? measure(container)
      pending = null
      if (!valid(size)) return // the ResizeObserver tries again
      try {
        const { gl: createGl, camera: cameraProps, dpr } = configRef.current
        const gl = createGl({ canvas, powerPreference: 'high-performance', antialias: true, alpha: true })
        gl.outputColorSpace = SRGBColorSpace
        gl.toneMapping = NoToneMapping
        const camera = new PerspectiveCamera(cameraProps?.fov ?? 75, 0, 0.1, 1000)
        camera.position.z = 5
        camera.lookAt(0, 0, 0)
        r = createRoot(gl, new Scene(), camera, size, dpr)
        step = window.setTimeout(activate)
      } catch (e) {
        fail(e)
      }
    }
    const activate = () => {
      step = 0
      try {
        configRef.current.onCreated?.(r!.getState())
        r!.start()
        setRoot(r)
      } catch (e) {
        fail(e)
      }
    }
    step = window.setTimeout(create)

    // Resizing the canvas clears it. ResizeObserver callbacks run right
    // before a paint, so applying the size there would paint one blank
    // frame; apply it in a task after the paint instead (as R3F did, through
    // a React state update), so the next frame is drawn at the new size, with
    // the camera already re-framed by the components that read `size`.
    const applySize = () => {
      resizeTimer = 0
      if (r && pending) r.setSize(pending)
      pending = null
    }
    const ro = new ResizeObserver(() => {
      const size = measure(container)
      if (!valid(size)) return
      pending = size
      if (r) resizeTimer ||= window.setTimeout(applySize)
      else step ||= window.setTimeout(create)
    })
    ro.observe(container)
    return () => {
      ro.disconnect()
      clearTimeout(step)
      clearTimeout(resizeTimer)
      r?.destroy()
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
      {root && <RootContext value={root}>{children}</RootContext>}
    </div>
  )
}
