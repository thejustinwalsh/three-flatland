/**
 * Correlates `VideoDecoder` outputs back to the scrub-decode request
 * that produced them (#29 Phase C slice 2 — fixes a rapid-cursor-move
 * race an adversarial review caught).
 *
 * `decode()` calls are processed asynchronously; when a cursor move
 * queues a new keyframe-anchored chain before the previous chain's
 * outputs have all arrived, a naive "reset expected/received counters
 * per request" scheme can't tell a late output from the OLD request
 * apart from the first output of the NEW one — if the old chain was
 * longer, its early outputs can satisfy the new (shorter) request's
 * expected count and get drawn as if they were the new target frame.
 *
 * `VideoDecoder` emits outputs in the same order `decode()` was
 * called (no B-frame reordering in this realtime/no-reorder VP9
 * configuration), so a FIFO of "which request issued this pending
 * decode" correlates every arriving output to its actual request,
 * however interleaved the requests were.
 */
export class ScrubRequestTracker {
  private _generation = 0
  private _expected = 0
  private _received = 0
  private readonly _pending: number[] = []

  /**
   * Start a new request expecting `expectedCount` outputs. Returns the
   * new generation — callers must `enqueue(generation)` once per
   * `decode()` call they issue for this request, in call order.
   */
  start(expectedCount: number): number {
    this._generation++
    this._expected = expectedCount
    this._received = 0
    return this._generation
  }

  /** Record that one `decode()` call for `generation` was just issued. */
  enqueue(generation: number): void {
    this._pending.push(generation)
  }

  /**
   * Report that one output arrived — pops the oldest pending `decode()`
   * to learn which generation actually produced it. Returns `true`
   * only when that generation is still the CURRENT one and this is
   * its final (target) output — the one that should be drawn. Anything
   * from a superseded generation is popped (so the FIFO stays honest
   * for later arrivals) but always rejected, however many outputs it
   * expected or already received.
   */
  reportOutput(): boolean {
    const generation = this._pending.shift()
    if (generation === undefined || generation !== this._generation) return false
    this._received++
    return this._received === this._expected
  }

  /**
   * Clear pending entries without touching the generation counter —
   * call when the underlying decoder is torn down so aborted decodes
   * don't accumulate unresolved entries indefinitely. Safe even though
   * stale entries would already fail the generation check on their
   * own; this just reclaims the memory promptly.
   */
  reset(): void {
    this._pending.length = 0
  }
}
