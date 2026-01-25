# M10: Render Targets

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 1 week |
| **Dependencies** | M3 (2D Render Pipeline), M9 (R3F Integration) |
| **Outputs** | RenderTarget2D class, 2D-on-3D rendering, Examples |
| **Risk Level** | Medium (render pipeline integration) |

---

## Objectives

1. Implement `RenderTarget2D` class for offscreen 2D rendering
2. Enable 2D content rendered onto 3D geometry (texture projection)
3. Create examples: platformer on cylinder, card game faces
4. Integrate with R3F for declarative usage
5. Support dynamic resolution and pixel-perfect scaling

---

## Architecture

```
+---------------------------------------------------------------------------+
|                       RENDER TARGET ARCHITECTURE                           |
+---------------------------------------------------------------------------+
|                                                                           |
|   RenderTarget2D                                                          |
|   +-------------------------------------------------------------------+   |
|   |  - WebGLRenderTarget / WebGPURenderTarget                         |   |
|   |  - Orthographic camera (managed)                                  |   |
|   |  - Renderer2D instance (batched 2D rendering)                     |   |
|   |  - Auto-resize support                                            |   |
|   |  - Pixel-perfect scaling options                                  |   |
|   +-------------------------------------------------------------------+   |
|                              |                                            |
|                              v                                            |
|   Usage Patterns                                                          |
|   +-------------------------------------------------------------------+   |
|   |  1. Standalone texture:                                           |   |
|   |     renderTarget.render(renderer) -> texture                      |   |
|   |                                                                   |   |
|   |  2. Applied to 3D mesh:                                           |   |
|   |     <mesh material-map={renderTarget.texture} />                  |   |
|   |                                                                   |   |
|   |  3. Post-processing input:                                        |   |
|   |     effectComposer.addPass(new RenderPass(renderTarget))          |   |
|   +-------------------------------------------------------------------+   |
|                              |                                            |
|                              v                                            |
|   R3F Integration                                                         |
|   +-------------------------------------------------------------------+   |
|   |  <RenderTarget2DProvider>                                         |   |
|   |    - Provides render target context                               |   |
|   |    - Auto-manages lifecycle                                       |   |
|   |                                                                   |   |
|   |  <RenderTarget2DContent>                                          |   |
|   |    - Children rendered to target                                  |   |
|   |                                                                   |   |
|   |  useRenderTarget2D()                                              |   |
|   |    - Access texture for use on 3D geometry                        |   |
|   +-------------------------------------------------------------------+   |
|                                                                           |
+---------------------------------------------------------------------------+
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/targets/types.ts:**

```typescript
import type { Camera, WebGLRenderer, Texture, Vector2 } from 'three';
import type { Renderer2D } from '../pipeline/Renderer2D';

/**
 * Render target options.
 */
export interface RenderTarget2DOptions {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Pixel ratio (default: 1 for pixel art) */
  pixelRatio?: number;
  /** Whether to auto-resize with container */
  autoResize?: boolean;
  /** Whether to use linear filtering (false = nearest for pixel art) */
  linearFiltering?: boolean;
  /** Background color (null = transparent) */
  backgroundColor?: number | null;
  /** Background alpha (0-1) */
  backgroundAlpha?: number;
  /** Enable depth buffer */
  depthBuffer?: boolean;
  /** Enable stencil buffer */
  stencilBuffer?: boolean;
  /** Number of samples for MSAA (0 = disabled) */
  samples?: number;
}

/**
 * Render target state.
 */
export interface RenderTarget2DState {
  /** Current width */
  width: number;
  /** Current height */
  height: number;
  /** Whether target needs update */
  needsUpdate: boolean;
  /** Last render time */
  lastRenderTime: number;
}

/**
 * Callback for render target updates.
 */
export type RenderCallback = (
  renderer: WebGLRenderer,
  camera: Camera,
  renderer2D: Renderer2D
) => void;
```

---

### 2. RenderTarget2D Class

**packages/core/src/targets/RenderTarget2D.ts:**

```typescript
import {
  WebGLRenderTarget,
  OrthographicCamera,
  Color,
  NearestFilter,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  type WebGLRenderer,
  type Texture,
} from 'three';
import { Renderer2D } from '../pipeline/Renderer2D';
import type { RenderTarget2DOptions, RenderTarget2DState } from './types';
import type { Sprite2D } from '../sprites/Sprite2D';

