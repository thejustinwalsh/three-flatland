/** @jsxImportSource preact */
/**
 * Time-travel scrubber (#29 Phase A + Phase C slice 2) — sits under the
 * stats strip:
 *
 *   [◀] ──●── [▶]  [N/M]  [● LIVE]  [❄ FREEZE]
 *
 * Entry points: drag the slider, step ◀/▶, or click a protocol-log
 * row. Return to live: the LIVE button, double-click the slider, or
 * Esc — all three now also drop any flight-recorder freeze snapshot
 * (`handleGoLive`), matching "unfreeze = existing goLive semantics"
 * (#29 item 14).
 *
 * Live, the scrubbable range is the frames covered by the stats series
 * ring (~17s at 60 fps) — unchanged from Phase A. Frozen, the range
 * widens (or narrows) to whatever the flight ring's snapshot actually
 * retains, intersected with the protocol store's `retainedRange` so
 * the user is never offered a frame whose protocol log rows already
 * pruned out from under it.
 */
import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import { useDevtoolsState, useFrameTick } from '../hooks.js'
import {
  addFrameCursorListener,
  getFrameCursor,
  goLive,
  setCursorProvider,
  setFrameCursor,
} from '../frame-cursor.js'
import {
  addFlightRingListener,
  freeze,
  frozenClaimableFrameRange,
  getFrozenRing,
  getLiveRing,
  isFrozen,
  unfreeze,
} from '../flight-ring.js'
import { getProtocolStore } from '../protocol-store.js'

/** Oldest/newest engine frame currently held by the stats ring. */
function liveFrameRange(state: ReturnType<typeof useDevtoolsState>): {
  min: number
  max: number
} | null {
  const ring = state.series.frames
  if (ring.length === 0) return null
  const size = ring.data.length
  const newest = ring.data[(ring.write - 1 + size) % size]!
  const oldest = ring.data[(ring.write - ring.length + size) % size]!
  return { min: oldest, max: newest }
}

/**
 * Claimable frame range while frozen: the intersection of the frozen
 * rings' claimable span (primary stats range intersected with the
 * union of every marked buffer's chunk range, see
 * `frozenClaimableFrameRange` — #29 Phase C slice 4) and whatever the
 * protocol store still retains for the selected provider (#29 slice
 * 2, item 2's "claimable range"). `null` when nothing is frozen, or
 * every frozen ring is empty.
 */
function frozenFrameRange(providerId: string | null): { min: number; max: number } | null {
  if (getFrozenRing() === null) return null
  const ringRange = frozenClaimableFrameRange()
  if (ringRange === null) return null
  if (providerId === null) return ringRange
  const retained = getProtocolStore().retainedRange(providerId)
  if (retained === null || retained.oldestFrame === undefined || retained.newestFrame === undefined) {
    return ringRange
  }
  const min = Math.max(ringRange.min, retained.oldestFrame)
  const max = Math.min(ringRange.max, retained.newestFrame)
  return min <= max ? { min, max } : null
}

export function Scrubber() {
  const state = useDevtoolsState()
  useFrameTick()
  const [, setTick] = useState(0)

  useEffect(() => {
    return addFrameCursorListener(() => setTick((n) => (n + 1) & 0xffff))
  }, [])

  // Freeze/unfreeze toggles need their own re-render trigger — neither
  // the frame cursor nor the client state necessarily change when the
  // ring snapshot flips.
  useEffect(() => {
    return addFlightRingListener(() => setTick((n) => (n + 1) & 0xffff))
  }, [])

  // Feed the flight ring's stats-arrival log (#29 slice 2) — one entry
  // per new data batch, so freeze can honestly claim the 30s storage
  // policy independent of the fixed-size `state.series` ring.
  useEffect(() => {
    if (state.frame !== undefined) getLiveRing().pushFrame(state.frame)
  }, [state.frame])

  // Per-provider cursor memory follows the producer switcher. Layout
  // effect, not plain effect: the sync must land before paint so panels
  // reading getFrameCursor() during render never show one frame with the
  // previous provider's cursor. Still post-render, so the listener →
  // setState it triggers isn't mid-render.
  useLayoutEffect(() => {
    setCursorProvider(state.selectedProviderId)
  }, [state.selectedProviderId])

  // Unfreeze (drop the ring snapshot) is coupled to every existing
  // "go live" entry point — Esc, the LIVE button, double-click — so
  // there's no separate "unfreeze" affordance to learn (#29 item 14).
  const handleGoLive = (): void => {
    unfreeze()
    goLive()
  }

  // Esc returns to live (no modal handling needed here — modals stop
  // propagation of their own keys).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      // A handler that consumed Esc (detail pane close, modal) wins.
      if (ev.defaultPrevented) return
      if (ev.key === 'Escape' && getFrameCursor() !== null) handleGoLive()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cursor = getFrameCursor()
  const live = liveFrameRange(state)
  if (live === null) return null

  const frozen = isFrozen()
  // Frozen, prefer the ring snapshot's own (possibly wider or
  // narrower) claimable span; fall back to the live series range if
  // the snapshot came up empty so the scrubber never disappears out
  // from under a frozen session.
  const range = (frozen ? frozenFrameRange(state.selectedProviderId) : null) ?? live

  const parked = cursor !== null
  const shown = parked ? Math.min(Math.max(cursor, range.min), range.max) : range.max

  const step = (delta: number): void => {
    const base = parked ? shown : range.max
    const next = Math.min(range.max, Math.max(range.min, base + delta))
    setFrameCursor(next)
  }

  const onFreeze = (): void => {
    if (isFrozen()) return
    freeze()
    const frozenRange = frozenClaimableFrameRange()
    setFrameCursor(frozenRange?.max ?? state.frame ?? live.max)
  }

  return (
    <div class={`frame-scrubber${parked ? ' parked' : ''}`}>
      <button class="scrub-step" title="Back one frame" onClick={() => step(-1)}>
        ◀
      </button>
      <input
        class="scrub-slider"
        type="range"
        min={range.min}
        max={range.max}
        value={shown}
        onInput={(ev) => setFrameCursor(Number((ev.target as HTMLInputElement).value))}
        onDblClick={() => handleGoLive()}
      />
      <button class="scrub-step" title="Forward one frame" onClick={() => step(1)}>
        ▶
      </button>
      <span class="scrub-frame">
        {parked ? `${shown}/${range.max}` : `${range.max}`}
      </span>
      <button
        class={`scrub-live${parked ? '' : ' active'}`}
        title={parked ? 'Return to live' : 'Live'}
        onClick={() => handleGoLive()}
      >
        ● LIVE
      </button>
      <button
        class={`scrub-freeze${frozen ? ' frozen' : ''}`}
        title={
          frozen
            ? 'Frozen — return to live to unfreeze'
            : 'Freeze the flight recorder ring for retroactive buffer scrubbing'
        }
        disabled={frozen}
        onClick={onFreeze}
      >
        {frozen ? '❄ FROZEN' : '❄ FREEZE'}
      </button>
    </div>
  )
}
