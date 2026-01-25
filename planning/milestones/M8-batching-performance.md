# M8: Batching Performance

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 2 weeks |
| **Dependencies** | M3 (2D Render Pipeline) |
| **Outputs** | Optimized SpriteBatch, Memory pooling, Culling strategies, Profiling tools |
| **Risk Level** | Medium (performance optimization, requires benchmarking) |

---

## Objectives

1. Optimize `SpriteBatch` for maximum throughput
2. Implement memory pooling for reduced GC pressure
3. Add frustum and occlusion culling strategies
4. Create profiling and benchmarking tools
5. Target: 100,000 sprites at 60fps

---

## Architecture

```
+---------------------------------------------------------------------------+
|                    BATCHING PERFORMANCE ARCHITECTURE                       |
+---------------------------------------------------------------------------+
|                                                                           |
|   SpriteBatch (Optimized)                                                 |
|   +-------------------------------------------------------------------+   |
|   |  - Double-buffered instance data                                  |   |
|   |  - Dirty region tracking (partial uploads)                        |   |
|   |  - Pre-allocated typed arrays with growth strategy                |   |
|   |  - SIMD-friendly data layout (SoA vs AoS)                        |   |
|   +-------------------------------------------------------------------+   |
|                              |                                            |
|                              v                                            |
|   MemoryPool                                                              |
|   +-------------------------------------------------------------------+   |
|   |  - Object pooling for Sprite2D instances                          |   |
|   |  - TypedArray pooling for batch buffers                           |   |
|   |  - Matrix pool for transform calculations                         |   |
|   |  - Automatic pool growth and shrink                               |   |
|   +-------------------------------------------------------------------+   |
|                              |                                            |
|                              v                                            |
|   CullingSystem                                                           |
|   +-------------------------------------------------------------------+   |
|   |  - Frustum culling (camera bounds)                                |   |
|   |  - Grid-based spatial partitioning                                |   |
|   |  - Dirty rect optimization                                        |   |
|   |  - Layer visibility culling                                       |   |
|   +-------------------------------------------------------------------+   |
|                              |                                            |
|                              v                                            |
|   Profiler                                                                |
|   +-------------------------------------------------------------------+   |
|   |  - Frame time breakdown                                           |   |
|   |  - Memory usage tracking                                          |   |
|   |  - Draw call analysis                                             |   |
|   |  - Bottleneck identification                                      |   |
|   +-------------------------------------------------------------------+   |
|                                                                           |
+---------------------------------------------------------------------------+
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/performance/types.ts:**

```typescript
import type { Sprite2D } from '../sprites/Sprite2D';
import type { Camera } from 'three';

/**
 * Configuration for memory pooling.
 */
export interface PoolConfig {
  /** Initial pool size */
  initialSize: number;
  /** Maximum pool size (0 = unlimited) */
  maxSize: number;
  /** Growth factor when pool is exhausted */
  growthFactor: number;
  /** Whether to shrink pool when underutilized */
  autoShrink: boolean;
  /** Utilization threshold for shrinking (0-1) */
  shrinkThreshold: number;
}

/**
 * Culling configuration.
 */
export interface CullingConfig {
  /** Enable frustum culling */
  frustumCulling: boolean;
  /** Enable spatial partitioning */
  spatialPartitioning: boolean;
  /** Grid cell size for spatial partitioning */
  gridCellSize: number;
  /** Padding around camera bounds (pixels) */
  frustumPadding: number;
  /** Enable dirty rect tracking */
  dirtyRectTracking: boolean;
}

/**
 * Performance statistics.
 */
export interface PerformanceStats {
  /** Frames per second */
  fps: number;
  /** Frame time in milliseconds */
  frameTime: number;
  /** Time breakdown */
  timing: {
    /** Culling time (ms) */
    culling: number;
    /** Sorting time (ms) */
    sorting: number;
    /** Buffer upload time (ms) */
    upload: number;
    /** GPU render time (ms) */
    render: number;
    /** Total update time (ms) */
    total: number;
  };
  /** Sprite counts */
  sprites: {
    /** Total registered sprites */
    total: number;
    /** Visible after culling */
    visible: number;
    /** Actually rendered */
    rendered: number;
    /** Culled by frustum */
    culledFrustum: number;
    /** Culled by occlusion */
    culledOcclusion: number;
  };
  /** Memory statistics */
  memory: {
    /** Pool memory usage (bytes) */
    poolMemory: number;
    /** Buffer memory usage (bytes) */
    bufferMemory: number;
    /** Objects in pool */
    pooledObjects: number;
    /** Active objects from pool */
    activeObjects: number;
  };
  /** Batch statistics */
  batches: {
    /** Number of batches */
    count: number;
    /** Total draw calls */
    drawCalls: number;
    /** Average sprites per batch */
    avgSpritesPerBatch: number;
    /** Batch efficiency (0-1) */
    efficiency: number;
  };
}

/**
 * Culling result for a sprite.
 */
export interface CullingResult {
  /** Whether sprite is visible */
  visible: boolean;
  /** Reason for culling (if culled) */
  reason?: 'frustum' | 'occlusion' | 'layer' | 'alpha';
}

/**
 * Spatial partition cell.
 */
export interface SpatialCell {
  /** Cell X index */
  x: number;
  /** Cell Y index */
  y: number;
  /** Sprites in this cell */
  sprites: Set<Sprite2D>;
  /** Whether cell is dirty */
  dirty: boolean;
}
```

---

### 2. Memory Pool

**packages/core/src/performance/MemoryPool.ts:**

```typescript
import type { PoolConfig } from './types';

