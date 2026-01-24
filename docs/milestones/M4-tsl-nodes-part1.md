# M4: TSL Nodes Part 1 - Sprite/Color/Alpha Effects

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 3 weeks |
| **Dependencies** | M3 (2D Render Pipeline) |
| **Outputs** | 15+ TSL nodes: Sprite nodes, Color nodes, Alpha nodes |
| **Risk Level** | Medium (shader complexity, cross-platform compatibility) |

---

## Objectives

1. Implement **Sprite Nodes**: UV manipulation (scale, offset, rotate, flip), pixelate, outline
2. Implement **Color Nodes**: tint, hueShift, saturate, brightness, contrast, colorRemap
3. Implement **Alpha Nodes**: alphaTest, alphaMask, fadeEdge, dissolve
4. Create composable TSL node system for shader effects
5. Ensure WebGL2 and WebGPU compatibility
6. Provide type-safe APIs with full TypeScript support
7. **Integrate with Unified Effect System from M3**

---

## Integration with TSL-Native Batching

TSL nodes are used directly in `Sprite2DMaterial` to define shader effects. **Batching is automatic by material identity** - sprites sharing the same material instance batch together.

### How It Works

```typescript
import { Sprite2DMaterial, hueShift, dissolve } from '@three-flatland/core';
import { texture, uv, uniform } from 'three/tsl';

// Define a material with effects using TSL nodes
const glowMaterial = new Sprite2DMaterial({ texture: heroTexture });
glowMaterial.colorNode = hueShift(
  texture(glowMaterial.map, uv()),
  { amount: uniform(0.3) }
);

// Sprites sharing this material batch together automatically
const sprite1 = new Sprite2D({ material: glowMaterial });
const sprite2 = new Sprite2D({ material: glowMaterial });
// → 1 draw call for both sprites!
```

### Per-Instance Effect Values

When you need different effect values per sprite (e.g., individual dissolve progress), use instance attributes:

```typescript
const ghostMaterial = new Sprite2DMaterial({ texture: heroTexture });

// Add per-instance attribute only when needed
ghostMaterial.addInstanceFloat('dissolve', 0); // name, default value

// Use it in TSL
ghostMaterial.colorNode = dissolve(
  texture(ghostMaterial.map, uv()),
  { progress: ghostMaterial.instanceFloat('dissolve') }
);

// Sprites share material but have different dissolve values
const ghost1 = new Sprite2D({ material: ghostMaterial });
const ghost2 = new Sprite2D({ material: ghostMaterial });

ghost1.setInstanceValue('dissolve', 0.3);
ghost2.setInstanceValue('dissolve', 0.7);
// → Still 1 draw call! Instance data only includes dissolve for this material.
```

### Node Usage Patterns

| Pattern | Description | Batching |
|---------|-------------|----------|
| **Uniform-based** | Same effect value for all sprites with material | ✅ Batched, uniform animatable |
| **Instance-based** | Different effect value per sprite | ✅ Batched, via `addInstanceFloat/Vec` |
| **Different materials** | Completely different effects | Separate batches (expected) |

All TSL nodes work with both patterns - they're just TSL functions that compose into materials.

---

## Architecture

```
+-----------------------------------------------------------------------------+
|                         TSL NODES ARCHITECTURE                               |
+-----------------------------------------------------------------------------+
|                                                                             |
|   Node Categories                                                           |
|   +---------------------------------------------------------------------+   |
|   |                                                                     |   |
|   |   SPRITE NODES (UV/Geometry)                                        |   |
|   |   +-----------------------------------------------------------+     |   |
|   |   |  uvScale     - Scale UV coordinates                       |     |   |
|   |   |  uvOffset    - Offset UV coordinates                      |     |   |
|   |   |  uvRotate    - Rotate UV around pivot                     |     |   |
|   |   |  uvFlip      - Flip UV horizontally/vertically            |     |   |
|   |   |  pixelate    - Reduce resolution for retro effect         |     |   |
|   |   |  outline     - Add colored outline around sprite          |     |   |
|   |   +-----------------------------------------------------------+     |   |
|   |                                                                     |   |
|   |   COLOR NODES (Color Manipulation)                                  |   |
|   |   +-----------------------------------------------------------+     |   |
|   |   |  tint        - Multiply color by tint color               |     |   |
|   |   |  hueShift    - Rotate hue in HSV space                    |     |   |
|   |   |  saturate    - Adjust saturation                          |     |   |
|   |   |  brightness  - Adjust brightness                          |     |   |
|   |   |  contrast    - Adjust contrast                            |     |   |
|   |   |  colorRemap  - Remap colors using gradient/palette        |     |   |
|   |   +-----------------------------------------------------------+     |   |
|   |                                                                     |   |
|   |   ALPHA NODES (Transparency)                                        |   |
|   |   +-----------------------------------------------------------+     |   |
|   |   |  alphaTest   - Discard pixels below threshold             |     |   |
|   |   |  alphaMask   - Mask using another texture                 |     |   |
|   |   |  fadeEdge    - Fade edges based on distance               |     |   |
|   |   |  dissolve    - Noise-based dissolve effect                |     |   |
|   |   +-----------------------------------------------------------+     |   |
|   |                                                                     |   |
|   +---------------------------------------------------------------------+   |
|                                                                             |
|   Composition Pattern                                                       |
|   +---------------------------------------------------------------------+   |
|   |                                                                     |   |
|   |   texture(map, uv)                                                  |   |
|   |       |                                                             |   |
|   |       v                                                             |   |
|   |   uvScale(uv, scale)                                                |   |
|   |       |                                                             |   |
|   |       v                                                             |   |
|   |   hueShift(color, amount)                                           |   |
|   |       |                                                             |   |
|   |       v                                                             |   |
|   |   dissolve(color, progress, noise)                                  |   |
|   |       |                                                             |   |
|   |       v                                                             |   |
|   |   Final Output                                                      |   |
|   |                                                                     |   |
|   +---------------------------------------------------------------------+   |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/nodes/types.ts:**

```typescript
import type { ShaderNodeObject, Node } from 'three/tsl';

/**
 * A TSL node that can be used in shader graphs.
 */
export type TSLNode<T extends Node = Node> = ShaderNodeObject<T>;

/**
 * UV coordinate node (vec2).
 */
export type UVNode = TSLNode;

/**
 * Color node (vec3 or vec4).
 */
export type ColorNode = TSLNode;

/**
 * Float node.
 */
