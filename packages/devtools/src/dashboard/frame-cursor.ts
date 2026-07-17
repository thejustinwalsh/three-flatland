/**
 * Time-travel frame cursor (#29 Phase A — passive frame-link).
 *
 * `null` = live (panels tail as usual). A number parks every panel at
 * that engine frame: stats read the ring sample at frame ≤ cursor, the
 * protocol log scrolls to the nearest row and stops tailing, buffers
 * freeze (historical playback is the Phase C flight recorder).
 *
 * Cursors are remembered per provider — switching producers restores
 * that producer's parked position (or live).
 */

type Listener = () => void

const cursorByProvider = new Map<string, number>()
let activeProviderId: string | null = null
let liveCursor: number | null = null
const listeners = new Set<Listener>()

function fire(): void {
  for (const cb of listeners) {
    try {
      cb()
    } catch {
      /* listener errors shouldn't break the cursor */
    }
  }
}

export function addFrameCursorListener(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** The parked frame, or null when live. */
export function getFrameCursor(): number | null {
  return liveCursor
}

/**
 * Park at a frame (clamped by callers to their known range). Passing
 * `null` deletes the active provider's parked cursor entirely, not
 * just sets it to "live" — the next `setCursorProvider` switch away
 * and back finds no stored entry and comes up live rather than
 * re-parking at the old frame.
 */
export function setFrameCursor(frame: number | null): void {
  if (liveCursor === frame) return
  liveCursor = frame
  if (activeProviderId !== null) {
    if (frame === null) cursorByProvider.delete(activeProviderId)
    else cursorByProvider.set(activeProviderId, frame)
  }
  fire()
}

/**
 * Return to live. Deletes the active provider's parked cursor (see
 * `setFrameCursor`) — intentional: a manual go-live is a decision to
 * stop watching a specific frame, so switching providers and back
 * should not silently re-park.
 */
export function goLive(): void {
  setFrameCursor(null)
}

/**
 * Provider switch: remember the outgoing provider's cursor, restore
 * the incoming one's (per-provider cursor semantics).
 */
export function setCursorProvider(providerId: string | null): void {
  if (activeProviderId === providerId) return
  activeProviderId = providerId
  const restored = providerId !== null ? (cursorByProvider.get(providerId) ?? null) : null
  if (liveCursor !== restored) {
    liveCursor = restored
    fire()
  }
}
