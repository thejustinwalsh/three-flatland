import type { InstancedMesh } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { BatchesPayload, BatchInfo, PassEvent } from '../debug-protocol'
import type { RegistryData } from '../ecs/batchUtils'
import { BatchMesh, BatchMeta } from '../ecs/traits'
import type { BatchSourceFn, MeshBatchSourceFn } from './debug-sink'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'

/**
 * Fixed stack depth — nested passes (main → shadow → occluder) rarely
 * exceed 3 in practice. 16 is comfortable slack without growing.
 */
const STACK_CAPACITY = 16

/**
 * Producer-side scratch collector for per-frame render-pass events and
 * the current `BatchRegistry` snapshot. Feeds the `'batches'` devtools
 * feature.
 *
 * **Timing model — mirrors `StatsCollector`.** The scratch exposed to
 * `drain()` only ever contains data from a FULLY COMPLETED frame. The
 * in-progress frame writes into a separate "building" pool; at the
 * end of `DevtoolsProvider.endFrame` a single `commit()` call swaps
 * the pools by pointer flip and bumps a version counter. A flush
 * landing between two frames sees the last committed snapshot; a
 * flush landing during a rAF's work sees the previous frame's
 * snapshot — never half-built state.
 *
 * Ordering each frame:
 *   1. `beginFrame` — reset build counts to zero (pointers untouched;
 *      the previous frame's data remains readable on the published
 *      pool until `commit` swaps).
 *   2. `frameStart` — optional; captures renderer-info baseline and
 *      stakes the root "frame" pass at index 0 of the BUILD pool.
 *   3. `beginPass` / `endPass` — write into the build pool, never
 *      touching the published pool.
 *   4. `frameEnd` — populate the root pass's totals from the full
 *      frame's renderer-info delta.
 *   5. `captureAllSources` — walk every registered `RegistryData`
 *      source and fill the build batch pool.
 *   6. `commit` — swap build ↔ published, increment version.
 *
 * Drain compares `_version` to `_lastEmittedVersion`:
 *   - Advanced → ship the published pool. Update `_lastEmittedVersion`.
 *   - Unchanged → `features.batches` stays absent on the wire,
 *     which the protocol interprets as "no change" per the delta
 *     semantics in `debug-protocol.ts`.
 *
 * `resetDelta` just rewinds `_lastEmittedVersion` so a re-subscribing
 * consumer gets the current snapshot on the next flush — or an empty
 * one if no frame has committed yet.
 *
 * - **Zero per-frame allocation past warmup.** Pools grow on demand
 *   and are reused in place; pointer swap is two field assignments.
 * - **Zero cost when inactive.** `_capturing = false` short-circuits
 *   every public entry so the build pool never grows and
 *   `performance.now` calls are skipped.
 */
export class BatchCollector {
  /**
   * Two pre-allocated pool pairs — one "build" (mutated during the
   * current frame), one "published" (read by `drain`). `commit()`
   * pointer-swaps them so the frame that just finished becomes
   * readable atomically and the building slot is free for the next
   * frame to overwrite. Pools grow to the frame's high-watermark and
   * never shrink.
   */
  private _passPoolA: PassEvent[] = []
  private _passPoolB: PassEvent[] = []
  private _buildPasses: PassEvent[] = this._passPoolA
  private _publishedPasses: PassEvent[] = this._passPoolB
  /** Count of valid entries currently being built in `_buildPasses`. */
  private _buildPassCount = 0
  /** Count of valid entries in `_publishedPasses` — what drain ships. */
  private _publishedPassCount = 0

  private _batchPoolA: BatchInfo[] = []
  private _batchPoolB: BatchInfo[] = []
  private _buildBatches: BatchInfo[] = this._batchPoolA
  private _publishedBatches: BatchInfo[] = this._batchPoolB
  private _buildBatchCount = 0
  private _publishedBatchCount = 0

  /** Stack of in-flight pass indices for `beginPass`/`endPass` nesting. */
  private _stackIndex = new Int32Array(STACK_CAPACITY)
  /** `renderer.info.render.calls` at each stack level's `beginPass`. */
  private _stackEntryCalls = new Uint32Array(STACK_CAPACITY)
  private _stackEntryTris = new Uint32Array(STACK_CAPACITY)
  /** `performance.now()` at each stack level's `beginPass`. */
  private _stackEntryTime = new Float64Array(STACK_CAPACITY)
  private _stackTop = -1