/**
 * Generic object pool for reducing GC pressure.
 *
 * @example
 * ```typescript
 * const pool = new MemoryPool(() => new Vector3(), {
 *   initialSize: 1000,
 *   maxSize: 10000,
 * });
 *
 * const vec = pool.acquire();
 * // use vec
 * pool.release(vec);
 * ```
 */
export class MemoryPool<T> {
  private pool: T[] = [];
  private active: Set<T> = new Set();
  private factory: () => T;
  private reset?: (item: T) => void;
  private config: PoolConfig;

  constructor(
    factory: () => T,
    config: Partial<PoolConfig> = {},
    reset?: (item: T) => void
  ) {
    this.factory = factory;
    this.reset = reset;
    this.config = {
      initialSize: config.initialSize ?? 100,
      maxSize: config.maxSize ?? 0,
      growthFactor: config.growthFactor ?? 2,
      autoShrink: config.autoShrink ?? true,
      shrinkThreshold: config.shrinkThreshold ?? 0.25,
    };

    // Pre-populate pool
    this.grow(this.config.initialSize);
  }

  /**
   * Acquire an object from the pool.
   */
  acquire(): T {
    let item: T;

    if (this.pool.length > 0) {
      item = this.pool.pop()!;
    } else {
      // Pool exhausted, grow if allowed
      if (this.config.maxSize === 0 || this.active.size < this.config.maxSize) {
        this.grow(Math.max(1, Math.floor(this.active.size * (this.config.growthFactor - 1))));
        item = this.pool.pop()!;
      } else {
        // At max capacity, create temporary object
        console.warn('MemoryPool at max capacity, creating temporary object');
        item = this.factory();
      }
    }

    this.active.add(item);
    return item;
  }

  /**
   * Release an object back to the pool.
   */
  release(item: T): void {
    if (!this.active.has(item)) {
      return; // Not from this pool or already released
    }

    this.active.delete(item);

    // Reset object state
    if (this.reset) {
      this.reset(item);
    }

    this.pool.push(item);

    // Check for shrinking
    if (this.config.autoShrink) {
      this.maybeShrink();
    }
  }

  /**
   * Release multiple objects.
   */
  releaseAll(items: Iterable<T>): void {
    for (const item of items) {
      this.release(item);
    }
  }

