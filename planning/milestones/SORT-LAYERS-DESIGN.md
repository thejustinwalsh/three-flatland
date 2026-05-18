# SortLayers — design

**Status:** Design canonical  ·  **Authored:** 2026-05-18  ·  **Parent:** `RENDERING-ARCHITECTURE.md`

The opinionated façade over three.js's `renderOrder` for named, typed, batching-aware sort ordering. Companion diagram: `/planning/diagrams/sort-layers.excalidraw`.

---

## Why we have this (we're not reinventing `renderOrder`)

Three already provides:

- **`Object3D.renderOrder`** — single number, sorts within a render list. Front-to-back for opaque, back-to-front for transparent. Default 0.
- **`Object3D.layers`** — bitmask filter for camera visibility (NOT a sort key).

What three doesn't provide:

- **Names** — `renderOrder` is just a number with no semantic meaning
- **Batching boundary enforcement** — sprites with the same material and the same `renderOrder` will batch together by default, even when the user wants them in distinct visual layers
- **Per-layer configuration** — no place to declare "UI sprites should also have these render hooks / share this RT slot"
- **Type-safe registration** — string keys + autocomplete vs. magic constants

Our `SortLayer` concept is a thin façade compiling down to three's primitives:

```
sprite.sortLayer = 'ui'
  ↓ (orchestrator)
  • Looks up sortLayer 'ui' in the SortLayerRegistry
  • Routes sprite to a batch whose run key includes sortLayer='ui'
  • Sets batch.renderOrder = layerConfig.renderOrder  (three's primitive)
  • Sets batch.layers from sprite.layers              (three's primitive, default = 1)
```

No parallel sort system. We drive three's renderOrder. The value we add is naming + grouping + batching-coordination + a typed registry.

---

## Three orthogonal ordering concerns

| Concern | Mechanism | Cardinality | Owner |
|---|---|---|---|
| **Inter-batch order** (which batch draws first) | `sprite.sortLayer = 'ui'` → batch's `renderOrder` | One per sprite | Us → three |
| **Intra-batch order** (instance order within one batch) | `sprite.zIndex` → `batchSortSystem` permutes in-place | One per sprite | Us (three doesn't sort instances within `InstancedMesh`) |
| **Camera visibility** | `sprite.layers.enable(N)` → batch's `Object3D.layers` | **Many** per sprite (bitmask) | Three (we route via run-key) |

Three concerns, three mechanisms, no overlap. Critical: **camera visibility is not bundled into sortLayer config.** A sprite can be in one sortLayer but visible to many cameras (shadow + main + minimap). Bundling them collapses the dimensionality wrong (see "What we explicitly don't do" below).

---

## Naming: why `sortLayer` instead of `layer`

Three's `Object3D.layers` (plural, bitmask) and our original `sprite.layer` (singular, name) were one S apart and semantically unrelated. The proximity was a code-review hazard.

**Unity precedent**: Unity 2D has the same collision — their `Layer` (bitmask) and `SortingLayer` (named sort bucket) are distinguished by a compound name. We adopt the shorter `sortLayer` for the same reason. Other 2D libs that didn't disambiguate (Cocos2D's `Layer`/`cameraMask`) make this confusing for newcomers.

The rename also clarifies the internal trait: `SortLayer` (cross-cutting, used by sprites + particles + future batchers) instead of `SpriteLayer` (which implied sprite-specific).

### Migration cost

Single ripgrep sweep:

| Today | After |
|---|---|
| `sprite.layer = 'ui'` | `sprite.sortLayer = 'ui'` |
| `{ layer: 'ui' }` constructor option | `{ sortLayer: 'ui' }` |
| `SpriteLayer` (Koota trait) | `SortLayer` |
| `LayerRegistry` (typed interface) | `SortLayerRegistry` |
| `Layers` enum | `SortLayers` (or string keys with the typed registry) |
| `LayerManager` class | `SortLayerManager` |

Real but contained — ~10-20 example/test sites + the trait/manager modules. Pairs naturally with the public-API rename so users only see one change.

---

## Batch run key — three-component composition

A batch is uniquely identified by the tuple of values that MUST match for sprites to share it:

```
runKey = hash(material.id, sortLayer, layers.mask)
```

Each component represents a real GPU constraint:

| Component | Why it's part of the key |
|---|---|
| `material.id` | Different material = different shader pipeline / uniforms → can't share an `InstancedMesh` |
| `sortLayer` | Different sortLayer = different draw order → can't share an `InstancedMesh` (one mesh = one position in render list) |
| `layers.mask` | Different camera mask = visible to different cameras → can't share an `InstancedMesh` (one mesh has one `Object3D.layers`) |

A sprite is auto-batched into the batch matching its run key. If no such batch exists and there are ≥2 sprites in the run, a tier-0 batch is created.

