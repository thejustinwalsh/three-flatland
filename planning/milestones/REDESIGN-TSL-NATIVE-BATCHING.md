# REDESIGN: TSL-Native Automatic Batching

## What We Learned

### From PixiJS
- Batching is **automatic** - users don't think about it
- Sprites with **same texture + same blend mode** batch together
- Filters/masks **break batches** but that's acceptable - you expect different rendering for those
- The key insight: **shader program changes break batches**, not "having effects"

### From Three.js TSL
- TSL compiles the **same node graph** to both GLSL and WGSL
- `instanceIndex` is available in TSL for per-instance variation
- TSL nodes are composable and can be shared/reused
- Node materials have a natural "fingerprint" based on their node graph structure

### The Real Problem with Our Previous Design

The uber-shader approach was wrong because:
1. **Wasteful**: 48 bytes per sprite for effects even when unused
2. **Not TSL-native**: We were fighting TSL instead of using it
3. **Two APIs**: Users had to think about "batched effects" vs "custom materials"
4. **Inflexible**: Fixed set of effects baked into the uber-shader

---

## The New Design: Material-Based Automatic Batching

### Core Principle

**Sprites batch when they share the same material instance.**

This is how Three.js naturally works! We don't fight it - we embrace it.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TSL-NATIVE AUTOMATIC BATCHING                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   User creates materials with TSL (or uses defaults)                        │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  const material = new Sprite2DMaterial({ texture });                │   │
│   │  material.colorNode = hueShift(texture(map, uv()), { amount: 0.5 });│   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   Sprites reference materials                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  const sprite1 = new Sprite2D({ material });  // Uses material       │   │
│   │  const sprite2 = new Sprite2D({ material });  // Same material       │   │
│   │  const sprite3 = new Sprite2D({ material });  // Same material       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   Renderer2D AUTOMATICALLY batches by material                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  // Internal: group sprites by material.id                          │   │
│   │  // sprite1, sprite2, sprite3 → 1 batch, 1 draw call                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   Per-instance data is MINIMAL (just what varies):                          │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  • Transform matrix (always varies) - 64 bytes                      │   │
│   │  • UV frame in atlas (varies per sprite) - 16 bytes                 │   │
│   │  • Tint + alpha (varies per sprite) - 16 bytes                      │   │
│   │  Total: 96 bytes - NO EFFECT DATA unless material uses it           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How Effects Work

Effects are defined at the **material level** using TSL. If you want some sprites to have a hue shift and others not to, you have two choices:

#### Option A: Different Materials (Simple, Recommended)
```typescript
const normalMaterial = new Sprite2DMaterial({ texture });
const hueShiftedMaterial = new Sprite2DMaterial({ texture });
hueShiftedMaterial.colorNode = hueShift(texture(map, uv()), { amount: uniform(0.5) });

const normalSprite = new Sprite2D({ material: normalMaterial });
const specialSprite = new Sprite2D({ material: hueShiftedMaterial });

// Batches: [normalSprite] [specialSprite] - 2 draw calls
// This is FINE for most games!
```

#### Option B: Per-Instance Effect Values (Advanced)
When you NEED different effect values per sprite with the SAME material:

```typescript
const material = new Sprite2DMaterial({ texture });

// Create a per-instance attribute for hue shift
const hueShiftAttr = material.createInstanceAttribute('hueShift', 'float', 0);

// Use it in TSL
material.colorNode = Fn(() => {
  const hue = instanceAttribute(hueShiftAttr); // Read from instance data
  return hueShift(texture(map, uv()), { amount: hue });
})();

// Sprites share the material, but have different hue values
const sprite1 = new Sprite2D({ material });
const sprite2 = new Sprite2D({ material });

sprite1.setInstanceValue('hueShift', 0.0);
sprite2.setInstanceValue('hueShift', 0.5);

// Batches: [sprite1, sprite2] - 1 draw call!
// Instance data includes hueShift values only for this material
```

### The Key Insight: TSL Uniformity

The material's **TSL node graph structure** determines batching compatibility:
- Same node graph structure + different uniform values = CAN batch
- Different node graph structure = CANNOT batch (different materials)

This is exactly how GPU rendering works! We're not fighting it.

---

## Comparison: Old vs New

| Aspect | Old (Uber-Shader) | New (TSL-Native) |
|--------|-------------------|------------------|
| Effect definition | Fixed set in uber-shader | Composable TSL nodes |
| Instance data | 48 bytes always | Only what material needs |
| Batching | Manual thinking required | Automatic by material |
| Custom effects | Not possible in batch | Full TSL freedom |
| API complexity | Two APIs | One API |
| GPU efficiency | Branch-heavy uber-shader | Lean per-material shaders |

---

## Sprite2DMaterial API

