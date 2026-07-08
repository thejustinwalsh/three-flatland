import { trait, relation } from 'koota'
import { Vector2 } from 'three'
import type { Entity, Trait } from 'koota'
import type { Group, Object3D, OrthographicCamera, Scene, Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { SpriteBatch } from '../pipeline/SpriteBatch'
import type { Sprite2DMaterial, ColorTransformFn } from '../materials/Sprite2DMaterial'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { LightEffect } from '../lights/LightEffect'
import type { LightStore } from '../lights/LightStore'
import type { Light2D } from '../lights/Light2D'
import type { SDFGenerator } from '../lights/SDFGenerator'
import type { OcclusionPass } from '../lights/OcclusionPass'
import type { ChannelName } from '../materials/channels'
import type { SystemSchedule } from './SystemSchedule'
import type Node from 'three/src/nodes/core/Node.js'

// ============================================
// GPU instance data (SoA — maps to interleaved GPU buffers)
// ============================================

/** Sprite frame UV in atlas (x, y, width, height) normalized 0-1 */
export const SpriteUV = trait({ x: 0, y: 0, w: 1, h: 1 })

/** Sprite tint color and alpha (r, g, b, a) */
export const SpriteColor = trait({ r: 1, g: 1, b: 1, a: 1 })

/** Sprite flip flags: 1 = normal, -1 = flipped */
export const SpriteFlip = trait({ x: 1, y: 1 })

// ============================================
// Sort/batch metadata
// ============================================

/**
 * Sort key for batching: numeric sortLayer value (changing this triggers
 * batch reassignment). Cross-primitive — sprites, particles, and future
 * batchers all participate through this same trait.
 */
export const SortLayer = trait({ value: 0 })

/** Z-index within sortLayer for depth sorting (does NOT affect batch assignment) */
export const SpriteZIndex = trait({ zIndex: 0 })

/** Material reference for batching (batchId from Sprite2DMaterial) */
export const SpriteMaterialRef = trait({ materialId: 0 })

/**
 * Three's `Object3D.layers` bitmask, mirrored into the ECS so mask
 * mutations (via the wrapped `Layers` instance on Sprite2D) trigger
 * batch re-routing. Part of the batch run key — different camera masks
 * route to differently-masked batches (still batched, never standalone).
 */
export const CameraLayersMask = trait({ mask: 1 })

// ============================================
// Tags
// ============================================

/** Tag: entity is renderable (has all required components for rendering) */
export const IsRenderable = trait()

/** Tag: entity is currently assigned to a SpriteBatch */
export const IsBatched = trait()

/** Tag: entity is rendering standalone (not in a batch) */
export const IsStandalone = trait()

// ============================================
// Batch slot cache (SoA — fast-path for hot systems)
// ============================================

/**
 * SoA cache of batch assignment for hot-path systems (transform sync, buffer sync).
 * batchIdx indexes into BatchRegistry.batchSlots[] to get the SpriteBatch.
 * slot is the index within that batch's GPU buffers.
 * Avoids O(n) relation resolution per entity per frame.
 */
export const BatchSlot = trait({ batchIdx: -1, slot: -1 })

// ============================================
// Relations
// ============================================

/**
 * Relation: sprite entity → batch entity (exclusive: sprite can only be in one batch).
 * Pure membership marker — the slot index lives in BatchSlot, which batchSortSystem
 * keeps in sync on every swap (a slot on the relation would go stale after a sort).
 */
export const InBatch = relation({ exclusive: true })

// ============================================
// Batch entity traits
// ============================================

/**
 * AoS — reference to the SpriteBatch that owns GPU buffers AND slot management.
 * SpriteBatch already has: writeColor(), writeUV(), writeFlip(),
 * writeMatrix(), writeCustom(), writeEffectSlot(), allocateSlot(), freeSlot().
 */
export const BatchMesh = trait(() => ({
  mesh: null as SpriteBatch | null,
}))

/**
 * SoA — batch metadata for sorting/grouping (query-visible fields only).
 * Used by systems for run-key computation and sorted batch ordering.
 * batchIdx maps into BatchRegistry.batchSlots[] for O(1) mesh lookup.
 */
export const BatchMeta = trait({
  materialId: 0,
  sortLayer: 0,
  layersMask: 1,
  renderOrder: 0,
  batchIdx: -1,
})

// ============================================
// Batch classification traits (public, read-only via facade)
// ============================================
//
// Trait existence declares the architectural fact; query-vs-branch is a
// per-system tuning knob. Systems today still branch on
// `material.transparent` (few stable batches → predictable branches are
// ~free); the traits exist so users and future custom render passes can
// query-narrow (`group.batches.where(IsLitBatch)`), and so individual
// systems can flip from branch to query under procedural-batch-heavy
// workloads without restructuring the data model.

/** Tag: batch's material alpha-blends (`transparent && alphaTest === 0`). */
export const IsAlphaBlendedBatch = trait()

/** Tag: batch's material alpha-tests (`alphaTest > 0` — opaque fast path). */
export const IsAlphaTestedBatch = trait()

/** Tag: batch's material is lit (a lighting colorTransform is attached). */
export const IsLitBatch = trait()

/** Tag: batch's material is unlit. */
export const IsUnlitBatch = trait()

/**
 * Which geometry path the batch renders with. `synth-quad` (default
 * post vertex-binding reclaim) synthesizes the unit quad from
 * vertexIndex; `tight-mesh` is the alpha-blend overdraw-reduction path;
 * `custom` is reserved for user-supplied batch geometry.
 */
export const BatchGeometryStrategy = trait(() => ({
  kind: 'synth-quad' as 'synth-quad' | 'tight-mesh' | 'custom',
}))

// ============================================
// Batch registry (world-level singleton entity)
// ============================================

/**
 * A run groups batches sharing the same (materialId, sortLayer,
 * layers.mask) run-key dimensions. Each component is a real GPU
 * constraint: material = shader pipeline, sortLayer = render-list
 * position, layers.mask = camera visibility.
 */
export interface BatchRun {
  materialId: number
  sortLayer: number
  layersMask: number
  material: Sprite2DMaterial
  batches: Entity[]
}

/**
 * World-level singleton holding batch management state.
 * Spawned once by SpriteGroup; systems query for it.
 */
export const BatchRegistry = trait(() => ({
  /** Runs indexed by run key — groups batches by (materialId, sortLayer, layers.mask). */
  runs: new Map<string, BatchRun>(),
  /** Sorted run keys for O(log R) binary search on insert. */
  sortedRunKeys: [] as string[],
  /** Pool of recycled batch entities for reuse. */
  batchPool: [] as Entity[],
  /** Active batch entities in sorted render order. */
  activeBatches: [] as Entity[],
  /** Whether the scene graph children need rebuilding. */
  renderOrderDirty: false as boolean,
  /** Maximum sprites per batch (explicit opt-in path). */
  maxBatchSize: 16384,
  /** Tiered batch sizes for the auto-orchestrate path; null = fixed maxBatchSize. */
  tierLadder: null as readonly number[] | null,
  /** Material references for schema version tracking. */
  materialRefs: new Map<number, { material: Sprite2DMaterial; version: number }>(),
  /**
   * Per-texture default Sprite2DMaterials, scoped to this world —
   * replaces the cross-world static cache footgun. Registering an
   * effect on one world's default never leaks into another's.
   */
  defaultMaterials: new WeakMap<Texture, Sprite2DMaterial>(),
  /**
   * World-scoped effect-variant materials (the constants-effect
   * counterpart of `defaultMaterials`): texture → variant key →
   * material. See `RegistryData.effectVariants` in ecs/batchUtils.ts
   * for the key composition.
   */
  effectVariants: new WeakMap<Texture, Map<string, Sprite2DMaterial>>(),
  /** Indexed array of active SpriteBatch meshes for O(1) lookup from BatchSlot.batchIdx. */
  batchSlots: [] as (SpriteBatch | null)[],
  /** Free indices in batchSlots for reuse. */
  batchSlotFreeList: [] as number[],
  /** Flat array of Sprite2D refs indexed by entity SoA index (eid).
   *  Pure array indexing — same O(1) pattern as other SoA stores. */
  spriteArr: [] as (Sprite2D | null)[],
  /** Cached effect traits across all materials. Populated by materialVersionSystem. */
  effectTraits: new Map() as Map<Trait, typeof MaterialEffect>,
  /** Entities whose destruction is deferred to the top of the next frame. */
  pendingDestroy: [] as Entity[],
  /** The SpriteGroup (parent Group) for scene graph sync. */
  parentGroup: null as Group | null,
  /** Bound Group.prototype.add bypassing SpriteGroup override. */
  parentAdd: null as ((...objects: Object3D[]) => Group) | null,
  /** Bound Group.prototype.remove bypassing SpriteGroup override. */
  parentRemove: null as ((...objects: Object3D[]) => Group) | null,
  /** Whether auto-invalidate transforms is enabled. */
  autoInvalidateTransforms: true as boolean,
  /** The SystemSchedule for this world. */
  schedule: null as SystemSchedule | null,
  /**
   * Monotonic counter of how many times `schedule.run` has executed
   * for this registry. Entry points (`SpriteGroup.update`,
   * `SpriteGroup.updateMatrixWorld`, `Flatland.render`) consult the
   * counter against their own last-seen value so that multiple
   * triggers inside one logical frame collapse to a single run.
   *
   * `Flatland.render` bumps a private "this frame runs allowed"
   * counter before running the schedule the first time; the second
   * and third entry points see that a run has already happened and
   * skip. Without this, `shadowPipelineSystem` fires three times per
   * frame (direct schedule.run + spriteGroup.update + scene
   * updateMatrixWorld) and the whole shadow pipeline gets paid for
   * 3× the cost.
   */
  scheduleRuns: 0,
  /**
   * Whether any occluder changed since the last shadow generation.
   * Set false at the top of `flushDirtyRangesSystem`, then set true if any
   * batch mesh reports `isDirty` before its trackers are flushed.
   * `shadowPipelineSystem` reads this to skip the occluder render + SDF
   * regen when nothing moved. Defaults true so the first frame regenerates.
   */
  occludersDirty: true as boolean,
}))

// ============================================
// Post-processing pass traits
// ============================================

/** AoS — holds a post-processing pass function, order, and enabled state. */
export const PostPassTrait = trait(() => ({
  fn: null as ((input: Node<'vec4'>, uv: Node<'vec2'>) => Node<'vec4'>) | null,
  order: 0,
  enabled: true,
}))

/** World-level singleton for post-processing pass dirty tracking. */
export const PostPassRegistry = trait(() => ({
  dirty: false as boolean,
}))

// ============================================
// Lighting effect traits
// ============================================

/** AoS — holds a lighting ColorTransformFn and enabled state. */
export const LightEffectTrait = trait(() => ({
  fn: null as
    | ((ctx: {
        color: Node<'vec4'>
        atlasUV: Node<'vec2'>
        worldPosition: Node<'vec2'>
      }) => Node<'vec4'>)
    | null,
  enabled: true,
}))

/**
 * World-level singleton holding all lighting state.
 * Spawned by Flatland.setLighting(); lighting ECS systems read from this.
 * Replaces the scattered private fields on Flatland.
 */
/**
 * World-level singleton owning the shared shadow pipeline infrastructure.
 *
 * Multiple LightEffects can depend on SDF data (DefaultLightEffect for
 * shadows; future GI effects could share the same generators). Rather
 * than each effect owning its own SDFGenerator, the pipeline is shared
 * at the world level.
 *
 * Lifecycle: `shadowPipelineSystem` owns this trait end-to-end — it
 * allocates the generators when the active effect declares
 * `needsShadows`, resizes them as the viewport changes, runs the
 * per-frame pre-pass, and disposes on detach. Flatland does not touch
 * these fields.
 *
 * Fast-path contract: every field here is either a nullable object
 * reference or a small scalar. Consumers read via `entity.get(ShadowPipeline)`
 * (O(1) pointer deref in Koota) and mutate in place. No per-frame
 * allocation.
 */
export const ShadowPipeline = trait(() => ({
  /** JFA SDF generator. Null while inactive. */
  sdfGenerator: null as SDFGenerator | null,
  /** Occluder silhouette pre-pass. Null while inactive. */
  occlusionPass: null as OcclusionPass | null,
  /** Last SDF render-target width (post-resolution-scale). */
  width: 0,
  /** Last SDF render-target height (post-resolution-scale). */
  height: 0,
  /** True once the first-frame init() has allocated GPU resources. */
  initialized: false,
  /** Camera frustum/position at last generation — NaN sentinels force the
   *  first compare to read "changed" so a camera pan/zoom regenerates. */
  lastLeft: NaN,
  lastRight: NaN,
  lastTop: NaN,
  lastBottom: NaN,
  lastPosX: NaN,
  lastPosY: NaN,
  lastZoom: NaN,
}))

export const LightingContext = trait(() => ({
  /** Active LightEffect instance. */
  effect: null as LightEffect | null,
  /** LightStore providing light data textures. */
  lightStore: null as LightStore | null,
  /** Active Light2D objects. */
  lights: [] as Light2D[],
  /** Wrapped light fn with per-instance lit-bit check (for batched sprites). */
  wrappedLightFn: null as ColorTransformFn | null,
  /** Per-fragment channels required by the active LightEffect. */
  requiredChannels: new Set() as ReadonlySet<ChannelName>,
  /** All tracked sprite materials for colorTransform assignment. */
  materials: new Set<Sprite2DMaterial>(),
  /** Whether the lighting colorTransform needs reassigning to materials. */
  dirty: false as boolean,
  /** Whether the effect has been initialized (init() called). */
  initialized: false as boolean,
  // Runtime context (set each frame before systems run)
  /** Renderer reference for GPU passes. */
  renderer: null as WebGPURenderer | null,
  /** Camera for world bounds computation. */
  camera: null as OrthographicCamera | null,
  /** Scene containing the sprites being lit — needed by the shadow pre-pass. */
  scene: null as Scene | null,
  /** World size in units (computed from camera frustum). */
  worldSize: new Vector2(),
  /** World offset (camera left/bottom). */
  worldOffset: new Vector2(),
}))
