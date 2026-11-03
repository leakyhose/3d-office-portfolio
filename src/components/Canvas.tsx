import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot, extend, unmountComponentAtNode, type RenderProps, type ReconcilerRoot } from '@react-three/fiber'
import { Color, Fog, InstancedMesh, Mesh, MeshBasicMaterial, Points } from 'three'

/*
 * Minimal stand-in for R3F's <Canvas>. R3F's own Canvas registers the whole
 * THREE namespace as JSX elements (`extend(THREE)`), which keeps every class
 * in three.js in the bundle. This one registers only the elements the scene
 * actually uses, so the rest of three tree-shakes away. It also leaves out
 * R3F's pointer-event system (the scene handles its own pointer input on the
 * canvas element) and the context bridge (nothing inside reads outer contexts).
 *
 * Add a class here when the scene starts using a new intrinsic element (R3F
 * throws "X is not part of the THREE namespace" otherwise).
 */
extend({ Color, Fog, InstancedMesh, Mesh, MeshBasicMaterial, Points })

type CanvasProps = Omit<RenderProps<HTMLCanvasElement>, 'size' | 'events'> & { children?: ReactNode }

interface Size { width: number; height: number; top: number; left: number }

/** Re-throws errors from inside the 3D tree into the DOM tree (like R3F's Canvas). */
class ErrorForwarder extends Component<{ set: (e: unknown) => void; children?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { this.props.set(error) }
  render() { return this.state.failed ? null : this.props.children }
}

export function Canvas({ children, ...config }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const root = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  const [error, setError] = useState<unknown>(null)
  if (error) throw error

  // Container size from a ResizeObserver (its first callback is the initial size).
  useLayoutEffect(() => {
    const el = containerRef.current!
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize((s) => (s && s.width === r.width && s.height === r.height && s.top === r.top && s.left === r.left
        ? s : { width: r.width, height: r.height, top: r.top, left: r.left }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Like R3F's Canvas: (re)configure and render the 3D tree on every render.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size || size.width <= 0 || size.height <= 0) return
    root.current ??= createRoot(canvas)
    const r = root.current
    r.configure({ ...config, size }).then(() => {
      r.render(
        <ErrorForwarder set={setError}>
          <Suspense fallback={null}>{children}</Suspense>
        </ErrorForwarder>,
      )
    })
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) return () => unmountComponentAtNode(canvas)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  )
}
