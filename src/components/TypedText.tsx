import { useEffect, useRef, useState } from 'react'
import type { TypedTextProps, TextSegment } from '../types'

function renderSegments(segments: TextSegment[], start: number, end: number): React.ReactNode[] {
  const result: React.ReactNode[] = []
  let pos = 0
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const segEnd = pos + seg.text.length
    if (segEnd <= start) { pos = segEnd; continue }
    if (pos >= end) break

    const sliceStart = Math.max(0, start - pos)
    const sliceEnd = Math.min(seg.text.length, end - pos)
    const slicedText = seg.text.slice(sliceStart, sliceEnd)

    if (seg.className || seg.onClick) {
      result.push(
        <span key={i} className={seg.className} onClick={seg.onClick}>
          {slicedText}
        </span>
      )
    } else {
      result.push(slicedText)
    }
    pos = segEnd
  }
  return result
}

function TypedText({ text, segments, visible, speed, untypeSpeed = speed, onTyped, onUntyped, reserveSpace = false, untypeFrom = 'end', icon }: TypedTextProps) {
  const [length, setLength] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lengthRef = useRef(0)
  const peakRef = useRef(0)
  const prevVisibleRef = useRef(visible)

  const fullText = segments ? segments.map(s => s.text).join('') : text ?? ''
  const iconOffset = icon ? 1 : 0
  const totalLength = fullText.length + iconOffset

  // Capture peak length when visible transitions to false
  if (prevVisibleRef.current && !visible) {
    peakRef.current = length
  }
  prevVisibleRef.current = visible

  useEffect(() => {
    lengthRef.current = length
  }, [length])

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    const target = visible ? totalLength : 0

    if (lengthRef.current === target) {
      if (target === totalLength && onTyped) onTyped()
      if (target === 0 && onUntyped) onUntyped()
      return () => {}
    }

    const tick = () => {
      const current = lengthRef.current
      const dir = target > current ? 1 : -1
      const next = current + dir

      lengthRef.current = next
      setLength(next)

      if (next === target) {
        timeoutRef.current = null
        if (target === totalLength && onTyped) onTyped()
        if (target === 0 && onUntyped) onUntyped()
        return
      }

      timeoutRef.current = setTimeout(tick, dir < 0 ? untypeSpeed : speed)
    }

    timeoutRef.current = setTimeout(tick, speed)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [visible, fullText, speed, untypeSpeed, onTyped, onUntyped, totalLength])

  const target = visible ? totalLength : 0
  const animating = length !== target
  const isUntyping = !visible && length > 0
  const deleteFromStart = isUntyping && untypeFrom === 'start'

  let displayedContent: React.ReactNode
  let showIcon = false

  if (deleteFromStart) {
    const peak = peakRef.current
    const removed = peak - length
    showIcon = Boolean(icon) && removed < 1
    const textStart = Math.max(0, removed - iconOffset)
    const textPeak = peak - iconOffset
    displayedContent = segments
      ? renderSegments(segments, textStart, textPeak)
      : fullText.slice(textStart, textPeak)
  } else {
    showIcon = Boolean(icon) && length >= 1
    const textChars = Math.max(0, length - iconOffset)
    displayedContent = segments
      ? renderSegments(segments, 0, textChars)
      : fullText.slice(0, textChars)
  }

  const iconElement = showIcon ? <i className={`hn hn-${icon}`} /> : null

  const liveText = (
    <>
      {animating && deleteFromStart && <span className="cursor">_</span>}
      {iconElement}
      {displayedContent}
      {animating && !deleteFromStart && <span className="cursor">_</span>}
    </>
  )

  if (!reserveSpace) return liveText

  const reserveContent = segments
    ? segments.map((seg, i) =>
        seg.className
          ? <span key={i} className={seg.className}>{seg.text}</span>
          : seg.text
      )
    : fullText

  return (
    <span className="typed-reserve-wrap">
      <span className="typed-reserve-text">
        {icon && <i className={`hn hn-${icon}`} />}
        {reserveContent}
      </span>
      <span className="typed-live-text">{liveText}</span>
    </span>
  )
}

export default TypedText
