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
import type { DataTexture, InstancedMesh, Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { BufferDisplayMode, RegistryEntryKind, TexturePixelType } from '../debug-protocol'
import { DEVTOOLS_BUNDLED } from '../debug-protocol'
import type { RegistryData } from '../ecs/batchUtils'
import type { DebugRegistry } from './DebugRegistry'
import type { DebugTextureRegistry } from './DebugTextureRegistry'
import type { BatchCollector } from './BatchCollector'

let _active: DebugRegistry | null = null
let _activeTextures: DebugTextureRegistry | null = null
let _activeBatches: BatchCollector | null = null

/**
 * Batch source registrations. Each source is a getter that resolves to
 * the latest `RegistryData` (or null if the host's registry isn't ready
 * yet). Getters are called by `BatchCollector.captureAllSources` once
 * per frame; zero work when no consumer is subscribed to `'batches'`.
 *
 * Using getters rather than direct `RegistryData` refs means
 * SpriteGroup / Flatland can register *once* at construction and we
 * always see the live singleton, even if the host recreates it.
 */
export type BatchSourceFn = () => RegistryData | null
const _batchSources = new Set<BatchSourceFn>()

/**
 * One entry from a mesh batch source. Raw `InstancedMesh` is accepted
 * for ease of use; the richer object form lets sources decorate each
 * batch with a `kind` tag (for categorization in the panel) and a
 * `label` (e.g. `'chunk(0,2)'`) to disambiguate identical-material
 * batches in the inspector.
 */
export interface MeshBatchEntry {
  mesh: InstancedMesh
  /** See `BatchInfo.kind` in the protocol. */
  kind?: string
  /** See `BatchInfo.label` in the protocol. */
  label?: string
}

/**
 * Alternate batch-source flavour for engine code that manages its own
 * `InstancedMesh`es outside the ECS (e.g. `TileLayer`'s per-chunk
 * instanced meshes). Each getter yields either raw `InstancedMesh`
 * objects (simple / back-compat) or `MeshBatchEntry` records that
 * carry an explicit kind + label per batch. Returning `null` means
 * "no meshes right now" — cheaper than handing back an empty array.
 */
export type MeshBatchSourceFn = () => Iterable<InstancedMesh | MeshBatchEntry> | null
const _meshBatchSources = new Set<MeshBatchSourceFn>()

// Queued registrations that arrived before the registry was set.
// Replayed on _setActive*Registry and cleared.
type QueuedArray = { name: string; ref: Float32Array | Uint32Array | Int32Array; kind: RegistryEntryKind; opts?: { label?: string; length?: number } }
type QueuedTexture = { name: string; source: DataTexture | { width: number; height: number; texture: Texture }; pixelType: TexturePixelType; opts?: { label?: string; display?: BufferDisplayMode } }
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
  opts?: { label?: string; display?: BufferDisplayMode },
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

// ─── Batch / pass recording ────────────────────────────────────────────

/** @internal Called by `DevtoolsProvider` — not for app code. */
export function _setActiveBatchCollector(bc: BatchCollector | null): void {
  if (!DEVTOOLS_BUNDLED) return
  _activeBatches = bc
}

/**
 * `true` when a consumer is currently subscribed to the `'batches'`
 * feature. Gate any work that builds pass labels or looks at renderer
 * state behind this — `beginDebugPass` / `endDebugPass` are already
 * self-gating but the check is cheaper than an unused `label` literal
 * slot in the callsite's scope.
 */
export function isBatchCapturing(): boolean {
  if (!DEVTOOLS_BUNDLED) return false
  return _activeBatches !== null && _activeBatches.isCapturing()
}

/**
 * Record the start of a render pass. Label must be a stable string
 * constant — never concatenated per-frame. Paired with `endDebugPass`.
 * No-op when devtools isn't bundled or no consumer is subscribed.
 */
export function beginDebugPass(label: string, renderer: WebGPURenderer): void {
  if (!DEVTOOLS_BUNDLED) return
  _activeBatches?.beginPass(label, renderer)
}

export function endDebugPass(renderer: WebGPURenderer): void {
  if (!DEVTOOLS_BUNDLED) return
  _activeBatches?.endPass(renderer)
}

/**
 * Register a source of `RegistryData` so the batch collector can pull
 * the active-batches snapshot at end-of-frame. Called by engine /
 * framework code (Flatland, `SpriteGroup`) once per owned world.
 *
 * No-op when devtools isn't bundled. The set is keyed by reference;
 * pass the same function to `_unregisterBatchSource` on dispose.
 */
export function _registerBatchSource(source: BatchSourceFn): void {
  if (!DEVTOOLS_BUNDLED) return
  _batchSources.add(source)
}

export function _unregisterBatchSource(source: BatchSourceFn): void {
  if (!DEVTOOLS_BUNDLED) return
  _batchSources.delete(source)
}

/** @internal Used by `DevtoolsProvider.endFrame`. */
export function _getBatchSources(): ReadonlySet<BatchSourceFn> {
  return _batchSources
}

/**
 * Register a mesh-based batch source. See `MeshBatchSourceFn` for
 * semantics. No-op when devtools isn't bundled. Pair each register
 * with an unregister on the same function reference at dispose.
 */
export function _registerMeshBatchSource(source: MeshBatchSourceFn): void {
  if (!DEVTOOLS_BUNDLED) return
  _meshBatchSources.add(source)
}

export function _unregisterMeshBatchSource(source: MeshBatchSourceFn): void {
  if (!DEVTOOLS_BUNDLED) return
  _meshBatchSources.delete(source)
}

/** @internal Used by `DevtoolsProvider.endFrame`. */
export function _getMeshBatchSources(): ReadonlySet<MeshBatchSourceFn> {
  return _meshBatchSources
}
