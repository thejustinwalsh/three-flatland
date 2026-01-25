# M5: Tilemaps

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 3 weeks |
| **Dependencies** | M1 (Core Sprites), M3 (2D Render Pipeline) |
| **Outputs** | TileMap2D, Tileset, TiledLoader, LDtkLoader, chunked rendering |
| **Risk Level** | Medium (format parsing complexity, large map performance) |

---

## Objectives

1. Implement `TileMap2D` class for efficient 2D tilemap rendering
2. Create `Tileset` class for managing tile data and texture atlases
3. Implement `TiledLoader` for loading Tiled JSON format (.tmj/.json)
4. Implement `LDtkLoader` for loading LDtk JSON format
5. Support multiple layers, animated tiles, and collision data
6. Implement chunked rendering for large maps (infinite/streaming)
7. Optimize for maps with 100,000+ tiles at 60fps

---

## Architecture

```
+---------------------------------------------------------------------------+
|                          TILEMAP ARCHITECTURE                              |
+---------------------------------------------------------------------------+
|                                                                           |
|   External Formats                                                        |
|   +-------------------+    +-------------------+                          |
|   |    Tiled JSON     |    |    LDtk JSON      |                          |
|   |  (.tmj/.json)     |    |    (.ldtk)        |                          |
|   +--------+----------+    +--------+----------+                          |
|            |                        |                                     |
|            v                        v                                     |
|   +-------------------+    +-------------------+                          |
|   |   TiledLoader     |    |    LDtkLoader     |                          |
|   +--------+----------+    +--------+----------+                          |
|            |                        |                                     |
|            +----------+  +----------+                                     |
|                       |  |                                                |
|                       v  v                                                |
|              +-------------------+                                        |
|              |     TileMapData   |  Internal representation               |
|              | (format-agnostic) |                                        |
|              +--------+----------+                                        |
|                       |                                                   |
|                       v                                                   |
|   +---------------------------------------------------------------+      |
|   |                        TileMap2D                               |      |
|   | +---------------------------+  +---------------------------+   |      |
|   | |        Tileset(s)         |  |       TileLayer(s)        |   |      |
|   | | - texture atlas           |  | - tile indices            |   |      |
|   | | - tile definitions        |  | - chunk management        |   |      |
|   | | - animated tile data      |  | - collision data          |   |      |
|   | +---------------------------+  +---------------------------+   |      |
|   |                                                                |      |
|   | +---------------------------+  +---------------------------+   |      |
|   | |      ChunkManager         |  |     TileAnimator          |   |      |
|   | | - spatial hash grid       |  | - frame timing            |   |      |
|   | | - LOD management          |  | - batch updates           |   |      |
|   | | - culling                 |  | - GPU-friendly            |   |      |
|   | +---------------------------+  +---------------------------+   |      |
|   +---------------------------------------------------------------+      |
|                       |                                                   |
|                       v                                                   |
|   +---------------------------------------------------------------+      |
|   |                     TileChunk                                  |      |
|   | - InstancedMesh-based rendering                                |      |
|   | - Per-chunk GPU buffers                                        |      |
|   | - Frustum culling per chunk                                    |      |
|   | - Dirty tracking for updates                                   |      |
|   +---------------------------------------------------------------+      |
|                                                                           |
+---------------------------------------------------------------------------+
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/tilemap/types.ts:**

```typescript
import type { Texture, Vector2 } from 'three';

/**
 * A single tile definition in a tileset.
 */
export interface TileDefinition {
  /** Global tile ID (GID) */
  id: number;
  /** UV coordinates in atlas (normalized 0-1) */
  uv: { x: number; y: number; width: number; height: number };
  /** Collision shapes (if any) */
  collision?: CollisionShape[];
  /** Custom properties */
  properties?: Record<string, unknown>;
  /** Animation frames (if animated) */
  animation?: TileAnimationFrame[];
}

/**
 * Animation frame for animated tiles.
 */
export interface TileAnimationFrame {
  /** Tile ID to display */
  tileId: number;
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Collision shape types.
 */
export type CollisionShape =
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'ellipse'; x: number; y: number; width: number; height: number }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> }
  | { type: 'polyline'; points: Array<{ x: number; y: number }> };

/**
 * Tileset data structure.
 */
export interface TilesetData {
  /** Tileset name */
  name: string;
  /** First GID for this tileset */
  firstGid: number;
  /** Tile width in pixels */
  tileWidth: number;
  /** Tile height in pixels */
  tileHeight: number;
  /** Tileset image width */
  imageWidth: number;
  /** Tileset image height */
  imageHeight: number;
  /** Number of columns */
  columns: number;
  /** Number of tiles */
  tileCount: number;
  /** Spacing between tiles */
  spacing?: number;
  /** Margin around tiles */
  margin?: number;
  /** Tile definitions */
  tiles: Map<number, TileDefinition>;
  /** Texture atlas */
  texture?: Texture;
}

/**
 * Tile layer data.
 */
export interface TileLayerData {
  /** Layer name */
  name: string;
  /** Layer ID */
  id: number;
  /** Layer width in tiles */
  width: number;
  /** Layer height in tiles */
  height: number;
  /** Tile data (GIDs, 0 = empty) */
  data: Uint32Array;
  /** Layer offset in pixels */
  offset?: { x: number; y: number };
  /** Layer opacity (0-1) */
  opacity?: number;
  /** Layer visibility */
  visible?: boolean;
  /** Parallax factor */
  parallax?: { x: number; y: number };
  /** Tint color */
  tint?: number;
  /** Custom properties */
  properties?: Record<string, unknown>;
}

/**
 * Object layer data (for entities, spawn points, etc.).
 */
export interface ObjectLayerData {
  /** Layer name */
  name: string;
  /** Layer ID */
  id: number;
  /** Objects in this layer */
  objects: TileMapObject[];
  /** Layer offset in pixels */
  offset?: { x: number; y: number };
  /** Layer visibility */
  visible?: boolean;
  /** Custom properties */
  properties?: Record<string, unknown>;
}

/**
 * A map object (entity, trigger, etc.).
 */
export interface TileMapObject {
  /** Object ID */
  id: number;
  /** Object name */
  name: string;
  /** Object type/class */
  type: string;
  /** Position in pixels */
  x: number;
  y: number;
  /** Size in pixels */
  width: number;
  height: number;
  /** Rotation in degrees */
  rotation?: number;
  /** Tile GID (if tile object) */
  gid?: number;
  /** Polygon points (if polygon) */
  polygon?: Array<{ x: number; y: number }>;
  /** Polyline points (if polyline) */
  polyline?: Array<{ x: number; y: number }>;
  /** Ellipse flag */
  ellipse?: boolean;
  /** Point flag */
  point?: boolean;
  /** Custom properties */
  properties?: Record<string, unknown>;
}

/**
 * Complete tilemap data (format-agnostic).
 */
export interface TileMapData {
  /** Map width in tiles */
  width: number;
  /** Map height in tiles */
  height: number;
  /** Tile width in pixels */
  tileWidth: number;
  /** Tile height in pixels */
  tileHeight: number;
  /** Map orientation */
  orientation: 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal';
  /** Render order */
  renderOrder: 'right-down' | 'right-up' | 'left-down' | 'left-up';
  /** Infinite map flag */
  infinite: boolean;
  /** Background color */
  backgroundColor?: number;
  /** Tilesets used */
  tilesets: TilesetData[];
  /** Tile layers */
  tileLayers: TileLayerData[];
  /** Object layers */
  objectLayers: ObjectLayerData[];
  /** Custom properties */
  properties?: Record<string, unknown>;
}

/**
 * TileMap2D options.
 */
export interface TileMap2DOptions {
  /** Tilemap data */
  data: TileMapData;
  /** Chunk size in tiles (default: 16) */
  chunkSize?: number;
  /** Enable collision data extraction (default: true) */
  enableCollision?: boolean;
  /** Pixel perfect rendering (default: false) */
  pixelPerfect?: boolean;
  /** Render layer for all tile layers (default: 0) */
  baseLayer?: number;
}

/**
 * Chunk coordinates.
 */
export interface ChunkCoord {
  x: number;
  y: number;
}

/**
 * Tile instance data for rendering.
 */
export interface TileInstance {
  /** World X position */
  x: number;
  /** World Y position */
  y: number;
  /** Tile GID */
  gid: number;
  /** Flip flags (horizontal, vertical, diagonal) */
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
}
```

---

### 2. Tileset Class

**packages/core/src/tilemap/Tileset.ts:**

```typescript
import { Texture, NearestFilter, ClampToEdgeWrapping } from 'three';
import type { TilesetData, TileDefinition, TileAnimationFrame } from './types';

/**
 * Represents a tileset with tile definitions and texture atlas.
 *
 * Handles UV coordinate calculation and animated tile management.
 */
export class Tileset {
  /** Tileset name */
  readonly name: string;

  /** First GID */
  readonly firstGid: number;

  /** Tile dimensions */
  readonly tileWidth: number;
  readonly tileHeight: number;

  /** Atlas dimensions */
  readonly imageWidth: number;
  readonly imageHeight: number;

  /** Grid info */
  readonly columns: number;
  readonly tileCount: number;
  readonly spacing: number;
  readonly margin: number;

  /** Texture atlas */
  private _texture: Texture | null = null;

  /** Tile definitions (keyed by local ID, not GID) */
  private tiles: Map<number, TileDefinition> = new Map();

  /** Animated tiles (keyed by local ID) */
  private animatedTiles: Map<number, TileAnimationFrame[]> = new Map();

  constructor(data: TilesetData) {
    this.name = data.name;
    this.firstGid = data.firstGid;
    this.tileWidth = data.tileWidth;
    this.tileHeight = data.tileHeight;
    this.imageWidth = data.imageWidth;
    this.imageHeight = data.imageHeight;
    this.columns = data.columns;
    this.tileCount = data.tileCount;
    this.spacing = data.spacing ?? 0;
    this.margin = data.margin ?? 0;

    if (data.texture) {
      this.texture = data.texture;
    }

    // Process tile definitions
    for (const [id, tile] of data.tiles) {
      this.tiles.set(id, tile);
      if (tile.animation) {
        this.animatedTiles.set(id, tile.animation);
      }
    }
  }

