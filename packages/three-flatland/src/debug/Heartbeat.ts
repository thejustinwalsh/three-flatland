import type { DebugMessage, DebugTopic } from '../debug-protocol'
import {
  PING_INTERVAL_MS,
  PONG_WINDOW_MS,
  stampMessage,
} from '../debug-protocol'

/**
 * Producer-driven ping/pong heartbeat.
 *
 * Tracks which topics have active subscribers. When a topic is subscribed,
 * starts a periodic `ui:ping` broadcast; subscribers respond with
 * `ui:pong`, updating the per-topic last-pong timestamp. If no pong
 * arrives within `PONG_WINDOW_MS`, the topic is considered dead: it's
 * removed from the map and, when the map empties, the ping interval
 * shuts down entirely. Back to zero runtime cost.
 *
 * Rationale over a subscriber-driven heartbeat: producer owns cadence
 * (can back off under load), silent subscribers get detected purely by
 * missing pongs (no cleanup handlers on the subscriber side), and
 * producer traffic is literally zero when nothing is subscribed.
 *
 * **Self-healing**: `_onSubscribe` is idempotent — it's safe for a
 * subscriber to re-subscribe any time it suspects it's been dropped
 * (e.g., hasn't seen a ping in a while). No separate "reconnect"
 * handshake; the normal subscribe path IS the reconnect path. See
 * `debug-protocol.ts` for the full recovery contract.
 */
export class Heartbeat {
  private _bus: BroadcastChannel
  private _topics = new Map<DebugTopic, { lastPongAt: number }>()
  private _interval: ReturnType<typeof setInterval> | null = null

  /**
   * Single scratch ping message reused for every `ui:ping` send. `topic`
   * is rewritten per dispatch; `stampMessage` rewrites `v` / `ts` in
   * place. Zero allocations per ping after construction.
   */
  private _pingScratch: DebugMessage = {
    v: 1,
    ts: 0,
    type: 'ui:ping',
    payload: { topic: 'stats:frame' },
  }

  constructor(bus: BroadcastChannel) {
    this._bus = bus
  }

  /** Process a message from the bus. No-op for anything not in the protocol. */
  handle(msg: DebugMessage): void {
    switch (msg.type) {
      case 'ui:subscribe':
        this._onSubscribe(msg.payload.topic)
        break
      case 'ui:pong':
        this._onPong(msg.payload.topic)
        break
      case 'ui:unsubscribe':
        this._shutdownTopic(msg.payload.topic)
        break
      default:
        break
    }
  }

  /**
   * Is a topic currently considered active? Producers check this before
   * doing any work. `true` means at least one subscriber has subscribed
   * and the most recent pong arrived within `PONG_WINDOW_MS`.
   */
  isActive(topic: DebugTopic): boolean {
    return this._topics.has(topic)
  }

  /** Clear all state + stop the interval. Idempotent. */
  dispose(): void {
    if (this._interval !== null) {
      clearInterval(this._interval)
      this._interval = null
    }
    this._topics.clear()
  }

  private _onSubscribe(topic: DebugTopic): void {
    // New subscribers get an initial `lastPongAt = now` so they survive
    // one pong window on first activation — the first real pong will
    // follow within one ping interval.
    this._topics.set(topic, { lastPongAt: Date.now() })
    this._ensureRunning()
  }

  private _onPong(topic: DebugTopic): void {
    const state = this._topics.get(topic)
    if (state) state.lastPongAt = Date.now()
  }

  private _shutdownTopic(topic: DebugTopic): void {
    this._topics.delete(topic)
    if (this._topics.size === 0 && this._interval !== null) {
      clearInterval(this._interval)
      this._interval = null
    }
  }

  private _ensureRunning(): void {
    if (this._interval !== null) return
    this._interval = setInterval(() => this._tick(), PING_INTERVAL_MS)
  }

  private _tick(): void {
    const now = Date.now()
    // Iterate a snapshot so `_shutdownTopic` mutations don't trip Map
    // iteration mid-pass.
    const topics = Array.from(this._topics.entries())
    for (const [topic, state] of topics) {
      if (now - state.lastPongAt > PONG_WINDOW_MS) {
        this._shutdownTopic(topic)
        continue
      }
      this._sendPing(topic)
    }
  }

  private _sendPing(topic: DebugTopic): void {
    // Mutate scratch in place — zero allocations per ping. `structuredClone`
    // inside `bus.postMessage` gives subscribers an independent copy, so
    // the next ping can safely overwrite these fields.
    const scratch = this._pingScratch
    if (scratch.type === 'ui:ping') scratch.payload.topic = topic
    stampMessage(scratch)
    try {
      this._bus.postMessage(scratch)
    } catch {
      // Bus may be closing during shutdown — swallow.
    }
  }
}
