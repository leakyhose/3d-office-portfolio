import { useEffect, useRef, useState, useCallback } from 'react'

const TOTAL_SEGMENTS = 20
const LOADING_INTERVAL = 120
const FAST_INTERVAL = 40

interface LoadingScreenProps {
  loaded: boolean
  onComplete: () => void
}

function LoadingScreen({ loaded, onComplete }: LoadingScreenProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [segments, setSegments] = useState(0)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSegments(prev => {
        if (prev >= 17) {
          clearInterval(intervalRef.current!)
          return prev
        }
        return prev + 1
      })
    }, LOADING_INTERVAL)
    return () => clearInterval(intervalRef.current!)
  }, [])

  useEffect(() => {
    if (!loaded) return
    clearInterval(intervalRef.current!)

    intervalRef.current = setInterval(() => {
      setSegments(prev => {
        if (prev >= TOTAL_SEGMENTS) {
          clearInterval(intervalRef.current!)
          return prev
        }
        return prev + 1
      })
    }, FAST_INTERVAL)

    const t = setTimeout(() => setDone(true), 500)
    return () => {
      clearInterval(intervalRef.current!)
      clearTimeout(t)
    }
  }, [loaded])

  const handleTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (done && e.propertyName === 'opacity' && e.target === overlayRef.current) {
      onComplete?.()
    }
  }, [done, onComplete])

  return (
    <div
      ref={overlayRef}
      onTransitionEnd={handleTransitionEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#3d352e',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        opacity: done ? 0 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* ysu.dev */}
      <div style={{
        fontFamily: '"VT323", monospace',
        fontSize: 52,
        color: '#c4b8a8',
        letterSpacing: '0.05em',
        userSelect: 'none',
      }}>
        ysu.dev
      </div>

      {/* Win95-style progress bar */}
      <div style={{
        width: 280,
        height: 26,
        background: '#C0C0C0',
        borderStyle: 'solid',
        borderWidth: 2,
        borderColor: '#808080 #dfdfdf #dfdfdf #808080',
        padding: 2,
        display: 'flex',
        alignItems: 'stretch',
        gap: 2,
        imageRendering: 'pixelated',
      }}>
        {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: i < segments ? '#000080' : 'transparent',
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default LoadingScreen
