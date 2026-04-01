import type { ViewsMap } from '../types'

const INITIAL_POSITION: [number, number, number] = [-5.9, 10.47, 14.15]
const INITIAL_ROTATION: [number, number, number] = [-0.588, -0.637, -0.377]

export const INTRO_POSITION: [number, number, number] = [-18, 22, 30]
export const INTRO_ROTATION = INITIAL_ROTATION

export const START_POSITION: [number, number, number] = [-0.2, 7.38, 4.58]
export const START_ROTATION: [number, number, number] = [-0.198, -0.007, -0.001]

export const ANIM_DURATION = 1.5
export const INTRO_ANIM_DURATION = 1.8
export const INTRO_ZOOM_DURATION = 3.0
export const MIN_LOADING_TIME = 800

export const VIEWS: ViewsMap = {
  home: {
    position: INITIAL_POSITION,
    rotation: INITIAL_ROTATION,
    pivotObject: 'ComputerScreen',
    left: null,
    right: 'home',
    extraDelay: 0,
  },
  about: {
    position: [-0.45, 6.65, 4.09],
    rotation: [-1.496, 1.363, 1.494],
    pivotObject: 'Cup',
    left: 'about',
    right: null,
    extraDelay: 0,
  },
  experience: {
    position: [5.62, 6.94, 2.95],
    rotation: [-1.367, 0.015, 0.073],
    pivotObject: 'Paper2',
    left: null,
    right: 'experience',
    extraDelay: 0,
  },
  projects: {
    position: [0.05, 7.52, 5.13],
    rotation: [-0.055, -0.307, -0.017],
    pivotObject: 'ComputerScreen',
    left: 'projects-nav',
    right: 'projects',
    extraDelay: 0,
  },
  contact: {
    position: [2, 5.42, 2.51],
    rotation: [-0.396, -1.077, -0.353],
    pivotObject: 'Phone_stand',
    left: 'contact-left',
    right: 'contact-right',
    extraDelay: 0,
  },
}
