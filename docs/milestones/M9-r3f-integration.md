# M9: React Three Fiber Integration

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 1 week |
| **Dependencies** | M1-M8 (All core features) |
| **Outputs** | Type augmentation, Resource system, useResource hook, helper hooks |
| **Risk Level** | Low |

---

## Objectives

1. Set up proper type augmentation for R3F's ThreeElements
2. Implement `Resource<T>` wrapper for Suspense integration
3. Create `useResource<T>()` hook with TypeScript generics using React 19's `use()`
4. Provide helpful hooks for common patterns (animation update, layer management)
5. Document canonical R3F patterns with three-flatland

**Note:** We do NOT create wrapper functions around `extend()`. Users call `extend({ Sprite2D, AnimatedSprite2D })` themselves - that's the canonical R3F pattern.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       R3F INTEGRATION ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   User Code (Canonical R3F Pattern)                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  import { extend } from '@react-three/fiber';                       │   │
│   │  import { Sprite2D, AnimatedSprite2D } from '@three-flatland/core'; │   │
│   │                                                                     │   │
│   │  extend({ Sprite2D, AnimatedSprite2D });                            │   │
│   │                                                                     │   │
│   │  // Now available in JSX:                                           │   │
│   │  <sprite2D texture={tex} />                                         │   │
│   │  <animatedSprite2D spriteSheet={sheet} />                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              │ types from                                   │
│                              ▼                                              │
│   Type Augmentation (@three-flatland/react)                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  declare module '@react-three/fiber' {                              │   │
│   │    interface ThreeElements {                                        │   │
│   │      sprite2D: Object3DNode<Sprite2D, typeof Sprite2D>              │   │
│   │      animatedSprite2D: Object3DNode<...>                            │   │
│   │      tilemap: Object3DNode<...>                                     │   │
│   │      text2D: Object3DNode<...>                                      │   │
│   │    }                                                                │   │
│   │  }                                                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              │ + value-add                                  │
│                              ▼                                              │
│   Resource System (React 19)                                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Resource<T>               - Suspense-compatible resource wrapper   │   │
│   │  useResource<T>()          - Hook using React 19 use()              │   │
│   │  spriteSheet(url)          - Create SpriteSheet resource            │   │
│   │  texture(url)              - Create Texture resource                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation

### 1. Type Augmentation

The primary deliverable - proper TypeScript types so `<sprite2D />` has full IntelliSense.

**packages/react/src/types.ts:**

```typescript
import type {
  Object3DNode,
  MaterialNode,
} from '@react-three/fiber';
import type {
  Sprite2D,
  AnimatedSprite2D,
  Sprite2DMaterial,
  SpriteBatchMaterial,
  TileMap2D,
  SDFText,
  BitmapText,
  CanvasText,
  NineSlice,
} from '@three-flatland/core';

/**
 * Module augmentation for R3F's ThreeElements.
 *
 * Import this module to get proper TypeScript types when using
 * three-flatland components in JSX.
 *
 * @example
 * ```tsx
 * // In your app's entry point:
 * import '@three-flatland/react'; // Side-effect import for types
 * import { extend } from '@react-three/fiber';
 * import { Sprite2D } from '@three-flatland/core';
 *
 * extend({ Sprite2D });
 *
 * // Now <sprite2D /> has full IntelliSense
 * ```
 */
declare module '@react-three/fiber' {
  interface ThreeElements {
    // Sprites
    sprite2D: Object3DNode<Sprite2D, typeof Sprite2D>;
    animatedSprite2D: Object3DNode<AnimatedSprite2D, typeof AnimatedSprite2D>;

    // Materials
    sprite2DMaterial: MaterialNode<Sprite2DMaterial, typeof Sprite2DMaterial>;
    spriteBatchMaterial: MaterialNode<SpriteBatchMaterial, typeof SpriteBatchMaterial>;

    // Tilemaps
    tileMap2D: Object3DNode<TileMap2D, typeof TileMap2D>;

    // Text
    sdfText: Object3DNode<SDFText, typeof SDFText>;
    bitmapText: Object3DNode<BitmapText, typeof BitmapText>;
    canvasText: Object3DNode<CanvasText, typeof CanvasText>;

    // UI
    nineSlice: Object3DNode<NineSlice, typeof NineSlice>;
  }
}

// Re-export core types for convenience
export type {
  Sprite2D,
  AnimatedSprite2D,
  Sprite2DMaterial,
  SpriteBatchMaterial,
  TileMap2D,
  SDFText,
  BitmapText,
  CanvasText,
  NineSlice,
} from '@three-flatland/core';
```