  /**
   * Get the texture atlas.
   */
  get texture(): Texture | null {
    return this._texture;
  }

  /**
   * Set the texture atlas.
   */
  set texture(value: Texture | null) {
    this._texture = value;
    if (value) {
      // Configure for pixel-perfect rendering
      value.minFilter = NearestFilter;
      value.magFilter = NearestFilter;
      value.wrapS = ClampToEdgeWrapping;
      value.wrapT = ClampToEdgeWrapping;
      value.generateMipmaps = false;
    }
  }

  /**
   * Check if a GID belongs to this tileset.
   */
  containsGid(gid: number): boolean {
    const localId = gid - this.firstGid;
    return localId >= 0 && localId < this.tileCount;
  }

  /**
   * Get local ID from GID.
   */
  getLocalId(gid: number): number {
    return gid - this.firstGid;
  }

  /**
   * Get UV coordinates for a tile.
   */
  getUV(gid: number): { x: number; y: number; width: number; height: number } {
    const localId = gid - this.firstGid;

    // Check for custom tile definition first
    const tileDef = this.tiles.get(localId);
    if (tileDef?.uv) {
      return tileDef.uv;
    }

    // Calculate from grid position
    const col = localId % this.columns;
    const row = Math.floor(localId / this.columns);

    const x = this.margin + col * (this.tileWidth + this.spacing);
    const y = this.margin + row * (this.tileHeight + this.spacing);

    return {
      x: x / this.imageWidth,
      y: y / this.imageHeight,
      width: this.tileWidth / this.imageWidth,
      height: this.tileHeight / this.imageHeight,
    };
  }

  /**
   * Get tile definition.
   */
  getTile(gid: number): TileDefinition | undefined {
    const localId = gid - this.firstGid;
    return this.tiles.get(localId);
  }

  /**
   * Check if a tile is animated.
   */
  isAnimated(gid: number): boolean {
    const localId = gid - this.firstGid;
    return this.animatedTiles.has(localId);
  }

  /**
   * Get animation frames for a tile.
   */
  getAnimation(gid: number): TileAnimationFrame[] | undefined {
    const localId = gid - this.firstGid;
    return this.animatedTiles.get(localId);
  }

  /**
   * Get all animated tile IDs.
   */
  getAnimatedTileIds(): number[] {
    return Array.from(this.animatedTiles.keys()).map((id) => id + this.firstGid);
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this._texture?.dispose();
    this._texture = null;
  }
}
```

---

### 3. TileChunk

**packages/core/src/tilemap/TileChunk.ts:**

```typescript
import {
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
  Matrix4,
  Vector3,
  Box3,
} from 'three';
import { TileChunkMaterial } from './TileChunkMaterial';
import type { Tileset } from './Tileset';
import type { TileInstance, ChunkCoord } from './types';

/**
 * A chunk of tiles rendered as an InstancedMesh.
 *
 * Each chunk manages a fixed region of tiles for efficient
 * culling and GPU upload.
 */
export class TileChunk {
  /** Chunk coordinates */
  readonly coord: ChunkCoord;

  /** Chunk size in tiles */
  readonly size: number;

  /** Tile dimensions */
  readonly tileWidth: number;
  readonly tileHeight: number;

  /** The instanced mesh */
  readonly mesh: InstancedMesh;

  /** Bounding box for frustum culling */
  readonly bounds: Box3;

  /** Maximum tiles in chunk */
  private maxTiles: number;

  /** Current tile count */
  private count: number = 0;

  /** Instance buffers */
  private uvOffsets: Float32Array;
  private tilePositions: Float32Array;

  /** Dirty flag */
  private _dirty: boolean = false;

  constructor(
    coord: ChunkCoord,
    size: number,
    tileWidth: number,
    tileHeight: number,
    tileset: Tileset
  ) {
    this.coord = coord;
    this.size = size;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.maxTiles = size * size;

    // Create geometry (1x1 plane scaled by tile size)
    const geometry = new PlaneGeometry(1, 1);

    // Create material
    const material = new TileChunkMaterial({
      map: tileset.texture!,
      tileSize: { width: tileWidth, height: tileHeight },
    });

    // Create instanced mesh
    this.mesh = new InstancedMesh(geometry, material, this.maxTiles);
    this.mesh.frustumCulled = true;
    this.mesh.count = 0;

    // Position the mesh at chunk origin
    const worldX = coord.x * size * tileWidth;
    const worldY = coord.y * size * tileHeight;
    this.mesh.position.set(worldX, worldY, 0);

    // Allocate instance buffers
    this.uvOffsets = new Float32Array(this.maxTiles * 4);
    this.tilePositions = new Float32Array(this.maxTiles * 3);

    // Setup instance attributes
    geometry.setAttribute(
      'instanceUV',
      new InstancedBufferAttribute(this.uvOffsets, 4)
    );

    // Calculate bounding box
    this.bounds = new Box3(
      new Vector3(worldX, worldY, 0),
      new Vector3(
        worldX + size * tileWidth,
        worldY + size * tileHeight,
        0
      )
    );
  }

  /**
   * Check if chunk contains a world position.
   */
  containsWorldPosition(x: number, y: number): boolean {
    return this.bounds.containsPoint(new Vector3(x, y, 0));
  }

  /**
   * Clear all tiles.
   */
  clear(): void {
    this.count = 0;
    this._dirty = true;
  }

  /**
   * Set tiles from array.
   */
  setTiles(tiles: TileInstance[], tileset: Tileset): void {
    this.count = Math.min(tiles.length, this.maxTiles);

    const tempMatrix = new Matrix4();

    for (let i = 0; i < this.count; i++) {
      const tile = tiles[i];

      // Calculate local position within chunk
      const localX = tile.x - this.coord.x * this.size * this.tileWidth;
      const localY = tile.y - this.coord.y * this.size * this.tileHeight;

      // Set transform matrix
      tempMatrix.makeTranslation(
        localX + this.tileWidth / 2,
        localY + this.tileHeight / 2,
        0
      );

      // Apply flip transforms
      if (tile.flipH || tile.flipV || tile.flipD) {
        const scaleX = tile.flipH ? -1 : 1;
        const scaleY = tile.flipV ? -1 : 1;
        tempMatrix.scale(new Vector3(
          scaleX * this.tileWidth,
          scaleY * this.tileHeight,
          1
        ));
      } else {
        tempMatrix.scale(new Vector3(this.tileWidth, this.tileHeight, 1));
      }

      this.mesh.setMatrixAt(i, tempMatrix);

      // Get UV for this tile
      const uv = tileset.getUV(tile.gid);

      // Handle flip by adjusting UVs
      let uvX = uv.x;
      let uvY = uv.y;
      let uvW = uv.width;
      let uvH = uv.height;

      if (tile.flipH) {
        uvX = uv.x + uv.width;
        uvW = -uv.width;
      }
      if (tile.flipV) {
        uvY = uv.y + uv.height;
        uvH = -uv.height;
      }

      this.uvOffsets[i * 4] = uvX;
      this.uvOffsets[i * 4 + 1] = uvY;
      this.uvOffsets[i * 4 + 2] = uvW;
      this.uvOffsets[i * 4 + 3] = uvH;
    }

    this._dirty = true;
  }

  /**
   * Update animated tiles.
   */
  updateAnimatedTiles(
    animatedPositions: Map<number, { gid: number; index: number }>,
    tileset: Tileset
  ): void {
    for (const [, data] of animatedPositions) {
      const uv = tileset.getUV(data.gid);
      const i = data.index;

      this.uvOffsets[i * 4] = uv.x;
      this.uvOffsets[i * 4 + 1] = uv.y;
      this.uvOffsets[i * 4 + 2] = uv.width;
      this.uvOffsets[i * 4 + 3] = uv.height;
    }

    if (animatedPositions.size > 0) {
      this._dirty = true;
    }
  }

  /**
   * Upload data to GPU if dirty.
   */
  upload(): void {
    if (!this._dirty) return;

    this.mesh.count = this.count;

    if (this.count > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;

      const uvAttr = this.mesh.geometry.getAttribute(
        'instanceUV'
      ) as InstancedBufferAttribute;
      uvAttr.needsUpdate = true;
    }

    this._dirty = false;
  }

  /**
   * Get tile count.
   */
  get tileCount(): number {
    return this.count;
  }

  /**
   * Check if dirty.
   */
  get dirty(): boolean {
    return this._dirty;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as TileChunkMaterial).dispose();
  }
}
```

---

### 4. TileChunkMaterial (TSL)

**packages/core/src/tilemap/TileChunkMaterial.ts:**

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
  float,
} from 'three/tsl';
import { Texture, FrontSide, NormalBlending } from 'three';

export interface TileChunkMaterialOptions {
  map: Texture;
  tileSize: { width: number; height: number };
  alphaTest?: number;
}

/**
 * TSL-based material for tile chunk rendering.
 *
 * Uses instance attributes for per-tile UV data.
 */
export class TileChunkMaterial extends MeshBasicNodeMaterial {
  constructor(options: TileChunkMaterialOptions) {
    super();

    const { map, alphaTest = 0.01 } = options;

    // Instance attribute for UV offset/scale
    const instanceUV = attribute('instanceUV', 'vec4');

    // Setup color node
    this.colorNode = Fn(() => {
      // Get base UV (0-1 on quad)
      const baseUV = uv();

      // Remap to tile position in atlas
      // instanceUV = (x, y, width, height)
      const atlasUV = baseUV
        .mul(vec2(instanceUV.z, instanceUV.w))
        .add(vec2(instanceUV.x, instanceUV.y));

      // Sample texture
      const texColor = textureFn(map, atlasUV);

      // Alpha test - discard fully transparent pixels
      If(texColor.a.lessThan(float(alphaTest)), () => {
        Discard();
      });

      return texColor;
    })();

    // Material settings
    this.transparent = true;
    this.depthWrite = false;
    this.depthTest = true;
    this.side = FrontSide;
    this.blending = NormalBlending;
  }
}
```

