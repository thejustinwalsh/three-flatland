# ⚠️ SUPERSEDED - DO NOT USE

**This document has been superseded by `REDESIGN-TSL-NATIVE-BATCHING.md`**

The uber-shader approach described below was found to be wasteful and non-TSL-native.
The new design uses **material-based automatic batching** instead.

See `REDESIGN-TSL-NATIVE-BATCHING.md` for the correct approach.

---

# [ARCHIVED] Unified Effects System: Batching + Composable Shaders

## Problem Statement

The current milestone documents have an architectural conflict:

1. **M3 (Render Pipeline)**: Uses `SpriteBatchMaterial` with a single hardcoded shader for all sprites in a batch
2. **M4/M6 (TSL Nodes)**: Provide composable per-sprite effects (hueShift, dissolve, outline, etc.)

**Result**: Sprites can be batched OR have effects, but not both. This defeats the purpose of being a "Pixi.js replacement" where 50,000 sprites can have individual visual effects.

## Design Goals

1. **Single unified system** - No separate "batched" vs "effect" code paths
2. **Effects work with batching** - Per-sprite effects don't break batching
3. **Zero confusion** - Every TSL node works in every rendering mode
4. **Performance** - Maintain 50,000 sprites @ 60fps target
5. **Composability** - Effects can still chain together

---

## Solution: Per-Instance Effect Attributes

### Core Concept

Instead of storing effect parameters in per-sprite uniforms, we store them in **instance attributes**. The `SpriteBatchMaterial` becomes an "uber-shader" that reads effect parameters from instance data.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     UNIFIED EFFECT-AWARE BATCHING                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Sprite2D                                                                  │
│   ├── position, scale, rotation (via Object3D)                              │
│   ├── layer, zIndex (sort order)                                            │
│   ├── tint, alpha (basic instance attributes)                               │
│   └── effects: EffectParams (NEW - per-sprite effect parameters)            │
│       ├── hueShift: number (0-1)                                            │
│       ├── saturation: number (0-2)                                          │
│       ├── brightness: number (-1 to 1)                                      │
│       ├── dissolve: number (0-1)                                            │
│       ├── outlineWidth: number (0-8 pixels)                                 │
│       ├── outlineColor: Color                                               │
│       └── ... (more effects)                                                │
│                                                                             │
│   SpriteBatch                                                               │
│   ├── instanceMatrix (vec4x4) - transform                                   │
│   ├── instanceUV (vec4) - atlas frame                                       │
│   ├── instanceColor (vec4) - tint + alpha                                   │
│   └── instanceEffects (vec4[]) - PACKED EFFECT PARAMETERS                   │
│       ├── effectsA: vec4(hueShift, saturation, brightness, dissolve)        │
│       ├── effectsB: vec4(outlineWidth, outlineR, outlineG, outlineB)        │
│       └── effectsC: vec4(reserved for future effects)                       │
│                                                                             │
│   SpriteBatchMaterial (TSL "Uber-Shader")                                   │
│   ├── Reads all instance attributes                                         │
│   ├── Applies effects conditionally (skip if value == default)              │
│   └── Single material handles ALL effect combinations                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Effect Packing Strategy

We pack effect parameters into a minimal set of vec4 attributes. Each sprite gets these instance attributes:

| Attribute | Components | Effects |
|-----------|------------|---------|
| `instanceEffectsA` | vec4 | hueShift, saturation, brightness, dissolve |
| `instanceEffectsB` | vec4 | outlineWidth, outlineR, outlineG, outlineB |
| `instanceEffectsC` | vec4 | uvRotation, pixelate, fadeEdgeStart, fadeEdgeEnd |

**Default values** (no effect):
- `instanceEffectsA`: (0, 1, 0, 0) - no hue shift, normal saturation, no brightness change, no dissolve
- `instanceEffectsB`: (0, 0, 0, 0) - no outline
- `instanceEffectsC`: (0, 0, 0, 0) - no UV rotation, no pixelate, no fade

### Conditional Effect Application

The uber-shader applies effects only when values differ from defaults:

```typescript
// In SpriteBatchMaterial colorNode:
this.colorNode = Fn(() => {
  // Read instance attributes
  const effectsA = attribute('instanceEffectsA', 'vec4');
  const effectsB = attribute('instanceEffectsB', 'vec4');
  const effectsC = attribute('instanceEffectsC', 'vec4');

  // Sample texture with UV transforms
  let currentUV = uv();

  // UV rotation (if non-zero)
  If(effectsC.x.notEqual(0), () => {
    currentUV = uvRotate(currentUV, { angle: effectsC.x });
  });

  // Pixelate (if non-zero)
  If(effectsC.y.greaterThan(0), () => {
    currentUV = pixelate(currentUV, { resolution: effectsC.y });
  });

  // Sample texture
  let color = textureFn(map, atlasUV);

  // Color effects (conditionally applied)

  // Hue shift (if non-zero)
  If(effectsA.x.notEqual(0), () => {
    color = hueShift(color, { amount: effectsA.x });
  });

  // Saturation (if not 1.0)
  If(effectsA.y.notEqual(1), () => {
    color = saturate(color, { amount: effectsA.y });
  });

  // Brightness (if non-zero)
  If(effectsA.z.notEqual(0), () => {
    color = brightness(color, { amount: effectsA.z });
  });

  // Dissolve (if progress > 0)
  If(effectsA.w.greaterThan(0), () => {
    color = dissolve(color, currentUV, {
      progress: effectsA.w,
      noise: noiseTexture, // shared noise texture
    });
  });

  // Outline (if width > 0)
  If(effectsB.x.greaterThan(0), () => {
    color = outline(currentUV, map, {
      width: effectsB.x,
      color: vec4(effectsB.y, effectsB.z, effectsB.w, 1),
      textureSize: textureSize,
    });
  });

  // Fade edges (if configured)
  If(effectsC.z.greaterThan(0).or(effectsC.w.greaterThan(0)), () => {
    color = fadeEdge(color, currentUV, {
      start: effectsC.z,
      end: effectsC.w,
    });
  });

  // Apply tint and alpha
  return vec4(color.rgb.mul(instanceColor.rgb), color.a.mul(instanceColor.a));
})();
```

---

## API Design

### Sprite2D with Effects

```typescript
// packages/core/src/sprites/Sprite2D.ts

export interface EffectParams {
  // Color effects
  hueShift?: number;      // 0-1 (0 = no shift)
  saturation?: number;    // 0-2 (1 = normal)
  brightness?: number;    // -1 to 1 (0 = normal)
  contrast?: number;      // 0-2 (1 = normal)

  // Alpha effects
  dissolve?: number;      // 0-1 (0 = visible, 1 = dissolved)
  fadeEdge?: { start: number; end: number };

  // Sprite effects
  outline?: { width: number; color: Color };
  pixelate?: number;      // resolution (0 = disabled)
  uvRotation?: number;    // radians
}

export class Sprite2D extends Mesh {
  // ... existing properties

  /** Per-sprite effect parameters */
  effects: EffectParams = {};

  /**
   * Convenience methods for common effects
   */
  setHueShift(amount: number): this {
    this.effects.hueShift = amount;
    return this;
  }

  setDissolve(progress: number): this {
    this.effects.dissolve = progress;
    return this;
  }

  setOutline(width: number, color: Color | number = 0x000000): this {
    this.effects.outline = {
      width,
      color: color instanceof Color ? color : new Color(color)
    };
    return this;
  }

  clearEffects(): this {
    this.effects = {};
    return this;
  }

  /**
   * Write instance data including effects to batch buffers.
   */
  writeInstanceData(
    matrices: Float32Array,
    uvs: Float32Array,
    colors: Float32Array,
    effectsA: Float32Array,
    effectsB: Float32Array,
    effectsC: Float32Array,
    index: number
  ): void {
    // ... existing matrix/uv/color writes

    // Pack effects into attributes
    const e = this.effects;
    const i4 = index * 4;

    // effectsA: hueShift, saturation, brightness, dissolve
    effectsA[i4] = e.hueShift ?? 0;
    effectsA[i4 + 1] = e.saturation ?? 1;
    effectsA[i4 + 2] = e.brightness ?? 0;
    effectsA[i4 + 3] = e.dissolve ?? 0;

    // effectsB: outlineWidth, outlineR, outlineG, outlineB
    if (e.outline) {
      effectsB[i4] = e.outline.width;
      effectsB[i4 + 1] = e.outline.color.r;
      effectsB[i4 + 2] = e.outline.color.g;
      effectsB[i4 + 3] = e.outline.color.b;
    } else {
      effectsB[i4] = 0;
      effectsB[i4 + 1] = 0;
      effectsB[i4 + 2] = 0;
      effectsB[i4 + 3] = 0;
    }

    // effectsC: uvRotation, pixelate, fadeStart, fadeEnd
    effectsC[i4] = e.uvRotation ?? 0;
    effectsC[i4 + 1] = e.pixelate ?? 0;
    effectsC[i4 + 2] = e.fadeEdge?.start ?? 0;
    effectsC[i4 + 3] = e.fadeEdge?.end ?? 0;
  }
}
```

### Usage Examples

```typescript
import { Sprite2D, Renderer2D, loadTexture } from '@three-flatland/core';

const texture = await loadTexture('/sprites/hero.png');

// Create sprites with effects - ALL BATCHED TOGETHER
const player = new Sprite2D({ texture })
  .setHueShift(0.1)              // Slight color shift
  .setOutline(2, 0x000000);      // Black outline

const ghost = new Sprite2D({ texture })
  .setDissolve(0.3)              // Partially dissolved
  .setHueShift(0.5);             // Blue-shifted

const enemy = new Sprite2D({ texture })
  .setOutline(1, 0xff0000);      // Red outline

// All 3 sprites batch together in ONE draw call
// Each has different effects applied per-instance
renderer2D.add(player);
renderer2D.add(ghost);
renderer2D.add(enemy);

// Animate effects
function animate() {
  ghost.effects.dissolve = Math.sin(time) * 0.5 + 0.5;
  player.effects.hueShift = (player.effects.hueShift + 0.01) % 1;

  renderer2D.render(renderer, camera);
}
```

