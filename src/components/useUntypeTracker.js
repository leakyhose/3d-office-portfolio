import { useRef, useCallback, useEffect } from 'react'

export default function useUntypeTracker(count, visible, onComplete) {
  const doneCount = useRef(0)
  const fired = useRef(false)

  useEffect(() => {
    if (!visible) {
      doneCount.current = 0
      fired.current = false
    }
  }, [visible])

  return useCallback(() => {
    doneCount.current++
    if (doneCount.current >= count && !fired.current) {
      fired.current = true
      onComplete?.()
    }
  }, [count, onComplete])
}
