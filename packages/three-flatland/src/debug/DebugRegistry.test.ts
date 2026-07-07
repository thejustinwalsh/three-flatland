import { describe, expect, it } from 'vitest'
import { DebugRegistry } from './DebugRegistry'
import type { RegistryPayload } from '../debug-protocol'

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