  /**
   * Grow the pool by a specified amount.
   */
  private grow(count: number): void {
    for (let i = 0; i < count; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * Shrink the pool if underutilized.
   */
  private maybeShrink(): void {
    const totalCapacity = this.pool.length + this.active.size;
    const utilization = this.active.size / totalCapacity;

    if (utilization < this.config.shrinkThreshold && this.pool.length > this.config.initialSize) {
      // Shrink to 50% above current active count
      const targetSize = Math.max(
        this.config.initialSize,
        Math.floor(this.active.size * 1.5)
      );
      const toRemove = this.pool.length - (targetSize - this.active.size);
      if (toRemove > 0) {
        this.pool.splice(0, toRemove);
      }
    }
  }

  /**
   * Get pool statistics.
   */
  getStats(): { pooled: number; active: number; total: number } {
    return {
      pooled: this.pool.length,
      active: this.active.size,
      total: this.pool.length + this.active.size,
    };
  }

  /**
   * Clear the pool.
   */
  clear(): void {
    this.pool = [];
    this.active.clear();
  }

  /**
   * Dispose of the pool.
   */
  dispose(): void {
    this.clear();
  }
}

/**
 * TypedArray pool for buffer management.
 */
export class TypedArrayPool {
  private float32Pools: Map<number, Float32Array[]> = new Map();
  private uint32Pools: Map<number, Uint32Array[]> = new Map();
  private uint16Pools: Map<number, Uint16Array[]> = new Map();

  /**
   * Acquire a Float32Array of specified length.
   */
  acquireFloat32(length: number): Float32Array {
    const pool = this.float32Pools.get(length);
    if (pool && pool.length > 0) {
      return pool.pop()!;
    }
    return new Float32Array(length);
  }

  /**
   * Release a Float32Array back to the pool.
   */
  releaseFloat32(array: Float32Array): void {
    const length = array.length;
    if (!this.float32Pools.has(length)) {
      this.float32Pools.set(length, []);
    }
    // Clear the array
    array.fill(0);
    this.float32Pools.get(length)!.push(array);
  }

  /**
   * Acquire a Uint32Array of specified length.
   */
  acquireUint32(length: number): Uint32Array {
    const pool = this.uint32Pools.get(length);
    if (pool && pool.length > 0) {
      return pool.pop()!;
    }
    return new Uint32Array(length);
  }

  /**
   * Release a Uint32Array back to the pool.
   */
  releaseUint32(array: Uint32Array): void {
    const length = array.length;
    if (!this.uint32Pools.has(length)) {
      this.uint32Pools.set(length, []);
    }
    array.fill(0);
    this.uint32Pools.get(length)!.push(array);
  }

  /**
   * Get memory usage estimate.
   */
  getMemoryUsage(): number {
    let bytes = 0;
    for (const [length, pool] of this.float32Pools) {
      bytes += length * 4 * pool.length;
    }
    for (const [length, pool] of this.uint32Pools) {
      bytes += length * 4 * pool.length;
    }
    for (const [length, pool] of this.uint16Pools) {
      bytes += length * 2 * pool.length;
    }
    return bytes;
  }

  /**
   * Clear all pools.
   */
  clear(): void {
    this.float32Pools.clear();
    this.uint32Pools.clear();
    this.uint16Pools.clear();
  }
}
```

---

### 3. Optimized SpriteBatch

**packages/core/src/performance/OptimizedSpriteBatch.ts:**

```typescript
import {
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
  Matrix4,
  Texture,
  DynamicDrawUsage,
} from 'three';
import { SpriteBatchMaterial } from '../pipeline/SpriteBatchMaterial';
import type { BlendMode } from '../pipeline/types';
import type { Sprite2D } from '../sprites/Sprite2D';
import { TypedArrayPool } from './MemoryPool';

/**
 * Performance-optimized sprite batch with:
 * - Double buffering for async uploads
 * - Dirty region tracking for partial updates
 * - Pre-allocated buffers with growth strategy
 * - SIMD-friendly Structure of Arrays layout
 */
export class OptimizedSpriteBatch {
  /** The instanced mesh */
  readonly mesh: InstancedMesh;

  /** Batch texture */
  readonly texture: Texture;

  /** Batch blend mode */
  readonly blendMode: BlendMode;

  /** Maximum sprites capacity */
  private capacity: number;

  // Double-buffered instance data (ping-pong)
  private bufferA: BatchBuffers;
  private bufferB: BatchBuffers;
  private activeBuffer: 'A' | 'B' = 'A';

  // Dirty tracking
  private dirtyStart: number = 0;
  private dirtyEnd: number = 0;
  private fullyDirty: boolean = true;

  // Current sprite count
  private count: number = 0;

  // Sprite index mapping for updates
  private spriteIndices: Map<Sprite2D, number> = new Map();

  // Shared resources
  private static arrayPool = new TypedArrayPool();
  private static sharedGeometry: PlaneGeometry | null = null;

  constructor(texture: Texture, blendMode: BlendMode, initialCapacity: number = 1000) {
    this.texture = texture;
    this.blendMode = blendMode;
    this.capacity = initialCapacity;

    // Create or reuse shared geometry
    if (!OptimizedSpriteBatch.sharedGeometry) {
      OptimizedSpriteBatch.sharedGeometry = new PlaneGeometry(1, 1);
    }
    const geometry = OptimizedSpriteBatch.sharedGeometry.clone();

    // Create material
    const material = new SpriteBatchMaterial({
      map: texture,
      blendMode,
    });

    // Create instanced mesh
    this.mesh = new InstancedMesh(geometry, material, initialCapacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;

    // Allocate double buffers
    this.bufferA = this.createBuffers(initialCapacity);
    this.bufferB = this.createBuffers(initialCapacity);

    // Setup instance attributes with dynamic usage hint
    this.setupAttributes(geometry);
  }

  /**
   * Create buffer set for a given capacity.
   */
  private createBuffers(capacity: number): BatchBuffers {
    return {
      matrices: new Float32Array(capacity * 16),
      uvOffsets: new Float32Array(capacity * 4),
      colors: new Float32Array(capacity * 4),
    };
  }

  /**
   * Setup instance attributes on geometry.
   */
  private setupAttributes(geometry: PlaneGeometry): void {
    const activeBuffers = this.getActiveBuffers();

    const uvAttr = new InstancedBufferAttribute(activeBuffers.uvOffsets, 4);
    uvAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('instanceUV', uvAttr);

    const colorAttr = new InstancedBufferAttribute(activeBuffers.colors, 4);
    colorAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('instanceColor', colorAttr);
  }

  /**
   * Get the active buffer set.
   */
  private getActiveBuffers(): BatchBuffers {
    return this.activeBuffer === 'A' ? this.bufferA : this.bufferB;
  }

  /**
   * Get the back buffer set.
   */
  private getBackBuffers(): BatchBuffers {
    return this.activeBuffer === 'A' ? this.bufferB : this.bufferA;
  }

  /**
   * Swap buffers (double buffering).
   */
  private swapBuffers(): void {
    this.activeBuffer = this.activeBuffer === 'A' ? 'B' : 'A';
  }

  /**
   * Ensure capacity for a given sprite count.
   */
  private ensureCapacity(requiredCapacity: number): void {
    if (requiredCapacity <= this.capacity) {
      return;
    }

    // Grow by 1.5x or to required, whichever is larger
    const newCapacity = Math.max(
      requiredCapacity,
      Math.floor(this.capacity * 1.5)
    );

    // Reallocate buffers
    const newBufferA = this.createBuffers(newCapacity);
    const newBufferB = this.createBuffers(newCapacity);

    // Copy existing data
    newBufferA.matrices.set(this.bufferA.matrices);
    newBufferA.uvOffsets.set(this.bufferA.uvOffsets);
    newBufferA.colors.set(this.bufferA.colors);

    newBufferB.matrices.set(this.bufferB.matrices);
    newBufferB.uvOffsets.set(this.bufferB.uvOffsets);
    newBufferB.colors.set(this.bufferB.colors);

    this.bufferA = newBufferA;
    this.bufferB = newBufferB;

    // Update mesh capacity
    this.mesh.instanceMatrix = new InstancedBufferAttribute(
      this.getActiveBuffers().matrices,
      16
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);

    // Update geometry attributes
    const geometry = this.mesh.geometry;
    geometry.setAttribute(
      'instanceUV',
      new InstancedBufferAttribute(this.getActiveBuffers().uvOffsets, 4)
    );
    geometry.setAttribute(
      'instanceColor',
      new InstancedBufferAttribute(this.getActiveBuffers().colors, 4)
    );

    this.capacity = newCapacity;
    this.fullyDirty = true;
  }

  /**
   * Mark a range as dirty.
   */
  private markDirty(start: number, end: number): void {
    if (this.fullyDirty) return;

    if (this.dirtyStart === this.dirtyEnd) {
      this.dirtyStart = start;
      this.dirtyEnd = end;
    } else {
      this.dirtyStart = Math.min(this.dirtyStart, start);
      this.dirtyEnd = Math.max(this.dirtyEnd, end);
    }
  }

  /**
   * Clear the batch for reuse.
   */
  clear(): void {
    this.count = 0;
    this.spriteIndices.clear();
    this.dirtyStart = 0;
    this.dirtyEnd = 0;
    this.fullyDirty = true;
  }

  /**
   * Add a sprite to the batch.
   */
  add(sprite: Sprite2D): boolean {
    this.ensureCapacity(this.count + 1);

    const i = this.count;
    this.spriteIndices.set(sprite, i);
    this.writeSprite(sprite, i);
    this.count++;
    this.markDirty(i, i + 1);

    return true;
  }

  /**
   * Update a sprite in the batch.
   */
  update(sprite: Sprite2D): boolean {
    const index = this.spriteIndices.get(sprite);
    if (index === undefined) {
      return false;
    }

    this.writeSprite(sprite, index);
    this.markDirty(index, index + 1);
    return true;
  }

  /**
   * Write sprite data to buffers at given index.
   */
  private writeSprite(sprite: Sprite2D, index: number): void {
    const buffers = this.getActiveBuffers();

    // Get world matrix
    sprite.updateWorldMatrix(true, false);
    const worldMatrix = sprite.matrixWorld;

    // Store matrix (16 floats)
    worldMatrix.toArray(buffers.matrices, index * 16);

    // UV offset (x, y, w, h in atlas)
    const frame = sprite.frame;
    const uvBase = index * 4;
    if (frame) {
      buffers.uvOffsets[uvBase] = frame.x;
      buffers.uvOffsets[uvBase + 1] = frame.y;
      buffers.uvOffsets[uvBase + 2] = frame.width;
      buffers.uvOffsets[uvBase + 3] = frame.height;
    } else {
      buffers.uvOffsets[uvBase] = 0;
      buffers.uvOffsets[uvBase + 1] = 0;
      buffers.uvOffsets[uvBase + 2] = 1;
      buffers.uvOffsets[uvBase + 3] = 1;
    }

    // Color (tint + alpha)
    const tint = sprite.tint;
    const colorBase = index * 4;
    buffers.colors[colorBase] = tint.r;
    buffers.colors[colorBase + 1] = tint.g;
    buffers.colors[colorBase + 2] = tint.b;
    buffers.colors[colorBase + 3] = sprite.alpha;
  }

  /**
   * Upload instance data to GPU (partial or full).
   */
  upload(): void {
    this.mesh.count = this.count;

    if (this.count === 0) return;

    const buffers = this.getActiveBuffers();
    const geometry = this.mesh.geometry;

    if (this.fullyDirty) {
      // Full upload
      this.mesh.instanceMatrix.array = buffers.matrices;
      this.mesh.instanceMatrix.needsUpdate = true;

      (geometry.getAttribute('instanceUV') as InstancedBufferAttribute).array = buffers.uvOffsets;
      (geometry.getAttribute('instanceUV') as InstancedBufferAttribute).needsUpdate = true;

      (geometry.getAttribute('instanceColor') as InstancedBufferAttribute).array = buffers.colors;
      (geometry.getAttribute('instanceColor') as InstancedBufferAttribute).needsUpdate = true;

      this.fullyDirty = false;
    } else if (this.dirtyStart < this.dirtyEnd) {
      // Partial upload using updateRange
      const matrixAttr = this.mesh.instanceMatrix;
      matrixAttr.updateRange.offset = this.dirtyStart * 16;
      matrixAttr.updateRange.count = (this.dirtyEnd - this.dirtyStart) * 16;
      matrixAttr.needsUpdate = true;

      const uvAttr = geometry.getAttribute('instanceUV') as InstancedBufferAttribute;
      uvAttr.updateRange.offset = this.dirtyStart * 4;
      uvAttr.updateRange.count = (this.dirtyEnd - this.dirtyStart) * 4;
      uvAttr.needsUpdate = true;

      const colorAttr = geometry.getAttribute('instanceColor') as InstancedBufferAttribute;
      colorAttr.updateRange.offset = this.dirtyStart * 4;
      colorAttr.updateRange.count = (this.dirtyEnd - this.dirtyStart) * 4;
      colorAttr.needsUpdate = true;
    }

    // Reset dirty range
    this.dirtyStart = 0;
    this.dirtyEnd = 0;
  }

  /**
   * Get the number of sprites in this batch.
   */
  get spriteCount(): number {
    return this.count;
  }

  /**
   * Check if batch is empty.
   */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Check if batch is at capacity.
   */
  get isFull(): boolean {
    return this.count >= this.capacity;
  }

  /**
   * Get current capacity.
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get memory usage in bytes.
   */
  getMemoryUsage(): number {
    const perBuffer = this.capacity * (16 + 4 + 4) * 4; // floats to bytes
    return perBuffer * 2; // double buffered
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as SpriteBatchMaterial).dispose();
    this.spriteIndices.clear();
  }
}

interface BatchBuffers {
  matrices: Float32Array;
  uvOffsets: Float32Array;
  colors: Float32Array;
}
```

---

### 4. Culling System

**packages/core/src/performance/CullingSystem.ts:**

```typescript
import { Box2, Vector2, Camera, OrthographicCamera } from 'three';
import type { Sprite2D } from '../sprites/Sprite2D';
import type { CullingConfig, CullingResult, SpatialCell } from './types';

/**
 * Culling system for efficiently determining sprite visibility.
 *
 * Features:
 * - Frustum culling against camera bounds
 * - Grid-based spatial partitioning
 * - Dirty rect tracking for partial updates
 */
export class CullingSystem {
  private config: CullingConfig;
  private cameraBounds: Box2 = new Box2();
  private expandedBounds: Box2 = new Box2();

  // Spatial partitioning
  private grid: Map<string, SpatialCell> = new Map();
  private spriteCells: WeakMap<Sprite2D, Set<string>> = new WeakMap();

  // Reusable objects
  private tempVec = new Vector2();
  private tempBounds = new Box2();

  constructor(config: Partial<CullingConfig> = {}) {
    this.config = {
      frustumCulling: config.frustumCulling ?? true,
      spatialPartitioning: config.spatialPartitioning ?? true,
      gridCellSize: config.gridCellSize ?? 256,
      frustumPadding: config.frustumPadding ?? 64,
      dirtyRectTracking: config.dirtyRectTracking ?? false,
    };
  }

  /**
   * Update camera bounds for culling.
   */
  updateCamera(camera: Camera): void {
    if (camera instanceof OrthographicCamera) {
      // Calculate orthographic camera bounds
      const halfWidth = (camera.right - camera.left) / 2;
      const halfHeight = (camera.top - camera.bottom) / 2;

      this.cameraBounds.min.set(
        camera.position.x - halfWidth,
        camera.position.y - halfHeight
      );
      this.cameraBounds.max.set(
        camera.position.x + halfWidth,
        camera.position.y + halfHeight
      );

      // Expanded bounds with padding
      this.expandedBounds.copy(this.cameraBounds);
      this.expandedBounds.min.x -= this.config.frustumPadding;
      this.expandedBounds.min.y -= this.config.frustumPadding;
      this.expandedBounds.max.x += this.config.frustumPadding;
      this.expandedBounds.max.y += this.config.frustumPadding;
    }
  }

  /**
   * Register a sprite with the spatial partitioning system.
   */
  registerSprite(sprite: Sprite2D): void {
    if (!this.config.spatialPartitioning) return;

    this.updateSpriteInGrid(sprite);
  }

  /**
   * Unregister a sprite from spatial partitioning.
   */
  unregisterSprite(sprite: Sprite2D): void {
    const cells = this.spriteCells.get(sprite);
    if (cells) {
      for (const cellKey of cells) {
        const cell = this.grid.get(cellKey);
        if (cell) {
          cell.sprites.delete(sprite);
          if (cell.sprites.size === 0) {
            this.grid.delete(cellKey);
          }
        }
      }
      this.spriteCells.delete(sprite);
    }
  }

  /**
   * Update sprite position in grid.
   */
  updateSpriteInGrid(sprite: Sprite2D): void {
    if (!this.config.spatialPartitioning) return;

    // Remove from current cells
    this.unregisterSprite(sprite);

    // Get sprite bounds
    const bounds = this.getSpriteBounds(sprite, this.tempBounds);

    // Find cells that overlap
    const cellSize = this.config.gridCellSize;
    const minCellX = Math.floor(bounds.min.x / cellSize);
    const maxCellX = Math.floor(bounds.max.x / cellSize);
    const minCellY = Math.floor(bounds.min.y / cellSize);
    const maxCellY = Math.floor(bounds.max.y / cellSize);

    const newCells = new Set<string>();

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cellKey = `${cx},${cy}`;
        newCells.add(cellKey);

        let cell = this.grid.get(cellKey);
        if (!cell) {
          cell = { x: cx, y: cy, sprites: new Set(), dirty: true };
          this.grid.set(cellKey, cell);
        }
        cell.sprites.add(sprite);
      }
    }

    this.spriteCells.set(sprite, newCells);
  }

