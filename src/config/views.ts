import type { ViewsMap, Subject } from '../types'

// Poses are authored for a 16:10 viewport with the panels beside the subject;
// src/components/camera/framing.ts adapts them to the actual aspect ratio and
// layout using each view's `subject` (GLB object names).

const INITIAL_POSITION: [number, number, number] = [-5.9, 10.47, 14.15]
const INITIAL_ROTATION: [number, number, number] = [-0.588, -0.637, -0.377]

/** Intro: the camera starts in front of the monitor while it boots. */
export const START_POSITION: [number, number, number] = [-0.18, 7.28, 3.85]
export const START_ROTATION: [number, number, number] = [-0.154, -0.026, -0.004]
export const START_SUBJECT: Subject = { names: ['ComputerScreen'], pad: 0.02 }

/** Fog during the intro (colour, near, far); lifts as the camera pulls back. */
export const INTRO_FOG: [string, number, number] = ['#1e1a15', 20, 65]

export const ANIM_DURATION = 1.5
export const INTRO_ZOOM_DURATION = 3.0

export const VIEWS: ViewsMap = {
  home: {
    position: INITIAL_POSITION,
    rotation: INITIAL_ROTATION,
    pivotObject: 'ComputerScreen',
    // what's on the desk (legs and chair may run off the frame)
    subject: {
      names: ['Computer_monitor001_ComputerDesk_0', 'Cube010_WhiteFur_0', 'Keyboard_ComputerDesk_0', 'Mousepad_ComputerDesk_0', 'EXPERIENCE_PAPER', 'CD_case_ComputerDesk_0', 'Phone_stand_ComputerDesk_0'],
      pad: 0.3,
    },
    left: null,
    right: 'home',
  },
  about: {
    position: [-0.29, 5.61, 3.55],
    rotation: [2.514, 1.373, -2.523],
    pivotObject: 'Cup',
    // the mug plus the steam rising from it
    subject: { names: ['Cup'], pad: 0.15, padTop: 1.4 },
    // portrait: from the front, above the desk (the side angle has the
    // speaker and PC case in the way once the camera backs off)
    stackedLook: [-0.35, -0.5, -1],
    left: 'about',
    right: null,
  },
  experience: {
    position: [5.62, 6.94, 2.95],
    rotation: [-1.367, 0.015, 0.073],
    pivotObject: 'EXPERIENCE_PAPER',
    subject: { names: ['EXPERIENCE_PAPER'], pad: 0.04 },
    left: null,
    right: 'experience',
  },
  projects: {
    position: [0.05, 7.52, 5.13],
    rotation: [-0.055, -0.307, -0.017],
    pivotObject: 'ComputerScreen',
    subject: { names: ['ComputerScreen'], pad: 0.08 },
    // portrait: face the screen square-on so the demo fills the width
    stackedLook: [-0.02, -0.12, -1],
    left: null,
    right: 'projects',
  },
  contact: {
    position: [2, 5.42, 2.51],
    rotation: [-0.396, -1.077, -0.353],
    pivotObject: 'Phone_stand_ComputerDesk_0',
    subject: { names: ['Phone_stand_ComputerDesk_0', 'Phonehandle_ComputerDesk_0'], pad: 0.1 },
    stackedLook: [-0.35, -0.6, -1],
    left: null,
    right: 'contact',
  },
}

export const VIEW_ORDER = ['home', 'about', 'experience', 'projects', 'contact'] as const
