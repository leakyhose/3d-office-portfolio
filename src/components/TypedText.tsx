import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { TextSegment, TypedAnchor, TypedTextProps } from '../types'
import { UntypeTrackerContext } from './useUntypeTracker'

/*
 * Typewriter text. The visible part of the string is a window [s, e) over its
 * cells (the icon counts as one cell). Typing extends the window, erasing
 * shrinks it; reversing mid-animation just changes direction, so nothing jumps.
 *
 * The line always occupies its full final size (hidden cells keep their
 * space), so surrounding layout never moves. Where the visible glyphs sit
 * inside that box depends on the line's anchor, detected from the computed
 * alignment of its container (or the `anchor` prop):
 *
 *   left   types left -> right in place, erases from the right.
 *   right  stays flush right: each new char enters at the right edge and the
 *          line steps left one cell (VT323 is monospace); erases from the
 *          left, so the remaining chars never move.
 *   center stays centered while it grows / shrinks.
 *
 * Right / center lines are drawn by reordering cells inside each visual line
 * (hidden cells first, visible run last, for right). The visual lines come
 * from the natural layout of the full text and each is pinned in its own
 * nowrap inline-block, so a wrapped paragraph never re-wraps mid-animation.
 *
 * Progress is time based on one shared rAF clock and written straight to the
 * DOM (no React render per character).
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

// Anchor detection and line measurement read layout. Every TypedText whose
// visibility changes in a commit (a whole panel mounting or erasing) queues
// its resolve, and the queue runs once all effects are done: every DOM write
// first, then every read, then the writes the reads decided. One layout for
// the whole panel instead of one per line.
interface Resolver {
  prepare: () => void
  measure: () => void
  commit: () => void
}
const resolveQueue = new Set<Resolver>()
function flushResolves() {
  const queued = [...resolveQueue]
  resolveQueue.clear()
  for (const r of queued) r.prepare()
  for (const r of queued) r.measure()
  for (const r of queued) r.commit()
}
function queueResolve(r: Resolver) {
  if (!resolveQueue.size) queueMicrotask(flushResolves)
  resolveQueue.add(r)
}

// Measured line breaks are cached until something can re-wrap text.
let layoutGen = 0
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => { layoutGen++ })
  document.fonts?.addEventListener('loadingdone', () => { layoutGen++ })
}

// Scramble glyphs for the leading character. Letters map to glyphs with the
// same line-breaking class (and VT323 is monospace), so layout never changes.
const LETTER_GLYPHS = 'ABCDEFGHJKMNPQRSTUVWXYZabdeghkmnpqrsuvwxyz#@&*'
const DIGIT_GLYPHS = '0123456789'
function scramble(ch: string): string {
  if (/[A-Za-z]/.test(ch)) return LETTER_GLYPHS[(Math.random() * LETTER_GLYPHS.length) | 0]
  if (/[0-9]/.test(ch)) return DIGIT_GLYPHS[(Math.random() * DIGIT_GLYPHS.length) | 0]
  return ch
}

const NBSP = ' '
const ICON = -1

interface Cell { ch: string; seg: number }
/** Visual line: cells [a, b); content ends at `end` (trailing spaces excluded). */
interface Line { a: number; b: number; end: number }
type Phase = 'type' | 'erase' | 'idle'
type EdgeKind = 'type' | 'erase'
type Mode = 'on' | 'off' | 'edge' | 'trail'
interface Entry { i: number; mode: Mode }
interface TextRun { node: Text; start: number }

// ── Anchor detection ──
function alignOf(value: string): TypedAnchor | null {
  const v = value.replace(/^(safe|unsafe) /, '')
  if (v === 'right' || v === 'end' || v === 'flex-end' || v === 'self-end' || v === '-webkit-right') return 'right'
  if (v === 'center' || v === '-webkit-center') return 'center'
  return null
}

