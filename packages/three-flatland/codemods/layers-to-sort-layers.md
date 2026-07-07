---
title: 'Render-order layers renamed: layer → sortLayer, Layers → SortLayers'
slug: 'layers-to-sort-layers'
package: 'three-flatland'
version: '0.1.0-alpha.8'
type: 'breaking'
audience: 'consumers'
---

# Render-order layers renamed: `layer` → `sortLayer`, `Layers` → `SortLayers`

three-flatland's render-ordering concept is now called a **sort layer** everywhere, freeing the word "layer" for the two things it collides with: three.js camera **layer masks** (`object.layers`) and tilemap **tile layers** (`TileLayer`, `tileFromIntersection().layer`). Only the render-ordering API is renamed — camera masks and tile layers keep their names on purpose.

## Migration

| Before | After |
|--------|-------|
| `import { Layers } from 'three-flatland'` | `import { SortLayers } from 'three-flatland'` |
| `import { Layers } from 'three-flatland/react'` | `import { SortLayers } from 'three-flatland/react'` |
| `Layers.BACKGROUND` (and every other member) | `SortLayers.BACKGROUND` |
| `sprite.layer = Layers.ENTITIES` | `sprite.sortLayer = SortLayers.ENTITIES` |
| `new Sprite2D({ layer: Layers.UI })` | `new Sprite2D({ sortLayer: SortLayers.UI })` |
| `new AnimatedSprite2D({ layer: ... })` | `new AnimatedSprite2D({ sortLayer: ... })` |
| `<sprite2D layer={Layers.UI} />` (R3F JSX) | `<sprite2D sortLayer={SortLayers.UI} />` |
| `LayerManager` | `SortLayerManager` |
| `Layer` (class from `LayerManager`) | `SortLayer` |
| `LayerConfig` (type) | `SortLayerConfig` |
| `LayerName` (type) | `SortLayerName` |
| `LayerValue` (type) | `SortLayerValue` |
| `LayerType` (type alias, `Layer` re-export) | `SortLayerValue` |
| `SpriteLayer` (ECS trait) | `SortLayer` (ECS trait) |

Type-shape change (no rename, fields changed):

```ts
// Before
type SpriteSortFunction = (a: { layer: number; zIndex: number }, b: { layer: number; zIndex: number }) => number
// After
type SpriteSortFunction = (a: { sortLayer: number; zIndex: number }, b: { sortLayer: number; zIndex: number }) => number
```

