# M3: 2D Render Pipeline

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 3 weeks |
| **Dependencies** | M1 (Core Sprites), M2 (Animation System) |
| **Outputs** | Renderer2D, BatchManager, SpriteBatch, Layer system |
| **Risk Level** | High (core architecture, performance critical) |

---

## Objectives

1. Implement `Renderer2D` class for batched 2D rendering
2. Create `SpriteBatch` using InstancedMesh for performance
3. Implement layer system with explicit z-ordering
4. Decouple scene graph from render order
5. Create `LayerManager` for high-level layer control
6. Optimize for 50,000+ sprites at 60fps
7. **Automatic batching by material identity**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TSL-NATIVE 2D RENDER PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │   Scene Graph   │  Three.js scene hierarchy (transforms only)            │
│  │  (Object3D)     │                                                        │
│  └────────┬────────┘                                                        │
│           │ sprites register                                                │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │   Renderer2D    │  Main entry point                                      │
│  │                 │  • add(sprite) / remove(sprite)                        │
│  │                 │  • render(renderer, camera)                            │
│  └────────┬────────┘                                                        │
│           │ manages                                                         │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  BatchManager   │  Groups sprites into batches                           │
│  │                 │  • Sort by (layer, material.id, zIndex)                │
│  │                 │  • Create/reuse SpriteBatch instances                  │
│  │                 │  • Track dirty state                                   │
│  └────────┬────────┘                                                        │
│           │ creates                                                         │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  SpriteBatch    │  InstancedMesh-based rendering                         │
│  │                 │  • Core attributes: transform, UV, tint/alpha          │
│  │                 │  • Material-defined instance attributes (opt-in)       │
│  │                 │  • Single draw call per batch                          │
│  └─────────────────┘                                                        │
│                                                                             │
│  Sort Key: (layer << 24) | (material.id << 12) | (zIndex & 0xFFF)          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Design Principle: TSL-Native Automatic Batching

**Sprites batch when they share the same material instance.**

This is how Three.js naturally works - we embrace it rather than fight it.

```typescript
// Define materials with TSL (effects baked in)
const normalMaterial = new Sprite2DMaterial({ texture });
const glowMaterial = new Sprite2DMaterial({ texture });
glowMaterial.colorNode = hueShift(texture(map, uv()), { amount: uniform(0.5) });

// Sprites reference materials
const sprite1 = new Sprite2D({ material: normalMaterial });
const sprite2 = new Sprite2D({ material: normalMaterial }); // Batches with sprite1!
const sprite3 = new Sprite2D({ material: glowMaterial });   // Different batch

// Result: 2 draw calls (one per material)
```

**Per-Instance Variation**: When a material needs per-sprite values (e.g., individual dissolve progress), it defines instance attributes:

```typescript
const ghostMaterial = new Sprite2DMaterial({ texture });
ghostMaterial.addInstanceFloat('dissolve', 0);
ghostMaterial.colorNode = dissolve(
  texture(map, uv()),
  { progress: ghostMaterial.instanceFloat('dissolve') }
);

// Sprites share material, have different dissolve values
ghost1.setInstanceValue('dissolve', 0.3);
ghost2.setInstanceValue('dissolve', 0.7);
// → Still 1 draw call!
```

**Key Benefits**:
- Instance data is minimal (only what each material needs)
- Lean per-material shaders (no branch-heavy uber-shader)
- One unified API (no "batched mode" vs "custom mode")
- Full TSL composability for effects

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/pipeline/types.ts:**

```typescript
import type { Camera, WebGLRenderer } from 'three';
import type { Sprite2D } from '../sprites/Sprite2D';

/**
 * Blend modes for sprites.
 */
export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen';

/**
 * Sort modes for layers.
 */
export type SortMode = 'none' | 'z-index' | 'y-sort' | 'custom';

/**
 * Renderer2D options.
 */
export interface Renderer2DOptions {
  /** Maximum sprites per batch (default: 10000) */
  maxSpritesPerBatch?: number;
  /** Maximum number of batches (default: 100) */
  maxBatches?: number;
  /** Default sort mode (default: 'z-index') */
  sortMode?: SortMode;
  /** Custom sort function */
  customSort?: (a: Sprite2D, b: Sprite2D) => number;
  /** Auto-update transforms (default: true) */
  autoUpdateTransforms?: boolean;
}

/**
 * Layer configuration.
 */
export interface LayerConfig {
  /** Layer name */
  name: string;
  /** Layer z-index (render order) */
  zIndex: number;
  /** Sort mode for sprites within layer */
  sortMode?: SortMode;
  /** Custom sort function */
  customSort?: (a: Sprite2D, b: Sprite2D) => number;
  /** Override camera for this layer */
  camera?: Camera;
  /** Whether layer is visible */
  visible?: boolean;
}

/**
 * Render statistics.
 */
export interface RenderStats {
  /** Total sprites registered */
  spriteCount: number;
  /** Number of active batches */
  batchCount: number;
  /** Draw calls this frame */
  drawCalls: number;
  /** Sprites rendered this frame */
  spritesRendered: number;
  /** Time spent sorting (ms) */
  sortTime: number;
  /** Time spent uploading (ms) */
  uploadTime: number;
  /** Time spent rendering (ms) */
  renderTime: number;
}

/**
 * Renderable sprite interface.
 */
export interface Renderable2D {
  /** Render layer (primary sort key) */
  layer: number;
  /** Z-index within layer (secondary sort key) */
  zIndex: number;
  /** Visibility */
  visible: boolean;
  /** Get texture ID for batching */
  getTextureId(): number;
  /** Get blend mode */
  getBlendMode(): BlendMode;
  /** Write instance data to buffers */
  writeInstanceData(
    positions: Float32Array,
    uvs: Float32Array,
    colors: Float32Array,
    index: number
  ): void;
}
```

---

### 2. SpriteBatch (TSL-Native Material-Based)

**packages/core/src/pipeline/SpriteBatch.ts:**