/**
 * Offscreen render target for 2D content.
 *
 * Enables rendering 2D sprites to a texture that can be applied
 * to 3D geometry, used in post-processing, or displayed directly.
 *
 * @example
 * ```typescript
 * // Create render target
 * const target = new RenderTarget2D({
 *   width: 256,
 *   height: 256,
 *   linearFiltering: false, // Pixel art
 * });
 *
 * // Add sprites
 * target.add(mySprite);
 *
 * // Render to texture
 * target.render(renderer);
 *
 * // Use texture on 3D mesh
 * mesh.material.map = target.texture;
 * ```
 */
export class RenderTarget2D {
  /** The underlying WebGL render target */
  readonly renderTarget: WebGLRenderTarget;

  /** Orthographic camera for 2D rendering */
  readonly camera: OrthographicCamera;

  /** 2D renderer instance */
  readonly renderer2D: Renderer2D;

  /** Options used to create this target */
  readonly options: Required<RenderTarget2DOptions>;

  private _state: RenderTarget2DState;
  private backgroundColor: Color | null;
  private backgroundAlpha: number;
  private previousRenderTarget: WebGLRenderTarget | null = null;
  private previousClearColor = new Color();
  private previousClearAlpha: number = 1;

  constructor(options: RenderTarget2DOptions) {
    this.options = {
      width: options.width,
      height: options.height,
      pixelRatio: options.pixelRatio ?? 1,
      autoResize: options.autoResize ?? false,
      linearFiltering: options.linearFiltering ?? false,
      backgroundColor: options.backgroundColor ?? null,
      backgroundAlpha: options.backgroundAlpha ?? 0,
      depthBuffer: options.depthBuffer ?? false,
      stencilBuffer: options.stencilBuffer ?? false,
      samples: options.samples ?? 0,
    };

    const actualWidth = this.options.width * this.options.pixelRatio;
    const actualHeight = this.options.height * this.options.pixelRatio;

    // Create render target
    this.renderTarget = new WebGLRenderTarget(actualWidth, actualHeight, {
      format: RGBAFormat,
      type: UnsignedByteType,
      minFilter: this.options.linearFiltering ? LinearFilter : NearestFilter,
      magFilter: this.options.linearFiltering ? LinearFilter : NearestFilter,
      depthBuffer: this.options.depthBuffer,
      stencilBuffer: this.options.stencilBuffer,
      samples: this.options.samples,
      generateMipmaps: false,
    });

    // Create orthographic camera
    this.camera = new OrthographicCamera(
      0, this.options.width,
      this.options.height, 0,
      -1000, 1000
    );
    this.camera.position.set(
      this.options.width / 2,
      this.options.height / 2,
      100
    );

    // Create 2D renderer
    this.renderer2D = new Renderer2D();

    // Background
    this.backgroundColor = this.options.backgroundColor !== null
      ? new Color(this.options.backgroundColor)
      : null;
    this.backgroundAlpha = this.options.backgroundAlpha;

    // State
    this._state = {
      width: this.options.width,
      height: this.options.height,
      needsUpdate: true,
      lastRenderTime: 0,
    };
  }

  /**
   * Get the texture from this render target.
   */
  get texture(): Texture {
    return this.renderTarget.texture;
  }

  /**
   * Get current state.
   */
  get state(): Readonly<RenderTarget2DState> {
    return this._state;
  }

  /**
   * Get width.
   */
  get width(): number {
    return this._state.width;
  }

  /**
   * Get height.
   */
  get height(): number {
    return this._state.height;
  }

  /**
   * Add a sprite to be rendered.
   */
  add(sprite: Sprite2D): this {
    this.renderer2D.add(sprite);
    this._state.needsUpdate = true;
    return this;
  }

  /**
   * Remove a sprite.
   */
  remove(sprite: Sprite2D): this {
    this.renderer2D.remove(sprite);
    this._state.needsUpdate = true;
    return this;
  }

