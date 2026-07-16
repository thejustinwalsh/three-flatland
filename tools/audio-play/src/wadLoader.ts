/**
 * `web-audio-daw`'s CJS constructor-adoption dance + noise-buffer repair —
 * extracted verbatim (refactor-only) from `sidecar.ts`'s original
 * `loadWadConstructor()` closure so `tools/vscode/e2e/host-bridge/
 * offlineWadProbe.mjs`/`offlineWadNoiseProbe.mjs` can call the EXACT
 * production initialization against an `OfflineAudioContext`, instead of
 * reimplementing the dance by hand (which previously let a regression in
 * the noise-buffer repair below stay green — see
 * `tools/vscode/e2e/specs/audio-render-gate.spec.ts`'s noise test).
 * `sidecar.ts` calls this with `ZZFX.audioContext`; the offline probes
 * call it with an `OfflineAudioContext`. Only the context differs — see
 * `tools/audio-play/CLAUDE.md`'s "noise-buffer" pitfall for the full
 * empirical trace this preserves.
 */
import { createRequire } from 'node:module'
import type { WadConstructor } from './player.js'

const nodeRequire = createRequire(import.meta.url)

// Wad's own bundle reads `window.AudioContext`/`webkitAudioContext` ONCE,
// at `require()` time, and permanently captures whatever `new
// audioContext()` returns as its own module-scope `context` singleton —
// cached process-wide here for the same reason `sidecar.ts` originally
// cached it: a second `require()` is a no-op reusing whatever context the
// FIRST call adopted. `resetWadConstructorCache` below is the only valid
// way to force a fresh adoption against a different context.
let wadCtor: WadConstructor | undefined

/**
 * Makes `web-audio-daw`'s CJS bundle adopt `context` instead of
 * constructing its own second, incompatible real `AudioContext` — the
 * explicit-object-return `new` trick, patched onto BOTH the bare globals
 * AND `globalThis.window`'s SEPARATE copies (`node-web-audio-api/
 * polyfill.js` creates `globalThis.window` as a genuinely separate
 * object, not an alias — Wad's own `src/common.js` reads
 * `window.AudioContext || window.webkitAudioContext`, so patching only
 * the bare globals would leave Wad constructing its own second context) —
 * and repairs Wad's own bundled noise-buffer `getChannelData()`-then-write
 * anti-pattern (a detached copy under `node-web-audio-api`/Electron, same
 * shape as `player.ts`'s `getChannelData().set()` bug) via a
 * `createBuffer` intercept + `copyToChannel` re-commit, same seeded-LCG
 * algorithm Wad's own import-time IIFE uses (seed 6,
 * `(seed * 9301 + 49297) % 233280`).
 */
export function loadWadConstructor(context: AudioContext): WadConstructor {
  if (wadCtor) return wadCtor

  const realAudioContext = globalThis.AudioContext
  const realWebkitAudioContext = (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext
  const realWindowAudioContext = globalThis.window.AudioContext
  const realWindowWebkitAudioContext = (globalThis.window as { webkitAudioContext?: unknown })
    .webkitAudioContext
  // The explicit-object-return `new` trick: a constructor that returns
  // an object explicitly makes `new Ctor()` use that object instead of
  // the newly allocated one — Wad has no constructor-injection point for
  // its `AudioContext`, so this is the only way to make it adopt ours.
  function FakeAudioContext(): AudioContext {
    return context
  }

  globalThis.document ??= { querySelector: () => null } as unknown as Document
  globalThis.window.addEventListener ??= () => {}
  globalThis.window.removeEventListener ??= () => {}
  Object.defineProperty(globalThis.window, 'navigator', {
    value: {},
    configurable: true,
    writable: true,
  })
  globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext
  ;(globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = FakeAudioContext
  globalThis.window.AudioContext = FakeAudioContext as unknown as typeof AudioContext
  ;(globalThis.window as { webkitAudioContext?: unknown }).webkitAudioContext = FakeAudioContext

  // Wad's own bundle pre-renders a shared noise buffer at import time
  // (`build/wad.js`: `noiseBuffer.getChannelData(0)` then `output[i] =
  // ...` in a fill loop) — a DETACHED COPY under `node-web-audio-api`, so
  // the writes never reach the real buffer and every `source:'noise'` Wad
  // plays silence. We can't patch Wad's bundled source (vendored npm
  // dependency), and its `noiseBuffer` variable is closed over inside the
  // webpack bundle — not reachable from the public `Wad` export. Fix:
  // intercept the ONE `createBuffer` call Wad's import-time IIFE makes
  // (nothing else in Wad's top-level module code creates a buffer),
  // capture the actual buffer object (a reference, not a copy — writing
  // into IT is what Wad's own closure will play back), and immediately
  // re-commit real noise samples into it via `copyToChannel`.
  let capturedNoiseBuffer: AudioBuffer | undefined
  const realCreateBuffer = context.createBuffer.bind(context)
  context.createBuffer = ((...args: Parameters<typeof realCreateBuffer>) => {
    const buffer = realCreateBuffer(...args)
    capturedNoiseBuffer ??= buffer
    return buffer
  }) as typeof realCreateBuffer

  wadCtor = nodeRequire('web-audio-daw') as WadConstructor

  context.createBuffer = realCreateBuffer
  if (capturedNoiseBuffer) {
    let seed = 6
    const seededRandom = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const noise = new Float32Array(capturedNoiseBuffer.length)
    for (let i = 0; i < noise.length; i++) noise[i] = seededRandom() * 2 - 1
    capturedNoiseBuffer.copyToChannel(noise, 0)
  }

  // Restore the real constructors for hygiene — Wad's own module-scope
  // `context` reference is already captured permanently by this point
  // (its bundle reads `window.AudioContext` once, at its own
  // module-load time), so this isn't load-bearing, just avoids leaving a
  // surprising global patch in place for any unrelated future code.
  globalThis.AudioContext = realAudioContext
  ;(globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = realWebkitAudioContext
  globalThis.window.AudioContext = realWindowAudioContext
  ;(globalThis.window as { webkitAudioContext?: unknown }).webkitAudioContext =
    realWindowWebkitAudioContext

  return wadCtor
}

/**
 * Invalidates the cached constructor — `contextLifecycle.ts`'s
 * `onReacquired` hook calls this after a context swap (Wad captured the
 * OLD context PERMANENTLY at CJS module load, so the only cure is a
 * require-cache bust); the next `loadWadConstructor` call re-runs the
 * full adoption dance against whatever context it's given. `log`, if
 * provided, receives a non-fatal diagnostic if busting the require cache
 * itself throws — the cache invalidation (`wadCtor = undefined`) always
 * happens regardless.
 */
export function resetWadConstructorCache(log?: (message: string) => void): void {
  if (!wadCtor) return
  wadCtor = undefined
  try {
    delete nodeRequire.cache[nodeRequire.resolve('web-audio-daw')]
  } catch (err) {
    log?.(`wad cache bust failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