export type FloatNode = TSLNode;

/**
 * Options for UV manipulation nodes.
 */
export interface UVScaleOptions {
  /** Scale factor (vec2 or uniform) */
  scale: TSLNode | [number, number];
  /** Pivot point for scaling (default: [0.5, 0.5]) */
  pivot?: TSLNode | [number, number];
}

export interface UVOffsetOptions {
  /** Offset amount (vec2 or uniform) */
  offset: TSLNode | [number, number];
}

export interface UVRotateOptions {
  /** Rotation angle in radians */
  angle: TSLNode | number;
  /** Pivot point for rotation (default: [0.5, 0.5]) */
  pivot?: TSLNode | [number, number];
}

export interface UVFlipOptions {
  /** Flip horizontally */
  flipX?: TSLNode | boolean;
  /** Flip vertically */
  flipY?: TSLNode | boolean;
}

/**
 * Options for pixelate effect.
 */
export interface PixelateOptions {
  /** Resolution for pixelation (lower = more pixelated) */
  resolution: TSLNode | number;
  /** Texture size for proper UV calculation */
  textureSize?: TSLNode | [number, number];
}

/**
 * Options for outline effect.
 */
export interface OutlineOptions {
  /** Outline color */
  color: TSLNode | [number, number, number, number];
  /** Outline width in pixels */
  width: TSLNode | number;
  /** Texture size for pixel-accurate outlines */
  textureSize: TSLNode | [number, number];
  /** Alpha threshold for edge detection */
  threshold?: TSLNode | number;
}

/**
 * Options for color manipulation nodes.
 */
export interface TintOptions {
  /** Tint color (RGB) */
  color: TSLNode | [number, number, number];
  /** Tint intensity (0-1) */
  intensity?: TSLNode | number;
}

export interface HueShiftOptions {
  /** Hue shift amount (0-1 for full rotation) */
  amount: TSLNode | number;
}

export interface SaturateOptions {
  /** Saturation multiplier (0 = grayscale, 1 = normal, >1 = oversaturated) */
  amount: TSLNode | number;
}

export interface BrightnessOptions {
  /** Brightness adjustment (-1 to 1) */
  amount: TSLNode | number;
}

export interface ContrastOptions {
  /** Contrast multiplier (0 = gray, 1 = normal, >1 = high contrast) */
  amount: TSLNode | number;
}

export interface ColorRemapOptions {
  /** Gradient texture for remapping */
  gradient: TSLNode;
  /** Use luminance for sampling (default: true) */
  useLuminance?: boolean;
}

/**
 * Options for alpha manipulation nodes.
 */
export interface AlphaTestOptions {
  /** Alpha threshold (pixels below this are discarded) */
  threshold: TSLNode | number;
}

export interface AlphaMaskOptions {
  /** Mask texture */
  mask: TSLNode;
  /** Mask channel ('r', 'g', 'b', 'a', or 'luminance') */
  channel?: 'r' | 'g' | 'b' | 'a' | 'luminance';
  /** Invert the mask */
  invert?: TSLNode | boolean;
}

export interface FadeEdgeOptions {
  /** Fade start distance from edge (0-0.5) */
  start: TSLNode | number;
  /** Fade end distance from edge (0-0.5) */
  end: TSLNode | number;
  /** Edge mode: 'all', 'horizontal', 'vertical' */
  mode?: 'all' | 'horizontal' | 'vertical';
}

export interface DissolveOptions {
  /** Dissolve progress (0 = fully visible, 1 = fully dissolved) */
  progress: TSLNode | number;
  /** Noise texture for dissolve pattern */
  noise: TSLNode;
  /** Edge width for burn effect */
  edgeWidth?: TSLNode | number;
  /** Edge color for burn effect */
  edgeColor?: TSLNode | [number, number, number];
}
```

---

### 2. Sprite Nodes (UV Manipulation)

**packages/core/src/nodes/sprite/uvScale.ts:**

```typescript
import { Fn, vec2, float } from 'three/tsl';
import type { UVNode, UVScaleOptions } from '../types';

/**
 * Scale UV coordinates around a pivot point.
 *
 * @example
 * ```typescript
 * const scaledUV = uvScale(uv(), {
 *   scale: [2, 2],
 *   pivot: [0.5, 0.5],
 * });
 * const color = texture(map, scaledUV);
 * ```
 */
export const uvScale = Fn(([inputUV, options]: [UVNode, UVScaleOptions]) => {
  const scale = Array.isArray(options.scale)
    ? vec2(options.scale[0], options.scale[1])
    : options.scale;

  const pivot = options.pivot
    ? Array.isArray(options.pivot)
      ? vec2(options.pivot[0], options.pivot[1])
      : options.pivot
    : vec2(0.5, 0.5);

  // Scale around pivot: (uv - pivot) * scale + pivot
  return inputUV.sub(pivot).mul(scale).add(pivot);
});

/**
 * Uniform-based UV scale for animated effects.
 *
 * @example
 * ```typescript
 * const scaleUniform = uniform(vec2(1, 1));
 * const scaledUV = uvScaleUniform(uv(), scaleUniform);
 *
 * // Animate
 * scaleUniform.value.set(2, 2);
 * ```
 */
export const uvScaleUniform = Fn(([inputUV, scale, pivot]: [UVNode, UVNode, UVNode?]) => {
  const pivotVec = pivot ?? vec2(0.5, 0.5);
  return inputUV.sub(pivotVec).mul(scale).add(pivotVec);
});
```

**packages/core/src/nodes/sprite/uvOffset.ts:**

```typescript
import { Fn, vec2 } from 'three/tsl';
import type { UVNode, UVOffsetOptions } from '../types';

/**
 * Offset UV coordinates.
 *
 * @example
 * ```typescript
 * const offsetUV = uvOffset(uv(), {
 *   offset: [0.5, 0],
 * });
 * const color = texture(map, offsetUV);
 * ```
 */
export const uvOffset = Fn(([inputUV, options]: [UVNode, UVOffsetOptions]) => {
  const offset = Array.isArray(options.offset)
    ? vec2(options.offset[0], options.offset[1])
    : options.offset;

  return inputUV.add(offset);
});

/**
 * Uniform-based UV offset for animated scrolling.
 *
 * @example
 * ```typescript
 * const offsetUniform = uniform(vec2(0, 0));
 * const scrolledUV = uvOffsetUniform(uv(), offsetUniform);
 *
 * // Animate scroll
 * offsetUniform.value.x += deltaTime * scrollSpeed;
 * ```
 */
