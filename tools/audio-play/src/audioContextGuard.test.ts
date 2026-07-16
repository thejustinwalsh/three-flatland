import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `audioContextGuard.ts`'s whole job is to sit BETWEEN `node-web-audio-
 * api`'s polyfill and zzfx's import-time `new AudioContext` — this test
 * controls exactly what "the polyfill installed" looks like (a fake,
 * throwable native `AudioContext` constructor) rather than depending on
 * a real native binding/device, which is unavailable-by-design in a
 * plain-Node `vitest` run (see `tools/audio-play/CLAUDE.md`'s "Common
 * pitfalls" — the real device/Electron-binding proof lives in the e2e
 * `audio-render-gate` gate, not here). The mock factory below stands in
 * for exactly what `node-web-audio-api/polyfill.js` itself does: installs
 * a native-ish `AudioContext` constructor on both `globalThis` and
 * `globalThis.window` — see that file's real source for the shape being
 * mirrored.
 */
let shouldFail = true

class FakeNativeAudioContext {
  state = 'running'
  onstatechange: (() => void) | null = null
  constructor() {
    if (shouldFail) {
      throw new Error('no audio output device (simulated)')
    }
  }
  close(): Promise<void> {
    return Promise.resolve()
  }
  resume(): Promise<void> {
    return Promise.resolve()
  }
}

// A no-op mock body — resetting `globalThis`/`globalThis.window` is done
// directly in `beforeEach` below instead of relying on this factory
// re-running. `vi.mock`'s factory is only guaranteed to run once per
// mocked specifier for the whole test file; `vi.resetModules()` forces
// REAL (non-mocked) modules — like `./audioContextGuard.js` itself — to
// re-evaluate, but does not reliably re-invoke an already-registered
// mock factory. Relying on it to reset `globalThis.AudioContext` back to
// the fake native class between tests caused exactly the bug this
// comment now warns against: a later test's fresh `audioContextGuard.ts`
// import captured the PREVIOUS test's already-guarded wrapper as "the
// real AudioContext" and wrapped a wrapper, permanently masking failures
// as successes.
vi.mock('node-web-audio-api/polyfill.js', () => ({}))

describe('audioContextGuard', () => {
  beforeEach(() => {
    // `vi.resetModules()` forces the next `import('./audioContextGuard.js')`
    // to re-evaluate that module fresh. Resetting `globalThis.AudioContext`/
    // `globalThis.window.AudioContext` back to the fake native class here
    // (not in the mock factory — see the comment above) is what makes that
    // fresh import capture the CORRECT "real" constructor to wrap, instead
    // of a previous test's leftover guarded wrapper.
    vi.resetModules()
    shouldFail = true
    const fakeGlobal = globalThis as unknown as {
      AudioContext: unknown
      window: { AudioContext: unknown }
    }
    fakeGlobal.window ??= { AudioContext: undefined }
    fakeGlobal.AudioContext = FakeNativeAudioContext
    fakeGlobal.window.AudioContext = FakeNativeAudioContext
  })

  it('does not throw when the native constructor fails — the crash this whole module exists to prevent', async () => {
    const guard = await import('./audioContextGuard.js')
    expect(() => new (globalThis as unknown as { AudioContext: new () => unknown }).AudioContext()).not.toThrow()
  })

  it('marks the device unavailable after a failed construction, and assertAudioDeviceAvailable throws a labeled, Nackable error', async () => {
    const guard = await import('./audioContextGuard.js')
    const Guarded = globalThis.AudioContext
    new Guarded()
    expect(guard.isAudioDeviceAvailable()).toBe(false)
    expect(() => guard.assertAudioDeviceAvailable()).toThrow('audio-play: no audio output device available')
    try {
      guard.assertAudioDeviceAvailable()
      expect.unreachable('assertAudioDeviceAvailable should have thrown')
    } catch (err) {
      expect((err as { code?: string }).code).toBe('AUDIO_DEVICE_UNAVAILABLE')
    }
  })

  it('the degraded stand-in reports state "closed" — reuses the existing idle-release/getStats closed-context handling for free', async () => {
    const guard = await import('./audioContextGuard.js')
    const Guarded = globalThis.AudioContext
    const ctx = new Guarded() as unknown as { state: string; close(): Promise<void>; resume(): Promise<void> }
    expect(ctx.state).toBe('closed')
    await expect(ctx.close()).resolves.toBeUndefined()
    await expect(ctx.resume()).resolves.toBeUndefined()
    expect(guard.isAudioDeviceAvailable()).toBe(false)
  })

  it('recovers once the native constructor succeeds again — reacquire-as-default, not a permanent trip', async () => {
    const guard = await import('./audioContextGuard.js')
    const Guarded = globalThis.AudioContext

    new Guarded() // fails — shouldFail is true from beforeEach
    expect(guard.isAudioDeviceAvailable()).toBe(false)

    shouldFail = false
    const real = new Guarded() as unknown as { state: string }
    expect(guard.isAudioDeviceAvailable()).toBe(true)
    expect(() => guard.assertAudioDeviceAvailable()).not.toThrow()
    // The successful attempt returns the REAL fake instance, not the
    // degraded stand-in — the working-device path is completely
    // unchanged by this guard.
    expect(real.state).toBe('running')
  })

  it('the working-device path is unchanged: a successful construction returns the real instance untouched', async () => {
    shouldFail = false
    const guard = await import('./audioContextGuard.js')
    const Guarded = globalThis.AudioContext
    const ctx = new Guarded()
    expect(ctx).toBeInstanceOf(FakeNativeAudioContext)
    expect(guard.isAudioDeviceAvailable()).toBe(true)
    expect(() => guard.assertAudioDeviceAvailable()).not.toThrow()
  })

  it('installs the guarded constructor on globalThis.window too — node-web-audio-api/polyfill.js keeps window as a SEPARATE object', async () => {
    await import('./audioContextGuard.js')
    expect(globalThis.window.AudioContext).toBe(globalThis.AudioContext)
  })
})