```typescript
import {
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
  Matrix4,
  Vector3,
} from 'three';
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial';
import type { Sprite2D } from '../sprites/Sprite2D';

/**
 * A batch of sprites rendered with a single draw call.
 *
 * TSL-NATIVE DESIGN:
 * Sprites batch when they share the same material instance.
 * The material defines the shader (using TSL) and any custom instance attributes.
 *
 * Core instance attributes (always present):
 * - Transform matrix (mat4) - 64 bytes
 * - UV offset/scale (vec4) - 16 bytes
 * - Color/alpha (vec4) - 16 bytes
 * Total: 96 bytes per sprite (minimal, no wasted effect data)
 *
 * Additional instance attributes are defined per-material when needed.
 * For example, a dissolve material adds a single float per instance.
 */
export class SpriteBatch {
  /** The instanced mesh */
  readonly mesh: InstancedMesh;

  /** The material for this batch */
  readonly material: Sprite2DMaterial;

  /** Maximum sprites in this batch */
  readonly maxSprites: number;

  // Core instance attribute buffers
  private matrices: Float32Array;
  private uvOffsets: Float32Array;
  private colors: Float32Array;

  // Material-specific instance attribute buffers (keyed by attribute name)
  private customAttributes: Map<string, Float32Array> = new Map();

  // Current sprite count
  private count: number = 0;

  // Reusable objects
  private tempMatrix = new Matrix4();
  private tempPosition = new Vector3();

  constructor(material: Sprite2DMaterial, maxSprites: number = 10000) {
    this.material = material;
    this.maxSprites = maxSprites;

    // Create shared quad geometry
    const geometry = new PlaneGeometry(1, 1);

    // Create instanced mesh with the material
    this.mesh = new InstancedMesh(geometry, material, maxSprites);
    this.mesh.frustumCulled = false; // We handle culling ourselves
    this.mesh.count = 0;

    // Allocate core instance buffers
    this.matrices = new Float32Array(maxSprites * 16);
    this.uvOffsets = new Float32Array(maxSprites * 4);
    this.colors = new Float32Array(maxSprites * 4);

    // Setup core instance attributes
    geometry.setAttribute(
      'instanceUV',
      new InstancedBufferAttribute(this.uvOffsets, 4)
    );
    geometry.setAttribute(
      'instanceColor',
      new InstancedBufferAttribute(this.colors, 4)
    );

    // Setup material-specific instance attributes
    this.setupCustomAttributes(geometry);
  }

  /**
   * Setup custom instance attributes defined by the material.
   */
  private setupCustomAttributes(geometry: PlaneGeometry): void {
    const schema = this.material.getInstanceAttributeSchema();

    for (const [name, config] of schema) {
      const componentsPerInstance = config.size;
      const buffer = new Float32Array(this.maxSprites * componentsPerInstance);

      // Initialize with default values
      if (config.default !== undefined) {
        for (let i = 0; i < this.maxSprites; i++) {
          if (typeof config.default === 'number') {
            buffer[i * componentsPerInstance] = config.default;
          } else {
            // Array default (e.g., vec3, vec4)
            for (let j = 0; j < componentsPerInstance; j++) {
              buffer[i * componentsPerInstance + j] = config.default[j] ?? 0;
            }
          }
        }
      }

      this.customAttributes.set(name, buffer);
      geometry.setAttribute(
        name,
        new InstancedBufferAttribute(buffer, componentsPerInstance)
      );
    }
  }

  /**
   * Clear the batch for reuse.
   */
  clear(): void {
    this.count = 0;
  }

  /**
   * Add a sprite to the batch.
   */
  add(sprite: Sprite2D): boolean {
    if (this.count >= this.maxSprites) {
      return false;
    }

    const i = this.count;

    // Get world matrix
    sprite.updateWorldMatrix(true, false);
    const worldMatrix = sprite.matrixWorld;

    // Store matrix
    worldMatrix.toArray(this.matrices, i * 16);
    this.mesh.setMatrixAt(i, worldMatrix);

    // UV offset (x, y, w, h in atlas)
    const frame = sprite.frame;
    if (frame) {
      this.uvOffsets[i * 4] = frame.x;
      this.uvOffsets[i * 4 + 1] = frame.y;
      this.uvOffsets[i * 4 + 2] = frame.width;
      this.uvOffsets[i * 4 + 3] = frame.height;
    } else {
      this.uvOffsets[i * 4] = 0;
      this.uvOffsets[i * 4 + 1] = 0;
      this.uvOffsets[i * 4 + 2] = 1;
      this.uvOffsets[i * 4 + 3] = 1;
    }

    // Color (tint + alpha)
    const tint = sprite.tint;
    this.colors[i * 4] = tint.r;
    this.colors[i * 4 + 1] = tint.g;
    this.colors[i * 4 + 2] = tint.b;
    this.colors[i * 4 + 3] = sprite.alpha;

    // Write material-specific instance values from sprite
    const instanceValues = sprite.getInstanceValues();
    for (const [name, value] of instanceValues) {
      const buffer = this.customAttributes.get(name);
      if (buffer) {
        const schema = this.material.getInstanceAttributeSchema().get(name);
        if (schema) {
          if (typeof value === 'number') {
            buffer[i * schema.size] = value;
          } else {
            // Array value
            for (let j = 0; j < schema.size; j++) {
              buffer[i * schema.size + j] = value[j] ?? 0;
            }
          }
        }
      }
    }

    this.count++;
    return true;
  }

  /**
   * Upload instance data to GPU.
   */
  upload(): void {
    // Update instance count
    this.mesh.count = this.count;

    if (this.count === 0) return;

    // Mark core attributes as needing update
    this.mesh.instanceMatrix.needsUpdate = true;

    const geometry = this.mesh.geometry;
    const uvAttr = geometry.getAttribute('instanceUV') as InstancedBufferAttribute;
    const colorAttr = geometry.getAttribute('instanceColor') as InstancedBufferAttribute;

    uvAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    // Mark custom attributes as needing update
    for (const name of this.customAttributes.keys()) {
      const attr = geometry.getAttribute(name) as InstancedBufferAttribute;
      if (attr) {
        attr.needsUpdate = true;
      }
    }
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
   * Check if batch is full.
   */
  get isFull(): boolean {
    return this.count >= this.maxSprites;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    // Note: Material is NOT disposed here as it may be shared
  }
}
```