---

## TSL Node Integration

The TSL nodes from M4/M6 are repurposed:

### 1. **Direct Use** (per-sprite materials, no batching)
For advanced users who need custom shader graphs:

```typescript
const customMaterial = new MeshBasicNodeMaterial();
customMaterial.colorNode = Fn(() => {
  let color = texture(spriteMap, uv());
  color = hueShift(color, { amount: uniform(0.5) });
  color = dissolve(color, uv(), {
    progress: uniform(0.3),
    noise: texture(noiseMap)
  });
  return color;
})();

// This sprite uses custom material, NOT batched
const specialSprite = new Sprite2D({ texture, material: customMaterial });
```

### 2. **Batched Use** (via EffectParams)
For most users - effects work automatically:

```typescript
// Just set effect properties - batching handles the rest
sprite.effects.hueShift = 0.5;
sprite.effects.dissolve = 0.3;
```

### Node Compatibility Matrix

| Node | Batched (EffectParams) | Direct (Custom Material) |
|------|------------------------|--------------------------|
| `hueShift` | ✅ via `effects.hueShift` | ✅ |
| `saturation` | ✅ via `effects.saturation` | ✅ |
| `brightness` | ✅ via `effects.brightness` | ✅ |
| `contrast` | ✅ via `effects.contrast` | ✅ |
| `dissolve` | ✅ via `effects.dissolve` | ✅ |
| `fadeEdge` | ✅ via `effects.fadeEdge` | ✅ |
| `outline` | ✅ via `effects.outline` | ✅ |
| `pixelate` | ✅ via `effects.pixelate` | ✅ |
| `uvRotate` | ✅ via `effects.uvRotation` | ✅ |
| `uvScale` | ❌ (use frame) | ✅ |
| `uvOffset` | ❌ (use frame) | ✅ |
| `uvFlip` | ❌ (handled by Sprite2D.flipX/Y) | ✅ |
| `tint` | ✅ via `sprite.tint` | ✅ |
| `alphaMask` | ❌ (needs extra texture) | ✅ |
| `colorRemap` | ❌ (needs palette texture) | ✅ |
| `ambientLight2D` | ✅ (layer-wide uniform) | ✅ |
| `pointLight2D` | ✅ (layer-wide uniform) | ✅ |
| `spotLight2D` | ✅ (layer-wide uniform) | ✅ |

### Lighting Integration

Lights work at the **layer** level, not per-sprite:

```typescript
const gameLayer = new Layer2D({ name: 'game' });

// Add lights to layer (affects all sprites in layer)
gameLayer.addLight(pointLight2D({
  position: [100, 200],
  color: 0xff8844,
  radius: 150
}));

// Sprites in this layer are automatically lit
gameLayer.add(player);
gameLayer.add(enemy);
```

---

## Performance Considerations

### Memory Impact

Additional instance attributes per sprite:
- `instanceEffectsA`: 4 floats = 16 bytes
- `instanceEffectsB`: 4 floats = 16 bytes
- `instanceEffectsC`: 4 floats = 16 bytes

**Total**: 48 bytes per sprite additional

For 50,000 sprites: 48 * 50,000 = 2.4 MB additional GPU memory
- Acceptable for modern GPUs

### Shader Branching

The uber-shader uses conditional application (`If` statements). On modern GPUs:
- Branch divergence within a warp/wavefront is the concern
- Mitigated by: most sprites in a batch likely have similar effects
- Further optimized by: batch splitting by "effect profile" (optional future optimization)

### Shared Resources

Some effects need shared textures:
- **Dissolve**: Needs a noise texture (shared across all batches)
- **Outline**: Needs texture size (passed as uniform)

These are stored as material-level uniforms, not per-instance.

---

## Migration Path

### Phase 1: Update SpriteBatch (M3)
- Add effect instance attributes
- Update `SpriteBatchMaterial` to uber-shader

### Phase 2: Update Sprite2D (M1)
- Add `effects: EffectParams` property
- Add convenience methods
- Update `writeInstanceData()`

### Phase 3: Refactor TSL Nodes (M4/M6)
- Mark which nodes support batched mode
- Document the two usage patterns
- Ensure nodes work as both standalone and embedded in uber-shader

### Phase 4: Layer Lighting
- Implement layer-level light uniforms
- Update `LayerManager` to manage lights

---

## Summary

This unified system provides:

1. **One API**: `sprite.effects.dissolve = 0.5` - works with batching
2. **No confusion**: Every effect either works with batching or is clearly marked for custom materials
3. **Performance**: Maintains batching benefits while adding per-sprite effects
4. **Flexibility**: Advanced users can still create custom shader materials

The key insight is treating effects as **instance data** rather than **material properties**, allowing the batching system to handle per-sprite visual variety without breaking draw call consolidation.