  /**
   * Get sprite bounding box.
   */
  private getSpriteBounds(sprite: Sprite2D, target: Box2): Box2 {
    const worldPos = sprite.getWorldPosition2D();
    const halfWidth = sprite.width / 2;
    const halfHeight = sprite.height / 2;

    target.min.set(worldPos.x - halfWidth, worldPos.y - halfHeight);
    target.max.set(worldPos.x + halfWidth, worldPos.y + halfHeight);

    return target;
  }

  /**
   * Check if a sprite is visible.
   */
  isVisible(sprite: Sprite2D): CullingResult {
    // Skip if globally invisible
    if (!sprite.visible) {
      return { visible: false, reason: 'layer' };
    }

    // Skip if fully transparent
    if (sprite.alpha <= 0) {
      return { visible: false, reason: 'alpha' };
    }

    // Frustum culling
    if (this.config.frustumCulling) {
      const bounds = this.getSpriteBounds(sprite, this.tempBounds);

      if (!this.expandedBounds.intersectsBox(bounds)) {
        return { visible: false, reason: 'frustum' };
      }
    }

    return { visible: true };
  }

  /**
   * Get all potentially visible sprites using spatial partitioning.
   */
  getVisibleSprites(): Set<Sprite2D> {
    const visible = new Set<Sprite2D>();

    if (this.config.spatialPartitioning) {
      // Find cells that overlap camera bounds
      const cellSize = this.config.gridCellSize;
      const minCellX = Math.floor(this.expandedBounds.min.x / cellSize);
      const maxCellX = Math.floor(this.expandedBounds.max.x / cellSize);
      const minCellY = Math.floor(this.expandedBounds.min.y / cellSize);
      const maxCellY = Math.floor(this.expandedBounds.max.y / cellSize);

      for (let cx = minCellX; cx <= maxCellX; cx++) {
        for (let cy = minCellY; cy <= maxCellY; cy++) {
          const cell = this.grid.get(`${cx},${cy}`);
          if (cell) {
            for (const sprite of cell.sprites) {
              if (this.isVisible(sprite).visible) {
                visible.add(sprite);
              }
            }
          }
        }
      }
    }

    return visible;
  }