export const uvOffsetUniform = Fn(([inputUV, offset]: [UVNode, UVNode]) => {
  return inputUV.add(offset);
});
```

**packages/core/src/nodes/sprite/uvRotate.ts:**

```typescript
import { Fn, vec2, float, cos, sin } from 'three/tsl';
import type { UVNode, UVRotateOptions } from '../types';

/**
 * Rotate UV coordinates around a pivot point.
 *
 * @example
 * ```typescript
 * const rotatedUV = uvRotate(uv(), {
 *   angle: Math.PI / 4,
 *   pivot: [0.5, 0.5],
 * });
 * const color = texture(map, rotatedUV);
 * ```
 */
export const uvRotate = Fn(([inputUV, options]: [UVNode, UVRotateOptions]) => {
  const angle = typeof options.angle === 'number' ? float(options.angle) : options.angle;

  const pivot = options.pivot
    ? Array.isArray(options.pivot)
      ? vec2(options.pivot[0], options.pivot[1])
      : options.pivot
    : vec2(0.5, 0.5);

  // Translate to pivot
  const centered = inputUV.sub(pivot);

  // Rotate
  const c = cos(angle);
  const s = sin(angle);
  const rotated = vec2(
    centered.x.mul(c).sub(centered.y.mul(s)),
    centered.x.mul(s).add(centered.y.mul(c))
  );

  // Translate back
  return rotated.add(pivot);
});

/**
 * Uniform-based UV rotation for animated effects.
 */
export const uvRotateUniform = Fn(([inputUV, angle, pivot]: [UVNode, UVNode, UVNode?]) => {
  const pivotVec = pivot ?? vec2(0.5, 0.5);
  const centered = inputUV.sub(pivotVec);

  const c = cos(angle);
  const s = sin(angle);
  const rotated = vec2(
    centered.x.mul(c).sub(centered.y.mul(s)),
    centered.x.mul(s).add(centered.y.mul(c))
  );

  return rotated.add(pivotVec);
});
```

**packages/core/src/nodes/sprite/uvFlip.ts:**

```typescript
import { Fn, vec2, float, select } from 'three/tsl';
import type { UVNode, UVFlipOptions } from '../types';

/**
 * Flip UV coordinates horizontally and/or vertically.
 *
 * @example
 * ```typescript
 * const flippedUV = uvFlip(uv(), {
 *   flipX: true,
 *   flipY: false,
 * });
 * const color = texture(map, flippedUV);
 * ```
 */
export const uvFlip = Fn(([inputUV, options]: [UVNode, UVFlipOptions]) => {
  let result = inputUV;

  if (options.flipX) {
    const flipX = typeof options.flipX === 'boolean' ? float(options.flipX ? 1 : 0) : options.flipX;
    result = vec2(
      select(flipX.greaterThan(0.5), float(1).sub(result.x), result.x),
      result.y
    );
  }

  if (options.flipY) {
    const flipY = typeof options.flipY === 'boolean' ? float(options.flipY ? 1 : 0) : options.flipY;
    result = vec2(
      result.x,
      select(flipY.greaterThan(0.5), float(1).sub(result.y), result.y)
    );
  }

  return result;
});

/**
 * Uniform-based UV flip for runtime toggling.
 *
 * @example
 * ```typescript
 * const flipXUniform = uniform(0); // 0 or 1
 * const flipYUniform = uniform(0);
 * const flippedUV = uvFlipUniform(uv(), flipXUniform, flipYUniform);
 * ```
 */
export const uvFlipUniform = Fn(([inputUV, flipX, flipY]: [UVNode, UVNode, UVNode]) => {
  return vec2(
    select(flipX.greaterThan(0.5), float(1).sub(inputUV.x), inputUV.x),
    select(flipY.greaterThan(0.5), float(1).sub(inputUV.y), inputUV.y)
  );
});
```

**packages/core/src/nodes/sprite/pixelate.ts:**

```typescript
import { Fn, vec2, float, floor } from 'three/tsl';
import type { UVNode, PixelateOptions } from '../types';

/**
 * Pixelate UV coordinates for a retro pixel-art effect.
 *
 * @example
 * ```typescript
 * const pixelUV = pixelate(uv(), {
 *   resolution: 64,
 *   textureSize: [256, 256],
 * });
 * const color = texture(map, pixelUV);
 * ```
 */
export const pixelate = Fn(([inputUV, options]: [UVNode, PixelateOptions]) => {
  const resolution = typeof options.resolution === 'number'
    ? float(options.resolution)
    : options.resolution;

  const textureSize = options.textureSize
    ? Array.isArray(options.textureSize)
      ? vec2(options.textureSize[0], options.textureSize[1])
      : options.textureSize
    : vec2(256, 256);

  // Calculate pixel grid
  const pixelSize = textureSize.div(resolution);

  // Snap UV to pixel grid
  const pixelUV = floor(inputUV.mul(resolution)).div(resolution);

  // Add half pixel offset for center sampling
  return pixelUV.add(float(0.5).div(resolution));
});

/**
 * Uniform-based pixelation for animated effects.
 */
export const pixelateUniform = Fn(([inputUV, resolution]: [UVNode, UVNode]) => {
  const pixelUV = floor(inputUV.mul(resolution)).div(resolution);
  return pixelUV.add(float(0.5).div(resolution));
});
```

**packages/core/src/nodes/sprite/outline.ts:**

```typescript
import { Fn, vec2, vec4, float, texture as textureFn, max, abs } from 'three/tsl';
import type { UVNode, ColorNode, OutlineOptions } from '../types';

/**
 * Add an outline around a sprite based on alpha edges.
 *
 * @example
 * ```typescript
 * const outlineColor = outline(uv(), map, {
 *   color: [0, 0, 0, 1],
 *   width: 2,
 *   textureSize: [64, 64],
 * });
 * ```
 */