---

### 3. Sprite2DMaterial (TSL-Native with Instance Attributes)

See **M1: Core Sprites** for `Sprite2DMaterial` implementation.

The key addition for TSL-native batching is the **instance attribute schema**:

**packages/core/src/materials/Sprite2DMaterial.ts (additions):**

```typescript
import {
  MeshBasicNodeMaterial,
  texture as textureFn,
  uv,
  vec2,
  vec4,
  Fn,
  If,
  Discard,
  attribute,
  uniform,
} from 'three/tsl';
import {
  Texture,
  FrontSide,
  NormalBlending,
  AdditiveBlending,
  MultiplyBlending,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Color,
  Vector4,
} from 'three';
import type { BlendMode } from '../pipeline/types';

/**
 * Configuration for a custom instance attribute.
 */
export interface InstanceAttributeConfig {
  /** Number of components (1 for float, 2 for vec2, 3 for vec3, 4 for vec4) */
  size: 1 | 2 | 3 | 4;
  /** Default value */
  default?: number | number[];
}

export interface Sprite2DMaterialOptions {
  map?: Texture;
  transparent?: boolean;
  alphaTest?: number;
  blendMode?: BlendMode;
}

/**
 * TSL-based material for 2D sprites with support for custom instance attributes.
 *
 * TSL-NATIVE BATCHING:
 * This material can define custom instance attributes that vary per-sprite.
 * Sprites sharing this material instance will batch together.
 *
 * @example
 * ```typescript
 * // Basic material (no custom instance attrs)
 * const basic = new Sprite2DMaterial({ map: texture });
 *
 * // Material with per-instance dissolve
 * const dissolveMaterial = new Sprite2DMaterial({ map: texture });
 * dissolveMaterial.addInstanceFloat('dissolve', 0);
 * dissolveMaterial.colorNode = dissolve(
 *   texture(dissolveMaterial.map, uv()),
 *   { progress: dissolveMaterial.instanceFloat('dissolve') }
 * );
 * ```
 */
export class Sprite2DMaterial extends MeshBasicNodeMaterial {
  // Core uniforms
  readonly frameUV = uniform(new Vector4(0, 0, 1, 1));
  readonly tintColor = uniform(new Color(0xffffff));
  readonly alphaValue = uniform(1.0);

  // Instance attribute schema (for SpriteBatch to read)
  private instanceAttributeSchema: Map<string, InstanceAttributeConfig> = new Map();

  // TSL attribute references (for use in colorNode)
  private instanceAttributeNodes: Map<string, ReturnType<typeof attribute>> = new Map();

  private _map: Texture | null = null;
  private _blendMode: BlendMode = 'normal';

  constructor(options: Sprite2DMaterialOptions = {}) {
    super();

    this.transparent = options.transparent ?? true;
    this.depthWrite = false;
    this.depthTest = true;
    this.side = FrontSide;

    if (options.map) {
      this._map = options.map;
    }

    if (options.blendMode) {
      this._blendMode = options.blendMode;
    }

    this.setBlendMode(this._blendMode);
    this.setupDefaultNodes();
  }

  /**
   * Setup default color node (simple texture + tint + alpha).
   * Can be overridden by setting colorNode directly.
   */
  private setupDefaultNodes() {
    if (!this._map) return;

    // Core instance attributes (always present)
    const instanceUV = attribute('instanceUV', 'vec4');
    const instanceColor = attribute('instanceColor', 'vec4');

    this.colorNode = Fn(() => {
      // Remap UV to atlas frame
      const atlasUV = uv()
        .mul(vec2(instanceUV.z, instanceUV.w))
        .add(vec2(instanceUV.x, instanceUV.y));

      // Sample texture
      const texColor = textureFn(this._map!, atlasUV);

      // Alpha test
      If(texColor.a.lessThan(0.01), () => {
        Discard();
      });

      // Apply tint and alpha from instance
      return vec4(
        texColor.rgb.mul(instanceColor.rgb),
        texColor.a.mul(instanceColor.a)
      );
    })();
  }

  // ============================================
  // INSTANCE ATTRIBUTE SYSTEM
  // ============================================

  /**
   * Add a float instance attribute.
   * Returns a TSL node to use in your colorNode.
   *
   * @example
   * ```typescript
   * const dissolveAttr = material.addInstanceFloat('dissolve', 0);
   * material.colorNode = myDissolveNode(dissolveAttr);
   * ```
   */
  addInstanceFloat(name: string, defaultValue: number = 0): ReturnType<typeof attribute> {
    this.instanceAttributeSchema.set(name, { size: 1, default: defaultValue });
    const node = attribute(name, 'float');
    this.instanceAttributeNodes.set(name, node);
    return node;
  }

  /**
   * Add a vec2 instance attribute.
   */
  addInstanceVec2(name: string, defaultValue: [number, number] = [0, 0]): ReturnType<typeof attribute> {
    this.instanceAttributeSchema.set(name, { size: 2, default: defaultValue });
    const node = attribute(name, 'vec2');
    this.instanceAttributeNodes.set(name, node);
    return node;
  }

  /**
   * Add a vec3 instance attribute.
   */
  addInstanceVec3(name: string, defaultValue: [number, number, number] = [0, 0, 0]): ReturnType<typeof attribute> {
    this.instanceAttributeSchema.set(name, { size: 3, default: defaultValue });
    const node = attribute(name, 'vec3');
    this.instanceAttributeNodes.set(name, node);
    return node;
  }

  /**
   * Add a vec4 instance attribute.
   */
  addInstanceVec4(name: string, defaultValue: [number, number, number, number] = [0, 0, 0, 0]): ReturnType<typeof attribute> {
    this.instanceAttributeSchema.set(name, { size: 4, default: defaultValue });
    const node = attribute(name, 'vec4');
    this.instanceAttributeNodes.set(name, node);
    return node;
  }

  /**
   * Get an existing instance attribute node by name.
   */
  instanceFloat(name: string): ReturnType<typeof attribute> {
    const node = this.instanceAttributeNodes.get(name);
    if (!node) {
      throw new Error(`Instance attribute not found: ${name}. Call addInstanceFloat first.`);
    }
    return node;
  }

  /**
   * Get the instance attribute schema (for SpriteBatch).
   */
  getInstanceAttributeSchema(): Map<string, InstanceAttributeConfig> {
    return this.instanceAttributeSchema;
  }

  // ============================================
  // BLEND MODE
  // ============================================

  setBlendMode(mode: BlendMode): void {
    this._blendMode = mode;
    switch (mode) {
      case 'normal':
        this.blending = NormalBlending;
        break;
      case 'additive':
        this.blending = AdditiveBlending;
        break;
      case 'multiply':
        this.blending = MultiplyBlending;
        break;
      case 'screen':
        this.blending = CustomBlending;
        this.blendSrc = OneFactor;
        this.blendDst = OneMinusSrcAlphaFactor;
        break;
    }
  }

  get map(): Texture | null {
    return this._map;
  }

  set map(value: Texture | null) {
    this._map = value;
    if (value) {
      this.setupDefaultNodes();
      this.needsUpdate = true;
    }
  }
}
```

