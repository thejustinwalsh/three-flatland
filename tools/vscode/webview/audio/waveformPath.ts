// Pure min/max-per-pixel-bucket downsampling for the waveform preview —
// no DOM, no canvas, unit-tested in waveformPath.test.ts. The canvas
// component (WaveformPreview.tsx) owns pixels; this owns the math.

export type WaveformBuckets = {
  /** Per-bucket normalized minima, length = `width`. */
  min: Float32Array
  /** Per-bucket normalized maxima, length = `width`. */
  max: Float32Array
  /** True peak `|sample|` before normalization — 0 for empty/silent input. */
  peak: number
  /** Gain applied so the trace spans ±1 (`1 / peak`) — 1 for empty/silent input. */
  gain: number
}

/**
 * Downsamples `samples` into `width` pixel buckets, keeping each bucket's
 * min and max so transients survive (a plain stride/average would erase
 * the clicks and zaps zzfx sounds are made of), normalized so the loudest
 * sample spans the full ±1 range.
 *
 * A buffer shorter than `width` leaves some buckets without samples of
 * their own; those read the nearest sample so the trace stays continuous
 * instead of collapsing to zero between real samples.
 */
export function bucketWaveform(samples: ArrayLike<number>, width: number): WaveformBuckets {
  const w = Math.max(0, Math.floor(width))
  const min = new Float32Array(w)
  const max = new Float32Array(w)
  const n = samples.length
  if (w === 0 || n === 0) return { min, max, peak: 0, gain: 1 }

  let peak = 0
  for (let i = 0; i < n; i++) {
    const a = Math.abs(samples[i]!)
    if (a > peak) peak = a
  }
  if (peak === 0) return { min, max, peak: 0, gain: 1 }

  const gain = 1 / peak
  for (let x = 0; x < w; x++) {
    // start is always a valid index (x < w ⇒ x*n/w < n); an empty bucket
    // (short buffer) widens to exactly that one nearest sample.
    const start = Math.floor((x * n) / w)
    const end = Math.max(Math.floor(((x + 1) * n) / w), start + 1)
    let lo = Infinity
    let hi = -Infinity
    for (let i = start; i < end; i++) {
      const v = samples[i]!
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    min[x] = lo * gain
    max[x] = hi * gain
  }
  return { min, max, peak, gain }
}