---

### 2. Resource System with React 19 Patterns

**packages/react/src/resource.ts:**

```typescript
import { use, useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import {
  SpriteSheetLoader,
  type SpriteSheet,
} from '@three-flatland/core';
import { TextureLoader, type Texture, type LoadingManager } from 'three';

/**
 * Resource status.
 */
export type ResourceStatus = 'pending' | 'fulfilled' | 'rejected';

/**
 * A Suspense-compatible resource wrapper.
 *
 * Resources DON'T throw - they wrap a promise that can be
 * unwrapped with React 19's `use()` hook via `useResource()`.
 */
export interface Resource<T> {
  /** The underlying promise */
  readonly promise: Promise<T>;
  /** Current status */
  readonly status: ResourceStatus;
  /** Resolved value (only available when fulfilled) */
  readonly value: T | undefined;
  /** Error (only available when rejected) */
  readonly error: Error | undefined;
  /** Convenience getter for checking if loaded */
  readonly isLoaded: boolean;
  /** Subscribe to status changes (for useSyncExternalStore) */
  subscribe(callback: () => void): () => void;
}

/**
 * Create a Suspense-compatible resource from a promise.
 *
 * @example
 * ```tsx
 * // Create resource outside component (module scope)
 * const playerSheetResource = createResource(
 *   SpriteSheetLoader.load('/sprites/player.json')
 * );
 *
 * // Use in component with Suspense
 * function Player() {
 *   const sheet = useResource(playerSheetResource);
 *   return <sprite2D texture={sheet.texture} />;
 * }
 * ```
 */
export function createResource<T>(promise: Promise<T>): Resource<T> {
  let status: ResourceStatus = 'pending';
  let value: T | undefined;
  let error: Error | undefined;
  const subscribers = new Set<() => void>();

  const notifySubscribers = () => {
    for (const callback of subscribers) {
      callback();
    }
  };

  promise.then(
    (result) => {
      status = 'fulfilled';
      value = result;
      notifySubscribers();
    },
    (err) => {
      status = 'rejected';
      error = err instanceof Error ? err : new Error(String(err));
      notifySubscribers();
    }
  );

  return {
    promise,
    get status() { return status; },
    get value() { return value; },
    get error() { return error; },
    get isLoaded() { return status === 'fulfilled'; },
    subscribe(callback: () => void) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}

/**
 * Use a resource with React 19's use() hook.
 *
 * This hook integrates with Suspense - the component will suspend
 * until the resource is loaded.
 *
 * @example
 * ```tsx
 * const playerSheet = spriteSheet('/sprites/player.json');
 *
 * function Player() {
 *   const sheet = useResource(playerSheet);
 *   // sheet is guaranteed to be loaded here
 *   return <sprite2D texture={sheet.texture} />;
 * }
 *
 * // Wrap in Suspense
 * <Suspense fallback={<LoadingSpinner />}>
 *   <Player />
 * </Suspense>
 * ```
 */
export function useResource<T>(resource: Resource<T>): T {
  return use(resource.promise);
}

/**
 * Use a resource without Suspense (returns loading state).
 *
 * For when you want to handle loading states manually.
 *
 * @example
 * ```tsx
 * function Player() {
 *   const { data, isLoading, error } = useResourceState(playerSheet);
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   return <sprite2D texture={data.texture} />;
 * }
 * ```
 */
export function useResourceState<T>(resource: Resource<T>): {
  data: T | undefined;
  isLoading: boolean;
  error: Error | undefined;
} {
  const getSnapshot = () => ({
    status: resource.status,
    value: resource.value,
    error: resource.error,
  });

  const state = useSyncExternalStore(
    resource.subscribe,
    getSnapshot,
    getSnapshot
  );

  return {
    data: state.value,
    isLoading: state.status === 'pending',
    error: state.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a SpriteSheet resource.
 *
 * @example
 * ```tsx
 * // Module scope
 * const playerSheet = spriteSheet('/sprites/player.json');
 *
 * function Player() {
 *   const sheet = useResource(playerSheet);
 *   return <animatedSprite2D spriteSheet={sheet} />;
 * }
 * ```
 */
export function spriteSheet(url: string): Resource<SpriteSheet> {
  return createResource(SpriteSheetLoader.load(url));
}

/**
 * Create a Texture resource.
 *
 * @example
 * ```tsx
 * const bgTexture = texture('/images/background.png');
 *
 * function Background() {
 *   const tex = useResource(bgTexture);
 *   return <sprite2D texture={tex} />;
 * }
 * ```
 */
export function texture(url: string, manager?: LoadingManager): Resource<Texture> {
  const loader = new TextureLoader(manager);
  return createResource(loader.loadAsync(url));
}

/**
 * Preload multiple resources.
 *
 * Returns a Resource that resolves when all resources are loaded.
 *
 * @example
 * ```tsx
 * const assets = preloadAll([
 *   spriteSheet('/sprites/player.json'),
 *   spriteSheet('/sprites/enemies.json'),
 *   texture('/images/background.png'),
 * ]);
 *
 * function Game() {
 *   useResource(assets); // Suspends until all loaded
 *   return <GameContent />;
 * }
 * ```
 */
export function preloadAll<T extends readonly Resource<unknown>[]>(
  resources: T
): Resource<{ [K in keyof T]: T[K] extends Resource<infer U> ? U : never }> {
  const promise = Promise.all(
    resources.map((r) => r.promise)
  ) as Promise<{ [K in keyof T]: T[K] extends Resource<infer U> ? U : never }>;

  return createResource(promise);
}

// ─────────────────────────────────────────────────────────────────────────────
// Caching
// ─────────────────────────────────────────────────────────────────────────────

const resourceCache = new Map<string, Resource<unknown>>();

/**
 * Get or create a cached spritesheet resource.
 */
export function cachedSpriteSheet(url: string): Resource<SpriteSheet> {
  if (!resourceCache.has(url)) {
    resourceCache.set(url, spriteSheet(url));
  }
  return resourceCache.get(url) as Resource<SpriteSheet>;
}

/**
 * Get or create a cached texture resource.
 */
export function cachedTexture(url: string): Resource<Texture> {
  const key = `texture:${url}`;
  if (!resourceCache.has(key)) {
    resourceCache.set(key, texture(url));
  }
  return resourceCache.get(key) as Resource<Texture>;
}

/**
 * Clear the resource cache.
 */
export function clearResourceCache(): void {
  resourceCache.clear();
}

/**
 * Preload resources (starts loading without rendering).
 */
export function preload(...resources: Resource<unknown>[]): Promise<void> {
  return Promise.all(resources.map((r) => r.promise)).then(() => undefined);
}
```