export const outline = Fn(([inputUV, inputTexture, options]: [UVNode, ColorNode, OutlineOptions]) => {
  const outlineColor = Array.isArray(options.color)
    ? vec4(options.color[0], options.color[1], options.color[2], options.color[3])
    : options.color;

  const width = typeof options.width === 'number' ? float(options.width) : options.width;

  const textureSize = Array.isArray(options.textureSize)
    ? vec2(options.textureSize[0], options.textureSize[1])
    : options.textureSize;

  const threshold = options.threshold
    ? typeof options.threshold === 'number'
      ? float(options.threshold)
      : options.threshold
    : float(0.1);

  // Calculate texel size
  const texelSize = float(1).div(textureSize);
  const offset = texelSize.mul(width);

  // Sample original
  const center = textureFn(inputTexture, inputUV);

  // Sample neighbors for edge detection
  const left = textureFn(inputTexture, inputUV.sub(vec2(offset.x, 0))).a;
  const right = textureFn(inputTexture, inputUV.add(vec2(offset.x, 0))).a;
  const up = textureFn(inputTexture, inputUV.add(vec2(0, offset.y))).a;
  const down = textureFn(inputTexture, inputUV.sub(vec2(0, offset.y))).a;

  // Diagonal samples for smoother outline
  const topLeft = textureFn(inputTexture, inputUV.add(vec2(offset.x.negate(), offset.y))).a;
  const topRight = textureFn(inputTexture, inputUV.add(vec2(offset.x, offset.y))).a;
  const bottomLeft = textureFn(inputTexture, inputUV.sub(vec2(offset.x, offset.y.negate()))).a;
  const bottomRight = textureFn(inputTexture, inputUV.sub(vec2(offset.x.negate(), offset.y))).a;

  // Calculate maximum neighbor alpha
  const maxNeighbor = max(
    max(max(left, right), max(up, down)),
    max(max(topLeft, topRight), max(bottomLeft, bottomRight))
  );

  // Detect outline: neighbor has alpha but center doesn't
  const isOutline = maxNeighbor.greaterThan(threshold).and(center.a.lessThan(threshold));

  // Return outline color where outline detected, otherwise original
  return vec4(
    isOutline.select(outlineColor.rgb, center.rgb),
    isOutline.select(outlineColor.a, center.a)
  );
});

/**
 * Uniform-based outline with animatable parameters.
 */
export const outlineUniform = Fn((
  [inputUV, inputTexture, outlineColor, width, textureSize, threshold]:
  [UVNode, ColorNode, ColorNode, UVNode, UVNode, UVNode]
) => {
  const texelSize = float(1).div(textureSize);
  const offset = texelSize.mul(width);

  const center = textureFn(inputTexture, inputUV);

  const left = textureFn(inputTexture, inputUV.sub(vec2(offset.x, 0))).a;
  const right = textureFn(inputTexture, inputUV.add(vec2(offset.x, 0))).a;
  const up = textureFn(inputTexture, inputUV.add(vec2(0, offset.y))).a;
  const down = textureFn(inputTexture, inputUV.sub(vec2(0, offset.y))).a;

  const maxNeighbor = max(max(left, right), max(up, down));
  const isOutline = maxNeighbor.greaterThan(threshold).and(center.a.lessThan(threshold));

  return vec4(
    isOutline.select(outlineColor.rgb, center.rgb),
    isOutline.select(outlineColor.a, center.a)
  );
});
```

---

### 3. Color Nodes

**packages/core/src/nodes/color/tint.ts:**

```typescript
import { Fn, vec3, vec4, float, mix } from 'three/tsl';
import type { ColorNode, TintOptions } from '../types';

/**
 * Apply a color tint to an image.
 *
 * @example
 * ```typescript
 * const tintedColor = tint(textureColor, {
 *   color: [1, 0, 0],
 *   intensity: 0.5,
 * });
 * ```
 */
export const tint = Fn(([inputColor, options]: [ColorNode, TintOptions]) => {
  const tintColor = Array.isArray(options.color)
    ? vec3(options.color[0], options.color[1], options.color[2])
    : options.color;

  const intensity = options.intensity !== undefined
    ? typeof options.intensity === 'number'
      ? float(options.intensity)
      : options.intensity
    : float(1);

  // Multiply blend for tint
  const tinted = inputColor.rgb.mul(tintColor);

  // Mix based on intensity
  return vec4(
    mix(inputColor.rgb, tinted, intensity),
    inputColor.a
  );
});

/**
 * Uniform-based tint for runtime color changes.
 */
export const tintUniform = Fn(([inputColor, tintColor, intensity]: [ColorNode, ColorNode, UVNode]) => {
  const tinted = inputColor.rgb.mul(tintColor);
  return vec4(mix(inputColor.rgb, tinted, intensity), inputColor.a);
});
```

**packages/core/src/nodes/color/hueShift.ts:**

```typescript
import { Fn, vec3, vec4, float, mat3 } from 'three/tsl';
import type { ColorNode, HueShiftOptions } from '../types';

/**
 * Shift the hue of a color.
 *
 * @example
 * ```typescript
 * const shiftedColor = hueShift(textureColor, {
 *   amount: 0.5, // 180 degrees
 * });
 * ```
 */
export const hueShift = Fn(([inputColor, options]: [ColorNode, HueShiftOptions]) => {
  const shift = typeof options.amount === 'number' ? float(options.amount) : options.amount;

  // Convert shift to radians (0-1 maps to 0-2PI)
  const angle = shift.mul(float(Math.PI * 2));

  // Hue rotation matrix
  const cosA = angle.cos();
  const sinA = angle.sin();

  // Using the standard hue rotation matrix
  const k = float(1.0 / 3.0);
  const sqrtThird = float(Math.sqrt(1.0 / 3.0));

  const r = vec3(
    cosA.add(float(1).sub(cosA).mul(k)),
    float(1).sub(cosA).mul(k).sub(sqrtThird.mul(sinA)),
    float(1).sub(cosA).mul(k).add(sqrtThird.mul(sinA))
  );

  const g = vec3(
    float(1).sub(cosA).mul(k).add(sqrtThird.mul(sinA)),
    cosA.add(float(1).sub(cosA).mul(k)),
    float(1).sub(cosA).mul(k).sub(sqrtThird.mul(sinA))
  );

  const b = vec3(
    float(1).sub(cosA).mul(k).sub(sqrtThird.mul(sinA)),
    float(1).sub(cosA).mul(k).add(sqrtThird.mul(sinA)),
    cosA.add(float(1).sub(cosA).mul(k))
  );

  const rotatedColor = vec3(
    inputColor.r.mul(r.x).add(inputColor.g.mul(r.y)).add(inputColor.b.mul(r.z)),
    inputColor.r.mul(g.x).add(inputColor.g.mul(g.y)).add(inputColor.b.mul(g.z)),
    inputColor.r.mul(b.x).add(inputColor.g.mul(b.y)).add(inputColor.b.mul(b.z))
  );

  return vec4(rotatedColor, inputColor.a);
});

