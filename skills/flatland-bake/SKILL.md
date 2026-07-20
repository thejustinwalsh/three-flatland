---
name: flatland-bake
description: Use when baking derived assets for three-flatland (alpha hitmasks, normal maps, KTX2 encodes, Slug fonts, sprite atlases), deciding whether to bake at all, wiring the baked → runtime fallback, or authoring a new baker
---

# flatland-bake

## The decision rule — read this first

**Nothing requires baking.** Every three-flatland loader that consumes a derived
asset follows the same shape: probe for a baked sibling, and on a miss, generate
the same data at runtime, warn once through `devtimeWarn` (suppressed when
`NODE_ENV=production`), and continue. If you ask for the data, you get the data.

Baking chooses **where the computation lands** — build machine or the user's
browser. It never unlocks capability. An app with zero baked sidecars renders
identically to one with a full bake; it just pays for the generation on every
page load, and ships the generator code to do it.

**Bake when:**

- You are shipping to production. This is the default answer.
- The asset is a font with a known glyph set. This is the largest single win in
  the ecosystem: an ASCII subset lands around 32 KB Brotli'd against ~724 KB for
  the raw font, and baking drops `opentype.js` out of the client bundle entirely.
- You are under GPU memory pressure and want KTX2/Basis-compressed textures,
  which have no runtime-generated equivalent on the client.

**Don't bake when:**

- The content is procedurally varied — you cannot pre-compute what you don't
  know yet.
- It's a throwaway prototype and the sidecar bytes cost more attention than the
  runtime cost.

## `forceRuntime` is not a dev-iteration knob

Every baked-asset loader carries a `forceRuntime` flag on both its instance and
static surfaces (`BakedAssetLoaderOptions` in `packages/bake/src/types.ts` is the
shared interface). It is easy to reach for while iterating. Don't.

The default path already handles iteration: no sidecar means generate + warn,
which is exactly the dev-loop behavior you wanted. Setting `forceRuntime` means
something stronger and more permanent — *"for this asset, the browser is always
where generation happens."* No probe, no sidecar, no warning, on every load
forever. Reach for it when runtime genuinely is the right home: procedurally
varied content, throwaway prototypes, or asset bundles where shipping the
sidecar isn't worth the bytes.

## Self-discovery

`flatland-bake` has no baked-in list of subcommands. It discovers them: at
startup it walks upward from the current working directory collecting every
`node_modules`, plus the nearest enclosing package itself, and picks up any
`package.json` declaring a `flatland.bake` field.

```bash
flatland-bake --list              # enumerate what's reachable from here
flatland-bake <name> [args...]    # run a baker
flatland-bake --help              # dispatcher usage
```

**Gotcha — `--list` is cwd-relative.** It shows only bakers resolvable from the
directory you run it in, so an empty-looking list usually means "wrong cwd," not
"nothing installed." In this monorepo, running it from the repo root prints only
`normal`, because that is the one baker linked at the root through
`three-flatland`'s own dependency chain. Run it from a directory where the
providing package is a real dependency:

```bash
# repo root → only `normal`
node packages/bake/dist/cli.js --list

# a package that actually depends on slug → `slug` and `normal`
cd examples/three/slug-text && node ../../../packages/bake/dist/cli.js --list
```

A listing is never proof that a baker works. The proof is an end-to-end bake
that emits a file.

**Every baker registers.** A baker reachable only through its own bin, with no
`flatland.bake` entry, is a bug to fix, not a variant to document around.

### Authoring a new baker

Implement the `Baker` contract and default-export it from the registered entry:

```ts
import type { Baker } from '@three-flatland/bake'

const baker: Baker = {
  name: 'thing',                             // → flatland-bake thing
  description: 'One line shown by --list',
  usage() { return USAGE },                  // optional
  async run(args: string[]): Promise<number> { /* … */ return 0 },
}

export default baker
```

Register it in the providing package's `package.json`:

```json
{
  "flatland": {
    "bake": [
      { "name": "thing", "description": "One line shown by --list", "entry": "./dist/baker.js" }
    ]
  }
}
```

Notes that bite:

- **Handle `--help` inside `run()`.** The dispatcher declares `usage?()` on the
  contract but never calls it — every shipped baker parses `--help` itself and
  writes its own usage. Follow suit or `flatland-bake <name> --help` does
  nothing useful.
- **The entry is imported, not spawned.** A self-executing script (top-level
  `await`, `process.exit`) would run at import time inside the dispatcher. When
  the CLI you're wrapping is written that way, wrap it — see
  `packages/slug/src/baker.ts`, which spawns `dist/cli.js` as a child process so
  one implementation serves both `slug-bake` and `flatland-bake slug`.
- **Bakers are Node-only.** No `three`, no `@react-three/fiber` in a baker's
  dependency path.
- **Return an exit code.** `0` is success; the dispatcher propagates it.
- The legacy `flatland.bakers` key is still accepted with a deprecation warning.
  Write `flatland.bake` in anything new.

## Subcommand reference

### `alpha` — alpha hitmask sidecar (`@three-flatland/alphamap`)

