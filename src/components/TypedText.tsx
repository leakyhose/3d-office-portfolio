import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { TypedTextProps } from '../types'
import { UntypeTrackerContext } from './useUntypeTracker'

/*
 * Typewriter text with one consistent rule everywhere:
 *
 *   - The final text is always laid out in full; untyped characters are just
 *     `visibility: hidden`. Nothing reflows or shifts while typing, whatever
 *     the alignment (left, right, centered, wrapped).
 *   - Characters appear left -> right (icon first) with a cursor riding the
 *     leading edge, and erase right -> left back to the start.
 *   - Progress is time based (elapsed / speed) on one shared rAF clock and is
 *     written straight to the DOM, so many lines animate in lockstep without a
 *     React render per character, independent of frame rate or timer clamping.
 *   - Reversing mid-animation continues from the current character.
 */

// ── Shared animation clock ──
type Tick = (now: number) => boolean
const ticks = new Set<Tick>()
let rafId = 0
function frame() {
  const now = performance.now()
  for (const tick of ticks) {
    if (!tick(now)) ticks.delete(tick)
  }
  rafId = ticks.size ? requestAnimationFrame(frame) : 0
}
function startTick(tick: Tick) {
  ticks.add(tick)
  if (!rafId) rafId = requestAnimationFrame(frame)
}
function stopTick(tick: Tick) {
  ticks.delete(tick)
}

const reducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null

// Scramble glyphs for the leading character. Letters only map to glyphs with
// the same line-breaking class (and VT323 is monospace), so the scramble never
// changes layout.
const LETTER_GLYPHS = 'ABCDEFGHJKMNPQRSTUVWXYZabdeghkmnpqrsuvwxyz#@&*'
const DIGIT_GLYPHS = '0123456789'
function scramble(ch: string): string {
  if (/[A-Za-z]/.test(ch)) return LETTER_GLYPHS[(Math.random() * LETTER_GLYPHS.length) | 0]
  if (/[0-9]/.test(ch)) return DIGIT_GLYPHS[(Math.random() * DIGIT_GLYPHS.length) | 0]
  return ch
}

interface SegNodes {
  text: string
  start: number
  el: HTMLElement
  on: Text
  off: HTMLSpanElement
  offText: Text
  sig: number
}

type Phase = 'type' | 'erase' | 'idle'