  /**
   * Cull a list of sprites, returning only visible ones.
   */
  cull(sprites: Iterable<Sprite2D>): Sprite2D[] {
    const visible: Sprite2D[] = [];

    for (const sprite of sprites) {
      if (this.isVisible(sprite).visible) {
        visible.push(sprite);
      }
    }

    return visible;
  }

  /**
   * Get culling statistics.
   */
  getStats(): {
    gridCells: number;
    totalSpritesInGrid: number;
    cameraBounds: Box2;
  } {
    let totalSprites = 0;
    for (const cell of this.grid.values()) {
      totalSprites += cell.sprites.size;
    }

    return {
      gridCells: this.grid.size,
      totalSpritesInGrid: totalSprites,
      cameraBounds: this.cameraBounds.clone(),
    };
  }

  /**
   * Clear spatial partitioning data.
   */
  clear(): void {
    this.grid.clear();
  }

  /**
   * Dispose of the culling system.
   */
  dispose(): void {
    this.clear();
  }
}
```

---

### 5. Performance Profiler

**packages/core/src/performance/Profiler.ts:**

```typescript
import type { PerformanceStats } from './types';

/**
 * Performance profiler for tracking render pipeline metrics.
 *
 * @example
 * ```typescript
 * const profiler = new Profiler();
 *
 * // In render loop
 * profiler.beginFrame();
 *
 * profiler.beginSection('culling');
 * // ... culling code
 * profiler.endSection('culling');
 *
 * profiler.beginSection('sorting');
 * // ... sorting code
 * profiler.endSection('sorting');
 *
 * profiler.endFrame();
 *
 * console.log(profiler.getStats());
 * ```
 */