/**
 * Uniform-based hue shift for animation.
 */
export const hueShiftUniform = Fn(([inputColor, shift]: [ColorNode, ColorNode]) => {
  const angle = shift.mul(float(Math.PI * 2));
  const cosA = angle.cos();
  const sinA = angle.sin();

  const k = float(1.0 / 3.0);
  const sqrtThird = float(Math.sqrt(1.0 / 3.0));

  const rotatedR = inputColor.r.mul(cosA.add(float(1).sub(cosA).mul(k)))
    .add(inputColor.g.mul(float(1).sub(cosA).mul(k).sub(sqrtThird.mul(sinA))))
    .add(inputColor.b.mul(float(1).sub(cosA).mul(k).add(sqrtThird.mul(sinA))));

  const rotatedG = inputColor.r.mul(float(1).sub(cosA).mul(k).add(sqrtThird.mul(sinA)))
    .add(inputColor.g.mul(cosA.add(float(1).sub(cosA).mul(k))))
    .add(inputColor.b.mul(float(1).sub(cosA).mul(k).sub(sqrtThird.mul(sinA))));

  const rotatedB = inputColor.r.mul(float(1).sub(cosA).mul(k).sub(sqrtThird.mul(sinA)))
    .add(inputColor.g.mul(float(1).sub(cosA).mul(k).add(sqrtThird.mul(sinA))))
    .add(inputColor.b.mul(cosA.add(float(1).sub(cosA).mul(k))));

  return vec4(rotatedR, rotatedG, rotatedB, inputColor.a);
});
```

**packages/core/src/nodes/color/saturate.ts:**

```typescript
import { Fn, vec3, vec4, float, mix } from 'three/tsl';
import type { ColorNode, SaturateOptions } from '../types';

/**
 * Adjust color saturation.
 *
 * @example
 * ```typescript
 * const desaturated = saturate(textureColor, { amount: 0 }); // Grayscale
 * const vivid = saturate(textureColor, { amount: 2 }); // Oversaturated
 * ```
 */
export const saturate = Fn(([inputColor, options]: [ColorNode, SaturateOptions]) => {
  const amount = typeof options.amount === 'number' ? float(options.amount) : options.amount;

  // Calculate luminance using standard weights
  const luminance = inputColor.r.mul(0.2126)
    .add(inputColor.g.mul(0.7152))
    .add(inputColor.b.mul(0.0722));

  const gray = vec3(luminance, luminance, luminance);

  // Mix between grayscale and original based on saturation amount
  const saturated = mix(gray, inputColor.rgb, amount);

  return vec4(saturated, inputColor.a);
});

/**
 * Uniform-based saturation adjustment.
 */
export const saturateUniform = Fn(([inputColor, amount]: [ColorNode, ColorNode]) => {
  const luminance = inputColor.r.mul(0.2126)
    .add(inputColor.g.mul(0.7152))
    .add(inputColor.b.mul(0.0722));

  const gray = vec3(luminance, luminance, luminance);
  const saturated = mix(gray, inputColor.rgb, amount);

  return vec4(saturated, inputColor.a);
});
```

**packages/core/src/nodes/color/brightness.ts:**

```typescript
import { Fn, vec4, float } from 'three/tsl';
import type { ColorNode, BrightnessOptions } from '../types';

/**
 * Adjust color brightness.
 *
 * @example
 * ```typescript
 * const darker = brightness(textureColor, { amount: -0.2 });
 * const lighter = brightness(textureColor, { amount: 0.3 });
 * ```
 */
export const brightness = Fn(([inputColor, options]: [ColorNode, BrightnessOptions]) => {
  const amount = typeof options.amount === 'number' ? float(options.amount) : options.amount;

  // Add brightness (simple additive)
  const adjusted = inputColor.rgb.add(amount);

  // Clamp to valid range
  return vec4(adjusted.clamp(0, 1), inputColor.a);
});

/**
 * Uniform-based brightness adjustment.
 */
export const brightnessUniform = Fn(([inputColor, amount]: [ColorNode, ColorNode]) => {
  const adjusted = inputColor.rgb.add(amount);
  return vec4(adjusted.clamp(0, 1), inputColor.a);
});
```

**packages/core/src/nodes/color/contrast.ts:**

```typescript
import { Fn, vec3, vec4, float, mix } from 'three/tsl';
import type { ColorNode, ContrastOptions } from '../types';

/**
 * Adjust color contrast.
 *
 * @example
 * ```typescript
 * const lowContrast = contrast(textureColor, { amount: 0.5 });
 * const highContrast = contrast(textureColor, { amount: 1.5 });
 * ```
 */
export const contrast = Fn(([inputColor, options]: [ColorNode, ContrastOptions]) => {
  const amount = typeof options.amount === 'number' ? float(options.amount) : options.amount;

  // Adjust contrast around 0.5 (middle gray)
  const midpoint = vec3(0.5, 0.5, 0.5);
  const adjusted = inputColor.rgb.sub(midpoint).mul(amount).add(midpoint);

  return vec4(adjusted.clamp(0, 1), inputColor.a);
});

/**
 * Uniform-based contrast adjustment.
 */
export const contrastUniform = Fn(([inputColor, amount]: [ColorNode, ColorNode]) => {
  const midpoint = vec3(0.5, 0.5, 0.5);
  const adjusted = inputColor.rgb.sub(midpoint).mul(amount).add(midpoint);
  return vec4(adjusted.clamp(0, 1), inputColor.a);
});
```

**packages/core/src/nodes/color/colorRemap.ts:**

```typescript
import { Fn, vec2, vec4, float, texture as textureFn } from 'three/tsl';
import type { ColorNode, ColorRemapOptions } from '../types';

/**
 * Remap colors using a gradient/palette texture.
 *
 * @example
 * ```typescript
 * const remapped = colorRemap(textureColor, {
 *   gradient: gradientTexture,
 *   useLuminance: true,
 * });
 * ```
 */
export const colorRemap = Fn(([inputColor, options]: [ColorNode, ColorRemapOptions]) => {
  const useLuminance = options.useLuminance !== false;

  // Calculate sample position
  let sampleX;
  if (useLuminance) {
    // Use luminance for sampling
    sampleX = inputColor.r.mul(0.2126)
      .add(inputColor.g.mul(0.7152))
      .add(inputColor.b.mul(0.0722));
  } else {
    // Use red channel
    sampleX = inputColor.r;
  }

  // Sample gradient (horizontal 1D texture)
  const gradientColor = textureFn(options.gradient, vec2(sampleX, float(0.5)));

  // Preserve original alpha
  return vec4(gradientColor.rgb, inputColor.a);
});