function TypedText({ text, segments, visible, speed, untypeSpeed = speed, onTyped, onUntyped, icon, iconPosition = 'before' }: TypedTextProps) {
  const tracker = useContext(UntypeTrackerContext)

  const segs = segments ?? [{ text: text ?? '' }]
  const fullText = segs.map(s => s.text).join('')
  const contentKey = segs.map(s => `${s.text}\u0000${s.className ?? ''}`).join('\u0001')
  const iconAfter = iconPosition === 'after'
  const textOffset = icon && !iconAfter ? 1 : 0
  const total = fullText.length + (icon ? 1 : 0)

  const rootRef = useRef<HTMLSpanElement>(null)
  const iconRef = useRef<HTMLElement>(null)
  const segEls = useRef<(HTMLElement | null)[]>([])
  const nodes = useRef<SegNodes[]>([])
  const edgeRef = useRef<HTMLSpanElement | null>(null)
  const shownRef = useRef(0)
  const emptyRef = useRef(true)
  const idRef = useRef<object | null>(null)
  const trackerRef = useRef(tracker)
  const cbRef = useRef({ onTyped, onUntyped })
  useLayoutEffect(() => {
    cbRef.current = { onTyped, onUntyped }
    trackerRef.current = tracker
  })

  // Paint `shown` cells (icon counts as one cell). The cell at the leading
  // edge becomes the cursor: a scrambled glyph while typing, a bare cursor
  // while erasing.
  const paintRef = useRef<(shown: number, phase: Phase) => void>(() => {})
  useLayoutEffect(() => {
    const edgeIndexFor = (shown: number, phase: Phase) => {
      if (phase === 'idle' || shown >= total) return -1
      if (phase === 'erase' && shown === 0) return -1
      const textIdx = shown - textOffset
      return textIdx >= 0 && textIdx < fullText.length ? textIdx : -1
    }
    paintRef.current = (shown, phase) => {
      const root = rootRef.current
      if (!root) return
      const textShown = Math.min(Math.max(shown - textOffset, 0), fullText.length)
      const edgeIdx = edgeIndexFor(shown, phase)
      let edge = edgeRef.current
      if (edgeIdx >= 0 && !edge) {
        edge = edgeRef.current = document.createElement('span')
        edge.appendChild(document.createTextNode(''))
      }

      for (const seg of nodes.current) {
        const local = Math.min(Math.max(textShown - seg.start, 0), seg.text.length)
        const hasEdge = edgeIdx >= seg.start && edgeIdx < seg.start + seg.text.length
        const sig = local * 2 + (hasEdge ? 1 : 0)
        if (sig !== seg.sig) {
          seg.sig = sig
          seg.on.data = seg.text.slice(0, local)
          if (hasEdge && edge) {
            seg.el.insertBefore(edge, seg.off)
            seg.offText.data = seg.text.slice(local + 1)
          } else {
            seg.offText.data = seg.text.slice(local)
          }
        }
      }

      if (edge) {
        if (edgeIdx < 0) {
          edge.remove()
        } else {
          const ch = fullText[edgeIdx]
          edge.className = phase === 'erase' ? 'typed-edge typed-edge-erase' : 'typed-edge'
          ;(edge.firstChild as Text).data = phase === 'type' ? scramble(ch) : ch
        }
      }

      if (iconRef.current) {
        const iconCell = iconAfter ? fullText.length : 0
        iconRef.current.style.visibility = shown > iconCell ? '' : 'hidden'
      }

      const empty = shown === 0
      root.classList.toggle('is-empty', empty)
      root.classList.toggle('is-done', phase === 'idle' && shown === total)
      shownRef.current = shown
      if (empty !== emptyRef.current) {
        emptyRef.current = empty
        if (idRef.current) trackerRef.current?.report(idRef.current, empty)
      }
    }
  }, [fullText, total, textOffset, iconAfter])

  // Build the per-segment DOM (typed text node + hidden remainder). React
  // renders the segment spans empty and never touches their children.
  useLayoutEffect(() => {
    let start = 0
    nodes.current = segs.map((seg, i) => {
      const el = segEls.current[i]!
      el.textContent = ''
      const on = document.createTextNode('')
      const off = document.createElement('span')
      off.className = 'typed-off'
      const offText = document.createTextNode(seg.text)
      off.appendChild(offText)
      el.append(on, off)
      const n = { text: seg.text, start, el, on, off, offText, sig: -1 }
      start += seg.text.length
      return n
    })
    paintRef.current(Math.min(shownRef.current, total), 'idle')
    // segs is derived from contentKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, total])

  // Register with the panel's untype tracker.
  useEffect(() => {
    if (!tracker) return
    const id = {}
    idRef.current = id
    tracker.register(id, emptyRef.current)
    return () => {
      idRef.current = null
      tracker.unregister(id)
    }
  }, [tracker])

  // Drive the animation toward the target. Progress restarts from the
  // currently shown character count, so reversals never jump.
  useEffect(() => {
    const target = visible ? total : 0
    // Hidden (erasing) text is never interactive.
    rootRef.current?.classList.toggle('is-off', !visible)
    const settle = () => {
      paintRef.current(target, 'idle')
      if (target === total) cbRef.current.onTyped?.()
      if (target === 0) cbRef.current.onUntyped?.()
    }

    const from = shownRef.current
    const dir = target > from ? 1 : -1
    const ms = dir > 0 ? speed : untypeSpeed
    if (from === target || reducedMotion?.matches || !(ms > 0)) {
      settle()
      return
    }

    const t0 = performance.now()
    const phase: Phase = dir > 0 ? 'type' : 'erase'
    const tick: Tick = (now) => {
      // One character per `ms`: typing reveals a char once its slot has
      // elapsed, erasing removes one as each slot elapses.
      const steps = Math.floor(Math.max(0, now - t0) / ms)
      const shown = from + dir * steps
      if (dir > 0 ? shown >= target : shown <= target) {
        settle()
        return false
      }
      paintRef.current(shown, phase)
      return true
    }
    paintRef.current(from, phase)
    startTick(tick)
    return () => stopTick(tick)
  }, [visible, total, speed, untypeSpeed, contentKey])

  const iconEl = icon ? <i ref={iconRef} className={`hn hn-${icon}`} style={{ visibility: 'hidden' }} /> : null

  // Text with inline links stays in the accessibility tree (focusable links
  // must not sit under aria-hidden); untyped characters are visibility:hidden,
  // so assistive tech reads exactly what is on screen.
  const hasLinks = segs.some((s) => s.href)

  return (
    <span ref={rootRef} className="typed is-empty is-off">
      {visible && !hasLinks && <span className="typed-sr">{fullText}</span>}
      <span className="typed-vis" aria-hidden={hasLinks ? undefined : true}>
        {!iconAfter && iconEl}
        {segs.map((seg, i) => seg.href ? (
          <a
            key={i}
            ref={(el) => { segEls.current[i] = el }}
            className={seg.className}
            href={seg.href}
            onClick={seg.onClick}
          />
        ) : (
          <span
            key={i}
            ref={(el) => { segEls.current[i] = el }}
            className={seg.className}
            onClick={seg.onClick}
          />
        ))}
        {iconAfter && iconEl}
      </span>
    </span>
  )
}

export default TypedText