export class Profiler {
  private frameStart: number = 0;
  private sectionStarts: Map<string, number> = new Map();
  private sectionTimes: Map<string, number> = new Map();

  // Rolling averages
  private frameHistory: number[] = [];
  private historySize: number = 60;

  // Stats
  private _stats: PerformanceStats = this.createEmptyStats();

  // Counters (set externally)
  private counters = {
    totalSprites: 0,
    visibleSprites: 0,
    renderedSprites: 0,
    culledFrustum: 0,
    culledOcclusion: 0,
    batchCount: 0,
    drawCalls: 0,
    poolMemory: 0,
    bufferMemory: 0,
    pooledObjects: 0,
    activeObjects: 0,
  };

  /**
   * Create empty stats object.
   */
  private createEmptyStats(): PerformanceStats {
    return {
      fps: 0,
      frameTime: 0,
      timing: {
        culling: 0,
        sorting: 0,
        upload: 0,
        render: 0,
        total: 0,
      },
      sprites: {
        total: 0,
        visible: 0,
        rendered: 0,
        culledFrustum: 0,
        culledOcclusion: 0,
      },
      memory: {
        poolMemory: 0,
        bufferMemory: 0,
        pooledObjects: 0,
        activeObjects: 0,
      },
      batches: {
        count: 0,
        drawCalls: 0,
        avgSpritesPerBatch: 0,
        efficiency: 0,
      },
    };
  }

  /**
   * Begin a frame.
   */
  beginFrame(): void {
    this.frameStart = performance.now();
    this.sectionTimes.clear();
  }

  /**
   * End a frame and update stats.
   */
  endFrame(): void {
    const frameTime = performance.now() - this.frameStart;

    // Update frame history
    this.frameHistory.push(frameTime);
    if (this.frameHistory.length > this.historySize) {
      this.frameHistory.shift();
    }

    // Calculate FPS from average frame time
    const avgFrameTime =
      this.frameHistory.reduce((a, b) => a + b, 0) / this.frameHistory.length;

    // Update stats
    this._stats.fps = 1000 / avgFrameTime;
    this._stats.frameTime = frameTime;

    this._stats.timing.culling = this.sectionTimes.get('culling') ?? 0;
    this._stats.timing.sorting = this.sectionTimes.get('sorting') ?? 0;
    this._stats.timing.upload = this.sectionTimes.get('upload') ?? 0;
    this._stats.timing.render = this.sectionTimes.get('render') ?? 0;
    this._stats.timing.total = frameTime;

    this._stats.sprites.total = this.counters.totalSprites;
    this._stats.sprites.visible = this.counters.visibleSprites;
    this._stats.sprites.rendered = this.counters.renderedSprites;
    this._stats.sprites.culledFrustum = this.counters.culledFrustum;
    this._stats.sprites.culledOcclusion = this.counters.culledOcclusion;

    this._stats.memory.poolMemory = this.counters.poolMemory;
    this._stats.memory.bufferMemory = this.counters.bufferMemory;
    this._stats.memory.pooledObjects = this.counters.pooledObjects;
    this._stats.memory.activeObjects = this.counters.activeObjects;

    this._stats.batches.count = this.counters.batchCount;
    this._stats.batches.drawCalls = this.counters.drawCalls;
    this._stats.batches.avgSpritesPerBatch =
      this.counters.batchCount > 0
        ? this.counters.renderedSprites / this.counters.batchCount
        : 0;
    this._stats.batches.efficiency =
      this.counters.totalSprites > 0
        ? this.counters.renderedSprites / this.counters.totalSprites
        : 0;
  }

  /**
   * Begin timing a section.
   */
  beginSection(name: string): void {
    this.sectionStarts.set(name, performance.now());
  }

  /**
   * End timing a section.
   */
  endSection(name: string): void {
    const start = this.sectionStarts.get(name);
    if (start !== undefined) {
      const time = performance.now() - start;
      this.sectionTimes.set(name, (this.sectionTimes.get(name) ?? 0) + time);
    }
  }