  /**
   * Monotonic counter — incremented once per `commit()`. Drain ships
   * whenever `_version !== _lastEmittedVersion`. No `_dirty` flag: the
   * version comparison IS the dirty check, and because commit is the
   * single place that advances it, there's no "was it published yet"
   * ambiguity.
   */
  private _version = 0
  private _lastEmittedVersion = 0

  /** `true` when the feature has an active subscriber. Gate recording. */
  private _capturing = false

  /** Renderer counter baselines captured at `frameStart(renderer)`. */
  private _frameBaseCalls = 0
  private _frameBaseTris = 0
  private _frameStartTime = 0
  /** Index of the implicit root "frame" pass in `_buildPasses`; -1 when not tracking. */
  private _frameRootIdx = -1

  /**
   * Reset the BUILD counters for a new frame. Pointers + published
   * pool are untouched, so a flush landing before this frame's
   * `commit` still sees the previous frame's published snapshot.
   */
  beginFrame(): void {
    this._buildPassCount = 0
    this._buildBatchCount = 0
    this._stackTop = -1
    this._frameRootIdx = -1
  }

  /** Set by `DevtoolsProvider` based on subscriber state. */
  setCapturing(on: boolean): void {
    this._capturing = on
  }

  isCapturing(): boolean {
    return this._capturing
  }

  /**
   * Open the implicit "frame" root pass covering the whole frame.
   * Allocates the root event at index 0 of the BUILD pool and pushes
   * it onto the stack so subsequent `beginPass` calls nest under it.
   * Root counters are left at their previous values here; `frameEnd`
   * overwrites them before `commit` exposes the pool.
   */
  frameStart(renderer: WebGPURenderer): void {
    if (!this._capturing) return
    const info = renderer.info.render
    this._frameBaseCalls = info.calls
    this._frameBaseTris = info.triangles
    this._frameStartTime = performance.now()

    this._frameRootIdx = this._buildPassCount
    let ev = this._buildPasses[this._frameRootIdx]
    if (ev === undefined) {
      ev = { label: 'frame', calls: 0, triangles: 0, cpuMs: 0, depth: 0, parent: -1 }
      this._buildPasses[this._frameRootIdx] = ev
    }
    ev.label = 'frame'
    ev.parent = -1
    ev.depth = 0
    this._buildPassCount++

    this._stackTop = 0
    this._stackIndex[0] = this._frameRootIdx
    this._stackEntryCalls[0] = info.calls
    this._stackEntryTris[0] = info.triangles
    this._stackEntryTime[0] = this._frameStartTime
  }

  /**
   * Close the root pass. Writes renderer-info deltas + wall-clock
   * duration into the build-pool's root event. Does NOT publish —
   * `commit()` does that at the end of `DevtoolsProvider.endFrame`.
   */
  frameEnd(renderer: WebGPURenderer): void {
    if (!this._capturing) return
    if (this._frameRootIdx < 0) return
    const info = renderer.info.render
    const ev = this._buildPasses[this._frameRootIdx]
    if (ev !== undefined) {
      ev.calls = info.calls - this._frameBaseCalls
      ev.triangles = info.triangles - this._frameBaseTris
      ev.cpuMs = performance.now() - this._frameStartTime
    }
    this._stackTop = -1
    this._frameRootIdx = -1
  }

  /**
   * Record the start of a render pass. Snapshots renderer counters
   * and wall-clock start time so `endPass` can compute a delta. Labels
   * must be string constants — never concatenated per-frame. Nested
   * passes are tracked via an internal stack; `parent` wiring is
   * automatic. Writes go into the BUILD pool only.
   */
  beginPass(label: string, renderer: WebGPURenderer): void {
    if (!this._capturing) return
    const top = this._stackTop
    const parentPassIdx = top >= 0 ? this._stackIndex[top]! : -1
    const idx = this._buildPassCount
    let ev = this._buildPasses[idx]
    if (ev === undefined) {
      ev = { label: '', calls: 0, triangles: 0, cpuMs: 0, depth: 0, parent: -1 }
      this._buildPasses[idx] = ev
    }
    ev.label = label
    ev.parent = parentPassIdx
    ev.depth = parentPassIdx === -1 ? 0 : this._buildPasses[parentPassIdx]!.depth + 1
    // Initialise counters so if endPass is missed the event still ships sane.
    ev.calls = 0
    ev.triangles = 0
    ev.cpuMs = 0
    this._buildPassCount = idx + 1

    const nextTop = top + 1
    if (nextTop >= STACK_CAPACITY) {
      // Stack overflow — drop this pass silently rather than throw
      // from a devtools-only codepath.
      return
    }
    const info = renderer.info.render
    this._stackIndex[nextTop] = idx
    this._stackEntryCalls[nextTop] = info.calls
    this._stackEntryTris[nextTop] = info.triangles
    this._stackEntryTime[nextTop] = performance.now()
    this._stackTop = nextTop
  }