---

### 5. TileLayer

**packages/core/src/tilemap/TileLayer.ts:**

```typescript
import { Group, Box3, Vector3 } from 'three';
import { TileChunk } from './TileChunk';
import type { Tileset } from './Tileset';
import type { TileLayerData, TileInstance, ChunkCoord, TileAnimationFrame } from './types';

/**
 * A layer of tiles in a tilemap.
 *
 * Manages chunked rendering and animated tiles.
 */
export class TileLayer extends Group {
  /** Layer data */
  readonly data: TileLayerData;

  /** Chunk size in tiles */
  readonly chunkSize: number;

  /** Tile dimensions */
  readonly tileWidth: number;
  readonly tileHeight: number;

  /** Chunks (keyed by "x,y") */
  private chunks: Map<string, TileChunk> = new Map();

  /** Tileset reference */
  private tileset: Tileset;

  /** Animated tile tracking */
  private animatedTilePositions: Map<
    number,
    { gid: number; baseGid: number; chunkKey: string; index: number }
  > = new Map();

  /** Animation state */
  private animationTimers: Map<number, { elapsed: number; frameIndex: number }> =
    new Map();

  constructor(
    data: TileLayerData,
    tileset: Tileset,
    tileWidth: number,
    tileHeight: number,
    chunkSize: number = 16
  ) {
    super();

    this.data = data;
    this.tileset = tileset;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.chunkSize = chunkSize;

    this.name = data.name;
    this.visible = data.visible ?? true;

    if (data.offset) {
      this.position.set(data.offset.x, data.offset.y, 0);
    }

    // Build chunks from tile data
    this.buildChunks();
  }

  /**
   * Build chunks from tile data.
   */
  private buildChunks(): void {
    const { width, height, data } = this.data;

    // Group tiles by chunk
    const chunkTiles = new Map<string, TileInstance[]>();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const rawGid = data[index];

        // Skip empty tiles
        if (rawGid === 0) continue;

        // Extract flip flags (stored in high bits)
        const flipH = (rawGid & 0x80000000) !== 0;
        const flipV = (rawGid & 0x40000000) !== 0;
        const flipD = (rawGid & 0x20000000) !== 0;
        const gid = rawGid & 0x1fffffff;

        // Calculate chunk coordinates
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkY = Math.floor(y / this.chunkSize);
        const chunkKey = `${chunkX},${chunkY}`;

        // Calculate world position
        const worldX = x * this.tileWidth;
        const worldY = y * this.tileHeight;

        const tile: TileInstance = {
          x: worldX,
          y: worldY,
          gid,
          flipH,
          flipV,
          flipD,
        };

        if (!chunkTiles.has(chunkKey)) {
          chunkTiles.set(chunkKey, []);
        }
        chunkTiles.get(chunkKey)!.push(tile);

        // Track animated tiles
        if (this.tileset.isAnimated(gid)) {
          const animation = this.tileset.getAnimation(gid)!;
          const tileIndex = chunkTiles.get(chunkKey)!.length - 1;

          this.animatedTilePositions.set(index, {
            gid: animation[0].tileId + this.tileset.firstGid,
            baseGid: gid,
            chunkKey,
            index: tileIndex,
          });

          // Initialize animation timer
          if (!this.animationTimers.has(gid)) {
            this.animationTimers.set(gid, { elapsed: 0, frameIndex: 0 });
          }
        }
      }
    }

    // Create chunks
    for (const [key, tiles] of chunkTiles) {
      const [cx, cy] = key.split(',').map(Number);
      const coord: ChunkCoord = { x: cx, y: cy };

      const chunk = new TileChunk(
        coord,
        this.chunkSize,
        this.tileWidth,
        this.tileHeight,
        this.tileset
      );
      chunk.setTiles(tiles, this.tileset);
      chunk.upload();

      this.chunks.set(key, chunk);
      this.add(chunk.mesh);
    }
  }

  /**
   * Update animated tiles.
   */
  update(deltaMs: number): void {
    if (this.animatedTilePositions.size === 0) return;

    // Update animation timers
    const changedGids = new Set<number>();

    for (const [gid, timer] of this.animationTimers) {
      const animation = this.tileset.getAnimation(gid);
      if (!animation) continue;

      timer.elapsed += deltaMs;
      const currentFrame = animation[timer.frameIndex];

      if (timer.elapsed >= currentFrame.duration) {
        timer.elapsed -= currentFrame.duration;
        timer.frameIndex = (timer.frameIndex + 1) % animation.length;
        changedGids.add(gid);
      }
    }

    if (changedGids.size === 0) return;

    // Group updates by chunk
    const chunkUpdates = new Map<string, Map<number, { gid: number; index: number }>>();

    for (const [, data] of this.animatedTilePositions) {
      if (!changedGids.has(data.baseGid)) continue;

      const timer = this.animationTimers.get(data.baseGid)!;
      const animation = this.tileset.getAnimation(data.baseGid)!;
      const newGid = animation[timer.frameIndex].tileId + this.tileset.firstGid;

      if (!chunkUpdates.has(data.chunkKey)) {
        chunkUpdates.set(data.chunkKey, new Map());
      }
      chunkUpdates.get(data.chunkKey)!.set(data.index, {
        gid: newGid,
        index: data.index,
      });

      data.gid = newGid;
    }

    // Apply updates to chunks
    for (const [chunkKey, updates] of chunkUpdates) {
      const chunk = this.chunks.get(chunkKey);
      if (chunk) {
        chunk.updateAnimatedTiles(updates, this.tileset);
        chunk.upload();
      }
    }
  }

  /**
   * Get tile GID at position (in tiles).
   */
  getTileAt(tileX: number, tileY: number): number {
    const { width, height, data } = this.data;
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
      return 0;
    }
    const index = tileY * width + tileX;
    return data[index] & 0x1fffffff;
  }

  /**
   * Set tile GID at position (in tiles).
   */
  setTileAt(tileX: number, tileY: number, gid: number): void {
    const { width, height, data } = this.data;
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
      return;
    }

    const index = tileY * width + tileX;
    data[index] = gid;

    // Rebuild affected chunk
    const chunkX = Math.floor(tileX / this.chunkSize);
    const chunkY = Math.floor(tileY / this.chunkSize);
    this.rebuildChunk(chunkX, chunkY);
  }

  /**
   * Rebuild a specific chunk.
   */
  private rebuildChunk(chunkX: number, chunkY: number): void {
    const chunkKey = `${chunkX},${chunkY}`;
    const { width, height, data } = this.data;

    // Gather tiles for this chunk
    const tiles: TileInstance[] = [];
    const startX = chunkX * this.chunkSize;
    const startY = chunkY * this.chunkSize;
    const endX = Math.min(startX + this.chunkSize, width);
    const endY = Math.min(startY + this.chunkSize, height);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = y * width + x;
        const rawGid = data[index];

        if (rawGid === 0) continue;

        const flipH = (rawGid & 0x80000000) !== 0;
        const flipV = (rawGid & 0x40000000) !== 0;
        const flipD = (rawGid & 0x20000000) !== 0;
        const gid = rawGid & 0x1fffffff;

        tiles.push({
          x: x * this.tileWidth,
          y: y * this.tileHeight,
          gid,
          flipH,
          flipV,
          flipD,
        });
      }
    }

    // Update or create chunk
    let chunk = this.chunks.get(chunkKey);
    if (!chunk && tiles.length > 0) {
      chunk = new TileChunk(
        { x: chunkX, y: chunkY },
        this.chunkSize,
        this.tileWidth,
        this.tileHeight,
        this.tileset
      );
      this.chunks.set(chunkKey, chunk);
      this.add(chunk.mesh);
    }

    if (chunk) {
      if (tiles.length > 0) {
        chunk.setTiles(tiles, this.tileset);
        chunk.upload();
      } else {
        // Remove empty chunk
        this.remove(chunk.mesh);
        chunk.dispose();
        this.chunks.delete(chunkKey);
      }
    }
  }

  /**
   * Get chunk count.
   */
  get chunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose();
    }
    this.chunks.clear();
  }
}
```

---

### 6. TileMap2D

**packages/core/src/tilemap/TileMap2D.ts:**

