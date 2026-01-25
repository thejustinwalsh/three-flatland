# three-flatland

## A TSL-Native 2D Rendering Library for Three.js

---

# Product Requirements Document

**Version:** 4.0.0-draft
**Author:** Claude (Anthropic) + Justin
**Date:** January 23, 2026

---

## Version 4 Changes

- **React Helpers Refined** - `useResource<T>()` with proper TypeScript inference, resources don't throw (use `use()` to unwrap)
- **Tree-Shakeable React** - Users extend what they need, no auto-extend of everything
- **Proper 2D Render Pipeline** - Batched rendering with explicit z-ordering, Pixi.js-style but native to Three.js/TSL
- **Render Targets for 2D-on-3D** - Clean API for rendering 2D scenes to textures for 3D objects
- **Scene Graph ≠ Render Order** - Logical hierarchy separated from visual draw order

---

## Table of Contents

1. [Naming & Branding](#1-naming--branding)
2. [Executive Summary](#2-executive-summary)
3. [Architecture Philosophy](#3-architecture-philosophy)
4. [2D Render Pipeline](#4-2d-render-pipeline) ← **NEW/EXPANDED**
5. [Package Architecture](#5-package-architecture)
6. [TSL Node Collection](#6-tsl-node-collection)
7. [Core Systems](#7-core-systems)
8. [Text Rendering System](#8-text-rendering-system)
9. [R3F Integration](#9-r3f-integration) ← **UPDATED**
10. [Render Targets & 2D-on-3D](#10-render-targets--2d-on-3d) ← **NEW**
11. [API Design & Code Samples](#11-api-design--code-samples)
12. [Tutorials: Mixed 2D/3D](#12-tutorials-mixed-2d3d)
13. [Milestone Plan](#13-milestone-plan)
14. [Technical Specifications](#14-technical-specifications)

---

## 1. Naming & Branding

[Same as v3 - `three-flatland` with `@three-flatland/*` scoped packages]

---

## 2. Executive Summary

**three-flatland** is a TSL-native 2D rendering library that brings Pixi.js-caliber 2D workflows to Three.js.

**Core Principles:**

1. **Three.js-First** - All classes are vanilla Three.js, usable without React
2. **Proper 2D Pipeline** - Batched rendering with explicit z-ordering (not hacks)
3. **Scene Graph ≠ Render Order** - Transforms and draw order are decoupled
4. **Tree-Shakeable** - Import only what you use, including React bindings
5. **TSL-Native** - All shaders in TSL, works with WebGL and WebGPU

---

## 3. Architecture Philosophy

[Same as v3, with additions below]

### 3.1-3.5 [Same as v3...]

### 3.6 Scene Graph vs Render Order (Critical Design)

**Problem:** In 3D engines, scene graph hierarchy determines both transforms AND render order. This is wrong for 2D games where:
- A character's shadow should render BELOW the character (different z-order)
- But the shadow should MOVE WITH the character (same transform parent)
- A weapon should render ABOVE the player but inherit player's position

**Solution:** Decouple them completely.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              SCENE GRAPH vs RENDER ORDER (DECOUPLED)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   SCENE GRAPH (Transforms)              RENDER ORDER (Draw Order)           │
│   ─────────────────────────             ─────────────────────────           │
│   Controls: position, rotation,         Controls: which pixels are          │
│   scale inheritance                     drawn on top of which               │
│                                                                             │
│   Player                                Layer 0: Background                 │
│   ├── Shadow ──────────────────────────► [shadow sprite]                   │
│   ├── Body ────────────────────────────► Layer 1: Entities                 │
│   │                                       [body sprite]                     │
│   └── Weapon ──────────────────────────► Layer 2: Foreground               │
│                                           [weapon sprite]                   │
│                                                                             │
│   Shadow MOVES with Player              Shadow RENDERS below Player         │
│   Weapon MOVES with Player              Weapon RENDERS above Player         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**API:**

```typescript
// Scene graph for transforms (normal Three.js)
const player = new THREE.Group();
const shadow = new Sprite2D({ texture: shadowTex });
const body = new Sprite2D({ texture: bodyTex });
const weapon = new Sprite2D({ texture: weaponTex });

player.add(shadow, body, weapon);
scene.add(player);

// Render order is SEPARATE
shadow.layer = 0;   // Background layer
shadow.zIndex = 0;

body.layer = 1;     // Entities layer
body.zIndex = 10;   // Player's base z

weapon.layer = 2;   // Foreground layer
weapon.zIndex = 0;

// When player moves, all children move (scene graph)
player.position.x += 5;

// But they render in layer order, not scene graph order
```

---

## 4. 2D Render Pipeline ← **NEW MAJOR SECTION**

### 4.1 Overview

The render pipeline is the core of three-flatland. It provides Pixi.js-style batched rendering with explicit z-ordering while being fully native to Three.js and TSL.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          2D RENDER PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐   collect    ┌─────────────┐   sort      ┌─────────────┐  │
│  │ Scene Graph │ ──────────► │  Renderable  │ ─────────► │   Sorted    │  │
│  │  (Sprites)  │              │   Registry   │             │    List     │  │
│  └─────────────┘              └─────────────┘             └──────┬──────┘  │
│                                                                  │         │
│                                                                  │ batch   │
│                                                                  ▼         │
│  ┌─────────────┐   render     ┌─────────────┐   group     ┌─────────────┐  │
│  │   WebGPU    │ ◄─────────── │   Batched   │ ◄────────── │   Batches   │  │
│  │  Renderer   │              │ Draw Calls  │             │ (by texture)│  │
│  └─────────────┘              └─────────────┘             └─────────────┘  │
│                                                                             │
│  Sort Key: (layer << 24) | (texture.id << 12) | (zIndex & 0xFFF)           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Layers

Layers are the primary z-ordering mechanism. Sprites in lower layers always render behind sprites in higher layers.

```typescript
// Built-in layer constants (users can define their own)
export const Layers = {
  BACKGROUND: 0,
  GROUND: 1,
  SHADOWS: 2,
  ENTITIES: 3,
  EFFECTS: 4,
  FOREGROUND: 5,
  UI: 6,
} as const;

// Sprites have a layer property
const sprite = new Sprite2D({ texture });
sprite.layer = Layers.ENTITIES;
```

### 4.3 Z-Index (Within Layer)

Within a layer, zIndex determines draw order. Higher zIndex = drawn later = appears on top.

```typescript
// For Y-sorting (isometric games)
sprite.zIndex = sprite.position.y;

// Or explicit ordering
player.zIndex = 100;
npc.zIndex = 99; // Renders behind player
```

### 4.4 Batching Strategy

Sprites are batched by texture atlas to minimize draw calls:

```typescript
// Batching groups sprites with same texture
// Sort key ensures batches render in correct z-order

interface BatchKey {
  layer: number;
  textureId: number;
  blendMode: BlendMode;
  // Sprites with same BatchKey go in same batch
}

// Batches are sorted by minimum zIndex of contained sprites
// Within a batch, sprites are sorted by zIndex for correct depth
```

### 4.5 The Renderer2D Class

```typescript
// ═══════════════════════════════════════════════════════════════
// Renderer2D - The core 2D render pipeline
// ═══════════════════════════════════════════════════════════════

interface Renderer2DOptions {
  maxSpritesPerBatch?: number;     // Default: 10000
  maxBatches?: number;              // Default: 100
  sortMode?: 'layer' | 'y-sort' | 'custom';
  customSort?: (a: Sprite2D, b: Sprite2D) => number;
}

class Renderer2D {
  // Create a 2D renderer
  constructor(options?: Renderer2DOptions);

  // Register sprites for rendering
  // Sprites auto-register when added to a scene with Renderer2D
  add(sprite: Sprite2D): void;
  remove(sprite: Sprite2D): void;

  // Render all registered sprites
  // Call this in your render loop
  render(renderer: WebGPURenderer, camera: Camera): void;

  // Manual batch management (advanced)
  invalidate(): void;  // Force re-batch next frame

  // Stats
  readonly spriteCount: number;
  readonly batchCount: number;
  readonly drawCalls: number;
}
```

### 4.6 How Batching Works (Implementation)

```typescript
// Internal batching implementation

class BatchManager {
  private batches: Map<string, SpriteBatch> = new Map();
  private sortedSprites: Sprite2D[] = [];
  private dirty: boolean = true;

  add(sprite: Sprite2D) {
    this.sortedSprites.push(sprite);
    this.dirty = true;
  }

  remove(sprite: Sprite2D) {
    const idx = this.sortedSprites.indexOf(sprite);
    if (idx !== -1) this.sortedSprites.splice(idx, 1);
    this.dirty = true;
  }

  prepareBatches() {
    if (!this.dirty) return;

    // 1. Sort all sprites
    this.sortedSprites.sort((a, b) => {
      // Primary: layer
      if (a.layer !== b.layer) return a.layer - b.layer;
      // Secondary: texture (for batching)
      if (a.texture.id !== b.texture.id) return a.texture.id - b.texture.id;
      // Tertiary: zIndex
      return a.zIndex - b.zIndex;
    });

    // 2. Group into batches
    this.batches.clear();
    let currentBatch: SpriteBatch | null = null;
    let currentKey: string = '';

    for (const sprite of this.sortedSprites) {
      const key = `${sprite.layer}_${sprite.texture.id}_${sprite.blendMode}`;

      if (key !== currentKey) {
        currentKey = key;
        currentBatch = new SpriteBatch(sprite.texture, sprite.blendMode);
        this.batches.set(key + '_' + this.batches.size, currentBatch);
      }

      currentBatch!.add(sprite);
    }

    this.dirty = false;
  }

  render(renderer: WebGPURenderer, camera: Camera) {
    this.prepareBatches();

    for (const batch of this.batches.values()) {
      batch.upload();  // Update GPU buffers
      batch.render(renderer, camera);
    }
  }
}
```

### 4.7 SpriteBatch (Internal)

Each batch uses instanced rendering for performance:

```typescript
class SpriteBatch {
  private mesh: InstancedMesh;
  private positions: Float32Array;
  private uvOffsets: Float32Array;
  private colors: Float32Array;
  private count: number = 0;

  constructor(texture: Texture, blendMode: BlendMode, maxSprites: number = 10000) {
    // Shared quad geometry
    const geometry = new PlaneGeometry(1, 1);

    // TSL-based material
    const material = new SpriteBatchMaterial({ texture, blendMode });

    // Instanced mesh
    this.mesh = new InstancedMesh(geometry, material, maxSprites);

    // Instance attribute buffers
    this.positions = new Float32Array(maxSprites * 3);
    this.uvOffsets = new Float32Array(maxSprites * 4); // x, y, w, h
    this.colors = new Float32Array(maxSprites * 4);    // r, g, b, a

    // Setup instance attributes
    geometry.setAttribute('instancePosition',
      new InstancedBufferAttribute(this.positions, 3));
    geometry.setAttribute('instanceUV',
      new InstancedBufferAttribute(this.uvOffsets, 4));
    geometry.setAttribute('instanceColor',
      new InstancedBufferAttribute(this.colors, 4));
  }

  add(sprite: Sprite2D) {
    const i = this.count++;

    // Position (world matrix applied)
    const worldPos = sprite.getWorldPosition(new Vector3());
    this.positions[i * 3] = worldPos.x;
    this.positions[i * 3 + 1] = worldPos.y;
    this.positions[i * 3 + 2] = sprite.zIndex * 0.0001; // Z for depth

    // UV offset in atlas
    const frame = sprite.frame;
    this.uvOffsets[i * 4] = frame.x;
    this.uvOffsets[i * 4 + 1] = frame.y;
    this.uvOffsets[i * 4 + 2] = frame.width;
    this.uvOffsets[i * 4 + 3] = frame.height;

    // Tint color
    this.colors[i * 4] = sprite.tint.r;
    this.colors[i * 4 + 1] = sprite.tint.g;
    this.colors[i * 4 + 2] = sprite.tint.b;
    this.colors[i * 4 + 3] = sprite.alpha;
  }

  upload() {
    this.mesh.geometry.attributes.instancePosition.needsUpdate = true;
    this.mesh.geometry.attributes.instanceUV.needsUpdate = true;
    this.mesh.geometry.attributes.instanceColor.needsUpdate = true;
    this.mesh.count = this.count;
  }

  render(renderer: WebGPURenderer, camera: Camera) {
    renderer.render(this.mesh, camera);
  }

  clear() {
    this.count = 0;
  }
}
```

### 4.8 TSL Batch Material

```typescript
// TSL-based material for batched sprite rendering
import { Fn, attribute, texture, uv, vec2, vec4 } from 'three/tsl';

class SpriteBatchMaterial extends MeshBasicNodeMaterial {
  constructor(options: { texture: Texture; blendMode: BlendMode }) {
    super();

    // Instance attributes
    const instancePos = attribute('instancePosition', 'vec3');
    const instanceUV = attribute('instanceUV', 'vec4');
    const instanceColor = attribute('instanceColor', 'vec4');

    // Vertex position (instance position + local vertex)
    this.positionNode = Fn(() => {
      return positionLocal.add(instancePos);
    })();

    // UV mapping to atlas frame
    this.colorNode = Fn(() => {
      // Remap UV from [0,1] to frame in atlas
      const atlasUV = uv()
        .mul(vec2(instanceUV.z, instanceUV.w))
        .add(vec2(instanceUV.x, instanceUV.y));

      // Sample texture
      const texColor = texture(options.texture, atlasUV);

      // Apply tint
      return vec4(
        texColor.rgb.mul(instanceColor.rgb),
        texColor.a.mul(instanceColor.a)
      );
    })();

    // Alpha test for transparency
    this.alphaTestNode = float(0.01);

    // Blend mode
    this.transparent = true;
    this.depthWrite = false;
    this.blending = options.blendMode === 'additive'
      ? THREE.AdditiveBlending
      : THREE.NormalBlending;
  }
}
```

### 4.9 Layer Manager (High-Level API)

For users who want Pixi.js-style layer management:

```typescript
// ═══════════════════════════════════════════════════════════════
// LayerManager - High-level layer management
// ═══════════════════════════════════════════════════════════════

interface LayerOptions {
  name: string;
  zIndex: number;
  sortMode?: 'none' | 'y-sort' | 'z-index' | 'custom';
  customSort?: (a: Sprite2D, b: Sprite2D) => number;
  camera?: Camera;           // Override camera for this layer
  renderTarget?: RenderTarget; // Render to texture (for post-processing)
  postProcess?: PostProcessEffect[];
}

class LayerManager {
  private layers: Map<string, Layer> = new Map();
  private renderer2D: Renderer2D;

  constructor(renderer2D: Renderer2D) {
    this.renderer2D = renderer2D;
  }

  createLayer(options: LayerOptions): Layer {
    const layer = new Layer(options, this.renderer2D);
    this.layers.set(options.name, layer);
    return layer;
  }

  getLayer(name: string): Layer | undefined {
    return this.layers.get(name);
  }

  // Render all layers in order
  render(renderer: WebGPURenderer, defaultCamera: Camera) {
    const sortedLayers = [...this.layers.values()]
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of sortedLayers) {
      if (!layer.visible) continue;

      const camera = layer.camera ?? defaultCamera;

      // Render to target if specified
      if (layer.renderTarget) {
        renderer.setRenderTarget(layer.renderTarget);
      }

      // Render layer sprites
      layer.render(renderer, camera);

      // Apply post-processing
      for (const effect of layer.postProcess) {
        effect.apply(renderer, layer.renderTarget);
      }

      if (layer.renderTarget) {
        renderer.setRenderTarget(null);
      }
    }
  }
}
```

### 4.10 Comparison with Pixi.js

| Feature | Pixi.js | three-flatland |
|---------|---------|----------------|
| Scene graph | Container hierarchy | THREE.Object3D hierarchy |
| Render order | zIndex + sortableChildren | layer + zIndex (decoupled) |
| Batching | BatchRenderer | SpriteBatch (instanced) |
| Batch breaks | Texture change, filter | Texture change, layer change |
| Draw calls | ~1 per texture per layer | ~1 per texture per layer |
| Z-ordering | Within container | Explicit layers + zIndex |
| Post-process | Filters | Layer renderTargets + effects |
| 3D integration | None | Native Three.js |

---

## 5. Package Architecture

[Updated for tree-shaking]

### 5.1 Package Structure

```
@three-flatland/
├── core/                          # ← ALL LOGIC LIVES HERE
│   ├── sprites/
│   ├── text/
│   ├── tilemaps/
│   ├── pipeline/                  # ← 2D RENDER PIPELINE
│   │   ├── Renderer2D.ts
│   │   ├── SpriteBatch.ts
│   │   ├── BatchManager.ts
│   │   ├── Layer.ts
│   │   └── LayerManager.ts
│   ├── materials/
│   ├── loaders/
│   └── index.ts
│
├── nodes/                         # TSL node collection
│   └── ...
│
├── react/                         # ← TREE-SHAKEABLE REACT
│   ├── extend.ts                  # Individual extend functions
│   ├── types.ts                   # Type augmentation
│   ├── resource.ts                # Resource + useResource
│   └── index.ts
│
└── presets/
    └── ...
```

---

## 9. R3F Integration ← **SIGNIFICANTLY UPDATED**

### 9.1 Tree-Shakeable Extends

Instead of auto-extending everything, users extend what they need:

```typescript
// @three-flatland/react/extend.ts

import { extend } from '@react-three/fiber';
import * as Core from '@three-flatland/core';

// Individual extend functions - tree-shakeable
export function extendSprite2D() {
  extend({ Sprite2D: Core.Sprite2D });
}

export function extendAnimatedSprite2D() {
  extend({ AnimatedSprite2D: Core.AnimatedSprite2D });
}

export function extendSDFText() {
  extend({ SDFText: Core.SDFText });
}

export function extendBitmapText() {
  extend({ BitmapText: Core.BitmapText });
}

export function extendTileMap2D() {
  extend({ TileMap2D: Core.TileMap2D });
}

// ... etc for each class

// Convenience: extend all (not tree-shakeable, but convenient)
export function extendAll() {
  extend({
    Sprite2D: Core.Sprite2D,
    AnimatedSprite2D: Core.AnimatedSprite2D,
    SDFText: Core.SDFText,
    BitmapText: Core.BitmapText,
    TileMap2D: Core.TileMap2D,
    // ... all classes
  });
}
```

**Usage:**

```typescript
// Tree-shakeable: only Sprite2D and SDFText in bundle
import { extendSprite2D, extendSDFText } from '@three-flatland/react';

extendSprite2D();
extendSDFText();

function Game() {
  return (
    <>
      <sprite2D texture={tex} />
      <sDFText text="Hello" />
    </>
  );
}
```

```typescript
// Convenient but not tree-shakeable
import { extendAll } from '@three-flatland/react';

extendAll();

// Now all components available
```

### 9.2 Resource Pattern (No Throw Semantics)

Resources are simple Promise wrappers. They do NOT throw - users use React's `use()` hook to unwrap them.

```typescript
// @three-flatland/react/resource.ts

/**
 * Resource - A Promise wrapper that tracks loading state.
 * Does NOT throw. Use React's `use()` hook to unwrap.
 */
export interface Resource<T> {
  /** The underlying promise */
  readonly promise: Promise<T>;

  /** Loading state (does not suspend) */
  readonly status: 'pending' | 'fulfilled' | 'rejected';

  /** Result if fulfilled (undefined otherwise) */
  readonly value: T | undefined;

  /** Error if rejected (undefined otherwise) */
  readonly error: Error | undefined;

  /** Check if loaded without suspending */
  readonly isLoaded: boolean;
}

export function createResource<T>(promise: Promise<T>): Resource<T> {
  const resource: Resource<T> = {
    promise,
    status: 'pending',
    value: undefined,
    error: undefined,
    get isLoaded() {
      return this.status === 'fulfilled';
    },
  };

  promise.then(
    (value) => {
      (resource as any).status = 'fulfilled';
      (resource as any).value = value;
    },
    (error) => {
      (resource as any).status = 'rejected';
      (resource as any).error = error;
    }
  );

  return resource;
}
```

### 9.3 useResource Hook (Generic with TypeScript Inference)

```typescript
// @three-flatland/react/resource.ts

import { use } from 'react';

/**
 * useResource - Unwrap a Resource using React's `use()` hook.
 *
 * This suspends the component until the resource is loaded.
 * Must be used within a Suspense boundary.
 *
 * @example
 * const sheet = useResource(spriteSheetResource);
 * // sheet is fully typed as SpriteSheet
 */
export function useResource<T>(resource: Resource<T>): T {
  return use(resource.promise);
}

// ─── Typed Resource Factories ───

/** Load a sprite sheet */
export function spriteSheet(url: string): Resource<SpriteSheet> {
  return createResource(SpriteSheetLoader.load(url));
}

/** Load a font */
export function font(url: string, type: 'sdf' | 'msdf' | 'bitmap' = 'msdf'): Resource<Font> {
  return createResource(FontLoader.load(url, type));
}

/** Load a tileset */
export function tileset(url: string, format: 'tiled' | 'ldtk' = 'tiled'): Resource<Tileset> {
  return createResource(TilesetLoader.load(url, format));
}

/** Load a texture */
export function texture(url: string): Resource<Texture> {
  return createResource(new THREE.TextureLoader().loadAsync(url));
}
```

### 9.4 Usage Examples

**Pattern 1: Create resources outside components**

```tsx
import { spriteSheet, font, useResource } from '@three-flatland/react';

// Resources created at module level (or in a resources file)
const playerSheetRes = spriteSheet('/sprites/player.json');
const uiFontRes = font('/fonts/ui.json', 'msdf');

function Player() {
  // useResource suspends until loaded, returns typed value
  const sheet = useResource(playerSheetRes);  // SpriteSheet

  return (
    <animatedSprite2D
      spriteSheet={sheet}
      animation="idle"
    />
  );
}

function UI() {
  const font = useResource(uiFontRes);  // Font

  return (
    <sDFText font={font} text="Score: 0" />
  );
}

// Wrap in Suspense
function App() {
  return (
    <Canvas>
      <Suspense fallback={null}>
        <Player />
        <UI />
      </Suspense>
    </Canvas>
  );
}
```

**Pattern 2: Resources in a loader/cache**

```tsx
// resources.ts - Central resource definitions
import { spriteSheet, font, tileset } from '@three-flatland/react';

export const resources = {
  player: spriteSheet('/sprites/player.json'),
  enemies: spriteSheet('/sprites/enemies.json'),
  items: spriteSheet('/sprites/items.json'),
  uiFont: font('/fonts/ui.json'),
  pixelFont: font('/fonts/pixel.fnt', 'bitmap'),
  level1: tileset('/maps/level1.json'),
} as const;

// Component usage
import { resources } from './resources';
import { useResource } from '@three-flatland/react';

function Player() {
  const sheet = useResource(resources.player);
  return <animatedSprite2D spriteSheet={sheet} />;
}
```

**Pattern 3: Check loading state without suspending**

```tsx
function LoadingScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const resources = [playerSheetRes, enemySheetRes, levelRes];
    const loaded = resources.filter(r => r.isLoaded).length;
    setProgress(loaded / resources.length);
  }, [/* poll or use effect */]);

  if (progress < 1) {
    return <div>Loading: {Math.round(progress * 100)}%</div>;
  }

  return <Game />;
}
```

**Pattern 4: Preloading before render**

```tsx
// Preload all resources, then render
async function preloadAll() {
  await Promise.all([
    resources.player.promise,
    resources.enemies.promise,
    resources.level1.promise,
  ]);
}

// In your app initialization
await preloadAll();

// Now components won't suspend
function Player() {
  // Already loaded, returns immediately
  const sheet = useResource(resources.player);
  return <sprite2D texture={sheet.texture} />;
}
```

### 9.5 Complete React Package

```typescript
// @three-flatland/react/index.ts

// ─── Extend Functions (tree-shakeable) ───
export {
  extendSprite2D,
  extendAnimatedSprite2D,
  extendSDFText,
  extendBitmapText,
  extendTileMap2D,
  extendSpriteBatch,
  extendRenderer2D,
  // ... etc
  extendAll,  // Convenience, not tree-shakeable
} from './extend';

// ─── Resource System ───
export {
  Resource,
  createResource,
  useResource,
  // Typed factories
  spriteSheet,
  font,
  tileset,
  texture,
} from './resource';

// ─── Re-export Core (for convenience) ───
export * from '@three-flatland/core';

// ─── Types ───
export type * from './types';
```

### 9.6 TypeScript Types

```typescript
// @three-flatland/react/types.ts

import type { Object3DNode, MaterialNode } from '@react-three/fiber';
import type * as Core from '@three-flatland/core';

declare module '@react-three/fiber' {
  interface ThreeElements {
    // Sprites
    sprite2D: Object3DNode<Core.Sprite2D, typeof Core.Sprite2D>;
    animatedSprite2D: Object3DNode<Core.AnimatedSprite2D, typeof Core.AnimatedSprite2D>;
    nineSliceSprite2D: Object3DNode<Core.NineSliceSprite2D, typeof Core.NineSliceSprite2D>;

    // Text
    sDFText: Object3DNode<Core.SDFText, typeof Core.SDFText>;
    mSDFText: Object3DNode<Core.MSDFText, typeof Core.MSDFText>;
    bitmapText: Object3DNode<Core.BitmapText, typeof Core.BitmapText>;
    canvasText: Object3DNode<Core.CanvasText, typeof Core.CanvasText>;
    paragraph: Object3DNode<Core.Paragraph, typeof Core.Paragraph>;

    // Tilemaps
    tileMap2D: Object3DNode<Core.TileMap2D, typeof Core.TileMap2D>;

    // Pipeline
    renderer2D: Object3DNode<Core.Renderer2D, typeof Core.Renderer2D>;
    layer: Object3DNode<Core.Layer, typeof Core.Layer>;

    // Batching
    spriteBatch: Object3DNode<Core.SpriteBatch, typeof Core.SpriteBatch>;
    textBatch: Object3DNode<Core.TextBatch, typeof Core.TextBatch>;
  }
}
```

---

## 10. Render Targets & 2D-on-3D ← **NEW SECTION**

### 10.1 Overview

For rendering 2D content onto 3D objects (like a platformer on a cylinder or card faces), we provide a clean render target API.

### 10.2 RenderTarget2D

```typescript
// ═══════════════════════════════════════════════════════════════
// RenderTarget2D - Render a 2D scene to a texture
// ═══════════════════════════════════════════════════════════════

interface RenderTarget2DOptions {
  width: number;
  height: number;
  pixelRatio?: number;
  clearColor?: Color;
  clearAlpha?: number;
}

class RenderTarget2D {
  readonly target: WebGLRenderTarget;
  readonly texture: Texture;
  readonly camera: OrthographicCamera;
  readonly scene: Scene;
  readonly renderer2D: Renderer2D;

  constructor(options: RenderTarget2DOptions) {
    this.target = new WebGLRenderTarget(
      options.width * (options.pixelRatio ?? 1),
      options.height * (options.pixelRatio ?? 1)
    );
    this.texture = this.target.texture;

    this.camera = new OrthographicCamera(
      0, options.width,
      options.height, 0,
      -1000, 1000
    );

    this.scene = new Scene();
    this.renderer2D = new Renderer2D();
  }

  // Add sprites to this 2D scene
  add(...sprites: Sprite2D[]) {
    for (const sprite of sprites) {
      this.scene.add(sprite);
      this.renderer2D.add(sprite);
    }
  }

  remove(...sprites: Sprite2D[]) {
    for (const sprite of sprites) {
      this.scene.remove(sprite);
      this.renderer2D.remove(sprite);
    }
  }

  // Render the 2D scene to the texture
  render(renderer: WebGPURenderer) {
    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(this.clearColor, this.clearAlpha);
    renderer.clear();

    this.renderer2D.render(renderer, this.camera);

    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.target.dispose();
    this.renderer2D.dispose();
  }
}
```

### 10.3 Usage: Platformer on a Cylinder

```typescript
import * as THREE from 'three/webgpu';
import {
  RenderTarget2D,
  Sprite2D,
  AnimatedSprite2D,
  TileMap2D,
  SpriteSheetLoader,
  TilesetLoader,
} from '@three-flatland/core';

// 1. Create the 2D render target (the "game screen")
const gameScreen = new RenderTarget2D({
  width: 1024,
  height: 512,
  pixelRatio: 2,  // High DPI
  clearColor: new THREE.Color(0x87CEEB),  // Sky blue
});

// 2. Load 2D assets
const [playerSheet, tileset] = await Promise.all([
  SpriteSheetLoader.load('/sprites/mario.json'),
  TilesetLoader.load('/maps/level.json'),
]);

// 3. Create 2D game objects
const player = new AnimatedSprite2D({
  spriteSheet: playerSheet,
  animation: 'idle',
});
player.position.set(100, 300);
player.layer = 1;

const tilemap = new TileMap2D({ map: tileset });
tilemap.layer = 0;

// 4. Add to the 2D scene
gameScreen.add(tilemap, player);

// 5. Create 3D cylinder with game texture
const cylinder = new THREE.Mesh(
  new THREE.CylinderGeometry(5, 5, 10, 64, 1, true),
  new THREE.MeshBasicMaterial({
    map: gameScreen.texture,
    side: THREE.DoubleSide,
  })
);
cylinder.rotation.z = Math.PI / 2;
scene.add(cylinder);

// 6. Game loop
function animate() {
  requestAnimationFrame(animate);

  // Update 2D game
  updateGameLogic();
  player.update(16);

  // Render 2D to texture
  gameScreen.render(renderer);

  // Render 3D scene
  renderer.render(scene, camera);

  // Rotate cylinder
  cylinder.rotation.y += 0.002;
}
```

### 10.4 Usage: Card Game with 2D Faces

```typescript
// Create a render target for each unique card
function createCardFace(cardData: CardData): Texture {
  const cardFace = new RenderTarget2D({
    width: 256,
    height: 356,
  });

  // Background
  const bg = new Sprite2D({
    texture: cardSheet.texture,
    frame: cardSheet.getFrame(`bg_${cardData.rarity}`),
  });
  bg.position.set(128, 178);
  bg.layer = 0;

  // Artwork
  const art = new Sprite2D({
    texture: cardSheet.texture,
    frame: cardSheet.getFrame(cardData.artworkId),
  });
  art.position.set(128, 200);
  art.layer = 1;

  // Name text
  const name = new SDFText({
    font: cardFont,
    text: cardData.name,
    fontSize: 16,
  });
  name.position.set(128, 320);
  name.layer = 2;

  cardFace.add(bg, art, name);

  // Render once (static card)
  cardFace.render(renderer);

  return cardFace.texture;
}

// Create 3D card with 2D face
const frontTexture = createCardFace(cardData);
const card = new THREE.Mesh(
  new THREE.BoxGeometry(2.56, 3.56, 0.05),
  [
    new THREE.MeshBasicMaterial({ color: 0x333333 }),
    new THREE.MeshBasicMaterial({ color: 0x333333 }),
    new THREE.MeshBasicMaterial({ color: 0x333333 }),
    new THREE.MeshBasicMaterial({ color: 0x333333 }),
    new THREE.MeshBasicMaterial({ map: frontTexture }),
    new THREE.MeshBasicMaterial({ map: cardBackTexture }),
  ]
);
```

### 10.5 R3F Usage

```tsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  RenderTarget2D,
  extendRenderTarget2D,
  extendSprite2D,
  useResource,
  spriteSheet,
} from '@three-flatland/react';

extendRenderTarget2D();
extendSprite2D();

const playerRes = spriteSheet('/sprites/player.json');

function PlatformerOnCylinder() {
  const gameScreenRef = useRef<RenderTarget2D>(null);

  useFrame(({ gl }) => {
    // Render 2D game to texture each frame
    gameScreenRef.current?.render(gl);
  });

  const playerSheet = useResource(playerRes);

  return (
    <>
      {/* 2D Game Scene (renders to texture) */}
      <renderTarget2D ref={gameScreenRef} width={1024} height={512}>
        <tileMap2D map={tileset} layer={0} />
        <Player sheet={playerSheet} />
      </renderTarget2D>

      {/* 3D Cylinder displaying the game */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[5, 5, 10, 64, 1, true]} />
        <meshBasicMaterial
          map={gameScreenRef.current?.texture}
          side={THREE.DoubleSide}
        />
      </mesh>
    </>
  );
}
```

---

## 11. API Design & Code Samples

[Updated with proper pipeline usage]

### 11.1 Complete Vanilla JS Example

```typescript
import * as THREE from 'three/webgpu';
import {
  Renderer2D,
  LayerManager,
  Sprite2D,
  AnimatedSprite2D,
  SDFText,
  TileMap2D,
  Layers,
  SpriteSheetLoader,
  FontLoader,
  TilesetLoader,
} from '@three-flatland/core';

// ─── Setup ───
const renderer = new THREE.WebGPURenderer();
renderer.setSize(800, 600);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);

// ─── Create 2D Pipeline ───
const renderer2D = new Renderer2D();
const layers = new LayerManager(renderer2D);

// Create layers
layers.createLayer({ name: 'background', zIndex: 0 });
layers.createLayer({ name: 'entities', zIndex: 1, sortMode: 'y-sort' });
layers.createLayer({ name: 'foreground', zIndex: 2 });
layers.createLayer({ name: 'ui', zIndex: 100 });

// ─── Load Assets ───
const [playerSheet, enemySheet, font, tileset] = await Promise.all([
  SpriteSheetLoader.load('/sprites/player.json'),
  SpriteSheetLoader.load('/sprites/enemies.json'),
  FontLoader.load('/fonts/pixel.fnt', 'bitmap'),
  TilesetLoader.load('/maps/level1.json'),
]);

// ─── Create Game Objects ───

// Tilemap (background layer)
const tilemap = new TileMap2D({ map: tileset });
tilemap.layer = Layers.BACKGROUND;
scene.add(tilemap);
renderer2D.add(tilemap);

// Player (entities layer)
const player = new AnimatedSprite2D({
  spriteSheet: playerSheet,
  animation: 'idle',
});
player.position.set(400, 300);
player.layer = Layers.ENTITIES;
player.zIndex = player.position.y;  // Y-sort
scene.add(player);
renderer2D.add(player);

// Player shadow (shadows layer - below entities)
const shadow = new Sprite2D({
  texture: playerSheet.texture,
  frame: playerSheet.getFrame('shadow'),
});
shadow.layer = Layers.SHADOWS;
shadow.zIndex = 0;
player.add(shadow);  // Parent to player for transforms
shadow.position.set(0, -5);  // Offset below player
renderer2D.add(shadow);

// Enemy
const enemy = new AnimatedSprite2D({
  spriteSheet: enemySheet,
  animation: 'walk',
});
enemy.position.set(600, 350);
enemy.layer = Layers.ENTITIES;
enemy.zIndex = enemy.position.y;
scene.add(enemy);
renderer2D.add(enemy);

// UI Text
const scoreText = new SDFText({
  font,
  text: 'Score: 0',
  fontSize: 24,
});
scoreText.position.set(20, 20);
scoreText.layer = Layers.UI;
scene.add(scoreText);
renderer2D.add(scoreText);

// ─── Game Loop ───
let score = 0;

function animate() {
  requestAnimationFrame(animate);

  // Update game logic
  player.update(16);
  enemy.update(16);

  // Update Y-sort zIndex
  player.zIndex = player.position.y;
  enemy.zIndex = enemy.position.y;

  // Update score
  scoreText.text = `Score: ${score}`;

  // Render with 2D pipeline
  renderer2D.render(renderer, camera);
}

animate();
```

### 11.2 Complete R3F Example

```tsx
import { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  extendAnimatedSprite2D,
  extendSDFText,
  extendTileMap2D,
  extendRenderer2D,
  useResource,
  spriteSheet,
  font,
  tileset,
  Layers,
} from '@three-flatland/react';
import type { AnimatedSprite2D, Renderer2D } from '@three-flatland/core';

// Extend only what we need (tree-shakeable)
extendAnimatedSprite2D();
extendSDFText();
extendTileMap2D();
extendRenderer2D();

// Resources
const resources = {
  player: spriteSheet('/sprites/player.json'),
  enemies: spriteSheet('/sprites/enemies.json'),
  uiFont: font('/fonts/pixel.fnt', 'bitmap'),
  level: tileset('/maps/level1.json'),
};

function Game() {
  const renderer2DRef = useRef<Renderer2D>(null);
  const [score, setScore] = useState(0);

  // Render 2D pipeline each frame
  useFrame(({ gl, camera }) => {
    renderer2DRef.current?.render(gl, camera);
  });

  return (
    <renderer2D ref={renderer2DRef}>
      <Tilemap />
      <Player />
      <Enemies />
      <UI score={score} />
    </renderer2D>
  );
}

function Tilemap() {
  const map = useResource(resources.level);
  return <tileMap2D map={map} layer={Layers.BACKGROUND} />;
}

function Player() {
  const sheet = useResource(resources.player);
  const ref = useRef<AnimatedSprite2D>(null);
  const [pos, setPos] = useState({ x: 400, y: 300 });

  useFrame(() => {
    ref.current?.update(16);
    // Y-sort: zIndex = y position
    if (ref.current) {
      ref.current.zIndex = pos.y;
    }
  });

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={sheet}
      animation="idle"
      position={[pos.x, pos.y, 0]}
      layer={Layers.ENTITIES}
    />
  );
}

function Enemies() {
  const sheet = useResource(resources.enemies);
  // ... similar to Player
}

function UI({ score }: { score: number }) {
  const uiFont = useResource(resources.uiFont);

  return (
    <sDFText
      font={uiFont}
      text={`Score: ${score}`}
      fontSize={24}
      position={[20, 20, 0]}
      layer={Layers.UI}
    />
  );
}

export default function App() {
  return (
    <Canvas orthographic camera={{ zoom: 1, position: [400, 300, 100] }}>
      <Suspense fallback={null}>
        <Game />
      </Suspense>
    </Canvas>
  );
}
```

---

## 12. Tutorials: Mixed 2D/3D

[Updated to use RenderTarget2D - see Section 10 for full examples]

---

## 13. Milestone Plan

[Same structure as v3, with addition of Pipeline milestone]

### Updated Milestone Overview

| # | Name | Weeks | Key Deliverables |
|---|------|-------|------------------|
| M0 | Project Setup | 1 | Monorepo, build, CI/CD |
| M1 | Core Sprites | 2 | Sprite2D, materials, loaders |
| M2 | Animation | 2 | AnimatedSprite2D, animation system |
| **M3** | **2D Render Pipeline** | **3** | **Renderer2D, batching, layers, z-ordering** |
| M4 | TSL Nodes Part 1 | 3 | 15+ sprite/color/alpha nodes |
| M5 | Tilemaps | 3 | TileMap2D, Tiled/LDtk loaders |
| M6 | TSL Nodes Part 2 | 2 | 20+ lighting/effect nodes |
| M7 | Text Rendering | 4 | SDFText, BitmapText, CanvasText |
| M8 | Batching & Performance | 2 | SpriteBatch, optimization |
| M9 | R3F Integration | 1 | extend(), useResource, types |
| M10 | Render Targets | 1 | RenderTarget2D, 2D-on-3D |
| M11 | Presets & Post | 2 | Retro, HD, VFX presets |
| M12 | Docs & Launch | 2 | Tutorials, API docs, npm publish |
| **Total** | | **28** | |

---

## 14. Technical Specifications

### Performance Targets (Updated)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Sprites (batched) | 50,000 @ 60fps | MacBook Pro M1 |
| Draw calls | 1-5 per layer | DevTools |
| Batch breaks | Only on texture change | DevTools |
| Memory overhead | <1KB per sprite | DevTools |
| Bundle size (core) | <50KB gzipped | Bundlephobia |
| Bundle size (react) | <5KB gzipped | Bundlephobia |

---

## Appendix G: Render Pipeline Comparison

| Aspect | Pixi.js | three-flatland | Unity 2D | Godot |
|--------|---------|----------------|----------|-------|
| Batch unit | Container | Layer + Texture | Sprite Atlas | CanvasItem |
| Z-ordering | zIndex | layer + zIndex | Sorting Layer + Order | Z Index |
| Scene/Render decoupled | Yes (v8) | Yes | No | No |
| Custom shaders | Filters | TSL nodes | ShaderLab | Godot Shaders |
| 3D integration | None | Native | Separate pipeline | Separate viewport |
| Instanced rendering | No | Yes | Yes (SRP) | No |

---

*End of PRD v4*