  endPass(renderer: WebGPURenderer): void {
    if (!this._capturing) return
    const top = this._stackTop
    if (top < 0) return
    const idx = this._stackIndex[top]!
    const ev = this._buildPasses[idx]
    if (ev !== undefined) {
      const info = renderer.info.render
      ev.calls = info.calls - this._stackEntryCalls[top]!
      ev.triangles = info.triangles - this._stackEntryTris[top]!
      ev.cpuMs = performance.now() - this._stackEntryTime[top]!
    }
    this._stackTop = top - 1
  }

  /**
   * Walk every registered batch source and snapshot into the BUILD pool.
   * Two source families are merged into one output:
   *
   *   - **ECS sources** return a `RegistryData` — tracked by
   *     `SpriteGroup`'s Koota world. Reads `activeBatches` and pulls
   *     material / layer / sprite-count out of trait data.
   *   - **Mesh sources** return an iterable of `InstancedMesh` —
   *     used by engine code that manages its own instanced meshes
   *     outside the ECS (e.g. `TileLayer`'s per-chunk meshes). Each
   *     mesh becomes one `BatchInfo` row.
   *
   * Both kinds land in the same batch pool so the inspector shows a
   * unified "Active batches" list regardless of which subsystem owns
   * the draw. Tile chunks sharing a material collapse into the same
   * run in the panel thanks to the runKey hash.
   */
  captureAllSources(
    sources: ReadonlySet<BatchSourceFn>,
    meshSources: ReadonlySet<MeshBatchSourceFn>,
  ): void {
    if (!this._capturing) return
    for (const src of sources) {
      const reg = src()
      if (reg !== null) this.captureBatches(reg)
    }
    for (const src of meshSources) {
      const iter = src()
      if (iter !== null) this.captureMeshes(iter)
    }
  }

  /**
   * Append engine-owned `InstancedMesh`es into the BUILD batch pool.
   * Each entry can be a raw `InstancedMesh` or a `{ mesh, kind, label }`
   * descriptor — the descriptor form lets sources carry subsystem
   * metadata (e.g. `kind: 'tilechunk'`, `label: 'chunk(0,2)'`) that
   * flows through to the inspector without a second data channel.
   *
   * `layer` comes from the mesh's `Object3D.layers.mask` (bit mask);
   * `materialId` prefers `Sprite2DMaterial.batchId` and falls back to
   * `Material.id`. Meshes sharing a material therefore collapse into
   * the same run in the panel, just like ECS batches do.
   */
  captureMeshes(entries: Iterable<InstancedMesh | { mesh: InstancedMesh; kind?: string; label?: string }>): void {
    if (!this._capturing) return
    let extraIdx = 0
    for (const entry of entries) {
      // Normalise to `{ mesh, kind, label }` without extra allocation —
      // entries in scratch pools are object-shaped; bare meshes have
      // the three.js `isObject3D` marker.
      const mesh = (entry as { mesh?: InstancedMesh }).mesh ?? (entry as InstancedMesh)
      if (mesh === null || mesh === undefined) continue
      const kind = (entry as { kind?: string }).kind
      const label = (entry as { label?: string }).label

      const mat = mesh.material as unknown as Sprite2DMaterial & { id?: number }
      const matId = (mat.batchId ?? mat.id ?? 0) | 0
      const layerMask = mesh.layers.mask | 0

      let info = this._buildBatches[this._buildBatchCount]
      if (info === undefined) {
        info = {
          runKey: 0,
          materialId: 0,
          layer: 0,
          materialName: '',
          spriteCount: 0,
          batchIdx: 0,
        }
        this._buildBatches[this._buildBatchCount] = info
      }
      const matName = (mat as { name?: string }).name ?? ''
      const matType = (mat as { type?: string }).type ?? ''
      info.runKey = ((layerMask & 0xff) << 16) | (matId & 0xffff)
      info.materialId = matId
      info.layer = layerMask
      info.materialName = matName.length > 0
        ? `${matType}[${matName}]`
        : (matType.length > 0 ? matType : `material#${matId}`)
      info.spriteCount = mesh.count
      // External meshes don't have a BatchRegistry slot id; use a
      // negative running counter so they sort after ECS batches and
      // stay stable across frames with the same source ordering.
      info.batchIdx = -1 - extraIdx
      // Only write kind / label when the source provided them so the
      // field stays absent in the common (ECS sprite) case.
      if (kind !== undefined) info.kind = kind
      else delete info.kind
      if (label !== undefined) info.label = label
      else delete info.label
      this._buildBatchCount++
      extraIdx++
    }
  }