/** How a shrink-wrapped, left-aligned box is itself placed by its parent. */
function boxAnchor(el: HTMLElement, cs: CSSStyleDeclaration): TypedAnchor | null {
  if (cs.position === 'absolute' || cs.position === 'fixed') {
    if (typeof el.computedStyleMap === 'function') {
      const map = el.computedStyleMap()
      const left = map.get('left')?.toString()
      const right = map.get('right')?.toString()
      return left === 'auto' && right !== 'auto' ? 'right' : null
    }
    return parseFloat(cs.right) < parseFloat(cs.left) ? 'right' : null
  }
  const parent = el.parentElement
  if (!parent) return null
  const ps = getComputedStyle(parent)
  if (ps.display.endsWith('flex')) {
    if (ps.flexDirection.startsWith('column')) {
      return alignOf(cs.alignSelf === 'auto' ? ps.alignItems : cs.alignSelf)
    }
    return alignOf(ps.justifyContent)
  }
  if (ps.display.endsWith('grid')) {
    return alignOf(cs.justifySelf === 'auto' ? ps.justifyItems : cs.justifySelf)
  }
  return null
}

function detectAnchor(root: HTMLElement): TypedAnchor {
  let el: HTMLElement | null = root
  while (el) {
    const d = getComputedStyle(el).display
    if (d !== 'inline' && d !== 'contents') break
    el = el.parentElement
  }
  if (!el) return 'left'
  const cs = getComputedStyle(el)
  return alignOf(cs.textAlign) ?? boxAnchor(el, cs) ?? 'left'
}

// ── Line measurement (natural layout only) ──
function trimEnd(cells: Cell[], a: number, b: number): number {
  let end = b
  while (end > a && cells[end - 1].seg !== ICON && /\s/.test(cells[end - 1].ch)) end--
  return end
}

function measureLines(runs: TextRun[], cells: Cell[]): Line[] {
  const total = cells.length
  const single = [{ a: 0, b: total, end: trimEnd(cells, 0, total) }]
  const pos: { i: number; node: Text; off: number }[] = []
  for (const run of runs) {
    for (let k = 0; k < run.node.length; k++) pos.push({ i: run.start + k, node: run.node, off: k })
  }
  const n = pos.length
  if (n < 2) return single
  const range = document.createRange()
  const rectAt = (k: number) => {
    range.setStart(pos[k].node, pos[k].off)
    range.setEnd(pos[k].node, pos[k].off + 1)
    return range.getBoundingClientRect()
  }
  // First char at or after k that has a box (collapsed spaces at a break have none).
  const boxedFrom = (k: number) => {
    for (; k < n; k++) {
      const r = rectAt(k)
      if (r.width || r.height) return { k, r }
    }
    return null
  }
  const first = boxedFrom(0)
  if (!first || !first.r.height) return single
  const last = rectAt(n - 1)
  if (Math.abs(last.top - first.r.top) < first.r.height / 2) return single

  // Line index never decreases along the text, so each break is found by
  // binary search: a few rect reads per line instead of one per character.
  const breaks: number[] = []
  let lineTop = first.r.top
  let h = first.r.height
  let lo = first.k
  for (;;) {
    const below = (k: number) => {
      const b = boxedFrom(k)
      return b !== null && b.r.top > lineTop + h / 2
    }
    // the rest of the text is on this line
    if (!below(n - 1)) break
    let a = lo + 1
    let b = n - 1
    while (a < b) {
      const mid = (a + b) >> 1
      if (below(mid)) b = mid
      else a = mid + 1
    }
    const next = boxedFrom(a)
    if (!next || next.r.top <= lineTop + h / 2) break
    breaks.push(pos[next.k].i)
    lineTop = next.r.top
    h = next.r.height || h
    lo = next.k
  }
  const lines: Line[] = []
  let a = 0
  for (const b of [...breaks, total]) {
    if (b > a) lines.push({ a, b, end: trimEnd(cells, a, b) })
    a = b
  }
  return lines.length ? lines : single
}

// ── Cursor placement ──
function edgeFor(phase: Phase, anchor: TypedAnchor, s: number, e: number, total: number): { c: number; kind: EdgeKind } {
  const none = { c: -1, kind: 'type' as EdgeKind }
  if (phase === 'idle') return none
  if (phase === 'type') {
    // Re-adding on the left (reversal of an erase-from-left) happens first.
    if (s > 0) return e === total ? { c: s - 1, kind: 'type' } : { c: e, kind: 'erase' }
    return e < total ? { c: e, kind: 'type' } : none
  }
  if (anchor === 'right') {
    if (e === total) return s > 0 ? { c: s - 1, kind: 'erase' } : none
    return { c: e, kind: 'erase' }
  }
  return e > s && e < total ? { c: e, kind: 'erase' } : none
}

