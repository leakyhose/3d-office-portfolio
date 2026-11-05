import type { ViewsMap, Subject } from '../types'

// Poses are authored for a 16:10 viewport with the panels beside the subject;
// src/components/camera/framing.ts adapts them to the actual aspect ratio and
// layout using each view's `subject` (GLB object names).

// Every pose keeps the panels' text over empty, evenly lit scene (the plain,
// dark floor around the desk, or the backdrop above its horizon): no objects,
// edges, shadows or lighting gradients behind it, at any wide-layout aspect.

// The original view: close above the desk's front-left corner, looking down
// across it. The desk runs up from the lower left, the chair stands large in
// the middle, and the title and menu fill the right over the bare floor.
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
    // Composed on the original 2000x1087 (1.84:1) frame, with the title and
    // menu sized in vw up to that aspect (App.css #home-panel): narrower
    // screens dolly back to keep that frame's width, so the chair keeps its
    // place beside the menu (and the cat stays in frame) instead of sliding
    // under it as the sides crop toward 16:10 and below.
    refAspect: 1.84,
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
    // wall and its skirting under the title). A longer lens from higher up:
    // the sheet is as large as at 50 degrees, but the floor beside the desk
    // shows less, so the frame's bottom ends before the rug and the panel's
    // side is bare, dark floor from top to bottom. On squarer screens the
    // floor between the wall and the rug can't fill the frame; the dolly
    // holds a height above the middle, so wall and rug both stay past the
    // title and the nav links.
    position: [5.95, 8.51, 2.99],
    rotation: [-1.553, 0, 0],
    wideShift: -0.34,
    wideFov: 36,
    narrowHold: 0.35,
    pivotObject: 'EXPERIENCE_PAPER',
    subject: { names: ['EXPERIENCE_PAPER'], pad: 0.04 },
    // portrait: the original, slightly tilted angle (no lens shift there)
    stackedLook: [-0.015, -0.979, -0.202],
    left: null,
    right: 'experience',
  },
  projects: {
    // Square-on to the monitor (its screen plays the project demos), level
    // and a little below its base, lens-shifted up so the frame ends just
    // under the bezel: the speaker and phone beside it stay below the frame
    // and the list and nav sit over bare wall.
    position: [0.75, 5.4, 5.2],
    rotation: [0, 0, 0],
    wideShift: -1.34,
    // as large as the gap beside the panel allows on wider screens
    keepWidth: 2.25,
    // squarer screens: raise the monitor into the space above it, down to
    // just above the phone; slid left to face the monitor head on, which
    // keeps the speaker tucked behind the PC case out of sight
    narrowRaise: { clear: { names: ['Phone_stand_ComputerDesk_0', 'Phonehandle_ComputerDesk_0'] }, slide: 0.9 },
    pivotObject: 'ComputerScreen',
    subject: { names: ['ComputerScreen'], pad: 0.08 },
    // portrait: face the screen square-on so the demo fills the width
    stackedLook: [-0.02, -0.12, -1],
    left: null,
    right: 'projects',
  },
  contact: {
    // Low over the desk, close beside the phone, looking across its keypad
    // toward the dark back corner (the original angle, a step closer): the
    // title and links sit over the unlit wall above the desk's far edge.
    // The exception to the rule above: from this low the desk fills the
    // bottom of the frame, so the section nav sits over its bare, evenly lit
    // top, below the experience sheet.
    position: [2.26, 5.37, 2.38],
    rotation: [-0.396, -1.077, -0.353],
    // wider screens show more on the left (the whole phone) and keep the
    // scene behind the panel as at 16:10, sheet clear of the text
    wideAnchor: -1,
    pivotObject: 'Phone_stand_ComputerDesk_0',
    subject: { names: ['Phone_stand_ComputerDesk_0', 'Phonehandle_ComputerDesk_0'], pad: 0.1 },
    stackedLook: [-0.35, -0.6, -1],
    left: null,
    right: 'contact',
  },
}

export const VIEW_ORDER = ['home', 'about', 'experience', 'projects', 'contact'] as const
