/**
 * Preact hooks over the dashboard's singleton `DevtoolsClient`.
 *
 * State updates fan out through a shared rAF coalescer so a single
 * `provider → client.addListener` event notifies every subscribed hook
 * on the same frame. Without this each `use*` hook would schedule its
 * own rAF, multiplying the update cost by the number of panels.
 */
import { useEffect, useState } from 'preact/hooks'
import type { DevtoolsState } from '../devtools-client.js'
import { getClient } from './client.js'
import { getProtocolStore } from './protocol-store.js'

type Subscriber = () => void

// One shared rAF per update, ticked by any underlying source that
// subscribes. Listeners register with `subscribeFrame`; all fire
// together when the rAF lands.
const _frameListeners = new Set<Subscriber>()
let _frameScheduled = false

function scheduleFrame(): void {
  if (_frameScheduled) return
  _frameScheduled = true
  requestAnimationFrame(() => {
    _frameScheduled = false
    for (const cb of _frameListeners) {
      try { cb() } catch { /* listener errors shouldn't break the bus */ }
    }
  })
}

function subscribeFrame(cb: Subscriber): () => void {
  _frameListeners.add(cb)
  return () => { _frameListeners.delete(cb) }
}

// Wire the underlying data sources to the shared rAF once. Any event on
// the client or store ticks the shared loop.
let _sourcesWired = false
function ensureSourcesWired(): void {
  if (_sourcesWired) return
  _sourcesWired = true
  getClient().addListener(scheduleFrame)
  getProtocolStore().addListener(scheduleFrame)
}

/**
 * Subscribe to the client's state. Returns the live state object; the
 * client mutates it in place, so we bump a tick to force a re-render.
 * All subscribers share one rAF per frame.
 */
export function useDevtoolsState(): DevtoolsState {
  ensureSourcesWired()
  const client = getClient()
  const [, setTick] = useState(0)
  useEffect(() => {
    return subscribeFrame(() => setTick((n) => (n + 1) & 0xffff))
  }, [])
  return client.state
}

/**
 * Subscribe to the shared frame tick without reading any specific
 * source. Use this for components (protocol log, header stats, stats
 * strip) that derive their render from a source other than the client
 * state but still want to coalesce onto the same rAF.
 */
export function useFrameTick(): void {
  ensureSourcesWired()
  const [, setTick] = useState(0)
  useEffect(() => {
    return subscribeFrame(() => setTick((n) => (n + 1) & 0xffff))
  }, [])
}