```typescript
import { Group, Box3, Vector3 } from 'three';
import { Tileset } from './Tileset';
import { TileLayer } from './TileLayer';
import type {
  TileMapData,
  TileMap2DOptions,
  TileLayerData,
  ObjectLayerData,
  TileMapObject,
  CollisionShape,
} from './types';

/**
 * Main tilemap class for rendering 2D tile-based maps.
 *
 * Supports:
 * - Multiple tile layers
 * - Animated tiles
 * - Chunked rendering for large maps
 * - Collision data extraction
 *
 * @example
 * ```typescript
 * const mapData = await TiledLoader.load('/maps/level1.json');
 * const tilemap = new TileMap2D({ data: mapData });
 * scene.add(tilemap);
 *
 * // In update loop
 * tilemap.update(deltaMs);
 * ```
 */
export class TileMap2D extends Group {
  /** Map data */
  readonly data: TileMapData;

  /** Map dimensions in tiles */
  readonly widthInTiles: number;
  readonly heightInTiles: number;

  /** Tile dimensions */
  readonly tileWidth: number;
  readonly tileHeight: number;

  /** Map dimensions in world units */
  readonly widthInPixels: number;
  readonly heightInPixels: number;

  /** Chunk size */
  readonly chunkSize: number;

  /** Tilesets */
  private tilesets: Tileset[] = [];

  /** Tile layers */
  private tileLayers: TileLayer[] = [];

  /** Object layers (for reference) */
  private objectLayers: ObjectLayerData[] = [];

  /** Collision shapes (extracted) */
  private collisionShapes: CollisionShape[] = [];

  /** Bounds */
  private _bounds: Box3;

  constructor(options: TileMap2DOptions) {
    super();

    const { data, chunkSize = 16, enableCollision = true, baseLayer = 0 } = options;

    this.data = data;
    this.widthInTiles = data.width;
    this.heightInTiles = data.height;
    this.tileWidth = data.tileWidth;
    this.tileHeight = data.tileHeight;
    this.widthInPixels = data.width * data.tileWidth;
    this.heightInPixels = data.height * data.tileHeight;
    this.chunkSize = chunkSize;

    // Create bounds
    this._bounds = new Box3(
      new Vector3(0, 0, 0),
      new Vector3(this.widthInPixels, this.heightInPixels, 0)
    );

    // Create tilesets
    for (const tilesetData of data.tilesets) {
      const tileset = new Tileset(tilesetData);
      this.tilesets.push(tileset);
    }

    // Create tile layers
    for (let i = 0; i < data.tileLayers.length; i++) {
      const layerData = data.tileLayers[i];
      const tileset = this.getTilesetForLayer(layerData);

      if (tileset) {
        const layer = new TileLayer(
          layerData,
          tileset,
          this.tileWidth,
          this.tileHeight,
          chunkSize
        );

        // Position layer in Z for proper ordering
        layer.position.z = i * 0.001;

        this.tileLayers.push(layer);
        this.add(layer);
      }
    }

    // Store object layers
    this.objectLayers = data.objectLayers;

    // Extract collision data
    if (enableCollision) {
      this.extractCollisionData();
    }

    this.name = 'TileMap2D';
  }

  /**
   * Get tileset for a layer (based on first non-empty tile).
   */
  private getTilesetForLayer(layerData: TileLayerData): Tileset | null {
    for (const rawGid of layerData.data) {
      if (rawGid === 0) continue;
      const gid = rawGid & 0x1fffffff;
      const tileset = this.getTilesetForGid(gid);
      if (tileset) return tileset;
    }
    return this.tilesets[0] ?? null;
  }

  /**
   * Get tileset containing a GID.
   */
  private getTilesetForGid(gid: number): Tileset | null {
    // Tilesets should be sorted by firstGid descending for correct lookup
    for (let i = this.tilesets.length - 1; i >= 0; i--) {
      if (this.tilesets[i].containsGid(gid)) {
        return this.tilesets[i];
      }
    }
    return null;
  }

  /**
   * Extract collision data from tiles and object layers.
   */
  private extractCollisionData(): void {
    // Extract from tile collision shapes
    for (const layer of this.tileLayers) {
      const layerData = layer.data;
      const { width, height, data } = layerData;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          const rawGid = data[index];
          if (rawGid === 0) continue;

          const gid = rawGid & 0x1fffffff;
          const tileset = this.getTilesetForGid(gid);
          if (!tileset) continue;

          const tile = tileset.getTile(gid);
          if (tile?.collision) {
            // Transform collision shapes to world space
            const worldX = x * this.tileWidth;
            const worldY = y * this.tileHeight;

            for (const shape of tile.collision) {
              this.collisionShapes.push(this.transformShape(shape, worldX, worldY));
            }
          }
        }
      }
    }

    // Extract from object layers named "collision" or similar
    for (const objLayer of this.objectLayers) {
      if (
        objLayer.name.toLowerCase().includes('collision') ||
        objLayer.name.toLowerCase().includes('solid')
      ) {
        for (const obj of objLayer.objects) {
          const shape = this.objectToCollisionShape(obj);
          if (shape) {
            this.collisionShapes.push(shape);
          }
        }
      }
    }
  }

  /**
   * Transform a collision shape to world space.
   */
  private transformShape(
    shape: CollisionShape,
    offsetX: number,
    offsetY: number
  ): CollisionShape {
    switch (shape.type) {
      case 'rect':
        return {
          type: 'rect',
          x: shape.x + offsetX,
          y: shape.y + offsetY,
          width: shape.width,
          height: shape.height,
        };
      case 'ellipse':
        return {
          type: 'ellipse',
          x: shape.x + offsetX,
          y: shape.y + offsetY,
          width: shape.width,
          height: shape.height,
        };
      case 'polygon':
        return {
          type: 'polygon',
          points: shape.points.map((p) => ({
            x: p.x + offsetX,
            y: p.y + offsetY,
          })),
        };
      case 'polyline':
        return {
          type: 'polyline',
          points: shape.points.map((p) => ({
            x: p.x + offsetX,
            y: p.y + offsetY,
          })),
        };
    }
  }

  /**
   * Convert a map object to a collision shape.
   */
  private objectToCollisionShape(obj: TileMapObject): CollisionShape | null {
    if (obj.polygon) {
      return {
        type: 'polygon',
        points: obj.polygon.map((p) => ({
          x: p.x + obj.x,
          y: p.y + obj.y,
        })),
      };
    }
    if (obj.polyline) {
      return {
        type: 'polyline',
        points: obj.polyline.map((p) => ({
          x: p.x + obj.x,
          y: p.y + obj.y,
        })),
      };
    }
    if (obj.ellipse) {
      return {
        type: 'ellipse',
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
      };
    }
    if (obj.point) {
      return null; // Points aren't collision shapes
    }
    // Default to rectangle
    return {
      type: 'rect',
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
    };
  }

  /**
   * Update animated tiles.
   */
  update(deltaMs: number): void {
    for (const layer of this.tileLayers) {
      layer.update(deltaMs);
    }
  }

  /**
   * Get tile layer by name.
   */
  getLayer(name: string): TileLayer | undefined {
    return this.tileLayers.find((l) => l.name === name);
  }

  /**
   * Get tile layer by index.
   */
  getLayerAt(index: number): TileLayer | undefined {
    return this.tileLayers[index];
  }

  /**
   * Get all tile layers.
   */
  getLayers(): readonly TileLayer[] {
    return this.tileLayers;
  }

  /**
   * Get object layer by name.
   */
  getObjectLayer(name: string): ObjectLayerData | undefined {
    return this.objectLayers.find((l) => l.name === name);
  }

  /**
   * Get objects by type.
   */
  getObjectsByType(type: string): TileMapObject[] {
    const objects: TileMapObject[] = [];
    for (const layer of this.objectLayers) {
      for (const obj of layer.objects) {
        if (obj.type === type) {
          objects.push(obj);
        }
      }
    }
    return objects;
  }

  /**
   * Get tile at world position.
   */
  getTileAtWorld(worldX: number, worldY: number, layerIndex: number = 0): number {
    const tileX = Math.floor(worldX / this.tileWidth);
    const tileY = Math.floor(worldY / this.tileHeight);
    return this.tileLayers[layerIndex]?.getTileAt(tileX, tileY) ?? 0;
  }

  /**
   * World position to tile coordinates.
   */
  worldToTile(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: Math.floor(worldX / this.tileWidth),
      y: Math.floor(worldY / this.tileHeight),
    };
  }

  /**
   * Tile coordinates to world position (center of tile).
   */
  tileToWorld(tileX: number, tileY: number): { x: number; y: number } {
    return {
      x: tileX * this.tileWidth + this.tileWidth / 2,
      y: tileY * this.tileHeight + this.tileHeight / 2,
    };
  }

  /**
   * Get collision shapes.
   */
  getCollisionShapes(): readonly CollisionShape[] {
    return this.collisionShapes;
  }

  /**
   * Get map bounds.
   */
  get bounds(): Box3 {
    return this._bounds.clone();
  }

  /**
   * Get tileset by name.
   */
  getTileset(name: string): Tileset | undefined {
    return this.tilesets.find((t) => t.name === name);
  }

  /**
   * Get custom property.
   */
  getProperty<T>(name: string): T | undefined {
    return this.data.properties?.[name] as T | undefined;
  }

  /**
   * Get total chunk count across all layers.
   */
  get totalChunkCount(): number {
    return this.tileLayers.reduce((sum, layer) => sum + layer.chunkCount, 0);
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    for (const layer of this.tileLayers) {
      layer.dispose();
    }
    for (const tileset of this.tilesets) {
      tileset.dispose();
    }
    this.tileLayers = [];
    this.tilesets = [];
  }
}
```

---

### 7. TiledLoader

**packages/core/src/tilemap/TiledLoader.ts:**

