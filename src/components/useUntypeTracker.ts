import { createContext, useEffect, useLayoutEffect, useState } from 'react'

/**
 * Tracks whether every TypedText inside a panel has finished erasing.
 *
 * Instead of counting `onUntyped` events against a hand-maintained number
 * (which drifts whenever a panel's TypedText count changes, double-counts on
 * re-renders, and loses events that fire before the counter resets), each
 * TypedText registers itself through context and reports whether it is
 * currently empty. The panel is "done" when it is hidden and nothing
 * registered is still showing characters. `onComplete` fires exactly once per
 * hide.
 */
export class UntypeTracker {
  private members = new Set<object>()
  private busy = new Set<object>()
  private visible: boolean
  private fired = false
  private complete?: () => void

  constructor(visible: boolean) {
    this.visible = visible
  }

  setOnComplete(complete: (() => void) | undefined) {
    this.complete = complete
  }

  register(id: object, empty: boolean) {
    this.members.add(id)
    if (empty) this.busy.delete(id)
    else this.busy.add(id)
    this.check()
  }

  unregister(id: object) {
    this.members.delete(id)
    this.busy.delete(id)
    this.check()
  }

  report(id: object, empty: boolean) {
    if (!this.members.has(id)) return
    if (empty) {
      this.busy.delete(id)
      this.check()
    } else {
      this.busy.add(id)
    }
  }

  setVisible(visible: boolean) {
    if (visible !== this.visible) {
      this.visible = visible
      if (visible) this.fired = false
    }
    this.check()
  }

  private check() {
    if (this.visible || this.fired || this.busy.size > 0) return
    this.fired = true
    this.complete?.()
  }
}

export const UntypeTrackerContext = createContext<UntypeTracker | null>(null)

/** Create the tracker for a panel; provide it via `<UntypeTrackerContext value={tracker}>`. */
export default function useUntypeTracker(visible: boolean, onComplete?: () => void): UntypeTracker {
  const [tracker] = useState(() => new UntypeTracker(visible))
  useLayoutEffect(() => {
    tracker.setOnComplete(onComplete)
  }, [tracker, onComplete])
  // Parent effects run after child effects, so by the time the tracker learns
  // about a visibility change every TypedText has already reacted to it.
  useEffect(() => {
    tracker.setVisible(visible)
  }, [tracker, visible])
  return tracker
}
