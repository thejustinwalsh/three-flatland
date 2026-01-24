# M1: Core Sprites

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 2 weeks |
| **Dependencies** | M0 (Project Setup) |
| **Outputs** | Sprite2D class, Sprite2DMaterial (TSL), SpriteSheetLoader |
| **Risk Level** | Medium (first TSL implementation) |

---

## Objectives

1. Implement `Sprite2D` class extending THREE.Mesh
2. Create `Sprite2DMaterial` using TSL (Three.js Shading Language)
3. Implement sprite frame system for spritesheets
4. Create `SpriteSheetLoader` for JSON Hash and JSON Array formats
5. Support anchor points, tint, alpha, flip
6. Establish patterns for all future classes

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SPRITE ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Sprite2D (extends THREE.Mesh)                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • geometry: PlaneGeometry (1x1, scaled by sprite size)             │   │
│   │  • material: Sprite2DMaterial (TSL-based)                           │   │
│   │  • frame: SpriteFrame (UV coordinates in atlas)                     │   │
│   │  • anchor: Vector2 (pivot point, 0-1)                               │   │
│   │  • tint: Color                                                      │   │
│   │  • alpha: number                                                    │   │
│   │  • flipX/flipY: boolean                                             │   │
│   │  • layer: number (for render pipeline)                              │   │
│   │  • zIndex: number (within layer)                                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ uses                                   │
│                                    ▼                                        │
│   Sprite2DMaterial (extends MeshBasicNodeMaterial)                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  TSL Nodes:                                                         │   │
│   │  • colorNode: texture sampling + tint + alpha                       │   │
│   │  • alphaTestNode: discard transparent pixels                        │   │
│   │  Uniforms:                                                          │   │
│   │  • frameUV: vec4 (x, y, width, height in atlas)                     │   │
│   │  • tintColor: vec3                                                  │   │
│   │  • alphaValue: float                                                │   │
│   │  • flipFlags: vec2                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/sprites/types.ts:**

```typescript
import type { Texture, Color, Vector2 } from 'three';

/**
 * Represents a single frame in a spritesheet atlas.
 */
export interface SpriteFrame {
  /** Frame name/identifier */
  name: string;
  /** X position in atlas (normalized 0-1) */
  x: number;
  /** Y position in atlas (normalized 0-1) */
  y: number;
  /** Width in atlas (normalized 0-1) */
  width: number;
  /** Height in atlas (normalized 0-1) */
  height: number;
  /** Original frame width in pixels */
  sourceWidth: number;
  /** Original frame height in pixels */
  sourceHeight: number;
  /** Pivot point (0-1) */
  pivot?: { x: number; y: number };
  /** Is frame rotated 90° in atlas? */
  rotated?: boolean;
  /** Is frame trimmed? */
  trimmed?: boolean;
  /** Trim offset if trimmed */
  trimOffset?: { x: number; y: number; width: number; height: number };
}

/**
 * Options for creating a Sprite2D.
 */
export interface Sprite2DOptions {
  /** Texture to use (required) */
  texture: Texture;
  /** Initial frame (optional, defaults to full texture) */
  frame?: SpriteFrame;
  /** Anchor/pivot point (0-1), default [0.5, 0.5] (center) */
  anchor?: Vector2 | [number, number];
  /** Tint color, default white */
  tint?: Color | string | number;
  /** Opacity 0-1, default 1 */
  alpha?: number;
  /** Flip horizontally */
  flipX?: boolean;
  /** Flip vertically */
  flipY?: boolean;
  /** Render layer (for Renderer2D) */
  layer?: number;
  /** Z-index within layer */
  zIndex?: number;
  /** Pixel-perfect rendering (snap to pixels) */
  pixelPerfect?: boolean;
  /** Custom material (sprites with same material instance batch together) */
  material?: Sprite2DMaterial;
}

/**
 * Spritesheet data structure.
 */
export interface SpriteSheet {
  /** The texture atlas */
  texture: Texture;
  /** Map of frame name to frame data */
  frames: Map<string, SpriteFrame>;
  /** Atlas width in pixels */
  width: number;
  /** Atlas height in pixels */
  height: number;
  /** Get a frame by name */
  getFrame(name: string): SpriteFrame;
  /** Get all frame names */
  getFrameNames(): string[];
}

/**
 * JSON Hash format (TexturePacker default).
 */
export interface SpriteSheetJSONHash {
  frames: {
    [name: string]: {
      frame: { x: number; y: number; w: number; h: number };
      rotated: boolean;
      trimmed: boolean;
      spriteSourceSize: { x: number; y: number; w: number; h: number };
      sourceSize: { w: number; h: number };
      pivot?: { x: number; y: number };
    };
  };
  meta: {
    image: string;
    size: { w: number; h: number };
    scale: string;
  };
}

/**
 * JSON Array format.
 */
export interface SpriteSheetJSONArray {
  frames: Array<{
    filename: string;
    frame: { x: number; y: number; w: number; h: number };
    rotated: boolean;
    trimmed: boolean;
    spriteSourceSize: { x: number; y: number; w: number; h: number };
    sourceSize: { w: number; h: number };
    pivot?: { x: number; y: number };
  }>;
  meta: {
    image: string;
    size: { w: number; h: number };
    scale: string;
  };
}
```