```typescript
import { Texture, TextureLoader } from 'three';
import type {
  TileMapData,
  TilesetData,
  TileLayerData,
  ObjectLayerData,
  TileDefinition,
  CollisionShape,
  TileAnimationFrame,
} from './types';

/**
 * Tiled JSON format types.
 */
interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation: 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal';
  renderorder: 'right-down' | 'right-up' | 'left-down' | 'left-up';
  infinite: boolean;
  backgroundcolor?: string;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties?: TiledProperty[];
}

interface TiledLayer {
  id: number;
  name: string;
  type: 'tilelayer' | 'objectgroup' | 'imagelayer' | 'group';
  width?: number;
  height?: number;
  data?: number[];
  chunks?: TiledChunk[];
  objects?: TiledObject[];
  offsetx?: number;
  offsety?: number;
  opacity?: number;
  visible?: boolean;
  parallaxx?: number;
  parallaxy?: number;
  tintcolor?: string;
  properties?: TiledProperty[];
}

interface TiledChunk {
  x: number;
  y: number;
  width: number;
  height: number;
  data: number[];
}

interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  imagewidth: number;
  imageheight: number;
  image: string;
  columns: number;
  tilecount: number;
  spacing?: number;
  margin?: number;
  tiles?: TiledTile[];
  source?: string; // External tileset reference
}

interface TiledTile {
  id: number;
  animation?: TiledAnimation[];
  objectgroup?: { objects: TiledObject[] };
  properties?: TiledProperty[];
}

interface TiledAnimation {
  tileid: number;
  duration: number;
}

interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  gid?: number;
  polygon?: Array<{ x: number; y: number }>;
  polyline?: Array<{ x: number; y: number }>;
  ellipse?: boolean;
  point?: boolean;
  properties?: TiledProperty[];
}

interface TiledProperty {
  name: string;
  type: string;
  value: unknown;
}

/**
 * Loader for Tiled JSON format (.tmj/.json).
 *
 * Supports:
 * - Standard JSON map format
 * - Embedded and external tilesets
 * - Tile layers with data arrays
 * - Infinite maps with chunks
 * - Object layers
 * - Tile animations
 * - Tile collision data
 *
 * @example
 * ```typescript
 * const mapData = await TiledLoader.load('/maps/level1.json');
 * const tilemap = new TileMap2D({ data: mapData });
 * ```
 */
export class TiledLoader {
  private static textureLoader = new TextureLoader();
  private static cache = new Map<string, Promise<TileMapData>>();

  /**
   * Load a Tiled JSON map.
   */
  static load(url: string): Promise<TileMapData> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    const promise = this.loadUncached(url);
    this.cache.set(url, promise);
    return promise;
  }

  /**
   * Load without caching.
   */
  private static async loadUncached(url: string): Promise<TileMapData> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load Tiled map: ${url}`);
    }

    const json: TiledMap = await response.json();
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    return this.parseMap(json, baseUrl);
  }

  /**
   * Parse Tiled JSON map.
   */
  private static async parseMap(json: TiledMap, baseUrl: string): Promise<TileMapData> {
    // Load tilesets (including external ones)
    const tilesets: TilesetData[] = [];
    for (const ts of json.tilesets) {
      const tileset = await this.parseTileset(ts, baseUrl);
      tilesets.push(tileset);
    }

    // Sort tilesets by firstGid for correct lookup
    tilesets.sort((a, b) => a.firstGid - b.firstGid);

    // Parse layers
    const tileLayers: TileLayerData[] = [];
    const objectLayers: ObjectLayerData[] = [];

    for (const layer of json.layers) {
      if (layer.type === 'tilelayer') {
        tileLayers.push(this.parseTileLayer(layer, json));
      } else if (layer.type === 'objectgroup') {
        objectLayers.push(this.parseObjectLayer(layer));
      }
    }

    return {
      width: json.width,
      height: json.height,
      tileWidth: json.tilewidth,
      tileHeight: json.tileheight,
      orientation: json.orientation,
      renderOrder: json.renderorder,
      infinite: json.infinite,
      backgroundColor: json.backgroundcolor
        ? this.parseColor(json.backgroundcolor)
        : undefined,
      tilesets,
      tileLayers,
      objectLayers,
      properties: this.parseProperties(json.properties),
    };
  }

  /**
   * Parse tileset (embedded or external).
   */
  private static async parseTileset(
    ts: TiledTileset,
    baseUrl: string
  ): Promise<TilesetData> {
    // Handle external tileset reference
    if (ts.source) {
      const externalUrl = baseUrl + ts.source;
      const response = await fetch(externalUrl);
      if (!response.ok) {
        throw new Error(`Failed to load external tileset: ${externalUrl}`);
      }
      const externalTs: TiledTileset = await response.json();
      // Merge firstgid from reference
      externalTs.firstgid = ts.firstgid;
      return this.parseTileset(externalTs, baseUrl);
    }

    // Parse tile definitions
    const tiles = new Map<number, TileDefinition>();

    if (ts.tiles) {
      for (const tile of ts.tiles) {
        const def: TileDefinition = {
          id: tile.id,
          uv: this.calculateUV(tile.id, ts),
          properties: this.parseProperties(tile.properties),
        };

        // Parse animation
        if (tile.animation) {
          def.animation = tile.animation.map((a) => ({
            tileId: a.tileid,
            duration: a.duration,
          }));
        }

        // Parse collision (from objectgroup)
        if (tile.objectgroup?.objects) {
          def.collision = tile.objectgroup.objects.map((obj) =>
            this.parseCollisionObject(obj)
          );
        }

        tiles.set(tile.id, def);
      }
    }

    // Load texture
    const textureUrl = baseUrl + ts.image;
    const texture = await this.loadTexture(textureUrl);

    return {
      name: ts.name,
      firstGid: ts.firstgid,
      tileWidth: ts.tilewidth,
      tileHeight: ts.tileheight,
      imageWidth: ts.imagewidth,
      imageHeight: ts.imageheight,
      columns: ts.columns,
      tileCount: ts.tilecount,
      spacing: ts.spacing,
      margin: ts.margin,
      tiles,
      texture,
    };
  }

  /**
   * Calculate UV coordinates for a tile.
   */
  private static calculateUV(
    localId: number,
    ts: TiledTileset
  ): { x: number; y: number; width: number; height: number } {
    const margin = ts.margin ?? 0;
    const spacing = ts.spacing ?? 0;

    const col = localId % ts.columns;
    const row = Math.floor(localId / ts.columns);

    const x = margin + col * (ts.tilewidth + spacing);
    const y = margin + row * (ts.tileheight + spacing);

    return {
      x: x / ts.imagewidth,
      y: y / ts.imageheight,
      width: ts.tilewidth / ts.imagewidth,
      height: ts.tileheight / ts.imageheight,
    };
  }

  /**
   * Parse a collision object from tile.
   */
  private static parseCollisionObject(obj: TiledObject): CollisionShape {
    if (obj.polygon) {
      return {
        type: 'polygon',
        points: obj.polygon.map((p) => ({
          x: p.x + obj.x,
          y: p.y + obj.y,
        })),
      };
    }
    if (obj.polyline) {
      return {
        type: 'polyline',
        points: obj.polyline.map((p) => ({
          x: p.x + obj.x,
          y: p.y + obj.y,
        })),
      };
    }
    if (obj.ellipse) {
      return {
        type: 'ellipse',
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
      };
    }
    return {
      type: 'rect',
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
    };
  }

  /**
   * Parse a tile layer.
   */
  private static parseTileLayer(
    layer: TiledLayer,
    map: TiledMap
  ): TileLayerData {
    let data: Uint32Array;

    if (layer.data) {
      // Standard finite map
      data = new Uint32Array(layer.data);
    } else if (layer.chunks) {
      // Infinite map with chunks
      data = this.parseInfiniteLayer(layer.chunks, map.width, map.height);
    } else {
      data = new Uint32Array(0);
    }

    return {
      name: layer.name,
      id: layer.id,
      width: layer.width ?? map.width,
      height: layer.height ?? map.height,
      data,
      offset:
        layer.offsetx !== undefined || layer.offsety !== undefined
          ? { x: layer.offsetx ?? 0, y: layer.offsety ?? 0 }
          : undefined,
      opacity: layer.opacity,
      visible: layer.visible,
      parallax:
        layer.parallaxx !== undefined || layer.parallaxy !== undefined
          ? { x: layer.parallaxx ?? 1, y: layer.parallaxy ?? 1 }
          : undefined,
      tint: layer.tintcolor ? this.parseColor(layer.tintcolor) : undefined,
      properties: this.parseProperties(layer.properties),
    };
  }

  /**
   * Parse infinite layer chunks into a contiguous array.
   */
  private static parseInfiniteLayer(
    chunks: TiledChunk[],
    mapWidth: number,
    mapHeight: number
  ): Uint32Array {
    const data = new Uint32Array(mapWidth * mapHeight);

    for (const chunk of chunks) {
      for (let y = 0; y < chunk.height; y++) {
        for (let x = 0; x < chunk.width; x++) {
          const srcIndex = y * chunk.width + x;
          const dstX = chunk.x + x;
          const dstY = chunk.y + y;

          if (dstX >= 0 && dstX < mapWidth && dstY >= 0 && dstY < mapHeight) {
            const dstIndex = dstY * mapWidth + dstX;
            data[dstIndex] = chunk.data[srcIndex];
          }
        }
      }
    }

    return data;
  }

  /**
   * Parse an object layer.
   */
  private static parseObjectLayer(layer: TiledLayer): ObjectLayerData {
    return {
      name: layer.name,
      id: layer.id,
      objects:
        layer.objects?.map((obj) => ({
          id: obj.id,
          name: obj.name,
          type: obj.type,
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          rotation: obj.rotation,
          gid: obj.gid,
          polygon: obj.polygon,
          polyline: obj.polyline,
          ellipse: obj.ellipse,
          point: obj.point,
          properties: this.parseProperties(obj.properties),
        })) ?? [],
      offset:
        layer.offsetx !== undefined || layer.offsety !== undefined
          ? { x: layer.offsetx ?? 0, y: layer.offsety ?? 0 }
          : undefined,
      visible: layer.visible,
      properties: this.parseProperties(layer.properties),
    };
  }

  /**
   * Parse Tiled properties array to object.
   */
  private static parseProperties(
    props?: TiledProperty[]
  ): Record<string, unknown> | undefined {
    if (!props || props.length === 0) return undefined;

    const result: Record<string, unknown> = {};
    for (const prop of props) {
      result[prop.name] = prop.value;
    }
    return result;
  }

  /**
   * Parse Tiled color string to number.
   */
  private static parseColor(color: string): number {
    // Tiled uses #AARRGGBB or #RRGGBB format
    if (color.startsWith('#')) {
      color = color.substring(1);
    }
    if (color.length === 8) {
      // AARRGGBB -> RRGGBB (strip alpha)
      color = color.substring(2);
    }
    return parseInt(color, 16);
  }

  /**
   * Load a texture.
   */
  private static loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.generateMipmaps = false;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Clear the cache.
   */
  static clearCache(): void {
    this.cache.clear();
  }
}
```

---

### 8. LDtkLoader

**packages/core/src/tilemap/LDtkLoader.ts:**

```typescript
import { Texture, TextureLoader } from 'three';
import type {
  TileMapData,
  TilesetData,
  TileLayerData,
  ObjectLayerData,
  TileDefinition,
  TileMapObject,
} from './types';

