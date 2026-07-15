import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { devBinaryCandidates, resolveBinary } from './resolveBinary.js'

async function touch(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, '')
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
    expect(resolveBinary({ candidates: [missing, present], includeDevFallback: false })).toBe(
      present
    )
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
    expect(() =>
      resolveBinary({ candidates: [missingA, missingB], includeDevFallback: false })
    ).toThrow(new RegExp(`${missingA}[\\s\\S]*${missingB}`))
  })

  it('devBinaryCandidates() points inside sidecar/target, release before debug', () => {
    const [release, debug] = devBinaryCandidates()
    expect(release).toMatch(/sidecar[/\\]target[/\\]release[/\\]codelens-service/)
    expect(debug).toMatch(/sidecar[/\\]target[/\\]debug[/\\]codelens-service/)
  })

  it('falls back to the dev-mode build actually on disk in this checkout', () => {
    // This checkout has a cargo-built debug binary (Z1's `cargo build`/`cargo
    // test` runs produced it) and no release build, so resolveBinary() with
    // no explicit/extra candidates must land on the debug path — proving the
    // dev-mode fallback is really wired in, not just declared.
    const [, debugCandidate] = devBinaryCandidates()
    expect(existsSync(debugCandidate)).toBe(true)
    expect(resolveBinary()).toBe(debugCandidate)
  })
})