```
flatland-bake alpha <input.png> [output.png]
```

Extracts the alpha channel of an RGBA PNG into `<input>.alpha.png` — alpha stored
in R and replicated to G/B. Feeds `hitTestMode: 'alpha'` for pixel-perfect
pointer hit testing instead of bounding-box hits. No flags beyond the two
positionals.

```bash
flatland-bake alpha public/sprites/knight.png
```

### `normal` — tangent-space normal map (`@three-flatland/normals`)

```
flatland-bake normal <input.png> [output.png] [options]
```

| Flag | Values | Default | Meaning |
| --- | --- | --- | --- |
| `--descriptor`, `-d` | path to JSON | — | Region-aware control: frames, tiles, cap/face splits, per-region tilt |
| `--direction` | `flat`, `up`, `down`, `left`, `right`, `north`, `south`, `east`, `west`, `up-left`, … | `flat` | Single-region tilt direction |
| `--pitch` | radians | `π/4` | Tilt angle away from flat |
| `--bump` | `alpha`, `none` | `alpha` | Bump source |
| `--strength` | number | `1` | Gradient multiplier applied before normalization |

Writes `<input>.normal.png`. The flat flags build a zero-region descriptor whose
values apply to the whole texture. When `--descriptor` is also given, the flat
flags override the descriptor's top-level defaults and its existing regions are
left untouched.

```bash
flatland-bake normal public/sprites/knight.png --direction up --strength 1.5
flatland-bake normal public/tiles/wall.png -d tiles/wall.normals.json
```

The runtime fallback here is the TSL helper `normalFromSprite`, evaluated
per-fragment in the lit material.

### `encode` — image encoder (`@three-flatland/image`, private)

```
flatland-bake encode <input> [output] [options]
```

| Flag | Values | Meaning |
| --- | --- | --- |
| `--format` | `png`, `webp`, `avif`, `ktx2` | **Required.** Output codec |
| `--quality` | `0..100` | WebP/AVIF quality, or BasisU quality for KTX2 ETC1S |
| `--mode` | `lossy`, `lossless` | WebP/AVIF mode |
| `--basis-mode` | `etc1s`, `uastc` | KTX2 Basis mode |
| `--uastc-level` | `0..4` | UASTC pack level (KTX2) |
| `--mipmaps` | flag | Generate a mipmap pyramid (KTX2) |
| `--batch` | flag | Treat `<input>` as a glob pattern |
| `--out-dir` | path | Batch output directory (required with `--batch`) |
| `--force` | flag | Overwrite existing targets |

```bash
flatland-bake encode art/hero.png --format ktx2 --basis-mode uastc --uastc-level 2 --mipmaps
flatland-bake encode 'art/**/*.png' --batch --out-dir dist/textures --format webp --quality 82
```

**Availability caveat:** `@three-flatland/image` is `private: true` and
unpublished. This subcommand appears inside this workspace; it is not something
a consumer can `npm install`. Consumers reach the same ground through the VS Code
Image Encoder in `tools/vscode`. Do not tell a user to install
`@three-flatland/image`.

### `slug` — Slug font sidecar (`@three-flatland/slug`)

```
flatland-bake slug <font.ttf|.otf|.woff> [options]
```

Emits a single **`.slug.glb`** next to the font: glyph outlines pre-parsed,
banded, and packed into GPU textures, so the runtime never loads `opentype.js`.

| Flag | Values | Default | Meaning |
| --- | --- | --- | --- |
| `--range`, `-r` | named or numeric range, repeatable | all glyphs | Unicode subset to include |
| `--output`, `-o` | path base | derived from the font filename | Writes `<path>.slug.glb` |
| `--stroke-widths` (alias `--stroke-width`) | comma-separated positive numbers, in em | none | Pre-bake stroke sets at these half-widths |
| `--stroke-join` | `miter`, `round`, `bevel` | `miter` | Join style for every baked stroke set |
| `--stroke-cap` | `flat`, `square`, `round`, `triangle` | `flat` | Cap style; only affects open contours (SVG paths) — closed font contours ignore it |
| `--miter-limit` | number ≥ 1 | `4` | Miter clip ratio, SVG semantics |
| `--help`, `-h` | flag | — | Full usage |

Named ranges:

| Name | Coverage |
| --- | --- |
| `ascii` | U+0020–U+007E (printable ASCII, ~95 glyphs) |
| `latin` | U+0000–U+024F (Basic Latin + Latin Extended-A/B, ~600 glyphs) |
| `latin+` | `latin` plus Latin Extended Additional, General Punctuation, Currency Symbols, Letterlike Symbols |

Custom ranges take hex or decimal: `--range 0x20-0x7E`, `--range 32-126`. `-r` is
repeatable and the ranges union. With no `--range`, every glyph is included —
which is how you get a 700 KB+ sidecar, so subset deliberately. Missing glyphs
render as a rectangle fallback at runtime.

```bash
flatland-bake slug public/fonts/Inter-Regular.ttf --range ascii
flatland-bake slug public/fonts/Inter.ttf -r latin -r 0x2000-0x206F
flatland-bake slug public/fonts/Inter.ttf --stroke-widths 0.02,0.05 --stroke-join round
```

