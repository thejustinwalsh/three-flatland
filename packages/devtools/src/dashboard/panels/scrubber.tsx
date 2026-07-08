/** @jsxImportSource preact */
/**
 * Time-travel scrubber (#29 Phase A) — sits under the stats strip:
 *
 *   [◀] ──●── [▶]  [N/M]  [● LIVE]
 *
 * Entry points: drag the slider, step ◀/▶, or click a protocol-log
 * row. Return to live: the LIVE button, double-click the slider, or
 * Esc. The scrubbable range is the frames covered by the stats series
 * ring (~17s at 60 fps); deeper history is the Phase C flight recorder.
 */
import { useEffect, useLayoutEffect } from 'preact/hooks'
import { useDevtoolsState, useFrameTick } from '../hooks.js'
import {
  addFrameCursorListener,
  getFrameCursor,
  goLive,
  setCursorProvider,
  setFrameCursor,
} from '../frame-cursor.js'
import { useState } from 'preact/hooks'

/** Oldest/newest engine frame currently held by the stats ring. */
function frameRange(state: ReturnType<typeof useDevtoolsState>): {
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

export function Scrubber() {
  const state = useDevtoolsState()
  useFrameTick()
  const [, setTick] = useState(0)

  useEffect(() => {
    return addFrameCursorListener(() => setTick((n) => (n + 1) & 0xffff))
  }, [])

  // Per-provider cursor memory follows the producer switcher. Layout
  // effect, not plain effect: the sync must land before paint so panels
  // reading getFrameCursor() during render never show one frame with the
  // previous provider's cursor. Still post-render, so the listener →
  // setState it triggers isn't mid-render.
  useLayoutEffect(() => {
    setCursorProvider(state.selectedProviderId)
  }, [state.selectedProviderId])

  // Esc returns to live (no modal handling needed here — modals stop
  // propagation of their own keys).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      // A handler that consumed Esc (detail pane close, modal) wins.
      if (ev.defaultPrevented) return
      if (ev.key === 'Escape' && getFrameCursor() !== null) goLive()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cursor = getFrameCursor()
  const range = frameRange(state)
  if (range === null) return null

  const parked = cursor !== null
  const shown = parked ? Math.min(Math.max(cursor, range.min), range.max) : range.max

  const step = (delta: number): void => {
    const base = parked ? shown : range.max
    const next = Math.min(range.max, Math.max(range.min, base + delta))
    setFrameCursor(next)
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
        onDblClick={() => goLive()}
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
        onClick={() => goLive()}
      >
        ● LIVE
      </button>
    </div>
  )
}