---

### 3. Helper Hooks

Useful hooks for common patterns - these add value beyond just `extend()`.

**packages/react/src/hooks.ts:**

```typescript
import { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type {
  AnimatedSprite2D,
  Renderer2D,
  AnimationController,
  Sprite2D,
} from '@three-flatland/core';

/**
 * Hook to auto-update an AnimatedSprite2D each frame.
 *
 * @example
 * ```tsx
 * function Player() {
 *   const ref = useRef<AnimatedSprite2D>(null);
 *   useAnimationUpdate(ref);
 *
 *   return <animatedSprite2D ref={ref} spriteSheet={sheet} />;
 * }
 * ```
 */
export function useAnimationUpdate(
  ref: React.RefObject<AnimatedSprite2D | null>
): void {
  useFrame((_, delta) => {
    ref.current?.update(delta * 1000);
  });
}

/**
 * Hook to play animations imperatively.
 *
 * @example
 * ```tsx
 * function Player({ isWalking }: { isWalking: boolean }) {
 *   const ref = useRef<AnimatedSprite2D>(null);
 *   const play = useAnimation(ref);
 *
 *   useEffect(() => {
 *     play(isWalking ? 'walk' : 'idle');
 *   }, [isWalking, play]);
 *
 *   return <animatedSprite2D ref={ref} spriteSheet={sheet} />;
 * }
 * ```
 */
export function useAnimation(
  ref: React.RefObject<AnimatedSprite2D | null>
): (name: string, options?: Parameters<AnimationController['play']>[1]) => void {
  return useCallback(
    (name: string, options?) => {
      ref.current?.play(name, options);
    },
    []
  );
}

/**
 * Hook for Y-sorting (isometric/top-down games).
 *
 * Automatically updates zIndex based on Y position each frame.
 *
 * @example
 * ```tsx
 * function Entity() {
 *   const ref = useRef<Sprite2D>(null);
 *   useYSort(ref);
 *
 *   return <sprite2D ref={ref} position={[x, y, 0]} />;
 * }
 * ```
 */
export function useYSort(
  ref: React.RefObject<Sprite2D | null>,
  layer?: number
): void {
  useFrame(() => {
    if (ref.current) {
      ref.current.zIndex = ref.current.position.y;
      if (layer !== undefined) {
        ref.current.layer = layer;
      }
    }
  });
}

/**
 * Hook for orthographic camera setup (2D games).
 *
 * @example
 * ```tsx
 * function Game() {
 *   useOrthoCamera(800, 600);
 *   return <GameContent />;
 * }
 * ```
 */
export function useOrthoCamera(width: number, height: number): void {
  const { camera } = useThree();

  useEffect(() => {
    if ('isOrthographicCamera' in camera && camera.isOrthographicCamera) {
      camera.left = 0;
      camera.right = width;
      camera.top = height;
      camera.bottom = 0;
      camera.updateProjectionMatrix();
    }
  }, [camera, width, height]);
}

/**
 * Hook for pixel-perfect rendering.
 *
 * Disables antialiasing and sets pixel ratio to 1.
 */
export function usePixelPerfect(): void {
  const { gl } = useThree();

  useEffect(() => {
    gl.setPixelRatio(1);
  }, [gl]);
}
```

