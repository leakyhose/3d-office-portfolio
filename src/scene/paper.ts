import { drawExperiencePaper } from '../drawExperiencePaper'

// Start drawing as soon as the Stage chunk loads, in parallel with the GLB.
// Stage waits for paperCanvasReady before mounting the scene.
let paperCanvas: HTMLCanvasElement | null = null
export const paperCanvasReady: Promise<void> = drawExperiencePaper(1448)
  .then((c) => { paperCanvas = c; performance.mark('stage:paper-drawn') })
  .catch(() => {})

export const getPaperCanvas = () => paperCanvas