Stroke sets are packed into the same textures as the source glyphs and render
through the fill shader at no extra runtime shader cost. Widths not in the baked
list fall back to the async CPU offsetter. If the bake warns that bands exceed
`MAX_CURVES_PER_BAND`, those glyphs *will* render incorrectly — subset further or
raise the shader bound; do not ignore it.

## Direct bins

Two packages also expose a bin. Bins are conveniences layered on top of
registration, never a substitute for it.

| Bin | Package | Relationship to `flatland-bake` |
| --- | --- | --- |
| `slug-bake` | `@three-flatland/slug` | Same implementation, same flags as `flatland-bake slug` — the subcommand spawns this CLI |
| `flatland-atlas` | `@three-flatland/atlas` | **Standalone only today** — no `flatland.bake` registration, so it does not appear in `--list` |

`flatland-atlas` packs a directory of PNGs into an atlas with tight polygon
meshes:

```
flatland-atlas pack <dir> [-o out.json] [--verts N] [--threshold N] [--spacing N] [--no-polygons]
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `-o`, `--out` | `atlas.json` | Output JSON path |
| `--verts` | `8` | Per-sprite polygon vertex budget |
| `--threshold` | `8` | Alpha threshold for trimming |
| `--spacing` | `2` | Padding between packed sprites |
| `--no-polygons` | off | Emit plain quads instead of trimmed polygons |

It writes `<out>.json` plus the sibling page image named in the JSON's
`meta.image` (defaults to the JSON basename with `.png`). The subcommand is
literally `pack` — anything else prints usage and exits 1.

```bash
flatland-atlas pack ./sprites -o ./public/atlas.json --verts 12 --threshold 16
```

## `skia-wasm` is not a baker

`npx skia-wasm` reads like a bake step and isn't one. It **copies** prebuilt WASM
binaries out of `@three-flatland/skia`'s `dist` into your public directory. It
computes nothing and produces no derived asset.

```bash
npx skia-wasm                    # → ./public/skia (default target)
npx skia-wasm public/wasm
npx skia-wasm --gl-only public/wasm
npx skia-wasm --wgpu-only public/wasm
```

The single positional is the target directory; with no flags it copies both the
`gl` and `wgpu` variants. Afterward, point the runtime at the files — either
through your bundler (`define: { 'import.meta.env.SKIA_WASM_URL_GL': '"/skia/skia-gl.wasm"' }`
in Vite) or directly via `Skia.init(renderer, { wasmUrl: '/skia/skia-gl.wasm' })`.

## The baked → runtime fallback contract

Canonical reference: `planning/bake/loader-pattern.md`. The shape, in the order
it executes:

1. **Derive the sibling URL** — same directory, same basename, different
   extension; query strings and fragments preserved; source extension matched
   case-insensitively. Each package exports the derivation as a named function
   (`bakedSiblingURL`, `bakedNormalURL`, `bakedURLs`) so callers can probe
   without constructing a loader.

   | Source | Baked sibling |
   | --- | --- |
   | `/sprites/knight.png` | `/sprites/knight.alpha.png` (alphamap) |
   | `/sprites/knight.png` | `/sprites/knight.normal.png` (normals) |
   | `/sprites/knight.png?v=3` | `/sprites/knight.normal.png?v=3` |
   | `/fonts/Inter-Regular.ttf` | `/fonts/Inter-Regular.slug.glb` |

   Slug emits **one** `.slug.glb`. If you find a reference to a `.slug.json` +
   `.slug.bin` pair, it is stale.

2. **Probe** — `probeBakedSibling(url, { expectedHash })` HEADs the sidecar. A
   404 returns "not found" *silently*; the runtime path handles it. A 404 on the
   **source** asset is a hard error and throws.

3. **Validate** — baked PNGs carry a `flatland` `tEXt` chunk holding
   `{ hash, v: 1 }`, where `hash` is the content hash of the descriptor that
   produced the file. The probe range-fetches the first 4 KB to read it, so a
   stale bake (descriptor changed, file didn't) is detected without downloading
   the image. Hash mismatch, corrupt payload, or a baked `version` older than
   the loader supports all log a warning and fall through rather than
   mis-rendering silently.

4. **Generate on miss + warn once** — the runtime generator runs, and
   `devtimeWarn` emits one line per `(category, url)` pair, skipped entirely when
   `NODE_ENV=production`. Keep the message shape: bracket-prefixed with the
   subcommand name, pointing at `flatland-bake <subcommand>`. Consistency here is
   what makes it greppable.

5. **Cache at the static API**, keyed by URL with a `:runtime` suffix when
   `forceRuntime` is set, so a mixed consumer doesn't cross-contaminate. The
   instance API delegates to the same static implementation and shares the cache.

There is deliberately **no shared loader helper package**. Each consumer inlines
the ~30 lines. A `@three-flatland/loader-kit` was considered and rejected — the
unpack, cache, and version semantics differ per asset, so the shared surface
would be trivial while the coupling would be real. Revisit past five loaders.
