# Flatland

## A TSL-Native 2D Rendering Library for Three.js

---

# Product Requirements Document

**Version:** 1.0.0-draft
**Author:** Claude (Anthropic) + Justin
**Date:** January 23, 2026

---

## Table of Contents

1. [Naming & Branding](#1-naming--branding)
2. [Executive Summary](#2-executive-summary)
3. [Problem Statement](#3-problem-statement)
4. [Goals & Non-Goals](#4-goals--non-goals)
5. [Architecture Overview](#5-architecture-overview)
6. [TSL Node Collection](#6-tsl-node-collection)
7. [Core Systems](#7-core-systems)
8. [API Design & Code Samples](#8-api-design--code-samples)
9. [R3F Integration](#9-r3f-integration)
10. [Milestone Plan](#10-milestone-plan)
11. [Technical Specifications](#11-technical-specifications)

---

## 1. Naming & Branding

### Naming Analysis

| Name | Pros | Cons |
|------|------|------|
| `three-2d` | Clear, searchable | Generic, forgettable, weak brand |
| `three-paper` | Evokes Paper2D, tangible | "Paper" feels thin/limited |
| `three-canvas` | Art connotation | Conflicts with HTML Canvas |
| `three-sprite` | Descriptive | Too narrow (we do more than sprites) |
| `trois-flat` | French "three", flat design | Pronunciation issues, niche |
| `flatland` | Literary reference, memorable | Less Three.js association |
| `three-flatland` | Combines best of both | Slightly long |

### Recommended: **Flatland** (with `@flatland/core`, `@flatland/react`)

**Why Flatland:**
- References Edwin Abbott's mathematical novella "Flatland: A Romance of Many Dimensions" (1884) - a story about 2D beings
- Immediately communicates "2D" without being literal
- Memorable, unique, and evocative
- Short enough for imports: `import { Sprite } from 'flatland'`
- Package namespace: `@flatland/core`, `@flatland/react`, `@flatland/nodes`
- Domain availability likely good
- Works internationally (no pronunciation issues)

**Tagline:** *"Where Three.js meets two dimensions"*

**Alternative if `flatland` is taken:** `@three-flatland/core` or `flatscape`

---

## 2. Executive Summary

**Flatland** is a TSL-native 2D rendering library that brings Pixi.js-caliber 2D workflows to Three.js. It provides:

1. **Rich TSL Node Collection** - 50+ shader nodes for sprites, effects, lighting, and post-processing
2. **Flexible Render Targets** - Use on dedicated 2D layers (HUD), mixed with 3D scenes, or applied to any mesh/plane
3. **Game-Ready Features** - Sprite sheets, atlases, tilemaps, animations, batching, z-ordering
4. **First-Class R3F Support** - Full TypeScript types, declarative components, hooks ecosystem
5. **Performance** - Instanced batching, texture atlases, render layer optimization

---

## 3. Problem Statement

### Current Pain Points

**For Three.js developers wanting 2D:**
- No native 2D sprite system (only `THREE.Sprite` which is limited)
- No tilemap support
- No sprite sheet animation system
- Must use workarounds for z-ordering (renderOrder, position.z)
- No batching/instancing abstractions for 2D
- Pixi.js interop is hacky (separate canvas, manual compositing)

**For Pixi.js developers wanting 3D:**
- Difficult to mix 2D UI with 3D scenes
- Different mental models (display list vs scene graph)
- Shader systems don't interoperate

**For everyone:**
- No TSL-based 2D nodes exist
- R3F ecosystem lacks 2D primitives
- Modern WebGPU rendering pipeline not leveraged for 2D

### Market Gap

| Feature | Pixi.js | Three.js Native | Existing Libraries | **Flatland** |
|---------|---------|-----------------|-------------------|--------------|
| Sprites | ✅ | ⚠️ Basic | ✅ | ✅ |
| Sprite Sheets | ✅ | ❌ | ✅ | ✅ |
| Tilemaps | ⚠️ Plugin | ❌ | ⚠️ One lib | ✅ |
| Batching | ✅ | ❌ | ⚠️ One lib | ✅ |
| Z-Order Layers | ✅ | ❌ | ❌ | ✅ |
| 2D Lighting | ⚠️ Plugin | ❌ | ❌ | ✅ |
| TSL Shaders | ❌ | N/A | ❌ | ✅ |
| 3D Integration | ❌ | N/A | ⚠️ | ✅ |
| R3F Types | ❌ | N/A | ⚠️ | ✅ |
| WebGPU Ready | 🔜 | ✅ | ❌ | ✅ |

---

## 4. Goals & Non-Goals

### Goals

1. **TSL-First Architecture** - All shaders written in TSL, compiling to both WebGL and WebGPU
2. **Three.js Native** - Works with existing Three.js scenes, cameras, renderers
3. **Flexible Rendering Modes:**
   - Dedicated 2D layers (HUD, UI)
   - Mixed 2D/3D scenes
   - 2D effects on 3D geometry (planes, meshes)
4. **Rich Node Library** - Comprehensive TSL nodes for 2D effects
5. **Game Engine Features** - Sprites, tilemaps, animations, physics-ready
6. **R3F Ecosystem** - Full React integration with proper types
7. **Performance Parity** - Match or exceed Pixi.js performance for equivalent workloads

### Non-Goals

1. **Replace Pixi.js** - Not building a game engine, just rendering primitives
2. **Physics Engine** - Use existing libraries (matter.js, planck.js)
3. **UI Framework** - Use existing (react-three-flex, drei Html)
4. **Scene Editor** - Out of scope
5. **Legacy Browser Support** - Targeting modern browsers (ES2020+)

---

## 5. Architecture Overview

### Package Structure

```
@flatland/
├── core/                    # Core library (vanilla Three.js)
│   ├── sprites/            # Sprite classes
│   ├── tilemaps/           # Tilemap system
│   ├── layers/             # Render layer management
│   ├── loaders/            # Asset loaders
│   └── batch/              # Batching system
├── nodes/                   # TSL node collection
│   ├── sprite/             # Sprite-specific nodes
│   ├── effects/            # Visual effects
│   ├── lighting/           # 2D lighting
│   ├── post/               # Post-processing
│   └── utility/            # Helper nodes
├── react/                   # R3F integration
│   ├── components/         # React components
│   ├── hooks/              # Custom hooks
│   └── types/              # TypeScript declarations
└── presets/                 # Pre-built configurations
    ├── retro/              # Pixel art preset
    ├── hd/                 # HD 2D preset
    └── vfx/                # Effects-heavy preset
```

### Rendering Modes

```
┌─────────────────────────────────────────────────────────────────┐
│                     FLATLAND RENDERING MODES                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MODE 1: Pure 2D Layer (HUD/UI)                                │
│  ┌─────────────────────────────────────────────────┐           │
│  │  OrthographicCamera                              │           │
│  │  ┌─────────────────────────────────────────┐    │           │
│  │  │  RenderLayer (z:0) - Background         │    │           │
│  │  │  RenderLayer (z:1) - Game Objects       │    │           │
│  │  │  RenderLayer (z:2) - UI Elements        │    │           │
│  │  │  RenderLayer (z:3) - HUD Overlay        │    │           │
│  │  └─────────────────────────────────────────┘    │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
│  MODE 2: Mixed 2D/3D Scene                                     │
│  ┌─────────────────────────────────────────────────┐           │
│  │  PerspectiveCamera                               │           │
│  │  ┌─────────────────────────────────────────┐    │           │
│  │  │  3D Scene (normal Three.js objects)     │    │           │
│  │  │  + Sprite2D objects at world positions  │    │           │
│  │  │  + Billboard sprites                    │    │           │
│  │  │  + 2D planes in 3D space               │    │           │
│  │  └─────────────────────────────────────────┘    │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
│  MODE 3: 2D Materials on 3D Geometry                           │
│  ┌─────────────────────────────────────────────────┐           │
│  │  Any Mesh + FlatlandMaterial                    │           │
│  │  ┌─────────────────────────────────────────┐    │           │
│  │  │  Apply sprite sheets to any geometry    │    │           │
│  │  │  Animated textures on 3D objects        │    │           │
│  │  │  2D lighting effects on meshes          │    │           │
│  │  │  Procedural 2D patterns                 │    │           │
│  │  └─────────────────────────────────────────┘    │           │
│  └─────────────────────────────────────────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Core Class Hierarchy

```
THREE.Object3D
├── Sprite2D                      # Base 2D sprite
│   ├── AnimatedSprite2D          # With animation support
│   └── NineSliceSprite2D         # 9-slice scaling
├── TileMap2D                     # Tilemap renderer
├── SpriteBatch                   # Instanced sprite batch
│   └── ParticleBatch             # Optimized for particles
└── RenderLayer2D                 # Render order management

THREE.Material (NodeMaterial)
├── Sprite2DMaterial              # Basic sprite material
├── LitSprite2DMaterial           # With 2D lighting
├── TileMaterial                  # Tilemap material
└── FlatlandMaterial              # Generic 2D material for any mesh
```

---

## 6. TSL Node Collection

### Node Categories

The heart of Flatland is its comprehensive TSL node library. These nodes can be composed to create any 2D effect.

### 6.1 Sprite Nodes

```typescript
// Core sprite operations
spriteUV()                    // Get sprite UV coordinates
spriteFrame(index, cols, rows) // Calculate frame UV from spritesheet
spriteAtlas(frame, atlasData)  // Sample from texture atlas
spriteNineSlice(uv, borders)   // 9-slice UV transformation
spriteBillboard(position)      // Billboard toward camera

// Animation
spriteAnimation(frames, time, fps)     // Frame-based animation
spriteAnimationBlend(anim1, anim2, t)  // Blend between animations
spriteTransition(from, to, type, t)    // Transition effects

// Transforms
spriteFlip(horizontal, vertical)       // Flip sprite
spriteRotate(angle, pivot)             // Rotate around pivot
spriteScale(scale, pivot)              // Scale from pivot
spriteSkew(x, y)                       // Skew transform
```

### 6.2 Color & Tint Nodes

```typescript
// Basic color operations
tint(color)                    // Multiply tint
tintAdd(color)                 // Additive tint
tintReplace(color, threshold)  // Replace colors
tintHueShift(amount)           // Shift hue
tintSaturation(amount)         // Adjust saturation
tintBrightness(amount)         // Adjust brightness
tintContrast(amount)           // Adjust contrast

// Advanced color
colorRemap(source, target)     // Palette remapping
colorGradient(colors, t)       // Multi-stop gradient
colorPosterize(levels)         // Reduce color levels
colorDuotone(dark, light)      // Duotone effect
colorSplit(offset)             // Chromatic aberration
```

### 6.3 Alpha & Transparency Nodes

```typescript
// Alpha operations
alphaTest(threshold)           // Hard cutoff
alphaSmooth(edge0, edge1)      // Smooth edge
alphaMask(maskTexture)         // Texture mask
alphaGradient(direction, t)    // Gradient fade
alphaDissolve(noise, t)        // Dissolve effect
alphaDither(pattern)           // Dithered transparency

// Blending
blendNormal(base, blend)       // Standard blend
blendAdditive(base, blend)     // Add colors
blendMultiply(base, blend)     // Multiply colors
blendScreen(base, blend)       // Screen blend
blendOverlay(base, blend)      // Overlay blend
blendSoftLight(base, blend)    // Soft light
```

### 6.4 Outline & Edge Nodes

```typescript
// Outlines
outline(color, width)                    // Simple outline
outlineGlow(color, width, falloff)       // Glowing outline
outlineAnimated(color, width, speed)     // Animated outline
outlinePixel(color)                      // 1px pixel outline
outlineInner(color, width)               // Inside outline

// Edge detection
edgeSobel(threshold)           // Sobel edge detection
edgeFXAA()                     // Anti-aliased edges
edgePixelPerfect()             // Pixel-perfect edges
```

### 6.5 Distortion Nodes

```typescript
// Wave effects
waveHorizontal(amplitude, frequency, speed)
waveVertical(amplitude, frequency, speed)
waveRadial(amplitude, frequency, speed)
waveRipple(center, amplitude, frequency)

// Distortions
distortPinch(center, strength)
distortBulge(center, strength)
distortTwirl(center, angle)
distortBarrel(amount)
distortPixelate(size)
distortShatter(pieces, offset)

// Noise-based
distortNoise(scale, strength, speed)
distortPerlin(scale, strength)
distortSimplex(scale, strength)
```

### 6.6 2D Lighting Nodes

```typescript
// Light types
pointLight2D(position, color, intensity, radius)
spotLight2D(position, direction, color, angle, falloff)
directionalLight2D(direction, color)
ambientLight2D(color, intensity)

// Normal mapping
normalFromHeight(heightMap, strength)
normalFromSprite(sprite, depth)
normalCombine(normal1, normal2)

// Lighting models
litSprite(normal, lights)              // Full lighting calculation
litDiffuse(normal, lightDir)           // Diffuse only
litSpecular(normal, lightDir, view)    // Specular highlights
litRim(normal, view, color)            // Rim lighting
litCelShaded(normal, lightDir, bands)  // Cel shading

// Shadows
shadow2D(casters, lightPos)            // Hard shadows
shadowSoft2D(casters, lightPos, blur)  // Soft shadows
shadowDrop(offset, blur, color)        // Drop shadow
```

### 6.7 Particle & VFX Nodes

```typescript
// Particle attributes
particleAge(lifetime)          // Normalized age (0-1)
particleVelocity()             // Current velocity
particleSize(startSize, endSize)
particleColor(startColor, endColor)
particleRotation(speed)

// Effects
sparkle(density, speed)        // Sparkle effect
shimmer(speed, intensity)      // Shimmer/shine
pulse(speed, intensity)        // Pulsing glow
flash(color, duration)         // Flash effect
trail(length, fade)            // Motion trail
afterimage(count, delay)       // Ghost images
```

### 6.8 Pattern & Procedural Nodes

```typescript
// Patterns
patternStripes(angle, width, colors)
patternCheckerboard(size, color1, color2)
patternPolkaDots(size, spacing, color)
patternGrid(size, lineWidth, color)
patternHalftone(size, angle)

// Procedural
noiseValue(scale)              // Value noise
noisePerlin(scale)             // Perlin noise
noiseSimplex(scale)            // Simplex noise
noiseWorley(scale)             // Worley/cellular
noiseFBM(scale, octaves)       // Fractal Brownian motion

// Shapes
shapeCircle(radius, edge)
shapeRectangle(size, cornerRadius)
shapePolygon(sides, radius)
shapeStar(points, innerRadius, outerRadius)
shapeLine(start, end, width)
```

### 6.9 Post-Processing Nodes

```typescript
// Blur
blurGaussian(radius)           // Gaussian blur
blurBox(radius)                // Box blur
blurRadial(center, strength)   // Radial/zoom blur
blurMotion(direction, strength)// Motion blur
blurKawase(iterations)         // Kawase blur (fast)

// Bloom & Glow
bloom(threshold, intensity, radius)
glowSelective(color, threshold)
glowAnamorphic(threshold, stretch)

// Retro effects
crtScanlines(density, intensity)
crtCurvature(amount)
crtVignette(intensity)
crtNoise(amount)
pixelPerfect(scale)
paletteReduce(palette)

// Cinematic
vignette(intensity, smoothness)
filmGrain(amount, speed)
colorGrade(lut)
letterbox(aspect)
```

### 6.10 Utility Nodes

```typescript
// Math
remap(value, inMin, inMax, outMin, outMax)
clamp01(value)
smoothstep(edge0, edge1, value)
easeIn(t), easeOut(t), easeInOut(t)

// Coordinates
screenUV()                     // Screen-space UV
worldPosition2D()              // World position
localPosition2D()              // Local position
normalizedCoords()             // -1 to 1 coords

// Time
time()                         // Global time
deltaTime()                    // Frame delta
pulse(frequency)               // 0-1 pulse
sawtooth(frequency)            // Sawtooth wave
triangle(frequency)            // Triangle wave

// Conditionals
when(condition, ifTrue, ifFalse)
step(edge, value)
mix(a, b, t)
```

---

## 7. Core Systems

### 7.1 Sprite System

```typescript
interface Sprite2DOptions {
  texture: Texture;
  frame?: SpriteFrame;           // Current frame
  anchor?: Vector2;              // Pivot point (0-1)
  tint?: Color;                  // Color tint
  alpha?: number;                // Opacity
  flipX?: boolean;
  flipY?: boolean;
  billboard?: boolean;           // Face camera
  pixelPerfect?: boolean;        // Snap to pixels
}

class Sprite2D extends Object3D {
  material: Sprite2DMaterial;

  // Frame management
  setFrame(frame: SpriteFrame): void;
  setFrameIndex(index: number): void;

  // Quick transforms
  flip(horizontal: boolean, vertical: boolean): void;
  setAnchor(x: number, y: number): void;

  // Rendering
  setTint(color: Color): void;
  setAlpha(alpha: number): void;

  // Layer management
  setLayer(layer: RenderLayer2D): void;
}
```

### 7.2 Animation System

```typescript
interface AnimationDefinition {
  name: string;
  frames: SpriteFrame[];
  frameDuration?: number | number[];  // ms per frame
  loop?: boolean;
  pingPong?: boolean;
}

class AnimatedSprite2D extends Sprite2D {
  // Animation control
  play(name: string): void;
  pause(): void;
  resume(): void;
  stop(): void;

  // Timing
  setSpeed(multiplier: number): void;
  gotoFrame(index: number): void;
  gotoTime(ms: number): void;

  // Events
  onAnimationEnd: Signal<(name: string) => void>;
  onFrameChange: Signal<(frame: number) => void>;

  // State
  readonly currentAnimation: string;
  readonly currentFrame: number;
  readonly isPlaying: boolean;
}
```

### 7.3 Tilemap System

```typescript
interface TilesetData {
  texture: Texture;
  tileWidth: number;
  tileHeight: number;
  spacing?: number;
  margin?: number;
  columns: number;
  tileCount: number;
  properties?: Record<number, TileProperties>;
}

interface TileLayerData {
  name: string;
  data: Uint16Array | number[][];  // Tile indices
  width: number;
  height: number;
  visible?: boolean;
  opacity?: number;
  tint?: Color;
  parallax?: Vector2;              // Parallax scrolling
}

class TileMap2D extends Object3D {
  // Layer management
  addLayer(layer: TileLayerData): TileLayer;
  getLayer(name: string): TileLayer;
  removeLayer(name: string): void;

  // Tile operations
  setTile(layer: string, x: number, y: number, tileId: number): void;
  getTile(layer: string, x: number, y: number): number;
  fill(layer: string, tileId: number, rect?: Rectangle): void;

  // Queries
  worldToTile(worldPos: Vector2): Vector2;
  tileToWorld(tilePos: Vector2): Vector2;
  getTilesInRect(rect: Rectangle): TileInfo[];

  // Culling
  setCullBounds(bounds: Rectangle): void;
  setViewport(camera: Camera): void;  // Auto-cull
}
```

### 7.4 Render Layer System (Pixi.js-style)

```typescript
interface RenderLayerOptions {
  name: string;
  zIndex: number;
  sortMode?: 'none' | 'y-sort' | 'z-sort' | 'custom';
  sortFunction?: (a: Object3D, b: Object3D) => number;
  camera?: Camera;                 // Override camera for this layer
  clearDepth?: boolean;            // Clear depth before rendering
  postProcess?: PostProcessNode[]; // Layer-specific post-processing
}

class RenderLayer2D {
  readonly name: string;
  zIndex: number;
  visible: boolean;

  // Object management
  add(...objects: Object3D[]): void;
  remove(...objects: Object3D[]): void;
  clear(): void;

  // Sorting
  sort(): void;
  setSortFunction(fn: SortFunction): void;

  // Rendering
  setCamera(camera: Camera): void;
  setPostProcess(effects: PostProcessNode[]): void;
}

class LayerManager {
  // Layer management
  createLayer(options: RenderLayerOptions): RenderLayer2D;
  getLayer(name: string): RenderLayer2D;
  removeLayer(name: string): void;

  // Render order
  setLayerOrder(names: string[]): void;
  moveLayerUp(name: string): void;
  moveLayerDown(name: string): void;

  // Rendering
  render(renderer: WebGPURenderer, scene: Scene): void;
}
```

### 7.5 Batching System

```typescript
interface SpriteBatchOptions {
  maxSprites: number;
  texture: Texture | TextureAtlas;
  material?: Sprite2DMaterial;
  dynamic?: {
    position?: boolean;   // Update positions every frame
    scale?: boolean;
    rotation?: boolean;
    frame?: boolean;
    tint?: boolean;
    alpha?: boolean;
  };
}

class SpriteBatch extends Object3D {
  readonly count: number;
  readonly maxCount: number;

  // Sprite management
  addSprite(options: BatchSpriteOptions): number;  // Returns ID
  removeSprite(id: number): void;
  updateSprite(id: number, options: Partial<BatchSpriteOptions>): void;

  // Bulk operations
  setPositions(positions: Float32Array): void;
  setFrames(frames: Uint16Array): void;
  setTints(colors: Float32Array): void;

  // Auto-batching
  static fromSprites(sprites: Sprite2D[]): SpriteBatch;
}
```

### 7.6 Asset Loaders

```typescript
// Sprite Sheet Loader (JSON Hash, JSON Array, Aseprite)
class SpriteSheetLoader {
  load(url: string): Promise<SpriteSheet>;
  loadAseprite(url: string): Promise<SpriteSheet>;

  static parse(json: SpriteSheetJSON, texture: Texture): SpriteSheet;
}

// Texture Atlas (multiple textures packed)
class AtlasLoader {
  load(url: string): Promise<TextureAtlas>;
  getTexture(name: string): Texture;
  getFrame(name: string): SpriteFrame;
}

// Tileset Loader (Tiled JSON, LDtk)
class TilesetLoader {
  loadTiled(url: string): Promise<TileMap2D>;
  loadLDtk(url: string): Promise<TileMap2D>;
}
```

---

## 8. API Design & Code Samples

### 8.1 Basic Sprite (Vanilla Three.js)

```typescript
import * as THREE from 'three/webgpu';
import { Sprite2D, SpriteSheetLoader, LayerManager } from '@flatland/core';

// Setup
const renderer = new THREE.WebGPURenderer();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 0, 600, -1000, 1000);

// Load sprite sheet
const sheet = await SpriteSheetLoader.load('/sprites/player.json');

// Create sprite
const player = new Sprite2D({
  texture: sheet.texture,
  frame: sheet.getFrame('idle_0'),
  anchor: new THREE.Vector2(0.5, 0.5),
});
player.position.set(400, 300, 0);
scene.add(player);

// Render
renderer.render(scene, camera);
```

### 8.2 Animated Sprite with Effects

```typescript
import { AnimatedSprite2D, SpriteSheetLoader } from '@flatland/core';
import { outline, pulse, tint } from '@flatland/nodes';

const sheet = await SpriteSheetLoader.load('/sprites/character.json');

const character = new AnimatedSprite2D({
  texture: sheet.texture,
  animations: sheet.animations,
});

// Add TSL effect nodes to material
character.material.colorNode = Fn(() => {
  const baseColor = texture(sheet.texture, spriteFrame(
    character.frameIndex,
    sheet.columns,
    sheet.rows
  ));

  // Tint based on health
  const healthTint = mix(vec3(1, 0, 0), vec3(1, 1, 1), healthUniform);

  // Add pulsing outline when damaged
  const outlined = outline(baseColor, outlineColor, 2.0);
  const pulsed = mix(baseColor, outlined, pulse(2.0).mul(isDamaged));

  return vec4(pulsed.rgb.mul(healthTint), baseColor.a);
})();

// Play animation
character.play('walk_right');

// In update loop
character.update(deltaTime);
```

### 8.3 Tilemap with Parallax Layers

```typescript
import { TileMap2D, TilesetLoader, RenderLayer2D } from '@flatland/core';

// Load Tiled map
const map = await TilesetLoader.loadTiled('/maps/level1.json');

// Setup parallax layers
const bgLayer = map.getLayer('background');
bgLayer.parallax.set(0.5, 0.5);  // Scroll at half speed

const mgLayer = map.getLayer('midground');
mgLayer.parallax.set(0.75, 0.75);

const fgLayer = map.getLayer('foreground');
// Default parallax (1, 1) - moves with camera

// Update with camera position
function update() {
  map.setViewport(camera);  // Auto-culling

  // Parallax is automatic when camera moves
  renderer.render(scene, camera);
}
```

### 8.4 Render Layers (Pixi.js-style)

```typescript
import { LayerManager, RenderLayer2D } from '@flatland/core';
import { bloom, vignette } from '@flatland/nodes';

const layers = new LayerManager();

// Background - no sorting
const bgLayer = layers.createLayer({
  name: 'background',
  zIndex: 0,
  sortMode: 'none',
});

// Game objects - Y-sorted for isometric
const gameLayer = layers.createLayer({
  name: 'game',
  zIndex: 1,
  sortMode: 'y-sort',
});

// VFX layer with bloom
const vfxLayer = layers.createLayer({
  name: 'vfx',
  zIndex: 2,
  postProcess: [bloom({ threshold: 0.8, intensity: 1.5 })],
});

// HUD - fixed camera, on top
const hudCamera = new THREE.OrthographicCamera(0, 800, 0, 600, -1, 1);
const hudLayer = layers.createLayer({
  name: 'hud',
  zIndex: 100,
  camera: hudCamera,
  clearDepth: true,
});

// Add objects to layers
bgLayer.add(backgroundSprite);
gameLayer.add(player, ...enemies, ...items);
vfxLayer.add(...particles);
hudLayer.add(healthBar, scoreText, minimap);

// Custom render loop
function render() {
  layers.render(renderer, scene);
}
```

### 8.5 2D Materials on 3D Geometry

```typescript
import { FlatlandMaterial } from '@flatland/core';
import { spriteAnimation, litSprite, normalFromSprite } from '@flatland/nodes';

// Create animated material for any mesh
const animatedMaterial = new FlatlandMaterial({
  spriteSheet: await SpriteSheetLoader.load('/sprites/waterfall.json'),
  animation: 'flow',
  fps: 12,
  lit: true,  // Enable 2D lighting
});

// Apply to a plane in 3D space
const waterfallPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 4),
  animatedMaterial
);
waterfallPlane.position.set(0, 2, -5);
scene.add(waterfallPlane);

// Apply to any geometry
const animatedCube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new FlatlandMaterial({
    spriteSheet: tvStaticSheet,
    animation: 'noise',
  })
);
scene.add(animatedCube);
```

### 8.6 Advanced TSL Node Composition

```typescript
import { Fn, texture, uv, vec4, uniform, time } from 'three/tsl';
import {
  spriteFrame,
  outline,
  dissolve,
  palette,
  pointLight2D,
  shadow2D
} from '@flatland/nodes';

// Create complex material with composed nodes
const material = new Sprite2DMaterial();

const frameIndex = uniform(0);
const dissolveAmount = uniform(0);
const playerPosition = uniform(new THREE.Vector2());
const lightColor = uniform(new THREE.Color(0xffffaa));

material.colorNode = Fn(() => {
  // Sample sprite frame
  const spriteUV = spriteFrame(frameIndex, 8, 8);
  const baseColor = texture(spriteTexture, spriteUV);

  // Apply pixel-art palette reduction
  const palettized = palette(baseColor, retroPalette, 16);

  // Add outline
  const outlined = outline(palettized, vec3(0, 0, 0), 1.0);

  // 2D point light
  const worldPos = worldPosition2D();
  const lit = pointLight2D(
    worldPos,
    playerPosition,
    lightColor,
    100.0,  // intensity
    200.0   // radius
  );

  // Apply lighting
  const finalColor = outlined.rgb.mul(lit);

  // Dissolve effect
  const dissolved = dissolve(
    vec4(finalColor, outlined.a),
    dissolveAmount,
    vec3(1.0, 0.5, 0.0)  // Edge color
  );

  return dissolved;
})();
```

### 8.7 Particle System with Batching

```typescript
import { ParticleBatch } from '@flatland/core';
import { particleAge, particleColor, particleSize } from '@flatland/nodes';

const particles = new ParticleBatch({
  maxParticles: 10000,
  texture: sparkleTexture,
  blendMode: 'additive',
});

// Configure particle material with TSL
particles.material.colorNode = Fn(() => {
  const age = particleAge();

  // Size: start big, shrink
  const size = particleSize(2.0, 0.0);

  // Color: yellow -> orange -> transparent
  const color = particleColor(
    vec4(1, 1, 0, 1),   // Start
    vec4(1, 0.5, 0, 0)  // End
  );

  // Sparkle effect
  const sparkle = sin(time().mul(20.0).add(age.mul(10.0)))
    .mul(0.5).add(0.5);

  return vec4(color.rgb.mul(sparkle), color.a);
})();

// Emit particles
function emit(position: Vector2, velocity: Vector2) {
  particles.emit({
    position,
    velocity,
    lifetime: 1.0,
    size: 10,
  });
}
```

---

## 9. R3F Integration

### 9.1 Module Augmentation

```typescript
// @flatland/react/types.ts
import { Object3DNode, MaterialNode } from '@react-three/fiber';
import * as Flatland from '@flatland/core';

declare module '@react-three/fiber' {
  interface ThreeElements {
    // Sprites
    sprite2D: Object3DNode<Flatland.Sprite2D, typeof Flatland.Sprite2D>;
    animatedSprite2D: Object3DNode<Flatland.AnimatedSprite2D, typeof Flatland.AnimatedSprite2D>;
    nineSliceSprite2D: Object3DNode<Flatland.NineSliceSprite2D, typeof Flatland.NineSliceSprite2D>;

    // Tilemaps
    tileMap2D: Object3DNode<Flatland.TileMap2D, typeof Flatland.TileMap2D>;
    tileLayer: Object3DNode<Flatland.TileLayer, typeof Flatland.TileLayer>;

    // Batching
    spriteBatch: Object3DNode<Flatland.SpriteBatch, typeof Flatland.SpriteBatch>;
    particleBatch: Object3DNode<Flatland.ParticleBatch, typeof Flatland.ParticleBatch>;

    // Layers
    renderLayer2D: Object3DNode<Flatland.RenderLayer2D, typeof Flatland.RenderLayer2D>;

    // Materials
    sprite2DMaterial: MaterialNode<Flatland.Sprite2DMaterial, typeof Flatland.Sprite2DMaterial>;
    litSprite2DMaterial: MaterialNode<Flatland.LitSprite2DMaterial, typeof Flatland.LitSprite2DMaterial>;
    flatlandMaterial: MaterialNode<Flatland.FlatlandMaterial, typeof Flatland.FlatlandMaterial>;
  }
}

// Re-export with types
export * from '@flatland/core';
```

### 9.2 React Components

```tsx
// @flatland/react/components/Sprite2D.tsx
import { forwardRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sprite2D as Sprite2DClass } from '@flatland/core';

export interface Sprite2DProps {
  texture: string | Texture;
  frame?: string | number;
  anchor?: [number, number];
  tint?: string | Color;
  alpha?: number;
  flipX?: boolean;
  flipY?: boolean;
  billboard?: boolean;
  pixelPerfect?: boolean;
  children?: React.ReactNode;
}

export const Sprite2D = forwardRef<Sprite2DClass, Sprite2DProps>(
  ({ texture, frame, anchor, tint, alpha, flipX, flipY, billboard, pixelPerfect, children, ...props }, ref) => {
    const resolvedTexture = useTexture(texture);

    return (
      <sprite2D
        ref={ref}
        args={[{
          texture: resolvedTexture,
          frame,
          anchor: anchor && new Vector2(...anchor),
          tint: tint && new Color(tint),
          alpha,
          flipX,
          flipY,
          billboard,
          pixelPerfect,
        }]}
        {...props}
      >
        {children}
      </sprite2D>
    );
  }
);
```

### 9.3 Hooks

```typescript
// @flatland/react/hooks/useSpriteSheet.ts
export function useSpriteSheet(url: string): SpriteSheet | null {
  const [sheet, setSheet] = useState<SpriteSheet | null>(null);

  useEffect(() => {
    SpriteSheetLoader.load(url).then(setSheet);
  }, [url]);

  return sheet;
}

// @flatland/react/hooks/useAnimation.ts
export function useAnimation(
  sprite: AnimatedSprite2D | null,
  animation: string,
  options?: { autoPlay?: boolean; loop?: boolean }
) {
  useEffect(() => {
    if (!sprite) return;

    if (options?.autoPlay !== false) {
      sprite.play(animation);
    }

    return () => sprite.stop();
  }, [sprite, animation]);

  useFrame((_, delta) => {
    sprite?.update(delta * 1000);
  });

  return {
    play: () => sprite?.play(animation),
    pause: () => sprite?.pause(),
    stop: () => sprite?.stop(),
    gotoFrame: (frame: number) => sprite?.gotoFrame(frame),
  };
}

// @flatland/react/hooks/useLayers.ts
export function useLayers() {
  const manager = useRef(new LayerManager());

  useFrame(({ gl, scene }) => {
    manager.current.render(gl, scene);
  }, 1); // Priority 1 - after default

  return {
    createLayer: manager.current.createLayer.bind(manager.current),
    getLayer: manager.current.getLayer.bind(manager.current),
  };
}

// @flatland/react/hooks/useTileMap.ts
export function useTileMap(url: string, format: 'tiled' | 'ldtk' = 'tiled') {
  const [map, setMap] = useState<TileMap2D | null>(null);

  useEffect(() => {
    const loader = new TilesetLoader();
    const load = format === 'tiled' ? loader.loadTiled : loader.loadLDtk;
    load(url).then(setMap);
  }, [url, format]);

  return map;
}
```

### 9.4 Full R3F Example

```tsx
import { Canvas } from '@react-three/fiber';
import {
  Sprite2D,
  AnimatedSprite2D,
  TileMap2D,
  RenderLayer,
  useSpriteSheet,
  useAnimation,
  useTileMap,
  useLayers,
} from '@flatland/react';

function Game() {
  const playerSheet = useSpriteSheet('/sprites/player.json');
  const map = useTileMap('/maps/level1.json');
  const { createLayer } = useLayers();

  return (
    <>
      {/* Background layer */}
      <RenderLayer name="background" zIndex={0}>
        {map && <TileMap2D map={map} layers={['background', 'midground']} />}
      </RenderLayer>

      {/* Game layer with Y-sorting */}
      <RenderLayer name="game" zIndex={1} sortMode="y-sort">
        {playerSheet && (
          <Player sheet={playerSheet} position={[400, 300]} />
        )}
        <Enemies />
        <Items />
      </RenderLayer>

      {/* Foreground layer */}
      <RenderLayer name="foreground" zIndex={2}>
        {map && <TileMap2D map={map} layers={['foreground']} />}
      </RenderLayer>

      {/* VFX with bloom */}
      <RenderLayer name="vfx" zIndex={3} postProcess={[bloom()]}>
        <Particles />
      </RenderLayer>

      {/* HUD */}
      <RenderLayer name="hud" zIndex={100} fixed>
        <HealthBar />
        <Score />
        <Minimap />
      </RenderLayer>
    </>
  );
}

function Player({ sheet, position }: { sheet: SpriteSheet; position: [number, number] }) {
  const spriteRef = useRef<AnimatedSprite2D>(null);
  const [animation, setAnimation] = useState('idle');

  useAnimation(spriteRef.current, animation);

  // Movement logic
  useFrame(() => {
    const input = getInput();
    if (input.x !== 0 || input.y !== 0) {
      setAnimation(input.x > 0 ? 'walk_right' : 'walk_left');
    } else {
      setAnimation('idle');
    }
  });

  return (
    <AnimatedSprite2D
      ref={spriteRef}
      spriteSheet={sheet}
      position={[position[0], position[1], 0]}
      anchor={[0.5, 1]}  // Bottom center for Y-sorting
    />
  );
}

function App() {
  return (
    <Canvas
      orthographic
      camera={{ zoom: 1, position: [400, 300, 100] }}
      gl={{ antialias: false }}  // Pixel-perfect
    >
      <Game />
    </Canvas>
  );
}
```

---

## 10. Milestone Plan

### Phase 0: Project Setup (Week 1)

**Deliverables:**
- Repository setup with monorepo structure (pnpm workspaces)
- TypeScript configuration
- Build system (tsup/vite)
- Testing framework (vitest)
- Documentation setup (typedoc + vitepress)
- CI/CD pipeline

**Tasks:**
- [ ] Initialize monorepo with packages: `core`, `nodes`, `react`, `presets`
- [ ] Configure TypeScript with strict mode
- [ ] Setup ESLint + Prettier
- [ ] Configure Vitest with Three.js test utils
- [ ] Create example app scaffold
- [ ] Setup Changesets for versioning

---

### Phase 1: Core Sprite System (Weeks 2-3)

**Deliverables:**
- `Sprite2D` class with basic rendering
- `Sprite2DMaterial` using TSL
- `SpriteSheetLoader` (JSON Hash, JSON Array)
- Basic tests and examples

**Implementation Plan:**

```typescript
// Week 2: Core classes
// 1. Sprite2DMaterial (TSL-based)
class Sprite2DMaterial extends SpriteNodeMaterial {
  // Uniforms
  frameUV = uniform(new Vector4(0, 0, 1, 1));
  tintColor = uniform(new Color(0xffffff));
  alphaValue = uniform(1.0);

  constructor() {
    super();
    this.colorNode = this.createColorNode();
    this.transparent = true;
    this.depthWrite = false;
  }

  private createColorNode() {
    return Fn(() => {
      const atlasUV = uv()
        .mul(vec2(this.frameUV.z, this.frameUV.w))
        .add(vec2(this.frameUV.x, this.frameUV.y));

      const color = texture(this.map, atlasUV);

      If(color.a.lessThan(0.01), () => Discard());

      return vec4(
        color.rgb.mul(this.tintColor),
        color.a.mul(this.alphaValue)
      );
    })();
  }
}

// 2. Sprite2D class
class Sprite2D extends Mesh {
  constructor(options: Sprite2DOptions) {
    const geometry = new PlaneGeometry(1, 1);
    const material = new Sprite2DMaterial();
    super(geometry, material);

    this.applyOptions(options);
  }
}
```

**Acceptance Criteria:**
- [ ] Sprite renders with correct UVs from spritesheet
- [ ] Tint and alpha work correctly
- [ ] Flip X/Y functions properly
- [ ] Anchor point affects positioning correctly
- [ ] Pixel-perfect rendering option works
- [ ] All loaders parse standard formats

---

### Phase 2: Animation System (Weeks 4-5)

**Deliverables:**
- `AnimatedSprite2D` class
- Animation playback (play, pause, stop, loop)
- Frame events and callbacks
- Aseprite loader support
- Animation blending (basic)

**Implementation Plan:**

```typescript
// Animation state machine
class AnimationController {
  private animations: Map<string, Animation> = new Map();
  private currentAnimation: Animation | null = null;
  private time: number = 0;

  play(name: string) {
    this.currentAnimation = this.animations.get(name) ?? null;
    this.time = 0;
  }

  update(deltaMs: number): number {
    if (!this.currentAnimation) return 0;

    this.time += deltaMs;
    const frameTime = this.time % this.currentAnimation.duration;

    // Find current frame
    let accumulated = 0;
    for (let i = 0; i < this.currentAnimation.frames.length; i++) {
      accumulated += this.currentAnimation.frameDurations[i];
      if (frameTime < accumulated) {
        return i;
      }
    }

    return this.currentAnimation.frames.length - 1;
  }
}
```

**Acceptance Criteria:**
- [ ] Animations play at correct speed
- [ ] Loop and ping-pong modes work
- [ ] Animation events fire correctly
- [ ] Aseprite tags import as animations
- [ ] Variable frame durations supported

---

### Phase 3: TSL Node Library - Part 1 (Weeks 6-8)

**Deliverables:**
- Sprite nodes (spriteFrame, spriteAtlas, spriteNineSlice)
- Color nodes (tint, hueShift, saturation, etc.)
- Alpha nodes (alphaTest, dissolve, mask)
- Outline nodes (outline, glow, pixel)
- 15+ nodes total

**Implementation Plan:**

```typescript
// @flatland/nodes/src/sprite/spriteFrame.ts
import { Fn, uv, vec2, floor, fract } from 'three/tsl';

export const spriteFrame = (
  frameIndex: ShaderNodeObject<UniformNode<number>>,
  columns: number,
  rows: number
) => {
  return Fn(() => {
    const col = frameIndex.mod(columns);
    const row = floor(frameIndex.div(columns));

    const frameSize = vec2(1.0 / columns, 1.0 / rows);
    const frameOffset = vec2(col, row).mul(frameSize);

    return uv().mul(frameSize).add(frameOffset);
  })();
};

// @flatland/nodes/src/effects/outline.ts
export const outline = (
  color: ShaderNodeObject,
  outlineColor: ShaderNodeObject,
  width: number = 1.0
) => {
  return Fn(() => {
    const texel = vec2(1.0).div(textureSize(baseTexture));
    const offset = texel.mul(width);

    // Sample neighbors
    const samples = [
      texture(baseTexture, uv().add(vec2(-offset.x, 0))),
      texture(baseTexture, uv().add(vec2(offset.x, 0))),
      texture(baseTexture, uv().add(vec2(0, -offset.y))),
      texture(baseTexture, uv().add(vec2(0, offset.y))),
    ];

    // Find max alpha of neighbors
    const maxAlpha = max(max(samples[0].a, samples[1].a), max(samples[2].a, samples[3].a));

    // Outline where current pixel is transparent but neighbors aren't
    const isOutline = color.a.lessThan(0.5).and(maxAlpha.greaterThan(0.5));

    return select(isOutline, vec4(outlineColor, 1.0), color);
  })();
};
```

**Acceptance Criteria:**
- [ ] All nodes compile for both WebGL and WebGPU
- [ ] Nodes are composable
- [ ] Performance benchmarks meet targets
- [ ] Full TypeScript types
- [ ] Each node has tests and examples

---

### Phase 4: Tilemap System (Weeks 9-11)

**Deliverables:**
- `TileMap2D` class
- `TileLayer` with culling
- `TilesetLoader` (Tiled JSON, LDtk)
- Parallax scrolling
- Collision data export

**Implementation Plan:**

```typescript
// Tile rendering uses instanced mesh for performance
class TileLayer extends Object3D {
  private mesh: InstancedMesh;
  private tileData: Uint16Array;

  constructor(layer: TileLayerData, tileset: TilesetData) {
    super();

    // Create instanced mesh for tiles
    const geometry = new PlaneGeometry(tileset.tileWidth, tileset.tileHeight);
    const material = new TileMaterial({ tileset });

    this.mesh = new InstancedMesh(
      geometry,
      material,
      layer.width * layer.height
    );

    this.buildTiles(layer);
  }

  private buildTiles(layer: TileLayerData) {
    const matrix = new Matrix4();
    let instanceIndex = 0;

    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.width; x++) {
        const tileId = layer.data[y * layer.width + x];
        if (tileId === 0) continue; // Empty tile

        matrix.setPosition(
          x * this.tileset.tileWidth,
          y * this.tileset.tileHeight,
          0
        );

        this.mesh.setMatrixAt(instanceIndex, matrix);
        this.setTileFrame(instanceIndex, tileId);
        instanceIndex++;
      }
    }

    this.mesh.count = instanceIndex;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
```

**Acceptance Criteria:**
- [ ] Tilemaps render correctly
- [ ] Frustum culling works
- [ ] Parallax scrolling works
- [ ] Tiled format imports correctly
- [ ] LDtk format imports correctly
- [ ] Performance handles 10,000+ tiles

---

### Phase 5: Render Layers & Z-Ordering (Weeks 12-13)

**Deliverables:**
- `RenderLayer2D` class
- `LayerManager` for render order
- Y-sorting for isometric
- Per-layer cameras
- Per-layer post-processing

**Implementation Plan:**

```typescript
class LayerManager {
  private layers: Map<string, RenderLayer2D> = new Map();
  private sortedLayers: RenderLayer2D[] = [];

  render(renderer: WebGPURenderer, scene: Scene) {
    // Sort layers by zIndex
    this.sortedLayers.sort((a, b) => a.zIndex - b.zIndex);

    for (const layer of this.sortedLayers) {
      if (!layer.visible) continue;

      // Optional: clear depth
      if (layer.clearDepth) {
        renderer.clearDepth();
      }

      // Sort objects within layer
      layer.sort();

      // Use layer camera or default
      const camera = layer.camera ?? scene.camera;

      // Render layer objects
      for (const object of layer.objects) {
        object.visible = true;
      }

      // Hide other objects
      for (const other of this.sortedLayers) {
        if (other !== layer) {
          for (const object of other.objects) {
            object.visible = false;
          }
        }
      }

      // Apply post-processing if any
      if (layer.postProcess.length > 0) {
        // Render to texture, apply effects, composite
        this.renderWithPostProcess(renderer, scene, camera, layer);
      } else {
        renderer.render(scene, camera);
      }
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Layers render in correct order
- [ ] Y-sorting works for isometric
- [ ] Per-layer cameras work
- [ ] Per-layer post-processing works
- [ ] Objects can move between layers

---

### Phase 6: TSL Node Library - Part 2 (Weeks 14-16)

**Deliverables:**
- Distortion nodes (wave, ripple, pixelate)
- 2D lighting nodes (point, spot, directional)
- Normal mapping for sprites
- Shadow nodes
- 20+ additional nodes

**Implementation Plan:**

```typescript
// 2D Point Light
export const pointLight2D = (
  worldPos: ShaderNodeObject,
  lightPos: ShaderNodeObject,
  lightColor: ShaderNodeObject,
  intensity: number,
  radius: number
) => {
  return Fn(() => {
    const toLight = lightPos.sub(worldPos);
    const distance = length(toLight);

    // Attenuation
    const attenuation = clamp(
      float(1.0).sub(distance.div(radius)),
      0.0,
      1.0
    );

    return lightColor.mul(intensity).mul(attenuation.mul(attenuation));
  })();
};

// Lit sprite combining normal map + lights
export const litSprite = (
  baseColor: ShaderNodeObject,
  normalMap: ShaderNodeObject,
  lights: Light2D[]
) => {
  return Fn(() => {
    const worldPos = worldPosition2D();
    const normal = normalMap.mul(2.0).sub(1.0);

    let totalLight = vec3(0.0);

    for (const light of lights) {
      const lightContrib = light.calculate(worldPos, normal);
      totalLight = totalLight.add(lightContrib);
    }

    return vec4(baseColor.rgb.mul(totalLight), baseColor.a);
  })();
};
```

**Acceptance Criteria:**
- [ ] Distortion effects work smoothly
- [ ] 2D lighting looks correct
- [ ] Normal maps affect lighting
- [ ] Shadows render properly
- [ ] All nodes composable

---

### Phase 7: Batching & Performance (Weeks 17-18)

**Deliverables:**
- `SpriteBatch` for instanced rendering
- `ParticleBatch` optimized for particles
- Auto-batching system
- Performance profiling tools

**Implementation Plan:**

```typescript
class SpriteBatch extends InstancedMesh {
  // Instance attributes
  private positions: Float32Array;
  private scales: Float32Array;
  private rotations: Float32Array;
  private frames: Uint16Array;
  private tints: Float32Array;

  constructor(options: SpriteBatchOptions) {
    const geometry = new PlaneGeometry(1, 1);
    const material = new BatchSpriteMaterial(options);
    super(geometry, material, options.maxSprites);

    this.allocateBuffers(options.maxSprites);
    this.setupAttributes();
  }

  private setupAttributes() {
    // Add instance attributes for TSL to access
    this.geometry.setAttribute('instancePosition',
      new InstancedBufferAttribute(this.positions, 3));
    this.geometry.setAttribute('instanceScale',
      new InstancedBufferAttribute(this.scales, 2));
    this.geometry.setAttribute('instanceRotation',
      new InstancedBufferAttribute(this.rotations, 1));
    this.geometry.setAttribute('instanceFrame',
      new InstancedBufferAttribute(this.frames, 1));
    this.geometry.setAttribute('instanceTint',
      new InstancedBufferAttribute(this.tints, 4));
  }

  updateSprite(id: number, props: Partial<BatchSpriteProps>) {
    if (props.position) {
      this.positions[id * 3] = props.position.x;
      this.positions[id * 3 + 1] = props.position.y;
      this.positions[id * 3 + 2] = props.position.z ?? 0;
    }
    // ... other props

    this.needsUpdate = true;
  }
}
```

**Acceptance Criteria:**
- [ ] 10,000 sprites at 60fps
- [ ] 100,000 particles at 60fps
- [ ] Dynamic updates efficient
- [ ] Memory usage optimized
- [ ] Draw calls minimized

---

### Phase 8: R3F Integration (Weeks 19-21)

**Deliverables:**
- Full TypeScript type definitions
- React components for all classes
- Hooks library
- R3F examples
- Storybook documentation

**Implementation Plan:**

```typescript
// Extend R3F types
extend({
  Sprite2D,
  AnimatedSprite2D,
  TileMap2D,
  SpriteBatch,
  RenderLayer2D,
  Sprite2DMaterial,
  LitSprite2DMaterial,
});

// Declarative layer component
export function RenderLayer({
  name,
  zIndex,
  sortMode,
  postProcess,
  children
}: RenderLayerProps) {
  const layer = useMemo(() => new RenderLayer2D({ name, zIndex, sortMode }), []);
  const { addLayer, removeLayer } = useFlatland();

  useEffect(() => {
    addLayer(layer);
    return () => removeLayer(layer);
  }, [layer]);

  // Apply post-processing
  useEffect(() => {
    if (postProcess) {
      layer.setPostProcess(postProcess);
    }
  }, [postProcess]);

  return (
    <FlatlandLayerContext.Provider value={layer}>
      {children}
    </FlatlandLayerContext.Provider>
  );
}
```

**Acceptance Criteria:**
- [ ] All types work with strict TypeScript
- [ ] Components match Three.js patterns
- [ ] Hooks are ergonomic
- [ ] Hot reloading works
- [ ] DevTools integration

---

### Phase 9: Post-Processing & Presets (Weeks 22-23)

**Deliverables:**
- Post-processing node collection
- Retro/pixel-art preset
- HD 2D preset
- VFX preset
- Preset documentation

**Implementation Plan:**

```typescript
// @flatland/presets/retro
export const retroPreset = {
  material: {
    pixelPerfect: true,
    alphaTest: 0.5,  // Hard edges
  },
  postProcess: [
    paletteReduce({ palette: 'nes' }),
    pixelPerfect({ scale: 4 }),
    crtScanlines({ density: 2, intensity: 0.1 }),
  ],
  rendering: {
    antialias: false,
    pixelRatio: 1,
  },
};

// Usage
import { applyPreset } from '@flatland/presets';
import { retroPreset } from '@flatland/presets/retro';

applyPreset(renderer, retroPreset);
```

**Acceptance Criteria:**
- [ ] Presets produce expected visual results
- [ ] Presets are composable
- [ ] Performance impact documented
- [ ] Easy to customize

---

### Phase 10: Documentation & Launch (Weeks 24-26)

**Deliverables:**
- Complete API documentation
- Tutorial series
- Migration guide (from Pixi.js)
- Performance guide
- Launch blog post
- npm publish

**Tasks:**
- [ ] API reference (TypeDoc)
- [ ] Getting started guide
- [ ] Tutorial: Basic game
- [ ] Tutorial: Platformer
- [ ] Tutorial: Isometric RPG
- [ ] Migration guide: Pixi.js
- [ ] Performance optimization guide
- [ ] Publish to npm
- [ ] Create demo site
- [ ] Write launch announcement

---

## 11. Technical Specifications

### Browser Support

| Browser | Minimum Version | Notes |
|---------|-----------------|-------|
| Chrome | 113+ | WebGPU support |
| Firefox | 121+ | WebGPU behind flag |
| Safari | 17+ | WebGPU support |
| Edge | 113+ | WebGPU support |

WebGL2 fallback for older browsers via Three.js automatic detection.

### Dependencies

```json
{
  "peerDependencies": {
    "three": ">=0.170.0",
    "@react-three/fiber": ">=8.0.0"
  },
  "dependencies": {
    // Minimal - most logic is internal
  }
}
```

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Sprites (static) | 50,000 @ 60fps | MacBook Pro M1 |
| Sprites (animated) | 10,000 @ 60fps | MacBook Pro M1 |
| Tiles (visible) | 10,000 @ 60fps | MacBook Pro M1 |
| Particles | 100,000 @ 60fps | MacBook Pro M1 |
| Draw calls | <10 for typical scene | DevTools |
| Memory | <100MB for large scene | DevTools |
| Bundle size | <50KB gzipped (core) | Bundlephobia |

### File Formats Supported

| Format | Type | Loader |
|--------|------|--------|
| JSON Hash | Spritesheet | `SpriteSheetLoader` |
| JSON Array | Spritesheet | `SpriteSheetLoader` |
| Aseprite JSON | Spritesheet | `SpriteSheetLoader` |
| TexturePacker | Atlas | `AtlasLoader` |
| Tiled JSON | Tilemap | `TilesetLoader` |
| LDtk | Tilemap | `TilesetLoader` |

---

## Appendix A: Glossary

- **TSL** - Three.js Shading Language, node-based shader system
- **R3F** - React Three Fiber, React renderer for Three.js
- **Spritesheet** - Single texture containing multiple sprite frames
- **Atlas** - Collection of textures packed into one image
- **Tilemap** - Grid-based level built from reusable tiles
- **Batch** - Multiple objects rendered in single draw call
- **Render Layer** - Logical grouping for z-order management

---

## Appendix B: Competitive Analysis

### vs Pixi.js

| Aspect | Pixi.js | Flatland |
|--------|---------|----------|
| 2D Performance | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 3D Integration | ⭐ | ⭐⭐⭐⭐⭐ |
| Shader System | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (TSL) |
| React Support | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Bundle Size | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Learning Curve | ⭐⭐⭐⭐ | ⭐⭐⭐ |

### vs drei/Sprite

| Aspect | drei | Flatland |
|--------|------|----------|
| Features | Basic | Comprehensive |
| Animation | Limited | Full |
| Tilemaps | None | Full |
| Performance | Moderate | Optimized |
| Shader Effects | Manual | Built-in nodes |

---

*End of PRD*
