/**
 * Public helper for non-Flatland three.js apps that want devtools
 * stats / readbacks. Wraps `DevtoolsProvider` construction in the
 * standard devtools build gate + `isDevtoolsActive()` build/runtime
 * gates and returns either a real provider or a no-op stub.
 *
 * Usage in a vanilla three.js render loop:
 *
 * ```ts
 * import { createDevtoolsProvider } from 'three-flatland'
 *
 * const devtools = createDevtoolsProvider({ name: 'my-app' })
 *
 * function animate() {
 *   requestAnimationFrame(animate)
 *   devtools.beginFrame(performance.now(), renderer)
 *   renderer.render(scene, camera)
 *   devtools.endFrame(renderer)
 * }
 * ```
 *
 * In production (the devtools build gate folds to `false`) the helper
 * returns a stub whose methods do nothing — terser folds the entire branch
 * away when minifying with `define`d build flags, so there's zero
 * runtime cost.
 *
 * Flatland's own constructor already does this internally. Use this
 * helper only when you're driving three.js directly.
 */

import type { WebGPURenderer } from 'three/webgpu'
import { isDevtoolsActive } from '../debug-protocol'
import type { DevtoolsProviderOptions } from './DevtoolsProvider'

// Module-local typing for the build-time `process.env` reads in the devtools
// gate. Lets consumers that compile this package's source (via the `source`
// export condition) typecheck without pulling in @types/node; shadows the
// global where node types are present. Erases at compile — the bundler still
// statically replaces the `process.env.*` reads.
declare const process: { env: { NODE_ENV?: string; FL_DEVTOOLS?: string } }

/**
 * Minimal interface — what host code calls per frame. The real
 * `DevtoolsProvider` and the no-op stub both implement it.
 */
export interface DevtoolsProviderHandle {
  beginFrame(now: number, renderer: WebGPURenderer): void
  endFrame(renderer: WebGPURenderer): void
  dispose(): void
  /** `true` once `dispose()` has been called. */
  readonly disposed: boolean
}

/**
 * Construct a devtools provider when bundled + active; otherwise a
 * no-op stub. Safe to call unconditionally from app code.
 */
export function createDevtoolsProvider(options: DevtoolsProviderOptions = {}): DevtoolsProviderHandle {
  if ((process.env.NODE_ENV === 'production' && process.env.FL_DEVTOOLS !== 'true') || !isDevtoolsActive())
    return NOOP_PROVIDER

  // Lazy-load the real provider via dynamic import. When the gate above folds
  // to `false` (production, no FL_DEVTOOLS), this whole tail is dead code, so
  // the bundler removes the `import()` and never pulls DevtoolsProvider or its
  // dependencies (BatchCollector, the texture registry, the bus worker) into
  // the graph at all. The returned handle forwards to the real provider once
  // the chunk resolves; calls before then are dropped (a frame or two at
  // startup), which is fine for a debug producer.
  let real: DevtoolsProviderHandle | null = null
  let disposed = false
  void import('./DevtoolsProvider').then(({ DevtoolsProvider }) => {
    if (disposed) return
    const provider = new DevtoolsProvider(options)
    provider.start()
    real = provider
  })
  return {
    beginFrame(now, renderer) {
      real?.beginFrame(now, renderer)
    },
    endFrame(renderer) {
      real?.endFrame(renderer)
    },
    dispose() {
      disposed = true
      real?.dispose()
      real = null
    },
    get disposed() {
      return disposed
    },
  }
}

const NOOP_PROVIDER: DevtoolsProviderHandle = {
  beginFrame() {
    /* no-op */
  },
  endFrame() {
    /* no-op */
  },
  dispose() {
    /* no-op */
  },
  get disposed() {
    return false
  },
}
