import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useState, useCallback, createContext, useContext } from 'react'

const round = (v, d = 2) => Number(v.toFixed(d))

let _setInfoExternal = null

export function CameraTracker() {
  const { camera } = useThree()
  const frameCount = useRef(0)

  useFrame(() => {
    frameCount.current++
    if (frameCount.current % 10 !== 0 || !_setInfoExternal) return

    _setInfoExternal({
      px: round(camera.position.x),
      py: round(camera.position.y),
      pz: round(camera.position.z),
      rx: round(camera.rotation.x, 3),
      ry: round(camera.rotation.y, 3),
      rz: round(camera.rotation.z, 3),
      fov: round(camera.fov),
    })
  })

  return null
}

export function CameraInfoPanel() {
  const [info, setInfo] = useState({})
  const [copied, setCopied] = useState(false)
  _setInfoExternal = setInfo

  const posStr = `[${info.px}, ${info.py}, ${info.pz}]`
  const rotStr = `[${info.rx}, ${info.ry}, ${info.rz}]`

  const handleCopy = useCallback(() => {
    const text = `position: ${posStr}\nrotation: ${rotStr}\nfov: ${info.fov}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    })
  }, [posStr, rotStr, info.fov])

  return (
    <div
      onClick={handleCopy}
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        background: copied ? 'rgba(0,80,0,0.85)' : 'rgba(0,0,0,0.75)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 13,
        padding: '12px 16px',
        borderRadius: 8,
        lineHeight: 1.6,
        pointerEvents: 'auto',
        cursor: 'pointer',
        transition: 'background 0.2s',
        zIndex: 1000,
      }}
    >
      <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>
        {copied ? 'Copied!' : 'Camera Info'}{' '}
        <span style={{ color: '#666', fontWeight: 'normal', fontSize: 11 }}>
          {copied ? '' : '(click to copy all)'}
        </span>
      </div>
      <div>position: {posStr}</div>
      <div>rotation: {rotStr}</div>
      <div>fov: {info.fov}</div>
    </div>
  )
}