---

### 2. Sprite2DMaterial (TSL)

**packages/core/src/materials/Sprite2DMaterial.ts:**

```typescript
import {
  MeshBasicNodeMaterial,
  uniform,
  texture,
  uv,
  vec2,
  vec4,
  Fn,
  If,
  Discard,
  select,
} from 'three/tsl';
import { Color, Vector4, Texture, FrontSide, NormalBlending } from 'three';

export interface Sprite2DMaterialOptions {
  map?: Texture;
  transparent?: boolean;
  alphaTest?: number;
}

/**
 * TSL-based material for 2D sprites.
 *
 * Supports:
 * - Texture atlas frame sampling
 * - Tint color
 * - Alpha/opacity
 * - Flip X/Y
 * - Alpha testing
 */
export class Sprite2DMaterial extends MeshBasicNodeMaterial {
  // Uniforms exposed for animation/updates
  readonly frameUV = uniform(new Vector4(0, 0, 1, 1));  // x, y, w, h
  readonly tintColor = uniform(new Color(0xffffff));
  readonly alphaValue = uniform(1.0);
  readonly flipFlags = uniform(new Vector2(1, 1));  // 1 or -1

  private _map: Texture | null = null;

  constructor(options: Sprite2DMaterialOptions = {}) {
    super();

    this.transparent = options.transparent ?? true;
    this.depthWrite = false;
    this.depthTest = true;
    this.side = FrontSide;
    this.blending = NormalBlending;

    if (options.map) {
      this.map = options.map;
    }

    this.setupNodes();
  }

  private setupNodes() {
    // Color node: sample texture with frame UV, apply tint and alpha
    this.colorNode = Fn(() => {
      // Get base UV
      let spriteUV = uv();

      // Apply flip
      spriteUV = vec2(
        select(this.flipFlags.x.greaterThan(0), spriteUV.x, float(1).sub(spriteUV.x)),
        select(this.flipFlags.y.greaterThan(0), spriteUV.y, float(1).sub(spriteUV.y))
      );

      // Remap to frame in atlas
      const atlasUV = spriteUV
        .mul(vec2(this.frameUV.z, this.frameUV.w))
        .add(vec2(this.frameUV.x, this.frameUV.y));

      // Sample texture
      const texColor = texture(this._map!, atlasUV);

      // Alpha test - discard fully transparent pixels
      If(texColor.a.lessThan(0.01), () => {
        Discard();
      });

      // Apply tint and alpha
      return vec4(
        texColor.rgb.mul(this.tintColor),
        texColor.a.mul(this.alphaValue)
      );
    })();
  }

  get map(): Texture | null {
    return this._map;
  }

  set map(value: Texture | null) {
    this._map = value;
    if (value) {
      // Rebuild nodes with new texture
      this.setupNodes();
      this.needsUpdate = true;
    }
  }

  /**
   * Set the frame UV coordinates.
   */
  setFrame(x: number, y: number, width: number, height: number) {
    this.frameUV.value.set(x, y, width, height);
  }

  /**
   * Set tint color.
   */
  setTint(color: Color | string | number) {
    if (color instanceof Color) {
      this.tintColor.value.copy(color);
    } else {
      this.tintColor.value.set(color);
    }
  }

  /**
   * Set alpha/opacity.
   */
  setAlpha(alpha: number) {
    this.alphaValue.value = alpha;
  }

  /**
   * Set flip flags.
   */
  setFlip(flipX: boolean, flipY: boolean) {
    this.flipFlags.value.set(flipX ? -1 : 1, flipY ? -1 : 1);
  }

  dispose() {
    super.dispose();
  }
}
```

