<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/normals

Offline + runtime normal map generation for sprites and tilesets. Contributes a `normal` subcommand to the [`flatland-bake`](https://www.npmjs.com/package/@three-flatland/bake) CLI and ships a browser-safe `NormalMapLoader` used by [three-flatland](https://www.npmjs.com/package/three-flatland).

> **Alpha Release** — this package is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/normals)](https://www.npmjs.com/package/@three-flatland/normals)
[![license](https://img.shields.io/npm/l/@three-flatland/normals)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Install

```bash
npm install @three-flatland/normals@alpha @three-flatland/bake@alpha
```

### Requirements

- **three** >= 0.183.1 (peer, WebGPU/TSL)
- **[@three-flatland/bake](https://www.npmjs.com/package/@three-flatland/bake)** — CLI dispatcher that hosts the `normal` subcommand

## Quick Start

### Bake a normal map from the CLI

```bash
npx flatland-bake normal public/sprites/knight.png
```

Writes `public/sprites/knight.normal.png` next to the source. Ship the baked PNG; the runtime loader picks it up automatically.

### Load a normal map at runtime

With three-flatland, pass `normals: true` to any texture-producing loader — the baked sibling is discovered and attached for you. Outside three-flatland, use `NormalMapLoader` directly:

```typescript
import { NormalMapLoader } from '@three-flatland/normals'

const normalMap = await NormalMapLoader.load('/sprites/knight.png')
if (normalMap) material.normalMap = normalMap
```

`NormalMapLoader` resolves the `.normal.png` sibling via HEAD probe and returns `null` when it's missing so you can fall back to an unlit material or a runtime bake.

## Options

### CLI flags

```
flatland-bake normal <input.png> [output.png] [--strength <n>]
flatland-bake normal <input.png> --descriptor <input.normal.json>
```

| Flag | Description |
|---|---|
| `--strength <n>` | Gradient multiplier before normalization (default `1`) |
| `--descriptor <path>` | Region-aware descriptor JSON — per-frame / per-tile control for atlases and tilemaps |

See the [three-flatland docs](https://thejustinwalsh.com/three-flatland/) for descriptor examples covering sprite sheets, LDtk tilesets, and directional (3/4-view wall) tiles.

### Loader options

```typescript
// Skip the baked probe and always resolve to null — useful during asset
// iteration when you know no sibling exists yet.
const tex = await NormalMapLoader.load(url, { skipBakedProbe: true })
```

## Authoring tiles for LDtk / Tiled

Per-tile custom data drives the tileset's baked normals. The `LDtkLoader` and `TiledLoader` read these fields from each tile's properties panel and synthesize regions for the baker.

### Atlas encoding (what's in the output PNG)

| Channel | Meaning |
|---|---|
| R | `nx` — normal X component, `[-1, 1]` → `[0, 255]` |
| G | `ny` — normal Y component, `[-1, 1]` → `[0, 255]` |
| B | `elevation` — world-space Z in `[0, 1]`, 0 = ground, 1 = top-of-wall |
| A | source alpha (silhouette) |

Runtime reconstructs `nz = sqrt(max(0, 1 − nx² − ny²))` — outward-facing convention, no sign ambiguity.

### Direction vocabulary

```
'flat'                                        — no tilt, normal = (0, 0, 1)
'up'    | 'north'     — tilts toward top of screen
'down'  | 'south'     — toward bottom
'left'  | 'west'      — toward left
'right' | 'east'      — toward right
'up-left'    | 'north-west'    — diagonals at π/4
'up-right'   | 'north-east'
'down-left'  | 'south-west'
'down-right' | 'south-east'
<number>              — raw radians, 0 = +X, CCW positive
```

Aliases are equivalent; use whichever reads better for your team.

### JSON recipes

**Standard floor tile**

```json
{}
```

Or leave untagged. Default elevation 0, flat normal, torch-lit.

**All-cap tile** (wall top viewed dead-on, roof patch, pillar cap)

```json
{"tileElevation": 1}
```

Whole cell is flat at cap height. Torch-dark from ground-level lights, ambient-lit only.

**Top-of-map wall** (cap at top of art, face below)

```json
{"tileDir": "south", "tileCapTop": 4}
```

Cap auto-elevation = 1, face auto-elevation = 0.5.

**Bottom-of-map wall** (cap at bottom of art, face above)

```json
{"tileDir": "north", "tileCapBottom": 4}
```

**Side walls** (cap strip runs along one vertical edge of the art)

```json
{"tileDir": "east",  "tileCapBottom": 4}    // left-of-map wall
{"tileDir": "west",  "tileCapBottom": 4}    // right-of-map wall
```

**Outer corners** (L-shaped cap + diagonal face)

```json
{"tileDir": "south-east", "tileCapTop": 4, "tileCapLeft": 4}     // NW corner
{"tileDir": "south-west", "tileCapTop": 4, "tileCapRight": 4}    // NE corner
{"tileDir": "north-east", "tileCapBottom": 4, "tileCapLeft": 4}  // SW corner
{"tileDir": "north-west", "tileCapBottom": 4, "tileCapRight": 4} // SE corner
```

**Outer-facing corner** (small square cap, face wraps around as L-shape)

```json
{"tileDir": "south-east", "tileCapTopLeft": 4}
```

Four variants: `tileCapTopLeft` / `tileCapTopRight` / `tileCapBottomLeft` / `tileCapBottomRight`. Face auto-decomposes into 2–3 rectangles around the corner cap square.

**Half-wall / low partition**

```json
{"tileDir": "south", "tileCapTop": 4, "tileElevation": 0.3}
```

Face sits lower on the wall so ground-level torches light the face more directly. Cap still at 1.

**Tall pillar / raised architecture**

```json
{"tileDir": "south", "tileCapTop": 4, "tileElevation": 0.9}
```

Face sits near cap height — torches barely light the face, reads as extremely tall.

**Brick/stone surfaces with cracks sunken** (non-alpha bump)

```json
{"tileDir": "south", "tileCapTop": 4, "tileBump": "luminance", "tileStrength": 1.5}
```

Bright brick faces raise, dark mortar sinks. Works on opaque tiles where alpha is 1 everywhere.

### Per-tile custom data field reference

| Field | Type | Default | Meaning |
|---|---|---|---|
| `tileDir` | direction alias or radian | `'flat'` | Which way the face tilts |
| `tileDirection` | direction alias or radian | — | Alias of `tileDir` |
| `tileCap` | px | 0 | Shorthand — same as `tileCapTop` when no per-edge field set |
| `tileCapTop` / `tileCapBottom` / `tileCapLeft` / `tileCapRight` | px | 0 | Edge-strip cap thickness |
| `tileCapTopLeft` / `tileCapTopRight` / `tileCapBottomLeft` / `tileCapBottomRight` | px | 0 | `N×N` corner-square caps |
| `tileElevation` | 0..1 | `0.5` on face / descriptor default elsewhere | World-space Z of the primary surface |
| `tilePitch` | radians | π/4 | Tilt angle from flat |
| `tileBump` | `'alpha'` / `'luminance'` / `'red'` / `'green'` / `'blue'` / `'none'` | `'alpha'` | Per-texel bump source |
| `tileStrength` | float | 1 | Gradient multiplier (negative inverts) |

Legacy `*Px` aliases (`tileCapPx`, `tileCapTopPx`, etc.) are still accepted.

## Using with plain Three.js

This package is renderer-agnostic and works with any Three.js WebGPU project. Bake a normal via the CLI, load it with `NormalMapLoader`, and assign it to a standard material's `normalMap` slot. No three-flatland dependency required.

## Related

- **[three-flatland](https://www.npmjs.com/package/three-flatland)** — the 2D engine. High-level loaders (`SpriteSheetLoader`, `LDtkLoader`) orchestrate this package automatically when you pass `normals: true`.
- **[@three-flatland/bake](https://www.npmjs.com/package/@three-flatland/bake)** — shared bake pipeline infrastructure. Hosts the `flatland-bake` CLI; other packages plug in their own bakers.

## Documentation

Full docs, interactive examples, and API reference at **[thejustinwalsh.com/three-flatland](https://thejustinwalsh.com/three-flatland/)**

## License

[MIT](./LICENSE)

---

<sub>This README was created with AI assistance. AI can make mistakes — please verify claims and test code examples. Submit corrections [here](https://github.com/thejustinwalsh/three-flatland/issues).</sub>