/**
 * Uniform-based color remap.
 */
export const colorRemapUniform = Fn(([inputColor, gradient, useLuminance]: [ColorNode, ColorNode, ColorNode]) => {
  const luminance = inputColor.r.mul(0.2126)
    .add(inputColor.g.mul(0.7152))
    .add(inputColor.b.mul(0.0722));

  // Select between luminance and red channel
  const sampleX = useLuminance.greaterThan(0.5).select(luminance, inputColor.r);

  const gradientColor = textureFn(gradient, vec2(sampleX, float(0.5)));
  return vec4(gradientColor.rgb, inputColor.a);
});
```

---

### 4. Alpha Nodes

**packages/core/src/nodes/alpha/alphaTest.ts:**

```typescript
import { Fn, float, Discard, If } from 'three/tsl';
import type { ColorNode, AlphaTestOptions } from '../types';

/**
 * Discard pixels below alpha threshold.
 *
 * @example
 * ```typescript
 * const testedColor = alphaTest(textureColor, {
 *   threshold: 0.5,
 * });
 * ```
 */
export const alphaTest = Fn(([inputColor, options]: [ColorNode, AlphaTestOptions]) => {
  const threshold = typeof options.threshold === 'number'
    ? float(options.threshold)
    : options.threshold;

  If(inputColor.a.lessThan(threshold), () => {
    Discard();
  });

  return inputColor;
});

/**
 * Uniform-based alpha test.
 */
export const alphaTestUniform = Fn(([inputColor, threshold]: [ColorNode, ColorNode]) => {
  If(inputColor.a.lessThan(threshold), () => {
    Discard();
  });
  return inputColor;
});
```

**packages/core/src/nodes/alpha/alphaMask.ts:**

```typescript
import { Fn, vec4, float, texture as textureFn, select } from 'three/tsl';
import type { ColorNode, UVNode, AlphaMaskOptions } from '../types';

/**
 * Apply an alpha mask from another texture.
 *
 * @example
 * ```typescript
 * const masked = alphaMask(textureColor, uv(), {
 *   mask: maskTexture,
 *   channel: 'a',
 *   invert: false,
 * });
 * ```
 */
export const alphaMask = Fn(([inputColor, inputUV, options]: [ColorNode, UVNode, AlphaMaskOptions]) => {
  const maskSample = textureFn(options.mask, inputUV);

  // Select mask channel
  let maskValue;
  switch (options.channel ?? 'a') {
    case 'r':
      maskValue = maskSample.r;
      break;
    case 'g':
      maskValue = maskSample.g;
      break;
    case 'b':
      maskValue = maskSample.b;
      break;
    case 'luminance':
      maskValue = maskSample.r.mul(0.2126)
        .add(maskSample.g.mul(0.7152))
        .add(maskSample.b.mul(0.0722));
      break;
    case 'a':
    default:
      maskValue = maskSample.a;
  }

  // Handle invert
  if (options.invert) {
    const invertFlag = typeof options.invert === 'boolean'
      ? float(options.invert ? 1 : 0)
      : options.invert;
    maskValue = select(invertFlag.greaterThan(0.5), float(1).sub(maskValue), maskValue);
  }

  // Apply mask to alpha
  return vec4(inputColor.rgb, inputColor.a.mul(maskValue));
});

/**
 * Uniform-based alpha mask.
 */
export const alphaMaskUniform = Fn((
  [inputColor, inputUV, mask, channel, invert]:
  [ColorNode, UVNode, ColorNode, ColorNode, ColorNode]
) => {
  const maskSample = textureFn(mask, inputUV);

  // Channel selection based on uniform (0=r, 1=g, 2=b, 3=a, 4=luminance)
  const luminance = maskSample.r.mul(0.2126)
    .add(maskSample.g.mul(0.7152))
    .add(maskSample.b.mul(0.0722));

  let maskValue = channel.lessThan(0.5).select(maskSample.r,
    channel.lessThan(1.5).select(maskSample.g,
      channel.lessThan(2.5).select(maskSample.b,
        channel.lessThan(3.5).select(maskSample.a, luminance))));

  // Apply invert
  maskValue = invert.greaterThan(0.5).select(float(1).sub(maskValue), maskValue);

  return vec4(inputColor.rgb, inputColor.a.mul(maskValue));
});
```

**packages/core/src/nodes/alpha/fadeEdge.ts:**

```typescript
import { Fn, vec4, float, min, smoothstep } from 'three/tsl';
import type { ColorNode, UVNode, FadeEdgeOptions } from '../types';

/**
 * Fade edges of a sprite based on UV distance from edges.
 *
 * @example
 * ```typescript
 * const faded = fadeEdge(textureColor, uv(), {
 *   start: 0.0,
 *   end: 0.1,
 *   mode: 'all',
 * });
 * ```
 */
export const fadeEdge = Fn(([inputColor, inputUV, options]: [ColorNode, UVNode, FadeEdgeOptions]) => {
  const start = typeof options.start === 'number' ? float(options.start) : options.start;
  const end = typeof options.end === 'number' ? float(options.end) : options.end;
  const mode = options.mode ?? 'all';

  let fadeAlpha = float(1);

  if (mode === 'all' || mode === 'horizontal') {
    // Horizontal edge fade
    const leftFade = smoothstep(start, end, inputUV.x);
    const rightFade = smoothstep(start, end, float(1).sub(inputUV.x));
    fadeAlpha = fadeAlpha.mul(min(leftFade, rightFade));
  }

  if (mode === 'all' || mode === 'vertical') {
    // Vertical edge fade
    const bottomFade = smoothstep(start, end, inputUV.y);
    const topFade = smoothstep(start, end, float(1).sub(inputUV.y));
    fadeAlpha = fadeAlpha.mul(min(bottomFade, topFade));
  }

  return vec4(inputColor.rgb, inputColor.a.mul(fadeAlpha));
});

/**
 * Uniform-based edge fade.
 */