---

### 3. Sprite2D Class

**packages/core/src/sprites/Sprite2D.ts:**

```typescript
import {
  Mesh,
  PlaneGeometry,
  Vector2,
  Vector3,
  Color,
  Texture,
  Matrix4,
} from 'three';
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial';
import type { Sprite2DOptions, SpriteFrame } from './types';

// Shared geometry for all sprites (memory optimization)
const sharedGeometry = new PlaneGeometry(1, 1);

/**
 * A 2D sprite for use with three-flatland's render pipeline.
 *
 * Extends THREE.Mesh, so it works with standard Three.js scene graph
 * but designed for batched 2D rendering with explicit z-ordering.
 *
 * @example
 * ```typescript
 * const sprite = new Sprite2D({
 *   texture: myTexture,
 *   frame: spriteSheet.getFrame('player_idle'),
 *   anchor: [0.5, 1], // Bottom center
 * });
 * sprite.position.set(100, 200, 0);
 * sprite.layer = Layers.ENTITIES;
 * sprite.zIndex = sprite.position.y; // Y-sort
 * scene.add(sprite);
 * ```
 */
export class Sprite2D extends Mesh<PlaneGeometry, Sprite2DMaterial> {
  /** Render layer (primary sort key for Renderer2D) */
  layer: number = 0;

  /** Z-index within layer (secondary sort key) */
  zIndex: number = 0;

  /**
   * Per-instance attribute values for TSL-native batching.
   * These are defined by the material and read during batch rendering.
   *
   * @see Sprite2DMaterial.addInstanceFloat() for defining attributes
   * @see M3: 2D Render Pipeline for batching implementation
   */
  private instanceValues: Map<string, number | number[]> = new Map();

  /** Anchor point (0-1), affects positioning */
  private _anchor: Vector2 = new Vector2(0.5, 0.5);

  /** Current frame */
  private _frame: SpriteFrame | null = null;

  /** Source texture */
  private _texture: Texture;

  /** Flip state */
  private _flipX: boolean = false;
  private _flipY: boolean = false;

  /** Pixel-perfect mode */
  pixelPerfect: boolean = false;

  constructor(options: Sprite2DOptions) {
    // Create material
    const material = new Sprite2DMaterial({
      map: options.texture,
      transparent: true,
    });

    // Use shared geometry
    super(sharedGeometry, material);

    this._texture = options.texture;

    // Apply options
    if (options.frame) {
      this.setFrame(options.frame);
    } else {
      // Default to full texture
      this._frame = {
        name: '__full__',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        sourceWidth: options.texture.image?.width ?? 1,
        sourceHeight: options.texture.image?.height ?? 1,
      };
      this.updateSize();
    }

    if (options.anchor) {
      this.setAnchor(
        Array.isArray(options.anchor) ? options.anchor[0] : options.anchor.x,
        Array.isArray(options.anchor) ? options.anchor[1] : options.anchor.y
      );
    }

    if (options.tint !== undefined) {
      this.tint = options.tint;
    }

    if (options.alpha !== undefined) {
      this.alpha = options.alpha;
    }

    if (options.flipX !== undefined) {
      this._flipX = options.flipX;
    }

    if (options.flipY !== undefined) {
      this._flipY = options.flipY;
    }

    if (options.layer !== undefined) {
      this.layer = options.layer;
    }

    if (options.zIndex !== undefined) {
      this.zIndex = options.zIndex;
    }

    if (options.pixelPerfect !== undefined) {
      this.pixelPerfect = options.pixelPerfect;
    }

    this.updateFlip();

    // Frustum culling friendly name
    this.name = 'Sprite2D';
    this.frustumCulled = true;
  }

  /**
   * Get the current texture.
   */
  get texture(): Texture {
    return this._texture;
  }

  /**
   * Set a new texture.
   */
  set texture(value: Texture) {
    this._texture = value;
    this.material.map = value;
  }

  /**
   * Get the current frame.
   */
  get frame(): SpriteFrame | null {
    return this._frame;
  }

  /**
   * Set the current frame.
   */
  setFrame(frame: SpriteFrame): this {
    this._frame = frame;
    this.material.setFrame(frame.x, frame.y, frame.width, frame.height);
    this.updateSize();
    return this;
  }

  /**
   * Get the anchor point.
   */
  get anchor(): Vector2 {
    return this._anchor.clone();
  }

  /**
   * Set the anchor point (0-1).
   * (0, 0) = top-left, (0.5, 0.5) = center, (0.5, 1) = bottom-center
   */
  setAnchor(x: number, y: number): this {
    this._anchor.set(x, y);
    this.updateAnchor();
    return this;
  }

  /**
   * Get tint color.
   */
  get tint(): Color {
    return this.material.tintColor.value.clone();
  }

  /**
   * Set tint color.
   */
  set tint(value: Color | string | number) {
    this.material.setTint(value);
  }

  /**
   * Get alpha/opacity.
   */
  get alpha(): number {
    return this.material.alphaValue.value;
  }

  /**
   * Set alpha/opacity (0-1).
   */
  set alpha(value: number) {
    this.material.setAlpha(value);
  }

  /**
   * Get flipX state.
   */
  get flipX(): boolean {
    return this._flipX;
  }

  /**
   * Set flipX state.
   */
  set flipX(value: boolean) {
    this._flipX = value;
    this.updateFlip();
  }

  /**
   * Get flipY state.
   */
  get flipY(): boolean {
    return this._flipY;
  }

  /**
   * Set flipY state.
   */
  set flipY(value: boolean) {
    this._flipY = value;
    this.updateFlip();
  }

  /**
   * Flip the sprite.
   */
  flip(horizontal: boolean, vertical: boolean): this {
    this._flipX = horizontal;
    this._flipY = vertical;
    this.updateFlip();
    return this;
  }

  /**
   * Get the width of the sprite in world units.
   */
  get width(): number {
    return this._frame?.sourceWidth ?? 1;
  }

  /**
   * Get the height of the sprite in world units.
   */
  get height(): number {
    return this._frame?.sourceHeight ?? 1;
  }

  /**
   * Update the mesh scale based on frame size.
   */
  private updateSize() {
    if (this._frame) {
      this.scale.set(this._frame.sourceWidth, this._frame.sourceHeight, 1);
    }
  }

  /**
   * Update geometry offset based on anchor.
   */
  private updateAnchor() {
    // Offset position to account for anchor
    // This is done via the geometry's position attribute offset
    // or by adjusting the mesh's local matrix
    const offsetX = 0.5 - this._anchor.x;
    const offsetY = 0.5 - this._anchor.y;

    // Apply offset to geometry (or use matrix)
    // For simplicity, we'll adjust using a matrix
    this.geometry = sharedGeometry.clone();
    this.geometry.translate(offsetX, offsetY, 0);
  }

  /**
   * Update flip flags on material.
   */
  private updateFlip() {
    this.material.setFlip(this._flipX, this._flipY);
  }

  /**
   * Get world position (convenience method).
   */
  getWorldPosition2D(): Vector2 {
    const worldPos = new Vector3();
    super.getWorldPosition(worldPos);
    return new Vector2(worldPos.x, worldPos.y);
  }

  // ============================================
  // TSL-NATIVE INSTANCE ATTRIBUTE SYSTEM
  // ============================================

  /**
   * Set a per-instance attribute value.
   * The attribute must be defined on the material via addInstanceFloat(), etc.
   *
   * @example
   * ```typescript
   * // Material defines the attribute
   * material.addInstanceFloat('dissolve', 0);
   *
   * // Sprite sets its value
   * sprite.setInstanceValue('dissolve', 0.5);
   * ```
   */
  setInstanceValue(name: string, value: number | number[]): this {
    this.instanceValues.set(name, value);
    return this;
  }

  /**
   * Get a per-instance attribute value.
   */
  getInstanceValue(name: string): number | number[] | undefined {
    return this.instanceValues.get(name);
  }

  /**
   * Get all instance values (for SpriteBatch).
   */
  getInstanceValues(): Map<string, number | number[]> {
    return this.instanceValues;
  }

  /**
   * Clear all instance values (reset to material defaults).
   */
  clearInstanceValues(): this {
    this.instanceValues.clear();
    return this;
  }

  /**
   * Dispose of resources.
   */
  dispose() {
    this.material.dispose();
    // Don't dispose shared geometry
  }

  /**
   * Clone the sprite.
   */
  clone(): Sprite2D {
    const cloned = new Sprite2D({
      texture: this._texture,
      frame: this._frame ?? undefined,
      anchor: this._anchor,
      tint: this.tint,
      alpha: this.alpha,
      flipX: this._flipX,
      flipY: this._flipY,
      layer: this.layer,
      zIndex: this.zIndex,
      pixelPerfect: this.pixelPerfect,
    });
    // Clone instance values
    for (const [name, value] of this.instanceValues) {
      cloned.setInstanceValue(name, Array.isArray(value) ? [...value] : value);
    }
    cloned.position.copy(this.position);
    cloned.rotation.copy(this.rotation);
    cloned.scale.copy(this.scale);
    return cloned;
  }
}
```

