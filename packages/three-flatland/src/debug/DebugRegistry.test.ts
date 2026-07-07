import { describe, expect, it } from 'vitest'
import { DebugRegistry } from './DebugRegistry'
import type { RegistryPayload } from '../debug-protocol'
import type { BufferCursor } from './bus-pool'

/**
 * Checkpoint-flag contract (#29 Phase C slice 3): `resetDelta()` forces
 * the next `drain()` to re-emit every entry (pre-existing behavior,
 * used on `subscribe`) AND flags that drain `checkpoint: true` on the
 * wire so a time-travel consumer can anchor reconstruction on it. Every
 * ordinary drain in between must NOT carry the flag.
 */
describe('DebugRegistry — checkpoint flag', () => {
  it('does not flag an ordinary drain (no reset pending)', () => {
    const reg = new DebugRegistry()
    reg.register('a', new Float32Array([1, 2, 3]), 'float')

    const out: RegistryPayload = {}
    expect(reg.drain(out)).toBe(true)
    expect(out.checkpoint).toBeUndefined()
  })

  it('flags the next drain after resetDelta(), then stops flagging', () => {
    const reg = new DebugRegistry()
    reg.register('a', new Float32Array([1, 2, 3]), 'float')
    // Consume the initial registration drain so the checkpoint test
    // below is only exercising the reset, not first-sight emission.
    reg.drain({})

    reg.resetDelta()
    const checkpointOut: RegistryPayload = {}
    expect(reg.drain(checkpointOut)).toBe(true)
    expect(checkpointOut.checkpoint).toBe(true)

    // Nothing changed since the checkpoint drain — next drain has
    // nothing to write and must not re-flag.
    const quietOut: RegistryPayload = {}
    expect(reg.drain(quietOut)).toBe(false)
    expect(quietOut.checkpoint).toBeUndefined()

    // A normal mutation after the checkpoint is an ordinary delta.
    reg.touch('a')
    const deltaOut: RegistryPayload = {}
    expect(reg.drain(deltaOut)).toBe(true)
    expect(deltaOut.checkpoint).toBeUndefined()
  })

  it('keeps the checkpoint pending across unproductive drains until something is written', () => {
    const reg = new DebugRegistry()
    reg.resetDelta() // no entries registered yet — nothing to write

    expect(reg.drain({})).toBe(false)
    expect(reg.drain({})).toBe(false)

    reg.register('late', new Uint32Array([7]), 'uint')
    const out: RegistryPayload = {}
    expect(reg.drain(out)).toBe(true)
    expect(out.checkpoint).toBe(true)
  })

  it('flags a checkpoint drain even when the consumer filter is narrow (metadata-only entries still count)', () => {
    const reg = new DebugRegistry()
    reg.register('a', new Float32Array([1, 2]), 'float')
    reg.register('b', new Float32Array([3, 4]), 'float')
    reg.drain({}) // consume initial registration

    reg.resetDelta()
    const out: RegistryPayload = {}
    // Only 'a' is in the filter — 'b' ships metadata-only, but the
    // drain as a whole is still the checkpoint's forced full resend.
    expect(reg.drain(out, new Set(['a']))).toBe(true)
    expect(out.checkpoint).toBe(true)
    expect(out.entries?.a?.sample).toBeDefined()
    expect(out.entries?.b?.sample).toBeUndefined()
  })

  it('removal-only drains (no version-bumped entries) are not flagged as checkpoints', () => {
    const reg = new DebugRegistry()
    reg.register('a', new Float32Array([1]), 'float')
    reg.drain({})

    reg.unregister('a')
    const out: RegistryPayload = {}
    expect(reg.drain(out)).toBe(true)
    expect(out.entries?.a).toBeNull()
    expect(out.checkpoint).toBeUndefined()
  })
})

/**
 * Partial-checkpoint contract (#29 Phase C review fix): a drain that
 * degrades an in-filter entry to metadata-only (pool overflow) must
 * NOT claim `checkpoint: true` — that would hand a time-travel
 * consumer an "authoritative" anchor that's silently missing a sample.
 * It keeps retrying (the degraded entry stays eligible every attempt)
 * up to `CHECKPOINT_PARTIAL_AFTER_ATTEMPTS`, then settles on
 * `checkpoint: true, partial: true` so the wire stays honest instead
 * of starving forever on a durably oversized entry.
 */
describe('DebugRegistry — partial checkpoint (degraded entries)', () => {
  function tinyCursor(bytes: number): BufferCursor {
    return { buffer: new ArrayBuffer(bytes), byteOffset: 0 }
  }

  it('does not flag checkpoint while an entry keeps degrading to metadata-only', () => {
    const reg = new DebugRegistry()
    reg.register('big', new Float32Array([1, 2, 3]), 'float') // 12 bytes
    reg.drain({}, null, tinyCursor(1024)) // consume initial registration

    reg.resetDelta()
    const out1: RegistryPayload = {}
    expect(reg.drain(out1, null, tinyCursor(4))).toBe(true) // 4B < 12B needed
    expect(out1.checkpoint).toBeUndefined()
    expect(out1.entries?.big?.sample).toBeUndefined()

    const out2: RegistryPayload = {}
    expect(reg.drain(out2, null, tinyCursor(4))).toBe(true)
    expect(out2.checkpoint).toBeUndefined()
  })

  it('gives up after CHECKPOINT_PARTIAL_AFTER_ATTEMPTS and emits a partial checkpoint', () => {
    const reg = new DebugRegistry()
    reg.register('big', new Float32Array([1, 2, 3]), 'float')
    reg.drain({}, null, tinyCursor(1024))

    reg.resetDelta()
    let last: RegistryPayload = {}
    for (let i = 0; i < 3; i++) {
      last = {}
      reg.drain(last, null, tinyCursor(4))
    }
    expect(last.checkpoint).toBe(true)
    expect(last.partial).toBe(true)
    expect(last.entries?.big?.sample).toBeUndefined()
  })

  it('gives a fresh checkpoint cycle its own attempt budget', () => {
    const reg = new DebugRegistry()
    reg.register('big', new Float32Array([1, 2, 3]), 'float')
    reg.drain({}, null, tinyCursor(1024))

    reg.resetDelta()
    for (let i = 0; i < 3; i++) reg.drain({}, null, tinyCursor(4))
    // Retry budget just exhausted (settled on partial, per the test above).

    reg.touch('big')
    reg.resetDelta() // a new cycle — must not inherit the spent budget
    const out: RegistryPayload = {}
    reg.drain(out, null, tinyCursor(4)) // first attempt of the new cycle
    expect(out.checkpoint).toBeUndefined()
  })

  it('succeeds cleanly (no partial flag) once the entry fits again', () => {
    const reg = new DebugRegistry()
    reg.register('big', new Float32Array([1, 2, 3]), 'float')
    reg.drain({}, null, tinyCursor(1024))

    reg.resetDelta()
    reg.drain({}, null, tinyCursor(4)) // degrades once
    const out: RegistryPayload = {}
    expect(reg.drain(out, null, tinyCursor(1024))).toBe(true) // plenty of room now
    expect(out.checkpoint).toBe(true)
    expect(out.partial).toBeUndefined()
    expect(out.entries?.big?.sample).toBeDefined()
  })
})