  /**
   * Resize the render target.
   */
  resize(width: number, height: number): this {
    if (width === this._state.width && height === this._state.height) {
      return this;
    }

    const actualWidth = width * this.options.pixelRatio;
    const actualHeight = height * this.options.pixelRatio;

    this.renderTarget.setSize(actualWidth, actualHeight);

    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = height;
    this.camera.bottom = 0;
    this.camera.position.set(width / 2, height / 2, 100);
    this.camera.updateProjectionMatrix();

    this._state.width = width;
    this._state.height = height;
    this._state.needsUpdate = true;

    return this;
  }

  /**
   * Set background color.
   */
  setBackgroundColor(color: number | null, alpha?: number): this {
    this.backgroundColor = color !== null ? new Color(color) : null;
    if (alpha !== undefined) {
      this.backgroundAlpha = alpha;
    }
    this._state.needsUpdate = true;
    return this;
  }

  /**
   * Render to the target.
   */
  render(renderer: WebGLRenderer): void {
    // Save current state
    this.previousRenderTarget = renderer.getRenderTarget();
    renderer.getClearColor(this.previousClearColor);
    this.previousClearAlpha = renderer.getClearAlpha();

    // Set render target
    renderer.setRenderTarget(this.renderTarget);

    // Clear with background
    if (this.backgroundColor) {
      renderer.setClearColor(this.backgroundColor, this.backgroundAlpha);
    } else {
      renderer.setClearColor(0x000000, 0);
    }
    renderer.clear();

    // Render 2D content
    this.renderer2D.render(renderer, this.camera);

    // Restore previous state
    renderer.setRenderTarget(this.previousRenderTarget);
    renderer.setClearColor(this.previousClearColor, this.previousClearAlpha);

    // Update state
    this._state.needsUpdate = false;
    this._state.lastRenderTime = performance.now();
  }

  /**
   * Render only if needed (dirty check).
   */
  renderIfNeeded(renderer: WebGLRenderer): boolean {
    if (this._state.needsUpdate) {
      this.render(renderer);
      return true;
    }
    return false;
  }

  /**
   * Mark as needing update.
   */
  invalidate(): this {
    this._state.needsUpdate = true;
    return this;
  }

  /**
   * Create a material map-compatible texture.
   * Useful for applying to mesh materials.
   */
  createMaterialTexture(): Texture {
    const tex = this.renderTarget.texture.clone();
    tex.flipY = true; // Standard texture orientation
    return tex;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.renderTarget.dispose();
    this.renderer2D.dispose();
  }
}
```

---

### 3. Render Target Manager

**packages/core/src/targets/RenderTargetManager.ts:**

```typescript
import type { WebGLRenderer } from 'three';
import { RenderTarget2D } from './RenderTarget2D';
import type { RenderTarget2DOptions } from './types';

/**
 * Manages multiple render targets with pooling and lifecycle.
 *
 * @example
 * ```typescript
 * const manager = new RenderTargetManager();
 *
 * // Create or reuse targets
 * const cardFront = manager.acquire('card-front', { width: 128, height: 192 });
 * const cardBack = manager.acquire('card-back', { width: 128, height: 192 });
 *
 * // Render all
 * manager.renderAll(renderer);
 *
 * // Release when done
 * manager.release('card-front');
 * ```
 */
export class RenderTargetManager {
  private targets: Map<string, RenderTarget2D> = new Map();
  private pool: RenderTarget2D[] = [];

  /**
   * Acquire a render target by name.
   * Creates a new one or returns existing.
   */
  acquire(name: string, options: RenderTarget2DOptions): RenderTarget2D {
    let target = this.targets.get(name);

    if (!target) {
      // Try to get from pool
      target = this.pool.pop();

      if (target) {
        target.resize(options.width, options.height);
      } else {
        target = new RenderTarget2D(options);
      }

      this.targets.set(name, target);
    }

    return target;
  }

  /**
   * Get a render target by name.
   */
  get(name: string): RenderTarget2D | undefined {
    return this.targets.get(name);
  }

  /**
   * Release a render target back to pool.
   */
  release(name: string): void {
    const target = this.targets.get(name);
    if (target) {
      this.targets.delete(name);
      // Clear sprites
      // target.clear(); // Would need to implement
      this.pool.push(target);
    }
  }