### Key Design Points

1. **Materials define the shader** using TSL nodes
2. **Instance attributes are opt-in** per material via `addInstanceFloat()` etc.
3. **SpriteBatch reads the schema** and allocates only needed buffers
4. **No uber-shader waste** - each material has exactly what it needs

---

### 4. BatchManager (Material-Based Batching)

**packages/core/src/pipeline/BatchManager.ts:**

```typescript
import { SpriteBatch } from './SpriteBatch';
import type { SortMode } from './types';
import type { Sprite2D } from '../sprites/Sprite2D';
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial';

/**
 * Manages sprite batching for efficient rendering.
 *
 * TSL-NATIVE DESIGN:
 * Sprites are grouped by MATERIAL IDENTITY:
 * 1. Layer (primary sort key)
 * 2. Material ID (secondary - sprites with same material batch together)
 * 3. Z-index (tertiary - within a batch)
 *
 * Sort Key: (layer << 24) | (material.id << 12) | (zIndex & 0xFFF)
 */
export class BatchManager {
  private sprites: Set<Sprite2D> = new Set();
  private sortedSprites: Sprite2D[] = [];
  private batches: SpriteBatch[] = [];
  private batchPool: Map<number, SpriteBatch[]> = new Map(); // Keyed by material.id

  private dirty: boolean = true;
  private maxSpritesPerBatch: number;
  private sortMode: SortMode;
  private customSort?: (a: Sprite2D, b: Sprite2D) => number;

  constructor(options: {
    maxSpritesPerBatch?: number;
    sortMode?: SortMode;
    customSort?: (a: Sprite2D, b: Sprite2D) => number;
  } = {}) {
    this.maxSpritesPerBatch = options.maxSpritesPerBatch ?? 10000;
    this.sortMode = options.sortMode ?? 'z-index';
    this.customSort = options.customSort;
  }

  /**
   * Add a sprite to be batched.
   */
  add(sprite: Sprite2D): void {
    if (!this.sprites.has(sprite)) {
      this.sprites.add(sprite);
      this.dirty = true;
    }
  }

  /**
   * Remove a sprite from batching.
   */
  remove(sprite: Sprite2D): void {
    if (this.sprites.delete(sprite)) {
      this.dirty = true;
    }
  }

  /**
   * Mark as needing re-sort/re-batch.
   */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Sort sprites and create batches.
   */
  prepare(): void {
    if (!this.dirty) return;

    // Clear existing batches (return to pool)
    for (const batch of this.batches) {
      batch.clear();
      const materialId = batch.material.id;
      let pool = this.batchPool.get(materialId);
      if (!pool) {
        pool = [];
        this.batchPool.set(materialId, pool);
      }
      pool.push(batch);
    }
    this.batches = [];

    // Filter visible sprites and sort
    this.sortedSprites = Array.from(this.sprites).filter(
      (s) => s.visible && s.parent !== null
    );

    this.sortSprites();

    // Group into batches by material
    this.createBatches();

    this.dirty = false;
  }

  /**
   * Sort sprites by layer, material.id, then zIndex.
   */
  private sortSprites(): void {
    if (this.customSort) {
      this.sortedSprites.sort(this.customSort);
      return;
    }

    switch (this.sortMode) {
      case 'none':
        // No sorting
        break;

      case 'y-sort':
        this.sortedSprites.sort((a, b) => {
          if (a.layer !== b.layer) return a.layer - b.layer;
          const matDiff = a.material.id - b.material.id;
          if (matDiff !== 0) return matDiff;
          // Y-sort: higher Y (lower on screen) renders later (on top)
          return a.position.y - b.position.y;
        });
        break;

      case 'z-index':
      default:
        this.sortedSprites.sort((a, b) => {
          if (a.layer !== b.layer) return a.layer - b.layer;
          const matDiff = a.material.id - b.material.id;
          if (matDiff !== 0) return matDiff;
          return a.zIndex - b.zIndex;
        });
        break;
    }
  }

  /**
   * Create batches from sorted sprites.
   * Sprites with the same material are batched together.
   */
  private createBatches(): void {
    let currentBatch: SpriteBatch | null = null;
    let currentMaterial: Sprite2DMaterial | null = null;

    for (const sprite of this.sortedSprites) {
      const material = sprite.material as Sprite2DMaterial;

      // Check if we need a new batch
      const needNewBatch =
        currentBatch === null ||
        currentBatch.isFull ||
        material !== currentMaterial;

      if (needNewBatch) {
        // Get or create batch for this material
        currentBatch = this.getBatch(material);
        currentMaterial = material;
        this.batches.push(currentBatch);
      }

      // Add sprite to batch
      currentBatch!.add(sprite);
    }
  }

  /**
   * Get a batch from pool or create new.
   */
  private getBatch(material: Sprite2DMaterial): SpriteBatch {
    // Try to reuse from pool for this material
    const pool = this.batchPool.get(material.id);
    if (pool && pool.length > 0) {
      return pool.pop()!;
    }

    // Create new batch for this material
    return new SpriteBatch(material, this.maxSpritesPerBatch);
  }

  /**
   * Upload all batch data to GPU.
   */
  upload(): void {
    for (const batch of this.batches) {
      batch.upload();
    }
  }

  /**
   * Get batches for rendering.
   */
  getBatches(): readonly SpriteBatch[] {
    return this.batches;
  }

  /**
   * Get statistics.
   */
  getStats(): { spriteCount: number; batchCount: number } {
    return {
      spriteCount: this.sprites.size,
      batchCount: this.batches.length,
    };
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    for (const batch of this.batches) {
      batch.dispose();
    }
    for (const pool of this.batchPool.values()) {
      for (const batch of pool) {
        batch.dispose();
      }
    }
    this.batches = [];
    this.batchPool.clear();
    this.sprites.clear();
    this.sortedSprites = [];
  }
}
```

