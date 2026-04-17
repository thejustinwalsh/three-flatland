/**
 * Module-level "debug sink" — engine modules call these helpers to
 * expose CPU arrays to the devtools pane without linking directly to
 * `DevtoolsProvider`. When `DEVTOOLS_BUNDLED` is false (prod build
 * with no devtools flag), every function compiles down to a no-op
 * that terser strips — zero runtime cost in production.
 *
 * The sink holds a single active `DebugRegistry` reference (set by the
 * `DevtoolsProvider` constructor). If multiple providers are
 * constructed in the same page the newest wins; that's a pathological
 * case we deliberately don't support yet.
 */
import type { DataTexture, Texture } from 'three'
import type { BufferDisplayMode, RegistryEntryKind, TexturePixelType } from '../debug-protocol'
import { DEVTOOLS_BUNDLED } from '../debug-protocol'
import type { DebugRegistry } from './DebugRegistry'
import type { DebugTextureRegistry } from './DebugTextureRegistry'

let _active: DebugRegistry | null = null
let _activeTextures: DebugTextureRegistry | null = null

// Queued registrations that arrived before the registry was set.
// Replayed on _setActive*Registry and cleared.
type QueuedArray = { name: string; ref: Float32Array | Uint32Array | Int32Array; kind: RegistryEntryKind; opts?: { label?: string; length?: number } }
type QueuedTexture = { name: string; source: DataTexture | { width: number; height: number; texture: Texture }; pixelType: TexturePixelType; opts?: { label?: string; display?: BufferDisplayMode; maxDim?: number } }
let _pendingArrays: QueuedArray[] | null = null
let _pendingTextures: QueuedTexture[] | null = null

/** @internal Called by `DevtoolsProvider` — not for app code. */
export function _setActiveRegistry(registry: DebugRegistry | null): void {
  if (!DEVTOOLS_BUNDLED) return
  _active = registry
  if (registry !== null && _pendingArrays !== null) {
    for (const q of _pendingArrays) registry.register(q.name, q.ref, q.kind, q.opts)
    _pendingArrays = null
  }
}

/** @internal Called by `DevtoolsProvider` — not for app code. */
export function _setActiveTextureRegistry(registry: DebugTextureRegistry | null): void {
  if (!DEVTOOLS_BUNDLED) return
  _activeTextures = registry
  if (registry !== null && _pendingTextures !== null) {
    for (const q of _pendingTextures) registry.register(q.name, q.source, q.pixelType, q.opts)
    _pendingTextures = null
  }
}

/**
 * Publish (or re-publish) a named CPU array to the devtools pane.
 * Holds a *reference*; the host keeps mutating its own buffer. Call
 * `touchDebugArray(name)` when you mutate in place so the provider
 * knows to re-send on the next batch. Replacing the buffer (new
 * `ref`) calls `touchDebugArray` implicitly.
 *
 * Safe to call any time — no-op when devtools isn't bundled.
 */
export function registerDebugArray(
  name: string,
  ref: Float32Array | Uint32Array | Int32Array,
  kind: RegistryEntryKind,
  opts?: { label?: string; length?: number },
): void {
  if (!DEVTOOLS_BUNDLED) return
  if (_active !== null) { _active.register(name, ref, kind, opts); return }
  if (_pendingArrays === null) _pendingArrays = []
  _pendingArrays.push({ name, ref, kind, opts })
}

/**
 * Signal that a previously-registered array has been mutated in place
 * and should be re-sampled on the next batch flush.
 */
export function touchDebugArray(name: string, length?: number): void {
  if (!DEVTOOLS_BUNDLED) return
  _active?.touch(name, length)
}

/** Remove a named array. Consumers will see it disappear on the next batch. */
export function unregisterDebugArray(name: string): void {
  if (!DEVTOOLS_BUNDLED) return
  _active?.unregister(name)
}

/**
 * Publish a debug texture (DataTexture or RenderTarget) to the
 * devtools pane. Readback is only performed when a consumer has
 * selected this name for preview — safe to leave registered.
 *
 * `source` may be a `DataTexture` (CPU-backed, cheap) or any object
 * shaped like a `WebGLRenderTarget` / `WebGPURenderTarget` with
 * `width`, `height`, `texture`. No-op when devtools isn't bundled.
 */
export function registerDebugTexture(
  name: string,
  source: DataTexture | { width: number; height: number; texture: Texture },
  pixelType: TexturePixelType = 'rgba8',
  opts?: { label?: string; display?: BufferDisplayMode; maxDim?: number },
): void {
  if (!DEVTOOLS_BUNDLED) return
  if (_activeTextures !== null) { _activeTextures.register(name, source, pixelType, opts); return }
  if (_pendingTextures === null) _pendingTextures = []
  _pendingTextures.push({ name, source, pixelType, opts })
}

/** Signal that a registered texture's content has changed. */
export function touchDebugTexture(name: string): void {
  if (!DEVTOOLS_BUNDLED) return
  _activeTextures?.touch(name)
}

/** Remove a named texture. */
export function unregisterDebugTexture(name: string): void {
  if (!DEVTOOLS_BUNDLED) return
  _activeTextures?.unregister(name)
}