  /**
   * Render all targets.
   */
  renderAll(renderer: WebGLRenderer): void {
    for (const target of this.targets.values()) {
      target.render(renderer);
    }
  }

  /**
   * Render only dirty targets.
   */
  renderDirty(renderer: WebGLRenderer): number {
    let count = 0;
    for (const target of this.targets.values()) {
      if (target.renderIfNeeded(renderer)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Invalidate all targets (mark as needing render).
   */
  invalidateAll(): void {
    for (const target of this.targets.values()) {
      target.invalidate();
    }
  }

  /**
   * Get all target names.
   */
  getNames(): string[] {
    return Array.from(this.targets.keys());
  }

  /**
   * Get statistics.
   */
  getStats(): { active: number; pooled: number } {
    return {
      active: this.targets.size,
      pooled: this.pool.length,
    };
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    for (const target of this.targets.values()) {
      target.dispose();
    }
    for (const target of this.pool) {
      target.dispose();
    }
    this.targets.clear();
    this.pool = [];
  }
}
```

---

### 4. R3F Components

**packages/react/src/targets/RenderTarget2DContext.tsx:**

```tsx
import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import {
  RenderTarget2D,
  RenderTargetManager,
  type RenderTarget2DOptions,
} from '@three-flatland/core';

/**
 * Context for render target.
 */
interface RenderTarget2DContextValue {
  target: RenderTarget2D;
  texture: THREE.Texture;
}

const RenderTarget2DContext = createContext<RenderTarget2DContextValue | null>(null);

/**
 * Provider props.
 */
export interface RenderTarget2DProviderProps extends RenderTarget2DOptions {
  /** Unique name for this render target */
  name: string;
  /** Children to render to target */
  children: ReactNode;
  /** Whether to auto-render each frame */
  autoRender?: boolean;
  /** Render priority (for useFrame ordering) */
  priority?: number;
}

/**
 * Provides a render target context for children.
 *
 * @example
 * ```tsx
 * <RenderTarget2DProvider name="card" width={128} height={192}>
 *   <CardContent />
 * </RenderTarget2DProvider>
 *
 * // Use the texture elsewhere
 * function CardMesh() {
 *   const { texture } = useRenderTarget2D();
 *   return (
 *     <mesh>
 *       <planeGeometry args={[1, 1.5]} />
 *       <meshBasicMaterial map={texture} />
 *     </mesh>
 *   );
 * }
 * ```
 */
export function RenderTarget2DProvider({
  name,
  children,
  autoRender = true,
  priority = 0,
  ...options
}: RenderTarget2DProviderProps) {
  const { gl } = useThree();
  const targetRef = useRef<RenderTarget2D | null>(null);

  // Create render target
  if (!targetRef.current) {
    targetRef.current = new RenderTarget2D(options);
  }
  const target = targetRef.current;

  // Auto-render each frame
  useFrame(() => {
    if (autoRender && target) {
      target.render(gl);
    }
  }, priority);

  // Cleanup
  useEffect(() => {
    return () => {
      target?.dispose();
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      target,
      texture: target.texture,
    }),
    [target]
  );

  return (
    <RenderTarget2DContext.Provider value={contextValue}>
      {children}
    </RenderTarget2DContext.Provider>
  );
}

/**
 * Hook to access render target context.
 */
export function useRenderTarget2D(): RenderTarget2DContextValue {
  const context = useContext(RenderTarget2DContext);
  if (!context) {
    throw new Error('useRenderTarget2D must be used within a RenderTarget2DProvider');
  }
  return context;
}

/**
 * Hook to access just the texture.
 */
export function useRenderTarget2DTexture(): THREE.Texture {
  return useRenderTarget2D().texture;
}

/**
 * Component that renders children to the render target.
 * Used within RenderTarget2DProvider.
 */
export function RenderTarget2DContent({
  children,
}: {
  children: ReactNode;
}) {
  const { target } = useRenderTarget2D();

  // Children are added to the target's renderer2D
  // This requires custom portal-like behavior

  return <>{children}</>;
}
```

---

### 5. Exports

**packages/core/src/targets/index.ts:**

```typescript
export { RenderTarget2D } from './RenderTarget2D';
export { RenderTargetManager } from './RenderTargetManager';
export type {
  RenderTarget2DOptions,
  RenderTarget2DState,
  RenderCallback,
} from './types';
```

**packages/react/src/targets/index.ts:**

```typescript
export {
  RenderTarget2DProvider,
  useRenderTarget2D,
  useRenderTarget2DTexture,
  RenderTarget2DContent,
  type RenderTarget2DProviderProps,
} from './RenderTarget2DContext';
```

---

### 6. Tests

**packages/core/src/targets/RenderTarget2D.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Texture } from 'three';
import { RenderTarget2D } from './RenderTarget2D';
import { Sprite2D } from '../sprites/Sprite2D';

describe('RenderTarget2D', () => {
  let target: RenderTarget2D;

  beforeEach(() => {
    target = new RenderTarget2D({
      width: 256,
      height: 256,
    });
  });

  it('should create with correct dimensions', () => {
    expect(target.width).toBe(256);
    expect(target.height).toBe(256);
  });

  it('should provide texture', () => {
    expect(target.texture).toBeDefined();
    expect(target.texture.image).toBeDefined();
  });

  it('should resize correctly', () => {
    target.resize(512, 512);

    expect(target.width).toBe(512);
    expect(target.height).toBe(512);
    expect(target.state.needsUpdate).toBe(true);
  });

  it('should add and remove sprites', () => {
    const texture = new Texture();
    texture.image = { width: 32, height: 32 };
    const sprite = new Sprite2D({ texture });

    target.add(sprite);
    expect(target.renderer2D.spriteCount).toBe(1);

    target.remove(sprite);
    expect(target.renderer2D.spriteCount).toBe(0);
  });

  it('should track needsUpdate state', () => {
    expect(target.state.needsUpdate).toBe(true);

    // After render, should be false
    // (would need mock renderer to test)
  });

  it('should invalidate correctly', () => {
    target.invalidate();
    expect(target.state.needsUpdate).toBe(true);
  });

  it('should handle pixel ratio', () => {
    const hdTarget = new RenderTarget2D({
      width: 256,
      height: 256,
      pixelRatio: 2,
    });

    expect(hdTarget.width).toBe(256);
    // Actual render target size is 512x512
    expect(hdTarget.renderTarget.width).toBe(512);
    expect(hdTarget.renderTarget.height).toBe(512);
  });

  it('should use nearest filter for pixel art by default', () => {
    const pixelTarget = new RenderTarget2D({
      width: 64,
      height: 64,
      linearFiltering: false,
    });

    expect(pixelTarget.renderTarget.texture.minFilter).toBe(1003); // NearestFilter
    expect(pixelTarget.renderTarget.texture.magFilter).toBe(1003);
  });
});
```

---

## Examples

### Example 1: Platformer on Cylinder

```typescript
import * as THREE from 'three';
import {
  RenderTarget2D,
  AnimatedSprite2D,
  SpriteSheetLoader,
  Layers,
} from '@three-flatland/core';

// Create render target for the platformer scene
const platformerTarget = new RenderTarget2D({
  width: 512,
  height: 256,
  linearFiltering: false,
  backgroundColor: 0x87CEEB, // Sky blue
});

// Load assets
const playerSheet = await SpriteSheetLoader.load('/sprites/player.json');
const tilesSheet = await SpriteSheetLoader.load('/sprites/tiles.json');

// Create player
const player = new AnimatedSprite2D({
  spriteSheet: playerSheet,
  animation: 'run',
  layer: Layers.ENTITIES,
});
player.position.set(256, 128, 0);
platformerTarget.add(player);

// Create ground tiles
for (let x = 0; x < 512; x += 32) {
  const tile = new Sprite2D({
    texture: tilesSheet.texture,
    frame: tilesSheet.getFrame('grass_top'),
    layer: Layers.GROUND,
  });
  tile.position.set(x + 16, 16, 0);
  platformerTarget.add(tile);
}

// Create cylinder with platformer texture
const cylinderGeometry = new THREE.CylinderGeometry(2, 2, 4, 32);
const cylinderMaterial = new THREE.MeshBasicMaterial({
  map: platformerTarget.texture,
});
const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);

// Animation loop
function animate() {
  // Update player animation
  player.update(16);

  // Scroll the level
  for (const sprite of platformerTarget.renderer2D.sprites) {
    // Would need to expose sprites or use different pattern
  }

  // Render to texture
  platformerTarget.render(renderer);

  // Rotate cylinder
  cylinder.rotation.y += 0.01;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

### Example 2: Card Game with Dynamic Faces

```tsx
// React Three Fiber version
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import {
  extendAll,
  RenderTarget2DProvider,
  useRenderTarget2DTexture,
  spriteSheet,
  useResource,
} from '@three-flatland/react';

extendAll();

const cardSheet = spriteSheet('/sprites/cards.json');

// Card face content (rendered to texture)
function CardFace({ suit, value }: { suit: string; value: string }) {
  const sheet = useResource(cardSheet);

  return (
    <>
      {/* Card background */}
      <sprite2D
        texture={sheet.texture}
        frame={sheet.getFrame('card_bg')}
        position={[64, 96, 0]}
      />

      {/* Suit symbol */}
      <sprite2D
        texture={sheet.texture}
        frame={sheet.getFrame(`suit_${suit}`)}
        position={[64, 96, 0]}
      />

      {/* Value */}
      <sprite2D
        texture={sheet.texture}
        frame={sheet.getFrame(`value_${value}`)}
        position={[20, 160, 0]}
      />
    </>
  );
}

// 3D card mesh using the render target texture
function Card3D({ position }: { position: [number, number, number] }) {
  const texture = useRenderTarget2DTexture();
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <planeGeometry args={[1, 1.5]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

// Complete card with render target
function Card({ suit, value, position }: {
  suit: string;
  value: string;
  position: [number, number, number];
}) {
  return (
    <RenderTarget2DProvider
      name={`card-${suit}-${value}`}
      width={128}
      height={192}
      linearFiltering={false}
    >
      <Suspense fallback={null}>
        <CardFace suit={suit} value={value} />
      </Suspense>
      <Card3D position={position} />
    </RenderTarget2DProvider>
  );
}

// Main scene
export default function CardGame() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }}>
      <Card suit="hearts" value="A" position={[-2, 0, 0]} />
      <Card suit="spades" value="K" position={[0, 0, 0]} />
      <Card suit="diamonds" value="Q" position={[2, 0, 0]} />
    </Canvas>
  );
}
```

### Example 3: Mini-map

```tsx
function MiniMap() {
  const { target } = useRenderTarget2D();

  // Add minimap-specific sprites to target
  useEffect(() => {
    // Add scaled-down versions of game entities
    target.add(playerIcon);
    target.add(enemyIcons);
    target.add(terrainOverview);

    return () => {
      target.remove(playerIcon);
      // ... cleanup
    };
  }, []);

  return null;
}

function HUD() {
  return (
    <RenderTarget2DProvider name="minimap" width={128} height={128}>
      <MiniMap />

      {/* Use minimap texture in UI */}
      <Html position={[10, 10, 0]}>
        <img src={minimapTexture.toDataURL()} />
      </Html>
    </RenderTarget2DProvider>
  );
}
```

---

## Acceptance Criteria

- [ ] `RenderTarget2D` creates valid render target with correct options
- [ ] Orthographic camera is correctly configured
- [ ] Sprites render correctly to the target
- [ ] Texture can be applied to 3D meshes
- [ ] Pixel-perfect rendering works (nearest filter)
- [ ] Resize functionality works correctly
- [ ] R3F integration with context works
- [ ] Examples render correctly
- [ ] All tests pass

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Render target state issues | Medium | Medium | Careful state save/restore |
| Texture coordinate issues | Low | Medium | Test with various UV mappings |
| Performance with many targets | Low | Low | Use target manager pooling |
| WebGPU differences | Medium | Medium | Test both backends |

---

## Dependencies for Next Milestone

M11 (Presets & Post-processing) requires:
- Render targets for post-processing pipeline

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 1 |
| RenderTarget2D | 6 |
| RenderTargetManager | 2 |
| R3F integration | 4 |
| Examples | 4 |
| Tests | 2 |
| Documentation | 1 |
| **Total** | **20 hours** (~1 week) |

---

*End of M10: Render Targets*