  /**
   * Set a counter value.
   */
  setCounter(
    name: keyof typeof this.counters,
    value: number
  ): void {
    this.counters[name] = value;
  }

  /**
   * Increment a counter.
   */
  incrementCounter(
    name: keyof typeof this.counters,
    amount: number = 1
  ): void {
    this.counters[name] += amount;
  }

  /**
   * Reset counters for new frame.
   */
  resetCounters(): void {
    this.counters.culledFrustum = 0;
    this.counters.culledOcclusion = 0;
    this.counters.drawCalls = 0;
  }

  /**
   * Get current stats.
   */
  getStats(): Readonly<PerformanceStats> {
    return this._stats;
  }

  /**
   * Get formatted stats string.
   */
  getStatsString(): string {
    const s = this._stats;
    return [
      `FPS: ${s.fps.toFixed(1)} (${s.frameTime.toFixed(2)}ms)`,
      `Sprites: ${s.sprites.rendered}/${s.sprites.total} (${s.sprites.culledFrustum} culled)`,
      `Batches: ${s.batches.count} (${s.batches.drawCalls} draws)`,
      `Timing: cull=${s.timing.culling.toFixed(2)}ms sort=${s.timing.sorting.toFixed(2)}ms upload=${s.timing.upload.toFixed(2)}ms render=${s.timing.render.toFixed(2)}ms`,
      `Memory: pool=${(s.memory.poolMemory / 1024).toFixed(1)}KB buffer=${(s.memory.bufferMemory / 1024).toFixed(1)}KB`,
    ].join('\n');
  }

  /**
   * Check if performance is below target.
   */
  isPerformanceWarning(targetFps: number = 60): boolean {
    return this._stats.fps < targetFps * 0.9;
  }

  /**
   * Get performance bottleneck.
   */
  getBottleneck(): string | null {
    const timing = this._stats.timing;
    const total = timing.total;

    if (total < 16.67) return null; // Under 60fps threshold

    const percentages = {
      culling: timing.culling / total,
      sorting: timing.sorting / total,
      upload: timing.upload / total,
      render: timing.render / total,
    };

    const max = Math.max(...Object.values(percentages));
    for (const [key, value] of Object.entries(percentages)) {
      if (value === max && value > 0.3) {
        return key;
      }
    }

    return 'other';
  }

  /**
   * Reset profiler.
   */
  reset(): void {
    this._stats = this.createEmptyStats();
    this.frameHistory = [];
    this.sectionTimes.clear();
    this.sectionStarts.clear();
  }
}
```

---

### 6. Exports

**packages/core/src/performance/index.ts:**

```typescript
export { MemoryPool, TypedArrayPool } from './MemoryPool';
export { OptimizedSpriteBatch } from './OptimizedSpriteBatch';
export { CullingSystem } from './CullingSystem';
export { Profiler } from './Profiler';
export type {
  PoolConfig,
  CullingConfig,
  PerformanceStats,
  CullingResult,
  SpatialCell,
} from './types';
```

**packages/core/src/index.ts (updated):**

```typescript
export const VERSION = '0.8.0';

// ... existing exports ...

// Performance
export * from './performance';
```

---

### 7. Tests

**packages/core/src/performance/MemoryPool.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryPool, TypedArrayPool } from './MemoryPool';

describe('MemoryPool', () => {
  it('should pre-populate with initial size', () => {
    const pool = new MemoryPool(() => ({ value: 0 }), { initialSize: 10 });
    const stats = pool.getStats();
    expect(stats.pooled).toBe(10);
    expect(stats.active).toBe(0);
  });

  it('should acquire and release objects', () => {
    const pool = new MemoryPool(() => ({ value: 0 }), { initialSize: 5 });

    const obj1 = pool.acquire();
    const obj2 = pool.acquire();

    expect(pool.getStats().active).toBe(2);
    expect(pool.getStats().pooled).toBe(3);

    pool.release(obj1);

    expect(pool.getStats().active).toBe(1);
    expect(pool.getStats().pooled).toBe(4);
  });

  it('should grow when exhausted', () => {
    const pool = new MemoryPool(() => ({ value: 0 }), {
      initialSize: 2,
      growthFactor: 2,
    });

    pool.acquire();
    pool.acquire();
    pool.acquire(); // Should trigger growth

    expect(pool.getStats().total).toBeGreaterThan(2);
  });

  it('should reset objects on release', () => {
    const pool = new MemoryPool(
      () => ({ value: 0 }),
      { initialSize: 1 },
      (obj) => { obj.value = 0; }
    );

    const obj = pool.acquire();
    obj.value = 42;
    pool.release(obj);

    const reacquired = pool.acquire();
    expect(reacquired.value).toBe(0);
  });
});

describe('TypedArrayPool', () => {
  it('should pool Float32Arrays by length', () => {
    const pool = new TypedArrayPool();

    const arr1 = pool.acquireFloat32(100);
    pool.releaseFloat32(arr1);
    const arr2 = pool.acquireFloat32(100);

    expect(arr2).toBe(arr1);
  });

  it('should create new arrays for different lengths', () => {
    const pool = new TypedArrayPool();

    const arr1 = pool.acquireFloat32(100);
    pool.releaseFloat32(arr1);
    const arr2 = pool.acquireFloat32(200);

    expect(arr2).not.toBe(arr1);
    expect(arr2.length).toBe(200);
  });

  it('should track memory usage', () => {
    const pool = new TypedArrayPool();

    const arr = pool.acquireFloat32(100);
    pool.releaseFloat32(arr);

    expect(pool.getMemoryUsage()).toBe(100 * 4); // 100 floats * 4 bytes
  });
});
```

