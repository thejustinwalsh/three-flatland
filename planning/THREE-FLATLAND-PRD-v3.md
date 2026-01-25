# three-flatland

## A TSL-Native 2D Rendering Library for Three.js

---

# Product Requirements Document

**Version:** 3.0.0-draft
**Author:** Claude (Anthropic) + Justin
**Date:** January 23, 2026

---

## Version 3 Changes

- **Architecture: Three.js-First** - All classes are vanilla Three.js. R3F is a thin declarative wrapper, not the primary API.
- **No React-Required Patterns** - Zero hooks in core logic. R3F leverages `extend()` and React's reconciler.
- **Modern React When Used** - React 19+, react-compiler, Suspense, `use()` for async.
- **Expanded Tutorials** - Mixed 2D/3D use cases (platformer on cylinder, 3D card game).
- **Code Duplication Eliminated** - Single implementation, multiple consumption patterns.

---

## Table of Contents

1. [Naming & Branding](#1-naming--branding)
2. [Executive Summary](#2-executive-summary)
3. [Architecture Philosophy](#3-architecture-philosophy) ← **UPDATED**
4. [Goals & Non-Goals](#4-goals--non-goals)
5. [Package Architecture](#5-package-architecture) ← **UPDATED**
6. [TSL Node Collection](#6-tsl-node-collection)
7. [Core Systems](#7-core-systems)
8. [Text Rendering System](#8-text-rendering-system)
9. [R3F Integration](#9-r3f-integration) ← **REWRITTEN**
10. [API Design & Code Samples](#10-api-design--code-samples)
11. [Tutorials: Mixed 2D/3D](#11-tutorials-mixed-2d3d) ← **NEW**
12. [Milestone Plan](#12-milestone-plan)
13. [Technical Specifications](#13-technical-specifications)

---

## 1. Naming & Branding

[Same as v2 - `three-flatland` with `@three-flatland/*` scoped packages]

---

## 2. Executive Summary

**three-flatland** is a TSL-native 2D rendering library that brings Pixi.js-caliber 2D workflows to Three.js.

**Key Principle:** Everything is a Three.js class first. React integration is optional and thin.

It provides:

1. **Pure Three.js Classes** - Use with vanilla JS, TypeScript, or any framework
2. **Rich TSL Node Collection** - 60+ shader nodes for sprites, text, effects, lighting
3. **Comprehensive Text System** - SDF, MSDF, bitmap fonts, canvas-to-texture
4. **Flexible Render Targets** - 2D layers, mixed scenes, 2D on 3D geometry
5. **Optional R3F Integration** - Thin wrapper using `extend()`, not hooks-first
6. **Modern React Support** - When used with R3F: React 19+, Suspense, react-compiler

---

## 3. Architecture Philosophy ← **NEW SECTION**

### 3.1 Core Principle: Three.js First

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE: THREE.JS FIRST                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     @three-flatland/core                             │   │
│   │                                                                      │   │
│   │   • Pure Three.js classes (Sprite2D, TileMap2D, SDFText, etc.)      │   │
│   │   • Zero React dependencies                                          │   │
│   │   • Zero hooks                                                       │   │
│   │   • Works with vanilla JS, Vue, Svelte, Angular, anything            │   │
│   │   • All logic lives here                                             │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ extends THREE.Object3D                 │
│                                    │ extends THREE.Material                 │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     @three-flatland/react                            │   │
│   │                                                                      │   │
│   │   • THIN wrapper (< 500 lines total)                                │   │
│   │   • Just extend() + TypeScript types                                │   │
│   │   • Suspense boundaries for async loading                           │   │
│   │   • No duplicate logic - calls core classes                         │   │
│   │   • Modern React: react-compiler, use(), Suspense                   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 What This Means in Practice

**WRONG - Hook-First Pattern (DO NOT DO):**

```typescript
// ❌ BAD: Logic lives in React hook
// This forces React dependency and duplicates logic

// @three-flatland/react/hooks/useSprite.ts
export function useSprite(texture: Texture, options: SpriteOptions) {
  const [sprite, setSprite] = useState<Sprite2D | null>(null);

  useEffect(() => {
    // Logic lives in the hook - BAD!
    const geometry = new PlaneGeometry(1, 1);
    const material = new Sprite2DMaterial();
    material.map = texture;
    // ... lots of setup logic ...

    const sprite = new Mesh(geometry, material);
    setSprite(sprite);

    return () => sprite.dispose();
  }, [texture, options]);

  return sprite;
}
```

**RIGHT - Class-First Pattern (DO THIS):**

```typescript
// ✅ GOOD: All logic in Three.js class

// @three-flatland/core/Sprite2D.ts
export class Sprite2D extends Mesh {
  constructor(options: Sprite2DOptions) {
    const geometry = new PlaneGeometry(1, 1);
    const material = new Sprite2DMaterial();
    super(geometry, material);

    // All logic lives in the class
    this.setTexture(options.texture);
    this.setFrame(options.frame);
    this.setAnchor(options.anchor);
    // ...
  }

  // Methods on the class, not in hooks
  setFrame(frame: SpriteFrame) { /* ... */ }
  setAnchor(x: number, y: number) { /* ... */ }
  flip(horizontal: boolean, vertical: boolean) { /* ... */ }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// @three-flatland/react/index.ts
// React wrapper is JUST type registration
import { extend } from '@react-three/fiber';
import { Sprite2D } from '@three-flatland/core';

extend({ Sprite2D });

// That's it! R3F's reconciler handles the rest.
```

### 3.3 R3F Integration via extend()

R3F's power is that it can use ANY Three.js class directly via `extend()`. The reconciler:
- Creates instances via `new ClassName(args)`
- Sets properties via `instance.property = value`
- Calls methods via `ref.current.method()`
- Handles mounting/unmounting automatically

**This means our React "integration" is mostly just TypeScript types:**

```typescript
// @three-flatland/react/types.ts
import type { Object3DNode, MaterialNode } from '@react-three/fiber';
import type * as Flatland from '@three-flatland/core';

declare module '@react-three/fiber' {
  interface ThreeElements {
    sprite2D: Object3DNode<Flatland.Sprite2D, typeof Flatland.Sprite2D>;
    animatedSprite2D: Object3DNode<Flatland.AnimatedSprite2D, typeof Flatland.AnimatedSprite2D>;
    sDFText: Object3DNode<Flatland.SDFText, typeof Flatland.SDFText>;
    bitmapText: Object3DNode<Flatland.BitmapText, typeof Flatland.BitmapText>;
    tileMap2D: Object3DNode<Flatland.TileMap2D, typeof Flatland.TileMap2D>;
    // ... etc
  }
}

// @three-flatland/react/index.ts
import { extend } from '@react-three/fiber';
import * as Flatland from '@three-flatland/core';

// Register all classes with R3F
extend({
  Sprite2D: Flatland.Sprite2D,
  AnimatedSprite2D: Flatland.AnimatedSprite2D,
  SDFText: Flatland.SDFText,
  BitmapText: Flatland.BitmapText,
  TileMap2D: Flatland.TileMap2D,
  // ... etc
});

// Re-export core for convenience
export * from '@three-flatland/core';

// Export types
export type * from './types';
```

### 3.4 Async Loading: Promises, Not Hooks

**WRONG - Hook for loading:**

```typescript
// ❌ BAD: Loading logic in hook
export function useSpriteSheet(url: string) {
  const [sheet, setSheet] = useState<SpriteSheet | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    SpriteSheetLoader.load(url)
      .then(setSheet)
      .catch(setError);
  }, [url]);

  return { sheet, error, loading: !sheet && !error };
}
```

**RIGHT - Class method returns Promise, React uses Suspense:**

```typescript
// ✅ GOOD: Core returns Promise

// @three-flatland/core/loaders/SpriteSheetLoader.ts
export class SpriteSheetLoader {
  // Returns a Promise - works anywhere
  static load(url: string): Promise<SpriteSheet> {
    return fetch(url)
      .then(r => r.json())
      .then(json => this.parse(json));
  }

  // Can also preload
  static preload(urls: string[]): Promise<SpriteSheet[]> {
    return Promise.all(urls.map(url => this.load(url)));
  }
}

// Usage in vanilla JS:
const sheet = await SpriteSheetLoader.load('/sprites/player.json');
const sprite = new Sprite2D({ texture: sheet.texture, frame: sheet.getFrame('idle') });

// Usage in React with Suspense + use():
function Player() {
  // React 19's use() unwraps the promise, Suspense handles loading
  const sheet = use(SpriteSheetLoader.load('/sprites/player.json'));

  return (
    <sprite2D
      texture={sheet.texture}
      frame={sheet.getFrame('idle')}
    />
  );
}

// Wrapped in Suspense boundary:
<Suspense fallback={<LoadingSpinner />}>
  <Player />
</Suspense>
```

### 3.5 Modern React Patterns (When Used)

When three-flatland is used with R3F, we leverage modern React:

**React 19+ Features:**
- `use()` hook for unwrapping promises
- Suspense for async boundaries
- Automatic batching
- react-compiler for optimal re-renders

**react-compiler Compatibility:**

```typescript
// react-compiler optimizes this automatically
function GameSprite({ position, animation }: Props) {
  const sheet = use(spriteSheetPromise);

  return (
    <animatedSprite2D
      spriteSheet={sheet}
      animation={animation}
      position={position}
    />
  );
}

// react-compiler will:
// - Memoize the component automatically
// - Skip re-renders when props haven't changed
// - Optimize the JSX creation
```

**Resource Pattern for Async:**

```typescript
// Create a resource that can be read synchronously after loading
// This pattern works great with Suspense

// @three-flatland/react/resource.ts
export function createResource<T>(promise: Promise<T>) {
  let status: 'pending' | 'success' | 'error' = 'pending';
  let result: T;
  let error: Error;

  const suspender = promise.then(
    (r) => { status = 'success'; result = r; },
    (e) => { status = 'error'; error = e; }
  );

  return {
    read(): T {
      if (status === 'pending') throw suspender;
      if (status === 'error') throw error;
      return result;
    }
  };
}

// Usage:
const spriteSheetResource = createResource(
  SpriteSheetLoader.load('/sprites/player.json')
);

function Player() {
  const sheet = spriteSheetResource.read(); // Suspends if not ready
  return <sprite2D texture={sheet.texture} />;
}
```

### 3.6 No Code Duplication

Because all logic lives in core classes:

| Feature | Core Implementation | React Wrapper |
|---------|---------------------|---------------|
| Sprite2D | ~200 lines | 0 lines (just extend) |
| SDFText | ~400 lines | 0 lines (just extend) |
| TileMap2D | ~500 lines | 0 lines (just extend) |
| Animation | ~150 lines | 0 lines (class method) |
| Loading | ~100 lines | ~20 lines (Suspense helpers) |
| **Total** | ~1350 lines | ~20 lines |

The React package is essentially:
1. `extend()` calls (~10 lines)
2. TypeScript type augmentation (~50 lines)
3. Optional Suspense helpers (~50 lines)
4. Re-exports (~5 lines)

---

## 4. Goals & Non-Goals

### Goals

1. **Three.js-First Architecture** - All classes are vanilla Three.js, usable anywhere
2. **TSL-First Shaders** - All shaders written in TSL, compiling to WebGL and WebGPU
3. **Framework Agnostic** - Works with React, Vue, Svelte, vanilla JS, anything
4. **Optional R3F Integration** - Thin wrapper, not required
5. **Modern React When Used** - React 19+, react-compiler, Suspense
6. **Zero Code Duplication** - Single implementation in core
7. **Mixed 2D/3D Support** - 2D content on 3D objects, not just flat layers
8. **Performance Parity** - Match or exceed Pixi.js

### Non-Goals

1. **React-Required API** - Never require React for any functionality
2. **Hook-First Architecture** - Hooks are sugar, not the implementation
3. **Legacy React Support** - Minimum React 19 when used with R3F
4. **Separate Implementations** - No vanilla vs React versions of same feature

---

## 5. Package Architecture ← **UPDATED**

### Package Structure

```
three-flatland/                    # Main package (convenience re-export)
├── package.json
└── src/
    └── index.ts                   # Re-exports @three-flatland/core

@three-flatland/
├── core/                          # ← ALL LOGIC LIVES HERE
│   ├── sprites/
│   │   ├── Sprite2D.ts           # Extends THREE.Mesh
│   │   ├── AnimatedSprite2D.ts   # Extends Sprite2D
│   │   └── NineSliceSprite2D.ts  # Extends Sprite2D
│   ├── text/
│   │   ├── SDFText.ts            # Extends THREE.Mesh
│   │   ├── BitmapText.ts         # Extends THREE.Mesh
│   │   ├── CanvasText.ts         # Extends THREE.Mesh
│   │   └── Paragraph.ts          # Extends THREE.Object3D
│   ├── tilemaps/
│   │   └── TileMap2D.ts          # Extends THREE.Object3D
│   ├── layers/
│   │   ├── RenderLayer2D.ts      # Layer management
│   │   └── LayerManager.ts       # Orchestrates layers
│   ├── batch/
│   │   ├── SpriteBatch.ts        # Extends THREE.InstancedMesh
│   │   └── TextBatch.ts          # Extends THREE.InstancedMesh
│   ├── materials/                 # TSL-based materials
│   │   ├── Sprite2DMaterial.ts
│   │   ├── SDFTextMaterial.ts
│   │   └── TileMaterial.ts
│   ├── loaders/                   # Return Promises, not hooks
│   │   ├── SpriteSheetLoader.ts
│   │   ├── AtlasLoader.ts
│   │   ├── TilesetLoader.ts
│   │   └── FontLoader.ts
│   └── index.ts                   # Export everything
│
├── nodes/                         # TSL node collection
│   ├── sprite/
│   ├── text/
│   ├── effects/
│   ├── lighting/
│   └── index.ts
│
├── react/                         # ← THIN WRAPPER ONLY
│   ├── extend.ts                  # Register classes with R3F
│   ├── types.ts                   # TypeScript augmentation
│   ├── suspense.ts                # Suspense helpers (optional)
│   └── index.ts                   # ~100 lines total
│
└── presets/
    ├── retro.ts
    ├── hd.ts
    └── vfx.ts
```

### Dependency Graph

```
┌─────────────────┐
│  three (peer)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ @three-flatland │
│     /core       │ ← No React dependency
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────────────┐
│ /nodes│ │ @react-three/ │
└───────┘ │    fiber      │ (peer, optional)
          └───────┬───────┘
                  │
                  ▼
          ┌───────────────┐
          │ @three-flatland│
          │    /react     │ ← Tiny, just types + extend
          └───────────────┘
```

### Package.json Dependencies

```json
// @three-flatland/core/package.json
{
  "name": "@three-flatland/core",
  "peerDependencies": {
    "three": ">=0.170.0"
  },
  "dependencies": {
    // Minimal - most is built-in
  }
}

// @three-flatland/react/package.json
{
  "name": "@three-flatland/react",
  "peerDependencies": {
    "three": ">=0.170.0",
    "@react-three/fiber": ">=9.0.0",
    "react": ">=19.0.0"
  },
  "dependencies": {
    "@three-flatland/core": "workspace:*"
  }
}
```

---

## 6. TSL Node Collection

[Same as v2]

---

## 7. Core Systems

[Same as v2, but emphasizing class-based API]

### 7.1 Sprite System (Class-Based)

```typescript
// All methods are on the class, not in hooks

class Sprite2D extends Mesh {
  // Constructor takes options object
  constructor(options: Sprite2DOptions);

  // Properties (can be set directly or via JSX in R3F)
  texture: Texture;
  frame: SpriteFrame;
  anchor: Vector2;
  tint: Color;
  alpha: number;
  flipX: boolean;
  flipY: boolean;

  // Methods (callable from ref in R3F)
  setFrame(frame: SpriteFrame): this;
  setFrameIndex(index: number): this;
  setAnchor(x: number, y: number): this;
  flip(horizontal: boolean, vertical: boolean): this;

  // Lifecycle
  dispose(): void;

  // Static factory for convenience
  static async fromSheet(url: string, frameName: string): Promise<Sprite2D>;
}

// Vanilla JS usage:
const sprite = new Sprite2D({ texture, frame: sheet.getFrame('idle') });
sprite.position.set(100, 100, 0);
sprite.setAnchor(0.5, 1); // Bottom center
scene.add(sprite);

// R3F usage (same class, different syntax):
<sprite2D
  texture={texture}
  frame={sheet.getFrame('idle')}
  position={[100, 100, 0]}
  anchor={[0.5, 1]}
/>
```

---

## 8. Text Rendering System

[Same as v2, with emphasis on class-based API]

---

## 9. R3F Integration ← **REWRITTEN**

### 9.1 Philosophy

R3F integration is about **declaration**, not **implementation**. The reconciler creates and manages Three.js objects. We just need to:

1. Register our classes with `extend()`
2. Provide TypeScript types
3. Optionally provide Suspense helpers for async

### 9.2 The Entire React Package

```typescript
// @three-flatland/react/index.ts
// This is essentially the ENTIRE React integration

import { extend } from '@react-three/fiber';
import * as Core from '@three-flatland/core';

// Register all classes with R3F's reconciler
extend({
  // Sprites
  Sprite2D: Core.Sprite2D,
  AnimatedSprite2D: Core.AnimatedSprite2D,
  NineSliceSprite2D: Core.NineSliceSprite2D,

  // Text
  SDFText: Core.SDFText,
  MSDFText: Core.MSDFText,
  BitmapText: Core.BitmapText,
  CanvasText: Core.CanvasText,
  Paragraph: Core.Paragraph,

  // Tilemaps
  TileMap2D: Core.TileMap2D,
  TileLayer: Core.TileLayer,

  // Batching
  SpriteBatch: Core.SpriteBatch,
  TextBatch: Core.TextBatch,
  ParticleBatch: Core.ParticleBatch,

  // Layers
  RenderLayer2D: Core.RenderLayer2D,

  // Materials
  Sprite2DMaterial: Core.Sprite2DMaterial,
  SDFTextMaterial: Core.SDFTextMaterial,
  LitSprite2DMaterial: Core.LitSprite2DMaterial,
});

// Re-export everything from core
export * from '@three-flatland/core';

// Export types
export type * from './types';
```

### 9.3 TypeScript Types

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
    tileLayer: Object3DNode<Core.TileLayer, typeof Core.TileLayer>;

    // Batching
    spriteBatch: Object3DNode<Core.SpriteBatch, typeof Core.SpriteBatch>;
    textBatch: Object3DNode<Core.TextBatch, typeof Core.TextBatch>;
    particleBatch: Object3DNode<Core.ParticleBatch, typeof Core.ParticleBatch>;

    // Layers
    renderLayer2D: Object3DNode<Core.RenderLayer2D, typeof Core.RenderLayer2D>;

    // Materials
    sprite2DMaterial: MaterialNode<Core.Sprite2DMaterial, typeof Core.Sprite2DMaterial>;
    sDFTextMaterial: MaterialNode<Core.SDFTextMaterial, typeof Core.SDFTextMaterial>;
    litSprite2DMaterial: MaterialNode<Core.LitSprite2DMaterial, typeof Core.LitSprite2DMaterial>;
  }
}
```

### 9.4 Suspense Helpers (Optional)

For async loading with Suspense, we provide a thin helper:

```typescript
// @three-flatland/react/suspense.ts
import { use } from 'react';
import { SpriteSheetLoader, FontLoader, TilesetLoader } from '@three-flatland/core';

// Cache for loaded resources (prevents duplicate fetches)
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    cache.set(key, loader());
  }
  return cache.get(key) as Promise<T>;
}

// These are just convenience functions, not required
export function useSpriteSheet(url: string) {
  return use(cached(url, () => SpriteSheetLoader.load(url)));
}

export function useFont(url: string, type: 'sdf' | 'msdf' | 'bitmap' = 'msdf') {
  return use(cached(`${url}:${type}`, () => FontLoader.load(url, type)));
}

export function useTileset(url: string, format: 'tiled' | 'ldtk' = 'tiled') {
  return use(cached(`${url}:${format}`, () => TilesetLoader.load(url, format)));
}

// Preload helper for eager loading
export function preload(resources: Array<{ url: string; type: string }>) {
  return Promise.all(
    resources.map(({ url, type }) => {
      switch (type) {
        case 'spritesheet': return SpriteSheetLoader.load(url);
        case 'font': return FontLoader.load(url);
        case 'tileset': return TilesetLoader.load(url);
        default: throw new Error(`Unknown resource type: ${type}`);
      }
    })
  );
}
```

### 9.5 Usage Patterns

**Pattern 1: Direct use() with Suspense (Recommended)**

```tsx
import { Suspense, use } from 'react';
import { Canvas } from '@react-three/fiber';
import { SpriteSheetLoader } from '@three-flatland/react';

// Create promise outside component (or in a cache)
const playerSheetPromise = SpriteSheetLoader.load('/sprites/player.json');

function Player() {
  // use() unwraps the promise, suspends if pending
  const sheet = use(playerSheetPromise);

  return (
    <animatedSprite2D
      spriteSheet={sheet}
      animation="idle"
      position={[0, 0, 0]}
    />
  );
}

function Game() {
  return (
    <Canvas>
      <Suspense fallback={null}>
        <Player />
      </Suspense>
    </Canvas>
  );
}
```

**Pattern 2: Using convenience hooks**

```tsx
import { Suspense } from 'react';
import { useSpriteSheet, useFont } from '@three-flatland/react';

function GameUI() {
  // These hooks use use() internally
  const playerSheet = useSpriteSheet('/sprites/player.json');
  const font = useFont('/fonts/roboto-msdf.json');

  return (
    <>
      <animatedSprite2D spriteSheet={playerSheet} animation="idle" />
      <sDFText font={font} text="Score: 0" position={[10, 10, 0]} />
    </>
  );
}

// Must be wrapped in Suspense
<Suspense fallback={<Loading />}>
  <GameUI />
</Suspense>
```

**Pattern 3: Preloading before render**

```tsx
import { preload } from '@three-flatland/react';

// Preload during app initialization
await preload([
  { url: '/sprites/player.json', type: 'spritesheet' },
  { url: '/sprites/enemies.json', type: 'spritesheet' },
  { url: '/fonts/pixel.fnt', type: 'font' },
  { url: '/maps/level1.json', type: 'tileset' },
]);

// Now components won't suspend
function Player() {
  const sheet = useSpriteSheet('/sprites/player.json'); // Instant, already cached
  return <sprite2D texture={sheet.texture} />;
}
```

**Pattern 4: Refs for imperative control**

```tsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { AnimatedSprite2D } from '@three-flatland/react';

function Player() {
  const spriteRef = useRef<AnimatedSprite2D>(null);

  useFrame(() => {
    // Access class methods imperatively
    if (spriteRef.current) {
      spriteRef.current.setFrame(Math.floor(Date.now() / 100) % 4);
    }
  });

  return (
    <animatedSprite2D
      ref={spriteRef}
      spriteSheet={sheet}
      position={[0, 0, 0]}
    />
  );
}
```

### 9.6 react-compiler Compatibility

The architecture is inherently react-compiler friendly:

```tsx
// react-compiler optimizes this automatically because:
// 1. No manual useMemo/useCallback needed
// 2. Props are simple values (position array, strings, etc.)
// 3. No complex hook dependencies

function Sprite({ x, y, frame }: { x: number; y: number; frame: string }) {
  const sheet = useSpriteSheet('/sprites/player.json');

  return (
    <sprite2D
      texture={sheet.texture}
      frame={sheet.getFrame(frame)}
      position={[x, y, 0]}
    />
  );
}

// react-compiler will:
// ✅ Memoize the component
// ✅ Skip re-renders when x, y, frame unchanged
// ✅ Not break due to hook rules (use() is compiler-aware)
```

---

## 10. API Design & Code Samples

### 10.1 Vanilla Three.js (No React)

```typescript
import * as THREE from 'three/webgpu';
import {
  Sprite2D,
  AnimatedSprite2D,
  SDFText,
  TileMap2D,
  LayerManager,
  SpriteSheetLoader,
  FontLoader,
  TilesetLoader,
} from '@three-flatland/core';

// Setup
const renderer = new THREE.WebGPURenderer();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);

// Load assets (async)
const [playerSheet, enemySheet, font, map] = await Promise.all([
  SpriteSheetLoader.load('/sprites/player.json'),
  SpriteSheetLoader.load('/sprites/enemies.json'),
  FontLoader.load('/fonts/pixel.fnt', 'bitmap'),
  TilesetLoader.load('/maps/level1.json', 'tiled'),
]);

// Create sprite
const player = new AnimatedSprite2D({
  spriteSheet: playerSheet,
  animation: 'idle',
  anchor: new THREE.Vector2(0.5, 1),
});
player.position.set(400, 300, 0);

// Create text
const scoreText = new SDFText({
  font,
  text: 'Score: 0',
  fontSize: 24,
});
scoreText.position.set(10, 10, 0);

// Create tilemap
const tilemap = new TileMap2D({ map });

// Setup layers
const layers = new LayerManager();
layers.createLayer({ name: 'background', zIndex: 0 }).add(tilemap);
layers.createLayer({ name: 'game', zIndex: 1, sortMode: 'y-sort' }).add(player);
layers.createLayer({ name: 'ui', zIndex: 100 }).add(scoreText);

// Game loop
function animate() {
  requestAnimationFrame(animate);

  // Update animations
  player.update(16); // deltaTime in ms

  // Render with layer manager
  layers.render(renderer, scene, camera);
}

animate();
```

### 10.2 React Three Fiber

```tsx
import { Suspense, use } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  SpriteSheetLoader,
  FontLoader,
  TilesetLoader,
} from '@three-flatland/react';

// Promises created outside components
const assets = {
  player: SpriteSheetLoader.load('/sprites/player.json'),
  enemies: SpriteSheetLoader.load('/sprites/enemies.json'),
  font: FontLoader.load('/fonts/pixel.fnt', 'bitmap'),
  map: TilesetLoader.load('/maps/level1.json', 'tiled'),
};

function Game() {
  const playerSheet = use(assets.player);
  const font = use(assets.font);
  const map = use(assets.map);

  return (
    <>
      {/* Background tilemap */}
      <tileMap2D map={map} />

      {/* Player */}
      <Player sheet={playerSheet} />

      {/* UI */}
      <sDFText
        font={font}
        text="Score: 0"
        fontSize={24}
        position={[10, 10, 0]}
      />
    </>
  );
}

function Player({ sheet }) {
  const ref = useRef<AnimatedSprite2D>(null);

  useFrame((_, delta) => {
    ref.current?.update(delta * 1000);
  });

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={sheet}
      animation="idle"
      anchor={[0.5, 1]}
      position={[400, 300, 0]}
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

## 11. Tutorials: Mixed 2D/3D ← **NEW SECTION**

### 11.1 Tutorial: 2D Platformer on a 3D Cylinder

**Concept:** A 2D platformer game rendered on the surface of a rotating cylinder, playable in 3D space.

```typescript
// ═══════════════════════════════════════════════════════════════
// TUTORIAL: Mario-style Platformer on a 3D Cylinder
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three/webgpu';
import {
  Sprite2D,
  AnimatedSprite2D,
  TileMap2D,
  SpriteSheetLoader,
  TilesetLoader,
} from '@three-flatland/core';

// 1. Create the 3D cylinder that will host our 2D game
const cylinderRadius = 5;
const cylinderHeight = 10;
const cylinderGeometry = new THREE.CylinderGeometry(
  cylinderRadius, cylinderRadius, cylinderHeight, 64
);

// 2. Create a render target for the 2D game
const gameRenderTarget = new THREE.WebGLRenderTarget(1024, 512, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
});

// 3. Create the 2D game scene (separate from 3D scene)
const gameScene = new THREE.Scene();
const gameCamera = new THREE.OrthographicCamera(0, 1024, 512, 0, -100, 100);

// 4. Load 2D assets
const [playerSheet, tileset] = await Promise.all([
  SpriteSheetLoader.load('/sprites/mario.json'),
  TilesetLoader.load('/maps/level.json', 'tiled'),
]);

// 5. Create 2D game objects
const player = new AnimatedSprite2D({
  spriteSheet: playerSheet,
  animation: 'run',
});
player.position.set(100, 100, 0);
gameScene.add(player);

const tilemap = new TileMap2D({ map: tileset });
gameScene.add(tilemap);

// 6. Create material that uses the game render target as texture
const cylinderMaterial = new THREE.MeshBasicMaterial({
  map: gameRenderTarget.texture,
});

// 7. Create the 3D cylinder mesh
const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
cylinder.rotation.z = Math.PI / 2; // Rotate so texture wraps horizontally
scene.add(cylinder);

// 8. Game loop: Render 2D game to texture, then render 3D scene
function animate() {
  requestAnimationFrame(animate);

  // Update 2D game logic
  updateGame(); // Move player, check collisions, etc.
  player.update(16);

  // Render 2D game to the render target
  renderer.setRenderTarget(gameRenderTarget);
  renderer.render(gameScene, gameCamera);

  // Render 3D scene (cylinder with game texture)
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

  // Slowly rotate cylinder for effect
  cylinder.rotation.y += 0.001;
}

// 9. Player movement maps to cylinder surface
function updateGame() {
  // Player X position wraps around the cylinder
  if (player.position.x > 1024) player.position.x = 0;
  if (player.position.x < 0) player.position.x = 1024;

  // Standard platformer physics for Y
  // ... gravity, jumping, collision detection
}
```

**R3F Version:**

```tsx
// ═══════════════════════════════════════════════════════════════
// TUTORIAL: Platformer on Cylinder (R3F)
// ═══════════════════════════════════════════════════════════════

import { Canvas, useFrame, createPortal } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';

function PlatformerOnCylinder() {
  // Create render target for 2D game
  const gameTarget = useFBO(1024, 512);

  // Create separate scene for 2D game
  const [gameScene] = useState(() => new THREE.Scene());
  const [gameCamera] = useState(() =>
    new THREE.OrthographicCamera(0, 1024, 512, 0, -100, 100)
  );

  // Load assets
  const playerSheet = use(assets.player);
  const tileset = use(assets.tileset);

  // Render loop
  useFrame(({ gl }) => {
    // Render 2D game to texture
    gl.setRenderTarget(gameTarget);
    gl.render(gameScene, gameCamera);
    gl.setRenderTarget(null);
  });

  return (
    <>
      {/* 2D game rendered into portal (separate scene) */}
      {createPortal(
        <>
          <tileMap2D map={tileset} />
          <Player sheet={playerSheet} />
        </>,
        gameScene
      )}

      {/* 3D cylinder displaying the game */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[5, 5, 10, 64]} />
        <meshBasicMaterial map={gameTarget.texture} />
      </mesh>
    </>
  );
}
```

### 11.2 Tutorial: 3D Card Game with 2D Card Faces

**Concept:** A card game where cards are 3D objects that can rotate, but the card faces are rendered with 2D flatland graphics.

```typescript
// ═══════════════════════════════════════════════════════════════
// TUTORIAL: 3D Card Game with 2D Flatland Card Faces
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three/webgpu';
import {
  Sprite2D,
  SDFText,
  SpriteSheetLoader,
  FontLoader,
} from '@three-flatland/core';
import { outline, glow } from '@three-flatland/nodes';

// 1. Load card assets
const [cardSheet, iconSheet, font] = await Promise.all([
  SpriteSheetLoader.load('/sprites/cards.json'),
  SpriteSheetLoader.load('/sprites/icons.json'),
  FontLoader.load('/fonts/card-text.json', 'msdf'),
]);

// 2. Create a render target for each card face
function createCardTexture(cardData: CardData): THREE.Texture {
  const renderTarget = new THREE.WebGLRenderTarget(256, 356);
  const cardScene = new THREE.Scene();
  const cardCamera = new THREE.OrthographicCamera(0, 256, 356, 0, -10, 10);

  // Card background
  const background = new Sprite2D({
    texture: cardSheet.texture,
    frame: cardSheet.getFrame(cardData.rarity), // common, rare, legendary
  });
  background.position.set(128, 178, -1);
  cardScene.add(background);

  // Card artwork (centered)
  const artwork = new Sprite2D({
    texture: cardSheet.texture,
    frame: cardSheet.getFrame(cardData.artworkId),
  });
  artwork.position.set(128, 200, 0);
  cardScene.add(artwork);

  // Card name (with outline effect)
  const nameText = new SDFText({
    font,
    text: cardData.name,
    fontSize: 18,
    color: new THREE.Color(0xffffff),
    outlineWidth: 2,
    outlineColor: new THREE.Color(0x000000),
  });
  nameText.position.set(128, 320, 1);
  cardScene.add(nameText);

  // Stats
  const attackText = new SDFText({
    font,
    text: cardData.attack.toString(),
    fontSize: 24,
    color: new THREE.Color(0xff4444),
  });
  attackText.position.set(30, 30, 1);
  cardScene.add(attackText);

  const defenseText = new SDFText({
    font,
    text: cardData.defense.toString(),
    fontSize: 24,
    color: new THREE.Color(0x4444ff),
  });
  defenseText.position.set(226, 30, 1);
  cardScene.add(defenseText);

  // Mana cost icon
  const manaIcon = new Sprite2D({
    texture: iconSheet.texture,
    frame: iconSheet.getFrame('mana'),
  });
  manaIcon.position.set(230, 330, 1);
  cardScene.add(manaIcon);

  // Render to texture
  renderer.setRenderTarget(renderTarget);
  renderer.render(cardScene, cardCamera);
  renderer.setRenderTarget(null);

  return renderTarget.texture;
}

// 3. Create 3D card mesh with 2D face
class Card3D extends THREE.Mesh {
  constructor(cardData: CardData) {
    // Card geometry (thin box)
    const geometry = new THREE.BoxGeometry(2.56, 3.56, 0.05);

    // Create materials for each face
    const frontTexture = createCardTexture(cardData);
    const backTexture = cardSheet.getFrame('card_back').texture;

    const materials = [
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // right
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // left
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // top
      new THREE.MeshBasicMaterial({ color: 0x333333 }), // bottom
      new THREE.MeshBasicMaterial({ map: frontTexture }), // front
      new THREE.MeshBasicMaterial({ map: backTexture }),  // back
    ];

    super(geometry, materials);

    this.cardData = cardData;
  }

  // Animate card flip
  flip(duration: number = 0.5) {
    // Use GSAP or manual animation to rotate card
  }

  // Hover effect
  highlight(enabled: boolean) {
    if (enabled) {
      this.position.y += 0.5;
      this.rotation.x = -0.1;
    } else {
      this.position.y -= 0.5;
      this.rotation.x = 0;
    }
  }
}

// 4. Game setup
const hand: Card3D[] = [];
const deck: CardData[] = loadDeck();

// Deal cards in an arc
function dealHand(count: number) {
  for (let i = 0; i < count; i++) {
    const cardData = deck.pop()!;
    const card = new Card3D(cardData);

    // Position in arc
    const angle = (i - (count - 1) / 2) * 0.2;
    card.position.set(Math.sin(angle) * 5, -3, Math.cos(angle) * 5 - 8);
    card.rotation.y = angle;
    card.rotation.x = 0.3;

    scene.add(card);
    hand.push(card);
  }
}

// 5. Interaction
function onCardClick(card: Card3D) {
  // Flip card to reveal
  card.flip();

  // Or play card to board
  playCard(card);
}
```

**R3F Version:**

```tsx
// ═══════════════════════════════════════════════════════════════
// TUTORIAL: 3D Card Game (R3F)
// ═══════════════════════════════════════════════════════════════

import { Canvas, useFrame, createPortal } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import { useSpring, animated } from '@react-spring/three';

// Card face component (2D, rendered to texture)
function CardFace({ cardData }: { cardData: CardData }) {
  const cardSheet = use(assets.cardSheet);
  const font = use(assets.cardFont);

  return (
    <>
      {/* Background */}
      <sprite2D
        texture={cardSheet.texture}
        frame={cardSheet.getFrame(cardData.rarity)}
        position={[128, 178, -1]}
      />

      {/* Artwork */}
      <sprite2D
        texture={cardSheet.texture}
        frame={cardSheet.getFrame(cardData.artworkId)}
        position={[128, 200, 0]}
      />

      {/* Name */}
      <sDFText
        font={font}
        text={cardData.name}
        fontSize={18}
        outlineWidth={2}
        outlineColor="black"
        position={[128, 320, 1]}
      />

      {/* Stats */}
      <sDFText font={font} text={`${cardData.attack}`} fontSize={24} color="red" position={[30, 30, 1]} />
      <sDFText font={font} text={`${cardData.defense}`} fontSize={24} color="blue" position={[226, 30, 1]} />
    </>
  );
}

// 3D Card with 2D face
function Card3D({ cardData, position, rotation, onClick }: Card3DProps) {
  // Render target for card face
  const faceTarget = useFBO(256, 356);

  // Separate scene for 2D card content
  const [cardScene] = useState(() => new THREE.Scene());
  const [cardCamera] = useState(() =>
    new THREE.OrthographicCamera(0, 256, 356, 0, -10, 10)
  );

  // Hover animation
  const [hovered, setHovered] = useState(false);
  const { posY, rotX } = useSpring({
    posY: hovered ? position[1] + 0.5 : position[1],
    rotX: hovered ? -0.1 : rotation[0],
  });

  // Render card face to texture
  useFrame(({ gl }) => {
    gl.setRenderTarget(faceTarget);
    gl.render(cardScene, cardCamera);
    gl.setRenderTarget(null);
  });

  return (
    <>
      {/* 2D card face (rendered to texture) */}
      {createPortal(<CardFace cardData={cardData} />, cardScene)}

      {/* 3D card mesh */}
      <animated.mesh
        position-x={position[0]}
        position-y={posY}
        position-z={position[2]}
        rotation-x={rotX}
        rotation-y={rotation[1]}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onClick={onClick}
      >
        <boxGeometry args={[2.56, 3.56, 0.05]} />
        <meshBasicMaterial attach="material-4" map={faceTarget.texture} />
        <meshBasicMaterial attach="material-5" map={cardBackTexture} />
        <meshBasicMaterial attach="material-0" color="#333" />
        <meshBasicMaterial attach="material-1" color="#333" />
        <meshBasicMaterial attach="material-2" color="#333" />
        <meshBasicMaterial attach="material-3" color="#333" />
      </animated.mesh>
    </>
  );
}

// Hand of cards
function Hand({ cards }: { cards: CardData[] }) {
  return (
    <>
      {cards.map((card, i) => {
        const angle = (i - (cards.length - 1) / 2) * 0.2;
        return (
          <Card3D
            key={card.id}
            cardData={card}
            position={[Math.sin(angle) * 5, -3, Math.cos(angle) * 5 - 8]}
            rotation={[0.3, angle, 0]}
            onClick={() => playCard(card)}
          />
        );
      })}
    </>
  );
}
```

### 11.3 Tutorial: Heads-Up Display (HUD) Over 3D Scene

**Concept:** A 3D game with 2D HUD rendered on top using separate render layers.

```typescript
// ═══════════════════════════════════════════════════════════════
// TUTORIAL: 2D HUD over 3D Game
// ═══════════════════════════════════════════════════════════════

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { LayerManager, SDFText, Sprite2D } from '@three-flatland/react';

function GameWithHUD() {
  const { gl, scene, camera } = useThree();
  const [layers] = useState(() => new LayerManager());

  // Create HUD layer with orthographic camera
  const [hudScene] = useState(() => new THREE.Scene());
  const [hudCamera] = useState(() =>
    new THREE.OrthographicCamera(0, window.innerWidth, window.innerHeight, 0, -1, 1)
  );

  const font = use(assets.hudFont);
  const healthBarSheet = use(assets.uiSheet);

  useFrame(() => {
    // Render 3D scene first
    gl.render(scene, camera);

    // Render 2D HUD on top (no depth clear)
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(hudScene, hudCamera);
    gl.autoClear = true;
  }, 1);

  return (
    <>
      {/* 3D game content */}
      <Player />
      <Enemies />
      <Environment />

      {/* 2D HUD (rendered in separate pass) */}
      {createPortal(
        <>
          {/* Health bar */}
          <sprite2D
            texture={healthBarSheet.texture}
            frame={healthBarSheet.getFrame('health_bg')}
            position={[20, 20, 0]}
          />
          <sprite2D
            texture={healthBarSheet.texture}
            frame={healthBarSheet.getFrame('health_fill')}
            position={[20, 20, 0]}
            scale={[playerHealth / 100, 1, 1]}
          />

          {/* Score */}
          <sDFText
            font={font}
            text={`Score: ${score}`}
            fontSize={24}
            position={[window.innerWidth - 150, 20, 0]}
          />

          {/* Minimap */}
          <Minimap position={[window.innerWidth - 120, window.innerHeight - 120, 0]} />
        </>,
        hudScene
      )}
    </>
  );
}
```

---

## 12. Milestone Plan

### Milestone Structure

Each milestone will be broken into a separate detailed document:

```
milestones/
├── M0-project-setup.md
├── M1-core-sprites.md
├── M2-animation-system.md
├── M3-tsl-nodes-part1.md
├── M4-tilemap-system.md
├── M5-render-layers.md
├── M6-tsl-nodes-part2.md
├── M7-batching-performance.md
├── M8-text-rendering.md
├── M9-r3f-integration.md
├── M10-presets-postprocess.md
└── M11-docs-launch.md
```

### Milestone Overview

| # | Name | Weeks | Key Deliverables |
|---|------|-------|------------------|
| M0 | Project Setup | 1 | Monorepo, build, CI/CD |
| M1 | Core Sprites | 2 | Sprite2D, Sprite2DMaterial, loaders |
| M2 | Animation | 2 | AnimatedSprite2D, animation system |
| M3 | TSL Nodes Part 1 | 3 | 15+ sprite/color/alpha nodes |
| M4 | Tilemaps | 3 | TileMap2D, Tiled/LDtk loaders |
| M5 | Render Layers | 2 | RenderLayer2D, LayerManager, z-ordering |
| M6 | TSL Nodes Part 2 | 3 | 20+ lighting/distortion/effect nodes |
| M7 | Batching | 2 | SpriteBatch, ParticleBatch, performance |
| M8 | Text Rendering | 4 | SDFText, BitmapText, CanvasText, Paragraph |
| M9 | R3F Integration | 1 | extend(), types, Suspense helpers |
| M10 | Presets & Post | 2 | Retro, HD, VFX presets, post-processing |
| M11 | Docs & Launch | 2 | Tutorials, API docs, npm publish |
| **Total** | | **27** | |

---

## 13. Technical Specifications

[Same as v2]

---

## Appendix E: Migration from Pixi.js

[To be added in milestone docs]

---

## Appendix F: Why Three.js-First?

### Benefits

1. **No Framework Lock-in** - Use with React, Vue, Svelte, vanilla JS, or anything else
2. **Smaller React Bundle** - React wrapper is ~2KB, not duplicating core
3. **Better Testing** - Test core classes without React/DOM
4. **Better TypeScript** - R3F gets full types via declaration merging
5. **R3F Best Practices** - Leverages reconciler as intended (extend + types)
6. **Modern React** - Can use latest React features (use, Suspense, compiler)
7. **Interop** - Easy to use in mixed Three.js/R3F projects

### Trade-offs

1. **Learning Curve** - Need to understand Three.js class patterns
2. **Imperative Available** - Some developers prefer pure declarative
3. **Refs Required** - For calling methods, need useRef

### Comparison: Hook-First vs Class-First

| Aspect | Hook-First | Class-First (Ours) |
|--------|------------|-------------------|
| React Required | Yes | No |
| Bundle Size | Larger (logic in hooks) | Smaller (logic in core) |
| Testing | Needs React | Plain JS/TS |
| Framework Support | React only | Any |
| R3F Integration | Custom | Standard (extend) |
| TypeScript | Custom types | Declaration merging |
| Code Duplication | High risk | None |

---

*End of PRD v3*