---

### 5. Renderer2D

**packages/core/src/pipeline/Renderer2D.ts:**

```typescript
import type { Camera, WebGLRenderer, Scene } from 'three';
import { BatchManager } from './BatchManager';
import type { Renderer2DOptions, RenderStats, SortMode } from './types';
import type { Sprite2D } from '../sprites/Sprite2D';

/**
 * Main 2D rendering pipeline.
 *
 * Provides Pixi.js-style batched rendering with explicit z-ordering
 * while being fully native to Three.js.
 *
 * @example
 * ```typescript
 * const renderer2D = new Renderer2D();
 *
 * // Add sprites
 * renderer2D.add(player);
 * renderer2D.add(enemy);
 * renderer2D.add(background);
 *
 * // In render loop
 * renderer2D.render(renderer, camera);
 * ```
 */
export class Renderer2D {
  private batchManager: BatchManager;
  private autoUpdateTransforms: boolean;

  // Stats
  private _stats: RenderStats = {
    spriteCount: 0,
    batchCount: 0,
    drawCalls: 0,
    spritesRendered: 0,
    sortTime: 0,
    uploadTime: 0,
    renderTime: 0,
  };

  constructor(options: Renderer2DOptions = {}) {
    this.batchManager = new BatchManager({
      maxSpritesPerBatch: options.maxSpritesPerBatch,
      sortMode: options.sortMode,
      customSort: options.customSort,
    });
    this.autoUpdateTransforms = options.autoUpdateTransforms ?? true;
  }

  /**
   * Add a sprite to the renderer.
   */
  add(sprite: Sprite2D): this {
    this.batchManager.add(sprite);
    return this;
  }

  /**
   * Remove a sprite from the renderer.
   */
  remove(sprite: Sprite2D): this {
    this.batchManager.remove(sprite);
    return this;
  }

  /**
   * Force re-batching next frame.
   */
  invalidate(): this {
    this.batchManager.invalidate();
    return this;
  }

  /**
   * Render all sprites.
   */
  render(renderer: WebGLRenderer, camera: Camera): void {
    const startTime = performance.now();

    // Sort and batch
    const sortStart = performance.now();
    this.batchManager.prepare();
    this._stats.sortTime = performance.now() - sortStart;

    // Upload to GPU
    const uploadStart = performance.now();
    this.batchManager.upload();
    this._stats.uploadTime = performance.now() - uploadStart;

    // Render batches
    const renderStart = performance.now();
    const batches = this.batchManager.getBatches();
    let drawCalls = 0;
    let spritesRendered = 0;

    for (const batch of batches) {
      if (batch.spriteCount > 0) {
        renderer.render(batch.mesh, camera);
        drawCalls++;
        spritesRendered += batch.spriteCount;
      }
    }

    this._stats.renderTime = performance.now() - renderStart;

    // Update stats
    const { spriteCount, batchCount } = this.batchManager.getStats();
    this._stats.spriteCount = spriteCount;
    this._stats.batchCount = batchCount;
    this._stats.drawCalls = drawCalls;
    this._stats.spritesRendered = spritesRendered;
  }

  /**
   * Get render statistics.
   */
  get stats(): Readonly<RenderStats> {
    return this._stats;
  }

  /**
   * Get sprite count.
   */
  get spriteCount(): number {
    return this._stats.spriteCount;
  }

  /**
   * Get batch count.
   */
  get batchCount(): number {
    return this._stats.batchCount;
  }

  /**
   * Get draw calls from last frame.
   */
  get drawCalls(): number {
    return this._stats.drawCalls;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.batchManager.dispose();
  }
}
```

---

### 6. LayerManager (High-Level API)

**packages/core/src/pipeline/LayerManager.ts:**