export const fadeEdgeUniform = Fn((
  [inputColor, inputUV, start, end]:
  [ColorNode, UVNode, ColorNode, ColorNode]
) => {
  const leftFade = smoothstep(start, end, inputUV.x);
  const rightFade = smoothstep(start, end, float(1).sub(inputUV.x));
  const bottomFade = smoothstep(start, end, inputUV.y);
  const topFade = smoothstep(start, end, float(1).sub(inputUV.y));

  const fadeAlpha = min(min(leftFade, rightFade), min(bottomFade, topFade));

  return vec4(inputColor.rgb, inputColor.a.mul(fadeAlpha));
});
```

**packages/core/src/nodes/alpha/dissolve.ts:**

```typescript
import { Fn, vec4, vec3, float, texture as textureFn, smoothstep, mix } from 'three/tsl';
import type { ColorNode, UVNode, DissolveOptions } from '../types';

/**
 * Apply a noise-based dissolve effect.
 *
 * @example
 * ```typescript
 * const dissolved = dissolve(textureColor, uv(), {
 *   progress: 0.5,
 *   noise: noiseTexture,
 *   edgeWidth: 0.1,
 *   edgeColor: [1, 0.5, 0],
 * });
 * ```
 */
export const dissolve = Fn(([inputColor, inputUV, options]: [ColorNode, UVNode, DissolveOptions]) => {
  const progress = typeof options.progress === 'number' ? float(options.progress) : options.progress;

  // Sample noise texture
  const noiseValue = textureFn(options.noise, inputUV).r;

  // Calculate dissolve threshold
  const dissolveThreshold = progress;

  // Edge parameters
  const edgeWidth = options.edgeWidth
    ? typeof options.edgeWidth === 'number'
      ? float(options.edgeWidth)
      : options.edgeWidth
    : float(0.1);

  const edgeColor = options.edgeColor
    ? Array.isArray(options.edgeColor)
      ? vec3(options.edgeColor[0], options.edgeColor[1], options.edgeColor[2])
      : options.edgeColor
    : vec3(1, 0.5, 0); // Orange burn edge

  // Calculate alpha
  const alpha = smoothstep(dissolveThreshold, dissolveThreshold.add(edgeWidth), noiseValue);

  // Calculate edge glow
  const edgeStart = dissolveThreshold;
  const edgeEnd = dissolveThreshold.add(edgeWidth);
  const edgeMask = smoothstep(edgeStart, edgeStart.add(edgeWidth.mul(0.5)), noiseValue)
    .mul(float(1).sub(smoothstep(edgeEnd.sub(edgeWidth.mul(0.5)), edgeEnd, noiseValue)));

  // Mix edge color
  const finalColor = mix(inputColor.rgb, edgeColor, edgeMask.mul(float(2)));

  return vec4(finalColor, inputColor.a.mul(alpha));
});

/**
 * Uniform-based dissolve effect.
 */
export const dissolveUniform = Fn((
  [inputColor, inputUV, progress, noise, edgeWidth, edgeColor]:
  [ColorNode, UVNode, ColorNode, ColorNode, ColorNode, ColorNode]
) => {
  const noiseValue = textureFn(noise, inputUV).r;

  const alpha = smoothstep(progress, progress.add(edgeWidth), noiseValue);

  const edgeMask = smoothstep(progress, progress.add(edgeWidth.mul(0.5)), noiseValue)
    .mul(float(1).sub(smoothstep(progress.add(edgeWidth.mul(0.5)), progress.add(edgeWidth), noiseValue)));

  const finalColor = mix(inputColor.rgb, edgeColor, edgeMask.mul(float(2)));

  return vec4(finalColor, inputColor.a.mul(alpha));
});
```

---

### 5. Exports

**packages/core/src/nodes/sprite/index.ts:**

```typescript
export { uvScale, uvScaleUniform } from './uvScale';
export { uvOffset, uvOffsetUniform } from './uvOffset';
export { uvRotate, uvRotateUniform } from './uvRotate';
export { uvFlip, uvFlipUniform } from './uvFlip';
export { pixelate, pixelateUniform } from './pixelate';
export { outline, outlineUniform } from './outline';
```

**packages/core/src/nodes/color/index.ts:**

```typescript
export { tint, tintUniform } from './tint';
export { hueShift, hueShiftUniform } from './hueShift';
export { saturate, saturateUniform } from './saturate';
export { brightness, brightnessUniform } from './brightness';
export { contrast, contrastUniform } from './contrast';
export { colorRemap, colorRemapUniform } from './colorRemap';
```

**packages/core/src/nodes/alpha/index.ts:**

```typescript
export { alphaTest, alphaTestUniform } from './alphaTest';
export { alphaMask, alphaMaskUniform } from './alphaMask';
export { fadeEdge, fadeEdgeUniform } from './fadeEdge';
export { dissolve, dissolveUniform } from './dissolve';
```

**packages/core/src/nodes/index.ts:**

```typescript
// Sprite nodes
export * from './sprite';

// Color nodes
export * from './color';

// Alpha nodes
export * from './alpha';

// Types
export type {
  TSLNode,
  UVNode,
  ColorNode,
  FloatNode,
  UVScaleOptions,
  UVOffsetOptions,
  UVRotateOptions,
  UVFlipOptions,
  PixelateOptions,
  OutlineOptions,
  TintOptions,
  HueShiftOptions,
  SaturateOptions,
  BrightnessOptions,
  ContrastOptions,
  ColorRemapOptions,
  AlphaTestOptions,
  AlphaMaskOptions,
  FadeEdgeOptions,
  DissolveOptions,
} from './types';
```

**packages/core/src/index.ts (updated):**

```typescript
export const VERSION = '0.4.0';

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

// TSL Nodes
export * from './nodes';
```

---

### 6. Tests

**packages/core/src/nodes/sprite/uvScale.test.ts:**

```typescript
import { describe, it, expect } from 'vitest';
import { vec2 } from 'three/tsl';
import { uvScale } from './uvScale';

describe('uvScale', () => {
  it('should scale UV coordinates', () => {
    // TSL nodes compile to shader code, so we test the function signature
    const inputUV = vec2(0.5, 0.5);
    const result = uvScale(inputUV, {
      scale: [2, 2],
      pivot: [0.5, 0.5],
    });

    // Verify it returns a node
    expect(result).toBeDefined();
    expect(typeof result.build).toBe('function');
  });

  it('should accept uniform scale', () => {
    const inputUV = vec2(0.5, 0.5);
    const scaleNode = vec2(2, 2);
    const result = uvScale(inputUV, {
      scale: scaleNode,
    });

    expect(result).toBeDefined();
  });
});
```

**packages/core/src/nodes/color/hueShift.test.ts:**

```typescript
import { describe, it, expect } from 'vitest';
import { vec4 } from 'three/tsl';
import { hueShift } from './hueShift';

