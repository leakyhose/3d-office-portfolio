import * as THREE from 'three'

/**
 * Minimal stand-in for the drei/three-stdlib OrbitControls the camera code
 * used to hold a look-at target (rotate/zoom/pan were all disabled, so all it
 * did was `camera.lookAt(target)`). Avoids pulling three-stdlib into the bundle.
 */
export class CameraRig {
  readonly target = new THREE.Vector3()
  private readonly camera: THREE.Camera

  constructor(camera: THREE.Camera) {
    this.camera = camera
  }

  update() {
    this.camera.lookAt(this.target)
  }
}