function naturalEntries(total: number, s: number, e: number, c: number): Entry[] {
  const out: Entry[] = []
  for (let i = 0; i < total; i++) out.push({ i, mode: i === c ? 'edge' : i >= s && i < e ? 'on' : 'off' })
  return out
}

function anchoredEntries(lines: Line[], anchor: TypedAnchor, s: number, e: number, c: number): (Entry | null)[] {
  const out: (Entry | null)[] = []
  lines.forEach((line, li) => {
    const runA = Math.max(line.a, s)
    const runB = Math.max(runA, Math.min(line.end, e))
    const edgeHere = c >= line.a && c < line.end
    const hidden: Entry[] = []
    for (let i = line.a; i < line.end; i++) {
      if ((i < runA || i >= runB) && i !== c) hidden.push({ i, mode: 'off' })
    }
    const run: Entry[] = []
    for (let i = runA; i < runB; i++) run.push({ i, mode: 'on' })
    const edge: Entry[] = edgeHere ? [{ i: c, mode: 'edge' }] : []
    const before = edgeHere && c < runA ? edge : []
    const after = edgeHere && c >= runA ? edge : []
    const split = anchor === 'center' ? hidden.length >> 1 : hidden.length
    out.push(...hidden.slice(0, split), ...before, ...run, ...after, ...hidden.slice(split))
    for (let i = line.end; i < line.b; i++) out.push({ i, mode: 'trail' })
    if (li < lines.length - 1) out.push(null)
  })
  return out
}

interface BuildCtx {
  cells: Cell[]
  segs: TextSegment[]
  icon?: string
  rotated: boolean
  kind: EdgeKind
  onSegClick: (seg: number, e: MouseEvent) => void
}

/** Rebuild the visual layer. Returns the edge's text node and the text runs (for measuring). */
function build(vis: HTMLElement, entries: (Entry | null)[], ctx: BuildCtx): { edge: Text | null; runs: TextRun[] } {
  vis.textContent = ''
  // Multi-line (null separators): each visual line is its own nowrap
  // inline-block. Consecutive lines can't share a row (they didn't fit together
  // originally), and unlike <br> this keeps the container's intrinsic widths.
  const newLine = () => {
    const line = document.createElement('span')
    line.className = 'typed-line'
    vis.appendChild(line)
    return line
  }
  const multi = entries.includes(null)
  let container: HTMLElement = multi ? newLine() : vis
  const runs: TextRun[] = []
  let edge: Text | null = null
  let group: { seg: number; mode: Mode; text: string; start: number } | null = null

  const element = (seg: number, mode: Mode, text: string, start: number) => {
    const s = ctx.segs[seg]
    const link = mode === 'on' && s.href
    const el = document.createElement(link ? 'a' : 'span')
    const cls = [s.className]
    if (mode === 'off' || mode === 'trail') cls.push('typed-off')
    if (mode === 'edge') cls.push(ctx.kind === 'erase' ? 'typed-edge typed-edge-erase' : 'typed-edge')
    const className = cls.filter(Boolean).join(' ')
    if (className) el.className = className
    if (link && s.href) {
      el.setAttribute('href', s.href)
      if (/^https?:/.test(s.href)) {
        el.setAttribute('target', '_blank')
        el.setAttribute('rel', 'noreferrer')
      }
    }
    if (mode === 'on' && s.onClick) el.onclick = (e) => ctx.onSegClick(seg, e)
    const node = document.createTextNode(text)
    el.appendChild(node)
    container.appendChild(el)
    if (!ctx.rotated) runs.push({ node, start })
    return node
  }
  const flush = () => {
    if (group) element(group.seg, group.mode, group.text, group.start)
    group = null
  }

  for (const entry of entries) {
    if (!entry) {
      flush()
      container = newLine()
      continue
    }
    const cell = ctx.cells[entry.i]
    if (entry.mode === 'trail' && multi) {
      // The line-break space sits between the line blocks, exactly where it
      // was: line + space + next line still can't share a row, and intrinsic
      // widths stay the same.
      flush()
      const sp = document.createElement('span')
      sp.className = 'typed-off'
      sp.textContent = cell.ch
      vis.appendChild(sp)
      continue
    }
    if (cell.seg === ICON) {
      flush()
      const i = document.createElement('i')
      i.className = `hn hn-${ctx.icon}`
      if (entry.mode !== 'on') i.style.visibility = 'hidden'
      container.appendChild(i)
      continue
    }
    // Hidden / cursor cells in a reordered line must keep their width:
    // a collapsible space could merge with a neighbour or vanish at line start.
    const ch = ctx.rotated && cell.ch === ' ' && (entry.mode === 'off' || entry.mode === 'edge') ? NBSP : cell.ch
    if (entry.mode === 'edge') {
      flush()
      edge = element(cell.seg, 'edge', ctx.kind === 'type' ? scramble(ch) : ch, entry.i)
      continue
    }
    if (group && group.seg === cell.seg && group.mode === entry.mode) {
      group.text += ch
    } else {
      flush()
      group = { seg: cell.seg, mode: entry.mode, text: ch, start: entry.i }
    }
  }
  flush()
  return { edge, runs }
}