/**
 * LDtk JSON format types.
 */
interface LDtkProject {
  jsonVersion: string;
  worldLayout: 'Free' | 'GridVania' | 'LinearHorizontal' | 'LinearVertical';
  worldGridWidth: number;
  worldGridHeight: number;
  defaultGridSize: number;
  bgColor: string;
  defs: LDtkDefs;
  levels: LDtkLevel[];
}

interface LDtkDefs {
  layers: LDtkLayerDef[];
  entities: LDtkEntityDef[];
  tilesets: LDtkTilesetDef[];
  enums: LDtkEnumDef[];
}

interface LDtkLayerDef {
  uid: number;
  identifier: string;
  type: 'IntGrid' | 'Entities' | 'Tiles' | 'AutoLayer';
  gridSize: number;
  tilesetDefUid?: number;
}

interface LDtkTilesetDef {
  uid: number;
  identifier: string;
  relPath: string;
  pxWid: number;
  pxHei: number;
  tileGridSize: number;
  spacing: number;
  padding: number;
  customData: Array<{ tileId: number; data: string }>;
  enumTags: Array<{ enumValueId: string; tileIds: number[] }>;
}

interface LDtkEntityDef {
  uid: number;
  identifier: string;
  width: number;
  height: number;
  color: string;
  fieldDefs: LDtkFieldDef[];
}

interface LDtkFieldDef {
  uid: number;
  identifier: string;
  type: string;
  defaultValue: unknown;
}

interface LDtkEnumDef {
  uid: number;
  identifier: string;
  values: Array<{ id: string; color: number }>;
}

interface LDtkLevel {
  uid: number;
  identifier: string;
  worldX: number;
  worldY: number;
  pxWid: number;
  pxHei: number;
  bgColor: string;
  layerInstances: LDtkLayerInstance[];
  fieldInstances: LDtkFieldInstance[];
}

interface LDtkLayerInstance {
  __identifier: string;
  __type: 'IntGrid' | 'Entities' | 'Tiles' | 'AutoLayer';
  __cWid: number;
  __cHei: number;
  __gridSize: number;
  __tilesetDefUid?: number;
  __tilesetRelPath?: string;
  levelId: number;
  layerDefUid: number;
  pxOffsetX: number;
  pxOffsetY: number;
  visible: boolean;
  intGridCsv?: number[];
  autoLayerTiles?: LDtkTile[];
  gridTiles?: LDtkTile[];
  entityInstances?: LDtkEntityInstance[];
}

interface LDtkTile {
  px: [number, number];
  src: [number, number];
  f: number; // Flip flags: 0=none, 1=flipX, 2=flipY, 3=both
  t: number; // Tile ID
}

interface LDtkEntityInstance {
  __identifier: string;
  __grid: [number, number];
  __tags: string[];
  __tile?: { tilesetUid: number; x: number; y: number; w: number; h: number };
  defUid: number;
  px: [number, number];
  width: number;
  height: number;
  fieldInstances: LDtkFieldInstance[];
  iid: string;
}

interface LDtkFieldInstance {
  __identifier: string;
  __type: string;
  __value: unknown;
}

/**
 * Loader for LDtk JSON format.
 *
 * Supports:
 * - Single level or multi-level projects
 * - Tile layers (Tiles, AutoLayer, IntGrid)
 * - Entity layers
 * - IntGrid collision data
 * - Tile flip flags
 * - Custom field data
 *
 * @example
 * ```typescript
 * // Load a specific level
 * const mapData = await LDtkLoader.load('/maps/world.ldtk', 'Level_0');
 * const tilemap = new TileMap2D({ data: mapData });
 *
 * // Load entire project (all levels)
 * const allLevels = await LDtkLoader.loadProject('/maps/world.ldtk');
 * ```
 */
export class LDtkLoader {
  private static textureLoader = new TextureLoader();
  private static cache = new Map<string, Promise<LDtkProject>>();

  /**
   * Load a single level from an LDtk project.
   */
  static async load(url: string, levelId?: string | number): Promise<TileMapData> {
    const project = await this.loadProject(url);
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    // Find level
    let level: LDtkLevel | undefined;
    if (levelId === undefined) {
      level = project.levels[0];
    } else if (typeof levelId === 'number') {
      level = project.levels.find((l) => l.uid === levelId);
    } else {
      level = project.levels.find((l) => l.identifier === levelId);
    }

    if (!level) {
      throw new Error(`Level not found: ${levelId}`);
    }

    return this.parseLevel(level, project, baseUrl);
  }

  /**
   * Load the LDtk project file.
   */
  static async loadProject(url: string): Promise<LDtkProject> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    const promise = this.loadProjectUncached(url);
    this.cache.set(url, promise);
    return promise;
  }

  /**
   * Load project without caching.
   */
  private static async loadProjectUncached(url: string): Promise<LDtkProject> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load LDtk project: ${url}`);
    }
    return response.json();
  }

  /**
   * Parse a single level.
   */
  private static async parseLevel(
    level: LDtkLevel,
    project: LDtkProject,
    baseUrl: string
  ): Promise<TileMapData> {
    // Calculate map size in tiles (use first tile layer's grid)
    const firstTileLayer = level.layerInstances?.find(
      (l) => l.__type === 'Tiles' || l.__type === 'AutoLayer'
    );
    const gridSize = firstTileLayer?.__gridSize ?? project.defaultGridSize;
    const widthInTiles = Math.ceil(level.pxWid / gridSize);
    const heightInTiles = Math.ceil(level.pxHei / gridSize);

    // Load tilesets used in this level
    const usedTilesetUids = new Set<number>();
    for (const layer of level.layerInstances ?? []) {
      if (layer.__tilesetDefUid !== undefined) {
        usedTilesetUids.add(layer.__tilesetDefUid);
      }
    }

    const tilesets: TilesetData[] = [];
    let firstGid = 1;

    for (const tsDef of project.defs.tilesets) {
      if (!usedTilesetUids.has(tsDef.uid)) continue;

      const tileset = await this.parseTileset(tsDef, baseUrl, firstGid);
      tilesets.push(tileset);
      firstGid += tileset.tileCount;
    }

    // Parse layers
    const tileLayers: TileLayerData[] = [];
    const objectLayers: ObjectLayerData[] = [];

    if (level.layerInstances) {
      // LDtk layers are ordered back-to-front, so reverse for proper render order
      const layers = [...level.layerInstances].reverse();

      for (const layer of layers) {
        if (layer.__type === 'Tiles' || layer.__type === 'AutoLayer') {
          const tileLayer = this.parseTileLayer(layer, tilesets, project);
          if (tileLayer) {
            tileLayers.push(tileLayer);
          }
        } else if (layer.__type === 'Entities') {
          objectLayers.push(this.parseEntityLayer(layer, project));
        } else if (layer.__type === 'IntGrid') {
          // IntGrid can also have auto-tiles
          if (layer.autoLayerTiles && layer.autoLayerTiles.length > 0) {
            const tileLayer = this.parseTileLayer(layer, tilesets, project);
            if (tileLayer) {
              tileLayers.push(tileLayer);
            }
          }
          // Also create collision layer from IntGrid
          objectLayers.push(this.parseIntGridLayer(layer));
        }
      }
    }

    return {
      width: widthInTiles,
      height: heightInTiles,
      tileWidth: gridSize,
      tileHeight: gridSize,
      orientation: 'orthogonal',
      renderOrder: 'right-down',
      infinite: false,
      backgroundColor: this.parseColor(level.bgColor),
      tilesets,
      tileLayers,
      objectLayers,
      properties: this.parseFieldInstances(level.fieldInstances),
    };
  }

  /**
   * Parse a tileset definition.
   */
  private static async parseTileset(
    def: LDtkTilesetDef,
    baseUrl: string,
    firstGid: number
  ): Promise<TilesetData> {
    const columns = Math.floor(def.pxWid / def.tileGridSize);
    const rows = Math.floor(def.pxHei / def.tileGridSize);
    const tileCount = columns * rows;

    // Load texture
    const textureUrl = baseUrl + def.relPath;
    const texture = await this.loadTexture(textureUrl);

    // Parse tile definitions (custom data, enum tags)
    const tiles = new Map<number, TileDefinition>();

    for (const custom of def.customData) {
      const existing = tiles.get(custom.tileId) ?? {
        id: custom.tileId,
        uv: this.calculateUV(custom.tileId, def),
      };
      existing.properties = { ...(existing.properties ?? {}), customData: custom.data };
      tiles.set(custom.tileId, existing);
    }

    return {
      name: def.identifier,
      firstGid,
      tileWidth: def.tileGridSize,
      tileHeight: def.tileGridSize,
      imageWidth: def.pxWid,
      imageHeight: def.pxHei,
      columns,
      tileCount,
      spacing: def.spacing,
      margin: def.padding,
      tiles,
      texture,
    };
  }

  /**
   * Calculate UV for a tile.
   */
  private static calculateUV(
    tileId: number,
    def: LDtkTilesetDef
  ): { x: number; y: number; width: number; height: number } {
    const columns = Math.floor(def.pxWid / def.tileGridSize);
    const col = tileId % columns;
    const row = Math.floor(tileId / columns);

    const x = def.padding + col * (def.tileGridSize + def.spacing);
    const y = def.padding + row * (def.tileGridSize + def.spacing);

    return {
      x: x / def.pxWid,
      y: y / def.pxHei,
      width: def.tileGridSize / def.pxWid,
      height: def.tileGridSize / def.pxHei,
    };
  }

  /**
   * Parse a tile layer.
   */
  private static parseTileLayer(
    layer: LDtkLayerInstance,
    tilesets: TilesetData[],
    project: LDtkProject
  ): TileLayerData | null {
    // Get tiles (from gridTiles or autoLayerTiles)
    const tiles = layer.gridTiles ?? layer.autoLayerTiles ?? [];
    if (tiles.length === 0) return null;

    // Find tileset
    const tileset = tilesets.find((ts) => {
      const tsDef = project.defs.tilesets.find((d) => d.uid === layer.__tilesetDefUid);
      return tsDef && ts.name === tsDef.identifier;
    });
    if (!tileset) return null;

    // Create data array
    const data = new Uint32Array(layer.__cWid * layer.__cHei);

    for (const tile of tiles) {
      const tileX = Math.floor(tile.px[0] / layer.__gridSize);
      const tileY = Math.floor(tile.px[1] / layer.__gridSize);
      const index = tileY * layer.__cWid + tileX;

      // Convert local tile ID to GID
      let gid = tile.t + tileset.firstGid;

      // Apply flip flags (LDtk uses: 1=flipX, 2=flipY)
      if (tile.f & 1) gid |= 0x80000000; // Flip H
      if (tile.f & 2) gid |= 0x40000000; // Flip V

      data[index] = gid;
    }

    return {
      name: layer.__identifier,
      id: layer.layerDefUid,
      width: layer.__cWid,
      height: layer.__cHei,
      data,
      offset:
        layer.pxOffsetX !== 0 || layer.pxOffsetY !== 0
          ? { x: layer.pxOffsetX, y: layer.pxOffsetY }
          : undefined,
      visible: layer.visible,
    };
  }

  /**
   * Parse an entity layer.
   */
  private static parseEntityLayer(
    layer: LDtkLayerInstance,
    project: LDtkProject
  ): ObjectLayerData {
    const objects: TileMapObject[] = [];

    for (const entity of layer.entityInstances ?? []) {
      objects.push({
        id: parseInt(entity.iid.replace(/-/g, '').substring(0, 8), 16),
        name: entity.__identifier,
        type: entity.__identifier,
        x: entity.px[0],
        y: entity.px[1],
        width: entity.width,
        height: entity.height,
        properties: this.parseFieldInstances(entity.fieldInstances),
      });
    }

    return {
      name: layer.__identifier,
      id: layer.layerDefUid,
      objects,
      offset:
        layer.pxOffsetX !== 0 || layer.pxOffsetY !== 0
          ? { x: layer.pxOffsetX, y: layer.pxOffsetY }
          : undefined,
      visible: layer.visible,
    };
  }

  /**
   * Parse IntGrid layer as collision data.
   */
  private static parseIntGridLayer(layer: LDtkLayerInstance): ObjectLayerData {
    const objects: TileMapObject[] = [];
    const gridCsv = layer.intGridCsv ?? [];

    // Create rectangle objects for contiguous IntGrid values > 0
    // (Simple approach - could be optimized with rect merging)
    let id = 0;
    for (let y = 0; y < layer.__cHei; y++) {
      for (let x = 0; x < layer.__cWid; x++) {
        const index = y * layer.__cWid + x;
        const value = gridCsv[index];

        if (value > 0) {
          objects.push({
            id: id++,
            name: `intgrid_${value}`,
            type: 'collision',
            x: x * layer.__gridSize,
            y: y * layer.__gridSize,
            width: layer.__gridSize,
            height: layer.__gridSize,
            properties: { intGridValue: value },
          });
        }
      }
    }

    return {
      name: layer.__identifier + '_collision',
      id: layer.layerDefUid,
      objects,
      visible: false,
    };
  }

  /**
   * Parse field instances to properties.
   */
  private static parseFieldInstances(
    fields?: LDtkFieldInstance[]
  ): Record<string, unknown> | undefined {
    if (!fields || fields.length === 0) return undefined;

    const result: Record<string, unknown> = {};
    for (const field of fields) {
      result[field.__identifier] = field.__value;
    }
    return result;
  }

  /**
   * Parse LDtk color string.
   */
  private static parseColor(color: string): number {
    if (color.startsWith('#')) {
      color = color.substring(1);
    }
    return parseInt(color, 16);
  }

  /**
   * Load a texture.
   */
  private static loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.generateMipmaps = false;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Get all level identifiers from a project.
   */
  static async getLevelIds(url: string): Promise<string[]> {
    const project = await this.loadProject(url);
    return project.levels.map((l) => l.identifier);
  }

  /**
   * Clear the cache.
   */
  static clearCache(): void {
    this.cache.clear();
  }
}
```