**This is more elegant than the earlier eligibility rule.** Earlier I had "customizing `layers` drops you to standalone" — but that loses batching when it isn't necessary. The correct behavior is "different `layers` mask → different batch" — still batched, just routed differently. Only customizing `renderOrder` directly drops to standalone, because that explicitly escapes the sortLayer system entirely.

---

## API surface

### Declaration (eager opt-in via Flatland or any registry-aware facade)

```ts
flatland.declareSortLayer('ui', {
  renderOrder: 100,
  // Future: onRender, postSlot, etc.
})
```

### Typed registry augmentation (TanStack pattern)

```ts
// core ships
export interface SortLayerRegistry {
  default: BuiltInSortLayer    // renderOrder: 0
  ui:      BuiltInSortLayer    // renderOrder: 100 (or whatever)
}

// user code augments
declare module 'three-flatland' {
  interface SortLayerRegistry {
    background: BackgroundSortLayer
    world:      WorldSortLayer
    fx:         FXSortLayer
    overlay:    OverlaySortLayer
  }
}

// All API surfaces using sortLayer keys are now type-checked
sprite.sortLayer = 'fx'              // ✓ autocompletes, type-safe
sprite.sortLayer = 'typo'            // ✗ TS error
```

### Sprite-side property

```ts
class Sprite2D {
  // intercepted setter (drives ECS trait, triggers reassign on change)
  set sortLayer(name: keyof SortLayerRegistry) { ... }
  get sortLayer(): keyof SortLayerRegistry { ... }
}
```

### Default sortLayer

Every sprite that doesn't declare one joins `'default'` (renderOrder 0). Predictable, no orphans, no special-casing.

---

## Setter interception (the contract for three's primitives)

When a Sprite2D is batched, it isn't in three's render list — the `SpriteBatch` `InstancedMesh` is. So mutating three's `renderOrder` or `layers` directly on the Sprite2D *would be silently ignored* by default, because three never reads those properties for a non-render-listed object.

That's bad UX. We intercept:

```ts
class Sprite2D extends Mesh {
  set renderOrder(value: number) {
    if (this._renderOrderIsLayerDerived && value !== this._sortLayerRenderOrder) {
      // User overrode the layer-derived value
      // → drop out of batching to standalone
      this._userRenderOrderOverride = true
      registry.demoteToStandalone(this)
    }
    super.renderOrder = value
  }
  
  // layers is a Layers instance inherited from Object3D, NOT a primitive we own.
  // We don't override the property; we wrap the instance with a Proxy in the
  // Sprite2D constructor to intercept set/enable/disable/toggle mutations and
  // trigger batchReassignSystem when the mask changes.
}
```

### A note on what we are and aren't overriding

Three's `Object3D` provides `layers` (plural, a `Layers` bitmask instance) — used for camera visibility. It does NOT provide a `layer` (singular) property. So our previous `sprite.layer = 'ui'` was an *added* accessor on the Sprite2D subclass, not an override of three. The two coexisted; the proximity of names was the entire reason for this rename.

After the rename:
- **`sprite.sortLayer`** — our added property (Sprite2D, ParticleSystem, future batchers). Sort order + run-key component.
- **`sprite.layers`** — three's inherited `Layers` instance. Unchanged in shape, but we wrap it with a Proxy to detect mutations and re-route the sprite's batch. Same camera-visibility semantics three documents.
- **`sprite.renderOrder`** — three's inherited number primitive. Intercepted setter on Sprite2D — override drops sprite to standalone (escapes sortLayer system).

We never modify what three.js owns. We add (`sortLayer`), wrap (`layers`), and intercept (`renderOrder`). Three's documented behavior remains correct for the inherited surface.

| User action | Result |
|---|---|
| `sprite.sortLayer = 'fx'` | ECS trait updates → `batchReassignSystem` routes to fx batch |
| `sprite.layers.enable(SHADOW_BIT)` | Mask change detected → `batchReassignSystem` routes to a batch with that mask |
| `sprite.renderOrder = 999` | Override detected → sprite demotes to standalone, renders with custom order |
| `sprite.renderOrder = (sortLayer's value)` | No-op (matches layer-derived value) |

The escape hatches work as expected. Three's standard semantics apply when users escape.

---

## How this composes with auto-batch

The auto-batch lifecycle (see `AUTO-BATCH-DESIGN.md`) becomes:

1. Sprite added → register with registry (signal A: `'added'`, or signal B: `onBeforeRender` fallback)
2. Compute sprite's run key `(material.id, sortLayer, layers.mask)`
3. Look up batch matching that run key
   - Exists with capacity → join (allocate slot, set `visible = false`)
   - Doesn't exist AND ≥2 sprites in run → create tier-0 batch with `batch.renderOrder = sortLayerConfig.renderOrder`, `batch.layers = sprite.layers`
   - Doesn't exist AND only 1 sprite in run → stay standalone (Mesh renders itself)