**packages/core/src/performance/CullingSystem.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { OrthographicCamera, Texture } from 'three';
import { CullingSystem } from './CullingSystem';
import { Sprite2D } from '../sprites/Sprite2D';

describe('CullingSystem', () => {
  let culling: CullingSystem;
  let camera: OrthographicCamera;
  let texture: Texture;

  beforeEach(() => {
    culling = new CullingSystem({
      frustumCulling: true,
      spatialPartitioning: true,
      gridCellSize: 100,
    });
    camera = new OrthographicCamera(0, 800, 600, 0, -1000, 1000);
    camera.position.set(400, 300, 100);
    texture = new Texture();
    texture.image = { width: 32, height: 32 };
    culling.updateCamera(camera);
  });

  it('should cull sprites outside camera bounds', () => {
    const spriteInView = new Sprite2D({ texture });
    spriteInView.position.set(400, 300, 0);

    const spriteOutOfView = new Sprite2D({ texture });
    spriteOutOfView.position.set(-1000, -1000, 0);

    expect(culling.isVisible(spriteInView).visible).toBe(true);
    expect(culling.isVisible(spriteOutOfView).visible).toBe(false);
    expect(culling.isVisible(spriteOutOfView).reason).toBe('frustum');
  });

  it('should cull invisible sprites', () => {
    const sprite = new Sprite2D({ texture });
    sprite.position.set(400, 300, 0);
    sprite.visible = false;

    expect(culling.isVisible(sprite).visible).toBe(false);
    expect(culling.isVisible(sprite).reason).toBe('layer');
  });

  it('should cull fully transparent sprites', () => {
    const sprite = new Sprite2D({ texture, alpha: 0 });
    sprite.position.set(400, 300, 0);

    expect(culling.isVisible(sprite).visible).toBe(false);
    expect(culling.isVisible(sprite).reason).toBe('alpha');
  });

  it('should register sprites in spatial grid', () => {
    const sprite = new Sprite2D({ texture });
    sprite.position.set(150, 150, 0);

    culling.registerSprite(sprite);

    const stats = culling.getStats();
    expect(stats.totalSpritesInGrid).toBe(1);
  });

  it('should cull array of sprites', () => {
    const sprites = [
      new Sprite2D({ texture }),
      new Sprite2D({ texture }),
      new Sprite2D({ texture }),
    ];

    sprites[0]!.position.set(400, 300, 0); // In view
    sprites[1]!.position.set(-1000, 0, 0); // Out of view
    sprites[2]!.position.set(100, 100, 0); // In view

    const visible = culling.cull(sprites);

    expect(visible.length).toBe(2);
  });
});
```

---

## Acceptance Criteria

- [ ] `OptimizedSpriteBatch` uses double buffering for async uploads
- [ ] Partial buffer updates work correctly (dirty region tracking)
- [ ] `MemoryPool` reduces GC pressure measurably
- [ ] `TypedArrayPool` reuses allocated arrays
- [ ] `CullingSystem` correctly culls off-screen sprites
- [ ] Spatial partitioning improves culling performance
- [ ] `Profiler` provides accurate timing data
- [ ] Target: 100,000 sprites at 60fps achieved
- [ ] All tests pass
- [ ] Memory usage is stable (no leaks)

---

## Performance Benchmarks

| Scenario | Target | Measurement |
|----------|--------|-------------|
| 100,000 sprites, 1 texture | <16ms frame time | DevTools |
| 100,000 sprites, 10 textures | <20ms frame time | DevTools |
| Culling 100,000 sprites | <1ms | Profiler |
| Sorting 100,000 sprites | <2ms | Profiler |
| Buffer upload 100,000 sprites | <3ms | Profiler |
| Memory usage (100k sprites) | <100MB | DevTools |

---

## Example Usage

```typescript
import {
  Renderer2D,
  Profiler,
  CullingSystem,
  MemoryPool,
  Sprite2D,
} from '@three-flatland/core';

// Create profiler
const profiler = new Profiler();

// Create culling system
const culling = new CullingSystem({
  frustumCulling: true,
  spatialPartitioning: true,
  gridCellSize: 256,
});

// Create renderer with profiler
const renderer2D = new Renderer2D({
  maxSpritesPerBatch: 20000,
});

// Render loop
function animate() {
  profiler.beginFrame();

  // Update camera bounds
  culling.updateCamera(camera);

  // Cull sprites
  profiler.beginSection('culling');
  const visibleSprites = culling.cull(allSprites);
  profiler.endSection('culling');

  // Update profiler counters
  profiler.setCounter('totalSprites', allSprites.length);
  profiler.setCounter('visibleSprites', visibleSprites.length);

  // Render
  renderer2D.render(renderer, camera);

  profiler.endFrame();

  // Check performance
  if (profiler.isPerformanceWarning()) {
    console.warn('Performance bottleneck:', profiler.getBottleneck());
  }

  requestAnimationFrame(animate);
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Browser differences in buffer uploads | Medium | Medium | Test across browsers |
| Memory pressure from pooling | Low | Medium | Monitor pool sizes |
| Spatial grid overhead | Low | Low | Tune cell size |
| WebGPU timing differences | Medium | Medium | Test both backends |

---

## Dependencies for Next Milestone

M9 (R3F Integration) requires:
- Performance-optimized batching system
- Profiler for debugging

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 2 |
| MemoryPool + TypedArrayPool | 4 |
| OptimizedSpriteBatch | 8 |
| CullingSystem | 6 |
| Profiler | 4 |
| Integration with Renderer2D | 4 |
| Benchmarking & optimization | 8 |
| Tests | 4 |
| Documentation | 2 |
| **Total** | **42 hours** (~2 weeks) |

---

*End of M8: Batching Performance*