  /**
   * Walk `registry.activeBatches` and append into the BUILD batch pool.
   * Callers typically invoke through `captureAllSources`; exposed
   * directly for tests.
   */
  captureBatches(registry: RegistryData): void {
    if (!this._capturing) return
    const active = registry.activeBatches
    const len = active.length
    for (let i = 0; i < len; i++) {
      const e = active[i]!
      const mesh = e.get(BatchMesh)?.mesh
      const meta = e.get(BatchMeta)
      if (mesh === undefined || mesh === null || meta === undefined) continue

      let info = this._buildBatches[this._buildBatchCount]
      if (info === undefined) {
        info = {
          runKey: 0,
          materialId: 0,
          layer: 0,
          materialName: '',
          spriteCount: 0,
          batchIdx: 0,
        }
        this._buildBatches[this._buildBatchCount] = info
      }
      // Prefer the caller-supplied `name` (e.g. `TileLayer` tags its
      // material with the layer name), fall back to the canonical
      // three.js `type` label, then to a numeric-id placeholder.
      const mat = mesh.spriteMaterial
      const label = mat.name.length > 0
        ? `${mat.type}[${mat.name}]`
        : (mat.type.length > 0 ? mat.type : `material#${meta.materialId}`)
      info.runKey = ((meta.layer & 0xff) << 16) | (meta.materialId & 0xffff)
      info.materialId = meta.materialId
      info.layer = meta.layer
      info.materialName = label
      info.spriteCount = mesh.count
      info.batchIdx = meta.batchIdx
      info.kind = 'sprite'
      delete info.label
      this._buildBatchCount++
    }
  }

  /**
   * Atomically publish the build pool. Pointer-swaps build ↔ published
   * and bumps `_version`. Called by `DevtoolsProvider.endFrame` AFTER
   * `frameEnd` + `captureAllSources` have populated the build pool.
   *
   * Noop when not capturing so the version counter doesn't drift while
   * the feature is unsubscribed.
   */
  commit(): void {
    if (!this._capturing) return
    const tp = this._publishedPasses
    this._publishedPasses = this._buildPasses
    this._buildPasses = tp
    this._publishedPassCount = this._buildPassCount

    const tb = this._publishedBatches
    this._publishedBatches = this._buildBatches
    this._buildBatches = tb
    this._publishedBatchCount = this._buildBatchCount

    this._version++
  }

  /**
   * Ship the latest committed snapshot if it's newer than what we last
   * emitted. Returns `false` when the committed version hasn't
   * advanced since the last drain — in which case the `features.batches`
   * field is omitted from the wire payload and the client keeps its
   * previous snapshot (per protocol delta semantics).
   */
  drain(out: BatchesPayload, frame: number): boolean {
    if (this._version === this._lastEmittedVersion) return false
    out.frame = frame
    out.passCount = this._publishedPassCount
    out.passes = this._publishedPasses
    out.batchCount = this._publishedBatchCount
    out.batches = this._publishedBatches
    this._lastEmittedVersion = this._version
    return true
  }

  /**
   * Force the next drain to re-emit — rewinds `_lastEmittedVersion` so
   * the next `drain` call sees a "new" version. Called on every
   * `subscribe` so re-joining consumers get the current snapshot
   * (which may be empty if no frame has committed yet).
   */
  resetDelta(): void {
    this._lastEmittedVersion = this._version - 1
  }

  dispose(): void {
    this._passPoolA.length = 0
    this._passPoolB.length = 0
    this._batchPoolA.length = 0
    this._batchPoolB.length = 0
    this._buildPassCount = 0
    this._publishedPassCount = 0
    this._buildBatchCount = 0
    this._publishedBatchCount = 0
    this._stackTop = -1
    this._capturing = false
  }
}