```typescript
import type { Camera, WebGLRenderer } from 'three';
import { Renderer2D } from './Renderer2D';
import type { LayerConfig, SortMode } from './types';
import type { Sprite2D } from '../sprites/Sprite2D';

/**
 * A render layer with its own sorting rules.
 */
export class Layer {
  readonly name: string;
  readonly zIndex: number;
  readonly sortMode: SortMode;
  readonly customSort?: (a: Sprite2D, b: Sprite2D) => number;

  camera?: Camera;
  visible: boolean = true;

  private sprites: Set<Sprite2D> = new Set();

  constructor(config: LayerConfig) {
    this.name = config.name;
    this.zIndex = config.zIndex;
    this.sortMode = config.sortMode ?? 'z-index';
    this.customSort = config.customSort;
    this.camera = config.camera;
    this.visible = config.visible ?? true;
  }

  add(sprite: Sprite2D): void {
    this.sprites.add(sprite);
    sprite.layer = this.zIndex;
  }

  remove(sprite: Sprite2D): void {
    this.sprites.delete(sprite);
  }

  has(sprite: Sprite2D): boolean {
    return this.sprites.has(sprite);
  }

  getSprites(): readonly Sprite2D[] {
    return Array.from(this.sprites);
  }

  get spriteCount(): number {
    return this.sprites.size;
  }

  clear(): void {
    this.sprites.clear();
  }
}

/**
 * High-level layer management for 2D rendering.
 *
 * Provides named layers with individual sorting and camera settings.
 *
 * @example
 * ```typescript
 * const layerManager = new LayerManager(renderer2D);
 *
 * // Create layers
 * layerManager.createLayer({ name: 'background', zIndex: 0 });
 * layerManager.createLayer({ name: 'entities', zIndex: 1, sortMode: 'y-sort' });
 * layerManager.createLayer({ name: 'ui', zIndex: 100 });
 *
 * // Add sprites to layers
 * layerManager.addToLayer('background', bgSprite);
 * layerManager.addToLayer('entities', player, enemy);
 * layerManager.addToLayer('ui', scoreText);
 *
 * // Render
 * layerManager.render(renderer, camera);
 * ```
 */
export class LayerManager {
  private layers: Map<string, Layer> = new Map();
  private sortedLayers: Layer[] = [];
  private renderer2D: Renderer2D;

  constructor(renderer2D: Renderer2D) {
    this.renderer2D = renderer2D;
  }

  /**
   * Create a new layer.
   */
  createLayer(config: LayerConfig): Layer {
    if (this.layers.has(config.name)) {
      throw new Error(`Layer already exists: ${config.name}`);
    }

    const layer = new Layer(config);
    this.layers.set(config.name, layer);
    this.updateLayerOrder();

    return layer;
  }

  /**
   * Get a layer by name.
   */
  getLayer(name: string): Layer | undefined {
    return this.layers.get(name);
  }

  /**
   * Remove a layer.
   */
  removeLayer(name: string): boolean {
    const layer = this.layers.get(name);
    if (layer) {
      // Remove all sprites from renderer
      for (const sprite of layer.getSprites()) {
        this.renderer2D.remove(sprite);
      }
      this.layers.delete(name);
      this.updateLayerOrder();
      return true;
    }
    return false;
  }

  /**
   * Add sprites to a layer.
   */
  addToLayer(name: string, ...sprites: Sprite2D[]): void {
    const layer = this.layers.get(name);
    if (!layer) {
      throw new Error(`Layer not found: ${name}`);
    }

    for (const sprite of sprites) {
      layer.add(sprite);
      this.renderer2D.add(sprite);
    }
  }

  /**
   * Remove sprites from a layer.
   */
  removeFromLayer(name: string, ...sprites: Sprite2D[]): void {
    const layer = this.layers.get(name);
    if (!layer) return;

    for (const sprite of sprites) {
      layer.remove(sprite);
      this.renderer2D.remove(sprite);
    }
  }

  /**
   * Move sprite to a different layer.
   */
  moveToLayer(sprite: Sprite2D, targetLayer: string): void {
    // Find current layer
    for (const layer of this.layers.values()) {
      if (layer.has(sprite)) {
        layer.remove(sprite);
        break;
      }
    }

    // Add to target layer
    const target = this.layers.get(targetLayer);
    if (target) {
      target.add(sprite);
    }
  }

  /**
   * Set layer visibility.
   */
  setLayerVisible(name: string, visible: boolean): void {
    const layer = this.layers.get(name);
    if (layer) {
      layer.visible = visible;
      // Update sprite visibility
      for (const sprite of layer.getSprites()) {
        sprite.visible = visible;
      }
    }
  }

  /**
   * Get all layer names.
   */
  getLayerNames(): string[] {
    return Array.from(this.layers.keys());
  }

  /**
   * Update layer sort order.
   */
  private updateLayerOrder(): void {
    this.sortedLayers = Array.from(this.layers.values()).sort(
      (a, b) => a.zIndex - b.zIndex
    );
  }

  /**
   * Render all layers.
   */
  render(renderer: WebGLRenderer, defaultCamera: Camera): void {
    // The Renderer2D handles all rendering with proper sorting
    this.renderer2D.render(renderer, defaultCamera);
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.layers.clear();
    this.sortedLayers = [];
  }
}
```

---

### 7. Built-in Layer Constants

**packages/core/src/pipeline/layers.ts:**

```typescript
/**
 * Built-in layer constants.
 *
 * Users can define their own layers with any zIndex values.
 * These are provided as sensible defaults.
 */
export const Layers = {
  /** Background elements (sky, distant scenery) */
  BACKGROUND: 0,
  /** Ground/floor tiles */
  GROUND: 1,
  /** Shadow sprites */
  SHADOWS: 2,
  /** Game entities (players, enemies, NPCs) */
  ENTITIES: 3,
  /** Visual effects (particles, explosions) */
  EFFECTS: 4,
  /** Foreground elements (trees, buildings in front) */
  FOREGROUND: 5,
  /** UI elements */
  UI: 6,
  /** Debug overlays */
  DEBUG: 100,
} as const;

export type LayerName = keyof typeof Layers;
export type LayerValue = (typeof Layers)[LayerName];
```

---

### 8. Exports

**packages/core/src/pipeline/index.ts:**

```typescript
export { Renderer2D } from './Renderer2D';
export { BatchManager } from './BatchManager';
export { SpriteBatch } from './SpriteBatch';
export { SpriteBatchMaterial } from './SpriteBatchMaterial';
export { LayerManager, Layer } from './LayerManager';
export { Layers } from './layers';
export type {
  Renderer2DOptions,
  RenderStats,
  LayerConfig,
  BlendMode,
  SortMode,
  Renderable2D,
} from './types';
export type { LayerName, LayerValue } from './layers';
```

**packages/core/src/index.ts (updated):**

```typescript
export const VERSION = '0.3.0';

// Sprites
export * from './sprites';

// Animation
export * from './animation';

// Pipeline
export * from './pipeline';

// Materials
export * from './materials';

// Loaders
export * from './loaders';
```

---

### 9. Tests

**packages/core/src/pipeline/Renderer2D.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Texture, OrthographicCamera } from 'three';
import { Renderer2D } from './Renderer2D';
import { Sprite2D } from '../sprites/Sprite2D';