interface Impl {
  paint: (phase: Phase) => void
  resolver: Resolver
}

function TypedText({ text, segments, visible, speed, untypeSpeed = speed, onTyped, onUntyped, icon, iconPosition = 'before', anchor }: TypedTextProps) {
  const tracker = useContext(UntypeTrackerContext)

  const segs = segments ?? [{ text: text ?? '' }]
  const fullText = segs.map(s => s.text).join('')
  const hasLinks = segs.some(s => s.href)
  const contentKey = JSON.stringify([icon ?? '', iconPosition, segs.map(s => [s.text, s.className ?? '', s.href ?? ''])])
  const total = fullText.length + (icon ? 1 : 0)

  const rootRef = useRef<HTMLSpanElement>(null)
  const visRef = useRef<HTMLSpanElement>(null)
  const stateRef = useRef({ s: 0, e: 0 })
  const emptyRef = useRef(true)
  const idRef = useRef<object | null>(null)
  const layoutRef = useRef<{ anchor: TypedAnchor; lines: Line[] | null; gen: number; key: string }>({ anchor: 'left', lines: null, gen: -1, key: '' })
  const implRef = useRef<Impl | null>(null)
  // Imperative DOM state: last structure signature, edge text node (for the
  // per-frame scramble) and the text runs of the natural layout (for measuring).
  const domRef = useRef<{ sig: string; edge: Text | null; runs: TextRun[] | null }>({ sig: '', edge: null, runs: null })
  const cbRef = useRef({ onTyped, onUntyped })

  // Latest props for the imperative layer (closures are rebuilt each render).
  useLayoutEffect(() => {
    cbRef.current = { onTyped, onUntyped }
    const cells: Cell[] = []
    if (icon && iconPosition !== 'after') cells.push({ ch: '', seg: ICON })
    segs.forEach((seg, si) => {
      for (let k = 0; k < seg.text.length; k++) cells.push({ ch: seg.text[k], seg: si })
    })
    if (icon && iconPosition === 'after') cells.push({ ch: '', seg: ICON })

    const dom = domRef.current
    const ctxBase = {
      cells, segs, icon,
      onSegClick: (si: number, e: MouseEvent) => segs[si]?.onClick?.(e),
    }

    const paint = (phase: Phase) => {
      const root = rootRef.current
      const vis = visRef.current
      if (!root || !vis) return
      const st = stateRef.current
      const L = layoutRef.current
      const anchorNow = L.anchor
      const edge = edgeFor(phase, anchorNow, st.s, st.e, total)
      const kind = edge.kind
      const c = edge.c >= total || (edge.c >= 0 && cells[edge.c].seg === ICON) ? -1 : edge.c
      const rotated = phase !== 'idle' && anchorNow !== 'left' && L.lines !== null
      const nextSig = `${rotated ? L.gen : 'n'}|${anchorNow}|${st.s}|${st.e}|${c}|${kind}`
      if (nextSig !== dom.sig) {
        dom.sig = nextSig
        const entries = rotated && L.lines
          ? anchoredEntries(L.lines, anchorNow, st.s, st.e, c)
          : naturalEntries(total, st.s, st.e, c)
        const out = build(vis, entries, { ...ctxBase, rotated, kind })
        dom.edge = out.edge
        dom.runs = rotated ? null : out.runs
      } else if (dom.edge && kind === 'type' && c >= 0 && /[A-Za-z0-9]/.test(cells[c].ch)) {
        dom.edge.data = scramble(cells[c].ch)
      }

      const shown = st.e - st.s
      const empty = shown <= 0
      root.classList.toggle('is-empty', empty)
      root.classList.toggle('is-done', phase === 'idle' && st.s === 0 && st.e === total)
      if (empty !== emptyRef.current) {
        emptyRef.current = empty
        if (idRef.current) tracker?.report(idRef.current, empty)
      }
    }

    // Decide the anchor and, for right / center, the visual lines of the
    // natural layout (cached until resize / font load / content change).
    // Split in phases for the resolve queue (see flushResolves).
    const resolver: Resolver = {
      // writes: measuring needs the natural (unrotated) layout in the DOM
      prepare: () => {
        const vis = visRef.current
        if (!vis || dom.runs) return
        const L = layoutRef.current
        if (anchor === 'left' || (L.lines && L.gen === layoutGen && L.key === contentKey)) return
        const st = stateRef.current
        const out = build(vis, naturalEntries(total, st.s, st.e, -1), { ...ctxBase, rotated: false, kind: 'type' })
        dom.runs = out.runs
        dom.edge = null
        dom.sig = ''
      },
      // reads only
      measure: () => {
        const root = rootRef.current
        if (!root) return
        const L = layoutRef.current
        const a = anchor ?? detectAnchor(root)
        L.anchor = a
        if (a === 'left') return
        if (L.lines && L.gen === layoutGen && L.key === contentKey) return
        if (!dom.runs) return
        L.lines = measureLines(dom.runs, cells)
        L.gen = layoutGen
        L.key = contentKey
      },
      commit: () => {
        const root = rootRef.current
        const a = layoutRef.current.anchor
        if (root && root.dataset.anchor !== a) root.dataset.anchor = a
      },
    }

    implRef.current = { paint, resolver }
  })

  // (Re)build when the content changes.
  useLayoutEffect(() => {
    const st = stateRef.current
    st.s = Math.min(st.s, total)
    st.e = Math.min(st.e, total)
    layoutRef.current.lines = null
    domRef.current.sig = ''
    implRef.current?.paint('idle')
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

  // Drive the animation toward the target.
  useEffect(() => {
    rootRef.current?.classList.toggle('is-off', !visible)
    const impl = implRef.current
    if (!impl) return
    // Alignment + line measurement run batched with every other line that
    // changes in this commit (before the first tick); painting happens in
    // the shared tick.
    queueResolve(impl.resolver)
    const st = stateRef.current
    const s0 = st.s
    const e0 = st.e
    const typing = visible
    const steps = typing ? s0 + (total - e0) : e0 - s0
    const ms = typing ? speed : untypeSpeed
    // decided by the resolve queue, which runs before the first tick
    let fromLeft: boolean | null = null

    const settle = () => {
      st.s = 0
      st.e = typing ? total : 0
      implRef.current?.paint('idle')
      if (typing) cbRef.current.onTyped?.()
      else cbRef.current.onUntyped?.()
    }
    if (steps <= 0 || reducedMotion?.matches || !(ms > 0)) {
      settle()
      return
    }

    const phase: Phase = typing ? 'type' : 'erase'
    const apply = (k: number) => {
      if (typing) {
        const ds = Math.min(k, s0)
        st.s = s0 - ds
        st.e = Math.min(total, e0 + k - ds)
      } else if ((fromLeft ??= layoutRef.current.anchor === 'right')) {
        st.s = Math.min(e0, s0 + k)
      } else {
        st.e = Math.max(s0, e0 - k)
      }
    }
    const t0 = performance.now()
    const tick: Tick = (now) => {
      // One cell per `ms`.
      const k = Math.floor(Math.max(0, now - t0) / ms)
      if (k >= steps) {
        settle()
        return false
      }
      apply(k)
      implRef.current?.paint(phase)
      return true
    }
    startTick(tick)
    return () => stopTick(tick)
  }, [visible, total, speed, untypeSpeed, contentKey, anchor])

  return (
    <span ref={rootRef} className="typed is-empty is-off">
      {visible && !hasLinks && <span className="typed-sr">{fullText}</span>}
      <span ref={visRef} className="typed-vis" aria-hidden={hasLinks ? undefined : true} />
    </span>
  )
}

export default TypedText
