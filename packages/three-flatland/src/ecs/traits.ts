import { trait, relation } from 'koota'
import type { Entity, Trait } from 'koota'
import type { Group, Object3D, OrthographicCamera, Scene, Vector2 } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { SpriteBatch } from '../pipeline/SpriteBatch'
import type { Sprite2DMaterial, ColorTransformFn } from '../materials/Sprite2DMaterial'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { LightEffect, LightEffectRuntimeContext } from '../lights/LightEffect'
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

/** Sort key for batching: render layer (changing this triggers batch reassignment) */
export const SpriteLayer = trait({ layer: 0 })

/** Z-index within layer for depth sorting (does NOT affect batch assignment) */
export const SpriteZIndex = trait({ zIndex: 0 })

/** Material reference for batching (batchId from Sprite2DMaterial) */
export const SpriteMaterialRef = trait({ materialId: 0 })

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
 * Store data holds the slot index within the batch's GPU buffers.
 * Used by lifecycle systems (assign, reassign, remove) for batch entity lookups.
 * Hot-path systems use BatchSlot instead for O(1) reads.
 */
export const InBatch = relation({ exclusive: true, store: { slot: 0 } })

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
  layer: 0,
  renderOrder: 0,
  batchIdx: -1,
})

// ============================================
// Batch registry (world-level singleton entity)
// ============================================

/** A run groups batches sharing the same (layer, materialId) sort dimensions. */
export interface BatchRun {
  materialId: number
  layer: number
  material: Sprite2DMaterial
  batches: Entity[]
}

/**
 * World-level singleton holding batch management state.
 * Spawned once by SpriteGroup; systems query for it.
 */
export const BatchRegistry = trait(() => ({
  /** Runs indexed by run key — groups batches by (layer, materialId). */
  runs: new Map<number, BatchRun>(),
  /** Sorted run keys for O(log R) binary search on insert. */
  sortedRunKeys: [] as number[],
  /** Pool of recycled batch entities for reuse. */
  batchPool: [] as Entity[],
  /** Active batch entities in sorted render order. */
  activeBatches: [] as Entity[],
  /** Whether the scene graph children need rebuilding. */
  renderOrderDirty: false as boolean,
  /** Maximum sprites per batch. */
  maxBatchSize: 10000,
  /** Material references for schema version tracking. */
  materialRefs: new Map<number, { material: Sprite2DMaterial; version: number }>(),
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
    | ((ctx: { color: Node<'vec4'>; atlasUV: Node<'vec2'>; worldPosition: Node<'vec2'> }) => Node<'vec4'>)
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
 * shadows, RadianceLightEffect for GI). Rather than each effect owning
 * its own SDFGenerator, the pipeline is shared at the world level.
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
  materials: new Set() as Set<Sprite2DMaterial>,
  /** Whether the lighting colorTransform needs reassigning to materials. */
  dirty: false as boolean,
  /** Whether the effect has been initialized (init() called). */
  initialized: false as boolean,
  /** SDF generator (lazy — created when LightEffect.needsShadows is true). */
  sdfGenerator: null as SDFGenerator | null,
  // Runtime context (set each frame before systems run)
  /** Renderer reference for GPU passes. */
  renderer: null as WebGPURenderer | null,
  /** Camera for world bounds computation. */
  camera: null as OrthographicCamera | null,
  /** Scene containing the sprites being lit — needed by the shadow pre-pass. */
  scene: null as Scene | null,
  /** World size in units (computed from camera frustum). */
  worldSize: null as Vector2 | null,
  /** World offset (camera left/bottom). */
  worldOffset: null as Vector2 | null,
}))
