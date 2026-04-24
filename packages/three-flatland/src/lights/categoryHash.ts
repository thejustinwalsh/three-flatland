/**
 * Map a user-facing category string to a 2-bit bucket index (0..3)
 * used by `ForwardPlusLighting` to quota-separate fill lights.
 *
 * Design:
 *
 * - **Zero-cost per-frame**: hashed once at `Light2D.category` set-
 *   time, cached on the instance. The per-frame tile-assignment loop
 *   only reads the cached integer.
 * - **Cross-light cache**: identical category strings share a single
 *   hash computation globally. Relying on V8's native string hashing
 *   for the `Map` lookup, we skip djb2 entirely on repeat strings —
 *   a 1000-slime scene computes djb2 once for `"slime"`, 999 map hits
 *   after.
 * - **djb2** chosen for simplicity and stability. ~20ns per 5-char
 *   string on modern engines; well below any measurable budget.
 * - **2-bit output**: we have 4 meta channels per tile (`.x/.y/.z/.w`),
 *   so at most 4 categories can have independent compensation. 5th+
 *   category strings collide into earlier buckets — semantically
 *   "those two categories share a quota", which degrades gracefully
 *   (no crash, just lower separation fidelity).
 * - **Default bucket 0**: lights with no category (the common case)
 *   all share bucket 0. Matches the pre-category single-bucket
 *   behavior exactly.
 */

const _bucketCache = new Map<string, number>()

function djb2(s: string): number {
  // Classic djb2: start at 5381, multiply by 33 (via `<< 5 + self`),
  // XOR in each char code. Produces a fast, well-distributed 32-bit
  // hash for short strings.
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i)
  }
  return h >>> 0
}

/**
 * Compute the bucket index (0..3) for a given category string. Returns
 * `0` for `undefined`, `null`, or empty strings — matches the "no
 * category set" default.
 */
export function categoryToBucket(s: string | undefined | null): number {
  if (!s) return 0
  const cached = _bucketCache.get(s)
  if (cached !== undefined) return cached
  const bucket = djb2(s) & 3
  _bucketCache.set(s, bucket)
  return bucket
}

/** @internal — test-only helper to reset the cache between test runs. */
export function _resetCategoryBucketCache(): void {
  _bucketCache.clear()
}