---

### 4. SpriteSheetLoader

**packages/core/src/loaders/SpriteSheetLoader.ts:**

```typescript
import { Texture, TextureLoader } from 'three';
import type {
  SpriteSheet,
  SpriteFrame,
  SpriteSheetJSONHash,
  SpriteSheetJSONArray,
} from '../sprites/types';

/**
 * Loader for spritesheet JSON files.
 *
 * Supports:
 * - JSON Hash format (TexturePacker default)
 * - JSON Array format
 *
 * @example
 * ```typescript
 * const sheet = await SpriteSheetLoader.load('/sprites/player.json');
 * const frame = sheet.getFrame('player_idle_0');
 * ```
 */
export class SpriteSheetLoader {
  private static textureLoader = new TextureLoader();
  private static cache = new Map<string, Promise<SpriteSheet>>();

  /**
   * Load a spritesheet from a JSON file.
   * Results are cached by URL.
   */
  static load(url: string): Promise<SpriteSheet> {
    // Return cached promise if exists
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
  private static async loadUncached(url: string): Promise<SpriteSheet> {
    // Fetch JSON
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load spritesheet: ${url}`);
    }
    const json = await response.json();

    // Determine format and parse
    const isArrayFormat = Array.isArray(json.frames);
    const parsed = isArrayFormat
      ? this.parseJSONArray(json as SpriteSheetJSONArray)
      : this.parseJSONHash(json as SpriteSheetJSONHash);

    // Resolve texture URL relative to JSON file
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
    const textureUrl = baseUrl + parsed.imagePath;

    // Load texture
    const texture = await this.loadTexture(textureUrl);

    // Create SpriteSheet
    return this.createSpriteSheet(texture, parsed.frames, parsed.width, parsed.height);
  }

  /**
   * Parse JSON Hash format.
   */
  private static parseJSONHash(json: SpriteSheetJSONHash) {
    const frames = new Map<string, SpriteFrame>();
    const { w: atlasWidth, h: atlasHeight } = json.meta.size;

    for (const [name, data] of Object.entries(json.frames)) {
      const frame: SpriteFrame = {
        name,
        x: data.frame.x / atlasWidth,
        y: data.frame.y / atlasHeight,
        width: data.frame.w / atlasWidth,
        height: data.frame.h / atlasHeight,
        sourceWidth: data.sourceSize.w,
        sourceHeight: data.sourceSize.h,
        rotated: data.rotated,
        trimmed: data.trimmed,
        pivot: data.pivot,
      };

      if (data.trimmed) {
        frame.trimOffset = {
          x: data.spriteSourceSize.x,
          y: data.spriteSourceSize.y,
          width: data.spriteSourceSize.w,
          height: data.spriteSourceSize.h,
        };
      }

      frames.set(name, frame);
    }

    return {
      frames,
      imagePath: json.meta.image,
      width: atlasWidth,
      height: atlasHeight,
    };
  }

  /**
   * Parse JSON Array format.
   */
  private static parseJSONArray(json: SpriteSheetJSONArray) {
    const frames = new Map<string, SpriteFrame>();
    const { w: atlasWidth, h: atlasHeight } = json.meta.size;

    for (const data of json.frames) {
      const frame: SpriteFrame = {
        name: data.filename,
        x: data.frame.x / atlasWidth,
        y: data.frame.y / atlasHeight,
        width: data.frame.w / atlasWidth,
        height: data.frame.h / atlasHeight,
        sourceWidth: data.sourceSize.w,
        sourceHeight: data.sourceSize.h,
        rotated: data.rotated,
        trimmed: data.trimmed,
        pivot: data.pivot,
      };

      if (data.trimmed) {
        frame.trimOffset = {
          x: data.spriteSourceSize.x,
          y: data.spriteSourceSize.y,
          width: data.spriteSourceSize.w,
          height: data.spriteSourceSize.h,
        };
      }

      frames.set(data.filename, frame);
    }

    return {
      frames,
      imagePath: json.meta.image,
      width: atlasWidth,
      height: atlasHeight,
    };
  }

  /**
   * Load a texture.
   */
  private static loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          // Configure texture for pixel art (optional, can be overridden)
          texture.generateMipmaps = false;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Create a SpriteSheet object.
   */
  private static createSpriteSheet(
    texture: Texture,
    frames: Map<string, SpriteFrame>,
    width: number,
    height: number
  ): SpriteSheet {
    return {
      texture,
      frames,
      width,
      height,
      getFrame(name: string): SpriteFrame {
        const frame = frames.get(name);
        if (!frame) {
          throw new Error(`Frame not found: ${name}`);
        }
        return frame;
      },
      getFrameNames(): string[] {
        return Array.from(frames.keys());
      },
    };
  }

  /**
   * Clear the cache.
   */
  static clearCache() {
    this.cache.clear();
  }

  /**
   * Preload multiple spritesheets.
   */
  static preload(urls: string[]): Promise<SpriteSheet[]> {
    return Promise.all(urls.map((url) => this.load(url)));
  }
}
```

---

### 5. Exports

**packages/core/src/sprites/index.ts:**

```typescript
export { Sprite2D } from './Sprite2D';
export type {
  Sprite2DOptions,
  SpriteFrame,
  SpriteSheet,
  SpriteSheetJSONHash,
  SpriteSheetJSONArray,
} from './types';
```

**packages/core/src/materials/index.ts:**

```typescript
export { Sprite2DMaterial } from './Sprite2DMaterial';
export type { Sprite2DMaterialOptions } from './Sprite2DMaterial';
```

**packages/core/src/loaders/index.ts:**

```typescript
export { SpriteSheetLoader } from './SpriteSheetLoader';
```

**packages/core/src/index.ts:**

```typescript
export const VERSION = '0.1.0';

