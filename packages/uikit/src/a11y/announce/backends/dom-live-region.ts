import type { Announcement, AnnouncementBackend } from '../announcer.js'

const offScreenStyle =
  'border:0;clip:rect(0 0 0 0);height:1px;margin:-1px;overflow:hidden;white-space:nowrap;padding:0;width:1px;position:absolute;'

// Cadence between successive same-politeness announcements once messages back up — long enough for
// a screen reader to actually read one before the next replaces it.
const SLOT_MS = 1000
// Delay between clearing a region and (re-)setting its text — the react-three-a11y trick that makes
// even an identical repeat message re-announce.
const CLEAR_MS = 100

/**
 * Default browser backend: one off-screen `aria-live` region per politeness level, mounted on
 * `document.body`. Same-politeness messages are queued FIFO and drained one per SLOT_MS slot — each
 * drained message is cleared, then (CLEAR_MS later) set — so a burst of same-politeness
 * announcements is delivered in order with none dropped (adversarial finding #9). The old
 * implementation cleared + re-armed a single timer per politeness, so a second announce within
 * ~100ms cancelled the first's pending set and silently dropped it; queueing replaces that.
 */
export function createDomLiveRegionBackend(): AnnouncementBackend {
  const regions = new Map<string, HTMLElement>()
  const queues = new Map<string, Array<string>>()
  const draining = new Set<string>()
  const clearTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const slotTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const ensure = (politeness: string): HTMLElement => {
    let element = regions.get(politeness)
    if (element == null) {
      element = document.createElement('div')
      element.setAttribute('aria-live', politeness)
      element.setAttribute('aria-atomic', 'true')
      element.style.cssText = offScreenStyle
      document.body.appendChild(element)
      regions.set(politeness, element)
    }
    return element
  }

  /**
   * Drains one queued message for `politeness`: clear now, set it CLEAR_MS later. If more messages
   * are still queued once it's set, the rest of the slot is held so the next clear lands exactly
   * SLOT_MS after this one started (matching the fixed cadence); otherwise draining stops
   * immediately so a later announce starts a fresh slot right away instead of waiting out a dead
   * cadence — which is what keeps this compatible with a lone, well-spaced announce still settling
   * in ~CLEAR_MS.
   */
  const drainSlot = (politeness: string): void => {
    const queue = queues.get(politeness)
    const message = queue?.shift()
    if (message == null) {
      draining.delete(politeness)
      return
    }
    const element = ensure(politeness)
    element.textContent = ''
    clearTimers.set(
      politeness,
      setTimeout(() => {
        element.textContent = message
        clearTimers.delete(politeness)
        if (queue != null && queue.length > 0) {
          slotTimers.set(
            politeness,
            setTimeout(() => {
              slotTimers.delete(politeness)
              drainSlot(politeness)
            }, SLOT_MS - CLEAR_MS)
          )
        } else {
          draining.delete(politeness)
        }
      }, CLEAR_MS)
    )
  }

  return {
    announce(a: Announcement) {
      let queue = queues.get(a.politeness)
      if (queue == null) {
        queue = []
        queues.set(a.politeness, queue)
      }
      queue.push(a.message)
      if (!draining.has(a.politeness)) {
        draining.add(a.politeness)
        drainSlot(a.politeness)
      }
    },
    dispose() {
      for (const timer of clearTimers.values()) {
        clearTimeout(timer)
      }
      clearTimers.clear()
      for (const timer of slotTimers.values()) {
        clearTimeout(timer)
      }
      slotTimers.clear()
      draining.clear()
      queues.clear()
      for (const element of regions.values()) {
        element.remove()
      }
      regions.clear()
    },
  }
}
