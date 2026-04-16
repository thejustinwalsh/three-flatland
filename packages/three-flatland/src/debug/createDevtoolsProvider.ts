/**
 * Public helper for non-Flatland three.js apps that want devtools
 * stats / readbacks. Wraps `DevtoolsProvider` construction in the
 * standard `DEVTOOLS_BUNDLED` + `isDevtoolsActive()` build/runtime
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
 * In production (`DEVTOOLS_BUNDLED === false`) the helper returns a
 * stub whose methods do nothing — terser folds the entire branch
 * away when minifying with `define`d build flags, so there's zero
 * runtime cost.
 *
 * Flatland's own constructor already does this internally. Use this
 * helper only when you're driving three.js directly.
 */

import type { WebGPURenderer } from 'three/webgpu'
import { DEVTOOLS_BUNDLED, isDevtoolsActive } from '../debug-protocol'
import { DevtoolsProvider, type DevtoolsProviderOptions } from './DevtoolsProvider'

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
export function createDevtoolsProvider(
  options: DevtoolsProviderOptions = {},
): DevtoolsProviderHandle {
  if (!DEVTOOLS_BUNDLED || !isDevtoolsActive()) return NOOP_PROVIDER
  const provider = new DevtoolsProvider(options)
  // The class constructor is now side-effect-free — explicit `start()`
  // is required to open channels / start the flush timer / announce on
  // discovery. The vanilla helper does both together so external
  // callers see no behavior change.
  provider.start()
  return provider
}

const NOOP_PROVIDER: DevtoolsProviderHandle = {
  beginFrame() { /* no-op */ },
  endFrame() { /* no-op */ },
  dispose() { /* no-op */ },
  get disposed() { return false },
}