// Sprites
export * from './sprites';

// Materials
export * from './materials';

// Loaders
export * from './loaders';

// Constants
export const Layers = {
  BACKGROUND: 0,
  GROUND: 1,
  SHADOWS: 2,
  ENTITIES: 3,
  EFFECTS: 4,
  FOREGROUND: 5,
  UI: 6,
} as const;

export type Layer = (typeof Layers)[keyof typeof Layers];
```

---

### 6. React Integration Updates

**packages/react/src/extend.ts:**

```typescript
import { extend } from '@react-three/fiber';
import { Sprite2D, Sprite2DMaterial } from '@three-flatland/core';

export function extendSprite2D() {
  extend({ Sprite2D });
}

export function extendSprite2DMaterial() {
  extend({ Sprite2DMaterial });
}

export function extendAll() {
  extend({
    Sprite2D,
    Sprite2DMaterial,
  });
}
```

**packages/react/src/resource.ts (additions):**

```typescript
import { SpriteSheetLoader, type SpriteSheet } from '@three-flatland/core';
import { TextureLoader, type Texture } from 'three';

// ... existing Resource code ...

/**
 * Create a SpriteSheet resource.
 */
export function spriteSheet(url: string): Resource<SpriteSheet> {
  return createResource(SpriteSheetLoader.load(url));
}