describe('hueShift', () => {
  it('should create hue shift node', () => {
    const inputColor = vec4(1, 0, 0, 1);
    const result = hueShift(inputColor, {
      amount: 0.5,
    });

    expect(result).toBeDefined();
    expect(typeof result.build).toBe('function');
  });
});
```

**packages/core/src/nodes/alpha/dissolve.test.ts:**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { vec4, vec2, texture } from 'three/tsl';
import { Texture } from 'three';
import { dissolve } from './dissolve';

describe('dissolve', () => {
  it('should create dissolve node', () => {
    const inputColor = vec4(1, 1, 1, 1);
    const inputUV = vec2(0.5, 0.5);
    const noiseTexture = new Texture();

    const result = dissolve(inputColor, inputUV, {
      progress: 0.5,
      noise: texture(noiseTexture),
      edgeWidth: 0.1,
      edgeColor: [1, 0.5, 0],
    });

    expect(result).toBeDefined();
  });
});
```

---

## Acceptance Criteria

- [ ] All 6 Sprite nodes implemented and working (uvScale, uvOffset, uvRotate, uvFlip, pixelate, outline)
- [ ] All 6 Color nodes implemented and working (tint, hueShift, saturate, brightness, contrast, colorRemap)
- [ ] All 4 Alpha nodes implemented and working (alphaTest, alphaMask, fadeEdge, dissolve)
- [ ] Each node has both static and uniform-based variants
- [ ] Nodes are composable (can chain together)
- [ ] TypeScript types are complete and correct
- [ ] Works with WebGL2 renderer
- [ ] Works with WebGPU renderer
- [ ] All tests pass
- [ ] Performance: No significant overhead vs direct shader code

---

## Example Usage

**Vanilla Three.js:**

```typescript
import * as THREE from 'three/webgpu';
import {
  MeshBasicNodeMaterial,
  texture,
  uv,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';
import {
  uvScale,
  uvRotate,
  hueShift,
  saturate,
  dissolve,
  outline,
} from '@three-flatland/core';

// Load textures
const spriteTexture = new THREE.TextureLoader().load('/sprites/character.png');
const noiseTexture = new THREE.TextureLoader().load('/textures/noise.png');

// Create uniforms for animation
const hueUniform = uniform(0);
const dissolveProgress = uniform(0);
const rotationAngle = uniform(0);

// Build shader graph
const baseUV = uv();

// Apply UV transformations
const transformedUV = uvRotate(
  uvScale(baseUV, { scale: [1, 1], pivot: [0.5, 0.5] }),
  { angle: rotationAngle, pivot: [0.5, 0.5] }
);

// Sample texture
let color = texture(spriteTexture, transformedUV);

// Apply color effects
color = hueShift(color, { amount: hueUniform });
color = saturate(color, { amount: 1.2 });

// Apply alpha effect
color = dissolve(color, transformedUV, {
  progress: dissolveProgress,
  noise: texture(noiseTexture),
  edgeWidth: 0.1,
  edgeColor: [1, 0.5, 0],
});

// Create material
const material = new MeshBasicNodeMaterial();
material.colorNode = color;
material.transparent = true;

// Create mesh
const geometry = new THREE.PlaneGeometry(1, 1);
const mesh = new THREE.Mesh(geometry, material);

// Animate
function animate(time: number) {
  hueUniform.value = (time * 0.001) % 1;
  dissolveProgress.value = Math.sin(time * 0.001) * 0.5 + 0.5;
  rotationAngle.value = time * 0.001;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
```

**React Three Fiber:**

```tsx
import { useRef, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import {
  MeshBasicNodeMaterial,
  texture,
  uv,
  uniform,
} from 'three/tsl';
import {
  hueShift,
  dissolve,
  pixelate,
} from '@three-flatland/core';

function DissolveSprite({ textureUrl, noiseUrl }: { textureUrl: string; noiseUrl: string }) {
  const spriteMap = useLoader(THREE.TextureLoader, textureUrl);
  const noiseMap = useLoader(THREE.TextureLoader, noiseUrl);

  const { material, dissolveProgress, hueAmount } = useMemo(() => {
    const dissolveProgress = uniform(0);
    const hueAmount = uniform(0);

    // Build shader
    const baseUV = pixelate(uv(), { resolution: 64 });
    let color = texture(spriteMap, baseUV);
    color = hueShift(color, { amount: hueAmount });
    color = dissolve(color, uv(), {
      progress: dissolveProgress,
      noise: texture(noiseMap),
      edgeWidth: 0.15,
      edgeColor: [1, 0.3, 0],
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = color;
    material.transparent = true;

    return { material, dissolveProgress, hueAmount };
  }, [spriteMap, noiseMap]);

  useFrame((state) => {
    dissolveProgress.value = Math.sin(state.clock.elapsedTime) * 0.5 + 0.5;
    hueAmount.value = state.clock.elapsedTime * 0.1;
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

function OutlineSprite({ textureUrl }: { textureUrl: string }) {
  const spriteMap = useLoader(THREE.TextureLoader, textureUrl);

  const material = useMemo(() => {
    const color = outline(uv(), texture(spriteMap), {
      color: [0, 0, 0, 1],
      width: 2,
      textureSize: [64, 64],
    });

    const mat = new MeshBasicNodeMaterial();
    mat.colorNode = color;
    mat.transparent = true;

    return mat;
  }, [spriteMap]);

  return (
    <mesh material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TSL API changes | Medium | High | Pin Three.js version, abstract TSL usage |
| WebGL2/WebGPU differences | Medium | Medium | Test on both backends, use fallbacks |
| Performance overhead | Low | Medium | Benchmark nodes, optimize hot paths |
| Shader compilation errors | Medium | High | Comprehensive testing, error handling |
| Complex node composition | Low | Medium | Provide pre-composed utility functions |

---

## Dependencies for Next Milestone

M5 (TSL Nodes Part 2) requires:
- All M4 nodes working and tested
- Composition pattern established
- Uniform-based animation patterns

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 3 |
| Sprite nodes (6 nodes) | 12 |
| Color nodes (6 nodes) | 10 |
| Alpha nodes (4 nodes) | 8 |
| Tests | 8 |
| WebGL2/WebGPU testing | 4 |
| Documentation | 3 |
| Examples | 4 |
| **Total** | **52 hours** (~3 weeks) |

---

*End of M4: TSL Nodes Part 1*
