import { trait, relation } from 'koota'
import type { Entity } from 'koota'
import type { Object3D } from 'three'
import type { SpriteBatch } from '../pipeline/SpriteBatch'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'

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
// Reference traits (AoS — complex objects)
// ============================================

/** Reference back to the Three.js object (Sprite2D mesh) */
export const ThreeRef = trait(() => ({ object: null as Object3D | null }))

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
 * Spawned once by Renderer2D; systems query for it.
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
}))