/**
 * Create a Texture resource.
 */
export function texture(url: string): Resource<Texture> {
  return createResource(new TextureLoader().loadAsync(url));
}
```

**packages/react/src/types.ts:**

```typescript
import type { Object3DNode, MaterialNode } from '@react-three/fiber';
import type { Sprite2D, Sprite2DMaterial } from '@three-flatland/core';

declare module '@react-three/fiber' {
  interface ThreeElements {
    sprite2D: Object3DNode<Sprite2D, typeof Sprite2D>;
    sprite2DMaterial: MaterialNode<Sprite2DMaterial, typeof Sprite2DMaterial>;
  }
}
```

---

### 7. Tests

**packages/core/src/sprites/Sprite2D.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Texture, Vector2, Color } from 'three';
import { Sprite2D } from './Sprite2D';

describe('Sprite2D', () => {
  let texture: Texture;

  beforeEach(() => {
    // Create mock texture
    texture = new Texture();
    texture.image = { width: 100, height: 100 };
  });

  it('should create a sprite with default options', () => {
    const sprite = new Sprite2D({ texture });

    expect(sprite).toBeInstanceOf(Sprite2D);
    expect(sprite.texture).toBe(texture);
    expect(sprite.alpha).toBe(1);
    expect(sprite.layer).toBe(0);
    expect(sprite.zIndex).toBe(0);
  });

  it('should set anchor correctly', () => {
    const sprite = new Sprite2D({ texture, anchor: [0.5, 1] });

    expect(sprite.anchor.x).toBe(0.5);
    expect(sprite.anchor.y).toBe(1);
  });

  it('should set tint correctly', () => {
    const sprite = new Sprite2D({ texture, tint: 0xff0000 });

    expect(sprite.tint.r).toBe(1);
    expect(sprite.tint.g).toBe(0);
    expect(sprite.tint.b).toBe(0);
  });

  it('should set alpha correctly', () => {
    const sprite = new Sprite2D({ texture, alpha: 0.5 });

    expect(sprite.alpha).toBe(0.5);
  });

  it('should flip correctly', () => {
    const sprite = new Sprite2D({ texture });

    sprite.flip(true, false);

    expect(sprite.flipX).toBe(true);
    expect(sprite.flipY).toBe(false);
  });

  it('should set frame correctly', () => {
    const sprite = new Sprite2D({ texture });
    const frame = {
      name: 'test',
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
      sourceWidth: 50,
      sourceHeight: 50,
    };

    sprite.setFrame(frame);

    expect(sprite.frame).toEqual(frame);
    expect(sprite.width).toBe(50);
    expect(sprite.height).toBe(50);
  });

  it('should clone correctly', () => {
    const sprite = new Sprite2D({
      texture,
      tint: 0xff0000,
      alpha: 0.5,
      layer: 2,
      zIndex: 10,
    });
    sprite.position.set(100, 200, 0);

    const cloned = sprite.clone();

    expect(cloned.tint.equals(sprite.tint)).toBe(true);
    expect(cloned.alpha).toBe(sprite.alpha);
    expect(cloned.layer).toBe(sprite.layer);
    expect(cloned.zIndex).toBe(sprite.zIndex);
    expect(cloned.position.equals(sprite.position)).toBe(true);
  });
});
```

