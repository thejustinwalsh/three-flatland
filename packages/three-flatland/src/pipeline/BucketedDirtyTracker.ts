/**
 * Anything that exposes the BufferAttribute / InterleavedBuffer write-range
 * API. Both `InstancedBufferAttribute` (per-attribute buffer) and
 * `InstancedInterleavedBuffer` (shared interleaved buffer fronted by
 * multiple `InterleavedBufferAttribute` views) implement these — letting
 * one tracker drive uploads for either layout.
 */
interface UploadTarget {
  addUpdateRange(start: number, count: number): void
  clearUpdateRanges(): void
  needsUpdate: boolean
}

/**
 * Adaptive dirty-range tracker for a single instanced buffer attribute.
 *
 * Replaces the per-attribute `dirtyMin` / `dirtyMax` pattern with a
 * bucketed dirty-set. At flush time, the tracker chooses between:
 *
 * - **Bucketed range upload** — one `addUpdateRange` per dirty bucket.
 *   Tight upload bandwidth when changes are spatially clustered or
 *   sparse, even when the global min..max spans the whole buffer.
 * - **Full-buffer upload** — `clearUpdateRanges` + `needsUpdate = true`.
 *   Three then takes the `bufferData` fast path (single large upload).
 *   Chosen when enough buckets are dirty that the per-range overhead
 *   would exceed the cost of just re-uploading everything.
 *
 * Strictly dominates the single-min/max approach: at worst-case
 * (everything dirty) it matches by falling into the full-upload branch;
 * in every other case it does better.
 *
 * Bucket size MUST be a power of 2 so `slot >>> bucketShift` resolves
 * the bucket index. Per-slot markDirty is ~5 ns: one shift, one compare
 * on `bucketState[bucket]`, optional store + count increment.
 */
export class BucketedDirtyTracker {
  private readonly bucketShift: number
  private readonly bucketCount: number
  private readonly bucketState: Int32Array
  private readonly bucketLastSlot: Int32Array
  private bucketDirtyCount = 0

  constructor(
    private readonly attr: UploadTarget,
    maxSize: number,
    bucketSize: number,
    private readonly stride: number,
    private readonly fullThreshold: number
  ) {
    if ((bucketSize & (bucketSize - 1)) !== 0 || bucketSize <= 0) {
      throw new Error(`BucketedDirtyTracker: bucketSize must be a power of 2 (got ${bucketSize})`)
    }
    this.bucketShift = Math.log2(bucketSize)
    this.bucketCount = Math.ceil(maxSize / bucketSize)
    this.bucketState = new Int32Array(this.bucketCount).fill(-1)
    this.bucketLastSlot = new Int32Array(this.bucketCount)
  }

  /**
   * Mark a slot as dirty. Called from buffer write methods on every
   * write — must be cheap. Five ops in the hot path.
   */
  markDirty(slot: number): void {
    const b = slot >>> this.bucketShift
    const first = this.bucketState[b]!
    if (first === -1) {
      this.bucketState[b] = slot
      this.bucketLastSlot[b] = slot
      this.bucketDirtyCount++
    } else {
      if (slot < first) this.bucketState[b] = slot
      if (slot > this.bucketLastSlot[b]!) this.bucketLastSlot[b] = slot
    }
  }

  /**
   * Flush dirty state to the attribute. Called once per frame after all
   * writes for this attribute have completed. Decides per-flush whether
   * to upload as ranges or as a single full-buffer write.
   */
  flush(): void {
    if (this.bucketDirtyCount === 0) return

    if (this.bucketDirtyCount >= this.fullThreshold) {
      // Full-buffer fast path — three sees `needsUpdate` without any
      // `updateRanges` entries and emits a single `bufferData` call.
      this.attr.clearUpdateRanges()
      this.attr.needsUpdate = true
      this.resetState()
      return
    }

    // Ranged path — one `addUpdateRange` per dirty bucket.
    this.attr.clearUpdateRanges()
    const stride = this.stride
    const state = this.bucketState
    const last = this.bucketLastSlot
    for (let b = 0; b < this.bucketCount; b++) {
      const first = state[b]!
      if (first === -1) continue
      const lastSlot = last[b]!
      this.attr.addUpdateRange(first * stride, (lastSlot - first + 1) * stride)
      state[b] = -1
    }
    this.attr.needsUpdate = true
    this.bucketDirtyCount = 0
  }

  /**
   * Whether the tracker has unflushed dirty state. Used by tests and
   * for telemetry — not on the hot path.
   */
  get isDirty(): boolean {
    return this.bucketDirtyCount > 0
  }

  /**
   * Snapshot of the current dirty-bucket count. Used by telemetry and
   * the per-phase threshold calibration pass — not on the hot path.
   */
  get dirtyBucketCount(): number {
    return this.bucketDirtyCount
  }

  private resetState(): void {
    const state = this.bucketState
    for (let b = 0; b < this.bucketCount; b++) {
      if (state[b] !== -1) state[b] = -1
    }
    this.bucketDirtyCount = 0
  }
}
