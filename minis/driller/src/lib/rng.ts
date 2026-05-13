/**
 * Seeded RNG (mulberry32). Identical seed → identical stream. The whole
 * world (chunks, gems, AI biases) derives from this so runs are
 * reproducible from a URL `?seed=` param.
 *
 * `fork(salt)` returns a new RNG seeded from the parent state — useful
 * for per-chunk, per-entity, or per-system independent streams.
 */
export interface Rng {
  next(): number
  intRange(min: number, max: number): number
  chance(p: number): boolean
  fork(salt: number): Rng
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    intRange(min, max) {
      return Math.floor(next() * (max - min + 1)) + min
    },
    chance(p) {
      return next() < p
    },
    fork(salt) {
      return createRng((Math.imul(seed, 0x9e3779b1) + salt) >>> 0)
    },
  }
}