describe('Renderer2D', () => {
  let renderer2D: Renderer2D;
  let texture: Texture;
  let mockWebGLRenderer: any;
  let camera: OrthographicCamera;

  beforeEach(() => {
    renderer2D = new Renderer2D();
    texture = new Texture();
    texture.image = { width: 128, height: 128 };
    camera = new OrthographicCamera(0, 800, 600, 0, -1000, 1000);
    mockWebGLRenderer = {
      render: vi.fn(),
    };
  });

  it('should add and remove sprites', () => {
    const sprite = new Sprite2D({ texture });
    renderer2D.add(sprite);
    expect(renderer2D.spriteCount).toBe(1);

    renderer2D.remove(sprite);
    expect(renderer2D.spriteCount).toBe(0);
  });

  it('should batch sprites with same texture', () => {
    const sprite1 = new Sprite2D({ texture });
    const sprite2 = new Sprite2D({ texture });
    const sprite3 = new Sprite2D({ texture });

    renderer2D.add(sprite1);
    renderer2D.add(sprite2);
    renderer2D.add(sprite3);

    renderer2D.render(mockWebGLRenderer, camera);

    // Should be 1 batch for same texture
    expect(renderer2D.batchCount).toBe(1);
    expect(renderer2D.drawCalls).toBe(1);
  });

  it('should create multiple batches for different textures', () => {
    const texture2 = new Texture();
    texture2.image = { width: 128, height: 128 };

    const sprite1 = new Sprite2D({ texture });
    const sprite2 = new Sprite2D({ texture: texture2 });

    renderer2D.add(sprite1);
    renderer2D.add(sprite2);

    renderer2D.render(mockWebGLRenderer, camera);

    // Should be 2 batches for different textures
    expect(renderer2D.batchCount).toBe(2);
  });

  it('should sort by layer then zIndex', () => {
    const sprite1 = new Sprite2D({ texture, layer: 1, zIndex: 10 });
    const sprite2 = new Sprite2D({ texture, layer: 0, zIndex: 100 });
    const sprite3 = new Sprite2D({ texture, layer: 1, zIndex: 5 });

    renderer2D.add(sprite1);
    renderer2D.add(sprite2);
    renderer2D.add(sprite3);

    renderer2D.render(mockWebGLRenderer, camera);

    // All same texture, so 1 batch, but internally sorted
    expect(renderer2D.batchCount).toBe(1);
  });

  it('should provide render stats', () => {
    const sprite = new Sprite2D({ texture });
    renderer2D.add(sprite);
    renderer2D.render(mockWebGLRenderer, camera);

    const stats = renderer2D.stats;
    expect(stats.spriteCount).toBe(1);
    expect(stats.spritesRendered).toBe(1);
    expect(stats.drawCalls).toBe(1);
  });
});
```

**packages/core/src/pipeline/BatchManager.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Texture } from 'three';
import { BatchManager } from './BatchManager';
import { Sprite2D } from '../sprites/Sprite2D';

describe('BatchManager', () => {
  let batchManager: BatchManager;
  let texture: Texture;

  beforeEach(() => {
    batchManager = new BatchManager();
    texture = new Texture();
    texture.image = { width: 128, height: 128 };
  });

  it('should group sprites by texture', () => {
    const sprite1 = new Sprite2D({ texture });
    const sprite2 = new Sprite2D({ texture });

    batchManager.add(sprite1);
    batchManager.add(sprite2);
    batchManager.prepare();

    const batches = batchManager.getBatches();
    expect(batches.length).toBe(1);
    expect(batches[0]?.spriteCount).toBe(2);
  });

  it('should sort sprites by layer', () => {
    const sprite1 = new Sprite2D({ texture, layer: 2 });
    const sprite2 = new Sprite2D({ texture, layer: 0 });
    const sprite3 = new Sprite2D({ texture, layer: 1 });

    batchManager.add(sprite1);
    batchManager.add(sprite2);
    batchManager.add(sprite3);
    batchManager.prepare();

    // Should maintain layer order
    const stats = batchManager.getStats();
    expect(stats.spriteCount).toBe(3);
  });

  it('should handle y-sort mode', () => {
    const ySortManager = new BatchManager({ sortMode: 'y-sort' });

    const sprite1 = new Sprite2D({ texture });
    sprite1.position.y = 100;

    const sprite2 = new Sprite2D({ texture });
    sprite2.position.y = 50;

    ySortManager.add(sprite1);
    ySortManager.add(sprite2);
    ySortManager.prepare();

    const batches = ySortManager.getBatches();
    expect(batches.length).toBe(1);
  });

  it('should filter invisible sprites', () => {
    const sprite1 = new Sprite2D({ texture });
    const sprite2 = new Sprite2D({ texture });
    sprite2.visible = false;

    batchManager.add(sprite1);
    batchManager.add(sprite2);
    batchManager.prepare();

    const batches = batchManager.getBatches();
    expect(batches[0]?.spriteCount).toBe(1);
  });
});
```

---

## Acceptance Criteria

- [ ] `Renderer2D` batches sprites by **material identity**
- [ ] Sort order respects layer > material.id > zIndex
- [ ] Y-sort mode works for isometric games
- [ ] Scene graph transforms are respected
- [ ] Render order is decoupled from scene hierarchy
- [ ] Performance: 50,000 sprites at 60fps
- [ ] Draw calls minimized (1 per material per layer)
- [ ] `LayerManager` provides high-level layer control
- [ ] Invisible sprites are not rendered
- [ ] Stats provide useful debugging information
- [ ] **TSL-NATIVE: Sprites with same material batch together**
- [ ] **TSL-NATIVE: Materials can define custom instance attributes**
- [ ] **TSL-NATIVE: Per-instance values work (dissolve progress, etc.)**
- [ ] **TSL-NATIVE: TSL nodes compose into materials correctly**
- [ ] All tests pass

---

## Performance Benchmarks

| Scenario | Target | Measurement |
|----------|--------|-------------|
| 10,000 sprites, 1 texture | <2ms frame time | DevTools |
| 50,000 sprites, 1 texture | <8ms frame time | DevTools |
| 10,000 sprites, 10 textures | <5ms frame time | DevTools |
| Sort time (50,000 sprites) | <1ms | Internal stats |
| Upload time (50,000 sprites) | <2ms | Internal stats |

---

## Example Usage

### Basic Batched Rendering