```typescript
import { Sprite2DMaterial, hueShift, dissolve, outline } from '@three-flatland/core';
import { texture, uv, uniform, Fn } from 'three/tsl';

// Simple material (no effects)
const basicMaterial = new Sprite2DMaterial({ texture: myTexture });

// Material with static effect (uniform-based, animatable)
const glowingMaterial = new Sprite2DMaterial({ texture: myTexture });
glowingMaterial.hueShiftAmount = 0.5; // Convenience property
// Or equivalently:
glowingMaterial.colorNode = hueShift(
  texture(glowingMaterial.map, uv()),
  { amount: uniform(0.5) }
);

// Material with per-instance effect values
const dynamicMaterial = new Sprite2DMaterial({ texture: myTexture });
const dissolveAttr = dynamicMaterial.addInstanceFloat('dissolve', 0);
dynamicMaterial.colorNode = dissolve(
  texture(dynamicMaterial.map, uv()),
  { progress: instanceFloat(dissolveAttr) }
);
```

---

## Renderer2D Automatic Batching

```typescript
class Renderer2D {
  render(renderer: WebGPURenderer, camera: Camera) {
    // 1. Collect all sprites
    const sprites = this.collectSprites();

    // 2. Sort by: layer → material.id → zIndex
    sprites.sort((a, b) => {
      if (a.layer !== b.layer) return a.layer - b.layer;
      if (a.material.id !== b.material.id) return a.material.id - b.material.id;
      return a.zIndex - b.zIndex;
    });

    // 3. Batch contiguous sprites with same material
    const batches = this.createBatches(sprites);

    // 4. Render each batch
    for (const batch of batches) {
      this.renderBatch(batch, renderer, camera);
    }
  }

  private createBatches(sprites: Sprite2D[]): SpriteBatch[] {
    const batches: SpriteBatch[] = [];
    let currentBatch: SpriteBatch | null = null;

    for (const sprite of sprites) {
      if (!currentBatch || currentBatch.material !== sprite.material) {
        // New batch for different material
        currentBatch = new SpriteBatch(sprite.material);
        batches.push(currentBatch);
      }
      currentBatch.add(sprite);
    }

    return batches;
  }
}
```

---

## Example: Real Game Usage

```typescript
import { Sprite2D, Sprite2DMaterial, Renderer2D } from '@three-flatland/core';
import { hueShift, dissolve, outline } from '@three-flatland/core/nodes';

// === MATERIALS (defined once) ===

// Default sprite material
const defaultMaterial = new Sprite2DMaterial({ texture: heroTexture });

// Hurt material (red flash)
const hurtMaterial = new Sprite2DMaterial({ texture: heroTexture });
hurtMaterial.tint = new Color(0xff4444);

// Ghost/dying material (with per-instance dissolve)
const ghostMaterial = new Sprite2DMaterial({ texture: heroTexture });
ghostMaterial.addInstanceFloat('dissolve', 0);
ghostMaterial.colorNode = dissolve(
  texture(ghostMaterial.map, uv()),
  { progress: ghostMaterial.getInstanceFloat('dissolve') }
);
ghostMaterial.alpha = 0.7;

// Outlined enemy material
const enemyMaterial = new Sprite2DMaterial({ texture: enemyTexture });
enemyMaterial.colorNode = outline(
  texture(enemyMaterial.map, uv()),
  { width: 2, color: vec3(1, 0, 0) }
);

// === SPRITES (reference materials) ===

const player = new Sprite2D({ material: defaultMaterial });
const enemies = Array.from({ length: 100 }, () =>
  new Sprite2D({ material: enemyMaterial })
);
const ghosts = Array.from({ length: 10 }, () =>
  new Sprite2D({ material: ghostMaterial })
);

// === GAME LOGIC ===

function onPlayerHurt() {
  player.material = hurtMaterial;
  setTimeout(() => player.material = defaultMaterial, 100);
}

function onEnemyDying(enemy: Sprite2D) {
  enemy.material = ghostMaterial;
  enemy.setInstanceValue('dissolve', 0);

  // Animate dissolve
  const tween = (t: number) => {
    enemy.setInstanceValue('dissolve', t);
    if (t < 1) requestAnimationFrame(() => tween(t + 0.02));
  };
  tween(0);
}

// === RENDERING ===
// Automatic batching! Renderer figures it out.

function animate() {
  renderer2D.render(webgpuRenderer, camera);
  // Draw calls:
  // - 1 for player (defaultMaterial)
  // - 1 for all 100 enemies (enemyMaterial) - BATCHED!
  // - 1 for all 10 ghosts (ghostMaterial) - BATCHED with per-instance dissolve!
}
```

---

## Summary

1. **Material = Shader + Instance Attribute Schema**
2. **Batching is automatic** by material identity
3. **TSL nodes define effects** - full composability
4. **Instance attributes are opt-in** per material - no waste
5. **One API** - no "batch mode" vs "custom mode" distinction
6. **Efficient** - lean shaders, minimal instance data

This is the TSL-native way. It's how Three.js works. We embrace it.

---

## Sources

Research based on:
- [PixiJS Batch Rendering System](https://medium.com/swlh/inside-pixijs-batch-rendering-system-fad1b466c420)
- [Three.js TSL Documentation](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [Three.js BatchedMesh](https://threejs.org/docs/api/en/objects/BatchedMesh.html)
- [InstancedUniformsMesh](https://protectwise.github.io/troika/three-instanced-uniforms-mesh/)
- [Three.js Forum: Per-Instance Uniforms](https://discourse.threejs.org/t/instanceduniformsmesh-set-shader-uniform-values-per-instance/22814)