4. On any reactive change (sortLayer, material, layers, renderOrder override), re-evaluate via setters

No per-frame sweep. Pure event-driven.

---

## How this composes with cross-cutting capabilities (CastsShadow, IsAnimated, etc.)

Capability traits are orthogonal to sortLayer. A sprite can be in `world` sortLayer AND cast shadows AND be animated — three orthogonal traits, three different systems read them:

```ts
sprite.sortLayer = 'world'    // → SortLayer trait
sprite.castsShadow = true     // → CastsShadow trait (likely manages layers.mask internally for the shadow camera)
sprite.animation = playerWalk // → IsAnimated trait
```

A unified shadow system queries `CastsShadow` and, for users who opt in via that flag, ensures the appropriate `Object3D.layers` bit is set so the shadow camera sees the sprite's batch. Users who want manual control skip the trait and mutate `sprite.layers` directly. Either way, the batching system routes correctly (different mask → different batch).

This avoids the bundled-config trap where `cameraLayers` lives on sortLayer config and forces users to multiply sortLayers for orthogonal needs (e.g. `world_with_shadow` separate from `world`).

---

## Interop with foreign primitives (Skia, Slug, plain three.js)

SortLayer compiles to `batch.renderOrder = N` — plain three.js. Any other Object3D in the scene that uses `renderOrder` participates in three's sort against our batches. **Foreign packages don't need to know SortLayers exist.**

The user reads the layer's value to place foreign objects relative to it:

```ts
const worldOrder = flatland.sortLayer('world').renderOrder    // 0
const uiOrder    = flatland.sortLayer('ui').renderOrder       // 100

skiaText.renderOrder = uiOrder - 1     // draws just before UI batches
slugLabel.renderOrder = worldOrder + 5 // inside world band, above worldlayer batches
threejsHelper.renderOrder = 1000       // far on top of everything
```

### Common case: everything transparent → renderOrder just works

The realistic 2D scene has everything in the transparent bucket together:

| Content | Bucket | Why |
|---|---|---|
| Default `Sprite2DMaterial` | Transparent | `transparent: true` by default for alpha-blended sprites |
| Slug text (`SlugMaterial`, `SlugText`, `SlugStackText`, `SlugStrokeMaterial`) | Transparent | SDF rendering requires alpha blending — alpha gradient across glyph edges is the whole point of distance-field text |
| Skia overlays | Transparent | RGBA output is intrinsically translucent; standard setup is `transparent: true` + `premultipliedAlpha` |
| Particle systems | Transparent | Soft-edge particles need blending |

All in the same bucket → three sorts by `renderOrder` within it → SortLayer ordering applies to everyone, including Slug text between sprite batches. **Set `foreign.renderOrder = flatland.sortLayer('whatever').renderOrder` and it lands exactly where you put it.**

### Niche case: alphaTest sprites mixed with transparent foreign content

Three splits opaque vs transparent buckets *before* applying `renderOrder`:

| Bucket | Sort within bucket | Drawn order |
|---|---|---|
| Opaque (includes `alphaTest > 0` materials) | `renderOrder` asc, then `material.id`, then z front-to-back | First |
| Transparent | `renderOrder` desc (painter's back-to-front) | Second |

`alphaTest > 0` sprites — our fast-path for pixel-art / hard-edged sprites — are opaque to three's render list (they use `discard` for transparency, no blending). They always draw FIRST.

If a user has an alphaTest foreground sprite at `renderOrder = 0` and wants a transparent Slug text label at `renderOrder = 100` to draw BEHIND it, the buckets fight: alphaTest draws first, transparent text draws on top → text appears OVER the sprite, opposite of intent.

**Resolution:** drop alphaTest on that material (`transparent: true`, accept the slower path) so everyone shares the transparent bucket and `renderOrder` controls composition. The alphaTest fast-path is intended for backgrounds, tilemaps, and content where the bucket-wins-over-renderOrder semantic *is* what you want (alphaTest content is always behind transparent overlays, which is usually correct).

This is three.js behavior, not ours. We just inherit it.

---

## SortLayerGroup — discipline container for mixed children

Mirror of `SpriteGroup`'s shape, different concern:

| Container | Discipline | Use when |
|---|---|---|
| `SpriteGroup` | Material — every child gets the declared material | You want guaranteed batching by material with no forgotten assignments |
| `SortLayerGroup` | SortLayer — every child gets the declared sortLayer | You want guaranteed sort-order grouping with no forgotten assignments. Works for our primitives AND foreign objects |

### Usage

```jsx
<SortLayerGroup name="world">
  <Sprite2D texture={...} />          {/* gets sortLayer = 'world' */}
  <Sprite2D texture={...} />          {/* same */}
  <SkiaText />                         {/* gets renderOrder = world.renderOrder */}
  <SpriteGroup material={knight}>     {/* nested — material discipline for ITS children */}
    <Sprite2D />                       {/* gets material AND inherits sortLayer = 'world' */}
    <Sprite2D />
  </SpriteGroup>
  <SortLayerGroup name="overlay">     {/* nested SortLayerGroup — inner wins */}
    <Sprite2D />                       {/* gets sortLayer = 'overlay' */}
  </SortLayerGroup>
</SortLayerGroup>
```

### Behavior matrix

| Child type | What SortLayerGroup does |
|---|---|
| `Sprite2D`, `ParticleSystem`, future first-party primitives | Sets child's `sortLayer` via our setter → routes through auto-batch run-key |
| Foreign `Object3D` (Skia, Slug, plain `Mesh`) | Sets child's `renderOrder` directly from `sortLayerConfig.renderOrder` |
| Nested `Group` / plain container | Walks into it, applies same rules to descendants |
| Nested `SortLayerGroup` with different name | **Inner wins** — closest ancestor declaration takes precedence |
| Child with explicit `sortLayer` or `renderOrder` already set | Respect existing — never override an explicit user assignment |

### Implementation shape

- Extends `Group` (R3F-compatible, no-arg constructable, settable `name` prop)
- Listens for `'childadded'` to handle dynamic additions; walks subtree once on register
- Pure organizational container — no rendering, no own Object3D rendering work
- Composes with our orchestration: assignment fires the standard sortLayer setter, which feeds into the existing batch-routing path

### Vanilla three.js

```ts
const worldLayer = new SortLayerGroup({ name: 'world' })
scene.add(worldLayer)
worldLayer.add(playerSprite, enemySprite, skiaHud)
// All three get their renderOrder set (or sortLayer routed) automatically.
```

Same path as the JSX version — JSX is just a way to build the same Object3D tree.

---

## What we explicitly don't do

| Don't | Why |
|---|---|
| Bundle camera mask into sortLayer config | Camera visibility is multi-valued (bitmask); sortLayer is single-valued. Multiplying sortLayers for orthogonal camera-mask needs is bad UX. Use `sprite.layers` or capability traits like `CastsShadow` instead |
| Replace three's `renderOrder` with our own sort numeric | We drive three's primitive; we don't parallel it |
| Hide three's `Object3D.layers` | It's an escape hatch users may legitimately need (raycasting, picking, custom passes). Keep it visible |
| Force every sprite into a sortLayer with no escape | `sprite.renderOrder = X` always works — drops sprite to standalone with custom order |
| Auto-generate sortLayers from material | Sort grouping is intent, not derivable from material. User declares |

---

## Acceptance criteria

- [ ] `SpriteLayer` → `SortLayer` trait renamed (cross-primitive)
- [ ] `LayerRegistry` → `SortLayerRegistry` typed interface
- [ ] `Sprite2D.layer` → `Sprite2D.sortLayer` public property + intercepted setter
- [ ] `Sprite2D` constructor option `{ layer }` → `{ sortLayer }`
- [ ] `SortLayerGroup` class lands: walks subtree, applies sortLayer to first-party primitives and renderOrder to foreign Object3D children; nested-group precedence verified; respects existing explicit assignments
- [ ] Public accessor `flatland.sortLayer(name).renderOrder` returns the numeric value so users can place foreign objects (Skia, Slug, custom) relative to a sortLayer
- [ ] Batch run key includes `(material.id, sortLayer, layers.mask)` — verified by a test that creates 3 sprites with same material+sortLayer but different `layers` masks and asserts 3 separate batches
- [ ] `sprite.layers.enable(N)` mutation routes sprite to a differently-masked batch (still batched)
- [ ] `sprite.renderOrder = X` mutation drops sprite to standalone with custom order (verified via test)
- [ ] Default sortLayer `'default'` (renderOrder 0) exists; sprites without explicit sortLayer use it
- [ ] `SortLayerRegistry` augmentation pattern works end-to-end (typed JSX prop, typed setter, type errors on typo)
- [ ] Existing examples migrated from `layer` → `sortLayer`
- [ ] Knightmark continues to hit 60fps after rename

---

## Open knobs

- Built-in sortLayer set (just `default`? or also `background`, `world`, `ui`, `overlay` out of the box?). Probably ship a minimal `default` + `ui` and let users declare the rest.
- Per-sortLayer `onRender` hook timing — fires before/after the batch's draw? Probably both, declared in config. Tracked under future `LAYERS-AND-EXTENSION-API.md`.
- Whether to support per-sortLayer post-processing slot in v1, or defer to the layer-extension API doc.