**packages/core/src/loaders/SpriteSheetLoader.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpriteSheetLoader } from './SpriteSheetLoader';

// Mock fetch
const mockJSONHash = {
  frames: {
    'player_idle_0': {
      frame: { x: 0, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
    },
    'player_idle_1': {
      frame: { x: 32, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
    },
  },
  meta: {
    image: 'player.png',
    size: { w: 128, h: 128 },
    scale: '1',
  },
};

describe('SpriteSheetLoader', () => {
  beforeEach(() => {
    SpriteSheetLoader.clearCache();
    vi.clearAllMocks();
  });

  it.todo('should load JSON Hash format');
  it.todo('should load JSON Array format');
  it.todo('should cache results');
  it.todo('should provide getFrame method');
  it.todo('should throw for missing frames');
});
```

---

## Acceptance Criteria

- [ ] `Sprite2D` creates a mesh with correct geometry and material
- [ ] TSL material compiles without errors (WebGL and WebGPU)
- [ ] Frame UV mapping works correctly
- [ ] Tint color applies correctly
- [ ] Alpha/opacity works correctly
- [ ] Flip X/Y works correctly
- [ ] Anchor point affects positioning correctly
- [ ] `SpriteSheetLoader` loads JSON Hash format
- [ ] `SpriteSheetLoader` loads JSON Array format
- [ ] Sprites display correctly in Three.js scene
- [ ] R3F integration works (`<sprite2D />`)
- [ ] All tests pass
- [ ] TypeScript types are correct and complete

---

## Example Usage

**Vanilla Three.js:**

```typescript
import * as THREE from 'three/webgpu';
import { Sprite2D, SpriteSheetLoader, Layers } from '@three-flatland/core';

const renderer = new THREE.WebGPURenderer();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);

// Load spritesheet
const sheet = await SpriteSheetLoader.load('/sprites/player.json');

// Create sprite
const player = new Sprite2D({
  texture: sheet.texture,
  frame: sheet.getFrame('player_idle_0'),
  anchor: [0.5, 1],
  layer: Layers.ENTITIES,
});
player.position.set(400, 300, 0);
scene.add(player);

// Animate
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
```

**React Three Fiber:**

```tsx
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { extendSprite2D, useResource, spriteSheet, Layers } from '@three-flatland/react';

extendSprite2D();

const playerSheet = spriteSheet('/sprites/player.json');

function Player() {
  const sheet = useResource(playerSheet);

  return (
    <sprite2D
      texture={sheet.texture}
      frame={sheet.getFrame('player_idle_0')}
      anchor={[0.5, 1]}
      layer={Layers.ENTITIES}
      position={[400, 300, 0]}
    />
  );
}

export default function App() {
  return (
    <Canvas orthographic camera={{ zoom: 1, position: [400, 300, 100] }}>
      <Suspense fallback={null}>
        <Player />
      </Suspense>
    </Canvas>
  );
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TSL API changes | Medium | High | Pin Three.js version, follow TSL updates |
| WebGPU compatibility | Low | Medium | Test on multiple browsers |
| Performance issues | Low | Medium | Profile early, optimize geometry sharing |

---

## Dependencies for Next Milestone

M2 (Animation System) requires:
- ✅ Sprite2D class
- ✅ SpriteSheet with frames
- ✅ Frame switching mechanism

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 2 |
| Sprite2DMaterial (TSL) | 8 |
| Sprite2D class | 6 |
| SpriteSheetLoader | 4 |
| React integration | 2 |
| Tests | 4 |
| Examples | 2 |
| Documentation | 2 |
| **Total** | **30 hours** (~1.5 weeks) |

---

*End of M1: Core Sprites*