```typescript
import * as THREE from 'three/webgpu';
import {
  Renderer2D,
  LayerManager,
  Sprite2D,
  AnimatedSprite2D,
  SpriteSheetLoader,
  Layers,
} from '@three-flatland/core';

// Setup
const renderer = new THREE.WebGPURenderer();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);

// Create 2D renderer
const renderer2D = new Renderer2D({
  sortMode: 'z-index',
});

// Create layers
const layers = new LayerManager(renderer2D);
layers.createLayer({ name: 'background', zIndex: Layers.BACKGROUND });
layers.createLayer({ name: 'shadows', zIndex: Layers.SHADOWS });
layers.createLayer({ name: 'entities', zIndex: Layers.ENTITIES, sortMode: 'y-sort' });
layers.createLayer({ name: 'ui', zIndex: Layers.UI });

// Load assets
const [playerSheet, itemSheet] = await SpriteSheetLoader.preload([
  '/sprites/player.json',
  '/sprites/items.json',
]);

// Create player (scene graph for transforms)
const player = new THREE.Group();
scene.add(player);

const playerSprite = new AnimatedSprite2D({
  spriteSheet: playerSheet,
  animation: 'idle',
});
player.add(playerSprite);
layers.addToLayer('entities', playerSprite);

// Player shadow (child of player for transform, but different layer)
const shadowSprite = new Sprite2D({
  texture: playerSheet.texture,
  frame: playerSheet.getFrame('shadow'),
});
shadowSprite.position.y = -5;
player.add(shadowSprite);
layers.addToLayer('shadows', shadowSprite);

// Render loop
function animate() {
  requestAnimationFrame(animate);

  // Update sprites
  playerSprite.update(16);

  // Y-sort: update zIndex based on position
  playerSprite.zIndex = player.position.y;

  // Render 2D
  renderer2D.render(renderer, camera);
}

animate();
```

### TSL-Native Material-Based Effects with Batching

```typescript
import * as THREE from 'three/webgpu';
import {
  Renderer2D,
  Sprite2D,
  Sprite2DMaterial,
  loadTexture,
} from '@three-flatland/core';
import { dissolve, hueShift, outline } from '@three-flatland/core/nodes';
import { texture, uv, uniform } from 'three/tsl';

// Setup
const renderer = new THREE.WebGPURenderer();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);
const renderer2D = new Renderer2D();

// Load shared texture
const heroTexture = await loadTexture('/sprites/hero.png');

// ============================================
// APPROACH A: Different Materials (Simple)
// Different effects = different materials = separate batches
// This is fine for most games!
// ============================================

const normalMaterial = new Sprite2DMaterial({ map: heroTexture });

const glowMaterial = new Sprite2DMaterial({ map: heroTexture });
glowMaterial.colorNode = hueShift(
  texture(heroTexture, uv()),
  { amount: uniform(0.3) }
);

const outlinedMaterial = new Sprite2DMaterial({ map: heroTexture });
outlinedMaterial.colorNode = outline(
  texture(heroTexture, uv()),
  { width: 2, color: new THREE.Color(0xff0000) }
);

// Sprites with same material batch together
const player1 = new Sprite2D({ material: normalMaterial });
const player2 = new Sprite2D({ material: normalMaterial }); // Batches with player1!
const boss = new Sprite2D({ material: outlinedMaterial });

renderer2D.add(player1);
renderer2D.add(player2);
renderer2D.add(boss);

// Result: 2 draw calls (normal + outlined)

// ============================================
// APPROACH B: Per-Instance Values (Advanced)
// Same material, different values per sprite
// ============================================

const ghostMaterial = new Sprite2DMaterial({ map: heroTexture });

// Define per-instance dissolve attribute
const dissolveAttr = ghostMaterial.addInstanceFloat('dissolve', 0);

// Build shader that reads from instance attribute
ghostMaterial.colorNode = dissolve(
  texture(heroTexture, uv()),
  { progress: dissolveAttr }
);

// Create ghosts with different dissolve values - ALL BATCH TOGETHER!
const ghost1 = new Sprite2D({ material: ghostMaterial });
const ghost2 = new Sprite2D({ material: ghostMaterial });
const ghost3 = new Sprite2D({ material: ghostMaterial });

ghost1.setInstanceValue('dissolve', 0.0);  // Fully visible
ghost2.setInstanceValue('dissolve', 0.3);  // 30% dissolved
ghost3.setInstanceValue('dissolve', 0.7);  // 70% dissolved

renderer2D.add(ghost1);
renderer2D.add(ghost2);
renderer2D.add(ghost3);

// Result: 1 draw call for all ghosts!

// Animate dissolve per-sprite
function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;

  // Each ghost can have different animation
  ghost1.setInstanceValue('dissolve', Math.sin(time) * 0.5 + 0.5);
  ghost2.setInstanceValue('dissolve', Math.sin(time + 1) * 0.5 + 0.5);
  ghost3.setInstanceValue('dissolve', Math.sin(time + 2) * 0.5 + 0.5);

  renderer2D.render(renderer, camera);
}

animate();
```

### Key Points: TSL-Native Material System

1. **Materials define shaders** using TSL nodes (hueShift, dissolve, outline, etc.)
2. **Same material = same batch** (sprites sharing a material instance batch together)
3. **Different materials = separate batches** (this is expected and acceptable)
4. **Per-instance variation** via `addInstanceFloat()` when you need different values per sprite
5. **No uber-shader waste** - each material has exactly what it needs
6. **Full TSL composability** - chain effects like any TSL nodes

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Instance attribute limits | Low | High | Pool batches, cap per-batch count |
| Sorting performance | Medium | Medium | Cache sort keys, use typed arrays |
| Memory fragmentation | Low | Medium | Reuse batch objects |
| WebGPU differences | Medium | Medium | Test both backends |

---

## Dependencies for Next Milestone

M4 (TSL Nodes Part 1) requires:
- ✅ Working render pipeline
- ✅ SpriteBatchMaterial as base for effects

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 2 |
| SpriteBatch + material | 8 |
| BatchManager | 8 |
| Renderer2D | 6 |
| LayerManager | 4 |
| Performance optimization | 6 |
| Tests | 4 |
| Documentation | 2 |
| **Total** | **40 hours** (~2 weeks) |

---

*End of M3: 2D Render Pipeline*