---

### 9. Exports

**packages/core/src/tilemap/index.ts:**

```typescript
export { TileMap2D } from './TileMap2D';
export { Tileset } from './Tileset';
export { TileLayer } from './TileLayer';
export { TileChunk } from './TileChunk';
export { TileChunkMaterial } from './TileChunkMaterial';
export { TiledLoader } from './TiledLoader';
export { LDtkLoader } from './LDtkLoader';
export type {
  TileMapData,
  TileMap2DOptions,
  TilesetData,
  TileLayerData,
  ObjectLayerData,
  TileMapObject,
  TileDefinition,
  TileAnimationFrame,
  CollisionShape,
  ChunkCoord,
  TileInstance,
} from './types';
```

**packages/core/src/index.ts (updated):**

```typescript
export const VERSION = '0.5.0';

// Sprites
export * from './sprites';

// Animation
export * from './animation';

// Pipeline
export * from './pipeline';

// Tilemaps
export * from './tilemap';

// Materials
export * from './materials';

// Loaders
export * from './loaders';
```

---

### 10. React Integration

**packages/react/src/components/TileMap.tsx:**

```tsx
import React, { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { TileMap2D, type TileMapData, type TileMap2DOptions } from '@three-flatland/core';

export interface TileMapProps extends Omit<TileMap2DOptions, 'data'> {
  /** Tilemap data */
  data: TileMapData;
  /** Position */
  position?: [number, number, number];
  /** Scale */
  scale?: number | [number, number, number];
  /** Visible */
  visible?: boolean;
}

/**
 * React Three Fiber component for TileMap2D.
 */
export function TileMap({
  data,
  chunkSize,
  enableCollision,
  pixelPerfect,
  baseLayer,
  position,
  scale,
  visible = true,
}: TileMapProps) {
  const tilemapRef = useRef<TileMap2D | null>(null);

  // Create tilemap instance
  const tilemap = useMemo(() => {
    return new TileMap2D({
      data,
      chunkSize,
      enableCollision,
      pixelPerfect,
      baseLayer,
    });
  }, [data, chunkSize, enableCollision, pixelPerfect, baseLayer]);

  // Update ref
  useEffect(() => {
    tilemapRef.current = tilemap;
    return () => {
      tilemap.dispose();
    };
  }, [tilemap]);

  // Update animations
  useFrame((_, delta) => {
    tilemapRef.current?.update(delta * 1000);
  });

  return (
    <primitive
      object={tilemap}
      position={position}
      scale={scale}
      visible={visible}
    />
  );
}
```

**packages/react/src/hooks/useTilemap.ts:**

```typescript
import { useMemo, useEffect } from 'react';
import { TileMap2D, TiledLoader, LDtkLoader, type TileMapData } from '@three-flatland/core';

/**
 * Hook to load and manage a tilemap.
 */
export function useTilemap(
  url: string,
  options?: {
    format?: 'tiled' | 'ldtk';
    levelId?: string | number;
    chunkSize?: number;
  }
): TileMap2D | null {
  const { format = 'tiled', levelId, chunkSize } = options ?? {};

  // Load map data
  const mapDataPromise = useMemo(() => {
    if (format === 'ldtk') {
      return LDtkLoader.load(url, levelId);
    }
    return TiledLoader.load(url);
  }, [url, format, levelId]);

  // This would need to be used with Suspense in practice
  // For simplicity, showing the pattern
  const mapData = use(mapDataPromise);

  // Create tilemap
  const tilemap = useMemo(() => {
    if (!mapData) return null;
    return new TileMap2D({ data: mapData, chunkSize });
  }, [mapData, chunkSize]);

  // Cleanup
  useEffect(() => {
    return () => {
      tilemap?.dispose();
    };
  }, [tilemap]);

  return tilemap;
}

// React's use() hook (or similar pattern with Suspense)
function use<T>(promise: Promise<T>): T {
  // This is a simplified implementation
  // In practice, use React.use() or a library like react-query
  throw promise;
}
```

---

### 11. Tests

**packages/core/src/tilemap/TileMap2D.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Texture } from 'three';
import { TileMap2D } from './TileMap2D';
import type { TileMapData, TilesetData, TileLayerData } from './types';