Behavior change shipped alongside the rename (review, don't blindly migrate): assigning `renderOrder` to a `Sprite2D` now intentionally **demotes the sprite from batching** to standalone rendering with a custom order. If you were setting `renderOrder` on sprites to control ordering, `sortLayer` + `zIndex` is almost always what you want now.

## Codemod prompt (LLM-applicable)

You are migrating a TypeScript/JavaScript codebase that uses `three-flatland`. The render-order "layer" API was renamed to "sort layer". Apply the following transformation. This rename has dangerous false-positive neighbors — three.js camera layer masks and three-flatland tile layers keep the old word — so scope verification is not optional.

### 1. Discover candidate sites

```bash
rg -n '\bLayers\b|\bLayerManager\b|\bLayerConfig\b|\bLayerName\b|\bLayerValue\b|\bLayerType\b|\bSpriteLayer\b|\blayer\s*[:=]|\[.layer.\]' \
  --type ts --type tsx --type js --type jsx
```

**Always skip:**
- `node_modules/`
- Build output (`dist/`, `build/`, `.next/`, `out/`, etc.)
- Type declarations generated from source (`*.d.ts` in build output)
- This codemod artifact itself
- Any vendored copies of `three-flatland` source

### 2. Verify each candidate is in scope

A site is in scope **only** if the identifier traces to `three-flatland` (or `three-flatland/react`):

- `Layers` / `LayerManager` / `Layer` / type names: in scope only when imported from `'three-flatland'` or `'three-flatland/react'`. Follow the import at the top of the file. `Layers` imported from `'three'` is the camera-mask class — **out of scope**.
- `layer:` in an object literal: in scope only when the object is an argument to `new Sprite2D(...)` / `new AnimatedSprite2D(...)`, or is typed as `Sprite2DOptions` / `AnimatedSprite2DOptions`.
- `.layer =` / `.layer` property access: in scope only when the receiver is a `Sprite2D` / `AnimatedSprite2D` (declared type, `new` expression, or unambiguous inference). If you cannot determine the receiver's type, FLAG the site instead of transforming.
- JSX `layer={...}`: in scope only on `<sprite2D>` / `<animatedSprite2D>` elements.
- `SpriteLayer`: in scope only when imported from `three-flatland`'s ECS exports.

**Out of scope (never touch these, even though they contain the word "layer"):**
- `object.layers` / `sprite.layers` / `camera.layers` and `.layers.enable/disable/set/mask` — three.js camera layer masks (note the plural + no assignment of a number).
- `TileLayer`, `TileMap2D` APIs: `getLayerAt`, `layerCount`, `tileLayers`, and the `layer` field of `tileFromIntersection()`'s return value — tile layers keep the name.
- Any other library's `Layers`/`layer` identifiers (e.g. UI frameworks, mapping libraries).

### 3. Apply the transformation

Rename per the Migration table, preserving user expressions verbatim:

- Imports: `Layers → SortLayers`, `LayerManager → SortLayerManager`, `Layer → SortLayer`, `LayerConfig → SortLayerConfig`, `LayerName → SortLayerName`, `LayerValue → SortLayerValue`, `LayerType → SortLayerValue`, `SpriteLayer → SortLayer` — including type-only imports and re-exports.
- Member access follows the import rename automatically (`Layers.UI` → `SortLayers.UI`).
- `layer:` → `sortLayer:` in in-scope option objects; `.layer` → `.sortLayer` on in-scope receivers; JSX `layer=` → `sortLayer=` on in-scope elements.
- `SpriteSortFunction` implementations: rename the destructured/accessed `layer` field to `sortLayer` in the comparator's parameters and body.

**Edge cases:**
- A file importing BOTH three's `Layers` and three-flatland's `Layers` under aliases: rename only the three-flatland binding and its uses.
- Spread options (`new Sprite2D({ ...defaults, layer: x })`) where `defaults` is defined elsewhere: transform the literal `layer:` key AND follow `defaults` to its definition; if it lives outside the searched tree, FLAG it.
- String keys (`sprite['layer']`) and dynamic property access: FLAG for human review.

### 4. Update related artifacts

- Rename references in the project's own comments, docstrings, and markdown that describe the render-order API (e.g. "put it on the UI layer" → "UI sort layer") **only** where they refer to three-flatland render ordering.
- `[FLAG]:` any assignment of `renderOrder` to a `Sprite2D`/`AnimatedSprite2D` — do not transform it; the behavior changed (it now demotes the sprite from batching). Report each site so the human can decide between keeping the demotion and migrating to `sortLayer`/`zIndex`.
- Leave historical references in CHANGELOGs and migration notes alone.

### 5. Do NOT touch

- `node_modules/`
- Build output directories
- This codemod artifact (the file you're reading)
- Vendored copies of `three-flatland` source
- Anything on the out-of-scope list in step 2

## Verification

Run the consumer's normal typecheck and tests:

```bash
npx tsc --noEmit
npm test
```

The migration is successful when both pass and:

```bash
rg -n "from ['\"]three-flatland(/react)?['\"]" -l --type ts --type tsx --type js --type jsx \
   --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/build/**' \
 | xargs rg -n '\bLayers\b|\bLayerManager\b|\bLayerConfig\b|\bLayerName\b|\bLayerValue\b|\bSpriteLayer\b' \
   --glob '!**/CHANGELOG*' --glob '!**/codemods/**'
```

returns zero matches in files that import three-flatland (matches tied to three.js camera masks or tile layers are expected elsewhere and must remain).

## Edge cases

- **three.js `Layers` (camera masks)**: same class name, different import — never rename; disambiguate by import source.
- **Tile layers** (`TileLayer`, `getLayerAt`, `tileFromIntersection().layer`): intentionally unrenamed; leave alone.
- **`renderOrder` on sprites**: behavior changed (demotes from batching) — FLAG, don't transform.
- **Reflection / dynamic dispatch** (`sprite['layer']`, computed keys): out of scope; FLAG for human review.
- **Type guards / generic constraints** over the old type names: FLAG for human review.
- **Mocks (`vi.mock`, `jest.mock`)** of three-flatland modules: FLAG for human review.

## Related

- Changeset: `.changeset/sort-layers-rename.md`
- PR: three-flatland #141 (see CHANGELOG link)
- New API docs: the "Sort Layers" sections of the sprites and batch-rendering guides
