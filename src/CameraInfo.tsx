import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useState, useCallback, useEffect } from 'react'
import type * as THREE from 'three'
import type { CameraInfoState } from './types'

const round = (v: number, d = 2) => Number(v.toFixed(d))

let _setInfoExternal: React.Dispatch<React.SetStateAction<CameraInfoState>> | null = null

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
      fov: round((camera as THREE.PerspectiveCamera).fov),
    })
  })

  return null
}

/** Free-cam HUD: the controls, plus the live pose (click to copy it, for authoring views). */
export function CameraInfoPanel() {
  const [info, setInfo] = useState<CameraInfoState>({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    _setInfoExternal = setInfo
    return () => {
      if (_setInfoExternal === setInfo) _setInfoExternal = null
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(t)
  }, [copied])

  const posStr = `[${info.px}, ${info.py}, ${info.pz}]`
  const rotStr = `[${info.rx}, ${info.ry}, ${info.rz}]`

  const handleCopy = useCallback(() => {
    const text = `position: ${posStr}\nrotation: ${rotStr}\nfov: ${info.fov}`
    navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})
  }, [posStr, rotStr, info.fov])

  return (
    <div className="freecam-hud">
      <p className="freecam-title">Free cam</p>
      <ul className="freecam-controls">
        <li><kbd>drag</kbd>orbit</li>
        <li><kbd>shift</kbd>+<kbd>drag</kbd>pan</li>
        <li><kbd>scroll</kbd>zoom</li>
        <li><kbd>Tab</kbd>back</li>
      </ul>
      <button type="button" className="freecam-pose" onClick={handleCopy} title="Copy camera pose">
        <span>pos {posStr}</span>
        <span>rot {rotStr}</span>
        <span>{copied ? 'pose copied' : `fov ${info.fov}`}</span>
      </button>
    </div>
  )
}
