import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import './App.css'

function App() {
  return (
    <div id="app">
      <Canvas
        camera={{ fov: 50 }}
        shadows
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
      </Canvas>
      <div id="overlay">
      </div>
    </div>
  )
}

export default App