---

### 4. Package Exports

**packages/react/src/index.ts:**

```typescript
// Type augmentation (side-effect import)
import './types';

// Resource system
export {
  createResource,
  useResource,
  useResourceState,
  spriteSheet,
  texture,
  preloadAll,
  preload,
  cachedSpriteSheet,
  cachedTexture,
  clearResourceCache,
  type Resource,
  type ResourceStatus,
} from './resource';

// Hooks
export {
  useAnimationUpdate,
  useAnimation,
  useYSort,
  useOrthoCamera,
  usePixelPerfect,
} from './hooks';

// Re-export core for convenience
export * from '@three-flatland/core';
```

---

### 5. Tests

**packages/react/src/resource.test.ts:**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createResource, preloadAll } from './resource';

describe('createResource', () => {
  it('should create a resource with pending status', () => {
    const promise = new Promise(() => {});
    const resource = createResource(promise);

    expect(resource.status).toBe('pending');
    expect(resource.isLoaded).toBe(false);
    expect(resource.value).toBeUndefined();
  });

  it('should resolve to fulfilled status', async () => {
    const promise = Promise.resolve('test value');
    const resource = createResource(promise);

    await promise;

    expect(resource.status).toBe('fulfilled');
    expect(resource.isLoaded).toBe(true);
    expect(resource.value).toBe('test value');
  });

  it('should reject to rejected status', async () => {
    const error = new Error('test error');
    const promise = Promise.reject(error);
    const resource = createResource(promise);

    await promise.catch(() => {});

    expect(resource.status).toBe('rejected');
    expect(resource.error).toBe(error);
  });

  it('should notify subscribers on state change', async () => {
    const promise = Promise.resolve('value');
    const resource = createResource(promise);
    const callback = vi.fn();

    resource.subscribe(callback);
    await promise;

    expect(callback).toHaveBeenCalled();
  });
});

