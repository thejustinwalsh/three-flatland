# three-flatland

## A TSL-Native 2D Rendering Library for Three.js

---

# Product Requirements Document

**Version:** 2.0.0-draft
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
8. [Text Rendering System](#8-text-rendering-system) ← **NEW**
9. [API Design & Code Samples](#9-api-design--code-samples)
10. [R3F Integration](#10-r3f-integration)
11. [Milestone Plan](#11-milestone-plan)
12. [Technical Specifications](#12-technical-specifications)

---

## 1. Naming & Branding

### Naming Analysis - Discoverability Focus

Your concern about discoverability is valid. Research shows the `three-*` prefix pattern is the most searchable for Three.js libraries.

| Name | Discoverability | Branding | npm Search Rank | Notes |
|------|-----------------|----------|-----------------|-------|
| `flatland` | ⭐⭐ Low | ⭐⭐⭐⭐⭐ | Poor - no Three.js signal | Taken on npm (dormant) |
| `three-flatland` | ⭐⭐⭐⭐⭐ High | ⭐⭐⭐⭐ | Excellent | **Recommended** |
| `@three-flatland/core` | ⭐⭐⭐⭐ High | ⭐⭐⭐⭐⭐ | Good | Ecosystem-ready |
| `three-paper` | ⭐⭐⭐⭐ High | ⭐⭐⭐ | Good | Paper.js confusion risk |
| `drei-2d` | ⭐⭐⭐⭐⭐ High | ⭐⭐⭐ | Excellent | Implies pmndrs affiliation |

### Recommended: **`three-flatland`** (scoped: `@three-flatland/*`)

**Why this works:**
- **Searchable**: "three" prefix appears in npm search for "three.js 2d", "three sprites", etc.
- **Memorable**: "Flatland" is distinctive and references the 1884 mathematical novella about 2D beings
- **Ecosystem-ready**: Can expand to `@three-flatland/core`, `@three-flatland/react`, `@three-flatland/text`
- **Available**: Not taken on npm
- **SEO-friendly**: Contains both "three" (for Three.js) and "flat" (for 2D)

**Package Structure:**
```
three-flatland           # Main package (re-exports core)
@three-flatland/core     # Core library
@three-flatland/nodes    # TSL node collection
@three-flatland/react    # R3F integration
@three-flatland/text     # Text rendering (optional, heavier)
@three-flatland/presets  # Pre-built configurations
```

**Import Examples:**
```typescript
// Simple import
import { Sprite2D, Text2D } from 'three-flatland';

// Scoped imports for tree-shaking
import { Sprite2D } from '@three-flatland/core';
import { outline, bloom } from '@three-flatland/nodes';
import { useSprite } from '@three-flatland/react';
import { SDFText, BitmapText } from '@three-flatland/text';
```

**Tagline:** *"2D for Three.js — sprites, text, tilemaps, and more"*

**npm Keywords (for discoverability):**
```json
["three", "threejs", "three.js", "2d", "sprites", "tilemap", "spritesheet",
 "react-three-fiber", "r3f", "webgl", "webgpu", "2d-game", "texture-atlas",
 "billboard", "pixel-art", "game-development", "tsl", "text-rendering", "sdf"]
```

**npm Description:**
> "2D rendering library for Three.js — sprites, tilemaps, spritesheets, text (SDF/bitmap/canvas), and TSL shader effects. Works with React Three Fiber (R3F) and WebGPU."

---

## 2. Executive Summary

**three-flatland** is a TSL-native 2D rendering library that brings Pixi.js-caliber 2D workflows to Three.js. It provides:

1. **Rich TSL Node Collection** - 60+ shader nodes for sprites, text, effects, lighting, and post-processing
2. **Comprehensive Text System** - SDF, MSDF, bitmap fonts, and canvas-to-texture with clear performance guidance
3. **Flexible Render Targets** - Use on dedicated 2D layers (HUD), mixed with 3D scenes, or applied to any mesh/plane
4. **Game-Ready Features** - Sprite sheets, atlases, tilemaps, animations, batching, z-ordering
5. **First-Class R3F Support** - Full TypeScript types, declarative components, hooks ecosystem
6. **Performance** - Instanced batching, texture atlases, render layer optimization

---

## 3. Problem Statement

### Current Pain Points

**For Three.js developers wanting 2D:**
- No native 2D sprite system (only `THREE.Sprite` which is limited)
- No tilemap support
- No sprite sheet animation system
- **Text rendering is fragmented** - troika-three-text works but isn't TSL-native
- Must use workarounds for z-ordering (renderOrder, position.z)
- No batching/instancing abstractions for 2D
- Pixi.js interop is hacky (separate canvas, manual compositing)

**For Pixi.js developers wanting 3D:**
- Difficult to mix 2D UI with 3D scenes
- Different mental models (display list vs scene graph)
- Shader systems don't interoperate
- Text rendering approaches don't transfer

**For everyone:**
- No TSL-based 2D nodes exist
- R3F ecosystem lacks 2D primitives
- **No clear guidance on which text approach to use when**
- Modern WebGPU rendering pipeline not leveraged for 2D

### Market Gap (Updated with Text)

| Feature | Pixi.js | Three.js Native | Existing Libraries | **three-flatland** |
|---------|---------|-----------------|-------------------|--------------|
| Sprites | ✅ | ⚠️ Basic | ✅ | ✅ |
| Sprite Sheets | ✅ | ❌ | ✅ | ✅ |
| Tilemaps | ⚠️ Plugin | ❌ | ⚠️ One lib | ✅ |
| **SDF Text** | ⚠️ Plugin | ❌ | ✅ troika | ✅ TSL-native |
| **Bitmap Text** | ✅ | ❌ | ⚠️ | ✅ TSL-native |
| **Canvas Text** | ✅ | ⚠️ Manual | ⚠️ | ✅ Managed |
| **Rich Text** | ⚠️ HTMLText | ❌ | ❌ | ✅ Paragraph API |
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
5. **Comprehensive Text System** - Multiple approaches with clear performance guidance
6. **Game Engine Features** - Sprites, tilemaps, animations, physics-ready
7. **R3F Ecosystem** - Full React integration with proper types
8. **Performance Parity** - Match or exceed Pixi.js performance for equivalent workloads

### Non-Goals

1. **Replace Pixi.js** - Not building a game engine, just rendering primitives
2. **Physics Engine** - Use existing libraries (matter.js, planck.js)
3. **UI Framework** - Use existing (react-three-flex, drei Html)
4. **Scene Editor** - Out of scope
5. **Legacy Browser Support** - Targeting modern browsers (ES2020+)
6. **Full word processor** - Basic rich text, not a document editor

---

## 5. Architecture Overview

### Package Structure (Updated)

```
@three-flatland/
├── core/                    # Core library (vanilla Three.js)
│   ├── sprites/            # Sprite classes
│   ├── tilemaps/           # Tilemap system
│   ├── layers/             # Render layer management
│   ├── loaders/            # Asset loaders
│   └── batch/              # Batching system
├── nodes/                   # TSL node collection
│   ├── sprite/             # Sprite-specific nodes
│   ├── text/               # Text-specific TSL nodes ← NEW
│   ├── effects/            # Visual effects
│   ├── lighting/           # 2D lighting
│   ├── post/               # Post-processing
│   └── utility/            # Helper nodes
├── text/                    # Text rendering system ← NEW
│   ├── sdf/                # SDF/MSDF text
│   ├── bitmap/             # Bitmap font text
│   ├── canvas/             # Canvas-to-texture text
│   ├── paragraph/          # Rich text / paragraph layout
│   ├── loaders/            # Font loaders
│   └── shaping/            # Text shaping (harfbuzz integration)
├── react/                   # R3F integration
│   ├── components/         # React components
│   ├── hooks/              # Custom hooks
│   └── types/              # TypeScript declarations
└── presets/                 # Pre-built configurations
    ├── retro/              # Pixel art preset
    ├── hd/                 # HD 2D preset
    └── vfx/                # Effects-heavy preset
```

### Core Class Hierarchy (Updated)

```
THREE.Object3D
├── Sprite2D                      # Base 2D sprite
│   ├── AnimatedSprite2D          # With animation support
│   └── NineSliceSprite2D         # 9-slice scaling
├── TileMap2D                     # Tilemap renderer
├── SpriteBatch                   # Instanced sprite batch
│   └── ParticleBatch             # Optimized for particles
├── RenderLayer2D                 # Render order management
│
│  ── TEXT CLASSES ──
├── Text2D                        # Base text class (auto-selects renderer)
│   ├── SDFText                   # SDF/MSDF text (scalable, dynamic)
│   ├── BitmapText                # Bitmap font (pixel-perfect, static)
│   └── CanvasText                # Canvas-to-texture (rich styling, static)
├── TextBatch                     # Batched text rendering
└── Paragraph                     # Rich text with mixed formatting

THREE.Material (NodeMaterial)
├── Sprite2DMaterial              # Basic sprite material
├── LitSprite2DMaterial           # With 2D lighting
├── TileMaterial                  # Tilemap material
├── FlatlandMaterial              # Generic 2D material for any mesh
│
│  ── TEXT MATERIALS ──
├── SDFTextMaterial               # SDF text material (TSL)
├── MSDFTextMaterial              # Multi-channel SDF (TSL)
└── BitmapTextMaterial            # Bitmap text material (TSL)
```

---

## 6. TSL Node Collection

### Node Categories (Updated with Text Nodes)

The heart of three-flatland is its comprehensive TSL node library. These nodes can be composed to create any 2D effect.

### 6.1-6.9 [Previous sections remain the same...]

### 6.10 Text Nodes ← **NEW**

```typescript
// ═══════════════════════════════════════════════════════════════
// TEXT TSL NODES - The magic for high-performance text rendering
// ═══════════════════════════════════════════════════════════════

// ─── SDF Text Nodes ───
sdfSample(sdfTexture, uv)              // Sample SDF texture
sdfAlpha(distance, smoothing)           // Convert distance to alpha
sdfOutline(distance, outlineWidth, outlineColor)
sdfGlow(distance, glowRadius, glowColor)
sdfShadow(distance, offset, blur, color)
sdfSuperSample(sdfTexture, uv)          // 4x supersampling for quality

// ─── MSDF Text Nodes ───
msdfMedian(r, g, b)                     // Calculate median for MSDF
msdfSample(msdfTexture, uv)             // Sample + median in one
msdfAlpha(distance, pxRange)            // Pixel-range-aware alpha

// ─── Text Effects ───
textGradient(text, colors, direction)   // Gradient fill
textPattern(text, patternTexture)       // Pattern fill
textStroke(text, strokeWidth, strokeColor)
textBevel(text, lightDir, depth)        // Bevel/emboss effect
textNeon(text, glowColor, intensity)    // Neon glow effect
textGlitch(text, intensity, speed)      // Glitch distortion
textWave(text, amplitude, frequency)    // Wavy text
textTypewriter(text, progress)          // Reveal animation
textScramble(text, progress, chars)     // Scramble reveal

// ─── Text Layout Nodes ───
textUV(charIndex, charCount)            // Per-character UV
textProgress(charIndex, total)          // 0-1 progress through text
textLineProgress(lineIndex, lineCount)  // Per-line progress
textWordBounds(wordIndex)               // Word bounding box

// ─── Per-Character Animation ───
charOffset(charIndex, offsets)          // Per-char position offset
charRotation(charIndex, rotations)      // Per-char rotation
charScale(charIndex, scales)            // Per-char scale
charColor(charIndex, colors)            // Per-char color
charWave(charIndex, amplitude, freq, phase)  // Wave by character
charRainbow(charIndex, saturation, lightness) // Rainbow text
```

### 6.11 Utility Nodes (Extended)

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

// ─── Text Utilities ─── (NEW)
fontMetrics(font)              // Access font metrics
glyphBounds(char, font)        // Get glyph bounds
kernPair(char1, char2, font)   // Get kerning value
```

---

## 7. Core Systems

[Sections 7.1-7.6 remain the same as v1...]

---

## 8. Text Rendering System ← **NEW MAJOR SECTION**

### 8.1 Philosophy: Choose the Right Tool

Text rendering is complex. Different use cases require different approaches. **three-flatland** provides three distinct text renderers, each optimized for specific scenarios.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TEXT RENDERER SELECTION GUIDE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     "Is the text..."     ┌─────────────────────────────┐  │
│  │             │                          │                             │  │
│  │  SDFText    │ ◄── Dynamic/Scalable ─── │  • Chat messages            │  │
│  │             │     Updates frequently   │  • Player names             │  │
│  │  BEST FOR:  │     Needs effects        │  • Damage numbers           │  │
│  │  • Scalable │     Zooms in/out         │  • UI that scales           │  │
│  │  • Dynamic  │                          │  • Any text that changes    │  │
│  │  • Effects  │                          │                             │  │
│  └─────────────┘                          └─────────────────────────────┘  │
│                                                                             │
│  ┌─────────────┐                          ┌─────────────────────────────┐  │
│  │             │                          │                             │  │
│  │ BitmapText  │ ◄── Static/Pixel-art ─── │  • Score displays           │  │
│  │             │     Fixed size           │  • Retro game text          │  │
│  │  BEST FOR:  │     Pixel-perfect        │  • Fixed HUD elements       │  │
│  │  • Pixel    │     Maximum performance  │  • Thousands of labels      │  │
│  │  • Static   │                          │                             │  │
│  │  • Perf     │                          │                             │  │
│  └─────────────┘                          └─────────────────────────────┘  │
│                                                                             │
│  ┌─────────────┐                          ┌─────────────────────────────┐  │
│  │             │                          │                             │  │
│  │ CanvasText  │ ◄── Rich/Complex ─────── │  • Styled paragraphs        │  │
│  │             │     Mixed formatting     │  • Markdown-like content    │  │
│  │  BEST FOR:  │     Rare updates         │  • Dialog boxes             │  │
│  │  • Rich     │     Quality over perf    │  • Tutorial text            │  │
│  │  • Styled   │                          │                             │  │
│  │  • Quality  │                          │                             │  │
│  └─────────────┘                          └─────────────────────────────┘  │
│                                                                             │
│  ┌─────────────┐                          ┌─────────────────────────────┐  │
│  │             │                          │                             │  │
│  │ Paragraph   │ ◄── Document-like ────── │  • Mixed fonts/sizes        │  │
│  │             │     Complex layout       │  • Inline images            │  │
│  │  BEST FOR:  │     Skia-inspired        │  • Text wrapping            │  │
│  │  • Layout   │     Rich documents       │  • Bidirectional text       │  │
│  │  • Mixed    │                          │                             │  │
│  │  • i18n     │                          │                             │  │
│  └─────────────┘                          └─────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Performance Characteristics

| Renderer | Init Cost | Update Cost | Memory | GPU Load | Max Instances | Best For |
|----------|-----------|-------------|--------|----------|---------------|----------|
| **SDFText** | Medium | Low | Low | Low | 10,000+ | Dynamic text, effects |
| **BitmapText** | Low | Very Low | Very Low | Very Low | 100,000+ | Static text, pixel art |
| **CanvasText** | High | Very High | High | Low | ~100 | Rich text, rare updates |
| **Paragraph** | High | High | Medium | Low | ~500 | Complex layouts |

### 8.3 SDFText (Signed Distance Field)

**When to use:** Text that scales, animates, or needs shader effects.

**How it works:**
1. Pre-generate or runtime-generate SDF atlas from font
2. Store distance-to-edge in texture (grayscale)
3. TSL shader converts distance to crisp alpha
4. Effects (outline, glow, shadow) computed in shader

```typescript
// ═══════════════════════════════════════════════════════════════
// SDFText - For dynamic, scalable text with effects
// ═══════════════════════════════════════════════════════════════

interface SDFTextOptions {
  font: string | SDFFont;          // Font URL or pre-loaded font
  text: string;
  fontSize: number;
  color?: Color;
  anchor?: Vector2;                // Text anchor (0-1)

  // SDF-specific
  sdfGlyphSize?: number;           // SDF texture resolution (default: 64)
  smoothing?: number;              // Edge smoothing (default: auto)

  // Effects (all TSL-powered)
  outlineWidth?: number;
  outlineColor?: Color;
  glowRadius?: number;
  glowColor?: Color;
  shadowOffset?: Vector2;
  shadowBlur?: number;
  shadowColor?: Color;

  // Performance hints
  dynamic?: boolean;               // Optimize for frequent updates
  maxLength?: number;              // Pre-allocate buffer
}

class SDFText extends Object3D {
  // Core properties
  text: string;                    // Setting triggers efficient update
  fontSize: number;
  color: Color;

  // Access the TSL material for custom effects
  material: SDFTextMaterial;

  // Metrics
  readonly width: number;
  readonly height: number;
  readonly lineCount: number;

  // Methods
  setText(text: string): void;     // Efficient text update
  setStyle(style: Partial<SDFTextStyle>): void;

  // For custom TSL effects
  getCharNode(index: number): CharacterNode;
}
```

**TSL Material Implementation:**

```typescript
// SDFTextMaterial - TSL-based SDF rendering
class SDFTextMaterial extends MeshBasicNodeMaterial {
  // Uniforms exposed for animation
  readonly colorUniform = uniform(new Color(0xffffff));
  readonly outlineWidthUniform = uniform(0.0);
  readonly outlineColorUniform = uniform(new Color(0x000000));
  readonly glowRadiusUniform = uniform(0.0);
  readonly glowColorUniform = uniform(new Color(0xffffff));

  constructor() {
    super();

    this.colorNode = Fn(() => {
      const sdfValue = texture(this.sdfAtlas, vUV).r;

      // Core SDF alpha
      const smoothing = fwidth(sdfValue);
      let alpha = smoothstep(
        float(0.5).sub(smoothing),
        float(0.5).add(smoothing),
        sdfValue
      );

      // Outline
      const outlineAlpha = smoothstep(
        float(0.5).sub(this.outlineWidthUniform).sub(smoothing),
        float(0.5).sub(this.outlineWidthUniform).add(smoothing),
        sdfValue
      );

      // Glow
      const glowAlpha = smoothstep(
        float(0.0),
        float(0.5).sub(this.glowRadiusUniform),
        sdfValue
      ).mul(0.5);

      // Composite
      const glowColor = vec4(this.glowColorUniform, glowAlpha);
      const outlineColor = vec4(this.outlineColorUniform, outlineAlpha);
      const fillColor = vec4(this.colorUniform, alpha);

      // Layer: glow -> outline -> fill
      let result = glowColor;
      result = mix(result, outlineColor, outlineAlpha);
      result = mix(result, fillColor, alpha);

      return result;
    })();

    this.transparent = true;
    this.depthWrite = false;
  }
}
```

### 8.4 MSDFText (Multi-channel SDF)

**When to use:** Same as SDFText but need sharper corners (logos, geometric fonts).

**Difference from SDF:** Uses RGB channels to encode directional distance, preserving sharp corners that single-channel SDF loses.

```typescript
// MSDFText - Sharp corners preserved
class MSDFText extends SDFText {
  constructor(options: MSDFTextOptions) {
    super({ ...options, sdfType: 'msdf' });
  }
}

// MSDF-specific TSL node
const msdfMedian = (r: Node, g: Node, b: Node) => {
  return max(min(r, g), min(max(r, g), b));
};
```

### 8.5 BitmapText

**When to use:** Pixel art games, retro aesthetics, maximum performance, static labels.

**How it works:**
1. Pre-rendered font glyphs in texture atlas (BMFont format)
2. One quad per character, instanced rendering
3. No runtime font processing
4. Cannot scale smoothly (use integer multiples)

```typescript
// ═══════════════════════════════════════════════════════════════
// BitmapText - For pixel-perfect, high-performance text
// ═══════════════════════════════════════════════════════════════

interface BitmapTextOptions {
  font: string | BitmapFont;       // BMFont .fnt URL or pre-loaded
  text: string;
  tint?: Color;
  letterSpacing?: number;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;               // Word wrap width

  // Performance
  static?: boolean;                // Optimize for never-changing text
}

class BitmapText extends Object3D {
  text: string;
  tint: Color;

  // Material for TSL effects
  material: BitmapTextMaterial;

  // Metrics
  readonly width: number;
  readonly height: number;
  readonly charCount: number;

  // Per-character access for effects
  getCharPosition(index: number): Vector2;
  setCharTint(index: number, color: Color): void;
  setCharOffset(index: number, offset: Vector2): void;
}
```

**BMFont Loader:**

```typescript
// Load BMFont format (AngelCode BMFont, Hiero, Littera, etc.)
class BitmapFontLoader {
  async load(url: string): Promise<BitmapFont>;
  async loadFromBuffer(buffer: ArrayBuffer): Promise<BitmapFont>;

  // Pre-generate common fonts
  static presets = {
    'pixel-8': '/fonts/pixel-8.fnt',
    'pixel-16': '/fonts/pixel-16.fnt',
    'retro-mono': '/fonts/retro-mono.fnt',
  };
}

interface BitmapFont {
  texture: Texture;
  chars: Map<number, BitmapChar>;  // charCode -> glyph data
  kernings: Map<string, number>;   // "AV" -> -2
  lineHeight: number;
  base: number;
  size: number;
}
```

### 8.6 CanvasText

**When to use:** Rich styling (CSS-like), infrequent updates, quality over performance.

**How it works:**
1. Render text to off-screen Canvas 2D
2. Upload canvas as GPU texture
3. Display as textured quad
4. **Re-renders entire texture on any change** (expensive!)

```typescript
// ═══════════════════════════════════════════════════════════════
// CanvasText - For rich styling, AVOID frequent updates
// ═══════════════════════════════════════════════════════════════

interface CanvasTextOptions {
  text: string;
  style: CanvasTextStyle;
  maxWidth?: number;

  // Resolution
  resolution?: number;             // Texture resolution multiplier
  padding?: number;                // Padding around text
}

interface CanvasTextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight?: string;
  fontStyle?: string;
  fill?: Color | CanvasGradient | CanvasPattern;
  stroke?: Color;
  strokeWidth?: number;
  dropShadow?: boolean;
  dropShadowColor?: Color;
  dropShadowBlur?: number;
  dropShadowOffset?: Vector2;
  lineHeight?: number;
  letterSpacing?: number;
  wordWrap?: boolean;
  wordWrapWidth?: number;
  align?: 'left' | 'center' | 'right';
}

class CanvasText extends Object3D {
  text: string;                    // ⚠️ Setting triggers re-render!
  style: CanvasTextStyle;          // ⚠️ Setting triggers re-render!

  // Force re-render (call after batch style changes)
  updateTexture(): void;

  // Batch style changes without re-render
  setStyleBatch(fn: (style: CanvasTextStyle) => void): void;

  // Get texture for manual use
  readonly texture: Texture;
}
```

**⚠️ Performance Warning API:**

```typescript
// The API itself warns about performance
class CanvasText {
  set text(value: string) {
    if (this._warnOnFrequentUpdates) {
      this._updateCount++;
      if (this._updateCount > 10 && performance.now() - this._lastWarnTime < 1000) {
        console.warn(
          '[three-flatland] CanvasText updated frequently. ' +
          'Consider using SDFText for dynamic text. ' +
          'Suppress with { warnOnFrequentUpdates: false }'
        );
        this._lastWarnTime = performance.now();
      }
    }
    this._text = value;
    this.updateTexture();
  }
}
```

### 8.7 Paragraph (Rich Text / Skia-inspired)

**When to use:** Mixed formatting, complex layouts, document-like text.

**Inspired by:** Skia's Paragraph API, providing rich text layout capabilities.

```typescript
// ═══════════════════════════════════════════════════════════════
// Paragraph - Rich text with mixed formatting (Skia-inspired)
// ═══════════════════════════════════════════════════════════════

interface ParagraphStyle {
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDirection?: 'ltr' | 'rtl';
  maxLines?: number;
  ellipsis?: string;
  strutStyle?: StrutStyle;
}

interface TextStyle {
  color?: Color;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  letterSpacing?: number;
  wordSpacing?: number;
  decoration?: 'none' | 'underline' | 'overline' | 'line-through';
  decorationColor?: Color;
  decorationStyle?: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy';
  backgroundColor?: Color;
}

class ParagraphBuilder {
  constructor(style: ParagraphStyle);

  // Push/pop styles for nesting
  pushStyle(style: TextStyle): this;
  pop(): this;

  // Add content
  addText(text: string): this;
  addPlaceholder(width: number, height: number, align: PlaceholderAlign): this;

  // Build
  build(): Paragraph;
}

class Paragraph extends Object3D {
  // Layout
  layout(maxWidth: number): void;

  // Metrics
  readonly width: number;
  readonly height: number;
  readonly lineCount: number;
  readonly didExceedMaxLines: boolean;

  // Hit testing
  getPositionForOffset(offset: number): Vector2;
  getOffsetForPosition(position: Vector2): number;
  getWordBoundary(offset: number): { start: number; end: number };
  getLineBoundary(lineNumber: number): { start: number; end: number };

  // Rendering approach (auto-selected based on content)
  readonly renderMode: 'sdf' | 'canvas' | 'hybrid';
}
```

**Usage Example:**

```typescript
// Create rich text paragraph
const builder = new ParagraphBuilder({
  textAlign: 'left',
  maxLines: 3,
  ellipsis: '...',
});

builder
  .pushStyle({ fontSize: 24, fontWeight: 700 })
  .addText('Welcome!')
  .pop()
  .addText('\n\n')
  .pushStyle({ fontSize: 16, color: new Color(0x666666) })
  .addText('This is a ')
  .pushStyle({ fontStyle: 'italic', color: new Color(0x0066cc) })
  .addText('rich text')
  .pop()
  .addText(' paragraph with ')
  .pushStyle({ decoration: 'underline' })
  .addText('mixed formatting')
  .pop()
  .addText('.');

const paragraph = builder.build();
paragraph.layout(300); // Max width 300px
scene.add(paragraph);
```

### 8.8 TextBatch (Batched Text Rendering)

**When to use:** Hundreds/thousands of text labels with same font.

```typescript
// ═══════════════════════════════════════════════════════════════
// TextBatch - Instanced rendering for many text instances
// ═══════════════════════════════════════════════════════════════

interface TextBatchOptions {
  font: SDFFont | BitmapFont;
  maxInstances: number;
  maxCharsPerInstance?: number;    // Default: 64

  // What can change per-frame
  dynamic?: {
    position?: boolean;
    rotation?: boolean;
    scale?: boolean;
    color?: boolean;
    text?: boolean;                // ⚠️ Expensive if true
  };
}

class TextBatch extends Object3D {
  // Add text instances
  addText(text: string, options: BatchTextOptions): number;  // Returns ID
  removeText(id: number): void;
  updateText(id: number, options: Partial<BatchTextOptions>): void;

  // Bulk updates (more efficient)
  setPositions(positions: Float32Array): void;
  setColors(colors: Float32Array): void;
  setScales(scales: Float32Array): void;

  // Stats
  readonly instanceCount: number;
  readonly totalCharCount: number;
}
```

### 8.9 Font Loading & Management

```typescript
// ═══════════════════════════════════════════════════════════════
// Font Loading - Unified API for all font types
// ═══════════════════════════════════════════════════════════════

class FontManager {
  // Load any font type
  async load(url: string, type?: 'sdf' | 'msdf' | 'bitmap' | 'auto'): Promise<Font>;

  // Pre-load fonts
  async preload(fonts: FontDefinition[]): Promise<void>;

  // Get cached font
  get(name: string): Font | null;

  // Generate SDF/MSDF at runtime from TTF/OTF
  async generateSDF(
    fontUrl: string,
    options?: SDFGenerationOptions
  ): Promise<SDFFont>;

  // Use system fonts (canvas-based only)
  getSystemFont(family: string): SystemFont;
}

// SDF Generation Options
interface SDFGenerationOptions {
  charset?: string | 'ascii' | 'latin' | 'full';  // Which glyphs to generate
  fontSize?: number;                               // Base size for SDF
  buffer?: number;                                 // Padding around glyphs
  radius?: number;                                 // SDF radius
  cutoff?: number;                                 // Distance cutoff
  type?: 'sdf' | 'msdf';                          // Single or multi-channel
}

// Pre-built font presets
const FontPresets = {
  // SDF fonts (scalable, effects-ready)
  'roboto-sdf': { url: '/fonts/roboto-sdf.json', type: 'msdf' },
  'inter-sdf': { url: '/fonts/inter-sdf.json', type: 'msdf' },
  'fira-code-sdf': { url: '/fonts/fira-code-sdf.json', type: 'msdf' },

  // Bitmap fonts (pixel-perfect)
  'pixel-8': { url: '/fonts/pixel-8.fnt', type: 'bitmap' },
  'pixel-16': { url: '/fonts/pixel-16.fnt', type: 'bitmap' },
  'terminus': { url: '/fonts/terminus.fnt', type: 'bitmap' },
};
```

### 8.10 Text Shaping (International Support)

For complex scripts (Arabic, Hindi, Thai, etc.), we integrate with HarfBuzz via harfbuzzjs.

```typescript
// ═══════════════════════════════════════════════════════════════
// Text Shaping - For complex scripts and proper ligatures
// ═══════════════════════════════════════════════════════════════

// Opt-in: Only load harfbuzzjs when needed (~1MB WASM)
import { enableTextShaping } from '@three-flatland/text/shaping';

// Initialize shaping (downloads WASM)
await enableTextShaping();

// Now all text classes use proper shaping
const arabicText = new SDFText({
  font: arabicFont,
  text: 'مرحبا بالعالم',  // "Hello World" in Arabic
  // Automatically shaped with correct ligatures and RTL
});

// Explicit shaping control
interface ShapingOptions {
  script?: string;                 // ISO 15924 script code
  language?: string;               // BCP 47 language tag
  direction?: 'ltr' | 'rtl' | 'auto';
  features?: string[];             // OpenType features to enable/disable
}
```

### 8.11 Text TSL Effects Gallery

```typescript
// ═══════════════════════════════════════════════════════════════
// TEXT EFFECTS - TSL-powered text effects
// ═══════════════════════════════════════════════════════════════

import {
  textGradient,
  textNeon,
  textGlitch,
  textWave,
  textTypewriter,
  charRainbow,
  charWave,
} from '@three-flatland/nodes';

// ─── Gradient Text ───
const gradientText = new SDFText({ font, text: 'GRADIENT' });
gradientText.material.colorNode = textGradient(
  [new Color(0xff0000), new Color(0x0000ff)],
  'horizontal'
);

// ─── Neon Glow ───
const neonText = new SDFText({ font, text: 'NEON' });
neonText.material.colorNode = textNeon(
  vec3(1, 0, 1),  // Magenta
  2.0             // Intensity
);

// ─── Glitch Effect ───
const glitchText = new SDFText({ font, text: 'GLITCH' });
glitchText.material.colorNode = textGlitch(
  baseColor,
  0.5,            // Intensity
  time()          // Animated
);

// ─── Wave Animation ───
const waveText = new SDFText({ font, text: 'WAVY TEXT' });
waveText.material.positionNode = textWave(
  position,
  10.0,           // Amplitude
  2.0             // Frequency
);

// ─── Typewriter Reveal ───
const typewriterText = new SDFText({ font, text: 'REVEALING...' });
const progress = uniform(0.0);  // Animate 0 -> 1
typewriterText.material.colorNode = textTypewriter(baseColor, progress);

// In animation loop:
progress.value = (Date.now() % 2000) / 2000;

// ─── Per-Character Rainbow ───
const rainbowText = new SDFText({ font, text: 'RAINBOW' });
rainbowText.material.colorNode = charRainbow(
  charIndex,      // Built-in character index
  1.0,            // Saturation
  0.5             // Lightness
);

// ─── Per-Character Wave ───
const bounceText = new SDFText({ font, text: 'BOUNCY' });
bounceText.material.positionNode = charWave(
  charIndex,
  5.0,            // Amplitude
  3.0,            // Frequency
  time()          // Phase (animated)
);
```

### 8.12 Dependencies & Bundle Impact

| Feature | Dependency | Size (gzip) | When Loaded |
|---------|------------|-------------|-------------|
| SDFText | Built-in | 0KB | Always |
| MSDFText | Built-in | 0KB | Always |
| BitmapText | Built-in | 0KB | Always |
| CanvasText | Built-in | 0KB | Always |
| Paragraph | Built-in | ~5KB | On import |
| Text Shaping | harfbuzzjs | ~300KB | Opt-in |
| Runtime SDF Gen | tiny-sdf | ~2KB | Opt-in |
| Complex Layouts | bidi-js | ~15KB | Opt-in |

---

## 9. API Design & Code Samples

### 9.1-9.7 [Previous sections remain, renumbered...]

### 9.8 Text Rendering Examples ← **NEW**

#### Basic Text

```typescript
import { SDFText, BitmapText, CanvasText, FontManager } from '@three-flatland/text';

// Load fonts
const fonts = new FontManager();
await fonts.preload([
  { name: 'main', url: '/fonts/roboto-msdf.json', type: 'msdf' },
  { name: 'pixel', url: '/fonts/pixel-8.fnt', type: 'bitmap' },
]);

// SDF Text - for dynamic content
const playerName = new SDFText({
  font: fonts.get('main'),
  text: 'Player1',
  fontSize: 24,
  color: new Color(0xffffff),
  outlineWidth: 2,
  outlineColor: new Color(0x000000),
});
playerName.position.set(100, 50, 0);
scene.add(playerName);

// Update efficiently
playerName.text = 'NewName';  // Fast update

// Bitmap Text - for pixel art / HUD
const score = new BitmapText({
  font: fonts.get('pixel'),
  text: 'SCORE: 0',
  tint: new Color(0xffff00),
});
hudLayer.add(score);

// Canvas Text - for rich styling (use sparingly!)
const dialog = new CanvasText({
  text: 'Welcome, adventurer!',
  style: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fill: new Color(0x333333),
    dropShadow: true,
    dropShadowColor: new Color(0x000000),
    dropShadowBlur: 4,
    wordWrap: true,
    wordWrapWidth: 250,
  },
});
dialogBox.add(dialog);
```

#### Damage Numbers (Dynamic Text Pattern)

```typescript
// Perfect use case for SDFText + batching
const damageNumbers = new TextBatch({
  font: await fonts.generateSDF('/fonts/impact.ttf', { type: 'msdf' }),
  maxInstances: 100,
  dynamic: { position: true, scale: true, color: true },
});

function showDamage(amount: number, worldPos: Vector3) {
  const id = damageNumbers.addText(amount.toString(), {
    position: worldPos,
    color: amount > 100 ? new Color(0xff0000) : new Color(0xffff00),
    scale: 1.0,
  });

  // Animate
  gsap.to({}, {
    duration: 1,
    onUpdate: function() {
      const progress = this.progress();
      damageNumbers.updateText(id, {
        position: worldPos.clone().add(new Vector3(0, progress * 50, 0)),
        scale: 1 + progress * 0.5,
        color: new Color(0xffff00).lerp(new Color(0xff0000), progress),
      });
    },
    onComplete: () => damageNumbers.removeText(id),
  });
}
```

#### Chat System (Dynamic Text Pattern)

```typescript
// Chat messages - SDFText with effects
class ChatMessage extends SDFText {
  constructor(username: string, message: string, color: Color) {
    super({
      font: chatFont,
      text: `${username}: ${message}`,
      fontSize: 14,
      color: new Color(0xffffff),
    });

    // Username highlight effect
    this.material.colorNode = Fn(() => {
      const charProgress = textProgress(charIndex, username.length);
      const isUsername = charProgress.lessThan(1.0);

      return select(
        isUsername,
        vec4(color, 1.0),  // Username in player color
        vec4(1, 1, 1, 1)   // Message in white
      );
    })();
  }
}
```

### 9.9 R3F Text Components ← **NEW**

```tsx
import {
  SDFText,
  BitmapText,
  CanvasText,
  Paragraph,
  useFont,
  useFontManager,
} from '@three-flatland/react';

function GameUI() {
  const mainFont = useFont('/fonts/roboto-msdf.json', 'msdf');
  const pixelFont = useFont('/fonts/pixel-8.fnt', 'bitmap');

  return (
    <>
      {/* Dynamic text - updates every frame */}
      <SDFText
        font={mainFont}
        text={`Score: ${score}`}
        fontSize={24}
        position={[10, 10, 0]}
        outlineWidth={2}
        outlineColor="black"
      />

      {/* Static pixel text */}
      <BitmapText
        font={pixelFont}
        text="LEVEL 1"
        position={[400, 10, 0]}
        tint="#ffff00"
      />

      {/* Rich dialog text (rarely updates) */}
      <CanvasText
        text={dialogText}
        style={{
          fontFamily: 'Georgia',
          fontSize: 16,
          wordWrap: true,
          wordWrapWidth: 300,
        }}
        position={[50, 400, 0]}
      />

      {/* Complex formatted text */}
      <Paragraph maxWidth={400} position={[200, 200, 0]}>
        <ParagraphSpan fontSize={20} fontWeight={700}>
          Quest Complete!
        </ParagraphSpan>
        <ParagraphSpan fontSize={14} color="#666666">
          You have defeated the dragon and saved the village.
        </ParagraphSpan>
        <ParagraphSpan fontSize={14} color="#ffcc00" decoration="underline">
          Reward: 500 gold
        </ParagraphSpan>
      </Paragraph>
    </>
  );
}
```

---

## 10. R3F Integration

[Updated with text components - see 9.9 above]

---

## 11. Milestone Plan (Updated)

### Phase 0-7 [Previous phases remain the same...]

### Phase 8: Text Rendering System (Weeks 19-22) ← **UPDATED**

**Deliverables:**
- `SDFText` and `MSDFText` with TSL materials
- `BitmapText` with BMFont loader
- `CanvasText` with rich styling
- `Paragraph` API (Skia-inspired)
- `TextBatch` for instanced text
- Font loading and management
- Text TSL nodes (20+ nodes)
- International text support (opt-in harfbuzzjs)

**Week 19-20: Core Text Renderers**

```typescript
// Implementation order:
// 1. BitmapText (simplest, validates pipeline)
// 2. SDFText (most important, TSL showcase)
// 3. CanvasText (straightforward, uses Canvas 2D)
// 4. MSDFText (extends SDFText)
```

**Week 21: Paragraph & Batching**

```typescript
// ParagraphBuilder implementation
// TextBatch for instanced rendering
// Performance optimization pass
```

**Week 22: Effects & Polish**

```typescript
// Text TSL nodes
// Font management system
// Documentation and examples
```

**Acceptance Criteria:**
- [ ] SDFText renders crisp at all scales
- [ ] BitmapText is pixel-perfect
- [ ] CanvasText supports full CSS-like styling
- [ ] Paragraph handles mixed formatting
- [ ] TextBatch renders 10,000+ labels at 60fps
- [ ] All text effects work (outline, glow, shadow, etc.)
- [ ] Font loading is seamless
- [ ] R3F components work correctly
- [ ] Performance warnings appear for misuse

### Phase 9: R3F Integration (Weeks 23-24) ← **SHORTENED**

[Absorbed some text work into Phase 8]

### Phase 10: Post-Processing & Presets (Weeks 25-26)

[Same as before]

### Phase 11: Documentation & Launch (Weeks 27-28)

**Additional documentation for text:**
- [ ] Text renderer selection guide
- [ ] Font preparation guide (SDF generation)
- [ ] Performance optimization for text
- [ ] International text setup guide
- [ ] Text effects cookbook

---

## 12. Technical Specifications

### Performance Targets (Updated with Text)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Sprites (static) | 50,000 @ 60fps | MacBook Pro M1 |
| Sprites (animated) | 10,000 @ 60fps | MacBook Pro M1 |
| Tiles (visible) | 10,000 @ 60fps | MacBook Pro M1 |
| Particles | 100,000 @ 60fps | MacBook Pro M1 |
| **SDFText instances** | 10,000 @ 60fps | MacBook Pro M1 |
| **BitmapText instances** | 100,000 @ 60fps | MacBook Pro M1 |
| **CanvasText instances** | 100 @ 60fps | MacBook Pro M1 |
| **TextBatch labels** | 50,000 @ 60fps | MacBook Pro M1 |
| Draw calls | <10 for typical scene | DevTools |
| Memory | <100MB for large scene | DevTools |
| Bundle size (core) | <50KB gzipped | Bundlephobia |
| **Bundle size (text)** | <20KB gzipped | Bundlephobia |
| **Bundle size (shaping)** | ~300KB gzipped | Bundlephobia (opt-in) |

### File Formats Supported (Updated)

| Format | Type | Loader |
|--------|------|--------|
| JSON Hash | Spritesheet | `SpriteSheetLoader` |
| JSON Array | Spritesheet | `SpriteSheetLoader` |
| Aseprite JSON | Spritesheet | `SpriteSheetLoader` |
| TexturePacker | Atlas | `AtlasLoader` |
| Tiled JSON | Tilemap | `TilesetLoader` |
| LDtk | Tilemap | `TilesetLoader` |
| **BMFont (.fnt)** | Bitmap Font | `BitmapFontLoader` |
| **MSDF JSON** | SDF Font | `SDFFontLoader` |
| **TTF/OTF/WOFF** | Vector Font | `FontManager.generateSDF()` |

---

## Appendix C: Text Renderer Decision Matrix

```
┌────────────────────────────────────────────────────────────────────────────┐
│                      WHEN TO USE WHICH TEXT RENDERER                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Question                              │ Answer → Use This                 │
│  ──────────────────────────────────────┼───────────────────────────────────│
│  Will text change frequently?          │ Yes → SDFText                     │
│  Need it to scale/zoom smoothly?       │ Yes → SDFText or MSDFText         │
│  Need shader effects (glow, outline)?  │ Yes → SDFText                     │
│  Is it pixel art / retro style?        │ Yes → BitmapText                  │
│  Fixed size, never scales?             │ Yes → BitmapText                  │
│  Need 10,000+ text labels?             │ Yes → TextBatch                   │
│  Need CSS-like rich styling?           │ Yes → CanvasText (if static)      │
│  Need mixed fonts/sizes in one block?  │ Yes → Paragraph                   │
│  Updates < 1 time per second?          │ OK for CanvasText                 │
│  Updates every frame?                  │ MUST use SDFText or BitmapText    │
│  Need RTL/complex scripts?             │ Enable text shaping + SDFText     │
│  Sharp corners important (logos)?      │ Yes → MSDFText                    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix D: Glossary (Updated)

- **TSL** - Three.js Shading Language, node-based shader system
- **R3F** - React Three Fiber, React renderer for Three.js
- **Spritesheet** - Single texture containing multiple sprite frames
- **Atlas** - Collection of textures packed into one image
- **Tilemap** - Grid-based level built from reusable tiles
- **Batch** - Multiple objects rendered in single draw call
- **Render Layer** - Logical grouping for z-order management
- **SDF** - Signed Distance Field, stores distance-to-edge for scalable rendering
- **MSDF** - Multi-channel SDF, preserves sharp corners using RGB channels
- **BMFont** - AngelCode Bitmap Font format, pre-rendered glyphs in atlas
- **Text Shaping** - Converting Unicode text to positioned glyphs (HarfBuzz)
- **Glyph** - Visual representation of a character in a font

---

*End of PRD v2*
