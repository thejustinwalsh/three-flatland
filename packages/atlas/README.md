<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/atlas

First-party atlas baker for [three-flatland](https://www.npmjs.com/package/three-flatland) and [Three.js](https://threejs.org/): packs a directory of PNGs into a sprite atlas and generates **tight polygon meshes** from each frame's alpha silhouette — the data the tight-mesh overdraw-reduction path consumes.

> **Alpha Release** — this package is in active development. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/atlas)](https://www.npmjs.com/package/@three-flatland/atlas)
[![license](https://img.shields.io/npm/l/@three-flatland/atlas)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## CLI

```bash
flatland-atlas pack ./sprites -o ./public/atlas.json
```

Writes `atlas.json` (TexturePacker-hash-compatible, plus a per-frame
`mesh` field) and `atlas.png` next to it. Load the result with
`SpriteSheetLoader` — alpha-blend sprites sharing the atlas
automatically render through the tight-mesh envelope path.

| Option | Default | Meaning |
| --- | --- | --- |
| `-o, --out` | `atlas.json` | Output JSON path (page PNG lands beside it) |
| `--verts N` | `8` | Vertex budget per frame polygon |
| `--threshold N` | `8` | Alpha threshold (0–255) for the silhouette mask |
| `--spacing N` | `2` | Padding pixels between packed frames |
| `--no-polygons` | — | Pack only; skip silhouette meshes |

## Programmatic API

```ts
import { bakeAtlas, decodePng, encodePng } from '@three-flatland/atlas'

const baked = bakeAtlas(sources, { vertexBudget: 12 })
// baked.json  → SpriteSheetLoader-compatible atlas JSON with mesh data
// baked.page  → RGBA page ({ width, height, rgba }); encodePng() to write
```

The polygon pipeline per frame: alpha threshold → Moore-Neighbor
contour trace → Douglas–Peucker simplification to the vertex budget →
ear-clip triangulation → normalization to unit-quad locals + frame-local
UVs. Fully-opaque frames short-circuit to the trivial 4-vertex rect;
fully-transparent frames are skipped.

Build-tool integration (Vite plugin) is sketched as a follow-up: the
programmatic API is the integration point — a plugin wraps `bakeAtlas`
over a glob and emits the pair as assets.

## License

[MIT](./LICENSE)