describe('preloadAll', () => {
  it('should resolve when all resources are loaded', async () => {
    const resource1 = createResource(Promise.resolve('a'));
    const resource2 = createResource(Promise.resolve('b'));

    const combined = preloadAll([resource1, resource2]);

    await combined.promise;

    expect(combined.isLoaded).toBe(true);
    expect(combined.value).toEqual(['a', 'b']);
  });
});
```

---

## Acceptance Criteria

- [ ] Type augmentation provides full IntelliSense for all components
- [ ] `useResource<T>()` correctly infers types from `Resource<T>`
- [ ] Suspense boundaries work correctly with resources
- [ ] Helper hooks (`useAnimationUpdate`, `useYSort`, etc.) work correctly
- [ ] No unnecessary wrapper functions around `extend()`
- [ ] Examples demonstrate canonical R3F patterns
- [ ] All tests pass
- [ ] TypeScript strict mode compatibility

---

## Example Usage

**Canonical R3F Pattern:**

```tsx
import { Canvas } from '@react-three/fiber';
import { extend } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import {
  Sprite2D,
  AnimatedSprite2D,
  Layers,
} from '@three-flatland/core';
import {
  useResource,
  useAnimationUpdate,
  useYSort,
  spriteSheet,
  texture,
} from '@three-flatland/react';
import type { AnimatedSprite2D as AnimatedSprite2DType } from '@three-flatland/core';

// Extend R3F (canonical pattern - no wrappers needed)
extend({ Sprite2D, AnimatedSprite2D });

// Create resources at module scope
const playerSheet = spriteSheet('/sprites/player.json');
const backgroundTex = texture('/images/background.png');

function Player({ x, y }: { x: number; y: number }) {
  const ref = useRef<AnimatedSprite2DType>(null);
  const sheet = useResource(playerSheet);

  // Auto-update animation
  useAnimationUpdate(ref);

  // Y-sort for proper depth
  useYSort(ref, Layers.ENTITIES);

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={sheet}
      animationSet={{
        animations: {
          idle: { frames: ['player_idle_0', 'player_idle_1'], fps: 8 },
          walk: { frames: ['player_walk_0', 'player_walk_1'], fps: 12 },
        },
      }}
      animation="idle"
      position={[x, y, 0]}
      anchor={[0.5, 1]}
    />
  );
}

function Background() {
  const tex = useResource(backgroundTex);
  return (
    <sprite2D
      texture={tex}
      position={[400, 300, 0]}
      layer={Layers.BACKGROUND}
    />
  );
}

export default function App() {
  return (
    <Canvas
      orthographic
      camera={{
        left: 0, right: 800,
        top: 600, bottom: 0,
        near: -1000, far: 1000,
        position: [400, 300, 100],
      }}
    >
      <Suspense fallback={null}>
        <Background />
        <Player x={400} y={300} />
      </Suspense>
    </Canvas>
  );
}
```

---

## What This Package Does NOT Include

- ❌ `extendSprite2D()`, `extendAll()` - Users call `extend()` themselves
- ❌ Wrapper components that hide Three.js classes
- ❌ State management (use your own)
- ❌ Physics integration (use rapier, cannon, etc.)

The React package is intentionally minimal - it provides types, resources, and hooks. Everything else follows canonical R3F patterns.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| React 19 `use()` API changes | Low | Medium | Monitor React RCs |
| R3F version compatibility | Medium | Medium | Test with multiple versions |
| Type inference edge cases | Low | Low | Comprehensive type tests |

---

## Dependencies for Next Milestone

M10 (Render Targets) requires:
- ✅ Working R3F integration for component testing

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type augmentation | 2 |
| Resource system | 4 |
| useResource + useResourceState | 2 |
| Helper hooks | 2 |
| Tests | 3 |
| Examples | 2 |
| Documentation | 2 |
| **Total** | **17 hours** (~1 week) |

---

*End of M9: React Three Fiber Integration*
