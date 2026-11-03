import type { ViewsMap, Subject } from '../types'

// Poses are authored for a 16:10 viewport with the panels beside the subject;
// src/components/camera/framing.ts adapts them to the actual aspect ratio and
// layout using each view's `subject` (GLB object names).

// Every pose keeps the panels' text over empty, evenly lit scene (bare wall,
// floor or darkness): no objects, edges or lighting gradients behind it, at
// any wide-layout aspect.

// From the back-left corner: the title and menu sit over the dark right wall,
// clear of the lamp's pool on the back wall.
const INITIAL_POSITION: [number, number, number] = [-8, 12, 19]
const INITIAL_ROTATION: [number, number, number] = [-0.553, -0.705, -0.381]

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
    // portrait: the original three-quarter view (the stacked framing was tuned on it)
    stackedLook: [0.595, -0.446, -0.669],
    left: null,
    right: 'home',
  },
  about: {
    // a step toward the room's front: the copy sits over the darker, even
    // stretch of the left wall instead of across the lamp's falloff
    position: [-0.29, 5.61, 4.35],
    rotation: [1.041, 1.437, -1.037],
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
    // Straight down over the sheet, lens-shifted so the top of the frame
    // stays on the floor past the desk's end (tilting would bring the back
    // wall and its skirting under the title).
    position: [5.95, 7.36, 2.2],
    rotation: [-1.553, 0, 0],
    wideShift: 0.3,
    pivotObject: 'EXPERIENCE_PAPER',
    subject: { names: ['EXPERIENCE_PAPER'], pad: 0.04 },
    // portrait: the original, slightly tilted angle (no lens shift there)
    stackedLook: [-0.015, -0.979, -0.202],
    left: null,
    right: 'experience',
  },
  projects: {
    // Level, just above the speaker and phone tops, lens-shifted so the
    // frame ends above them: the list and nav sit over bare wall.
    position: [0.2, 6.5, 6.0],
    rotation: [0, -0.2, 0],
    wideShift: -0.74,
    keepWidth: true,
    pivotObject: 'ComputerScreen',
    subject: { names: ['ComputerScreen'], pad: 0.08 },
    // portrait: face the screen square-on so the demo fills the width
    stackedLook: [-0.02, -0.12, -1],
    left: null,
    right: 'projects',
  },
  contact: {
    // From past the desk's end, over the phone onto the back wall; the desk
    // edge and its shadow stay left of the links.
    position: [7.6, 7.9, -0.4],
    rotation: [-1.432, 1.006, 1.407],
    pivotObject: 'Phone_stand_ComputerDesk_0',
    subject: { names: ['Phone_stand_ComputerDesk_0', 'Phonehandle_ComputerDesk_0'], pad: 0.1 },
    stackedLook: [-0.35, -0.6, -1],
    left: null,
    right: 'contact',
  },
}

export const VIEW_ORDER = ['home', 'about', 'experience', 'projects', 'contact'] as const
