# @three-flatland/atlas

First-party atlas baker: packs a directory of PNGs into a sprite atlas
and generates **tight polygon meshes** from each frame's alpha
silhouette — the data the tight-mesh overdraw-reduction path consumes.

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

## Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { flatlandAtlas } from '@three-flatland/atlas/vite'

export default defineConfig({
  plugins: [
    flatlandAtlas({
      entries: [
        { src: 'sprites/particles/*.png', out: 'assets/particles' },
        { src: 'sprites/ui', out: 'assets/ui', bake: { vertexBudget: 12 } },
      ],
    }),
  ],
})
```

Declare source sprite directories and get baked atlases at dev/build
time — no baked artifacts committed to the repo. Each entry bakes to a
stable pair at its `out` path (never content-hashed), e.g. `out:
'assets/particles'` → `assets/particles.json` + `assets/particles.png`,
fetchable at that same URL in both dev and prod (`SpriteSheetLoader.load('/assets/particles.json')`).

| Option | Meaning |
| --- | --- |
| `entries[].src` | Glob pattern(s) or a bare directory. A bare directory (no `*`, `?`, `[]`) expands to every `.png` directly inside it; a pattern with a wildcard in its final path segment (e.g. `sprites/particles/*.png`) matches sibling files. No recursive `**` — this wraps the same flat shelf-packer the CLI uses, not a general-purpose glob engine. Accepts an array to union multiple patterns into one atlas. |
| `entries[].out` | Output basename, project-root-relative — also the basename used for both files (and `meta.image`). Must be unique across entries. |
| `entries[].bake` | Forwarded to `bakeAtlas` (`vertexBudget`, `alphaThreshold`, `spacing`, …). `imageName` is always derived from `out`, overriding any value set here. |

**Dev vs build:**

- **Dev** — entries bake once at server boot (skipped if the cache is
  warm), served from memory by a dev-only middleware at `/<out>.json`
  and `/<out>.png`. Nothing is written to disk. Source directories are
  watched; adding, changing, or removing a `.png` inside one re-bakes
  that entry and triggers a full reload.
- **Build** — entries bake once at `buildStart`, then land in the
  bundle via `this.emitFile` at the exact `fileName: '<out>.json' |
  '<out>.png'` (not content-hashed, so the app's fetch path matches dev).

**Cache:** a SHA-256 digest over each source file's bytes plus the bake
options is compared against the last run; on a match the cached JSON +
PNG bytes are reused and `bakeAtlas` isn't called again. The cache lives
under Vite's own `cacheDir` (`node_modules/.vite/flatland-atlas/` by
default) — safe to delete, it just forces a re-bake.
