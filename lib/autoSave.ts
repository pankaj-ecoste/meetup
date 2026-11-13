// Auto-save countdown for the meeting review screen.
//
// When the AI result appears, a 10-second countdown starts. If the person does
// NOTHING for those 10 seconds the meeting is saved for them; the moment they
// touch, tap, type or scroll anything, the countdown is cancelled for good and
// the Save button is theirs. Pure (no React) so the timing and the "any
// interaction stops it" rule can be tested with a fake clock and a fake document.

export const AUTO_SAVE_SECONDS = 10

// A scroll event can also come from the page settling when the review screen
// first appears (the layout grows, the browser re-anchors). That is not the
// person. Real scrolling arrives as wheel / touch / key events too, so scroll
// events are only trusted after this short grace period (this still catches a
// dragged scrollbar, which has no other event).
const SCROLL_GRACE_MS = 1000

export type AutoSaveDeps = {
  seconds?: number
  /** Whole seconds left: called with the start value, then once per second. */
  onTick: (secondsLeft: number) => void
  /** Called once when the countdown reaches zero while still active. */
  onFire: () => void
  /** Called when cancelled before it fired (never after firing). */
  onCancel?: () => void
  // Injectable for tests.
  schedule?: (fn: () => void, ms: number) => unknown
  cancelTimer?: (handle: unknown) => void
}

export function createAutoSave(deps: AutoSaveDeps) {
  const seconds = deps.seconds ?? AUTO_SAVE_SECONDS
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const cancelTimer =
    deps.cancelTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let active = false
  let left = seconds
  let handle: unknown = null

  function tick() {
    handle = null
    if (!active) return
    left -= 1
    if (left <= 0) {
      active = false
      deps.onFire()
      return
    }
    deps.onTick(left)
    handle = schedule(tick, 1000)
  }

  return {
    start() {
      if (active) return
      active = true
      left = seconds
      deps.onTick(left)
      handle = schedule(tick, 1000)
    },
    /** Stop for good. A no-op once it has fired or was already cancelled. */
    cancel() {
      if (!active) return
      active = false
      if (handle !== null) cancelTimer(handle)
      handle = null
      deps.onCancel?.()
    },
    isActive: () => active,
  }
}

// Things only a person does. Capture phase on the document, so it also sees
// events inside nested scroll containers (the app scrolls inside <main>, not the window).
const INTERACTION_EVENTS = [
  'pointerdown',
  'mousedown',
  'touchstart',
  'touchmove',
  'wheel',
  'keydown',
  'focusin',
  'input',
]

type DocLike = Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>

/**
 * Calls `onInteract` the first time the person interacts, or the page is hidden
 * (switching app / locking the phone: they are not looking at the screen, so it
 * must not save unseen content). Returns a function that removes the listeners.
 */
export function watchInteraction(
  doc: DocLike,
  onInteract: () => void,
  now: () => number = Date.now,
): () => void {
  const startedAt = now()
  const onScroll = () => {
    if (now() - startedAt > SCROLL_GRACE_MS) onInteract()
  }
  const onVisibility = () => {
    if (doc.visibilityState !== 'visible') onInteract()
  }
  const opts = { capture: true, passive: true }

  for (const e of INTERACTION_EVENTS) doc.addEventListener(e, onInteract, opts)
  doc.addEventListener('scroll', onScroll, opts)
  doc.addEventListener('visibilitychange', onVisibility, opts)

  return () => {
    for (const e of INTERACTION_EVENTS) doc.removeEventListener(e, onInteract, opts)
    doc.removeEventListener('scroll', onScroll, opts)
    doc.removeEventListener('visibilitychange', onVisibility, opts)
  }
}