describe('TileMap2D', () => {
  let mockTexture: Texture;
  let mockTileset: TilesetData;
  let mockLayer: TileLayerData;
  let mockMapData: TileMapData;

  beforeEach(() => {
    mockTexture = new Texture();
    mockTexture.image = { width: 128, height: 128 };

    mockTileset = {
      name: 'test_tileset',
      firstGid: 1,
      tileWidth: 16,
      tileHeight: 16,
      imageWidth: 128,
      imageHeight: 128,
      columns: 8,
      tileCount: 64,
      tiles: new Map(),
      texture: mockTexture,
    };

    mockLayer = {
      name: 'test_layer',
      id: 1,
      width: 10,
      height: 10,
      data: new Uint32Array(100).fill(1),
      visible: true,
    };

    mockMapData = {
      width: 10,
      height: 10,
      tileWidth: 16,
      tileHeight: 16,
      orientation: 'orthogonal',
      renderOrder: 'right-down',
      infinite: false,
      tilesets: [mockTileset],
      tileLayers: [mockLayer],
      objectLayers: [],
    };
  });

  it('should create a tilemap with correct dimensions', () => {
    const tilemap = new TileMap2D({ data: mockMapData });

    expect(tilemap.widthInTiles).toBe(10);
    expect(tilemap.heightInTiles).toBe(10);
    expect(tilemap.widthInPixels).toBe(160);
    expect(tilemap.heightInPixels).toBe(160);
  });

  it('should create tile layers', () => {
    const tilemap = new TileMap2D({ data: mockMapData });

    expect(tilemap.getLayers().length).toBe(1);
    expect(tilemap.getLayer('test_layer')).toBeDefined();
  });

  it('should convert world to tile coordinates', () => {
    const tilemap = new TileMap2D({ data: mockMapData });

    const tile = tilemap.worldToTile(24, 40);
    expect(tile.x).toBe(1);
    expect(tile.y).toBe(2);
  });

  it('should convert tile to world coordinates', () => {
    const tilemap = new TileMap2D({ data: mockMapData });

    const world = tilemap.tileToWorld(1, 2);
    expect(world.x).toBe(24); // 1 * 16 + 8
    expect(world.y).toBe(40); // 2 * 16 + 8
  });

  it('should get tile at world position', () => {
    const tilemap = new TileMap2D({ data: mockMapData });

    const gid = tilemap.getTileAtWorld(24, 40);
    expect(gid).toBe(1);
  });

  it('should respect chunk size', () => {
    const tilemap = new TileMap2D({ data: mockMapData, chunkSize: 4 });

    expect(tilemap.chunkSize).toBe(4);
    // 10x10 tiles with 4x4 chunks = 3x3 = 9 chunks
    expect(tilemap.totalChunkCount).toBeGreaterThan(0);
  });

  it('should dispose resources', () => {
    const tilemap = new TileMap2D({ data: mockMapData });
    tilemap.dispose();

    expect(tilemap.getLayers().length).toBe(0);
  });
});
```

**packages/core/src/tilemap/Tileset.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Texture } from 'three';
import { Tileset } from './Tileset';
import type { TilesetData } from './types';

describe('Tileset', () => {
  let mockTexture: Texture;
  let tilesetData: TilesetData;

  beforeEach(() => {
    mockTexture = new Texture();
    mockTexture.image = { width: 128, height: 128 };

    tilesetData = {
      name: 'test_tileset',
      firstGid: 1,
      tileWidth: 16,
      tileHeight: 16,
      imageWidth: 128,
      imageHeight: 128,
      columns: 8,
      tileCount: 64,
      tiles: new Map(),
      texture: mockTexture,
    };
  });

  it('should create tileset with correct properties', () => {
    const tileset = new Tileset(tilesetData);

    expect(tileset.name).toBe('test_tileset');
    expect(tileset.firstGid).toBe(1);
    expect(tileset.tileWidth).toBe(16);
    expect(tileset.columns).toBe(8);
    expect(tileset.tileCount).toBe(64);
  });

  it('should check if GID belongs to tileset', () => {
    const tileset = new Tileset(tilesetData);

    expect(tileset.containsGid(1)).toBe(true);
    expect(tileset.containsGid(64)).toBe(true);
    expect(tileset.containsGid(65)).toBe(false);
    expect(tileset.containsGid(0)).toBe(false);
  });

  it('should calculate UV coordinates correctly', () => {
    const tileset = new Tileset(tilesetData);

    // First tile (GID 1, local 0)
    const uv0 = tileset.getUV(1);
    expect(uv0.x).toBe(0);
    expect(uv0.y).toBe(0);
    expect(uv0.width).toBe(16 / 128);
    expect(uv0.height).toBe(16 / 128);

    // Second row, first column (GID 9, local 8)
    const uv8 = tileset.getUV(9);
    expect(uv8.x).toBe(0);
    expect(uv8.y).toBe(16 / 128);
  });

  it('should handle animated tiles', () => {
    const animatedTilesetData: TilesetData = {
      ...tilesetData,
      tiles: new Map([
        [
          0,
          {
            id: 0,
            uv: { x: 0, y: 0, width: 0.125, height: 0.125 },
            animation: [
              { tileId: 0, duration: 100 },
              { tileId: 1, duration: 100 },
              { tileId: 2, duration: 100 },
            ],
          },
        ],
      ]),
    };

    const tileset = new Tileset(animatedTilesetData);

    expect(tileset.isAnimated(1)).toBe(true);
    expect(tileset.isAnimated(2)).toBe(false);

    const animation = tileset.getAnimation(1);
    expect(animation).toHaveLength(3);
    expect(animation![0].duration).toBe(100);
  });
});
```

**packages/core/src/tilemap/TiledLoader.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TiledLoader } from './TiledLoader';

describe('TiledLoader', () => {
  beforeEach(() => {
    TiledLoader.clearCache();
  });

  it.todo('should load a basic Tiled JSON map');
  it.todo('should parse tile layers');
  it.todo('should parse object layers');
  it.todo('should handle external tilesets');
  it.todo('should parse tile animations');
  it.todo('should parse tile collision shapes');
  it.todo('should handle infinite maps with chunks');
  it.todo('should cache loaded maps');
});
```

**packages/core/src/tilemap/LDtkLoader.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LDtkLoader } from './LDtkLoader';

describe('LDtkLoader', () => {
  beforeEach(() => {
    LDtkLoader.clearCache();
  });

  it.todo('should load a basic LDtk project');
  it.todo('should parse tile layers');
  it.todo('should parse entity layers');
  it.todo('should parse IntGrid layers');
  it.todo('should handle tile flip flags');
  it.todo('should parse field instances');
  it.todo('should load specific level by identifier');
  it.todo('should cache loaded projects');
});
```

---

## Acceptance Criteria

- [ ] `TileMap2D` renders tilemaps correctly
- [ ] `Tileset` handles tile UV calculations and animations
- [ ] `TiledLoader` loads Tiled JSON format (.tmj/.json)
- [ ] `LDtkLoader` loads LDtk JSON format
- [ ] Multiple tile layers render with correct z-ordering
- [ ] Animated tiles update correctly over time
- [ ] Collision data is extracted from tiles and objects
- [ ] Chunked rendering works for large maps (1000x1000+)
- [ ] Frustum culling works per-chunk
- [ ] Tile flip flags (H, V, D) work correctly
- [ ] Object layers provide spawn points and triggers
- [ ] Performance: 100,000+ tiles at 60fps
- [ ] React integration works (`<TileMap />` component)
- [ ] All tests pass
- [ ] TypeScript types are complete

---

## Example Usage

**Vanilla Three.js:**

```typescript
import * as THREE from 'three/webgpu';
import { TileMap2D, TiledLoader, LDtkLoader } from '@three-flatland/core';

// Setup
const renderer = new THREE.WebGPURenderer();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);

// Load Tiled map
const mapData = await TiledLoader.load('/maps/level1.json');
const tilemap = new TileMap2D({
  data: mapData,
  chunkSize: 16,
  enableCollision: true,
});
scene.add(tilemap);

// Get spawn points
const spawns = tilemap.getObjectsByType('spawn_point');
console.log('Spawn points:', spawns);

// Get collision shapes for physics
const collisions = tilemap.getCollisionShapes();
console.log('Collision shapes:', collisions.length);

// Get specific layer
const groundLayer = tilemap.getLayer('ground');
console.log('Ground layer chunks:', groundLayer?.chunkCount);

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update animated tiles
  tilemap.update(16); // deltaMs

  renderer.render(scene, camera);
}
animate();

// Alternative: Load LDtk map
const ldtkData = await LDtkLoader.load('/maps/world.ldtk', 'Level_0');
const ldtkMap = new TileMap2D({ data: ldtkData });
scene.add(ldtkMap);
```

**React Three Fiber:**

```tsx
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { TileMap, useTilemap } from '@three-flatland/react';
import { TiledLoader } from '@three-flatland/core';

// Resource for Suspense
const mapResource = TiledLoader.load('/maps/level1.json');

function Level() {
  // Using resource pattern
  const mapData = use(mapResource);

  return (
    <TileMap
      data={mapData}
      chunkSize={16}
      enableCollision={true}
      position={[0, 0, 0]}
    />
  );
}

function Player() {
  // Access tilemap collision in game logic
  // ...
  return <sprite2D /* ... */ />;
}

export default function Game() {
  return (
    <Canvas orthographic camera={{ zoom: 2, position: [400, 300, 100] }}>
      <Suspense fallback={null}>
        <Level />
        <Player />
      </Suspense>
    </Canvas>
  );
}
```

**Multiple Levels (LDtk):**

```typescript
import { LDtkLoader, TileMap2D } from '@three-flatland/core';

// Get all level IDs
const levelIds = await LDtkLoader.getLevelIds('/maps/world.ldtk');
console.log('Available levels:', levelIds);

// Load a specific level
const level1Data = await LDtkLoader.load('/maps/world.ldtk', 'Level_1');
const level1 = new TileMap2D({ data: level1Data });

// Transition to another level
async function loadLevel(levelId: string) {
  const newData = await LDtkLoader.load('/maps/world.ldtk', levelId);
  const newMap = new TileMap2D({ data: newData });
  // Swap in scene...
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Format compatibility | Medium | High | Test with many sample maps, handle edge cases |
| Large map performance | Medium | High | Chunked rendering, view culling, LOD |
| Memory usage | Medium | Medium | Lazy chunk loading, dispose unused chunks |
| Animated tile batching | Low | Medium | Batch animated tiles by animation, not per-tile |
| Complex collision shapes | Low | Medium | Simplify to rectangles, provide raw data for physics engines |

---

## Dependencies for Next Milestone

M6 (TSL Nodes Part 2) can build on tilemap rendering:
- Tile-based lighting effects
- Tilemap post-processing
- Per-tile effects

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 4 |
| Tileset class | 4 |
| TileChunk + material (TSL) | 8 |
| TileLayer class | 6 |
| TileMap2D class | 8 |
| TiledLoader | 10 |
| LDtkLoader | 10 |
| Collision extraction | 4 |
| React integration | 4 |
| Tests | 6 |
| Documentation | 4 |
| Performance optimization | 8 |
| **Total** | **76 hours** (~3 weeks) |

---

*End of M5: Tilemaps*
