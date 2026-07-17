import { existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { devBinaryCandidates, preferNewest, resolveBinary } from './resolveBinary.js'

async function touch(path: string, mtimeMs?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, '')
  if (mtimeMs !== undefined) await utimes(path, mtimeMs / 1000, mtimeMs / 1000)
}

describe('resolveBinary', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'codelens-resolve-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('an explicit path always wins, without an existence check', () => {
    const explicit = join(dir, 'does-not-exist')
    expect(resolveBinary({ explicitPath: explicit })).toBe(explicit)
  })

  it('falls through to the first existing candidate when no explicit path is given', async () => {
    const missing = join(dir, 'missing', 'codelens-service')
    const present = join(dir, 'present', 'codelens-service')
    await touch(present)
    expect(resolveBinary({ candidates: [missing, present], includeDevFallback: false })).toBe(present)
  })

  it('prefers earlier candidates over later ones when both exist', async () => {
    const first = join(dir, 'a', 'codelens-service')
    const second = join(dir, 'b', 'codelens-service')
    await touch(first)
    await touch(second)
    expect(resolveBinary({ candidates: [first, second], includeDevFallback: false })).toBe(first)
  })

  it('throws a message listing every path it looked at when nothing resolves', () => {
    const missingA = join(dir, 'a', 'codelens-service')
    const missingB = join(dir, 'b', 'codelens-service')
    // includeDevFallback: false — otherwise this assertion would depend on
    // whether the sidecar happens to be cargo-built in the checkout running
    // the test, which is exactly the nondeterminism this option exists to
    // let tests (and production builds) opt out of.
    expect(() => resolveBinary({ candidates: [missingA, missingB], includeDevFallback: false })).toThrow(
      new RegExp(`${missingA}[\\s\\S]*${missingB}`)
    )
  })

  it('preferNewest() puts the freshest existing binary first, missing paths last', async () => {
    const stale = join(dir, 'release', 'codelens-service')
    const fresh = join(dir, 'debug', 'codelens-service')
    const missing = join(dir, 'nope', 'codelens-service')
    await touch(stale, Date.UTC(2026, 0, 1))
    await touch(fresh, Date.UTC(2026, 6, 1))
    expect(preferNewest([stale, fresh, missing])).toEqual([fresh, stale, missing])
    // Stable when nothing exists — the caller's order is the tiebreak.
    expect(preferNewest([missing, stale + '-also-missing'])).toEqual([missing, stale + '-also-missing'])
  })

  it('devBinaryCandidates() points inside sidecar/target, covering release and debug', () => {
    const candidates = devBinaryCandidates()
    expect(candidates.some((c) => /sidecar[/\\]target[/\\]release[/\\]codelens-service/.test(c))).toBe(true)
    expect(candidates.some((c) => /sidecar[/\\]target[/\\]debug[/\\]codelens-service/.test(c))).toBe(true)
  })

  it('falls back to the dev-mode build actually on disk in this checkout', () => {
    // This checkout always has a cargo-built debug binary (`cargo build`/
    // `cargo test` runs produce it); a RELEASE build may or may not also
    // exist (scripts/bundle-sidecars.mjs's `cargo build --release` leaves
    // one behind). resolveBinary() must land on the NEWEST existing dev
    // candidate — a stale packaging-leftover release build must never
    // shadow a fresh debug build (this silently ran pre-change parsing in
    // a real e2e run once) — proving the dev-mode fallback is really
    // wired in, without depending on whether packaging ever ran here.
    const candidates = devBinaryCandidates()
    const existing = candidates.filter((c) => existsSync(c))
    expect(existing.length).toBeGreaterThan(0)
    const expected = existing.reduce((a, b) => (statSync(a).mtimeMs >= statSync(b).mtimeMs ? a : b))
    expect(resolveBinary()).toBe(expected)
  })
})
